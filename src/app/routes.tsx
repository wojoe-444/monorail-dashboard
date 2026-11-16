import { lazy } from 'react'
import { LayoutGrid, Settings } from 'lucide-react'

import { DASHBOARDS } from '@/app/dashboards'
import { dashboardFor, isHub, mountSections, registerDashboards, type Dashboard } from '@/app/hub'
import type { NavSection } from '@/components/layout/nav'
import { SettingsPage } from '@/pages/SettingsPage'

/**
 * Routes and the drawer. Pages belong to dashboards (src/dashboards/<id>/index.ts,
 * listed in src/app/dashboards.ts); this file adds the global routes and decides
 * what the drawer shows for the current path:
 *
 * - One dashboard: its sections plus Settings, exactly like a single-dashboard app.
 * - Hub mode: on the hub ('/') the drawer lists the dashboards; inside a dashboard
 *   it shows "All dashboards", that dashboard's sections (mounted under /<id>) and Settings.
 *
 * To add a page, add it to its dashboard's sections, not here.
 */
registerDashboards(DASHBOARDS)

const HubPage = lazy(() => import('@/pages/HubPage').then((m) => ({ default: m.HubPage })))

const SETTINGS: NavSection = {
  pinned: true,
  items: [{ path: '/settings', label: 'Settings', icon: Settings, page: SettingsPage }],
}

const HUB_HOME: NavSection = { items: [{ path: '/', label: 'All dashboards', icon: LayoutGrid, page: HubPage }] }

// Mount each dashboard's sections once, so nav items keep a stable identity between renders.
const MOUNTED = new Map<string, NavSection[]>(DASHBOARDS.map((d) => [d.id, mountSections(d)]))

function homePage(d: Dashboard) {
  return d.sections[0]?.items[0]?.page ?? HubPage
}

const HUB_INDEX: NavSection[] = [
  HUB_HOME,
  { heading: 'Dashboards', items: DASHBOARDS.map((d) => ({ path: `/${d.id}`, label: d.name, icon: d.icon, page: homePage(d) })) },
  SETTINGS,
]

/** The drawer sections (and so the routes) for a route path. */
export function navFor(path: string): NavSection[] {
  if (!isHub()) return [...DASHBOARDS[0].sections, SETTINGS]
  const d = dashboardFor(path)
  return d ? [HUB_HOME, ...MOUNTED.get(d.id)!, SETTINGS] : HUB_INDEX
}
