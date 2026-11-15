/**
 * In-memory columnar tables, decoded from the snapshot files that
 * scripts/build-data.mjs writes to public/data/cta/. One table per dbt mart.
 */

/** Numbers (ints and floats). NaN is null. */
export interface NumColumn {
  kind: 'num'
  data: Float64Array
}
/** Day numbers (see time.ts). NULL_DAY is null. */
export interface DateColumn {
  kind: 'date'
  data: Int32Array
}
/** Strings and booleans, dictionary encoded. Code -1 is null. Booleans use dict ['false', 'true']. */
export interface CatColumn {
  kind: 'cat'
  codes: Int32Array
  dict: string[]
}
export type Column = NumColumn | DateColumn | CatColumn

export interface Table {
  name: string
  rowCount: number
  columns: Record<string, Column>
}

export const NULL_DAY = -2147483648

type Encoded =
  | { type: 'string'; dict: string[]; codes?: number[]; rle?: number[] }
  | { type: 'bool'; data: (number | null)[] }
  | { type: 'date'; data?: (number | null)[]; delta?: number[] }
  | { type: 'int' | 'float'; data: (number | null)[] }

export interface EncodedTable {
  table: string
  rows: number
  columns: Record<string, Encoded>
}

function decodeColumn(enc: Encoded, rows: number): Column {
  switch (enc.type) {
    case 'string': {
      const codes = new Int32Array(rows)
      if (enc.rle) {
        let at = 0
        for (let i = 0; i < enc.rle.length; i += 2) {
          codes.fill(enc.rle[i], at, at + enc.rle[i + 1])
          at += enc.rle[i + 1]
        }
      } else if (enc.codes) codes.set(enc.codes)
      return { kind: 'cat', codes, dict: enc.dict }
    }
    case 'bool': {
      const codes = new Int32Array(rows)
      for (let i = 0; i < rows; i++) codes[i] = enc.data[i] === null ? -1 : (enc.data[i] as number)
      return { kind: 'cat', codes, dict: ['false', 'true'] }
    }
    case 'date': {
      const data = new Int32Array(rows)
      if (enc.delta) {
        let acc = 0
        for (let i = 0; i < rows; i++) data[i] = acc += enc.delta[i]
      } else if (enc.data) for (let i = 0; i < rows; i++) data[i] = enc.data[i] ?? NULL_DAY
      return { kind: 'date', data }
    }
    default: {
      const data = new Float64Array(rows)
      for (let i = 0; i < rows; i++) data[i] = enc.data[i] ?? Number.NaN
      return { kind: 'num', data }
    }
  }
}

export function decodeTable(enc: EncodedTable): Table {
  const columns: Record<string, Column> = {}
  for (const [name, col] of Object.entries(enc.columns)) columns[name] = decodeColumn(col, enc.rows)
  return { name: enc.table, rowCount: enc.rows, columns }
}

/** The value of a cell as a string key (for joins and display). Null is null. */
export function cellKey(col: Column, row: number): string | null {
  switch (col.kind) {
    case 'cat': {
      const c = col.codes[row]
      return c < 0 ? null : col.dict[c]
    }
    case 'date': {
      const d = col.data[row]
      return d === NULL_DAY ? null : String(d)
    }
    default: {
      const v = col.data[row]
      return Number.isNaN(v) ? null : String(v)
    }
  }
}

/** Read a whole table into plain row objects (for small dimension tables). */
export function rowsOf(table: Table): Record<string, string | number | null>[] {
  const out: Record<string, string | number | null>[] = []
  const entries = Object.entries(table.columns)
  for (let r = 0; r < table.rowCount; r++) {
    const row: Record<string, string | number | null> = {}
    for (const [name, col] of entries) {
      if (col.kind === 'cat') row[name] = col.codes[r] < 0 ? null : col.dict[col.codes[r]]
      else if (col.kind === 'date') row[name] = col.data[r] === NULL_DAY ? null : col.data[r]
      else row[name] = Number.isNaN(col.data[r]) ? null : col.data[r]
    }
    out.push(row)
  }
  return out
}
