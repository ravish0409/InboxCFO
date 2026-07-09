# Inbox CFO — Ground-Up Build Spec

> A build guide for an AI coding agent. Read top-to-bottom, then implement **phase by phase**.
> Each phase ends in a **runnable demo checkpoint** — never move on with a broken build.
> Target: a hackathon-winnable demo in ~1–2 focused days. Optimize for *demoable* over *complete*.

---

## 1. What we're building (one paragraph)

**Inbox CFO** reads a person's email inbox (read-only) and turns it into a personal-finance
dashboard + an AI chat that answers money questions grounded in their real bills, subscriptions,
and receipts. Its differentiator — the thing no competitor does — is that because it reads
**email, not a bank feed**, it can see a charge *before it happens*: "your Audible free trial
ends in 2 days," "Netflix is raising your price ₹499 → ₹649," "you're paying for two music
services." When it spots one, the agent **drafts a cancellation email you approve and send** —
it never sends silently.

**The wedge, stated plainly:** bank-feed apps (Rocket Money, Copilot, Monarch) only learn about a
charge *after* the card is hit. We intercept the *email* that warns you first. That's the demo.

---

## 2. Requirements

### 2.1 Users & core job
- **User:** one person (single-user, local — no auth, no multi-tenant). Solo hackathon build.
- **Job-to-be-done:** "Tell me where my money goes and stop the charges I don't want — from my inbox alone."

### 2.2 Functional requirements (MoSCoW)

**MUST (demo depends on these):**
1. **Ingest** email data two ways: (a) live **Gmail sync** (read-only), (b) **file upload** (`.eml`, `.pdf`, `.txt`).
2. **LLM extraction:** each email/doc → typed rows (subscriptions, bills, transactions, documents) with a category.
3. **Dashboard:** total monthly spend, spend-by-month chart, active subscriptions, upcoming renewals, key documents.
4. **Chat agent:** answers questions ("how much did I spend on Swiggy last month?") via **tool-calls over the structured tables**, never raw email. Every answer is **source-traceable**.
5. **Interception (the wedge):** detect **trial-ending**, **renewal-upcoming**, **price-increase**, and **duplicate-subscription** signals and surface them as an **Action Center**.
6. **Draft-and-approve:** for a flagged item, the agent **drafts a cancellation email**; user reviews, then sends via `mailto:`/copy (Gmail scope is read-only, so we hand off — we never auto-send).
7. **Keyless demo mode:** `python seed.py` populates realistic data so the whole dashboard + Action Center demos with **no API key and no Gmail**.

**SHOULD:**
- Idempotent ingest (re-uploading the same email doesn't double-count).
- Entity normalization (`SWIGGY` / `Swiggy Ltd` / `swiggy.in` → one merchant).
- Category coercion onto a fixed taxonomy.
- Extraction JSON-schema validation + one retry.

**COULD (only if time remains):**
- Insurance/warranty expiry reminders.
- Insights panel (top categories, savings found).

**WON'T (explicitly out of scope — say so in the demo):**
- Auth / multi-user; actually *sending* email; fully-autonomous cancellation; bill negotiation;
  bank/UPI/Account-Aggregator ingestion; forecasting / net-worth. These are the "what's next" slide.

### 2.3 Non-functional (hackathon-calibrated)
- **Runs locally** with `uvicorn` + `vite` and a SQLite file. No cloud, no Docker required.
- **Degrades gracefully without a key:** dashboard + actions work on seed data; only live chat & live
  extraction need the LLM. A missing key returns a clean `503`, never a crash.
- **Fast to reset:** `python seed.py` wipes + reseeds in seconds for a clean demo run.
- **LLM is swappable** via one env-configured OpenAI-compatible client (Gemini or Fireworks).

---

## 3. System design

### 3.1 Architecture (text diagram)

```
                ┌──────────────────────────────────────────────┐
   Gmail API →  │  INGEST        upload (.eml/.pdf/.txt)  ─┐     │
  (readonly)    │  routers/ingest.py, services/gmail_sync │     │
                │                                          ▼     │
                │  EXTRACTION   services/extraction.py  (1 LLM   │
                │   email/doc ── call/doc ──► typed rows) call   │
                │        │  content-hash dedup · norm_key upsert │
                │        ▼                                       │
                │  ┌─────────────  SQLite (SQLModel)  ─────────┐ │
                │  │ Source · Subscription · Bill · Transaction│ │
                │  │ DocumentRecord · ActionItem               │ │
                │  └───────────────────┬───────────────────────┘ │
                │                      │                          │
                │  DETECTION  services/actions.py                │
                │   refresh_action_items() → ActionItem rows     │
                │                      │                          │
                │  AGENT  services/agent.py  (tool-calling loop   │
                │   over the TABLES, not raw email)              │
                └──────────┬───────────────────────┬─────────────┘
                           │  FastAPI /api/*        │
                           ▼                        ▼
                ┌────────────────────────────────────────────┐
                │  React (Vite+Tailwind+Recharts)             │
                │  Dashboard · ActionCenter · Chat · Source   │
                └────────────────────────────────────────────┘
```

**One idea to internalize:** the LLM is used at **two seams only** — (1) *ingest-time* to turn one
messy email into typed rows, and (2) *query-time* as a tool-calling agent over those clean rows.
The dashboard and detection are **plain deterministic code**. This keeps the demo reliable (charts
never hallucinate) and cheap (no LLM call to render a page).

### 3.2 Tech stack (and why)
| Layer | Choice | Why for a hackathon |
|---|---|---|
| Frontend | React + Vite + Tailwind + Recharts | Instant HMR, utility CSS = fast UI, charts out of the box |
| Backend | FastAPI + SQLModel | Typed models = DB schema + API schema in one place; async, auto-docs |
| DB | SQLite (single file) | Zero setup, resettable, commits to repo-adjacent `data.db` |
| LLM | OpenAI-compatible client → Gemini `gemini-2.5-flash` (fallback Fireworks `llama-v3p3-70b`) | One interface, swap by env; flash is cheap+fast for extraction |
| Email | Gmail API (readonly scope) | Real data for the "wow"; readonly keeps the privacy story honest |

### 3.3 Data model (SQLite tables via SQLModel)

Every extracted row carries `source_id` → the `Source` it came from (this powers "show me the email").

- **Source** — one ingested email/PDF: `id, source_type(email|pdf|txt), title, sender, received_at,
  snippet, raw_text, content_hash(indexed, unique-ish for dedup)`.
- **Subscription** — recurring service: `id, source_id, name, norm_key(indexed), category, amount,
  billing_cycle, next_renewal, status(active|cancelled)` **+ interception fields:** `is_trial,
  trial_end_date, cancel_url, auto_renews, previous_amount, price_change_at`.
- **Bill** — one-off/periodic due: `id, source_id, name, category, amount, due_date, status(due|paid)`.
- **Transaction** — a completed charge (insert-only, each is real): `id, source_id, merchant,
  category, amount, txn_date, description`.
- **DocumentRecord** — insurance/warranty/policy: `id, source_id, doc_type, title, provider,
  expiry_date, amount, summary`.
- **ActionItem** — a surfaced thing-to-review: `id, kind(trial_ending|renewal_upcoming|
  price_increase|duplicate|manual_cancel), title, detail, severity(high|medium|low),
  estimated_saving, currency, subscription_id(FK), source_id(FK), status(open|drafted|approved|
  dismissed), draft_text, dedup_key(indexed), created_at`.

**Dedup / idempotency design (the reliability backbone):**
- `content_hash = sha256(sender + title + body)` on every `Source` → re-ingesting the same email is skipped.
- `norm_key(name)` collapses vendor name variants → a recurring "Netflix" email **upserts** the existing
  subscription (freshest non-null value wins) instead of inserting a duplicate every month.
- Transactions are **insert-only** (each charge actually happened); subscriptions/bills/documents **upsert**.
- `ActionItem` upserts by `dedup_key = f"{kind}:{subscription_id}"` and **preserves user status**
  (a `dismissed` item never resurrects; `draft_text` is never clobbered by a refresh).

### 3.4 Category taxonomy
One module (`categories.py`) owns the allowed sets (`SUBSCRIPTION_CATEGORIES`, `BILL_CATEGORIES`,
`TRANSACTION_CATEGORIES`, `DOCUMENT_TYPES`) and a `coerce(value, allowed, default="other")`.
Every write snaps onto the allowed set → charts and filters never fragment on `"Food"` vs `"food"`.

### 3.5 LLM strategy (three prompts, one client)
- `chat_json(system, user, *, require_keys, retries=1)` — forces JSON, validates shape, retries once. Used by **extraction** and the **agent's JSON tool-call mode**.
- `chat_text(system, user)` — free text. Used by **draft_cancellation** (write the email).
- **Agent loop:** native tool-calling if the provider supports it, else a JSON-mode fallback where the
  model emits `{"tool": ..., "args": ...}`. Tools are **read + draft only** — the agent can query tables
  and draft an email; it can never mutate spend or send mail. This is the guardrail.

### 3.6 Agent tools (the whole surface)
`total_spend`, `spend_by_category`, `spend_by_merchant`, `list_subscriptions`, `upcoming_renewals`,
`find_documents`, `find_duplicate_subscriptions`, `list_action_items`, `draft_cancellation(name)`.
Each returns structured data + `source_id`s so the UI can render a "📎 source" dot next to answers.

### 3.7 API surface (FastAPI)
```
GET  /api/stats                      dashboard headline numbers
GET  /api/subscriptions | /bills | /documents | /transactions
GET  /api/spend-by-month             chart series
GET  /api/insights                   renewals + savings
GET  /api/sources/{id}               the original email (for the source modal)
POST /api/sync                       Gmail readonly pull → ingest → refresh actions
POST /api/upload   (multipart)       files → ingest → refresh actions
GET  /api/actions                    open+drafted items, severest first
POST /api/actions/refresh            recompute signals
POST /api/actions/{id}/draft         LLM-draft cancellation (503 if no key)
POST /api/actions/{id}/approve | /dismiss
POST /api/chat     {question,history} agent answer + sources
```

### 3.8 Frontend components
`App.jsx` (layout, `refresh()` fan-out, upload/sync handlers) · `Dashboard.jsx` (`StatsBar`,
`SpendChart`, `SubscriptionList`, `RenewalList`, `InsightsPanel`, shared `SourceDot`/`inr`) ·
`ActionCenter.jsx` (severity cards + draft review) · `Chat.jsx` (streaming-ish chat with source dots)
· `SourceModal.jsx` (shows the original email). Single dark theme, no routing.

---

## 3A. Design details you must not skip (gap-fill)

> These are the parts that silently eat hackathon hours if left implicit. Decide them now.

### 3A.1 Config surface & secrets
Single `app/config.py` reads env (`.env`, dotenv). **Never** hardcode keys.

| Env var | Purpose | Default |
|---|---|---|
| `LLM_PROVIDER` | `gemini` \| `fireworks` \| `off` | `off` |
| `LLM_API_KEY` | provider key | `""` |
| `LLM_MODEL` | e.g. `gemini-2.5-flash` / `accounts/fireworks/models/llama-v3p3-70b-instruct` | provider default |
| `LLM_BASE_URL` | OpenAI-compatible base | provider default |
| `GMAIL_MAX_MESSAGES` | cap per sync | `50` |
| `DB_PATH` | SQLite file | `data.db` |

**`.gitignore` (must include):** `.env`, `data.db`, `credentials.json`, `token.json`, `__pycache__/`,
`node_modules/`, `dist/`. Commit `.env.example` and `credentials.json.example` only.

### 3A.2 DB session lifecycle
- SQLite engine created with `connect_args={"check_same_thread": False}` (FastAPI is threaded).
- One session **per request** via a FastAPI dependency `get_session()` (`with Session(engine) as s: yield s`).
- Write pattern: `session.add(x); session.commit(); session.refresh(x)`. Services take a `session` arg
  (never open their own) so ingest + detection share one transaction boundary.

### 3A.3 Deterministic aggregation (no LLM touches these)
- **`/api/stats`** — `monthly_spend` = sum of `Transaction.amount` in the current calendar month **+**
  each active subscription normalized to monthly (`yearly → amount/12`, `monthly → amount`,
  `weekly → amount*52/12`); plus counts (active subs, upcoming renewals, open action items).
- **`/api/spend-by-month`** — group `Transaction` by `strftime('%Y-%m', txn_date)`, sum, last 6 months, zero-fill gaps.
- **`/api/insights`** — renewals with `next_renewal` within 30 days (sorted), plus `savings_found` =
  sum of `estimated_saving` over open ActionItems. All pure SQL/Python — reproducible, never hallucinated.

### 3A.4 Provider selection, fallback & the error contract
- **Selection:** `LLM_PROVIDER` picks the client; `off` (or empty key) means **no LLM**. One `get_client()`
  builds an OpenAI-compatible client from `(base_url, key, model)`.
- **Missing LLM:** any LLM-dependent path raises `LLMNotConfigured` → routes catch → **HTTP 503** with a
  friendly `detail`. Dashboard, seed, and Action Center listing/dismiss stay fully functional without a key.
- **Extraction resilience:** if a single record fails JSON validation after one retry, **skip that record
  and continue** — one bad email never fails the whole upload/sync. Log it, count it in the response.
- **Global HTTP contract:** `404` unknown id · `422` bad input · `503` LLM/Gmail not configured ·
  `200` with `{ok, counts}` on ingest. Frontend `request()` surfaces `detail` in the banner.
- **Fallback (optional, only if trivial):** on a provider 429/5xx during extraction, retry once; do **not**
  build a live cross-provider failover for the hackathon — the keyless seed path is the real safety net.

### 3A.5 Parsing robustness (the #1 extraction failure mode)
Provide two helpers in `services/normalize.py` (or `extraction.py`) and use them everywhere:
- **`_num(s)`** → strip `₹`, `Rs.`, `INR`, commas, spaces; parse to `float`; `None` on failure.
  (`"₹1,286.00"`, `"Rs.499"`, `"INR 8,450"` all → numbers.)
- **`_parse_date(s)`** → try ISO first, then common formats (`%d %b %Y`, `%d/%m/%Y`, `%b %d, %Y`,
  RFC-2822 email `Date`); return `date` or `None`. Never throw.
- **File parsing:** `.eml` via stdlib `email` (walk parts, prefer `text/plain`, fall back to stripped
  `text/html`; pull `From`/`Subject`/`Date`); `.pdf` via `pypdf` (`services/pdf.py`); `.txt` raw.
  `Source.received_at` comes from the email `Date` header (or upload time if absent).

### 3A.6 Agent loop guardrails
- **Max tool iterations = 5.** On exceeding, answer with what's gathered — never loop forever.
- Tools are **read + draft only**; there is no tool that mutates spend or sends mail (guardrail by construction).
- **No fabrication:** if a tool returns empty, the agent must say "I don't see that in your inbox," not guess.
- Every tool result carries the `source_id`s it drew from; the route returns them as `sources[]` so the UI
  can render the 📎 dots. Tool errors are returned to the model as text so it can recover, not raised.

### 3A.7 Duplicate ActionItem — stable key & draft target (was undefined)
A `duplicate` signal spans a *group* of subs, but Draft cancellation acts on **one**. Resolve it:
- **`subscription_id`** = the **redundant one to drop** = the *more expensive* sub in the group (cancel it,
  keep the cheaper). `estimated_saving` = that sub's monthly amount.
- **`dedup_key`** = `f"duplicate:{category}:{sorted_norm_keys_joined}"` — **order-independent**, so refresh
  is idempotent regardless of row order. (Contrast single-sub signals: `f"{kind}:{subscription_id}"`.)
- Draft/approve/dismiss then work uniformly because every ActionItem — including duplicates — has a
  concrete `subscription_id` to act on.

### 3A.8 Gmail OAuth — plan it, it's the hidden time-sink
- Use a **Desktop-app OAuth client** → download `credentials.json` (gitignored). Scope: **`gmail.readonly`** only.
- First `/api/sync` runs `InstalledAppFlow` → opens browser consent → persists `token.json`; later syncs reuse it.
- OAuth consent screen stays in **"Testing"**; add your own Google account as a **test user** (no verification needed for a solo demo).
- **Query filter** to keep it fast + relevant: recent window (e.g. `newer_than:90d`) and/or known finance
  senders; cap at `GMAIL_MAX_MESSAGES`. Each message → `store_source` → `extract` → dedup by `content_hash`.
- **No `credentials.json`?** `/api/sync` returns **503** with a one-line setup hint — the app still fully
  demos via upload + seed, so Gmail is a bonus, not a blocker. (Have a few `.eml` files ready as Plan B.)

### 3A.9 Cold-start & empty states
- Fresh DB (no ingest, no seed): dashboard renders friendly empty cards ("Sync your inbox or upload an
  email to begin"), the spend chart shows an empty frame, **Action Center hides itself when there are no
  items** (already the intended behavior), and chat greets with a "sync or upload to start" hint.
- This means a judge who runs it clean sees a coherent product, not a blank/error screen — but you should
  **always `python seed.py` before presenting** to show the full experience.

---

## 4. Implementation guide — build in phases

> **Rule for the agent:** finish a phase, run its **Demo checkpoint**, only then continue. If a phase
> slips, ship the previous checkpoint — every checkpoint is independently demoable.

### Phase 0 — Scaffold (≈30 min)
**Goal:** both servers boot and talk to each other.
- `backend/`: `requirements.txt` (fastapi, uvicorn, sqlmodel, python-dotenv, openai, google-api-python-client, google-auth-oauthlib, pypdf), `app/main.py` (FastAPI + CORS to Vite), `app/config.py` (env: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`), `app/db.py` (engine + `init_db()`), `.env.example`.
- `frontend/`: `npm create vite@latest` (React), add Tailwind + Recharts, a Vite dev-proxy `/api → :8000`.
- **Demo checkpoint:** `GET /api/health` returns `{ok:true}`; Vite page fetches it and prints "connected".

### Phase 1 — Data foundation + read-only dashboard (≈2–3 hrs) ← *build this first*
**Goal:** a full dashboard rendering from seeded data, **no LLM, no Gmail**.
- `app/models.py`: all six tables from §3.3 (include the interception fields now — cheap to add early).
- `app/categories.py`: taxonomy + `coerce`. `app/services/normalize.py`: `norm_key`, `content_hash`.
- `app/db.py`: `init_db()` + idempotent `_ensure_columns()` (ALTER TABLE for added columns) so a
  stale `data.db` migrates without a manual drop.
- `app/routers/data.py`: the read endpoints (`stats`, `subscriptions`, `spend-by-month`, `insights`, `sources/{id}`).
- `seed.py`: realistic, **date-relative** demo data (so "last month" always works). Seed the wedge cases:
  Netflix price hike (499→649), Audible trial ending in 2 days, Spotify + YouTube Music (music duplicate),
  car insurance renewal, electricity bill, a month of Swiggy charges. Wipe-then-seed.
- Frontend: `Dashboard.jsx` + `App.jsx` render stats, chart, subscriptions, renewals; `SourceModal`.
- **Demo checkpoint:** `python seed.py && uvicorn` + `npm run dev` → dashboard shows real numbers, the
  spend chart draws, clicking a 📎 opens the source email. **This alone is demoable.**

### Phase 2 — Ingest + extraction (≈3 hrs)
**Goal:** drop in a real email/PDF (or Gmail sync) and watch rows appear.
- `app/services/pdf.py`: extract text from PDFs (pypdf).
- `app/services/llm.py`: the client + `chat_json` (+ `chat_text` stub for later).
- `app/services/extraction.py`: `EXTRACTION_SYSTEM` prompt (email → `{subscriptions?, bills?,
  transactions?, documents?}` with categories + trial/renewal/cancel_url fields); `store_source`
  (with `content_hash` dedup — skip if seen); `_upsert_subscription` (norm_key upsert; **detect price
  change** → set `previous_amount`/`price_change_at`); bill/document upsert; category `coerce`.
- `app/routers/ingest.py`: `POST /api/upload` (parse `.eml`/`.pdf`/`.txt` → `store_source` → `extract`),
  `POST /api/sync` (Gmail readonly → same path). `app/services/gmail_sync.py`: OAuth + message pull.
- Frontend: wire the **Upload** and **Sync** buttons + result banner; `refresh()` after each.
- **Demo checkpoint:** upload `sample_data/*.eml` → new subscription/bill appears; re-upload the same
  file → "already known," no duplicate. (Uses the free-tier key; degrade to `503` cleanly if absent.)

### Phase 3 — Grounded chat agent (≈3 hrs)
**Goal:** ask a money question, get a correct, sourced answer.
- `app/services/agent.py`: `TOOL_FUNCS` + `TOOL_SCHEMAS` (§3.6, minus the two action tools for now),
  a `SYSTEM_PROMPT` that forbids guessing and requires tool use, and the tool-calling loop (native +
  JSON fallback). Return `{answer, sources[]}`.
- `app/routers/chat.py`: `POST /api/chat`. Frontend `Chat.jsx` with source dots.
- **Demo checkpoint:** "how much did I spend on Swiggy last month?" → exact seeded total, with sources.
  "which subscriptions renew soon?" → the seeded renewals. Answers cite emails.

### Phase 4 — The wedge: interception + draft-and-approve (≈3–4 hrs) ← *the winning feature*
**Goal:** the app proactively catches a charge before it happens and drafts the cancellation.
- `app/services/actions.py`:
  - `_compute_signals(session)` → trial_ending (≤7 days, **high**), renewal_upcoming (≤7 days, medium),
    price_increase (`previous_amount < amount`, medium, saving = delta), duplicate (per category group,
    saving = combined − cheapest).
  - `refresh_action_items(session)` → idempotent upsert by `dedup_key`, **preserve user status**, delete
    only *open* signals that no longer apply.
  - `draft_cancellation(session, action_id)` → `chat_text` writes a short polite email; store `draft_text`,
    set `status="drafted"`; return `{draft_text, cancel_url, mailto}`.
  - Call `refresh_action_items` at the end of upload + sync (and once in `seed.py`).
- `app/routers/actions.py`: the 5 endpoints from §3.7. Register in `main.py`.
- `app/services/agent.py`: add `list_action_items` + `draft_cancellation(name)` tools; extend the prompt
  so chat **proactively offers** to draft when it sees a trial/renewal/duplicate.
- Frontend `ActionCenter.jsx`: severity-colored cards at the **top** of the left column; each with
  estimated saving, source dot, **Draft cancellation** (expands the email → **Copy** / **Open in email**
  (`mailto:`) / **Cancellation page ↗**), and **Dismiss**. Wire `api.js` + `App.jsx` state.
- **Demo checkpoint (the money shot):** on seed data the Action Center shows *"⏰ Audible free trial
  ends in 2 days"* (high), *"📈 Netflix price up ₹150/mo,"* *"👯 2 music subscriptions overlap."* Click
  **Draft cancellation** → a real, sensible email appears, **Copy**/**Open in email** work, **Dismiss**
  persists across a refresh. In chat: *"what should I cancel?"* lists them and offers to draft.

### Phase 5 — Polish + demo script (≈1–2 hrs)
- Empty states, loading states, error banners; make a missing key show a friendly note, not a stack trace.
- `README.md`: 3-command run (`pip install -r`, `python seed.py`, `uvicorn` / `npm run dev`).
- **Rehearse the 3-minute demo (below).** Reset with `python seed.py` right before presenting.

---

## 5. The 3-minute demo script (build toward this)
1. **(0:20) Frame the wedge.** "Every budgeting app reads your bank feed and tells you what you *already*
   spent. Inbox CFO reads your **inbox** — so it warns you *before* the charge." Show the dashboard.
2. **(0:40) It understands your inbox.** Open a subscription's 📎 source — "every number traces to a real email."
3. **(1:20) The catch (the wow).** Point at the Action Center: "Audible's trial ends in **2 days** — a bank
   app can't see this yet, there's no charge to see. Netflix quietly raised your price. You're paying for two
   music apps." Click **Draft cancellation** → the email writes itself → **Copy / Open in email**.
4. **(2:20) Ask it anything.** Chat: "how much on Swiggy last month?" → exact, sourced answer.
5. **(2:50) What's next slide.** Autonomous cancellation under a policy, insurance renewals, India rails —
   "the guardrail today is draft-and-approve; nothing sends without you."

---

## 6. Risks & mitigations (know these before the judges ask)
- **Free-tier LLM quota** (e.g. Gemini ~20 req/day) can 429 mid-demo → **seed data + keyless dashboard/actions
  are the safety net;** pre-generate one draft before presenting, and never let a 429 crash a route.
- **Gmail is read-only** → we *cannot send* — this is a **feature** (draft-and-approve), state it proudly.
- **Extraction hallucination** → the JSON-schema validate+retry and category `coerce` bound it; charts run on
  deterministic code, not LLM output.
- **Duplicate detection is category-coarse** (Netflix+Prime both "video") → for the demo, lean on the clean
  **music** duplicate (Spotify + YouTube Music); refine grouping only if time allows.

---

## 7. Definition of done (per the demo, not per production)
- `python seed.py` → dashboard + Action Center fully populated, **no key needed**.
- Upload a sample `.eml` → new row appears; re-upload → no duplicate.
- Action Center shows all four signal kinds; **Draft cancellation** produces a real email; **Dismiss** sticks.
- Chat answers a spend question correctly **with sources** and offers to draft a cancellation.
- Both servers start from a clean checkout in under 3 commands.
```
