import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AUDIO } from './audio.js'; 

let canvas, ctx;
let width, height;
let lastRegenTick = 0;
// --- VISUAL STATE ---
const visualState = { 
    puddleLevel: 0, 
    snowLevel: 0, 
    puddleMap: [],
    splashes: [],
    beams: [] 
};

// --- CACHE & HELPERS ---
const imageCache = {};
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

const lerpColorHex = (a, b, amount) => {
    let hex = a.replace(/#/g, '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const ah = parseInt(hex, 16);
    const ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff;

    let hexB = b.replace(/#/g, '');
    if (hexB.length === 3) hexB = hexB.split('').map(c => c+c).join('');
    const bh = parseInt(hexB, 16);
    const br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff;

    const rr = ar + amount * (br - ar);
    const rg = ag + amount * (bg - ag);
    const rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + (rb | 0)).toString(16).slice(1);
};

// Add this helper at the top
function getHealthColor(hexColor, hpPercent) {
    if (hpPercent >= 1.0) return hexColor; // Healthy = Normal Color

    // Parse Hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Target "Dead" Color (Brownish Grey: #8b7765)
    const deadR = 139, deadG = 119, deadB = 101;

    // Mix current color with dead color based on HP
    const mix = 1.0 - hpPercent; 
    const newR = Math.floor(r * (1 - mix) + deadR * mix);
    const newG = Math.floor(g * (1 - mix) + deadG * mix);
    const newB = Math.floor(b * (1 - mix) + deadB * mix);

    return `rgb(${newR}, ${newG}, ${newB})`;
}

// --- UI REFS ---
const uiElements = {
    icon: document.getElementById('ui-time-icon'),
    text: document.getElementById('ui-time-text'),
    weather: document.getElementById('ui-weather'), // Re-added!
    windSpeed: document.getElementById('ui-wind-speed'),
    windArrow: document.getElementById('ui-wind-arrow'),
    plantCount: document.getElementById('ui-plant-count'),
    puddle: document.getElementById('ui-puddle'),
    snow: document.getElementById('ui-snow'),
    beams: document.getElementById('ui-beams')
};

let lightningFlash = 0;
let timeOfDay = 0.5; 
let auroraOpacity = 0; 
const LIGHT_SOURCE_ANGLE = -Math.PI / 4; 

// ==========================================
// 1. INITIALIZATION
// ==========================================
export function initRenderer() {
    console.log("[Renderer] Initializing...");
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });

    let lastWidth = window.innerWidth;

    const resize = () => {
        const widthChanged = Math.abs(window.innerWidth - lastWidth) > 50;
        const firstRun = !width;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        width = canvas.width;
        height = canvas.height;
        ctx.imageSmoothingEnabled = false; 
        
        if (widthChanged || firstRun) {
            generateGrass(); 
            lastWidth = window.innerWidth;
            visualState.beams = [];
            for(let i=0; i<8; i++) spawnBeam(true);
        }
    };
    window.addEventListener('resize', resize);
    resize(); 

    for(let i=0; i<15; i++) {
        visualState.puddleMap.push({
            x: Math.random() * width,
            y: Math.random() * height,
            w: 80 + Math.random() * 150,
            h: 50 + Math.random() * 50 
        });
    }

    window.addEventListener('click', () => { AUDIO.init(); }, { once: true });
    window.addEventListener('touchstart', () => { AUDIO.init(); }, { once: true });
    
    requestAnimationFrame(loop);
}

function generateGrass() {
    STATE.grassBlades = [];
    const count = CONFIG.GRASS_COUNT || 800;
    if (!width || !height) return; 

    for(let i=0; i<count; i++) {
        STATE.grassBlades.push({
            x: Math.random() * width,
            y: Math.random() * height,
            baseAngle: (Math.random() * 0.2) - 0.1,
            color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)],
            height: 15 + Math.random() * 20,
            z: Math.random() 
        });
    }
    STATE.grassBlades.sort((a,b) => a.y - b.y);
}

function spawnBeam(randomStart = false) {
    if (!width || !height) return; 
    const x = randomStart ? Math.random() * width : width + 100;
    const y = Math.random() * height;
    
    visualState.beams.push({
        x: x, y: y,
        length: 300 + Math.random() * 300, 
        width: 60 + Math.random() * 100,   
        alphaPhase: Math.random() * Math.PI,
        speed: 0.5 + Math.random() * 0.5,
        opacity: Math.random() * 0.1 + 0.05
    });
}

// ==========================================
// 2. MAIN LOOP
// ==========================================
function loop() {
    
    const now = Date.now();
    updatePhysics(now);
    updatePlants(now); // New update phase
    updateHoverState(); // Run before drawing UI
    updateTooltip();
    draw(now);
    requestAnimationFrame(loop);
}

function updateHoverState() {
    const mouse = STATE.mouse;
    // Find plant under mouse with a 30px hit-area
    STATE.hoveredPlant = STATE.plants.find(p => {
        const dx = p.x - mouse.x;
        const dy = (p.y - 20) - mouse.y; // Offset for plant height
        return Math.sqrt(dx*dx + dy*dy) < 30;
    });
}


function updatePlants(now) {
    const delta = now - lastRegenTick;
    const shouldRegen = delta >= CONFIG.REGEN_TICK_MS;

    STATE.plants.forEach(p => {
        // 1. Initialize stats if they don't exist (for older saves)
        if (!p.stats) {
            p.stats = { 
                hp: CONFIG.BASE_HP, 
                maxHp: CONFIG.BASE_HP, 
                vit: 1 
            };
        }

        // 2. Regeneration Logic
        if (shouldRegen && p.stats.hp < p.stats.maxHp) {
            const regenAmount = CONFIG.STATS.VIT.baseRegen * p.stats.vit;
            p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + regenAmount);
        }
    });

    if (shouldRegen) lastRegenTick = now;
}

function updateTooltip() {
    const tooltip = document.getElementById('plant-tooltip');
    if (STATE.hoveredPlant) {
        const p = STATE.hoveredPlant;
        const stats = p.stats || { hp: 100, maxHp: 100, vit: 1 };
        
        document.getElementById('tooltip-author').innerText = p.author;
        document.getElementById('tooltip-hp').innerText = `${Math.floor(stats.hp)} / ${stats.maxHp}`;
        document.getElementById('tooltip-vit').innerText = stats.vit;
        
        tooltip.style.display = 'block';
        tooltip.style.left = (STATE.mouse.x + 15) + 'px';
        tooltip.style.top = (STATE.mouse.y + 15) + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

function updatePhysics(now) {
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather] || CONFIG.WEATHER_TYPES['sunny'];
    
    STATE.physics.speed = lerp(STATE.physics.speed, targetConfig.speed || 0.01, 0.05);
    STATE.physics.force = lerp(STATE.physics.force, targetConfig.force || 0.05, 0.05);
    
    const windCycle = Math.sin(now * 0.0005); 
    const gust = Math.sin(now * 0.003) + Math.cos(now * 0.01); 
    STATE.physics.direction = (windCycle + (gust * 0.3)); 

    const targetSnow = STATE.world?.snowLevel || 0;
    const targetPuddle = STATE.world?.puddleLevel || 0;
    visualState.snowLevel = lerp(visualState.snowLevel, targetSnow, 0.01);
    visualState.puddleLevel = lerp(visualState.puddleLevel, targetPuddle, 0.01);

    if (targetConfig.lightning && Math.random() > 0.995) lightningFlash = 1.0;
    if (lightningFlash > 0) lightningFlash -= 0.05;
    auroraOpacity = targetConfig.aurora ? lerp(auroraOpacity, 0.6, 0.01) : lerp(auroraOpacity, 0, 0.01);

    const MS_PER_DAY = 24 * 60 * 60 * 1000; 
    const scale = CONFIG.GAME_TIME_SCALE || 10; 
    const gameTimeMs = (STATE.lastServerTime * scale) % MS_PER_DAY;
    timeOfDay = gameTimeMs / MS_PER_DAY; 
    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;

    updateParticles(targetConfig);
    updateUI(isNight, targetConfig);
    AUDIO.update(STATE.currentWeather || 'sunny', isNight);
}

function updateUI(isNight, targetConfig) {
    if (uiElements.text && uiElements.icon) {
        if (!isNaN(timeOfDay)) {
            const hour = Math.floor(timeOfDay * 24);
            const min = Math.floor((timeOfDay * 24 % 1) * 60);
            uiElements.text.innerText = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
            uiElements.icon.innerText = isNight ? '🌙' : (timeOfDay < 0.3 || timeOfDay > 0.7 ? '🌅' : '☀️');
        }
    }
    
    // RESTORED WEATHER INDICATOR LOGIC
    if (uiElements.weather) {
        uiElements.weather.innerText = isNight && targetConfig.label.includes("Sunny") 
            ? "Clear Night" 
            : targetConfig.label;
    }
    
    // Wind Arrow
    if (uiElements.windSpeed && uiElements.windArrow) {
        uiElements.windSpeed.innerText = Math.floor(Math.abs(STATE.physics.direction * STATE.physics.force) * 120) + " km/h";
        let rot = 0;
        if (STATE.physics.direction < 0) rot = 180;
        uiElements.windArrow.style.transform = `rotate(${rot}deg)`;
    }

    if (uiElements.plantCount) uiElements.plantCount.innerText = STATE.plants.length;
    if (uiElements.puddle) uiElements.puddle.innerText = Math.floor(visualState.puddleLevel * 100) + "%";
    if (uiElements.snow) uiElements.snow.innerText = Math.floor(visualState.snowLevel * 100) + "%";

    if (uiElements.beams) {
        if (STATE.currentWeather.includes('rain') || STATE.currentWeather.includes('storm')) {
            uiElements.beams.innerText = "0%";
            uiElements.beams.style.opacity = 0.5;
        } else {
            let strength = Math.floor((1.2 - timeOfDay) * 80); 
            if (strength < 0) strength = 0;
            if (strength > 100) strength = 100;
            uiElements.beams.innerText = strength + "%";
            uiElements.beams.style.opacity = 1.0; 
        }
    }
}

function updateParticles(config) {
    const P = STATE.physics;
    
    if(STATE.rainDrops.length < 2000) {
        if(config.rainRate) for(let i=0; i<config.rainRate; i++) spawnParticle('rain');
        if(config.snowRate) for(let i=0; i<config.snowRate; i++) spawnParticle('snow');
        if(config.hailRate) for(let i=0; i<config.hailRate; i++) spawnParticle('hail');
        if(config.ashRate) for(let i=0; i<config.ashRate; i++) spawnParticle('ash');
        if(config.debris && Math.random() < config.debris) spawnParticle('debris');
        if(config.meteorRate && Math.random() < 0.05) spawnParticle('meteor');
        if (!config.rainRate && !config.snowRate && !config.ashRate && Math.random() < 0.1) spawnParticle('pollen');
    }

    for(let i=STATE.rainDrops.length-1; i>=0; i--) {
        const p = STATE.rainDrops[i];
        const windX = (P.force * P.direction) * 10;
        
        if (p.type === 'rain') { 
            p.y += 15; p.x += windX; 
            if (p.y > p.targetY) { 
                visualState.splashes.push({ x: p.x, y: p.y, age: 0 });
                STATE.rainDrops.splice(i, 1);
            }
        } 
        else if (p.type === 'snow') { 
            p.y += 2; p.x += Math.sin(p.y * 0.05) * 2 + windX * 0.5;
        }
        else if (p.type === 'hail') {
            p.y += 25; p.x += windX * 0.5;
        }
        else if (p.type === 'ash') {
            p.y += 1.0; p.x += windX + Math.sin(p.y * 0.02) * 2; 
        }
        else if (p.type === 'debris') {
            p.x += (windX * 1.5) + 3; 
            p.y += Math.sin(p.x * 0.05) * 2 + 1; 
            p.r += 0.2; 
        }
        else if (p.type === 'meteor') {
            p.x -= 20; p.y += 12; 
            p.alpha -= 0.015; 
            if(p.alpha <= 0) STATE.rainDrops.splice(i, 1);
        }
        else if (p.type === 'pollen') {
            p.y += 0.5; p.x += windX;
            p.alpha -= 0.005;
            if(p.alpha <= 0) STATE.rainDrops.splice(i, 1);
        }

        if(p.y > height + 50 || p.x > width + 200 || p.x < -200) {
            STATE.rainDrops.splice(i, 1);
        }
    }

    for(let i=visualState.splashes.length-1; i>=0; i--) {
        const s = visualState.splashes[i];
        s.age++;
        if(s.age > 10) visualState.splashes.splice(i, 1);
    }
}

function spawnParticle(type) {
    if (!width || !height) return;
    const P = STATE.physics;
    const windDir = P.direction > 0 ? -1 : 1;
    const windOffset = (P.force * 500) * windDir; 
    
    if (type === 'meteor') {
        STATE.rainDrops.push({ type: 'meteor', x: Math.random() * width + 300, y: -200, alpha: 1.0 });
        return;
    }

    let startX = Math.random() * (width + 400) - 200 + windOffset;
    const targetY = Math.random() * height; 
    
    STATE.rainDrops.push({ 
        type: type, 
        x: startX, 
        y: -50, 
        targetY: (type === 'rain') ? targetY : height + 100,
        r: Math.random() * Math.PI, 
        alpha: 1.0
    });
}

// ==========================================
// 3. DRAWING
// ==========================================
function draw(now) {
    drawGround();
    drawPuddles();
    drawFiniteBeams();

    const P = STATE.physics;
    
    // Freeze Factor Logic
    let freezeFactor = 0;
    if (visualState.snowLevel > 0.6) {
        freezeFactor = 1.0; 
    } else {
        freezeFactor = visualState.snowLevel * 1.5;
    }
    freezeFactor = Math.min(1.0, freezeFactor);

    const baseLean = P.force * P.direction * 1.2;
    const flutter = Math.cos(now * 0.005) * (0.2 * P.force);
    const dynamicWind = baseLean + flutter;

    // Grass
    ctx.lineWidth = 2;
    STATE.grassBlades.forEach(blade => {
        const staticPose = Math.sin(blade.x * 0.1 + blade.y * 0.1) * 0.2;
        const finalLean = (dynamicWind + (blade.z * 0.1)) * (1 - freezeFactor) + (staticPose * freezeFactor);
        
        if (visualState.snowLevel > 0.01) {
            ctx.strokeStyle = lerpColorHex(blade.color, '#ffffff', visualState.snowLevel * 0.9);
        } else {
            ctx.strokeStyle = blade.color;
        }
        drawBlade(blade, finalLean);
    });

    // Reset Hover
    STATE.hoveredPlant = null;

    // Plants
    STATE.plants.sort((a,b) => a.y - b.y).forEach(p => {
        const age = now - (p.server_time || 0);
        
        const sway = Math.sin(now * 0.001 + p.x) * 0.05;
        const turb = Math.sin(now * 0.003 + p.y) * (0.15 * P.force);
        const dynamicRot = baseLean + sway + turb;
        const frozenRot = Math.sin(p.x * 12.9898 + p.y * 78.233) * 0.3; 
        const finalRot = lerp(dynamicRot, frozenRot, freezeFactor);
        
        drawPlant(p, finalRot, age);
    });

    drawSnowCover();
    drawParticles();
    drawSplashes();
    drawAtmosphere();

}
function drawPlant(p, rotation, age) {
    // 1. ASSET CHECKS
    const stemImg = getImage(p.stemTex);
    const leafImg = getImage(p.leafTex);
    const flowerImg = getImage(p.flowerTex);

    const isReady = (img) => img && img.complete && img.naturalWidth > 0;
    if (!isReady(stemImg) || !isReady(leafImg) || !isReady(flowerImg)) return;

    // 2. CONSTANTS & SETUP
    const SCALE = 0.5;
    const w = 200 * SCALE;
    const h = 400 * SCALE;
    const growthDuration = CONFIG.GROWTH_DURATION || 5000;
    const progress = Math.min(1.0, age / growthDuration);

    // Stats Setup
    const stats = p.stats || { hp: 100, maxHp: 100, dead: false };
    const hpPercent = Math.max(0, stats.hp / stats.maxHp);
    const isProtected = (stats.protect_until || 0) > (Date.now() / 1000);
    
    // Time Check (Global variable from your renderer)
    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;

    ctx.save();
    
    // 3. MOVE TO PLANT BASE
    ctx.translate(p.x, p.y);

    // --- DEATH ANIMATIONS ---
    // If dead, apply transforms (spin, fly away, etc.)
    if (stats.dead) {
        const timeSinceDeath = (Date.now() / 1000) - (stats.death_time || 0);
        
        if (stats.death_cause === 'tornado' || stats.death_cause === 'storm') {
            // Wind: Fly up/right and spin
            const windForce = timeSinceDeath * 50;
            ctx.translate(windForce, -windForce * 0.5); 
            ctx.rotate(timeSinceDeath * 5); 
            ctx.globalAlpha = Math.max(0, 1 - timeSinceDeath * 0.5);
        } else if (stats.death_cause === 'snow' || stats.death_cause === 'blizzard') {
            // Cold: Freeze white
            ctx.filter = `brightness(${1 + timeSinceDeath}) grayscale(1)`;
            ctx.globalAlpha = Math.max(0, 1 - timeSinceDeath * 0.3);
        } else {
            // Generic: Wither/Shrink
            ctx.scale(1, Math.max(0, 1 - timeSinceDeath * 0.2)); 
            ctx.filter = 'grayscale(1) brightness(0.2)'; 
            ctx.globalAlpha = Math.max(0, 1 - timeSinceDeath * 0.2);
        }
    }

    // --- VISUAL WITHERING ---
    // If alive but damaged, turn brown/sepia
    if (!stats.dead && hpPercent < 1.0) {
        const dmg = 1.0 - hpPercent;
        ctx.filter = `sepia(${dmg}) grayscale(${dmg * 0.5})`; 
    }

    // --- SHADOW LAYER ---
    // Draw BEFORE rotation so it stays flat on the ground.
    // Only draw if it's DAYTIME and the plant is NOT DEAD/FLYING.
    if (!isNight && !stats.dead) {
        ctx.save();
        ctx.globalAlpha = 0.3 * hpPercent; // Shadow fades if plant is dying
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        // Draw shadow ellipse centered at (0,0) local coords
        ctx.ellipse(0, 0, w/3, w/6, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    // --- PLANT LAYERS (Apply Sway) ---
    ctx.save(); // Save before rotating for sway
    ctx.rotate(rotation);

    drawLayer(ctx, stemImg, w, h, Math.min(1.0, progress * 1.5), false);
    
    if (progress > 0.2) {
        drawLayer(ctx, leafImg, w, h, (progress - 0.2) / 0.8, false);
    }

    if (progress > 0.5) {
        const applySnow = visualState.snowLevel > 0.3;
        drawLayer(ctx, flowerImg, w, h, (progress - 0.5) / 0.5, applySnow);
    }
    ctx.restore(); // Restore to remove rotation (so UI doesn't spin)

    // Reset filters so UI/Shields look normal
    ctx.filter = 'none'; 
    ctx.globalAlpha = 1.0;

    // --- SHIELD VISUAL ---
    if (isProtected && !stats.dead) {
        ctx.save();
        ctx.shadowColor = '#00bfff';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(0, 191, 255, 0.6)';
        ctx.lineWidth = 3;
        
        // Timer Calculation
        const timeLeft = stats.protect_until - (Date.now() / 1000);
        const maxDuration = 60.0; 
        const pct = Math.max(0, timeLeft / maxDuration);

        ctx.beginPath();
        // Draw Timer Ring
        ctx.arc(0, -60, 40, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * pct));
        ctx.stroke();
        
        // Inner Pulse
        ctx.fillStyle = `rgba(0, 191, 255, ${0.1 + Math.sin(Date.now() / 200) * 0.05})`;
        ctx.fill();
        ctx.restore();
    }

    // --- HOVER DETECTION ---
    // Note: p.x/p.y are global, mouse is global. 
    // We check this here just for visual debugging if needed, 
    // but main logic is in updateHoverState().
    
    // --- HEALTH BAR UI ---
    // Drawn relative to the plant base (0,0)
    if (!stats.dead && hpPercent < 0.99) {
        const barY = -70; // Height above plant
        
        // Background (Black)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-20, barY, 40, 6); 
        
        // HP Bar (Green -> Red)
        ctx.fillStyle = hpPercent > 0.3 ? '#4caf50' : '#f44336';
        ctx.fillRect(-20, barY, 40 * hpPercent, 6);
        
        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-20, barY, 40, 6);
    }

    ctx.restore(); // Final restore to go back to global coordinates
}

function drawParticles() {
    STATE.rainDrops.forEach(p => {
        if(p.type === 'rain') {
            ctx.strokeStyle = 'rgba(180, 200, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 2, p.y + 8); ctx.stroke();
        } 
        else if (p.type === 'snow') {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
        } 
        else if (p.type === 'hail') {
            ctx.fillStyle = 'rgba(200,220,255,0.9)';
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
        }
        else if (p.type === 'ash') {
            ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
            ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
        }
        else if (p.type === 'debris') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.r);
            ctx.fillStyle = 'rgba(140, 120, 90, 0.6)';
            ctx.beginPath();
            ctx.moveTo(-3, -2); ctx.lineTo(2, -3); ctx.lineTo(3, 2); ctx.lineTo(-2, 3);
            ctx.fill();
            ctx.restore();
        }
        else if (p.type === 'meteor') {
            const tailX = p.x + 60;
            const tailY = p.y - 35;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
            grad.addColorStop(0, `rgba(255, 220, 150, ${p.alpha})`);
            grad.addColorStop(1, `rgba(255, 50, 50, 0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
            ctx.restore();
        }
        else if (p.type === 'pollen') {
            ctx.fillStyle = `rgba(255, 235, 59, ${p.alpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 1, 0, Math.PI*2); ctx.fill();
        }
    });
}

function drawBlade(b, wind) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    const tipX = b.x + Math.sin(b.baseAngle + wind) * b.height;
    const tipY = b.y - b.height; 
    ctx.quadraticCurveTo(b.x, b.y - b.height/2, tipX, tipY);
    ctx.stroke();
}

function drawAtmosphere() {
    const config = CONFIG.WEATHER_TYPES[STATE.currentWeather] || CONFIG.WEATHER_TYPES['sunny'];

    if (config.vis && config.vis < 1.0) {
        const fogAlpha = (1.0 - config.vis) * 0.7; 
        let fr=200, fg=220, fb=230; 
        if (STATE.currentWeather.includes('snow') || STATE.currentWeather.includes('blizzard')) {
            fr=240; fg=245; fb=255; 
        } else if (STATE.currentWeather.includes('dust') || STATE.currentWeather.includes('sand')) {
            fr=194; fg=178; fb=128; 
        } else if (STATE.currentWeather.includes('ash') || STATE.currentWeather.includes('volcanic')) {
            fr=60; fg=60; fb=60; 
        }
        ctx.fillStyle = `rgba(${fr},${fg},${fb}, ${fogAlpha})`;
        ctx.fillRect(0,0, width, height);
    }

    if (config.tint) {
        ctx.fillStyle = config.tint;
        ctx.fillRect(0, 0, width, height);
    }

    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;
    let darkness = isNight ? 0.6 : 0.0;

    if (config.dark && !isNight) darkness = Math.max(darkness, 0.35); 
    if (isNight && config.dark) darkness = 0.8; 

    if (darkness > 0) {
        ctx.fillStyle = `rgba(0, 0, 10, ${darkness})`;
        ctx.fillRect(0, 0, width, height);
    }

    if (lightningFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${lightningFlash * 0.8})`;
        ctx.fillRect(0, 0, width, height);
    }

    if (auroraOpacity > 0.05) {
        const t = Date.now() * 0.0005;
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, `rgba(0, 255, 128, 0)`);
        grad.addColorStop(0.5 + Math.sin(t)*0.2, `rgba(0, 255, 128, ${auroraOpacity * 0.3})`);
        grad.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
}

function drawFiniteBeams() {
    if (!width || !height || width <= 0) return;
    if (STATE.currentWeather.includes('rain') || STATE.currentWeather.includes('storm')) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; 
    
    visualState.beams.forEach(b => {
        // BOOST: Increased base alpha from 0.15 to 0.3
        const alpha = (Math.sin(b.alphaPhase) * 0.1 + 0.3) * (1.2 - timeOfDay);
        
        if(alpha <= 0) return;
        
        const tilt = (b.x - width / 2) * 0.8; 
        const xStart = b.x;
        const xEnd = b.x + tilt;
        
        const grad = ctx.createLinearGradient(xStart, 0, xEnd, height);
        
        // BOOST: Multiplied b.opacity by 3.0 to make them brighter
        grad.addColorStop(0, `rgba(255, 255, 230, ${b.opacity * 3.0})`); 
        grad.addColorStop(1, `rgba(255, 255, 230, 0)`);       
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(xStart - b.width/2, 0);
        ctx.lineTo(xStart + b.width/2, 0);
        ctx.lineTo(xEnd + b.width*2, height);
        ctx.lineTo(xEnd - b.width*2, height);
        ctx.fill();
        
        b.x += b.speed;
        b.opacity += (Math.random() - 0.5) * 0.01;
        
        if (b.x > width + 200 || b.x < -200 || b.opacity <= 0) {
            b.x = Math.random() * width;
            b.opacity = Math.random() * 0.1 + 0.05;
        }
    });
    ctx.restore();
}

function drawLayer(ctx, img, w, h, progress, applySnow) {
    if (progress <= 0.01) return;
    ctx.save();
    ctx.beginPath();
    const visibleH = h * progress;
    ctx.rect(-w/2, -visibleH, w, visibleH);
    ctx.clip();
    ctx.drawImage(img, -w/2, -h, w, h);
    if (applySnow) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(255, 255, 255, ${visualState.snowLevel * 0.9})`;
        ctx.fillRect(-w/2, -h, w, h);
    }
    ctx.restore();
}

function drawGround() {
    const baseColor = '#1e361a';
    const snowColor = '#ffffff'; 
    ctx.fillStyle = visualState.snowLevel > 0 ? lerpColorHex(baseColor, snowColor, visualState.snowLevel) : baseColor;
    ctx.fillRect(0, 0, width, height);
}

function drawPuddles() {
    if(visualState.puddleLevel < 0.05) return;
    ctx.save();
    visualState.puddleMap.forEach(p => {
        let r=100, g=150, b=200; 
        if (visualState.snowLevel > 0.2) {
            const amt = Math.min(1.0, (visualState.snowLevel - 0.2) * 1.5);
            r = lerp(100, 230, amt);
            g = lerp(150, 240, amt);
            b = lerp(200, 250, amt);
        }
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${visualState.puddleLevel * 0.6})`;
        ctx.beginPath();
        const curW = p.w * visualState.puddleLevel;
        const curH = p.h * visualState.puddleLevel;
        ctx.ellipse(p.x, p.y, curW, curH, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawSnowCover() {
    if(visualState.snowLevel < 0.5) return;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255, ${ (visualState.snowLevel - 0.5) * 0.3 })`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

function drawSplashes() {
    ctx.strokeStyle = 'rgba(200,200,255,0.7)';
    ctx.lineWidth = 1;
    visualState.splashes.forEach(s => {
        const radius = s.age * 1.5;
        ctx.beginPath();
        ctx.globalAlpha = 1 - (s.age / 10);
        ctx.arc(s.x, s.y, radius, 0, Math.PI*2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1;
}

function getImage(src) {
    if(imageCache[src]) return imageCache[src];
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    imageCache[src] = img;
    return img;
}