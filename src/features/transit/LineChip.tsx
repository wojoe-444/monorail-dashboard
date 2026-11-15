import { useDataset, type Line } from '@/features/semantic/data'
import { cn } from '@/lib/utils'

/*
 * 'L' line identity. The swatch uses the CTA's official route color, read from
 * the dbt seed through the snapshot: it is wayfinding data riders already know
 * (the Red Line is red), so it is the one place a color does not come from the
 * theme tokens. Text stays in text tokens; the color only marks the swatch.
 */

export function LineSwatch({ line, className }: { line: Line; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10', className)} style={{ background: line.color }} />
}

export function LineChip({ name, className }: { name: string; className?: string }) {
  const { lineByName } = useDataset()
  const line = lineByName.get(name)
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', className)}>
      {line && <LineSwatch line={line} />}
      {name}
    </span>
  )
}

/** Compact: one swatch per line, names in the accessible label and tooltip. */
export function LineDots({ names, className }: { names: string[]; className?: string }) {
  const { lineByName } = useDataset()
  if (!names.length) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={names.join(', ')} aria-label={`Lines: ${names.join(', ')}`} role="img">
      {names.map((n) => {
        const line = lineByName.get(n)
        return line ? <LineSwatch key={n} line={line} /> : null
      })}
    </span>
  )
}
