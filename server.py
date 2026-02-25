"""
TrackerMode v2.5 — Focus Tracker Backend Server
FastAPI + WebSocket + MediaPipe FaceLandmarker (Tasks API) + OpenAI Analysis
Desktop-ready: PyInstaller compatible with auto-open browser.

Modular architecture: all feature logic lives in the `modules/` package.
"""

import os
import sys
import webbrowser
import multiprocessing
from threading import Timer

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

# ============================================================
#  App creation
# ============================================================

app = FastAPI(title="TrackerMode v2.5 — Focus Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
#  Initialize modular components
# ============================================================

from modules.attention import AttentionAnalyzer
from modules.input_tracker import GlobalInputTracker
from modules import routes

analyzer = AttentionAnalyzer()
input_tracker = GlobalInputTracker()
input_tracker.start()

# Wire instances into the routes module
routes.init(analyzer, input_tracker)
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

    print("=" * 50)
    print(" TrackerMode v2.5 — Focus Tracker Server")
    print(f" Frozen (exe): {getattr(sys, 'frozen', False)}")
    print(f" http://{HOST}:{PORT}")
    print("=" * 50)

    # Auto-open browser
    def open_browser():
        webbrowser.open_new(f"http://{HOST}:{PORT}")

    Timer(1.5, open_browser).start()

    # Run server
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
