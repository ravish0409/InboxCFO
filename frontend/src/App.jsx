import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Chat } from './components/Chat'
import { SourceModal } from './components/SourceModal'
import {
  DuplicateBanner, InsightsPanel, RenewalList, SpendChart, StatsBar, SubscriptionList,
} from './components/Dashboard'

export default function App() {
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [spend, setSpend] = useState([])
  const [insights, setInsights] = useState(null)
  const [sourceId, setSourceId] = useState(null)
  const [banner, setBanner] = useState(null) // {kind: 'ok'|'err', text}
  const [working, setWorking] = useState('') // 'sync' | 'upload' | ''
  const fileRef = useRef(null)

  const refresh = useCallback(async () => {
    const [st, subs, sp, ins] = await Promise.allSettled([
      api.stats(), api.subscriptions(), api.spendByMonth(), api.insights(),
    ])
    if (st.status === 'fulfilled') setStats(st.value)
    if (subs.status === 'fulfilled') setSubscriptions(subs.value)
    if (sp.status === 'fulfilled') setSpend(sp.value)
    if (ins.status === 'fulfilled') setInsights(ins.value)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function flash(kind, text) {
    setBanner({ kind, text })
    setTimeout(() => setBanner(null), 6000)
  }

  async function handleSync() {
    setWorking('sync')
    try {
      const res = await api.sync()
      flash('ok', `Inbox synced: ${res.new} new emails, ${res.skipped_existing} already known.`)
      await refresh()
    } catch (e) {
      flash('err', e.message)
    } finally {
      setWorking('')
    }
  }

  async function handleUpload(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setWorking('upload')
    try {
      const res = await api.upload(files)
      const n = res.results.reduce((acc, r) => acc + Object.values(r.extracted).reduce((a, b) => a + b, 0), 0)
      flash('ok', `Processed ${res.results.length} file(s), extracted ${n} record(s).`)
      await refresh()
    } catch (e2) {
      flash('err', e2.message)
    } finally {
      setWorking('')
    }
  }

  return (
    <div className="min-h-screen max-w-7xl mx-auto p-4 lg:p-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 mr-auto">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-lg">💼</div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 leading-tight">Inbox CFO</h1>
            <div className="text-xs text-slate-500">Your inbox, turned into a finance dashboard</div>
          </div>
        </div>
        <input ref={fileRef} type="file" multiple accept=".eml,.pdf,.txt" className="hidden" onChange={handleUpload} />
        <button onClick={() => fileRef.current?.click()} disabled={!!working}
                className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-4 py-2 disabled:opacity-50 cursor-pointer">
          {working === 'upload' ? 'Processing…' : '📄 Upload emails / PDFs'}
        </button>
        <button onClick={handleSync} disabled={!!working}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 rounded-xl px-4 py-2 font-medium disabled:opacity-50 cursor-pointer">
          {working === 'sync' ? 'Syncing…' : '📥 Sync Inbox'}
        </button>
      </header>

      {banner && (
        <div className={`text-sm rounded-xl px-4 py-2.5 border ${
          banner.kind === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-500/10 border-rose-500/40 text-rose-200'
        }`}>
          {banner.text}
        </div>
      )}

      <StatsBar stats={stats} />
      <DuplicateBanner insights={insights} />

      <div className="grid lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="lg:col-span-2 space-y-5">
          <SubscriptionList subscriptions={subscriptions.filter((s) => s.status === 'active')}
                            onShowSource={setSourceId} />
          <div className="grid xl:grid-cols-2 gap-5">
            <RenewalList insights={insights} onShowSource={setSourceId} />
            <SpendChart data={spend} />
          </div>
          <InsightsPanel insights={insights} />
        </div>
        <div className="lg:sticky lg:top-6 h-[calc(100vh-3rem)] min-h-[480px]">
          <Chat onShowSource={setSourceId} />
        </div>
      </div>

      <SourceModal sourceId={sourceId} onClose={() => setSourceId(null)} />
    </div>
  )
}
