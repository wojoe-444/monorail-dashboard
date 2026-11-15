import { useId } from 'react'
import { CalendarRange } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'

import { isoOfDay } from '../core/time.ts'
import { useDataset } from '../data'
import { formatRange } from '../format'
import { RANGE_PRESETS, resolveRange, type RangePreset, type TimeWindow } from '../ranges'

interface RangeControlProps {
  value: RangePreset
  custom?: Partial<TimeWindow>
  onChange: (preset: RangePreset, custom?: Partial<TimeWindow>) => void
  /** Limit the presets offered (e.g. no 7D on a monthly view). */
  presets?: RangePreset[]
  className?: string
}

/** Date range: presets relative to the last day with data, plus a custom range. */
export function RangeControl({ value, custom, onChange, presets, className }: RangeControlProps) {
  const { minDay, maxDay } = useDataset()
  const id = useId()
  const options = RANGE_PRESETS.filter((p) => !presets || presets.includes(p.value))
  const window = resolveRange(value, minDay, maxDay, custom)
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Segmented
        aria-label="Date range"
        value={value === 'custom' ? ('' as RangePreset) : value}
        onChange={(v) => onChange(v)}
        options={options.map((p) => ({ value: p.value, label: p.label, title: p.long }))}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={value === 'custom' ? 'soft' : 'outline'} size="sm" className="h-9">
            <CalendarRange />
            <span className="tabular-nums">{formatRange(window.start, window.end)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              onChange('custom', { start: String(f.get('start')), end: String(f.get('end')) })
            }}
          >
            <div className="text-sm font-medium">Custom range</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-start`} className="text-xs">
                  From
                </Label>
                <Input id={`${id}-start`} name="start" type="date" defaultValue={window.start} min={isoOfDay(minDay)} max={isoOfDay(maxDay)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-end`} className="text-xs">
                  To
                </Label>
                <Input id={`${id}-end`} name="end" type="date" defaultValue={window.end} min={isoOfDay(minDay)} max={isoOfDay(maxDay)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Data runs {formatRange(isoOfDay(minDay), isoOfDay(maxDay))}.</p>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
