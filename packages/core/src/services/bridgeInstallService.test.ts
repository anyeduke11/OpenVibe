import { describe, it, expect } from 'vitest'
import { newDb } from '../test-support/new-db'
import {
  createBridgeInstallService,
  BRIDGE_INSTALL_PAYLOAD_KEYS,
  type BridgeInstallInput,
} from './bridgeInstallService'

/**
 * M8 · `agent_bridge_installed` 写入点（PRD §6.3 触发点 ／ §6.4 去重键 ／ FR-5.1.1 键闭集）。
 *
 * ## 这组测试在验什么、又在替什么挡着
 *
 * **去重是本类事件最容易做错的地方**：PRD §6.4 写死「按 `(project_id, adapter, pack_version)`
 * 去重，重复检测不重复记」。而「检测」天然会被重试、并发、页面重渲染放大 ——
 * 一旦去重漏了，D15 拿「两周窗内用了几次」判活跃度时就会**把一个人算成好几个人**，
 * 而且这种虚高**不会报错**，只会让统计悄悄偏向「重度用户」。
 *
 * ⚠️ **本文件当前没有生产调用方**，触发条件「检测到项目内存在 skill 目录」写不出来
 * （skill 目录的形态是 M8-A 的未闭合三问之一，见 `m8-agent-bridge.md:51`）。
 * 不依赖那个约定的部分 —— 键闭集、校验、去重 —— 在这里做实测死，
 * M8-A 落地时直接挂上去即可。
 */

const NOW = new Date('2026-10-15T08:30:00.000Z')

function service(at: Date = NOW) {
  const h = newDb()
  return { h, svc: createBridgeInstallService({ db: h.db, now: () => at }) }
}

interface Row {
  kind: string
  subject_type: string | null
  subject_id: string | null
  project_id: string | null
  payload_json: string
  day: string
}

function rows(h: ReturnType<typeof newDb>, projectId: string): Row[] {
  return h.db
    .prepare(
      `SELECT kind, subject_type, subject_id, project_id, payload_json, day
         FROM local_events WHERE kind = 'agent_bridge_installed' AND project_id = ?
         ORDER BY id ASC`,
    )
    .all(projectId) as Row[]
}

const base = { projectId: 'prj_1', adapter: 'trae', packVersion: '0.3.1' }

describe('agent_bridge_installed · 写入与字段', () => {
  it('首次记一条：kind 落列、subject 为项目、payload 只有 adapter 与 packVersion', () => {
    const { h, svc } = service()
    const r = svc.recordBridgeInstalled(base)
    expect(r.recorded).toBe(true)

    const got = rows(h, 'prj_1')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      kind: 'agent_bridge_installed',
      subject_type: 'project',
      subject_id: 'prj_1',
      project_id: 'prj_1',
      day: '2026-10-15',
    })
    expect(Object.keys(JSON.parse(got[0]!.payload_json)).sort()).toEqual(
      [...BRIDGE_INSTALL_PAYLOAD_KEYS].sort(),
    )
    expect(BRIDGE_INSTALL_PAYLOAD_KEYS).toEqual(['adapter', 'packVersion'])
    h.close()
  })

  it('payload 不得带任何多余键（FR-5.1.1 闭集：超出即红）', () => {
    const { h, svc } = service()
    // ⚠️ 走 `Record` 再断言：对象字面量会被 TS 的多余属性检查挡下，
    // 那条路对应的是**运行时无类型的调用方**（HTTP 请求体 / 别的语言）——
    // 而那正是白名单构造要防的场景，不是编译期能拦住的。
    const raw: Record<string, unknown> = { ...base, projectPath: '/Users/someone/work/x' }
    svc.recordBridgeInstalled(raw as BridgeInstallInput)
    const got = rows(h, 'prj_1')
    expect(got).toHaveLength(1)
    const payload = JSON.parse(got[0]!.payload_json)
    expect(Object.keys(payload)).toEqual(['adapter', 'packVersion'])
    expect(JSON.stringify(payload)).not.toContain('/Users')
    h.close()
  })
})

describe('agent_bridge_installed · 去重键 (project_id, adapter, packVersion)', () => {
  it('同一三元组重复检测 ⇒ 只记一条，后续返回 recorded:false', () => {
    const { h, svc } = service()
    expect(svc.recordBridgeInstalled(base).recorded).toBe(true)
    for (let i = 0; i < 4; i++) {
      expect(svc.recordBridgeInstalled(base).recorded).toBe(false)
    }
    expect(rows(h, 'prj_1')).toHaveLength(1)
    h.close()
  })

  it('⚠️ 换 adapter ⇒ 各记一条（去重键不能宽到把不同平台合并）', () => {
    const { h, svc } = service()
    svc.recordBridgeInstalled(base)
    svc.recordBridgeInstalled({ ...base, adapter: 'claude-code' })
    expect(rows(h, 'prj_1')).toHaveLength(2)
    h.close()
  })

  it('⚠️ 换 packVersion ⇒ 各记一条（升级应看得见，不是同一件事）', () => {
    const { h, svc } = service()
    svc.recordBridgeInstalled(base)
    svc.recordBridgeInstalled({ ...base, packVersion: '0.4.0' })
    expect(rows(h, 'prj_1')).toHaveLength(2)
    h.close()
  })

  it('⚠️ 换 projectId ⇒ 各记一条（不同项目互不影响）', () => {
    const { h, svc } = service()
    svc.recordBridgeInstalled(base)
    svc.recordBridgeInstalled({ ...base, projectId: 'prj_2' })
    expect(rows(h, 'prj_1')).toHaveLength(1)
    expect(rows(h, 'prj_2')).toHaveLength(1)
    h.close()
  })

  it('去重只在同一 project 内生效：A 的三元组不影响 B', () => {
    const { h, svc } = service()
    svc.recordBridgeInstalled(base)
    // 同 adapter / packVersion，不同项目 ⇒ 必须记
    expect(svc.recordBridgeInstalled({ ...base, projectId: 'prj_2' }).recorded).toBe(true)
    h.close()
  })
})

describe('agent_bridge_installed · 校验（宁可 422，也不要一条语义不明的台账行）', () => {
  it.each([
    ['projectId 缺省', { adapter: 'trae', packVersion: '0.3.1' }],
    ['projectId 空串', { ...base, projectId: '' }],
    ['projectId 非字符串', { ...base, projectId: 42 }],
    ['adapter 非字符串', { ...base, adapter: 1 }],
    ['packVersion 非字符串', { ...base, packVersion: null }],
    ['adapter 空白串', { ...base, adapter: '  ' }],
  ])('%s ⇒ 抛 VALIDATION_ERROR 且一条都不记', (_label, input) => {
    const { h, svc } = service()
    expect(() => svc.recordBridgeInstalled(input as typeof base)).toThrow(/VALIDATION_ERROR|校验/)
    expect(rows(h, 'prj_1')).toHaveLength(0)
    h.close()
  })

  it('⚠️ adapter / packVersion 含路径分隔符 ⇒ 拒（FR-5.1.2 禁列在写入点的兜底）', () => {
    const { h, svc } = service()
    for (const bad of ['/Users/x/trae', 'C:\\Users\\x', '~/work/trae']) {
      expect(() => svc.recordBridgeInstalled({ ...base, adapter: bad })).toThrow()
    }
    expect(rows(h, 'prj_1')).toHaveLength(0)
    h.close()
  })

  it('packVersion 超长 ⇒ 拒（长自由文本会绕开禁列扫描直接进台账）', () => {
    const { h, svc } = service()
    expect(() => svc.recordBridgeInstalled({ ...base, packVersion: '9'.repeat(65) })).toThrow()
    expect(rows(h, 'prj_1')).toHaveLength(0)
    h.close()
  })

  it('packVersion 边界：恰好 64 字符放行', () => {
    const { h, svc } = service()
    const v64 = '9'.repeat(64)
    expect(svc.recordBridgeInstalled({ ...base, packVersion: v64 }).recorded).toBe(true)
    expect(rows(h, 'prj_1')).toHaveLength(1)
    h.close()
  })

  it('校验失败不得影响已有记录（不产生半条台账）', () => {
    const { h, svc } = service()
    svc.recordBridgeInstalled(base)
    expect(() => svc.recordBridgeInstalled({ ...base, adapter: '/bad/path' })).toThrow()
    expect(rows(h, 'prj_1')).toHaveLength(1)
    h.close()
  })
})

describe('agent_bridge_installed · 坏 JSON 不得被当成去重命中', () => {
  it('库里若存在一条坏 payload_json，本次仍应记一条（宁可多记不可吞掉真实检测）', () => {
    const { h, svc } = service()
    h.db
      .prepare(
        `INSERT INTO local_events
           (kind, subject_type, subject_id, project_id, payload_json, created_at, day)
         VALUES ('agent_bridge_installed', 'project', 'prj_1', 'prj_1', '{not json', ?, ?)`,
      )
      .run(NOW.toISOString(), '2026-10-15')
    expect(svc.recordBridgeInstalled(base).recorded).toBe(true)
    expect(rows(h, 'prj_1')).toHaveLength(2)
    h.close()
  })
})
