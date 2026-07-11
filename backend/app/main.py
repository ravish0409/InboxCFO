import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import actions, chat, conversations, data, ingest


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Inbox CFO", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(data.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(actions.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# --- Serve the built frontend from the same origin (single-container / Render deploy) ---
# Enabled when FRONTEND_DIST points at a Vite build. Unset in local docker-compose, where
# nginx serves the SPA — so this whole block is skipped and the backend stays API-only.
# Registered AFTER the routers, so every /api/* route above still takes precedence.
_FRONTEND_DIST = os.getenv("FRONTEND_DIST", "").strip()
if _FRONTEND_DIST and Path(_FRONTEND_DIST).is_dir():
    _dist = Path(_FRONTEND_DIST)
    _assets = _dist / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # Serve a real file if it exists (favicon, etc.); otherwise fall back to index.html
        # so the single-page app boots for any path.
        candidate = _dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_dist / "index.html"))
