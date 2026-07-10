import { Landmark, LayoutGrid, MessageSquareText, Repeat2, ShieldCheck } from 'lucide-react'
import { fmtTime } from '../api'
import { focusRing } from '../ui'

export const VIEWS = [
  { id: 'overview', label: 'Overview', sub: 'What your inbox says about your money', icon: LayoutGrid },
  { id: 'approvals', label: 'Approvals', sub: 'The agent drafts, you approve — nothing sends itself', icon: ShieldCheck },
  { id: 'subscriptions', label: 'Subscriptions', sub: 'Every recurring charge found in your email', icon: Repeat2 },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0">
        <Landmark size={16} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold text-ink truncate">Inbox CFO</div>
        <div className="text-[11px] text-faint truncate">Finance agent for your inbox</div>
      </div>
    </div>
  )
}

function NavBadge({ count }) {
  if (!count) return null
  return (
    <span className="ml-auto min-w-5 text-center font-mono text-[11px] font-medium rounded-full px-1.5 py-0.5 bg-alert-soft text-alert">
      {count}
    </span>
  )
}

export function Sidebar({ view, onNavigate, pendingCount, stats, busy, lastSync }) {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-card border-r border-line">
      <div className="px-4 py-4 border-b border-line">
        <Brand />
      </div>

      <nav className="px-3 py-3 space-y-1" aria-label="Main">
        {VIEWS.map((v) => {
          const active = view === v.id
          return (
            <button
              key={v.id}
              onClick={() => onNavigate(v.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer ${focusRing} ${
                active ? 'bg-inset text-ink font-medium' : 'text-dim hover:text-ink hover:bg-inset/60'
              }`}
            >
              <v.icon size={16} strokeWidth={1.75} className={active ? 'text-accent' : ''} />
              {v.label}
              {v.id === 'approvals' && <NavBadge count={pendingCount} />}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto px-4 py-4 border-t border-line space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-dim">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${busy ? 'bg-warn motion-safe:animate-pulse' : 'bg-gain'}`} />
          <span className="truncate">{busy || 'Watching your inbox'}</span>
        </div>
        <div className="font-mono text-[11px] text-faint">
          {stats?.items_ingested ?? 0} sources · last sync {lastSync ? fmtTime(lastSync) : '—'}
        </div>
      </div>
    </aside>
  )
}

export function MobileNav({ view, onNavigate, pendingCount, onToggleChat, chatOpen }) {
  return (
    <div className="lg:hidden shrink-0 bg-card border-b border-line">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <Brand />
        <button
          onClick={onToggleChat}
          aria-pressed={chatOpen}
          aria-label="Toggle assistant"
          className={`p-2 rounded-lg border transition-colors duration-150 cursor-pointer ${focusRing} ${
            chatOpen ? 'border-accent text-accent bg-accent-soft' : 'border-line-strong text-dim hover:text-ink'
          }`}
        >
          <MessageSquareText size={16} strokeWidth={1.75} />
        </button>
      </div>
      <nav className="flex gap-1 px-3 pb-2 overflow-x-auto" aria-label="Main">
        {VIEWS.map((v) => {
          const active = view === v.id
          return (
            <button
              key={v.id}
              onClick={() => onNavigate(v.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 cursor-pointer ${focusRing} ${
                active ? 'bg-inset text-ink font-medium' : 'text-dim hover:text-ink'
              }`}
            >
              {v.label}
              {v.id === 'approvals' && <NavBadge count={pendingCount} />}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
