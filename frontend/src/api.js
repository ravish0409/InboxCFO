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
  upload: (files) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return request('/api/upload', { method: 'POST', body: form })
  },
}

export const inr = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

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
