import { useState } from 'react'
import { Check, ChevronDown, Copy, Download, Link2, RotateCcw, Save, Users } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/ui/native-select'
import { Segmented } from '@/components/ui/segmented'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RangeControl } from '@/features/semantic/components/RangeControl'
import { ResultChart } from '@/features/semantic/components/ResultChart'
import { ResultTable } from '@/features/semantic/components/ResultTable'
import type { SemanticEngine } from '@/features/semantic/core/engine.ts'
import { downloadCsv } from '@/features/semantic/csv'
import { useDataset } from '@/features/semantic/data'
import { FilterEditor } from '@/features/semantic/explore/FilterEditor'
import { GroupByPicker } from '@/features/semantic/explore/GroupByPicker'
import { MetricPicker } from '@/features/semantic/explore/MetricPicker'
import { SaveViewDialog } from '@/features/semantic/explore/SaveViewDialog'
import { formatRange } from '@/features/semantic/format'
import { mfCommand, savedQueryYaml } from '@/features/semantic/mf'
import { resolveRange } from '@/features/semantic/ranges'
import { useQuery } from '@/features/semantic/useQuery'
import { decodeSpec, encodeSpec, exploreHref, getView, saveView, specFromSavedQuery, useSavedViews, type ChartKind, type ViewSpec } from '@/features/semantic/views'
import { useUrlParams } from '@/hooks/useUrlParams'
import { navigate } from '@/lib/router'

const DEFAULT_SPEC: ViewSpec = { metrics: ['rail_avg_weekday_entries', 'bus_avg_weekday_boardings'], groupBy: ['metric_time__week'], where: [], range: '1y', chart: 'line' }

export function ExplorePage() {
  const ds = useDataset()
  const { engine, minDay, maxDay } = ds
  const [params, setParams] = useUrlParams()
  const views = useSavedViews()
  const [saveOpen, setSaveOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const viewId = params.get('view')
  const savedName = params.get('saved')
  const saved = viewId ? getView(viewId) : undefined
  const missingView = !!viewId && !saved
  const team = savedName ? engine.manifest.savedQueries.find((q) => q.name === savedName) : undefined
  const base: ViewSpec = saved?.spec ?? (team ? specFromSavedQuery(team) : DEFAULT_SPEC)
  const fromUrl = decodeSpec(params.get('q'))
  // Drop metrics the manifest no longer has (a view saved before a metric was renamed).
  const spec: ViewSpec = (() => {
    const s = fromUrl ?? base
    return { ...s, metrics: s.metrics.filter((m) => engine.hasMetric(m)) }
  })()
  const dirty = !!fromUrl && JSON.stringify(fromUrl) !== JSON.stringify(base)
  const title = params.get('name') ?? saved?.name ?? team?.label ?? autoTitle(spec, engine)

  const set = (patch: Partial<ViewSpec>) => setParams({ q: encodeSpec({ ...spec, ...patch }) })
  const window = resolveRange(spec.range, minDay, maxDay, spec.custom)
  const hasTime = spec.groupBy.some((g) => g.startsWith('metric_time'))
  const grain = spec.groupBy.find((g) => g.startsWith('metric_time'))?.split('__')[1]
  // Without time, rows rank by the chosen metric (default: the first, largest first).
  const sortKey = spec.orderBy && spec.metrics.includes(spec.orderBy.key) ? spec.orderBy.key : spec.metrics[0]
  const stackable = spec.metrics.length > 0 && spec.metrics.every((m) => engine.isAdditive(m))
  const { result, error } = useQuery(
    spec.metrics.length
      ? {
          metrics: spec.metrics,
          groupBy: spec.groupBy,
          where: spec.where,
          timeRange: window,
          limit: !hasTime ? spec.limit : undefined,
          orderBy: !hasTime && sortKey ? [{ key: sortKey, desc: spec.orderBy?.desc ?? true }] : undefined,
        }
      : null,
  )
  const mf = mfCommand(spec, window, engine)
  const yaml = savedQueryYaml(title, title, saved?.description ?? team?.description ?? '', spec)

  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1500)
  }

  const open = (next: { q?: string | null; view?: string | null; saved?: string | null }) =>
    navigate(`/explore?${new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1])).toString()}`)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Analysis"
        title="Explore"
        description="Ask any question the semantic layer can answer: pick metrics, split them, filter, and save the view. The same definitions run in dbt and MetricFlow."
        actions={
          <>
            <Button variant="outline" onClick={() => copy('link', `${globalThis.location.href.split('#')[0]}#${exploreHref(spec, title)}`)}>
              {copied === 'link' ? <Check /> : <Link2 />}
              Copy link
            </Button>
            <Button onClick={() => setSaveOpen(true)} disabled={!spec.metrics.length}>
              <Save />
              {saved && dirty ? 'Save changes' : saved ? 'Saved' : 'Save view'}
            </Button>
          </>
        }
      />

      {missingView && (
        <div role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          This link points to a view saved in someone else's browser, so it can't open here. Ask for a fresh link (Copy link now shares the whole view), or start from a team view below.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          Team views
        </span>
        {engine.manifest.savedQueries.map((q) => (
          <Button key={q.name} size="sm" variant={savedName === q.name && !dirty ? 'soft' : 'outline'} title={q.description} onClick={() => open({ saved: q.name })}>
            {q.label}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              My views ({views.length})
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved in this browser</DropdownMenuLabel>
            {views.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No saved views yet.</div>}
            {views.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => open({ view: v.id })}>
                <span className="truncate">{v.name}</span>
                {v.pinned && (
                  <Badge variant="primary" className="ml-auto">
                    Board
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/board')}>Manage on My board</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="gap-5 self-start py-5">
          <Section title="Metrics" hint={`${spec.metrics.length} selected`}>
            <MetricPicker selected={spec.metrics} onChange={(metrics) => set({ metrics })} requires={[...spec.groupBy, ...whereRefs(spec.where)]} />
          </Section>
          <Section title="Group by">
            <GroupByPicker metrics={spec.metrics} groupBy={spec.groupBy} onChange={(groupBy) => set({ groupBy, chart: !groupBy.some((g) => g.startsWith('metric_time')) && spec.chart !== 'table' ? 'bar' : spec.chart })} />
          </Section>
          <Section title="Filters" hint={spec.where.length ? `${spec.where.length} active` : undefined}>
            <FilterEditor key={spec.where.join('|')} metrics={spec.metrics} where={spec.where} onChange={(where) => set({ where })} />
          </Section>
          <Section title="Display">
            <div className="flex flex-col gap-3">
              <Segmented
                aria-label="Chart type"
                value={spec.chart}
                onChange={(chart: ChartKind) => set({ chart })}
                options={[
                  { value: 'line', label: 'Line', disabled: !hasTime },
                  { value: 'bar', label: 'Bar' },
                  { value: 'stacked', label: 'Stacked', disabled: !hasTime || !stackable, title: stackable ? undefined : 'Averages, ratios and shares do not add up' },
                  { value: 'table', label: 'Table' },
                ]}
                className="w-full justify-between"
              />
              {grain === 'day' && spec.chart === 'line' && (
                <NativeSelect aria-label="Smoothing" value={String(spec.smooth ?? 0)} onChange={(e) => set({ smooth: Number(e.target.value) || undefined })}>
                  <option value="0">No smoothing</option>
                  <option value="7">7-day average</option>
                  <option value="28">28-day average</option>
                </NativeSelect>
              )}
              {!hasTime && sortKey && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <NativeSelect aria-label="Sort by" value={sortKey} onChange={(e) => set({ orderBy: { key: e.target.value, desc: spec.orderBy?.desc ?? true } })}>
                    {spec.metrics.map((m) => (
                      <option key={m} value={m}>
                        Sort by {engine.metric(m).label}
                      </option>
                    ))}
                  </NativeSelect>
                  <Segmented
                    aria-label="Sort direction"
                    value={spec.orderBy?.desc === false ? 'asc' : 'desc'}
                    onChange={(v) => set({ orderBy: { key: sortKey, desc: v === 'desc' } })}
                    options={[
                      { value: 'desc', label: 'High', title: 'Largest first' },
                      { value: 'asc', label: 'Low', title: 'Smallest first (e.g. the biggest declines)' },
                    ]}
                  />
                </div>
              )}
              {!hasTime && (
                <NativeSelect aria-label="Rows" value={String(spec.limit ?? 0)} onChange={(e) => set({ limit: Number(e.target.value) || undefined })}>
                  <option value="10">Top 10</option>
                  <option value="25">Top 25</option>
                  <option value="50">Top 50</option>
                  <option value="0">All rows</option>
                </NativeSelect>
              )}
            </div>
          </Section>
          {(dirty || fromUrl) && (
            <div className="px-6">
              <Button variant="ghost" size="sm" onClick={() => setParams({ q: null, name: null })}>
                <RotateCcw />
                {saved || team ? 'Revert to saved' : 'Reset'}
              </Button>
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {title}
                {team && !dirty && <Badge variant="info">Team view</Badge>}
                {saved && !dirty && <Badge variant="primary">My view</Badge>}
                {dirty && <Badge variant="warning">Unsaved changes</Badge>}
              </CardTitle>
              <CardDescription>{saved?.description ?? team?.description ?? formatRange(window.start, window.end)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <RangeControl value={spec.range} custom={spec.custom} onChange={(range, custom) => set({ range, custom })} />
              {!spec.metrics.length ? (
                <Empty>Pick a metric on the left to start.</Empty>
              ) : error ? (
                <div className="rounded-lg bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground">{error}</div>
              ) : result ? (
                <ResultChart result={result} chart={spec.chart} smooth={spec.smooth} height={360} title={title} />
              ) : null}
            </CardContent>
          </Card>

          {result && (
            <Card className="gap-3 py-4">
              <Tabs defaultValue="table" className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4">
                  <TabsList>
                    <TabsTrigger value="table">Data</TabsTrigger>
                    <TabsTrigger value="mf">mf query</TabsTrigger>
                    <TabsTrigger value="plan">How it ran</TabsTrigger>
                    <TabsTrigger value="yaml">Share with the team</TabsTrigger>
                  </TabsList>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {result.rows.length.toLocaleString()} rows · {result.ms.toFixed(0)} ms in the browser
                  </span>
                </div>
                <TabsContent value="table" className="flex flex-col gap-2 px-2">
                  <div className="px-2">
                    <Button size="sm" variant="outline" onClick={() => downloadCsv(result, title)}>
                      <Download />
                      Download CSV
                    </Button>
                  </div>
                  <ResultTable result={result} caption={title} signed={result.columns.filter((c) => /_yoy$/.test(c.key)).map((c) => c.key)} />
                </TabsContent>
                <TabsContent value="mf" className="flex flex-col gap-2 px-4">
                  <p className="text-sm text-muted-foreground">The same question against the DuckDB warehouse, from the semantic/ folder:</p>
                  <CodeBlock text={mf.command} onCopy={() => copy('mf', mf.command)} copied={copied === 'mf'} />
                  {mf.note && <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">{mf.note}</p>}
                </TabsContent>
                <TabsContent value="plan" className="flex flex-col gap-2 px-4">
                  <p className="text-sm text-muted-foreground">One scan per measure; ratio and derived metrics combine the scans by group.</p>
                  <CodeBlock text={result.plan.join('\n')} onCopy={() => copy('plan', result.plan.join('\n'))} copied={copied === 'plan'} />
                </TabsContent>
                <TabsContent value="yaml" className="flex flex-col gap-2 px-4">
                  <p className="text-sm text-muted-foreground">
                    To make this a team view, add it to <code className="font-mono text-xs">semantic/models/semantic/saved_queries.yml</code> in a pull request. After
                    <code className="mx-1 font-mono text-xs">npm run data:build</code> it shows under Team views for everyone.
                  </p>
                  <CodeBlock text={yaml} onCopy={() => copy('yaml', yaml)} copied={copied === 'yaml'} />
                  {mf.note && (
                    <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
                      As written, this view will not run as a MetricFlow saved query: {mf.note}
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          )}
        </div>
      </div>

      <SaveViewDialog
        key={`${saveOpen}-${viewId}`}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        initialName={title}
        initialDescription={saved?.description ?? team?.description}
        initialPinned={saved?.pinned ?? true}
        existing={!!saved}
        onSave={({ name, description, pinned, asNew }) => {
          const v = saveView({ id: asNew ? undefined : saved?.id, name, description, spec, pinned, from: team?.name ?? saved?.from })
          open({ view: v.id })
        }}
      />
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function CodeBlock({ text, onCopy, copied }: { text: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 font-mono text-xs leading-relaxed">{text}</pre>
      <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 size-8" aria-label="Copy" onClick={onCopy}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">{children}</div>
}

function whereRefs(where: string[]): string[] {
  return where.flatMap((w) => [...w.matchAll(/(?:Dimension|Entity)\('([\w]+)'\)/g)].map((m) => m[1]))
}

function autoTitle(spec: ViewSpec, engine: SemanticEngine): string {
  if (!spec.metrics.length) return 'New view'
  const dims = engine.dimensionsFor(spec.metrics)
  const by = spec.groupBy.map((g) => (dims.find((d) => d.key === g)?.label ?? g).toLowerCase()).join(' and ')
  const m = spec.metrics.length > 2 ? `${spec.metrics.length} metrics` : spec.metrics.map((x) => engine.metric(x).label).join(' and ')
  return `${m}${by ? ` by ${by}` : ''}`
}
