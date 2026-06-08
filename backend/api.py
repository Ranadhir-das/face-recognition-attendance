from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import base64
import numpy as np
import cv2
import face_recognition
from datetime import datetime
import jwt
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

SECRET_KEY = "my_college_project"

@app.route('/api/login', methods=['POST'])
def login():
    try:
        req_data = request.get_json()
        username = req_data.get('username')
        password = req_data.get('password')

        if username == 'admin' and password == 'admin123':
            token = jwt.encode({
                'user': username,
                'exp': datetime.utcnow() + timedelta(hours=2)
            }, SECRET_KEY, algorithm="HS256")
            
            return jsonify({"status": "success", "token": token})
        else:
            return jsonify({"status": "error", "message": "Invalid username or password"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


KNOWN_ENCODINGS = []
KNOWN_NAMES = []

def load_faces():
    """Loads all student images from the dataset folder into memory."""
    global KNOWN_ENCODINGS, KNOWN_NAMES
    KNOWN_ENCODINGS.clear()
    KNOWN_NAMES.clear()
    
    dataset_path = "dataset"
    if not os.path.exists(dataset_path):
        os.makedirs(dataset_path)
        return

    for file_name in os.listdir(dataset_path):
        if file_name.endswith((".jpg", ".png", ".jpeg")):
            name = os.path.splitext(file_name)[0].capitalize()
            image_path = os.path.join(dataset_path, file_name)
            image = face_recognition.load_image_file(image_path)
            encodings = face_recognition.face_encodings(image)
            if len(encodings) > 0:
                KNOWN_ENCODINGS.append(encodings[0])
                KNOWN_NAMES.append(name)
    print(f"✅ Loaded {len(KNOWN_NAMES)} faces into active memory.")

load_faces()

def mark_attendance(name):
    """Logs the student into SQLite (Once per day limit)."""
    conn = sqlite3.connect('attendance.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS attendance_log (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, time TEXT, date TEXT)''')
    
    now = datetime.now()
    date_str = now.strftime('%Y-%m-%d')
    time_str = now.strftime('%H:%M:%S')
    
    c.execute("SELECT * FROM attendance_log WHERE name=? AND date=?", (name, date_str))
    if c.fetchone() is None:
        c.execute("INSERT INTO attendance_log (name, time, date) VALUES (?, ?, ?)", (name, time_str, date_str))
        conn.commit()
        conn.close()
        return True 
    conn.close()
    return False 

@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    data = []
    try:
        conn = sqlite3.connect('attendance.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS attendance_log (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, time TEXT, date TEXT)''')
        c.execute("SELECT name as Name, time as Time, date as Date FROM attendance_log ORDER BY id DESC")
        data = [dict(row) for row in c.fetchall()]
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")
    return jsonify(data)

@app.route('/api/register', methods=['POST'])
def register_student():
    try:
        req_data = request.get_json()
        student_name = req_data.get('name', '').strip().lower()
        image_data = req_data.get('image', '').split(",")[1] if "," in req_data.get('image', '') else req_data.get('image', '')
        
        file_path = os.path.join("dataset", f"{student_name}.jpg")
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(image_data))
            
        load_faces() 
        return jsonify({"status": "success", "message": f"Successfully registered {student_name}!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    """Receives a frame from React, processes it, and returns the recognized name."""
    try:
        req_data = request.get_json()
        image_data = req_data.get('image', '')
        if "," in image_data: image_data = image_data.split(",")[1]

        # Convert base64 to an OpenCV image
        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Resize to 1/4 size for faster processing, convert to RGB
        small_frame = cv2.resize(img, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # Find faces
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        recognized_names = []
        for face_encoding in face_encodings:
            matches = face_recognition.compare_faces(KNOWN_ENCODINGS, face_encoding, tolerance=0.5)
            name = "Unknown"
            
            face_distances = face_recognition.face_distance(KNOWN_ENCODINGS, face_encoding)
            if len(face_distances) > 0:
                best_match_index = np.argmin(face_distances)
                if matches[best_match_index]:
                    name = KNOWN_NAMES[best_match_index]
                    mark_attendance(name) 
            recognized_names.append(name)

        return jsonify({"status": "success", "faces": recognized_names})
    except Exception as e:
        print(f"Recognition error: {e}")
        return jsonify({"status": "error", "faces": []}), 500

if __name__ == '__main__':
    app.run(port=5000)