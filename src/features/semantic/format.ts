import type { Grain } from './core/time.ts'
import { dayOfIso, isoOfDay } from './core/time.ts'
import type { CellValue, MetricFormat } from './core/types.ts'

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 })

/** Full figure for tables and tooltips: 1,284,331 / 12.4%. */
export function formatValue(v: CellValue | undefined, format: MetricFormat = 'number'): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v !== 'number') return String(v)
  if (!Number.isFinite(v)) return '—'
  if (format === 'percent') return formatPercent(v)
  return Math.abs(v) < 100 && !Number.isInteger(v) ? v.toFixed(1) : int.format(v)
}

/** Compact figure for tiles and axes: 1.3M / 12.4K / 940. */
export function formatCompact(v: number | null | undefined, format: MetricFormat = 'number'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (format === 'percent') return formatPercent(v)
  return Math.abs(v) < 10_000 ? int.format(v) : compact.format(v)
}

export function formatPercent(v: number, digits?: number): string {
  const d = digits ?? (Math.abs(v) < 0.1 ? 1 : 0)
  return `${(v * 100).toFixed(d)}%`
}

/** +12% / −3.4% with a true minus sign. */
export function formatSignedPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = formatPercent(Math.abs(v))
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function parts(iso: string) {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) }
}

/** Label for a period start at a grain: "Aug 31, 2026", "Wk of Aug 25", "Aug 2026", "Q3 2026", "2026". */
export function formatPeriod(iso: string | null | undefined, grain: Grain = 'day', short = false): string {
  if (!iso) return '—'
  const { y, m, d } = parts(iso)
  switch (grain) {
    case 'day':
      return short ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`
    case 'week':
      return short ? `${MONTHS[m - 1]} ${d}` : `Week of ${MONTHS[m - 1]} ${d}, ${y}`
    case 'month':
      return short ? `${MONTHS[m - 1]} ’${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
    default:
      return String(y)
  }
}

export function formatDay(day: number, withDow = false): string {
  const iso = isoOfDay(day)
  const dow = DOW[(((day + 3) % 7) + 7) % 7]
  return withDow ? `${dow}, ${formatPeriod(iso)}` : formatPeriod(iso)
}

export function formatRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`
  return `${formatPeriod(start)} – ${formatPeriod(end)}`
}

export function daysBetween(start: string, end: string): number {
  return dayOfIso(end) - dayOfIso(start) + 1
}

/** Display a categorical value: booleans read as Yes/No. */
export function formatCategory(v: CellValue): string {
  if (v === null || v === undefined || v === '') return '(none)'
  if (v === 'true') return 'Yes'
  if (v === 'false') return 'No'
  return String(v)
}

/** n / d when both are known and d is positive. Zero over a positive base is 0, not unknown. */
export function ratioOf(n: number | null | undefined, d: number | null | undefined): number | null {
  if (n === null || n === undefined || d === null || d === undefined || !Number.isFinite(n) || !(d > 0)) return null
  return n / d
}
