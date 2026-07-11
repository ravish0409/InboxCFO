# --- Inbox CFO backend (FastAPI + uvicorn) --------------------------------------------
FROM python:3.11-slim

# Keep Python lean and predictable in containers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8787 \
    DB_PATH=/data/data.db

WORKDIR /app

# System deps: PyMuPDF ships wheels, so no build toolchain needed. curl is for HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching.
COPY requirements.txt ./
RUN pip install -r requirements.txt

# App code (see .dockerignore for what's excluded — .env, .venv, data.db, secrets).
COPY . .

# Persist the SQLite DB outside the image layer.
RUN mkdir -p /data
VOLUME ["/data"]

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
