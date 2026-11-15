import type { CatColumn, NumColumn, Table } from '@/features/semantic/core/table.ts'
import type { Dataset } from '@/features/semantic/data'

/**
 * Exception detection: days a station or bus route ran far off its normal
 * pattern, merged into episodes so a four-year closure is one row, not 1,500.
 *
 * Expected value for a day = the median of the same weekday over the previous
 * eight weeks, skipping holidays. A holiday (the CTA runs a Sunday schedule) is
 * compared with the median of the previous eight Sundays instead. A day is
 * flagged when the expected value is large enough to matter and the actual
 * value is off by at least the threshold:
 *
 *   zero      reported 0 where riders were expected (closure, outage, counting fault)
 *   missing   no row at all where riders were expected
 *   drop      at least `threshold` below expected
 *   surge     at least `threshold` above expected (events, diversions, shuttles)
 *
 * This reads the fact tables directly rather than through the semantic layer:
 * it needs a per-day baseline per entity, which no single metric expresses.
 */

export type ExceptionKind = 'zero' | 'missing' | 'drop' | 'surge'
export type Mode = 'rail' | 'bus'

export interface ExceptionDay {
  day: number
  actual: number | null
  expected: number
  ratio: number | null
  kind: ExceptionKind
}

export interface Episode {
  id: string
  mode: Mode
  entityId: string
  entityName: string
  kind: ExceptionKind
  start: number
  end: number
  days: number
  actual: number
  expected: number
  /** Riders above (+) or below (−) expected over the episode. */
  impact: number
  /** The largest relative deviation on any day of the episode. */
  worstRatio: number | null
  /** The episode is still going on the last day with data. */
  ongoing: boolean
  daysDetail: ExceptionDay[]
}

export interface DetectOptions {
  start: number
  end: number
  /** Relative deviation that flags a day, e.g. 0.35 for ±35%. */
  threshold: number
  /** Minimum expected riders for a day to count (ignores tiny stations at night-owl volumes). */
  minExpected: number
  modes: Mode[]
  /** Only these stations or routes (default: all). */
  entityIds?: string[]
}

const LOOKBACK_WEEKS = 8

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Dense day x entity matrix over [from, to] from a fact table sorted by entity. */
function matrix(table: Table, idCol: string, from: number, to: number) {
  const ids = table.columns[idCol] as CatColumn
  const days = (table.columns.ride_date as { data: Int32Array }).data
  const rides = (table.columns.rides as NumColumn).data
  const width = to - from + 1
  const series = new Map<string, Float64Array>()
  for (let r = 0; r < table.rowCount; r++) {
    const d = days[r]
    if (d < from || d > to) continue
    const id = ids.dict[ids.codes[r]]
    let s = series.get(id)
    if (!s) {
      s = new Float64Array(width).fill(Number.NaN)
      series.set(id, s)
    }
    s[d - from] = rides[r]
  }
  return series
}

export function detectExceptions(ds: Dataset, opts: DetectOptions): Episode[] {
  const from = opts.start - LOOKBACK_WEEKS * 7
  const to = opts.end
  const episodes: Episode[] = []

  const run = (mode: Mode, table: Table, idCol: string, nameOf: (id: string) => string, activeOn: (id: string, day: number) => boolean) => {
    const only = opts.entityIds ? new Set(opts.entityIds) : null
    for (const [id, s] of matrix(table, idCol, from, to)) {
      if (only && !only.has(id)) continue
      const flagged: ExceptionDay[] = []
      for (let d = opts.start; d <= opts.end; d++) {
        if (!activeOn(id, d)) continue
        const holiday = ds.holidays.has(d)
        const isoDow = ((((d + 3) % 7) + 7) % 7) + 1
        const refs: number[] = []
        if (holiday) {
          // Holidays run a Sunday schedule: compare with recent Sundays.
          const lastSunday = d - (isoDow % 7)
          for (let k = 0, x = lastSunday; refs.length < LOOKBACK_WEEKS && x >= from; x -= 7, k++) {
            const v = s[x - from]
            if (x !== d && !Number.isNaN(v)) refs.push(v)
            if (k > 12) break
          }
        } else {
          for (let k = 1; k <= LOOKBACK_WEEKS; k++) {
            const x = d - 7 * k
            if (x < from || ds.holidays.has(x)) continue
            const v = s[x - from]
            if (!Number.isNaN(v)) refs.push(v)
          }
        }
        if (refs.length < 4) continue
        const expected = median(refs)
        if (expected < opts.minExpected) continue
        const v = s[d - from]
        let kind: ExceptionKind | null = null
        let ratio: number | null = null
        if (Number.isNaN(v)) kind = 'missing'
        else if (v === 0) {
          kind = 'zero'
          ratio = -1
        } else {
          ratio = v / expected - 1
          if (ratio <= -opts.threshold) kind = 'drop'
          else if (ratio >= opts.threshold) kind = 'surge'
        }
        if (kind) flagged.push({ day: d, actual: Number.isNaN(v) ? null : v, expected, ratio, kind })
      }
      // Merge consecutive days of the same kind (a one-day gap is allowed, so a weekend inside a closure does not split it).
      let cur: ExceptionDay[] = []
      const flush = () => {
        if (!cur.length) return
        const actual = cur.reduce((a, x) => a + (x.actual ?? 0), 0)
        const expected = cur.reduce((a, x) => a + x.expected, 0)
        const ratios = cur.map((x) => x.ratio).filter((r): r is number => r !== null)
        const kind = cur[0].kind
        episodes.push({
          id: `${mode}:${id}:${cur[0].day}:${kind}`,
          mode,
          entityId: id,
          entityName: nameOf(id),
          kind,
          start: cur[0].day,
          end: cur[cur.length - 1].day,
          days: cur.length,
          actual,
          expected,
          impact: actual - expected,
          worstRatio: ratios.length ? ratios.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null,
          ongoing: cur[cur.length - 1].day >= opts.end - 1,
          daysDetail: cur,
        })
        cur = []
      }
      const sameFamily = (a: ExceptionKind, b: ExceptionKind) => a === b || (a !== 'surge' && b !== 'surge')
      for (const f of flagged) {
        const last = cur[cur.length - 1]
        if (last && sameFamily(last.kind, f.kind) && f.day - last.day <= 2) cur.push(f)
        else {
          flush()
          cur.push(f)
        }
      }
      flush()
    }
  }

  if (opts.modes.includes('rail'))
    run(
      'rail',
      ds.tables.fct_rail_station_entries,
      'station_id',
      (id) => ds.stationById.get(id)?.name ?? `Station ${id}`,
      (id, day) => {
        const st = ds.stationById.get(id)
        return !st || st.lastDay === null || day <= st.lastDay
      },
    )
  if (opts.modes.includes('bus'))
    run(
      'bus',
      ds.tables.fct_bus_route_rides,
      'route_id',
      (id) => {
        const r = ds.routeById.get(id)
        return r ? `${r.id} ${r.name}` : `Route ${id}`
      },
      (id, day) => {
        const r = ds.routeById.get(id)
        return !r || r.lastDay === null || day <= r.lastDay
      },
    )

  // A merged episode keeps the kind of its worst day for display.
  for (const e of episodes) {
    const kinds = new Set(e.daysDetail.map((d) => d.kind))
    if (kinds.has('zero')) e.kind = 'zero'
    else if (kinds.has('missing') && !kinds.has('drop')) e.kind = 'missing'
  }
  return episodes.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
}

export const KIND_LABEL: Record<ExceptionKind, string> = {
  zero: 'Zero count',
  missing: 'No data',
  drop: 'Drop',
  surge: 'Surge',
}

/** Badge variant per kind: warnings for shortfalls, info for surges (not "bad", but worth a look). */
export const KIND_VARIANT: Record<ExceptionKind, 'destructive' | 'warning' | 'info' | 'secondary'> = {
  zero: 'destructive',
  missing: 'secondary',
  drop: 'warning',
  surge: 'info',
}
