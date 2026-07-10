import { useEffect, useRef, useState } from 'react'
import { Bot, History, SendHorizonal, SquarePen, Trash2, X } from 'lucide-react'
import { api, fmtRel } from '../api'
import { useChatSessions } from '../chatStore'
import { EvidenceChip } from './Evidence'
import { Markdown } from './Markdown'
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

// Three pulsing dots shown in the assistant bubble before the first token arrives.
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full bg-faint motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

// The saved-conversation list. Replaces the message area when the user opens history.
function HistoryPanel({ sessions, activeId, onOpen, onRemove, onClose }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
      {!sessions.length && (
        <p className="text-sm text-faint px-1 py-2">No saved conversations yet.</p>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors duration-150 ${
            s.id === activeId ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-inset'
          }`}
        >
          <button
            onClick={() => { onOpen(s.id); onClose() }}
            className={`min-w-0 flex-1 text-left cursor-pointer ${focusRing} rounded`}
          >
            <div className="text-sm text-ink truncate">{s.title}</div>
            <div className="text-[11px] text-faint">{fmtRel(s.updated_at)}</div>
          </button>
          <button
            onClick={() => onRemove(s.id)}
            aria-label="Delete conversation"
            className={`shrink-0 text-faint hover:text-alert transition-colors duration-150 rounded p-1 cursor-pointer ${focusRing}`}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Chat({ onShowSource, onBusy, onClose }) {
  const {
    sessions, activeId, commit, startNew, open, remove,
    fetchMessages, takeSkipLoad, markLoaded,
  } = useChatSessions()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // The conversation `messages` currently belong to; kept in step with activeId so a
  // commit never fires with a stale (wrong-conversation) message list mid-load.
  const [loadedFor, setLoadedFor] = useState(null)
  const bottomRef = useRef(null)

  // Load a conversation's messages whenever the active conversation changes
  // (startup, switching from history, or starting a new chat).
  useEffect(() => {
    if (activeId == null) { setMessages([]); setLoadedFor(null); return }
    // We just created/saved these locally — keep them, don't refetch and overwrite.
    if (takeSkipLoad(activeId)) { setLoadedFor(activeId); return }
    let cancelled = false
    setLoadedFor(undefined) // loading — suppresses commit until the fetch lands
    fetchMessages(activeId).then((msgs) => {
      if (cancelled) return
      setMessages(msgs.map((m) => ({ ...m })))
      markLoaded(activeId, msgs)
      setLoadedFor(activeId)
    })
    return () => { cancelled = true }
  }, [activeId, fetchMessages, takeSkipLoad, markLoaded])

  // Persist after each completed turn — gated on `!busy` (never mid-stream) and on the
  // messages actually belonging to the active conversation.
  useEffect(() => {
    if (!busy && loadedFor === activeId) commit(messages)
  }, [busy, messages, loadedFor, activeId, commit])

  function handleNewChat() {
    setShowHistory(false)
    startNew()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question) {
    if (!question.trim() || busy) return
    setInput('')
    const history = messages.map(({ role, content }) => ({ role, content }))
    // Append the user turn plus an empty assistant placeholder we stream into.
    setMessages((m) => [
      ...m,
      { role: 'user', content: question },
      { role: 'assistant', content: '', trace: [], streaming: true },
    ])
    setBusy(true)
    onBusy?.('checking your data…')

    // Patch the in-flight assistant message (always the last one).
    const patch = (fn) => setMessages((m) => {
      const copy = m.slice()
      copy[copy.length - 1] = fn(copy[copy.length - 1])
      return copy
    })

    try {
      await api.chatStream(question, history, {
        onTool: (tool) => patch((a) => ({ ...a, trace: [...(a.trace || []), { tool }] })),
        onToken: (text) => patch((a) => ({ ...a, content: (a.content || '') + text })),
        onSources: (sources) => patch((a) => ({ ...a, sources })),
        // A mid-stream server error: keep whatever streamed, otherwise show the reason.
        onError: (message) =>
          patch((a) => ({ ...a, error: !a.content, content: a.content || `The agent couldn't answer — ${message}` })),
      })
    } catch (e) {
      // The server's message (quota exhausted, no key, etc.) is already actionable;
      // only the offline case needs the "is the backend running?" nudge.
      patch((a) => ({
        ...a, error: true,
        content: e.offline ? e.message : `The agent couldn't answer — ${e.message}`,
      }))
    } finally {
      patch((a) => ({ ...a, streaming: false }))
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
          <div className="text-sm font-semibold text-ink">{showHistory ? 'Chat history' : 'Assistant'}</div>
          <div className="text-[11px] text-faint truncate">
            {showHistory ? 'Your saved conversations' : 'Every answer cites the emails it came from'}
          </div>
        </div>
        <button
          onClick={() => setShowHistory((h) => !h)}
          aria-label="Chat history"
          aria-pressed={showHistory}
          title="Chat history"
          className={`transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing} ${
            showHistory ? 'text-accent' : 'text-faint hover:text-ink'
          }`}
        >
          <History size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleNewChat}
          aria-label="New chat"
          title="New chat"
          className={`text-faint hover:text-ink transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing}`}
        >
          <SquarePen size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close assistant"
          className={`text-faint hover:text-ink transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing}`}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {showHistory && (
        <HistoryPanel
          sessions={sessions}
          activeId={activeId}
          onOpen={open}
          onRemove={remove}
          onClose={() => setShowHistory(false)}
        />
      )}
      {!showHistory && (
      <>


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

        {messages.map((m, i) => {
          const isAssistant = m.role === 'assistant'
          const plainText = m.role === 'user' || m.error
          return (
            <div key={i} className="fade-in">
              {isAssistant && !m.error && <WorkReceipt trace={m.trace} />}
              <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] text-sm px-3.5 py-2.5 ${plainText ? 'whitespace-pre-wrap' : ''} ${
                  m.role === 'user'
                    ? 'bg-ink text-white rounded-2xl rounded-br-md'
                    : m.error
                      ? 'bg-alert-soft text-alert rounded-2xl rounded-bl-md'
                      : 'bg-inset text-ink rounded-2xl rounded-bl-md'
                }`}>
                  {isAssistant && !m.error
                    ? (m.content
                        ? <Markdown>{m.content}</Markdown>
                        : m.streaming && <TypingDots />)
                    : m.content}
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
          )
        })}
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
      </>
      )}
    </div>
  )
}
