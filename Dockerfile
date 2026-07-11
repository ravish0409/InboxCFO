# --- Inbox CFO, single container: FastAPI backend + built React frontend ---------------
# One image serves the API and the SPA on the same origin — ideal for a single Render web
# service (no /api proxy, no cross-service wiring). Build context is the REPO ROOT.
#
#   docker build -t inboxcfo .
#   docker run -p 8787:8787 inboxcfo        # open http://localhost:8787

# --- Stage 1: build the Vite bundle ---------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build      # -> /web/dist

# --- Stage 2: backend image, with the built SPA baked in ------------------------------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8787 \
    DB_PATH=/data/data.db \
    FRONTEND_DIST=/app/static

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# Backend code + the compiled frontend it will serve at FRONTEND_DIST.
COPY backend/ ./
COPY --from=web /web/dist /app/static

# Persist the SQLite DB outside the image layer.
RUN mkdir -p /data
VOLUME ["/data"]

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
