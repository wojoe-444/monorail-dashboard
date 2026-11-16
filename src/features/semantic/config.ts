import { pathIn } from '@/app/hub'

/**
 * The dashboard that owns this semantic dataset's pages (Explore, My board, Metrics).
 * Charts on any dashboard that reads the CTA semantic layer link here.
 */
export const SEMANTIC_DASHBOARD = 'cta'

/** A route path inside the semantic dataset's home dashboard. */
export function semanticPath(path: string): string {
  return pathIn(SEMANTIC_DASHBOARD, path)
}
