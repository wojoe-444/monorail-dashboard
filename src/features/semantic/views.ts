import { useSyncExternalStore } from 'react'

import { readJson, writeJson } from '@/lib/prefs'

import type { SavedQuery } from './core/types.ts'
import type { RangePreset, TimeWindow } from './ranges'

/**
 * A view: a semantic query plus how to show it. Views are what the Explore page
 * edits, what "Open in Explore" on any chart produces, and what My board pins.
 * Team views come from MetricFlow saved queries (semantic/models/semantic/saved_queries.yml);
 * personal views live in this browser's preferences until someone promotes one
 * to a saved query in a pull request (the Explore page writes the YAML for that).
 */
export type ChartKind = 'line' | 'bar' | 'stacked' | 'table'

export interface ViewSpec {
  metrics: string[]
  groupBy: string[]
  where: string[]
  range: RangePreset
  custom?: Partial<TimeWindow>
  chart: ChartKind
  /** Rolling average in days applied to day-grain line charts (0 = off). */
  smooth?: number
  limit?: number
  orderBy?: { key: string; desc?: boolean }
}

export interface SavedView {
  id: string
  name: string
  description?: string
  spec: ViewSpec
  /** The team view (saved query) this was copied from, if any. */
  from?: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

const KEY = 'explore.views'
let views: SavedView[] = readJson<SavedView[]>(KEY, [])
const listeners = new Set<() => void>()

function emit(next: SavedView[]) {
  views = next
  writeJson(KEY, next)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSavedViews(): SavedView[] {
  return useSyncExternalStore(subscribe, () => views, () => views)
}

export function getView(id: string): SavedView | undefined {
  return views.find((v) => v.id === id)
}

export function saveView(input: { id?: string; name: string; description?: string; spec: ViewSpec; from?: string; pinned?: boolean }): SavedView {
  const now = new Date().toISOString()
  const existing = input.id ? views.find((v) => v.id === input.id) : undefined
  const view: SavedView = existing
    ? { ...existing, name: input.name, description: input.description, spec: input.spec, updatedAt: now, pinned: input.pinned ?? existing.pinned }
    : {
        id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: input.name,
        description: input.description,
        spec: input.spec,
        from: input.from,
        pinned: input.pinned ?? false,
        createdAt: now,
        updatedAt: now,
      }
  emit(existing ? views.map((v) => (v.id === view.id ? view : v)) : [...views, view])
  return view
}

export function deleteView(id: string) {
  emit(views.filter((v) => v.id !== id))
}

export function setPinned(id: string, pinned: boolean) {
  emit(views.map((v) => (v.id === id ? { ...v, pinned } : v)))
}

/** Move a pinned view past its neighbouring pinned view (unpinned views keep their places). */
export function moveView(id: string, delta: -1 | 1) {
  const i = views.findIndex((v) => v.id === id)
  if (i < 0) return
  let j = i + delta
  while (j >= 0 && j < views.length && !views[j].pinned) j += delta
  if (j < 0 || j >= views.length) return
  const next = [...views]
  ;[next[i], next[j]] = [next[j], next[i]]
  emit(next)
}

export function specFromSavedQuery(q: SavedQuery): ViewSpec {
  const chart = (['line', 'bar', 'stacked', 'table'] as const).find((c) => c === q.meta.chart) ?? 'line'
  const range = (q.meta.range as RangePreset | undefined) ?? '1y'
  return {
    metrics: q.metrics,
    groupBy: q.groupBy,
    where: q.where,
    range,
    custom: range === 'custom' ? { start: q.meta.start, end: q.meta.end } : undefined,
    chart,
    smooth: q.meta.smooth || undefined,
    limit: q.limit,
    orderBy: q.orderBy?.[0],
  }
}

// URL encoding, so any view is a link: #/explore?q=<base64url JSON>
export function encodeSpec(spec: ViewSpec): string {
  const json = JSON.stringify(spec)
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodeSpec(s: string | null): ViewSpec | null {
  if (!s) return null
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const spec = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ViewSpec>
    if (!Array.isArray(spec.metrics)) return null
    return { ...spec, metrics: spec.metrics, groupBy: spec.groupBy ?? [], where: spec.where ?? [], range: spec.range ?? '1y', chart: spec.chart ?? 'line' }
  } catch {
    return null
  }
}

export function exploreHref(spec: ViewSpec, name?: string): string {
  return `/explore?q=${encodeSpec(spec)}${name ? `&name=${encodeURIComponent(name)}` : ''}`
}
