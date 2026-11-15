import { useCallback } from 'react'

import { useRoute } from '@/lib/router'

/**
 * Page state in the URL query (#/rail?range=90d&line=Red), so a filtered view
 * can be bookmarked, shared, and survives a reload. Setting a value to null or
 * to its default removes it from the URL. Updates replace the history entry,
 * so typing in a search box or nudging a filter does not flood the back button.
 */
export function useUrlParams(): [URLSearchParams, (patch: Record<string, string | null | undefined>) => void] {
  const [path] = useRoute()
  const i = path.indexOf('?')
  const base = i === -1 ? path : path.slice(0, i)
  const params = new URLSearchParams(i === -1 ? '' : path.slice(i + 1))
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(i === -1 ? '' : path.slice(i + 1))
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k)
        else next.set(k, v)
      }
      const q = next.toString()
      window.location.replace(`#${q ? `${base}?${q}` : base}`)
    },
    [path, base, i],
  )
  return [params, set]
}
