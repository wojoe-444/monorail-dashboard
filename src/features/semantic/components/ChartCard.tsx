import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, FileImage, FileSpreadsheet, LayoutDashboard, Maximize2, Minimize2, Settings2, SlidersHorizontal } from 'lucide-react'

import { ChartFrameHeight } from '@/components/charts/frame'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Segmented } from '@/components/ui/segmented'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { downloadCsvData, downloadFile, fileSlug, type CsvData } from '@/lib/download'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

import { semanticPath } from '../config'
import type { QueryResult } from '../core/types.ts'
import { resultCsvData } from '../csv'
import { useDataset } from '../data'
import { mfCommand } from '../mf'
import { resolveRange } from '../ranges'
import { exploreHref, saveView, type ViewSpec } from '../views'
import { ResultTable } from './ResultTable'

interface ChartCardProps {
  title: string
  /** Shown after the title (badges). Not part of the export file name. */
  titleAddon?: ReactNode
  description?: ReactNode
  /** The semantic view behind the card: enables Open in Explore, Pin to board and Copy mf query. */
  view?: ViewSpec
  /** The query result: enables the table view and the CSV download. */
  result?: QueryResult | null
  /** CSV rows for a card without a query result, or to export something other than it. */
  csv?: () => CsvData
  /** File name for downloads (default: the title). */
  exportName?: string
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

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Gap between the full-screen card and the edges of the page body. */
const INSET = 16

/**
 * The frame for every chart and table: title, a Chart/Table toggle (the table
 * is the accessible twin), a full-screen button, and an options menu to open
 * the view in Explore, pin it, download it as PNG or CSV, or copy the
 * equivalent `mf query`.
 *
 * Full screen fills the page body (right of the drawer), not the monitor. Esc
 * or the button goes back. Charts inside grow into the space through
 * `useChartHeight`; tables and lists scroll inside the card.
 */
export function ChartCard({
  title,
  titleAddon,
  description,
  view,
  result,
  csv,
  exportName,
  children,
  table,
  controls,
  footer,
  className,
  contentClassName,
  signed,
}: ChartCardProps) {
  const { engine, minDay, maxDay } = useDataset()
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  const [done, setDone] = useState(false)
  const [full, setFull] = useState(false)
  const [frame, setFrame] = useState<{ host: Box; placeholder: number } | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  /** True while a PNG is drawn: a full-screen card lets its content run past the screen so the image has all of it. */
  const [exporting, setExporting] = useState(false)
  const exportingRef = useRef(false)
  const card = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const hasTable = !!table || !!result
  const csvData = csv ?? (result ? () => resultCsvData(result) : undefined)
  const name = exportName ?? title

  const flash = () => {
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }

  const copyMf = async () => {
    if (!view) return
    const { command, note } = mfCommand(view, resolveRange(view.range, minDay, maxDay, view.custom), engine)
    await navigator.clipboard.writeText(note ? `# ${note}\n${command}` : command)
    flash()
  }

  const exportPng = async () => {
    const node = card.current
    if (!node) return
    try {
      const { toPng } = await import('html-to-image')
      if (frame) {
        exportingRef.current = true
        setExporting(true)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
      const cs = getComputedStyle(node)
      // A card stretched to match its row neighbour ends in blank space: crop to its content.
      const last = node.lastElementChild?.getBoundingClientRect()
      const height = Math.ceil(last ? last.bottom - node.getBoundingClientRect().top + parseFloat(cs.paddingBottom) : node.offsetHeight)
      const url = await toPng(node, {
        pixelRatio: 2,
        height,
        backgroundColor: cs.backgroundColor,
        // Leave out the buttons and controls.
        filter: (n) => !(n instanceof HTMLElement && n.dataset.exportIgnore !== undefined),
        // In full screen the card is position: fixed; draw it at the image's origin.
        style: { position: 'static', margin: '0', height: `${height}px` },
      })
      downloadFile(url, `${fileSlug(name)}.png`)
      flash()
    } catch (err) {
      console.error('PNG export failed', err)
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  // Full screen: pin the card over the page body and follow it as the window or drawer resizes.
  useLayoutEffect(() => {
    if (!full) {
      setFrame(null)
      return
    }
    const host = document.querySelector<HTMLElement>('[data-app-body]')
    const placeholder = card.current?.offsetHeight ?? 0
    const update = () => {
      const r = host?.getBoundingClientRect() ?? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
      setFrame({ host: { top: r.top, left: r.left, width: r.width, height: r.height }, placeholder })
    }
    update()
    const ro = new ResizeObserver(update)
    if (host) ro.observe(host)
    window.addEventListener('resize', update)
    const overflow = host?.style.overflowY ?? ''
    if (host) host.style.overflowY = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('keydown', onKey)
      if (host) host.style.overflowY = overflow
    }
  }, [full])

  // The height on offer to a chart inside the full-screen card.
  useEffect(() => {
    const el = content.current
    if (!frame || !el) {
      setContentHeight(null)
      return
    }
    const measure = () => {
      // Keep the chart height while an export lets the content grow.
      if (exportingRef.current) return
      const cs = getComputedStyle(el)
      setContentHeight(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [frame])

  const box = frame && {
    position: 'fixed' as const,
    top: frame.host.top + INSET,
    left: frame.host.left + INSET,
    width: frame.host.width - 2 * INSET,
    height: exporting ? 'auto' : frame.host.height - 2 * INSET,
  }

  return (
    <>
      {frame && (
        <>
          <div aria-hidden className={cn('pointer-events-none', className)} style={{ height: frame.placeholder }} />
          <div aria-hidden className="fixed z-30 bg-background/90 backdrop-blur-sm" style={frame.host} onClick={() => setFull(false)} />
        </>
      )}
      <Card
        ref={card}
        role={frame ? 'dialog' : undefined}
        aria-modal={frame ? true : undefined}
        aria-label={frame ? title : undefined}
        className={cn('gap-4', frame ? 'z-40 shadow-elevation-3' : className)}
        style={box ?? undefined}
      >
        <CardHeader>
          {/* Explicit column: the export drops the actions, and the description must not flow into their cell. */}
          <CardTitle className={cn('col-start-1', titleAddon && 'flex flex-wrap items-center gap-2')}>
            {title}
            {titleAddon}
          </CardTitle>
          {description && <CardDescription className="col-start-1">{description}</CardDescription>}
          <CardAction className="flex items-center gap-2" data-export-ignore>
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
            <span className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={full ? `Exit full screen: ${title}` : `Full screen: ${title}`}
                    aria-pressed={full}
                    onClick={() => setFull(!full)}
                  >
                    {full ? <Minimize2 /> : <Maximize2 />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{full ? 'Exit full screen (Esc)' : 'Full screen'}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Options for ${title}`}>
                        {done ? <Check /> : <Settings2 />}
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Options</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  {view && (
                    <>
                      <DropdownMenuItem onSelect={() => navigate(semanticPath(exploreHref(view, title)))}>
                        <SlidersHorizontal />
                        Open in Explore
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          saveView({ name: title, spec: view, pinned: true })
                          flash()
                        }}
                      >
                        <LayoutDashboard />
                        Pin to My board
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onSelect={exportPng}>
                    <FileImage />
                    Download PNG
                  </DropdownMenuItem>
                  {csvData && (
                    <DropdownMenuItem onSelect={() => downloadCsvData(csvData(), name)}>
                      <FileSpreadsheet />
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
            </span>
          </CardAction>
        </CardHeader>
        <CardContent ref={content} className={cn('min-w-0', frame && !exporting && 'min-h-0 flex-1 overflow-auto', contentClassName)}>
          <ChartFrameHeight.Provider value={frame ? contentHeight : null}>
            {mode === 'table' && hasTable
              ? (table ?? (result ? <ResultTable result={result} caption={title} signed={signed} /> : null))
              : children}
          </ChartFrameHeight.Provider>
        </CardContent>
        {footer && <div className="px-6 text-xs text-muted-foreground">{footer}</div>}
      </Card>
    </>
  )
}
