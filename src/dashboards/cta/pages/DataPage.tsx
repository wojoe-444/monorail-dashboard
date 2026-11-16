import { CircleAlert, CircleCheck, ExternalLink, Info } from 'lucide-react'

import { StatTile } from '@/components/charts/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ViewCard } from '@/features/semantic/components/ViewCard'
import { dayOfIso } from '@/features/semantic/core/time.ts'
import { useDataset } from '@/features/semantic/data'
import { formatDay } from '@/features/semantic/format'

const CHECK_HELP: Record<string, string> = {
  duplicate_station_days: 'Fixed in staging: one row per station-day.',
  duplicate_route_days: 'Fixed in staging: one row per route-day.',
  stations_missing_from_stops_list: 'Usually a station closed before the stops list was last published. It has ridership but no line, map position or ADA flag.',
  stops_list_stations_without_ridership: 'A station in the stops list that reported nothing in the window (new, or closed all period).',
  routes_missing_names: 'Shown as "Route <id>". Often rail-replacement shuttles or retired routes.',
  zero_entry_station_days: 'Left as reported. Closures (e.g. the Red-Purple Modernization stations) show here; the Exceptions page separates closures from counting faults.',
  zero_ride_route_days: 'Left as reported.',
}

function lag(iso: string | null, toDay: number): string {
  if (!iso) return '—'
  const days = Math.round((Date.parse(iso) / 86_400_000 - toDay) * 10) / 10
  return `${Math.round(days)} days after the last service day`
}

export function DataPage() {
  const ds = useDataset()
  const { meta, quality } = ds
  const published = meta.sources.find((s) => s.id === '5neh-572f')?.rowsUpdatedAt ?? null
  const facts = (meta.rowCounts.fct_rail_station_entries ?? 0) + (meta.rowCounts.fct_bus_route_rides ?? 0)
  const issues = quality.filter((c) => c.affected > 0)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Reference"
        title="Data & quality"
        description="Where the numbers come from, how fresh they are, and what the pipeline found wrong with the source feeds."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Data through" value={formatDay(ds.maxDay)} hint={formatDay(ds.maxDay, true).split(',')[0]} />
        <StatTile label="CTA published" value={published ? formatDay(dayOfIso(published.slice(0, 10))) : '—'} hint={lag(published, ds.maxDay)} />
        <StatTile label="Snapshot built" value={meta.builtAt ? formatDay(dayOfIso(meta.builtAt.slice(0, 10))) : '—'} hint="npm run data:build" />
        <StatTile label="Fact rows" value={facts.toLocaleString()} hint={`since ${formatDay(ds.minDay)}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="gap-3 xl:col-span-2">
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>Chicago Transit Authority open data on the City of Chicago data portal. Use is subject to the portal's terms of use.</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Dataset</TableHead>
                  <TableHead className="text-right text-xs">Rows fetched</TableHead>
                  <TableHead className="text-xs">Updated by CTA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meta.sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="py-2">
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                        {s.name}
                        <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                      </a>
                      <div className="font-mono text-xs text-muted-foreground">
                        {s.id} · {s.attribution}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">{s.rowCount.toLocaleString()}</TableCell>
                    <TableCell className="py-2 text-sm tabular-nums">{s.rowsUpdatedAt ? formatDay(dayOfIso(s.rowsUpdatedAt.slice(0, 10))) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>From the portal to this page. Every step is in the repo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 text-sm">
              {[
                ['npm run data:fetch', 'Download the four source tables from the Socrata API.'],
                ['dbt build', 'Stage, deduplicate and model the data in DuckDB; run 39 tests.'],
                ['MetricFlow', '34 metrics, 7 semantic models and 8 saved queries, validated by dbt parse.'],
                ['npm run data:pack', 'Pack the marts into a columnar snapshot and compile the manifest.'],
                ['npm run semantic:parity', 'Run 12 queries through this app and through mf query; values must match.'],
              ].map(([cmd, text], i) => (
                <li key={cmd} className="grid grid-cols-[1.5rem_1fr] gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">{i + 1}</span>
                  <span>
                    <code className="font-mono text-xs font-medium">{cmd}</code>
                    <span className="block text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Source checks</CardTitle>
          <CardDescription>
            {issues.length ? `${issues.length} of ${quality.length} checks found rows to look at.` : 'Every check passed.'} Computed in dbt (dq_source_checks) on each build.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Check</TableHead>
                <TableHead className="text-xs">Mode</TableHead>
                <TableHead className="text-right text-xs">Rows</TableHead>
                <TableHead className="text-xs">What it means</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quality.map((c) => (
                <TableRow key={c.check}>
                  <TableCell className="py-2">
                    <span className="flex items-center gap-2 text-sm">
                      {c.affected === 0 ? <CircleCheck className="size-4 shrink-0 text-success" aria-label="Passed" /> : <CircleAlert className="size-4 shrink-0 text-warning-soft-foreground" aria-label="Has findings" />}
                      {c.description}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline">{c.mode === 'rail' ? 'Rail' : 'Bus'}</Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm tabular-nums">{c.affected.toLocaleString()}</TableCell>
                  <TableCell className="max-w-md py-2 text-xs whitespace-normal text-muted-foreground">{CHECK_HELP[c.check] ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ViewCard
          title="Stations reporting per week"
          description="Distinct stations with a count each week. Dips are closures or feed gaps."
          view={{ metrics: ['rail_stations_reporting'], groupBy: ['metric_time__week'], where: [], range: 'all', chart: 'line' }}
          height={220}
        />
        <ViewCard
          title="Bus routes reporting per week"
          description="Distinct routes with a count each week. Shuttles appear during rail closures."
          view={{ metrics: ['bus_routes_reporting'], groupBy: ['metric_time__week'], where: [], range: 'all', chart: 'line' }}
          height={220}
        />
      </div>

      <div className="flex gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <p>
            <strong>Counting.</strong> Rail figures are turnstile entries: a rider who transfers between 'L' lines inside a station is counted once. Bus figures are boardings: a
            bus-to-bus transfer counts twice. "Total rides" adds the two, as the CTA does.
          </p>
          <p>
            <strong>Comparisons.</strong> "vs 52 wks" compares with the same days 364 days earlier, so Mondays meet Mondays. "of 2019" compares with the same weeks of 2019,
            the last full pre-pandemic year.
          </p>
        </div>
      </div>
    </div>
  )
}
