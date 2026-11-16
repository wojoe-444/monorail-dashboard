import { ArrowRight, TriangleAlert } from 'lucide-react'

import { PeriodBarChart } from '@/components/charts/PeriodBarChart'
import { RankedBars } from '@/components/charts/RankedBars'
import { Sparkline } from '@/components/charts/Sparkline'
import { StatTile } from '@/components/charts/StatTile'
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { ResultTable } from '@/features/semantic/components/ResultTable'
import { dayOfIso, isoOfDay } from '@/features/semantic/core/time.ts'
import type { QueryResult } from '@/features/semantic/core/types.ts'
import { resultCsvData } from '@/features/semantic/csv'
import { useDataset } from '@/features/semantic/data'
import {
  formatCompact,
  formatDay,
  formatPercent,
  formatPeriod,
  formatRange,
  formatSignedPercent,
  formatValue,
  ratioOf,
} from '@/features/semantic/format'
import { pivotResult } from '@/features/semantic/pivot'
import { baseline2019, countHolidays, priorYear, recentWeeks, resolveRange } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import type { ViewSpec } from '@/features/semantic/views'
import { detectExceptions, episodesCsv, KIND_LABEL, KIND_VARIANT } from '@/features/transit/exceptions'
import { Delta } from '@/features/transit/Delta'
import { LineSwatch } from '@/features/transit/LineChip'
import { useUrlParams } from '@/hooks/useUrlParams'
import { dashHref, dashNavigate } from '@/app/hub'
import { csvFromRecords } from '@/lib/download'
import { cn } from '@/lib/utils'

const PERIODS = ['1d', '7d', '28d', '90d', 'ytd'] as const
type Mode = 'total' | 'rail' | 'bus'
const MODE_METRIC: Record<Mode, { now: string; ly: string; label: string }> = {
  total: { now: 'total_rides', ly: 'total_rides_ly', label: 'Total rides' },
  rail: { now: 'rail_entries', ly: 'rail_entries_ly', label: 'Rail entries' },
  bus: { now: 'bus_boardings', ly: 'bus_boardings_ly', label: 'Bus boardings' },
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const ratioDelta = (now: number | null, then: number | null) => (now !== null && then ? now / then - 1 : undefined)

export function OverviewPage() {
  const ds = useDataset()
  const { preset, custom, window, setRange } = useRangeParam('28d', [...PERIODS])
  const [params, setParams] = useUrlParams()
  const mode: Mode = (['total', 'rail', 'bus'] as const).find((m) => m === params.get('mode')) ?? 'total'

  // KPIs for the selected period, vs 52 weeks earlier and vs the same weeks of 2019.
  const kpi =
    useQueryOrThrow({
      metrics: [
        'total_rides',
        'total_rides_yoy',
        'total_avg_weekday_rides',
        'rail_avg_weekday_entries',
        'rail_avg_weekday_entries_ly',
        'bus_avg_weekday_boardings',
        'bus_avg_weekday_boardings_ly',
        'rail_share',
      ],
      timeRange: window,
    }).rows[0] ?? {}
  const base = baseline2019(window)
  // A total against a window with a different number of holidays (Labor Day in one, not the other) is not a like-for-like change.
  const holidaysNow = countHolidays(ds.holidays, window)
  const holidaysLy = countHolidays(ds.holidays, priorYear(window))
  const holidayMismatch = holidaysNow !== holidaysLy
  const kpi2019 =
    useQueryOrThrow({
      metrics: ['total_avg_weekday_rides', 'rail_avg_weekday_entries', 'bus_avg_weekday_boardings'],
      timeRange: base ?? window,
    }).rows[0] ?? {}
  const weekdayLy = (num(kpi.rail_avg_weekday_entries_ly) ?? 0) + (num(kpi.bus_avg_weekday_boardings_ly) ?? 0) || null
  const weekdayNow = num(kpi.total_avg_weekday_rides)
  const recovery = base ? ratioOf(weekdayNow, num(kpi2019.total_avg_weekday_rides)) : null
  const ofBaseline = (now: number | null, then: number | null) => {
    const r = base ? ratioOf(now, then) : null
    return r === null ? undefined : `· ${formatPercent(r, 0)} of 2019`
  }

  // Weekly sparklines (12 complete weeks ending on the last day).
  const spark = useQueryOrThrow({
    metrics: ['total_rides', 'rail_avg_weekday_entries', 'bus_avg_weekday_boardings', 'total_avg_weekday_rides'],
    groupBy: ['metric_time__week'],
    timeRange: recentWeeks(ds.maxDay),
  }).rows
  const sparkOf = (k: string) => spark.map((r) => num(r[k]) ?? 0)

  // Trend: trailing 12 months, the selected period shaded.
  const year = resolveRange('1y', ds.minDay, ds.maxDay)
  const m = MODE_METRIC[mode]
  const trendView: ViewSpec = { metrics: [m.now, m.ly], groupBy: ['metric_time__day'], where: [], range: '1y', chart: 'line', smooth: 7 }
  const trend = useQueryOrThrow({ metrics: [m.now, m.ly], groupBy: ['metric_time__day'], timeRange: year })
  const trendPivot = pivotResult(trend, { smooth: 7 })

  // Recovery: monthly average weekday vs the same month of 2019.
  const monthly = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries', 'bus_avg_weekday_boardings'], groupBy: ['metric_time__month'] })
  const byMonth2019 = new Map(
    monthly.rows.filter((r) => String(r.metric_time__month).startsWith('2019')).map((r) => [String(r.metric_time__month).slice(5, 7), r]),
  )
  const recoveryData = monthly.rows
    .filter((r) => !String(r.metric_time__month).startsWith('2019'))
    .map((r) => {
      const b = byMonth2019.get(String(r.metric_time__month).slice(5, 7))
      return {
        t: String(r.metric_time__month),
        rail:
          b && num(r.rail_avg_weekday_entries) && num(b.rail_avg_weekday_entries)
            ? (r.rail_avg_weekday_entries as number) / (b.rail_avg_weekday_entries as number)
            : null,
        bus:
          b && num(r.bus_avg_weekday_boardings) && num(b.bus_avg_weekday_boardings)
            ? (r.bus_avg_weekday_boardings as number) / (b.bus_avg_weekday_boardings as number)
            : null,
      }
    })
  const lastRecovery = recoveryData[recoveryData.length - 1]
  // The card's table and CSV carry the ratios it draws, not the averages behind them.
  const recoveryResult: QueryResult = {
    columns: [
      { key: 'month', label: 'Month', kind: 'time', grain: 'month' },
      { key: 'rail_share_of_2019', label: 'Rail, share of same month 2019', kind: 'metric', format: 'percent' },
      { key: 'bus_share_of_2019', label: 'Bus, share of same month 2019', kind: 'metric', format: 'percent' },
    ],
    rows: recoveryData.map((d) => ({ month: d.t, rail_share_of_2019: d.rail, bus_share_of_2019: d.bus })),
    plan: monthly.plan,
    ms: monthly.ms,
  }

  // Day types: average daily rides per day type, now vs 52 weeks earlier.
  const dayTypes = useQueryOrThrow({
    metrics: ['rail_avg_daily_entries', 'bus_avg_daily_boardings'],
    groupBy: ['service_day__day_type'],
    timeRange: window,
  })
  const dayTypesLy = useQueryOrThrow({
    metrics: ['rail_avg_daily_entries', 'bus_avg_daily_boardings'],
    groupBy: ['service_day__day_type'],
    timeRange: priorYear(window),
  })
  const dayTypeOrder = ['Weekday', 'Saturday', 'Sunday/Holiday']
  const dayTypeData = dayTypeOrder.map((t) => {
    const now = dayTypes.rows.find((r) => r.service_day__day_type === t)
    const ly = dayTypesLy.rows.find((r) => r.service_day__day_type === t)
    return {
      t,
      rail: num(now?.rail_avg_daily_entries),
      bus: num(now?.bus_avg_daily_boardings),
      railLy: num(ly?.rail_avg_daily_entries),
      busLy: num(ly?.bus_avg_daily_boardings),
    }
  })

  // Stations: busiest and biggest movers (weekday averages, stations with at least 1,000 weekday entries a year earlier).
  const stations = useQueryOrThrow({
    metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy', 'rail_avg_weekday_entries_ly'],
    groupBy: ['station', 'station__station_name'],
    timeRange: window,
  })
  const stationRows = stations.rows.filter((r) => num(r.rail_avg_weekday_entries) !== null)
  const busiest = [...stationRows]
    .sort((a, b) => (b.rail_avg_weekday_entries as number) - (a.rail_avg_weekday_entries as number))
    .slice(0, 10)
  // Closed stations (zero entries now) are not demand changes: they are listed on Exceptions instead.
  const movers = stationRows.filter(
    (r) =>
      (num(r.rail_avg_weekday_entries_ly) ?? 0) >= 1000 &&
      num(r.rail_avg_weekday_yoy) !== null &&
      (num(r.rail_avg_weekday_entries) ?? 0) > 0,
  )
  const gainers = [...movers].sort((a, b) => (b.rail_avg_weekday_yoy as number) - (a.rail_avg_weekday_yoy as number)).slice(0, 5)
  const decliners = [...movers].sort((a, b) => (a.rail_avg_weekday_yoy as number) - (b.rail_avg_weekday_yoy as number)).slice(0, 5)

  // Lines.
  const lines = useQueryOrThrow({
    metrics: ['line_avg_weekday_allocated', 'line_avg_weekday_yoy'],
    groupBy: ['line__line_name'],
    timeRange: window,
  })

  // Exceptions on the latest 7 days.
  const recent = detectExceptions(ds, { start: ds.maxDay - 6, end: ds.maxDay, threshold: 0.4, minExpected: 500, modes: ['rail', 'bus'] })

  const periodLabel = window.start === window.end ? formatDay(dayOfIso(window.start), true) : formatRange(window.start, window.end)
  const weekdaysInWindow = [...Array(dayOfIso(window.end) - dayOfIso(window.start) + 1)].some(
    (_, i) => ds.dayType.get(dayOfIso(window.start) + i) === 'Weekday',
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="CTA ridership"
        title="System overview"
        description={`Rail entries and bus boardings across the CTA. Data through ${formatDay(ds.maxDay, true)}; the CTA publishes about eight weeks behind.`}
        actions={
          <Button variant="outline" onClick={() => dashNavigate('/exceptions')}>
            <TriangleAlert />
            Exceptions
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={[...PERIODS]} />
        <span className="text-xs text-muted-foreground">Compared with the same days 52 weeks earlier (weekday-aligned).</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          label="Avg weekday rides"
          value={formatCompact(weekdayNow)}
          delta={ratioDelta(weekdayNow, weekdayLy)}
          deltaLabel="vs 52 wks"
          hint={recovery !== null ? `· ${formatPercent(recovery, 0)} of 2019` : weekdaysInWindow ? undefined : 'No weekdays in period'}
          trend={<Sparkline data={sparkOf('total_avg_weekday_rides')} className="text-primary" />}
        />
        <StatTile
          label="Rail, avg weekday"
          value={formatCompact(num(kpi.rail_avg_weekday_entries))}
          delta={ratioDelta(num(kpi.rail_avg_weekday_entries), num(kpi.rail_avg_weekday_entries_ly))}
          deltaLabel="vs 52 wks"
          hint={ofBaseline(num(kpi.rail_avg_weekday_entries), num(kpi2019.rail_avg_weekday_entries))}
          trend={<Sparkline data={sparkOf('rail_avg_weekday_entries')} className="text-muted-foreground" />}
        />
        <StatTile
          label="Bus, avg weekday"
          value={formatCompact(num(kpi.bus_avg_weekday_boardings))}
          delta={ratioDelta(num(kpi.bus_avg_weekday_boardings), num(kpi.bus_avg_weekday_boardings_ly))}
          deltaLabel="vs 52 wks"
          hint={ofBaseline(num(kpi.bus_avg_weekday_boardings), num(kpi2019.bus_avg_weekday_boardings))}
          trend={<Sparkline data={sparkOf('bus_avg_weekday_boardings')} className="text-muted-foreground" />}
        />
        <StatTile
          label="Total rides in period"
          value={formatCompact(num(kpi.total_rides))}
          delta={holidayMismatch ? undefined : (num(kpi.total_rides_yoy) ?? undefined)}
          deltaLabel="vs 52 wks"
          hint={
            holidayMismatch
              ? `Not compared: ${holidaysNow} holiday${holidaysNow === 1 ? '' : 's'} now vs ${holidaysLy} 52 weeks earlier`
              : num(kpi.rail_share) !== null
                ? `· rail ${formatPercent(kpi.rail_share as number, 0)}`
                : undefined
          }
          trend={<Sparkline data={sparkOf('total_rides')} className="text-muted-foreground" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Daily ridership, last 12 months"
          description={`${m.label}, 7-day trailing average, against the same days 52 weeks earlier. Shaded: ${periodLabel}.`}
          view={trendView}
          result={trend}
          controls={
            <Segmented
              aria-label="Mode"
              value={mode}
              onChange={(v) => setParams({ mode: v === 'total' ? null : v })}
              options={[
                { value: 'total', label: 'All' },
                { value: 'rail', label: 'Rail' },
                { value: 'bus', label: 'Bus' },
              ]}
            />
          }
        >
          <TimeSeriesChart
            data={trendPivot.data}
            series={[
              { key: m.now, label: `${m.label}`, color: 'var(--series-1)' },
              { key: m.ly, label: '52 weeks earlier', color: 'var(--series-other)', reference: true },
            ]}
            band={{ from: window.start, to: window.end }}
            formatTick={(t) => formatPeriod(t, 'month', true)}
            formatTitle={(t) => formatDay(dayOfIso(t), true)}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            footer={(t) => ds.dayType.get(dayOfIso(t))}
            onSelect={(t) => setRange('custom', { start: isoOfDay(dayOfIso(t) - 6), end: t })}
            ariaLabel={`${m.label} per day over the last 12 months, with the same days a year earlier`}
          />
        </ChartCard>

        <ChartCard
          title="Day types"
          description={`Average rides per day, ${periodLabel}, vs 52 weeks earlier.`}
          contentClassName="flex flex-col gap-4"
          csv={() =>
            csvFromRecords(dayTypeData, [
              { label: 'day_type', value: (d) => d.t },
              { label: 'rail_avg_daily_entries', value: (d) => d.rail },
              { label: 'bus_avg_daily_boardings', value: (d) => d.bus },
              { label: 'rail_avg_daily_entries_ly', value: (d) => d.railLy },
              { label: 'bus_avg_daily_boardings_ly', value: (d) => d.busLy },
            ])
          }
        >
          <PeriodBarChart
            data={dayTypeData.map((d) => ({ t: d.t, rail: d.rail, bus: d.bus }))}
            series={[
              { key: 'rail', label: 'Rail', color: 'var(--series-1)' },
              { key: 'bus', label: 'Bus', color: 'var(--series-2)' },
            ]}
            stacked
            formatTick={(t) => (t === 'Sunday/Holiday' ? 'Sun/Hol' : t)}
            formatTitle={(t) => t}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            height={180}
            ariaLabel="Average rides per day by day type, rail and bus"
          />
          <dl className="grid grid-cols-3 gap-2 text-xs">
            {dayTypeData.map((d) => {
              const now = (d.rail ?? 0) + (d.bus ?? 0)
              const ly = (d.railLy ?? 0) + (d.busLy ?? 0)
              const delta = now && ly ? now / ly - 1 : null
              return (
                <div key={d.t} className="flex flex-col gap-0.5 rounded-lg bg-muted px-2.5 py-2">
                  <dt className="text-muted-foreground">{d.t === 'Sunday/Holiday' ? 'Sun/Holiday' : d.t}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{now ? formatCompact(now) : '—'}</dd>
                  <dd
                    className={cn(
                      'tabular-nums',
                      delta !== null && delta > 0
                        ? 'text-success'
                        : delta !== null && delta < 0
                          ? 'text-warning-soft-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {formatSignedPercent(delta)}
                  </dd>
                </div>
              )
            })}
          </dl>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Busiest stations"
          description={`Average weekday entries, ${periodLabel}.`}
          view={{
            metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'],
            groupBy: ['station__station_name'],
            where: [],
            range: preset,
            custom,
            chart: 'table',
          }}
          result={{ ...stations, rows: busiest }}
          table={
            <ResultTable
              result={{ ...stations, rows: busiest }}
              hide={['station', 'rail_avg_weekday_entries_ly']}
              signed={['rail_avg_weekday_yoy']}
            />
          }
        >
          <RankedBars
            items={busiest.map((r) => ({
              key: String(r.station),
              label: String(r.station__station_name),
              value: r.rail_avg_weekday_entries as number,
              display: formatCompact(r.rail_avg_weekday_entries as number),
              aside: <Delta v={num(r.rail_avg_weekday_yoy)} />,
              href: dashHref(`/rail/station?id=${r.station}`),
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Biggest movers"
          description="Weekday entries vs 52 weeks earlier, stations with 1,000+ a year ago. Closed stations are on Exceptions."
          contentClassName="flex flex-col gap-4"
          csv={() =>
            csvFromRecords(
              [...gainers.map((r) => ({ r, dir: 'up' })), ...decliners.map((r) => ({ r, dir: 'down' }))],
              [
                { label: 'direction', value: (x) => x.dir },
                { label: 'station_id', value: (x) => x.r.station },
                { label: 'station_name', value: (x) => x.r.station__station_name },
                { label: 'rail_avg_weekday_entries', value: (x) => x.r.rail_avg_weekday_entries },
                { label: 'rail_avg_weekday_entries_ly', value: (x) => x.r.rail_avg_weekday_entries_ly },
                { label: 'rail_avg_weekday_yoy', value: (x) => x.r.rail_avg_weekday_yoy },
              ],
            )
          }
        >
          <MoverList title="Up" rows={gainers} />
          <MoverList title="Down" rows={decliners} />
        </ChartCard>

        <ChartCard
          title="Lines"
          description="Average weekday entries, split across the all-day lines at transfer stations."
          csv={() => resultCsvData(lines)}
          controls={
            <Button variant="ghost" size="sm" onClick={() => dashNavigate('/lines')}>
              All lines
              <ArrowRight />
            </Button>
          }
        >
          <ul className="flex flex-col">
            {ds.lines.map((line) => {
              const r = lines.rows.find((x) => x.line__line_name === line.name)
              return (
                <li key={line.id}>
                  <a
                    href={dashHref(`/lines/line?id=${line.id}`)}
                    className="grid grid-cols-[1fr_auto_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-2">
                      <LineSwatch line={line} />
                      {line.name}
                    </span>
                    <span className="font-medium tabular-nums">{formatCompact(num(r?.line_avg_weekday_allocated))}</span>
                    <span className="text-right text-xs tabular-nums">
                      <Delta v={num(r?.line_avg_weekday_yoy)} />
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Recovery vs 2019"
          description={`Average weekday ridership as a share of the same month in 2019.${lastRecovery ? ` ${formatPeriod(lastRecovery.t, 'month')}: rail ${lastRecovery.rail ? formatPercent(lastRecovery.rail, 0) : '—'}, bus ${lastRecovery.bus ? formatPercent(lastRecovery.bus, 0) : '—'}.` : ''}`}
          result={recoveryResult}
        >
          <TimeSeriesChart
            data={recoveryData}
            series={[
              { key: 'rail', label: 'Rail', color: 'var(--series-1)' },
              { key: 'bus', label: 'Bus', color: 'var(--series-2)' },
            ]}
            formatTick={(t) => formatPeriod(t, 'year')}
            ticks={recoveryData.filter((d) => d.t.slice(5, 7) === '01').map((d) => d.t)}
            formatTitle={(t) => formatPeriod(t, 'month')}
            formatValue={(v) => formatPercent(v, 0)}
            height={240}
            ariaLabel="Average weekday rail and bus ridership as a share of the same month in 2019"
          />
        </ChartCard>

        <ChartCard
          title="Exceptions, last 7 days"
          description="Stations and routes 40%+ off their usual weekday pattern."
          csv={() => episodesCsv(recent)}
          controls={
            <Button variant="ghost" size="sm" onClick={() => dashNavigate('/exceptions')}>
              Review
              <ArrowRight />
            </Button>
          }
        >
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing unusual in the last 7 days.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {recent.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <a
                    className="min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    href={dashHref(
                      e.mode === 'rail' ? `/rail/station?id=${e.entityId}` : `/bus/route?id=${encodeURIComponent(e.entityId)}`,
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{e.entityName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {e.mode === 'rail' ? 'Rail' : 'Bus'} ·{' '}
                      {e.days === 1
                        ? formatDay(e.start, true)
                        : `${e.ongoing ? 'since' : 'from'} ${formatDay(e.start)} (${e.days.toLocaleString()} days)`}
                    </span>
                  </a>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.worstRatio !== null ? formatSignedPercent(e.worstRatio) : 'no data'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {recent.length > 6 && <p className="pt-2 text-xs text-muted-foreground">{recent.length - 6} more on the Exceptions page.</p>}
        </ChartCard>
      </div>
    </div>
  )
}

function MoverList({ title, rows }: { title: string; rows: Record<string, string | number | null>[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={String(r.station)}>
            <a
              href={dashHref(`/rail/station?id=${r.station}`)}
              className="grid grid-cols-[1fr_auto_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{String(r.station__station_name)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatCompact(r.rail_avg_weekday_entries as number)}</span>
              <span className="text-right text-xs tabular-nums">
                <Delta v={r.rail_avg_weekday_yoy as number} />
              </span>
            </a>
          </li>
        ))}
        {!rows.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">No stations with enough history.</li>}
      </ul>
    </div>
  )
}
