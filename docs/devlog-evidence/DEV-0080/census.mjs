#!/usr/bin/env node
// V1 墨阶 token 的 AA 缺陷普查：可复算驱动器（口径全写在本文件，数字不进断言字面量）
// 用法：node docs/devlog-evidence/DEV-0080/census.mjs
// 样本：apps/web/src 下全部 .ts/.tsx/.css（排除 dist/ 与 node_modules/）
// 计数单位：一次标识符出现 = 一处；正则 \b<token>\b；区分「自述位」（index.css 内的声明与注释）与「消费位」（其余文件）
// 对比度：WCAG 2.1 相对亮度公式，输入是 index.css 里的裸 hex（手算，非浏览器取色）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'apps/web/src')
const CSS = join(SRC, 'index.css')
const TOKENS = ['ink-faint', 'ink-subtle']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p)
  }
  return out
}

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(fg, bg) {
  const [a, b] = [lum(fg), lum(bg)]
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// index.css 的亮色 @theme 块 = 第一个 data-theme='dark' 之前的部分
const cssAll = readFileSync(CSS, 'utf8')
const lightBlock = cssAll.slice(0, cssAll.search(/\[data-theme='dark'\]/))
function token(name, block = lightBlock) {
  const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token not declared: ${name}`)
  return m[1]
}

const panel = token('panel')
const canvas = token('canvas')
console.log(`亮色底：panel ${panel} / canvas ${canvas}`)
for (const t of TOKENS) {
  const hex = token(t)
  console.log(
    `AA ${t} ${hex}  on panel  = ${ratio(hex, panel).toFixed(2)}:1`,
    `| on canvas = ${ratio(hex, canvas).toFixed(2)}:1`,
  )
}

let selfSite = 0
const consume = new Map(TOKENS.map((t) => [t, 0]))
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  for (const t of TOKENS) {
    const n = (src.match(new RegExp(`\\b${t}\\b`, 'g')) || []).length
    if (!n) continue
    if (file === CSS) selfSite += n
    else consume.set(t, consume.get(t) + n)
  }
}
let total = 0
for (const [t, n] of consume) {
  console.log(`消费位 ${t} = ${n} 处`)
  total += n
}
console.log(`消费位合计 = ${total} 处（自述位 index.css = ${selfSite} 处，不计入缺陷面）`)
console.log(`样本文件数 = ${walk(SRC).length}`)
