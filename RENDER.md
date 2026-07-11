# Deploying Inbox CFO on Render

Two Docker web services, wired the same way as `docker-compose.yml`:

- **`inboxcfo-api`** — FastAPI backend on `:8787`, SQLite on a persistent disk.
- **`inboxcfo-web`** — nginx serving the built React app, proxying `/api` to the backend
  over Render's private network. This preserves SSE streaming (chat/sync/upload), which is
  why we use an nginx web service rather than a static site.

There are two ways to deploy: the **Blueprint** (one click, uses `render.yaml`) or **manual**
(create each service in the dashboard). The Blueprint is recommended.

---

## Prerequisites

1. Push this repo to GitHub/GitLab (Render deploys from a connected repo).
2. A Render account → https://dashboard.render.com
3. A paid instance type (**Starter**, ~$7/mo per service) if you want the SQLite data to
   **persist** — persistent disks aren't available on the free plan. See *Free-tier option* below.

---

## Option A — Blueprint (recommended)

1. Commit `render.yaml` (already at the repo root) and push.
2. Render dashboard → **New +** → **Blueprint** → select this repo → **Apply**.
   Render reads `render.yaml` and creates both services + the disk.
3. Set the secret env var: open **inboxcfo-api** → **Environment** →
   - To enable the chat agent: set `LLM_PROVIDER=gemini` and paste your key into `LLM_API_KEY`
     (get one at https://aistudio.google.com/apikey). Leave `LLM_PROVIDER=off` to skip.
4. Wait for both services to go **Live**. Open the **inboxcfo-web** URL
   (`https://inboxcfo-web.onrender.com`). Done.

The first backend boot seeds demo data (`SEED_ON_START=1`) because the disk starts empty.

---

## Option B — Manual (dashboard, no Blueprint)

### 1. Backend service

**New +** → **Web Service** → connect repo, then:

| Field | Value |
|---|---|
| Language / Runtime | **Docker** |
| Dockerfile Path | `./backend/Dockerfile` |
| Docker Build Context Directory | `./backend` |
| Region | e.g. **Oregon** (remember it) |
| Instance Type | **Starter** (needed for a disk) |
| Health Check Path | `/api/health` |

**Advanced → Environment Variables:**
```
PORT           = 8787
DB_PATH        = /data/data.db
SEED_ON_START  = 1
LLM_PROVIDER   = off          # or "gemini" to enable chat
LLM_API_KEY    = <your key>   # only if LLM_PROVIDER != off; mark as secret
```

**Advanced → Disks → Add Disk:**
```
Name       = data
Mount Path = /data
Size       = 1 GB
```

Create the service. Note its **name** (e.g. `inboxcfo-api`).

### 2. Frontend service

**New +** → **Web Service** → same repo:

| Field | Value |
|---|---|
| Language / Runtime | **Docker** |
| Dockerfile Path | `./frontend/Dockerfile` |
| Docker Build Context Directory | `./frontend` |
| Region | **same region as the backend** (required for private networking) |
| Instance Type | Starter (or Free — the frontend needs no disk) |
| Health Check Path | `/` |

**Environment Variables:**
```
BACKEND_ORIGIN = http://inboxcfo-api:8787
```
Use the backend's exact service name and the port you set (`8787`). Render resolves
`inboxcfo-api` to the backend over the private network. **Don't** set `PORT` here — let
Render inject its own; the nginx config picks it up automatically.

Open the frontend's public URL when it's Live.

---

## Free-tier option (no persistent data)

Free web services can't have a disk, so SQLite lives on ephemeral storage and **resets on
every deploy/restart** (and free services spin down after ~15 min idle). Fine for a demo:

- Backend: Instance Type **Free**, **no disk**, set `DB_PATH=/tmp/data.db` and keep
  `SEED_ON_START=1` so it reseeds demo data on each cold start.
- Frontend: Instance Type **Free**.
- Everything else is identical.

To use the free tier via the Blueprint, edit `render.yaml`: change both `plan: starter` to
`plan: free`, remove the `disk:` block, and set `DB_PATH` to `/tmp/data.db`.

---

## Verifying the deploy

```bash
curl https://inboxcfo-web.onrender.com/api/health      # -> {"ok":true}
curl https://inboxcfo-web.onrender.com/api/stats       # -> dashboard JSON
```
Then open the frontend URL — the dashboard, duplicate warnings, renewals, and spend chart
should render. If you set an LLM key, the chat agent answers questions too.

---

## Gotchas

- **Same region** for both services, or the private hostname `inboxcfo-api` won't resolve.
- **Secrets**: `LLM_API_KEY` is marked `sync: false` in the blueprint — set it in the
  dashboard; never commit it. `.env`, `credentials.json`, `token.json` are gitignored and
  `.dockerignore`d, so they never reach the image.
- **Gmail sync won't work on Render** — it needs an interactive desktop OAuth consent flow
  that can't complete headlessly. The LLM chat, file upload, dashboard, and seed data are
  unaffected. (To support it you'd mount a pre-authorized `token.json`, which is out of
  scope for a hosted demo.)
- **Cold starts**: free services sleep when idle; the first request after a sleep takes
  ~30–60s to wake. Starter plans stay warm.
- **SQLite = single instance.** Don't scale the backend past 1 instance against one disk.
