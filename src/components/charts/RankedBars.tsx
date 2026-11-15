import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface RankedItem {
  key: string
  label: ReactNode
  /** Plain text for the accessible name when `label` is not a string. */
  name?: string
  value: number
  /** The figure printed at the bar's end. */
  display: string
  /** Secondary figure in its own column, e.g. a signed change. */
  aside?: ReactNode
  href?: string
}

/**
 * Horizontal ranked bars in HTML: label, a thin bar from a shared baseline, the
 * value at the bar's end. Rows are links when `href` is set. A list, so screen
 * readers get the numbers without a table view.
 */
export function RankedBars({ items, color = 'var(--series-1)', className }: { items: RankedItem[]; color?: string; className?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1)
  return (
    <ol className={cn('flex flex-col', className)}>
      {items.map((item) => {
        const content = (
          <>
            <span className="min-w-0 truncate text-sm">{item.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="relative h-2 min-w-0 flex-1" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `max(2px, ${(Math.abs(item.value) / max) * 100}%)`, background: color }} />
              </span>
              <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">{item.display}</span>
            </span>
            {item.aside !== undefined && <span className="text-right text-xs tabular-nums">{item.aside}</span>}
          </>
        )
        const grid = cn(
          'grid items-center gap-3 rounded-md px-2 py-1.5',
          item.aside !== undefined ? 'grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem]' : 'grid-cols-[minmax(0,10rem)_minmax(0,1fr)]',
        )
        return (
          <li key={item.key}>
            {item.href ? (
              <a href={item.href} className={cn(grid, 'outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring')}>
                {content}
              </a>
            ) : (
              <div className={grid}>{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
