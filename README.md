# 📷 Smart AI Face Recognition Attendance System

A modern, full-stack biometric attendance tracking application. This system utilizes real-time computer vision to identify registered students via webcam and securely logs their daily attendance into an SQLite database. It features a secure admin portal, live data analytics, and in-browser profile registration.

## ✨ Features

* **Real-Time Facial Recognition:** Processes live webcam feeds to identify individuals using 128-dimensional facial encodings.
* **Browser-Based Registration:** Administrators can instantly capture and enroll new student profiles directly through the web UI—no backend file manipulation required.
* **Smart Logging System:** Automatically enforces a "once-per-day" database lock to prevent duplicate attendance spam.
* **Secure Admin Portal:** Dashboard and registration endpoints are protected by JSON Web Token (JWT) authentication.
* **Interactive Analytics:** Visualizes daily attendance trends and system metrics using responsive charts.
* **Modern UI/UX:** Built with a sleek, responsive Glassmorphism design system.

## 🛠️ Tech Stack

**Frontend (Client)**
* React.js (Vite)
* Recharts (Data Visualization)
* CSS Flexbox & Glassmorphism UI

**Backend (API & Database)**
* Python 3
* Flask & Flask-CORS
* SQLite (Built-in Relational Database)
* PyJWT (Authentication)

**Machine Learning (Computer Vision)**
* OpenCV (`cv2`)
* `face_recognition` (dlib wrapper)
* NumPy

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** and **npm** installed
* **Python 3.8+** installed
* *(macOS/Linux)* **CMake** installed (required to compile the `dlib` C++ library)

### 1. Backend Setup (Python API)
Open a terminal and navigate to the `backend` directory:

```bash
cd backend

# Create and activate a virtual environment
python -m venv env
source env/bin/activate  # On Windows use: env\Scripts\activate

# Install the required dependencies
pip install Flask flask-cors opencv-python face-recognition numpy PyJWT

# Start the Flask server
python api.py