import { useMemo } from 'react'

import { SemanticError } from './core/engine.ts'
import type { QueryResult, QuerySpec } from './core/types.ts'
import { useDataset } from './data'

export interface QueryState {
  result: QueryResult | null
  error: string | null
}

/**
 * Run a semantic-layer query. The engine is synchronous and caches results by
 * spec, so this is a memo, not an effect. Pass null to skip.
 */
export function useQuery(spec: QuerySpec | null): QueryState {
  const { engine } = useDataset()
  const key = spec ? JSON.stringify(spec) : ''
  return useMemo(() => {
    if (!spec) return { result: null, error: null }
    try {
      return { result: engine.query(spec), error: null }
    } catch (e) {
      if (e instanceof SemanticError || e instanceof Error) return { result: null, error: e.message }
      throw e
    }
    // Keyed on the serialized spec: callers build a new spec object every render.
  }, [engine, key])
}

/** A query whose failure is a bug in the page, not the user's doing: throws to the DataBoundary. */
export function useQueryOrThrow(spec: QuerySpec): QueryResult {
  const { result, error } = useQuery(spec)
  if (error || !result) throw new Error(error ?? 'Query returned nothing')
  return result
}
