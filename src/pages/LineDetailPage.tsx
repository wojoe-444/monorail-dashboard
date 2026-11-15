import { ArrowLeft } from 'lucide-react'

import { RankedBars } from '@/components/charts/RankedBars'
import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { StatTile } from '@/components/charts/StatTile'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { useDataset, type Station } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatPeriod, formatValue } from '@/features/semantic/format'
import { pivotResult } from '@/features/semantic/pivot'
import { baseline2019 } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import type { ViewSpec } from '@/features/semantic/views'
import { Delta, ShareOf } from '@/features/transit/Delta'
import { LineDots, LineSwatch } from '@/features/transit/LineChip'
import { href, navigate } from '@/lib/router'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface Row {
  station: Station
  weekday: number | null
  yoy: number | null
  recovery: number | null
}

export function LineDetailPage() {
  const ds = useDataset()
  const { params } = useRangeParam('28d')
  const id = params.get('id') ?? ''
  const line = ds.lineById.get(id)
  if (!line) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Line not found" description={id ? `No line with id "${id}".` : 'No line selected.'} />
        <Button variant="outline" className="w-fit" onClick={() => navigate('/lines')}>
          <ArrowLeft />
          All lines
        </Button>
      </div>
    )
  }
  return <LineDetail key={line.id} lineId={line.id} />
}

function LineDetail({ lineId }: { lineId: string }) {
  const ds = useDataset()
  const line = ds.lineById.get(lineId)!
  const { preset, custom, window, setRange } = useRangeParam('28d')
  const lineWhere = [`{{ Entity('line') }} = '${line.id}'`]
  const stations = ds.stations.filter((s) => s.lines.includes(line.name))

  const kpi = useQueryOrThrow({ metrics: ['line_avg_weekday_allocated', 'line_avg_weekday_yoy', 'line_avg_daily_allocated'], where: lineWhere, timeRange: window }).rows[0]
  const base = baseline2019(window)
  const kpi2019 = useQueryOrThrow({ metrics: ['line_avg_weekday_allocated'], where: lineWhere, timeRange: base ?? window }).rows[0]
  const recovery = base && num(kpi.line_avg_weekday_allocated) && num(kpi2019.line_avg_weekday_allocated) ? (kpi.line_avg_weekday_allocated as number) / (kpi2019.line_avg_weekday_allocated as number) : null

  const monthlyView: ViewSpec = { metrics: ['line_avg_weekday_allocated'], groupBy: ['metric_time__month'], where: lineWhere, range: 'all', chart: 'line' }
  const monthly = useQueryOrThrow({ metrics: monthlyView.metrics, groupBy: monthlyView.groupBy, where: lineWhere })
  const monthlyPivot = pivotResult(monthly)

  const sectorView: ViewSpec = { metrics: ['line_avg_weekday_allocated'], groupBy: ['station__sector'], where: lineWhere, range: preset, custom, chart: 'bar' }
  const sectors = useQueryOrThrow({ metrics: sectorView.metrics, groupBy: sectorView.groupBy, where: lineWhere, timeRange: window })

  const stationQ = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'], groupBy: ['station'], timeRange: window })
  const station2019 = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries'], groupBy: ['station'], timeRange: base ?? window })
  const by = new Map(stationQ.rows.map((r) => [String(r.station), r]))
  const by2019 = new Map(station2019.rows.map((r) => [String(r.station), num(r.rail_avg_weekday_entries)]))
  const rows: Row[] = stations.map((s) => {
    const r = by.get(s.id)
    const weekday = num(r?.rail_avg_weekday_entries)
    const b = by2019.get(s.id) ?? null
    return { station: s, weekday, yoy: num(r?.rail_avg_weekday_yoy), recovery: base && weekday !== null && b ? weekday / b : null }
  })
  const adaCount = stations.filter((s) => s.ada).length

  const columns: SortColumn<Row>[] = [
    {
      key: 'name',
      label: 'Station',
      sort: (r) => r.station.name,
      render: (r) => (
        <a href={href(`/rail/station?id=${r.station.id}`)} className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {r.station.name}
        </a>
      ),
    },
    { key: 'lines', label: 'Lines', sort: (r) => r.station.lines.length, render: (r) => <LineDots names={r.station.lines} /> },
    { key: 'sector', label: 'Sector', sort: (r) => r.station.sector, render: (r) => r.station.sector },
    { key: 'ada', label: 'ADA', sort: (r) => (r.station.ada ? 1 : 0), render: (r) => (r.station.ada ? <Badge variant="success">Accessible</Badge> : <Badge variant="secondary">No</Badge>) },
    { key: 'weekday', label: 'Avg weekday', title: 'Full station entries (all lines)', align: 'right', sort: (r) => r.weekday, render: (r) => formatValue(r.weekday) },
    { key: 'yoy', label: 'vs 52 wks', align: 'right', sort: (r) => r.yoy, render: (r) => <Delta v={r.yoy} /> },
    { key: 'recovery', label: 'of 2019', align: 'right', sort: (r) => r.recovery, render: (r) => <ShareOf v={r.recovery} /> },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="'L' line"
        title={`${line.name} Line`}
        description={`${stations.length} stations · ${adaCount} ADA accessible · entries at transfer stations split evenly across their lines.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
          <LineSwatch line={line} />
          {line.name}
        </span>
        <span className="flex-1" />
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '6m', '1y', 'ytd']} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile hero label="Avg weekday (allocated)" value={formatCompact(num(kpi.line_avg_weekday_allocated))} delta={num(kpi.line_avg_weekday_yoy) ?? undefined} deltaLabel="vs 52 wks" />
        <StatTile label="Avg daily, all days" value={formatCompact(num(kpi.line_avg_daily_allocated))} />
        <StatTile label="Weekday vs 2019" value={recovery !== null ? formatPercent(recovery, 0) : '—'} hint={base ? 'same weeks of 2019' : undefined} />
        <StatTile label="ADA stations" value={`${adaCount} of ${stations.length}`} hint={stations.length ? formatPercent(adaCount / stations.length, 0) : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Monthly since 2019" description="Average weekday entries, allocated." view={monthlyView} result={monthly}>
          <TimeSeriesChart
            data={monthlyPivot.data}
            series={[{ key: 'line_avg_weekday_allocated', label: `${line.name} Line`, color: line.color }]}
            formatTick={(t) => formatPeriod(t, 'year')}
            ticks={monthlyPivot.data.filter((d) => String(d.t).slice(5, 7) === '01').map((d) => String(d.t))}
            formatTitle={(t) => formatPeriod(t, 'month')}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            area
            height={260}
            ariaLabel={`Average weekday entries on the ${line.name} Line per month`}
          />
        </ChartCard>
        <ChartCard title="By sector" description="Average weekday entries on this line, allocated." view={sectorView} result={sectors}>
          <RankedBars
            color={line.color}
            items={sectors.rows
              .filter((r) => num(r.line_avg_weekday_allocated) !== null)
              .map((r) => ({ key: String(r.station__sector), label: String(r.station__sector), value: r.line_avg_weekday_allocated as number, display: formatCompact(r.line_avg_weekday_allocated as number) }))}
          />
        </ChartCard>
      </div>

      <Card className="gap-2">
        <CardHeader>
          <CardTitle>Stations on the {line.name} Line</CardTitle>
          <CardDescription>Full station entries, all lines. Transfer stations show every line that serves them.</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <SortTable rows={rows} columns={columns} rowKey={(r) => r.station.id} initialSort={{ key: 'weekday', desc: true }} caption={`Stations on the ${line.name} Line`} />
        </CardContent>
      </Card>
    </div>
  )
}
