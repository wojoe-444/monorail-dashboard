import { useId } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import type { SemanticEngine } from '@/features/semantic/core/engine.ts'
import type { ManifestMetric, MetricInput } from '@/features/semantic/core/types.ts'
import { useDataset } from '@/features/semantic/data'
import { exploreHref } from '@/features/semantic/views'
import { useUrlParams } from '@/hooks/useUrlParams'
import { dashNavigate } from '@/app/hub'

const CATEGORIES = ['All', 'System', 'Rail', 'Bus', 'Line'] as const

/** Human-readable definition of a metric, from the manifest. */
function definition(m: ManifestMetric, engine: SemanticEngine): string {
  const input = (i: MetricInput) => `${i.alias ? `${i.alias} = ` : ''}${i.name}${i.offsetDays ? ` shifted ${i.offsetDays} days` : ''}${i.filter.length ? ` where ${i.filter.map(cleanFilter).join(' and ')}` : ''}`
  if (m.type === 'simple' && m.measure) {
    const model = engine.manifest.semanticModels.find((sm) => sm.measures.some((x) => x.name === m.measure!.name))
    const measure = model?.measures.find((x) => x.name === m.measure!.name)
    return `${measure?.agg ?? '?'}(${measure?.expr ?? '?'}) from ${model?.table ?? '?'}`
  }
  if (m.type === 'ratio' && m.numerator && m.denominator) return `${input(m.numerator)}\n  ÷ ${input(m.denominator)}`
  return `${m.expr}\n${m.inputs.map((i) => `  ${input(i)}`).join('\n')}`
}

function cleanFilter(f: string): string {
  return f.replace(/\{\{\s*(?:Dimension|Entity)\('([\w]+)'\)\s*\}\}/g, '$1')
}

export function MetricsPage() {
  const { engine } = useDataset()
  const id = useId()
  const [params, setParams] = useUrlParams()
  const category = (CATEGORIES.find((c) => c === params.get('cat')) ?? 'All') as (typeof CATEGORIES)[number]
  const q = params.get('q') ?? ''
  const needle = q.trim().toLowerCase()
  const metrics = engine
    .listMetrics()
    .filter((m) => (category === 'All' || m.category === category) && (!needle || `${m.label} ${m.name} ${m.description}`.toLowerCase().includes(needle)))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Reference"
        title="Metrics"
        description="Every metric in the semantic layer, defined once in semantic/models/semantic/metrics.yml. The dashboard, Explore and MetricFlow all read these definitions."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented aria-label="Category" value={category} onChange={(v) => setParams({ cat: v === 'All' ? null : v })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id={`${id}-q`} aria-label="Search metrics" value={q} onChange={(e) => setParams({ q: e.target.value })} placeholder="Search names and definitions" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground">{metrics.length} metrics</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {metrics.map((m) => {
          const dims = engine.dimensionsFor([m.name]).filter((d) => d.kind === 'dimension')
          return (
            <Card key={m.name} className="gap-3 py-5" id={m.name}>
              <CardHeader className="px-5">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {m.label}
                  <Badge variant="secondary">{m.type}</Badge>
                  <Badge variant="outline">{m.category}</Badge>
                  {m.format === 'percent' && <Badge variant="outline">%</Badge>}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{m.name}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-5">
                <p className="text-sm">{m.description}</p>
                <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {definition(m, engine)}
                  {m.filter.length ? `\nwhere ${m.filter.map(cleanFilter).join(' and ')}` : ''}
                </pre>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground" title={dims.map((d) => d.label).join(', ')}>
                    Splits by {dims.length} dimensions and time
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => dashNavigate(exploreHref({ metrics: [m.name], groupBy: ['metric_time__month'], where: [], range: 'all', chart: 'line' }, m.label))}
                  >
                    <SlidersHorizontal />
                    Explore
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Semantic models</CardTitle>
          <CardDescription>The tables behind the metrics, the entities that join them, and the dimensions you can split by.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {engine.manifest.semanticModels.map((sm) => (
            <div key={sm.name} className="flex flex-col gap-2 rounded-lg border p-4">
              <div>
                <div className="font-mono text-sm font-semibold">{sm.name}</div>
                <div className="text-xs text-muted-foreground">
                  {sm.description} <span className="font-mono">({sm.table})</span>
                </div>
              </div>
              <dl className="flex flex-col gap-1.5 text-xs">
                <div>
                  <dt className="font-medium text-muted-foreground">Entities</dt>
                  <dd className="font-mono">{sm.entities.map((e) => `${e.name} (${e.type})`).join(', ')}</dd>
                </div>
                {sm.dimensions.length > 0 && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Dimensions</dt>
                    <dd className="font-mono">{sm.dimensions.map((d) => d.name).join(', ')}</dd>
                  </div>
                )}
                {sm.measures.length > 0 && (
                  <div>
                    <dt className="font-medium text-muted-foreground">Measures</dt>
                    <dd className="font-mono">{sm.measures.map((x) => `${x.agg}(${x.expr})`).join(', ')}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
