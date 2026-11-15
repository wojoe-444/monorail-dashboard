import { useId } from 'react'
import { Download, Search, SlidersHorizontal } from 'lucide-react'

import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { Sparkline } from '@/components/charts/Sparkline'
import { StatTile } from '@/components/charts/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Segmented } from '@/components/ui/segmented'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import type { QueryResult } from '@/features/semantic/core/types.ts'
import { downloadCsv } from '@/features/semantic/csv'
import { useDataset, type Station } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatValue } from '@/features/semantic/format'
import { baseline2019, countDayType, recentWeeks } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { exploreHref } from '@/features/semantic/views'
import { Delta, ShareOf } from '@/features/transit/Delta'
import { LineDots } from '@/features/transit/LineChip'
import { href, navigate } from '@/lib/router'

interface Row {
  station: Station
  weekday: number | null
  weekdayYoy: number | null
  saturday: number | null
  sunday: number | null
  entries: number | null
  share: number | null
  recovery: number | null
  trend: number[]
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const SECTORS = ['Loop', 'North', 'Northwest', 'West', 'Southwest', 'South']

export function StationsPage() {
  const ds = useDataset()
  const id = useId()
  const { preset, custom, window, setRange, params, setParams } = useRangeParam('28d')
  const line = params.get('line') ?? ''
  const sector = params.get('sector') ?? ''
  const ada = (params.get('ada') ?? 'all') as 'all' | 'yes' | 'no'
  const q = params.get('q') ?? ''

  const metrics = ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy', 'rail_avg_saturday_entries', 'rail_avg_sunday_entries', 'rail_entries']
  const current = useQueryOrThrow({ metrics, groupBy: ['station'], timeRange: window })
  const base = baseline2019(window)
  const before = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries'], groupBy: ['station'], timeRange: base ?? window })
  const weekly = useQueryOrThrow({ metrics: ['rail_entries'], groupBy: ['station', 'metric_time__week'], timeRange: recentWeeks(ds.maxDay) })
  // The total divides weekday entries by the system's weekdays, not by each station's reporting days.
  const weekdayEntries = new Map(
    useQueryOrThrow({ metrics: ['rail_entries'], groupBy: ['station'], where: ["{{ Dimension('service_day__day_type') }} = 'Weekday'"], timeRange: window }).rows.map((r) => [String(r.station), num(r.rail_entries) ?? 0]),
  )
  const systemWeekdays = countDayType(ds.dayType, window, 'Weekday')

  const byStation = new Map(current.rows.map((r) => [String(r.station), r]))
  const baseBy = new Map(before.rows.map((r) => [String(r.station), num(r.rail_avg_weekday_entries)]))
  const trendBy = new Map<string, number[]>()
  for (const r of weekly.rows) {
    const k = String(r.station)
    const arr = trendBy.get(k) ?? []
    arr.push(num(r.rail_entries) ?? 0)
    trendBy.set(k, arr)
  }
  const systemEntries = current.rows.reduce((a, r) => a + (num(r.rail_entries) ?? 0), 0)

  const allRows: Row[] = ds.stations
    .filter((s) => byStation.has(s.id))
    .map((s) => {
      const r = byStation.get(s.id)!
      const weekday = num(r.rail_avg_weekday_entries)
      const b = baseBy.get(s.id) ?? null
      return {
        station: s,
        weekday,
        weekdayYoy: num(r.rail_avg_weekday_yoy),
        saturday: num(r.rail_avg_saturday_entries),
        sunday: num(r.rail_avg_sunday_entries),
        entries: num(r.rail_entries),
        share: systemEntries && num(r.rail_entries) !== null ? (r.rail_entries as number) / systemEntries : null,
        recovery: base && weekday !== null && b ? weekday / b : null,
        trend: trendBy.get(s.id) ?? [],
      }
    })

  const needle = q.trim().toLowerCase()
  const rows = allRows.filter(
    (r) =>
      (!line || r.station.lines.includes(line)) &&
      (!sector || r.station.sector === sector) &&
      (ada === 'all' || (ada === 'yes') === r.station.ada) &&
      (!needle || r.station.name.toLowerCase().includes(needle) || r.station.id.includes(needle)),
  )

  const totalWeekday = systemWeekdays ? rows.reduce((a, r) => a + (weekdayEntries.get(r.station.id) ?? 0), 0) / systemWeekdays : null
  const growing = rows.filter((r) => (r.weekdayYoy ?? 0) > 0).length
  const withYoy = rows.filter((r) => r.weekdayYoy !== null).length
  const notAccessible = rows.filter((r) => !r.station.ada).length

  const columns: SortColumn<Row>[] = [
    {
      key: 'name',
      label: 'Station',
      sort: (r) => r.station.name,
      render: (r) => (
        <a href={href(`/rail/station?id=${r.station.id}`)} className="flex min-w-0 flex-col rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate font-medium">{r.station.name}</span>
          <span className="text-xs text-muted-foreground">
            {r.station.sector}
            {r.station.lastDay !== null && r.station.lastDay < ds.maxDay - 30 ? ' · no recent data' : ''}
          </span>
        </a>
      ),
    },
    { key: 'lines', label: 'Lines', sort: (r) => r.station.lines.join(','), render: (r) => <LineDots names={r.station.lines} /> },
    {
      key: 'ada',
      label: 'ADA',
      title: 'Every platform is flagged accessible in the CTA stops list',
      sort: (r) => (r.station.ada ? 1 : 0),
      render: (r) => (r.station.ada ? <Badge variant="success">Accessible</Badge> : <Badge variant="secondary">No</Badge>),
    },
    { key: 'weekday', label: 'Avg weekday', align: 'right', sort: (r) => r.weekday, render: (r) => formatValue(r.weekday) },
    { key: 'yoy', label: 'vs 52 wks', title: 'Average weekday entries vs the same days 52 weeks earlier', align: 'right', sort: (r) => r.weekdayYoy, render: (r) => <Delta v={r.weekdayYoy} /> },
    {
      key: 'recovery',
      label: 'of 2019',
      title: 'Average weekday entries as a share of the same weeks in 2019',
      align: 'right',
      sort: (r) => r.recovery,
      render: (r) => <ShareOf v={r.recovery} />,
    },
    { key: 'sat', label: 'Avg Sat', align: 'right', sort: (r) => r.saturday, render: (r) => formatValue(r.saturday) },
    { key: 'sun', label: 'Avg Sun/hol', align: 'right', sort: (r) => r.sunday, render: (r) => formatValue(r.sunday) },
    { key: 'share', label: 'Share', title: 'Share of all rail entries in the period', align: 'right', sort: (r) => r.share, render: (r) => (r.share !== null ? formatPercent(r.share, 1) : '—') },
    {
      key: 'trend',
      label: '12 weeks',
      title: 'Weekly entries, last 12 weeks',
      render: (r) => <Sparkline data={r.trend} className={(r.weekdayYoy ?? 0) >= 0 ? 'text-primary' : 'text-muted-foreground'} />,
    },
  ]

  const exportRows = () => {
    const result: QueryResult = {
      columns: [
        { key: 'station_id', label: 'Station id', kind: 'entity' },
        { key: 'station_name', label: 'Station', kind: 'dimension' },
        { key: 'lines', label: 'Lines', kind: 'dimension' },
        { key: 'sector', label: 'Sector', kind: 'dimension' },
        { key: 'ada_accessible', label: 'ADA', kind: 'dimension' },
        { key: 'avg_weekday', label: 'Avg weekday', kind: 'metric' },
        { key: 'avg_weekday_yoy', label: 'vs 52 wks', kind: 'metric' },
        { key: 'share_of_2019', label: 'of 2019', kind: 'metric' },
        { key: 'avg_saturday', label: 'Avg Sat', kind: 'metric' },
        { key: 'avg_sunday_holiday', label: 'Avg Sun/hol', kind: 'metric' },
        { key: 'entries', label: 'Entries', kind: 'metric' },
      ],
      rows: rows.map((r) => ({
        station_id: r.station.id,
        station_name: r.station.name,
        lines: r.station.lines.join(', '),
        sector: r.station.sector,
        ada_accessible: String(r.station.ada),
        avg_weekday: r.weekday,
        avg_weekday_yoy: r.weekdayYoy,
        share_of_2019: r.recovery,
        avg_saturday: r.saturday,
        avg_sunday_holiday: r.sunday,
        entries: r.entries,
      })),
      plan: [],
      ms: 0,
    }
    downloadCsv(result, `stations ${window.start} to ${window.end}`)
  }

  const where = [
    ...(line ? [`{{ Dimension('station__lines') }} in (${allLineCombos(ds.stations, line).map((c) => `'${c}'`).join(', ')})`] : []),
    ...(sector ? [`{{ Dimension('station__sector') }} = '${sector}'`] : []),
    ...(ada !== 'all' ? [`{{ Dimension('station__ada_accessible') }} = ${ada === 'yes'}`] : []),
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Rail stations"
        description="Every 'L' station: weekday, weekend and holiday entries, change vs 52 weeks earlier, and recovery against 2019."
        actions={
          <>
            <Button variant="outline" onClick={exportRows}>
              <Download />
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  exploreHref(
                    { metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'], groupBy: ['station__station_name'], where, range: preset, custom, chart: 'table' },
                    'Stations',
                  ),
                )
              }
            >
              <SlidersHorizontal />
              Explore
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '6m', '1y', 'ytd']} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-line`} className="text-xs text-muted-foreground">
            Line
          </Label>
          <NativeSelect id={`${id}-line`} value={line} onChange={(e) => setParams({ line: e.target.value })} className="w-36">
            <option value="">All lines</option>
            {ds.lines.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-sector`} className="text-xs text-muted-foreground">
            Sector
          </Label>
          <NativeSelect id={`${id}-sector`} value={sector} onChange={(e) => setParams({ sector: e.target.value })} className="w-36">
            <option value="">All sectors</option>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground" id={`${id}-ada`}>
            Accessibility
          </span>
          <Segmented
            aria-label="Accessibility"
            value={ada}
            onChange={(v) => setParams({ ada: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'yes', label: 'ADA' },
              { value: 'no', label: 'Not ADA' },
            ]}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-q`} className="text-xs text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${id}-q`} value={q} onChange={(e) => setParams({ q: e.target.value })} placeholder="Station name or id" className="pl-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Stations" value={String(rows.length)} hint={rows.length !== allRows.length ? `of ${allRows.length}` : 'reporting in period'} />
        <StatTile label="Avg weekday entries" value={formatCompact(totalWeekday)} hint={`stations shown, per weekday (${systemWeekdays} in period)`} />
        <StatTile label="Growing vs 52 wks" value={withYoy ? `${growing} of ${withYoy}` : '—'} hint={withYoy ? formatPercent(growing / withYoy, 0) : undefined} />
        <StatTile label="Not ADA accessible" value={String(notAccessible)} hint={rows.length ? `${formatPercent(notAccessible / rows.length, 0)} of shown` : undefined} />
      </div>

      <Card className="py-2">
        <CardContent className="px-2">
          <SortTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.station.id}
            initialSort={{ key: 'weekday', desc: true }}
            caption="Rail stations"
            stickyFirst
            pageSize={60}
          />
        </CardContent>
      </Card>
    </div>
  )
}

/** Every `lines` value that includes the given line, for a MetricFlow IN filter. */
function allLineCombos(stations: Station[], line: string): string[] {
  return [...new Set(stations.filter((s) => s.lines.includes(line)).map((s) => s.lines.join(', ')))]
}
