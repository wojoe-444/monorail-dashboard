import { useDataset } from '@/features/semantic/data'
import { formatCompact, ratioOf } from '@/features/semantic/format'
import { resolveRange } from '@/features/semantic/ranges'
import { useQueryOrThrow } from '@/features/semantic/useQuery'
import { Delta } from '@/features/transit/Delta'

/** Hub card figure: average weekday rides over the last 28 days, vs 52 weeks earlier. */
export function Summary() {
  const { minDay, maxDay } = useDataset()
  const r =
    useQueryOrThrow({
      metrics: ['total_avg_weekday_rides', 'rail_avg_weekday_entries_ly', 'bus_avg_weekday_boardings_ly'],
      timeRange: resolveRange('28d', minDay, maxDay),
    }).rows[0] ?? {}
  const now = typeof r.total_avg_weekday_rides === 'number' ? r.total_avg_weekday_rides : null
  const ly = (Number(r.rail_avg_weekday_entries_ly) || 0) + (Number(r.bus_avg_weekday_boardings_ly) || 0)
  const change = ratioOf(now, ly)
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tracking-tight">{formatCompact(now)}</span>
      <span className="text-xs text-muted-foreground">
        avg weekday rides, last 28 days · <Delta v={change === null ? null : change - 1} />
      </span>
    </div>
  )
}
