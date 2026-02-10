import { STATE } from './state.js';
import { openEditor } from './editor.js';
import { protectPlant } from './network.js'; // Changed import

export function initInput() {
    console.log("[System] Initializing Input...");
    const canvas = document.getElementById('gameCanvas');

    // 1. Track Mouse for Hover Effects (Renderer uses this)
    window.addEventListener('mousemove', (e) => {
        STATE.mouse.x = e.clientX;
        STATE.mouse.y = e.clientY;
    });

    // 2. Handle Clicks (Open Editor)
    window.addEventListener('mousedown', (e) => {
        // Prevent opening editor if clicking on UI elements (HUD, Buttons)
        if (e.target.id !== 'gameCanvas') return;

        // Prevent opening editor if we are hovering an existing plant
        if (STATE.hoveredPlant) {
            console.log(`Clicked plant by: ${STATE.hoveredPlant.author}`);
            return;
        }

        // Open the editor at these coordinates
        openEditor(e.clientX, e.clientY);
    });

    window.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'gameCanvas') return;

        if (STATE.hoveredPlant) {
            // New Action: Protect!
            protectPlant(STATE.hoveredPlant.id);
            return;
        }
        // ... open editor logic ...
    });
}