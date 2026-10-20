// `packages/core/src/db/m9-p1-10-source-freshness.test.ts` —— M9 v1.6 **P1.10 出口**
// （`m9-dev-plan-2026-10.md` §6.2 ＋ `m9-dev-language-roadmap.md` §3.2 / §7 DL-03）
//
// DL-03 原文：
//   「**停更源必须显式标记** —— 变异腿：把 `awesome-python-cn` 的停更日期清空 ⇒ 红」
//
// ⚠️ **这条判据此前没有任何一期真正产出它** —— spec §9 把 DL-03 列在 M9-P1 的
//   判据里，而 dev-plan §7 把它归给 P1c.1（失效巡检：那是「链接还活着吗」，
//   与「源还更新吗」是**两件事**）⇒ 两份台账不一致。P1.10 落地 P1 侧。
//
// 断五组事：
//   ① **判据原文的变异腿**（停更日期清空 ⇒ 红）＋三条兄弟规则
//   ② **口径不许漂移**：spec §1.5 登记的停更源 == 代码里的 `STALE_SOURCE_KEYS`
//   ③ **已入库产物**：六份清单都带 `source_freshness` 段，且 awesome-python-cn 标红
//   ④ **文案与 spec 逐字对得上**（§3.2 写的是「该源已 4 年未更新」）
//   ⑤ **反证**：把每条规则拆掉，对应的违规必须**从红变绿**（否则那条规则是摆设）
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  computeFreshness,
  parseSpecStaleSources,
  readSpecStaleSources,
  scanSourceFreshness,
  specSourceNameToKey,
  validateFreshness,
  yearsText,
  STALE_SOURCE_KEYS,
  type SourceFreshness,
} from './m9-source-freshness'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SPEC_FILE = join(REPO_ROOT, 'docs/specs/m9-dev-language-roadmap.md')
const PROBE_DIR = join(REPO_ROOT, 'docs/devlog-evidence/M9-probe')

/**
 * 合成样本用的「今天」—— 固定值 ⇒ 判定可复算、可测。
 *
 * ⚠️ **已入库的六份清单不用它**：那六份的 `age_days` 是**快照口径**
 *   （按各自的 `computed_at` 算），所以扫描它们时**不给 `now`** ⇒
 *   守卫按块自报的参照日复算。
 *   （拿固定日期去校它们 ⇒ 下次重新采集就会误红，而那条红是**假的**：
 *   源没变，是参照日变了。）
 */
const NOW = new Date('2026-10-20T00:00:00Z')

const INVENTORY_FILES = [
  'runoob-python3-inventory.json',
  'runoob-go-inventory.json',
  'xinliangnote-go-inventory.json',
  'walter201230-python-inventory.json',
  'awesome-python-cn-inventory.json',
  'awesome-go-inventory.json',
]

function loadFreshness(file: string): SourceFreshness {
  const parsed = JSON.parse(readFileSync(join(PROBE_DIR, file), 'utf8')) as {
    source_freshness: SourceFreshness
  }
  return parsed.source_freshness
}

/** 一份「合规」的新鲜度标记（变异腿在它上面改）。 */
function goodFreshness(over: Partial<SourceFreshness> = {}): SourceFreshness {
  return {
    source: 'awesome-python-cn',
    source_label: 'awesome-python-cn',
    computed_at: '2026-10-20',
    last_pushed_at: '2022-08-29',
    age_days: 1513,
    stale: true,
    basis: '源的最后提交时间 2022-08-29（1513 天前）',
    notice: '该源已 4 年未更新（最后更新 2022-08-29）—— 只能当候选池，不作真相源',
    ...over,
  }
}

describe('M9 P1.10 · DL-03 停更源必须显式标记', () => {
  // ───────────────────────────────────────────────────────────────────────
  // ① 判据原文的变异腿
  // ───────────────────────────────────────────────────────────────────────
  it('① 变异腿：把 `awesome-python-cn` 的停更日期清空 ⇒ 红', () => {
    const hits = validateFreshness('probe.json', goodFreshness({ last_pushed_at: null }), {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    expect(
      hits.some((h) => h.rule === 'stale-without-date'),
      '停更日期被清空了，闸却没红',
    ).toBe(true)
  })

  it('② 标红却没标红文案 ⇒ 红（§3.2「界面上显式提示」不成立）', () => {
    const hits = validateFreshness('probe.json', goodFreshness({ notice: null }), {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    expect(hits.some((h) => h.rule === 'stale-without-notice')).toBe(true)
  })

  it('③ spec 登记为停更却没标红 ⇒ 红（口径漂移）', () => {
    const hits = validateFreshness('probe.json', goodFreshness({ stale: false }), {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    expect(hits.some((h) => h.rule === 'registered-but-not-stale')).toBe(true)
  })

  it('④ 没被登记的源却标红 ⇒ 红（误标）', () => {
    const hits = validateFreshness(
      'probe.json',
      goodFreshness({ source: 'awesome-go', stale: true }),
      { now: NOW, registeredStale: STALE_SOURCE_KEYS },
    )
    expect(hits.some((h) => h.rule === 'false-stale')).toBe(true)
  })

  it('⑤ `age_days` 与 `last_pushed_at` 对不上 ⇒ 红（不可复算）', () => {
    const hits = validateFreshness('probe.json', goodFreshness({ age_days: 42 }), {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    expect(hits.some((h) => h.rule === 'age-mismatch')).toBe(true)
  })

  it('⑥ 完全没有 `source_freshness` 段 ⇒ 红（「没查过」不许与「没停更」混同）', () => {
    const hits = validateFreshness('probe.json', undefined, {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    expect(hits.some((h) => h.rule === 'missing-block')).toBe(true)
  })

  // ───────────────────────────────────────────────────────────────────────
  // ② 口径不许漂移
  // ───────────────────────────────────────────────────────────────────────
  it('⑦ spec §1.5 登记的停更源 == 代码里的 `STALE_SOURCE_KEYS`（改一边忘了另一边 ⇒ 红）', () => {
    const fromSpec = readSpecStaleSources(SPEC_FILE)
    expect(fromSpec.length).toBeGreaterThan(0)
    expect([...fromSpec].sort()).toEqual([...STALE_SOURCE_KEYS].sort())
  })

  it('⑧ spec 的源名 → 清单 key 的对照（runoob 取末段，其余用短横连起来）', () => {
    expect(specSourceNameToKey('**runoob / Python3**')).toBe('python3')
    expect(specSourceNameToKey('**runoob / Go**')).toBe('go')
    expect(specSourceNameToKey('**xinliangnote/Go**')).toBe('xinliangnote-go')
    expect(specSourceNameToKey('**walter201230/Python**')).toBe('walter201230-python')
    expect(specSourceNameToKey('**awesome-go**')).toBe('awesome-go')
  })

  it('⑨ 只读 §1.5 那张表：spec 别处的「停更」二字不算源登记', () => {
    // §3.2 的规则行、§1.1 的备注、§7 的风险表里都有「停更」二字
    const spec = readFileSync(SPEC_FILE, 'utf8')
    expect(spec).toContain('停更源必须标红')
    const fromSpec = parseSpecStaleSources(spec)
    expect(fromSpec).toEqual(['awesome-python-cn'])
  })

  // ───────────────────────────────────────────────────────────────────────
  // ③ 已入库产物
  // ───────────────────────────────────────────────────────────────────────
  it('⑩ 六份清单都带 `source_freshness` 段（实扫）', () => {
    const files = INVENTORY_FILES.map((f) => ({
      path: f,
      content: readFileSync(join(PROBE_DIR, f), 'utf8'),
    }))
    // ⚠️ **不给 `now`** ⇒ 每份清单按自己的 `computed_at` 复算（见 NOW 的注释）
    const hits = scanSourceFreshness(files, { registeredStale: STALE_SOURCE_KEYS })
    expect(hits.map((h) => `${h.file} ${h.where} ${h.rule} ${h.detail}`)).toEqual([])
  })

  it('⑪ awesome-python-cn 标红，且带停更日期与文案', () => {
    const f = loadFreshness('awesome-python-cn-inventory.json')
    expect(f.stale).toBe(true)
    expect(f.last_pushed_at).toBe('2022-08-29')
    expect(f.notice).toBeTruthy()
    expect(f.source_label).toBe('awesome-python-cn')
  })

  it('⑫ 其余五份清单都没被误标（活跃源不标红）', () => {
    for (const f of INVENTORY_FILES.filter((x) => x !== 'awesome-python-cn-inventory.json')) {
      expect(loadFreshness(f).stale, f).toBe(false)
    }
  })

  it('⑬ runoob 两门没有推送时间，但 basis 说清了「凭什么」（不许留空）', () => {
    for (const f of ['runoob-python3-inventory.json', 'runoob-go-inventory.json']) {
      const fresh = loadFreshness(f)
      expect(fresh.last_pushed_at, f).toBeNull()
      expect(fresh.age_days, f).toBeNull()
      expect(fresh.basis.length, f).toBeGreaterThan(10)
      expect(fresh.basis, f).toContain('采集对账')
    }
  })

  // ───────────────────────────────────────────────────────────────────────
  // ④ 文案与 spec 逐字对得上
  // ───────────────────────────────────────────────────────────────────────
  it('⑭ 标红文案与 spec §3.2 的措辞一致（「该源已 4 年未更新」）', () => {
    const f = loadFreshness('awesome-python-cn-inventory.json')
    expect(f.notice).toContain('该源已 4 年未更新')
    const spec = readFileSync(SPEC_FILE, 'utf8')
    expect(spec).toContain('该源已 4 年未更新')
  })

  it('⑮ 年数**向下取整**（宁可少说不可多说）', () => {
    expect(yearsText(1513)).toBe('4')
    expect(yearsText(926)).toBe('2')
    expect(yearsText(365)).toBe('0')
    expect(yearsText(1000)).toBe('2')
    expect(yearsText(20)).toBe('20 天')
  })

  it('⑯ 无推送时间的源算不出年龄（不许瞎猜一个）', () => {
    const f = computeFreshness({
      source: 'python3',
      sourceLabel: 'runoob / Python3',
      lastPushedAt: null,
      now: NOW,
      registeredStale: false,
    })
    expect(f.age_days).toBeNull()
    expect(f.stale).toBe(false)
    expect(f.notice).toBeNull()
    expect(f.basis).toContain('采集对账')
  })

  // ───────────────────────────────────────────────────────────────────────
  // ⑤ 反证：规则不是摆设
  // ───────────────────────────────────────────────────────────────────────
  it('⑰ 反证：把「停更日期」补回去 ⇒ 同一个样本从红变绿（那条规则确实在做事）', () => {
    const opts = { now: NOW, registeredStale: STALE_SOURCE_KEYS }
    const broken = validateFreshness('probe.json', goodFreshness({ last_pushed_at: null }), opts)
    const fixed = validateFreshness('probe.json', goodFreshness(), opts)
    expect(broken.some((h) => h.rule === 'stale-without-date')).toBe(true)
    expect(fixed.some((h) => h.rule === 'stale-without-date')).toBe(false)
  })

  it('⑱ 反证：把源从「已登记停更」名单里去掉 ⇒ 「没标红」那条不再报（否则它恒绿）', () => {
    const f = goodFreshness({ stale: false })
    const asRegistered = validateFreshness('probe.json', f, {
      now: NOW,
      registeredStale: STALE_SOURCE_KEYS,
    })
    const asUnregistered = validateFreshness('probe.json', f, {
      now: NOW,
      registeredStale: [],
    })
    expect(asRegistered.some((h) => h.rule === 'registered-but-not-stale')).toBe(true)
    expect(asUnregistered.some((h) => h.rule === 'registered-but-not-stale')).toBe(false)
  })

  // ───────────────────────────────────────────────────────────────────────
  // ⑥ 参照日：块自报，不由「跑闸那天」决定
  // ───────────────────────────────────────────────────────────────────────
  it('⑲ 参照日取自块自己的 `computed_at` ⇒ 重新采集后闸照样绿（自洽就算数）', () => {
    // 参照日往后挪一天、`age_days` 合法地 +1 ⇒ 仍然自洽，不该红
    const shifted = goodFreshness({ computed_at: '2026-10-21', age_days: 1514 })
    const hits = validateFreshness('probe.json', shifted, { registeredStale: STALE_SOURCE_KEYS })
    expect(hits.map((h) => h.rule)).toEqual([])
  })

  it('⑳ 参照日被改而 `age_days` 没跟着改 ⇒ 红（证明参照日真的被读了，不是摆设）', () => {
    const tampered = goodFreshness({ computed_at: '2026-10-21' })
    const hits = validateFreshness('probe.json', tampered, { registeredStale: STALE_SOURCE_KEYS })
    expect(hits.some((h) => h.rule === 'age-mismatch')).toBe(true)
  })

  it('㉑ 没有可用的 `computed_at` 却有停更日期 ⇒ 红（不许拿「今天」当参照日）', () => {
    const noRef = goodFreshness({ computed_at: '' })
    const hits = validateFreshness('probe.json', noRef, { registeredStale: STALE_SOURCE_KEYS })
    expect(hits.some((h) => h.rule === 'missing-computed-at')).toBe(true)
  })

  it('㉒ 六份清单的顶层 `collected_at` == 新鲜度块的 `computed_at`（两个日期不许夹生）', () => {
    for (const f of INVENTORY_FILES) {
      const meta = JSON.parse(readFileSync(join(PROBE_DIR, f), 'utf8')) as {
        collected_at: string
        source_freshness: SourceFreshness
      }
      expect(meta.source_freshness.computed_at, f).toBe(meta.collected_at)
    }
  })
})
