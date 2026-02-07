from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import time
import random
import json
import os

app = Flask(__name__, static_folder='../client')
CORS(app)

# --- PERSISTENCE CONFIG ---
DB_FILE = 'global_plants.json'
GLOBAL_PLANTS = []

def load_plants():
    """Loads plants from disk on server startup."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("Error: Save file corrupted. Starting fresh.")
            return []
    return []

def save_plants():
    """Writes the current plant list to disk."""
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(GLOBAL_PLANTS, f, indent=2)
    except Exception as e:
        print(f"Error saving to disk: {e}")

# 1. Load data immediately when script starts
GLOBAL_PLANTS = load_plants()
print(f"Server loaded {len(GLOBAL_PLANTS)} plants from {DB_FILE}")

# --- SERVER SIDE WEATHER LOGIC ---
WEATHER_TYPES = ["sunny", "cloudy", "breeze", "rain", "storm", "gale"]
WEATHER_STATE = {
    "current": "sunny",
    "last_change": time.time()
}

def update_weather_logic():
    now = time.time()
    if now - WEATHER_STATE['last_change'] > 30:
        new_weather = random.choice(WEATHER_TYPES)
        WEATHER_STATE['current'] = new_weather
        WEATHER_STATE['last_change'] = now
        print(f"Server changed weather to: {new_weather}")

# --- ROUTES ---

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/plant', methods=['POST'])
def add_plant():
    data = request.json
    
    # Validation
    if not data:
        return jsonify({"error": "No data provided"}), 400

    new_plant = {
        "id": len(GLOBAL_PLANTS) + 1, # Simple ID generation
        "x": data.get('x', 0),
        "y": data.get('y', 0),
        "stemTex": data.get('stemTex', ''),
        "leafTex": data.get('leafTex', ''),
        "flowerTex": data.get('flowerTex', ''),
        "author": data.get('author', 'Anonymous'),
        "server_time": time.time() * 1000
    }
    
    GLOBAL_PLANTS.append(new_plant)
    
    # SAVE TO DISK IMMEDIATELY
    save_plants()
    
    return jsonify(new_plant)

@app.route('/api/updates', methods=['GET'])
def get_updates():
    update_weather_logic()
    
    try:
        since = float(request.args.get('since', 0))
    except (ValueError, TypeError):
        since = 0.0

    new_plants = [p for p in GLOBAL_PLANTS if p.get('server_time', 0) > since]
    
    return jsonify({
        "plants": new_plants,
        "server_time": time.time() * 1000,
        "weather": WEATHER_STATE['current']
    }), 200

if __name__ == '__main__':
    # Ensure client folder exists to avoid startup errors
    if not os.path.exists('../client'):
        print("Warning: '../client' folder not found. Static files may not serve.")
        
    app.run(debug=True, port=5000)