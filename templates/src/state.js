export const STATE = {
    plants: [],
    grassBlades: [],
    rainDrops: [],
    lastServerTime: 0,
    mouse: { x: -100, y: -100 },
    hoveredPlant: null,
    camera : { x: 0, y: 0, targetX: 0},
    
    // Synced Environment State (Target values from server)
    world: {
        snowLevel: 0,
        puddleLevel: 0
    },

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