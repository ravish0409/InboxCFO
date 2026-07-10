import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Chat history is persisted server-side (see backend conversations router). This hook
// owns the conversation list and which one is active; the Chat component owns the live
// messages (it streams into them) and commits a snapshot after each completed turn.

// Persisted messages carry only durable fields — never the transient `streaming` flag,
// and the empty assistant placeholder shown mid-stream is dropped.
const persistable = (messages) =>
  messages
    .filter((m) => m.content || m.error)
    .map(({ role, content, trace, sources, error }) => ({
      role,
      content: content || '',
      trace: trace || [],
      sources: sources || [],
      error: !!error,
    }))

export function useChatSessions() {
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(null) // null = a new, not-yet-saved chat
  // Signature of the last snapshot written, so re-committing unchanged messages
  // (e.g. right after loading a conversation) doesn't POST/PUT needlessly.
  const lastSaved = useRef('')
  // An id whose messages the Chat already holds locally (it just created/saved them),
  // so the load effect can skip re-fetching and overwriting the live state.
  const skipLoad = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setSessions(await api.conversations())
    } catch {
      // Backend unreachable — history just isn't available this session; not fatal.
    }
  }, [])

  // On mount, load the list and reopen the most recent conversation (so a reload
  // lands the user back where they were).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api.conversations()
        if (cancelled) return
        setSessions(list)
        if (list.length) {
          lastSaved.current = ''
          setActiveId(list[0].id)
        }
      } catch {
        /* offline — leave the user on a fresh empty chat */
      }
    })()
    return () => { cancelled = true }
  }, [])

  const fetchMessages = useCallback(async (id) => {
    try {
      const conv = await api.conversation(id)
      return conv.messages || []
    } catch {
      return []
    }
  }, [])

  // Snapshot the active conversation's messages to the backend. Creates the
  // conversation on first save; no-ops when nothing durable changed.
  const commit = useCallback(async (messages) => {
    const msgs = persistable(messages)
    if (!msgs.length) return
    const signature = `${activeId}:${JSON.stringify(msgs)}`
    if (signature === lastSaved.current) return
    lastSaved.current = signature
    try {
      if (activeId == null) {
        const meta = await api.createConversation(msgs)
        skipLoad.current = meta.id
        lastSaved.current = `${meta.id}:${JSON.stringify(msgs)}`
        setActiveId(meta.id)
      } else {
        await api.saveConversation(activeId, msgs)
      }
      await refresh()
    } catch {
      lastSaved.current = '' // let the next change retry the write
    }
  }, [activeId, refresh])

  const startNew = useCallback(() => {
    lastSaved.current = ''
    skipLoad.current = null
    setActiveId(null)
  }, [])

  const open = useCallback((id) => {
    lastSaved.current = '' // real signature is set once the messages load
    skipLoad.current = null
    setActiveId(id)
  }, [])

  const remove = useCallback(async (id) => {
    try {
      await api.deleteConversation(id)
    } catch {
      /* ignore — refresh below reflects the true server state */
    }
    if (id === activeId) startNew()
    await refresh()
  }, [activeId, refresh, startNew])

  // The Chat calls these to coordinate loading without clobbering live state:
  // `takeSkipLoad` reports (and clears) whether we already hold this id's messages;
  // `markLoaded` records the just-loaded snapshot so the follow-up commit no-ops.
  const takeSkipLoad = useCallback((id) => {
    if (id != null && skipLoad.current === id) {
      skipLoad.current = null
      return true
    }
    return false
  }, [])

  const markLoaded = useCallback((id, messages) => {
    lastSaved.current = `${id}:${JSON.stringify(persistable(messages))}`
  }, [])

  return {
    sessions, activeId, commit, startNew, open, remove,
    fetchMessages, takeSkipLoad, markLoaded,
  }
}
