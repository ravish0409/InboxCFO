#!/usr/bin/env sh
set -e

# Optionally load demo data on first boot. seed.py WIPES the DB, so we only run it
# when explicitly asked (SEED_ON_START=1) and the DB file doesn't exist yet — this
# keeps restarts from clobbering data users ingested at runtime.
if [ "${SEED_ON_START:-0}" = "1" ] && [ ! -f "${DB_PATH:-/data/data.db}" ]; then
  echo "[entrypoint] SEED_ON_START=1 and no DB found -> seeding demo data"
  python seed.py
fi

# Bind to all interfaces so the container is reachable; port is configurable.
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8787}"
