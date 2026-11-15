/**
 * Parser for MetricFlow where-filters, the subset the browser engine runs:
 *
 *   {{ Dimension('service_day__day_type') }} = 'Weekday'
 *   {{ Dimension('station__sector') }} in ('Loop', 'North')
 *   {{ Entity('station') }} != '40380' and {{ Dimension('station__ada_accessible') }} = true
 *
 * Conditions are joined with AND. The same strings run unchanged in MetricFlow
 * (`mf query --where "..."`), which is what keeps the two engines in step.
 */

export type FilterOp = '=' | '!=' | 'in' | 'not in'

export interface FilterCondition {
  /** A group-by key: "station__sector", or an entity name like "station". */
  ref: string
  op: FilterOp
  values: string[]
}

type Tok = { k: 'tmpl'; ref: string } | { k: 'str'; v: string } | { k: 'word'; v: string } | { k: 'sym'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (src.startsWith('{{', i)) {
      const end = src.indexOf('}}', i)
      if (end < 0) throw new Error(`Unclosed {{ in filter: ${src}`)
      const inner = src.slice(i + 2, end).trim()
      const m = inner.match(/^(?:Dimension|Entity)\(\s*'([\w]+)'\s*\)$/)
      if (!m) throw new Error(`Unsupported filter template "{{ ${inner} }}" (use Dimension('entity__name') or Entity('name'))`)
      out.push({ k: 'tmpl', ref: m[1] })
      i = end + 2
      continue
    }
    if (ch === "'") {
      let j = i + 1
      let v = ''
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") {
          v += "'"
          j += 2
        } else if (src[j] === "'") break
        else v += src[j++]
      }
      if (j >= src.length) throw new Error(`Unclosed quote in filter: ${src}`)
      out.push({ k: 'str', v })
      i = j + 1
      continue
    }
    if (src.startsWith('!=', i) || src.startsWith('<>', i)) {
      out.push({ k: 'sym', v: '!=' })
      i += 2
      continue
    }
    if ('=(),'.includes(ch)) {
      out.push({ k: 'sym', v: ch })
      i++
      continue
    }
    const m = src.slice(i).match(/^[\w.-]+/)
    if (!m) throw new Error(`Unexpected "${ch}" in filter: ${src}`)
    out.push({ k: 'word', v: m[0] })
    i += m[0].length
  }
  return out
}

/** Parse one where-filter string into ANDed conditions. */
export function parseFilter(src: string): FilterCondition[] {
  const toks = tokenize(src)
  const out: FilterCondition[] = []
  let p = 0
  const literal = (): string => {
    const t = toks[p++]
    if (!t) throw new Error(`Filter ends early: ${src}`)
    if (t.k === 'str') return t.v
    // Bare words: booleans (normalized to lower case) and numbers.
    if (t.k === 'word') return /^(true|false)$/i.test(t.v) ? t.v.toLowerCase() : t.v
    throw new Error(`Expected a value in filter: ${src}`)
  }
  while (p < toks.length) {
    const ref = toks[p++]
    if (ref?.k !== 'tmpl') throw new Error(`Expected {{ Dimension('...') }} in filter: ${src}`)
    let op: FilterOp
    const t = toks[p++]
    if (t?.k === 'sym' && t.v === '=') op = '='
    else if (t?.k === 'sym' && t.v === '!=') op = '!='
    else if (t?.k === 'word' && t.v.toLowerCase() === 'in') op = 'in'
    else if (t?.k === 'word' && t.v.toLowerCase() === 'not' && toks[p]?.k === 'word' && (toks[p] as { v: string }).v.toLowerCase() === 'in') {
      p++
      op = 'not in'
    } else throw new Error(`Unsupported operator in filter: ${src}`)

    const values: string[] = []
    if (op === 'in' || op === 'not in') {
      if (!(toks[p]?.k === 'sym' && (toks[p] as { v: string }).v === '(')) throw new Error(`Expected ( after IN in filter: ${src}`)
      p++
      while (true) {
        values.push(literal())
        const sep = toks[p++]
        if (sep?.k === 'sym' && sep.v === ',') continue
        if (sep?.k === 'sym' && sep.v === ')') break
        throw new Error(`Expected , or ) in filter: ${src}`)
      }
    } else values.push(literal())
    out.push({ ref: ref.ref, op, values })

    if (p < toks.length) {
      const and = toks[p++]
      if (!(and.k === 'word' && and.v.toLowerCase() === 'and')) throw new Error(`Only AND is supported between conditions: ${src}`)
    }
  }
  return out
}

const quote = (v: string) => (v === 'true' || v === 'false' ? v : `'${v.replace(/'/g, "''")}'`)

/** Build a where-filter string from a condition (the inverse of parseFilter). */
export function formatFilter(c: FilterCondition): string {
  const tmpl = c.ref.includes('__') ? `{{ Dimension('${c.ref}') }}` : `{{ Entity('${c.ref}') }}`
  if (c.op === 'in' || c.op === 'not in') return `${tmpl} ${c.op} (${c.values.map(quote).join(', ')})`
  return `${tmpl} ${c.op} ${quote(c.values[0] ?? '')}`
}
