import { lazy } from 'react'
import { Accessibility } from 'lucide-react'

import type { Dashboard } from '@/app/hub'
import { withData } from '@/features/semantic/DataBoundary'

const AccessibilityPage = lazy(() => import('./pages/AccessibilityPage').then((m) => ({ default: m.AccessibilityPage })))

/**
 * A light dashboard that shares the CTA semantic layer: same data, same metric
 * definitions, a different audience. It shows how a second dashboard reuses a
 * dataset instead of copying it.
 */
export const accessibilityDashboard: Dashboard = {
  id: 'accessibility',
  name: 'Station accessibility',
  description: 'Where riders enter stations without step-free access, ranked for accessibility work. Shares the CTA semantic layer.',
  icon: Accessibility,
  tag: 'Example',
  sections: [{ items: [{ path: '/', label: 'Step-free access', icon: Accessibility, page: withData(AccessibilityPage) }] }],
}
