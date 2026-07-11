# 💼 Inbox CFO

**Your inbox, turned into a finance dashboard.** An AI agent that reads your emails and documents,
tracks subscriptions, bills and renewals, warns about duplicate subscriptions, suggests ways to
save money, and answers questions like *"When does my car insurance expire?"* or
*"How much did I spend on Swiggy last month?"* — with every answer traceable back to the source email.

Built solo in 48h. **Stack:** React (Vite + Tailwind + Recharts) · FastAPI · SQLite · Fireworks AI · Gmail API.

## How it works

```
Gmail sync / file upload (.eml, .pdf, .txt)
        │
        ▼
LLM extraction at INGEST time (Fireworks, JSON mode)
        │  one call per email/doc → typed rows
        ▼
SQLite: subscriptions · bills · transactions · documents
        │  every row keeps a source_id → original email
        ▼
┌───────────────┬──────────────────────────────┐
│ Dashboard     │ Chat agent (tool-calling)     │
│ renewals,     │ total_spend, list_subs,       │
│ duplicates,   │ upcoming_renewals, find_dupes,│
│ savings       │ find_documents                │
└───────────────┴──────────────────────────────┘
```

**Key design choice:** the chat agent never sees raw emails. Extraction happens once at ingest;
the agent answers by calling tools over structured tables, so *"how much did I spend"* returns a
real SQL sum — not an LLM guess. Every number in the UI links back to its source email (click `src`).

## Deploy with Docker

```bash
docker compose up --build            # open http://localhost:8080
# demo data on first boot:
SEED_ON_START=1 docker compose up --build
```

Two containers (FastAPI backend + nginx-served frontend) wired by Compose; nginx proxies
`/api` to the backend. Full instructions, env wiring, and split/cloud deploys: **[DEPLOY.md](DEPLOY.md)**.

**Host it on Render** (one-click Blueprint via `render.yaml`): **[RENDER.md](RENDER.md)**.

## Quick start (offline demo, no keys needed)

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python seed.py                 # loads realistic demo data
.\.venv\Scripts\python -m uvicorn app.main:app --port 8787

# Frontend (new terminal)
cd frontend
npm install
npm run dev                                     # open the printed localhost URL
```

The dashboard, duplicate warnings, renewals, spend chart and rule-based savings suggestions all
work **without any API key**. The chat agent and live extraction need a Fireworks key (below).

## Enable the AI agent (Gemini or Fireworks)

```powershell
cd backend
copy .env.example .env    # then edit .env and set ONE provider key
```

The agent works with either provider — **if `GEMINI_API_KEY` is set it is used; otherwise
`FIREWORKS_API_KEY` is used.** Gemini goes through Google's OpenAI-compatible endpoint, so
the same client handles both.

- **Gemini** (preferred): set `GEMINI_API_KEY` (from https://aistudio.google.com/apikey).
  Default model `gemini-2.5-flash` (set `GEMINI_MODEL` to change).
- **Fireworks**: leave `GEMINI_API_KEY` empty and set `FIREWORKS_API_KEY`.
  Default model `llama-v3p3-70b-instruct` (set `FIREWORKS_MODEL` to change).
- If native function-calling misbehaves with your chosen model, set `AGENT_TOOL_MODE=json`
  to switch the agent to a ReAct-style JSON tool loop (no API features needed beyond chat).

## Enable Gmail sync (optional)

1. Google Cloud Console → create project → enable **Gmail API**.
2. OAuth consent screen → *Testing* mode → add your demo account as a test user.
3. Credentials → **OAuth client ID (Desktop app)** → download the JSON and save it as
   `backend/credentials.json` (see `backend/credentials.example.json` for the expected shape).
   To use a different path, set `GMAIL_CREDENTIALS_FILE` in `.env`.
4. Click **Sync Inbox** in the app — first run opens a browser consent window and caches `token.json`.

> ⚠️ **Never commit `credentials.json`, `client_secret*.json`, or `token.json`** — they hold a live
> OAuth client secret. They're already gitignored; only `credentials.example.json` (no secret) is tracked.
> If a secret ever leaks, rotate it in Google Cloud Console → APIs & Services → Credentials.

Tip for demos: use a **seeded demo Gmail account** (send it ~30 realistic emails: streaming
receipts, an insurance renewal, utility bills, bank UPI alerts) rather than a real inbox.

## Demo script (3 min)

1. Dashboard is already populated (seeded) — point at the **duplicate subscriptions banner**
   (Spotify + YouTube Music) and the **savings panel**.
2. Ask: **"When does my car insurance expire?"** → agent finds the ICICI Lombard policy,
   click the 📎 source chip to show the actual email.
3. Ask: **"How much did I spend on Swiggy last month?"** → exact SQL-summed total with the
   individual UPI alerts as sources.
4. Upload `backend/sample_data/disney_hotstar_receipt.eml` → a new subscription appears live.
5. (If Gmail configured) hit **Sync Inbox** for the full "it reads my email" moment.

## API

| Endpoint | What it does |
|---|---|
| `POST /api/upload` | Upload `.eml` / `.pdf` / `.txt` → extract records |
| `POST /api/sync` | One-shot Gmail sync of the demo inbox |
| `POST /api/chat` | Ask the agent a question (`{question, history}`) |
| `GET /api/insights` | Duplicates, upcoming renewals, savings suggestions |
| `GET /api/stats`, `/subscriptions`, `/bills`, `/transactions`, `/documents`, `/spend-by-month`, `/sources/{id}` | Dashboard data |

## What's deliberately out of scope (48h)

Taxes, warranties beyond basic tracking, live email monitoring, bank-statement PDF parsing
(transaction alerts cover it), multi-user/auth, and actually cancelling subscriptions for you.
