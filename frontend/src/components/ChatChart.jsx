import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { money } from '../api'

// Inline charts the agent draws via the render_chart tool. Palette + styling follow
// frontend/DESIGN_GUIDE.md: brand green primary, no animation, IBM Plex Mono ticks.
const AXIS = { fill: '#8E8A80', fontSize: 11, fontFamily: 'IBM Plex Mono' }
const GRID = '#ECEAE5'
const BRAND = '#1B6B4C'

// Categorical slices for pie charts — greens first, then on-brand accents. Kept distinct
// but muted so a breakdown never reads as a warning.
const SLICE = ['#1B6B4C', '#3E8E6E', '#6FB097', '#9C6D12', '#4B6A88', '#B98A2A', '#177347', '#8E8A80']

const TOOLTIP = {
  background: '#FFFFFF', border: '1px solid #D9D6CE', borderRadius: 8,
  fontFamily: 'IBM Plex Mono', fontSize: 12,
}

// Format one value: as money when a currency is in play, otherwise a grouped number.
const fmt = (chart, v, currency) => {
  const cur = currency || chart.unit
  return cur ? money(v, cur) : Number(v).toLocaleString('en-US')
}

// Compact axis label so a narrow chat panel doesn't clip figures (₹12k, 1.2k, 340).
const compact = (chart, v) => {
  const sym = chart.unit ? (money(0, chart.unit).replace(/[\d.,\s]/g, '') || '') : ''
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sym}${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  return `${sym}${v}`
}

function ChartTooltip({ active, payload, chart }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const point = p.payload || {}
  return (
    <div style={TOOLTIP} className="px-2.5 py-1.5">
      <div className="text-dim">{point.label}</div>
      <div className="text-ink font-medium tabular-nums">{fmt(chart, p.value, point.currency)}</div>
    </div>
  )
}

function Bars({ chart }) {
  // Horizontal bars: category/merchant labels stay readable in the narrow assistant panel.
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={chart.data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false}
               tickFormatter={(v) => compact(chart, v)} />
        <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={84} />
        <Tooltip cursor={{ fill: '#F1EFEA' }} content={<ChartTooltip chart={chart} />} />
        <Bar dataKey="value" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Trend({ chart }) {
  const Chart = chart.type === 'area' ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48}
               tickFormatter={(v) => compact(chart, v)} />
        <Tooltip cursor={{ stroke: '#D9D6CE' }} content={<ChartTooltip chart={chart} />} />
        {chart.type === 'area' ? (
          <Area dataKey="value" stroke={BRAND} fill={BRAND} fillOpacity={0.12}
                strokeWidth={2} dot={false} isAnimationActive={false} />
        ) : (
          <Line dataKey="value" stroke={BRAND} strokeWidth={2}
                dot={{ r: 3, fill: BRAND }} isAnimationActive={false} />
        )}
      </Chart>
    </ResponsiveContainer>
  )
}

function Donut({ chart }) {
  const total = chart.data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 h-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="label" innerRadius={30} outerRadius={52}
                 stroke="#FFFFFF" strokeWidth={2} isAnimationActive={false}>
              {chart.data.map((_, i) => <Cell key={i} fill={SLICE[i % SLICE.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip chart={chart} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {chart.data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: SLICE[i % SLICE.length] }} />
              <span className="text-dim truncate flex-1 min-w-0">{d.label}</span>
              <span className="font-mono tabular-nums text-ink whitespace-nowrap">{fmt(chart, d.value, d.currency)}</span>
              <span className="font-mono tabular-nums text-faint w-8 text-right">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stats({ chart }) {
  // One or more headline figures — big mono numbers, the KPI treatment from the dashboard.
  return (
    <div className={`grid gap-3 ${chart.data.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {chart.data.map((d, i) => (
        <div key={i} className="bg-card border border-line rounded-lg px-3 py-2.5">
          <div className="font-mono text-2xl font-medium tabular-nums text-ink leading-none">
            {fmt(chart, d.value, d.currency)}
          </div>
          {d.label && <div className="text-xs text-faint mt-1.5">{d.label}</div>}
        </div>
      ))}
    </div>
  )
}

// Render one chart spec produced by the agent's render_chart tool.
export function ChatChart({ chart }) {
  if (!chart?.data?.length) return null
  const isStat = chart.type === 'stat'
  const isPie = chart.type === 'pie'
  const bars = chart.type === 'bar'
  // Bars get more vertical room per row; trend/pie are fixed and compact.
  const height = bars ? Math.max(120, chart.data.length * 34 + 24) : 172

  return (
    <figure className="mt-2 w-full min-w-[248px] rounded-xl border border-line bg-card px-3 py-2.5">
      {chart.title && (
        <figcaption className="text-xs font-semibold text-ink mb-2">{chart.title}</figcaption>
      )}
      {isStat ? (
        <Stats chart={chart} />
      ) : isPie ? (
        <Donut chart={chart} />
      ) : (
        <div style={{ height }}>
          {bars ? <Bars chart={chart} /> : <Trend chart={chart} />}
        </div>
      )}
      {chart.note && <p className="text-[11px] text-faint mt-2">{chart.note}</p>}
    </figure>
  )
}
