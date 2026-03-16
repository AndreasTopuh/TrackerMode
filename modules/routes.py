"""
TrackerMode v2.6 — API Routes
All FastAPI route handlers (WebSocket + REST endpoints).
Includes Pydantic validation, rate limiting, and session persistence.
v2.6: Added distraction mode (general/strict) + allowed apps endpoint.
"""

import json
import time
from collections import defaultdict
from typing import List, Optional

import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, HTTPException
from pydantic import BaseModel, Field

from .utils import decode_frame


# ============================================================
#  Pydantic models for request validation
# ============================================================

class DistractionRequest(BaseModel):
    keywords: List[str] = Field(default_factory=list)
    mode: str = "general"  # 'general' or 'strict'


class SessionAnalysisRequest(BaseModel):
    taskName: str = "Unknown"
    duration: int = 0
    durationFormatted: str = "00:00"
    avgFocus: Optional[float] = 0
    notifications: int = 0
    quizzes: int = 0
    focusSample: List[float] = Field(default_factory=list)
    windowTimeData: List[dict] = Field(default_factory=list)
    cyclesCompleted: int = 1
    focusHistory: List[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class SessionSaveRequest(BaseModel):
    taskName: str = "Focus Session"
    duration: int = 0
    durationFormatted: str = "00:00"
    avgFocus: Optional[float] = 0
    notifications: int = 0
    quizzes: int = 0
    cyclesCompleted: int = 1
    focusHistory: List[dict] = Field(default_factory=list)
    windowTimeData: List[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


# ============================================================
#  Simple rate limiter
# ============================================================

class RateLimiter:
    """In-memory sliding-window rate limiter."""

    def __init__(self, max_calls: int = 5, period: int = 60):
        self.max_calls = max_calls
        self.period = period
        self.calls = defaultdict(list)

    def is_allowed(self, key: str = "global") -> bool:
        now = time.time()
        self.calls[key] = [t for t in self.calls[key] if now - t < self.period]
        if len(self.calls[key]) >= self.max_calls:
            return False
        self.calls[key].append(now)
        return True


ai_limiter = RateLimiter(max_calls=5, period=60)


router = APIRouter()

# These will be set by server.py after instantiation
analyzer = None
input_tracker = None
database = None


def init(attention_analyzer, global_input_tracker, session_database=None):
    """Wire up module-level references to global instances."""
    global analyzer, input_tracker, database
    analyzer = attention_analyzer
    input_tracker = global_input_tracker
    database = session_database


# ============================================================
#  WebSocket — real-time attention tracking
# ============================================================

@router.websocket("/ws/attention")
async def attention_websocket(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")
    analyzer.reset_session()
    input_tracker.window_time.reset()

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "frame":
                now = time.time()
                if now - analyzer.last_process_time < 0.5:
                    await websocket.send_json({"type": "skip"})
                    continue
                analyzer.last_process_time = now

                frame = decode_frame(msg["data"])
                if frame is not None:
                    h, w = frame.shape[:2]
                    if w > 640:
                        scale = 640 / w
                        frame = cv2.resize(frame, (640, int(h * scale)))

                    result = analyzer.analyze_frame(frame)
                    result["smoothed_score"] = analyzer.get_smoothed_score()
                    await websocket.send_json(result)

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


# ============================================================
#  REST endpoints
# ============================================================

@router.post("/api/analyze")
async def analyze_session(body: SessionAnalysisRequest):
    """AI-powered session analysis endpoint (rate-limited)."""
    if not ai_limiter.is_allowed("ai_analyze"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per minute.")
    from .ai_analyzer import analyze_session_with_ai
    session_data = body.model_dump()
    analysis = await analyze_session_with_ai(session_data)
    return {"analysis": analysis}


@router.get("/api/stats")
async def get_stats():
    return analyzer.get_stats()


@router.get("/api/input-status")
async def get_input_status():
    """Global mouse/keyboard + active window from pynput/pygetwindow."""
    return input_tracker.get_status()


@router.post("/api/distractions")
async def set_custom_distractions(body: DistractionRequest):
    """Let user set distraction mode and app keywords."""
    input_tracker.set_mode(body.mode)
    if body.mode == 'strict':
        # In strict mode, keywords are allowed apps
        input_tracker.set_allowed_apps(body.keywords)
        # Clear distraction list since not used in strict mode
        input_tracker.custom_distractions = []
        return {
            "status": "ok",
            "mode": "strict",
            "allowed_apps": len(input_tracker.allowed_apps)
        }
    else:
        # General mode: keywords are distractions
        input_tracker.custom_distractions = []
        input_tracker.add_custom_distractions(body.keywords)
        input_tracker.allowed_apps = []
        return {
            "status": "ok",
            "mode": "general",
            "total": len(input_tracker.distraction_keywords) + len(input_tracker.custom_distractions)
        }


@router.get("/api/window-time")
async def get_window_time():
    """Return time spent per app/window during the current session."""
    return input_tracker.window_time.get_summary()


# ============================================================
#  Session persistence endpoints
# ============================================================

@router.post("/api/sessions")
async def save_session(body: SessionSaveRequest):
    """Save a completed session to SQLite."""
    if database is None:
        raise HTTPException(status_code=503, detail="Session storage unavailable.")
    session_id = database.save_session(body.model_dump())
    return {"status": "ok", "id": session_id}


@router.get("/api/sessions")
async def list_sessions(limit: int = 50):
    """List saved sessions."""
    if database is None:
        return []
    return database.get_sessions(limit=min(limit, 200))


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: int):
    """Get a single session by ID."""
    if database is None:
        raise HTTPException(status_code=503, detail="Session storage unavailable.")
    result = database.get_session(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return result


@router.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "TrackerMode v2.6",
        "mediapipe": analyzer.use_mediapipe,
        "globalInput": input_tracker.available
    }
