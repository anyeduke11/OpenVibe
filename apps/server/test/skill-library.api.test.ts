import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { buildApp } from '../src/app'

/**
 * Skill 库 / 扫描根清单 / 失效清理 / 下载落盘的**端点**测试（2026-10-30）。
 *
 * 四组能力各有自己的落点，这里按端点逐条钉：
 *  - 扫描根清单：读写两态（未配置 vs 已配置）+ 空数组 ≠ 未配置；
 *  - 库：备份/恢复/移出 + 台账列的读写；
 *  - 清理：预检不删、清理只删不可恢复的；
 *  - 下载：真的落盘（不是只建档）+ 台账指向落点。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []
const savedHome = process.env.OPENVIBE_HOME

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
  if (savedHome === undefined) delete process.env.OPENVIBE_HOME
  else process.env.OPENVIBE_HOME = savedHome
})

async function makeHarness(remoteFetchImpl?: typeof fetch): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: 'darwin',
    ...(remoteFetchImpl === undefined ? {} : { remoteFetchImpl }),
  })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

/** mock 上游：repo API + trees API + 文件内容（不碰真实网络） */
function mockGithub(): typeof fetch {
  const tree = {
    tree: [{ path: 'skills/pdf/SKILL.md', type: 'blob', sha: 'a1' }],
  }
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    if (url.endsWith('/repos/owner/repo')) {
      return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
    }
    if (url.includes('/git/trees/')) {
      return new Response(JSON.stringify(tree), { status: 200 })
    }
    if (url.includes('raw.githubusercontent.com')) {
      return new Response('---\nname: pdf\n---\nbody', { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: object,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() as T }
}

/** 造一个含 SKILL.md 的 skill 目录 */
function makeSkillDir(root: string, name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody`, 'utf8')
  return dir
}

describe('GET/POST /api/skills/scan-roots（扫描根清单）', () => {
  it('未配置 ⇒ configured=false 且给出出厂默认清单；写后 configured=true', async () => {
    const h = await makeHarness()
    const before = await api<{ roots: string[]; configured: boolean }>(
      h,
      'GET',
      '/api/skills/scan-roots',
    )
    expect(before.statusCode).toBe(200)
    expect(before.json.configured).toBe(false)
    expect(Array.isArray(before.json.roots)).toBe(true)

    const after = await api<{ roots: string[]; configured: boolean }>(
      h,
      'POST',
      '/api/skills/scan-roots',
      { roots: [{ path: '/tmp/a', enabled: true }] },
    )
    expect(after.statusCode).toBe(200)
    expect(after.json.configured).toBe(true)
    expect(after.json.roots).toEqual(['/tmp/a'])

    const reread = await api<{ roots: string[]; configured: boolean }>(
      h,
      'GET',
      '/api/skills/scan-roots',
    )
    expect(reread.json.configured).toBe(true)
    expect(reread.json.roots).toEqual(['/tmp/a'])
  })

  it('清空成空数组 ⇒ configured=true 且生效根为空（≠ 未配置）', async () => {
    const h = await makeHarness()
    await api(h, 'POST', '/api/skills/scan-roots', { roots: [{ path: '/tmp/a', enabled: true }] })
    const cleared = await api<{ roots: string[]; configured: boolean }>(
      h,
      'POST',
      '/api/skills/scan-roots',
      { roots: [] },
    )
    expect(cleared.json.configured).toBe(true)
    expect(cleared.json.roots).toEqual([])
    const reread = await api<{ roots: string[]; configured: boolean }>(
      h,
      'GET',
      '/api/skills/scan-roots',
    )
    expect(reread.json.configured).toBe(true)
    expect(reread.json.roots).toEqual([])
  })

  it('停用的根不进生效集合，但仍留在清单里', async () => {
    const h = await makeHarness()
    const res = await api<{ roots: string[]; items: { path: string; enabled: boolean }[] }>(
      h,
      'POST',
      '/api/skills/scan-roots',
      {
        roots: [
          { path: '/tmp/on', enabled: true },
          { path: '/tmp/off', enabled: false },
        ],
      },
    )
    expect(res.json.roots).toEqual(['/tmp/on'])
    expect(res.json.items).toHaveLength(2)
  })

  it('defaults 端点给出已知 agent 路径与库根', async () => {
    const h = await makeHarness()
    const res = await api<{ items: { path: string; exists: boolean }[]; libraryRoot: string }>(
      h,
      'GET',
      '/api/skills/scan-roots/defaults',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json.items.length).toBeGreaterThan(0)
    expect(res.json.libraryRoot).toContain('skills')
  })
})

describe('Skill 库端点（备份 / 恢复 / 移出）', () => {
  it('备份 ⇒ 副本落进库目录、台账记下 library_dir；恢复 ⇒ 写回原目录', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ov-lib-'))
    process.env.OPENVIBE_HOME = join(home, '.openvibe')
    const h = await makeHarness()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'pdf')
    try {
      const scan = await api<{ discovered: number }>(h, 'POST', '/api/skills/scan', {
        roots: [root],
      })
      expect(scan.json.discovered).toBe(1)

      const list = await api<{ items: { id: string; name: string; libraryDir: string | null }[] }>(
        h,
        'GET',
        '/api/skills',
      )
      const skill = list.json.items.find((s) => s.name === 'pdf')!
      expect(skill.libraryDir).toBeNull()

      const backup = await api<{ libraryDir: string; fileCount: number }>(
        h,
        'POST',
        `/api/skills/${skill.id}/library/backup`,
      )
      expect(backup.statusCode).toBe(200)
      expect(backup.json.fileCount).toBe(1)
      expect(existsSync(join(backup.json.libraryDir, 'SKILL.md'))).toBe(true)

      // 原目录没了 ⇒ 从库恢复
      rmSync(src, { recursive: true, force: true })
      const restore = await api<{ targetDir: string; fileCount: number }>(
        h,
        'POST',
        `/api/skills/${skill.id}/library/restore`,
      )
      expect(restore.statusCode).toBe(200)
      expect(restore.json.targetDir).toBe(src)
      expect(existsSync(join(src, 'SKILL.md'))).toBe(true)

      // 移出库 ⇒ 副本没了、原目录还在
      const remove = await api<{ skillId: string }>(
        h,
        'POST',
        `/api/skills/${skill.id}/library/remove`,
      )
      expect(remove.statusCode).toBe(200)
      expect(existsSync(backup.json.libraryDir)).toBe(false)
      expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('备份一条不存在的 skill ⇒ 404（不是 500）', async () => {
    const h = await makeHarness()
    const res = await api(h, 'POST', '/api/skills/nope/library/backup')
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/skills/:id/download（下载落盘）', () => {
  it('落盘后把 skill_dir / library_dir / remote_ref 一并写回台账', async () => {
    // ⚠️ **remote_ref 必须写回**：它是「检查更新」与「重新下载」的唯一依据。
    //   不写回 ⇒ 台账里这条仍像本地条目 ⇒ 界面不给下载按钮、也查不了更新。
    const home = mkdtempSync(join(tmpdir(), 'ov-dl-api-'))
    process.env.OPENVIBE_HOME = join(home, '.openvibe')
    const h = await makeHarness(mockGithub())
    try {
      const created = await api<{ id: string }>(h, 'POST', '/api/skills', {
        name: 'remote-demo',
        source: 'github',
        installedTargets: [],
      })
      const res = await api<{ targetDir: string; fileCount: number }>(
        h,
        'POST',
        `/api/skills/${created.json.id}/download`,
        { remoteRef: 'github:owner/repo@main:skills/pdf' },
      )
      expect(res.statusCode).toBe(200)
      expect(res.json.fileCount).toBe(1)
      const after = await api<{
        items: {
          id: string
          skillDir: string | null
          libraryDir: string | null
          remoteRef: string | null
        }[]
      }>(h, 'GET', '/api/skills')
      const row = after.json.items.find((i) => i.id === created.json.id)
      expect(row?.skillDir).toBe(res.json.targetDir)
      expect(row?.libraryDir).toBe(res.json.targetDir)
      expect(row?.remoteRef).toBe('github:owner/repo@main:skills/pdf')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('没有任何溯源串 ⇒ 422（不是 500），并说清是缺溯源串', async () => {
    const h = await makeHarness()
    const created = await api<{ id: string }>(h, 'POST', '/api/skills', {
      name: 'no-ref-demo',
      source: 'github',
      installedTargets: [],
    })
    const res = await api<{ code: string; message: string }>(
      h,
      'POST',
      `/api/skills/${created.json.id}/download`,
      {},
    )
    expect(res.statusCode).toBe(422)
    expect(res.json.code).toBe('VALIDATION_ERROR')
    expect(res.json.message).toContain('溯源串')
  })
})

describe('失效条目清理端点', () => {
  it('预检只报告；清理删掉不可恢复的，可下载的保留', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ov-clean-'))
    process.env.OPENVIBE_HOME = join(home, '.openvibe')
    const h = await makeHarness()
    const root = join(home, '.claude', 'skills')
    const gone = makeSkillDir(root, 'gone')
    const alive = makeSkillDir(root, 'alive')
    try {
      await api(h, 'POST', '/api/skills/scan', { roots: [root] })
      rmSync(gone, { recursive: true, force: true })

      const preview = await api<{
        items: { name: string; unrecoverable: boolean }[]
        summary: { stale: number }
      }>(h, 'GET', '/api/skills/cleanup')
      expect(preview.statusCode).toBe(200)
      expect(preview.json.summary.stale).toBe(1)
      expect(preview.json.items[0]?.name).toBe('gone')
      expect(preview.json.items[0]?.unrecoverable).toBe(true)
      // 预检不删
      const still = await api<{ items: unknown[] }>(h, 'GET', '/api/skills')
      expect(still.json.items).toHaveLength(2)

      const cleaned = await api<{ removed: number }>(h, 'POST', '/api/skills/cleanup', {})
      expect(cleaned.statusCode).toBe(200)
      expect(cleaned.json.removed).toBe(1)

      const after = await api<{ items: { name: string }[] }>(h, 'GET', '/api/skills')
      expect(after.json.items.map((i) => i.name)).toEqual(['alive'])
      expect(existsSync(join(alive, 'SKILL.md'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('远程条目（skillDir 为空）不进清理范围 —— 一键清空不能删光刚导入的远程 skill', async () => {
    const h = await makeHarness()
    // 远程条目：只建档不落盘 ⇒ skillDir 恒 null
    await api(h, 'POST', '/api/skills', {
      name: 'remote-only',
      source: 'github',
      installedTargets: [],
    })
    const preview = await api<{ items: unknown[] }>(h, 'GET', '/api/skills/cleanup')
    expect(preview.json.items).toEqual([])
    const cleaned = await api<{ removed: number }>(h, 'POST', '/api/skills/cleanup', {})
    expect(cleaned.json.removed).toBe(0)
    const after = await api<{ items: unknown[] }>(h, 'GET', '/api/skills')
    expect(after.json.items).toHaveLength(1)
  })
})
