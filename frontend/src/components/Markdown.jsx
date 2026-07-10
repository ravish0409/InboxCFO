import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Markdown renderer tuned for chat bubbles: compact spacing, the app's design tokens,
// and a monospace treatment for code so drafted emails / figures read cleanly. GFM adds
// tables, strikethrough and autolinks.
const COMPONENTS = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer"
       className="text-accent underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-1.5 pl-4 list-disc marker:text-faint space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 pl-4 list-decimal marker:text-faint space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-ink">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-ink">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-line-strong pl-3 text-dim">{children}</blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="font-mono text-[12px] bg-card border border-line-strong rounded px-1 py-0.5">
        {children}
      </code>
    ) : (
      <code className="block font-mono text-[12px] leading-relaxed">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-2 bg-card border border-line-strong rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line-strong px-2 py-1 text-left font-semibold bg-inset">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line-strong px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-line" />,
}

export function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {children || ''}
    </ReactMarkdown>
  )
}
