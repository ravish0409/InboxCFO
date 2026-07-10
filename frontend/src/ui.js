// Shared interactive styles so every button in the app feels like one system.
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2'

const base = `inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${focusRing}`

export const btn = {
  primary: `${base} bg-ink text-white hover:bg-ink-hover text-sm px-3.5 py-2`,
  secondary: `${base} bg-card border border-line-strong text-ink hover:bg-inset text-sm px-3.5 py-2`,
  icon: `${base} border border-line-strong text-dim hover:text-ink hover:bg-inset p-2`,
  primarySm: `${base} bg-ink text-white hover:bg-ink-hover text-xs px-3 py-1.5`,
  secondarySm: `${base} bg-card border border-line-strong text-ink hover:bg-inset text-xs px-3 py-1.5`,
  ghostSm: `${base} text-faint hover:text-ink text-xs px-3 py-1.5`,
}
