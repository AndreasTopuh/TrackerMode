# 🎯 TrackerMode — AI-Powered Focus Tracker

> **Stay focused. Stay productive. No more doomscrolling.**

TrackerMode is an AI-powered productivity tool that monitors your focus in real-time using face tracking, cursor monitoring, and keyboard activity — then roasts you (and quizzes you) when you start losing focus.

---

## 📌 Versions

### `v1.0` — Doomscrolling Blocker (Python Script)
The original version. A standalone Python script that uses your webcam to detect when you're looking down at your phone (doomscrolling).

**Features:**
- Real-time face & eye tracking with OpenCV
- Detects head tilt and eye position to identify doomscrolling
- Displays brutal roast messages on screen
- Auto-plays `rickroll.mp4` as punishment 🎵
- Auto-stops video when you return to good posture

**Run:** `python main.py`

---

### `v2.0` — Focus Tracker Web App ✨ *(Current)*
A full web application upgrade. Runs in your browser with a premium dark-mode UI. Monitors multiple signals to measure your focus and keeps you engaged with quizzes.

**Features:**
- 👁️ **Webcam Eye Tracking** — OpenCV analyzes face position, eye contact, and head tilt via WebSocket
- 🖱️ **Cursor Monitoring** — Detects mouse inactivity (idle > 30s triggers warning)
- ⌨️ **Keyboard Tracking** — Monitors keystroke activity
- 📊 **Real-time Focus Score** — Combined score (0-100) from all signals
- ⚡ **Quiz System** — Math, capital cities, and sequence quizzes to snap you back to focus
- 🔔 **Smart Alerts** — Escalating notifications: warning → roast → quiz
- 📈 **Focus Timeline** — Live chart showing your focus score over time
- 🎯 **Pomodoro Timer** — Configurable session duration (15/25/45/60/90 min)
- 🎉 **Session Summary** — Stats at the end of each session

**Tech Stack:**
- **Backend:** Python, FastAPI, OpenCV, WebSocket
- **Frontend:** Vanilla HTML/CSS/JS with premium dark-mode design

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Webcam (optional, for eye tracking)

### Installation

```bash
# Clone the repository
git clone https://github.com/AndreasTopuh/TrackerMode.git
cd TrackerMode

# Install dependencies
pip install -r requirements.txt
```

### Run v1.0 (Doomscrolling Blocker)
```bash
python main.py
```
- Opens webcam window
- Look at screen normally → Green "Good posture!" message
- Look down at phone → Red warning + RICKROLL 🎵
- Press **`q`** to quit

### Run v2.0 (Focus Tracker Web App)
```bash
python server.py
```
Then open **http://localhost:8000** in your browser.

1. Configure your session (duration, task name, tracking options)
2. Click **"Start Focus Session"**
3. Allow webcam access when prompted
4. Stay focused! The app will alert you if you drift off

---

## 📁 Project Structure

```
TrackerMode/
├── main.py              # v1.0 — Doomscrolling blocker script
├── server.py            # v2.0 — FastAPI backend server
├── requirements.txt     # Python dependencies
├── rickroll.mp4         # Rickroll punishment video
├── idea.md              # Original project idea
├── README.md            # This file
└── static/              # v2.0 Frontend files
    ├── index.html       # Main HTML page
    ├── style.css        # Premium dark-mode design
    ├── main.js          # App entry point
    ├── tracker.js       # Cursor & keyboard tracker
    ├── webcam.js        # Webcam + WebSocket manager
    ├── quiz.js          # Quiz system
    ├── session.js       # Session timer & focus logic
    └── dashboard.js     # Timeline chart & activity log
```

---

## 🛠️ Customization

### v1.0
- **Roast messages:** Edit `self.roasts` list in `main.py`
- **Detection sensitivity:** Adjust `face_position_ratio` thresholds
- **Video file:** Change `self.rickroll_path`

### v2.0
- **Focus thresholds:** Edit `warningThreshold` and `quizThreshold` in `session.js`
- **Mouse idle time:** Adjust `mouseIdleThreshold` in `tracker.js` (default: 30s)
- **Quiz types:** Add new generators in `quiz.js`
- **Roast messages:** Edit the `roasts` array in `main.js`

---

## 📋 Requirements

| Package | Version |
|---------|---------|
| opencv-python | ~4.12.0 |
| numpy | ~2.2.6 |
| fastapi | ≥0.115.0 |
| uvicorn | ≥0.34.0 |
| websockets | ≥14.0 |
| Pillow | ≥11.0 |

---

## 👨‍💻 Author

**Andreas Topuh**

---

## 📄 License

Free to use. Stay productive! 💪
