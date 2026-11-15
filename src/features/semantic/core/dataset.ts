/**
 * Turns the snapshot files into a ready engine: decode every mart, derive the
 * one mart that is cheaper to rebuild than to ship (fct_rail_line_entries, same
 * logic as semantic/models/marts/fct_rail_line_entries.sql), and find the data's date range.
 * Shared by the browser loader (../data.ts) and scripts/parity.mjs.
 */
import { SemanticEngine } from './engine.ts'
import { decodeTable, type CatColumn, type EncodedTable, type NumColumn, type Table } from './table.ts'
import type { SemanticManifest } from './types.ts'

export const SNAPSHOT_TABLES = [
  'dim_stations',
  'dim_lines',
  'bridge_station_lines',
  'dim_bus_routes',
  'dim_service_days',
  'fct_rail_station_entries',
  'fct_bus_route_rides',
  'dq_source_checks',
] as const

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number]

export function buildTables(encoded: Record<SnapshotTable, EncodedTable>): Record<string, Table> {
  const tables: Record<string, Table> = {}
  for (const name of SNAPSHOT_TABLES) tables[name] = decodeTable(encoded[name])
  tables.fct_rail_line_entries = deriveLineEntries(tables.fct_rail_station_entries, tables.bridge_station_lines)
  return tables
}

/** One row per station x line x day: full station entries, and entries split evenly across the station's lines. */
function deriveLineEntries(fact: Table, bridge: Table): Table {
  const fStation = fact.columns.station_id as CatColumn
  const fDate = fact.columns.ride_date as { kind: 'date'; data: Int32Array }
  const fRides = fact.columns.rides as NumColumn
  const bStation = bridge.columns.station_id as CatColumn
  const bLine = bridge.columns.line_id as CatColumn
  const bCount = bridge.columns.line_count as NumColumn

  // Fact rows are sorted by station, so each station is one contiguous range.
  const ranges = new Map<string, [number, number]>()
  for (let r = 0; r < fact.rowCount; r++) {
    const s = fStation.dict[fStation.codes[r]]
    const range = ranges.get(s)
    if (range) range[1] = r + 1
    else ranges.set(s, [r, r + 1])
  }

  let total = 0
  for (let b = 0; b < bridge.rowCount; b++) {
    const range = ranges.get(bStation.dict[bStation.codes[b]])
    if (range) total += range[1] - range[0]
  }

  const station = new Int32Array(total)
  const line = new Int32Array(total)
  const date = new Int32Array(total)
  const stationRides = new Float64Array(total)
  const allocated = new Float64Array(total)
  const stationCode = new Map(fStation.dict.map((v, i) => [v, i]))
  let at = 0
  for (let b = 0; b < bridge.rowCount; b++) {
    const s = bStation.dict[bStation.codes[b]]
    const range = ranges.get(s)
    if (!range) continue
    const n = bCount.data[b]
    const code = stationCode.get(s)!
    for (let r = range[0]; r < range[1]; r++, at++) {
      station[at] = code
      line[at] = bLine.codes[b]
      date[at] = fDate.data[r]
      stationRides[at] = fRides.data[r]
      allocated[at] = fRides.data[r] / n
    }
  }
  return {
    name: 'fct_rail_line_entries',
    rowCount: total,
    columns: {
      station_id: { kind: 'cat', codes: station, dict: fStation.dict },
      line_id: { kind: 'cat', codes: line, dict: bLine.dict },
      ride_date: { kind: 'date', data: date },
      station_rides: { kind: 'num', data: stationRides },
      rides_allocated: { kind: 'num', data: allocated },
    },
  }
}

/** The days the ridership data covers (the dim_service_days range). */
export function dataRange(tables: Record<string, Table>): { min: number; max: number } {
  const days = (tables.dim_service_days.columns.ride_date as { data: Int32Array }).data
  let min = Infinity
  let max = -Infinity
  for (const d of days) {
    if (d < min) min = d
    if (d > max) max = d
  }
  return { min, max }
}

export function buildEngine(manifest: SemanticManifest, tables: Record<string, Table>): SemanticEngine {
  return new SemanticEngine(manifest, tables, dataRange(tables))
}
