import type { Grain } from './time.ts'

/*
 * The compiled semantic manifest (src/features/semantic/manifest.json), a slim
 * copy of dbt's semantic_manifest.json written by scripts/build-data.mjs.
 */

export interface ManifestEntity {
  name: string
  type: 'primary' | 'foreign' | 'unique' | 'natural'
  expr: string
}

export interface ManifestDimension {
  name: string
  type: 'categorical' | 'time'
  expr: string
  label: string | null
  description: string | null
  grain?: Grain
}

export interface ManifestMeasure {
  name: string
  agg: 'sum' | 'count' | 'count_distinct' | 'min' | 'max' | 'average'
  expr: string
  label: string | null
  description: string | null
  aggTimeDimension: string | null
}

export interface ManifestSemanticModel {
  name: string
  description: string
  table: string
  primaryEntity: string | null
  aggTimeDimension: string | null
  entities: ManifestEntity[]
  dimensions: ManifestDimension[]
  measures: ManifestMeasure[]
}

export interface MetricInput {
  name: string
  alias?: string
  filter: string[]
  offsetDays?: number
}

export type MetricFormat = 'number' | 'percent'

export interface ManifestMetric {
  name: string
  label: string
  description: string
  type: 'simple' | 'ratio' | 'derived'
  filter: string[]
  category: string
  format: MetricFormat
  measure?: { name: string; filter: string[] }
  numerator?: MetricInput | null
  denominator?: MetricInput | null
  expr?: string
  inputs: MetricInput[]
}

export interface SavedQuery {
  name: string
  label: string
  description: string
  metrics: string[]
  groupBy: string[]
  where: string[]
  orderBy?: { key: string; desc: boolean }[]
  limit?: number
  meta: { chart?: string; range?: string; start?: string; end?: string; smooth?: number }
}

export interface SemanticManifest {
  semanticModels: ManifestSemanticModel[]
  metrics: ManifestMetric[]
  savedQueries: SavedQuery[]
}

/*
 * Queries, in MetricFlow's vocabulary. A group-by item is one of:
 *   metric_time__<grain>   e.g. metric_time__week
 *   <entity>__<dimension>  e.g. station__sector, service_day__day_type
 *   <entity>               e.g. station (the id)
 */

export interface QuerySpec {
  metrics: string[]
  groupBy?: string[]
  /** MetricFlow where-filters, ANDed. See filters.ts for the syntax. */
  where?: string[]
  /** Inclusive ISO dates on metric_time. Defaults to the data's full range. */
  timeRange?: { start?: string; end?: string }
  orderBy?: { key: string; desc?: boolean }[]
  limit?: number
}

export type CellValue = string | number | null

export interface ResultColumn {
  key: string
  label: string
  kind: 'time' | 'dimension' | 'entity' | 'metric'
  grain?: Grain
  format?: MetricFormat
  description?: string
  /** Metric values add up across groups (safe to stack or total). */
  additive?: boolean
}

export interface QueryResult {
  columns: ResultColumn[]
  rows: Record<string, CellValue>[]
  /** One line per measure scan, for the Explore page's "how this was computed". */
  plan: string[]
  ms: number
}

export interface DimensionInfo {
  key: string
  label: string
  kind: 'time' | 'dimension' | 'entity'
  description?: string
  grain?: Grain
  /** The semantic model that owns the dimension. */
  model: string
}
