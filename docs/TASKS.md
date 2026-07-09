# Inbox CFO — Build Checklist

> Companion to `BUILD_SPEC.md`. Tick top-to-bottom. **Do not start a phase until the previous
> phase's `✅ CHECKPOINT` passes** — every checkpoint is independently demoable.
> `§` references point at sections of `BUILD_SPEC.md`.

---

## Phase 0 — Scaffold  ·  *servers boot & talk*
- [ ] `backend/requirements.txt` — fastapi, uvicorn, sqlmodel, python-dotenv, openai, google-api-python-client, google-auth-oauthlib, pypdf
- [ ] `backend/app/config.py` — read env per table in §3A.1 (`LLM_PROVIDER/API_KEY/MODEL/BASE_URL`, `GMAIL_MAX_MESSAGES`, `DB_PATH`); default `LLM_PROVIDER=off`
- [ ] `backend/app/db.py` — engine with `connect_args={"check_same_thread": False}`, `init_db()`, `get_session()` dependency (§3A.2)
- [ ] `backend/app/main.py` — FastAPI app, CORS to Vite origin, `GET /api/health` → `{ok:true}`
- [ ] `backend/.env.example` + `credentials.json.example`
- [ ] `.gitignore` — `.env`, `data.db`, `credentials.json`, `token.json`, `__pycache__/`, `node_modules/`, `dist/` (§3A.1)
- [ ] `frontend/` — Vite React app + Tailwind + Recharts; Vite dev-proxy `/api → http://localhost:8000`
- [ ] **✅ CHECKPOINT:** `uvicorn` up + `npm run dev` up; Vite page fetches `/api/health` and shows "connected"

## Phase 1 — Data foundation + read-only dashboard  ·  *build first; demos with no key*
- [ ] `app/models.py` — `Source, Subscription, Bill, Transaction, DocumentRecord, ActionItem` (§3.3); **include interception fields on `Subscription` now** (`is_trial, trial_end_date, cancel_url, auto_renews, previous_amount, price_change_at`)
- [ ] `app/categories.py` — `SUBSCRIPTION/BILL/TRANSACTION_CATEGORIES`, `DOCUMENT_TYPES`, `coerce(value, allowed, default="other")`
- [ ] `app/services/normalize.py` — `norm_key(name)`, `content_hash(*parts)`, `_num(s)`, `_parse_date(s)` (§3A.5)
- [ ] `app/db.py` — idempotent `_ensure_columns()` (ALTER TABLE for added cols) called by `init_db()`
- [ ] `app/routers/data.py` — `GET /api/stats` (§3A.3 monthly-normalized), `/subscriptions`, `/bills`, `/documents`, `/transactions`, `/spend-by-month`, `/insights`, `/sources/{id}`
- [ ] `seed.py` — **date-relative** wipe-then-seed; include the wedge cases: Netflix price hike 499→649, Audible trial ending in 2 days, Spotify + YouTube Music (music duplicate), car insurance renewal, electricity bill, a month of Swiggy txns; backfill `norm_key`
- [ ] Frontend `components/Dashboard.jsx` — `StatsBar, SpendChart, SubscriptionList, RenewalList, InsightsPanel`, shared `SourceDot`/`inr`
- [ ] Frontend `components/SourceModal.jsx` + `App.jsx` layout + `refresh()` fan-out
- [ ] Empty/cold-start states render (no crash on fresh DB) (§3A.9)
- [ ] **✅ CHECKPOINT:** `python seed.py` then run both → dashboard shows real numbers, chart draws, 📎 opens the source email. *Demoable alone.*

## Phase 2 — Ingest + extraction  ·  *drop in an email → rows appear*
- [ ] `app/services/pdf.py` — text out of PDFs via pypdf
- [ ] `app/services/llm.py` — `get_client()` (§3A.4), `chat_json(system, user, *, require_keys, retries=1)`, `chat_text(...)` stub, `LLMNotConfigured`
- [ ] `app/services/extraction.py` — `EXTRACTION_SYSTEM` prompt (email → `{subscriptions?, bills?, transactions?, documents?}` w/ categories + `is_trial/trial_end_date/auto_renews/cancel_url`)
- [ ] `extraction.store_source()` — content-hash dedup (skip if seen); `find_source_by_hash`
- [ ] `extraction._upsert_subscription()` — `norm_key` upsert; **detect price change** → set `previous_amount`/`price_change_at`; carry interception fields on insert+update; category `coerce`
- [ ] `extraction` — bill + document upsert; transactions insert-only
- [ ] Extraction resilience — bad record after retry is **skipped, not fatal**; counted in response (§3A.4)
- [ ] `app/routers/ingest.py` — `POST /api/upload` (parse `.eml`/`.pdf`/`.txt` → store → extract), `POST /api/sync`
- [ ] `app/services/gmail_sync.py` — readonly OAuth (`InstalledAppFlow`, `token.json`), query filter + `GMAIL_MAX_MESSAGES`; 503 w/ hint if no `credentials.json` (§3A.8)
- [ ] Frontend — Upload + Sync buttons, result banner, `refresh()` after each
- [ ] **✅ CHECKPOINT:** upload a `sample_data/*.eml` → new row appears; re-upload same file → "already known", no duplicate

## Phase 3 — Grounded chat agent  ·  *ask a money question → sourced answer*
- [ ] `app/services/agent.py` — `TOOL_FUNCS` + `TOOL_SCHEMAS`: `total_spend, spend_by_category, spend_by_merchant, list_subscriptions, upcoming_renewals, find_documents, find_duplicate_subscriptions`
- [ ] `agent` — `SYSTEM_PROMPT` (must use tools, never guess), tool-calling loop (native + JSON fallback), **max 5 iterations** (§3A.6)
- [ ] `agent` — empty tool result → "not in your inbox"; each result carries `source_id`s → returned as `sources[]`
- [ ] `app/routers/chat.py` — `POST /api/chat` `{question, history}` → `{answer, sources}` (503 if LLM off)
- [ ] Frontend `components/Chat.jsx` — chat UI with 📎 source dots wired to `SourceModal`
- [ ] **✅ CHECKPOINT:** "how much on Swiggy last month?" → exact seeded total w/ sources; "which subs renew soon?" → seeded renewals

## Phase 4 — The wedge: interception + draft-and-approve  ·  *the winning feature*
- [ ] `app/services/actions.py` — `_compute_signals()`: `trial_ending` (≤7d, **high**), `renewal_upcoming` (≤7d, medium), `price_increase` (`previous_amount < amount`, medium, saving=delta), `duplicate` (per category, **subscription_id = pricier sub to drop**, saving = its monthly amt) (§3A.7)
- [ ] `actions.refresh_action_items()` — idempotent upsert by `dedup_key`; **single-sub key** `f"{kind}:{subscription_id}"`, **duplicate key** `f"duplicate:{category}:{sorted_norm_keys}"`; preserve user status; delete only stale *open* items (§3A.7)
- [ ] `actions.draft_cancellation(session, action_id)` — `chat_text` writes email → store `draft_text`, status `drafted`; return `{draft_text, cancel_url, mailto}`
- [ ] `actions.set_status()`, `list_action_items()` (severity-sorted); call `refresh_action_items` at end of upload + sync + `seed.py`
- [ ] `app/routers/actions.py` — `GET /api/actions`, `POST /api/actions/refresh|{id}/draft|{id}/approve|{id}/dismiss`; register in `main.py`
- [ ] `agent.py` — add tools `list_action_items()` + `draft_cancellation(subscription_name)`; extend prompt to **proactively offer** to draft
- [ ] Frontend `components/ActionCenter.jsx` — severity cards at top of left column; saving badge, source dot; **Draft cancellation** expands email → **Copy** / **Open in email** (`mailto:`) / **Cancellation page ↗**; **Dismiss**
- [ ] Frontend `api.js` (`actions, refreshActions, draftAction, approveAction, dismissAction`) + `App.jsx` `actionItems` state + fetch in `refresh()`
- [ ] **✅ CHECKPOINT (money shot):** seed data → Action Center shows Audible trial (high) + Netflix price hike + music duplicate; **Draft cancellation** yields a real email, Copy/Open-in-email work, **Dismiss** persists across refresh; chat "what should I cancel?" lists them + offers to draft

## Phase 5 — Polish + demo
- [ ] Loading + error states everywhere; missing key shows a friendly note, not a stack trace
- [ ] `README.md` — 3-command run (`pip install -r requirements.txt`, `python seed.py`, `uvicorn` / `npm run dev`)
- [ ] Rehearse the 3-minute demo (§5); reset with `python seed.py` immediately before presenting
- [ ] Sanity-run the **Definition of Done** (§7) end-to-end on a clean checkout

---

## Cross-cutting (verify these hold in every phase)
- [ ] No secret is committed; `.env` / `token.json` / `data.db` are gitignored (§3A.1)
- [ ] App never crashes without an LLM key — LLM paths return **503**, dashboard/actions keep working (§3A.4)
- [ ] Every extracted row keeps its `source_id`; every UI number is traceable to an email via 📎
- [ ] Re-ingesting the same email is a no-op (content-hash); recurring emails upsert, not duplicate (§3.3)
- [ ] Currency/date parsing tolerates `₹`, `Rs.`, commas, and mixed date formats (§3A.5)
