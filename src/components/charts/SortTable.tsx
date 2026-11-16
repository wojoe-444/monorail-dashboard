import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CsvCell, CsvData } from '@/lib/download'
import { cn } from '@/lib/utils'

export interface SortColumn<T> {
  key: string
  label: string
  /** Shown as the header's tooltip: what the column means. */
  title?: string
  align?: 'left' | 'right'
  /** Value to sort by; omit for an unsortable column. Nulls sort last. */
  sort?: (row: T) => number | string | null
  render: (row: T) => ReactNode
  /** Raw value for CSV exports (default: the `sort` value). Columns with neither are left out. */
  csv?: (row: T) => CsvCell
  className?: string
}

interface SortTableProps<T> {
  rows: T[]
  columns: SortColumn<T>[]
  rowKey: (row: T) => string
  initialSort?: { key: string; desc: boolean }
  pageSize?: number
  caption: string
  empty?: ReactNode
  /** Make the first column sticky when the table scrolls sideways. */
  stickyFirst?: boolean
}

/** The table's rows as raw values (not display-formatted), every row, not just the first page. */
export function sortTableCsv<T>(rows: T[], columns: SortColumn<T>[]): CsvData {
  const cols = columns.filter((c) => c.csv || c.sort)
  return { columns: cols.map((c) => c.label), rows: rows.map((r) => cols.map((c) => (c.csv ?? c.sort)!(r))) }
}

/** A sortable table for list pages. Header buttons announce sort state; long lists page. */
export function SortTable<T>({ rows, columns, rowKey, initialSort, pageSize = 50, caption, empty, stickyFirst }: SortTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key)
    if (!col?.sort || !sort) return rows
    const get = col.sort
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === y) return 0
      if (x === null) return 1
      if (y === null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort.desc ? -c : c
    })
  }, [rows, columns, sort])
  const shown = all ? sorted : sorted.slice(0, pageSize)

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => {
              const active = sort?.key === c.key
              return (
                <TableHead
                  key={c.key}
                  aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                  className={cn(
                    'h-9 text-xs whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    stickyFirst && i === 0 && 'sticky left-0 z-10 bg-card',
                  )}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      title={c.title}
                      onClick={() => setSort(active ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.align === 'right' })}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                        c.align === 'right' && 'flex-row-reverse',
                        active && 'text-foreground',
                      )}
                    >
                      {c.label}
                      {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                    </button>
                  ) : (
                    <span title={c.title} className="font-medium text-muted-foreground">
                      {c.label}
                    </span>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c, i) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    'py-2 text-sm',
                    c.align === 'right' && 'text-right tabular-nums',
                    stickyFirst && i === 0 && 'sticky left-0 z-10 bg-card',
                    c.className,
                  )}
                >
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!shown.length && (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                {empty ?? 'Nothing matches these filters.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>
            Showing {shown.length} of {sorted.length}
          </span>
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="rounded-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {all ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </div>
  )
}
