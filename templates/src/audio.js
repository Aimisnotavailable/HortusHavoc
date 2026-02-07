export class AudioManager {
    constructor() {
        this.enabled = false;
        this.sounds = {};
        
        this.sources = {
            'rain': 'sounds/rain.mp3',
            'wind': 'sounds/wind.mp3',
            'crickets': 'sounds/crickets.mp3',
            'storm': 'sounds/storm.mp3',
            'fire': 'sounds/fire.mp3'
        };
    }

    init() {
        if(this.enabled) return;
        this.enabled = true;
        console.log("🔊 Audio System Initialized");

        for (const [key, path] of Object.entries(this.sources)) {
            const audio = new Audio(path);
            audio.loop = true;
            audio.volume = 0; 
            this.sounds[key] = audio;
            audio.play().catch(e => {});
        }
    }

    update(weatherType, isNight) {
        if(!this.enabled) return;

        let targetRain = 0;
        let targetWind = 0.3; // Base wind volume increased (was 0.1)
        let targetCrickets = 0;
        let targetStorm = 0;

        // WEATHER LOGIC
        if (weatherType.includes('rain')) {
            targetRain = 0.5;
            targetWind = 0.4;
        } 
        else if (weatherType.includes('storm') || weatherType.includes('thunder')) {
            targetRain = 0.6;
            targetStorm = 0.6;
            targetWind = 0.6;
        } 
        else if (weatherType.includes('breeze') || weatherType.includes('cloudy')) {
            targetWind = 0.5; // Louder for breeze
        }
        else if (weatherType.includes('gale') || weatherType.includes('hurricane') || weatherType.includes('tornado')) {
            targetWind = 1.0; // Max volume
            targetRain = 0.3;
        }
        else if (weatherType.includes('blizzard')) {
            targetWind = 0.8;
        }

        // NIGHT LOGIC
        if (isNight && !weatherType.includes('storm') && !weatherType.includes('rain') && !weatherType.includes('snow')) {
            targetCrickets = 0.4;
        }

        this.fadeTo(this.sounds['rain'], targetRain);
        this.fadeTo(this.sounds['wind'], targetWind);
        this.fadeTo(this.sounds['crickets'], targetCrickets);
        this.fadeTo(this.sounds['storm'], targetStorm);
        this.fadeTo(this.sounds['fire'], 0);
    }

    fadeTo(audio, targetVol) {
        if (!audio) return;
        const speed = 0.02; 
        if (audio.volume < targetVol) {
            audio.volume = Math.min(targetVol, audio.volume + speed);
        } else if (audio.volume > targetVol) {
            audio.volume = Math.max(targetVol, audio.volume - speed);
        }
    }
}

export const AUDIO = new AudioManager();