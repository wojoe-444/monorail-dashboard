import { useState, type ReactNode } from 'react'
import { Check, Copy, Download, Ellipsis, LayoutDashboard, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Segmented } from '@/components/ui/segmented'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

import { semanticPath } from '../config'
import type { QueryResult } from '../core/types.ts'
import { downloadCsv } from '../csv'
import { useDataset } from '../data'
import { mfCommand } from '../mf'
import { resolveRange } from '../ranges'
import { exploreHref, saveView, type ViewSpec } from '../views'
import { ResultTable } from './ResultTable'

interface ChartCardProps {
  title: string
  description?: ReactNode
  /** The semantic view behind the card: enables Open in Explore, Pin to board and Copy mf query. */
  view?: ViewSpec
  /** The query result: enables the table view and CSV download. */
  result?: QueryResult | null
  children: ReactNode
  /** Replace the default table view. */
  table?: ReactNode
  /** Extra controls in the header, left of the view toggle. */
  controls?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  /** Metrics shown as signed changes in the table view. */
  signed?: string[]
}

/**
 * The frame for every chart: title, a Chart/Table toggle (the table is the
 * accessible twin), and a menu to open the view in Explore, pin it, export
 * CSV, or copy the equivalent `mf query`.
 */
export function ChartCard({ title, description, view, result, children, table, controls, footer, className, contentClassName, signed }: ChartCardProps) {
  const { engine, minDay, maxDay } = useDataset()
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  const [copied, setCopied] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hasTable = !!table || !!result

  const copyMf = async () => {
    if (!view) return
    const { command, note } = mfCommand(view, resolveRange(view.range, minDay, maxDay, view.custom), engine)
    await navigator.clipboard.writeText(note ? `# ${note}\n${command}` : command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction className="flex items-center gap-2">
          {controls}
          {hasTable && (
            <Segmented
              aria-label={`${title}: show as`}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          )}
          {(view || result) && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`More actions for ${title}`}>
                      {copied || pinned ? <Check /> : <Ellipsis />}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                {view && (
                  <DropdownMenuItem onSelect={() => navigate(semanticPath(exploreHref(view, title)))}>
                    <SlidersHorizontal />
                    Open in Explore
                  </DropdownMenuItem>
                )}
                {view && (
                  <DropdownMenuItem
                    onSelect={() => {
                      saveView({ name: title, spec: view, pinned: true })
                      setPinned(true)
                      setTimeout(() => setPinned(false), 1500)
                    }}
                  >
                    <LayoutDashboard />
                    Pin to My board
                  </DropdownMenuItem>
                )}
                {(view || result) && <DropdownMenuSeparator />}
                {result && (
                  <DropdownMenuItem onSelect={() => downloadCsv(result, title)}>
                    <Download />
                    Download CSV
                  </DropdownMenuItem>
                )}
                {view && (
                  <DropdownMenuItem onSelect={copyMf}>
                    <Copy />
                    Copy as mf query
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className={cn('min-w-0', contentClassName)}>
        {mode === 'table' && hasTable ? (table ?? (result ? <ResultTable result={result} caption={title} signed={signed} /> : null)) : children}
      </CardContent>
      {footer && <div className="px-6 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  )
}
