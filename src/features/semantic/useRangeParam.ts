import { useUrlParams } from '@/hooks/useUrlParams'

import { useDataset } from './data'
import { isPreset, resolveRange, type RangePreset, type TimeWindow } from './ranges'

/** The page's date range, kept in the URL as ?range=28d (or ?range=custom&from=…&to=…). */
export function useRangeParam(fallback: RangePreset, allowed?: RangePreset[]) {
  const { minDay, maxDay } = useDataset()
  const [params, setParams] = useUrlParams()
  const raw = params.get('range')
  const preset: RangePreset = isPreset(raw) && (!allowed || allowed.includes(raw) || raw === 'custom') ? raw : fallback
  const custom: Partial<TimeWindow> | undefined = preset === 'custom' ? { start: params.get('from') ?? undefined, end: params.get('to') ?? undefined } : undefined
  const window = resolveRange(preset, minDay, maxDay, custom)
  const set = (next: RangePreset, c?: Partial<TimeWindow>) =>
    setParams({ range: next === fallback ? null : next, from: next === 'custom' ? (c?.start ?? null) : null, to: next === 'custom' ? (c?.end ?? null) : null })
  return { preset, custom, window, setRange: set, params, setParams }
}
