import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { PACK_LOCK_REL, SYNC_LOCK_REL, SYNC_LOCK_STALE_MS } from '@openvibe/core'
import { demoPack, writeBundleFile } from './helpers/pack-fixture'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T8e · 并发 sync 互斥锁的**真进程**用例（m6b §6.9 / design §11.3）。
 *
 * 分工：`packages/core/src/inject/sync-lock.test.ts` 用注入的 now/pid/isAlive 穷举判定分支；
 * 这里只做注入做不到的事——两个真实 OS 进程抢同一个 `.openvibe/sync.lock`，
 * 以及「持锁者被 SIGKILL 后 pid 判死」这条只能靠内核兑现的接管路径。
 * 断言一律落回磁盘实况（全树快照 + 锁文件内容），因为被保护的对象就是那批文件。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')
const HOLDER = join(HERE, 'helpers', 'sync-lock-holder.ts')
const LOCK_REL = SYNC_LOCK_REL

const roots: string[] = []

function sandbox(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-lock-test-'))
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'ov-lock-home-'))
  roots.push(home)
  return home
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const runCli = (args: string[], home: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
    encoding: 'utf8',
    timeout: 25_000,
    env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_TOKEN: '', OPENVIBE_SERVER: '' },
  })

interface Envelope {
  command: string
  summary: Record<string, unknown> & {
    ok: boolean
    error?: { code: string; message: string }
  }
}

// ---------------------------------------------------------------- 持锁子进程

interface Holder {
  readonly child: ChildProcessWithoutNullStreams
  /** stdout 首行：`HELD <pid> <path>` | `BUSY <reason> <pid>` */
  readonly hello: Promise<string>
  readonly pid: number
  /** 等进程真正结束（close 事件即已重收，POSIX 下不留僵尸） */
  readonly closed: Promise<{ code: number | null; stderr: string }>
  /** 收工：关 stdin 让夹具自己 release 后退出 */
  stop(): Promise<{ code: number | null; stderr: string }>
  /** 模拟崩溃：SIGKILL 不走 release，锁作为残留留在盘上 */
  crash(): Promise<{ code: number | null; stderr: string }>
}

function startHolder(projectDir: string): Holder {
  const child = spawn(process.execPath, ['--import', 'tsx', HOLDER, projectDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.on('error', () => {}) // 已退出的子进程再 end() 会炸流，测试里忽略

  const hello = new Promise<string>((resolve, reject) => {
    let buf = ''
    let settled = false
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      settled = true
      child.stdout.off('data', onData)
      resolve(buf.slice(0, nl).trim())
    }
    child.stdout.on('data', onData)
    child.once('error', (e) => reject(e))
    child.once('close', () => {
      if (!settled) reject(new Error(`持锁进程未打印首行就退出了：${buf}`))
    })
  })

  let stderrBuf = ''
  child.stderr.on('data', (c: Buffer) => {
    stderrBuf += c.toString('utf8')
  })
  const closed = new Promise<{ code: number | null; stderr: string }>((resolve) => {
    child.once('close', (code) => resolve({ code, stderr: stderrBuf }))
  })

  return {
    child,
    pid: child.pid ?? -1,
    hello,
    closed,
    async stop() {
      child.stdin.end()
      return closed
    },
    async crash() {
      child.kill('SIGKILL')
      return closed
    },
  }
}

/** 等 pid 从进程表里彻底消失：SIGKILL + close 之后 Windows 仍可能短暂报活 */
async function waitPidGone(pid: number, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`pid ${String(pid)} 在 ${String(timeoutMs)}ms 内没有被判死`)
}

const HELD_RE = /^HELD (\d+) (.+)$/

// ---------------------------------------------------------------- 用例

describe('真进程抢锁（m6b §6.9 并发 sync 互斥）', () => {
  it('CLI-LOCK-01: 别人持锁时 sync 退出码 1 + SYNC_BUSY，整棵项目树一个字节未动', async () => {
    const { root, project } = sandbox()
    const bundle = writeBundleFile(root, demoPack())
    putFile(project, 'CLAUDE.md', '本地手写规则\n')

    const holder = startHolder(project)
    const hello = await holder.hello
    const held = HELD_RE.exec(hello)
    expect(held, `夹具该抢到锁，实际：${hello}`).not.toBeNull()
    const lockAbs = join(project, LOCK_REL)
    expect(held?.[2]).toBe(lockAbs)
    // 锁的归属以磁盘为准：内容必须正是那个 pid
    const onDisk = JSON.parse(readFileSync(lockAbs, 'utf8')) as {
      pid: number
      startedAt: string
      command: string
    }
    expect(onDisk).toMatchObject({ pid: Number(held?.[1]), command: 'sync-holder' })

    const before = treeSnapshot(project)
    const res = runCli(['--json', 'sync', project, '--file', bundle, '--yes'], tempHome())

    expect(res.status).toBe(1)
    const env = JSON.parse(res.stdout) as Envelope
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error?.code).toBe('SYNC_BUSY')
    // 让路文案要指得出是谁：否则用户只会看到一个陌生的错误码
    expect(env.summary.error?.message).toContain('另一个 sync 正在写这个项目')
    expect(env.summary.error?.message).toContain(`pid ${String(onDisk.pid)}`)
    expect(env.summary.error?.message).toContain('sync-holder')
    // 拒绝执行不该制造任何痕迹——连 .openvibe/ 都不该被我们动过
    expect(treeSnapshot(project)).toEqual(before)
    expect(JSON.parse(readFileSync(lockAbs, 'utf8'))).toEqual(onDisk)

    expect(await holder.stop()).toMatchObject({ code: 0 })
    // 持锁者正常收工后锁自己消失，下一轮 sync 才抢得到
    expect(existsSync(lockAbs)).toBe(false)
    const retry = runCli(['--json', 'sync', project, '--file', bundle, '--yes'], tempHome())
    expect(retry.status).toBe(0)
  })

  it('CLI-LOCK-02: 持锁者被 SIGKILL 后留下残留锁，sync 按 pid 判死自动接管并写完', async () => {
    const { root, project } = sandbox()
    const bundle = writeBundleFile(root, demoPack())
    const lockAbs = join(project, LOCK_REL)

    const holder = startHolder(project)
    const hello = await holder.hello
    const pid = Number(HELD_RE.exec(hello)?.[1])
    const startedAt = (
      JSON.parse(readFileSync(lockAbs, 'utf8')) as {
        startedAt: string
      }
    ).startedAt
    const { code } = await holder.crash()
    expect(code).not.toBe(0) // 被信号杀掉，不是自己收工
    await waitPidGone(pid)
    expect(existsSync(lockAbs)).toBe(true)
    // 接管只能来自 pid 判死：这把锁还远没到 5 分钟陈旧窗口
    expect(Date.now() - Date.parse(startedAt)).toBeLessThan(SYNC_LOCK_STALE_MS / 10)

    const res = runCli(['--json', 'sync', project, '--file', bundle, '--yes'], tempHome())
    expect(res.status).toBe(0)
    const env = JSON.parse(res.stdout) as Envelope
    expect(env.summary.lockPath).toBe(join(project, PACK_LOCK_REL))
    // 接管不是静默行为：hints 里点得出被接管的是谁的锁
    expect((env.summary.hints as string[]).join('\n')).toContain(
      `接管了残留注入锁（pid ${String(pid)}，sync-holder`,
    )
    // 接管照常写完包：空项目里 AGENTS.md 必为 NEW
    expect(existsSync(join(project, 'AGENTS.md'))).toBe(true)
    // 用完即走：sync 结束时不该给下一次留锁
    expect(existsSync(lockAbs)).toBe(false)
  })

  it('CLI-LOCK-03: 六个进程同时抢，恰好一个 HELD 其余 BUSY（O_EXCL 的原子性）', async () => {
    const { project } = sandbox()
    const holders = Array.from({ length: 6 }, () => startHolder(project))
    const hellos = await Promise.all(holders.map((h) => h.hello))

    const won = hellos.filter((l) => l.startsWith('HELD'))
    const lost = hellos.filter((l) => l.startsWith('BUSY'))
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(5)
    // 抢输的一方要说得清「被谁挡住」，且不能谎报成读不懂/建不出来
    for (const line of lost) expect(line.startsWith('BUSY held ')).toBe(true)
    expect(hellos).toHaveLength(6)

    const winnerPid = Number(HELD_RE.exec(won[0] ?? '')?.[1])
    expect(winnerPid).toBeGreaterThan(0)
    for (const line of lost) {
      expect(Number(line.split(' ')[2])).toBe(winnerPid)
    }
    // 磁盘上只有一把锁，且内容正是赢家
    const lockAbs = join(project, LOCK_REL)
    expect(
      JSON.parse(readFileSync(lockAbs, 'utf8')) as {
        pid: number
      },
    ).toMatchObject({ pid: winnerPid })

    const exits = await Promise.all(holders.map((h) => h.stop()))
    // 抢输的直接以 3 退出（没占着 stdin 装活），赢家收工后锁消失
    expect(exits.filter((e) => e.code === 0)).toHaveLength(1)
    expect(exits.filter((e) => e.code === 3)).toHaveLength(5)
    expect(existsSync(lockAbs)).toBe(false)
  })

  it('CLI-LOCK-04: --dry-run 不抢锁也不被挡，且一个字节都不写', async () => {
    const { root, project } = sandbox()
    const bundle = writeBundleFile(root, demoPack())
    putFile(project, 'CLAUDE.md', '本地手写规则\n')
    const lockAbs = join(project, LOCK_REL)

    const holder = startHolder(project)
    const hello = await holder.hello
    const holderLock = readFileSync(lockAbs, 'utf8')
    expect(HELD_RE.test(hello)).toBe(true)
    const before = treeSnapshot(project)

    const res = runCli(['--json', 'sync', project, '--file', bundle, '--dry-run'], tempHome())
    expect(res.status).toBe(0)
    const env = JSON.parse(res.stdout) as Envelope
    expect(env.summary).toMatchObject({ ok: true, dryRun: true, lockPath: null })
    expect(env.summary.written).toBe(5)
    // 计划照算，但既不写盘也不碰别人那把锁
    expect(treeSnapshot(project)).toEqual(before)
    expect(readFileSync(lockAbs, 'utf8')).toBe(holderLock)

    expect(await holder.stop()).toMatchObject({ code: 0 })
  })
})
