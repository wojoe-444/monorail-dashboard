/**
 * A MetricFlow-compatible query engine that runs in the browser.
 *
 * It reads the semantic manifest that dbt compiles from semantic/models/semantic/*.yml
 * and answers the same questions `mf query` answers, over the same marts (decoded
 * from the snapshot into columnar tables):
 *
 *   engine.query({ metrics: ['rail_avg_weekday_entries'], groupBy: ['metric_time__month', 'station__sector'] })
 *
 * Supported: simple, ratio and derived metrics; metric and input filters; offset
 * windows in days or weeks; one-hop joins from a measure's model to the model
 * whose primary entity it references; metric_time at day/week/month/quarter/year.
 * scripts/parity.mjs runs a query set through this engine and through MetricFlow
 * on DuckDB and fails if any value differs.
 *
 * One deliberate extension: MetricFlow requires metric_time in the group-by for
 * metrics with an offset window. This engine also allows them over a time range
 * with no metric_time (the offset shifts the range), which is what "this station,
 * last 4 weeks vs the same 4 weeks a year earlier" needs.
 *
 * And one deliberate difference: an offset value is null (not a fraction) for a
 * period whose shifted window starts before the data does. MetricFlow compares
 * December 2019 with the one day of December 2018-January 2019 that exists and
 * reports +6,456%; this engine reports no comparison.
 */
import { evalExpr, identifiers, parseExpr, type ExprNode } from './expr.ts'
import { parseFilter, type FilterCondition } from './filters.ts'
import { NULL_DAY, type CatColumn, type Column, type Table } from './table.ts'
import { dayOfIso, GRAINS, isoOfDay, periodEnd, Truncator, truncDay, type Grain } from './time.ts'
import type {
  CellValue,
  DimensionInfo,
  ManifestMeasure,
  ManifestMetric,
  ManifestSemanticModel,
  QueryResult,
  QuerySpec,
  ResultColumn,
  SemanticManifest,
} from './types.ts'

export class SemanticError extends Error {}

const GRAIN_LABEL: Record<Grain, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' }

/** Resolved group-by or filter target, bound to one semantic model's rows. */
interface Accessor {
  /** Integer code for the row's value, 0 meaning null, below card. */
  code: (row: number) => number
  card: number
  decode: (code: number) => CellValue
}

type Ref =
  | { kind: 'time'; key: string; grain: Grain }
  | { kind: 'dimension'; key: string; entity: string; dimension: string }
  | { kind: 'entity'; key: string; entity: string }

type Values = Map<string, number | null>

interface EvalContext {
  filters: string[]
  offset: number
}

const TIME_BASE = 1_000_000

export class SemanticEngine {
  readonly manifest: SemanticManifest
  readonly minDay: number
  readonly maxDay: number
  private readonly tables: Record<string, Table>
  private readonly models = new Map<string, ManifestSemanticModel>()
  private readonly metrics = new Map<string, ManifestMetric>()
  private readonly measures = new Map<string, { model: ManifestSemanticModel; measure: ManifestMeasure }>()
  private readonly dimensionModelForEntity = new Map<string, ManifestSemanticModel>()
  private readonly joinCache = new Map<string, Int32Array>()
  private readonly catCache = new Map<string, CatColumn>()
  private readonly exprCache = new Map<string, ExprNode>()
  private readonly filterCache = new Map<string, FilterCondition[]>()
  private readonly resultCache = new Map<string, QueryResult>()
  private readonly truncator: Truncator

  constructor(manifest: SemanticManifest, tables: Record<string, Table>, dataRange: { min: number; max: number }) {
    this.manifest = manifest
    this.tables = tables
    this.minDay = dataRange.min
    this.maxDay = dataRange.max
    this.truncator = new Truncator(dataRange.min - 800, dataRange.max + 800)
    for (const m of manifest.semanticModels) {
      this.models.set(m.name, m)
      for (const x of m.measures) this.measures.set(x.name, { model: m, measure: x })
      const primary = m.entities.find((e) => e.type === 'primary' || e.type === 'unique')
      if (primary && m.dimensions.length) this.dimensionModelForEntity.set(primary.name, m)
    }
    for (const m of manifest.metrics) this.metrics.set(m.name, m)
  }

  // ---------------------------------------------------------------- catalog

  listMetrics(): ManifestMetric[] {
    return this.manifest.metrics
  }

  metric(name: string): ManifestMetric {
    const m = this.metrics.get(name)
    if (!m) throw new SemanticError(`Unknown metric "${name}"`)
    return m
  }

  hasMetric(name: string): boolean {
    return this.metrics.has(name)
  }

  /**
   * Whether values of a metric can be added across groups (stacked, totalled):
   * sums and counts, and derived sums of those. Ratios, averages, distinct
   * counts and percentages cannot.
   */
  isAdditive(name: string, seen = new Set<string>()): boolean {
    if (seen.has(name)) return false
    seen.add(name)
    const m = this.metric(name)
    if (m.format === 'percent') return false
    if (m.type === 'simple') {
      const agg = m.measure ? this.measures.get(m.measure.name)?.measure.agg : undefined
      return agg === 'sum' || agg === 'count'
    }
    if (m.type === 'derived' && m.expr && /^[ws+]+$/.test(m.expr)) return m.inputs.every((i) => this.isAdditive(i.name, new Set(seen)))
    return false
  }

  /** Semantic models whose measures a metric reads (walking ratio and derived inputs). */
  modelsOf(metricName: string, seen = new Set<string>()): Set<string> {
    const out = new Set<string>()
    if (seen.has(metricName)) return out
    seen.add(metricName)
    const m = this.metric(metricName)
    if (m.type === 'simple' && m.measure) {
      const found = this.measures.get(m.measure.name)
      if (!found) throw new SemanticError(`Metric "${m.name}" uses unknown measure "${m.measure.name}"`)
      out.add(found.model.name)
    }
    const children = [m.numerator, m.denominator, ...m.inputs].filter(Boolean) as { name: string }[]
    for (const c of children) for (const x of this.modelsOf(c.name, new Set(seen))) out.add(x)
    return out
  }

  /** Every group-by item every given metric can be grouped or filtered by. */
  dimensionsFor(metricNames: string[]): DimensionInfo[] {
    const time: DimensionInfo[] = GRAINS.map((g) => ({
      key: `metric_time__${g}`,
      label: GRAIN_LABEL[g],
      kind: 'time',
      grain: g,
      model: 'metric_time',
    }))
    if (!metricNames.length) return time
    let shared: Map<string, DimensionInfo> | null = null
    for (const name of metricNames) {
      for (const modelName of this.modelsOf(name)) {
        const reach = this.reachable(this.models.get(modelName)!)
        if (!shared) shared = reach
        else for (const k of [...shared.keys()]) if (!reach.has(k)) shared.delete(k)
      }
    }
    return [...time, ...[...(shared ?? new Map()).values()]]
  }

  private reachable(model: ManifestSemanticModel): Map<string, DimensionInfo> {
    const out = new Map<string, DimensionInfo>()
    for (const e of model.entities) {
      const target = e.type === 'foreign' ? this.dimensionModelForEntity.get(e.name) : model.dimensions.length ? model : undefined
      out.set(e.name, { key: e.name, label: titleCase(e.name), kind: 'entity', model: target?.name ?? model.name })
      if (!target) continue
      for (const d of target.dimensions) {
        if (d.type !== 'categorical') continue
        out.set(`${e.name}__${d.name}`, {
          key: `${e.name}__${d.name}`,
          label: d.label ?? titleCase(d.name),
          kind: 'dimension',
          description: d.description ?? undefined,
          model: target.name,
        })
      }
    }
    return out
  }

  /** Distinct values of a dimension or entity, sorted, for filter pickers. */
  dimensionValues(key: string): string[] {
    const ref = this.parseRef(key)
    if (ref.kind === 'time') return []
    const model = this.dimensionModelForEntity.get(ref.entity)
    if (!model) return []
    const table = this.tableOf(model)
    const expr = ref.kind === 'entity' ? model.entities.find((e) => e.name === ref.entity)!.expr : this.dimension(model, ref.dimension).expr
    const col = this.asCat(table, expr)
    const used = new Set<number>()
    for (let r = 0; r < table.rowCount; r++) used.add(col.codes[r])
    return [...used]
      .filter((c) => c >= 0)
      .map((c) => col.dict[c])
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  // ---------------------------------------------------------------- query

  query(spec: QuerySpec): QueryResult {
    const cacheKey = JSON.stringify(spec)
    const hit = this.resultCache.get(cacheKey)
    if (hit) return hit
    const t0 = performance.now()
    if (!spec.metrics.length) throw new SemanticError('Pick at least one metric')
    const refs = (spec.groupBy ?? []).map((k) => this.parseRef(k))
    let start = spec.timeRange?.start ? Math.max(dayOfIso(spec.timeRange.start), this.minDay) : this.minDay
    let end = spec.timeRange?.end ? Math.min(dayOfIso(spec.timeRange.end), this.maxDay) : this.maxDay
    // Like MetricFlow, a time range grouped by metric_time widens to whole periods of the coarsest
    // grain asked for: Aug 15-20 by month means all of August. Callers that want exact days group by day.
    const coarsest = refs.reduce<Grain | null>((g, r) => (r.kind === 'time' && (!g || GRAINS.indexOf(r.grain) > GRAINS.indexOf(g)) ? r.grain : g), null)
    if (coarsest && coarsest !== 'day') {
      start = truncDay(start, coarsest)
      end = periodEnd(truncDay(end, coarsest), coarsest)
    }
    const plan: string[] = []
    const memo = new Map<string, Values>()
    const run = { refs, start, end, where: spec.where ?? [], plan, memo }

    const values = spec.metrics.map((name) => this.evalMetric(name, { filters: [], offset: 0 }, run))
    const keys = new Set<string>()
    for (const v of values) for (const k of v.keys()) keys.add(k)

    const columns: ResultColumn[] = [
      ...refs.map((r) => this.refColumn(r)),
      ...spec.metrics.map((name) => {
        const m = this.metric(name)
        return { key: name, label: m.label, kind: 'metric' as const, format: m.format, description: m.description, additive: this.isAdditive(name) }
      }),
    ]
    let rows = [...keys].map((k) => {
      const parts = k === '' ? [] : (JSON.parse(k) as CellValue[])
      const row: Record<string, CellValue> = {}
      refs.forEach((r, i) => (row[r.key] = r.kind === 'time' && typeof parts[i] === 'number' ? isoOfDay(parts[i] as number) : parts[i]))
      spec.metrics.forEach((name, i) => (row[name] = values[i].get(k) ?? null))
      return row
    })

    const order = spec.orderBy?.length
      ? spec.orderBy
      : refs.some((r) => r.kind === 'time')
        ? refs.filter((r) => r.kind === 'time').map((r) => ({ key: r.key, desc: false }))
        : [{ key: spec.metrics[0], desc: true }]
    rows.sort((a, b) => {
      for (const o of order) {
        const x = a[o.key]
        const y = b[o.key]
        // Nulls sort last in either direction, so a top-N never spends a slot on a row with no value.
        if (x === null && y !== null) return 1
        if (y === null && x !== null) return -1
        const c = compare(x, y)
        if (c) return o.desc ? -c : c
      }
      return 0
    })
    if (spec.limit) rows = rows.slice(0, spec.limit)

    const result: QueryResult = { columns, rows, plan, ms: performance.now() - t0 }
    if (this.resultCache.size > 300) this.resultCache.delete(this.resultCache.keys().next().value!)
    this.resultCache.set(cacheKey, result)
    return result
  }

  private evalMetric(
    name: string,
    ctx: EvalContext,
    run: { refs: Ref[]; start: number; end: number; where: string[]; plan: string[]; memo: Map<string, Values> },
  ): Values {
    const m = this.metric(name)
    const filters = [...ctx.filters, ...m.filter]
    const memoKey = `${name}|${[...filters].sort().join('&')}|${ctx.offset}`
    const cached = run.memo.get(memoKey)
    if (cached) return cached

    let out: Values
    if (m.type === 'simple') {
      if (!m.measure) throw new SemanticError(`Simple metric "${name}" has no measure`)
      out = this.scan(m.measure.name, [...filters, ...m.measure.filter], ctx.offset, run, name)
    } else if (m.type === 'ratio') {
      if (!m.numerator || !m.denominator) throw new SemanticError(`Ratio metric "${name}" needs a numerator and denominator`)
      const num = this.evalMetric(m.numerator.name, { filters: [...filters, ...m.numerator.filter], offset: ctx.offset + (m.numerator.offsetDays ?? 0) }, run)
      const den = this.evalMetric(m.denominator.name, { filters: [...filters, ...m.denominator.filter], offset: ctx.offset + (m.denominator.offsetDays ?? 0) }, run)
      out = new Map()
      for (const k of new Set([...num.keys(), ...den.keys()])) {
        const n = num.get(k) ?? null
        const d = den.get(k) ?? null
        out.set(k, n === null || d === null || d === 0 ? null : n / d)
      }
    } else {
      if (!m.expr) throw new SemanticError(`Derived metric "${name}" has no expr`)
      let node = this.exprCache.get(m.expr)
      if (!node) {
        node = parseExpr(m.expr)
        this.exprCache.set(m.expr, node)
      }
      const env = new Map<string, Values>()
      for (const input of m.inputs) {
        env.set(input.alias ?? input.name, this.evalMetric(input.name, { filters: [...filters, ...input.filter], offset: ctx.offset + (input.offsetDays ?? 0) }, run))
      }
      for (const id of identifiers(node)) if (!env.has(id)) throw new SemanticError(`Derived metric "${name}" references "${id}", which is not one of its inputs`)
      out = new Map()
      const keys = new Set<string>()
      for (const v of env.values()) for (const k of v.keys()) keys.add(k)
      for (const k of keys) out.set(k, evalExpr(node, (id) => env.get(id)!.get(k) ?? null))
    }
    run.memo.set(memoKey, out)
    return out
  }

  /** Aggregate one measure over its model's rows: the only place rows are touched. */
  private scan(
    measureName: string,
    filterStrings: string[],
    offset: number,
    run: { refs: Ref[]; start: number; end: number; where: string[]; plan: string[] },
    metricName: string,
  ): Values {
    const found = this.measures.get(measureName)
    if (!found) throw new SemanticError(`Unknown measure "${measureName}"`)
    const { model, measure } = found
    const table = this.tableOf(model)
    const timeDimName = measure.aggTimeDimension ?? model.aggTimeDimension
    if (!timeDimName) throw new SemanticError(`Measure "${measureName}" has no agg_time_dimension`)
    const timeCol = this.column(table, this.dimension(model, timeDimName).expr)
    if (timeCol.kind !== 'date') throw new SemanticError(`${model.name}.${timeDimName} is not a date column`)
    const days = timeCol.data

    const accessors = run.refs.map((r) => this.accessor(model, r, offset, metricName))
    const conditions = [...run.where, ...filterStrings].flatMap((f) => this.parseFilterCached(f))
    const tests = conditions.map((c) => this.conditionTest(model, c, metricName))

    // Mixed-radix composite key, so grouping never builds strings per row.
    const radix: number[] = []
    let stride = 1
    for (let i = accessors.length - 1; i >= 0; i--) {
      radix[i] = stride
      stride *= accessors[i].card
    }
    if (stride > Number.MAX_SAFE_INTEGER) throw new SemanticError('Too many group-by items in one query; remove one')

    const value = this.measureReader(table, measure)
    const groups = new Map<number, { sum: number; n: number; set?: Set<number> }>()
    const distinct = measure.agg === 'count_distinct'
    const lo = run.start - offset
    const hi = run.end - offset
    let scanned = 0
    for (let row = 0; row < table.rowCount; row++) {
      const d = days[row]
      if (d === NULL_DAY || d < lo || d > hi) continue
      let pass = true
      for (const t of tests)
        if (!t(row)) {
          pass = false
          break
        }
      if (!pass) continue
      const v = value(row)
      if (Number.isNaN(v)) continue
      let key = 0
      for (let i = 0; i < accessors.length; i++) key += accessors[i].code(row) * radix[i]
      let g = groups.get(key)
      if (!g) {
        g = { sum: 0, n: 0, set: distinct ? new Set() : undefined }
        if (measure.agg === 'min') g.sum = Infinity
        if (measure.agg === 'max') g.sum = -Infinity
        groups.set(key, g)
      }
      scanned++
      if (distinct) g.set!.add(v)
      else if (measure.agg === 'min') g.sum = Math.min(g.sum, v)
      else if (measure.agg === 'max') g.sum = Math.max(g.sum, v)
      else g.sum += v
      g.n++
    }

    const out: Values = new Map()
    const timeIndex = run.refs.findIndex((r) => r.kind === 'time')
    // An offset that reaches back before the data would compare against a fragment of a period.
    const truncated = offset > 0 && timeIndex < 0 && run.start - offset < this.minDay
    for (const [key, g] of groups) {
      if (truncated) break
      const parts: CellValue[] = []
      let rest = key
      for (let i = 0; i < accessors.length; i++) {
        const code = Math.floor(rest / radix[i])
        rest -= code * radix[i]
        parts.push(accessors[i].decode(code))
      }
      if (offset > 0 && timeIndex >= 0 && (parts[timeIndex] as number) - offset < this.minDay) continue
      const v =
        measure.agg === 'count_distinct' ? g.set!.size : measure.agg === 'count' ? g.n : measure.agg === 'average' ? g.sum / g.n : g.sum
      out.set(parts.length ? JSON.stringify(parts) : '', v)
    }
    const filterText = conditions.length ? ` where ${conditions.map((c) => `${c.ref} ${c.op} ${c.values.join('|')}`).join(' and ')}` : ''
    run.plan.push(
      `${metricName}: ${measure.agg}(${measure.expr}) from ${model.table}${filterText}${offset ? `, shifted ${offset} days` : ''} -> ${scanned.toLocaleString()} rows, ${out.size} groups`,
    )
    return out
  }

  // ---------------------------------------------------------------- resolution

  private parseRef(key: string): Ref {
    const time = key.match(/^metric_time__(day|week|month|quarter|year)$/)
    if (time) return { kind: 'time', key, grain: time[1] as Grain }
    if (key === 'metric_time') return { kind: 'time', key, grain: 'day' }
    const i = key.indexOf('__')
    if (i < 0) return { kind: 'entity', key, entity: key }
    return { kind: 'dimension', key, entity: key.slice(0, i), dimension: key.slice(i + 2) }
  }

  private refColumn(r: Ref): ResultColumn {
    if (r.kind === 'time') return { key: r.key, label: GRAIN_LABEL[r.grain], kind: 'time', grain: r.grain }
    if (r.kind === 'entity') return { key: r.key, label: titleCase(r.entity), kind: 'entity' }
    const model = this.dimensionModelForEntity.get(r.entity)
    const d = model?.dimensions.find((x) => x.name === r.dimension)
    return { key: r.key, label: d?.label ?? titleCase(r.dimension), kind: 'dimension', description: d?.description ?? undefined }
  }

  private accessor(model: ManifestSemanticModel, ref: Ref, offset: number, metricName: string): Accessor {
    const table = this.tableOf(model)
    if (ref.kind === 'time') {
      const days = (this.column(table, this.dimension(model, model.aggTimeDimension!).expr) as { data: Int32Array }).data
      const trunc = this.truncator.fn(ref.grain)
      return { code: (row) => trunc(days[row] + offset) + TIME_BASE, card: 2 * TIME_BASE, decode: (c) => c - TIME_BASE }
    }
    const entity = model.entities.find((e) => e.name === ref.entity)
    if (!entity) throw new SemanticError(`${labelOf(ref.key)} is not available for ${metricName} (no "${ref.entity}" in ${model.name})`)

    if (ref.kind === 'entity') {
      const col = this.asCat(table, entity.expr)
      return { code: (row) => col.codes[row] + 1, card: col.dict.length + 1, decode: (c) => (c === 0 ? null : col.dict[c - 1]) }
    }

    const local = entity.type !== 'foreign' && model.dimensions.some((d) => d.name === ref.dimension)
    const target = local ? model : this.dimensionModelForEntity.get(ref.entity)
    if (!target || !target.dimensions.some((d) => d.name === ref.dimension))
      throw new SemanticError(`Unknown dimension "${ref.key}"`)
    const dimCol = this.asCat(this.tableOf(target), this.dimension(target, ref.dimension).expr)
    if (local) return { code: (row) => dimCol.codes[row] + 1, card: dimCol.dict.length + 1, decode: (c) => (c === 0 ? null : dimCol.dict[c - 1]) }
    const join = this.joinIndex(model, entity.name, entity.expr, target)
    return {
      code: (row) => {
        const j = join[row]
        return j < 0 ? 0 : dimCol.codes[j] + 1
      },
      card: dimCol.dict.length + 1,
      decode: (c) => (c === 0 ? null : dimCol.dict[c - 1]),
    }
  }

  private conditionTest(model: ManifestSemanticModel, c: FilterCondition, metricName: string): (row: number) => boolean {
    const ref = this.parseRef(c.ref)
    if (ref.kind === 'time') throw new SemanticError('Filter metric_time with the time range, not a where-filter')
    const acc = this.accessor(model, ref, 0, metricName)
    const wanted = new Set(c.values)
    const memo = new Map<number, boolean>()
    const positive = c.op === '=' || c.op === 'in'
    return (row) => {
      const code = acc.code(row)
      let ok = memo.get(code)
      if (ok === undefined) {
        const v = acc.decode(code)
        const hit = v !== null && wanted.has(String(v))
        // SQL semantics: NULL never matches = / != / IN / NOT IN.
        ok = v !== null && (positive ? hit : !hit)
        memo.set(code, ok)
      }
      return ok
    }
  }

  private parseFilterCached(f: string): FilterCondition[] {
    let c = this.filterCache.get(f)
    if (!c) {
      c = parseFilter(f)
      this.filterCache.set(f, c)
    }
    return c
  }

  private joinIndex(from: ManifestSemanticModel, entity: string, expr: string, to: ManifestSemanticModel): Int32Array {
    const cacheKey = `${from.name}.${entity}->${to.name}`
    const cached = this.joinCache.get(cacheKey)
    if (cached) return cached
    const toTable = this.tableOf(to)
    const toExpr = to.entities.find((e) => e.name === entity && (e.type === 'primary' || e.type === 'unique'))!.expr
    const toCol = this.column(toTable, toExpr)
    const lookup = new Map<string, number>()
    for (let r = 0; r < toTable.rowCount; r++) {
      const k = keyOf(toCol, r)
      if (k !== null) lookup.set(k, r)
    }
    const fromTable = this.tableOf(from)
    const fromCol = this.column(fromTable, expr)
    const out = new Int32Array(fromTable.rowCount)
    if (fromCol.kind === 'cat') {
      const byCode = fromCol.dict.map((v) => lookup.get(v) ?? -1)
      for (let r = 0; r < fromTable.rowCount; r++) out[r] = fromCol.codes[r] < 0 ? -1 : byCode[fromCol.codes[r]]
    } else {
      for (let r = 0; r < fromTable.rowCount; r++) {
        const k = keyOf(fromCol, r)
        out[r] = k === null ? -1 : (lookup.get(k) ?? -1)
      }
    }
    this.joinCache.set(cacheKey, out)
    return out
  }

  private measureReader(table: Table, measure: ManifestMeasure): (row: number) => number {
    const col = this.column(table, measure.expr)
    if (col.kind === 'num') return (r) => col.data[r]
    if (col.kind === 'date') return (r) => (col.data[r] === NULL_DAY ? Number.NaN : col.data[r])
    if (measure.agg === 'count' || measure.agg === 'count_distinct') return (r) => (col.codes[r] < 0 ? Number.NaN : col.codes[r])
    throw new SemanticError(`Measure "${measure.name}" aggregates a text column with ${measure.agg}`)
  }

  private tableOf(model: ManifestSemanticModel): Table {
    const t = this.tables[model.table]
    if (!t) throw new SemanticError(`Table ${model.table} (semantic model ${model.name}) is not loaded`)
    return t
  }

  private column(table: Table, name: string): Column {
    const c = table.columns[name]
    if (!c) throw new SemanticError(`Column ${table.name}.${name} not found`)
    return c
  }

  private dimension(model: ManifestSemanticModel, name: string) {
    const d = model.dimensions.find((x) => x.name === name)
    if (!d) throw new SemanticError(`Dimension ${name} not found in ${model.name}`)
    return d
  }

  /** Any column as a dictionary column (numbers and dates get a dictionary of their distinct values). */
  private asCat(table: Table, name: string): CatColumn {
    const col = this.column(table, name)
    if (col.kind === 'cat') return col
    const cacheKey = `${table.name}.${name}`
    const cached = this.catCache.get(cacheKey)
    if (cached) return cached
    const distinct = new Map<string, number>()
    const raw: (string | null)[] = []
    for (let r = 0; r < table.rowCount; r++) {
      const k = col.kind === 'date' ? (col.data[r] === NULL_DAY ? null : isoOfDay(col.data[r])) : Number.isNaN(col.data[r]) ? null : String(col.data[r])
      raw.push(k)
      if (k !== null && !distinct.has(k)) distinct.set(k, 0)
    }
    const dict = [...distinct.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    dict.forEach((v, i) => distinct.set(v, i))
    const codes = new Int32Array(table.rowCount)
    raw.forEach((k, i) => (codes[i] = k === null ? -1 : distinct.get(k)!))
    const out: CatColumn = { kind: 'cat', codes, dict }
    this.catCache.set(cacheKey, out)
    return out
  }
}

function keyOf(col: Column, row: number): string | null {
  if (col.kind === 'cat') return col.codes[row] < 0 ? null : col.dict[col.codes[row]]
  if (col.kind === 'date') return col.data[row] === NULL_DAY ? null : `d${col.data[row]}`
  return Number.isNaN(col.data[row]) ? null : String(col.data[row])
}

function compare(a: CellValue, b: CellValue): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function titleCase(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function labelOf(key: string): string {
  return `"${key}"`
}
