import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { CellValue, QueryResult, ResultColumn } from '../core/types.ts'
import { formatCategory, formatPeriod, formatSignedPercent, formatValue } from '../format'

interface ResultTableProps {
  result: QueryResult
  /** Rows shown before "Show all". */
  pageSize?: number
  /** Custom cell rendering (e.g. a station name as a link). Return undefined for the default. */
  renderCell?: (col: ResultColumn, row: Record<string, CellValue>) => ReactNode | undefined
  /** Metrics whose values are signed changes, drawn with a sign and status color. */
  signed?: string[]
  /** Columns to leave out (e.g. an id that only feeds a link). */
  hide?: string[]
  className?: string
  caption?: string
}

/** The table twin of every chart: sortable, formatted, with full values. */
export function ResultTable({ result, pageSize = 25, renderCell, signed = [], hide = [], className, caption }: ResultTableProps) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null)
  const [all, setAll] = useState(false)
  const columns = result.columns.filter((c) => !hide.includes(c.key))
  const rows = useMemo(() => {
    if (!sort) return result.rows
    return [...result.rows].sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      if (x === y) return 0
      if (x === null) return 1
      if (y === null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort.desc ? -c : c
    })
  }, [result.rows, sort])
  const shown = all ? rows : rows.slice(0, pageSize)

  const display = (col: ResultColumn, row: Record<string, CellValue>): ReactNode => {
    const custom = renderCell?.(col, row)
    if (custom !== undefined) return custom
    const v = row[col.key]
    if (col.kind === 'time') return formatPeriod(v as string, col.grain)
    if (col.kind !== 'metric') return formatCategory(v)
    if (signed.includes(col.key) && typeof v === 'number')
      return <span className={cn(v > 0 ? 'text-success' : v < 0 ? 'text-warning-soft-foreground' : '')}>{formatSignedPercent(v)}</span>
    return formatValue(v, col.format)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <TableHead
                  key={c.key}
                  className={cn('h-9 text-xs', c.kind === 'metric' && 'text-right')}
                  aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    type="button"
                    title={c.description}
                    onClick={() => setSort(active ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.kind === 'metric' })}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                      c.kind === 'metric' && 'flex-row-reverse',
                    )}
                  >
                    {c.label}
                    {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key} className={cn('py-2 text-sm', c.kind === 'metric' && 'text-right tabular-nums', c.kind === 'entity' && 'font-mono text-xs')}>
                  {display(c, row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!shown.length && (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                No rows for this selection.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>
            {all ? rows.length : Math.min(pageSize, rows.length)} of {rows.length.toLocaleString()} rows
          </span>
          <button type="button" className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : 'Show all'}
          </button>
        </div>
      )}
    </div>
  )
}
