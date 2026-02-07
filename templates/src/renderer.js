import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AUDIO } from './audio.js'; 

let canvas, ctx;
const imageCache = {};

// --- HELPERS ---
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
const lerpColorHex = (a, b, amount) => {
    const ah = parseInt(a.replace(/#/g, ''), 16),
          ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
          bh = parseInt(b.replace(/#/g, ''), 16),
          br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
          rr = ar + amount * (br - ar),
          rg = ag + amount * (bg - ag),
          rb = ab + amount * (bb - ab);
    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + (rb | 0)).toString(16).slice(1);
};

// --- UI REFS ---
const uiElements = {
    icon: document.getElementById('ui-time-icon'),
    text: document.getElementById('ui-time-text'),
    weather: document.getElementById('ui-weather'),
    windSpeed: document.getElementById('ui-wind-speed'),
    windArrow: document.getElementById('ui-wind-arrow'),
    plantCount: document.getElementById('ui-plant-count')
};

// --- STATE ---
const groundState = { puddleLevel: 0, snowLevel: 0, puddleMap: [] };
let lightningFlash = 0;
let timeOfDay = 0.5; 
let lightBeams = []; 
let auroraOpacity = 0; 

export function initRenderer() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Init Puddles
    for(let i=0; i<20; i++) {
        groundState.puddleMap.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            w: 100 + Math.random() * 200,
            h: 30 + Math.random() * 50
        });
    }

    // Init God Rays
    for(let i=0; i<5; i++) {
        lightBeams.push({
            x: Math.random() * window.innerWidth,
            width: 200 + Math.random() * 300,
            tilt: (Math.random() * 150) - 75,
            speed: 0.02 + Math.random() * 0.04,
            alphaPhase: Math.random() * Math.PI 
        });
    }

    window.addEventListener('click', () => { AUDIO.init(); }, { once: true });
    generateGrass();
    resize();
    window.addEventListener('resize', () => { resize(); generateGrass(); });
    requestAnimationFrame(loop);
}

function generateGrass() {
    STATE.grassBlades = [];
    const count = CONFIG.GRASS_COUNT || 800;
    for(let i=0; i<count; i++) {
        STATE.grassBlades.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            baseAngle: (Math.random() * 0.2) - 0.1,
            color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)],
            height: 15 + Math.random() * 20,
            z: Math.random()
        });
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function loop() {
    const now = Date.now();
    updatePhysics(now);
    draw(now);
    requestAnimationFrame(loop);
}

function updatePhysics(now) {
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather] || CONFIG.WEATHER_TYPES['sunny'];
    const smoothFactor = 0.05;

    // 1. Physics
    STATE.physics.speed = lerp(STATE.physics.speed, targetConfig.speed || 0.01, smoothFactor);
    STATE.physics.force = lerp(STATE.physics.force, targetConfig.force || 0.05, smoothFactor);

    // Wind Sync
    const windCycle = Math.sin(now * 0.0005); 
    const gust = Math.sin(now * 0.003) + Math.cos(now * 0.01); 
    STATE.physics.direction = (windCycle + (gust * 0.3)); 
    STATE.physics.accumulator += STATE.physics.speed;

    // 2. Environment
    const drySpeed = targetConfig.drySpeed || 0.001;
    groundState.puddleLevel -= drySpeed * 0.1;
    groundState.puddleLevel = Math.max(0, Math.min(1, groundState.puddleLevel));

    const temp = targetConfig.temp || 20;
    if (temp < 0) groundState.snowLevel += 0.0005; 
    else groundState.snowLevel -= 0.002;
    groundState.snowLevel = Math.max(0, Math.min(1, groundState.snowLevel));

    // Lightning
    if (targetConfig.lightning && Math.random() > 0.995) lightningFlash = 1.0;
    if (lightningFlash > 0) lightningFlash -= 0.05;

    // Aurora
    if (targetConfig.aurora) auroraOpacity = lerp(auroraOpacity, 0.6, 0.01);
    else auroraOpacity = lerp(auroraOpacity, 0, 0.01);

    // 3. Time Scale
    const MS_PER_DAY = 24 * 60 * 60 * 1000; 
    const scale = CONFIG.GAME_TIME_SCALE || 10; 
    const gameTimeMs = (now * scale) % MS_PER_DAY;
    
    timeOfDay = gameTimeMs / MS_PER_DAY;
    if(isNaN(timeOfDay)) timeOfDay = 0.5;

    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;

    // 4. Beams
    lightBeams.forEach(b => {
        b.x += b.speed * (STATE.physics.direction > 0 ? 1 : -1);
        if(b.x > canvas.width + 400) b.x = -400;
        if(b.x < -400) b.x = canvas.width + 400;
        b.alphaPhase += 0.01;
    });

    AUDIO.update(STATE.currentWeather || 'sunny', isNight);
    updateUI(isNight, targetConfig);
    updateParticles(targetConfig);
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
    if (uiElements.windSpeed && uiElements.windArrow) {
        const kmh = Math.floor(Math.abs(STATE.physics.direction * STATE.physics.force) * 120);
        uiElements.windSpeed.innerText = kmh;
        const arrowRot = STATE.physics.direction > 0 ? 90 : 270;
        uiElements.windArrow.style.transform = `rotate(${arrowRot}deg)`;
    }
    if (uiElements.plantCount) uiElements.plantCount.innerText = STATE.plants.length;
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
        const windX = (P.force * P.direction); 

        if (p.type === 'rain') { p.y += 20 + p.z * 10; p.x += windX * 10; } 
        else if (p.type === 'snow' || p.type === 'ash') { p.y += 2 + p.z; p.x += (Math.sin(p.y * 0.05) * 2) + (windX * 5); }
        else if (p.type === 'hail') { p.y += 30; p.x += windX * 5; }
        else if (p.type === 'debris') { p.x += windX * 20; p.y += (Math.sin(p.x * 0.1) * 3) + 2; p.r += 0.1; }
        else if (p.type === 'meteor') { p.x -= 15; p.y += 10; }
        else if (p.type === 'pollen') { p.x += windX * 2 + Math.sin(p.y * 0.02); p.y += 0.5 + Math.cos(p.x * 0.02) * 0.5; p.opacity -= 0.002; }

        const buffer = 300; 
        if(p.y > canvas.height + buffer || p.x > canvas.width + buffer || p.x < -buffer || (p.type === 'pollen' && p.opacity <= 0)) {
            STATE.rainDrops.splice(i, 1);
        }
    }
}

function spawnParticle(type) {
    const P = STATE.physics;
    const windDir = P.direction > 0 ? -1 : 1; 
    const windOffset = (P.force * 500) * windDir; 
    let startX = Math.random() * (canvas.width + 400) - 200 + windOffset; 

    if (type === 'meteor') {
        STATE.rainDrops.push({ type: 'meteor', x: Math.random() * canvas.width + 200, y: -200, z: Math.random(), len: 100 + Math.random() * 100 });
    } else if (type === 'pollen') {
        STATE.rainDrops.push({ type: 'pollen', x: Math.random() * canvas.width, y: Math.random() * canvas.height, z: Math.random(), opacity: 0.0, targetOpacity: 0.4 + Math.random() * 0.4 });
    } else {
        STATE.rainDrops.push({ type: type, x: startX, y: -50, z: Math.random(), r: Math.random() * Math.PI });
    }
}

// --- DRAWING ---
function draw(now) {
    drawBackground();
    drawBeams();

    const P = STATE.physics;
    const baseLean = P.force * P.direction * 1.2; 
    const flutter = Math.cos(now * 0.005) * (0.2 * P.force);

    // Grass
    ctx.lineWidth = 2;
    STATE.grassBlades.forEach(blade => {
        const grassWind = baseLean + (flutter * 1.5) + (blade.z * 0.1);
        if (groundState.snowLevel > 0.01) ctx.strokeStyle = lerpColorHex(blade.color, '#ffffff', groundState.snowLevel * 0.9);
        else ctx.strokeStyle = blade.color;
        drawBlade(blade, grassWind);
    });

    STATE.hoveredPlant = null;
    
    // Plants
    STATE.plants.sort((a,b) => a.y - b.y).forEach(p => {
        let age = now - (p.server_time || 0);
        
        const individualSway = Math.sin(now * 0.001 + p.x) * 0.05; 
        const windTurbulence = Math.sin(now * 0.003 + p.y) * (0.15 * P.force);
        let rotation = baseLean + individualSway + windTurbulence;

        ctx.save();
        ctx.translate(p.x, p.y);
        
        // Shadow
        ctx.save();
        ctx.scale(1, 0.3); 
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // Snow Filter
        if(groundState.snowLevel > 0.05) {
            ctx.filter = `brightness(${100 + groundState.snowLevel*50}%) grayscale(${groundState.snowLevel*100}%)`;
        }

        // Apply Rotation
        const maturity = Math.min(1, age / 12000); 
        ctx.rotate(rotation * maturity * 0.8);
        
        drawPlant(p, age);
        
        ctx.restore();

        const hitX = p.x - (rotation * 60); 
        if(Math.abs(STATE.mouse.x - hitX) < 40 && Math.abs(STATE.mouse.y - p.y) < 100) {
            STATE.hoveredPlant = p;
        }
    });

    // Particles
    if(STATE.rainDrops.length > 0) {
        STATE.rainDrops.forEach(d => { 
            ctx.beginPath(); 
            if (d.type === 'rain') {
                ctx.lineWidth = 1 + d.z; ctx.strokeStyle = `rgba(200, 230, 255, ${0.4 + d.z*0.3})`;
                ctx.moveTo(d.x, d.y); const lean = (P.force * P.direction) * 20; ctx.lineTo(d.x - lean, d.y - (15 + d.z * 15)); ctx.stroke();
            } 
            else if (d.type === 'snow') { ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + d.z*0.4})`; ctx.arc(d.x, d.y, 2 + d.z*2, 0, Math.PI*2); ctx.fill(); }
            else if (d.type === 'ash') { ctx.fillStyle = `rgba(60, 60, 60, ${0.7})`; ctx.rect(d.x, d.y, 3, 3); ctx.fill(); }
            else if (d.type === 'hail') { ctx.fillStyle = `rgba(200, 200, 220, 0.9)`; ctx.arc(d.x, d.y, 3, 0, Math.PI*2); ctx.fill(); }
            else if (d.type === 'debris') { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.r); ctx.fillStyle = '#5d4037'; ctx.fillRect(-3, -3, 6, 6); ctx.restore(); }
            else if (d.type === 'meteor') { const g = ctx.createLinearGradient(d.x, d.y, d.x + 100, d.y - 60); g.addColorStop(0, 'rgba(255,255,200,1)'); g.addColorStop(1, 'rgba(255,255,200,0)'); ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 100, d.y - 60); ctx.stroke(); }
            else if (d.type === 'pollen') { if (d.opacity < d.targetOpacity) d.opacity += 0.01; ctx.fillStyle = `rgba(255, 255, 200, ${d.opacity})`; ctx.arc(d.x, d.y, 1 + d.z, 0, Math.PI*2); ctx.fill(); }
        });
    }

    drawOverlay();
    if(STATE.hoveredPlant) drawNameTag(STATE.hoveredPlant);
}

function drawBackground() {
    const C = CONFIG.SKY_COLORS;
    let set1, set2, t;
    if (timeOfDay < 0.25) { set1 = C.night; set2 = C.dawn; t = timeOfDay / 0.25; } 
    else if (timeOfDay < 0.50) { set1 = C.dawn; set2 = C.day; t = (timeOfDay - 0.25) / 0.25; } 
    else if (timeOfDay < 0.75) { set1 = C.day; set2 = C.dusk; t = (timeOfDay - 0.50) / 0.25; } 
    else { set1 = C.dusk; set2 = C.night; t = (timeOfDay - 0.75) / 0.25; }

    const topColor = lerpColorHex(set1[0], set2[0], t);
    const botColor = lerpColorHex(set1[1], set2[1], t);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, botColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather];
    if(targetConfig && targetConfig.tint) {
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; 
        ctx.fillStyle = targetConfig.tint; ctx.fillRect(0,0,canvas.width, canvas.height); ctx.restore();
    }
    if(auroraOpacity > 0.01) drawAurora(auroraOpacity);
}

function drawBeams() {
    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;
    let colorStart, colorEnd;
    if (isNight) { 
        colorStart = "rgba(200, 220, 255, 0.4)";
        colorEnd = "rgba(200, 220, 255, 0)";
    } else {
        const w = STATE.currentWeather;
        if(w === 'cloudy' || w === 'rain') colorStart = "rgba(255, 255, 255, 0.3)";
        else colorStart = "rgba(255, 250, 210, 0.5)"; 
        colorEnd = "rgba(255, 250, 210, 0)";
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen'; 
    lightBeams.forEach(b => {
        const pulse = 0.5 + Math.sin(b.alphaPhase) * 0.5; 
        const grad = ctx.createLinearGradient(b.x, -100, b.x + b.tilt, canvas.height);
        const c1 = colorStart.replace(/[\d.]+\)$/g, `${0.4 * pulse})`); 
        grad.addColorStop(0, c1); grad.addColorStop(1, colorEnd);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(b.x, -100); ctx.lineTo(b.x + b.width, -100); ctx.lineTo(b.x + b.width + b.tilt, canvas.height); ctx.lineTo(b.x + b.tilt, canvas.height); ctx.fill();
    });
    ctx.restore();
}

function drawOverlay() {
    let darkness = 0;
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather];
    if (timeOfDay < 0.25) darkness = 0.6 - (timeOfDay/0.25)*0.6; 
    else if (timeOfDay > 0.75) darkness = (timeOfDay-0.75)/0.25 * 0.6; 
    if(targetConfig && targetConfig.dark) darkness = Math.max(darkness, 0.4);

    if (darkness > 0.01) { ctx.fillStyle = `rgba(5, 10, 30, ${darkness})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (lightningFlash > 0.01) { ctx.fillStyle = `rgba(255, 255, 255, ${lightningFlash})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}

function drawAurora(opacity) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height/2);
    grad.addColorStop(0, `rgba(0, 255, 100, ${opacity * 0.5})`); grad.addColorStop(0.5, `rgba(100, 0, 255, ${opacity * 0.3})`); grad.addColorStop(1, `rgba(0, 255, 100, ${opacity * 0.5})`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, 0);
    for(let x=0; x<=canvas.width; x+=50) ctx.lineTo(x, 100 + Math.sin(x*0.01 + Date.now()*0.001)*50);
    ctx.lineTo(canvas.width, 0); ctx.fill(); ctx.restore();
}

function drawBlade(blade, windRad) {
    const angle = blade.baseAngle + (windRad * 1.0);
    const h = blade.height;
    const tipX = blade.x + Math.sin(angle) * h; const tipY = blade.y - Math.cos(angle) * h;
    const cpX = blade.x + Math.sin(angle) * (h * 0.4); const cpY = blade.y - Math.cos(angle) * (h * 0.4);
    ctx.beginPath(); ctx.moveTo(blade.x, blade.y); ctx.quadraticCurveTo(cpX, cpY, tipX, tipY); ctx.stroke();
}

// --- PLANT RENDERING ---
function drawPlant(p, age) {
    const P_WIDTH = 200;
    const P_HEIGHT = 400;

    // USE CONFIGURATION FOR SLOW GROWTH
    const growthTime = CONFIG.GROWTH_DURATION || 1200000; 
    
    const progress = Math.min(1, age / growthTime);
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    
    // Stages
    const pStem = Math.min(1, Math.max(0, (progress-0)/0.4));     
    const pLeaves = Math.min(1, Math.max(0, (progress-0.2)/0.4)); 
    const pFlower = Math.min(1, Math.max(0, (progress-0.5)/0.5)); 
    
    // 1. STEM: Grow from Bottom Up
    if(pStem > 0) {
        drawGrownLayer(p.stemTex, P_WIDTH, P_HEIGHT, pStem);
    }

    // 2. LEAVES: Grow from Bottom Up
    if(pLeaves > 0) {
        const sLeaf = easeOut(pLeaves);
        drawGrownLayer(p.leafTex, P_WIDTH, P_HEIGHT, sLeaf);
    }

    // 3. FLOWER: Proper Iris Wipe
    if (pFlower > 0) {
        const reveal = easeOut(pFlower);
        drawFlowerReveal(p.flowerTex, P_WIDTH, P_HEIGHT, reveal);
    }
}

// Draws image "growing" from the ground up
function drawGrownLayer(src, w, h, progress) {
    if(!imageCache[src]) { const i=new Image(); i.src=src; imageCache[src]=i; }
    const img = imageCache[src];
    if(img && img.complete) {
        // Calculate the height of the "visible" slice
        const visibleH = h * progress;
        
        ctx.save();
        // Source: Take the BOTTOM 'visibleH' pixels of the image
        // Dest: Draw them at the bottom of the plant anchor
        ctx.drawImage(
            img, 
            0, h - visibleH, w, visibleH,   // Source: Bottom slice
            -w/2, -visibleH, w, visibleH    // Dest: Anchored at (0,0) growing UP
        );
        ctx.restore();
    }
}

// UPDATED: Stationary Iris Wipe with Fixed Expansion
function drawFlowerReveal(src, w, h, progress) {
    if(!imageCache[src]) { const i=new Image(); i.src=src; imageCache[src]=i; }
    const img = imageCache[src];
    if(img && img.complete) {
        ctx.save();
        
        // 1. Define the center of the "Iris" (the flower head)
        // We assume the flower head is located near the top of the sprite (-h * 0.9)
        const cx = 0; 
        const cy = -h * 0.9; 
        
        // 2. Define opening radius (FIXED)
        // Previous radius (w * 0.6) was too small to cover the bottom corners.
        // We use the diagonal distance to the farthest corner (bottom-left or bottom-right).
        // Max height distance = 0.9h (from -0.9h to 0). Max width distance = w/2.
        const maxRadius = Math.sqrt(Math.pow(w/2, 2) + Math.pow(h, 2));
        
        const currentRadius = maxRadius * progress;

        // 3. Create Circular Mask
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
        ctx.clip(); // Restrict future drawing to this circle

        // 4. Draw the image (Stationary)
        // The image is anchored at (0,0) and drawn upwards to -h.
        // It does not move or scale; we just see more of it as the mask opens.
        ctx.drawImage(img, -w/2, -h, w, h);
        
        ctx.restore();
    }
}

function drawNameTag(p) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); 
    const text = `Gardener: ${p.author}`;
    ctx.font = "bold 20px sans-serif";
    const w = ctx.measureText(text).width + 20;
    const bx = p.x - w/2; const by = p.y - 180;
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.beginPath(); ctx.roundRect(bx, by, w, 40, 8); ctx.fill();
    ctx.fillStyle = "white"; ctx.fillText(text, bx+10, by+26);
    ctx.restore();
}