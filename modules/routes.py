"""
TrackerMode v2.5 — API Routes
All FastAPI route handlers (WebSocket + REST endpoints).
"""

import json
import time

import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

from .utils import decode_frame


router = APIRouter()

# These will be set by server.py after instantiation
analyzer = None
input_tracker = None


def init(attention_analyzer, global_input_tracker):
    """Wire up module-level references to global instances."""
    global analyzer, input_tracker
    analyzer = attention_analyzer
    input_tracker = global_input_tracker


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
async def analyze_session(request: Request):
    """AI-powered session analysis endpoint."""
    from .ai_analyzer import analyze_session_with_ai
    session_data = await request.json()
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
async def set_custom_distractions(request: Request):
    """Let user add custom distraction keywords."""
    data = await request.json()
    keywords = data.get("keywords", [])
    input_tracker.add_custom_distractions(keywords)
    return {
        "status": "ok",
        "total": len(input_tracker.distraction_keywords) + len(input_tracker.custom_distractions)
    }


@router.get("/api/window-time")
async def get_window_time():
    """Return time spent per app/window during the current session."""
    return input_tracker.window_time.get_summary()


@router.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "TrackerMode v2.5",
        "mediapipe": analyzer.use_mediapipe,
        "globalInput": input_tracker.available
    }
