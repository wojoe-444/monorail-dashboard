/** A file name from a title: "Busiest stations, 28 days" -> "busiest-stations-28-days". */
export function fileSlug(name: string, fallback = 'export'): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  )
}

/** Save a Blob or a data: URL under a file name. */
export function downloadFile(data: Blob | string, fileName: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type CsvCell = string | number | boolean | null | undefined

/** Rows of raw values for a CSV export: a header row and the body. */
export interface CsvData {
  columns: string[]
  rows: CsvCell[][]
}

const cell = (v: CsvCell) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv({ columns, rows }: CsvData): string {
  return [columns.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n'
}

export function downloadCsvData(data: CsvData, name: string) {
  downloadFile(new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' }), `${fileSlug(name)}.csv`)
}

/** Records to CSV columns, in the key order given. */
export function csvFromRecords<T>(records: T[], columns: { label: string; value: (r: T) => CsvCell }[]): CsvData {
  return { columns: columns.map((c) => c.label), rows: records.map((r) => columns.map((c) => c.value(r))) }
}
