import { useId, useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Segmented } from '@/components/ui/segmented'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { useDataset, type Station } from '@/features/semantic/data'
import { formatCompact, formatPercent, formatRange, formatSignedPercent } from '@/features/semantic/format'
import { baseline2019 } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { useRangeParam } from '@/features/semantic/useRangeParam'
import { Delta } from '@/features/transit/Delta'
import { LineChip, LineDots } from '@/features/transit/LineChip'
import { dashHref, dashNavigate } from '@/app/hub'
import { cn } from '@/lib/utils'


interface Point {
  station: Station
  x: number
  y: number
  r: number
  weekday: number | null
  yoy: number | null
  recovery: number | null
}

/** The current query with one parameter changed, so list links keep the range, line and color. */
function withParam(params: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(params)
  next.set(key, value)
  return next.toString()
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const W = 1000
const H = 1100
const PAD = 40

/**
 * Stations at their real coordinates (equirectangular, scaled by cos(latitude)
 * so distances read true at Chicago's latitude). Area encodes weekday entries.
 * No basemap: the app makes no third-party tile requests.
 */
export function MapPage() {
  const ds = useDataset()
  const id = useId()
  const { preset, custom, window, setRange, params, setParams } = useRangeParam('28d')
  const colorBy = (['volume', 'yoy', 'recovery'] as const).find((c) => c === params.get('color')) ?? 'yoy'
  const line = params.get('line') ?? ''
  const focus = params.get('focus')
  const [hover, setHover] = useState<string | null>(null)

  const current = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'], groupBy: ['station'], timeRange: window })
  const base = baseline2019(window)
  const before = useQueryOrThrow({ metrics: ['rail_avg_weekday_entries'], groupBy: ['station'], timeRange: base ?? window })

  const points = useMemo(() => {
    const by = new Map(current.rows.map((r) => [String(r.station), r]))
    const by2019 = new Map(before.rows.map((r) => [String(r.station), num(r.rail_avg_weekday_entries)]))
    const located = ds.stations.filter((s) => s.lat !== null && s.lon !== null)
    const lats = located.map((s) => s.lat!)
    const lons = located.map((s) => s.lon!)
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const k = Math.cos((midLat * Math.PI) / 180)
    const minX = Math.min(...lons) * k
    const maxX = Math.max(...lons) * k
    const minY = Math.min(...lats)
    const maxY = Math.max(...lats)
    const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY))
    const offX = (W - (maxX - minX) * scale) / 2
    const offY = (H - (maxY - minY) * scale) / 2
    const maxWeekday = Math.max(...current.rows.map((r) => num(r.rail_avg_weekday_entries) ?? 0), 1)
    return located
      .map((s): Point => {
        const r = by.get(s.id)
        const weekday = num(r?.rail_avg_weekday_entries)
        const b = by2019.get(s.id) ?? null
        return {
          station: s,
          x: offX + (s.lon! * k - minX) * scale,
          y: H - (offY + (s.lat! - minY) * scale),
          // Area proportional to weekday entries; a fixed 2px dot marks stations with no count.
          r: weekday && weekday > 0 ? Math.max(2, Math.sqrt(weekday / maxWeekday) * 22) : 2,
          weekday,
          yoy: num(r?.rail_avg_weekday_yoy),
          recovery: base && weekday !== null && b ? weekday / b : null,
        }
      })
      .sort((a, b) => b.r - a.r)
  }, [ds.stations, current, before, base])

  const fillOf = (p: Point): { fill: string; opacity: number } => {
    if (colorBy === 'volume') return { fill: 'var(--series-1)', opacity: 0.75 }
    const v = colorBy === 'yoy' ? p.yoy : p.recovery !== null ? p.recovery - 1 : null
    if (v === null) return { fill: 'var(--muted-foreground)', opacity: 0.25 }
    const extent = colorBy === 'yoy' ? 0.3 : 0.5
    const t = Math.min(1, Math.abs(v) / extent)
    if (t < 0.1) return { fill: 'var(--muted-foreground)', opacity: 0.35 }
    return { fill: v > 0 ? 'var(--series-1)' : 'var(--series-2)', opacity: 0.35 + 0.6 * t }
  }

  const selected = points.find((p) => p.station.id === (hover ?? focus)) ?? null
  const pinned = points.find((p) => p.station.id === focus) ?? null
  const inLine = (p: Point) => !line || p.station.lines.includes(line)
  // Label the busiest stations, skipping any that would sit on top of a label already placed.
  const labelled = new Set<string>()
  const placed: Point[] = []
  for (const p of points.filter(inLine)) {
    if (placed.length >= 12) break
    if (placed.some((q) => Math.abs(q.y - p.y) < 22 && Math.abs(q.x - p.x) < 160)) continue
    placed.push(p)
    labelled.add(p.station.id)
  }
  const ranked = points.filter(inLine).filter((p) => p.weekday !== null)

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative min-h-[60vh] flex-1 overflow-hidden bg-muted/40 lg:min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`Map of 'L' stations sized by average weekday entries, colored by ${colorBy === 'volume' ? 'volume' : colorBy === 'yoy' ? 'change vs 52 weeks earlier' : 'share of 2019'}`}>
          {points.map((p) => {
            const { fill, opacity } = fillOf(p)
            const dim = !inLine(p)
            const isSel = selected?.station.id === p.station.id || pinned?.station.id === p.station.id
            return (
              <g key={p.station.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(p.r, 12)}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(p.station.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setParams({ focus: p.station.id })}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={fill}
                  fillOpacity={dim ? 0.08 : opacity}
                  stroke={isSel ? 'var(--foreground)' : 'var(--card)'}
                  strokeWidth={isSel ? 2.5 : 1.5}
                  pointerEvents="none"
                />
              </g>
            )
          })}
          {points
            .filter((p) => labelled.has(p.station.id) || selected?.station.id === p.station.id)
            .map((p) => (
              <text key={`l${p.station.id}`} x={p.x + p.r + 4} y={p.y + 4} className="pointer-events-none fill-foreground text-[13px] font-medium" paintOrder="stroke" stroke="var(--background)" strokeWidth={4}>
                {p.station.name}
              </text>
            ))}
        </svg>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-elevation-1">
          Circle area: average weekday entries, {formatRange(window.start, window.end)}
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-t bg-card p-5 lg:w-96 lg:border-t-0 lg:border-l">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Station map</h1>
          <p className="mt-1 text-sm text-muted-foreground">Where riders enter the 'L', and where ridership is growing or shrinking.</p>
        </div>

        <RangeControl value={preset} custom={custom} onChange={setRange} presets={['7d', '28d', '90d', '1y']} />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Color</span>
          <Segmented
            aria-label="Color stations by"
            value={colorBy}
            onChange={(v) => setParams({ color: v === 'yoy' ? null : v })}
            options={[
              { value: 'yoy', label: 'vs 52 wks' },
              { value: 'recovery', label: 'vs 2019' },
              { value: 'volume', label: 'Volume' },
            ]}
          />
          {colorBy !== 'volume' && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{colorBy === 'yoy' ? '−30%' : '50% of 2019'}</span>
              {[0.95, 0.65, 0.35].map((o) => (
                <span key={`n${o}`} className="size-2.5 rounded-full" style={{ background: 'var(--series-2)', opacity: o }} />
              ))}
              <span className="size-2.5 rounded-full" style={{ background: 'var(--muted-foreground)', opacity: 0.35 }} />
              {[0.35, 0.65, 0.95].map((o) => (
                <span key={`p${o}`} className="size-2.5 rounded-full" style={{ background: 'var(--series-1)', opacity: o }} />
              ))}
              <span>{colorBy === 'yoy' ? '+30%' : '150%'}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-line`} className="text-xs text-muted-foreground">
            Highlight a line
          </Label>
          <NativeSelect id={`${id}-line`} value={line} onChange={(e) => setParams({ line: e.target.value })}>
            <option value="">All lines</option>
            {ds.lines.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {pinned ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{pinned.station.name}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {pinned.station.lines.map((l) => (
                    <LineChip key={l} name={l} />
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setParams({ focus: null })}>
                <X />
              </Button>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Avg weekday</dt>
                <dd className="text-base font-semibold">{formatCompact(pinned.weekday)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">vs 52 wks</dt>
                <dd className="text-base font-semibold">
                  <Delta v={pinned.yoy} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">of 2019</dt>
                <dd className="text-base font-semibold">{pinned.recovery !== null ? formatPercent(pinned.recovery, 0) : '—'}</dd>
              </div>
            </dl>
            <div className="flex items-center gap-2">
              {pinned.station.ada ? <Badge variant="success">ADA accessible</Badge> : <Badge variant="secondary">Not ADA accessible</Badge>}
              <Badge variant="outline">{pinned.station.sector}</Badge>
            </div>
            <Button variant="soft" onClick={() => dashNavigate(`/rail/station?id=${pinned.station.id}`)}>
              Station detail
              <ArrowRight />
            </Button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Select a station on the map or in the list for its figures.</p>
        )}

        <div className="flex min-h-0 flex-col gap-1">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{line ? `${line} Line stations` : 'All stations'} by weekday entries</div>
          <ol className="flex flex-col">
            {ranked.map((p) => (
              <li key={p.station.id}>
                <a
                  href={dashHref(`/map?${withParam(params, 'focus', p.station.id)}`)}
                  onMouseEnter={() => setHover(p.station.id)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto_3.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                    focus === p.station.id && 'bg-accent',
                  )}
                >
                  <span className="truncate">{p.station.name}</span>
                  <LineDots names={p.station.lines} />
                  <span className="text-xs tabular-nums">{formatCompact(p.weekday)}</span>
                  <span className="text-right text-xs">{colorBy === 'recovery' ? (p.recovery !== null ? formatPercent(p.recovery, 0) : '—') : <span className="tabular-nums">{formatSignedPercent(p.yoy)}</span>}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  )
}
