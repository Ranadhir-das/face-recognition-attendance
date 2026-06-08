import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

function App() {
  const [view, setView] = useState('scanner'); 
  const [attendanceData, setAttendanceData] = useState([]);
  const [studentName, setStudentName] = useState('');
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

  useEffect(() => {
    fetchAttendance();
    const interval = setInterval(fetchAttendance, 3000);
    return () => clearInterval(interval);
  }, []);

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
    if (view === 'register') {
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
  }, [view]);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!studentName.trim() || !videoRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg');

      setRegistrationStatus({ type: 'info', msg: 'Uploading...' });

      const response = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: studentName, image: base64Image })
      });
      const result = await response.json();
      
      setRegistrationStatus({ type: result.status === 'success' ? 'success' : 'error', msg: result.message });
      if (result.status === 'success') setStudentName('');
    } catch (error) {
      setRegistrationStatus({ type: 'error', msg: 'Connection failed.' });
    }
  };

  const getTodayString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const uniqueStudents = new Set(attendanceData.map(d => d.Name)).size;
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
               <header>
                 <div className="security-icon">🔒</div>
                 <h1>Admin Portal</h1>
                 <p>Enter credentials to access the dashboard</p>
               </header>
               <form onSubmit={handleLogin} className="login-form">
                 <div className="input-group">
                   <label>Username</label>
                   <input type="text" color='black' value={loginForm.username} onChange={(e) => setLoginForm({...loginForm, username: e.target.value})} placeholder="admin" />
                 </div>
                 <div className="input-group">
                    <label>Password</label>
                    <div className="password-input-wrapper">
                      <input type={showPassword ? "text" : "password"} value={loginForm.password} onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} placeholder="••••••••" />
                      <button type="button" className="toggle-password-btn" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? "🙉" : "🙈"}
                      </button>
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
          <button className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}>👤 Register Student</button>
        </div>
        <button onClick={handleLogout} style={{color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: '600'}}>Log Out</button>
      </nav>

      {view === 'dashboard' && (
        <div className="analytics-view">
          <header><h1>System Analytics</h1><p>Live database metrics and verification history</p></header>
          <div className="kpi-container">
            <div className="kpi-card"><h3>Total Registered Logs</h3><h2>{attendanceData.length}</h2></div>
            <div className="kpi-card"><h3>Unique Students Tracked</h3><h2>{uniqueStudents}</h2></div>
            <div className="kpi-card highlight"><h3>Present Today</h3><h2>{presentToday}</h2></div>
          </div>
          <div className="chart-container">
            <h3>Attendance Trends (By Day)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={processChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <tr key={index}>
                      <td><strong>{record.Name}</strong></td><td>{record.Time}</td><td>{record.Date}</td>
                      <td><span className="status-badge">Verified ✓</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </main>
        </div>
      )}

      {view === 'register' && (
        <div className="registration-container">
          <header><h1>Student Profile Registration</h1><p>Enroll identities directly into the local dataset</p></header>
          <form onSubmit={handleRegisterSubmit} className="register-form">
            <div className="camera-viewbox"><video ref={videoRef} autoPlay playsInline muted /></div>
            <div className="input-group">
              <label>Full Name:</label>
              <input type="text" placeholder="Enter student name" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </div>
            <button type="submit" className="btn-submit">Capture & Register Profile</button>
            {registrationStatus.msg && (<div className={`status-banner ${registrationStatus.type}`}>{registrationStatus.msg}</div>)}
          </form>
        </div>
      )}
    </div>
  );
}

export default App;