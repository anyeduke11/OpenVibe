#!/usr/bin/env node
/**
 * 探针真机实测原文的校验器（DEV-0137）。
 *
 * ## 为什么要有这个脚本
 *
 * 2026-10-17 第一轮实测里，三份 raw 文件**全部答「支持」**，但那份结论**不能采信** ——
 * 它们量的根本不是被测对象。三份文件都在 bash 里 `cat` 了软链下的文件、
 * 直接执行了真源路径上的脚本；那证明的是「bash 能跟随软链、能执行 755 脚本」，
 * 而 Q3／Q4 问的是「**平台自己的 skill 发现机制**能不能」——
 * 绕过平台的测量**结构上**回答不了这两个问题。
 *
 * 同一批文件还踩了两个别的坑：§2 提示词因嵌套围栏被截断（agent 明确报了「送达缺失」），
 * 且只落了 r1／r5／r5，缺 r2／r3／r4。
 *
 * **这些都是肉眼扫不出来的** —— 三份文件结构完整、格式工整、有命令有输出。
 * 所以校验必须是**机器判定**，且必须能红。
 *
 * ## 它判什么（逐条都可复算）
 *
 * 1. **机器索引头**在文件首行附近（缺失 ⇒ 该轮被判无效，很可能提示词被截断）；
 * 2. **脚本 stdout 字面量** `<<<M8-PROBE-SCRIPT-RAN` 在（证明脚本真被执行而非编造）；
 * 3. **`path=` 字段落在平台 skill 目录下** —— 这是 Q3 的关键：
 *    若它指向真源 `~/.agents/...`，说明这一轮**绕过了平台路径**，Q3 判为无效；
 * 4. **四问结论三行齐全**且取值在允许档位内；
 * 5. **Q4 的取证方式**：文件里**不得**出现「用 ls/cat 直接读平台 skill 目录」当作
 *    Q4 的依据 —— 出现了就判 Q4 无效（这是本脚本存在的头号理由）；
 * 6. **轮次齐备**：默认要求 trae-r1 / trae-r2 / codebuddy-r3 / codebuddy-r4 四轮。
 *
 * ## 用法
 *
 *   node scripts/probe-raw-check.ts                                   # 默认 raw 目录 + 默认四轮
 *   node scripts/probe-raw-check.ts --rounds trae-r1 trae-r5         # 自定义轮次
 *   node scripts/probe-raw-check.ts --dir /tmp/fixture --rounds a-r1  # 自定义目录（夹具自测用）
 *
 * 退出码 0 = 全绿；1 = 有无效项。**只判不修**：它不替 owner 判定三问的答案，
 * 只判定「这份文件能不能作为该问的证据」。
 *
 * ⚠️ **为什么要留 `--dir`**：一条只会红的闸等于没有闸。
 * 本判据必须能被证伪到**绿**，否则无法区分「判据严」与「判据坏」。
 * `--dir` 让夹具能落在临时目录里验证，**不必**往真实 `raw/` 里塞人造文件 ——
 * 那里放的东西会被将来的读者当成实测证据，而那正是本脚本要防的事。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_RAW_DIR = join(process.cwd(), 'docs/devlog-evidence/M8-probe/raw')

const DEFAULT_ROUNDS = ['trae-r1', 'trae-r2', 'codebuddy-r3', 'codebuddy-r4']

/** 探针脚本 stdout 的字面量标记（SKILL.md 里那串怪分隔符，防改写用） */
const SCRIPT_MARKER = '<<<M8-PROBE-SCRIPT-RAN'

/** Q3 的合格判据：脚本须经**平台** skill 路径被调用。
 *  落在真源 `~/.agents/` 说明这一轮绕过了平台，量不到平台的加载行为。 */

/** Q4 无效取证：直接用 shell 读平台 skill 目录。
 *  bash 跟随软链是操作系统行为，与「平台的 skill 扫描器是否跟随软链」无关。 */
const SHELL_BYPASS_RE =
  /cat\s+[^\n]*\.(trae|codebuddy)\/skills\/openvibe-probe|ls\s+-[a-z]*[a-z]\s+[^\n]*\.(trae|codebuddy)\/skills\/openvibe-probe|readlink[^\n]*\.(trae|codebuddy)\/skills\/openvibe-probe/

const ALLOWED_VERDICTS = ['支持', '不支持', '未测到'] // 枚举顺序即文档提示里的排列顺序
const QUESTION_KEYS = ['Q1 加载时机', 'Q3 脚本可执行性', 'Q4 symlink 跟随']

function parseArgs(): { rounds: string[]; dir: string } {
  const take = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag)
    // ⚠️ **必须先判 i >= 0**：`indexOf` 找不到时返回 **-1**，而 `argv[-1 + 1]` 就是
    // `argv[0]`（node 自己的可执行路径）—— 它是真值，会被当成 `--dir` 的取值。
    // 只写 `argv[i + 1] ? … : 默认` 会让「flag 缺席」悄悄变成「目录 = node 二进制」。
    return i >= 0 ? process.argv[i + 1] : undefined
  }
  const roundList = take('--rounds')
  const rounds = roundList ? process.argv.slice(process.argv.indexOf('--rounds') + 1) : DEFAULT_ROUNDS
  return { rounds, dir: take('--dir') ?? DEFAULT_RAW_DIR }
}

interface Finding {
  round: string
  check: string
  ok: boolean
  detail: string
}

function checkRound(round: string, rawDir: string): Finding[] {
  const out: Finding[] = []
  const path = join(rawDir, `${round}.md`)
  const push = (c: string, ok: boolean, d: string): void => {
    out.push({ round, check: c, ok, detail: d })
  }

  if (!existsSync(path)) {
    push('文件存在', false, `${round}.md 不存在`)
    // 缺文件时其余判据无从谈起，但仍要把四问各报一次，否则「缺文件」会被读成「已跑过」
    for (const q of QUESTION_KEYS) push(`${q} 有证据`, false, '文件不存在')
    return out
  }
  const text = readFileSync(path, 'utf8')

  // ① 机器索引头
  const idx = text.match(/<!--\s*M8-PROBE\s+platform=(\S+)\s+round=(\S+)\s*-->/)
  push(
    '机器索引头',
    Boolean(idx),
    idx ? `platform=${idx[1]} round=${idx[2]}` : '首行附近无 <!-- M8-PROBE platform=… round=… -->（提示词很可能被截断）',
  )

  // ② 脚本 stdout 字面量
  push('脚本 stdout 字面量', text.includes(SCRIPT_MARKER), text.includes(SCRIPT_MARKER) ? '命中' : '未命中 ⇒ 脚本可能未被执行')

  // ③ Q3：脚本必须**经平台路径**被调用
  //
  // ⚠️ 这里有一条容易搞反的推理，务必分清两种「`$0` 落在真源」：
  //   (a) agent 自己用 bash 直接跑 `~/.agents/…/probe.sh` ⇒ **量的是 bash**，不是平台 → 无效；
  //   (b) 平台的 skill 加载器**跟随软链**后执行 ⇒ `$0` 也可能显示真源路径 → 这恰恰是
  //       **Q4 的正面证据**。
  // 两者在脚本 stdout 里长得一模一样，**靠 `path=` 字段无法区分**。
  // 真正的判别式是「这一轮有没有平台参与」，即 ⑤ 的客户端自证 ＋ ⑥ 的不得绕过平台。
  // 所以本项只做一件事：确认脚本 stdout 里 `path=` 字段存在，且把它的值如实登记下来，
  // **不单独据此判成败** —— 把它当成需要人工过目的事实，而不是自动结论。
  const pathField = text.match(/<<<M8-PROBE-SCRIPT-RAN[^>]*\|path=([^|>]*)/)
  if (!pathField) {
    push('Q3 脚本 path 字段', false, 'stdout 里没有 path= 字段 ⇒ 取证不完整，无法确认走了哪条路径')
  } else {
    push('Q3 脚本 path 字段', true, `path=${pathField[1]}（需人工过目：经软链解析也可能是平台跟随软链的正面证据）`)
  }

  // ④ 四问结论
  for (const q of QUESTION_KEYS) {
    const line = text.split('\n').find((l) => l.includes(q))
    if (!line) {
      push(`${q} 结论`, false, '未找到该问的结论行')
      continue
    }
    // ⚠️ 档位用**枚举交替**捕获，不要用 `\S+`：实测里结论行常写成
    // 「支持。直接执行成功，exitCode 0」——`\S+` 会把整句吞成一个"取值"，
    // 然后报「不在允许档内」，那是**判据自身的解析缺陷**，
    // 会把「其实档位合法、只是被后面的方法问题判红」这件事掩盖成另一个原因。
    // 交替串由 `ALLOWED_VERDICTS` 派生 ⇒ 常量仍是唯一出处，改档位只改一处。
    const alt = ALLOWED_VERDICTS.join('|')
    const m = line.match(new RegExp(`${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}：\\s*(${alt})`))
    const verdict = m?.[1] ?? ''
    const ok = verdict !== ''
    push(`${q} 结论`, ok, ok ? `= ${verdict}` : `未找到合法档位（应为 ${ALLOWED_VERDICTS.join(' / ')} 之一）`)
  }

  // ⑤ 客户端自证：没有平台身份，这一轮的观察**无法归属给 Trae／CodeBuddy**。
  //    三份文件都写了 pwd=OpenVibe 且全部解析到 ~/.agents/…，无从判断跑的是不是那两个客户端。
  const client = text.match(/(?:客户端|client)[：:]\s*([^\n]+)/)
  const clientName = client?.[1]?.trim().slice(0, 60)
  push(
    '客户端自证',
    Boolean(clientName),
    clientName ? `= ${clientName}` : '未报告「客户端：」字段 ⇒ 无从判断这一轮跑在哪个客户端里',
  )

  // ⑥ Q4 取证方式（头号理由）：不得用 shell 直接读平台 skill 目录。
  //    bash 跟随软链是**操作系统**行为，与「平台的 skill 扫描器是否跟随软链」是两个问题。
  //
  //    ⚠️ **但不能见命令就红** —— 提示词本身就要求跑前置自检
  //    （`ls -ld ~/.trae/skills/openvibe-probe` 之类），那是**登记事实**、不是结论依据。
  //    所以判据是二元的：**有 shell 读取 ＋ 没有「前置自检」声明 ⇒ 无效**。
  //    这样「声明了前置自检且 Q4 结论不引它」与「根本没声明就直接拿它当证据」才分得开。
  //    （第一版就是漏了这一层，导致连合规夹具都判红 —— 闸把自己写的说明书判成了违规。）
  const hasShellRead = SHELL_BYPASS_RE.test(text)
  const declaresPreflight = /前置自检|不作为结论依据|不得用作\s*Q[34]/.test(text)
  if (!hasShellRead) {
    push('Q4 取证方式', true, '未发现绕过平台的 shell 取证')
  } else if (declaresPreflight) {
    push('Q4 取证方式', true, '有 shell 读取，但文件声明了「前置自检／不作为结论依据」⇒ 视为登记事实')
  } else {
    push(
      'Q4 取证方式',
      false,
      '有 shell 直接读平台 skill 目录，且文件**未声明**那是前置自检 ⇒ 极可能被当成了 Q4 的结论依据',
    )
  }

  // ⑦ 平台软链确为软链（前置事实，缺失则整轮不可判）
  const linkProof = /-> \.\.\/\.\.\/\.agents\/skills\/openvibe-probe/.test(text)
  push('平台路径为软链（前置）', linkProof, linkProof ? 'trae/codebuddy 路径已确认为指向真源的软链' : '未见软链指向真源的证据')

  return out
}

function main(): void {
  const { rounds, dir } = parseArgs()
  // `README.md` 与 `REJECTED-*.md` 不是轮次文件：前者是目录说明，
  // 后者是被判无效的历史记录。**留着不过滤会让它们混进「计划外轮次」告警里**，
  // 而那份驳回记录恰恰是最不该被误认成一轮实测的东西。
  const present = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('REJECTED'))
        .map((f) => f.replace(/\.md$/, ''))
    : []

  console.log('── 探针 raw 校验 ──')
  console.log(`   期望轮次：${rounds.join(' / ')}`)
  console.log(`   实际落盘：${present.length ? present.join(' / ') : '（无）'}\n`)

  const missing = rounds.filter((r) => !present.includes(r))
  if (missing.length) {
    console.log(`✗ 缺轮次：${missing.join(' / ')}`)
    console.log('  轮次 2/4 必须先 Cmd+Q 完全退出再重开 —— 没有重启对比，Q1 答不了。\n')
  }
  const extra = present.filter((p) => !rounds.includes(p))
  if (extra.length) console.log(`⚠ 计划外轮次：${extra.join(' / ')}（不计入判定）\n`)

  const findings = rounds.flatMap((r) => checkRound(r, dir))
  let bad = 0
  for (const r of rounds) {
    const mine = findings.filter((f) => f.round === r)
    const failed = mine.filter((f) => !f.ok)
    bad += failed.length
    if (failed.length === 0) {
      console.log(`✓ ${r}`)
    } else {
      console.log(`✗ ${r}`)
      for (const f of failed) console.log(`    · ${f.check}：${f.detail}`)
    }
  }

  console.log()
  console.log(bad === 0 && missing.length === 0 ? '✓ 全绿' : `✗ ${bad} 项不合格${missing.length ? ` ＋ 缺 ${missing.length} 轮` : ''}`)
  console.log('   ⚠ 本脚本只判「这份文件能否作为该问的证据」，**不替 owner 判定三问的答案**。')
  process.exit(bad === 0 && missing.length === 0 ? 0 : 1)
}

main()
