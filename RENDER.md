# Deploying Inbox CFO on Render

**One** Docker web service. The FastAPI backend serves both the API and the built React
app on the same origin — so there's no `/api` proxy, no second service, and no 502s from
cross-service wiring. This is the recommended way to host it.

> The combined image is built by the `Dockerfile` at the **repo root** (a multi-stage build:
> Node compiles the frontend, then it's baked into the Python image and served by FastAPI).

---

## Fix an existing (broken) service

If you already have a service (e.g. `inboxcfo-frontend`) that 502s on `/api/*`, it's the
old frontend-only container with no backend. Point it at the combined image instead:

Open the service → **Settings**:
- **Dockerfile Path**: `./Dockerfile`   ← the root one, not `./frontend/Dockerfile`
- **Docker Build Context Directory**: `.`
- **Health Check Path**: `/api/health`
- Remove any `BACKEND_ORIGIN` env var (no longer used).
- (Optional, for persistent data) add a **Disk**: mount path `/data`, 1 GB — requires a paid plan.
- Add env vars: `DB_PATH=/data/data.db`, `SEED_ON_START=1` (see LLM vars below).

Then **Manual Deploy → Clear build cache & deploy**. When it's Live, the same URL serves the
app *and* the API. (You can delete any leftover separate backend service.)

---

## Fresh deploy — Blueprint (easiest)

1. Commit `render.yaml` and `Dockerfile` (both at the repo root) and push.
2. Render dashboard → **New +** → **Blueprint** → select this repo → **Apply**.
   It creates one web service named `inboxcfo` with a persistent disk.
3. (Optional) enable chat: open the service → **Environment** → set `LLM_PROVIDER=gemini`
   and paste your key into `LLM_API_KEY` (get one at https://aistudio.google.com/apikey).
4. Wait for **Live**, then open the service URL. First boot seeds demo data.

---

## Fresh deploy — manual (no Blueprint)

**New +** → **Web Service** → connect this repo, then:

| Field | Value |
|---|---|
| Language / Runtime | **Docker** |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context Directory | `.` |
| Instance Type | **Starter** (needed for the disk) or **Free** (see below) |
| Health Check Path | `/api/health` |

**Environment Variables:**
```
DB_PATH        = /data/data.db
SEED_ON_START  = 1
LLM_PROVIDER   = off          # or "gemini" to enable chat
LLM_API_KEY    = <your key>   # only if LLM_PROVIDER != off; mark as secret
```
Do **not** set `PORT` — Render injects it and the app binds to it automatically.

**Disks → Add Disk** (for persistent data): name `data`, mount path `/data`, size `1 GB`.

Create the service and open its URL when Live.

---

## Free-tier option (no persistent data)

Free web services can't have a disk, so SQLite lives on ephemeral storage and **resets on
every deploy/restart** (free services also sleep after ~15 min idle). Fine for a demo:

- Instance Type **Free**, **no disk**, set `DB_PATH=/tmp/data.db`, keep `SEED_ON_START=1`
  so demo data reloads on each cold start.
- Via the Blueprint: edit `render.yaml` → change `plan: starter` to `plan: free`, delete the
  `disk:` block, and set `DB_PATH` to `/tmp/data.db`.

---

## Verify

```bash
curl https://<your-service>.onrender.com/api/health     # {"ok":true}
curl https://<your-service>.onrender.com/api/stats      # dashboard JSON
```
Then open the URL — dashboard, duplicate warnings, renewals, and the spend chart render.
With an LLM key set, the chat agent answers too.

---

## Gotchas

- **Secrets** never enter the image — `.env`, `credentials.json`, `token.json`, `*.db` are
  gitignored and in `.dockerignore`. Set `LLM_API_KEY` in the dashboard (`sync: false`).
- **Gmail sync won't work on Render** — it needs an interactive desktop OAuth consent flow
  that can't complete headlessly. Chat, file upload, dashboard, and seed data are unaffected.
- **Cold starts**: free services sleep when idle; the first request after a sleep takes
  ~30–60s. Starter plans stay warm.
- **SQLite = single instance.** Don't scale past 1 instance against one disk.

---

## Local dev is unchanged

`docker compose up --build` still runs the two-container setup (nginx + backend) for local
development — see [DEPLOY.md](DEPLOY.md). The single-container `Dockerfile` is specifically
for a one-service host like Render; you can also run it directly:

```bash
docker build -t inboxcfo .
docker run -p 8787:8787 -e SEED_ON_START=1 inboxcfo   # http://localhost:8787
```
