export const CONFIG = {
    // FIX: Use relative path (starts with /). 
    // This avoids the "http:localhost" typo and works on any IP.
    API_URL: '/api', 
    
    POLL_INTERVAL: 2000,
    GRASS_COUNT: 8000,
    CANVAS_SIZE: 200,

    // Time Scale: 1 real sec = 10 game sec
    GAME_TIME_SCALE: 10, 

    // Growth: 5000ms to fully grow
    GROWTH_DURATION: 5000,
    
    COLORS: ['#1e361a', '#2d4c1e', '#4a6b2f', '#638235', '#789440', '#8f9e53'],

    SKY_COLORS: {
        dawn:  ['#4a3b3b', '#6b4c4c'], 
        day:   ['#2a3a2a', '#3a4a3a'], 
        dusk:  ['#2d2424', '#4a3030'], 
        night: ['#050505', '#1a1a1a'] 
    },

    WEATHER_TYPES: {
        sunny:          { label: "☀️ Sunny",           speed: 0.01,  force: 0.05, temp: 25, drySpeed: 0.005, vis: 1.0 },
        cloudy:         { label: "☁️ Cloudy",          speed: 0.02,  force: 0.08, temp: 20, drySpeed: 0.002, vis: 0.9 },
        breeze:         { label: "🍃 Breeze",          speed: 0.10,  force: 0.15, temp: 22, drySpeed: 0.008, vis: 1.0 },
        rain:           { label: "🌧️ Rain",            speed: 0.05,  force: 0.10, temp: 18, drySpeed: -0.01, vis: 0.8, rainRate: 5, dark: true },
        storm:          { label: "⛈️ Storm",           speed: 0.20,  force: 0.40, temp: 15, drySpeed: -0.02, vis: 0.6, rainRate: 20, lightning: true, dark: true },
        gale:           { label: "💨 Gale",            speed: 0.50,  force: 0.80, temp: 15, drySpeed: 0.02,  vis: 0.7, debris: 0.5 },
        snow:           { label: "🌨️ Snow",             speed: 0.02,  force: 0.10, temp: -5, drySpeed: 0.001, vis: 0.7, snowRate: 5, dark: true },
        blizzard:       { label: "❄️ Blizzard",         speed: 0.40,  force: 1.00, temp: -15, drySpeed: 0.0,   vis: 0.2, snowRate: 20, dark: true },
        hail:           { label: "☄️ Hail",             speed: 0.15,  force: 0.50, temp: 0,  drySpeed: -0.01, vis: 0.8, hailRate: 15, dark: true },
        fog:            { label: "🌫️ Fog",              speed: 0.005, force: 0.05, temp: 10, drySpeed: -0.001, vis: 0.2, dark: true },
        tornado:        { label: "🌪️ Tornado",          speed: 0.60,  force: 2.00, temp: 15, drySpeed: 0.0,   vis: 0.5, debris: 1.0, dark: true, tint: 'rgba(42, 42, 42, 0.5)' },
        dust_storm:     { label: "🏜️ Dust Storm",       speed: 0.30,  force: 0.60, temp: 30, drySpeed: 0.05,  vis: 0.4, debris: 0.8, tint: 'rgba(194, 178, 128, 0.4)' },
        volcanic_ash:   { label: "🌋 Volcanic Ash",     speed: 0.01,  force: 0.05, temp: 28, drySpeed: 0.02,  vis: 0.3, ashRate: 10, dark: true, tint: 'rgba(50, 20, 20, 0.3)' },
        meteor_shower:  { label: "🌠 Meteor Shower",    speed: 0.01,  force: 0.05, temp: 20, drySpeed: 0.0,   vis: 1.0, meteorRate: 1, dark: true },
        aurora_borealis:{ label: "🌌 Aurora",           speed: 0.00,  force: 0.02, temp: -10, drySpeed: 0.0,  vis: 1.0, aurora: true, dark: true }
    }
};