import { useState } from 'react'
import {
  TimerReset, RefreshCw, TrendingUp, Copy, Scissors, CircleDot,
} from 'lucide-react'
import { api, inr, money, toINR, fmtRel } from '../api'
import { EvidenceChip } from './Evidence'
import { Empty } from './Dashboard'
import { btn } from '../ui'

const KIND_ICON = {
  trial_ending: TimerReset, renewal_upcoming: RefreshCw, price_increase: TrendingUp,
  duplicate: Copy, manual_cancel: Scissors,
}

const SEVERITY_BORDER = { high: 'border-l-alert', medium: 'border-l-warn', low: 'border-l-line-strong' }
const SEVERITY_ICON = {
  high: 'bg-alert-soft text-alert',
  medium: 'bg-warn-soft text-warn',
  low: 'bg-inset text-dim',
}

const STATUS_TAG = {
  open: 'bg-inset text-dim',
  drafted: 'bg-warn-soft text-warn',
  approved: 'bg-accent-soft text-accent',
}

function mailtoFor(item) {
  return `mailto:?subject=${encodeURIComponent('Cancellation request')}&body=${encodeURIComponent(item.draft_text || '')}`
}

export function ActionCenter({ items, onShowSource, onRefresh, onBusy }) {
  const [busy, setBusy] = useState(null) // action id currently working
  const [copied, setCopied] = useState(null)

  const open = (items || []).filter((a) => a.status !== 'dismissed')
  const pending = open.filter((a) => a.status !== 'approved')
  const savings = pending.reduce((s, a) => s + toINR(a.estimated_saving, a.currency), 0)

  async function run(id, fn, label) {
    setBusy(id)
    onBusy?.(label)
    try {
      await fn(id)
      await onRefresh?.()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(null)
      onBusy?.(null)
    }
  }

  async function approve(a) {
    setBusy(a.id)
    onBusy?.('opening email…')
    try {
      await api.approveAction(a.id)
      window.location.href = mailtoFor(a)
      await onRefresh?.()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(null)
      onBusy?.(null)
    }
  }

  async function copy(item) {
    try {
      await navigator.clipboard.writeText(item.draft_text || '')
      setCopied(item.id)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard may be blocked; the draft block is still selectable */ }
  }

  if (!open.length) {
    return (
      <div className="bg-card border border-line rounded-xl">
        <Empty msg="All clear — no traps in your inbox. The agent re-checks after every sync." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-dim">
        {pending.length} pending
        {savings > 0 && (
          <> · approve them all and save up to{' '}
            <span className="font-mono font-medium text-gain">{inr(savings)}/mo</span>
          </>
        )}
      </p>

      {open.map((a) => {
        const Icon = KIND_ICON[a.kind] || CircleDot
        const drafted = a.status === 'drafted' && a.draft_text
        const approved = a.status === 'approved'
        const hasDraft = drafted || approved
        const working = busy === a.id

        return (
          <div key={a.id} className={`bg-card border border-line border-l-2 rounded-xl p-4 ${SEVERITY_BORDER[a.severity] || SEVERITY_BORDER.low}`}>
            <div className="flex items-start gap-3">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${SEVERITY_ICON[a.severity] || SEVERITY_ICON.low}`}>
                <Icon size={15} strokeWidth={1.75} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{a.title}</span>
                  {a.estimated_saving != null && (
                    <span className="font-mono text-[11px] text-accent bg-accent-soft rounded-md px-1.5 py-0.5 whitespace-nowrap">
                      save {money(a.estimated_saving, a.currency)}{a.kind === 'price_increase' ? '' : '/mo'}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                    <span className={`text-[11px] font-medium capitalize rounded-full px-2 py-0.5 ${STATUS_TAG[a.status] || STATUS_TAG.open}`}>
                      {a.status}
                    </span>
                    {a.created_at && <span className="font-mono text-[11px] text-faint">{fmtRel(a.created_at)}</span>}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-sm text-dim">{a.detail}</span>
                  {a.source_id && <EvidenceChip onClick={() => onShowSource(a.source_id)} />}
                </div>

                {hasDraft && (
                  <div className="mt-3">
                    <div className="bg-inset border border-line rounded-lg font-mono text-xs text-dim p-3 whitespace-pre-wrap leading-relaxed">
                      {a.draft_text}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {!approved && (
                        <button onClick={() => approve(a)} disabled={working} className={btn.primarySm}>
                          {working ? 'Approving…' : 'Approve & open email'}
                        </button>
                      )}
                      <button onClick={() => copy(a)} className={btn.secondarySm}>
                        {copied === a.id ? 'Copied' : 'Copy draft'}
                      </button>
                      {!approved && a.cancel_url && (
                        <a href={a.cancel_url} target="_blank" rel="noreferrer" className={btn.secondarySm}>
                          Cancellation page ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!hasDraft && (
                  <div className="flex flex-wrap gap-2 mt-3 items-center">
                    {a.subscription_id != null && (
                      <button onClick={() => run(a.id, api.draftAction, 'drafting cancellation…')} disabled={working} className={btn.primarySm}>
                        {working ? 'Drafting…' : 'Draft cancellation'}
                      </button>
                    )}
                    <button onClick={() => run(a.id, api.dismissAction, 'dismissing…')} disabled={working} className={btn.ghostSm}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
