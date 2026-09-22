import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { SkillScanReport } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../src/client'
import { ScanError, scanAction } from '../src/commands/scan'
import { fakeClient, type FakeRoutes } from './helpers/fake-client'
import { putFile } from './helpers/tree'

/**
 * T7e · `openvibe scan`（m6b FR-3 / FR-4）。
 * 验收映射（dev-plan §9-T7）：§7.6 → CLI-SCAN-01。
 * 扫描没有离线模式（FR-3.2：解析与去重全在服务端 DB），所以断言重心放在
 * 「发了什么请求」与「探测到哪些文件」——这两处是 CLI 唯一的自主决定。
 */

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts')
const roots: string[] = []

function projectFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ov-scan-test-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) putFile(root, rel, content)
  return root
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

const SKILL_REPORT: SkillScanReport = {
  discovered: 3,
  created: 2,
  updated: 1,
  skipped: 0,
  warnings: ['扫描根不存在或不可读，跳过: /nope'],
}

/** 导入回执：服务端按 title+contentHash 去重，created 是 title 数组 */
const importRoute = (created: string[], skippedTitle: string[] = []): FakeRoutes => ({
  '/api/prompts/import': {
    created,
    skipped: skippedTitle.map((title) => ({ title, reason: '重复（title + contentHash 一致）' })),
  },
})

describe('scan --project · 规则文件探测与导入（FR-4）', () => {
  it('CLI-SCAN-01: 含 .cursorrules 与 CLAUDE.md 的目录 → 一条请求两项，回执逐条落 created/skipped', async () => {
    const project = projectFixture({
      '.cursorrules': 'cursor 规则正文\n',
      'CLAUDE.md': '# Claude 规则\n只给结论\n',
    })
    const fake = fakeClient({ post: importRoute(['.cursorrules', 'CLAUDE.md']) })

    const outcome = await scanAction({ project }, { client: fake.client })

    expect(fake.paths()).toEqual(['POST /api/prompts/import'])
    expect(outcome.probed).toEqual(['.cursorrules', 'CLAUDE.md'])
    expect(outcome.prompts.map((p) => [p.title, p.action])).toEqual([
      ['.cursorrules', 'created'],
      ['CLAUDE.md', 'created'],
    ])
    // filename 即 title：必须是项目内相对路径 + 正斜杠，否则换台机器/换 cwd 就重跑去重失效
    const body = fake.calls[0]?.body as { files: { filename: string; content: string }[] }
    expect(body.files.map((f) => f.filename)).toEqual(['.cursorrules', 'CLAUDE.md'])
    expect(body.files.map((f) => f.content)).toEqual([
      'cursor 规则正文\n',
      '# Claude 规则\n只给结论\n',
    ])
    expect(outcome.warnings).toEqual([])
  })

  it('重跑：服务端全判重复 → 全部 skipped 且带原因，退出码仍 0', async () => {
    const project = projectFixture({ '.cursorrules': '同一份正文\n' })
    const fake = fakeClient({ post: importRoute([], ['.cursorrules']) })

    const outcome = await scanAction({ project }, { client: fake.client })

    expect(outcome.prompts).toEqual([
      { title: '.cursorrules', action: 'skipped', reason: '重复（title + contentHash 一致）' },
    ])
    expect(outcome.hints.join('\n')).toContain('新增 0')
  })

  it('四类探测点全覆盖，且 node_modules / .git 里的同名文件永不进请求', async () => {
    const project = projectFixture({
      '.cursorrules': 'a\n',
      'CLAUDE.md': 'b\n',
      'AGENTS.md': 'c\n',
      '.cursor/rules/openvibe.mdc': '---\ndescription: 规则\n---\n正文\n',
      '.cursor/rules/nested/deep.mdc': '不该被递归\n',
      'node_modules/pkg/CLAUDE.md': '不该扫\n',
      '.git/AGENTS.md': '不该扫\n',
      'README.md': '非规则文件\n',
    })
    const fake = fakeClient({
      post: importRoute(['.cursorrules', 'AGENTS.md', 'CLAUDE.md', '.cursor/rules/openvibe.mdc']),
    })

    const outcome = await scanAction({ project }, { client: fake.client })

    expect(outcome.probed).toEqual([
      '.cursor/rules/openvibe.mdc',
      '.cursorrules',
      'AGENTS.md',
      'CLAUDE.md',
    ])
    expect(fake.calls[0]?.body).toMatchObject({
      files: [
        { filename: '.cursor/rules/openvibe.mdc' },
        { filename: '.cursorrules' },
        { filename: 'AGENTS.md' },
        { filename: 'CLAUDE.md' },
      ],
    })
    // 递归只到 `.cursor/rules` 一层：nested/deep.mdc 不进；node_modules/.git 也不进
    const body = fake.calls[0]?.body as { files: { filename: string }[] }
    expect(body.files.map((f) => f.filename)).not.toContain('.cursor/rules/nested/deep.mdc')
    expect(body.files.some((f) => f.filename.includes('node_modules'))).toBe(false)
    expect(body.files.some((f) => f.filename.startsWith('.git/'))).toBe(false)
  })

  it('一个规则文件都没有 → 零请求 + 明确提示（不假装成功）', async () => {
    const project = projectFixture({ 'README.md': '只有文档\n' })
    const fake = fakeClient({ post: importRoute([]) })

    const outcome = await scanAction({ project }, { client: fake.client })

    expect(fake.paths()).toEqual([])
    expect(outcome.probed).toEqual([])
    expect(outcome.prompts).toEqual([])
    expect(outcome.warnings.join('\n')).toContain('未发现规则文件')
  })

  it('项目路径不是目录 → PROJECT_NOT_DIR，零请求', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ov-scan-test-'))
    roots.push(root)
    const file = join(root, 'afile.md')
    writeFileSync(file, 'x', 'utf8')
    const fake = fakeClient({ post: importRoute([]) })

    const err = await scanAction({ project: file }, { client: fake.client }).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(ScanError)
    expect((err as ScanError).code).toBe('PROJECT_NOT_DIR')
    expect(fake.paths()).toEqual([])
  })
})

describe('scan --skills · 转发服务端扫描（FR-3）', () => {
  it('缺省 roots：body 为 {}，报告原样渲染（计数 + 警告）', async () => {
    const fake = fakeClient({ post: { '/api/skills/scan': SKILL_REPORT } })

    const outcome = await scanAction({ skills: true }, { client: fake.client })

    expect(fake.calls).toEqual([{ method: 'POST', path: '/api/skills/scan', body: {} }])
    expect(outcome.skills).toEqual(SKILL_REPORT)
    expect(outcome.warnings).toEqual(SKILL_REPORT.warnings)
    expect(outcome.hints.join('\n')).toContain('发现 3 新增 2 更新 1 跳过 0')
  })

  it('--roots 逐个转发，顺序与去重由 CLI 保证', async () => {
    const fake = fakeClient({ post: { '/api/skills/scan': SKILL_REPORT } })

    const outcome = await scanAction(
      { skills: true, roots: ['/a', '/b', '/a'] },
      { client: fake.client },
    )

    expect(fake.calls[0]?.body).toEqual({ roots: ['/a', '/b'] })
    expect(outcome.skillsRoots).toEqual(['/a', '/b'])
  })

  it('--skills 与 --project 同时给 → 先 skill 后提示词，两段结果都在', async () => {
    const project = projectFixture({ 'AGENTS.md': 'd\n' })
    const fake = fakeClient({
      post: { '/api/skills/scan': SKILL_REPORT, ...importRoute(['AGENTS.md']) },
    })

    const outcome = await scanAction({ skills: true, project }, { client: fake.client })

    expect(fake.paths()).toEqual(['POST /api/skills/scan', 'POST /api/prompts/import'])
    expect(outcome.skills?.discovered).toBe(3)
    expect(outcome.prompts.map((p) => p.title)).toEqual(['AGENTS.md'])
  })
})

describe('scan 的前置条件（FR-3.2 / FR-4.3）', () => {
  it('两个旗标都缺 → USAGE 报错并给用法', async () => {
    const fake = fakeClient({})
    const err = await scanAction({}, { client: fake.client }).catch((e: unknown) => e)

    expect((err as ScanError).code).toBe('USAGE')
    expect((err as Error).message).toContain('openvibe scan --skills')
    expect(fake.paths()).toEqual([])
  })

  it('没有客户端（未配令牌）→ SERVER_REQUIRED，提示先 serve，零请求', async () => {
    const err = await scanAction({ skills: true }, {}).catch((e: unknown) => e)

    expect((err as ScanError).code).toBe('SERVER_REQUIRED')
    expect((err as Error).message).toContain('openvibe serve')
  })

  it('服务端不可达 → SERVER_UNREACHABLE，原始原因保留', async () => {
    const down: ApiClient = {
      serverUrl: 'http://127.0.0.1:1',
      getJson: () => Promise.reject(new Error('unused')),
      postJson: () =>
        Promise.reject(new ServerUnreachable('http://127.0.0.1:1', 'connect ECONNREFUSED')),
    }

    const err = await scanAction({ skills: true }, { client: down }).catch((e: unknown) => e)

    expect((err as ScanError).code).toBe('SERVER_UNREACHABLE')
    expect((err as Error).message).toContain('ECONNREFUSED')
    expect((err as Error).message).toContain('openvibe serve')
  })

  it('服务端 4xx 原样上抛（ApiError 的 code 不被 CLI 改写）', async () => {
    const project = projectFixture({ 'CLAUDE.md': 'e\n' })
    const fake = fakeClient({ post: {} }) // 未登记 → FAKE_MISS
    const err = await scanAction({ project }, { client: fake.client }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as { code?: string }).code).toBe('FAKE_MISS')
  })
})

describe('--json 契约（m6b §5.1，真子进程）', () => {
  const tempHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), 'ov-scan-home-'))
    roots.push(home)
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ serverUrl: 'http://127.0.0.1:1', token: 't', port: 1 }),
      { mode: 0o600 },
    )
    return home
  }

  const runCli = (args: string[], home: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
      encoding: 'utf8',
      timeout: 25_000,
      env: { ...process.env, OPENVIBE_HOME: home, OPENVIBE_SERVER: '', OPENVIBE_TOKEN: '' },
    })

  it('旗标皆缺 → 退出码 1 + stdout 单对象 error.code=USAGE', () => {
    const res = runCli(['--json', 'scan'], tempHome())

    expect(res.status).toBe(1)
    const env = JSON.parse(res.stdout) as {
      command: string
      summary: { ok: boolean; error: { code: string } }
    }
    expect(env.command).toBe('scan')
    expect(env.summary.ok).toBe(false)
    expect(env.summary.error.code).toBe('USAGE')
  })

  it('服务端不可达 → 退出码 1 + SERVER_UNREACHABLE，stderr 不污染 stdout', () => {
    const project = projectFixture({ 'CLAUDE.md': 'f\n' })
    const res = runCli(['--json', 'scan', '--project', project], tempHome())

    expect(res.status).toBe(1)
    expect(JSON.parse(res.stdout).summary.error.code).toBe('SERVER_UNREACHABLE')
  })
})
