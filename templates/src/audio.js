export const AUDIO = {
    ctx: null,
    masterGain: null,
    ambience: {}, 
    enabled: false,
    isMuted: false,
    
    // Define your file paths here
    sources: {
        'rain': 'sounds/rain.mp3',
        'wind': 'sounds/wind.mp3',
        'crickets': 'sounds/crickets.mp3',
        // 'storm': 'sounds/storm.mp3' // If this file is missing, it will log a warning but not crash
    },

    // 1. Init: Called on page load (just logs status)
    init() {
        console.log("🔊 Audio System Configured (Waiting for interaction...)");
    },

    // 2. Unlock: Called by the "Enter Garden" button
    unlock() {
        if (this.enabled) return;

        try {
            // A. Create Context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            
            // B. Setup Volume
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.5;
            this.masterGain.connect(this.ctx.destination);

            // C. Load & Play Ambience Immediately (Blessed by the click)
            Object.entries(this.sources).forEach(([key, url]) => {
                const audio = new Audio(url);
                audio.loop = true;
                audio.volume = 0; // Start silent, fade in later
                this.ambience[key] = audio;
                
                // Try to play. If file is missing or blocked, catch error safely.
                const p = audio.play();
                if(p) {
                    p.catch(e => console.warn(`🔊 [Audio] Could not play '${key}':`, e.message));
                }
            });

            // D. Ensure Engine is Running
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            this.enabled = true;
            console.log("🔊 Audio Context Unlocked & Running!");

        } catch (e) {
            console.error("🔊 [Audio] Critical Unlock Error:", e);
        }
    },

    // 3. Play SFX (Synthesized sounds)
    play(soundName) {
        if (!this.ctx || this.isMuted || !this.enabled) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);

        if (soundName === 'protect') {
            // SHIELD SOUND (Ping)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
            osc.frequency.exponentialRampToValueAtTime(300, t + 0.6); 
            
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6); 
            
            osc.start(t);
            osc.stop(t + 0.6);
        } 
        else if (soundName === 'wither') {
            // WITHER SOUND (Drone)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.linearRampToValueAtTime(50, t + 0.8);
            
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0.001, t + 0.8);
            
            osc.start(t);
            osc.stop(t + 0.8);
        }
    },

    // 4. Update Ambience based on Weather
    update(weatherType, isNight) {
        if (!this.enabled || this.isMuted) return;

        let targetRain = 0, targetWind = 0, targetCrickets = 0, targetStorm = 0;

        // Logic
        if (weatherType.includes('rain')) { targetRain = 0.6; }
        if (weatherType.includes('storm')) { targetRain = 0.5; targetStorm = 0.6; targetWind = 0.4; }
        if (weatherType.includes('breeze') || weatherType.includes('cloudy')) { targetWind = 0.3; }
        if (weatherType.includes('gale')) { targetWind = 0.8; }
        if (isNight && !weatherType.includes('storm')) { targetCrickets = 0.3; }

        // Fading
        this.fadeTo('rain', targetRain);
        this.fadeTo('wind', targetWind);
        this.fadeTo('crickets', targetCrickets);
        this.fadeTo('storm', targetStorm);
    },

    fadeTo(key, targetVol) {
        const track = this.ambience[key];
        if (!track) return;
        
        const delta = 0.02; 
        const current = track.volume;
        
        if (Math.abs(current - targetVol) > delta) {
            track.volume = current < targetVol ? current + delta : current - delta;
        } else {
            track.volume = targetVol;
        }
    },

    mute() {
        this.isMuted = true;
        if (this.masterGain) this.masterGain.gain.value = 0;
        Object.values(this.ambience).forEach(a => a.muted = true);
    },
    
    unmute() {
        this.isMuted = false;
        if (this.masterGain) this.masterGain.gain.value = 0.5;
        Object.values(this.ambience).forEach(a => a.muted = false);
    }
};