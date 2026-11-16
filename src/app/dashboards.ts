import type { Dashboard } from '@/app/hub'
import { accessibilityDashboard } from '@/dashboards/accessibility'
import { ctaDashboard } from '@/dashboards/cta'
import { starterDashboard } from '@/dashboards/starter'

/**
 * The dashboards in this app, in hub and switcher order.
 *
 * One entry: the app is a single dashboard (no hub page, no switcher, routes
 * unprefixed). Two or more: a hub at '/', each dashboard under /<id>.
 * See docs/multiple-dashboards.md.
 */
export const DASHBOARDS: Dashboard[] = [ctaDashboard, accessibilityDashboard, starterDashboard]
