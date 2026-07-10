import { useEffect, useRef } from 'react'
import { Square, X } from 'lucide-react'
import { usePrefersReducedMotion } from '../hooks'
import { focusRing } from '../ui'

// Bottom-right activity toast: narrates the agent's ingestion work live as SSE events
// stream in from the sync/upload endpoints. Each `line` appends the moment the agent
// finishes a message; `startLabel`/`progress` show what it is working on right now.
export function AgentLog({ job, onShowSource, onStop, onDismiss }) {
  const reduced = usePrefersReducedMotion()
  const scrollRef = useRef(null)

  const lines = job?.lines || []
  const running = job?.running

  // Keep the newest line in view as work streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  if (!job) return null

  const progress = job.progress
  const progressLabel = progress?.total ? `${progress.current}/${progress.total}` : null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card border border-line rounded-xl shadow-lg p-3.5 fade-in">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs font-semibold text-ink flex items-center gap-2">
          {running && (
            <span className={`inline-block w-1.5 h-1.5 rounded-full bg-warn ${reduced ? '' : 'animate-pulse'}`} />
          )}
          Agent activity
          {running && progressLabel && (
            <span className="font-mono font-normal text-faint">{progressLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {running && onStop && (
            <button
              onClick={onStop}
              aria-label="Stop"
              className={`flex items-center gap-1 text-[11px] font-medium text-dim hover:text-alert transition-colors duration-150 rounded-md px-1.5 py-0.5 cursor-pointer ${focusRing}`}
            >
              <Square size={9} strokeWidth={2} className="fill-current" /> Stop
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label="Dismiss agent activity"
            className={`text-faint hover:text-ink transition-colors duration-150 rounded-md p-1 cursor-pointer ${focusRing}`}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="space-y-1 max-h-64 overflow-y-auto">
        {lines.map((ln, i) => (
          <div key={i} className="font-mono text-xs flex flex-wrap items-baseline gap-x-2 fade-in">
            <span className={ln.error ? 'text-alert' : ln.skipped ? 'text-faint' : 'text-gain'}>
              {ln.error ? '✗' : ln.skipped ? '–' : '✓'}
            </span>
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

        {/* The activity line the agent is on right now — stays pinned below the rows. */}
        {running && job.startLabel && (
          <div className="font-mono text-xs text-dim flex items-center gap-1.5">
            <span className={`text-warn ${reduced ? '' : 'animate-pulse'}`}>▸</span>
            {job.startLabel}
          </div>
        )}

        {!running && job.error && (
          <div className="font-mono text-xs text-alert">✗ {job.error}</div>
        )}

        {!running && !job.error && job.summary && (
          <div className="font-mono text-xs text-accent pt-0.5">{job.summary}</div>
        )}
      </div>
    </div>
  )
}
