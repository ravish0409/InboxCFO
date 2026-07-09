import { useState } from 'react'
import { api, inr } from '../api'
import { SourceDot } from './Dashboard'

const KIND_ICON = {
  trial_ending: '⏰', renewal_upcoming: '🔁', price_increase: '📈',
  duplicate: '👯', manual_cancel: '✂️',
}

const SEVERITY = {
  high: 'bg-rose-500/10 border-rose-500/40',
  medium: 'bg-amber-500/10 border-amber-500/30',
  low: 'bg-slate-900 border-slate-800',
}

function mailtoFor(item) {
  const subject = `Cancellation request`
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(item.draft_text || '')}`
}

export function ActionCenter({ items, onShowSource, onRefresh }) {
  const [busy, setBusy] = useState(null) // action id currently working
  const [copied, setCopied] = useState(null)

  const open = (items || []).filter((a) => a.status !== 'dismissed')
  if (!open.length) return null

  async function run(id, fn) {
    setBusy(id)
    try {
      await fn(id)
      await onRefresh?.()
    } catch (e) {
      // surface minimally; parent owns the banner
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  async function copy(item) {
    try {
      await navigator.clipboard.writeText(item.draft_text || '')
      setCopied(item.id)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* clipboard may be blocked; the textarea is still selectable */ }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Needs your attention
        <span className="ml-2 text-xs font-normal normal-case text-slate-500">
          things a bank feed can't see until it's too late
        </span>
      </h2>
      <div className="space-y-2">
        {open.map((a) => {
          const drafted = a.status === 'drafted' && a.draft_text
          const working = busy === a.id
          return (
            <div key={a.id} className={`rounded-xl border px-4 py-3 ${SEVERITY[a.severity] || SEVERITY.low}`}>
              <div className="flex items-start gap-3">
                <div className="text-xl leading-none mt-0.5">{KIND_ICON[a.kind] || '🔔'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm">{a.title}</span>
                    {a.estimated_saving != null && (
                      <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5 whitespace-nowrap">
                        save {inr(a.estimated_saving)}{a.kind === 'price_increase' ? '' : '/mo'}
                      </span>
                    )}
                    {a.source?.source_id && <SourceDot onClick={() => onShowSource(a.source.source_id)} />}
                  </div>
                  <div className="text-sm text-slate-300 mt-0.5">{a.detail}</div>

                  {drafted && (
                    <div className="mt-2.5">
                      <div className="text-xs text-slate-400 mb-1">Draft cancellation email — review, then send:</div>
                      <textarea readOnly value={a.draft_text}
                                className="w-full h-32 text-sm bg-slate-950/60 border border-slate-700 rounded-lg p-2.5 text-slate-200 resize-y outline-none" />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => copy(a)}
                                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 cursor-pointer">
                          {copied === a.id ? '✓ Copied' : 'Copy'}
                        </button>
                        <a href={mailtoFor(a)}
                           className="text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-white font-medium cursor-pointer">
                          Open in email
                        </a>
                        {a.cancel_url && (
                          <a href={a.cancel_url} target="_blank" rel="noreferrer"
                             className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 cursor-pointer">
                            Cancellation page ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {!drafted && a.subscription_id != null && (
                      <button onClick={() => run(a.id, api.draftAction)} disabled={working}
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg px-3 py-1.5 text-white font-medium cursor-pointer">
                        {working ? 'Drafting…' : '✍️ Draft cancellation'}
                      </button>
                    )}
                    <button onClick={() => run(a.id, api.dismissAction)} disabled={working}
                            className="text-xs bg-slate-800/70 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 disabled:opacity-50 cursor-pointer">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
