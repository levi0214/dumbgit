import { stripAnsi } from './git'

export type DecorationToken = {
  kind: 'head' | 'local' | 'remote' | 'tag' | 'other'
  name: string
  head?: boolean
}

/** Split `%d` / parentheses list on commas not inside nested parens. */
function splitDec(inner: string): string[] {
  const parts: string[] = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      const t = cur.trim()
      if (t) parts.push(t)
      cur = ''
      continue
    }
    cur += ch
  }
  const t = cur.trim()
  if (t) parts.push(t)
  return parts
}

function decorationRefParts(decorateRaw: string): string[] {
  const plain = stripAnsi(decorateRaw).trim()
  if (!plain) return []
  const inner = plain.replace(/^\(/, '').replace(/\)$/, '').trim()
  if (!inner) return []
  return splitDec(inner)
}

function parseRefName(raw: string, head = false): DecorationToken {
  const name = stripAnsi(raw).trim()
  const tag = name.match(/^tag:\s*(.+)$/i)
  if (tag) return parseRefName(tag[1] ?? '', head)
  const local = name.match(/^refs\/heads\/(.+)$/)
  if (local) return { kind: 'local', name: local[1] ?? '', head }
  const remote = name.match(/^refs\/remotes\/(.+)$/)
  if (remote) return { kind: 'remote', name: remote[1] ?? '', head }
  const tagFull = name.match(/^refs\/tags\/(.+)$/)
  if (tagFull) return { kind: 'tag', name: tagFull[1] ?? '', head }
  if (/^HEAD$/i.test(name)) return { kind: 'head', name: 'HEAD', head }
  return { kind: 'other', name, head }
}

function parseDecorationToken(raw: string): DecorationToken {
  const plain = stripAnsi(raw).trim()
  const arrow = plain.match(/^(.+?)\s*->\s*(.+)$/)
  if (!arrow) return parseRefName(plain)
  const left = arrow[1]?.trim() ?? ''
  const right = arrow[2]?.trim() ?? ''
  if (/^HEAD$/i.test(left)) return parseRefName(right, true)
  return parseRefName(left)
}

export function decorationTokens(decorateRaw: string): DecorationToken[] {
  return decorationRefParts(decorateRaw)
    .map(parseDecorationToken)
    .filter((t) => t.name)
}
