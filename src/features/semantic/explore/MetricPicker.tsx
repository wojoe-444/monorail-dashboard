import { useId, useState } from 'react'
import { Search } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { useDataset } from '../data'

const CATEGORY_ORDER = ['System', 'Rail', 'Bus', 'Line']

interface MetricPickerProps {
  selected: string[]
  onChange: (metrics: string[]) => void
  /** Group-by and filter keys the metrics must support. */
  requires: string[]
}

/** Every metric in the semantic layer, by category. Metrics that cannot take the current grouping are disabled, with the reason. */
export function MetricPicker({ selected, onChange, requires }: MetricPickerProps) {
  const { engine } = useDataset()
  const id = useId()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const metrics = engine.listMetrics().filter((m) => !needle || m.label.toLowerCase().includes(needle) || m.name.includes(needle) || m.description.toLowerCase().includes(needle))
  const categories = [...new Set([...CATEGORY_ORDER, ...metrics.map((m) => m.category)])].filter((c) => metrics.some((m) => m.category === c))

  const missingFor = (name: string): string[] => {
    const dims = new Set(engine.dimensionsFor([name]).map((d) => d.key))
    return requires.filter((k) => !k.startsWith('metric_time') && !dims.has(k))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search metrics" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 34 metrics" className="h-8 pl-8 text-sm" />
      </div>
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
        {categories.map((cat) => (
          <fieldset key={cat} className="flex flex-col gap-0.5">
            <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{cat}</legend>
            {metrics
              .filter((m) => m.category === cat)
              .map((m) => {
                const checked = selected.includes(m.name)
                const missing = checked ? [] : missingFor(m.name)
                const disabled = missing.length > 0
                const inputId = `${id}-${m.name}`
                return (
                  <div
                    key={m.name}
                    className={cn('flex items-start gap-2 rounded-md px-1.5 py-1', !disabled && 'hover:bg-accent', disabled && 'opacity-50')}
                    title={disabled ? `Not available grouped or filtered by ${missing.join(', ')}` : m.description}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => onChange(v ? [...selected, m.name] : selected.filter((x) => x !== m.name))}
                      className="mt-0.5"
                    />
                    <label htmlFor={inputId} className={cn('flex min-w-0 flex-1 flex-col', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                      <span className="text-sm leading-tight">{m.label}</span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{m.name}</span>
                    </label>
                  </div>
                )
              })}
          </fieldset>
        ))}
        {!metrics.length && <p className="px-1.5 text-sm text-muted-foreground">No metric matches “{q}”.</p>}
      </div>
    </div>
  )
}
