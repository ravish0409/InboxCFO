import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { usePrefersReducedMotion } from '../hooks'
import { focusRing } from '../ui'

// Bottom-right activity toast: replays the agent's ingestion work line-by-line.
// Pacing is purely presentational — the response has already fully arrived.
export function AgentLog({ job, onShowSource, onDismiss }) {
  const reduced = usePrefersReducedMotion()
  const [revealed, setRevealed] = useState(0)

  const lines = job?.lines || []
  const done = job && !job.running

  useEffect(() => {
    if (!done || !lines.length) { setRevealed(0); return }
    if (reduced) { setRevealed(lines.length); return }
    setRevealed(0)
    const timers = lines.map((_, i) =>
      setTimeout(() => setRevealed((n) => Math.max(n, i + 1)), 300 * (i + 1)),
    )
    return () => timers.forEach(clearTimeout)
    // Re-run when a new job's results land.
  }, [job?.id, done, lines.length, reduced])

  if (!job) return null

  const allShown = revealed >= lines.length

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card border border-line rounded-xl shadow-lg p-3.5 fade-in">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs font-semibold text-ink flex items-center gap-2">
          {job.running && (
            <span className={`inline-block w-1.5 h-1.5 rounded-full bg-warn ${reduced ? '' : 'animate-pulse'}`} />
          )}
          Agent activity
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss agent activity"
          className={`text-faint hover:text-ink transition-colors duration-150 rounded-md cursor-pointer ${focusRing}`}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="space-y-1">
        {job.running && (
          <div className="font-mono text-xs text-dim">{job.startLabel}</div>
        )}

        {done && job.error && (
          <div className="font-mono text-xs text-alert">✗ {job.error}</div>
        )}

        {done && !job.error && lines.slice(0, revealed).map((ln, i) => (
          <div key={i} className="font-mono text-xs flex flex-wrap items-baseline gap-x-2">
            <span className={ln.skipped ? 'text-faint' : 'text-gain'}>{ln.skipped ? '–' : '✓'}</span>
            <span className="text-ink truncate max-w-[45%]">{ln.file}</span>
            <span className="text-dim">→ {ln.summary}</span>
            {ln.source_id != null && (
              <button
                onClick={() => onShowSource(ln.source_id)}
                className={`text-accent hover:underline rounded-sm cursor-pointer ${focusRing}`}
              >
                view
              </button>
            )}
          </div>
        ))}

        {done && !job.error && allShown && job.summary && (
          <div className="font-mono text-xs text-accent pt-0.5">{job.summary}</div>
        )}
      </div>
    </div>
  )
}
