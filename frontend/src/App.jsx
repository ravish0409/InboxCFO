import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, MessageSquareText, Upload } from 'lucide-react'
import { api } from './api'
import { btn, focusRing } from './ui'
import { Sidebar, MobileNav, VIEWS } from './components/Nav'
import { Chat } from './components/Chat'
import { EvidenceDrawer } from './components/Evidence'
import { ActionCenter } from './components/ActionCenter'
import { AgentLog } from './components/AgentLog'
import {
  ApprovalsPreview, InsightsGrid, KpiGrid, RenewalsCard, SpendChart, SubscriptionsTable,
} from './components/Dashboard'

const EXTRACT_NOUNS = {
  subscriptions: ['subscription', 'subscriptions'],
  bills: ['bill', 'bills'],
  transactions: ['transaction', 'transactions'],
  documents: ['document', 'documents'],
}

function summarizeExtracted(extracted) {
  const parts = []
  for (const [key, [one, many]] of Object.entries(EXTRACT_NOUNS)) {
    const n = extracted?.[key] || 0
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  return parts.join(' · ') || 'no new records'
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Fold one live SSE progress event into the agent-activity job. Events stream in
// from /api/sync/stream and /api/upload/stream as the agent reads each message.
function reduceJobEvent(job, ev) {
  switch (ev.type) {
    case 'status': // connecting / listing — a transient activity label
      return { ...job, startLabel: ev.message }
    case 'start':
      return {
        ...job,
        progress: { current: 0, total: ev.total },
        startLabel: ev.total ? `found ${plural(ev.total, 'item', 'items')}…` : 'nothing new to read',
      }
    case 'item': // the agent is now analyzing this message
      return {
        ...job,
        startLabel: `analyzing ${ev.title}…`,
        progress: { current: ev.index + 1, total: ev.total },
      }
    case 'line': // a finished row — append it live
      return {
        ...job,
        lines: [
          ...(job.lines || []),
          {
            file: ev.file,
            summary: ev.summary ?? summarizeExtracted(ev.extracted),
            skipped: ev.skipped,
            source_id: ev.source_id,
            error: ev.error,
          },
        ],
      }
    case 'done':
      return {
        ...job,
        running: false,
        progress: null,
        summary: `filed ${plural(ev.new, 'new item', 'new items')} · re-checking traps…`,
      }
    case 'error':
      return { ...job, running: false, progress: null, error: ev.message }
    default: // 'close' and anything unknown — no state change
      return job
  }
}

export default function App() {
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [spend, setSpend] = useState([])
  const [insights, setInsights] = useState(null)
  const [actionItems, setActionItems] = useState([])
  const [sourceId, setSourceId] = useState(null)
  const [busy, setBusy] = useState(null)   // sidebar status verb, e.g. 'reading inbox…'
  const [lastSync, setLastSync] = useState(null)
  const [job, setJob] = useState(null)     // agent activity toast
  const [view, setView] = useState(() => {
    const h = window.location.hash.slice(1)
    return VIEWS.some((v) => v.id === h) ? h : 'overview'
  })
  const [chatOpen, setChatOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  )
  const fileRef = useRef(null)
  const jobCounter = useRef(0)
  const jobAbort = useRef(null)   // AbortController for the in-flight sync/upload stream

  const refresh = useCallback(async () => {
    const [st, subs, sp, ins, act] = await Promise.allSettled([
      api.stats(), api.subscriptions(), api.spendByMonth(), api.insights(), api.actions(),
    ])
    if (st.status === 'fulfilled') setStats(st.value)
    if (subs.status === 'fulfilled') setSubscriptions(subs.value)
    if (sp.status === 'fulfilled') setSpend(sp.value)
    if (ins.status === 'fulfilled') setInsights(ins.value)
    if (act.status === 'fulfilled') setActionItems(act.value)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Keep the current view in the URL hash so a refresh lands on the same page.
  useEffect(() => {
    window.history.replaceState(null, '', `#${view}`)
  }, [view])

  // Apply a live event to the job, but only if it still belongs to the current run —
  // a newer sync/upload started meanwhile invalidates older events.
  const applyJobEvent = useCallback((id, ev) => {
    setJob((prev) => (prev && prev.id === id ? reduceJobEvent(prev, ev) : prev))
  }, [])

  // Stop the running sync/upload: abort the stream. The stream promise then resolves,
  // and the handler below detects the aborted signal to mark the job as stopped.
  function handleStopJob() {
    jobAbort.current?.abort()
  }

  async function handleSync() {
    const id = ++jobCounter.current
    const ctrl = new AbortController()
    jobAbort.current = ctrl
    setBusy('reading inbox…')
    setJob({ id, running: true, startLabel: 'checking inbox…', lines: [], progress: null })
    try {
      await api.syncStream((ev) => applyJobEvent(id, ev), ctrl.signal)
      // Stream closed — either cleanly (a `done`/`error` event already set running:false)
      // or because the user hit Stop (aborted signal). Guard against a stream that ends
      // without a terminal event, and label a user-initiated stop.
      setJob((prev) => (prev && prev.id === id
        ? { ...prev, running: false, ...(ctrl.signal.aborted ? { progress: null, startLabel: null, summary: 'stopped' } : {}) }
        : prev))
      setLastSync(new Date())
      await refresh()
    } catch (e) {
      setJob((prev) => (prev && prev.id === id
        ? { ...prev, running: false, error: `sync failed — ${e.message}` } : prev))
    } finally {
      if (jobAbort.current === ctrl) jobAbort.current = null
      setBusy(null)
    }
  }

  async function handleUpload(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    const id = ++jobCounter.current
    const ctrl = new AbortController()
    jobAbort.current = ctrl
    setBusy('reading files…')
    setJob({
      id, running: true, lines: [], progress: null,
      startLabel: `reading ${plural(files.length, 'file', 'files')}…`,
    })
    try {
      await api.uploadStream(files, (ev) => applyJobEvent(id, ev), ctrl.signal)
      setJob((prev) => (prev && prev.id === id
        ? { ...prev, running: false, ...(ctrl.signal.aborted ? { progress: null, startLabel: null, summary: 'stopped' } : {}) }
        : prev))
      setLastSync(new Date())
      await refresh()
    } catch (e2) {
      setJob((prev) => (prev && prev.id === id
        ? { ...prev, running: false, error: `upload failed — ${e2.message}` } : prev))
    } finally {
      if (jobAbort.current === ctrl) jobAbort.current = null
      setBusy(null)
    }
  }

  const active = actionItems.filter((a) => a.status !== 'dismissed')
  const pending = active.filter((a) => a.status !== 'approved')
  const meta = VIEWS.find((v) => v.id === view) || VIEWS[0]

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      <MobileNav view={view} onNavigate={setView} pendingCount={pending.length}
                 chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} />
      <Sidebar view={view} onNavigate={setView} pendingCount={pending.length}
               stats={stats} busy={busy} lastSync={lastSync} />

      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        <header className="shrink-0 bg-card border-b border-line px-4 lg:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 mr-auto leading-tight">
            <h1 className="text-base font-semibold text-ink">{meta.label}</h1>
            <p className="text-xs text-faint truncate">{meta.sub}</p>
          </div>

          <input ref={fileRef} type="file" multiple accept=".eml,.pdf,.txt" className="hidden" onChange={handleUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={btn.secondary}>
            <Upload size={15} strokeWidth={1.75} /> Upload
          </button>
          <button onClick={handleSync} disabled={!!busy} className={btn.primary}>
            <Mail size={15} strokeWidth={1.75} /> Sync inbox
          </button>
          <button
            onClick={() => setChatOpen((o) => !o)}
            aria-pressed={chatOpen}
            aria-label="Toggle assistant"
            className={`hidden lg:inline-flex items-center justify-center p-2 rounded-lg border transition-colors duration-150 cursor-pointer ${focusRing} ${
              chatOpen ? 'border-accent text-accent bg-accent-soft' : 'border-line-strong text-dim hover:text-ink hover:bg-inset'
            }`}
          >
            <MessageSquareText size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-6">
            {view === 'overview' && (
              <>
                <KpiGrid stats={stats} pending={pending} onGotoApprovals={() => setView('approvals')} />
                <div className="grid lg:grid-cols-3 gap-4 items-stretch">
                  <div className="lg:col-span-2">
                    <SpendChart data={spend} />
                  </div>
                  <RenewalsCard insights={insights} onShowSource={setSourceId} />
                </div>
                <ApprovalsPreview items={pending} onGoto={() => setView('approvals')} />
                <InsightsGrid insights={insights} />
              </>
            )}

            {view === 'approvals' && (
              <ActionCenter items={actionItems} onShowSource={setSourceId}
                            onRefresh={refresh} onBusy={setBusy} />
            )}

            {view === 'subscriptions' && (
              <SubscriptionsTable
                subscriptions={subscriptions.filter((s) => s.status === 'active')}
                stats={stats} onShowSource={setSourceId}
              />
            )}
          </div>
        </div>
      </main>

      {chatOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30 xl:hidden" onClick={() => setChatOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-card border-l border-line shadow-2xl flex flex-col min-h-0 xl:static xl:z-auto xl:w-[380px] xl:max-w-none xl:shrink-0 xl:shadow-none">
            <Chat onShowSource={setSourceId} onBusy={setBusy} onClose={() => setChatOpen(false)} />
          </aside>
        </>
      )}

      <AgentLog job={job} onShowSource={setSourceId} onStop={handleStopJob} onDismiss={() => setJob(null)} />
      <EvidenceDrawer sourceId={sourceId} onClose={() => setSourceId(null)} />
    </div>
  )
}
