import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ViewCard } from '@/features/semantic/components/ViewCard'
import { useDataset } from '@/features/semantic/data'
import { RANGE_PRESETS } from '@/features/semantic/ranges'
import { deleteView, moveView, saveView, setPinned, specFromSavedQuery, useSavedViews, type SavedView } from '@/features/semantic/views'
import { navigate } from '@/lib/router'

export function BoardPage() {
  const { engine } = useDataset()
  const views = useSavedViews()
  const pinned = views.filter((v) => v.pinned)
  const [confirm, setConfirm] = useState<SavedView | null>(null)

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label} onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Analysis"
        title="My board"
        description="Your own dashboard: views you built in Explore or pinned from any chart. Saved in this browser."
        actions={
          <Button onClick={() => navigate('/explore')}>
            <Plus />
            New view
          </Button>
        }
      />

      {pinned.length === 0 ? (
        <Card className="items-start gap-4 px-6">
          <div>
            <div className="font-semibold">Nothing pinned yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pin a chart with its <span className="font-medium">⋯ menu &gt; Pin to My board</span>, save a view in Explore, or start with a team view:
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {engine.manifest.savedQueries.map((q) => (
              <Button key={q.name} size="sm" variant="outline" onClick={() => saveView({ name: q.label, description: q.description, spec: specFromSavedQuery(q), from: q.name, pinned: true })}>
                <Pin />
                {q.label}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {pinned.map((v, i) => (
            <ViewCard
              key={v.id}
              title={v.name}
              description={v.description || undefined}
              view={v.spec}
              height={260}
              controls={
                <span className="flex items-center">
                  {iconButton('Edit in Explore', <Pencil />, () => navigate(`/explore?view=${v.id}`))}
                  {i > 0 && iconButton('Move earlier', <ArrowUp />, () => moveView(v.id, -1))}
                  {i < pinned.length - 1 && iconButton('Move later', <ArrowDown />, () => moveView(v.id, 1))}
                  {iconButton('Unpin', <PinOff />, () => setPinned(v.id, false))}
                </span>
              }
            />
          ))}
        </div>
      )}

      {views.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle>All saved views</CardTitle>
            <CardDescription>Pin a view to show it on the board. Views live in this browser; share one through Explore's saved-query YAML.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {views.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
                  <a href={`#/explore?view=${v.id}`} className="min-w-0 flex-1 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="block truncate text-sm font-medium">{v.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {v.spec.metrics.map((m) => (engine.hasMetric(m) ? engine.metric(m).label : `${m} (removed)`)).join(', ')} ·{' '}
                      {RANGE_PRESETS.find((p) => p.value === v.spec.range)?.long ?? 'Custom range'}
                    </span>
                  </a>
                  {v.from && <Badge variant="info">From team view</Badge>}
                  {v.pinned ? <Badge variant="primary">On board</Badge> : null}
                  <span className="flex items-center">
                    {v.pinned ? iconButton('Unpin', <PinOff />, () => setPinned(v.id, false)) : iconButton('Pin to board', <Pin />, () => setPinned(v.id, true))}
                    {iconButton('Delete', <Trash2 />, () => setConfirm(v))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirm?.name}”?</DialogTitle>
            <DialogDescription>The view is removed from this browser. Team views are not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm) deleteView(confirm.id)
                setConfirm(null)
              }}
            >
              Delete view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
