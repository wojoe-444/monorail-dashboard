import { useId } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

import type { Grain } from '../core/time.ts'
import { useDataset } from '../data'

const GRAIN_OPTIONS: { value: 'none' | Grain; label: string }[] = [
  { value: 'none', label: 'No time split' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

interface GroupByPickerProps {
  metrics: string[]
  groupBy: string[]
  onChange: (groupBy: string[]) => void
}

/** Time grain plus up to two dimensions, limited to what every selected metric can be grouped by. */
export function GroupByPicker({ metrics, groupBy, onChange }: GroupByPickerProps) {
  const { engine } = useDataset()
  const id = useId()
  const time = groupBy.find((g) => g.startsWith('metric_time__'))
  const grain = (time?.split('__')[1] as Grain | undefined) ?? 'none'
  const dims = groupBy.filter((g) => !g.startsWith('metric_time'))
  const available = engine.dimensionsFor(metrics).filter((d) => d.kind !== 'time')
  const label = (key: string) => available.find((d) => d.key === key)?.label ?? key

  const setGrain = (g: 'none' | Grain) => onChange([...(g === 'none' ? [] : [`metric_time__${g}`]), ...dims])
  const setDims = (next: string[]) => onChange([...(time ? [time] : []), ...next])

  // Entities (ids) after named dimensions, grouped by the model that owns them.
  const options = [...available].sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'dimension' ? -1 : 1))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${id}-time`}>
          Over time
        </label>
        <NativeSelect id={`${id}-time`} value={grain} onChange={(e) => setGrain(e.target.value as 'none' | Grain)}>
          {GRAIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Split by</span>
        {dims.map((d, i) => (
          <div key={d} className="flex items-center gap-2">
            <NativeSelect
              aria-label={`Split ${i + 1}`}
              value={d}
              onChange={(e) => setDims(dims.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1"
            >
              {options
                .filter((o) => o.key === d || !dims.includes(o.key))
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {o.kind === 'entity' ? ' (id)' : ''}
                  </option>
                ))}
              {!options.some((o) => o.key === d) && <option value={d}>{label(d)} (not available)</option>}
            </NativeSelect>
            <Button variant="ghost" size="icon" aria-label={`Remove ${label(d)}`} onClick={() => setDims(dims.filter((x) => x !== d))}>
              <X />
            </Button>
          </div>
        ))}
        {dims.length < 2 && (
          <NativeSelect
            aria-label="Add a split"
            value=""
            onChange={(e) => e.target.value && setDims([...dims, e.target.value])}
            disabled={!metrics.length}
          >
            <option value="">{metrics.length ? '+ Add a dimension' : 'Pick a metric first'}</option>
            {options
              .filter((o) => !dims.includes(o.key))
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                  {o.kind === 'entity' ? ' (id)' : ''}
                </option>
              ))}
          </NativeSelect>
        )}
        {metrics.length > 0 && options.length === 0 && <p className="text-xs text-muted-foreground">These metrics share no dimension; they can only be compared over time.</p>}
      </div>
    </div>
  )
}
