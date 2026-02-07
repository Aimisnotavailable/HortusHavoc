from flask import Flask, jsonify, request, send_from_directory, render_template_string
from flask_cors import CORS
import time
import random
import json
import os

# Get the directory where app.py actually lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Point to the templates folder relative to this file
# If 'templates' is INSIDE DrawAGarden, remove the '../'
template_dir = os.path.join(BASE_DIR, 'templates')

app = Flask(__name__, static_folder=template_dir)
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
    global current_weather, last_weather_change
    
    # 1. Check Admin Override
    if admin_override["weather"]:
        current_weather = admin_override["weather"]
        return

    # 2. Normal Random Logic
    now = time.time()
    if now - last_weather_change > WEATHER_DURATION_SEC:
        weights = [0.3] + [0.7 / (len(WEATHER_TYPES)-1)] * (len(WEATHER_TYPES)-1)
        current_weather = random.choices(WEATHER_TYPES, weights=weights, k=1)[0]
        last_weather_change = now

@app.route('/')
def index():
    print(app.static_folder)
    return send_from_directory(app.static_folder, 'index.html')

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
    
    # Apply Time Offset
    current_time = (time.time() + (admin_override["time_offset"] * 3600)) * 1000
    
    try:
        since = float(request.args.get('since', 0))
    except:
        since = 0.0

    new_plants = [p for p in GLOBAL_PLANTS if p.get('server_time', 0) > since]
    
    return jsonify({
        "time": current_time,
        "weather": current_weather,
        "plants": new_plants
    })

# --- ADMIN PANEL ---
@app.route('/admin')
def admin_panel():
    # Simple HTML Dashboard
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Garden Admin</title>
        <style>
            body { font-family: monospace; background: #222; color: #eee; padding: 20px; }
            .panel { background: #333; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
            button { background: #4caf50; border: none; padding: 10px 20px; color: white; cursor: pointer; margin: 5px; }
            button.danger { background: #f44336; }
            button:hover { opacity: 0.8; }
            input { padding: 8px; background: #444; border: 1px solid #555; color: white; }
            label { display: inline-block; width: 150px; }
        </style>
    </head>
    <body>
        <h1>🌱 Garden Admin Panel</h1>
        
        <div class="panel">
            <h3>🎮 Weather Control</h3>
            <p>Current: <strong id="cur-weather">Loading...</strong></p>
            <div id="weather-btns"></div>
            <button onclick="setWeather(null)" style="background:#555">🔄 Auto Mode</button>
        </div>

        <div class="panel">
            <h3>⏳ Time Travel</h3>
            <label>Offset (Hours):</label>
            <input type="number" id="time-offset" value="0">
            <button onclick="setTime()">Apply</button>
            <button onclick="resetTime()" style="background:#555">Reset to Real Time</button>
        </div>

        <script>
            const weathers = """ + json.dumps(WEATHER_TYPES) + """;
            
            // Generate Buttons
            const btnContainer = document.getElementById('weather-btns');
            weathers.forEach(w => {
                const btn = document.createElement('button');
                btn.innerText = w;
                btn.onclick = () => setWeather(w);
                btnContainer.appendChild(btn);
            });

            function setWeather(w) {
                fetch('/api/admin/update', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ weather: w })
                }).then(refreshStatus);
            }

            function setTime() {
                const offset = document.getElementById('time-offset').value;
                fetch('/api/admin/update', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ time_offset: parseFloat(offset) })
                }).then(refreshStatus);
            }
            
            function resetTime() {
                document.getElementById('time-offset').value = 0;
                setTime();
            }

            function refreshStatus() {
                fetch('/api/updates').then(r => r.json()).then(data => {
                    document.getElementById('cur-weather').innerText = data.weather;
                });
            }
            refreshStatus();
        </script>
    </body>
    </html>
    """
    return render_template_string(html)

@app.route('/api/admin/update', methods=['POST'])
def admin_update():
    data = request.json
    if 'weather' in data:
        admin_override['weather'] = data['weather']
    if 'time_offset' in data:
        admin_override['time_offset'] = data['time_offset']
    return jsonify({"status": "ok", "overrides": admin_override})

