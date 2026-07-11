# Deploying Inbox CFO 🚀

The app ships as two containers wired by Docker Compose:

| Service    | Image base        | Role                                                              |
|------------|-------------------|------------------------------------------------------------------|
| `backend`  | `python:3.11-slim`| FastAPI + uvicorn on `:8787`, SQLite on a persistent volume       |
| `frontend` | `nginx:alpine`    | Serves the built Vite SPA and reverse-proxies `/api` → `backend`  |

The frontend calls the API with **relative `/api` paths**, so there's no backend URL baked
into the bundle — nginx proxies `/api` to the backend at runtime. The proxy target is the
one endpoint you configure (`BACKEND_ORIGIN`), and it defaults to the backend service.

## Quick start

```bash
cp .env.example .env                 # optional — compose-level wiring (ports, endpoints)
cp backend/.env.example backend/.env # optional — app config (LLM key, Gmail); omit to run on seed data

docker compose up --build            # then open http://localhost:8080
```

With no keys, the dashboard, duplicate warnings, renewals, spend chart, and rule-based
savings all work. The chat agent and live extraction need an LLM key in `backend/.env`.

Load the demo dataset on first boot:

```bash
SEED_ON_START=1 docker compose up --build   # seeds only when the DB volume is empty
```

## The two `.env` files

- **`.env`** (root, next to `docker-compose.yml`) — wires the *services*:
  - `FRONTEND_PORT` — host port the app is served on (default `8080`).
  - `BACKEND_ORIGIN` — where nginx proxies `/api` (default `http://backend:8787`).
  - `SEED_ON_START` — `1` to load demo data when the DB volume is empty.
- **`backend/.env`** — the *app's* config (LLM provider + key, Gmail, DB). See
  `backend/.env.example`. Under compose, `DB_PATH` is forced to `/data/data.db` (a volume),
  so ingested data survives rebuilds.

## Common operations

```bash
docker compose logs -f backend        # tail backend logs
docker compose down                   # stop (keeps the DB volume)
docker compose down -v                # stop and DELETE the DB volume
```

## Split / cloud deploy (frontend and backend on different hosts)

Point the frontend at a remote API by overriding the proxy target:

```bash
# in root .env
BACKEND_ORIGIN=https://api.your-domain.com
```

Or deploy the images independently:

- **Backend** — `docker build -t inboxcfo-api ./backend`, run with `-e LLM_PROVIDER=... -e LLM_API_KEY=...`
  and a mounted volume at `/data`. Exposes `:8787`; health at `/api/health`.
- **Frontend** — `docker build -t inboxcfo-web ./frontend`, run with `-e BACKEND_ORIGIN=https://api.your-domain.com`.
  Exposes `:80`.

## Notes & gotchas

- **Secrets never enter images** — `.env`, `credentials.json`, `token.json`, `data.db` are
  in `.dockerignore`. Pass secrets at runtime via `backend/.env` or `-e` flags.
- **Gmail OAuth** relies on a desktop browser consent flow, so it can't complete headlessly
  in a container. For a server deploy, either mount a pre-authorized `backend/token.json`
  (read-only) or rely on file upload / seed data. LLM + dashboard are unaffected.
- **SSE streaming** (chat, sync, upload) works through nginx — proxy buffering is disabled
  and read timeouts are raised so token streams aren't cut off.
- **SQLite** is fine for this single-instance app. Don't scale `backend` to >1 replica
  against the same volume. For multi-instance, set `DATABASE_URL` to a real database.
