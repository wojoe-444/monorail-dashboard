import { Component, Suspense, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

import { APP } from '@/app/config'
import { dashboards, pathIn } from '@/app/hub'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { href } from '@/lib/router'

/** A failed or slow summary never takes the hub down: it just leaves the card without a figure. */
class SummaryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** The hub's home: one card per dashboard. Shown only when more than one dashboard is registered. */
export function HubPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={APP.name} title="Dashboards" description="Pick a dashboard. Each one has its own pages; Settings and your appearance choices are shared." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboards().map((d) => (
          <a key={d.id} href={href(pathIn(d.id, '/'))} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full gap-4 px-6 transition-colors group-hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  <d.icon className="size-5" aria-hidden />
                </span>
                {d.tag && <Badge variant="outline">{d.tag}</Badge>}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold">{d.name}</span>
                <span className="text-sm text-muted-foreground">{d.description}</span>
              </div>
              {d.summary && (
                <SummaryBoundary>
                  <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-md bg-muted" />}>
                    <d.summary />
                  </Suspense>
                </SummaryBoundary>
              )}
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
