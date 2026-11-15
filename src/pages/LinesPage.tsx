import { Info } from 'lucide-react'

import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { Sparkline } from '@/components/charts/Sparkline'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { ResultChart } from '@/features/semantic/components/ResultChart'
import { useDataset, type Line } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatValue } from '@/features/semantic/format'
import { recentWeeks } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import type { ViewSpec } from '@/features/semantic/views'
import { Delta } from '@/features/transit/Delta'
import { LineSwatch } from '@/features/transit/LineChip'
import { useUrlParams } from '@/hooks/useUrlParams'
import { href } from '@/lib/router'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface Row {
  line: Line
  allocated: number | null
  yoy: number | null
  reach: number | null
  share: number | null
  ada: number
  trend: number[]
}

export function LinesPage() {
  const ds = useDataset()
  const { preset, custom, window, setRange } = useRangeParam('28d')
  const [params, setParams] = useUrlParams()
  const grain = (params.get('grain') === 'week' ? 'week' : 'month') as 'week' | 'month'

  const current = useQueryOrThrow({
    metrics: ['line_avg_weekday_allocated', 'line_avg_weekday_yoy', 'line_entries_allocated', 'line_station_entries', 'line_service_days'],
    groupBy: ['line__line_name'],
    where: ["{{ Dimension('service_day__day_type') }} = 'Weekday'"],
    timeRange: window,
  })
  const weekly = useQueryOrThrow({ metrics: ['line_entries_allocated'], groupBy: ['line__line_name', 'metric_time__week'], timeRange: recentWeeks(ds.maxDay) })
  const total = current.rows.reduce((a, r) => a + (num(r.line_entries_allocated) ?? 0), 0)

  const rows: Row[] = ds.lines.map((line) => {
    const r = current.rows.find((x) => x.line__line_name === line.name)
    const stations = ds.stations.filter((s) => s.lines.includes(line.name))
    const days = num(r?.line_service_days)
    return {
      line,
      allocated: num(r?.line_avg_weekday_allocated),
      yoy: num(r?.line_avg_weekday_yoy),
      reach: days && num(r?.line_station_entries) !== null ? (r!.line_station_entries as number) / days : null,
      share: total && num(r?.line_entries_allocated) !== null ? (r!.line_entries_allocated as number) / total : null,
      ada: stations.length ? stations.filter((s) => s.ada).length / stations.length : 0,
      trend: weekly.rows.filter((w) => w.line__line_name === line.name).map((w) => num(w.line_entries_allocated) ?? 0),
    }
  })

  const trendView: ViewSpec = { metrics: ['line_avg_weekday_allocated'], groupBy: [`metric_time__${grain}`, 'line__line_name'], where: [], range: grain === 'week' ? '1y' : 'all', chart: 'line' }
  const trend = useQueryOrThrow({
    metrics: trendView.metrics,
    groupBy: trendView.groupBy,
    timeRange: grain === 'week' ? { start: recentWeeks(ds.maxDay, 52).start, end: recentWeeks(ds.maxDay, 52).end } : undefined,
  })

  const columns: SortColumn<Row>[] = [
    {
      key: 'line',
      label: 'Line',
      sort: (r) => r.line.order,
      render: (r) => (
        <a href={href(`/lines/line?id=${r.line.id}`)} className="flex items-center gap-2 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          <LineSwatch line={r.line} />
          {r.line.name}
        </a>
      ),
    },
    { key: 'allocated', label: 'Avg weekday (allocated)', title: 'Entries split evenly across the lines at each station', align: 'right', sort: (r) => r.allocated, render: (r) => formatValue(r.allocated) },
    { key: 'yoy', label: 'vs 52 wks', align: 'right', sort: (r) => r.yoy, render: (r) => <Delta v={r.yoy} /> },
    { key: 'share', label: 'Share', title: 'Share of all allocated weekday entries', align: 'right', sort: (r) => r.share, render: (r) => (r.share !== null ? formatPercent(r.share, 1) : '—') },
    {
      key: 'reach',
      label: 'At its stations',
      title: "Full weekday entries at every station the line serves. Transfer stations count for each line, so this does not add up across lines.",
      align: 'right',
      sort: (r) => r.reach,
      render: (r) => formatValue(r.reach),
    },
    { key: 'stations', label: 'Stations', align: 'right', sort: (r) => r.line.stationCount, render: (r) => r.line.stationCount },
    { key: 'ada', label: 'ADA stations', align: 'right', sort: (r) => r.ada, render: (r) => formatPercent(r.ada, 0) },
    { key: 'trend', label: '12 weeks', render: (r) => <Sparkline data={r.trend} className="text-muted-foreground" /> },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Operations" title="Lines" description="Weekday entries by 'L' line, with each line's reach and accessibility." />

      <div className="flex flex-wrap items-center gap-3">
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '6m', '1y', 'ytd']} />
      </div>

      <div className="flex gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Turnstiles count entries per station, not per line. <strong>Allocated</strong> entries split a transfer station's count evenly across its lines, so lines add up to the
          system total. <strong>At its stations</strong> counts the whole station for every line that stops there: it shows a line's reach, and never adds up across lines.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <a
            key={r.line.id}
            href={href(`/lines/line?id=${r.line.id}`)}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full gap-0 px-4 py-4 transition-colors hover:bg-accent">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LineSwatch line={r.line} className="size-3" />
                {r.line.name} Line
              </div>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-3xl font-semibold tracking-tight">{formatCompact(r.allocated)}</span>
                  <span className="text-xs text-muted-foreground">
                    avg weekday · <Delta v={r.yoy} />
                  </span>
                </div>
                <Sparkline data={r.trend} className="text-muted-foreground" />
              </div>
            </Card>
          </a>
        ))}
      </div>

      <ChartCard
        title={grain === 'week' ? 'Weekly, last 52 weeks' : 'Monthly since 2019'}
        description="Average weekday entries per line, allocated at transfer stations."
        view={trendView}
        result={trend}
        controls={
          <Segmented
            aria-label="Grain"
            value={grain}
            onChange={(v) => setParams({ grain: v === 'month' ? null : v })}
            options={[
              { value: 'month', label: 'Monthly' },
              { value: 'week', label: 'Weekly' },
            ]}
          />
        }
      >
        <ResultChart result={trend} chart="line" title="Average weekday entries per line" height={320} />
      </ChartCard>

      <Card className="py-2">
        <CardContent className="px-2">
          <SortTable rows={rows} columns={columns} rowKey={(r) => r.line.id} initialSort={{ key: 'allocated', desc: true }} caption="Lines" />
        </CardContent>
      </Card>
    </div>
  )
}
