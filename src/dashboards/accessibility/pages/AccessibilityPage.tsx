import { ArrowUpRight } from 'lucide-react'

import { pathIn } from '@/app/hub'
import { RankedBars } from '@/components/charts/RankedBars'
import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { StatTile } from '@/components/charts/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { ViewCard } from '@/features/semantic/components/ViewCard'
import { useDataset, type Station } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatValue, ratioOf } from '@/features/semantic/format'
import { countDayType } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { specFromSavedQuery } from '@/features/semantic/views'
import { Delta } from '@/features/transit/Delta'
import { LineDots, LineSwatch } from '@/features/transit/LineChip'
import { href } from '@/lib/router'

interface Row {
  station: Station
  weekday: number | null
  yoy: number | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * A second dashboard on the same CTA semantic layer: where riders enter
 * stations without step-free access. It owns no data of its own; it reads the
 * CTA dataset and links into the CTA dashboard for station detail.
 */
export function AccessibilityPage() {
  const ds = useDataset()
  const { engine } = ds
  const { preset, custom, window, setRange } = useRangeParam('28d', ['28d', '90d', '6m', '1y', 'ytd'])

  const byAda = useQueryOrThrow({ metrics: ['rail_entries', 'rail_avg_weekday_entries'], groupBy: ['station__ada_accessible'], timeRange: window }).rows
  const entriesAt = (flag: string) => num(byAda.find((r) => r.station__ada_accessible === flag)?.rail_entries)
  const accessibleShare = ratioOf(entriesAt('true'), (entriesAt('true') ?? 0) + (entriesAt('false') ?? 0))

  const stations = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'], groupBy: ['station'], timeRange: window }).rows
  const byStation = new Map(stations.map((r) => [String(r.station), r]))
  const located = ds.stations.filter((s) => s.lines.length > 0)
  const accessible = located.filter((s) => s.ada)
  const rows: Row[] = located
    .filter((s) => !s.ada)
    .map((s) => ({ station: s, weekday: num(byStation.get(s.id)?.rail_avg_weekday_entries), yoy: num(byStation.get(s.id)?.rail_avg_weekday_yoy) }))
    .filter((r) => (r.weekday ?? 0) > 0)
  // Weekday entries over the system's weekdays (not a sum of per-station averages with different day counts).
  const weekdayEntries = new Map(
    useQueryOrThrow({ metrics: ['rail_entries'], groupBy: ['station'], where: ["{{ Dimension('service_day__day_type') }} = 'Weekday'"], timeRange: window }).rows.map((r) => [
      String(r.station),
      num(r.rail_entries) ?? 0,
    ]),
  )
  const weekdays = countDayType(ds.dayType, window, 'Weekday')
  const notAccessibleEntries = rows.reduce((a, r) => a + (weekdayEntries.get(r.station.id) ?? 0), 0)
  const notAccessibleWeekday = weekdays ? notAccessibleEntries / weekdays : null

  const trend = engine.manifest.savedQueries.find((q) => q.name === 'accessible_station_weekday')

  const columns: SortColumn<Row>[] = [
    {
      key: 'name',
      label: 'Station',
      sort: (r) => r.station.name,
      render: (r) => (
        <a
          href={href(pathIn('cta', `/rail/station?id=${r.station.id}`))}
          className="inline-flex items-center gap-1 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {r.station.name}
          <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden />
        </a>
      ),
    },
    { key: 'lines', label: 'Lines', sort: (r) => r.station.lines.join(','), render: (r) => <LineDots names={r.station.lines} /> },
    { key: 'sector', label: 'Sector', sort: (r) => r.station.sector, render: (r) => r.station.sector },
    { key: 'weekday', label: 'Avg weekday entries', align: 'right', sort: (r) => r.weekday, render: (r) => formatValue(r.weekday) },
    { key: 'yoy', label: 'vs 52 wks', align: 'right', sort: (r) => r.yoy, render: (r) => <Delta v={r.yoy} /> },
    {
      key: 'share',
      label: 'Share of inaccessible entries',
      align: 'right',
      sort: (r) => weekdayEntries.get(r.station.id) ?? 0,
      render: (r) => (notAccessibleEntries ? formatPercent((weekdayEntries.get(r.station.id) ?? 0) / notAccessibleEntries, 1) : '—'),
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Station accessibility"
        title="Step-free access"
        description="Where riders enter 'L' stations that are not fully accessible, to rank stations for accessibility work. Built on the CTA ridership semantic layer."
      />

      <RangeControl value={preset} custom={custom} onChange={setRange} presets={['28d', '90d', '6m', '1y', 'ytd']} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile hero label="Entries at accessible stations" value={accessibleShare !== null ? formatPercent(accessibleShare, 0) : '—'} hint="of all rail entries in the period" />
        <StatTile label="Accessible stations" value={`${accessible.length} of ${located.length}`} hint={formatPercent(accessible.length / Math.max(1, located.length), 0)} />
        <StatTile label="Weekday entries, not accessible" value={formatCompact(notAccessibleWeekday)} hint={`per weekday (${weekdays} in period)`} />
        <StatTile label="Stations to prioritize" value={String(rows.filter((r) => (r.weekday ?? 0) >= 2000).length)} hint="not accessible, 2,000+ weekday entries" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {trend && (
          <ViewCard
            className="xl:col-span-2"
            title="Accessible vs other stations since 2019"
            description="Average weekday entries per month. A team view from the semantic layer."
            view={specFromSavedQuery(trend)}
            height={260}
          />
        )}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Accessible stations by line</CardTitle>
            <CardDescription>Share of each line's stations flagged accessible on every platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              items={ds.lines.map((l) => {
                const on = located.filter((s) => s.lines.includes(l.name))
                const share = on.length ? on.filter((s) => s.ada).length / on.length : 0
                return {
                  key: l.id,
                  label: (
                    <span className="flex items-center gap-2">
                      <LineSwatch line={l} />
                      {l.name}
                    </span>
                  ),
                  name: l.name,
                  value: share,
                  display: formatPercent(share, 0),
                }
              })}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-2">
        <CardHeader>
          <CardTitle>Busiest stations without step-free access</CardTitle>
          <CardDescription>Ranked by average weekday entries. Station names open the CTA ridership dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <SortTable rows={rows} columns={columns} rowKey={(r) => r.station.id} initialSort={{ key: 'weekday', desc: true }} caption="Stations without step-free access" pageSize={25} />
        </CardContent>
      </Card>
    </div>
  )
}
