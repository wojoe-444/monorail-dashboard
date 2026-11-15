import { formatPercent, formatSignedPercent } from '@/features/semantic/format'
import { cn } from '@/lib/utils'

/** A signed change: green up, amber down (ridership up is good), muted when unknown. */
export function Delta({ v, className }: { v: number | null | undefined; className?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className={cn('text-muted-foreground', className)}>—</span>
  return (
    <span className={cn('tabular-nums', v > 0.0005 ? 'text-success' : v < -0.0005 ? 'text-warning-soft-foreground' : 'text-muted-foreground', className)}>
      {formatSignedPercent(v)}
    </span>
  )
}

/** Share of a baseline (e.g. of 2019): plain text with a thin meter. */
export function ShareOf({ v, className }: { v: number | null | undefined; className?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className={cn('text-muted-foreground', className)}>—</span>
  return (
    <span className={cn('inline-flex items-center justify-end gap-2', className)}>
      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, v * 100)}%` }} />
      </span>
      <span className="tabular-nums">{formatPercent(v, 0)}</span>
    </span>
  )
}
