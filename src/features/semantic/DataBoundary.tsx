import { Component, Suspense, type ComponentType, type ReactNode } from 'react'
import { DatabaseZap, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { resetDataset } from './data'

class ErrorBoundary extends Component<{ children: ReactNode; fallback: (error: Error, retry: () => void) => ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  retry = () => {
    resetDataset()
    this.setState({ error: null })
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children
  }
}

function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading CTA ridership data</span>
    </div>
  )
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <Card className="mx-auto max-w-xl items-start gap-4 px-6">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-destructive-soft text-destructive-soft-foreground">
          <DatabaseZap className="size-5" aria-hidden />
        </span>
        <div>
          <div className="font-semibold">This view could not load</div>
          <div className="text-sm text-muted-foreground">{error.message}</div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        If the snapshot is missing, rebuild it with <code className="font-mono text-xs">npm run data:build</code>.
      </p>
      <Button variant="outline" onClick={retry}>
        <RotateCw />
        Try again
      </Button>
    </Card>
  )
}

/** Suspends children until the dataset is loaded, and catches load and query errors. */
export function DataBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={(error, retry) => <LoadError error={error} retry={retry} />}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

/** Wrap a page component for routes.tsx so it renders under a DataBoundary. */
export function withData(Page: ComponentType): ComponentType {
  const Wrapped = () => (
    <DataBoundary>
      <Page />
    </DataBoundary>
  )
  Wrapped.displayName = `withData(${Page.displayName ?? Page.name})`
  return Wrapped
}
