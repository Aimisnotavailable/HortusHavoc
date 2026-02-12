import { STATE } from './state.js';
import { openEditor } from './editor.js';
import { protectPlant } from './network.js'; 
import { AUDIO } from './audio.js';          

let lastShieldTime = 0; 

export function initInput() {
    console.log("[System] Initializing Input...");

    // 1. Track Mouse (Keep this for visuals/tooltips)
    window.addEventListener('mousemove', (e) => {
        STATE.mouse.x = e.clientX;
        STATE.mouse.y = e.clientY;
    });

    // 2. Handle Mouse Clicks
    window.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        handleInteract(e.clientX, e.clientY);
    });

    // 3. Handle Touch Taps (Mobile)
    window.addEventListener('touchstart', (e) => {
        if (e.target.id !== 'gameCanvas') return;
        
        // Prevent default to stop scrolling AND prevent "ghost" mouse clicks
        e.preventDefault(); 
        
        // Use the first touch point
        const touch = e.touches[0];
        if(touch) {
            handleInteract(touch.clientX, touch.clientY);
        }
    }, { passive: false });
}

// --- SHARED LOGIC FOR MOUSE & TOUCH ---
function handleInteract(inputX, inputY) {
    // A. Check Hitbox
    // Find a plant that is close to the input
    // Box: 60px wide (30px L/R), 180px tall (from base upwards)
    const clickedPlant = STATE.plants.find(p => {
        const dx = Math.abs(p.x - inputX);
        const dy = p.y - inputY; // positive means click is ABOVE base
        
        // Check: Within 40px left/right AND between 0px and 200px up
        return (dx < 40 && dy > 0 && dy < 200);
    });

    if (clickedPlant) {
        // B. Cooldown Check (2 Seconds)
        const now = Date.now();
        if (now - lastShieldTime < 2000) { 
            console.log("⏳ Shield recharging...");
            return; 
        }
        
        // C. Protect Action
        console.log(`🛡️ Protecting Plant ${clickedPlant.id}`);
        protectPlant(clickedPlant.id); 
        AUDIO.play('protect');               
        lastShieldTime = now;
        
        return; // STOP here. Do not open editor.
    }

    // D. If Missed Plant -> Open Editor
    openEditor(inputX, inputY);
}