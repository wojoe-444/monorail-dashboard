import type { ReactNode } from 'react'

import { useDataset } from '../data'
import { formatRange } from '../format'
import { resolveRange } from '../ranges'
import { useQuery } from '../useQuery'
import type { ViewSpec } from '../views'
import { ChartCard } from './ChartCard'
import { ResultChart } from './ResultChart'

interface ViewCardProps {
  title: string
  description?: ReactNode
  view: ViewSpec
  height?: number
  className?: string
  controls?: ReactNode
}

/** A card that runs a semantic view and draws it. What My board and the team views use. */
export function ViewCard({ title, description, view, height, className, controls }: ViewCardProps) {
  const { minDay, maxDay } = useDataset()
  const window = resolveRange(view.range, minDay, maxDay, view.custom)
  const { result, error } = useQuery({
    metrics: view.metrics,
    groupBy: view.groupBy,
    where: view.where,
    timeRange: window,
    limit: view.limit,
    orderBy: view.orderBy ? [view.orderBy] : undefined,
  })
  return (
    <ChartCard
      title={title}
      description={description ?? formatRange(window.start, window.end)}
      view={view}
      result={result}
      className={className}
      controls={controls}
    >
      {error ? (
        <div className="rounded-lg bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground">{error}</div>
      ) : result ? (
        <ResultChart result={result} chart={view.chart} smooth={view.smooth} height={height} title={title} />
      ) : null}
    </ChartCard>
  )
}
