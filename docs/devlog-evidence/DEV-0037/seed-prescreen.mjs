/**
 * 待决策项 ① 的机械预筛（分诊用，不是裁决）。
 * 判据全部写死在这里，可复算：node docs/devlog-evidence/DEV-0037/seed-prescreen.mjs [--base-ref <ref>]
 * 输出 = 每条术语/提示词命中的判据编号与命中片段；命中 ≥2 条进短名单候选。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const a = process.argv.slice(2)
const bi = a.indexOf('--base-ref')
const BASE = bi >= 0 ? (a[bi + 1] ?? 'HEAD') : '6c33b50'
const load = (rel, ref) =>
  JSON.parse(
    ref ? execFileSync('git', ['show', `${ref}:${rel}`], { encoding: 'utf8' }) : readFileSync(join(REPO, rel), 'utf8'),
  ).items

const terms = load('content/seed/terms.json', null)
const baseKeys = new Set(load('content/seed/terms.json', BASE).map((t) => `${t.zh}\u0000${t.en}`))
const fresh = terms.filter((t) => !baseKeys.has(`${t.zh}\u0000${t.en}`))
const prompts = load('content/seed/prompts.json', null)
const pBase = new Set(load('content/seed/prompts.json', BASE).map((p) => p.title))
const freshP = prompts.filter((p) => !pBase.has(p.title))

const HYPER = ['最', '唯一', '绝不', '永远', '完美', '无缝', '极大', '必然', '根本无法', '一律', '所有', '任何']
const long = (s) => [...(s ?? '')].length

function screenTerm(t, all) {
  const hits = []
  const d = t.definition ?? ''
  const e = t.example ?? ''
  // S1 绝对化 / 推销词（定义里）
  const s1 = HYPER.filter((w) => d.includes(w))
  if (s1.length) hits.push(`S1 绝对化词[${s1.join(',')}]`)
  // S2 示例缺可验细节：无数字、无 ASCII 标识符、无文件后缀
  if (!/[0-9]/.test(e) && !/[A-Za-z_][A-Za-z0-9_.-]{2,}/.test(e)) hits.push('S2 示例无可验细节')
  // S3 定义过长
  if (long(d) > 105) hits.push(`S3 定义 ${long(d)} 字`)
  // S4 AI 腔形态：破折号 / 分号堆叠 / 「而非」转折
  const s4 = []
  if (d.includes('——')) s4.push('——')
  if ((d.match(/；/g) ?? []).length >= 2) s4.push('两个以上分号')
  if (d.includes('而非') || /不是[^；。]{0,20}而是/.test(d)) s4.push('而非/不是…而是')
  if (s4.length) hits.push(`S4 AI 腔形态[${s4.join(',')}]`)
  // S5 近义重叠：与其他词条的 en 归一相同，或 zh 互为包含
  const norm = (s) => (s ?? '').toLowerCase().replace(/[\s-]/g, '')
  const dup = all.filter(
    (o) => o !== t && (norm(o.en) === norm(t.en) || (o.zh && t.zh && (o.zh.includes(t.zh) || t.zh.includes(o.zh)))),
  )
  if (dup.length) hits.push(`S5 与[${dup.map((o) => o.zh).join(',')}]重叠`)
  // S6 示例与定义主题脱节：中文 2-gram 重合率
  const grams = (s) => new Set([...s].map((_, i) => s.slice(i, i + 2)).filter((g) => /[\u4e00-\u9fa5]{2}/.test(g)))
  const gd = grams(d)
  const ge = grams(e)
  const rate = ge.size ? [...ge].filter((g) => gd.has(g)).length / ge.size : 0
  if (e && rate < 0.08) hits.push(`S6 示例脱节(重合 ${(rate * 100).toFixed(0)}%)`)
  return hits
}

for (const t of fresh) {
  const hits = screenTerm(t, terms)
  console.log(`| ${t.zh} | ${t.en ?? ''} | ${hits.length} | ${hits.join(' ; ') || '（无命中）'} |`)
}
console.log('---PROMPTS---')
for (const p of freshP) {
  const hits = []
  const d = p.description ?? ''
  const s1 = HYPER.filter((w) => d.includes(w))
  if (s1.length) hits.push(`S1 绝对化词[${s1.join(',')}]`)
  if (long(d) > 60) hits.push(`S3 意图 ${long(d)} 字`)
  if (d.includes('——') || (d.match(/；/g) ?? []).length >= 2) hits.push('S4 AI 腔形态')
  if (!/[0-9A-Za-z_.]/.test(d)) hits.push('S2 意图无可验细节')
  // 提示词正文：变量是否被正文真的用到、有无「请确保/尽量」式空话
  const body = p.content ?? ''
  const vars = [...body.matchAll(/\{\{\s*([A-Za-z_][\w-]*)\s*\}\}/g)].map((m) => m[1])
  const hollow = ['请确保', '尽量', '尽可能', '适当地', '合理地', '注意'].filter((w) => body.includes(w))
  if (hollow.length) hits.push(`P1 空话词[${hollow.join(',')}]`)
  if (vars.length === 0 && p.useAs === 'reference') hits.push('P2 无变量占位')
  console.log(`| ${p.title} | ${p.useAs ?? 'reference'} | ${hits.length} | ${hits.join(' ; ') || '（无命中）'} |`)
}
