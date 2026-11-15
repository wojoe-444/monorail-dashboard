import type { SemanticEngine } from './core/engine.ts'
import type { TimeWindow } from './ranges'
import type { ViewSpec } from './views'

/** The `mf query` command that answers the same question against the warehouse. */
export function mfCommand(spec: ViewSpec, window: TimeWindow, engine: SemanticEngine): { command: string; note?: string } {
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  const parts = ['mf query', `--metrics ${spec.metrics.join(',')}`]
  if (spec.groupBy.length) parts.push(`--group-by ${spec.groupBy.join(',')}`)
  for (const w of spec.where) parts.push(`--where ${q(w)}`)
  parts.push(`--start-time ${window.start}`, `--end-time ${window.end}`)
  if (spec.orderBy) parts.push(`--order ${spec.orderBy.desc ? '-' : ''}${spec.orderBy.key}`)
  if (spec.limit) parts.push(`--limit ${spec.limit}`)

  const usesOffset = spec.metrics.some((m) => hasOffset(engine, m))
  const hasTime = spec.groupBy.some((g) => g.startsWith('metric_time'))
  const note =
    usesOffset && !hasTime
      ? 'MetricFlow needs metric_time in --group-by for “52 weeks earlier” metrics. Add metric_time__day and sum the rows, or use the base metric with --start-time/--end-time moved back 364 days.'
      : undefined
  return { command: parts.join(' \\\n  '), note }
}

function hasOffset(engine: SemanticEngine, name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const m = engine.metric(name)
  const inputs = [m.numerator, m.denominator, ...m.inputs].filter(Boolean) as { name: string; offsetDays?: number }[]
  return inputs.some((i) => (i.offsetDays ?? 0) !== 0 || hasOffset(engine, i.name, seen))
}

/** A saved_queries.yml entry for promoting a personal view to a team view. */
export function savedQueryYaml(name: string, label: string, description: string, spec: ViewSpec): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'my_view'
  const groupBy = spec.groupBy.map((g) => {
    const t = g.match(/^metric_time__(\w+)$/)
    if (t) return `"TimeDimension('metric_time', '${t[1]}')"`
    return g.includes('__') ? `"Dimension('${g}')"` : `"Entity('${g}')"`
  })
  const lines = [
    `  - name: ${slug}`,
    `    label: ${JSON.stringify(label)}`,
    `    description: ${JSON.stringify(description || label)}`,
    '    query_params:',
    `      metrics: [${spec.metrics.join(', ')}]`,
    `      group_by: [${groupBy.join(', ')}]`,
  ]
  if (spec.where.length) {
    lines.push('      where:')
    for (const w of spec.where) lines.push(`        - ${JSON.stringify(w)}`)
  }
  lines.push('    config:', `      meta: { chart: ${spec.chart === 'stacked' ? 'bar' : spec.chart}, range: ${spec.range === 'custom' ? '1y' : spec.range} }`)
  return lines.join('\n')
}
