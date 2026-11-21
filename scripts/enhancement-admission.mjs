#!/usr/bin/env node
/**
 * scripts/enhancement-admission.mjs —— 按 CLAUDE.md 的四条准入测试，回测 DEV_LOG 的收尾类条目（DEV-0227 方案第 4 步）。
 *
 * ## 它解决什么
 *
 * DEV-0227 只回测了近 8 条收尾项（人工判定），并自承「样本小且主观」。本脚本把判定**机检化**：
 * 对 DEV_LOG 里全部「含收尾/增强」的条目跑同一组判据，产出完整判定表，把「产单量约减半」从估算变成实测。
 *
 * ## 四条准入测试的机检口径
 *
 * | 测试 | 机检判据 | 命中即通过 |
 * |---|---|---|
 * | **来源** | 含「判据/闸/覆盖/核对/自检/清单/校验/失效/漂移/漏/缺」等「已声明不变量 × 既有表面」词汇 | 是 |
 * | **证据** | 含「实测/复算/现测/证伪/报红/探针/日志/采样」等可复现证据词汇 | 是 |
 * | **去重** | 该条 DEV 的标题或正文含「并入/既有验收/已覆盖/同构/重复」等去重信号，**或**其收尾项被后续条目引用时未新增工作项 | 否（未命中=通过） |
 * | **范围** | 含「判据/闸/工具/文档/测试/脚本/契约/可读性/性能」等本仓核心价值词汇 | 是 |
 *
 * **判定规则**：四条全过 → `通过`；「去重」命中 → `并入既有验收`；「证据」未过 → `进观察池`；「来源」未过 → `不成立`。
 *
 * ⚠️ **机检的边界**：关键词匹配判不了语义。`去重` 一条尤其弱 —— 它判的是「有没有说去重」，
 *   不是「是否真的重复」。本脚本的产出**供人工复核起点**，与 `risk-disposition.mjs` 同一口径。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/enhancement-admission.mjs           # 打印判定表
 * node scripts/enhancement-admission.mjs --stat    # 只打印分布
 * node scripts/enhancement-admission.mjs --json    # JSON 输出
 * ```
 *
 * 退出码：`0` 正常；`1` DEV_LOG 读不到或无收尾类条目。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DEV_LOG = resolve(REPO, 'DEV_LOG.md')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const asStat = argv.includes('--stat')

/** 收尾类条目的识别：标题含这些词 */
const CLOSURE_RE = /增强|收口|收尾|补齐|闭合|补齐|落定|收口/

/** 四条准入测试的机检判据 */
const TESTS = {
  source: {
    name: '来源',
    re: /判据|闸|覆盖|核对|自检|清单|校验|失效|漂移|漏|缺|边界|提取|解析|快照|哈希|前缀|幂等|事务|一致性|隔离|并发|回滚|迁移/i,
    passHint: '落在已声明不变量 × 既有表面',
  },
  evidence: {
    name: '证据',
    re: /实测|复算|现测|证伪|报红|探针|日志|采样|运行|执行|抓到|命中|复现|基线|快照|exit|退出码/,
    passHint: '有可复现证据',
  },
  dup: {
    name: '去重',
    re: /并入|既有验收|已覆盖|同构|重复|不再另立|不另立|共用|单一出处/,
    passHint: '命中去重信号 → 应并入既有验收',
  },
  scope: {
    name: '范围',
    re: /判据|闸|工具|文档|测试|脚本|契约|可读性|性能|安全|兼容性|可访问性|可验证|可复算|产物|CLI|规格|spec/i,
    passHint: '服务核心价值',
  },
}

function judge(entry) {
  const hits = {
    source: TESTS.source.re.test(entry),
    evidence: TESTS.evidence.re.test(entry),
    dup: TESTS.dup.re.test(entry),
    scope: TESTS.scope.re.test(entry),
  }
  if (hits.dup) return { verdict: '并入既有验收', hits, failed: ['去重（命中去重信号）'] }
  if (!hits.source) return { verdict: '不成立', hits, failed: ['来源'] }
  if (!hits.evidence) return { verdict: '进观察池', hits, failed: ['证据'] }
  if (!hits.scope) return { verdict: '不成立', hits, failed: ['范围'] }
  return { verdict: '通过', hits, failed: [] }
}

let text
try {
  text = readFileSync(DEV_LOG, 'utf8')
} catch (err) {
  console.error(`读不到 DEV_LOG：${DEV_LOG}\n  ${err.message}`)
  process.exit(1)
}

const lines = text.split('\n')
const heads = []
lines.forEach((l, i) => {
  if (/^## \[DEV-/.test(l)) heads.push({ no: l.match(/DEV-(\d+)/)?.[1], start: i, raw: l })
})
heads.forEach((h, idx) => {
  h.end = idx + 1 < heads.length ? heads[idx + 1].start : lines.length
  h.title = h.raw
    .replace(/^## \[/, '')
    .replace(/\]\s*/, ' ')
    .trim()
})

const entries = heads
  .filter((h) => CLOSURE_RE.test(h.title))
  .map((h) => {
    const body = lines.slice(h.start, h.end).join('\n')
    const { verdict, hits, failed } = judge(h.title + '\n' + body)
    return { dev: `DEV-${h.no}`, title: h.title.slice(0, 90), verdict, hits, failed }
  })

if (entries.length === 0) {
  console.error('未找到收尾类条目 —— 识别正则可能需调整')
  process.exit(1)
}

if (asJson) {
  console.log(JSON.stringify(entries, null, 2))
} else if (asStat) {
  const by = {}
  for (const e of entries) by[e.verdict] = (by[e.verdict] ?? 0) + 1
  console.log(`收尾类条目总数：${entries.length}`)
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${k.padEnd(10)} ${String(v).padStart(4)}  (${((v / entries.length) * 100).toFixed(1)}%)`,
    )
  }
  const pass = entries.filter((e) => e.verdict === '通过').length
  const dup = entries.filter((e) => e.verdict === '并入既有验收').length
  console.log(`\n通过准入：${pass}（${((pass / entries.length) * 100).toFixed(1)}%）`)
  console.log(`应并入既有验收：${dup}（${((dup / entries.length) * 100).toFixed(1)}%）`)
  console.log(
    `产单量预估：原 ${entries.length} → 通过 ${pass}，降幅 ${(((entries.length - pass) / entries.length) * 100).toFixed(1)}%`,
  )
} else {
  console.log(`# 收尾类条目准入判定表（共 ${entries.length} 条）\n`)
  console.log('| DEV | 判定 | 未通过 | 标题 |')
  console.log('| --- | --- | --- | --- |')
  for (const e of entries) {
    console.log(
      `| ${e.dev} | ${e.verdict} | ${e.failed.join('、') || '—'} | ${e.title.replace(/\|/g, '\\|')} |`,
    )
  }
  const by = {}
  for (const e of entries) by[e.verdict] = (by[e.verdict] ?? 0) + 1
  console.log('\n## 分布\n')
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${k}：${v}（${((v / entries.length) * 100).toFixed(1)}%）`)
  }
  console.log(
    `\n> 判定为**机械关键词匹配**，供人工复核起点，不作为最终裁定。四条测试的口径见脚本文件头。`,
  )
}
