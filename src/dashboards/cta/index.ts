import { lazy } from 'react'
import { Bus, Database, LayoutDashboard, LayoutGrid, Map, Ruler, SlidersHorizontal, TrainFront, TrainTrack, TriangleAlert } from 'lucide-react'

import type { Dashboard } from '@/app/hub'
import { withData } from '@/features/semantic/DataBoundary'

// Each page loads on first visit (its own chunk); withData's Suspense boundary shows the loading state.
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const StationsPage = lazy(() => import('./pages/StationsPage').then((m) => ({ default: m.StationsPage })))
const StationDetailPage = lazy(() => import('./pages/StationDetailPage').then((m) => ({ default: m.StationDetailPage })))
const LinesPage = lazy(() => import('./pages/LinesPage').then((m) => ({ default: m.LinesPage })))
const LineDetailPage = lazy(() => import('./pages/LineDetailPage').then((m) => ({ default: m.LineDetailPage })))
const BusRoutesPage = lazy(() => import('./pages/BusRoutesPage').then((m) => ({ default: m.BusRoutesPage })))
const RouteDetailPage = lazy(() => import('./pages/RouteDetailPage').then((m) => ({ default: m.RouteDetailPage })))
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const ExceptionsPage = lazy(() => import('./pages/ExceptionsPage').then((m) => ({ default: m.ExceptionsPage })))
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })))
const BoardPage = lazy(() => import('./pages/BoardPage').then((m) => ({ default: m.BoardPage })))
const MetricsPage = lazy(() => import('./pages/MetricsPage').then((m) => ({ default: m.MetricsPage })))
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })))
const Summary = lazy(() => import('./Summary').then((m) => ({ default: m.Summary })))

/**
 * CTA ridership operations: the full dashboard. Paths are relative to the
 * dashboard; in hub mode they mount under /cta. Detail pages are hidden
 * children, so the drawer keeps their list page highlighted.
 */
export const ctaDashboard: Dashboard = {
  id: 'cta',
  name: 'CTA ridership',
  description: "Rail and bus ridership for operations: stations, lines, routes, exceptions, and a self-serve semantic layer.",
  icon: TrainFront,
  summary: Summary,
  sections: [
    {
      items: [{ path: '/', label: 'Overview', icon: LayoutGrid, page: withData(OverviewPage) }],
    },
    {
      heading: 'Operations',
      items: [
        {
          path: '/rail',
          label: 'Rail stations',
          icon: TrainFront,
          page: withData(StationsPage),
          children: [{ path: '/rail/station', label: 'Station', page: withData(StationDetailPage), hidden: true }],
        },
        {
          path: '/lines',
          label: 'Lines',
          icon: TrainTrack,
          page: withData(LinesPage),
          children: [{ path: '/lines/line', label: 'Line', page: withData(LineDetailPage), hidden: true }],
        },
        {
          path: '/bus',
          label: 'Bus routes',
          icon: Bus,
          page: withData(BusRoutesPage),
          children: [{ path: '/bus/route', label: 'Route', page: withData(RouteDetailPage), hidden: true }],
        },
        { path: '/map', label: 'Station map', icon: Map, page: withData(MapPage), layout: 'full' },
        { path: '/exceptions', label: 'Exceptions', icon: TriangleAlert, page: withData(ExceptionsPage) },
      ],
    },
    {
      heading: 'Analysis',
      items: [
        { path: '/explore', label: 'Explore', icon: SlidersHorizontal, page: withData(ExplorePage) },
        { path: '/board', label: 'My board', icon: LayoutDashboard, page: withData(BoardPage) },
      ],
    },
    {
      heading: 'Reference',
      items: [
        { path: '/metrics', label: 'Metrics', icon: Ruler, page: withData(MetricsPage) },
        { path: '/data', label: 'Data & quality', icon: Database, page: withData(DataPage) },
      ],
    },
  ],
}
