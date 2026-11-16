import type { CatColumn, NumColumn, Table } from '@/features/semantic/core/table.ts'
import { isoOfDay } from '@/features/semantic/core/time.ts'
import type { Dataset } from '@/features/semantic/data'
import { csvFromRecords, type CsvData } from '@/lib/download'

/**
 * Exception detection: days a station or bus route ran far off its normal
 * pattern, merged into episodes so a four-year closure is one row, not 1,500.
 *
 * Expected value for a day = the median of the same weekday over the most
 * recent eight *normal* weeks (skipping holidays and days that were themselves
 * flagged, looking back up to a year). A holiday (the CTA runs a Sunday
 * schedule) is compared with recent normal Sundays instead. When a disruption
 * outlasts the year of history, the last normal expectation carries forward,
 * so a long closure (zeros or no data) stays flagged until riders come back. A
 * partial drop or a surge that lasts more than NEW_NORMAL_AFTER_DAYS becomes
 * the new baseline instead (the 2020 collapse, the recovery after it).
 *
 *   zero      reported 0 where riders were expected (closure, outage, counting fault)
 *   missing   no row at all where riders were expected
 *   drop      at least `threshold` below expected
 *   surge     at least `threshold` above expected (events, diversions, shuttles)
 *
 * A station or route counts as active from its first report to the end of the
 * data, unless it stopped reporting more than RETIRED_AFTER_DAYS before the end
 * (then it is treated as retired after its last report). So a feed that goes
 * quiet in the last weeks shows up as "No data" instead of disappearing.
 *
 * Episodes are found over each entity's full history; the result keeps those
 * that overlap the requested window, with their true start date, and totals
 * (actual, expected, impact) for the days inside the window.
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
  /** First and last flagged day of the whole episode (may start before the window). */
  start: number
  end: number
  /** Flagged days in the whole episode. */
  days: number
  /** Flagged days inside the requested window. */
  windowDays: number
  /** Riders actually counted and expected on the flagged days inside the window. */
  actual: number
  expected: number
  /** Riders above (+) or below (−) expected on the flagged days inside the window. */
  impact: number
  /** The largest relative deviation on any day of the episode. */
  worstRatio: number | null
  /** The episode is still going on the last day with data. */
  ongoing: boolean
  /** Flagged days inside the window. */
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

const REFS = 8
const MIN_REFS = 4
const MAX_LOOKBACK_WEEKS = 52
const RETIRED_AFTER_DAYS = 90
/** A partial drop or a surge lasting longer than this becomes the new normal (a pandemic, a recovery); closures do not. */
const NEW_NORMAL_AFTER_DAYS = 28

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Dense day series per entity over [from, to] from a fact table. */
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

const isoDowOf = (d: number) => ((((d + 3) % 7) + 7) % 7) + 1

const cache = new Map<string, Episode[]>()

export function detectExceptions(ds: Dataset, opts: DetectOptions): Episode[] {
  const key = JSON.stringify([opts.start, opts.end, opts.threshold, opts.minExpected, opts.modes, opts.entityIds ?? null])
  const hit = cache.get(key)
  if (hit) return hit

  const from = ds.minDay
  const to = Math.min(opts.end, ds.maxDay)
  const episodes: Episode[] = []

  const run = (
    mode: Mode,
    table: Table,
    idCol: string,
    nameOf: (id: string) => string,
    span: (id: string) => { first: number | null; last: number | null },
  ) => {
    const only = opts.entityIds ? new Set(opts.entityIds) : null
    for (const [id, s] of matrix(table, idCol, from, to)) {
      if (only && !only.has(id)) continue
      const { first, last } = span(id)
      const activeUntil = last === null || last >= ds.maxDay - RETIRED_AFTER_DAYS ? ds.maxDay : last
      const activeFrom = first ?? from
      // A day is usable as a baseline reference when it was reported and not flagged.
      const usable = new Uint8Array(to - from + 1)
      // Last normal expectation per schedule (1-7 = Mon-Sun, holidays use Sunday's).
      const carried: (number | null)[] = new Array(8).fill(null)
      let disrupted = false
      let dropRun = 0
      let surgeRun = 0
      const flagged: ExceptionDay[] = []

      for (let d = Math.max(from, activeFrom); d <= Math.min(to, activeUntil); d++) {
        const v = s[d - from]
        const holiday = ds.holidays.has(d)
        const dow = isoDowOf(d)
        const schedule = holiday ? 7 : dow
        // Normal reference days: the same weekday (or Sundays, for a holiday), newest first.
        const refs: number[] = []
        const firstRef = holiday ? d - (dow % 7 || 7) : d - 7
        for (let x = firstRef, k = 0; refs.length < REFS && x >= from && k < MAX_LOOKBACK_WEEKS; x -= 7, k++) {
          if (!holiday && ds.holidays.has(x)) continue
          if (usable[x - from]) refs.push(s[x - from])
        }
        let expected: number | null = null
        if (refs.length >= MIN_REFS) {
          expected = median(refs)
          carried[schedule] = expected
        } else if (disrupted) expected = carried[schedule]

        if (expected === null || expected < opts.minExpected) {
          if (!Number.isNaN(v)) usable[d - from] = 1
          if (expected === null) disrupted = false
          continue
        }
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
        // A drop that persists is the new level, not an exception: let it into the baseline.
        dropRun = kind === 'drop' ? dropRun + 1 : kind === null ? 0 : dropRun
        surgeRun = kind === 'surge' ? surgeRun + 1 : kind === null ? 0 : surgeRun
        if ((kind === 'drop' && dropRun > NEW_NORMAL_AFTER_DAYS) || (kind === 'surge' && surgeRun > NEW_NORMAL_AFTER_DAYS)) kind = null
        if (kind) {
          flagged.push({ day: d, actual: Number.isNaN(v) ? null : v, expected, ratio, kind })
          // Shortfalls hold the pre-disruption baseline; a surge does not.
          disrupted = kind !== 'surge'
        } else {
          usable[d - from] = 1
          disrupted = false
        }
      }

      // Merge consecutive days of the same family (a one-day gap is allowed, so a weekend inside a closure does not split it).
      let cur: ExceptionDay[] = []
      const flush = () => {
        if (!cur.length) return
        const startDay = cur[0].day
        const endDay = cur[cur.length - 1].day
        if (endDay >= opts.start && startDay <= opts.end) {
          const inWindow = cur.filter((x) => x.day >= opts.start && x.day <= opts.end)
          const actual = inWindow.reduce((a, x) => a + (x.actual ?? 0), 0)
          const expected = inWindow.reduce((a, x) => a + x.expected, 0)
          const ratios = cur.map((x) => x.ratio).filter((r): r is number => r !== null)
          const kinds = new Set(cur.map((x) => x.kind))
          const kind: ExceptionKind = kinds.has('surge') ? 'surge' : kinds.has('zero') ? 'zero' : kinds.has('drop') ? 'drop' : 'missing'
          episodes.push({
            id: `${mode}:${id}:${startDay}:${kind}`,
            mode,
            entityId: id,
            entityName: nameOf(id),
            kind,
            start: startDay,
            end: endDay,
            days: cur.length,
            windowDays: inWindow.length,
            actual,
            expected,
            impact: actual - expected,
            worstRatio: ratios.length ? ratios.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null,
            ongoing: endDay >= ds.maxDay - 1,
            daysDetail: inWindow,
          })
        }
        cur = []
      }
      const sameFamily = (a: ExceptionKind, b: ExceptionKind) => (a === 'surge') === (b === 'surge')
      for (const f of flagged) {
        const prev = cur[cur.length - 1]
        if (prev && sameFamily(prev.kind, f.kind) && f.day - prev.day <= 2) cur.push(f)
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
      (id) => ({ first: ds.stationById.get(id)?.firstDay ?? null, last: ds.stationById.get(id)?.lastDay ?? null }),
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
      (id) => ({ first: ds.routeById.get(id)?.firstDay ?? null, last: ds.routeById.get(id)?.lastDay ?? null }),
    )

  const result = episodes.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  if (cache.size > 40) cache.delete(cache.keys().next().value!)
  cache.set(key, result)
  return result
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

/** Episodes as CSV rows (raw values; dates as ISO). */
export function episodesCsv(episodes: Episode[]): CsvData {
  return csvFromRecords(episodes, [
    { label: 'type', value: (e) => e.kind },
    { label: 'mode', value: (e) => e.mode },
    { label: 'id', value: (e) => e.entityId },
    { label: 'name', value: (e) => e.entityName },
    { label: 'start', value: (e) => isoOfDay(e.start) },
    { label: 'end', value: (e) => isoOfDay(e.end) },
    { label: 'days', value: (e) => e.days },
    { label: 'actual', value: (e) => e.actual },
    { label: 'expected', value: (e) => Math.round(e.expected) },
    { label: 'worst_ratio', value: (e) => e.worstRatio },
    { label: 'impact', value: (e) => Math.round(e.impact) },
    { label: 'ongoing', value: (e) => e.ongoing },
  ])
}
