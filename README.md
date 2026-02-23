# 🎯 TrackerMode v2.5

> **AI-powered focus tracking** with real-time eye tracking, active window monitoring, and AI session analysis.

TrackerMode monitors your focus during study or work sessions using your webcam (MediaPipe FaceLandmarker), keyboard/mouse activity, and active window detection. When your focus drops or you open a distraction app, it alerts you with visual warnings and audio alarms.

---

## 🔒 Privacy & Trust

TrackerMode is a **self-discipline tool**, not a surveillance app. You choose to use it.

| What we access                | Why                                   | Stored?        |
| ----------------------------- | ------------------------------------- | -------------- |
| **Webcam**              | Eye tracking (gaze, blink, head pose) | ❌ Never saved |
| **Keyboard/Mouse**      | Detect inactivity                     | ❌ Never saved |
| **Active Window Title** | Detect distraction apps               | ❌ Never saved |

**What we DON'T do:**

- ❌ **No screenshots** — we never capture your screen
- ❌ **No screen recording** — we only read the window title (plain text)
- ❌ **No data sent externally** — all processing is local on your machine
- ❌ **No browsing history** — we don't track URLs or web content
- ❌ **No keystroke logging** — we only detect *if* you're typing, not *what*

> The AI Analysis feature (optional) sends only session statistics (duration, focus score, alert count) to OpenAI — never webcam data, window titles, or personal content.

---

## ✨ Features

### 🧠 Focus Detection

- **Eye Tracking** — MediaPipe 478-landmark face detection with iris tracking
- **Gaze Direction** — Detects center/left/right gaze from iris position
- **Head Pose** — Estimates forward/down/up/left/right head orientation
- **Blink Rate** — Real-time blink detection via Eye Aspect Ratio (EAR)
- **Drowsiness Detection** — Detects drowsy (3s+), microsleep (15s+), and deep sleep (60s+) states
- **Smart Scoring** — Combined attention score (0–100) from eyes, gaze, head pose, face position, and blink rate

### 🖥️ Active App Monitor

- **Window Title Detection** — Reads the active window title via `pygetwindow`
- **Distraction Detection** — Flags known distraction apps (WhatsApp, Instagram, TikTok, Steam, etc.)
- **Custom Distractions** — User can add their own app keywords to block
- **Confirmation Prompt** — "Is this for studying?" instead of assuming. Whitelists per session
- **No Screen Capture** — Only reads window title text, never captures screen content

### 📊 Live Dashboard

- **Focus Score Ring** — Large circular gauge with color-coded score
- **Focus Timeline** — Real-time chart showing score over time
- **Activity Log** — Timestamped events with color-coded status
- **Floating Metrics Bar** — Compact gauges for gaze, eyes, head, mouse, keyboard
- **Pop-out Metrics (PiP)** — Separate small window visible across all tabs

### 🔔 Alerts & Alarms

- **Visual Alerts** — PiP-style alert bar for focus warnings
- **Toast Notifications** — Pop-up messages for events
- **Browser Push Notifications** — Visible even when minimized
- **Audio Alarm** — Loops alarm sound when focus drops severely (3+ consecutive alerts)
- **"I'm Back" Overlay** — Fullscreen dismiss button to acknowledge and resume
- **Drowsiness Tolerance** — Allows 3 episodes before first warning (human-friendly)
- **Smart Alert Cooldown** — 30s between alerts with escalating severity
- **Video Mode** — Pauses activity tracking when watching a video

### 🤖 AI Coach (Optional)

- **Post-Session Analysis** — Click "Analisis dengan AI" to get AI feedback
- **Powered by GPT-4o-mini** — Casual & supportive tone
- **API Credit Friendly** — Only triggered on button click, not automatic

### 📱 Activity Monitoring

- **Mouse Tracking** — Detects mouse movement and idle time (30s threshold)
- **Keyboard Tracking** — Monitors keypress activity (60s threshold)
- **Quiz System** — Random focus check quizzes on severe distraction
- **Pomodoro Timer** — Automatic cycles with break duration mapped to session length
- **Webcam Fallback** — Auto keyboard/mouse-only mode if webcam disconnects

---

## 📁 Project Structure

```
TrackerMode/
├── server.py              # FastAPI backend + MediaPipe + WebSocket + pygetwindow
├── main.py                # Standalone Python tracker (v1.0, Haar Cascades + dlib)
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
    │   └── style.css       # All styles
    │
    ├── js/
    │   ├── main.js         # App entry point & orchestration
    │   ├── session.js      # Session timer & focus scoring
    │   ├── tracker.js      # Mouse/keyboard activity tracker
    │   ├── webcam.js       # Webcam + WebSocket to MediaPipe
    │   ├── dashboard.js    # Focus timeline chart & activity log
    │   ├── quiz.js         # Focus check quiz system
    │   ├── pip.js          # Pop-out metrics window manager
    │   └── screencapture.js # Screen capture utilities
    │
    ├── icon/               # SVG/PNG icons for UI elements
    │   ├── logo.svg        # App logo
    │   ├── logo.png        # App logo (raster)
    │   ├── eye.svg         # Eye tracking icon
    │   ├── keyboard.svg    # Keyboard activity icon
    │   ├── mouse.svg       # Mouse activity icon
    │   ├── screen.svg      # Screen monitor icon
    │   ├── alert.svg       # Alert notification icon
    │   ├── warning.svg     # Warning icon
    │   ├── check.svg       # Success/check icon
    │   ├── play.svg        # Play button icon
    │   ├── pause.svg       # Pause button icon
    │   └── bar_avg.svg     # Average bar icon
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

| Component        | Technology                           |
| ---------------- | ------------------------------------ |
| Backend          | FastAPI + Uvicorn                    |
| Face Detection   | MediaPipe FaceLandmarker (Tasks API) |
| Fallback         | Haar Cascades (OpenCV)               |
| Window Monitor   | pygetwindow (OS-level window title)  |
| Input Tracking   | pynput (system-wide mouse/keyboard)  |
| AI Analysis      | OpenAI GPT-4o-mini                   |
| Frontend         | Vanilla HTML/CSS/JS                  |
| Communication    | WebSocket (real-time frames)         |
| PiP Window       | window.open() popup                  |
| Audio            | HTML5 Audio API                      |
| Image Processing | Pillow + NumPy                       |

---

## 🔌 API Endpoints

| Method    | Endpoint              | Description                           |
| --------- | --------------------- | ------------------------------------- |
| WebSocket | `/ws/attention`     | Real-time webcam frame analysis       |
| POST      | `/api/analyze`      | AI-powered session analysis           |
| GET       | `/api/stats`        | Get attention score statistics        |
| GET       | `/api/input-status` | Mouse/keyboard + active window status |
| POST      | `/api/distractions` | Add custom distraction keywords       |
| GET       | `/api/health`       | Health check + service status         |

---

## 📝 Changelog

### v2.4

- 🖥️ **Active App Monitor** — replaced Screen Capture with `pygetwindow` window title detection
  - Detects distraction apps (WhatsApp, Instagram, TikTok, Steam, etc.)
  - User-customizable distraction list via setup screen input
  - Confirmation prompt: "Is this for studying?" with per-session whitelisting
  - No screenshots, no screen recording — privacy-first approach
- 😴 **Drowsiness Detection** — eye-closed duration tracking with human-friendly tolerance
  - 3s+ = drowsy, 15s+ = microsleep, 60s+ = deep sleep alarm
  - 3-episode tolerance before first warning, 60s cooldown between alerts
- 📺 **Video Mode** — detects video watching (screen focus + no input) and asks for confirmation
- 🔔 **Smart Alarm** — every alarm now sends visual notification + push notification alongside sound

### v2.3

- ⏰ **Pomodoro System** — automatic cycles with break duration mapped to session length
- 🔔 Browser push notifications (visible even when minimized)
- ⏱️ Smart alert cooldown (30s between alerts, escalating severity)
- 📷 Webcam fallback — auto keyboard/mouse-only mode if webcam disconnects

### v2.2

- 📁 Reorganized folder structure (`css/`, `js/`, `audio/`)
- 🔊 Fixed audio alarm (MP3 format, correct paths)
- 🧠 Fixed metrics logic — gauges properly drop when no face detected

### v2.1

- Added floating metrics bar with gauges
- MediaPipe FaceLandmarker with VIDEO mode
- PiP alert bar for focus warnings
- AI analysis button (saves API credits)

### v2.0

- Full web-based tracker with dashboard
- Focus timeline chart, quiz system

### v1.0

- Standalone Python tracker (main.py)
- Basic Haar Cascade face/eye detection

---

## 📜 License

AndreasJeno — Built for learning and productivity.
