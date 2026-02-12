import { STATE } from './state.js';
import { openEditor } from './editor.js';
import { protectPlant } from './network.js'; 
import { AUDIO } from './audio.js';          

let lastShieldTime = 0; 
let isDragging = false;
let startX = 0;
let lastCameraX = 0;
const TAP_THRESHOLD = 10; 

export function initInput() {
    console.log("[System] Initializing Input...");
    
    // 1. Desktop Mouse Tracking
    window.addEventListener('mousemove', (e) => {
        STATE.mouse.x = e.clientX;
        STATE.mouse.y = e.clientY;
    });

    // 2. Desktop Click
    window.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        const worldX = e.clientX + (STATE.camera ? STATE.camera.x : 0);
        handleInteract(worldX, e.clientY);
    });

    // 3. Mobile Touch (Drag & Tap)
    window.addEventListener('touchstart', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        if(e.cancelable) e.preventDefault();
        
        const touch = e.touches[0];
        startX = touch.clientX;
        lastCameraX = STATE.camera ? STATE.camera.x : 0;
        isDragging = false;
        
        STATE.mouse.x = touch.clientX;
        STATE.mouse.y = touch.clientY;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        if(e.cancelable) e.preventDefault();
        
        const touch = e.touches[0];
        const dx = startX - touch.clientX; 
        
        if (Math.abs(dx) > TAP_THRESHOLD) {
            isDragging = true;
            if (STATE.camera) {
                STATE.camera.x = lastCameraX + dx;
                // Clamp
                const WORLD_WIDTH = 4000;
                const viewW = window.innerWidth;
                if (STATE.camera.x < 0) STATE.camera.x = 0;
                if (STATE.camera.x > WORLD_WIDTH - viewW) STATE.camera.x = WORLD_WIDTH - viewW;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        if (!isDragging) {
            const worldX = STATE.mouse.x + (STATE.camera ? STATE.camera.x : 0);
            handleInteract(worldX, STATE.mouse.y);
        }
        isDragging = false;
    });
}

function handleInteract(worldX, worldY) {
    const clickedPlant = STATE.plants.find(p => {
        const dx = Math.abs(p.x - worldX);
        const dy = p.y - worldY; 
        return (dx < 40 && dy > 0 && dy < 200);
    });

    if (clickedPlant) {
        // Mobile Logic: Tap once to see tooltip, twice to protect
        const isMobile = ('ontouchstart' in window);
        if (isMobile && STATE.hoveredPlant !== clickedPlant) {
            STATE.hoveredPlant = clickedPlant;
            return;
        }

        const now = Date.now();
        if (now - lastShieldTime < 2000) return; 
        
        protectPlant(clickedPlant.id); 
        AUDIO.play('protect');               
        lastShieldTime = now;
        return; 
    }

    openEditor(worldX, worldY);
}