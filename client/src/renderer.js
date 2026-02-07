import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AUDIO } from './audio.js'; 

let canvas, ctx;
const imageCache = {};

// Helper: Smooth Linear Interpolation
const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

// Helper: Color Lerp (Hex -> Hex)
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

// --- UI REFERENCES ---
const uiTimeIcon = document.getElementById('ui-time-icon');
const uiTimeText = document.getElementById('ui-time-text');
const uiWeather = document.getElementById('ui-weather');
const uiWindSpeed = document.getElementById('ui-wind-speed');
const uiWindArrow = document.getElementById('ui-wind-arrow');
const uiPlantCount = document.getElementById('ui-plant-count');

// Ground State
const groundState = {
    puddleLevel: 0, 
    snowLevel: 0,
    puddleMap: []
};

// Atmospheric State
let lightningFlash = 0;
let cycleTimer = 0; 
let timeOfDay = 0.5; // 0.0 to 1.0
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

    // Init Light Beams (God Rays)
    // We create them WIDE and TALL so they cover the screen
    for(let i=0; i<6; i++) {
        lightBeams.push({
            x: Math.random() * window.innerWidth,
            width: 150 + Math.random() * 200,
            tilt: (Math.random() * 100) - 50, // Slight Angle
            speed: 0.05 + Math.random() * 0.05, // Slow movement
            alphaPhase: Math.random() * Math.PI // Random pulse start
        });
    }

    // Audio Init
    window.addEventListener('click', () => { AUDIO.init(); }, { once: true });

    generateGrass();
    resize();
    window.addEventListener('resize', () => { resize(); generateGrass(); });
    requestAnimationFrame(loop);
}

function generateGrass() {
    STATE.grassBlades = [];
    const count = CONFIG.GRASS_COUNT;
    for(let i=0; i<count; i++) {
        STATE.grassBlades.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            baseAngle: (Math.random() * 0.2) - 0.1,
            color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)],
            height: 15 + Math.random() * 15,
            z: Math.random()
        });
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function loop(time) {
    updatePhysics(time);
    draw(time);
    requestAnimationFrame(loop);
}

function updatePhysics(time) {
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather] || CONFIG.WEATHER_TYPES['sunny'];
    const smoothFactor = 0.05;

    // 1. Physics Values
    STATE.physics.speed = lerp(STATE.physics.speed, targetConfig.speed || 0.01, smoothFactor);
    STATE.physics.force = lerp(STATE.physics.force, targetConfig.force || 0.05, smoothFactor);

    // 2. Wind Logic (Natural Gusts)
    const windCycle = Math.sin(time * 0.0005); 
    const gust = Math.sin(time * 0.003) + Math.cos(time * 0.01); 
    STATE.physics.direction = (windCycle + (gust * 0.3)); 
    STATE.physics.accumulator += STATE.physics.speed;

    // 3. Ground Accumulation
    const drySpeed = targetConfig.drySpeed || 0.001;
    groundState.puddleLevel -= drySpeed * 0.1;
    groundState.puddleLevel = Math.max(0, Math.min(1, groundState.puddleLevel));

    const temp = targetConfig.temp || 20;
    if (temp < 0) groundState.snowLevel += 0.0005; 
    else groundState.snowLevel -= 0.002;
    groundState.snowLevel = Math.max(0, Math.min(1, groundState.snowLevel));

    // 4. Lightning
    if (targetConfig.lightning && Math.random() > 0.99) lightningFlash = 1.0;
    if (lightningFlash > 0) lightningFlash -= 0.05;

    // 5. Aurora Logic
    if (targetConfig.aurora) auroraOpacity = lerp(auroraOpacity, 0.6, 0.01);
    else auroraOpacity = lerp(auroraOpacity, 0, 0.01);

    // 6. Day/Night Cycle (Even Slower)
    cycleTimer += 0.05; // Was 0.1, now 0.05 for extra smoothness
    timeOfDay = (cycleTimer % CONFIG.CYCLE_DURATION) / CONFIG.CYCLE_DURATION;
    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;

    // 7. Update Beams (God Rays)
    lightBeams.forEach(b => {
        // Move slowly with wind
        b.x += b.speed * (STATE.physics.direction > 0 ? 1 : -1);
        
        // Wrap
        if(b.x > canvas.width + 200) b.x = -200;
        if(b.x < -200) b.x = canvas.width + 200;

        // Pulse
        b.alphaPhase += 0.01;
    });

    // 8. Audio
    AUDIO.update(STATE.currentWeather || 'sunny', isNight);

    updateUI(isNight, targetConfig);
    updateParticles(targetConfig);
}

function updateUI(isNight, targetConfig) {
    if (uiTimeText && uiTimeIcon) {
        const hour = Math.floor(timeOfDay * 24);
        const min = Math.floor((timeOfDay * 24 % 1) * 60);
        uiTimeText.innerText = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
        
        let icon = '☀️';
        if (isNight) icon = '🌙';
        else if (timeOfDay < 0.3 || timeOfDay > 0.7) icon = '🌅';
        uiTimeIcon.innerText = icon;
    }

    if (uiWeather) {
        let label = targetConfig.label;
        if (isNight && label.includes("Sunny")) label = "Clear Night";
        uiWeather.innerText = label;
    }

    if (uiWindSpeed && uiWindArrow) {
        const kmh = Math.floor(Math.abs(STATE.physics.direction * STATE.physics.force) * 120);
        uiWindSpeed.innerText = kmh;
        const arrowRot = STATE.physics.direction > 0 ? 90 : 270;
        uiWindArrow.style.transform = `rotate(${arrowRot}deg)`;
    }

    if (uiPlantCount) {
        uiPlantCount.innerText = STATE.plants.length;
    }
}

function updateParticles(config) {
    const P = STATE.physics;
    
    // --- SPAWNING LOGIC ---
    if(STATE.rainDrops.length < 2000) {
        if(config.rainRate > 0) for(let i=0; i<config.rainRate; i++) spawnParticle('rain');
        if(config.snowRate > 0) for(let i=0; i<config.snowRate; i++) spawnParticle('snow');
        if(config.hailRate > 0) for(let i=0; i<config.hailRate; i++) spawnParticle('hail');
        if(config.ashRate > 0)  for(let i=0; i<config.ashRate; i++) spawnParticle('ash');
        
        if(config.debris > 0 && Math.random() < config.debris) spawnParticle('debris');
        if(config.meteorRate > 0 && Math.random() < 0.05) spawnParticle('meteor');

        // Pollen
        if (!config.rainRate && !config.snowRate && !config.ashRate) {
            if (Math.random() < 0.1) spawnParticle('pollen');
        }
    }

    // --- MOVEMENT LOGIC ---
    for(let i=STATE.rainDrops.length-1; i>=0; i--) {
        const p = STATE.rainDrops[i];
        const windX = (P.force * P.direction); 

        if (p.type === 'rain') {
            p.y += 20 + p.z * 10;
            p.x += windX * 10; 
        } 
        else if (p.type === 'snow' || p.type === 'ash') {
            p.y += 2 + p.z;
            p.x += (Math.sin(p.y * 0.05) * 2) + (windX * 5); 
        }
        else if (p.type === 'hail') {
            p.y += 30; 
            p.x += windX * 5; 
        }
        else if (p.type === 'debris') {
            p.x += windX * 20; 
            p.y += (Math.sin(p.x * 0.1) * 3) + 2; 
            p.r += 0.1; 
        }
        else if (p.type === 'meteor') {
            p.x -= 15; 
            p.y += 10; 
        }
        else if (p.type === 'pollen') {
            p.x += windX * 2 + Math.sin(p.y * 0.02);
            p.y += 0.5 + Math.cos(p.x * 0.02) * 0.5;
            p.opacity -= 0.002; 
        }

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

    let startX = Math.random() * (canvas.width + 400) - 200; 
    startX += windOffset; 

    if (type === 'meteor') {
        STATE.rainDrops.push({
            type: 'meteor',
            x: Math.random() * canvas.width + 200, 
            y: -200,
            z: Math.random(),
            len: 100 + Math.random() * 100
        });
    } 
    else if (type === 'pollen') {
        STATE.rainDrops.push({
            type: 'pollen',
            x: Math.random() * canvas.width, 
            y: Math.random() * canvas.height, 
            z: Math.random(),
            opacity: 0.0, 
            targetOpacity: 0.4 + Math.random() * 0.4
        });
    }
    else {
        STATE.rainDrops.push({
            type: type,
            x: startX, 
            y: -50, 
            z: Math.random(),
            r: Math.random() * Math.PI 
        });
    }
}

function draw(time) {
    drawBackground();
    
    // Draw Beams BEHIND the plants so plants block them slightly?
    // Actually, God Rays usually overlay everything.
    // We draw them here (after BG, before plants) for "Atmospheric Distance"
    drawBeams();

    const P = STATE.physics;
    const baseLean = P.force * P.direction * 1.2; 
    const flutter = Math.cos(time * 0.005) * (0.2 * P.force);

    // GRASS
    ctx.lineWidth = 2;
    STATE.grassBlades.forEach(blade => {
        const grassWind = baseLean + (flutter * 1.5) + (blade.z * 0.1);
        if (groundState.snowLevel > 0.01) {
            ctx.strokeStyle = lerpColorHex(blade.color, '#ffffff', groundState.snowLevel * 0.9);
        } else {
            ctx.strokeStyle = blade.color;
        }
        drawBlade(blade, grassWind);
    });

    // PLANTS
    const now = Date.now();
    STATE.hoveredPlant = null;
    
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
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        if(groundState.snowLevel > 0.05) {
            ctx.filter = `brightness(${100 + groundState.snowLevel*50}%) grayscale(${groundState.snowLevel*100}%)`;
        }

        const maturity = Math.min(1, age / 12000); 
        ctx.rotate(rotation * maturity);
        drawPlant(p, age);
        ctx.restore();

        const hitX = p.x - (rotation * 60); 
        if(Math.abs(STATE.mouse.x - hitX) < 40 && Math.abs(STATE.mouse.y - p.y) < 80) {
            STATE.hoveredPlant = p;
        }
    });

    // PARTICLES (DRAW LOOP)
    if(STATE.rainDrops.length > 0) {
        STATE.rainDrops.forEach(d => { 
            ctx.beginPath(); 
            if (d.type === 'rain') {
                ctx.lineWidth = 1 + d.z;
                ctx.strokeStyle = `rgba(200, 230, 255, ${0.4 + d.z*0.3})`;
                ctx.moveTo(d.x, d.y);
                const lean = (P.force * P.direction) * 20;
                ctx.lineTo(d.x - lean, d.y - (15 + d.z * 15)); 
                ctx.stroke();
            } 
            else if (d.type === 'snow') {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + d.z*0.4})`;
                ctx.arc(d.x, d.y, 2 + d.z*2, 0, Math.PI*2); 
                ctx.fill();
            }
            else if (d.type === 'ash') {
                ctx.fillStyle = `rgba(60, 60, 60, ${0.7})`;
                ctx.rect(d.x, d.y, 3, 3); 
                ctx.fill();
            }
            else if (d.type === 'hail') {
                ctx.fillStyle = `rgba(200, 200, 220, 0.9)`;
                ctx.arc(d.x, d.y, 3, 0, Math.PI*2);
                ctx.fill();
            }
            else if (d.type === 'debris') {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(d.r);
                ctx.fillStyle = '#5d4037';
                ctx.fillRect(-3, -3, 6, 6);
                ctx.restore();
            }
            else if (d.type === 'meteor') {
                const grad = ctx.createLinearGradient(d.x, d.y, d.x + 100, d.y - 60);
                grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
                grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 3;
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + 100, d.y - 60);
                ctx.stroke();
            }
            else if (d.type === 'pollen') {
                if (d.opacity < d.targetOpacity) d.opacity += 0.01;
                ctx.fillStyle = `rgba(255, 255, 200, ${d.opacity})`;
                ctx.arc(d.x, d.y, 1 + d.z, 0, Math.PI*2);
                ctx.fill();
            }
        });
    }

    drawOverlay();
    if(STATE.hoveredPlant) drawNameTag(STATE.hoveredPlant);
}

// --- SMOOTH BACKGROUND TRANSITION (FIXED) ---
function drawBackground() {
    const C = CONFIG.SKY_COLORS;
    let set1, set2, t;

    // We define 4 distinct phases with NO GAPS.
    // 0.0 - 0.25: Night -> Dawn
    // 0.25 - 0.50: Dawn -> Day
    // 0.50 - 0.75: Day -> Dusk
    // 0.75 - 1.00: Dusk -> Night

    if (timeOfDay < 0.25) {
        set1 = C.night; set2 = C.dawn;
        t = timeOfDay / 0.25; 
    } 
    else if (timeOfDay < 0.50) {
        set1 = C.dawn; set2 = C.day;
        t = (timeOfDay - 0.25) / 0.25;
    } 
    else if (timeOfDay < 0.75) {
        set1 = C.day; set2 = C.dusk;
        t = (timeOfDay - 0.50) / 0.25;
    } 
    else {
        set1 = C.dusk; set2 = C.night;
        t = (timeOfDay - 0.75) / 0.25;
    }

    // Blend Colors
    const topColor = lerpColorHex(set1[0], set2[0], t);
    const botColor = lerpColorHex(set1[1], set2[1], t);

    // Draw Sky
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, botColor);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tint (Weather)
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather];
    if(targetConfig && targetConfig.tint) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply'; 
        ctx.fillStyle = targetConfig.tint;
        ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.restore();
    }

    if(auroraOpacity > 0.01) {
        drawAurora(auroraOpacity);
    }
}

// --- VISIBLE LIGHT BEAMS ---
function drawBeams() {
    const isNight = timeOfDay > 0.75 || timeOfDay < 0.25;
    let colorStart, colorEnd;

    // Define Colors based on time
    if (isNight) {
        // Moon Beams: Cool, Blueish, Faint
        colorStart = "rgba(200, 220, 255, 0.15)";
        colorEnd = "rgba(200, 220, 255, 0)";
    } else {
        // Sun Rays: Warm, Yellowish, Visible
        // If cloudy, make them whiter/stronger to pierce clouds
        const w = STATE.currentWeather;
        if(w === 'cloudy' || w === 'rain') {
            colorStart = "rgba(255, 255, 255, 0.25)";
        } else {
            colorStart = "rgba(255, 250, 210, 0.2)"; // Sunny gold
        }
        colorEnd = "rgba(255, 250, 210, 0)";
    }

    ctx.save();
    // 'screen' or 'soft-light' blends nicely with sky without washing out
    ctx.globalCompositeOperation = 'overlay'; 

    lightBeams.forEach(b => {
        // Calculate dynamic alpha pulsing
        const pulse = 0.5 + Math.sin(b.alphaPhase) * 0.5; // 0.0 to 1.0
        
        // Setup Gradient for ONE beam
        // It starts high and fades as it goes down
        const grad = ctx.createLinearGradient(b.x, -100, b.x + b.tilt, canvas.height);
        
        // We inject the Alpha into the color string manually for the pulse effect
        // NOTE: simplistic replacement for performance, assumes rgba format above
        const c1 = colorStart.replace(/[\d.]+\)$/g, `${0.3 * pulse})`); 
        
        grad.addColorStop(0, c1);
        grad.addColorStop(1, colorEnd);

        ctx.fillStyle = grad;
        
        // Draw the beam (Trapezoid shape for "spreading" light)
        ctx.beginPath();
        ctx.moveTo(b.x, -100);
        ctx.lineTo(b.x + b.width, -100);
        ctx.lineTo(b.x + b.width + b.tilt, canvas.height);
        ctx.lineTo(b.x + b.tilt, canvas.height);
        ctx.fill();
    });

    ctx.restore();
}

function drawOverlay() {
    let darkness = 0;
    const targetConfig = CONFIG.WEATHER_TYPES[STATE.currentWeather];
    const isDarkWeather = targetConfig && targetConfig.dark;

    // Darkness based on Time (Peak night at 0.0 and 1.0)
    // 0.25 (Dawn) -> 0.75 (Dusk) = Light
    if (timeOfDay < 0.25) darkness = 0.6 - (timeOfDay/0.25)*0.6; 
    else if (timeOfDay > 0.75) darkness = (timeOfDay-0.75)/0.25 * 0.6; 
    
    if(isDarkWeather) darkness = Math.max(darkness, 0.4);

    if (darkness > 0.01) {
        ctx.fillStyle = `rgba(5, 10, 30, ${darkness})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (lightningFlash > 0.01) {
        ctx.fillStyle = `rgba(255, 255, 255, ${lightningFlash})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawAurora(opacity) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height/2);
    grad.addColorStop(0, `rgba(0, 255, 100, ${opacity * 0.5})`);
    grad.addColorStop(0.5, `rgba(100, 0, 255, ${opacity * 0.3})`);
    grad.addColorStop(1, `rgba(0, 255, 100, ${opacity * 0.5})`);
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for(let x=0; x<=canvas.width; x+=50) {
        ctx.lineTo(x, 100 + Math.sin(x*0.01 + Date.now()*0.001)*50);
    }
    ctx.lineTo(canvas.width, 0);
    ctx.fill();
    ctx.restore();
}

function drawBlade(blade, windRad) {
    const angle = blade.baseAngle + (windRad * 1.0);
    const h = blade.height;
    
    const tipX = blade.x + Math.sin(angle) * h;
    const tipY = blade.y - Math.cos(angle) * h;
    const cpX = blade.x + Math.sin(angle) * (h * 0.4);
    const cpY = blade.y - Math.cos(angle) * (h * 0.4);

    ctx.beginPath(); 
    ctx.moveTo(blade.x, blade.y);
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY); 
    ctx.stroke();
}

function drawPlant(p, age) {
    const size = CONFIG.CANVAS_SIZE; 
    const growthTime = 12000;
    const progress = Math.min(1, age / growthTime);
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    
    const pStem = Math.min(1, Math.max(0, (progress-0)/0.4));     
    const pLeaves = Math.min(1, Math.max(0, (progress-0.2)/0.4)); 
    const pFlower = Math.min(1, Math.max(0, (progress-0.5)/0.5)); 
    
    if(pStem > 0) {
        if(!imageCache[p.stemTex]) { const i=new Image(); i.src=p.stemTex; imageCache[p.stemTex]=i; }
        const img = imageCache[p.stemTex];
        if(img && img.complete) {
            const h = size * pStem;
            ctx.drawImage(img, 0, size-h, size, h, -size/2, -h, size, h);
        }
    }
    const sLeaf = pLeaves > 0 ? easeOut(pLeaves) : 0;
    if(sLeaf > 0) drawPivoted(p.leafTex, size, sLeaf, 0, -80);
    const sFlow = pFlower > 0 ? easeOut(pFlower) : 0;
    if(sFlow > 0) drawPivoted(p.flowerTex, size, sFlow, 0, -150);
}

function drawPivoted(src, size, scale, anchorX, anchorY) {
    if(!imageCache[src]) { const i=new Image(); i.src=src; imageCache[src]=i; }
    const img = imageCache[src];
    if(img && img.complete) {
        ctx.save();
        ctx.translate(anchorX, anchorY);
        ctx.scale(scale, scale);
        ctx.translate(-anchorX, -anchorY);
        ctx.drawImage(img, -size/2, -size, size, size);
        ctx.restore();
    }
}

function drawNameTag(p) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    const text = `Gardener: ${p.author}`;
    ctx.font = "bold 20px sans-serif";
    const w = ctx.measureText(text).width + 20;
    const bx = p.x - w/2;
    const by = p.y - 180;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.roundRect(bx, by, w, 40, 8); ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(text, bx+10, by+26);
    ctx.restore();
}