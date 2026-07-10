import { useEffect, useRef, useState } from 'react'
import { Bot, SendHorizonal, X } from 'lucide-react'
import { api } from '../api'
import { EvidenceChip } from './Evidence'
import { btn, focusRing } from '../ui'

const SUGGESTIONS = [
  'When does my car insurance expire?',
  'How much did I spend on Swiggy last month?',
  'Am I paying for duplicate subscriptions?',
  "What's due in the next two weeks?",
]

// Turn raw tool names into the agent's own account of what it did.
const TOOL_LABEL = {
  total_spend: 'summed spending',
  spend_by_category: 'grouped by category',
  spend_by_merchant: 'grouped by merchant',
  list_subscriptions: 'checked subscriptions',
  upcoming_renewals: 'checked renewals',
  find_duplicate_subscriptions: 'hunted duplicates',
  find_documents: 'searched documents',
  list_action_items: 'reviewed open traps',
  draft_cancellation: 'drafted cancellation',
}
const toolLabel = (t) => TOOL_LABEL[t] || t.replace(/_/g, ' ')

// The work receipt: how the assistant reached its answer, as tool-call steps.
function WorkReceipt({ trace }) {
  if (!trace?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      {trace.map((step, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-faint text-[11px]">→</span>}
          <span className="font-mono text-[11px] text-accent bg-accent-soft rounded-md px-1.5 py-0.5">
            {toolLabel(step.tool)}
          </span>
        </span>
      ))}
    </div>
  )
}

export function Chat({ onShowSource, onBusy, onClose }) {
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
    onBusy?.('checking your data…')
    try {
      const history = messages.map(({ role, content }) => ({ role, content }))
      const res = await api.chat(question, history)
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, sources: res.sources, trace: res.tool_trace }])
    } catch (e) {
      // The server's message (quota exhausted, no key, etc.) is already actionable;
      // only the offline case needs the "is the backend running?" nudge.
      setMessages((m) => [...m, {
        role: 'assistant', error: true,
        content: e.offline ? e.message : `The agent couldn't answer — ${e.message}`,
      }])
    } finally {
      setBusy(false)
      onBusy?.(null)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-line flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <Bot size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold text-ink">Assistant</div>
          <div className="text-[11px] text-faint truncate">Every answer cites the emails it came from</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close assistant"
          className={`text-faint hover:text-ink transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing}`}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {!messages.length && (
          <div className="space-y-2">
            <p className="text-sm text-dim mb-3">
              Ask anything about your subscriptions, bills, or spending — answers come from your ingested emails.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}
                      className={`block w-full text-left text-sm text-dim bg-card border border-line rounded-lg px-3 py-2 transition-colors duration-150 hover:border-line-strong hover:text-ink cursor-pointer ${focusRing}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="fade-in">
            {m.role === 'assistant' && !m.error && <WorkReceipt trace={m.trace} />}
            <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] text-sm whitespace-pre-wrap px-3.5 py-2.5 ${
                m.role === 'user'
                  ? 'bg-ink text-white rounded-2xl rounded-br-md'
                  : m.error
                    ? 'bg-alert-soft text-alert rounded-2xl rounded-bl-md'
                    : 'bg-inset text-ink rounded-2xl rounded-bl-md'
              }`}>
                {m.content}
                {!!m.sources?.length && (
                  <div className="mt-2 pt-2 border-t border-line-strong/40 flex flex-wrap gap-1.5">
                    {m.sources.slice(0, 4).map((s) => (
                      <EvidenceChip
                        key={s.source_id}
                        label={s.title}
                        title={`${s.sender || ''} ${s.date || ''}`.trim()}
                        onClick={() => onShowSource(s.source_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="fade-in">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-accent bg-accent-soft rounded-md px-2 py-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
              checking your data…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="shrink-0 p-3 border-t border-line flex gap-2"
            onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
               placeholder="Ask about your money…"
               className={`flex-1 min-w-0 bg-card border border-line-strong rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint outline-none focus:border-accent ${focusRing}`} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className={btn.primary}>
          <SendHorizonal size={15} strokeWidth={1.75} />
        </button>
      </form>
    </div>
  )
}
