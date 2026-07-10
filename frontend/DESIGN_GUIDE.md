# Inbox CFO — UI Redesign Guidebook

**Audience:** an AI coding agent implementing this redesign. Follow it exactly. Where a value
is given, use that value. Where a judgment call is needed, the "Do / Don't" lists at the end
are the tiebreaker.

---

## 1. Design thesis

Inbox CFO is not a dashboard. It is an **analyst that works your inbox** — it reads emails,
extracts financial facts, detects traps (trials, renewals, price hikes), drafts cancellations,
and waits for your approval. Today's UI hides all of that work behind a generic dark dashboard.

The redesign's single job: **make the agent's work visible and inspectable.** Every number on
screen was produced by the agent reading a real email — the UI must show the receipts.

**Aesthetic direction: the analyst's terminal ledger.** Financial terminals (Bloomberg,
broker consoles) are the native visual language of "a machine watching your money": warm
near-black, amber signal color, monospace figures, hairline rules, dense but calm. This is
deliberately NOT the generic AI look (no purple/indigo, no glassmorphism, no acid green on
black, no gradients).

**Three voices, three treatments:**

| Voice | What it covers | Treatment |
|---|---|---|
| The agent | tool traces, activity log, status line, extracted data, money figures | IBM Plex Mono, amber or neutral, lowercase labels |
| The interface | headings, buttons, body copy | IBM Plex Sans, sentence case |
| The evidence | raw email/PDF text | IBM Plex Mono, muted, pre-wrap |

**Signature element (spend all boldness here):** the **work receipt** — a collapsed strip of
connected tool-call tokens under every chat answer, and a staged "reading → extracted → filed"
log line sequence when files are ingested. Everything else stays quiet and disciplined.

Dark-only is a deliberate choice (terminal vernacular; the app is already dark-only). Do not
build a light mode.

---

## 2. Design tokens

Tailwind v4, zero-config. Define ALL tokens in `src/index.css` via `@theme`. After this
change, **no component may use `slate-*`, `indigo-*`, or raw hex** (exception: Recharts props,
which must use the hex values below).

```css
@import "tailwindcss";

@theme {
  /* Surfaces — warm near-black, not blue slate */
  --color-ink: #0B0B09;        /* page background */
  --color-panel: #141412;      /* cards, panels */
  --color-raised: #1C1B17;     /* hover states, inputs, nested surfaces */
  --color-line: #26251F;       /* hairline borders */
  --color-line-strong: #3A382E;/* emphasized borders, modal edge */

  /* Text — warm off-whites */
  --color-paper: #EDEBE4;      /* primary text */
  --color-dim: #9C988A;        /* secondary text */
  --color-faint: #6B675C;      /* muted labels, timestamps */

  /* Signal — the agent's color. Working state, tool tokens, primary actions, focus */
  --color-signal: #E8A63D;
  --color-signal-dim: #8A6524; /* borders/underlines of signal elements */

  /* Semantics — reserve strictly for meaning */
  --color-gain: #57C785;       /* savings, money recovered, success */
  --color-alert: #E5484D;      /* traps, high severity, errors */
  --color-warn: #D9822B;       /* medium severity (distinct from signal by context: warn is on cards, signal is on agent chrome) */

  /* Type */
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

body { @apply bg-ink text-paper antialiased; }
:root { color-scheme: dark; }
```

Load fonts in `frontend/index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

Also update `<title>` to `Inbox CFO — your inbox, working for you`.

### Typography scale

There is no decorative display face. **The numerals are the display face**: every money
figure and count is IBM Plex Mono with `tabular-nums` — the ledger IS the personality.

| Role | Spec |
|---|---|
| KPI figure | `font-mono text-2xl font-medium tabular-nums text-paper` |
| Money in rows/cards | `font-mono text-sm tabular-nums` |
| Section heading | `font-sans text-sm font-semibold text-paper` (sentence case — kill the current `uppercase tracking-wider` habit for headings) |
| Agent labels (tool tokens, statuses, log lines) | `font-mono text-xs text-dim lowercase` |
| Body / detail text | `font-sans text-sm text-dim` |
| Timestamps, meta | `font-mono text-[11px] text-faint` |

Currency: keep the existing `inr()` helper. Always render amounts in mono + tabular-nums.

### Shape & spacing

- Radii: `rounded-md` (6px) for buttons/inputs/chips, `rounded-lg` (8px) for cards/panels.
  **Nothing larger.** Kill all `rounded-xl`, `rounded-2xl`, `rounded-full` (pills become
  `rounded-md` tags). The current bubbly look reads consumer-app; the terminal look is squarer.
- Borders: default `border border-line`. No shadows anywhere except the evidence drawer
  (`shadow-2xl` acceptable there).
- Density: tighter than today. Card padding `px-3 py-2.5`, section gaps `gap-4`, list row
  padding `px-3 py-2`.
- Focus: `focus-visible:outline-2 outline-signal outline-offset-2` on every interactive
  element. This replaces indigo focus rings.

### Icons

`npm i lucide-react` in `frontend/`. **Delete every emoji icon.** Size 14–16px, `strokeWidth={1.75}`,
color inherits. Mapping:

| Current emoji | Lucide icon |
|---|---|
| 💼 logo | `Landmark` |
| 🤖 chat | `Bot` |
| ⏰ trial_ending | `TimerReset` |
| 🔁 renewal_upcoming | `RefreshCw` |
| 📈 price_increase | `TrendingUp` |
| 👯 duplicate | `Copy` |
| ✂️ manual_cancel | `Scissors` |
| 💡 insight | `Lightbulb` |
| 📎 source chip | `FileText` |
| 🎵/🎬/etc. category icons | `Music`, `Clapperboard`, `Cloud`, `Dumbbell`, `Newspaper`, `Zap`, `ShoppingBag`, `CircleDot` (fallback) |
| Upload button | `Upload` |
| Sync button | `Mail` |

---

## 3. Layout

Single page, no router (keep as is). Restructure `App.jsx`:

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR   ◆ Inbox CFO        [status line, mono]      [Sync] [Upload] │
├──────────────────────────────────────────────────────────────────────┤
│ AGENT LOG (collapsible strip, appears during/after ingestion)        │
├──────────────────────────────────────────────┬───────────────────────┤
│ WORKSPACE  (2/3, lg:col-span-2)              │ AGENT PANEL (1/3)     │
│                                              │ (sticky)              │
│  1. Needs your approval  ← action queue      │                       │
│  2. KPI ledger strip     ← stats             │  Chat with the agent  │
│  3. Subscriptions        ← ledger table      │  + work receipts      │
│  4. Coming up | Monthly spend  (2-col)       │                       │
│  5. Ways to save         ← insights          │                       │
└──────────────────────────────────────────────┴───────────────────────┘
```

Changes from today:
- **Action queue moves to the very top of the workspace** (it's the product wedge) and is
  reframed as an approval queue (§5).
- **Stats move below the action queue** — traps outrank totals.
- Keep `max-w-7xl mx-auto`, `lg:grid-cols-3` grid, sticky right column.

### Topbar

- Logo: 28px square, `bg-signal text-ink rounded-md` containing `Landmark` icon at 16px.
- Title `font-sans font-semibold text-paper`; drop the subtitle from the topbar (it moves to
  the status line).
- **Status line (new, the topbar's centerpiece):** a mono strip that makes the agent feel
  present. Built from data already on the client: stats (`/api/stats`) and a module-level
  constant for the model name. Format:

  ```
  watching 42 sources · 12 subscriptions tracked · last sync 2:41 pm
  ```

  `font-mono text-xs text-faint`, separators `·` in `text-line-strong`. While any request is
  in flight (sync, upload, chat, draft), swap it to `working…` prefixed with a 6px amber dot
  (`animate-pulse`) and the verb of what's happening: `reading inbox…`, `drafting cancellation…`,
  `checking your data…`. Implement as a tiny `useAgentStatus` hook or lifted state in
  `App.jsx` — components already know when they're loading; thread a `setBusy(label)` down.
- Buttons: primary (Sync) `bg-signal text-ink font-medium rounded-md px-3.5 py-2 hover:brightness-110`;
  secondary (Upload) `border border-line-strong text-paper rounded-md px-3.5 py-2 hover:bg-raised`.

---

## 4. The agent log (ingestion sequence) — signature moment #1

Today an upload flashes a one-line banner. Replace the banner with an **agent log**: a panel
under the topbar that plays back the agent's work file-by-file, like a terminal session.

Data: `POST /api/upload` already returns `results: [{file, source_id, extracted: {subscriptions, bills, transactions, documents}, duplicate?}]`, and `POST /api/sync` returns `{new, skipped_existing}`.

Behavior (new component `src/components/AgentLog.jsx`):
1. On upload/sync start, the panel appears with one line: `● reading 3 files…` (amber dot pulsing).
2. When the response arrives, append one line **per file, staggered 300ms apart** (setTimeout
   chain — this is client-side pacing of a completed response; do not pretend it is streaming
   anywhere in code comments or copy):
   ```
   ✓ netflix-renewal.eml      → 1 subscription · 1 renewal date        [view source]
   ✓ gym-invoice.pdf          → 1 bill ₹1,200                          [view source]
   – spotify-receipt.eml      → already on file, skipped
   ```
   Line spec: `font-mono text-xs`, filename `text-paper`, extraction summary `text-dim`,
   `✓` in `text-gain`, skip marker `–` in `text-faint`. `[view source]` opens the existing
   SourceModal with that `source_id`.
3. End with a summary line in `text-signal`: `filed 2 new items · re-checking traps…`, then
   refresh the dashboard (the existing `refresh()` + `/api/actions/refresh` flow).
4. Panel stays until dismissed (small `×`, `text-faint`). Errors render as a line:
   `✗ upload failed — <message>` in `text-alert`, no apology, no auto-dismiss.

Respect `prefers-reduced-motion`: render all lines at once, no stagger, no pulse.

---

## 5. Action center → approval queue

`ActionCenter.jsx`. This is the human-in-the-loop story: **the agent proposes, you approve.**

- Heading: `Needs your approval` (was "Needs your attention"). Keep the subhead
  "things a bank feed can't see until it's too late" — it's the pitch; set it
  `font-sans text-xs text-faint`.
- Each card: `bg-panel border border-line rounded-lg`, with a **2px left border** encoding
  severity — `border-l-alert` (high), `border-l-warn` (medium), `border-l-line-strong` (low).
  Kill the tinted card backgrounds (`bg-rose-500/10` etc.); tinted cards everywhere is noise.
- Card anatomy, top row: kind icon (16px, severity color) · title `font-sans text-sm
  font-medium text-paper` · savings tag `font-mono text-xs text-gain` (`save ₹298/mo`) ·
  **status tag** on the right: `font-mono text-[11px] lowercase border border-line rounded-md
  px-1.5 py-0.5` — `open` (text-dim), `drafted` (text-signal border-signal-dim),
  `approved` (text-gain), plus a relative timestamp.
- Second row: detail text, then an evidence chip (§8) linking to the source email when the
  action has one.
- Buttons: `Draft cancellation` (primary style), `Dismiss` (ghost: `text-faint hover:text-paper`).
- **Add the missing Approve step.** After a draft exists, show the draft in a
  `bg-ink border border-line rounded-md font-mono text-xs text-dim p-3 whitespace-pre-wrap`
  block (replace the textarea) with buttons: `Approve & open email` (primary — calls the
  existing `POST /api/actions/{id}/approve` from `api.js` (`approveAction`, currently unused),
  then opens the `mailto:`), `Copy draft`, and `Cancellation page ↗` when `cancel_url` exists.
  After approve, status tag flips to `approved` and buttons collapse to `Copy draft`.
- While drafting: replace the button label with `drafting…` + pulsing amber dot; disable it.
- Empty state: `No traps right now. The agent re-checks after every sync.` in the `Empty`
  helper style (dashed `border-line`).

---

## 6. Chat → the agent panel, with work receipts — signature moment #2

`Chat.jsx`. The backend already returns `tool_trace: [{tool, args}]` and the component
already receives it and throws it away. **Render it.**

- Panel: `bg-panel border border-line rounded-lg`. Header: `Bot` icon in signal color,
  title `Ask your Inbox CFO`, sub `Every answer cites the emails it came from`
  (`text-xs text-faint`).
- **Work receipt:** above each assistant bubble, render the tool trace as a horizontal chain
  of mono tokens joined by 12px hairline connectors (`border-t border-line` segments or `→`
  in `text-faint`):

  ```
  checked subscriptions → summed by category → found 2 duplicates
  ```

  Token spec: `font-mono text-[11px] lowercase text-signal bg-signal/10 border border-signal-dim
  rounded-md px-1.5 py-0.5`. Map tool names to verb phrases (fallback: the raw tool name with
  underscores → spaces):

  | tool | token label |
  |---|---|
  | `total_spend` | `summed spending` |
  | `spend_by_category` | `grouped by category` |
  | `spend_by_merchant` | `grouped by merchant` |
  | `list_subscriptions` | `checked subscriptions` |
  | `upcoming_renewals` | `checked renewals` |
  | `find_duplicate_subscriptions` | `hunted duplicates` |
  | `find_documents` | `searched documents` |
  | `list_action_items` | `reviewed open traps` |
  | `draft_cancellation` | `drafted cancellation` |

  If the trace is empty, render nothing (no placeholder).
- Bubbles: user `bg-raised text-paper rounded-lg rounded-br-sm` right-aligned; assistant
  `bg-ink border border-line text-dim rounded-lg rounded-bl-sm`. **No indigo.** Error bubble:
  `border-alert text-alert` with the actual message.
- Source chips under assistant bubbles: restyle as evidence chips (§8), keep the 4-chip cap.
- Loading state: a receipt-shaped shimmer — one pulsing amber token reading `checking your
  data…` where the work receipt will appear.
- Empty state: keep the 4 canned suggestions as `border border-line rounded-md text-dim
  hover:border-signal-dim hover:text-paper` buttons; retitle the group `Try asking`.
- Input: `bg-ink border border-line rounded-md focus:border-signal`, button `Ask` primary style.

---

## 7. Dashboard components (`Dashboard.jsx`)

- **`StatsBar` → KPI ledger strip.** One `bg-panel border border-line rounded-lg` bar divided
  by internal hairlines (`divide-x divide-line`), not four floating cards. Each cell: label
  `font-mono text-[11px] lowercase text-faint` on top, figure in the KPI spec (§2). Order:
  `subscriptions / month` (the recurring burn is the headline number), `active subscriptions`,
  `spent this month`, `sources on file` (rename from "Emails & docs ingested").
- **`SubscriptionList` → ledger table.** Replace the card grid with rows separated by
  `divide-y divide-line` inside one panel: category icon (16px, `text-faint`) · name
  (`text-sm text-paper`) · cadence + renewal date (`font-mono text-[11px] text-faint`) ·
  right-aligned amount (`font-mono text-sm tabular-nums`) · evidence chip. If
  `previous_amount` is present and lower, append `↑ was ₹399` in `font-mono text-[11px]
  text-alert` — the price-hike history already exists in the data; show it.
- **`RenewalList`.** Keep rows. Days-pill becomes a mono tag: `in 3d` — `text-alert
  border-alert/40` when ≤14 days, else `text-dim border-line`. `rounded-md`, not full.
- **`SpendChart`.** Recharts hex updates: bars `#E8A63D` with `radius={[3,3,0,0]}`, grid
  `#26251F`, ticks `#6B675C` (mono: pass `fontFamily: 'IBM Plex Mono'` in tick style),
  tooltip `background:#141412; border:1px solid #3A382E; borderRadius:6`, cursor `#1C1B17`.
- **`InsightsPanel`.** Cards `bg-panel border border-line rounded-lg` with `Lightbulb` icon
  in `text-gain` and the savings tag in `font-mono text-gain`. Kill the green-tinted
  background. **Surface `llm_used`:** the API returns it with `as_of`; render a footer line
  under the list — `generated by the agent · 2:41 pm` when true, `rule-based estimates —
  add an API key for smarter suggestions` when false — `font-mono text-[11px] text-faint`.
- **`DuplicateBanner`:** dead code, never rendered. Delete the export.
- **`Section` helper:** heading style per §2 (sentence case, `text-paper`). **`Empty`
  helper:** keep dashed pattern with `border-line`, copy per §10.

---

## 8. Provenance: evidence chips + evidence drawer

- **`SourceDot` → `EvidenceChip`.** Everywhere a "src" chip appears (subscriptions, renewals,
  actions, chat): `FileText` icon 12px + label — `font-mono text-[11px] text-dim border
  border-line rounded-md px-1.5 py-0.5 hover:text-signal hover:border-signal-dim`. Label is
  `evidence` when unlabeled, or the truncated source title in chat chips.
- **`SourceModal` → evidence drawer.** Convert the centered modal to a **right-side drawer**:
  `fixed inset-y-0 right-0 w-full max-w-xl bg-panel border-l border-line-strong shadow-2xl
  z-50`, backdrop `bg-black/60`. Slide in 200ms ease-out (`translate-x-full → 0`); instant
  under reduced motion. Header: `evidence · email` eyebrow in `font-mono text-[11px]
  text-signal lowercase`, then title, sender · date in `text-faint`. Body: raw text
  `font-mono text-xs text-dim whitespace-pre-wrap leading-relaxed`. Close on backdrop click,
  `×` button, and Escape key.

---

## 9. Motion

One orchestrated moment (the agent log stagger, §4) plus micro-feedback. Nothing else.

- Allowed: agent-log line stagger (300ms); pulsing amber working-dot; drawer slide (200ms);
  `transition-colors duration-150` on interactive elements; chat messages fade-in
  (`opacity 150ms`).
- Forbidden: scroll-triggered reveals, skeleton screens, spring/bounce, animated gradients,
  typewriter text effects, animating the chart on every refresh.
- Every animation must be gated: wrap in a `usePrefersReducedMotion` check or CSS
  `@media (prefers-reduced-motion: reduce)`.

---

## 10. Copy

Sentence case everywhere. The agent's voice is lowercase mono and factual; the interface's
voice is plain sentence-case sans. No exclamation marks, no apologies, no "oops".

| Surface | Copy |
|---|---|
| Topbar subtitle → status line | `watching {n} sources · {n} subscriptions tracked · last sync {time}` |
| Sync button | `Sync inbox` |
| Upload button | `Upload emails or PDFs` |
| Action queue heading | `Needs your approval` |
| Action queue empty | `No traps right now. The agent re-checks after every sync.` |
| Draft button | `Draft cancellation` / while working `drafting…` |
| Approve button | `Approve & open email` |
| Chat header | `Ask your Inbox CFO` / `Every answer cites the emails it came from` |
| Chat empty group title | `Try asking` |
| Chat loading | `checking your data…` |
| Subscriptions empty | `Nothing tracked yet. Upload a few emails and the agent will find your subscriptions.` |
| Insights footer (LLM) | `generated by the agent · {time}` |
| Insights footer (fallback) | `rule-based estimates — add an API key for smarter suggestions` |
| Upload error line | `✗ upload failed — {server message}` |
| Chat error bubble | `Couldn't reach the agent — {message}. Check that the backend is running.` |

---

## 11. Implementation plan

Work in this order; the app must run after every phase (`npm run dev` in `frontend/`,
backend on `127.0.0.1:8787`).

1. **Foundations** — `index.html` (fonts, title), `index.css` (`@theme` tokens),
   `npm i lucide-react`. Nothing visually depends on this yet; verify the app still boots.
2. **Re-skin in place** — sweep every component replacing slate/indigo/emerald/rose/amber
   utilities with token classes, radii per §2, emoji → lucide, Recharts hexes, focus styles.
   The app should now look like the terminal-ledger theme with the old layout.
3. **Layout + status line** — reorder `App.jsx` per §3, build the topbar status line and
   busy-state plumbing.
4. **Signature surfaces** — `AgentLog.jsx` (§4), chat work receipts (§6), approval queue
   with the approve step (§5), evidence drawer (§8).
5. **Detail pass** — KPI ledger strip, subscription ledger table with price-hike marks,
   insights `llm_used` footer, empty states, copy sweep (§10), delete `DuplicateBanner`.

No backend changes are required for any of this. (Optional stretch, only if asked: SSE for
real streaming; confidence scores need backend support and are out of scope.)

### QA checklist (verify before calling it done)

- [ ] `grep -r "slate-\|indigo-" frontend/src` returns nothing.
- [ ] No emoji remain in any component (`grep -rP "[\x{1F300}-\x{1FAFF}]" frontend/src`).
- [ ] Ask a chat question → work receipt tokens render above the answer; clicking a source
      chip opens the evidence drawer.
- [ ] Upload a file → agent log plays staggered lines, `[view source]` works, dashboard refreshes.
- [ ] Draft → Approve on an action → status tag flips to `approved`, mailto opens.
- [ ] Tab through the page — amber focus outline visible on every control; Escape closes
      the drawer.
- [ ] Emulate `prefers-reduced-motion: reduce` — no pulse, no stagger, drawer appears instantly.
- [ ] Layout holds at 375px wide (columns stack, chart scrolls or shrinks, topbar wraps).
- [ ] Works with no LLM key (seed data): insights show the rule-based footer, chat errors
      gracefully per §10.

---

## 12. Do / Don't

**Do:** hairline borders on warm black · amber only for agent presence and primary actions ·
green only for money saved · red only for traps and errors · mono for anything the agent
produced · tabular numerals for every amount · sentence case · dense, calm, square.

**Don't:** gradients · glassmorphism/backdrop-blur · purple or indigo anywhere · acid green ·
tinted card backgrounds as decoration · emoji · pill-shaped anything · `rounded-xl`+ ·
shadows on cards · uppercase tracking-wide headings · skeleton loaders · typewriter effects ·
fake streaming presented as real · new npm dependencies beyond `lucide-react`.
