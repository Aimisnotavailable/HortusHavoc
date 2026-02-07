export const STATE = {
    plants: [],
    grassBlades: [],
    rainDrops: [],
    lastServerTime: 0,
    mouse: { x: -100, y: -100 },
    hoveredPlant: null,
    
    // Editor State
    editorStep: 0,
    tempParts: {}, 
    pendingLoc: { x: 0, y: 0 },

    // Weather & Physics State
    currentWeather: 'sunny', 
    isRaining: false,

    // THE PHYSICS ENGINE (Must be here or Renderer crashes)
    physics: {
        speed: 0.005,      
        force: 0.02,       
        direction: 1,      
        accumulator: 0     
    }
};