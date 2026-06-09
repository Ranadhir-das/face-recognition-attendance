import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

function App() {
  const [view, setView] = useState('scanner'); 
  const [attendanceData, setAttendanceData] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null); 
  
  const [studentForm, setStudentForm] = useState({ name: '', className: '', roll: '', dob: '', email: '', phone: '' });
  const [regMode, setRegMode] = useState('capture'); 
  const [uploadedImage, setUploadedImage] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState({ type: '', msg: '' });
  const [scanResult, setScanResult] = useState('Initializing Scanner...');
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isProcessingRef = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const result = await response.json();
      if (result.status === 'success') {
        localStorage.setItem('adminToken', result.token);
        setIsAuthenticated(true);
        setView('dashboard');
        fetchStudents();
      } else {
        setLoginError(result.message);
      }
    } catch (err) {
      setLoginError("Failed to connect to the server.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    setView('scanner');
  };

  const fetchAttendance = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/attendance');
      const data = await response.json();
      setAttendanceData(data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/students');
      const data = await response.json();
      setStudentsList(data);
    } catch (error) {
      console.error("Error mapping student metadata index:", error);
    }
  };

  useEffect(() => {
    fetchAttendance();
    const interval = setInterval(fetchAttendance, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchStudents();
  }, [view, isAuthenticated]);

  const startBrowserCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      setScanResult("Camera Access Denied.");
    }
  };

  const stopBrowserCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
  };

  const captureAndRecognize = async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4 || isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    try {
      const response = await fetch('http://localhost:5000/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image })
      });
      const result = await response.json();
      if (result.faces && result.faces.length > 0) {
        setScanResult(result.faces.includes("Unknown") ? "⚠️ Unknown Face Detected" : `✅ Recognized: ${result.faces.join(", ")}`);
      } else {
        setScanResult("Scanning for faces...");
      }
    } catch (err) {
      console.error("API Error", err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    if (view === 'register' && regMode === 'capture') {
      startBrowserCamera();
    } else if (view === 'scanner') {
      setScanResult("Initializing Scanner...");
      startBrowserCamera().then(() => {
        scanIntervalRef.current = setInterval(captureAndRecognize, 1500);
      });
    } else {
      stopBrowserCamera();
    }
    return () => stopBrowserCamera();
  }, [view, regMode]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const { name, className, roll, dob, email, phone } = studentForm;
    if (!name.trim() || !className.trim() || !roll.trim() || !dob || !email.trim() || !phone.trim()) return;

    let finalImage = uploadedImage;
    if (regMode === 'capture') {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      finalImage = canvas.toDataURL('image/jpeg');
    }

    if (!finalImage) {
      setRegistrationStatus({ type: 'error', msg: 'Missing identity data source media.' });
      return;
    }

    try {
      setRegistrationStatus({ type: 'info', msg: 'Uploading profile...' });
      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, class_name: className, roll, dob, email, phone, image: finalImage })
      });
      const result = await response.json();
      setRegistrationStatus({ type: result.status === 'success' ? 'success' : 'error', msg: result.message });
      if (result.status === 'success') {
        setStudentForm({ name: '', className: '', roll: '', dob: '', email: '', phone: '' });
        setUploadedImage('');
        fetchStudents();
      }
    } catch (error) {
      setRegistrationStatus({ type: 'error', msg: 'Connection failed.' });
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm("Are you sure you want to delete this student profile?")) return;
    try {
      const response = await fetch(`http://localhost:5000/api/students/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.status === 'success') fetchStudents();
    } catch (err) {
      console.error("Could not transmit deletion payload:", err);
    }
  };

  const getTodayString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const presentToday = attendanceData.filter(d => d.Date === getTodayString()).length;
  
  const processChartData = () => {
    const counts = {};
    attendanceData.forEach(record => { counts[record.Date] = (counts[record.Date] || 0) + 1; });
    return Object.keys(counts).map(date => ({ date: date, Students: counts[date] })).reverse(); 
  };

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
         <nav className="navigation-bar" style={{justifyContent: 'center'}}>
            <button className={view === 'scanner' ? 'active' : ''} onClick={() => setView('scanner')}>📷 Live Web Scanner</button>
            <button className={view === 'login' ? 'active' : ''} onClick={() => setView('login')}>🔒 Admin Login</button>
         </nav>
         {view === 'scanner' ? (
           <div className="registration-container" style={{maxWidth: '700px', textAlign: 'center'}}>
             <header><h1>Live Attendance Scanner</h1></header>
             <div className="camera-viewbox" style={{height: '450px'}}><video ref={videoRef} autoPlay playsInline muted /></div>
             <div style={{ marginTop: '20px', padding: '15px', borderRadius: '10px', fontWeight: 'bold' }}>{scanResult}</div>
           </div>
         ) : (
           <div className="login-wrapper">
             <div className="login-container">
               <header><div className="security-icon">🔒</div><h1>Admin Portal</h1><p>Enter credentials to access the dashboard</p></header>
               <form onSubmit={handleLogin} className="login-form">
                 <div className="input-group">
                   <label>Username</label>
                   <input type="text" value={loginForm.username} onChange={(e) => setLoginForm({...loginForm, username: e.target.value})} placeholder="admin" />
                 </div>
                 <div className="input-group">
                    <label>Password</label>
                    <div className="password-input-wrapper">
                      <input type={showPassword ? "text" : "password"} value={loginForm.password} onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} placeholder="••••••••" />
                      <button type="button" className="toggle-password-btn" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "🙈" : "👁️"}</button>
                    </div>
                  </div>
                 <button type="submit" className="btn-login">Secure Login</button>
                 {loginError && <div className="status-banner error">{loginError}</div>}
               </form>
             </div>
           </div>
         )}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <nav className="navigation-bar" style={{justifyContent: 'space-between'}}>
        <div style={{display: 'flex', gap: '10px'}}>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>📊 Analytics</button>
          <button className={view === 'manage' ? 'active' : ''} onClick={() => setView('manage')}>👥 Manage Students</button>
          <button className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}>👤 Register Student</button>
        </div>
        <button onClick={handleLogout} style={{color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: '600'}}>Log Out</button>
      </nav>

      {view === 'dashboard' && (
        <div className="analytics-view">
          <header><h1>System Analytics</h1><p>Live database metrics and verification history</p></header>
          <div className="kpi-container">
            <div className="kpi-card"><h3>Total Registered Logs</h3><h2>{attendanceData.length}</h2></div>
            <div className="kpi-card"><h3>Total Enrolled Students</h3><h2>{studentsList.length}</h2></div>
            <div className="kpi-card highlight"><h3>Present Today</h3><h2>{presentToday}</h2></div>
          </div>
          <div className="chart-container">
            <h3>Attendance Trends (By Day)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={processChartData()}>
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}/>
                <Bar dataKey="Students" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <main>
            <h3>Recent Verification Logs</h3>
            <table className="attendance-table">
              <thead><tr><th>Student Name</th><th>Scan Time</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {attendanceData.length === 0 ? (<tr><td colSpan="4">No records found.</td></tr>) : (
                  attendanceData.slice(0, 10).map((record, index) => (
                    <tr key={index}><td><strong>{record.Name}</strong></td><td>{record.Time}</td><td>{record.Date}</td><td><span className="status-badge">Verified ✓</span></td></tr>
                  ))
                )}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {view === 'manage' && (
        <div className="analytics-view">
          <header><h1>Student Master Database</h1></header>
          <main>
            <table className="attendance-table">
              <thead>
                <tr><th>ID</th><th>Student Name</th><th>Class</th><th>Roll Number</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {studentsList.length === 0 ? (<tr><td colSpan="5">No student accounts registered in system memory.</td></tr>) : (
                  studentsList.map((student) => (
                    <tr key={student.id}>
                      <td>#{student.id}</td>
                      <td><strong>{student.name.toUpperCase()}</strong></td>
                      <td>{student.class_name}</td>
                      <td>{student.roll}</td>
                      <td>
                        <button onClick={() => setSelectedStudent(student)} style={{backgroundColor: '#e0e7ff', color: '#4f46e5', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px'}}>
                          View Profile
                        </button>
                        <button onClick={() => handleDeleteStudent(student.id)} style={{backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {view === 'register' && (
        <div className="registration-container" style={{maxWidth: '550px'}}>
          <header><h1>Student Registration Portal</h1></header>
          
          <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
            <button type="button" onClick={() => setRegMode('capture')} style={{flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #cbd5e1', fontWeight: 'bold', backgroundColor: regMode === 'capture' ? '#4f46e5' : '#fff', color: regMode === 'capture' ? '#fff' : '#475569'}}>📷 Live Webcam Snap</button>
            <button type="button" onClick={() => setRegMode('upload')} style={{flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #cbd5e1', fontWeight: 'bold', backgroundColor: regMode === 'upload' ? '#4f46e5' : '#fff', color: regMode === 'upload' ? '#fff' : '#475569'}}>📁 Manual File Upload</button>
          </div>

          <form onSubmit={handleRegisterSubmit} className="register-form">
            {regMode === 'capture' ? (
              <div className="camera-viewbox"><video ref={videoRef} autoPlay playsInline muted /></div>
            ) : (
              <div style={{marginBottom: '20px', padding: '20px', border: '2px dashed #cbd5e1', borderRadius: '12px', textAlign: 'center', backgroundColor: '#f8fafc'}}>
                <input type="file" accept="image/*" onChange={handleFileChange} style={{marginBottom: '10px'}} />
                {uploadedImage && <img src={uploadedImage} alt="Preview" style={{maxWidth: '100%', maxHeight: '150px', borderRadius: '8px', marginTop: '10px', display: 'block', marginLeft: 'auto', marginRight: 'auto'}} />}
              </div>
            )}

            <div className="input-group">
              <label>Full Name</label>
              <input type="text" placeholder="e.g. Ranadhir Das" value={studentForm.name} onChange={(e) => setStudentForm({...studentForm, name: e.target.value})} />
            </div>
            <div style={{display: 'flex', gap: '15px'}}>
              <div className="input-group" style={{flex: 1}}>
                <label>Class / Program</label>
                <input type="text" placeholder="e.g. MCA" value={studentForm.className} onChange={(e) => setStudentForm({...studentForm, className: e.target.value})} />
              </div>
              <div className="input-group" style={{flex: 1}}>
                <label>Roll Number</label>
                <input type="text" placeholder="e.g. 24" value={studentForm.roll} onChange={(e) => setStudentForm({...studentForm, roll: e.target.value})} />
              </div>
            </div>
            <div className="input-group">
              <label>Date of Birth</label>
              <input type="date" value={studentForm.dob} onChange={(e) => setStudentForm({...studentForm, dob: e.target.value})} />
            </div>
            <div className="input-group">
              <label>Email Address</label>
              <input type="email" placeholder="student@university.edu" value={studentForm.email} onChange={(e) => setStudentForm({...studentForm, email: e.target.value})} />
            </div>
            <div className="input-group">
              <label>Phone Number</label>
              <input type="tel" placeholder="e.g. +91 9876543210" value={studentForm.phone} onChange={(e) => setStudentForm({...studentForm, phone: e.target.value})} />
            </div>

            <button type="submit" className="btn-submit">Complete Verification Enrollment</button>
            {registrationStatus.msg && (<div className={`status-banner ${registrationStatus.type}`}>{registrationStatus.msg}</div>)}
          </form>
        </div>
      )}

      {/* DYNAMIC METADATA PROFILE MODAL */}
      {selectedStudent && (
        <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Student Detailed Profile</h2>
              <button className="modal-close-btn" onClick={() => setSelectedStudent(null)}>×</button>
            </div>
            <div className="profile-card-body">
              
              {/* --- IMAGE DISPLAY BLOCK --- */}
              <div className="profile-avatar-placeholder">
                {selectedStudent.image_path ? (
                  <img
                    src={`http://localhost:5000/api/dataset/${selectedStudent.image_path.replace('dataset/', '').replace('dataset\\', '')}`} 
                    alt={selectedStudent.name}
                    className="profile-avatar-img"

                    onError={(e) => {
                      e.target.style.display = 'none'; 
                      e.target.parentNode.innerHTML = '👤';
                    }}
                  />
                ) : (
                  "👤" 
                )}
              </div>
              {/* --------------------------- */}

              <div className="profile-details-grid">
                <div className="profile-field"><span className="field-title">Full Name</span><span className="field-value">{selectedStudent.name.toUpperCase()}</span></div>
                <div className="profile-field"><span className="field-title">Class/Program</span><span className="field-value">{selectedStudent.class_name}</span></div>
                <div className="profile-field"><span className="field-title">Roll Number</span><span className="field-value">{selectedStudent.roll}</span></div>
                <div className="profile-field"><span className="field-title">Date of Birth</span><span className="field-value">{selectedStudent.dob}</span></div>
                <div className="profile-field"><span className="field-title">Email Address</span><span className="field-value">{selectedStudent.email}</span></div>
                <div className="profile-field"><span className="field-title">Phone Number</span><span className="field-value">{selectedStudent.phone}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;