import { PeriodBarChart } from '@/components/charts/PeriodBarChart'
import { RankedBars } from '@/components/charts/RankedBars'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'

import type { QueryResult } from '../core/types.ts'
import { useDataset } from '../data'
import { formatCategory, formatCompact, formatPeriod, formatValue } from '../format'
import { pivotResult } from '../pivot'
import type { ChartKind } from '../views'
import { ResultTable } from './ResultTable'

interface ResultChartProps {
  result: QueryResult
  chart: ChartKind
  smooth?: number
  height?: number
  title: string
}

/** Draw any semantic-layer result: lines or bars over time, ranked bars without time, or a table. */
export function ResultChart({ result, chart, smooth, height = 300, title }: ResultChartProps) {
  const { lineByName } = useDataset()
  if (chart === 'table') return <ResultTable result={result} caption={title} signed={result.columns.filter((c) => c.format === 'percent' && /yoy/.test(c.key)).map((c) => c.key)} />
  if (!result.rows.length) return <Empty />

  // 'L' lines keep their official colors in every chart.
  const lineDim = result.columns.some((c) => c.key === 'line__line_name')
  const pivot = pivotResult(result, { colorFor: lineDim ? (v) => lineByName.get(v)?.color : undefined, smooth, maxSeries: lineDim ? 8 : undefined })
  const fmt = (v: number) => formatValue(v, pivot.format)
  const axis = (v: number) => formatCompact(v, pivot.format)
  const notes = [
    pivot.omittedMetrics.length ? `${pivot.omittedMetrics.length} metric${pivot.omittedMetrics.length > 1 ? 's' : ''} with a different unit ${pivot.omittedMetrics.length > 1 ? 'are' : 'is'} in the table view.` : null,
    pivot.hiddenSeries ? `Showing the ${pivot.series.length} largest series; ${pivot.hiddenSeries} more in the table view.` : null,
    smooth && pivot.grain === 'day' ? `${smooth}-day trailing average.` : null,
  ].filter(Boolean)
  // Averages, ratios and shares do not add up, so they never stack (a stacked share would show a 123% "total").
  const stackable = result.columns.filter((c) => pivot.series.some((p) => p.metric === c.key)).every((c) => c.additive)
  const kind = chart === 'stacked' && !stackable ? 'bar' : chart
  if (chart === 'stacked' && !stackable) notes.push('Shown side by side: these metrics are averages or ratios, which do not add up.')

  let body
  if (pivot.grain) {
    const grain = pivot.grain
    // Over long spans, day and week ticks name the month and year instead of a bare date.
    const first = String(pivot.data[0]?.t ?? '')
    const last = String(pivot.data[pivot.data.length - 1]?.t ?? '')
    const long = first && last ? (Date.parse(last) - Date.parse(first)) / 86_400_000 > 300 : false
    const tickGrain = long && (grain === 'day' || grain === 'week') ? 'month' : grain
    if (kind === 'bar' || kind === 'stacked') {
      body = (
        <PeriodBarChart
          data={pivot.data}
          series={pivot.series}
          stacked={kind === 'stacked'}
          formatTick={(t) => formatPeriod(t, tickGrain, true)}
          formatTitle={(t) => formatPeriod(t, grain)}
          formatValue={fmt}
          formatAxis={axis}
          height={height}
          ariaLabel={title}
        />
      )
    } else {
      body = (
        <TimeSeriesChart
          data={pivot.data}
          series={pivot.series}
          formatTick={(t) => formatPeriod(t, tickGrain, true)}
          formatTitle={(t) => formatPeriod(t, grain)}
          formatValue={fmt}
          formatAxis={axis}
          height={height}
          area={pivot.series.length === 1}
          zeroBaseline={pivot.format !== 'percent'}
          ariaLabel={title}
        />
      )
    }
  } else {
    // No time: rank every dimension combination by the first metric, in the query's own order.
    const metrics = result.columns.filter((c) => c.kind === 'metric')
    const metric = metrics[0]
    const dims = result.columns.filter((c) => c.kind === 'dimension' || c.kind === 'entity')
    const dim = dims[0]
    const rows = result.rows.filter((r) => typeof r[metric.key] === 'number')
    const labelOf = (r: (typeof rows)[number]) => dims.map((d) => formatCategory(r[d.key])).join(' · ')
    if (dim && metrics.length > 1) notes.push(`Bars show ${metric.label}; ${metrics.slice(1).map((m) => m.label).join(', ')} ${metrics.length > 2 ? 'are' : 'is'} in the table view.`)
    if (!dim) {
      body = (
        <div className="flex flex-wrap gap-8 py-4">
          {result.columns
            .filter((c) => c.kind === 'metric')
            .map((c) => (
              <div key={c.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{c.label}</span>
                <span className="text-3xl font-semibold tracking-tight">{formatValue(result.rows[0]?.[c.key], c.format)}</span>
              </div>
            ))}
        </div>
      )
    } else {
      body = (
        <RankedBars
          items={rows.slice(0, 20).map((r) => ({
            key: dims.map((d) => String(r[d.key])).join('|'),
            label: labelOf(r),
            value: r[metric.key] as number,
            display: formatValue(r[metric.key], metric.format),
          }))}
        />
      )
      if (rows.length > 20) notes.push(`Top 20 of ${rows.length}; the table view has every row.`)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {body}
      {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.join(' ')}</p>}
    </div>
  )
}

function Empty() {
  return <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No data for this selection.</div>
}
