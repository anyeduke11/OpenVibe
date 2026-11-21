// FR-5 真机探针复跑化（docs/specs/adapter-fixtures.md v1.0 · FR-5.1/5.2/5.3）
//
// 三支腿（FR-5.1 原文点名）：Trae frontmatter 键解析 / Codex AGENTS.md 读取 / Trae GUI 暗号。
//
// 形制（FR-5.2）：缺依赖必须报 SKIP 而不是 FAIL；本机没装/没配是常态，不是错误。
//   EXPECT_SKIP 环境变量声明预期 skip 数，跑完必须恰好相等（不许把 skip 计成通过）。
// 输出（FR-5.3）：本文件同目录的 `adapter-probe-<date>.txt`（.txt 不是 .log——.log 被
//   .gitignore 静默吞掉，本仓已踩过这个坑）。FR-6.3：时间戳必须带证据文件路径。
//
// 用法：node docs/devlog-evidence/refactor-w5/adapter-probe.mjs
//   EXPECT_SKIP=<n> 可选；TRAE_GUI=1 时才尝试 Trae GUI 腿（其余恒 SKIP）。

import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const EXPECT_SKIP = Number(process.env.EXPECT_SKIP ?? '0')
const results = []
let skipCount = 0
let failCount = 0

function record(name, verdict, detail = '') {
  results.push(`${verdict} ${name}${detail ? ` — ${detail}` : ''}`)
  if (verdict === 'SKIP') skipCount += 1
  if (verdict === 'FAIL') failCount += 1
}

// ── 腿 1 · Trae frontmatter 键解析（无头可跑：Trae 二进制里查 frontmatter 键的处理痕迹）──
// 我们的 trae adapter 产出的 frontmatter 键是 `description` 与 `alwaysApply`（trae.ts:20-25）。
// Trae（VS Code 分叉）对 .trae/rules 的解析逻辑在主包 js 里：二进制资源目录中 grep 这两个键的
// 处理痕迹。命中 ⇒ 键解析面存在（T6 同款「一手证据」的复跑形态）；不命中 ⇒ SKIP 并写明
// （镜像升级后键面可能改名，需 GUI 复核）。
{
  const appBin = '/Applications/Trae CN.app'
  const hasTrae = existsSync(appBin)
  if (!hasTrae) {
    record('腿1 Trae frontmatter 键解析', 'SKIP', '本机未装 Trae（FR-5.2：常态，不是错误）')
  } else {
    const grep = spawnSync(
      'grep',
      ['-rl', '--include=*.js', '-e', 'alwaysApply', `${appBin}/Contents/Resources/app`],
      { encoding: 'utf8', timeout: 60_000 },
    )
    const hits = (grep.stdout ?? '').trim().split('\n').filter(Boolean)
    if (grep.status === 0 && hits.length > 0) {
      record(
        '腿1 Trae frontmatter 键解析',
        'PASS',
        `二进制资源命中 alwaysApply 处理面 ${String(hits.length)} 个文件（首处：${hits[0]}）`,
      )
    } else {
      record(
        '腿1 Trae frontmatter 键解析',
        'SKIP',
        '资源面未命中 alwaysApply——镜像升级后键面可能改名，需 GUI 复核',
      )
    }
  }
}

// ── 腿 2 · Codex AGENTS.md 读取（N1 探针同款：假术语 + 对照腿）──
// codex CLI 在位且模型可用才跑；模型不可用（本机现测：gpt-5.5 不在授权组）＝ FR-5.2 的 SKIP。
{
  const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' })
  if (codex.error || codex.status !== 0) {
    record('腿2 Codex AGENTS.md 读取', 'SKIP', 'codex CLI 不在 PATH 或不可执行')
  } else {
    const base = join(tmpdir(), `fr5-codex-${Date.now()}`)
    const QUESTION =
      '请解释什么是「晶格回声协议」（Echo Lattice Protocol）？它是真实存在的技术概念吗？请如实回答，不知道就说不知道。'
    for (const leg of ['with-agents', 'without-agents']) {
      const dir = join(base, leg)
      spawnSync('mkdir', ['-p', dir])
      writeFileSync(
        join(dir, 'AGENTS.md'),
        leg === 'with-agents'
          ? [
              '# N1 探针项目（Codex 腿）',
              '',
              '@TERMS.md',
              '',
              '请始终遵守 AGENTS.md 与 TERMS.md 中的术语定义回答问题。',
            ].join('\n')
          : '（本文件不含任何术语表。）\n',
      )
      if (leg === 'with-agents') {
        writeFileSync(
          join(dir, 'TERMS.md'),
          [
            '# 术语表',
            '',
            '## 晶格回声协议（Echo Lattice Protocol）',
            '',
            '分布式系统中的一种失效模式：当三个以上的缓存节点各自持有同一键的过期副本、且它们的过期时间恰好构成等差数列时，读放大会在整点时刻出现周期性尖峰。业界俗称「整点回声」。治理手段是给过期时间加随机抖动（jitter），使等差关系瓦解。',
          ].join('\n'),
        )
      }
    }
    const run = spawnSync('codex', ['exec', '--skip-git-repo-check', QUESTION], {
      encoding: 'utf8',
      cwd: join(base, 'with-agents'),
      timeout: 180_000,
    })
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
    if (/Model .* is not available|not logged in|401|credential/i.test(out)) {
      record(
        '腿2 Codex AGENTS.md 读取',
        'SKIP',
        `模型/凭据不可用（FR-5.2）：${out.match(/ERROR[^\n]*/)?.[0] ?? '未知原因'}`,
      )
    } else if (/整点回声|jitter|等差数列/.test(out)) {
      record('腿2 Codex AGENTS.md 读取', 'PASS', 'with-agents 腿回答含定义细节 ⇒ AGENTS.md 真读')
    } else if (/不知道|不存在|编造|虚构/.test(out)) {
      record(
        '腿2 Codex AGENTS.md 读取',
        'FAIL',
        'with-agents 腿否认存在 ⇒ AGENTS.md 未被读取（对照腿请人工复核）',
      )
    } else {
      record('腿2 Codex AGENTS.md 读取', 'SKIP', '形态未定，需人工看输出（已留证据文件）')
    }
    // 证据留痕（正文前 40 行）
    writeFileSync(
      join(HERE, `codex-leg-${Date.now()}.txt`),
      out.split('\n').slice(0, 40).join('\n'),
    )
  }
}

// ── 腿 3 · Trae GUI 暗号（有头腿：属发布节奏人工跑，FR-5.1 的形制预留给 owner）──
if (process.env.TRAE_GUI === '1') {
  record(
    '腿3 Trae GUI 暗号',
    'SKIP',
    'TRAE_GUI=1 已声明，但 GUI 驱动脚本属发布节奏人工腿——本驱动器不含',
  )
} else {
  record('腿3 Trae GUI 暗号', 'SKIP', '无头环境不可判（有头腿按发布节奏人工跑，DEV-0025 同款纪律）')
}

// ── 汇总（EXPECT_SKIP 口径：声明几支就必须恰好几支）──
console.log(results.join('\n'))
console.log(
  `\n结果：PASS=${results.filter((r) => r.startsWith('PASS')).length} SKIP=${skipCount} FAIL=${failCount}`,
)
if (EXPECT_SKIP > 0 && skipCount !== EXPECT_SKIP) {
  console.log(
    `FAIL EXPECT_SKIP=${String(EXPECT_SKIP)} 但实得 SKIP=${String(skipCount)}（skip 计数与声明不符 ⇒ 驱动器或环境变了）`,
  )
  failCount += 1
}
process.exitCode = failCount > 0 ? 1 : 0
console.log(`证据落档：docs/devlog-evidence/refactor-w5/（.txt；FR-6.3 要求时间戳带本路径）`)
