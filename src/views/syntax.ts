import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import monokai from 'shiki/themes/monokai.mjs'
import solidity from 'shiki/langs/solidity.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import json from 'shiki/langs/json.mjs'
import css from 'shiki/langs/css.mjs'
import html from 'shiki/langs/html.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import shell from 'shiki/langs/shellscript.mjs'
import python from 'shiki/langs/python.mjs'
import rust from 'shiki/langs/rust.mjs'
import go from 'shiki/langs/go.mjs'
import toml from 'shiki/langs/toml.mjs'

export type SyntaxToken = { content: string; color?: string }

const languages: Record<string, string> = {
  sol: 'solidity', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', json: 'json',
  css: 'css', html: 'html', htm: 'html', md: 'markdown', yaml: 'yaml', yml: 'yaml',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', py: 'python',
  rs: 'rust', go: 'go', toml: 'toml',
}
let highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined

/** Tokenize a complete side, so comments and strings keep their state across lines. */
export function highlightLines(lines: string[], path: string): SyntaxToken[][] | undefined {
  const extension = path.split('/').pop()!.split('.').pop()!.toLowerCase()
  const lang = languages[extension]
  // Bound both server work and the extra DOM nodes. Minified files stay plain too.
  if (!lang || !lines.length || lines.length > 2000 || lines.some(line => line.length > 2000)) return
  const code = lines.join('\n')
  if (code.length > 100_000) return
  try {
    highlighter ??= createHighlighterCoreSync({
      themes: [monokai],
      langs: [solidity, typescript, tsx, javascript, jsx, json, css, html, markdown, yaml, shell, python, rust, go, toml],
      engine: createJavaScriptRegexEngine(),
    })
    const { tokens } = highlighter.codeToTokens(code, { lang, theme: 'monokai' })
    if (tokens.reduce((count, line) => count + line.length, 0) > 20_000) return
    return tokens
  } catch {
    // A grammar failure must never prevent reading a diff.
    return
  }
}

/** Intersect syntax and word-diff boundaries without changing the displayed text. */
export function syntaxSpans(tokens: SyntaxToken[], words?: { t: string; chg: boolean }[]) {
  const spans: { text: string; color?: string; changed: boolean }[] = []
  let wordIndex = 0
  let wordOffset = 0
  for (const token of tokens) {
    let offset = 0
    while (offset < token.content.length) {
      const word = words?.[wordIndex]
      const length = Math.min(token.content.length - offset, word ? word.t.length - wordOffset : Infinity)
      spans.push({ text: token.content.slice(offset, offset + length), color: token.color, changed: word?.chg ?? false })
      offset += length
      if (word) {
        wordOffset += length
        if (wordOffset === word.t.length) { wordIndex++; wordOffset = 0 }
      }
    }
  }
  return spans
}
