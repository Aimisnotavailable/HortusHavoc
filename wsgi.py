from app import app
from app import load_plants

if __name__ == '__main__':
    load_plants()
    app.run(host='0.0.0.0', port=5000, debug=True)