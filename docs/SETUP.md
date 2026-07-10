# Setup Guide — Inbox CFO

This guide walks you from a fresh clone to a running app, and shows how to obtain each API key.

> **You can run the full demo with no keys.** The dashboard, duplicate warnings, renewals,
> spend chart and rule-based savings all work on seeded data. Keys are only needed for the
> **live chat agent**, **live extraction**, and **Gmail sync** — each fails cleanly when its
> key is absent.

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11+ | `python --version` |
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |

The commands below use **PowerShell** (Windows). On macOS/Linux, swap
`.\.venv\Scripts\python` for `.venv/bin/python` and `copy` for `cp`.

---

## 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python seed.py                 # loads realistic demo data into data.db
.\.venv\Scripts\python -m uvicorn app.main:app --port 8787
```

The API is now at `http://localhost:8787`.

## 3. Frontend

In a **new terminal**:

```powershell
cd frontend
npm install
npm run dev                                     # open the printed localhost URL
```

Open the URL Vite prints (typically `http://localhost:5173`). The dashboard should be
populated from the seeded data.

---

## 4. Enable the AI agent (get an LLM key)

The chat agent and live extraction need one LLM provider. Copy the example env file and set
**one** provider:

```powershell
cd backend
copy .env.example .env    # then edit .env
```

Set `LLM_PROVIDER` to `gemini` or `fireworks` and provide the matching key. **Gemini is
preferred** — it has a generous free tier and uses Google's OpenAI-compatible endpoint.

### Option A — Gemini (recommended)

1. Go to **https://aistudio.google.com/apikey**.
2. Sign in with a Google account.
3. Click **Create API key** → copy the key.
4. In `backend/.env`:

   ```dotenv
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=<paste-your-key-here>
   # GEMINI_MODEL=gemini-3.5-flash   # default; override if you like
   ```

### Option B — Fireworks AI

1. Go to **https://fireworks.ai** and create an account.
2. Open **https://fireworks.ai/account/api-keys**.
3. Click **Create API Key** → copy the key.
4. In `backend/.env`:

   ```dotenv
   LLM_PROVIDER=fireworks
   FIREWORKS_API_KEY=<paste-your-key-here>
   # FIREWORKS_MODEL default: accounts/fireworks/models/llama-v3p3-70b-instruct
   ```

   > The Fireworks model must support function calling for native tool mode.

### Restart & troubleshooting

- **Restart the backend** after editing `.env` (env is read at startup).
- If native function-calling misbehaves with your model, fall back to the ReAct JSON loop:

  ```dotenv
  AGENT_TOOL_MODE=json
  ```

- With `LLM_PROVIDER=off` (the default), chat/extraction endpoints return a clean `503` and
  the rest of the app keeps working on seed data.

---

## 5. Enable Gmail sync (optional — get OAuth credentials)

Gmail sync lets the app read a real inbox. It's optional; file upload (`.eml`/`.pdf`/`.txt`)
and seed data cover the demo without it.

1. Open the **Google Cloud Console** → https://console.cloud.google.com → create a project.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → choose **External**, set to **Testing** mode,
   and add your demo Google account under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   Application type **Desktop app** → **Create** → **Download JSON**.
5. Save that file as **`backend/credentials.json`**.
6. Start the app and click **Sync Inbox** — the first run opens a browser consent window and
   caches `backend/token.json` for future syncs.

> **Tip for demos:** use a seeded demo Gmail account (send it ~30 realistic emails — streaming
> receipts, an insurance renewal, utility bills, bank UPI alerts) rather than a real inbox.

---

## 6. Environment variables reference

All are optional; sensible defaults apply. Full example in `backend/.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `off` | `gemini` \| `fireworks` \| `off` |
| `LLM_API_KEY` | — | Overrides the per-provider key if set |
| `LLM_MODEL` / `LLM_BASE_URL` | — | Optional per-request overrides |
| `GEMINI_API_KEY` | — | Gemini key (from Google AI Studio) |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model |
| `FIREWORKS_API_KEY` | — | Fireworks key |
| `FIREWORKS_MODEL` | `…/llama-v3p3-70b-instruct` | Fireworks model (needs function calling) |
| `AGENT_TOOL_MODE` | `native` | `native` OpenAI-style tools, or `json` ReAct fallback |
| `GMAIL_CREDENTIALS_FILE` | `credentials.json` | OAuth client JSON path (relative to `backend/`) |
| `GMAIL_TOKEN_FILE` | `token.json` | Cached OAuth token path |
| `GMAIL_MAX_MESSAGES` | `40` | Max messages pulled per sync |
| `DB_PATH` | `data.db` | SQLite file (relative to `backend/`, or absolute) |
| `DATABASE_URL` | derived from `DB_PATH` | Full DB URL; overrides `DB_PATH` if set |

> **Never commit secrets.** `backend/.env`, `credentials.json`, `token.json` and `data.db`
> are already git-ignored.

---

## 7. Verify it works

1. Dashboard loads with seeded subscriptions, the **duplicate subscriptions banner**
   (Spotify + YouTube Music) and the **savings panel**.
2. (Keys set) Ask the agent **"When does my car insurance expire?"** → it finds the policy;
   click the 📎 source chip to open the underlying email.
3. Upload `backend/sample_data/disney_hotstar_receipt.eml` → a new subscription appears live.
4. (Gmail configured) Click **Sync Inbox** for the full "it reads my email" flow.
</content>
</invoke>
