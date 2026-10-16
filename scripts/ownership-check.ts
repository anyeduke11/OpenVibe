/**
 * ownership:check —— 提交归属核验（2026-10-16）。
 *
 * ## 它解决的是「哪些脏文件能提交」这个必须靠人工判断、却最容易判断错的问题
 *
 * 本仓反复踩的坑不是「不知道文件变了」，而是 **`git status --short` 只告诉你文件变了，
 * 不告诉你那行改动是谁写的**。已实测两次因此打脸：
 *
 * 1. 并行会话把 HEAD 已落地的 M4 文档**回退**了且未提交。若照 `git status` 的文件名单
 *    整文件 `git add <file>`，会把**别人的回退**一起带进自己的 commit。
 * 2. 本会话文件清单这种历史记录本身也可能含错项 —— **它不是证据，diff 才是**。
 *
 * 所以本脚本的口径固定为三条：
 * - **判据是 diff 的内容方向，不是文件名**。因此每个文件都给出 `+N -M` 与新增行片段。
 * - **「禁区」是一等公民**：命中即 `hold`，不做人工裁量。
 * - **「混了」要能被机器指出来**：给一组「标志字样」，只要该文件的新增行里命中了
 *   非本会话特征（`--marker` 传入），即使它同时被列为本会话文件，也强制降级为 `review`。
 *
 * ## 为什么不做「自动判断归属」
 * 归属是**语义**问题（这行改动是不是本会话想要的），机器判不了。
 * 本脚本刻意停在「把候选和证据摆齐、把明显不该提交的拦下」这一步，
 * 最终放行由人点。它退出的非零码只表示「还有需要人看的」，不表示「一定错」。
 *
 * ## 退出码
 * - `0`：无 `review`、无 `hold`
 * - `1`：存在 `review`（含「混了」被强制降级的）—— 提交前必须逐个看过
 * - `2`：用法错误
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** 一个脏文件的原始事实（由 git 层采集，交给纯函数判定） */
export interface DirtyFile {
  path: string
  /** porcelain 两字母状态，如 ' M' / '??' / 'A ' */
  status: string
  added: number
  removed: number
  /** 新增行内容（已去 `+` 前缀，且截断） */
  addedLines: string[]
}

export interface Rule {
  label: string
  reason: string
  pattern: RegExp
}

export interface Verdict {
  path: string
  status: string
  added: number
  removed: number
  /** commit | hold | review */
  verdict: 'commit' | 'hold' | 'review'
  label: string
  reason: string
  /** 命中标志字样的新增行原文（最多 5 条，供人一眼辨认） */
  markerHits: string[]
  /** 标志命中是否属「自引用」被豁免（该文件本就引用标志字样，如 fixture） */
  exempt: boolean
  addedLines: string[]
}

export interface OwnershipReport {
  files: Verdict[]
  commitCount: number
  holdCount: number
  reviewCount: number
  /** 命中任一标志字样的路径；非空即「疑似混了他人的改动」 */
  mixed: string[]
}

const ADDED_LINE_CAP = 200
const MARKER_ECHO_CAP = 5

/**
 * 核心判定（纯函数，便于测试）。
 *
 * 判定顺序刻意是 **禁区 → 混了 → 本会话 → 未判定**，理由：
 * 禁区永远压过一切；「混了」压过「本会话」——因为一个同时含有他人特征的文件，
 * 整文件提交就会把别人的改动带进去，这正是本工具要防的头号事故。
 */
export function classify(
  files: DirtyFile[],
  opts: { forbidden: Rule[]; owned: Rule[]; markers: RegExp[]; selfQuoting?: RegExp[] },
): OwnershipReport {
  const selfQuoting = opts.selfQuoting ?? []
  const out: Verdict[] = files.map((f) => {
    // ⚠️ 计数用**真值**，只有回显才截断。先 slice 再数会让理由里的条数变成封顶值，
    // 报告就会说「命中 5 条」而实际命中 12 条 —— 计数失真比不计数更坏。
    const allHits = f.addedLines.filter((l) => opts.markers.some((m) => m.test(l)))
    const markerHits = allHits.slice(0, MARKER_ECHO_CAP)
    // 自引用豁免：本工具的判据测试把标志字样当 fixture 写进源码，
    // 不豁免就会把自己判成「混入他人改动」—— 与「校验命令会扫到自己」同一类问题。
    const exempt = markerHits.length > 0 && selfQuoting.some((p) => p.test(f.path))

    const hitForbidden = opts.forbidden.find((r) => r.pattern.test(f.path))
    const hitOwned = opts.owned.find((r) => r.pattern.test(f.path))

    const base = (): Pick<Verdict, 'verdict' | 'label' | 'reason'> => {
      if (hitForbidden)
        return { verdict: 'hold', label: hitForbidden.label, reason: hitForbidden.reason }
      if (hitOwned) return { verdict: 'commit', label: hitOwned.label, reason: hitOwned.reason }
      return { verdict: 'review', label: '未判定', reason: '未命中任何规则，需人工判断归属' }
    }

    let v = base()
    // 「混了」强制降级：即使在 owned 名单里，也不能整文件提交
    if (allHits.length > 0 && v.verdict === 'commit' && !exempt) {
      v = {
        verdict: 'review',
        label: '疑似混入他人改动',
        reason: `新增行命中标志字样 ${allHits.length} 条，整文件提交会夹带他人改动；需局部暂存或留待工作树`,
      }
    }

    return {
      path: f.path,
      status: f.status,
      added: f.added,
      removed: f.removed,
      addedLines: f.addedLines,
      ...v,
      markerHits,
      exempt,
    }
  })

  out.sort((a, b) => {
    const rank = { hold: 0, review: 1, commit: 2 } as const
    return rank[a.verdict] - rank[b.verdict] || a.path.localeCompare(b.path)
  })

  return {
    files: out,
    commitCount: out.filter((v) => v.verdict === 'commit').length,
    holdCount: out.filter((v) => v.verdict === 'hold').length,
    reviewCount: out.filter((v) => v.verdict === 'review').length,
    mixed: out.filter((v) => v.markerHits.length > 0 && !v.exempt).map((v) => v.path),
  }
}

function git(args: string[], cwd: string): string {
  return spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? ''
}

/** 采集工作树脏文件。未跟踪文件（`??`）没有 diff，改为直接数行数并取全部内容。 */
export function collectDirty(repoRoot: string): DirtyFile[] {
  const porcelain = git(['status', '--porcelain'], repoRoot)
  const files: DirtyFile[] = []
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue
    const status = line.slice(0, 2)
    const path = line.slice(3).trim()
    if (path.includes(' -> ')) {
      // 重命名：取右侧目标路径
      const parts = path.split(' -> ')
      files.push(...collectOne(repoRoot, parts[1]!.trim(), status))
      continue
    }
    files.push(...collectOne(repoRoot, path, status))
  }
  return files
}

function collectOne(repoRoot: string, path: string, status: string): DirtyFile[] {
  if (status.includes('??')) {
    const proc = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', path], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (!proc.stdout?.trim()) return []
    let content = ''
    try {
      content = readFileSync(`${repoRoot}/${path}`, 'utf8')
    } catch {
      content = ''
    }
    const lines = content.split('\n').filter((l) => l.length > 0)
    return [{ path, status, added: lines.length, removed: 0, addedLines: lines.slice(0, ADDED_LINE_CAP) }]
  }
  const numstat = git(['diff', '--numstat', '-M', '--', path], repoRoot).split('\n')[0] ?? ''
  const [a, r] = numstat.split('\t')
  const raw = git(['diff', '-U0', '-M', '--', path], repoRoot)
  const addedLines = raw
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .slice(0, ADDED_LINE_CAP)
  return [
    {
      path,
      status,
      added: Number(a) || 0,
      removed: Number(r) || 0,
      addedLines,
    },
  ]
}

/* ------------------------------------------------------------------ 规则表 */

/**
 * 禁区：并行会话正在改、或与他人改动混在一起的文件。命中即 `hold`。
 * 这份名单是**人工维护的事实登记**，不是猜测；改动前先确认并行会话的进展。
 */
/**
 * 本会话清单：命中即 `commit`，除非同时命中禁区或标志字样（那会被强制降级为 `review`）。
 *
 * 刻意用**目录级**规则而非逐文件列举 —— 逐文件列举的清单本身会过期，而本会话的产出
 * 天然成组（CLI 命令与服务端、台账核心与 shared、脚本与闸、配置与文档）。
 * 目录级规则的副作用是可能过宽，但过宽的兜底是「降级为 review 由人看」，
 * 而非「直接提交」—— 方向是安全的。
 */
export const OWNED: Rule[] = [
  { label: '本会话·CLI', reason: 'M8 CLI 命令与其测试（ask/status/session/requirement）', pattern: /^apps\/cli\/(src|test)\// },
  { label: '本会话·服务端', reason: 'M8 端点、台账写入点与其测试', pattern: /^apps\/server\/(src|test)\// },
  { label: '本会话·核心', reason: '0-f 台账 repo、agentService、commandRunService、inject', pattern: /^packages\/core\/src\// },
  { label: '本会话·shared', reason: 'shared schema、CLI 命令登记与常量', pattern: /^packages\/shared\/src\// },
  { label: '本会话·闸与脚本', reason: '变异腿执行器、归属核验工具、文档治理闸及其判据测试', pattern: /^(scripts\/(mutation-run|ownership-check|docs-check)\.ts|tests\/)/ },
  { label: '本会话·配置', reason: 'vitest 并发上限与 package.json 脚本登记', pattern: /^(vitest\.config\.ts|package\.json)$/ },
  { label: '本会话·文档', reason: 'M8/台账/服务层规格、README、DEV_LOG、治理闸基线与输出规范', pattern: /^(README\.md|DEV_LOG\.md|CLAUDE\.md|docs\/dev-plan-v0\.2\.1\.md|docs\/specs\/|docs\/docs-check-baseline\.json)/ },
  { label: '本会话·CI', reason: '第六道闸 docs:check 的追加（只增不改既有五闸）', pattern: /^\.github\/workflows\/ci\.yml$/ },
]

export const FORBIDDEN: Rule[] = [
  { label: '禁区·并行会话前端', reason: 'apps/web 60 个文件属并行会话，本会话未授权改动', pattern: /^apps\/web\// },
  { label: '禁区·M4 回退', reason: '并行会话把已落地的 M4 文档回退，属他人改动', pattern: /^docs\/(dev-plan|decisions|tasks)\.md$/ },
  { label: '禁区·M4 回退', reason: '并行会话回退的 M4 规格', pattern: /^docs\/specs\/m[46]-/ },
  { label: '禁区·navCounts', reason: '并行会话的 navCounts 相关文件', pattern: /navCounts|schemas\/nav\.ts$/ },
  { label: '禁区·演示目录', reason: 'demo/ 与 redesign/ 不属本会话', pattern: /^(demo|redesign)\// },
]

/**
 * 标志字样：出现在**新增行**里就说明该文件可能夹带他人改动。
 * 用它把「混了」从人工肉眼升级为机器可检。
 *
 * ⚠️ 只收**精准的回退字样**，不收宽泛的模式。
 * 曾经试过用「新增行以 `- ` 开头」当标志，结果把每一个 Markdown 列表项都判成「混入」——
 * 噪音淹没信号，工具当场作废。判据宁窄勿宽：宁可漏报由人补，也不可满屏误报。
 */
export const DEFAULT_MARKERS: RegExp[] = [
  /人日未估/, // dev-plan 把已估人日退回未估
  /恒为 \[\]/, // m6-standard-pack 把已上线的 playbookIds 退回空
  /M4 未上/, // 把已落地的 M4 退回未上
  /已裁已落/, // decisions 里把已改判退回旧措辞
]

/**
 * 自引用豁免名单：命中标志字样属**预期**的文件。
 *
 * 本工具的判据测试 `tests/ownership-check.test.ts` 必须把标志字样原样写进源码当 fixture，
 * 否则「标志能抓到真实回退」这条判据就测不到。豁免是**显式登记**的，不是自动推断的 ——
 * 自动推断（例如「含 describe/it 就豁免」）会让判据可被绕过。
 */
export const SELF_QUOTING: RegExp[] = [
  /^tests\/ownership-check\.test\.ts$/,
  // docs-check 的判据测试按构造要引用队列状态字面量（「已裁已落」等），
  // 否则造不出 FR-2 的样本。**豁免是登记出来的，不是自动推断的** ——
  // 自动推断（如「凡是测试文件就放过」）会让判据可被绕过。
  /^tests\/docs-check\.test\.ts$/,
  // 两个治理脚本自身：它们**按构造就必须包含**所校验的字面量 ——
  // `QUEUE_STATES` 里就有「已裁已落」，判据不看这些字面量就没法校验它们。
  // 这是**结构性的自指**，不是绕过：判据实现与被判字面量住在同一个文件里。
  /^scripts\/ownership-check\.ts$/,
  /^scripts\/docs-check\.ts$/,
]

export function renderReport(r: OwnershipReport): string {
  const out: string[] = []
  out.push(`ownership:check —— 可提交 ${r.commitCount} · 禁区留存 ${r.holdCount} · 待人工判定 ${r.reviewCount}`)
  out.push('')
  const groups: [Verdict['verdict'], string][] = [
    ['hold', '⛔ 禁区（不可提交）'],
    ['review', '🔍 待人工判定'],
    ['commit', '✅ 可提交'],
  ]
  for (const [kind, title] of groups) {
    const list = r.files.filter((v) => v.verdict === kind)
    if (list.length === 0) continue
    out.push(`── ${title}（${list.length}）`)
    for (const v of list) {
      out.push(`  ${v.path}`)
      out.push(`      ${v.status} +${v.added} -${v.removed} · ${v.label} · ${v.reason}`)
      for (const m of v.markerHits) out.push(`      ⚠️ 命中标志：${m.trim().slice(0, 100)}`)
    }
    out.push('')
  }
  if (r.mixed.length > 0) {
    out.push(`💡 命中标志字样（疑似混入他人改动）共 ${r.mixed.length} 个文件：`)
    for (const p of r.mixed) out.push(`   · ${p}`)
    out.push('   对策：局部暂存（`git add -p`）或整体留在工作树；不要整文件 add。')
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ CLI 入口 */
function main(argv: string[]): number {
  const args = argv.slice(2)
  const asJson = args.includes('--json')
  const markerIdx = args.indexOf('--marker')
  const markers =
    markerIdx >= 0 && args[markerIdx + 1]
      ? [new RegExp(args[markerIdx + 1]!)]
      : DEFAULT_MARKERS
  const repoRoot = process.cwd()
  const report = classify(collectDirty(repoRoot), {
    forbidden: FORBIDDEN,
    owned: OWNED,
    markers,
    selfQuoting: SELF_QUOTING,
  })
  process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : `${renderReport(report)}\n`)
  return report.reviewCount > 0 || report.holdCount > 0 ? 1 : 0
}

if (process.argv[1] && (process.argv[1] as string).endsWith('ownership-check.ts')) {
  process.exitCode = main(process.argv)
}
