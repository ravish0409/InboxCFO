import { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { api } from '../api'
import { usePrefersReducedMotion } from '../hooks'
import { focusRing } from '../ui'

// A provenance chip. Every extracted fact links back to the email/PDF it came from.
export function EvidenceChip({ label = 'source', title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title || 'View the source email or document'}
      className={`inline-flex items-center gap-1 font-mono text-[11px] text-faint bg-card border border-line rounded-md px-1.5 py-0.5 max-w-[220px] transition-colors duration-150 hover:text-accent hover:border-accent/40 cursor-pointer ${focusRing}`}
    >
      <FileText size={11} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

// The evidence drawer: raw source text slides in from the right.
export function EvidenceDrawer({ sourceId, onClose }) {
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(false)
  const reduced = usePrefersReducedMotion()
  const open = sourceId != null

  useEffect(() => {
    if (sourceId == null) return
    setSource(null)
    setError('')
    api.source(sourceId).then(setSource).catch((e) => setError(e.message))
  }, [sourceId])

  // Trigger the slide-in on the frame after mount.
  useEffect(() => {
    if (!open) { setShown(false); return }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const slid = reduced || shown

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${slid ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full max-w-xl bg-card border-l border-line-strong shadow-2xl flex flex-col ${reduced ? '' : 'transition-transform duration-200 ease-out'} ${slid ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-accent uppercase tracking-wide mb-1">
              Source · {source?.source_type || '…'}
            </div>
            <div className="text-sm font-semibold text-ink truncate">
              {source?.title || (error ? 'Source unavailable' : 'Loading…')}
            </div>
            {source && (
              <div className="font-mono text-[11px] text-faint mt-1">
                {source.sender || 'unknown sender'}
                {source.received_at ? ` · ${source.received_at}` : ''}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close source"
            className={`text-faint hover:text-ink transition-colors duration-150 rounded-md cursor-pointer ${focusRing}`}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto font-mono text-xs text-dim whitespace-pre-wrap leading-relaxed bg-inset/40 flex-1">
          {error ? <span className="text-alert">{error}</span> : source?.raw_text || '…'}
        </div>
      </div>
    </div>
  )
}
