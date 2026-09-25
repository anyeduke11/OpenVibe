import { describe, expect, it } from 'vitest'
import { PackLockSchema, type PackLock } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'
import { buildPackLock, packLockJson, parsePackLock } from './lock'
import { applyDecisions, planInjection } from './planner'
import type { PackFileWithHash } from './planner'

const A_PACK = '# 包内 AGENTS.md 1.1.0\n'
const C_PACK = '# 包内 CLAUDE.md 1.1.0\n'
const T_BODY = '# 术语表\n'
const HASH_OLD = 'c'.repeat(64)
const NEW_FP = 'd'.repeat(64)
const PACK = { id: 'pk_x', name: 'default', version: '1.1.0', fingerprint: NEW_FP }

function f(path: string, content: string): PackFileWithHash {
  return { path, content, sha256: fileSha256(content) }
}
const PACK_FILES = [f('AGENTS.md', A_PACK), f('CLAUDE.md', C_PACK), f('TERMS.md', T_BODY)]
const CONTENTS: Record<string, string> = {
  'AGENTS.md': A_PACK,
  'CLAUDE.md': C_PACK,
  'TERMS.md': T_BODY,
}
function diskOf(files: Record<string, string>) {
  return (path: string): string | null => {
    const v = files[path]
    return v === undefined ? null : v
  }
}
function build(input: Parameters<typeof buildPackLock>[0]) {
  return buildPackLock(input)
}

describe('UT-INJECT-LOCK-01 · lock 文件形状（design §7.5）', () => {
  it('首次全量注入 → schemaVersion/pack/逐文件期望哈希 + managed 全真', () => {
    const plan = planInjection({
      files: PACK_FILES,
      readDisk: diskOf({}),
      lock: null,
      targets: null,
    })
    const writes = applyDecisions(plan, CONTENTS, {})
    const lock = build({
      pack: PACK,
      plan,
      written: writes.writes.map((w) => w.path),
      oldLock: null,
      injectedAt: '2026-09-22T00:00:00Z',
    })
    expect(PackLockSchema.parse(lock)).toEqual(lock)
    expect(lock).toMatchObject({
      schemaVersion: 1,
      pack: { id: 'pk_x', name: 'default', version: '1.1.0', fingerprint: NEW_FP },
      injectedAt: '2026-09-22T00:00:00Z',
    })
    expect(lock.files).toEqual([
      { path: 'AGENTS.md', sha256: fileSha256(A_PACK), managed: true },
      { path: 'CLAUDE.md', sha256: fileSha256(C_PACK), managed: true },
      { path: 'TERMS.md', sha256: fileSha256(T_BODY), managed: true },
    ])
  })

  it('packLockJson 稳定：码点序 + 两空格缩进 + 结尾换行', () => {
    const plan = planInjection({
      files: PACK_FILES,
      readDisk: diskOf({}),
      lock: null,
      targets: null,
    })
    const lock = build({
      pack: PACK,
      plan,
      written: ['CLAUDE.md'],
      oldLock: null,
      injectedAt: '2026-09-22T00:00:00Z',
    })
    const json = packLockJson(lock)
    expect(json.endsWith('\n')).toBe(true)
    expect(json).toBe(packLockJson(JSON.parse(json) as PackLock))
    expect(json.split('\n').slice(0, 3)).toEqual(['{', '  "schemaVersion": 1,', '  "pack": {'])
  })
})

describe('UT-INJECT-LOCK-02 · managed 是「本包负责过该文件」的持久标记', () => {
  const oldLock: PackLock = {
    schemaVersion: 1,
    pack: { id: 'pk_x', name: 'default', version: '1.0.0', fingerprint: HASH_OLD },
    injectedAt: '2026-09-20T02:11:00Z',
    files: [
      { path: 'AGENTS.md', sha256: fileSha256(A_PACK), managed: true },
      { path: 'CLAUDE.md', sha256: fileSha256(C_PACK), managed: true },
    ],
  }

  it('--target 只刷 CLAUDE.md：范围外的受管文件仍为 managed，但只有实写项刷新哈希', () => {
    const plan = planInjection({
      files: PACK_FILES,
      readDisk: diskOf({ 'AGENTS.md': '# 用户手改\n' }),
      lock: oldLock,
      targets: ['CLAUDE.md'],
    })
    const writes = applyDecisions(plan, CONTENTS, {})
    expect(writes.writes.map((w) => w.path)).toEqual(['CLAUDE.md'])
    const lock = build({
      pack: PACK,
      plan,
      written: writes.writes.map((w) => w.path),
      oldLock,
      injectedAt: '2026-09-22T00:00:00Z',
    })
    // 范围外三项：AGENTS 仍受管（下次全量 sync 才能继续走 DRIFT 而不是 CONFLICT）
    expect(lock.files).toEqual([
      { path: 'AGENTS.md', sha256: fileSha256(A_PACK), managed: true },
      { path: 'CLAUDE.md', sha256: fileSha256(C_PACK), managed: true },
      { path: 'TERMS.md', sha256: fileSha256(T_BODY), managed: false },
    ])
    expect(lock.pack.version).toBe('1.1.0')
  })

  it('首次被 --target 过滤掉的包文件登记期望哈希但 managed=false（§7.5 供后续补齐）', () => {
    const plan = planInjection({
      files: PACK_FILES,
      readDisk: diskOf({}),
      lock: null,
      targets: ['TERMS.md'],
    })
    const lock = build({
      pack: PACK,
      plan,
      written: ['TERMS.md'],
      oldLock: null,
      injectedAt: '2026-09-22T00:00:00Z',
    })
    expect(lock.files.map((x) => [x.path, x.managed])).toEqual([
      ['AGENTS.md', false],
      ['CLAUDE.md', false],
      ['TERMS.md', true],
    ])
  })
})

describe('UT-INJECT-LOCK-03 · 包更新后消失的旧文件不清理但留痕（m6b §6.2）', () => {
  it('旧 lock 有、新包没有的路径 → 原哈希与 managed 保留', () => {
    const plan = planInjection({
      files: PACK_FILES,
      readDisk: diskOf({}),
      lock: null,
      targets: null,
    })
    const lock = build({
      pack: PACK,
      plan,
      written: plan.files.map((x) => x.path),
      oldLock: {
        schemaVersion: 1,
        pack: { id: 'pk_x', name: 'default', version: '1.0.0', fingerprint: HASH_OLD },
        injectedAt: '2026-09-20T02:11:00Z',
        files: [
          { path: 'CHECKLIST.md', sha256: 'e'.repeat(64), managed: true },
          { path: 'TERMS.md', sha256: 'f'.repeat(64), managed: false },
        ],
      },
      injectedAt: '2026-09-22T00:00:00Z',
    })
    expect(lock.files.find((x) => x.path === 'CHECKLIST.md')).toEqual({
      path: 'CHECKLIST.md',
      sha256: 'e'.repeat(64),
      managed: true,
    })
    // 同名路径以新包为准，旧哈希不残留
    expect(lock.files.find((x) => x.path === 'TERMS.md')?.sha256).toBe(fileSha256(T_BODY))
  })
})

describe('UT-INJECT-LOCK-04 · parsePackLock（损坏即无 lock，绝不抛进主流程）', () => {
  it('合法 JSON → PackLock；非 JSON / schemaVersion 非 1 / 路径非法 → null', () => {
    const good = packLockJson(
      build({
        pack: PACK,
        plan: planInjection({ files: PACK_FILES, readDisk: diskOf({}), lock: null, targets: null }),
        written: [],
        oldLock: null,
        injectedAt: '2026-09-22T00:00:00Z',
      }),
    )
    expect(parsePackLock(good)?.pack.name).toBe('default')
    expect(parsePackLock('{ oops')).toBeNull()
    expect(parsePackLock('[]')).toBeNull()
    const badVersion = JSON.parse(good) as { schemaVersion: number }
    badVersion.schemaVersion = 2
    expect(parsePackLock(JSON.stringify(badVersion))).toBeNull()
    const badPath = JSON.parse(good) as { files: { path: string }[] }
    badPath.files[0] = { path: '../escape.md' }
    expect(parsePackLock(JSON.stringify(badPath))).toBeNull()
  })

  // 同一 path 挂两套凭据时，删除循环按条目顺序判定 ⇒ 同一份盘内容既可能落 DRIFT（保留）又可能落 IN_SYNC（删）
  it('同一路径登记两次且凭据不一致 → 整份读不回，且报错点名冲突的那个路径', () => {
    const dup = {
      schemaVersion: 1,
      pack: PACK,
      injectedAt: '2026-09-22T00:00:00Z',
      files: [
        { path: 'AGENTS.md', sha256: HASH_OLD, managed: true },
        { path: 'AGENTS.md', sha256: NEW_FP, managed: false },
      ],
    }
    const result = PackLockSchema.safeParse(dup)
    expect(result.success).toBe(false)
    expect(result.success ? '' : result.error.issues.map((i) => i.message).join('\n')).toContain(
      'AGENTS.md',
    )
    expect(parsePackLock(JSON.stringify(dup))).toBeNull()
  })

  // 承 T3 修复轮登记在 clean.ts 与 CLI-CLEAN-06f 的「按条目计」口径：重复本身不是损坏
  it('同一路径逐字节重复登记 → 仍读得回，且不被悄悄去重（条目数即计数口径的输入）', () => {
    const repeated = {
      schemaVersion: 1,
      pack: PACK,
      injectedAt: '2026-09-22T00:00:00Z',
      files: [
        { path: 'AGENTS.md', sha256: HASH_OLD, managed: true },
        { path: 'TERMS.md', sha256: NEW_FP, managed: true },
        { path: 'AGENTS.md', sha256: HASH_OLD, managed: true },
      ],
    }
    const parsed = PackLockSchema.safeParse(repeated)
    expect(parsed.success).toBe(true)
    expect(parsed.success ? parsed.data.files : []).toHaveLength(3)
    expect(parsePackLock(JSON.stringify(repeated))?.files.map((x) => x.path)).toEqual([
      'AGENTS.md',
      'TERMS.md',
      'AGENTS.md',
    ])
  })
})
