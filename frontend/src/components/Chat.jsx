import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const SUGGESTIONS = [
  'When does my car insurance expire?',
  'How much did I spend on Swiggy last month?',
  'Am I paying for duplicate subscriptions?',
  "What's due in the next two weeks?",
]

export function Chat({ onShowSource }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question) {
    if (!question.trim() || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: question }])
    setBusy(true)
    try {
      const history = messages.map(({ role, content }) => ({ role, content }))
      const res = await api.chat(question, history)
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, sources: res.sources, trace: res.tool_trace }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <div>
          <div className="font-semibold text-slate-100 text-sm">Ask your Inbox CFO</div>
          <div className="text-xs text-slate-500">Answers come from your ingested data, with sources</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!messages.length && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 mb-2">Try asking:</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}
                      className="block w-full text-left text-sm bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : m.error
                  ? 'bg-rose-500/10 border border-rose-500/40 text-rose-200 rounded-bl-sm'
                  : 'bg-slate-800 text-slate-200 rounded-bl-sm'
            }`}>
              {m.content}
              {!!m.sources?.length && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1.5">
                  {m.sources.slice(0, 4).map((s) => (
                    <button key={s.source_id} onClick={() => onShowSource(s.source_id)}
                            title={`${s.sender || ''} ${s.date || ''}`}
                            className="text-[11px] text-indigo-300 hover:text-indigo-100 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-2 py-0.5 truncate max-w-[220px] cursor-pointer">
                      📎 {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-slate-400 text-sm px-1">
            <span className="animate-pulse">●</span> checking your data…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="p-3 border-t border-slate-800 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
               placeholder="e.g. How much did I spend on food last month?"
               className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500" />
        <button type="submit" disabled={busy || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl px-4 text-sm font-medium cursor-pointer">
          Ask
        </button>
      </form>
    </div>
  )
}
