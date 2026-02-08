import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AUDIO } from './audio.js'; 

let canvas, ctx;
let width, height;

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

// --- UI REFS ---
const uiElements = {
    icon: document.getElementById('ui-time-icon'),
    text: document.getElementById('ui-time-text'),
    weather: document.getElementById('ui-weather'),
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

    // MOBILE FIX: Track last width to prevent redraw on vertical scroll
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

    // Init Puddles
    for(let i=0; i<15; i++) {
        visualState.puddleMap.push({
            x: Math.random() * width,
            y: Math.random() * height,
            w: 80 + Math.random() * 150,
            h: 50 + Math.random() * 50 
        });
    }

    // Audio Init
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
    draw(now);
    requestAnimationFrame(loop);
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
    const gameTimeMs = (now * scale) % MS_PER_DAY;
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
    if (uiElements.weather) uiElements.weather.innerText = isNight && targetConfig.label.includes("Sunny") ? "Clear Night" : targetConfig.label;
    
    // --- WIND ARROW ROTATION FIX ---
    if (uiElements.windSpeed && uiElements.windArrow) {
        uiElements.windSpeed.innerText = Math.floor(Math.abs(STATE.physics.direction * STATE.physics.force) * 120);
        // Map direction (-1 left to 1 right) to rotation (180deg to 0deg)
        // Default arrow '➡' points Right (0deg).
        // If Wind is -1 (Left), rotate 180deg.
        let rot = 0;
        if (STATE.physics.direction < 0) rot = 180;
        
        uiElements.windArrow.style.transform = `rotate(${rot}deg)`;
    }

    if (uiElements.plantCount) uiElements.plantCount.innerText = STATE.plants.length;

    // --- PUDDLE & SNOW STATS ---
    if (uiElements.puddle) uiElements.puddle.innerText = Math.floor(visualState.puddleLevel * 100) + "%";
    if (uiElements.snow) uiElements.snow.innerText = Math.floor(visualState.snowLevel * 100) + "%";

    // --- BEAM STRENGTH ---
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
    
    // 1. Spawning
    if(STATE.rainDrops.length < 2000) {
        if(config.rainRate) for(let i=0; i<config.rainRate; i++) spawnParticle('rain');
        if(config.snowRate) for(let i=0; i<config.snowRate; i++) spawnParticle('snow');
        if(config.hailRate) for(let i=0; i<config.hailRate; i++) spawnParticle('hail');
        if(config.ashRate) for(let i=0; i<config.ashRate; i++) spawnParticle('ash');
        if(config.debris && Math.random() < config.debris) spawnParticle('debris');
        if(config.meteorRate && Math.random() < 0.05) spawnParticle('meteor');
        if (!config.rainRate && !config.snowRate && !config.ashRate && Math.random() < 0.1) spawnParticle('pollen');
    }

    // 2. Physics
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

    // 3. Splashes
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
    
    // --- FREEZE LOGIC ---
    // Snap to 100% frozen if snow is deep (> 0.6)
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

    // Plants
    STATE.hoveredPlant = null;
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
    const stemImg = getImage(p.stemTex);
    const leafImg = getImage(p.leafTex);
    const flowerImg = getImage(p.flowerTex);

    const isReady = (img) => img && img.complete && img.naturalWidth > 0;
    if (!isReady(stemImg) || !isReady(leafImg) || !isReady(flowerImg)) return;

    const SCALE = 0.5;
    const w = 200 * SCALE;
    const h = 400 * SCALE;
    const growthDuration = CONFIG.GROWTH_DURATION || 5000;
    const progress = Math.min(1.0, age / growthDuration);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rotation);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w/3, w/6, 0, 0, Math.PI*2);
    ctx.fill();

    drawLayer(ctx, stemImg, w, h, Math.min(1.0, progress * 1.5), false);
    
    if (progress > 0.2) {
        drawLayer(ctx, leafImg, w, h, (progress - 0.2) / 0.8, false);
    }

    if (progress > 0.5) {
        const applySnow = visualState.snowLevel > 0.3;
        drawLayer(ctx, flowerImg, w, h, (progress - 0.5) / 0.5, applySnow);
    }

    ctx.rotate(-rotation);
    
    // --- HOVER LOGIC ---
    // If plant is roughly 60px wide and 160px tall
    if (Math.abs(STATE.mouse.x - p.x) < 40 && STATE.mouse.y < p.y && STATE.mouse.y > p.y - 150) {
        STATE.hoveredPlant = p;
        drawNameTag(p);
    }
    ctx.restore();
}

function drawNameTag(p) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(p.x - 50, p.y - 130, 100, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.author || 'Anon', p.x, p.y - 113);
    ctx.restore();
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

function drawBlade(b, wind) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    const tipX = b.x + Math.sin(b.baseAngle + wind) * b.height;
    const tipY = b.y - b.height; 
    ctx.quadraticCurveTo(b.x, b.y - b.height/2, tipX, tipY);
    ctx.stroke();
}

// ... (Rest of helpers)
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

function drawFiniteBeams() {
    if (!width || !height || width <= 0) return;
    if (STATE.currentWeather.includes('rain') || STATE.currentWeather.includes('storm')) return;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; 
    visualState.beams.forEach(b => {
        const alpha = (Math.sin(b.alphaPhase) * 0.1 + 0.15) * (1.2 - timeOfDay);
        if(alpha <= 0) return;
        const tilt = (b.x - width / 2) * 0.8; 
        const xStart = b.x;
        const xEnd = b.x + tilt;
        if (!Number.isFinite(xStart) || !Number.isFinite(xEnd) || !Number.isFinite(height)) return;
        const grad = ctx.createLinearGradient(xStart, 0, xEnd, height);
        grad.addColorStop(0, `rgba(255, 255, 230, ${b.opacity})`); 
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

function getImage(src) {
    if(imageCache[src]) return imageCache[src];
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    imageCache[src] = img;
    return img;
}