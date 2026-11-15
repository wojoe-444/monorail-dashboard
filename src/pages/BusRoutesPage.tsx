import { useId } from 'react'
import { Download, Search } from 'lucide-react'

import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { Sparkline } from '@/components/charts/Sparkline'
import { StatTile } from '@/components/charts/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { ResultChart } from '@/features/semantic/components/ResultChart'
import type { QueryResult } from '@/features/semantic/core/types.ts'
import { downloadCsv } from '@/features/semantic/csv'
import { useDataset, type Route } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatValue } from '@/features/semantic/format'
import { baseline2019, recentWeeks } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import type { ViewSpec } from '@/features/semantic/views'
import { Delta, ShareOf } from '@/features/transit/Delta'
import { href } from '@/lib/router'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

interface Row {
  route: Route
  weekday: number | null
  yoy: number | null
  saturday: number | null
  sunday: number | null
  boardings: number | null
  share: number | null
  recovery: number | null
  trend: number[]
}

const TYPE_VARIANT: Record<string, 'secondary' | 'primary' | 'warning'> = { Local: 'secondary', Express: 'primary', Shuttle: 'warning' }

export function BusRoutesPage() {
  const ds = useDataset()
  const id = useId()
  const { preset, custom, window, setRange, params, setParams } = useRangeParam('28d')
  const type = params.get('type') ?? 'all'
  const q = params.get('q') ?? ''

  const current = useQueryOrThrow({
    metrics: ['bus_avg_weekday_boardings', 'bus_avg_weekday_yoy', 'bus_avg_saturday_boardings', 'bus_avg_sunday_boardings', 'bus_boardings'],
    groupBy: ['route'],
    timeRange: window,
  })
  const base = baseline2019(window)
  const before = useQueryOrThrow({ metrics: ['bus_avg_weekday_boardings'], groupBy: ['route'], timeRange: base ?? window })
  const weekly = useQueryOrThrow({ metrics: ['bus_boardings'], groupBy: ['route', 'metric_time__week'], timeRange: recentWeeks(ds.maxDay) })

  const by = new Map(current.rows.map((r) => [String(r.route), r]))
  const by2019 = new Map(before.rows.map((r) => [String(r.route), num(r.bus_avg_weekday_boardings)]))
  const trendBy = new Map<string, number[]>()
  for (const r of weekly.rows) {
    const arr = trendBy.get(String(r.route)) ?? []
    arr.push(num(r.bus_boardings) ?? 0)
    trendBy.set(String(r.route), arr)
  }
  const total = current.rows.reduce((a, r) => a + (num(r.bus_boardings) ?? 0), 0)
  const allRows: Row[] = ds.routes
    .filter((r) => by.has(r.id))
    .map((route) => {
      const r = by.get(route.id)!
      const weekday = num(r.bus_avg_weekday_boardings)
      const b = by2019.get(route.id) ?? null
      return {
        route,
        weekday,
        yoy: num(r.bus_avg_weekday_yoy),
        saturday: num(r.bus_avg_saturday_boardings),
        sunday: num(r.bus_avg_sunday_boardings),
        boardings: num(r.bus_boardings),
        share: total && num(r.bus_boardings) !== null ? (r.bus_boardings as number) / total : null,
        recovery: base && weekday !== null && b ? weekday / b : null,
        trend: trendBy.get(route.id) ?? [],
      }
    })
  const needle = q.trim().toLowerCase()
  const rows = allRows.filter((r) => (type === 'all' || r.route.type === type) && (!needle || r.route.id.toLowerCase() === needle || r.route.name.toLowerCase().includes(needle) || r.route.id.toLowerCase().startsWith(needle)))

  const typeWhere = type === 'all' ? [] : [`{{ Dimension('route__route_type') }} = '${type}'`]
  const typeView: ViewSpec = { metrics: ['bus_avg_weekday_boardings'], groupBy: ['metric_time__month', 'route__route_type'], where: [], range: '3y', chart: 'stacked' }
  const byType = useQueryOrThrow({ metrics: typeView.metrics, groupBy: typeView.groupBy, timeRange: { start: baseline3y(ds.maxIso), end: ds.maxIso } })

  const columns: SortColumn<Row>[] = [
    {
      key: 'route',
      label: 'Route',
      sort: (r) => r.route.id,
      render: (r) => (
        <a href={href(`/bus/route?id=${encodeURIComponent(r.route.id)}`)} className="flex min-w-0 items-center gap-3 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          <span className="w-12 shrink-0 font-mono text-sm font-semibold">{r.route.id}</span>
          <span className="truncate">{r.route.name}</span>
        </a>
      ),
    },
    { key: 'type', label: 'Type', sort: (r) => r.route.type, render: (r) => <Badge variant={TYPE_VARIANT[r.route.type] ?? 'secondary'}>{r.route.type}</Badge> },
    { key: 'weekday', label: 'Avg weekday', align: 'right', sort: (r) => r.weekday, render: (r) => formatValue(r.weekday) },
    { key: 'yoy', label: 'vs 52 wks', align: 'right', sort: (r) => r.yoy, render: (r) => <Delta v={r.yoy} /> },
    { key: 'recovery', label: 'of 2019', align: 'right', sort: (r) => r.recovery, render: (r) => <ShareOf v={r.recovery} /> },
    { key: 'sat', label: 'Avg Sat', align: 'right', sort: (r) => r.saturday, render: (r) => formatValue(r.saturday) },
    { key: 'sun', label: 'Avg Sun/hol', align: 'right', sort: (r) => r.sunday, render: (r) => formatValue(r.sunday) },
    { key: 'share', label: 'Share', align: 'right', sort: (r) => r.share, render: (r) => (r.share !== null ? formatPercent(r.share, 1) : '—') },
    { key: 'trend', label: '12 weeks', render: (r) => <Sparkline data={r.trend} className={(r.yoy ?? 0) >= 0 ? 'text-primary' : 'text-muted-foreground'} /> },
  ]

  const exportRows = () => {
    const result: QueryResult = {
      columns: ['route_id', 'route_name', 'route_type', 'avg_weekday', 'avg_weekday_yoy', 'share_of_2019', 'avg_saturday', 'avg_sunday_holiday', 'boardings'].map((k) => ({ key: k, label: k, kind: 'metric' as const })),
      rows: rows.map((r) => ({
        route_id: r.route.id,
        route_name: r.route.name,
        route_type: r.route.type,
        avg_weekday: r.weekday,
        avg_weekday_yoy: r.yoy,
        share_of_2019: r.recovery,
        avg_saturday: r.saturday,
        avg_sunday_holiday: r.sunday,
        boardings: r.boardings,
      })),
      plan: [],
      ms: 0,
    }
    downloadCsv(result, `bus routes ${window.start} to ${window.end}`)
  }

  const weekdayTotal = rows.reduce((a, r) => a + (r.weekday ?? 0), 0)
  const top10Share = (() => {
    const sorted = [...rows].sort((a, b) => (b.weekday ?? 0) - (a.weekday ?? 0))
    const t = sorted.slice(0, 10).reduce((a, r) => a + (r.weekday ?? 0), 0)
    return weekdayTotal ? t / weekdayTotal : null
  })()
  const growing = rows.filter((r) => (r.yoy ?? 0) > 0).length
  const withYoy = rows.filter((r) => r.yoy !== null).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Bus routes"
        description="Every CTA bus route: weekday, weekend and holiday boardings, change vs 52 weeks earlier, and recovery against 2019."
        actions={
          <Button variant="outline" onClick={exportRows}>
            <Download />
            CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '6m', '1y', 'ytd']} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Route type</span>
          <Segmented
            aria-label="Route type"
            value={type}
            onChange={(v) => setParams({ type: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'Local', label: 'Local' },
              { value: 'Express', label: 'Express' },
              { value: 'Shuttle', label: 'Shuttle' },
            ]}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-q`} className="text-xs text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${id}-q`} value={q} onChange={(e) => setParams({ q: e.target.value })} placeholder="Route number or name" className="pl-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Routes" value={String(rows.length)} hint={rows.length !== allRows.length ? `of ${allRows.length}` : 'reporting in period'} />
        <StatTile label="Avg weekday boardings" value={formatCompact(weekdayTotal)} hint="sum of the routes shown" />
        <StatTile label="Top 10 routes carry" value={top10Share !== null ? formatPercent(top10Share, 0) : '—'} hint="of weekday boardings shown" />
        <StatTile label="Growing vs 52 wks" value={withYoy ? `${growing} of ${withYoy}` : '—'} hint={withYoy ? formatPercent(growing / withYoy, 0) : undefined} />
      </div>

      <ChartCard title="Weekday boardings by route type, last 3 years" description="Average weekday boardings per month. Shuttles replace rail during closures." view={{ ...typeView, where: typeWhere }} result={byType}>
        <ResultChart result={byType} chart="stacked" title="Average weekday boardings by route type" height={240} />
      </ChartCard>

      <Card className="py-2">
        <CardContent className="px-2">
          <SortTable rows={rows} columns={columns} rowKey={(r) => r.route.id} initialSort={{ key: 'weekday', desc: true }} caption="Bus routes" stickyFirst pageSize={60} />
        </CardContent>
      </Card>
    </div>
  )
}

function baseline3y(maxIso: string): string {
  return `${Number(maxIso.slice(0, 4)) - 3}-${maxIso.slice(5, 7)}-01`
}
