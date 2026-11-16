import { lazy } from 'react'
import { SquareDashed } from 'lucide-react'

import type { Dashboard } from '@/app/hub'

const StarterPage = lazy(() => import('./pages/StarterPage').then((m) => ({ default: m.StarterPage })))

/** A blank dashboard to copy when adding a new one. It loads no data. */
export const starterDashboard: Dashboard = {
  id: 'starter',
  name: 'New dashboard',
  description: 'A blank dashboard to copy: the folder layout, registration, and the data options.',
  icon: SquareDashed,
  tag: 'Template',
  sections: [{ items: [{ path: '/', label: 'Start here', icon: SquareDashed, page: StarterPage }] }],
}
