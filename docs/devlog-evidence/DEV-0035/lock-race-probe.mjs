// docs/devlog-evidence/DEV-0035/lock-race-probe.mjs —— ⑯ 的否证探针：量化「N 个真进程同时抢 sync.lock」时
// 让路方报出的 reason 分布。判读：**异常条数必须 = 0**；只要出现 `BUSY unreadable`，就是让路方落在写家的
// 0 字节空窗里、报不出赢家 pid（规格 m6b §7.9 c 的违例）。
//
// 用法（在仓库根跑）：node docs/devlog-evidence/DEV-0035/lock-race-probe.mjs [波数=40] [每波进程数=6]
// 只读：沙箱目录在 /tmp/ov-lockprobe-*，不碰 OPENVIBE_HOME、不开端口、不写仓库任何文件。
// 修前实测 100 波 / 600 条首行 = 7 条异常；修后同规格 0 条（原始输出见同目录 probe-before-fix-*.txt / probe-after-fix.txt）。
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.cwd()
const HOLDER = join(REPO, 'apps/cli/test/helpers/sync-lock-holder.ts')
const WAVES = Number(process.argv[2] ?? 40)
const N = Number(process.argv[3] ?? 6)

function hello(child) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let settled = false
    const onData = (c) => {
      buf += c.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      settled = true
      child.stdout.off('data', onData)
      resolve(buf.slice(0, nl).trim())
    }
    child.stdout.on('data', onData)
    child.once('error', reject)
    child.once('close', () => {
      if (!settled) reject(new Error(`未打印首行就退出：${buf || '(空)'}`))
    })
  })
}

const tally = new Map()
const anomalies = []

for (let w = 0; w < WAVES; w++) {
  const project = mkdtempSync(join(tmpdir(), 'ov-lockprobe-'))
  const kids = Array.from({ length: N }, () =>
    spawn(process.execPath, ['--import', 'tsx', HOLDER, project], {
      cwd: REPO,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  )
  const lines = await Promise.all(kids.map((k) => hello(k).catch((e) => `ERR ${e.message}`)))
  for (const line of lines) {
    const key = line.startsWith('HELD') ? 'HELD' : line.split(' ').slice(0, 2).join(' ')
    tally.set(key, (tally.get(key) ?? 0) + 1)
    if (key !== 'HELD' && key !== 'BUSY held') {
      const p = join(project, '.openvibe', 'sync.lock')
      let disk = '(no file)'
      try {
        disk = existsSync(p) ? JSON.stringify(readFileSync(p, 'utf8')) : '(gone)'
      } catch (e) {
        disk = `read-fail ${e.message}`
      }
      anomalies.push(`wave ${w} · ${line} · 盘上此刻=${disk}`)
    }
  }
  kids.forEach((k) => {
    k.stdin.on('error', () => {})
    k.stdout.on('error', () => {})
    k.stderr.on('error', () => {})
    k.stdin.end()
  })
  await Promise.all(
    kids.map(
      (k) =>
        new Promise((r) => {
          const t = setTimeout(() => {
            k.kill('SIGKILL')
            r()
          }, 4000)
          k.once('close', () => {
            clearTimeout(t)
            r()
          })
        }),
    ),
  )
  rmSync(project, { recursive: true, force: true })
}

console.log(`waves=${WAVES} contenders=${N} 总首行数=${WAVES * N}`)
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`)
console.log(`异常条数=${anomalies.length}`)
for (const a of anomalies.slice(0, 12)) console.log(`  ! ${a}`)
process.exit(anomalies.length === 0 ? 0 : 1)
