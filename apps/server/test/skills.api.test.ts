import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { hashSkillEntries } from '@openvibe/core'
import type {
  SkillDuplicatesReport,
  SkillOut,
  SkillRemoteImportReport,
  SkillRemoteSearchReport,
  SkillReviewReport,
  SkillScanReport,
  SkillUpdateCheckReport,
  SkillVersionOut,
} from '@openvibe/shared'
import { buildApp } from '../src/app'

// 出站守卫的 DNS 分支注入固定解析结果：测试不碰真实网络（协议/主机检查仍走真实现）
vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  return {
    ...actual,
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  }
})

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  /** 扫描根与项目目录都建在沙箱里，用例结束统一删（不碰真实 ~/.claude） */
  root: string
}

const openHandles: Harness[] = []

async function makeHarness(opts: { remoteFetchImpl?: typeof fetch } = {}): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({
    db: handle.db,
    token: TOKEN,
    remoteFetchImpl: opts.remoteFetchImpl,
  })
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

    // 不存在的扫描根：warning 记录并跳过（m2 §6.2），不抛 500；根记入 missingRoots（DEV-0063）
    const missingRoot = join(h.root, 'no-such-root')
    const missing = await scan(h, [missingRoot])
    expect(missing.statusCode).toBe(200)
    expect(missing.json.discovered).toBe(0)
    expect(missing.json.warnings.some((w) => w.includes('no-such-root'))).toBe(true)
    expect(missing.json.missingRoots).toEqual([missingRoot])
    expect(missing.json.scannedRoots).toEqual([])

    // roots: [] 不回落默认根（否则会读真实 home 下 ~/.*/skills，结果随机器漂移）
    const empty = await scan(h, [])
    expect(empty.statusCode).toBe(200)
    expect(empty.json).toMatchObject({ discovered: 0, created: 0 })
    expect(empty.json.warnings).toEqual([])
    expect(empty.json.scannedRoots).toEqual([])
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

// ---------------------------------------------------------------------------
// 远程导入 / 重复整理 / 内置审查（DEV-0067）——上游一律 mock，DNS 已在文件头注入
// ---------------------------------------------------------------------------

const GH_SKILL_MD =
  '---\nname: pdf-kit\ndescription: 解析 PDF 报表的技能，当用户提到 PDF 时使用\n---\n' +
  '操作指引足够长的一段正文，包含步骤与验收方式，覆盖失败分支的处理建议。\n'
const COS_SKILL_MD =
  '---\nname: pdf-pro\ndescription: 当用户处理 PDF 时使用的中文技能\n---\n' +
  '这份正文也足够长，包含具体步骤、输入输出与验收标准，避免触发正文过短告警。\n'

/** 按 URL 精确匹配的 stub fetch：字符串值 → 200（对象自动 JSON 化），数字 → 该状态码。
 *  routes 为外部可变对象（同一 const 引用），测试可中途改写以模拟远端变化 */
function stubFetch(routes: Record<string, string | number | object>): typeof fetch {
  const fn = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    const hit = routes[url]
    if (hit === undefined) throw new Error(`stub 未覆盖的 URL: ${url}`)
    if (typeof hit === 'number') return new Response(null, { status: hit })
    if (typeof hit === 'object' && hit !== null && 'status' in hit) {
      const { status, headers } = hit as { status: number; headers: Record<string, string> }
      return new Response(null, { status, headers })
    }
    const body = typeof hit === 'string' ? hit : JSON.stringify(hit)
    return new Response(body, { status: 200 })
  }) as typeof fetch
  return fn
}

describe('远程导入 / 整理 / 审查（DEV-0067）', () => {
  it('GitHub 整仓导入：建账带溯源版本串；重扫同内容 skipped；仓库 URL 归一', async () => {
    const tree = {
      tree: [
        { path: 'skills/pdf-kit/SKILL.md', type: 'blob', size: GH_SKILL_MD.length },
        { path: 'skills/pdf-kit/helpers.md', type: 'blob', size: 7 },
        { path: 'README.md', type: 'blob', size: 10 }, // 根下散文件不属于任何 skill
      ],
    }
    const fetchImpl = stubFetch({
      'https://api.github.com/repos/anthropics/skills': { default_branch: 'main' },
      'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1': tree,
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf-kit/SKILL.md': GH_SKILL_MD,
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf-kit/helpers.md': 'helpers',
      // 完整 URL 形态也归一到同一仓库
      'https://api.github.com/repos/other/repo': { default_branch: 'main' },
      'https://api.github.com/repos/other/repo/git/trees/main?recursive=1': tree,
      'https://raw.githubusercontent.com/other/repo/main/skills/pdf-kit/SKILL.md': GH_SKILL_MD,
      'https://raw.githubusercontent.com/other/repo/main/skills/pdf-kit/helpers.md': 'helpers',
    })
    const h = await makeHarness({ remoteFetchImpl: fetchImpl })

    const res = await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'github',
      repo: 'anthropics/skills',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({
      source: 'github',
      origin: 'anthropics/skills@main',
      discovered: 1,
      created: 1,
      updated: 0,
    })
    const item = (await listSkills(h)).json.items[0]
    expect(item?.source).toBe('github')
    expect(item?.skillDir).toBeNull()
    expect((await skillVersions(h, item?.id ?? '')).json.items[0]?.versionLabel).toBe(
      'anthropics/skills@main',
    )

    // 同内容重导 → skipped；URL 形态的 repo 命中同一仓库
    const again = await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'github',
      repo: 'https://github.com/other/repo',
    })
    expect(again.json).toMatchObject({ discovered: 1, created: 0, skipped: 1 })
  })

  it('SkillHub 按 slug 导入：清单 sha256 直接算指纹（与 core 同公式）；SKILL.md 走 COS 302', async () => {
    const detail = { latestVersion: { version: '1.2.0' }, name: 'PDF 处理', description: 'd' }
    const manifest = {
      version: '1.2.0',
      files: [
        { path: 'SKILL.md', sha256: 'a'.repeat(64), size: 100 },
        { path: '_meta.json', sha256: 'b'.repeat(64), size: 10 },
      ],
    }
    const fetchImpl = stubFetch({
      'https://api.skillhub.cn/api/v1/skills/pdf-pro': detail,
      'https://api.skillhub.cn/api/v1/skills/pdf-pro/files': manifest,
      'https://api.skillhub.cn/api/v1/skills/pdf-pro/file?path=SKILL.md': {
        status: 302,
        headers: { location: 'https://bucket.cos.accelerate.myqcloud.com/pdf-pro/1.2.0/SKILL.md' },
      },
      'https://bucket.cos.accelerate.myqcloud.com/pdf-pro/1.2.0/SKILL.md': COS_SKILL_MD,
    })
    const h = await makeHarness({ remoteFetchImpl: fetchImpl })

    const res = await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'skillhub',
      slug: 'pdf-pro',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({
      source: 'skillhub',
      origin: 'skillhub.cn/skills/pdf-pro@1.2.0',
      discovered: 1,
      created: 1,
    })
    const item = (await listSkills(h)).json.items[0]
    expect(item?.name).toBe('pdf-pro') // frontmatter 名优先于市场名
    const versions = (await skillVersions(h, item?.id ?? '')).json.items
    expect(versions[0]?.versionLabel).toBe('pdf-pro@1.2.0')
    // 指纹 = 清单 sha256 按同一公式拼接，本地扫描的同内容目录会得到同指纹
    expect(versions[0]?.dirHash).toBe(
      hashSkillEntries([
        { rel: 'SKILL.md', sha256: 'a'.repeat(64) },
        { rel: '_meta.json', sha256: 'b'.repeat(64) },
      ]).dirHash,
    )
  })

  it('SkillHub 搜索映射 slug/名称/下载量；非法仓库格式 422', async () => {
    const fetchImpl = stubFetch({
      'https://api.skillhub.cn/api/skills?q=pdf&page=1&pageSize=10': {
        code: 0,
        data: {
          total: 1,
          skills: [
            {
              slug: 'pdf-pro',
              name: 'PDF 处理',
              description: 'en desc',
              description_zh: '中文描述',
              downloads: 41,
              stars: 2,
              updated_at: 1700000000000,
            },
          ],
        },
      },
    })
    const h = await makeHarness({ remoteFetchImpl: fetchImpl })

    const res = await api<SkillRemoteSearchReport>(h, 'POST', '/api/skills/remote/search', {
      source: 'skillhub',
      q: 'pdf',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json.total).toBe(1)
    expect(res.json.items[0]).toMatchObject({
      slug: 'pdf-pro',
      name: 'PDF 处理',
      description: '中文描述',
      downloads: 41,
    })

    const bad = await api(h, 'POST', '/api/skills/remote/import', {
      source: 'github',
      repo: '../etc/passwd',
    })
    expect(bad.statusCode).toBe(422)
  })

  it('重复整理与审查端点：同内容组/失效目录/名称异常 + 审查分级', async () => {
    const h = await makeHarness()
    const root = scanRoot(h)
    const mkBare = (dirName: string, content: string) => {
      mkdirSync(join(root, dirName), { recursive: true })
      writeFileSync(join(root, dirName, 'SKILL.md'), content)
    }
    mkBare('dup', '---\nname: dup\ndescription: 当用户需要去重时使用\n---\n' + 'x'.repeat(50))
    mkBare('stale-dir', '---\nname: stale-skill\ndescription: 当用户测试失效检测时使用\n---\nbody')
    mkBare(
      'dirty',
      '---\nname: dirty\ndescription: Use when cleaning\n---\napi key here sk-abcdefghijklmnopqrstuvwxyz012345',
    )
    await scan(h, [root])

    // stale-skill 的目录删除 → 台账条目记 stale
    rmSync(join(root, 'stale-dir'), { recursive: true })

    // 引号名存量 + 白盒复制 dup 的真实指纹（模拟旧版扫描：引号名建账后，剥引号重扫建了第二条，
    // 两条 hash 相同、名字不同 → 同内容重复组。这正是整理要抓的存量形态）
    const manual = await api<{ id: string }>(h, 'POST', '/api/skills', {
      name: '"dup"',
      description: '',
      source: 'manual',
    })
    const dupHash = (
      h.handle.db
        .prepare(
          `SELECT sv.dir_hash FROM skill_versions sv JOIN skills s ON s.id = sv.skill_id WHERE s.name = 'dup'`,
        )
        .get() as { dir_hash: string }
    ).dir_hash
    expect(dupHash).not.toBe('')
    h.handle.db
      .prepare('UPDATE skill_versions SET dir_hash = ? WHERE skill_id = ?')
      .run(dupHash, manual.json.id)

    const dup = await api<SkillDuplicatesReport>(h, 'GET', '/api/skills/duplicates')
    expect(dup.statusCode).toBe(200)
    expect(dup.json.sameContent).toHaveLength(1)
    expect(dup.json.sameContent[0]?.skills.map((s) => s.name).sort()).toEqual(['"dup"', 'dup'])
    expect(dup.json.stale.map((s) => s.name)).toEqual(['stale-skill'])
    expect(dup.json.nameAnomalies.map((s) => s.name)).toEqual(['"dup"'])

    const review = await api<SkillReviewReport>(h, 'POST', '/api/skills/review', {})
    expect(review.statusCode).toBe(200)
    const dirty = review.json.items.find((i) => i.name === 'dirty')
    expect(dirty?.level).toBe('fail')
    expect(dirty?.issues.some((i) => i.code === 'possible-secret')).toBe(true)
    const legacy = review.json.items.find((i) => i.name === '"dup"')
    expect(legacy?.issues.some((i) => i.code === 'name-quoted')).toBe(true)
    expect(review.json.summary.fail).toBeGreaterThanOrEqual(2)

    // 清理走既有 DELETE：删掉引号存量后同内容组消失
    await api(h, 'DELETE', `/api/skills/${manual.json.id}`)
    const after = await api<SkillDuplicatesReport>(h, 'GET', '/api/skills/duplicates')
    expect(after.json.sameContent).toHaveLength(0)
  })

  it('GitHub 指定子目录导入（DEV-0068）：path 过滤 + 树指纹建档；检查更新三态', async () => {
    const tree = {
      tree: [
        { path: 'skills/pdf-kit/SKILL.md', type: 'blob', sha: 'blobaaa', size: GH_SKILL_MD.length },
        { path: 'skills/pdf-kit/helpers.md', type: 'blob', sha: 'blobbbb', size: 7 },
        { path: 'other/skill/SKILL.md', type: 'blob', sha: 'blocccc', size: 10 }, // path 过滤应排除
      ],
    }
    // 可变 stub：中途改写 blob sha 模拟远端更新（建档与检查共用同一 harness）
    const routes: Record<string, string | number | object> = {
      'https://api.github.com/repos/anthropics/skills': { default_branch: 'main' },
      'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1': tree,
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf-kit/SKILL.md': GH_SKILL_MD,
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf-kit/helpers.md': 'helpers',
    }
    const h = await makeHarness({ remoteFetchImpl: stubFetch(routes) })

    // path 导入：只收 skills/pdf-kit 一个 skill
    const res = await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'github',
      repo: 'anthropics/skills',
      path: 'skills/pdf-kit',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({ discovered: 1, created: 1, origin: 'anthropics/skills/skills/pdf-kit@main' })
    const item = (await listSkills(h)).json.items[0]
    expect(item?.remoteRef).toBe('github:anthropics/skills@main:skills/pdf-kit')
    // 树指纹 = 目录内 (rel, blobSha) 拼接 sha256（helpers.md 的 rel 是相对 skill 目录的）
    const expectTree = (await import('node:crypto')).createHash('sha256')
      .update('SKILL.md:blobaaa\nhelpers.md:blobbbb\n')
      .digest('hex')
    expect(item?.remoteTreeHash).toBe(expectTree)

    // 检查更新：远端树未变 → upToDate
    const check1 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check1.json.summary).toMatchObject({ upToDate: 1, remoteChanged: 0 })

    // 远端某文件被改（blob sha 变）→ remoteChanged；重导后建档刷新 → 归零
    tree.tree = tree.tree.map((b) => (b.path.endsWith('helpers.md') ? { ...b, sha: 'blobNEW' } : b))
    const check2 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check2.json.summary).toMatchObject({ remoteChanged: 1 })
    expect(check2.json.items[0]).toMatchObject({ status: 'remoteChanged', name: 'pdf-kit' })

    // 存量条目（无追踪指纹）→ notTracked
    await api(h, 'POST', '/api/skills', { name: 'legacy-remote', description: 'x', source: 'github' })
    const check3 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check3.json.summary).toMatchObject({ remoteChanged: 1, notTracked: 1 })

    // 重导拿到新树 → remoteChanged 归零
    const reimport = await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'github',
      repo: 'anthropics/skills',
      path: 'skills/pdf-kit',
    })
    expect(reimport.json).toMatchObject({ discovered: 1, created: 0 })
    const check4 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check4.json.summary).toMatchObject({ remoteChanged: 0, notTracked: 1 })
  })

  it('SkillHub 检查更新：清单 sha256 指纹对比 upToDate；建档字段写入', async () => {
    const manifestV1 = {
      version: '1.0.0',
      files: [{ path: 'SKILL.md', sha256: 'a'.repeat(64), size: 100 }],
    }
    const detail = { latestVersion: { version: '1.0.0' }, name: 'n', description: 'd' }
    const h = await makeHarness({
      remoteFetchImpl: stubFetch({
        'https://api.skillhub.cn/api/v1/skills/kit': detail,
        'https://api.skillhub.cn/api/v1/skills/kit/files': manifestV1,
        'https://api.skillhub.cn/api/v1/skills/kit/file?path=SKILL.md': {
          status: 302,
          headers: { location: 'https://b.cos.accelerate.myqcloud.com/x' },
        },
        'https://b.cos.accelerate.myqcloud.com/x': COS_SKILL_MD,
      }),
    })
    await api<SkillRemoteImportReport>(h, 'POST', '/api/skills/remote/import', {
      source: 'skillhub',
      slug: 'kit',
    })
    const item = (await listSkills(h)).json.items[0]
    expect(item?.remoteRef).toBe('skillhub:kit')
    expect(item?.remoteTreeHash).toBe(hashSkillEntries([{ rel: 'SKILL.md', sha256: 'a'.repeat(64) }]).dirHash)
    // stub 清单未变 → 最新；remoteChanged 分支与 GitHub 共享同一对比逻辑（上一用例已覆盖）
    const check = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check.json.summary).toMatchObject({ upToDate: 1, remoteChanged: 0 })
  })

  it('retrack 补档（DEV-0069）：存量条目按版本线溯源串重导建档；解析失败逐条报', async () => {
    const tree = {
      tree: [
        { path: 'skills/pdf-kit/SKILL.md', type: 'blob', sha: 'blobaaa', size: GH_SKILL_MD.length },
      ],
    }
    const h = await makeHarness({
      remoteFetchImpl: stubFetch({
        'https://api.github.com/repos/anthropics/skills': { default_branch: 'main' },
        'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1': tree,
        'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf-kit/SKILL.md': GH_SKILL_MD,
      }),
    })

    // 模拟 DEV-0067 存量：github 源条目 + version_label=owner/repo@branch，但无追踪两列
    const legacy = await api<{ id: string }>(h, 'POST', '/api/skills', {
      name: 'pdf-kit',
      description: 'x',
      source: 'github',
    })
    h.handle.db
      .prepare('UPDATE skill_versions SET version_label = ? WHERE skill_id = ?')
      .run('anthropics/skills@main', legacy.json.id)

    // 检查更新 → notTracked
    const check1 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check1.json.summary).toMatchObject({ notTracked: 1 })

    // retrack → 建档（同内容 skipped，但追踪两列写入）；再查 → upToDate
    const re = await api<{ items: { status: string }[]; summary: { retracked: number; failed: number } }>(
      h,
      'POST',
      '/api/skills/remote/retrack',
      {},
    )
    expect(re.statusCode).toBe(200)
    expect(re.json.summary).toMatchObject({ retracked: 1, failed: 0 })
    const item = (await listSkills(h)).json.items[0]
    expect(item?.remoteRef).toBe('github:anthropics/skills@main:skills/pdf-kit')
    expect(item?.remoteTreeHash).not.toBeNull()
    const check2 = await api<SkillUpdateCheckReport>(h, 'POST', '/api/skills/remote/check-updates', {})
    expect(check2.json.summary).toMatchObject({ upToDate: 1, notTracked: 0 })

    // 解析失败：版本线空串 → failed 逐条报
    await api(h, 'POST', '/api/skills', { name: 'broken-label', description: 'x', source: 'skillhub' })
    const re2 = await api<{ summary: { failed: number } }>(h, 'POST', '/api/skills/remote/retrack', {})
    expect(re2.json.summary.failed).toBe(1)
  })
})
