import { useId } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTooltipContent } from './ChartTooltip'
import { useChartHeight } from './frame'
import { Legend } from './Legend'
import { axisProps, gridProps } from './palette'

export interface TimeSeries {
  key: string
  label: string
  color: string
  /** Draw as a quiet reference (thinner, no area), e.g. the same period last year. */
  reference?: boolean
}

export interface TimeSeriesChartProps {
  /** One row per period: { t: ISO date, [series.key]: number | null }. */
  data: Record<string, string | number | null>[]
  series: TimeSeries[]
  formatTick: (iso: string) => string
  formatTitle: (iso: string) => string
  formatValue: (v: number) => string
  formatAxis?: (v: number) => string
  height?: number
  /** Fill the area under a single series. */
  area?: boolean
  /** Start the y-axis at zero (default) or fit the data (for rates that hover far from zero). */
  zeroBaseline?: boolean
  /** Vertical hairlines with a label, e.g. holidays or service changes. */
  markers?: { t: string; label: string }[]
  /** A shaded span, e.g. the comparison window. */
  band?: { from: string; to: string; label?: string }
  onSelect?: (t: string) => void
  ariaLabel: string
  /** Explicit x ticks (e.g. one per January) when the formatter would repeat labels. */
  ticks?: string[]
  footer?: (t: string) => string | undefined
}

/**
 * Line chart over time with a crosshair tooltip that lists every series at the
 * hovered period (values first). Legend above for two or more series.
 */
export function TimeSeriesChart({
  data,
  series,
  formatTick,
  formatTitle,
  formatValue,
  formatAxis,
  height: ownHeight = 280,
  area,
  zeroBaseline = true,
  markers,
  band,
  onSelect,
  ariaLabel,
  ticks,
  footer,
}: TimeSeriesChartProps) {
  const height = useChartHeight(ownHeight, series.length > 1 ? 40 : 0)
  const gradientId = useId().replace(/:/g, '')
  const fillArea = area && series.filter((s) => !s.reference).length === 1
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && <Legend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} shape="line" />}
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onClick={onSelect ? (s) => s?.activeLabel && onSelect(String(s.activeLabel)) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={series[0]?.color} stopOpacity={0.14} />
                <stop offset="100%" stopColor={series[0]?.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="t"
              {...axisProps}
              tickFormatter={formatTick}
              minTickGap={36}
              tickMargin={8}
              ticks={ticks}
              interval={ticks ? 0 : undefined}
            />
            <YAxis
              {...axisProps}
              axisLine={false}
              width={56}
              tickFormatter={formatAxis ?? formatValue}
              domain={zeroBaseline ? [0, 'auto'] : ['auto', 'auto']}
              tickMargin={4}
            />
            {band && (
              <ReferenceArea
                x1={band.from}
                x2={band.to}
                fill="var(--muted-foreground)"
                fillOpacity={0.06}
                strokeOpacity={0}
                ifOverflow="extendDomain"
              />
            )}
            {markers?.map((m) => (
              <ReferenceLine key={m.t} x={m.t} stroke="var(--chart-axis)" strokeWidth={1} label={undefined} />
            ))}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || label === undefined) return null
                const t = String(label)
                const row = payload[0]?.payload as Record<string, number | null>
                return (
                  <ChartTooltipContent
                    title={formatTitle(t)}
                    rows={series.map((s) => ({
                      key: s.key,
                      label: s.label,
                      color: s.color,
                      value: row?.[s.key] === null || row?.[s.key] === undefined ? '—' : formatValue(row[s.key] as number),
                    }))}
                    footer={footer?.(t)}
                  />
                )
              }}
            />
            {fillArea &&
              series
                .filter((s) => !s.reference)
                .map((s) => (
                  <Area
                    key={`${s.key}-area`}
                    type="monotone"
                    dataKey={s.key}
                    stroke="none"
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                    connectNulls={false}
                    tooltipType="none"
                  />
                ))}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.reference ? 1.5 : 2}
                strokeOpacity={s.reference ? 0.7 : 1}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
