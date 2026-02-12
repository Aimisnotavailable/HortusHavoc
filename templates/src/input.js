import { STATE } from './state.js';
import { openEditor } from './editor.js';
import { protectPlant } from './network.js'; 
import { AUDIO } from './audio.js';          

let lastShieldTime = 0; 
let isDragging = false;
let startX = 0;
let lastCameraX = 0;

// FIX 1: Increased Threshold so "jittery" taps don't become drags
const TAP_THRESHOLD = 20; 

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
        // Don't prevent default here immediately, let browser decide if it's a scroll or click
        // unless we are sure. But for a game, preventing default on canvas is usually safe 
        // to stop whole-page bounce.
        // if(e.cancelable) e.preventDefault();
        
        const touch = e.touches[0];
        startX = touch.clientX;
        lastCameraX = STATE.camera ? STATE.camera.x : 0;
        isDragging = false;
        
        STATE.mouse.x = touch.clientX;
        STATE.mouse.y = touch.clientY;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        if(e.cancelable) e.preventDefault(); // Prevent browser nav swipe
        
        const touch = e.touches[0];
        const dx = startX - touch.clientX; 
        
        // Only consider it a drag if moved significantly
        if (Math.abs(dx) > TAP_THRESHOLD) {
            isDragging = true;
            if (STATE.camera) {
                STATE.camera.x = lastCameraX + dx;
                
                // Clamp Camera
                const WORLD_WIDTH = 4000;
                const viewW = window.innerWidth;
                if (STATE.camera.x < 0) STATE.camera.x = 0;
                if (STATE.camera.x > WORLD_WIDTH - viewW) STATE.camera.x = WORLD_WIDTH - viewW;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        
        // If we didn't drag far, treat it as a tap
        if (!isDragging) {
            // Recalculate World X based on where the camera ended up
            const worldX = STATE.mouse.x + (STATE.camera ? STATE.camera.x : 0);
            handleInteract(worldX, STATE.mouse.y);
        }
        isDragging = false;
    });
}

function handleInteract(worldX, worldY) {
    // FIX 2: Widen the hitbox depending on device
    const isMobile = ('ontouchstart' in window);
    const HITBOX_W = isMobile ? 70 : 40; // 70px width for thumb, 40px for mouse
    
    // Find a plant that is close to the input
    const clickedPlant = STATE.plants.find(p => {
        const dx = Math.abs(p.x - worldX);
        const dy = p.y - worldY; 
        // Check: Horizontal dist < Radius AND Vertical dist (above base)
        return (dx < HITBOX_W && dy > 0 && dy < 250); // Increased Height detection too
    });

    if (clickedPlant) {
        // Mobile Logic: Tap once to select (tooltip), twice to protect
        if (isMobile) {
            // If tapping a DIFFERENT plant, or tapping nothing before
            if (STATE.hoveredPlant !== clickedPlant) {
                STATE.hoveredPlant = clickedPlant;
                // Play a small "select" sound if available, or nothing
                return; 
            }
            // If tapping the SAME plant already selected -> Protect it
        }

        const now = Date.now();
        if (now - lastShieldTime < 1000) return; // Reduced cooldown slightly for responsiveness
        
        protectPlant(clickedPlant.id); 
        if (AUDIO) AUDIO.play('protect');               
        lastShieldTime = now;
        return; 
    }

    // If clicked empty space -> Open Editor
    // On mobile, deselect plant if clicking empty space
    if (isMobile && STATE.hoveredPlant) {
        STATE.hoveredPlant = null;
        return;
    }

    openEditor(worldX, worldY);
}