import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import { PacksRepo } from '../repos/packs'
import { createPackService, type PackServiceDeps } from './packService'
import type { PackOut } from '@openvibe/shared'
import type { RenderedPack } from '../pack'

/**
 * `packService` 单测（service-layer.md §7 a 条 `UT-SVC-01`）。
 *
 * **这个测试文件本身就是 R2-safe 设计的证据**：它不需要 import `@openvibe/adapters`
 * 就能覆盖整条导出编排 —— 因为渲染是注入进来的能力，不是 core 的依赖。
 * 若日后有人「顺手」把 `renderPack` 改成 core 内直接 import，本文件会因解析失败而红。
 */

const EMPTY_SELECTION = {
  promptIds: [],
  termIds: [],
  skillIds: [],
  playbookIds: [],
  flowTemplateId: null,
}

/** 造一个最小可用的渲染结果；本服务只透传它的 fingerprint/manifestJson/files/warnings */
function rendered(): RenderedPack {
  return {
    files: [{ path: 'OPENVIBE.md', sha256: 'a'.repeat(64), content: '# 正文' }],
    // manifest 的完整形状由 composer 负责，本服务不读它 ⇒ 用 unknown 断言避免在此重述一份
    manifest: { pack: { name: '标准包' } } as unknown as RenderedPack['manifest'],
    manifestJson: '{"pack":{"name":"标准包"}}',
    fingerprint: 'b'.repeat(64),
    warnings: ['体积接近上限'],
    coveredPlatforms: ['claude-code'],
  }
}

function fixture() {
  const h = newDb()
  const pack = new PacksRepo(h.db).create({
    name: 'finance-core',
    description: '金融行业基线包',
    selection: EMPTY_SELECTION,
    targets: ['claude-code'],
  })
  const written: { root: string; artifacts: Record<string, string> }[] = []
  const renderCalls: { packId: string; version: string; exportedAt: string }[] = []
  const deps: PackServiceDeps = {
    db: h.db,
    // 固定时间源：若实现漏注入、改用隐式 nowIso()，下面的 exportedAt 断言立刻红
    now: () => '2026-10-15T03:00:00.000Z',
    renderPack: (p: PackOut, version: string, exportedAt: string) => {
      renderCalls.push({ packId: p.id, version, exportedAt })
      return rendered()
    },
    packExportDir: (name, version) => `/tmp/ov-export/${name}@${version}`,
    writeDirectoryExport: (root, artifacts) => {
      written.push({ root, artifacts })
    },
  }
  return { h, pack, svc: createPackService(deps), written, renderCalls }
}

describe('UT-SVC-01 · packService 导出编排（从 routes/packs.ts 迁入，行为零变化）', () => {
  it('download 通道 ⇒ directoryPath 为 null，且**写盘能力完全不被调用**', () => {
    const { h, pack, svc, written } = fixture()
    const out = svc.exportPackWithRecord({ packId: pack.id, version: '1.0.0', channel: 'download' })
    expect(out.status).toBe('created')
    expect(out.directoryPath).toBeNull()
    expect(written).toEqual([])
    expect(out.bundlePath).toBe(`/api/packs/${pack.id}/exports/${out.export.id}/bundle`)
    expect(out.fingerprint).toBe('b'.repeat(64))
    expect(out.warnings).toEqual(['体积接近上限'])
    h.close()
  })

  it('directory 通道 ⇒ 目录路径由注入能力算出，产物是**目录布局**而非渲染原样', () => {
    const { h, pack, svc, written } = fixture()
    const out = svc.exportPackWithRecord({
      packId: pack.id,
      version: '1.0.0',
      channel: 'directory',
    })
    expect(out.directoryPath).toBe('/tmp/ov-export/finance-core@1.0.0')
    expect(written).toHaveLength(1)
    expect(written[0]!.root).toBe(out.directoryPath)
    // ⚠️ 断言的是**目录布局**（manifest 在根、正文在 files/ 下），不是 `rendered.files` 原样。
    // 若实现把 rendered 直接交给写盘能力（跳过 directoryFiles），这里会是 ['OPENVIBE.md'] 而红。
    expect(written[0]!.artifacts).toEqual({
      'openvibe.pack.json': '{"pack":{"name":"标准包"}}',
      'files/OPENVIBE.md': '# 正文',
    })
    expect(out.export.channel).toBe('directory')
    h.close()
  })

  it('**时间源是注入的**：renderPack 拿到的 exportedAt 来自 deps.now()，不是隐式时钟', () => {
    const { h, pack, svc, renderCalls } = fixture()
    svc.exportPackWithRecord({ packId: pack.id, version: '1.0.0', channel: 'download' })
    expect(renderCalls).toHaveLength(1)
    expect(renderCalls[0]!.exportedAt).toBe('2026-10-15T03:00:00.000Z')
    expect(renderCalls[0]!.version).toBe('1.0.0')
    expect(renderCalls[0]!.packId).toBe(pack.id)
    h.close()
  })

  it('版本单调：低于最新导出 ⇒ VALIDATION_ERROR，且 fieldErrors 指名字段（m6a FR-4.1）', () => {
    const { h, pack, svc } = fixture()
    svc.exportPackWithRecord({ packId: pack.id, version: '1.2.0', channel: 'download' })
    try {
      svc.exportPackWithRecord({ packId: pack.id, version: '1.1.0', channel: 'download' })
      throw new Error('本该抛错')
    } catch (e) {
      const err = e as { code: string; details?: { fieldErrors?: Record<string, string[]> } }
      expect(err.code).toBe('VALIDATION_ERROR')
      expect(err.details?.fieldErrors?.version).toEqual(['需 ≥ 1.2.0，当前 1.1.0'])
    }
    h.close()
  })

  it('幂等重导：同 pack 同版本 ⇒ status=idempotent 且导出记录仍只有一行', () => {
    const { h, pack, svc } = fixture()
    const first = svc.exportPackWithRecord({
      packId: pack.id,
      version: '1.0.0',
      channel: 'download',
    })
    const again = svc.exportPackWithRecord({
      packId: pack.id,
      version: '1.0.0',
      channel: 'download',
    })
    expect(first.status).toBe('created')
    expect(again.status).toBe('idempotent')
    expect(again.export.id).toBe(first.export.id)
    expect(new PacksRepo(h.db).exportsOf(pack.id)).toHaveLength(1)
    h.close()
  })

  it('包不存在 ⇒ NOT_FOUND（11 项错误码闭集内，不新增码）', () => {
    const { h, svc } = fixture()
    try {
      svc.exportPackWithRecord({ packId: 'pack_不存在', version: '1.0.0', channel: 'download' })
      throw new Error('本该抛错')
    } catch (e) {
      expect((e as { code: string }).code).toBe('NOT_FOUND')
    }
    h.close()
  })

  it('版本被拒时**不产生任何导出记录**（校验在落盘与写库之前）', () => {
    const { h, pack, svc, written } = fixture()
    svc.exportPackWithRecord({ packId: pack.id, version: '2.0.0', channel: 'directory' })
    written.length = 0
    expect(() =>
      svc.exportPackWithRecord({ packId: pack.id, version: '1.0.0', channel: 'directory' }),
    ).toThrow()
    expect(written).toEqual([])
    h.close()
  })
})
