import { use } from 'react'

import { buildEngine, buildTables, SNAPSHOT_TABLES, type SnapshotTable } from './core/dataset.ts'
import type { SemanticEngine } from './core/engine.ts'
import { rowsOf, type EncodedTable, type Table } from './core/table.ts'
import { isoOfDay } from './core/time.ts'
import type { SemanticManifest } from './core/types.ts'
import manifestJson from './manifest.json'

/*
 * Loads the snapshot (public/data/cta, written by `npm run data:build`) once per
 * page load and builds the engine plus typed reference lists for the pages.
 * Components read it with `useDataset()` under a <DataBoundary>.
 */

export interface Station {
  id: string
  name: string
  lines: string[]
  ada: boolean
  lat: number | null
  lon: number | null
  sector: string
  isTransfer: boolean
  firstDay: number | null
  lastDay: number | null
}

export interface Line {
  id: string
  name: string
  /** Official CTA route color, from the dbt seed. Line identity, not decoration. */
  color: string
  order: number
  stationCount: number
}

export interface Route {
  id: string
  name: string
  type: string
  firstDay: number | null
  lastDay: number | null
}

export interface SourceInfo {
  file: string
  id: string
  name: string
  attribution: string
  license: string
  rowsUpdatedAt: string | null
  url: string
  rowCount: number
}

export interface SnapshotMeta {
  builtAt: string
  fetchedAt: string | null
  sources: SourceInfo[]
  rowCounts: Record<string, number>
}

export interface QualityCheck {
  mode: string
  check: string
  description: string
  affected: number
}

export interface Dataset {
  engine: SemanticEngine
  tables: Record<string, Table>
  meta: SnapshotMeta
  stations: Station[]
  stationById: Map<string, Station>
  lines: Line[]
  lineById: Map<string, Line>
  lineByName: Map<string, Line>
  routes: Route[]
  routeById: Map<string, Route>
  /** Day type per day number (Weekday, Saturday, Sunday/Holiday). */
  dayType: Map<number, string>
  holidays: Set<number>
  quality: QualityCheck[]
  /** First and last day with data, as day numbers and ISO dates. */
  minDay: number
  maxDay: number
  maxIso: string
}

const BASE = `${import.meta.env.BASE_URL}data/cta/`

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}${file}`)
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status} ${res.statusText})`)
  return (await res.json()) as T
}

async function load(): Promise<Dataset> {
  const [meta, ...encoded] = await Promise.all([
    fetchJson<SnapshotMeta>('meta.json'),
    ...SNAPSHOT_TABLES.map((t) => fetchJson<EncodedTable>(`${t}.json`)),
  ])
  const tables = buildTables(Object.fromEntries(SNAPSHOT_TABLES.map((t, i) => [t, encoded[i]])) as Record<SnapshotTable, EncodedTable>)
  const engine = buildEngine(manifestJson as SemanticManifest, tables)

  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

  const lines: Line[] = rowsOf(tables.dim_lines)
    .map((r) => ({ id: str(r.line_id), name: str(r.line_name), color: str(r.color_hex), order: num(r.sort_order) ?? 0, stationCount: num(r.station_count) ?? 0 }))
    .sort((a, b) => a.order - b.order)

  const stations: Station[] = rowsOf(tables.dim_stations).map((r) => ({
    id: str(r.station_id),
    name: str(r.station_name),
    lines: str(r.lines) === 'Unknown' ? [] : str(r.lines).split(', '),
    ada: r.ada_accessible === 'true',
    lat: num(r.latitude),
    lon: num(r.longitude),
    sector: str(r.sector),
    isTransfer: r.is_transfer_station === 'true',
    firstDay: num(r.first_ride_date),
    lastDay: num(r.last_ride_date),
  }))

  const routes: Route[] = rowsOf(tables.dim_bus_routes).map((r) => ({
    id: str(r.route_id),
    name: str(r.route_name),
    type: str(r.route_type),
    firstDay: num(r.first_ride_date),
    lastDay: num(r.last_ride_date),
  }))

  const dayType = new Map<number, string>()
  const holidays = new Set<number>()
  for (const r of rowsOf(tables.dim_service_days)) {
    const d = num(r.ride_date)
    if (d === null) continue
    dayType.set(d, str(r.day_type))
    if (r.is_holiday === 'true') holidays.add(d)
  }

  const quality: QualityCheck[] = rowsOf(tables.dq_source_checks).map((r) => ({
    mode: str(r.mode),
    check: str(r.check_name),
    description: str(r.description),
    affected: num(r.affected_rows) ?? 0,
  }))

  return {
    engine,
    tables,
    meta,
    stations,
    stationById: new Map(stations.map((s) => [s.id, s])),
    lines,
    lineById: new Map(lines.map((l) => [l.id, l])),
    lineByName: new Map(lines.map((l) => [l.name, l])),
    routes,
    routeById: new Map(routes.map((r) => [r.id, r])),
    dayType,
    holidays,
    quality,
    minDay: engine.minDay,
    maxDay: engine.maxDay,
    maxIso: isoOfDay(engine.maxDay),
  }
}

let pending: Promise<Dataset> | null = null

export function datasetPromise(): Promise<Dataset> {
  pending ??= load()
  return pending
}

/** Forget a failed load so the next render retries. */
export function resetDataset() {
  pending = null
}

/** The loaded dataset. Suspends until it is ready; use inside <DataBoundary>. */
export function useDataset(): Dataset {
  return use(datasetPromise())
}
