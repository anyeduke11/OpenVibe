import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 设计 token 闸（dev-plan §5.5 样式基线 / §P2-7 暗色主题的前置）。
 * 单一出处在 apps/web/src/index.css 的 @theme：换肤只改那一块，因此调用点
 * 既不许残留 Tailwind 字面色阶，也不许引用未声明的语义色名
 * ——Tailwind v4 对未知色名静默不产出 CSS，写错一处是"少个颜色"而不是报错。
 */
const WEB_SRC = join(process.cwd(), 'apps/web/src')
const THEME_FILE = join(WEB_SRC, 'index.css')

const COLOR_UTILS =
  'bg|text|border|ring|divide|outline|fill|stroke|accent|caret|placeholder|from|to|via|decoration|shadow'
const RAW_FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

/** 裸色阶：Tailwind 自带色族 + 纯黑白 —— 收敛后不得再出现在调用点 */
const RAW_PALETTE = new RegExp(
  `(?<![\\w-])(?:${COLOR_UTILS})-(?:${RAW_FAMILIES})-\\d{2,3}(?![\\d])` +
    `|(?<![\\w-])(?:${COLOR_UTILS})-(?:white|black)(?![\\w-])`,
  'g',
)
/** 语义色族（index.css @theme 里声明的角色名）：ink / line / fill / panel / canvas / scrim / brand / on-brand / seal / on-seal / danger / warn / success / info */
const SEMANTIC_CLASS = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*(?:${COLOR_UTILS})-(ink|line|fill|panel|canvas|scrim|brand|on-brand|seal|on-seal|danger|warn|success|info)([a-z0-9-]*)(?![\\w-])`,
  'g',
)
const DECLARED = /--color-([a-z0-9-]+)\s*:/g
const VAR_REF = /var\(--color-([a-z0-9-]+)\)/g

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out.sort()
}

const css = readFileSync(THEME_FILE, 'utf8')
const themeBlock = /@theme\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
const darkBlock = /\[data-theme='dark'\]\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
const cssOutsideTheme = css.replace(themeBlock, '').replace(darkBlock, '')
const files = sources(WEB_SRC)
const all = files.map((f) => [f, readFileSync(f, 'utf8')] as const)
const allSource = all.map(([, s]) => s).join('\n')

function matches(text: string, re: RegExp, group = 1): string[] {
  return [...text.matchAll(re)].map((m) => m[group] ?? '').filter(Boolean)
}

/** 类名 → 色名：`hover:bg-brand-soft/40` 的色名是 `brand-soft` */
function colorNames(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(SEMANTIC_CLASS)) {
    if (m[1]) out.push(m[1] + (m[2] ?? ''))
  }
  return out
}

const declared = matches(themeBlock, DECLARED)
const used = new Set([...colorNames(allSource), ...matches(cssOutsideTheme, VAR_REF)])

function rel(f: string): string {
  return `apps/web/src${f.slice(WEB_SRC.length)}`
}

function line(src: string, at: number): number {
  return src.slice(0, at).split('\n').length
}

describe('WEB-TOKENS · 颜色单一出处', () => {
  it('调用点零残留字面色阶（apps/web/src 全域 .ts/.tsx）', () => {
    const residue: string[] = []
    for (const [f, src] of all) {
      for (const m of src.matchAll(RAW_PALETTE)) {
        residue.push(`${rel(f)}:${line(src, m.index ?? 0)} ${m[0]}`)
      }
    }
    expect(residue).toEqual([])
  })

  it('裸 hex 只住在 token 源内（@theme 亮色块 + data-theme 暗色块），其余规则一律走 var()', () => {
    expect(matches(cssOutsideTheme, /#[0-9a-fA-F]{3,8}\b/g, 0)).toEqual([])
    // 暗色块只允许 --color-* 覆盖，不许夹带别的规则
    const stray = darkBlock
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--color-[a-z0-9-]+\s*:[^;]+;/g, '')
      .replace(/[a-z-]+\s*:\s*;/g, '')
      .replace(/\[data-theme='dark'\]/, '')
      .replace(/[{}\s]/g, '')
    expect(stray).toEqual('')
  })

  it('用到的每个语义色名都在 @theme 里声明了', () => {
    const names = new Set(colorNames(allSource))
    expect([...names].filter((n) => !declared.includes(n))).toEqual([])
  })

  it('声明的每个 token 都被引用（未引用的会被 v4 tree-shake，换肤时静默失效）', () => {
    expect(declared.filter((n) => !used.has(n))).toEqual([])
  })
})
