async function request(path, options = {}) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.detail || body.message || `Request failed (${res.status})`)
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
