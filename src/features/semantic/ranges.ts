import { addMonths, dayOfIso, isoDow, isoOfDay, truncDay } from './core/time.ts'

/**
 * Time ranges relative to the last day with data (not today: the CTA publishes
 * with a lag of several weeks). Every page and saved view stores a preset, so a
 * view saved today still means "the latest 28 days" after the next data refresh.
 */
export type RangePreset = '1d' | '7d' | '28d' | '90d' | '6m' | '1y' | '3y' | 'ytd' | 'all' | 'custom'

export const RANGE_PRESETS: { value: RangePreset; label: string; long: string }[] = [
  { value: '1d', label: '1D', long: 'Latest day' },
  { value: '7d', label: '7D', long: 'Last 7 days' },
  { value: '28d', label: '28D', long: 'Last 28 days' },
  { value: '90d', label: '90D', long: 'Last 90 days' },
  { value: '6m', label: '6M', long: 'Last 6 months' },
  { value: '1y', label: '1Y', long: 'Last 12 months' },
  { value: '3y', label: '3Y', long: 'Last 3 years' },
  { value: 'ytd', label: 'YTD', long: 'Year to date' },
  { value: 'all', label: 'All', long: 'Since Jan 2019' },
]

export interface TimeWindow {
  start: string
  end: string
}

export function isPreset(v: string | null | undefined): v is RangePreset {
  return !!v && (RANGE_PRESETS.some((p) => p.value === v) || v === 'custom')
}

/** Resolve a preset against the data window. Day counts end on the last day with data. */
export function resolveRange(preset: RangePreset, minDay: number, maxDay: number, custom?: Partial<TimeWindow>): TimeWindow {
  const end = maxDay
  let start: number
  switch (preset) {
    case '1d':
      start = end
      break
    case '7d':
      start = end - 6
      break
    case '28d':
      start = end - 27
      break
    case '90d':
      start = end - 89
      break
    case '6m':
      start = addMonths(end, -6) + 1
      break
    case '1y':
      start = addMonths(end, -12) + 1
      break
    case '3y':
      start = addMonths(end, -36) + 1
      break
    case 'ytd':
      start = truncDay(end, 'year')
      break
    case 'custom': {
      const s = custom?.start ? dayOfIso(custom.start) : end - 27
      const e = custom?.end ? dayOfIso(custom.end) : end
      return { start: isoOfDay(Math.max(minDay, Math.min(s, e))), end: isoOfDay(Math.min(maxDay, Math.max(s, e))) }
    }
    default:
      start = minDay
  }
  return { start: isoOfDay(Math.max(minDay, start)), end: isoOfDay(end) }
}

/** The same window 52 weeks (364 days) earlier, matching the *_ly metrics. */
export function priorYear(w: TimeWindow): TimeWindow {
  return { start: isoOfDay(dayOfIso(w.start) - 364), end: isoOfDay(dayOfIso(w.end) - 364) }
}

/** The window of equal length immediately before. */
export function priorPeriod(w: TimeWindow): TimeWindow {
  const len = dayOfIso(w.end) - dayOfIso(w.start) + 1
  return { start: isoOfDay(dayOfIso(w.start) - len), end: isoOfDay(dayOfIso(w.end) - len) }
}

/** The same calendar window in 2019, the pre-pandemic baseline (aligned to weekday by whole weeks). */
export function baseline2019(w: TimeWindow): TimeWindow | null {
  const s = dayOfIso(w.start)
  const e = dayOfIso(w.end)
  const years = Number(w.end.slice(0, 4)) - 2019
  if (years <= 0) return null
  let shift = Math.round((years * 365.25) / 7) * 7
  // Whole weeks keep weekdays aligned; step a week later if the window would start before the data.
  while (s - shift < dayOfIso('2019-01-01')) shift -= 7
  const bs = s - shift
  const be = e - shift
  // The baseline is pre-pandemic: a window that would run into March 2020 has no clean comparison.
  if (be > dayOfIso('2020-02-29')) return null
  return { start: isoOfDay(bs), end: isoOfDay(be) }
}

/** Holidays (weekdays on a Sunday schedule) in a window. */
export function countHolidays(holidays: Set<number>, w: TimeWindow): number {
  let n = 0
  for (let d = dayOfIso(w.start); d <= dayOfIso(w.end); d++) if (holidays.has(d)) n++
  return n
}

/** A sensible chart grain for a window length. */
export function grainFor(w: TimeWindow): 'day' | 'week' | 'month' {
  const days = dayOfIso(w.end) - dayOfIso(w.start) + 1
  return days <= 120 ? 'day' : days <= 750 ? 'week' : 'month'
}

/** The Sunday that ends the last complete ISO week on or before `day`. */
export function lastCompleteWeekEnd(day: number): number {
  const dow = isoDow(day)
  return dow === 7 ? day : day - dow
}

/** Week-start ISO dates (Mondays) of the complete weeks in `recentWeeks`, to align sparklines. */
export function weekStarts(w: TimeWindow): string[] {
  const out: string[] = []
  for (let d = dayOfIso(w.start); d <= dayOfIso(w.end); d += 7) out.push(isoOfDay(d))
  return out
}

/** The last `weeks` complete ISO weeks, for weekly sparklines. */
export function recentWeeks(maxDay: number, weeks = 12): TimeWindow {
  const end = lastCompleteWeekEnd(maxDay)
  return { start: isoOfDay(end - weeks * 7 + 1), end: isoOfDay(end) }
}

/** Days in a window with a given CTA day type (e.g. 'Weekday'), from the service-day calendar. */
export function countDayType(dayType: Map<number, string>, w: TimeWindow, type: string): number {
  let n = 0
  for (let d = dayOfIso(w.start); d <= dayOfIso(w.end); d++) if (dayType.get(d) === type) n++
  return n
}
