import { colorForSeries, OTHER_COLOR } from '@/components/charts/palette'

import type { Grain } from './core/time.ts'
import { dayOfIso, isoOfDay } from './core/time.ts'
import type { MetricFormat, QueryResult, ResultColumn } from './core/types.ts'
import { formatCategory } from './format'

export interface PivotSeries {
  key: string
  label: string
  color: string
  metric: string
}

export interface Pivot {
  /** The x column: a time column, or the first dimension when there is no time. */
  x: ResultColumn | null
  grain: Grain | null
  data: Record<string, string | number | null>[]
  series: PivotSeries[]
  format: MetricFormat
  /** Metrics left out of the chart because their format differs (no dual axes). */
  omittedMetrics: string[]
  /** Series dropped to keep six colors; the table still has them. */
  hiddenSeries: number
}

const MAX_SERIES = 6

/**
 * Reshape a long result (one row per period x dimension values) into chart rows
 * (one row per period, one column per series). Series beyond six are dropped
 * rather than summed into "Other", because most metrics here are ratios that do
 * not add up. Colors follow the entity: they are ranked once on the full result.
 */
export function pivotResult(result: QueryResult, opts: { colorFor?: (dimValue: string) => string | undefined; smooth?: number; maxSeries?: number } = {}): Pivot {
  const timeCol = result.columns.find((c) => c.kind === 'time') ?? null
  const dims = result.columns.filter((c) => c.kind === 'dimension' || c.kind === 'entity')
  const metrics = result.columns.filter((c) => c.kind === 'metric')
  const format = metrics[0]?.format ?? 'number'
  const charted = metrics.filter((m) => (m.format ?? 'number') === format)
  const omittedMetrics = metrics.filter((m) => !charted.includes(m)).map((m) => m.key)

  const x = timeCol ?? dims[0] ?? null
  const splitDims = timeCol ? dims : dims.slice(1)

  // Rank series by their total (absolute) value across the result, once.
  const totals = new Map<string, { label: string; metric: string; dimValue: string; total: number }>()
  const seriesKeyOf = (row: Record<string, unknown>, metric: ResultColumn) => {
    const dv = splitDims.map((d) => formatCategory(row[d.key] as string | null)).join(' · ')
    const key = splitDims.length ? (charted.length > 1 ? `${metric.key}::${dv}` : dv) : metric.key
    const label = splitDims.length ? (charted.length > 1 ? `${metric.label} · ${dv}` : dv) : metric.label
    return { key, label, dv }
  }
  for (const row of result.rows) {
    for (const m of charted) {
      const { key, label, dv } = seriesKeyOf(row, m)
      const v = row[m.key]
      const t = totals.get(key) ?? { label, metric: m.key, dimValue: dv, total: 0 }
      if (typeof v === 'number') t.total += Math.abs(v)
      totals.set(key, t)
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total)
  const max = opts.maxSeries ?? MAX_SERIES
  const kept = ranked.slice(0, max)
  const order = kept.map(([k]) => k)
  const series: PivotSeries[] = kept.map(([key, t]) => ({
    key,
    label: t.label,
    metric: t.metric,
    color: opts.colorFor?.(t.dimValue) ?? colorForSeries(order, key),
  }))
  const keptKeys = new Set(order)

  const xKey = x?.key
  const rowsByX = new Map<string, Record<string, string | number | null>>()
  for (const row of result.rows) {
    const xv = xKey ? (x?.kind === 'time' ? String(row[xKey]) : formatCategory(row[xKey] as string | null)) : 'All'
    let out = rowsByX.get(xv)
    if (!out) {
      out = { t: xv }
      rowsByX.set(xv, out)
    }
    for (const m of charted) {
      const { key } = seriesKeyOf(row, m)
      if (keptKeys.has(key)) out[key] = row[m.key] as number | null
    }
  }
  let data = [...rowsByX.values()]

  // Fill missing periods with nulls so lines break instead of bridging gaps.
  if (timeCol?.grain === 'day' && data.length > 1) {
    const byT = new Map(data.map((d) => [d.t as string, d]))
    const start = dayOfIso(data[0].t as string)
    const end = dayOfIso(data[data.length - 1].t as string)
    data = []
    for (let d = start; d <= end; d++) data.push(byT.get(isoOfDay(d)) ?? { t: isoOfDay(d) })
    if (opts.smooth && opts.smooth > 1) data = rolling(data, series.map((s) => s.key), opts.smooth)
  }

  return {
    x,
    grain: timeCol?.grain ?? null,
    data,
    series: series.length ? series : charted.map((m, i) => ({ key: m.key, label: m.label, metric: m.key, color: i === 0 ? 'var(--series-1)' : OTHER_COLOR })),
    format,
    omittedMetrics,
    hiddenSeries: Math.max(0, ranked.length - max),
  }
}

/** Trailing rolling mean over `n` rows; null until the window has n values. */
export function rolling(rows: Record<string, string | number | null>[], keys: string[], n: number) {
  return rows.map((row, i) => {
    const out: Record<string, string | number | null> = { t: row.t }
    for (const k of keys) {
      let sum = 0
      let count = 0
      for (let j = Math.max(0, i - n + 1); j <= i; j++) {
        const v = rows[j][k]
        if (typeof v === 'number') {
          sum += v
          count++
        }
      }
      out[k] = count === n ? sum / n : null
    }
    return out
  })
}
