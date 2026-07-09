import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { inr } from '../api'

const CATEGORY_ICONS = {
  music: '🎵', video: '🎬', food: '🍔', cloud: '☁️', news: '📰', fitness: '💪', other: '📦',
}

function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / 86400000)
}

export function StatsBar({ stats }) {
  const cards = [
    { label: 'Active subscriptions', value: stats?.active_subscriptions ?? '—' },
    { label: 'Subscription cost / month', value: inr(stats?.monthly_subscription_cost) },
    { label: 'Spent this month', value: inr(stats?.spend_this_month) },
    { label: 'Emails & docs ingested', value: stats?.items_ingested ?? '—' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-xs text-slate-400">{c.label}</div>
          <div className="text-xl font-semibold text-slate-100 mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  )
}

export function DuplicateBanner({ insights }) {
  const groups = insights?.duplicate_groups || []
  if (!groups.length) return null
  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3">
      <div className="font-semibold text-amber-300 text-sm">
        ⚠️ {groups.length} overlapping subscription {groups.length > 1 ? 'groups' : 'group'} detected
      </div>
      <div className="mt-1 space-y-0.5 text-sm text-amber-100/80">
        {groups.map((g) => (
          <div key={g.category}>
            <span className="capitalize">{g.category}</span>:{' '}
            {g.services.map((s) => s.name).join(' + ')} — {inr(g.combined_monthly_cost)}/mo combined
          </div>
        ))}
      </div>
    </div>
  )
}

export function SubscriptionList({ subscriptions, onShowSource }) {
  return (
    <Section title="Subscriptions">
      <div className="grid sm:grid-cols-2 gap-2">
        {subscriptions.map((s) => (
          <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="text-2xl">{CATEGORY_ICONS[s.category] || '📦'}</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-100 truncate">{s.name}</div>
              <div className="text-xs text-slate-400">
                {inr(s.amount)} / {s.billing_cycle === 'yearly' ? 'yr' : 'mo'}
                {s.next_renewal && <> · renews {s.next_renewal}</>}
              </div>
            </div>
            {s.source_id && <SourceDot onClick={() => onShowSource(s.source_id)} />}
          </div>
        ))}
        {!subscriptions.length && <Empty msg="No subscriptions found yet." />}
      </div>
    </Section>
  )
}

export function RenewalList({ insights, onShowSource }) {
  const items = insights?.upcoming_renewals || []
  return (
    <Section title="Coming up">
      <div className="space-y-1.5">
        {items.map((r, i) => {
          const d = daysUntil(r.date)
          const urgent = d != null && d <= 14
          return (
            <div key={i} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${urgent ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700/50 text-slate-300'}`}>
                {d != null ? `${d}d` : '—'}
              </span>
              <span className="flex-1 truncate text-slate-200">{r.name}</span>
              <span className="text-slate-400 whitespace-nowrap">{inr(r.amount)}</span>
              <span className="text-xs text-slate-500 whitespace-nowrap">{r.date}</span>
              {r.source?.source_id && <SourceDot onClick={() => onShowSource(r.source.source_id)} />}
            </div>
          )
        })}
        {!items.length && <Empty msg="Nothing due in the next 45 days." />}
      </div>
    </Section>
  )
}

export function SpendChart({ data }) {
  return (
    <Section title="Monthly spend">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={55}
                   tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
            <Tooltip cursor={{ fill: '#1e293b' }} formatter={(v) => inr(v)}
                     contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
            <Bar dataKey="total" fill="#818cf8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

export function InsightsPanel({ insights }) {
  const suggestions = insights?.suggestions || []
  return (
    <Section title="Ways to save">
      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-emerald-300 text-sm">💡 {s.title}</div>
              {s.estimated_monthly_saving != null && (
                <div className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                  save {inr(s.estimated_monthly_saving)}/mo
                </div>
              )}
            </div>
            <div className="text-sm text-slate-300 mt-1">{s.detail}</div>
          </div>
        ))}
        {!suggestions.length && <Empty msg="No suggestions yet — ingest some data first." />}
      </div>
    </Section>
  )
}

export function SourceDot({ onClick }) {
  return (
    <button onClick={onClick} title="View source email/document"
            className="text-xs text-indigo-400 hover:text-indigo-200 border border-indigo-500/40 rounded-full px-2 py-0.5 whitespace-nowrap cursor-pointer">
      src
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</h2>
      {children}
    </div>
  )
}

function Empty({ msg }) {
  return <div className="text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl px-4 py-6 text-center">{msg}</div>
}
