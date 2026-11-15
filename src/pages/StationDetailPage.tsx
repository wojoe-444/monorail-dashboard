import { useState } from 'react'
import { ArrowLeft, MapPin, SlidersHorizontal } from 'lucide-react'

import { CalendarHeatmap } from '@/components/charts/CalendarHeatmap'
import { PeriodBarChart } from '@/components/charts/PeriodBarChart'
import { StatTile } from '@/components/charts/StatTile'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { dayOfIso, isoOfDay } from '@/features/semantic/core/time.ts'
import { useDataset } from '@/features/semantic/data'
import { formatCompact, formatDay, formatPercent, formatPeriod, formatRange, formatSignedPercent, formatValue, ratioOf } from '@/features/semantic/format'
import { pivotResult } from '@/features/semantic/pivot'
import { baseline2019, resolveRange } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { exploreHref, type ViewSpec } from '@/features/semantic/views'
import { Delta } from '@/features/transit/Delta'
import { detectExceptions, KIND_LABEL, KIND_VARIANT } from '@/features/transit/exceptions'
import { LineChip } from '@/features/transit/LineChip'
import { href, navigate } from '@/lib/router'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function km(a: { lat: number | null; lon: number | null }, b: { lat: number | null; lon: number | null }) {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return Infinity
  const dy = (a.lat - b.lat) * 111.2
  const dx = (a.lon - b.lon) * 111.2 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

export function StationDetailPage() {
  const ds = useDataset()
  const { params } = useRangeParam('90d')
  const id = params.get('id') ?? ''
  if (!ds.stationById.has(id)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Station not found" description={id ? `No station with id ${id} in the data.` : 'No station selected.'} />
        <Button variant="outline" className="w-fit" onClick={() => navigate('/rail')}>
          <ArrowLeft />
          All stations
        </Button>
      </div>
    )
  }
  return <StationDetail key={id} stationId={id} />
}

function StationDetail({ stationId }: { stationId: string }) {
  const { preset, custom, window, setRange } = useRangeParam('90d')
  const [calendar, setCalendar] = useState<'volume' | 'yoy'>('volume')
  const [smooth, setSmooth] = useState<'raw' | '7d'>('raw')
  const ds = useDataset()
  const station = ds.stationById.get(stationId)!
  const where = [`{{ Entity('station') }} = '${station.id}'`]

  const kpi = useQueryOrThrow({
    metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy', 'rail_avg_saturday_entries', 'rail_avg_sunday_entries', 'rail_entries', 'rail_entries_yoy'],
    where,
    timeRange: window,
  }).rows[0] ?? {}
  const base = baseline2019(window)
  const kpi2019 = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries'], where, timeRange: base ?? window }).rows[0] ?? {}
  const recovery = base ? ratioOf(num(kpi.rail_avg_weekday_entries), num(kpi2019.rail_avg_weekday_entries)) : null

  // Rank among all stations by average weekday entries in the period.
  const ranking = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries'], groupBy: ['station'], timeRange: window }).rows.filter((r) => num(r.rail_avg_weekday_entries) !== null)
  const rank = ranking.findIndex((r) => r.station === station.id) + 1

  const dailyView: ViewSpec = { metrics: ['rail_entries', 'rail_entries_ly'], groupBy: ['metric_time__day'], where, range: preset, custom, chart: 'line', smooth: smooth === '7d' ? 7 : undefined }
  const daily = useQueryOrThrow({ metrics: ['rail_entries', 'rail_entries_ly'], groupBy: ['metric_time__day'], where, timeRange: window })
  const dailyPivot = pivotResult(daily, { smooth: smooth === '7d' ? 7 : undefined })

  const monthlyView: ViewSpec = { metrics: ['rail_avg_weekday_entries', 'rail_avg_saturday_entries', 'rail_avg_sunday_entries'], groupBy: ['metric_time__month'], where, range: 'all', chart: 'line' }
  const monthly = useQueryOrThrow({ metrics: monthlyView.metrics, groupBy: ['metric_time__month'], where })
  const monthlyPivot = pivotResult(monthly)

  const dow = useQueryOrThrow({ metrics: ['rail_avg_daily_entries'], groupBy: ['service_day__day_of_week'], where: [...where, "{{ Dimension('service_day__is_holiday') }} = false"], timeRange: window })
  const dowLy = useQueryOrThrow({
    metrics: ['rail_avg_daily_entries'],
    groupBy: ['service_day__day_of_week'],
    where: [...where, "{{ Dimension('service_day__is_holiday') }} = false"],
    timeRange: { start: isoOfDay(dayOfIso(window.start) - 364), end: isoOfDay(dayOfIso(window.end) - 364) },
  })
  const dowData = DOW.map((d) => ({
    t: d.slice(0, 3),
    now: num(dow.rows.find((r) => r.service_day__day_of_week === d)?.rail_avg_daily_entries),
    ly: num(dowLy.rows.find((r) => r.service_day__day_of_week === d)?.rail_avg_daily_entries),
  }))

  const year = resolveRange('1y', ds.minDay, ds.maxDay)
  const calendarResult = useQueryOrThrow({ metrics: ['rail_entries', 'rail_entries_yoy'], groupBy: ['metric_time__day'], where, timeRange: year })
  const calendarRows = calendarResult.rows
  const calByDay = new Map(calendarRows.map((r) => [dayOfIso(String(r.metric_time__day)), r]))
  const cells = []
  for (let d = dayOfIso(year.start); d <= ds.maxDay; d++) {
    const r = calByDay.get(d)
    cells.push({ day: d, value: calendar === 'volume' ? num(r?.rail_entries) : num(r?.rail_entries_yoy) })
  }

  // Exceptions over the selected period, or the last 12 months when the period is shorter (markers and the list agree).
  const excStart = Math.min(dayOfIso(window.start), dayOfIso(year.start))
  const exceptions = detectExceptions(ds, { start: excStart, end: dayOfIso(window.end), threshold: 0.35, minExpected: 200, modes: ['rail'], entityIds: [station.id] })

  // An ongoing zero-count or no-data episode is a closure or a feed outage: say so up top.
  const outage = exceptions.find((e) => e.ongoing && (e.kind === 'zero' || e.kind === 'missing'))

  const nearby = ds.stations
    .filter((s) => s.id !== station.id)
    .map((s) => ({ s, d: km(station, s) }))
    .filter((x) => x.d < 1.6)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
  const nearbyStats = new Map(ranking.map((r) => [String(r.station), num(r.rail_avg_weekday_entries)]))
  const stale = station.lastDay !== null && station.lastDay < ds.maxDay - 7

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Station ${station.id}`}
        title={station.name}
        description={`${station.sector} sector · ${station.lines.length ? `${station.lines.join(', ')} line${station.lines.length > 1 ? 's' : ''}` : 'no line data'} · ${station.ada ? 'ADA accessible' : 'not ADA accessible'}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/map?focus=${station.id}`)}>
              <MapPin />
              Map
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(exploreHref({ metrics: ['rail_avg_weekday_entries'], groupBy: ['metric_time__week'], where, range: '1y', chart: 'line' }, station.name))}
            >
              <SlidersHorizontal />
              Explore
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {station.lines.map((l) => (
          <a key={l} href={href(`/lines/line?id=${ds.lineByName.get(l)?.id}`)} className="rounded-full border px-2.5 py-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <LineChip name={l} />
          </a>
        ))}
        {station.isTransfer && <Badge variant="info">Transfer station</Badge>}
        {stale && <Badge variant="warning">No data since {formatDay(station.lastDay!)}</Badge>}
        {outage && (
          <Badge variant={outage.kind === 'zero' ? 'destructive' : 'warning'}>
            {outage.kind === 'zero' ? 'Reporting zero entries' : 'No data'} since {formatDay(outage.start)}
          </Badge>
        )}
        <span className="flex-1" />
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['28d', '90d', '6m', '1y', 'ytd', 'all']} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile hero label="Avg weekday entries" value={formatCompact(num(kpi.rail_avg_weekday_entries))} delta={num(kpi.rail_avg_weekday_yoy) ?? undefined} deltaLabel="vs 52 wks" hint={rank ? `· #${rank} of ${ranking.length}` : undefined} />
        <StatTile label="Avg Saturday" value={formatCompact(num(kpi.rail_avg_saturday_entries))} />
        <StatTile label="Avg Sunday / holiday" value={formatCompact(num(kpi.rail_avg_sunday_entries))} />
        <StatTile label="Weekday vs 2019" value={recovery !== null ? formatPercent(recovery, 0) : '—'} hint={base ? `same weeks of 2019` : 'needs a 2020+ window'} />
      </div>

      <ChartCard
        title="Daily entries"
        description={`${formatRange(window.start, window.end)}, against the same days 52 weeks earlier. Click a day to see that week.`}
        view={dailyView}
        result={daily}
        controls={
          <Segmented
            aria-label="Smoothing"
            value={smooth}
            onChange={setSmooth}
            options={[
              { value: 'raw', label: 'Daily' },
              { value: '7d', label: '7-day avg' },
            ]}
          />
        }
      >
        <TimeSeriesChart
          data={dailyPivot.data}
          series={[
            { key: 'rail_entries', label: 'Entries', color: 'var(--series-1)' },
            { key: 'rail_entries_ly', label: '52 weeks earlier', color: 'var(--series-other)', reference: true },
          ]}
          markers={exceptions.filter((e) => e.start >= dayOfIso(window.start)).map((e) => ({ t: isoOfDay(e.start), label: KIND_LABEL[e.kind] }))}
          formatTick={(t) => formatPeriod(t, 'day', true)}
          formatTitle={(t) => formatDay(dayOfIso(t), true)}
          formatValue={(v) => formatValue(v)}
          formatAxis={(v) => formatCompact(v)}
          footer={(t) => ds.dayType.get(dayOfIso(t))}
          onSelect={(t) => setRange('custom', { start: isoOfDay(dayOfIso(t) - 3), end: isoOfDay(dayOfIso(t) + 3) })}
          ariaLabel={`Daily entries at ${station.name}`}
          area
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Since 2019" description="Average entries by day type, by month." view={monthlyView} result={monthly}>
          <TimeSeriesChart
            data={monthlyPivot.data}
            series={[
              { key: 'rail_avg_weekday_entries', label: 'Weekday', color: 'var(--series-1)' },
              { key: 'rail_avg_saturday_entries', label: 'Saturday', color: 'var(--series-2)' },
              { key: 'rail_avg_sunday_entries', label: 'Sunday/holiday', color: 'var(--series-3)' },
            ]}
            formatTick={(t) => formatPeriod(t, 'year')}
            ticks={monthlyPivot.data.filter((d) => String(d.t).slice(5, 7) === '01').map((d) => String(d.t))}
            formatTitle={(t) => formatPeriod(t, 'month')}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            height={240}
            ariaLabel={`Average entries by day type per month at ${station.name}`}
          />
        </ChartCard>
        <ChartCard
          title="Day of week"
          description="Average entries per day (holidays excluded), vs 52 weeks earlier."
          view={{ metrics: ['rail_avg_daily_entries'], groupBy: ['service_day__day_of_week'], where: [...where, "{{ Dimension('service_day__is_holiday') }} = false"], range: preset, custom, chart: 'bar' }}
          result={dow}
        >
          <PeriodBarChart
            data={dowData}
            series={[
              { key: 'now', label: 'This period', color: 'var(--series-1)' },
              { key: 'ly', label: '52 weeks earlier', color: 'var(--series-other)' },
            ]}
            formatTick={(t) => t}
            formatTitle={(t) => t}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            height={240}
            ariaLabel={`Average entries by day of week at ${station.name}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Last 12 months, day by day"
        description={calendar === 'volume' ? 'Entries per day.' : 'Change vs the same day 52 weeks earlier. Holidays that moved weekday show as one-day swings.'}
        controls={
          <Segmented
            aria-label="Calendar color"
            value={calendar}
            onChange={setCalendar}
            options={[
              { value: 'volume', label: 'Volume' },
              { value: 'yoy', label: 'vs 52 wks' },
            ]}
          />
        }
        result={calendarResult}
      >
        <CalendarHeatmap
          cells={cells}
          scale={calendar === 'volume' ? 'sequential' : 'diverging'}
          extent={0.5}
          formatValue={(v) => (calendar === 'volume' ? formatValue(v) : formatSignedPercent(v))}
          formatDay={(d) => formatDay(d, true)}
          describe={(d) => ds.dayType.get(d)}
          onSelect={(d) => setRange('custom', { start: isoOfDay(d - 13), end: isoOfDay(Math.min(ds.maxDay, d + 14)) })}
          ariaLabel={`Calendar of daily entries at ${station.name} over the last 12 months`}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="gap-4 xl:col-span-2">
          <CardHeader>
            <CardTitle>Exceptions{dayOfIso(window.start) < dayOfIso(year.start) ? `, ${formatRange(window.start, window.end)}` : ', last 12 months'}</CardTitle>
            <CardDescription>Days 35%+ off the usual pattern for that weekday (median of the previous 8 weeks).</CardDescription>
          </CardHeader>
          <CardContent>
            {exceptions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No exceptions in the last 12 months.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {exceptions
                  .sort((a, b) => b.start - a.start)
                  .slice(0, 12)
                  .map((e) => (
                    <li key={e.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2 text-sm">
                      <Badge variant={KIND_VARIANT[e.kind]} className="w-20">
                        {KIND_LABEL[e.kind]}
                      </Badge>
                      <button
                        type="button"
                        className="min-w-0 truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setRange('custom', { start: isoOfDay(e.start - 14), end: isoOfDay(Math.min(ds.maxDay, e.end + 14)) })}
                      >
                        {e.days === 1 ? formatDay(e.start, true) : `${formatDay(e.start)} – ${formatDay(e.end)} (${e.days} days)`}
                        {e.ongoing ? ' · ongoing' : ''}
                      </button>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatValue(e.actual)} vs {formatValue(Math.round(e.expected))} expected
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Nearby stations</CardTitle>
            <CardDescription>Within 1.6 km (about a mile): where riders go when this station is closed.</CardDescription>
          </CardHeader>
          <CardContent>
            {nearby.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stations within a mile.</p>
            ) : (
              <ul className="flex flex-col">
                {nearby.map(({ s, d }) => (
                  <li key={s.id}>
                    <a href={href(`/rail/station?id=${s.id}`)} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{d.toFixed(1)} km</span>
                      <span className="w-14 text-right text-xs font-medium tabular-nums">{formatCompact(nearbyStats.get(s.id) ?? null)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
              <dt className="text-muted-foreground">Data from</dt>
              <dd className="text-right tabular-nums">{station.firstDay !== null ? formatDay(station.firstDay) : '—'}</dd>
              <dt className="text-muted-foreground">Data to</dt>
              <dd className="text-right tabular-nums">{station.lastDay !== null ? formatDay(station.lastDay) : '—'}</dd>
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd className="text-right font-mono">{station.lat !== null ? `${station.lat.toFixed(4)}, ${station.lon?.toFixed(4)}` : '—'}</dd>
              <dt className="text-muted-foreground">Entries in period</dt>
              <dd className="text-right tabular-nums">
                {formatValue(num(kpi.rail_entries))} <Delta v={num(kpi.rail_entries_yoy)} className="text-xs" />
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
