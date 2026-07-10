import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  ChevronRight, Clapperboard, Cloud, CircleDot, Dumbbell, Lightbulb, Music,
  Newspaper, ShoppingBag, Zap,
} from 'lucide-react'
import { inr, money, toINR, fmtTime } from '../api'
import { EvidenceChip } from './Evidence'
import { focusRing } from '../ui'

const CATEGORY_ICONS = {
  music: Music, video: Clapperboard, food: ShoppingBag, cloud: Cloud,
  news: Newspaper, fitness: Dumbbell, other: CircleDot, utility: Zap,
}

function CategoryIcon({ category, className }) {
  const Icon = CATEGORY_ICONS[category] || CircleDot
  return <Icon size={15} strokeWidth={1.75} className={className} />
}

function daysUntil(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / 86400000)
}

// A titled white card — the one container every dashboard block lives in.
export function Card({ title, action, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`bg-card border border-line rounded-xl ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Empty({ msg }) {
  return <div className="text-sm text-faint text-center py-8">{msg}</div>
}

// ── Overview ────────────────────────────────────────────────────────────────

export function KpiGrid({ stats, pending, onGotoApprovals }) {
  const savings = pending.reduce((s, a) => s + toINR(a.estimated_saving, a.currency), 0)
  const kpis = [
    {
      label: 'Recurring / month',
      value: inr(stats?.monthly_subscription_cost),
      sub: `${stats?.active_subscriptions ?? 0} active subscriptions`,
    },
    {
      label: 'Spent this month',
      value: inr(stats?.spend_this_month),
      sub: 'from emails & receipts',
    },
    {
      label: 'Needs approval',
      value: pending.length,
      sub: savings > 0 ? `save up to ${inr(savings)}/mo` : 'nothing pending',
      alert: pending.length > 0,
      onClick: onGotoApprovals,
    },
    {
      label: 'Sources on file',
      value: stats?.items_ingested ?? '—',
      sub: 'emails & documents read',
    },
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {kpis.map((k) => {
        const inner = (
          <>
            <div className="text-xs font-medium text-faint">{k.label}</div>
            <div className={`font-mono text-2xl font-medium tabular-nums mt-1.5 ${k.alert ? 'text-alert' : 'text-ink'}`}>
              {k.value}
            </div>
            <div className={`text-xs mt-1 ${k.alert && k.sub !== 'nothing pending' ? 'text-gain' : 'text-faint'}`}>
              {k.sub}
            </div>
          </>
        )
        return k.onClick ? (
          <button
            key={k.label}
            onClick={k.onClick}
            className={`bg-card border border-line rounded-xl p-4 text-left transition-colors duration-150 hover:border-line-strong cursor-pointer ${focusRing}`}
          >
            {inner}
          </button>
        ) : (
          <div key={k.label} className="bg-card border border-line rounded-xl p-4">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

export function SpendChart({ data }) {
  const tick = { fill: '#8E8A80', fontSize: 11, fontFamily: 'IBM Plex Mono' }
  return (
    <Card title="Monthly spend" className="h-full flex flex-col" bodyClass="p-4 flex-1 min-h-64">
      {data?.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ECEAE5" vertical={false} />
            <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={52}
                   tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
            <Tooltip cursor={{ fill: '#F1EFEA' }} formatter={(v) => [inr(v), 'spend']}
                     contentStyle={{ background: '#FFFFFF', border: '1px solid #D9D6CE', borderRadius: 8, fontFamily: 'IBM Plex Mono', fontSize: 12 }}
                     labelStyle={{ color: '#636057' }} />
            <Bar dataKey="total" fill="#1B6B4C" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty msg="No spend data yet — sync your inbox to get started." />
      )}
    </Card>
  )
}

export function RenewalsCard({ insights, onShowSource }) {
  const items = (insights?.upcoming_renewals || []).slice(0, 6)
  return (
    <Card title="Upcoming renewals" className="h-full" bodyClass="">
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((r, i) => {
            const d = daysUntil(r.date)
            const urgent = d != null && d <= 14
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{r.name}</div>
                  <div className={`text-xs ${urgent ? 'text-alert font-medium' : 'text-faint'}`}>
                    {d != null ? (d <= 0 ? 'due today' : `in ${d} day${d === 1 ? '' : 's'}`) : r.date}
                  </div>
                </div>
                <span className="font-mono text-sm tabular-nums text-ink whitespace-nowrap">{money(r.amount, r.currency)}</span>
                {r.source?.source_id && <EvidenceChip onClick={() => onShowSource(r.source.source_id)} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty msg="Nothing due in the next 45 days." />
      )}
    </Card>
  )
}

const SEVERITY_DOT = { high: 'bg-alert', medium: 'bg-warn', low: 'bg-faint' }

export function ApprovalsPreview({ items, onGoto }) {
  const top = items.slice(0, 3)
  return (
    <Card
      title="Needs your approval"
      action={
        <button onClick={onGoto} className={`text-xs font-medium text-accent hover:underline cursor-pointer rounded ${focusRing}`}>
          View all
        </button>
      }
      bodyClass=""
    >
      {top.length ? (
        <ul className="divide-y divide-line">
          {top.map((a) => (
            <li key={a.id}>
              <button
                onClick={onGoto}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-inset/60 cursor-pointer ${focusRing}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[a.severity] || SEVERITY_DOT.low}`} />
                <span className="text-sm font-medium text-ink truncate">{a.title}</span>
                <span className="text-sm text-dim truncate hidden sm:block flex-1 min-w-0">{a.detail}</span>
                {a.estimated_saving != null && (
                  <span className="font-mono text-xs text-gain whitespace-nowrap ml-auto sm:ml-0">
                    save {money(a.estimated_saving, a.currency)}/mo
                  </span>
                )}
                <ChevronRight size={14} strokeWidth={1.75} className="text-faint shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty msg="All clear — nothing needs your approval right now." />
      )}
    </Card>
  )
}

export function InsightsGrid({ insights }) {
  const suggestions = insights?.suggestions || []
  if (!suggestions.length) return null
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Ways to save</h2>
        <span className="font-mono text-[11px] text-faint">
          {insights?.llm_used ? `generated by the agent · ${fmtTime()}` : 'rule-based estimates'}
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {suggestions.map((s, i) => (
          <div key={i} className="bg-card border border-line rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Lightbulb size={15} strokeWidth={1.75} className="text-accent shrink-0" />
                <span className="text-sm font-medium text-ink truncate">{s.title}</span>
              </div>
              {s.estimated_monthly_saving != null && (
                <span className="font-mono text-[11px] text-accent bg-accent-soft rounded-md px-1.5 py-0.5 whitespace-nowrap">
                  {money(s.estimated_monthly_saving, s.currency)}/mo
                </span>
              )}
            </div>
            <p className="text-sm text-dim mt-1.5">{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export function SubscriptionsTable({ subscriptions, stats, onShowSource }) {
  const cycleLabel = (c) => (c === 'yearly' ? 'Yearly' : c === 'weekly' ? 'Weekly' : 'Monthly')
  return (
    <Card
      title={`Active subscriptions (${subscriptions.length})`}
      action={
        <span className="font-mono text-xs text-dim tabular-nums">
          ≈ {inr(stats?.monthly_subscription_cost)}/mo total
        </span>
      }
      bodyClass="overflow-x-auto"
    >
      {subscriptions.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="font-medium px-4 py-2.5">Service</th>
              <th className="font-medium px-4 py-2.5 hidden md:table-cell">Category</th>
              <th className="font-medium px-4 py-2.5 hidden sm:table-cell">Billing</th>
              <th className="font-medium px-4 py-2.5 hidden md:table-cell">Next renewal</th>
              <th className="font-medium px-4 py-2.5 text-right">Amount</th>
              <th className="w-12" aria-label="Source" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {subscriptions.map((s) => {
              const hiked = s.previous_amount != null && s.amount != null && s.previous_amount < s.amount
              return (
                <tr key={s.id} className="hover:bg-inset/50 transition-colors duration-150">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-inset text-dim flex items-center justify-center shrink-0">
                        <CategoryIcon category={s.category} />
                      </span>
                      <span className="font-medium text-ink truncate">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-dim capitalize hidden md:table-cell">{s.category || '—'}</td>
                  <td className="px-4 py-3 text-dim hidden sm:table-cell">{cycleLabel(s.billing_cycle)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-dim hidden md:table-cell">{s.next_renewal || '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-mono tabular-nums text-ink">{money(s.amount, s.currency)}</span>
                    {hiked && (
                      <div className="font-mono text-[11px] text-alert">↑ from {money(s.previous_amount, s.currency)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.source_id && <EvidenceChip onClick={() => onShowSource(s.source_id)} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <Empty msg="Nothing tracked yet. Upload a few emails and the agent will find your subscriptions." />
      )}
    </Card>
  )
}
