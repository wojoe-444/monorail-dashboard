import { useState } from 'react'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

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
import { baseline2019, priorYear, resolveRange } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { exploreHref, type ViewSpec } from '@/features/semantic/views'
import { detectExceptions, KIND_LABEL, KIND_VARIANT } from '@/features/transit/exceptions'
import { dashNavigate } from '@/app/hub'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function RouteDetailPage() {
  const ds = useDataset()
  const { params } = useRangeParam('90d')
  const id = params.get('id') ?? ''
  if (!ds.routeById.has(id)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Route not found" description={id ? `No bus route "${id}" in the data.` : 'No route selected.'} />
        <Button variant="outline" className="w-fit" onClick={() => dashNavigate('/bus')}>
          <ArrowLeft />
          All routes
        </Button>
      </div>
    )
  }
  return <RouteDetail key={id} routeId={id} />
}

function RouteDetail({ routeId }: { routeId: string }) {
  const ds = useDataset()
  const route = ds.routeById.get(routeId)!
  const { preset, custom, window, setRange } = useRangeParam('90d')
  const [calendar, setCalendar] = useState<'volume' | 'yoy'>('volume')
  const [smooth, setSmooth] = useState<'raw' | '7d'>('raw')
  const where = [`{{ Entity('route') }} = '${route.id}'`]

  const kpi = useQueryOrThrow({
    metrics: ['bus_avg_weekday_boardings', 'bus_avg_weekday_yoy', 'bus_avg_saturday_boardings', 'bus_avg_sunday_boardings'],
    where,
    timeRange: window,
  }).rows[0] ?? {}
  const base = baseline2019(window)
  const kpi2019 = useQueryOrThrow({ metrics: ['bus_avg_weekday_boardings'], where, timeRange: base ?? window }).rows[0] ?? {}
  const recovery = base ? ratioOf(num(kpi.bus_avg_weekday_boardings), num(kpi2019.bus_avg_weekday_boardings)) : null
  const ranking = useQueryOrThrow({ metrics: ['bus_avg_weekday_boardings'], groupBy: ['route'], timeRange: window }).rows.filter((r) => num(r.bus_avg_weekday_boardings) !== null)
  const rank = ranking.findIndex((r) => r.route === route.id) + 1

  const dailyView: ViewSpec = { metrics: ['bus_boardings', 'bus_boardings_ly'], groupBy: ['metric_time__day'], where, range: preset, custom, chart: 'line', smooth: smooth === '7d' ? 7 : undefined }
  const daily = useQueryOrThrow({ metrics: dailyView.metrics, groupBy: dailyView.groupBy, where, timeRange: window })
  const dailyPivot = pivotResult(daily, { smooth: smooth === '7d' ? 7 : undefined })

  const monthlyView: ViewSpec = { metrics: ['bus_avg_weekday_boardings', 'bus_avg_saturday_boardings', 'bus_avg_sunday_boardings'], groupBy: ['metric_time__month'], where, range: 'all', chart: 'line' }
  const monthly = useQueryOrThrow({ metrics: monthlyView.metrics, groupBy: monthlyView.groupBy, where })
  const monthlyPivot = pivotResult(monthly)

  const notHoliday = "{{ Dimension('service_day__is_holiday') }} = false"
  const dow = useQueryOrThrow({ metrics: ['bus_avg_daily_boardings'], groupBy: ['service_day__day_of_week'], where: [...where, notHoliday], timeRange: window })
  const dowLy = useQueryOrThrow({ metrics: ['bus_avg_daily_boardings'], groupBy: ['service_day__day_of_week'], where: [...where, notHoliday], timeRange: priorYear(window) })
  const dowData = DOW.map((d) => ({
    t: d.slice(0, 3),
    now: num(dow.rows.find((r) => r.service_day__day_of_week === d)?.bus_avg_daily_boardings),
    ly: num(dowLy.rows.find((r) => r.service_day__day_of_week === d)?.bus_avg_daily_boardings),
  }))

  const year = resolveRange('1y', ds.minDay, ds.maxDay)
  const calendarResult = useQueryOrThrow({ metrics: ['bus_boardings', 'bus_boardings_yoy'], groupBy: ['metric_time__day'], where, timeRange: year })
  const calBy = new Map(calendarResult.rows.map((r) => [dayOfIso(String(r.metric_time__day)), r]))
  const cells = []
  for (let d = dayOfIso(year.start); d <= ds.maxDay; d++) cells.push({ day: d, value: num(calBy.get(d)?.[calendar === 'volume' ? 'bus_boardings' : 'bus_boardings_yoy']) })

  const exceptions = detectExceptions(ds, { start: Math.min(dayOfIso(window.start), dayOfIso(year.start)), end: dayOfIso(window.end), threshold: 0.35, minExpected: 150, modes: ['bus'], entityIds: [route.id] })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Route ${route.id}`}
        title={route.name}
        description={`${route.type} bus route${route.lastDay !== null && route.lastDay < ds.maxDay - 7 ? ` · no data since ${formatDay(route.lastDay)}` : ''}`}
        actions={
          <Button variant="outline" onClick={() => dashNavigate(exploreHref({ metrics: ['bus_avg_weekday_boardings'], groupBy: ['metric_time__week'], where, range: '1y', chart: 'line' }, `Route ${route.id}`))}>
            <SlidersHorizontal />
            Explore
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={route.type === 'Shuttle' ? 'warning' : route.type === 'Express' ? 'primary' : 'secondary'}>{route.type}</Badge>
        <span className="flex-1" />
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['28d', '90d', '6m', '1y', 'ytd', 'all']} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile hero label="Avg weekday boardings" value={formatCompact(num(kpi.bus_avg_weekday_boardings))} delta={num(kpi.bus_avg_weekday_yoy) ?? undefined} deltaLabel="vs 52 wks" hint={rank ? `· #${rank} of ${ranking.length}` : undefined} />
        <StatTile label="Avg Saturday" value={formatCompact(num(kpi.bus_avg_saturday_boardings))} />
        <StatTile label="Avg Sunday / holiday" value={formatCompact(num(kpi.bus_avg_sunday_boardings))} />
        <StatTile label="Weekday vs 2019" value={recovery !== null ? formatPercent(recovery, 0) : '—'} hint={base ? 'same weeks of 2019' : undefined} />
      </div>

      <ChartCard
        title="Daily boardings"
        description={`${formatRange(window.start, window.end)}, against the same days 52 weeks earlier.`}
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
            { key: 'bus_boardings', label: 'Boardings', color: 'var(--series-2)' },
            { key: 'bus_boardings_ly', label: '52 weeks earlier', color: 'var(--series-other)', reference: true },
          ]}
          formatTick={(t) => formatPeriod(t, 'day', true)}
          formatTitle={(t) => formatDay(dayOfIso(t), true)}
          formatValue={(v) => formatValue(v)}
          formatAxis={(v) => formatCompact(v)}
          footer={(t) => ds.dayType.get(dayOfIso(t))}
          area
          ariaLabel={`Daily boardings on route ${route.id}`}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Since 2019" description="Average boardings by day type, by month." view={monthlyView} result={monthly}>
          <TimeSeriesChart
            data={monthlyPivot.data}
            series={[
              { key: 'bus_avg_weekday_boardings', label: 'Weekday', color: 'var(--series-1)' },
              { key: 'bus_avg_saturday_boardings', label: 'Saturday', color: 'var(--series-2)' },
              { key: 'bus_avg_sunday_boardings', label: 'Sunday/holiday', color: 'var(--series-3)' },
            ]}
            formatTick={(t) => formatPeriod(t, 'year')}
            ticks={monthlyPivot.data.filter((d) => String(d.t).slice(5, 7) === '01').map((d) => String(d.t))}
            formatTitle={(t) => formatPeriod(t, 'month')}
            formatValue={(v) => formatValue(v)}
            formatAxis={(v) => formatCompact(v)}
            height={240}
            ariaLabel={`Average boardings by day type per month on route ${route.id}`}
          />
        </ChartCard>
        <ChartCard title="Day of week" description="Average boardings per day (holidays excluded), vs 52 weeks earlier." result={dow}>
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
            ariaLabel={`Average boardings by day of week on route ${route.id}`}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Last 12 months, day by day"
        description={calendar === 'volume' ? 'Boardings per day.' : 'Change vs the same day 52 weeks earlier.'}
        result={calendarResult}
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
      >
        <CalendarHeatmap
          cells={cells}
          scale={calendar === 'volume' ? 'sequential' : 'diverging'}
          formatValue={(v) => (calendar === 'volume' ? formatValue(v) : formatSignedPercent(v))}
          formatDay={(d) => formatDay(d, true)}
          describe={(d) => ds.dayType.get(d)}
          onSelect={(d) => setRange('custom', { start: isoOfDay(d - 13), end: isoOfDay(Math.min(ds.maxDay, d + 14)) })}
          ariaLabel={`Calendar of daily boardings on route ${route.id}`}
        />
      </ChartCard>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Exceptions, last 12 months</CardTitle>
          <CardDescription>Days 35%+ off the usual pattern for that weekday.</CardDescription>
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
    </div>
  )
}
