"""
TrackerMode v2.6 — Focus Tracker Backend Server
FastAPI + WebSocket + MediaPipe FaceLandmarker (Tasks API) + OpenAI Analysis
Desktop-ready: PyInstaller compatible with auto-open browser.

Modular architecture: all feature logic lives in the `modules/` package.
"""

import os
import sys
import atexit
import webbrowser
import multiprocessing
from threading import Timer
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

# ============================================================
#  Logging
# ============================================================

from modules.utils import setup_logging
log = setup_logging("trackermode")

# ============================================================
#  Initialize modular components
# ============================================================

from modules.attention import AttentionAnalyzer
from modules.input_tracker import GlobalInputTracker
from modules.database import SessionDatabase
from modules import routes

analyzer = AttentionAnalyzer()
input_tracker = GlobalInputTracker()
input_tracker.start()

# Session persistence
try:
    session_db = SessionDatabase()
    log.info("SQLite session database initialized")
except Exception as e:
    log.warning(f"Session database init failed: {e}")
    session_db = None

# Wire instances into the routes module
routes.init(analyzer, input_tracker, session_db)


# ============================================================
#  Graceful shutdown
# ============================================================

def _cleanup():
    """Stop background threads on shutdown."""
    log.info("Shutting down — stopping input listeners...")
    input_tracker.stop()

atexit.register(_cleanup)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler — startup/shutdown."""
    log.info("TrackerMode v2.6 server starting")
    yield
    _cleanup()


# ============================================================
#  App creation
# ============================================================

app = FastAPI(title="TrackerMode v2.6 — Focus Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)

# ============================================================
#  Serve frontend
# ============================================================

from modules.utils import resource_path

static_dir = resource_path("static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(static_dir, "index.html"))


# ============================================================
#  Entry point
# ============================================================

if __name__ == "__main__":
    import uvicorn

    # Required for PyInstaller to avoid looping
    multiprocessing.freeze_support()

    HOST = "127.0.0.1"
    PORT = 8000

    log.info("=" * 50)
    log.info(" TrackerMode v2.6 — Focus Tracker Server")
    log.info(f" Frozen (exe): {getattr(sys, 'frozen', False)}")
    log.info(f" http://{HOST}:{PORT}")
    log.info("=" * 50)

    # Auto-open browser
    def open_browser():
        webbrowser.open_new(f"http://{HOST}:{PORT}")

    Timer(1.5, open_browser).start()

    # Run server
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
