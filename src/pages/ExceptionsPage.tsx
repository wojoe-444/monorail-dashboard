import { useId, useMemo } from 'react'
import { Download, Search } from 'lucide-react'

import { PeriodBarChart } from '@/components/charts/PeriodBarChart'
import { SortTable, type SortColumn } from '@/components/charts/SortTable'
import { StatTile } from '@/components/charts/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Segmented } from '@/components/ui/segmented'
import { ChartCard } from '@/features/semantic/components/ChartCard'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { dayOfIso, isoOfDay } from '@/features/semantic/core/time.ts'
import type { QueryResult } from '@/features/semantic/core/types.ts'
import { downloadCsv } from '@/features/semantic/csv'
import { useDataset } from '@/features/semantic/data'
import { formatCompact, formatDay, formatPeriod, formatSignedPercent, formatValue } from '@/features/semantic/format'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { detectExceptions, KIND_LABEL, KIND_VARIANT, type Episode, type ExceptionKind, type Mode } from '@/features/transit/exceptions'
import { href } from '@/lib/router'

const THRESHOLDS = ['0.25', '0.35', '0.5'] as const
const MIN_EXPECTED = ['200', '500', '1000', '2500'] as const

export function ExceptionsPage() {
  const ds = useDataset()
  const id = useId()
  const { preset, custom, window, setRange, params, setParams } = useRangeParam('28d')
  const mode = (params.get('mode') ?? 'all') as 'all' | Mode
  const kind = (params.get('kind') ?? 'all') as 'all' | ExceptionKind
  const threshold = THRESHOLDS.find((t) => t === params.get('t')) ?? '0.35'
  const minExpected = MIN_EXPECTED.find((t) => t === params.get('min')) ?? '500'
  const q = params.get('q') ?? ''

  const start = dayOfIso(window.start)
  const end = dayOfIso(window.end)
  const all = useMemo(
    () => detectExceptions(ds, { start, end, threshold: Number(threshold), minExpected: Number(minExpected), modes: mode === 'all' ? ['rail', 'bus'] : [mode] }),
    [ds, start, end, threshold, minExpected, mode],
  )
  const needle = q.trim().toLowerCase()
  const episodes = all.filter((e) => (kind === 'all' || e.kind === kind) && (!needle || e.entityName.toLowerCase().includes(needle) || e.entityId.toLowerCase() === needle))

  const nearHoliday = (e: Episode) => e.daysDetail.some((d) => [-2, -1, 0, 1, 2].some((k) => ds.holidays.has(d.day + k)))

  // Flagged entity-days per day, by kind.
  const timeline = useMemo(() => {
    const byDay = new Map<number, Record<ExceptionKind, number>>()
    for (let d = start; d <= end; d++) byDay.set(d, { zero: 0, missing: 0, drop: 0, surge: 0 })
    for (const e of episodes) for (const d of e.daysDetail) byDay.get(d.day)![d.kind]++
    return [...byDay.entries()].map(([d, v]) => ({ t: isoOfDay(d), ...v }))
  }, [episodes, start, end])

  const shortfall = episodes.reduce((a, e) => a + Math.min(0, e.impact), 0)
  const surplus = episodes.reduce((a, e) => a + Math.max(0, e.impact), 0)
  const ongoing = episodes.filter((e) => e.ongoing).length
  const entityDays = episodes.reduce((a, e) => a + e.days, 0)

  const columns: SortColumn<Episode>[] = [
    { key: 'kind', label: 'Type', sort: (e) => e.kind, render: (e) => <Badge variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Badge> },
    {
      key: 'entity',
      label: 'Station or route',
      sort: (e) => e.entityName,
      render: (e) => (
        <a
          href={href(e.mode === 'rail' ? `/rail/station?id=${e.entityId}&range=custom&from=${isoOfDay(e.start - 21)}&to=${isoOfDay(Math.min(ds.maxDay, e.end + 21))}` : `/bus/route?id=${encodeURIComponent(e.entityId)}&range=custom&from=${isoOfDay(e.start - 21)}&to=${isoOfDay(Math.min(ds.maxDay, e.end + 21))}`)}
          className="flex min-w-0 flex-col rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate font-medium">{e.entityName}</span>
          <span className="text-xs text-muted-foreground">{e.mode === 'rail' ? 'Rail station' : 'Bus route'}</span>
        </a>
      ),
    },
    {
      key: 'when',
      label: 'When',
      sort: (e) => e.start,
      render: (e) => (
        <span className="flex flex-col">
          <span className="tabular-nums">{e.days === 1 ? formatDay(e.start, true) : `${formatDay(e.start)} – ${formatDay(e.end)}`}</span>
          <span className="flex flex-wrap gap-1 text-xs text-muted-foreground">
            {e.days > 1 && <span>{e.days} days</span>}
            {e.ongoing && <Badge variant="warning">Ongoing</Badge>}
            {nearHoliday(e) && <Badge variant="outline">Near a holiday</Badge>}
          </span>
        </span>
      ),
    },
    { key: 'actual', label: 'Actual', align: 'right', sort: (e) => e.actual, render: (e) => formatValue(e.actual) },
    { key: 'expected', label: 'Expected', title: 'Median of the same weekday over the previous 8 weeks (Sundays for holidays)', align: 'right', sort: (e) => e.expected, render: (e) => formatValue(Math.round(e.expected)) },
    { key: 'worst', label: 'Worst day', align: 'right', sort: (e) => (e.worstRatio === null ? null : Math.abs(e.worstRatio)), render: (e) => (e.worstRatio === null ? 'no data' : formatSignedPercent(e.worstRatio)) },
    {
      key: 'impact',
      label: 'Riders vs expected',
      align: 'right',
      sort: (e) => Math.abs(e.impact),
      render: (e) => <span className={e.impact < 0 ? 'text-warning-soft-foreground' : 'text-info-soft-foreground'}>{`${e.impact > 0 ? '+' : '−'}${formatValue(Math.abs(Math.round(e.impact)))}`}</span>,
    },
  ]

  const exportRows = () => {
    const result: QueryResult = {
      columns: ['type', 'mode', 'id', 'name', 'start', 'end', 'days', 'actual', 'expected', 'worst_ratio', 'impact', 'ongoing'].map((k) => ({ key: k, label: k, kind: 'metric' as const })),
      rows: episodes.map((e) => ({
        type: e.kind,
        mode: e.mode,
        id: e.entityId,
        name: e.entityName,
        start: isoOfDay(e.start),
        end: isoOfDay(e.end),
        days: e.days,
        actual: e.actual,
        expected: Math.round(e.expected),
        worst_ratio: e.worstRatio,
        impact: Math.round(e.impact),
        ongoing: String(e.ongoing),
      })),
      plan: [],
      ms: 0,
    }
    downloadCsv(result, `exceptions ${window.start} to ${window.end}`)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operations"
        title="Exceptions"
        description="Stations and routes that ran far off their usual pattern for that weekday: closures, counting outages, events and diversions. Consecutive days merge into one episode."
        actions={
          <Button variant="outline" onClick={exportRows}>
            <Download />
            CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '6m', '1y']} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Mode</span>
          <Segmented
            aria-label="Mode"
            value={mode}
            onChange={(v) => setParams({ mode: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'rail', label: 'Rail' },
              { value: 'bus', label: 'Bus' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Sensitivity</span>
          <Segmented
            aria-label="Deviation that flags a day"
            value={threshold}
            onChange={(v) => setParams({ t: v === '0.35' ? null : v })}
            options={THRESHOLDS.map((t) => ({ value: t, label: `±${Math.round(Number(t) * 100)}%` }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-min`} className="text-xs text-muted-foreground">
            Min. expected riders
          </Label>
          <NativeSelect id={`${id}-min`} value={minExpected} onChange={(e) => setParams({ min: e.target.value === '500' ? null : e.target.value })} className="w-32">
            {MIN_EXPECTED.map((m) => (
              <option key={m} value={m}>
                {Number(m).toLocaleString()}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-kind`} className="text-xs text-muted-foreground">
            Type
          </Label>
          <NativeSelect id={`${id}-kind`} value={kind} onChange={(e) => setParams({ kind: e.target.value === 'all' ? null : e.target.value })} className="w-36">
            <option value="all">All types</option>
            {(Object.keys(KIND_LABEL) as ExceptionKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-44 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-q`} className="text-xs text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${id}-q`} value={q} onChange={(e) => setParams({ q: e.target.value })} placeholder="Station or route" className="pl-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Episodes" value={String(episodes.length)} hint={`${entityDays.toLocaleString()} station/route-days`} />
        <StatTile label="Ongoing" value={String(ongoing)} hint="still off pattern on the last day" />
        <StatTile label="Riders below expected" value={formatCompact(Math.abs(shortfall))} hint="drops, zeros and missing days" />
        <StatTile label="Riders above expected" value={formatCompact(surplus)} hint="surges" />
      </div>

      <ChartCard title="Flagged per day" description="Stations and routes off pattern each day, by type." result={null}>
        <PeriodBarChart
          data={timeline}
          series={[
            { key: 'drop', label: 'Drop', color: 'var(--warning)' },
            { key: 'zero', label: 'Zero count', color: 'var(--destructive)' },
            { key: 'missing', label: 'No data', color: 'var(--series-other)' },
            { key: 'surge', label: 'Surge', color: 'var(--info)' },
          ]}
          stacked
          formatTick={(t) => formatPeriod(t, 'day', true)}
          formatTitle={(t) => formatDay(dayOfIso(t), true)}
          formatValue={(v) => String(v)}
          height={200}
          ariaLabel="Stations and routes flagged per day, by type"
        />
      </ChartCard>

      <Card className="py-2">
        <CardContent className="px-2">
          <SortTable
            rows={episodes}
            columns={columns}
            rowKey={(e) => e.id}
            initialSort={{ key: 'impact', desc: true }}
            caption="Exception episodes"
            empty="No exceptions at this sensitivity. Try a wider range or a lower threshold."
          />
        </CardContent>
      </Card>
    </div>
  )
}
