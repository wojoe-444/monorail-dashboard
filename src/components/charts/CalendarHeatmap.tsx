import { useState } from 'react'

import { cn } from '@/lib/utils'

export interface CalendarCell {
  /** Day number (days since 1970-01-01). */
  day: number
  value: number | null
}

interface CalendarHeatmapProps {
  cells: CalendarCell[]
  /**
   * sequential: magnitude, one hue light to dark.
   * diverging: signed change around zero, cool above / warm below, neutral at zero.
   */
  scale: 'sequential' | 'diverging'
  /** Diverging: the magnitude that gets the strongest color (e.g. 0.5 for ±50%). */
  extent?: number
  formatValue: (v: number) => string
  formatDay: (day: number) => string
  /** Extra text under a hovered day, e.g. the day type. */
  describe?: (day: number) => string | undefined
  onSelect?: (day: number) => void
  ariaLabel: string
}

const CELL = 12
const GAP = 2
const STEPS = [18, 34, 52, 72, 92]
const DOW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isoDow(day: number) {
  return ((((day + 3) % 7) + 7) % 7) + 1
}

/**
 * GitHub-style calendar: one column per ISO week, Monday at the top. Colors are
 * mixed from the series tokens toward the card surface, so they follow the
 * palette and dark mode. Missing days draw as an outline only.
 */
export function CalendarHeatmap({ cells, scale, extent = 0.5, formatValue, formatDay, describe, onSelect, ariaLabel }: CalendarHeatmapProps) {
  const [hover, setHover] = useState<CalendarCell | null>(null)
  if (!cells.length) return null
  const byDay = new Map(cells.map((c) => [c.day, c]))
  const first = cells[0].day - (isoDow(cells[0].day) - 1)
  const weeks = Math.ceil((cells[cells.length - 1].day - first + 1) / 7)
  const values = cells.map((c) => c.value).filter((v): v is number => v !== null)
  // Cap at the 98th percentile so one event day does not wash out the rest of the year.
  const sortedValues = [...values].sort((a, b) => a - b)
  const max = Math.max(sortedValues[Math.floor((sortedValues.length - 1) * 0.98)] ?? 1, 1)
  const min = Math.min(sortedValues[0] ?? 0, 0)

  // One hue, stepped by opacity over the card: stays true to the series color in both modes.
  const color = (v: number | null): { fill: string; opacity: number } | undefined => {
    if (v === null) return undefined
    if (scale === 'sequential') {
      const t = Math.min(1, Math.max(0, (v - min) / (max - min || 1)))
      return { fill: 'var(--series-1)', opacity: STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))] / 100 }
    }
    const t = Math.min(1, Math.abs(v) / extent)
    if (t < 0.08) return { fill: 'var(--muted-foreground)', opacity: 0.12 }
    return { fill: v > 0 ? 'var(--series-1)' : 'var(--series-2)', opacity: STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))] / 100 }
  }

  const width = 28 + weeks * (CELL + GAP)
  const height = 16 + 7 * (CELL + GAP)
  const monthTicks: { x: number; label: string }[] = []
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    const d = new Date((first + w * 7) * 86_400_000)
    if (d.getUTCMonth() !== lastMonth) {
      lastMonth = d.getUTCMonth()
      monthTicks.push({ x: 28 + w * (CELL + GAP), label: MONTHS[lastMonth] })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="application"
          aria-roledescription="calendar"
          aria-label={`${ariaLabel}. Arrow keys move between days${onSelect ? ', Enter opens the selected day' : ''}.`}
          tabIndex={0}
          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onFocus={() => setHover((h) => h ?? cells[cells.length - 1])}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity }[e.key]
            if (step !== undefined) {
              e.preventDefault()
              const current = hover ?? cells[cells.length - 1]
              const target = step === -Infinity ? cells[0] : step === Infinity ? cells[cells.length - 1] : byDay.get(current.day + step)
              if (target) setHover(target)
            } else if ((e.key === 'Enter' || e.key === ' ') && hover && onSelect) {
              e.preventDefault()
              onSelect(hover.day)
            }
          }}
        >
          {monthTicks.map((m, i) =>
            i === 0 && monthTicks[1] && monthTicks[1].x - m.x < 28 ? null : (
              <text key={`${m.label}-${m.x}`} x={m.x} y={10} className="fill-muted-foreground text-[10px]">
                {m.label}
              </text>
            ),
          )}
          {DOW_LABELS.map((l, i) =>
            l ? (
              <text key={l} x={0} y={16 + i * (CELL + GAP) + CELL - 2} className="fill-muted-foreground text-[10px]">
                {l}
              </text>
            ) : null,
          )}
          {cells.map((c) => {
            const w = Math.floor((c.day - first) / 7)
            const dow = isoDow(c.day) - 1
            const fill = color(c.value)
            const active = hover?.day === c.day
            return (
              <rect
                key={c.day}
                x={28 + w * (CELL + GAP)}
                y={16 + dow * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={fill?.fill ?? 'transparent'}
                fillOpacity={fill?.opacity ?? 1}
                stroke={active ? 'var(--foreground)' : fill ? 'none' : 'var(--border)'}
                strokeWidth={active ? 1.5 : 1}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover((h) => (h?.day === c.day ? null : h))}
                onClick={onSelect ? () => onSelect(c.day) : undefined}
                className={cn(onSelect && 'cursor-pointer')}
              />
            )
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-h-4" aria-live="polite">
          {hover ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{hover.value === null ? 'No data' : formatValue(hover.value)}</span>
              {' · '}
              {formatDay(hover.day)}
              {describe?.(hover.day) ? ` · ${describe(hover.day)}` : ''}
            </>
          ) : (
            'Hover a day, or focus the calendar and use the arrow keys'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span>{scale === 'sequential' ? formatValue(min) : `−${Math.round(extent * 100)}%`}</span>
          {(scale === 'sequential' ? STEPS.map((s) => ['seq', s] as const) : [...[...STEPS].reverse().map((s) => ['neg', s] as const), ['mid', 0] as const, ...STEPS.map((s) => ['pos', s] as const)]).map(
            ([kind, s]) => (
              <span
                key={`${kind}${s}`}
                className="size-2.5 rounded-[2px]"
                style={{
                  background: kind === 'mid' ? 'var(--muted-foreground)' : kind === 'neg' ? 'var(--series-2)' : 'var(--series-1)',
                  opacity: kind === 'mid' ? 0.12 : s / 100,
                }}
              />
            ),
          )}
          <span>{scale === 'sequential' ? `${formatValue(max)}+` : `+${Math.round(extent * 100)}%`}</span>
        </span>
      </div>
    </div>
  )
}
