#!/usr/bin/env node
/**
 * Proves the browser engine and MetricFlow agree. Each query below runs twice:
 * through src/features/semantic/core (on the packed snapshot in public/data/cta)
 * and through `mf query` on the DuckDB warehouse in semantic/target. Any value
 * that differs by more than 1e-9 (relative) fails the check.
 *
 *   npm run semantic:parity      (after npm run data:build)
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildEngine, buildTables, SNAPSHOT_TABLES } from '../src/features/semantic/core/dataset.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEMANTIC = join(ROOT, 'semantic')
const OUT = join(SEMANTIC, 'target', 'parity')
mkdirSync(OUT, { recursive: true })

const W = "{{ Dimension('service_day__day_type') }} = 'Weekday'"
const QUERIES = [
  { metrics: ['rail_entries', 'bus_boardings', 'total_rides', 'rail_share'], groupBy: ['metric_time__month'], timeRange: { start: '2025-09-01', end: '2026-08-31' } },
  { metrics: ['rail_entries_yoy', 'bus_boardings_yoy', 'rail_avg_weekday_yoy'], groupBy: ['metric_time__month'], timeRange: { start: '2025-01-01', end: '2026-08-31' } },
  { metrics: ['rail_avg_weekday_entries', 'rail_avg_saturday_entries', 'rail_avg_sunday_entries'], groupBy: ['metric_time__quarter', 'station__sector'], timeRange: { start: '2024-01-01', end: '2026-06-30' } },
  { metrics: ['line_avg_weekday_allocated', 'line_station_entries'], groupBy: ['metric_time__month', 'line__line_name'], timeRange: { start: '2026-01-01', end: '2026-08-31' } },
  { metrics: ['rail_avg_daily_entries', 'rail_stations_reporting'], groupBy: ['metric_time__year', 'station__ada_accessible'] },
  { metrics: ['bus_avg_weekday_boardings', 'bus_routes_reporting'], groupBy: ['metric_time__week', 'route__route_type'], timeRange: { start: '2026-06-01', end: '2026-08-30' } },
  { metrics: ['total_rides'], groupBy: ['metric_time__month', 'service_day__day_type'], timeRange: { start: '2025-01-01', end: '2026-08-31' } },
  { metrics: ['rail_entries'], groupBy: ['metric_time__day', 'station__station_name'], where: ["{{ Dimension('station__lines') }} in ('Red', 'Red, Purple')"], timeRange: { start: '2026-08-01', end: '2026-08-31' } },
  { metrics: ['rail_entries', 'rail_entries_ly'], groupBy: ['metric_time__week', 'station'], where: ["{{ Entity('station') }} = '41320'"], timeRange: { start: '2026-01-05', end: '2026-08-30' } },
  { metrics: ['bus_boardings'], groupBy: ['metric_time__month', 'route__route_name'], where: [W, "{{ Dimension('route__route_type') }} != 'Local'"], timeRange: { start: '2025-06-01', end: '2026-08-31' } },
  { metrics: ['total_avg_weekday_rides', 'total_rides_yoy'], groupBy: ['metric_time__month', 'service_day__is_holiday'], timeRange: { start: '2025-09-01', end: '2026-08-31' } },
  { metrics: ['line_avg_weekday_yoy'], groupBy: ['metric_time__quarter', 'line__line_name', 'station__sector'], timeRange: { start: '2025-01-01', end: '2026-06-30' } },
  // Ranges that cut through a period: both engines widen to whole periods of the grain.
  { metrics: ['rail_entries'], groupBy: ['metric_time__month'], timeRange: { start: '2026-08-15', end: '2026-08-20' } },
  { metrics: ['rail_entries', 'bus_boardings_ly'], groupBy: ['metric_time__week'], timeRange: { start: '2026-08-12', end: '2026-08-13' } },
  { metrics: ['rail_avg_weekday_entries', 'rail_avg_weekday_yoy'], groupBy: ['metric_time__quarter', 'station__sector'], timeRange: { start: '2026-05-10', end: '2026-08-20' } },
]

import { resolveRange } from '../src/features/semantic/ranges.ts'

const tables = buildTables(Object.fromEntries(SNAPSHOT_TABLES.map((t) => [t, JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'cta', `${t}.json`), 'utf8'))])))
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'features', 'semantic', 'manifest.json'), 'utf8'))
const engine = buildEngine(manifest, tables)

function parseCsv(text) {
  // mf writes \r\r\n line ends on Windows.
  const [head, ...lines] = text.replace(/\r/g, '').trim().split('\n')
  const cols = head.split(',')
  return lines.map((l) => {
    const cells = []
    let cur = ''
    let q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) {
        cells.push(cur)
        cur = ''
      } else cur += ch
    }
    cells.push(cur)
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]))
  })
}

const norm = (v) => {
  if (v === null || v === undefined || v === '') return ''
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (s === 'True' || s === 'False') return s.toLowerCase()
  return s
}

let failures = 0
// Every shipped team view (MetricFlow saved query) must run in MetricFlow and match the app.
for (const sq of manifest.savedQueries) {
  const range = resolveRange(sq.meta.range ?? '1y', engine.minDay, engine.maxDay, { start: sq.meta.start, end: sq.meta.end })
  QUERIES.push({ saved: sq.name, metrics: sq.metrics, groupBy: sq.groupBy, where: sq.where, orderBy: sq.orderBy, limit: sq.limit, timeRange: range })
}

QUERIES.forEach((q, i) => {
  const csv = join(OUT, `q${i}.csv`)
  const args = q.saved ? ['query', '--saved-query', q.saved, '--csv', csv] : ['query', '--metrics', q.metrics.join(','), '--csv', csv]
  if (!q.saved && q.groupBy?.length) args.push('--group-by', q.groupBy.join(','))
  if (q.timeRange?.start) args.push('--start-time', q.timeRange.start)
  if (q.timeRange?.end) args.push('--end-time', q.timeRange.end)
  if (!q.saved) for (const w of q.where ?? []) args.push('--where', w)
  try {
    execFileSync('mf', args, { cwd: SEMANTIC, stdio: 'pipe', env: { ...process.env, PYTHONUTF8: '1' } })
  } catch (e) {
    failures++
    const reason = String(e.stderr ?? e.message)
      .split('\n')
      .find((l) => /error|message/i.test(l))
    console.log(`FAIL q${i} ${q.saved ? `saved query ${q.saved}` : q.metrics.join(', ')}: MetricFlow could not run it\n  ${reason ?? ''}`)
    return
  }
  const expected = parseCsv(readFileSync(csv, 'utf8'))
  const actual = engine.query(q).rows
  const keyOf = (r) => (q.groupBy ?? []).map((k) => norm(r[k])).join('|')
  const got = new Map(actual.map((r) => [keyOf(r), r]))
  const problems = []
  // Rows where every metric is null carry no values; either side may keep or drop them.
  const nonNull = actual.filter((r) => q.metrics.some((m) => r[m] !== null))
  const expectedNonNull = expected.filter((r) => q.metrics.some((m) => r[m] !== ''))
  if (nonNull.length !== expectedNonNull.length) problems.push(`row count: engine ${nonNull.length}, MetricFlow ${expectedNonNull.length}`)
  for (const e of expected) {
    const a = got.get(keyOf(e))
    if (!a) {
      if (q.metrics.some((m) => e[m] !== '')) problems.push(`missing row ${keyOf(e)}`)
      continue
    }
    for (const m of q.metrics) {
      const ev = e[m] === '' ? null : Number(e[m])
      const av = a[m]
      const same = ev === null || av === null ? ev === av : Math.abs(ev - av) <= 1e-9 * Math.max(1, Math.abs(ev))
      if (!same) problems.push(`${keyOf(e)} ${m}: engine ${av}, MetricFlow ${ev}`)
    }
  }
  const label = `${q.saved ? `saved query ${q.saved}: ` : ''}${q.metrics.join(', ')} by ${(q.groupBy ?? []).join(', ') || '(total)'}`
  if (problems.length) {
    failures++
    console.log(`FAIL q${i} ${label}\n  ${problems.slice(0, 6).join('\n  ')}${problems.length > 6 ? `\n  ... ${problems.length - 6} more` : ''}`)
  } else console.log(`ok   q${i} ${label} (${expected.length} rows)`)
})

if (failures) {
  console.error(`\n${failures} of ${QUERIES.length} queries differ from MetricFlow`)
  process.exit(1)
}
console.log(`\nAll ${QUERIES.length} queries match MetricFlow.`)
