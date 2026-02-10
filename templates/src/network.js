import { CONFIG } from './config.js';
import { STATE } from './state.js';

// --- 1. UPLOAD PLANT ---
export function uploadPlant(plantData) {
    fetch(`${CONFIG.API_URL}/plant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plantData)
    })
    .then(res => res.json())
    .then(data => {
        console.log("Plant planted:", data);
        pollUpdates(); // Refresh immediately
    })
    .catch(err => console.error("Error planting:", err));
}

// --- 2. POLL UPDATES ---
export function pollUpdates() {
    // We can ignore 'since' for plants now, but keep it for other potential optimizations
    const lastTime = STATE.lastServerTime || 0;

    fetch(`${CONFIG.API_URL}/updates?since=${lastTime}`)
        .then(res => res.json())
        .then(data => {
            if(data.plants) {
                const serverIds = new Set(data.plants.map(p => p.id));
                
                // 1. DELETE: Remove plants not present in the server list
                for (let i = STATE.plants.length - 1; i >= 0; i--) {
                    if (!serverIds.has(STATE.plants[i].id)) {
                        console.log(`💀 Plant ${STATE.plants[i].id} died. Removing.`);
                        STATE.plants.splice(i, 1);
                    }
                }

                // 2. ADD / UPDATE
                data.plants.forEach(incoming => {
                    const existing = STATE.plants.find(p => p.id === incoming.id);
                    if (existing) {
                        // Update stats
                        existing.stats = incoming.stats;
                    } else {
                        // Add new
                        STATE.plants.push(incoming);
                    }
                });
                
                // 3. Sort for depth
                STATE.plants.sort((a,b) => a.y - b.y);
            }
            
            // B. Sync Time
            if(data.server_time) STATE.lastServerTime = data.server_time;
            
            // C. Sync Weather
            if(data.weather && data.weather !== STATE.currentWeather) {
                STATE.currentWeather = data.weather;
            }

            // D. Sync Environment
            if(data.env) {
                if(typeof data.env.snow_level === 'number') STATE.world.snowLevel = data.env.snow_level;
                if(typeof data.env.puddle_level === 'number') STATE.world.puddleLevel = data.env.puddle_level;
            }
        })
        .catch(err => console.error("Polling error:", err))
        .finally(() => {
            setTimeout(pollUpdates, CONFIG.POLL_INTERVAL);
        });
}

export function protectPlant(plantId) {
    console.log(`🛡️ Shielding plant ${plantId}...`);
    fetch(`${CONFIG.API_URL}/plant/protect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plantId })
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            console.log("Shield Active!");
            pollUpdates(); // Get the new status immediately
        } else {
            console.warn(data.error);
        }
    });
}