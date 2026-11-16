#!/usr/bin/env node
/**
 * Step 2 of the data pipeline (step 1 is scripts/fetch-cta.mjs):
 *
 *   1. dbt build                       models + tests in semantic/ (DuckDB)
 *   2. dbt run-operation export_snapshot   marts -> semantic/target/export/*.csv
 *   3. pack the marts into public/data/cta/*.json (columnar, compact)
 *   4. compile semantic/target/semantic_manifest.json -> src/features/semantic/manifest.json
 *
 *   node scripts/build-data.mjs             # all steps (needs dbt-metricflow[dbt-duckdb])
 *   node scripts/build-data.mjs --skip-dbt  # repack from the last export only
 *
 * Install the toolchain once: uv tool install "dbt-metricflow[dbt-duckdb]" --with-executables-from dbt-core
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEMANTIC = join(ROOT, 'semantic')
const EXPORT = join(SEMANTIC, 'target', 'export')
const OUT = join(ROOT, 'public', 'data', 'cta')
const MANIFEST_OUT = join(ROOT, 'src', 'features', 'semantic', 'manifest.json')
const skipDbt = process.argv.includes('--skip-dbt')

// Column types for each exported mart. The browser loader decodes by these.
const TABLES = {
  dim_stations: {
    station_id: 'string', station_name: 'string', ada_accessible: 'bool', latitude: 'float', longitude: 'float',
    sector: 'string', lines: 'string', line_count: 'int', is_transfer_station: 'bool', platform_count: 'int',
    in_stops_list: 'bool', first_ride_date: 'date', last_ride_date: 'date',
  },
  dim_lines: { line_id: 'string', line_name: 'string', color_hex: 'string', sort_order: 'int', station_count: 'int' },
  bridge_station_lines: { station_id: 'string', line_id: 'string', line_count: 'int', allocation_weight: 'double' },
  dim_bus_routes: {
    route_id: 'string', route_name: 'string', route_type: 'string', in_routes_list: 'bool', first_ride_date: 'date', last_ride_date: 'date',
  },
  dim_service_days: {
    ride_date: 'date', day_type: 'string', is_holiday: 'bool', day_of_week: 'string', iso_day_of_week: 'int', is_weekend: 'bool',
  },
  fct_rail_station_entries: { station_id: 'string', ride_date: 'date', rides: 'int' },
  fct_bus_route_rides: { route_id: 'string', ride_date: 'date', rides: 'int' },
  dq_source_checks: { mode: 'string', check_name: 'string', description: 'string', affected_rows: 'int' },
}
// Facts are sorted so ids run-length encode and dates delta encode well.
const SORT = { fct_rail_station_entries: ['station_id', 'ride_date'], fct_bus_route_rides: ['route_id', 'ride_date'] }

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { cwd: SEMANTIC, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } })
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const DAY = 86_400_000
const toDay = (iso) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY)

function encodeColumn(type, raw) {
  if (type === 'string') {
    const dict = []
    const index = new Map()
    const codes = raw.map((v) => {
      if (v === '') return -1
      let c = index.get(v)
      if (c === undefined) {
        c = dict.length
        dict.push(v)
        index.set(v, c)
      }
      return c
    })
    // Run-length encode when it pays off (sorted id columns).
    const runs = []
    for (let i = 0; i < codes.length; i++) {
      if (runs.length && runs[runs.length - 2] === codes[i]) runs[runs.length - 1]++
      else runs.push(codes[i], 1)
    }
    return runs.length < codes.length / 2 ? { type, dict, rle: runs } : { type, dict, codes }
  }
  if (type === 'bool') return { type, data: raw.map((v) => (v === '' ? null : v === 'true' ? 1 : 0)) }
  if (type === 'date') {
    const days = raw.map((v) => (v === '' ? null : toDay(v)))
    const sortedish = days.every((d) => d !== null)
    if (!sortedish) return { type, data: days }
    const delta = days.map((d, i) => (i === 0 ? d : d - days[i - 1]))
    return { type, delta }
  }
  if (type === 'int') return { type, data: raw.map((v) => (v === '' ? null : Number.parseInt(v, 10))) }
  // 'double' keeps full precision (weights like 1/3 must match the warehouse exactly); 'float' rounds to 6 places.
  if (type === 'double') return { type: 'float', data: raw.map((v) => (v === '' ? null : Number.parseFloat(v))) }
  return { type, data: raw.map((v) => (v === '' ? null : Math.round(Number.parseFloat(v) * 1e6) / 1e6)) }
}

async function packTable(name, schema) {
  const [header, ...rows] = parseCsv(await readFile(join(EXPORT, `${name}.csv`), 'utf8')).filter((r) => r.length > 1 || r[0] !== '')
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  for (const col of Object.keys(schema)) if (!(col in idx)) throw new Error(`${name}: missing column ${col}`)
  if (SORT[name]) {
    const [a, b] = SORT[name].map((c) => idx[c])
    rows.sort((x, y) => (x[a] < y[a] ? -1 : x[a] > y[a] ? 1 : x[b] < y[b] ? -1 : x[b] > y[b] ? 1 : 0))
  }
  const columns = {}
  for (const [col, type] of Object.entries(schema)) columns[col] = encodeColumn(type, rows.map((r) => r[idx[col]]))
  const json = JSON.stringify({ table: name, rows: rows.length, columns })
  await writeFile(join(OUT, `${name}.json`), json)
  console.log(`  ${name}: ${rows.length.toLocaleString()} rows, ${(json.length / 1024).toFixed(0)} KB`)
  return rows.length
}

/** Pull "TimeDimension('metric_time', 'month')" / "Dimension('line__line_name')" into query-spec strings. */
function groupByItem(s) {
  const time = s.match(/TimeDimension\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/)
  if (time) return `${time[1]}__${time[2]}`
  const dim = s.match(/(?:Dimension|Entity)\(\s*'([^']+)'\s*\)/)
  if (dim) return dim[1]
  return s
}

function compileManifest(sm, savedQueryMeta = {}) {
  const filterOf = (f) => (f?.where_filters ?? []).map((w) => w.where_sql_template)
  const input = (i) =>
    i && {
      name: i.name,
      alias: i.alias ?? undefined,
      filter: filterOf(i.filter),
      offsetDays: i.offset_window ? windowDays(i.offset_window) : undefined,
    }
  return {
    generatedFrom: 'semantic/target/semantic_manifest.json',
    semanticModels: sm.semantic_models.map((m) => ({
      name: m.name,
      description: m.description ?? '',
      table: m.node_relation.alias,
      primaryEntity: m.primary_entity ?? m.entities.find((e) => e.type === 'primary')?.name ?? null,
      aggTimeDimension: m.defaults?.agg_time_dimension ?? null,
      entities: m.entities.map((e) => ({ name: e.name, type: e.type, expr: e.expr ?? e.name })),
      dimensions: m.dimensions.map((d) => ({
        name: d.name,
        type: d.type,
        expr: d.expr ?? d.name,
        label: d.label ?? null,
        description: d.description ?? null,
        grain: d.type_params?.time_granularity ?? undefined,
      })),
      measures: m.measures.map((x) => ({
        name: x.name,
        agg: x.agg,
        expr: x.expr ?? x.name,
        label: x.label ?? null,
        description: x.description ?? null,
        aggTimeDimension: x.agg_time_dimension ?? null,
      })),
    })),
    metrics: sm.metrics.map((m) => ({
      name: m.name,
      label: m.label ?? m.name,
      description: m.description ?? '',
      type: m.type,
      filter: filterOf(m.filter),
      category: m.config?.meta?.category ?? 'Other',
      format: m.config?.meta?.format ?? 'number',
      measure: m.type_params.measure ? { name: m.type_params.measure.name, filter: filterOf(m.type_params.measure.filter) } : undefined,
      numerator: input(m.type_params.numerator),
      denominator: input(m.type_params.denominator),
      expr: m.type_params.expr ?? undefined,
      inputs: (m.type_params.metrics ?? []).map(input),
    })),
    savedQueries: (sm.saved_queries ?? []).map((q) => ({
      name: q.name,
      label: q.label ?? q.name,
      description: q.description ?? '',
      metrics: q.query_params.metrics,
      groupBy: q.query_params.group_by.map(groupByItem),
      where: filterOf(q.query_params.where),
      orderBy: (q.query_params.order_by ?? []).map(orderItem),
      limit: q.query_params.limit ?? undefined,
      meta: savedQueryMeta[q.name] ?? {},
    })),
  }
}

/** "Metric('x').descending(True)" -> { key: 'x', desc: true }; group-by items keep their query-spec key. */
function orderItem(s) {
  const desc = /\.descending\(\s*True\s*\)/i.test(s)
  const item = s.replace(/\.descending\([^)]*\)/i, '').trim()
  const metric = item.match(/^Metric\('([^']+)'\)$/)
  return { key: metric ? metric[1] : groupByItem(item), desc }
}

function windowDays(w) {
  const unit = w.granularity.toLowerCase().replace(/s$/, '')
  const per = { day: 1, week: 7 }[unit]
  if (!per) throw new Error(`offset_window granularity "${w.granularity}" is not supported by the browser engine (use days or weeks)`)
  return w.count * per
}

/** The browser engine runs a subset of MetricFlow. Fail the build when YAML steps outside it. */
function checkSupported(manifest) {
  const problems = []
  const filterRe = /^\{\{\s*(?:Dimension|Entity)\('[\w]+'\)\s*\}\}\s*(=|!=|<>|in|not in)\s*.+$/i
  for (const m of manifest.semanticModels) {
    for (const x of [...m.measures, ...m.dimensions, ...m.entities])
      if (!/^\w+$/.test(x.expr)) problems.push(`${m.name}.${x.name}: expr must be a column name, got "${x.expr}"`)
    for (const x of m.measures)
      if (!['sum', 'count', 'count_distinct', 'min', 'max', 'average'].includes(x.agg)) problems.push(`${m.name}.${x.name}: agg ${x.agg}`)
  }
  const typeOf = new Map(manifest.metrics.map((m) => [m.name, m.type]))
  for (const m of manifest.metrics) {
    if (!['simple', 'ratio', 'derived'].includes(m.type)) problems.push(`${m.name}: metric type ${m.type}`)
    // MetricFlow applies an offset on a ratio/derived input after aggregating at the query grain, so a
    // day-based offset at week/month grain never joins and returns nulls. Offset the simple inputs instead.
    for (const i of [...m.inputs, m.numerator, m.denominator].filter(Boolean))
      if (i.offsetDays && typeOf.get(i.name) !== 'simple')
        problems.push(`${m.name}: offset_window on "${i.name}" (a ${typeOf.get(i.name)} metric); offset its simple inputs instead`)
    const filters = [...m.filter, ...(m.measure?.filter ?? []), ...m.inputs.flatMap((i) => i.filter)]
    for (const f of filters) for (const part of f.split(/\s+and\s+/i)) if (!filterRe.test(part.trim())) problems.push(`${m.name}: filter "${f}"`)
  }
  if (problems.length) throw new Error(`Semantic layer uses features the browser engine does not run:\n  ${problems.join('\n  ')}`)
}

if (!skipDbt) {
  run('dbt', ['build'])
  await mkdir(EXPORT, { recursive: true })
  run('dbt', ['run-operation', 'export_snapshot'])
}

await mkdir(OUT, { recursive: true })
console.log('Packing marts into public/data/cta/')
const rowCounts = {}
for (const [name, schema] of Object.entries(TABLES)) rowCounts[name] = await packTable(name, schema)

const sources = JSON.parse(await readFile(join(SEMANTIC, 'data', 'raw', 'sources.json'), 'utf8').catch(() => '{"sources":[]}'))
const semanticManifest = JSON.parse(await readFile(join(SEMANTIC, 'target', 'semantic_manifest.json'), 'utf8'))
// Saved-query config.meta (chart, range) only lands in dbt's full manifest.json.
const dbtManifest = JSON.parse(await readFile(join(SEMANTIC, 'target', 'manifest.json'), 'utf8'))
const savedQueryMeta = Object.fromEntries(Object.values(dbtManifest.saved_queries ?? {}).map((q) => [q.name, q.config?.meta ?? {}]))
const manifest = compileManifest(semanticManifest, savedQueryMeta)
checkSupported(manifest)
await mkdir(dirname(MANIFEST_OUT), { recursive: true })
await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 1) + '\n')
console.log(`Compiled ${manifest.metrics.length} metrics, ${manifest.semanticModels.length} semantic models, ${manifest.savedQueries.length} saved queries`)

await writeFile(
  join(OUT, 'meta.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), fetchedAt: sources.fetchedAt ?? null, sources: sources.sources ?? [], rowCounts }, null, 2) + '\n',
)
console.log('Done.')
