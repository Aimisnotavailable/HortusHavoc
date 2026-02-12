from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
from pathlib import Path
import time
import random
import json
import os

# 1. SETUP PATHS
# Get the folder where this app.py is running
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Since you moved everything to 'templates', we point both configs there
TARGET_FOLDER = os.path.join(BASE_DIR, 'templates')

app = Flask(__name__, static_folder=TARGET_FOLDER, template_folder=TARGET_FOLDER)
CORS(app)

# --- STATE ---
DB_FILE = Path(f'{os.getcwd()}/global_plants.json') # Moved to root for easier access
STATS_FILE = Path(f'{os.getcwd()}/server_stats.json') # NEW FILE for counters

GLOBAL_PLANTS = []
GLOBAL_STATS = {"deaths": 0} # NEW DICT to hold stats

# Admin Overrides
admin_override = {
    "weather": None,
    "time_offset": 0
}

WEATHER_TYPES = [
    "sunny", "cloudy", "breeze", "rain", "storm", "gale", 
    "snow", "blizzard", "hail", "fog", "tornado", "dust_storm", 
    "volcanic_ash", "meteor_shower", "aurora_borealis"
]
current_weather = "sunny"
last_weather_change = 0
WEATHER_DURATION_SEC = 300

# --- GLOBAL ENVIRONMENT STATE ---
env_state = {
    "snow_level": 0.0,
    "puddle_level": 0.0
}

LAST_TICK_TIME = time.time()
NEXT_PLANT_ID = 1

def load_plants():
    # Load Plants
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                global GLOBAL_PLANTS
                GLOBAL_PLANTS = json.load(f)
        except:
            GLOBAL_PLANTS = []
            
    # NEW: Load Stats
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, 'r') as f:
                global GLOBAL_STATS
                GLOBAL_STATS = json.load(f)
        except:
            GLOBAL_STATS = {"deaths": 20}
            
def save_plants():
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(GLOBAL_PLANTS, f, indent=2)
    except Exception as e:
        print(f"Error saving to disk: {e}")

def save_stats():
    # NEW: Save Stats
    try:
        with open(STATS_FILE, 'w') as f:
            json.dump(GLOBAL_STATS, f)
    except Exception as e:
        print(f"Error saving to disk: {e}")


# GLOBAL_PLANTS = load_plants()
# print(f"Server loaded {len(GLOBAL_PLANTS)} plants from {DB_FILE}")

def update_weather_logic():
    global current_weather, last_weather_change, env_state
    
    # 1. Random Weather Change
    if admin_override["weather"]:
        current_weather = admin_override["weather"]
    else:
        now = time.time()
        if now - last_weather_change > WEATHER_DURATION_SEC:
            weights = [0.3] + [0.7 / (len(WEATHER_TYPES)-1)] * (len(WEATHER_TYPES)-1)
            current_weather = random.choices(WEATHER_TYPES, weights=weights, k=1)[0]
            last_weather_change = now

    w = current_weather
    
    # 2. Snow Logic
    if "snow" in w or "blizzard" in w:
        rate = 0.002 if "blizzard" in w else 0.0005
        env_state["snow_level"] = min(1.0, env_state["snow_level"] + rate)
    elif "sunny" in w:
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.001) # Fast melt
    else:
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.0002) # Slow melt

    # 3. Puddle Logic (FIXED)
    if w == "storm" or w == "rain":
        rate = 0.005 if "storm" in w else 0.001
        env_state["puddle_level"] = min(1.0, env_state["puddle_level"] + rate)
        # Rain melts snow fast
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.002)
    else:
        # FIX: Dry out puddles for ANY weather that isn't rain (Wind, Sun, Clouds)
        # Wind dries faster than still air
        dry_rate = 0.002 if ("breeze" in w or "gale" in w or "dust" in w) else 0.0005
        if "sunny" in w: dry_rate = 0.001
        
        env_state["puddle_level"] = max(0.0, env_state["puddle_level"] - dry_rate)

def update_world_physics():
    global LAST_TICK_TIME, GLOBAL_PLANTS, GLOBAL_STATS
    now = time.time()
    dt = now - LAST_TICK_TIME
    LAST_TICK_TIME = now

    state_changed = False 
    stats_changed = False # Track if we need to save stats
    
    # 1. REMOVE DEAD PLANTS
    initial_count = len(GLOBAL_PLANTS)
    
    survivors = []
    for p in GLOBAL_PLANTS:
        s = p.get('stats', {})
        # If dead and time is up (10s animation), delete it
        if s.get('dead', False) and now - s.get('death_time', 0) > 10:
             continue 
        survivors.append(p)
        
    # Count deaths
    deleted_count = initial_count - len(survivors)
    if deleted_count > 0:
        GLOBAL_STATS["deaths"] += deleted_count
        stats_changed = True
        state_changed = True
        
    GLOBAL_PLANTS = survivors
    
    if len(GLOBAL_PLANTS) != initial_count:
        state_changed = True

    is_stormy = current_weather in ['storm', 'blizzard', 'tornado', 'hail']

    for p in GLOBAL_PLANTS:
        if 'stats' not in p:
            p['stats'] = {"hp": 100.0, "maxHp": 100.0, "vit": 1.0}
            state_changed = True
        
        s = p['stats']
        
        # Skip logic if already dead
        if s.get('dead', False): continue

        # 2. CHECK PROTECTION
        # If protection is active, SKIP DAMAGE
        is_protected = s.get('protect_until', 0) > now
        
        # 3. APPLY DAMAGE
        if is_stormy and not is_protected:
            damage = 5.0 * dt
            s['hp'] = max(0.0, float(s['hp']) - damage)
            
            # DEATH EVENT
            if s['hp'] <= 0.0:
                s['hp'] = 0.0
                s['dead'] = True
                s['death_time'] = now # Mark time of death
                s['death_cause'] = current_weather # Record cause for animation
                state_changed = True
                continue 
        
        # 4. REGEN (Only if not stormy and not fully healed)
        elif not is_stormy and s['hp'] < s['maxHp']:
            regen = (1.5 * float(s['vit'])) * dt
            s['hp'] = min(float(s['maxHp']), s['hp'] + regen)

        # Dirty Check (Save if HP changed significantly)
        if abs(s['hp'] - s.get('last_saved_hp', 0)) > 0.5:
            s['last_saved_hp'] = s['hp']
            state_changed = True

    if state_changed:
        save_plants()
    if stats_changed:
        save_stats()
        
# --- ROUTES ---

@app.route('/')
def index():
    # Serves templates/index.html
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/this_is_not_the_admin_panel')
def admin():
    # Renders templates/admin.html with Jinja2
    return render_template('admin.html', weather_types=WEATHER_TYPES)

@app.route('/<path:path>')
def serve_static(path):
    # Serves templates/main.js, templates/style.css, etc.
    return send_from_directory(app.static_folder, path)

# --- API ---

@app.route('/api/plant', methods=['POST'])
def plant_seed():
    global NEXT_PLANT_ID # Use global counter
    data = request.json
    
    # FIX: Use a monotonic counter, not len(), to avoid ID reuse after death
    new_id = NEXT_PLANT_ID
    NEXT_PLANT_ID += 1
    
    max_hp = int(random.uniform(80.0, 300.0))
    vit = round(random.uniform(0.5, 5.0), 2)
    new_plant = {
        "id": new_id,
        "x": data.get('x', 0),
        "y": data.get('y', 0),
        "stemTex": data.get('stemTex', ''),
        "leafTex": data.get('leafTex', ''),
        "flowerTex": data.get('flowerTex', ''),
        "author": data.get('author', 'Anonymous'),
        "stats": {"hp": max_hp, "maxHp": max_hp, "vit": vit, "dead": False}, # Init stats immediately
        "server_time": data.get('timestamp')
    }

    GLOBAL_PLANTS.append(new_plant)
    save_plants()
    return jsonify(new_plant)

@app.route('/api/plant/protect', methods=['POST'])
def protect_plant():
    data = request.json
    plant_id = data.get('id')
    now = time.time()
    
    for p in GLOBAL_PLANTS:
        if p['id'] == plant_id:
            s = p['stats']
            # If already dead, cannot protect
            if s.get('dead', False):
                 return jsonify({"error": "Too late, plant is dead."}), 400
            
            # Apply 60 seconds of protection
            s['protect_until'] = now + 60 
            save_plants()
            return jsonify({"success": True, "protect_until": s['protect_until']})
            
    return jsonify({"error": "Plant not found"}), 404

@app.route('/api/updates', methods=['GET'])
def get_updates():
    update_world_physics()
    update_weather_logic()
    
    current_time = (time.time() + (admin_override["time_offset"] * 3600)) * 1000
    return jsonify({
        "time": current_time,
        "weather": current_weather,
        "env": env_state,
        "plants": GLOBAL_PLANTS,
        "deaths": GLOBAL_STATS["deaths"] # Send persistent count
    })

@app.route('/api/admin/update', methods=['POST'])
def admin_update():
    data = request.json
    if 'weather' in data:
        admin_override['weather'] = data['weather']
    if 'time_offset' in data:
        print(f"Admin set time offset to {data['time_offset']} hours")
        admin_override['time_offset'] = data['time_offset']
    return jsonify({"status": "ok", "overrides": admin_override})

if __name__ == '__main__':
    print(f"Serving everything from: {TARGET_FOLDER}")
    app.run(host='0.0.0.0', port=5000, debug=True)