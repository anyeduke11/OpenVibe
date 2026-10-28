import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AGENT_PAYLOAD_KEYS, LOCAL_EVENT_KINDS } from '@openvibe/shared'
import { payloadKeys, scanForbidden } from '../test-support/forbidden-scan'

/**
 * P5 · m3-terms-learning FR-9 「AI 调用留痕」的契约判据。
 *
 * ⚠️ **本 kind 是声明态**：生产写入点属 P4（AI 增强层），本轮没有。
 * 那「没有写入点」不等于「没法判」—— 能判的是**契约本身**：
 * ① 声明的 payload 键闭集里**一个原文容器都没有**（FR-9.3）；
 * ② 按这份闭集造出来的 P4 形态 payload 过得去禁列扫描器（FR-7.2 本地版本）。
 *
 * ⚠️ 判据本身是**否定式**的（没写错就永远绿）⇒ 必须自证：
 * 每条都配一条「故意造脏 ⇒ 必须被抓住」的反向腿。
 */

/** P4 落地时会写的那个 payload —— 这里按 FR-9.1 的最小可复盘集造一份 */
function makeP4Payload(over: Record<string, unknown> = {}) {
  return {
    aiModel: 'm3t-test',
    aiProvider: 'local',
    inputHash: 'a'.repeat(64),
    candidateCount: 7,
    passedCount: 3,
    droppedCount: 4,
    result: 'ok',
    failureReason: '',
    durationMs: 128,
    ...over,
  }
}

const KEYS = AGENT_PAYLOAD_KEYS.ai_recommend_call

describe('P5 · FR-9.1 留痕的最小可复盘集', () => {
  it('⚠️ 台账 kind 已含 ai_recommend_call；**末尾项**是最新一轮的最近追加（M9 v1.6 P0 加 4 项后，末尾是 `lang_resource_probe`）', () => {
    // 写死 23 + 2 = 25（M10/D 批次 D 追加 2 项），扩项必须在这里被看见（与上同源）。
    expect(LOCAL_EVENT_KINDS).toHaveLength(25)
    // ai_recommend_call 仍在内（M3 AI 那条）
    expect(LOCAL_EVENT_KINDS).toContain('ai_recommend_call')
    // 末尾仍是 M9 v1.6 P0 的 lang_resource_probe：M10/D 的两项 AI kind 挂在
    // AGENT_AI_EVENT_KINDS 块（shared 组合序 = 台账13 + Agent8 + M9 4），不在尾部追加。
    expect(LOCAL_EVENT_KINDS[LOCAL_EVENT_KINDS.length - 1]).toBe('lang_resource_probe')
  })

  it('⚠️ 键闭集里没有任何「装原文」的容器（FR-9.3）', () => {
    // 判据不是「键名里没有 text/body 这几个词」—— 那只是词面。
    // 真正的判据是**逐键断类型**：原文容器必然是 string 且名字指向内容。
    // ⚠️ 这里是**排序后**的形态：`AGENT_PAYLOAD_KEYS` 由 `Object.keys(...).sort()` 派生，
    // 所以契约判据比对的是排序结果。写死是为了让「悄悄加一个键」变红 ——
    // 那种加法正是 FR-9.3 要防的（多一个键就多一个装原文的机会）。
    expect(KEYS).toEqual([
      'aiModel',
      'aiProvider',
      'candidateCount',
      'droppedCount',
      'durationMs',
      'failureReason',
      'inputHash',
      'passedCount',
      'result',
    ])
    // 画像只留指纹：键名必须是 hash 语义，且不含任何内容语义
    expect(
      KEYS.filter((k) => /text|body|content|snapshot|checklist|prompt|contentRaw/i.test(k)),
    ).toEqual([])
  })

  it('⚠️ 按声明形状造出的 P4 形态 payload 过得去禁列扫描器（自证：脏的那份过不去）', () => {
    const clean = {
      payload_json: JSON.stringify(makeP4Payload()),
      subject_type: 'project',
      subject_id: 'prj_1',
    }
    expect(scanForbidden(clean)).toEqual([])

    // 反向腿：把 checklist 原文塞进 payload，扫描器**不认**它（正文靠写入点白名单，不靠正则）
    // —— 所以这里断的是「形状里放不下正文」，由上面那条键闭集判据承担。
    const dirty = {
      payload_json: JSON.stringify(makeP4Payload({ failureReason: 'E:\\Users\\duke\\x' })),
      subject_type: 'project',
      subject_id: 'prj_1',
    }
    expect(scanForbidden(dirty).length).toBeGreaterThan(0)
  })

  it('⚠️ AI-M3T-12 · local_path 进 payload 必被扫描器抓住（FR-9.3 ＋ FR-7.2 双向）', () => {
    const row = {
      payload_json: JSON.stringify(makeP4Payload({ inputHash: '/Users/duke/本机路径/x' })),
      subject_type: 'project',
      subject_id: 'prj_1',
    }
    expect(scanForbidden(row).length).toBeGreaterThan(0)
  })

  it('⚠️ payloadKeys() 取到的键与声明一致（写入点白名单机制的下界）', () => {
    const row = { payload_json: JSON.stringify(makeP4Payload()) }
    expect(payloadKeys(row).sort()).toEqual([...KEYS].sort())
  })
})

describe('P5 · 迁移 0010 的重建语义', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('./migrations/0010_ai_recommend_ledger.sql', import.meta.url)),
    'utf8',
  )

  it('⚠️ 必须走「建新表 → 复制 → 删旧表 → 改名」四步（SQLite 改不了 CHECK）', () => {
    // 自证：这条判据不是查一堆恒存在的词，而是要求四步**都**在
    expect(sql).toMatch(/CREATE TABLE local_events_v2/i)
    expect(sql).toMatch(/INSERT INTO local_events_v2/i)
    expect(sql).toMatch(/DROP TABLE local_events/i)
    expect(sql).toMatch(/ALTER TABLE local_events_v2 RENAME TO local_events/i)
  })

  it('⚠️ 复制必须**逐列点名**，不能 `SELECT *`', () => {
    // `SELECT *` 在重建迁移里是定时炸弹：日后有人往表上加列，
    // 老迁移会把新列的历史行填成 NULL 而不报错。
    expect(sql).not.toMatch(/SELECT\s+\*/i)
    expect(sql).toMatch(
      /SELECT id, kind, subject_type, subject_id, project_id, payload_json, created_at, day FROM local_events/i,
    )
  })

  it('⚠️ 重建后两条索引必须重建（丢索引＝性能塌方，且没有任何测试会红）', () => {
    expect(sql).toMatch(/CREATE INDEX idx_local_events_kind_day/i)
    expect(sql).toMatch(/CREATE INDEX idx_local_events_created_at/i)
  })
})
