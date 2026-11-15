import type { QueryResult } from './core/types.ts'

const cell = (v: unknown) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Raw values (not display-formatted) so the file round-trips into a spreadsheet or notebook. */
export function resultToCsv(result: QueryResult): string {
  const head = result.columns.map((c) => cell(c.key)).join(',')
  const body = result.rows.map((r) => result.columns.map((c) => cell(r[c.key])).join(','))
  return [head, ...body].join('\n') + '\n'
}

export function downloadCsv(result: QueryResult, name: string) {
  const blob = new Blob([resultToCsv(result)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
