import type { ComponentType } from 'react'

import type { IconComponent, NavSection } from '@/components/layout/nav'
import { href, navigate } from '@/lib/router'

/**
 * Optional multi-dashboard hub. See docs/multiple-dashboards.md.
 *
 * A dashboard is a folder under src/dashboards/<id>/ whose index.ts exports a
 * `Dashboard`: its nav sections with paths relative to the dashboard ('/' is its
 * home). src/app/dashboards.ts lists them. With one dashboard the app runs as a
 * plain single dashboard: routes stay unprefixed and there is no hub page or
 * switcher. With two or more, each dashboard lives under /<id> (#/cta/rail),
 * '/' is the hub, and Settings stays global.
 *
 * Inside a dashboard, link with `dashHref('/rail')` and `dashNavigate('/rail')`
 * so the same page works in both modes. To link into another dashboard, use
 * `pathIn('cta', '/rail')`.
 */
export interface Dashboard {
  /** URL segment in hub mode, e.g. 'cta' -> #/cta/... Lowercase letters, digits and dashes. */
  id: string
  name: string
  /** One line for the hub card and the switcher. */
  description: string
  icon: IconComponent
  /** The dashboard's drawer sections. Paths are relative: '/' is the dashboard's home. */
  sections: NavSection[]
  /** A small live figure for the hub card. Rendered inside a data boundary; keep it cheap. */
  summary?: ComponentType
  /** A short label on the hub card, e.g. 'Example' or 'Template'. */
  tag?: string
}

/** Routes that belong to the hub, not to a dashboard. */
const GLOBAL_SEGMENTS = new Set(['', 'settings'])

let registry: Dashboard[] = []

/** Called once by src/app/routes.tsx with the list from src/app/dashboards.ts. */
export function registerDashboards(list: Dashboard[]) {
  const ids = new Set<string>()
  for (const d of list) {
    if (!/^[a-z0-9-]+$/.test(d.id) || GLOBAL_SEGMENTS.has(d.id) || ids.has(d.id)) throw new Error(`Invalid or duplicate dashboard id "${d.id}"`)
    ids.add(d.id)
  }
  registry = list
}

export function dashboards(): Dashboard[] {
  return registry
}

/** Hub mode: more than one dashboard registered. */
export function isHub(): boolean {
  return registry.length > 1
}

function segmentOf(path: string): string {
  return path.split('?')[0].split('/')[1] ?? ''
}

/** The dashboard a route path belongs to (in single mode, always the only one). */
export function dashboardFor(path: string): Dashboard | undefined {
  if (!isHub()) return registry[0]
  return registry.find((d) => d.id === segmentOf(path))
}

/** A dashboard-relative path as a route path: pathIn('cta', '/rail') -> '/cta/rail' in hub mode, '/rail' otherwise. */
export function pathIn(id: string, path: string): string {
  if (!isHub()) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return p === '/' ? `/${id}` : p.startsWith('/?') ? `/${id}${p.slice(1)}` : `/${id}${p}`
}

function currentDashboardId(): string {
  const path = window.location.hash.replace(/^#/, '') || '/'
  return dashboardFor(path)?.id ?? registry[0]?.id ?? ''
}

/** href() for a path inside the current dashboard. */
export function dashHref(path: string): string {
  return href(pathIn(currentDashboardId(), path))
}

/** navigate() to a path inside the current dashboard. */
export function dashNavigate(path: string) {
  navigate(pathIn(currentDashboardId(), path))
}

/** Prefix a dashboard's relative nav sections for hub mode. */
export function mountSections(d: Dashboard): NavSection[] {
  if (!isHub()) return d.sections
  return d.sections.map((section, i) => ({
    ...section,
    // The dashboard's untitled first section gets the dashboard's name, so the drawer says where you are.
    heading: section.heading ?? (i === 0 ? d.name : undefined),
    items: section.items.map((item) => ({
      ...item,
      path: pathIn(d.id, item.path),
      children: item.children?.map((c) => ({ ...c, path: pathIn(d.id, c.path) })),
    })),
  }))
}
