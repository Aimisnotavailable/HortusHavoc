import { CONFIG } from './config.js';
import { STATE } from './state.js';
import { AUDIO } from './audio.js';

// --- 1. UPLOAD PLANT (OPTIMISTIC UI) ---
export function uploadPlant(plantData) {
    // A. Optimistic Update (Show immediately)
    const tempId = 'temp-' + Date.now();
    const tempPlant = {
        ...plantData,
        id: tempId,
        x: plantData.x,
        y: plantData.y,
        server_time: Date.now(),
        stats: { hp: 100, maxHp: 100, vit: 1, str: 1 }
    };
    STATE.plants.push(tempPlant);
    
    console.log("🌱 Planting (Optimistic)...");

    // B. Send to Server
    fetch(`${CONFIG.API_URL}/plant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plantData)
    })
    .then(res => res.json())
    .then(data => {
        // C. Reconcile: Remove temp, add real if needed
        // (Polling will usually handle this, but we can update ID here)
        console.log("✅ Plant confirmed by server:", data);
        
        const idx = STATE.plants.findIndex(p => p.id === tempId);
        if (idx !== -1) {
            // Update the temp plant with real server ID/data
            STATE.plants[idx] = { ...tempPlant, ...data }; 
        }
        
        pollUpdates(); // Force refresh to be sure
    })
    .catch(err => {
        console.error("❌ Error planting:", err);
        // Rollback on error
        const idx = STATE.plants.findIndex(p => p.id === tempId);
        if (idx !== -1) STATE.plants.splice(idx, 1);
        alert("Failed to plant. Check connection.");
    });
}

// --- 2. POLL UPDATES ---
export function pollUpdates() {
    const lastTime = STATE.lastServerTime || 0;

    fetch(`${CONFIG.API_URL}/updates?since=${lastTime}`)
        .then(res => res.json())
        .then(data => {
            if(data.plants) {
                // 1. DELETE: Remove plants not present in the server list
                // (Be careful not to delete our Temp plants that haven't synced yet)
                const serverIds = new Set(data.plants.map(p => p.id));
                for (let i = STATE.plants.length - 1; i >= 0; i--) {
                    const p = STATE.plants[i];
                    // Keep temp plants (they start with 'temp-')
                    if (typeof p.id === 'string' && p.id.startsWith('temp-')) continue;
                    
                    if (!serverIds.has(p.id)) {
                        STATE.plants.splice(i, 1);
                    }
                }

                // 2. ADD / UPDATE
                data.plants.forEach(serverPlant => {
                    const existing = STATE.plants.find(p => p.id === serverPlant.id);
                    if (existing) {
                        // Update stats but preserve visual state if needed
                        existing.stats = serverPlant.stats;
                        existing.dead = serverPlant.dead; // Ensure death sync
                    } else {
                        STATE.plants.push(serverPlant);
                    }
                });
            }
            
            // B. Sync Time
            if(data.time) STATE.lastServerTime = data.time;
            // console.log("Time synced:", new Date(STATE.lastServerTime).toLocaleTimeString());
            
            // C. Sync Weather
            if(data.weather && data.weather !== STATE.currentWeather) {
                STATE.currentWeather = data.weather;
            }

            // D. Sync Environment
            if(data.env) {
                if(typeof data.env.snow_level === 'number') STATE.world.snowLevel = data.env.snow_level;
                if(typeof data.env.puddle_level === 'number') STATE.world.puddleLevel = data.env.puddle_level;
            }

            // E. Sync Death Count
            if (typeof data.deaths === 'number') {
                const el = document.getElementById('ui-death-count');
                if(el) el.innerText = data.deaths;
            }
        })
        .catch(err => console.error("Polling error:", err))
        .finally(() => {
            setTimeout(pollUpdates, CONFIG.POLL_INTERVAL);
        });
}

export function protectPlant(plantId) {
    // Optimistic SFX (Handled in Input.js mostly, but good to log)
    console.log(`🛡️ Shielding plant ${plantId}...`);
    
    fetch(`${CONFIG.API_URL}/plant/protect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plantId })
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            // Find and update locally immediately
            const p = STATE.plants.find(pl => pl.id === plantId);
            if(p && p.stats) {
                p.stats.protect_until = (Date.now() / 1000) + 60; // Assume 60s
            }
        }
    })
    .catch(err => console.error("Protect error:", err));
}