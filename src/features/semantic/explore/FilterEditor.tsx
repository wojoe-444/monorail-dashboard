import { useState } from 'react'
import { ChevronDown, Code, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'

import { formatFilter, parseFilter, type FilterCondition } from '../core/filters.ts'
import { useDataset } from '../data'
import { formatCategory } from '../format'

interface FilterEditorProps {
  metrics: string[]
  where: string[]
  onChange: (where: string[]) => void
}

/**
 * Filters as MetricFlow where-clauses. The form edits "dimension is / is not
 * any of"; "Edit as MetricFlow" exposes the raw strings, which run unchanged in
 * `mf query --where`.
 */
export function FilterEditor({ metrics, where, onChange }: FilterEditorProps) {
  const { engine } = useDataset()
  const [raw, setRaw] = useState(false)
  const [draft, setDraft] = useState(where.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [blank, setBlank] = useState<FilterCondition[]>([])
  const available = engine.dimensionsFor(metrics).filter((d) => d.kind !== 'time')

  let conditions: FilterCondition[] | null = null
  try {
    conditions = where.flatMap((w) => parseFilter(w))
  } catch {
    conditions = null
  }

  const commitRaw = () => {
    const lines = draft
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    try {
      lines.forEach((l) => parseFilter(l))
      setError(null)
      onChange(lines)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (raw || conditions === null) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="MetricFlow where filters, one per line"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRaw}
          rows={4}
          className="font-mono text-xs"
          placeholder="{{ Dimension('station__sector') }} = 'Loop'"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="soft" onClick={commitRaw}>
            Apply
          </Button>
          {conditions !== null && (
            <Button size="sm" variant="ghost" onClick={() => setRaw(false)}>
              Back to form
            </Button>
          )}
        </div>
      </div>
    )
  }

  const update = (next: FilterCondition[]) => onChange(next.filter((c) => c.values.length).map(formatFilter))
  const active = conditions
  const options = available.map((d) => ({ key: d.key, label: d.label }))

  return (
    <div className="flex flex-col gap-2">
      {active.map((c, i) => (
        <FilterRow
          key={`${c.ref}-${i}`}
          condition={c}
          options={options}
          onChange={(nc) => update(active.map((x, j) => (j === i ? nc : x)))}
          onRemove={() => update(active.filter((_, j) => j !== i))}
        />
      ))}
      {/* A new filter stays here until it has a value; only complete filters reach the query. */}
      {blank.map((c, i) => (
        <FilterRow
          key={`blank-${c.ref}-${i}`}
          condition={c}
          options={options}
          onChange={(nc) => {
            setBlank(blank.filter((_, j) => j !== i))
            update([...active, nc])
          }}
          onRemove={() => setBlank(blank.filter((_, j) => j !== i))}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <AddFilter options={options} onAdd={(c) => setBlank([...blank, c])} disabled={!metrics.length} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(where.join('\n'))
            setRaw(true)
          }}
        >
          <Code />
          Edit as MetricFlow
        </Button>
      </div>
    </div>
  )
}

function FilterRow({
  condition,
  options,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  options: { key: string; label: string }[]
  onChange: (c: FilterCondition) => void
  onRemove: () => void
}) {
  const label = options.find((o) => o.key === condition.ref)?.label ?? condition.ref
  const negative = condition.op === '!=' || condition.op === 'not in'
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Remove filter on ${label}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label={`${label} operator`}
          value={negative ? 'not in' : 'in'}
          onChange={(e) => onChange({ ...condition, op: e.target.value as 'in' | 'not in' })}
          className="w-24"
        >
          <option value="in">is</option>
          <option value="not in">is not</option>
        </NativeSelect>
        <ValuePicker dimension={condition.ref} label={label} values={condition.values} onChange={(values) => onChange({ ...condition, op: negative ? 'not in' : 'in', values })} />
      </div>
    </div>
  )
}

function ValuePicker({ dimension, label, values, onChange }: { dimension: string; label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { engine } = useDataset()
  const [q, setQ] = useState('')
  const all = engine.dimensionValues(dimension)
  const shown = all.filter((v) => formatCategory(v).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200)
  const summary = values.length === 0 ? 'Any' : values.length === 1 ? formatCategory(values[0]) : `${values.length} values`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 flex-1 justify-between font-normal" aria-label={`${label} values: ${summary}`}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        {all.length > 8 && <Input aria-label={`Search ${label}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="mb-2 h-8" />}
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {shown.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={values.includes(v)} onCheckedChange={(c) => onChange(c ? [...values, v] : values.filter((x) => x !== v))} />
              <span className="truncate">{formatCategory(v)}</span>
            </label>
          ))}
          {all.length > shown.length && <p className="px-2 py-1 text-xs text-muted-foreground">Showing {shown.length} of {all.length}; search to narrow.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AddFilter({ options, onAdd, disabled }: { options: { key: string; label: string }[]; onAdd: (c: FilterCondition) => void; disabled: boolean }) {
  return (
    <NativeSelect
      aria-label="Add a filter"
      value=""
      disabled={disabled}
      onChange={(e) => e.target.value && onAdd({ ref: e.target.value, op: 'in', values: [] })}
      className="min-w-40 flex-1"
    >
      <option value="">{disabled ? 'Pick a metric first' : '+ Add a filter'}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

