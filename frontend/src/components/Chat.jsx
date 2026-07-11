import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight, BellRing, Bot, CalendarClock, Copy, History, IndianRupee,
  Receipt, Scissors, SendHorizonal, SquarePen, Trash2, X,
} from 'lucide-react'
import { api, fmtRel } from '../api'
import { useChatSessions } from '../chatStore'
import { EvidenceChip } from './Evidence'
import { Markdown } from './Markdown'
import { ChatChart } from './ChatChart'
import { btn, focusRing } from '../ui'

// Each starter carries a lucide icon and a short category so the empty state reads
// as a set of capabilities, not a plain list of strings.
const SUGGESTIONS = [
  { icon: CalendarClock, tag: 'Renewals', text: 'When does my car insurance expire?' },
  { icon: Receipt, tag: 'Spending', text: 'How much did I spend on Swiggy last month?' },
  { icon: Copy, tag: 'Waste', text: 'Am I paying for duplicate subscriptions?' },
  { icon: BellRing, tag: 'Upcoming', text: "What's due in the next two weeks?" },
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
  render_chart: 'drew a chart',
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

// An actionable cancellation draft the agent produced in chat — mirrors the Action
// Center's approve/copy controls so the user can act without switching tabs. The draft
// text itself is already in the message; this is just the button row.
function CancelActionCard({ action }) {
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function approve() {
    setApproving(true)
    try {
      if (action.id != null) await api.approveAction(action.id)
      setApproved(true)
      if (action.mailto) window.location.href = action.mailto  // opens the mail client
    } catch (e) {
      console.error(e)
    } finally {
      setApproving(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(action.draft_text || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard may be blocked; the draft is still selectable above */ }
  }

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-card p-2.5">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-dim">
        <Scissors size={12} strokeWidth={1.75} className="text-accent" />
        Cancel {action.subscription}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={approve} disabled={approving || approved} className={btn.primarySm}>
          {approved ? 'Approved ✓' : approving ? 'Opening…' : 'Approve & open email'}
        </button>
        <button onClick={copy} className={btn.secondarySm}>
          {copied ? 'Copied' : 'Copy draft'}
        </button>
        {action.cancel_url && (
          <a href={action.cancel_url} target="_blank" rel="noreferrer" className={btn.secondarySm}>
            Cancellation page ↗
          </a>
        )}
      </div>
    </div>
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
          className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors duration-150 ${s.id === activeId ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-inset'
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
  const inputRef = useRef(null)

  // Grow the textarea with its content, up to a cap, then let it scroll — the
  // standard chat-composer behaviour (ChatGPT/Slack).
  function autosize() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  useEffect(autosize, [input])

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
        onChart: (chart) => patch((a) => ({ ...a, charts: [...(a.charts || []), chart] })),
        onAction: (action) => patch((a) => ({ ...a, actions: [...(a.actions || []), action] })),
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
          className={`transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing} ${showHistory ? 'text-accent' : 'text-faint hover:text-ink'
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
              <div className="h-full flex flex-col justify-center py-6">
                {/* Identity + greeting — the assistant introduces itself before any turn. */}
                <div className="text-center mb-7 fade-in">
                  <span className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-soft text-accent mb-4 ring-1 ring-accent/15">
                    <Bot size={26} strokeWidth={1.75} />
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white ring-2 ring-card motion-safe:animate-pulse">
                      <IndianRupee size={11} strokeWidth={2.25} />
                    </span>
                  </span>
                  <h2 className="text-lg font-semibold text-ink">Your money, answered.</h2>
                  <p className="text-sm text-dim mt-1.5 max-w-[16rem] mx-auto leading-relaxed">
                    Ask about subscriptions, bills, or spending — every answer cites the emails it came from.
                  </p>
                </div>

                <p className="text-[11px] font-medium uppercase tracking-wide text-faint px-1 mb-2">
                  Try asking
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s.text}
                      onClick={() => ask(s.text)}
                      style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
                      className={`fade-in group flex w-full items-center gap-3 text-left bg-card border border-line rounded-xl px-3 py-2.5 transition-all duration-150 hover:border-accent/40 hover:bg-accent-soft/40 cursor-pointer ${focusRing}`}
                    >
                      <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-inset text-dim transition-colors duration-150 group-hover:bg-accent-soft group-hover:text-accent">
                        <s.icon size={16} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-medium uppercase tracking-wide text-faint">{s.tag}</span>
                        <span className="block text-sm text-dim leading-snug group-hover:text-ink transition-colors duration-150">{s.text}</span>
                      </span>
                      <ArrowUpRight
                        size={15}
                        strokeWidth={1.75}
                        className="shrink-0 text-faint opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-accent"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const isAssistant = m.role === 'assistant'
              const plainText = m.role === 'user' || m.error
              return (
                <div key={i} className="fade-in">
                  {isAssistant && !m.error && <WorkReceipt trace={m.trace} />}
                  <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] text-sm px-3.5 py-2.5 ${plainText ? 'whitespace-pre-wrap' : ''} ${m.role === 'user'
                      ? 'bg-ink text-white rounded-2xl rounded-br-md'
                      : m.error
                        ? 'bg-alert-soft text-alert rounded-2xl rounded-bl-md'
                        : 'bg-inset text-ink rounded-2xl rounded-bl-md'
                      }`}>
                      {isAssistant && !m.error
                        ? (m.content
                          ? <Markdown>{m.content}</Markdown>
                          : m.streaming && !m.charts?.length && !m.actions?.length && <TypingDots />)
                        : m.content}
                      {isAssistant && !m.error && m.charts?.map((chart, ci) => (
                        <ChatChart key={ci} chart={chart} />
                      ))}
                      {isAssistant && !m.error && m.actions?.map((action, ai) => (
                        <CancelActionCard key={ai} action={action} />
                      ))}
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

          <form className="shrink-0 p-3 border-t border-line"
            onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            <div className="flex items-end gap-2 bg-card border border-line-strong rounded-2xl px-2.5 py-1.5 transition-colors duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter (and IME composition) inserts a newline.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    ask(input)
                  }
                }}
                disabled={busy}
                placeholder="Ask about your money…"
                aria-label="Message"
                className="flex-1 min-w-0 resize-none bg-transparent px-1.5 py-1.5 text-sm text-ink placeholder:text-faint outline-none max-h-40 leading-relaxed"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className={`inline-flex items-center justify-center shrink-0 bg-ink text-white hover:bg-ink-hover w-8 h-8 rounded-xl mb-0.5 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${focusRing}`}
              >
                <SendHorizonal size={15} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-.5 px-1 text-[8px] text-faint">
              <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> for a new line
            </p>
          </form>
        </>
      )}
    </div>
  )
}
