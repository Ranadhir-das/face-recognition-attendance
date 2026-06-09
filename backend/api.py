from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import base64
import numpy as np
import cv2
import face_recognition
from datetime import datetime

import os 

app = Flask(__name__, static_url_path='/api/dataset', static_folder='dataset')
CORS(app)

KNOWN_ENCODINGS = []
KNOWN_NAMES = []

def init_db():
    conn = sqlite3.connect('attendance.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS attendance_log 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, time TEXT, date TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS students 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, class_name TEXT, 
                  roll TEXT, dob TEXT, email TEXT, phone TEXT, image_path TEXT)''')
    conn.commit()
    conn.close()

def load_faces():
    global KNOWN_ENCODINGS, KNOWN_NAMES
    KNOWN_ENCODINGS.clear()
    KNOWN_NAMES.clear()
    init_db()
    try:
        conn = sqlite3.connect('attendance.db')
        c = conn.cursor()
        c.execute("SELECT name, image_path FROM students")
        rows = c.fetchall()
        for name, image_path in rows:
            if os.path.exists(image_path):
                image = face_recognition.load_image_file(image_path)
                encodings = face_recognition.face_encodings(image)
                if len(encodings) > 0:
                    KNOWN_ENCODINGS.append(encodings[0])
                    KNOWN_NAMES.append(name.capitalize())
        conn.close()
        print(f"✅ Synced memory cache: {len(KNOWN_NAMES)} profiles active.")
    except Exception as e:
        print(f"Cache sync failure: {e}")

load_faces()

def mark_attendance(name):
    conn = sqlite3.connect('attendance.db')
    c = conn.cursor()
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
    conn = sqlite3.connect('attendance.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT name as Name, time as Time, date as Date FROM attendance_log ORDER BY id DESC")
    data = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(data)

@app.route('/api/students', methods=['GET'])
def get_students():
    conn = sqlite3.connect('attendance.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT id, name, class_name, roll, dob, email, phone, image_path FROM students ORDER BY id DESC")
    data = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(data)

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    try:
        conn = sqlite3.connect('attendance.db')
        c = conn.cursor()
        c.execute("SELECT image_path FROM students WHERE id=?", (student_id,))
        row = c.fetchone()
        if row:
            image_path = row[0]
            if os.path.exists(image_path):
                os.remove(image_path)
            c.execute("DELETE FROM students WHERE id=?", (student_id,))
            conn.commit()
        conn.close()
        load_faces()
        return jsonify({"status": "success", "message": "Student profile permanently removed."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/register', methods=['POST'])
def register_student():
    try:
        req_data = request.get_json()
        student_name = req_data.get('name', '').strip().lower()
        class_name = req_data.get('class_name', '').strip()
        roll = req_data.get('roll', '').strip()
        dob = req_data.get('dob', '').strip()
        email = req_data.get('email', '').strip()
        phone = req_data.get('phone', '').strip()
        image_data = req_data.get('image', '')

        if not all([student_name, class_name, roll, dob, email, phone, image_data]):
            return jsonify({"status": "error", "message": "All identity fields are required"}), 400

        if "," in image_data:
            image_data = image_data.split(",")[1]

        dataset_path = "dataset"
        if not os.path.exists(dataset_path):
            os.makedirs(dataset_path)

        filename = f"{student_name}_{roll}.jpg"
        file_path = os.path.join(dataset_path, filename)
        
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(image_data))
            
        conn = sqlite3.connect('attendance.db')
        c = conn.cursor()
        c.execute("""INSERT INTO students (name, class_name, roll, dob, email, phone, image_path) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)""",
                  (student_name, class_name, roll, dob, email, phone, file_path))
        conn.commit()
        conn.close()
        
        load_faces()
        return jsonify({"status": "success", "message": f"Successfully enrolled {student_name}!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    try:
        req_data = request.get_json()
        image_data = req_data.get('image', '')
        if "," in image_data: image_data = image_data.split(",")[1]

        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        small_frame = cv2.resize(img, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

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
        return jsonify({"status": "error", "faces": []}), 500

@app.route('/api/login', methods=['POST'])
def login():
    req_data = request.get_json()
    if req_data.get('username') == 'admin' and req_data.get('password') == 'admin123':
        return jsonify({"status": "success", "token": "mock-jwt-token-string"})
    return jsonify({"status": "error", "message": "Invalid credentials"}), 401

if __name__ == '__main__':
    app.run(port=5000)