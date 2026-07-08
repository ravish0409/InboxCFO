import { useEffect, useState } from 'react'
import { api } from '../api'

export function SourceModal({ sourceId, onClose }) {
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sourceId == null) return
    setSource(null)
    setError('')
    api.source(sourceId).then(setSource).catch((e) => setError(e.message))
  }, [sourceId])

  if (sourceId == null) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">
              source · {source?.source_type || '…'}
            </div>
            <div className="font-semibold text-slate-100">{source?.title || 'Loading…'}</div>
            {source && (
              <div className="text-xs text-slate-500 mt-0.5">
                {source.sender}{source.received_at ? ` · ${source.received_at}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="p-5 overflow-y-auto text-sm text-slate-300 whitespace-pre-wrap font-mono">
          {error || source?.raw_text || '…'}
        </div>
      </div>
    </div>
  )
}
