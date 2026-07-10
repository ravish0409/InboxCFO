# Inbox CFO — UI Design System

**Audience:** anyone (human or AI agent) touching the frontend. This documents the system as
implemented (July 2026). Follow it when adding UI; don't reintroduce patterns from the Do/Don't list.

> History: an earlier dark "terminal ledger" theme (warm black + amber + mono everywhere) was
> implemented and rejected as unprofessional. The current system replaced it. Do not bring it back.

## 1. Product framing

Inbox CFO is a finance agent that reads your inbox, extracts subscriptions/bills/renewals,
detects traps (trials, price hikes, duplicates), and drafts cancellations for the user to
approve. The UI is a clean, professional SaaS app where the agent's work is visible but never
noisy: work receipts under chat answers, an activity toast during ingestion, provenance chips
on every extracted fact.

## 2. Architecture (app shell, not a scrolling dashboard)

`h-screen` fixed shell, each pane scrolls internally — never the page body:

```
┌─────────┬─────────────────────────────────┬──────────────┐
│ Sidebar │ Header: view title · Upload ·   │ Assistant    │
│ w-60    │         Sync · chat toggle      │ w-[380px]    │
│ nav +   ├─────────────────────────────────┤ (collapsible;│
│ status  │ Content (scrolls, max-w-6xl)    │  overlay <xl)│
└─────────┴─────────────────────────────────┴──────────────┘
```

- **Views** (state-based, synced to URL hash `#overview | #approvals | #subscriptions`,
  defined in `components/Nav.jsx` `VIEWS`):
  - **Overview** — KPI grid, monthly-spend chart + upcoming renewals, approvals preview (top 3),
    "Ways to save" grid.
  - **Approvals** — the full action queue: draft → approve → mailto handoff.
  - **Subscriptions** — ledger table with category, billing cycle, renewal date, price-hike history.
- **Assistant** — bounded right panel (`xl:` static column, below `xl:` fixed overlay with
  backdrop). Never floats free; header/messages/input each own their space, messages scroll.
- **Mobile** (`<lg`) — top bar with brand + horizontal tab nav; assistant via toggle.
- **AgentLog** — bottom-right toast replaying ingestion work line-by-line (client-paced reveal
  of an already-complete response; respect reduced motion).
- **EvidenceDrawer** — right slide-in showing raw source email/PDF text; Escape/backdrop closes.

## 3. Tokens (`src/index.css` `@theme` — never hardcode colors outside Recharts props)

| Token | Value | Use |
|---|---|---|
| `bg` | `#F7F6F3` | page |
| `card` | `#FFFFFF` | cards, panels, sidebar |
| `inset` | `#F1EFEA` | nested surfaces, hovers, assistant bubbles |
| `line` / `line-strong` | `#E8E6E0` / `#D9D6CE` | borders |
| `ink` / `ink-hover` | `#23221D` / `#3B3931` | text, primary buttons |
| `dim` / `faint` | `#636057` / `#8E8A80` | secondary / muted text |
| `accent` / `accent-soft` | `#1B6B4C` / `#E7F1EB` | brand green: links, active nav, agent tokens, savings badges |
| `gain` | `#177347` | money saved |
| `alert` / `alert-soft` | `#BE4437` / `#FAECEA` | urgent, errors, price hikes |
| `warn` / `warn-soft` | `#9C6D12` / `#F7EFDC` | medium severity, drafted status |

Recharts hexes: bar `#1B6B4C`, grid `#ECEAE5`, ticks `#8E8A80`, tooltip border `#D9D6CE`,
cursor `#F1EFEA`. Charts never animate (`isAnimationActive={false}`).

## 4. Type

- **IBM Plex Sans** — all UI text, sentence case.
- **IBM Plex Mono + `tabular-nums`** — every money figure, count, timestamp, status detail,
  tool token, and raw source text. Numbers are the product's personality; keep them mono.
- KPI figure: `font-mono text-2xl font-medium tabular-nums`. Labels: `text-xs font-medium text-faint`.

## 5. Components & conventions

- Buttons/focus come from `src/ui.js` (`btn.primary|secondary|icon|*Sm`, `focusRing`) — never
  hand-roll button classes. Primary = dark ink, not green.
- Cards: `Card` in `Dashboard.jsx` (white, `border-line`, `rounded-xl`, titled header row).
- Severity: 2px left border on approval cards (`alert`/`warn`/`line-strong`) + soft icon tile;
  status pills: open = inset/dim, drafted = warn-soft, approved = accent-soft.
- Provenance: `EvidenceChip` (mono "source" chip) on every extracted fact → `EvidenceDrawer`.
- Chat work receipt: `tool_trace` rendered as accent-soft mono tokens joined by `→`
  (labels in `Chat.jsx` `TOOL_LABEL`).
- Motion budget: 150ms color transitions, drawer slide 200ms, agent-log 300ms line stagger,
  pulse on working dots — all gated behind `usePrefersReducedMotion` / `motion-safe:`.

## 6. Do / Don't

**Do:** white cards on warm paper gray · one green accent · dark-ink primary buttons ·
mono tabular numbers · internal scrolling panes · sentence case · lucide icons at 15–16px,
strokeWidth 1.75.

**Don't:** dark theme · amber/indigo/purple · gradients or glassmorphism · emoji icons ·
tinted card backgrounds as decoration · page-level scroll of the shell · unbounded chat ·
everything on one view · chart animations · new dependencies beyond lucide-react/recharts.
