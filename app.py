from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
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
DB_FILE = 'global_plants.json'
GLOBAL_PLANTS = []

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
WEATHER_DURATION_SEC = 60

# --- GLOBAL ENVIRONMENT STATE ---
env_state = {
    "snow_level": 0.0,
    "puddle_level": 0.0
}

def load_plants():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("Error: Save file corrupted. Starting fresh.")
            return []
    return []

def save_plants():
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(GLOBAL_PLANTS, f, indent=2)
    except Exception as e:
        print(f"Error saving to disk: {e}")

GLOBAL_PLANTS = load_plants()
print(f"Server loaded {len(GLOBAL_PLANTS)} plants from {DB_FILE}")

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
    if "rain" in w or "storm" in w:
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

# --- ROUTES ---

@app.route('/')
def index():
    # Serves templates/index.html
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/admin')
def admin():
    # Renders templates/admin.html with Jinja2
    return render_template('admin.html', weather_types=WEATHER_TYPES)

@app.route('/<path:path>')
def serve_static(path):
    # Serves templates/main.js, templates/style.css, etc.
    return send_from_directory(app.static_folder, path)

# --- API ---

@app.route('/api/plant', methods=['POST'])
def add_plant():
    data = request.json
    if not data: return jsonify({"error": "No data provided"}), 400

    new_plant = {
        "id": len(GLOBAL_PLANTS) + 1,
        "x": data.get('x', 0),
        "y": data.get('y', 0),
        "stemTex": data.get('stemTex', ''),
        "leafTex": data.get('leafTex', ''),
        "flowerTex": data.get('flowerTex', ''),
        "author": data.get('author', 'Anonymous'),
        "server_time": time.time() * 1000
    }
    GLOBAL_PLANTS.append(new_plant)
    save_plants()
    return jsonify(new_plant)

@app.route('/api/updates', methods=['GET'])
def get_updates():
    update_weather_logic()
    
    current_time = (time.time() + (admin_override["time_offset"] * 3600)) * 1000
    try:
        since = float(request.args.get('since', 0))
    except:
        since = 0.0
        
    new_plants = [p for p in GLOBAL_PLANTS if p.get('server_time', 0) > since]
    
    return jsonify({
        "time": current_time,
        "weather": current_weather,
        "env": env_state,
        "plants": new_plants
    })

@app.route('/api/admin/update', methods=['POST'])
def admin_update():
    data = request.json
    if 'weather' in data:
        admin_override['weather'] = data['weather']
    if 'time_offset' in data:
        admin_override['time_offset'] = data['time_offset']
    return jsonify({"status": "ok", "overrides": admin_override})

if __name__ == '__main__':
    print(f"Serving everything from: {TARGET_FOLDER}")
    app.run(host='0.0.0.0', port=5000, debug=True)