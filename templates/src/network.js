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
    const lastTime = (typeof STATE.lastServerTime === 'number') ? STATE.lastServerTime : 0;

    fetch(`${CONFIG.API_URL}/updates?since=${lastTime}`)
        .then(res => res.json())
        .then(data => {
            // A. Sync Plants
            if(data.plants && data.plants.length > 0) {
                const existingIds = new Set(STATE.plants.map(p => p.id));
                const uniqueNew = data.plants.filter(p => !existingIds.has(p.id));
                
                if (uniqueNew.length > 0) {
                    STATE.plants.push(...uniqueNew);
                    // OPTIMIZATION: Sort ONCE when data arrives, not every frame
                    STATE.plants.sort((a,b) => a.y - b.y);
                    
                    // Update HUD count
                    const countEl = document.getElementById('plant-count');
                    if(countEl) countEl.innerText = STATE.plants.length;
                }
            }

            // B. Sync Time
            if(data.server_time) {
                STATE.lastServerTime = data.server_time;
            }
            
            // C. Sync Weather
            if(data.weather && data.weather !== STATE.currentWeather) {
                console.log(`Weather Update: ${data.weather}`);
                STATE.currentWeather = data.weather;
            }
        })
        .catch(err => console.error("Polling error:", err))
        .finally(() => {
            // CRITICAL FIX: Schedule the next poll
            setTimeout(pollUpdates, CONFIG.POLL_INTERVAL);
        });
}