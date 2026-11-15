/**
 * Calendar math on "day numbers": whole days since 1970-01-01 (UTC). Service
 * dates have no time of day, so integers avoid every time-zone pitfall and let
 * the engine bucket hundreds of thousands of rows without allocating Dates.
 */

export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const GRAINS: Grain[] = ['day', 'week', 'month', 'quarter', 'year']

const DAY_MS = 86_400_000

export function dayOfIso(iso: string): number {
  return Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS)
}

export function isoOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function dateOfDay(day: number): Date {
  return new Date(day * DAY_MS)
}

/** ISO weekday: Monday = 1 ... Sunday = 7. Day 0 (1970-01-01) was a Thursday. */
export function isoDow(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1
}

/** Day number of the first day of the period containing `day`. Weeks start on Monday (ISO). */
export function truncDay(day: number, grain: Grain): number {
  if (grain === 'day') return day
  if (grain === 'week') return day - (isoDow(day) - 1)
  const d = dateOfDay(day)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (grain === 'month') return Math.round(Date.UTC(y, m, 1) / DAY_MS)
  if (grain === 'quarter') return Math.round(Date.UTC(y, m - (m % 3), 1) / DAY_MS)
  return Math.round(Date.UTC(y, 0, 1) / DAY_MS)
}

/** Last day of the period that starts on `start`. */
export function periodEnd(start: number, grain: Grain): number {
  if (grain === 'day') return start
  if (grain === 'week') return start + 6
  const d = dateOfDay(start)
  const months = grain === 'month' ? 1 : grain === 'quarter' ? 3 : 12
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1) / DAY_MS) - 1
}

/** Add calendar months (clamped to the month's last day). */
export function addMonths(day: number, months: number): number {
  const d = dateOfDay(day)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return Math.round(target.getTime() / DAY_MS)
}

/**
 * Truncation with a per-grain lookup table over a fixed day range, so the hot
 * loop does an array read instead of Date math.
 */
export class Truncator {
  private cache = new Map<Grain, Int32Array>()
  private readonly min: number
  private readonly max: number
  constructor(min: number, max: number) {
    this.min = min
    this.max = max
  }

  fn(grain: Grain): (day: number) => number {
    if (grain === 'day') return (d) => d
    let table = this.cache.get(grain)
    if (!table) {
      table = new Int32Array(this.max - this.min + 1)
      for (let d = this.min; d <= this.max; d++) table[d - this.min] = truncDay(d, grain)
      this.cache.set(grain, table)
    }
    const t = table
    const min = this.min
    const max = this.max
    return (d) => (d >= min && d <= max ? t[d - min] : truncDay(d, grain))
  }
}
