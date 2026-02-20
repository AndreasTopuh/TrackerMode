# 🎯 TrackerMode v2.2

> **AI-powered focus tracking** with real-time eye tracking, screen monitoring, and AI session analysis.

TrackerMode monitors your focus during study or work sessions using your webcam (MediaPipe FaceLandmarker), keyboard/mouse activity, and screen sharing. When your focus drops, it alerts you with visual warnings and audio alarms.

---

## ✨ Features

### 🧠 Focus Detection
- **Eye Tracking** — MediaPipe 478-landmark face detection with iris tracking
- **Gaze Direction** — Detects center/left/right gaze from iris position
- **Head Pose** — Estimates forward/down/left/right head orientation
- **Blink Rate** — Real-time blink detection via Eye Aspect Ratio (EAR)
- **Smart Scoring** — Combined attention score (0–100) from all inputs

### 📊 Live Dashboard
- **Focus Score Ring** — Large circular gauge with color-coded score
- **Focus Timeline** — Real-time chart showing score over time
- **Activity Log** — Timestamped events with color-coded status
- **Floating Metrics Bar** — Compact gauges for gaze, eyes, head, mouse, keyboard
- **Pop-out Metrics (PiP)** — Separate small window visible across all tabs

### 🔔 Alerts & Alarms
- **Visual Alerts** — PiP-style alert bar for focus warnings
- **Toast Notifications** — Pop-up messages for events
- **Audio Alarm** — Loops alarm sound when focus drops severely (3+ consecutive alerts)
- **"I'm Back" Overlay** — Fullscreen dismiss button to acknowledge and resume

### 🖥️ Screen Capture
- **Tab Sharing** — Share your browser tab for monitoring
- **In-Session Toggle** — Start/stop screen sharing during active session
- **Preview Thumbnail** — Live screen preview in dashboard corner

### 🤖 AI Coach (Optional)
- **Post-Session Analysis** — Click "Analisis dengan AI" to get AI feedback
- **Powered by GPT-4o-mini** — In Bahasa Indonesia, casual & supportive tone
- **API Credit Friendly** — Only triggered on button click, not automatic

### 📱 Activity Monitoring
- **Mouse Tracking** — Detects mouse movement and idle time
- **Keyboard Tracking** — Monitors keypress activity
- **Quiz System** — Random focus check quizzes on severe distraction

---

## 📁 Project Structure

```
TrackerMode/
├── server.py              # FastAPI backend + MediaPipe + WebSocket
├── main.py                # Original standalone tracker (legacy)
├── requirements.txt       # Python dependencies
├── .env                   # OpenAI API key
├── face_landmarker.task   # MediaPipe model (auto-downloaded)
│
└── static/
    ├── index.html          # Main app UI
    ├── pip.html            # Pop-out metrics window
    ├── favicon.svg         # App icon
    │
    ├── css/
    │   └── style.css       # All styles (1600+ lines)
    │
    ├── js/
    │   ├── main.js         # App entry point & orchestration
    │   ├── session.js      # Session timer & focus scoring
    │   ├── tracker.js      # Mouse/keyboard activity tracker
    │   ├── webcam.js       # Webcam + WebSocket to MediaPipe
    │   ├── screencapture.js # Screen sharing via getDisplayMedia
    │   ├── dashboard.js    # Focus timeline chart & activity log
    │   ├── quiz.js         # Focus check quiz system
    │   └── pip.js          # Pop-out metrics window manager
    │
    └── audio/
        └── mixkit-urgent-simple-tone-loop-2976.mp3  # Alarm sound
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment
```bash
# Create .env file
echo OPENAI_API_KEY=your-api-key-here > .env
```
> AI analysis is optional. The app works without an API key.

### 3. Run
```bash
python server.py
```
Open **http://localhost:8000** in Chrome.

---

## 🔧 Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI + Uvicorn |
| Face Detection | MediaPipe FaceLandmarker (Tasks API) |
| Fallback | Haar Cascades (OpenCV) |
| AI Analysis | OpenAI GPT-4o-mini |
| Frontend | Vanilla HTML/CSS/JS |
| Communication | WebSocket (real-time frames) |
| Screen Capture | getDisplayMedia API |
| PiP Window | window.open() popup |
| Audio | HTML5 Audio API |

---

## 📝 Changelog

### v2.2
- 📁 Reorganized folder structure (`css/`, `js/`, `audio/`)
- 🔊 Fixed audio alarm (MP3 format, correct paths)
- 🧠 Fixed metrics logic — gauges properly drop when no face detected
- 🖥️ Added in-session sharescreen toggle button
- 📺 Pop-out metrics window (PiP) via popup

### v2.1
- Added floating metrics bar with gauges
- MediaPipe FaceLandmarker with VIDEO mode
- PiP alert bar for focus warnings
- AI analysis button (saves API credits)
- Alarm system with "I'm Back" overlay

### v2.0
- Full web-based tracker with dashboard
- Focus timeline chart
- Quiz system for focus checks
- Screen capture monitoring

### v1.0
- Standalone Python tracker (main.py)
- Basic Haar Cascade face/eye detection
- Console-based focus scoring

---

## 📜 License

AndreasJeno — Built for learning and productivity.
