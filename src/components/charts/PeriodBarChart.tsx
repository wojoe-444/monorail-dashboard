import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltipContent } from './ChartTooltip'
import { Legend } from './Legend'
import { axisProps, gridProps } from './palette'

export interface BarSeries {
  key: string
  label: string
  color: string
}

interface PeriodBarChartProps {
  data: Record<string, string | number | null>[]
  /** The category key in each row (a period ISO date, or a label like "Mon"). */
  xKey?: string
  series: BarSeries[]
  stacked?: boolean
  formatTick: (x: string) => string
  formatTitle: (x: string) => string
  formatValue: (v: number) => string
  formatAxis?: (v: number) => string
  height?: number
  ariaLabel: string
}

/**
 * Columns per period or category, grouped or stacked. Bars cap at 24px and keep
 * a 2px surface gap between stacked segments (the stroke in the card color).
 */
export function PeriodBarChart({
  data,
  xKey = 't',
  series,
  stacked,
  formatTick,
  formatTitle,
  formatValue,
  formatAxis,
  height = 260,
  ariaLabel,
}: PeriodBarChartProps) {
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && <Legend items={series} shape="rect" />}
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatTick} minTickGap={24} tickMargin={8} />
            <YAxis {...axisProps} axisLine={false} width={56} tickFormatter={formatAxis ?? formatValue} tickMargin={4} />
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: 'var(--muted-foreground)', fillOpacity: 0.06 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || label === undefined) return null
                const row = payload[0]?.payload as Record<string, number | null>
                const rows = series.map((s) => ({
                  key: s.key,
                  label: s.label,
                  color: s.color,
                  value: row?.[s.key] === null || row?.[s.key] === undefined ? '—' : formatValue(row[s.key] as number),
                }))
                const total = stacked ? series.reduce((a, s) => a + ((row?.[s.key] as number) ?? 0), 0) : null
                return <ChartTooltipContent title={formatTitle(String(label))} rows={stacked ? rows.reverse() : rows} footer={total !== null ? `Total ${formatValue(total)}` : undefined} />
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={stacked ? 'stack' : undefined}
                maxBarSize={24}
                stroke={stacked ? 'var(--card)' : undefined}
                strokeWidth={stacked ? 2 : 0}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
