import {
  Landmark, LayoutGrid, MessageSquareText, PanelLeftClose, PanelLeftOpen, Repeat2, ShieldCheck,
} from 'lucide-react'
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

export function Sidebar({ view, onNavigate, pendingCount, stats, busy, lastSync,
                         collapsed, onToggleCollapse }) {
  // Collapses to a slim icon-only rail (labels hidden, width narrowed) so a docked chat gets
  // room; the header button toggles it. Nav stays clickable in both states. lg+ only —
  // below lg the top MobileNav takes over.
  return (
    <aside className={`hidden lg:flex ${collapsed ? 'w-16' : 'w-60'} shrink-0 flex-col bg-card border-r border-line`}>
      <div className={`py-4 border-b border-line flex items-center ${collapsed ? 'px-0 justify-center' : 'px-4 gap-2'}`}>
        {!collapsed && <Brand />}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`shrink-0 text-faint hover:text-ink hover:bg-inset rounded-md p-1.5 transition-colors duration-150 cursor-pointer ${focusRing} ${collapsed ? '' : 'ml-auto'}`}
        >
          {collapsed
            ? <PanelLeftOpen size={16} strokeWidth={1.75} />
            : <PanelLeftClose size={16} strokeWidth={1.75} />}
        </button>
      </div>

      <nav className="px-3 py-3 space-y-1" aria-label="Main">
        {VIEWS.map((v) => {
          const active = view === v.id
          return (
            <button
              key={v.id}
              onClick={() => onNavigate(v.id)}
              aria-current={active ? 'page' : undefined}
              title={v.label}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 cursor-pointer ${focusRing} ${collapsed ? 'justify-center gap-0 px-0' : ''} ${
                active ? 'bg-inset text-ink font-medium' : 'text-dim hover:text-ink hover:bg-inset/60'
              }`}
            >
              <span className="relative shrink-0">
                <v.icon size={16} strokeWidth={1.75} className={active ? 'text-accent' : ''} />
                {/* Collapsed rail: a dot stands in for the hidden count badge. */}
                {collapsed && v.id === 'approvals' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-alert" />
                )}
              </span>
              {!collapsed && v.label}
              {!collapsed && v.id === 'approvals' && <NavBadge count={pendingCount} />}
            </button>
          )
        })}
      </nav>

      <div className={`mt-auto py-4 border-t border-line ${collapsed ? 'px-0 flex flex-col items-center' : 'px-4 space-y-1.5'}`}>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${busy ? 'bg-warn motion-safe:animate-pulse' : 'bg-gain'}`} />
          {!collapsed && <span className="truncate">{busy || 'Watching your inbox'}</span>}
        </div>
        {!collapsed && (
          <div className="font-mono text-[11px] text-faint">
            {stats?.items_ingested ?? 0} sources · last sync {lastSync ? fmtTime(lastSync) : '—'}
          </div>
        )}
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
