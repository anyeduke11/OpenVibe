import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import type { SkillOut, SkillScanReport, SkillVersionOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  /** 扫描根与项目目录都建在沙箱里，用例结束统一删（不碰真实 ~/.claude） */
  root: string
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle, root: mkdtempSync(join(tmpdir(), 'ov-m2-test-')) }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
    if (h) rmSync(h.root, { recursive: true, force: true })
  }
})

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
): Promise<{ statusCode: number; body: string; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  // 204 无响应体，不能 res.json()（light-my-request 会抛 SyntaxError）
  return {
    statusCode: res.statusCode,
    body: res.body,
    json: (res.payload === '' ? undefined : (res.json() as T)) as T,
  }
}

const scan = (h: Harness, roots: string[]) =>
  api<SkillScanReport>(h, 'POST', '/api/skills/scan', { roots })

const listSkills = (h: Harness, q?: string) =>
  api<{ items: SkillOut[]; total: number }>(
    h,
    'GET',
    `/api/skills${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`,
  )

const skillVersions = (h: Harness, id: string) =>
  api<{ items: SkillVersionOut[]; total: number }>(h, 'GET', `/api/skills/${id}/versions`)

const countRows = (h: Harness, sql: string): number =>
  (h.handle.db.prepare(sql).get() as { n: number }).n

/** 建一个 skill 目录：SKILL.md + 一个附属文件 */
function mkSkillDir(root: string, dirName: string, body: string): string {
  const dir = join(root, dirName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), body)
  writeFileSync(join(dir, 'references.md'), `refs of ${dirName}`)
  return dir
}

const withFm = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n正文内容。\n`

function scanRoot(h: Harness, name = 'skills'): string {
  const dir = join(h.root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('T5b · m2 §7 验收映射（扫描 API 行为层）', () => {
  it('IT-SKILL-01（§7.1）: 三目录（一个无 frontmatter）→ discovered=3 created=3，回退目录名并警告', async () => {
    const h = await makeHarness()
    const root = scanRoot(h)
    mkSkillDir(root, 'alpha-skill', withFm('alpha-skill', '甲技能'))
    mkSkillDir(root, 'beta-skill', withFm('beta-skill', '乙技能'))
    mkSkillDir(root, 'gamma-skill', '# 无 frontmatter\n\n只有正文。\n')
    mkdirSync(join(root, 'not-a-skill'), { recursive: true })
    writeFileSync(join(root, 'not-a-skill', 'README.md'), 'hi')

    const res = await scan(h, [root])
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({ discovered: 3, created: 3, updated: 0, skipped: 0 })
    expect(res.json.warnings).toHaveLength(1)
    expect(res.json.warnings[0]).toContain('frontmatter')
    expect(res.json.warnings[0]).toContain('gamma-skill')

    const list = await listSkills(h)
    expect(list.json.total).toBe(3)
    const gamma = list.json.items.find((s) => s.name === 'gamma-skill')
    expect(gamma).toMatchObject({ source: 'local', description: '' })
    expect(gamma?.skillDir).toBe(join(root, 'gamma-skill'))
    expect(gamma?.latestVersionId).toBeTruthy()

    const alpha = list.json.items.find((s) => s.name === 'alpha-skill')
    expect(alpha?.description).toBe('甲技能')
  })

  it('IT-SKILL-02（§7.2 + §7.3）: 未变更重扫全 skipped；改一个 SKILL.md → 该条 versions=2 且 latest 指新版', async () => {
    const h = await makeHarness()
    const root = scanRoot(h)
    mkSkillDir(root, 'alpha-skill', withFm('alpha-skill', '甲技能'))
    mkSkillDir(root, 'beta-skill', withFm('beta-skill', '乙技能'))

    expect((await scan(h, [root])).json).toMatchObject({ created: 2, skipped: 0 })
    const first = (await listSkills(h)).json.items
    const alpha = first.find((s) => s.name === 'alpha-skill')
    if (!alpha) throw new Error('alpha-skill 未入库')
    const v1Id = alpha.latestVersionId

    // §7.3：完全未变更再扫 → 全 skipped，版本数不涨
    expect((await scan(h, [root])).json).toMatchObject({
      discovered: 2,
      created: 0,
      updated: 0,
      skipped: 2,
    })
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM skill_versions')).toBe(2)

    // §7.2：只改 alpha
    writeFileSync(join(root, 'alpha-skill', 'SKILL.md'), withFm('alpha-skill', '甲技能（改）'))
    expect((await scan(h, [root])).json).toMatchObject({
      discovered: 2,
      created: 0,
      updated: 1,
      skipped: 1,
    })

    const vers = (await skillVersions(h, alpha.id)).json.items
    expect(vers).toHaveLength(2)
    const after = (await listSkills(h)).json.items
    const alphaNow = after.find((s) => s.name === 'alpha-skill')
    expect(alphaNow?.latestVersionId).toBeTruthy()
    expect(alphaNow?.latestVersionId).not.toBe(v1Id)
    expect(alphaNow?.latestVersionId).toBe(vers[1]?.id)
    expect(alphaNow?.description).toBe('甲技能（改）')
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM skill_versions')).toBe(3)

    const beta = after.find((s) => s.name === 'beta-skill')
    if (!beta) throw new Error('beta-skill 未入库')
    expect((await skillVersions(h, beta.id)).json.total).toBe(1)
  })

  it('IT-SKILL-03（§7.4）: 手动登记 my-skill → 放同名目录再扫 → 该手动条目 versions=2 且保留安装标记', async () => {
    const h = await makeHarness()
    const created = await api<SkillOut>(h, 'POST', '/api/skills', {
      name: 'my-skill',
      description: '手工写下的说明',
      source: 'manual',
      installedTargets: ['claude-code'],
    })
    expect(created.statusCode).toBe(201)
    expect(created.json).toMatchObject({
      source: 'manual',
      skillDir: null,
      installedTargets: ['claude-code'],
    })
    // 手动登记即 v1 首版本（无目录指纹），扫描并入后才成为「版本 2」
    expect(created.json.latestVersionId).toBeTruthy()
    expect((await skillVersions(h, created.json.id)).json.items).toEqual([
      expect.objectContaining({ versionLabel: 'v1', dirHash: '', fileCount: 0 }),
    ])

    const dup = await api<{ code: string }>(h, 'POST', '/api/skills', {
      name: 'my-skill',
      description: '重复',
      source: 'manual',
    })
    expect(dup.statusCode).toBe(422)
    expect(dup.json.code).toBe('NAME_CONFLICT')

    const root = scanRoot(h, 'scan-2')
    mkSkillDir(root, 'my-skill', withFm('my-skill', '扫出来的说明'))
    expect((await scan(h, [root])).json).toMatchObject({
      discovered: 1,
      created: 0,
      updated: 1,
      skipped: 0,
    })

    expect((await skillVersions(h, created.json.id)).json.total).toBe(2)
    const merged = (await listSkills(h, 'my-skill')).json.items[0]
    expect(merged?.id).toBe(created.json.id)
    expect(merged?.skillDir).toBe(join(root, 'my-skill'))
    expect(merged?.installedTargets).toEqual(['claude-code'])

    // 再扫同一目录：指纹命中 → skipped，不追加第三条版本
    expect((await scan(h, [root])).json).toMatchObject({ skipped: 1, updated: 0 })
    expect((await skillVersions(h, created.json.id)).json.total).toBe(2)
  })

  it('IT-SKILL-04（§7.5）: 删 skill → 版本级联清零；缺失扫描根与空根都不报错', async () => {
    const h = await makeHarness()
    const root = scanRoot(h)
    mkSkillDir(root, 'alpha-skill', withFm('alpha-skill', '甲技能'))
    expect((await scan(h, [root])).json).toMatchObject({ created: 1 })
    const skill = (await listSkills(h)).json.items[0]
    if (!skill) throw new Error('扫描未产出 skill')
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM skill_versions')).toBe(1)

    expect((await api(h, 'DELETE', `/api/skills/${skill.id}`)).statusCode).toBe(204)
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM skills')).toBe(0)
    expect(countRows(h, 'SELECT COUNT(*) AS n FROM skill_versions')).toBe(0)

    const again = await api<{ code: string }>(h, 'DELETE', `/api/skills/${skill.id}`)
    expect(again.statusCode).toBe(404)
    expect(again.json.code).toBe('NOT_FOUND')
    expect((await skillVersions(h, skill.id)).statusCode).toBe(404)

    // 不存在的扫描根：warning 记录并跳过（m2 §6.2），不抛 500
    const missing = await scan(h, [join(h.root, 'no-such-root')])
    expect(missing.statusCode).toBe(200)
    expect(missing.json.discovered).toBe(0)
    expect(missing.json.warnings.some((w) => w.includes('no-such-root'))).toBe(true)

    // roots: [] 不回落默认根（否则会读真实 ~/.claude/skills，结果随机器漂移）
    const empty = await scan(h, [])
    expect(empty.statusCode).toBe(200)
    expect(empty.json).toMatchObject({ discovered: 0, created: 0 })
    expect(empty.json.warnings).toEqual([])
  })

  it('IT-SKILL-05: 台账查询与维护——q 命中名称/描述且大小写不敏感；PATCH 只改描述与安装标记', async () => {
    const h = await makeHarness()
    const root = scanRoot(h)
    mkSkillDir(root, 'alpha-skill', withFm('alpha-skill', '处理 PDF 报表'))
    mkSkillDir(root, 'beta-skill', withFm('beta-skill', '生成幻灯片'))
    await scan(h, [root])

    expect((await listSkills(h, 'ALPHA')).json.total).toBe(1)
    expect((await listSkills(h, 'ALPHA')).json.items[0]?.name).toBe('alpha-skill')
    expect((await listSkills(h, '幻灯片')).json.items.map((s) => s.name)).toEqual(['beta-skill'])
    expect((await listSkills(h, '')).json.total).toBe(2)
    expect((await listSkills(h)).json.total).toBe(2)

    const target = (await listSkills(h, 'alpha')).json.items[0]
    if (!target) throw new Error('查询未命中 alpha-skill')
    const patched = await api<SkillOut>(h, 'PATCH', `/api/skills/${target.id}`, {
      description: '改过的说明',
      installedTargets: ['claude-code', 'cursor'],
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json).toMatchObject({
      name: 'alpha-skill',
      description: '改过的说明',
      installedTargets: ['claude-code', 'cursor'],
    })

    // name 不在更新白名单里：带上也应被 schema 剥掉
    const ignoreName = await api<SkillOut>(h, 'PATCH', `/api/skills/${target.id}`, { name: '改名' })
    expect(ignoreName.statusCode).toBe(200)
    expect(ignoreName.json.name).toBe('alpha-skill')

    expect((await api(h, 'PATCH', '/api/skills/skl_ghost', { description: 'x' })).statusCode).toBe(404)

    // 重复扫描同一根不会产出第二条同名 skill
    await scan(h, [root])
    expect((await listSkills(h)).json.total).toBe(2)
  })
})
