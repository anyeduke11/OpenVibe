import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { ADAPTER_MAIN_PATH } from '@openvibe/adapters'
import {
  ADAPTER_IDS,
  PACK_FILE_TERMS,
  PackBundleSchema,
  utf8ByteLength,
  type PackOut,
  type PreviewOut,
} from '@openvibe/shared'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { PacksRepo, SIZE_WARN_THRESHOLD, runSeed } from '@openvibe/core'
import { buildApp } from '../src/app'
import { ensureDefaultPack } from '../src/lib/default-pack'
import { buildSizeEstimate } from '../src/lib/pack-assemble'

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content', 'seed')

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
  home: string
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  // 目录导出落在 ~/.openvibe/packs/，测试用 OPENVIBE_HOME 指向临时沙箱（core/db/index.ts）
  const home = mkdtempSync(join(tmpdir(), 'ov-pack-home-'))
  process.env.OPENVIBE_HOME = home
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle, home }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
    if (h) rmSync(h.home, { recursive: true, force: true })
  }
  delete process.env.OPENVIBE_HOME
})

function api(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

async function mkPrompt(h: Harness, title: string, content: string, useAs = 'rule'): Promise<string> {
  const res = await api(h, 'POST', '/api/prompts', { title, content, useAs, status: 'active' })
  expect(res.statusCode).toBe(201)
  return (res.json() as { id: string }).id
}

async function mkTerm(h: Harness, en: string, zh: string): Promise<string> {
  const res = await api(h, 'POST', '/api/terms', { en, zh, definition: `${zh}的集成测试定义文本。` })
  expect(res.statusCode).toBe(201)
  return (res.json() as { id: string }).id
}

async function mkPack(h: Harness, overrides: object = {}): Promise<PackOut> {
  const promptId = await mkPrompt(h, '审查纪律', '逐条给行号，不评论未改动行。')
  const termId = await mkTerm(h, 'rule drift', '规则漂移')
  const body = {
    name: 'default',
    description: 'T6 集成测试包',
    selection: {
      promptIds: [promptId],
      termIds: [termId],
      skillIds: [],
      playbookIds: [],
      flowTemplateId: null,
    },
    targets: ['claude-code', 'generic-agents'],
    ...overrides,
  }
  const res = await api(h, 'POST', '/api/packs', body)
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as PackOut
}

const preview = async (h: Harness, id: string, version?: string): Promise<PreviewOut> => {
  const res = await api(h, 'POST', `/api/packs/${id}/preview`, version ? { version } : {})
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as PreviewOut
}

describe('T6d · m6a 标准包 API（dev-plan §3.8 + bundle 通道）', () => {
  it('IT-PACK-01（§7.1/§7.2）: 连续两次 preview 全一致；目录导出的磁盘字节 = preview 字节', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)

    const first = await preview(h, pack.id, '1.0.0')
    const second = await preview(h, pack.id, '1.0.0')
    expect(second).toEqual(first)
    // 受管正文零时间戳 ⇒ 连 manifest 自身的字节也可重复（exportedAt 取 pack.updatedAt）
    expect(first.files.map((f) => `${f.path}:${f.sha256}`).join()).toBe(
      second.files.map((f) => `${f.path}:${f.sha256}`).join(),
    )

    const exp = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'directory',
    })
    expect(exp.statusCode, exp.body).toBe(200)
    const out = exp.json()
    expect(out.status).toBe('created')
    expect(out.fingerprint).toBe(first.fingerprint)
    expect(out.directoryPath).toBe(join(h.home, 'packs', 'default@1.0.0'))

    for (const file of first.files) {
      // manifest 落根目录，其余在 files/ 下按真实相对路径展开（design §7.1）
      const rel = file.path === 'openvibe.pack.json' ? file.path : join('files', file.path)
      const onDisk = readFileSync(join(out.directoryPath as string, rel), 'utf8')
      if (file.path === 'openvibe.pack.json') {
        // §7.2 的唯一例外：manifest.pack.exportedAt 是真实导出时刻，preview 取 pack.updatedAt。
        // 指纹与全部正文字节不受影响（正文零时间戳），故除该字段外 manifest 亦须逐字节一致。
        const strip = (text: string): string =>
          text.replace(/"exportedAt": "[^"]*"/, '"exportedAt": "-"')
        expect(strip(onDisk), '磁盘 manifest 除 exportedAt 外与 preview 不一致').toBe(strip(file.content))
        expect(onDisk).not.toBe(file.content)
      } else {
        expect(onDisk, `磁盘 ${file.path} 与 preview 不一致`).toBe(file.content)
      }
    }
  })

  it('IT-PACK-02（§7.3）: 改资产重导同版本 → 409 VERSION_IMMUTABLE；升 v1.1.0 成功且指纹不同', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const v1 = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'download',
    })
    expect(v1.statusCode, v1.body).toBe(200)

    const promptId = pack.selection.promptIds[0] as string
    const patch = await api(h, 'PATCH', `/api/prompts/${promptId}`, {
      content: '逐条给行号，并且必须给出可执行的修复补丁。',
    })
    expect(patch.statusCode).toBe(200)

    const again = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'download',
    })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ code: 'VERSION_IMMUTABLE' })

    const bumped = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.1.0',
      channel: 'download',
    })
    expect(bumped.statusCode, bumped.body).toBe(200)
    const fp1 = (v1.json() as { fingerprint: string }).fingerprint
    const fp2 = (bumped.json() as { fingerprint: string }).fingerprint
    expect(fp2).not.toBe(fp1)

    const history = await api(h, 'GET', `/api/packs/${pack.id}/exports`)
    const items = (history.json() as { items: { version: string }[] }).items
    expect(items.map((i) => i.version).sort()).toEqual(['1.0.0', '1.1.0'])
  })

  it('IT-PACK-03（§7.5）: 删掉源提示词后，导出记录的 manifest 与 bundle 下载不受影响', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const exp = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'download',
    })
    const exportId = (exp.json() as { export: { id: string } }).export.id

    const bundleBefore = await api(h, 'GET', `/api/packs/${pack.id}/exports/${exportId}/bundle`)
    expect(bundleBefore.statusCode).toBe(200)
    expect(bundleBefore.headers['content-disposition']).toBe(
      'attachment; filename="openvibe-pack-default-1.0.0.json"',
    )
    expect(bundleBefore.headers['x-pack-fingerprint']).toBe(
      (exp.json() as { fingerprint: string }).fingerprint,
    )

    await api(h, 'DELETE', `/api/prompts/${pack.selection.promptIds[0] as string}`)

    const bundleAfter = await api(
      h,
      'GET',
      `/api/packs/${pack.id}/exports/${exportId}/bundle`,
      undefined,
    )
    expect(bundleAfter.statusCode).toBe(200)
    expect(bundleAfter.body).toBe(bundleBefore.body)
    const parsed = PackBundleSchema.parse(JSON.parse(bundleAfter.body))
    expect(parsed.bundleSchemaVersion).toBe(1)
    expect(parsed.manifest.prompts[0]?.content).toContain('逐条给行号')
    expect(parsed.files.map((f) => f.path)).toContain('CLAUDE.md')
  })

  it('IT-ERR-03（§7.7）: STALE_SELECTION / VERSION_IMMUTABLE / 空 targets 三种结构化错误码', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)

    const emptyTargets = await api(h, 'PATCH', `/api/packs/${pack.id}`, { targets: [] })
    expect(emptyTargets.statusCode).toBe(422)
    expect(emptyTargets.json().code).toBe('VALIDATION_ERROR')
    expect((emptyTargets.json().details as { fieldErrors: { targets?: string[] } }).fieldErrors.targets).toBeDefined()

    const unknownTarget = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      targets: ['not-a-platform' as never],
    })
    expect(unknownTarget.statusCode).toBe(422)
    expect(unknownTarget.json().code).toBe('VALIDATION_ERROR')

    await api(h, 'DELETE', `/api/terms/${pack.selection.termIds[0] as string}`)
    const stale = await api(h, 'POST', `/api/packs/${pack.id}/preview`, {})
    expect(stale.statusCode).toBe(422)
    expect(stale.json()).toMatchObject({ code: 'STALE_SELECTION' })
    expect((stale.json().details as { termIds: string[] }).termIds).toEqual([
      pack.selection.termIds[0],
    ])

    // VERSION_IMMUTABLE 在 IT-PACK-02 覆盖；此处校验空选集与不存在包
    const emptied = await api(h, 'POST', '/api/packs', {
      name: 'empty-one',
      selection: { promptIds: [], termIds: [], skillIds: [], playbookIds: [], flowTemplateId: null },
      targets: ['claude-code'],
    })
    expect(emptied.statusCode).toBe(201)
    const emptyPreview = await api(h, 'POST', `/api/packs/${(emptied.json() as PackOut).id}/preview`, {})
    expect(emptyPreview.statusCode).toBe(422)
    expect(emptyPreview.json().code).toBe('EMPTY_SELECTION')

    const missing = await api(h, 'GET', '/api/packs/pk_nope')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('NOT_FOUND')
  })

  it('IT-PACK-04（FR-1.2）: name 冲突 422 + 版本单调递增校验', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const dup = await api(h, 'POST', '/api/packs', {
      name: 'default',
      selection: pack.selection,
      targets: ['generic-agents'],
    })
    expect(dup.statusCode).toBe(422)
    expect(dup.json().code).toBe('NAME_CONFLICT')

    const badName = await api(h, 'POST', '/api/packs', {
      name: 'Bad_Name',
      selection: pack.selection,
      targets: ['generic-agents'],
    })
    expect(badName.statusCode).toBe(422)

    await api(h, 'POST', `/api/packs/${pack.id}/export`, { version: '1.2.0', channel: 'download' })
    const lower = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.1.0',
      channel: 'download',
    })
    expect(lower.statusCode).toBe(422)
    expect(lower.json().code).toBe('VALIDATION_ERROR')
    expect((lower.json().details as { fieldErrors: { version: string[] } }).fieldErrors.version[0]).toContain(
      '1.2.0',
    )
  })

  it('IT-PACK-05（§7.4）: claude-code + generic-agents + 术语 → 恰 4 文件，coveredPlatforms 来自兼容矩阵', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const out = await preview(h, pack.id, '1.0.0')
    expect(out.files.map((f) => f.path)).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'TERMS.md',
      'openvibe.pack.json',
    ])
    expect(out.warnings).toEqual([])
    expect(out.coveredPlatforms).toEqual([
      'Cline',
      'Codex',
      'Kimi Code',
      'OpenCode',
      'Qwen Code',
      'Trae CN',
      'zcode',
    ])
  })

  it('IT-PACK-06（§6.5）: 目录导出被手改后重导同版本 → 409，不覆盖用户改动', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const first = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'directory',
    })
    const dir = (first.json() as { directoryPath: string }).directoryPath
    const target = join(dir, 'files', 'CLAUDE.md')
    const handEdited = `${readFileSync(target, 'utf8')}\n本地手改一行。\n`
    writeFileSync(target, handEdited, 'utf8')

    const again = await api(h, 'POST', `/api/packs/${pack.id}/export`, {
      version: '1.0.0',
      channel: 'directory',
    })
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('VERSION_IMMUTABLE')
    expect(again.json().message).toContain('files/CLAUDE.md')
    expect(readFileSync(target, 'utf8')).toBe(handEdited)
  })

  it('IT-PACK-07（FR-5）: 注入上报 + 包详情注入历史 + 删除包后 404', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const reported = await api(h, 'POST', '/api/injections', {
      packId: pack.id,
      packVersion: '1.0.0',
      projectPath: '/tmp/proj-a',
    })
    expect(reported.statusCode, reported.body).toBe(201)
    expect((reported.json() as { id: string }).id).toMatch(/^inj_/)

    const orphan = await api(h, 'POST', '/api/injections', {
      projectPath: '/tmp/proj-deleted',
    })
    expect(orphan.statusCode).toBe(201)
    expect((orphan.json() as { packId: string | null }).packId).toBeNull()

    const history = await api(h, 'GET', `/api/packs/${pack.id}/injections`)
    const items = (history.json() as { items: { projectPath: string }[] }).items
    expect(items.map((i) => i.projectPath)).toEqual(['/tmp/proj-a'])

    const removed = await api(h, 'DELETE', `/api/packs/${pack.id}`)
    expect(removed.statusCode).toBe(204)
    expect((await api(h, 'GET', `/api/packs/${pack.id}`)).statusCode).toBe(404)
    // 导出实例随包级联删除（ON DELETE CASCADE），注入行无外键故留痕
    const db = h.handle.db
    const exports = (db.prepare('SELECT COUNT(*) AS c FROM pack_exports').get() as { c: number }).c
    const injections = (db.prepare('SELECT COUNT(*) AS c FROM injections').get() as {
      c: number
    }).c
    expect(exports).toBe(0)
    expect(injections).toBe(2)
  })

  it('IT-PACK-08（FR-2.3）: 同一生成器 —— 列表/详情/预览对同一 pack 三次读取指纹一致', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h, { name: 'repeatable' })
    const a = await preview(h, pack.id, '2.0.0')
    const b = await preview(h, pack.id, '2.0.0')
    expect(b.fingerprint).toBe(a.fingerprint)
    const listed = await api(h, 'GET', '/api/packs')
    const items = (listed.json() as { items: PackOut[] }).items
    expect(items.map((i) => i.name)).toEqual(['repeatable'])
    const got = await api(h, 'GET', `/api/packs/${pack.id}`)
    expect((got.json() as PackOut).updatedAt).toBe(pack.updatedAt)
  })

  it('IT-PACK-09（§7.4b 国内三平台）: codebuddy+trae+minicode 恰 4 文件且正文一致', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h, { targets: ['codebuddy', 'trae', 'minicode'] })
    const out = await preview(h, pack.id)
    expect(out.files.map((f) => f.path)).toEqual([
      '.trae/rules/openvibe.md',
      'CODEBUDDY.md',
      'MINI.md',
      // mkPack 选集含一条术语 ⇒ TERMS.md 必出（§7.4）
      'TERMS.md',
      'openvibe.pack.json',
    ])
    const trae = out.files.find((f) => f.path === '.trae/rules/openvibe.md')?.content ?? ''
    const bare = out.files.find((f) => f.path === 'CODEBUDDY.md')?.content ?? ''
    expect(trae.startsWith('---\ndescription: OpenVibe 标准包 default@1.0.0\nalwaysApply: true\n---\n')).toBe(
      true,
    )
    expect(trae.split('---\n', 3)[2]).toBe(bare)
    expect(out.coveredPlatforms).toEqual([])
  })

  it('IT-PACK-10: 仓储层 recordExport 幂等（同版本同指纹不新建记录）', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const repo = new PacksRepo(h.handle.db)
    const input = {
      packId: pack.id,
      version: '3.0.0',
      fingerprint: 'f'.repeat(64),
      manifestJson: '{}',
      bundleJson: '{}',
      channel: 'download' as const,
    }
    expect(repo.recordExport(input)).toEqual({ status: 'created' })
    expect(repo.recordExport(input)).toEqual({ status: 'idempotent' })
    expect(repo.exportsOf(pack.id)).toHaveLength(1)
    expect(repo.latestExport(pack.id)?.version).toBe('3.0.0')
    expect(repo.getExport(pack.id, 'other')).toBeNull()
  })
})

describe('SRV-EST · preview 的 sizeEstimate（m6a FR-6 + 验收 9/10/11）', () => {
  it('SRV-EST-01: perTarget 键集合 == manifest.targets；footprint.files 集合 == files[] 集合（含 manifest）', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const out = await preview(h, pack.id, '1.0.0')

    expect(out.sizeEstimate, '响应缺 sizeEstimate').toBeTruthy()
    const est = out.sizeEstimate as NonNullable<typeof out.sizeEstimate>
    expect([...est.perTarget].map((p) => p.adapter).sort()).toEqual([
      'claude-code',
      'generic-agents',
    ])
    // vitest 的 toEqual 不收第二个参数（tsc：TS2554），故说明文字挂在 expect(value, message) 一侧，
    // 语义与计划正文一致
    expect(
      [...new Set(est.perTarget.map((p) => p.adapter))].sort(),
      'perTarget 与 coveredPlatforms 是两套语义（Task 1 ②）：这里断言它们**不相等**，防止有人把断言改回 coveredPlatforms',
    ).not.toEqual([...out.coveredPlatforms].sort())
    for (const row of est.perTarget) {
      const paths = row.files.map((f) => f.path)
      expect(paths).toContain(ADAPTER_MAIN_PATH[row.adapter as keyof typeof ADAPTER_MAIN_PATH])
      expect(paths).toContain(PACK_FILE_TERMS)
    }
    expect([...est.footprint.files.map((f) => f.path)].sort()).toEqual(
      [...out.files.map((f) => f.path)].sort(),
    )
    // FR-6.3 的 footprint.bytes 独立校验（M-3）：整包落盘字节 = 每个文件 utf8 字节之和。
    // 右操作数逐行取自 `PreviewOut.files`（不是 sizeEstimate 自己），所以这一行同时把
    // 「合成的 manifest 在 footprint 集里」从**第二个视图**钉住：漏一份 manifest 就少一截字节。
    expect(est.footprint.bytes).toBe(out.files.reduce((n, f) => n + utf8ByteLength(f.content), 0))
  })

  it('SRV-EST-01b: 行总量是**拼接后一次 ceil**，不是逐文件 ceil 相加（FR-6.3 的语义差别）', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    // 夹具需要**两条术语**才有判别力（实量数见 task-7-report）：单条术语时该行两个文件的
    // 小数值是 133.20 与 83.85，余数之和 1.05 > 1 ⇒ 两种口径同为 218，严格小于关系不成立——
    // 那是计划预告的原因②（余数恰好对齐），不是实现错。补第二条术语后
    // CLAUDE.md 134 + TERMS.md 115 = 249，而拼接单次 ceil = 248 ⇒ 248 < 249 判别力才落地。
    // 改动 mkPack/mkTerm 的文案长度前先重跑本支（余数会重排）。
    const extraTerm = await mkTerm(h, 'context rot', '上下文腐化')
    const patched = await api(h, 'PATCH', `/api/packs/${pack.id}`, {
      selection: { ...pack.selection, termIds: [...pack.selection.termIds, extraTerm] },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    const out = await preview(h, pack.id, '1.0.0')
    const est = out.sizeEstimate as NonNullable<typeof out.sizeEstimate>

    // 判别力全在**严格小于**：单 ceil ≤ 逐项 ceil 之和恒成立，所以写成 `<=` 或 `!==` 里挑一个不够——
    // 若实现退回「逐文件相加」，`sum === row.approxTokens`，弱断言照样绿。
    // 反过来，这支红了只有两种原因：① 实现真的是逐文件相加；② 夹具余数恰好对齐（两个文件都无余数）。
    // 二者必须人工分辨并在报告里给出实量数，**不许改成 `<=` 蒙过去**。
    for (const row of est.perTarget) {
      const sum = row.files.reduce((n, f) => n + f.approxTokens, 0)
      expect(
        row.approxTokens,
        `perTarget[${row.adapter}] 的单 ceil 总量应严格小于逐文件之和`,
      ).toBeLessThan(sum)
    }

    // footprint 同理，且它的文件集含 manifest，发散更明显
    const fpSum = est.footprint.files.reduce((n, f) => n + f.approxTokens, 0)
    expect(est.footprint.approxTokens).toBeLessThan(fpSum)

    // 两条口径不许混成一个数（FR-6.3 原文禁令）：footprint 的文件集是 perTarget 行的**真超集**
    // （多带其它 adapter 的主文件 + manifest），所以只能严格更大，相等即为混用。
    expect(est.footprint.approxTokens).toBeGreaterThan(est.perTarget[0]?.approxTokens ?? 0)
  })

  it('SRV-EST-02: 阈值正负各一支，且 warn 不参与放行（同包导出成功）', async () => {
    const h = await makeHarness()
    const small = await mkPack(h) // 一条提示词 + 一条术语 → 远低于阈值
    const smallOut = await preview(h, small.id, '1.0.0')
    expect(
      smallOut.sizeEstimate?.perTarget.every((p) => p.warn === false),
      '小包的 perTarget 不该有 warn',
    ).toBe(true)

    // 正向支按 m6a §7 验收 10 构造。**原句只说「把术语全选」，实测被否证**：109 条种子术语全选时
    // perTarget[0] 只有 9,617 < 12000，故 owner 2026-09-24 裁定把规格改写为「资产全选」（v1.3），
    // 本支随之把种子术语**与种子提示词一并**全选。空库里没有资产，id 全从 API 取、不写死。
    // 这使断言与种子同源——种子审校若显著改变体量，这支**应当**变红并逼人重看阈值结论，
    // 而不是靠合成夹具永远绿着。（owner 另裁定：保持「全选」语义，测试跟着 seed 走。）
    const seeded = runSeed(h.handle.db, SEED_DIR)
    // `SeedBundleResult` 实况（packages/core/src/db/seed.ts:17-24）：`created` 是 **number**、
    // 没有 `.terms` 子对象；状态词是 `status: 'skipped'|'imported'|'error'`。
    expect(
      seeded.some((b) => b.bundle === 'terms' && b.status === 'imported' && b.created > 0),
      '种子术语应真入库',
    ).toBe(true)
    const all = (await api(h, 'GET', '/api/terms')).json() as {
      items: { id: string }[]
      total: number
    }
    expect(all.total).toBeGreaterThanOrEqual(100)
    // 术语侧**不分页**：GET /api/terms 直接返 `terms.list()` 且 `total = items.length`
    // （apps/server/src/routes/terms.ts:22-24），所以这里的「全选」不可能被页大小截断。
    // 「全选」需要覆盖整个种子库：只把 109 条术语全选时 perTarget[0] 实量 9,617 < 12000——
    // TERMS.md 只渲染 zh/en/别名/定义四列，比 FR-6.4 三条字节折算值（≈15.1k/15.7k/16.0k）假设的
    // 口径小一截。验收 10 的正向支要的是「某 target 估算 >12000」，与首启预置包同一形态
    // （种子提示词 + 种子术语），故提示词一并全选 ⇒ 实量 14,890 > 12000（首启预置包本体实量
    // 15,213，见报告）；阈值判据仍只跟响应自身的数比，不写死数字。
    // 注：主文件里有 `<name>@<version>`，故包名长度会挪动 1 个 tok 量级的数——改名须重测。
    const allPrompts = (await api(h, 'GET', '/api/prompts')).json() as {
      items: { id: string }[]
      total: number
    }
    expect(
      allPrompts.total,
      '种子提示词未入库 ⇒ 正向支体量来源变了，须重看 §7 验收 10 的阈值结论',
    ).toBeGreaterThanOrEqual(20)
    // 分页防线（I-2）：GET /api/prompts 走 `prompts.list(query)`，页大小默认
    // `LIMITS.listPageSizeDefault = 50`（packages/shared/src/schemas/prompt.ts:42-49）。
    // 今天 21 条提示词全进得来，所以 `items` 就是「全选」；种子长到 51 条起它会**静默退化成
    // 前 50 条**，届时 `approxTokens > SIZE_WARN_THRESHOLD` 仍可能绿，而断言钉的语料已不是
    // 报告 §5 那个数。故钉「取到的就是全量」这条命题，而不是给 URL 加 `?size=<listPageSizeMax>`
    // ——后者页大小再收紧又会骗人；本支红得才有意义。
    expect(
      allPrompts.items.length,
      '提示词列表被分页截断 ⇒ 「全选」名不副实，须显式带 size 或收紧分页口径',
    ).toBe(allPrompts.total)
    const big = await mkPack(h, {
      name: 'all-seed',
      selection: {
        promptIds: allPrompts.items.map((p) => p.id),
        termIds: all.items.map((t) => t.id),
        skillIds: [],
        playbookIds: [],
        flowTemplateId: null,
      },
    })
    const bigOut = await preview(h, big.id, '2.0.0')
    const row = bigOut.sizeEstimate?.perTarget[0]
    // 阈值判断只跟响应自身的数比，不写死任何字面量（反漂移：数字单源在响应里）
    expect(row?.approxTokens ?? 0).toBeGreaterThan(SIZE_WARN_THRESHOLD)
    expect(row?.warn).toBe(true)
    // 本支的实量数是**阈值正向支**的凭据，不是 FR-6.4 回填规格的那个权威数——后者是**首启预置包**
    // 的量，由 SRV-EST-04 复现（见该支注释）。两数不同源（选择集与包名都不同），不可互相顶替。

    // FR-6.4 的负向断言：超线不改任何放行结果
    const exported = await api(h, 'POST', `/api/packs/${big.id}/export`, {
      version: '2.0.0',
      channel: 'download',
    })
    // 200 而非 201：export 路由不设 reply.code（apps/server/src/routes/packs.ts:76-119），
    // 本文件既有 IT-PACK-01/02 亦一律 200——计划正文的 201 是笔误，改回与实现同源
    expect(exported.statusCode, exported.body).toBe(200)
    expect(exported.json().warnings).toEqual([])
    // sync 侧不可观察：`sizeEstimate` 不进 `bundleJson()` / `directoryFiles()`
    // （apps/server/src/routes/packs.ts:91,98），CLI 无从观察它，
    // 故 §7 验收 10 的 sync 腿由**结构**保证，非由本支证明——别把本支标题当成那条凭据。
  })

  // 纯用例（M-2）：直接打导出的 `buildSizeEstimate`（apps/server/src/lib/pack-assemble.ts:90），
  // 不建 harness、不塞进 SRV-EST-02（那支已是最重的一支）。
  // 钉的是 FR-6.4 那句 `perTarget.approxTokens > 12000 → warn=true` 里的**严格不等号**：
  // 恰好压在阈值上不亮黄条，多一个 tok 才亮。此前全仓只有 SRV-EST-02 的两端（小包全 false /
  // 大包含 true），core 侧 `size.test.ts` 只钉常数本身 ⇒ `>` 被静默翻成 `>=` 时无人变红。
  // 夹具取 48_000 个 ASCII：FR-6.2 的 `ceil(other/4)` 让它**正好**等于 SIZE_WARN_THRESHOLD，
  // 48_004 则正好 +1；两支都压在边界上，不依赖任何语料体量。断言只跟常数比，不写 12000。
  it('SRV-EST-02b: warn 的阈值边界——恰好压线不亮，多一个 tok 才亮（FR-6.4 的严格 `>`）', () => {
    const atThreshold = buildSizeEstimate(
      [{ path: ADAPTER_MAIN_PATH['claude-code'], content: 'a'.repeat(48_000) }],
      '',
      ['claude-code'],
    )
    expect(atThreshold.perTarget[0]?.approxTokens).toBe(SIZE_WARN_THRESHOLD)
    expect(atThreshold.perTarget[0]?.warn, '恰好压线不该亮黄条（`>` 而非 `>=`）').toBe(false)

    const oneOver = buildSizeEstimate(
      [{ path: ADAPTER_MAIN_PATH['claude-code'], content: 'a'.repeat(48_004) }],
      '',
      ['claude-code'],
    )
    expect(oneOver.perTarget[0]?.approxTokens).toBe(SIZE_WARN_THRESHOLD + 1)
    expect(oneOver.perTarget[0]?.warn, '超线一个 tok 就该亮黄条').toBe(true)
  })

  it('SRV-EST-03: 确定性——同一包连续两次 preview，sizeEstimate 序列化后逐字节相等', async () => {
    const h = await makeHarness()
    const pack = await mkPack(h)
    const a = await preview(h, pack.id, '1.0.0')
    const b = await preview(h, pack.id, '1.0.0')
    // M-1：存在性先钉，否则字段整体消失时这里空过
    // （JSON.stringify(undefined) === JSON.stringify(undefined)；RED 日志「3 failed | 1 passed」即证据）
    expect(a.sizeEstimate, '响应缺 sizeEstimate').toBeTruthy()
    expect(JSON.stringify(a.sizeEstimate)).toBe(JSON.stringify(b.sizeEstimate))
  })

  // I-1：FR-6.4 末句「**首启预置包自己就会亮黄条**」的仓库内可复现凭据。
  // 规格 docs/specs/m6-standard-pack.md:96 要求「口径必须与数字同处登记……不写口径的数字
  // 一律不可复核」，DEV_LOG.md:378 / :386 ④ 要求「走查驱动器必须入库，只留结果日志藏假绿」——
  // 这句结论此前唯一的来源是一次性临时脚本的读数（报告 §5 第三行 15,213），脚本已删、落地即失效。
  // 本支把那条流程钉成测试：真种子 → ensureDefaultPack（与 bootstrap.ts:146 同一条通道）
  // → preview → 六个 target 全 warn。断言只钉**命题**（每行 warn === true、footprint > perTarget[0]），
  // 不写 15,213 / 14,890 这类 token 字面量：它们随种子与包名漂移（D3 已证改名会挪 1 个 tok），
  // 六个 target 的实测数由报告 §5 具名分支给出。
  // 与 SRV-EST-02 一样 **seed-coupled by design**：预置包吃真种子（`seedSelection` 取
  // `seed_hash IS NOT NULL` 的全量），语料瘦身到撑不起阈值时这支**应当**红并逼人重看 FR-6.4，
  // 故**不加容差**。
  it('SRV-EST-04（FR-6.4 末句）: 真种子 + ensureDefaultPack → 六个 target 全 warn=true', async () => {
    const h = await makeHarness()
    runSeed(h.handle.db, SEED_DIR)
    const outcome = ensureDefaultPack(h.handle.db)
    expect(outcome.status, outcome.reason ?? outcome.status).toBe('created')

    const out = await preview(h, outcome.packId as string, outcome.version ?? '1.0.0')
    const est = out.sizeEstimate as NonNullable<typeof out.sizeEstimate>
    // 空数组的 every() 恒真 ⇒ 先把六个 target 的行集钉住，下面那条 warn 才有意义
    expect(est.perTarget.map((p) => p.adapter).sort()).toEqual([...ADAPTER_IDS].sort())
    for (const row of est.perTarget) {
      expect(
        row.warn,
        `预置包 perTarget[${row.adapter}] 应当亮黄条（FR-6.4「首启预置包自己就会亮黄条」）`,
      ).toBe(true)
    }
    expect(est.footprint.approxTokens).toBeGreaterThan(est.perTarget[0]?.approxTokens ?? 0)
  })
})
