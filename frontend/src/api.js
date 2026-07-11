async function request(path, options = {}) {
  let res
  try {
    res = await fetch(path, options)
  } catch {
    // fetch only rejects on a genuine network/connection failure — i.e. the
    // backend really is unreachable. A 4xx/5xx still resolves and is handled below.
    const err = new Error('Backend unreachable — is the server running on :8787?')
    err.offline = true
    throw err
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.detail || body.message || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return body
}

export const api = {
  stats: () => request('/api/stats'),
  subscriptions: () => request('/api/subscriptions'),
  bills: () => request('/api/bills'),
  documents: () => request('/api/documents'),
  transactions: () => request('/api/transactions'),
  spendByMonth: () => request('/api/spend-by-month'),
  insights: () => request('/api/insights'),
  source: (id) => request(`/api/sources/${id}`),
  sync: () => request('/api/sync', { method: 'POST' }),
  actions: () => request('/api/actions'),
  refreshActions: () => request('/api/actions/refresh', { method: 'POST' }),
  draftAction: (id) => request(`/api/actions/${id}/draft`, { method: 'POST' }),
  approveAction: (id) => request(`/api/actions/${id}/approve`, { method: 'POST' }),
  dismissAction: (id) => request(`/api/actions/${id}/dismiss`, { method: 'POST' }),
  chat: (question, history) =>
    request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    }),
  chatStream: (question, history, handlers) => streamChat(question, history, handlers),
  // Saved chat conversations. `messages` carry the durable display fields
  // (content, tool trace, cited sources) — see backend conversations router.
  conversations: () => request('/api/conversations'),
  conversation: (id) => request(`/api/conversations/${id}`),
  createConversation: (messages) =>
    request('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }),
  saveConversation: (id, messages) =>
    request(`/api/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }),
  deleteConversation: (id) =>
    request(`/api/conversations/${id}`, { method: 'DELETE' }),
  upload: (files) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return request('/api/upload', { method: 'POST', body: form })
  },
  // Live SSE variants: `onEvent` fires per progress event (see backend event shapes).
  // Pass an AbortSignal to let the caller stop the stream (Stop button) — aborting
  // resolves the promise cleanly rather than throwing.
  syncStream: (onEvent, signal) => postSSE('/api/sync/stream', { method: 'POST', signal }, onEvent),
  uploadStream: (files, onEvent, signal) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return postSSE('/api/upload/stream', { method: 'POST', body: form, signal }, onEvent)
  },
}

// POST to an SSE endpoint and invoke `onEvent(parsedJson)` for each `data:` frame.
// Resolves when the stream closes. Throws the same offline/HTTP errors as `request`.
async function postSSE(url, options = {}, onEvent) {
  let res
  try {
    res = await fetch(url, options)
  } catch (e) {
    // A caller-initiated abort (Stop button) surfaces here if it fires before the
    // response arrives — let it propagate as an AbortError, not a fake "offline".
    if (e?.name === 'AbortError') throw e
    const err = new Error('Backend unreachable — is the server running on :8787?')
    err.offline = true
    throw err
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // SSE frames are separated by a blank line; a frame's payload is its `data:` lines.
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('')
        if (!data) continue
        let event
        try {
          event = JSON.parse(data)
        } catch {
          continue
        }
        onEvent?.(event)
      }
    }
  } catch (e) {
    // The caller aborted (Stop button) — reader.read() rejects with AbortError.
    // Treat it as a clean end of stream; any other error still propagates.
    if (e?.name !== 'AbortError') throw e
  }
}

// POST to the SSE chat endpoint and dispatch events as they arrive.
// handlers: { onToken(text), onTool(name), onChart(spec), onAction(item), onSources(list), onError(message) }.
// Resolves when the stream closes (a `done` event or the body ending).
function streamChat(question, history, handlers = {}) {
  return postSSE(
    '/api/chat/stream',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    },
    (event) => {
      if (event.type === 'token') handlers.onToken?.(event.text)
      else if (event.type === 'tool') handlers.onTool?.(event.tool)
      else if (event.type === 'chart') handlers.onChart?.(event.chart)
      else if (event.type === 'action') handlers.onAction?.(event.action)
      else if (event.type === 'sources') handlers.onSources?.(event.sources || [])
      else if (event.type === 'error') handlers.onError?.(event.message)
    },
  )
}

// Symbols for the currencies we actually see in the inbox. Unknown 3-letter codes
// fall back to "CODE 1,234" so an amount is never silently mislabeled as rupees.
const CURRENCY_SYMBOLS = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ', CHF: 'CHF ',
}

// Grouping locale per currency (mostly cosmetic — INR uses the 1,00,000 lakh grouping).
const CURRENCY_LOCALE = { INR: 'en-IN' }

// Format `n` with the symbol for its currency code, defaulting to INR (₹).
export const money = (n, currency = 'INR') => {
  if (n == null) return '—'
  const code = (currency || 'INR').toUpperCase()
  const num = Number(n).toLocaleString(CURRENCY_LOCALE[code] || 'en-US', { maximumFractionDigits: 0 })
  const sym = CURRENCY_SYMBOLS[code]
  return sym ? `${sym}${num}` : `${code} ${num}`
}

// Hardcoded FX rates → INR, mirroring backend `app/services/fx.py` (RATES_TO_INR).
// Keep the two tables in sync. Used only to sum amounts across currencies.
const RATES_TO_INR = {
  INR: 1, USD: 83, EUR: 90, GBP: 105, JPY: 0.55, CNY: 11.5,
  AUD: 55, CAD: 61, SGD: 62, AED: 22.6, CHF: 94,
}

// Convert `n` from `currency` to INR. Unknown currencies are treated as already-INR
// so a running total is never dropped. Use before summing mixed-currency amounts.
export const toINR = (n, currency = 'INR') =>
  n == null ? 0 : Number(n) * (RATES_TO_INR[(currency || 'INR').toUpperCase()] ?? 1)

// INR-only formatter. Aggregate totals are shown in rupees (base currency); convert
// each amount with toINR() before summing (see money() for per-item amounts).
export const inr = (n) => money(n, 'INR')

// Lowercase clock time, e.g. "2:41 pm" — the agent speaks in lowercase.
export const fmtTime = (d = new Date()) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()

// Compact relative time, e.g. "just now", "4m", "2h", "3d". Assumes UTC ISO input.
export const fmtRel = (iso) => {
  if (!iso) return ''
  const then = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  const secs = Math.max(0, (Date.now() - then.getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}
