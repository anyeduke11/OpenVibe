/**
 * scripts/ci-preview.ts —— push 前的 CI 预演（owner 增强项③）。
 *
 * 用 workflow_dispatch 触发 ci.yml 对当前 HEAD 跑同矩阵（不 push、不开 PR），
 * 轮询到完成并输出三平台 + 两网络闸的结论。用途：push / publish 前确认远端矩阵绿
 * （本地绿 ≠ 远端绿——环境差异的教训见 run 40150286077）。
 *
 * 用法：pnpm ci:preview [--ref <sha|branch>]（缺省当前 HEAD）
 * 退出码：0 全绿 / 1 有失败或超时（默认 20 分钟）。
 */
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const refFlag = args.indexOf('--ref')
const ref = refFlag >= 0 ? (args[refFlag + 1] ?? '') : execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()

function gh<T>(...cli: string[]): T {
  return JSON.parse(execFileSync('gh', cli, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })) as T
}

console.log(`CI 预演：触发 ci.yml @ ${ref}`)
execFileSync('gh', ['workflow', 'run', 'CI', '--ref', ref])
// workflow run 异步建 run——轮询找该 ref 的最新 in_progress/queued run
let runId: number | null = null
for (let i = 0; i < 30 && runId === null; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const runs = gh<{ workflow_runs: { id: number; head_sha: string; status: string }[] }>(
    'run', 'list', '--workflow=CI', '--limit=5', '--json=databaseId,headSha,status',
  )
  // gh run list 的字段映射到 workflow_runs 形状（--json databaseId/headSha/status）
  const list = gh<{ databaseId: number; headSha: string; status: string }[]>(
    'run', 'list', '--workflow=CI', '--limit=5', '--json=databaseId,headSha,status',
  )
  const hit = list.find((r) => r.headSha.startsWith(ref) && r.status !== 'completed')
  if (hit !== undefined) runId = hit.databaseId
}
if (runId === null) {
  console.error('⛔ 未找到触发的 run（ref 不存在或 workflow 无 dispatch？）')
  process.exit(1)
}
console.log(`run ${String(runId)} 已启动，轮询（上限 20 分钟）…`)
const deadline = Date.now() + 20 * 60_000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 20_000))
  const run = gh<{ status: string; conclusion: string | null }>('run', 'view', String(runId), '--json=status,conclusion')
  if (run.status === 'completed') {
    const jobs = gh<{ name: string; conclusion: string | null }[]>(
      'run', 'view', String(runId), '--json=jobs', '--jq=.jobs',
    )
    for (const j of jobs) console.log(`${j.conclusion === 'success' ? '✓' : '✗'} ${j.name}: ${j.conclusion ?? '?'}`)
    if (run.conclusion === 'success') {
      console.log('✓ CI 预演全绿')
      process.exit(0)
    }
    console.error(`⛔ CI 预演失败（run ${String(runId)}）——详情：gh run view ${String(runId)} --log-failed`)
    process.exit(1)
  }
}
console.error('⛔ 预演超时（20 分钟）')
process.exit(1)
