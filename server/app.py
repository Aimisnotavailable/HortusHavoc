from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
import time
import random
import json
import os

app = Flask(__name__, static_folder='../client')
CORS(app)

# --- STATE ---
DB_FILE = 'global_plants.json'
GLOBAL_PLANTS = []

# Admin Overrides
admin_override = {
    "weather": None,        # If set, locks weather to this type
    "time_offset": 0        # Shift server time (in hours)
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
# 0.0 = Dry/None, 1.0 = Max Saturation
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
    
    # 1. Check Admin Override
    if admin_override["weather"]:
        current_weather = admin_override["weather"]
    else:
        # 2. Normal Random Logic
        now = time.time()
        if now - last_weather_change > WEATHER_DURATION_SEC:
            weights = [0.3] + [0.7 / (len(WEATHER_TYPES)-1)] * (len(WEATHER_TYPES)-1)
            current_weather = random.choices(WEATHER_TYPES, weights=weights, k=1)[0]
            last_weather_change = now

    # 3. Simulate Environment
    w = current_weather
    
    # Snow Logic
    if "snow" in w or "blizzard" in w:
        rate = 0.002 if "blizzard" in w else 0.0005
        env_state["snow_level"] = min(1.0, env_state["snow_level"] + rate)
    elif "sunny" in w:
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.001)
    else:
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.0002)

    # Puddle Logic
    if "rain" in w or "storm" in w:
        rate = 0.005 if "storm" in w else 0.001
        env_state["puddle_level"] = min(1.0, env_state["puddle_level"] + rate)
        env_state["snow_level"] = max(0.0, env_state["snow_level"] - 0.002)
    elif "sunny" in w:
        env_state["puddle_level"] = max(0.0, env_state["puddle_level"] - 0.001)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/admin')
def admin():
    return render_template('admin.html', weather_types=WEATHER_TYPES)

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

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
    app.run(host='0.0.0.0', port=5000, debug=True)