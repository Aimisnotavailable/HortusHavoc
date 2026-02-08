import { initRenderer } from './renderer.js';
import { initEditor } from './editor.js';
import { pollUpdates } from './network.js';
import { initInput } from './input.js';

function init() {
    console.log("[System] Initializing...");
    
    try {
        // 1. Init Subsystems
        initRenderer(); // Sets up Game Canvas loop
        initEditor();   // Sets up Modal & Drawing Canvases
        initInput();    // Sets up Mouse/Click events
        
        // 2. Load Data
        pollUpdates();
        
        console.log("[System] Ready.");
    } catch (e) {
        console.error("[System] Critical Init Failure:", e);
    }
}

// The Guardrail: Wait for HTML to be fully parsed
document.addEventListener('DOMContentLoaded', init);