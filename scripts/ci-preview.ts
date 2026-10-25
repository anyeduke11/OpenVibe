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
// workflow_dispatch 只认远端已有的完整 ref（分支名/完整 SHA——短 SHA 会 404）；
// 缺省 main（对「已推的最新 main」预演；未推的 commit 本就 dispatch 不到）
const ref = refFlag >= 0 ? (args[refFlag + 1] ?? 'main') : 'main'

function gh<T>(...cli: string[]): T {
  try {
    return JSON.parse(execFileSync('gh', cli, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })) as T
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string }
    const detail = typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString('utf8') ?? err.message ?? '')
    throw new Error(`gh ${cli.join(' ')} 失败：${detail.slice(0, 300)}`)
  }
}

console.log(`CI 预演：触发 ci.yml @ ${ref}`)
try {
  execFileSync('gh', ['workflow', 'run', 'CI', '--ref', ref])
} catch (e) {
  const err = e as { stderr?: Buffer }
  console.error(`⛔ 触发失败（ref 须是远端已有的分支名/完整 SHA）：${(typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '').slice(0, 200)}`)
  process.exit(1)
}
// workflow run 异步建 run——轮询找该 ref 的最新 in_progress/queued run
let runId: number | null = null
for (let i = 0; i < 30 && runId === null; i++) {
  await new Promise((r) => setTimeout(r, 4000))
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
    const view = gh<{ jobs: { name: string; conclusion: string | null }[] }>(
      'run', 'view', String(runId), '--json=jobs',
    )
    for (const j of view.jobs) console.log(`${j.conclusion === 'success' ? '✓' : '✗'} ${j.name}: ${j.conclusion ?? '?'}`)
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
