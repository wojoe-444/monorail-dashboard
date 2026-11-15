/**
 * Safe evaluator for derived-metric expressions, e.g.
 *   (rail_entries - rail_entries_ly) / nullif(rail_entries_ly, 0)
 * Numbers, identifiers, + - * /, parentheses, and the SQL functions MetricFlow
 * users reach for (nullif, coalesce, abs, greatest, least). Null propagates like SQL.
 * Never uses eval.
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'id'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

type Token = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
    } else if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < src.length && /[0-9.eE]/.test(src[j])) j++
      out.push({ k: 'num', v: Number(src.slice(i, j)) })
      i = j
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < src.length && /\w/.test(src[j])) j++
      out.push({ k: 'id', v: src.slice(i, j) })
      i = j
    } else if ('+-*/(),'.includes(ch)) {
      out.push({ k: 'op', v: ch })
      i++
    } else {
      throw new Error(`Unexpected "${ch}" in expression: ${src}`)
    }
  }
  return out
}

export function parseExpr(src: string): Node {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (v: string) => peek()?.k === 'op' && peek()?.v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" in expression: ${src}`)
    pos++
  }

  function primary(): Node {
    const tok = tokens[pos++]
    if (!tok) throw new Error(`Unexpected end of expression: ${src}`)
    if (tok.k === 'num') return { t: 'num', v: tok.v }
    if (tok.k === 'op' && tok.v === '(') {
      const e = additive()
      expect(')')
      return e
    }
    if (tok.k === 'op' && tok.v === '-') return { t: 'neg', a: primary() }
    if (tok.k === 'id') {
      if (isOp('(')) {
        pos++
        const args: Node[] = []
        if (!isOp(')')) {
          args.push(additive())
          while (isOp(',')) {
            pos++
            args.push(additive())
          }
        }
        expect(')')
        return { t: 'call', fn: tok.v.toLowerCase(), args }
      }
      return { t: 'id', name: tok.v }
    }
    throw new Error(`Unexpected "${tok.v}" in expression: ${src}`)
  }
  function multiplicative(): Node {
    let left = primary()
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].v as '*' | '/'
      left = { t: 'bin', op, a: left, b: primary() }
    }
    return left
  }
  function additive(): Node {
    let left = multiplicative()
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v as '+' | '-'
      left = { t: 'bin', op, a: left, b: multiplicative() }
    }
    return left
  }

  const node = additive()
  if (pos !== tokens.length) throw new Error(`Unexpected trailing input in expression: ${src}`)
  return node
}

export function identifiers(node: Node, out = new Set<string>()): Set<string> {
  if (node.t === 'id') out.add(node.name)
  else if (node.t === 'neg') identifiers(node.a, out)
  else if (node.t === 'bin') {
    identifiers(node.a, out)
    identifiers(node.b, out)
  } else if (node.t === 'call') node.args.forEach((a) => identifiers(a, out))
  return out
}

export function evalExpr(node: Node, env: (name: string) => number | null): number | null {
  switch (node.t) {
    case 'num':
      return node.v
    case 'id':
      return env(node.name)
    case 'neg': {
      const a = evalExpr(node.a, env)
      return a === null ? null : -a
    }
    case 'bin': {
      const a = evalExpr(node.a, env)
      const b = evalExpr(node.b, env)
      if (a === null || b === null) return null
      if (node.op === '+') return a + b
      if (node.op === '-') return a - b
      if (node.op === '*') return a * b
      return b === 0 ? null : a / b
    }
    case 'call': {
      const args = node.args.map((a) => evalExpr(a, env))
      switch (node.fn) {
        case 'nullif':
          return args[0] === args[1] ? null : (args[0] ?? null)
        case 'coalesce':
          return args.find((a) => a !== null) ?? null
        case 'abs':
          return args[0] === null ? null : Math.abs(args[0])
        case 'greatest':
          return args.some((a) => a === null) ? null : Math.max(...(args as number[]))
        case 'least':
          return args.some((a) => a === null) ? null : Math.min(...(args as number[]))
        default:
          throw new Error(`Unsupported function ${node.fn}()`)
      }
    }
  }
}

export type { Node as ExprNode }
