import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PACK_BACKUP_REL, PACK_LOCK_REL } from '@openvibe/core'
import { AppError, LIMITS, type AdapterId } from '@openvibe/shared'
import { ApiError, createClient, type FetchLike } from '../src/client'
import { diffAction } from '../src/commands/diff'
import { SyncError, syncAction } from '../src/commands/sync'
import { contentOf, demoPack, writeBundleFile } from './helpers/pack-fixture'
import { fakeClient } from './helpers/fake-client'
import { putFile, treeSnapshot } from './helpers/tree'

/**
 * T7f · m6b §6 的安全边界用例集（§6.3 规模防线 / §6.5 写入中止 / §6.1 符号链接 / §6.6 令牌失效）。
 * 与 sync.test.ts 同一口径：断言落在磁盘实际状态上——「没写」用目录清单与内容证明，不看退出码。
 */

const ALL6: AdapterId[] = [
  'claude-code',
  'cursor',
  'generic-agents',
  'codebuddy',
  'trae',
  'minicode',
]
const NOW = new Date('2026-09-22T01:02:03.400Z')
const STAMP = '2026-09-22T01-02-03Z'
const IS_WINDOWS = process.platform === 'win32'

const roots: string[] = []

function sandbox(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'ov-sec-test-'))
  roots.push(root)
  const project = join(root, 'proj')
  mkdirSync(project)
  return { root, project }
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const asError = (e: unknown): { code: string; message: string; details?: unknown } => e as never

describe('规模防线（m6b §6.3：导出侧只警告，注入侧必须硬拒绝）', () => {
  it('CLI-SEC-02: 单文件 > 512KB → 整包拒绝，项目目录一个文件都不留', async () => {
    const fx = demoPack({ termTail: 'x'.repeat(LIMITS.singleFileMaxBytes + 1) })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fx)

    const error = asError(
      await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch((e) => e),
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toContain('整包拒绝')
    const oversized = (error.details as { oversizedFiles: { path: string; bytes: number }[] })
      .oversizedFiles
    expect(oversized.map((f) => f.path)).toEqual(['TERMS.md'])
    expect(oversized[0]?.bytes).toBeGreaterThan(LIMITS.singleFileMaxBytes)
    expect(readdirSync(project)).toEqual([])
  })

  it('CLI-SEC-02b: 逐文件均合规但解压总量 > 2MB → 拒绝并报总字节', async () => {
    const fx = demoPack({ ruleBody: 'r'.repeat(480 * 1024), targets: ALL6 })
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fx)

    const error = asError(
      await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch((e) => e),
    )
    expect(error.code).toBe('VALIDATION_ERROR')
    const details = error.details as { totalBytes: number; oversizedFiles: unknown[] }
    expect(details.oversizedFiles).toEqual([])
    expect(details.totalBytes).toBeGreaterThan(LIMITS.packTotalMaxBytes)
    expect(error.message).toContain('总量')
    expect(readdirSync(project)).toEqual([])
  })
})

describe('写入中途失败（m6b §6.5：中止后续写入 + 手工回滚指引 + 幂等重跑可收敛）', () => {
  it('CLI-SEC-03: 第二项写不下去就停——已写项与备份保留，lock 不写，清障后重跑回到 clean', async () => {
    const fx = demoPack({ targets: ALL6, withSkills: true })
    const pack = contentOf(fx)
    const { root, project } = sandbox()
    const bundlePath = writeBundleFile(root, fx)
    // 写序按码点序：'.cursor/rules/openvibe.mdc' 第 1（本地已有内容 → 覆盖前先备份），
    // '.trae/rules/openvibe.md' 第 2 —— 把它的目录祖先占成普通文件，mkdir 必然失败
    putFile(project, '.cursor/rules/openvibe.mdc', '本地手写的 cursor 规则\n')
    putFile(project, '.trae', '占位文件：挡住 .trae 目录\n')

    const error = asError(
      await syncAction(
        { projectPath: project, file: bundlePath, yes: true },
        { now: () => NOW },
      ).catch((e) => e),
    )
    expect(error).toBeInstanceOf(SyncError)
    expect(error.code).toBe('WRITE_FAILED')
    expect(error.message).toContain('.trae')
    // 「已完成 N/M 项」：N=1 且 M 远大于 2，说明后续写入被中止而不是继续试
    expect(error.message).toMatch(/已完成 1\/[3-9] 项/)
    // 回滚指引点名备份目录，且备份内容确实是被覆盖掉的本地文件
    const backupRoot = join(project, PACK_BACKUP_REL, STAMP)
    expect(error.message).toContain(backupRoot)
    expect(readFileSync(join(backupRoot, '.cursor/rules/openvibe.mdc'), 'utf8')).toBe(
      '本地手写的 cursor 规则\n',
    )
    // 已写文件保留、未写文件不存在、lock 不落地（重跑会重新规划）
    expect(readFileSync(join(project, '.cursor/rules/openvibe.mdc'), 'utf8')).toBe(
      pack['.cursor/rules/openvibe.mdc'],
    )
    expect(existsSync(join(project, '.trae/rules'))).toBe(false)
    expect(existsSync(join(project, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(false)

    // 幂等重跑：清掉障碍后同样的注入应当完整收敛，diff 随即 clean
    rmSync(join(project, '.trae'))
    const retry = await syncAction(
      { projectPath: project, file: bundlePath, yes: true },
      { now: () => new Date('2026-09-22T02:03:04.500Z') },
    )
    expect(existsSync(join(project, PACK_LOCK_REL))).toBe(true)
    expect(retry.writes.length).toBeGreaterThan(1)
    const diff = await diffAction({ projectPath: project })
    expect(diff.clean).toBe(true)
    expect(diff.exitCode).toBe(0)
  })
})

describe('符号链接第二道防线（m6b §6.1 / design §7.7 规则 3）', () => {
  // Windows CI 无建符号链接权限，与 CLI-SEC-01b 同一处置；本分支在 ubuntu/macos 上执行
  it.skipIf(IS_WINDOWS)(
    'CLI-SEC-04: 目标是悬空符号链接（项目外目录在、文件名不在）→ 整包拒绝，不得顺着链接往项目外建文件',
    async () => {
      const fx = demoPack()
      const { root, project } = sandbox()
      const bundlePath = writeBundleFile(root, fx)
      const outside = join(root, 'outside')
      mkdirSync(outside)
      symlinkSync(join(outside, 'fresh.md'), join(project, 'TERMS.md'))

      const error = asError(
        await syncAction({ projectPath: project, file: bundlePath, yes: true }).catch((e) => e),
      )
      expect(error).toBeInstanceOf(AppError)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect((error.details as { escapingPaths: string[] }).escapingPaths).toEqual(['TERMS.md'])
      // 关键证据：项目外没有凭空多出文件，合法文件也没被写（整包拒绝而非逐文件跳过）
      expect(existsSync(join(outside, 'fresh.md'))).toBe(false)
      expect(existsSync(join(project, 'AGENTS.md'))).toBe(false)
    },
  )
})

describe('令牌失效（m6b §6.6：提示重新生成，且绝不重试成环）', () => {
  it('CLI-SEC-05: 401 → 恰好一次请求，错误里带出 openvibe serve 的指路文案', async () => {
    let attempts = 0
    const fetchImpl: FetchLike = async () => {
      attempts += 1
      const body = JSON.stringify({ code: 'UNAUTHORIZED', message: '令牌无效' })
      return {
        status: 401,
        ok: false,
        text: async () => body,
        json: async () => JSON.parse(body) as unknown,
      }
    }
    const client = createClient({
      serverUrl: 'http://127.0.0.1:9',
      token: 'stale-token',
      fetchImpl,
    })

    const error = (await client.getJson('/api/packs').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.hint).toContain('openvibe serve')
    expect(attempts).toBe(1)
  })

  it('CLI-SEC-05b: 在线取包撞上 401 → 一次请求即止，项目树零写入', async () => {
    const { project } = sandbox()
    putFile(project, 'src/app.ts', 'export const a = 1\n')
    const before = treeSnapshot(project)
    const fake = fakeClient({
      get: { '/api/packs': new ApiError(401, 'UNAUTHORIZED', '令牌无效') },
      post: {},
    })

    const error = asError(
      await syncAction(
        { projectPath: project, pack: 'fixture@1.0.0', yes: true },
        { client: fake.client },
      ).catch((e: unknown) => e),
    )
    expect(error.code).toBe('UNAUTHORIZED')
    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/packs'])
    expect(treeSnapshot(project)).toEqual(before)
  })
})
