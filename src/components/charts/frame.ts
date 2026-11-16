import { createContext, useContext } from 'react'

/**
 * Height available to a chart when its card is shown full screen (null when the
 * card is in the page). Charts read it through `useChartHeight` so they grow to
 * fill the screen and go back to their own height afterwards.
 */
export const ChartFrameHeight = createContext<number | null>(null)

/** The chart's plot height: its own `height`, or the space left in a full-screen card minus `reserve` (legend, notes). */
export function useChartHeight(height: number, reserve = 0): number {
  const available = useContext(ChartFrameHeight)
  return available === null ? height : Math.max(height, Math.floor(available - reserve))
}
