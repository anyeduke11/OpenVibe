/**
 * W-0① 漂移形态探针（refactor-goal-plan §3.1 W-0① · 分析文 §10-2 的机制验证半）
 *
 * 回答什么：D32（段级受管标记进契约）签字需要的证据分两半——
 *   (a) 「真实用户的漂移集中在哪里」的**分布**结论：采样前提 = 存在 ≥2 个真实注入项目。
 *       本机现测 4 个登记项目的注入产物为 0（.openvibe/ 目录全缺、injections 表空），
 *       ⇒ 分布半**结构性缺样本**，本探针不产出、不编造。
 *   (b) 「分类器对每类形态能否给出段级归因」的**机制**结论：本探针用 tests/golden/G1 的
 *       真实冻结字节作输入，对 5 类漂移形态逐一来 diffSections（RQ4 纯函数），
 *       证明「真实样本到来时统计即可跑」——这是 (a) 的工具链就绪证明。
 *
 * 附带发现（2026-11-20 首跑）：TERMS.md 的冻结字节**不含受管标记** ⇒ 它的全部漂移
 * 只能按「块外自由区」归因——这正是 D32 的盲区实证：无壳文件没有段级能力。
 *
 * 运行（仓库根目录）：node --import tsx docs/devlog-evidence/refactor-w0/drift-shape-probe.mjs
 * 产物：stdout JSON（落 .txt 入库，不落 .log——仓库 .gitignore 含 *.log）。
 * 只读 + 临时目录写，零副作用于仓库与用户数据。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diffSections } from '@openvibe/core'

const GOLDEN = join(process.cwd(), 'tests/golden/G1/files')
const FILES = ['CLAUDE.md', 'AGENTS.md', 'TERMS.md']

// ── 五类漂移形态（每类给出「若发生在真实注入项目」的等价场景描述）──
// mutate(lines, begin, end, hasShell)：begin/end 为标记行号（无壳时均 -1）
const scenarios = [
  {
    id: 'S1-managed-edit',
    desc: '受管块内改 1 行（包更新后内容过时，用户手改了某句）',
    realEquivalent: '用户在 AI 助手建议下改了受管正文的一行',
    mutate: (lines, begin, end, hasShell) => {
      const out = [...lines]
      if (hasShell) {
        for (let i = begin + 1; i < end; i++) {
          if (out[i].trim() !== '') {
            out[i] += '（用户手改）'
            break
          }
        }
      } else {
        // 无壳文件：改动只能落全文件（如实等价——无壳文件没有「受管块内」概念）
        for (let i = 0; i < out.length; i++) {
          if (out[i].trim() !== '') {
            out[i] += '（用户手改）'
            break
          }
        }
      }
      return out
    },
  },
  {
    id: 'S2-free-append',
    desc: '块外自由区纯新增（用户在产物文件尾部写了自己的内容）',
    realEquivalent: '用户往 CLAUDE.md 尾部加自己的项目约定',
    mutate: (lines, begin, end, hasShell) =>
      hasShell
        ? [
            ...lines.slice(0, end + 1),
            '',
            '## 我自己的约定（用户自由区）',
            '本段由用户手写，与包无关。',
            ...lines.slice(end + 1),
          ]
        : [...lines, '', '## 我自己的约定（用户自由区）', '本段由用户手写，与包无关。'],
  },
  {
    id: 'S3a-rewrite-with-shell',
    desc: '整文件重写但保留壳（AI 全量重写正文，标记仍在）',
    realEquivalent: '用户让 AI「重写整个 CLAUDE.md」，AI 保留了 openvibe 标记',
    mutate: (lines, begin, end, hasShell) =>
      hasShell
        ? [
            ...lines.slice(0, begin + 1),
            '# 全新正文（AI 重写）',
            '这一版与包内容完全不同。',
            ...lines.slice(end),
          ]
        : ['# 全新正文（AI 重写）', '这一版与包内容完全不同。'],
  },
  {
    id: 'S3b-unshelled',
    desc: '用户删除标记（去壳）：受管块边界消失',
    realEquivalent: '用户嫌标记碍眼删掉了 openvibe 注释行',
    mutate: (lines, begin, end, hasShell) =>
      hasShell
        ? [...lines.slice(0, begin), ...lines.slice(begin + 1, end), ...lines.slice(end + 1)]
        : lines, // 本就无壳：场景不适用，如实报告
  },
  {
    id: 'S4-mixed',
    desc: '并存：受管块内改 1 行 + 自由区加 1 行',
    realEquivalent: '最常见的真实形态：既有手改又有追加',
    mutate: (lines, begin, end, hasShell) => {
      let out = [...lines]
      if (hasShell) {
        for (let i = begin + 1; i < end; i++) {
          if (out[i].trim() !== '') {
            out[i] += '（并存手改）'
            break
          }
        }
        out.splice(end + 1, 0, '', '用户自由区追加行。')
      } else {
        for (let i = 0; i < out.length; i++) {
          if (out[i].trim() !== '') {
            out[i] += '（并存手改）'
            break
          }
        }
        out = [...out, '', '用户自由区追加行。']
      }
      return out
    },
  },
]

function sliceOf(text) {
  const lines = text.split('\n')
  const begin = lines.findIndex((l) => l.includes('openvibe:pack='))
  const end = begin >= 0 ? lines.findIndex((l, i) => i > begin && l.includes('openvibe:end')) : -1
  return { lines, begin, end, hasShell: begin >= 0 && end > begin }
}

const report = {
  meta: {
    dateUTC: new Date().toISOString().slice(0, 10),
    classifier: 'diffSections (packages/core/src/inject/section-diff.ts, RQ4)',
    inputs: FILES.map((f) => `tests/golden/G1/files/${f}`),
    disclaimer: '合成样本仅验证机制，不构成真实用户漂移分布证据（真实样本现测 = 0）',
  },
  scenarios: [],
}

for (const sc of scenarios) {
  const entry = { id: sc.id, desc: sc.desc, realEquivalent: sc.realEquivalent, files: [] }
  for (const f of FILES) {
    const expected = readFileSync(join(GOLDEN, f), 'utf8')
    const { lines, begin, end, hasShell } = sliceOf(expected)
    const actual = sc.mutate(lines, begin, end, hasShell).join('\n')
    const unchanged = actual === expected
    const r = diffSections(expected, actual)
    const attributable =
      !unchanged &&
      (r.regions.some((rg) => rg.status === 'changed' || rg.missing) ||
        r.managedChanged ||
        r.freeChanged)
    entry.files.push({
      file: f,
      hasShell,
      scenarioApplicable: !unchanged || sc.id === 'S3b-unshelled',
      managedChanged: r.managedChanged,
      freeChanged: r.freeChanged,
      regions: r.regions.map(
        (rg) =>
          `${rg.region}: ${rg.status}${rg.missing ? '/missing' : ''} (exp ${rg.expectedLines} 行 / act ${rg.actualLines} 行)`,
      ),
      attributable,
    })
  }
  const applicable = entry.files.filter((x) => x.scenarioApplicable)
  entry.allAttributable = applicable.length > 0 && applicable.every((x) => x.attributable)
  report.scenarios.push(entry)
}

report.summary = {
  scenariosRun: report.scenarios.length,
  filesPerScenario: FILES.length,
  allScenariosAttributable: report.scenarios.every((s) => s.allAttributable),
  shellFinding: 'TERMS.md 冻结字节不含受管标记 ⇒ 其漂移只能自由区/文件级归因（D32 盲区实证）',
  realSampleCount: 0,
  realSampleCountBasis:
    '4 个登记项目（owner 库 projects 表）.openvibe/ 目录全缺 + injections 表 0 行（2026-11-20 现测）',
  distributionConclusion:
    '不出具（样本为 0）。真实样本触发条件：任一项目执行 openvibe sync 注入后，按本报告的 regions 字段逐项目复跑统计。',
}

console.log(JSON.stringify(report, null, 2))
