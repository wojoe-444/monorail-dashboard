import { downloadCsvData, toCsv, type CsvData } from '@/lib/download'

import type { QueryResult } from './core/types.ts'

/** Raw values (not display-formatted) so the file round-trips into a spreadsheet or notebook. */
export function resultCsvData(result: QueryResult): CsvData {
  return { columns: result.columns.map((c) => c.key), rows: result.rows.map((r) => result.columns.map((c) => r[c.key])) }
}

export function resultToCsv(result: QueryResult): string {
  return toCsv(resultCsvData(result))
}

export function downloadCsv(result: QueryResult, name: string) {
  downloadCsvData(resultCsvData(result), name)
}
