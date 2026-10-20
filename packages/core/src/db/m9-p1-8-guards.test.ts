// `packages/core/src/db/m9-p1-8-guards.test.ts` —— M9 v1.6 P1.8 出口
// （`m9-dev-plan-2026-10.md` §6.2 + `m9-dev-language-roadmap.md` §7 DL-02 / DL-06 / DL-14）
//
// P1.8 = **补齐 M9-P1 期剩下的三条判据**（dev-plan §7 反向矩阵里挂在 P1 期、
//       但 §6.2 没有独立子任务、状态仍是「未开工」的三条）：
//
//   - **DL-02** 教程正文零进仓守卫
//   - **DL-06** 挂接不反向写 `terms` 表
//   - **DL-14** Python/Go 可筛选，且两门的数据都在
//
// 三条都是**否定式判据**（没写错就永远绿）⇒ 每条都必须配「注入违规 ⇒ 必须报出」的腿，
// 否则「扫描器漏了」与「仓里干净」在结果上长得一模一样。
//
// ⚠️ **三条判据的范围边界都写在这里，不藏**：
//   - DL-02 的「全仓」= **外部源派生层**（采集证据 ＋ 派生清单 ＋ 采集脚本）；
//     自撰内容层（§3.7 要求写满的三段）**刻意不扫** —— 扫了就把 §3.7 的产出判成违规。
//   - DL-06 守的是**挂接动作的不变量**（只写 `lang_topic_terms`），
//     **不生产挂接内容** —— 术语资产 109 条里没有一条是编程语言词条，无可挂对象（见交付报告）。
//   - DL-14 守的是**筛选器可选值来自库** ＋ **两门行数按 §1.5 实测钉住**。

import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import {
  EXTERNAL_LAYER_FILES,
  SELF_AUTHORED_CONTENT_FILES,
  PROSE_MIN_RUN,
  scanDirectoryClosure,
  scanExternalFile,
  scanExternalJson,
  scanExternalLayer,
  scanExternalScript,
  syntheticLongUrlSample,
  syntheticPaddedMetadataSample,
  syntheticRealisticUrlSample,
  syntheticProseSample,
} from './m9-external-content-scan'
import {
  MAX_TERMS_PER_TOPIC,
  attachTopicTermByNaturalKey,
  attachTopicTerms,
  listTopicTerms,
  termsChanged,
  termsFingerprint,
  termsRowCount,
} from './m9-topic-terms'
import {
  filterTopics,
  langCoverage,
  topicFilterOptions,
} from './m9-topic-filter'
import type { SqliteDatabase } from './index'

const SEEDS_DIR = fileURLToPath(new URL('./seeds', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/**
 * 实测知识点条数：runoob Python3 84 ＋ runoob Go 34 ＋ **P1d 冷门底层 6** = 124。
 *
 * ⚠️ 冷门六条是 P1d 补建的（Python ＋1 · Go ＋5）⇒ 84 → 85、34 → 39。
 */
const EXPECTED_PY_TOTAL = 85
const EXPECTED_GO_TOTAL = 39
const EXPECTED_TOTAL = EXPECTED_PY_TOTAL + EXPECTED_GO_TOTAL

function insertTerm(db: SqliteDatabase, id: string, zh: string): void {
  db.prepare(
    `INSERT INTO terms (id, zh, en, aliases, definition, example, created_at, updated_at)
     VALUES (?, ?, ?, '[]', ?, '', '2026-10-20', '2026-10-20')`,
  ).run(id, zh, `en-${id}`, `术语定义：${zh}`)
}

// ============================================================================
// DL-02 · 教程正文零进仓
// ============================================================================
describe('M9 P1.8 · DL-02 教程正文零进仓', () => {
  it('① 外部源派生层实扫 ⇒ 0 违规（采集证据 ＋ 派生清单 ＋ 采集脚本）', () => {
    const violations = scanExternalLayer(REPO_ROOT)
    expect(
      violations.map((v) => `${v.file} ${v.where} ${v.rule} ${v.detail}`),
      '外部源派生层出现疑似教程正文',
    ).toEqual([])
  })

  it('② 范围边界：自撰内容层**刻意不扫**（扫了会把 §3.7 的产出判成违规）', () => {
    // 排除是**写下来的决定**，不是侥幸
    for (const f of SELF_AUTHORED_CONTENT_FILES) {
      expect(EXTERNAL_LAYER_FILES as readonly string[]).not.toContain(f)
    }
    // 反证：这些文件**确实**会被扫出违规（`body_md` 是正文字段名）⇒ 排除是必要的
    const contentPath = join(REPO_ROOT, SELF_AUTHORED_CONTENT_FILES[0])
    const hits = scanExternalFile(
      SELF_AUTHORED_CONTENT_FILES[0],
      readFileSync(contentPath, 'utf8'),
    )
    expect(
      hits.some((h) => h.rule === 'body-field'),
      '自撰内容层若扫不出违规，说明排除规则不是必要的（那它就只是个侥幸）',
    ).toBe(true)
  })

  it('变异 ①：注入成段中文散文 ⇒ 散文规则必须报出（且**只**报散文）', () => {
    const sample = syntheticProseSample()
    const hits = scanExternalJson('probe.json', JSON.stringify({ items: [{ title: sample }] }))
    expect(hits.some((h) => h.rule === 'prose-run'), '成段散文没被报出').toBe(true)
    // ⚠️ 样本刻意压在长度上限之内 ⇒ 不该被长度规则顺带命中
    expect(sample.length).toBeLessThanOrEqual(80)
    expect(hits.some((h) => h.rule === 'metadata-too-long'), '样本越界了，测的不是散文规则').toBe(
      false,
    )
  })

  it('变异 ②：注入超长但无汉字的**非 URL** 元数据 ⇒ 长度规则必须报出（且不报散文）', () => {
    const sample = syntheticPaddedMetadataSample()
    const hits = scanExternalJson('probe.json', JSON.stringify({ items: [{ summary: sample }] }))
    expect(hits.some((h) => h.rule === 'metadata-too-long'), '超长元数据没被报出').toBe(true)
    expect(hits.some((h) => h.rule === 'prose-run'), '样本越界了，测的不是长度规则').toBe(false)
  })

  // ⚠️ **长度规则分两档**（URL 有自己的上限）—— 这三支是「放宽是按形状的」的证明：
  //   ① 真实长度的 URL（awesome-go 113 / xinliangnote 243 那个量级）**不该**被报出；
  //   ② 超长 URL 要被**另一个规则**报出（不是「悄悄放行」）；
  //   ③ 变体：把 URL 规则去掉 ⇒ ② 那支必须变红 ⇒ 那条规则在做事。
  it('变异 ④：真实长度的 URL（实测 113～243 字符那个量级）⇒ **不该**被报出', () => {
    const sample = syntheticRealisticUrlSample()
    expect(sample.length).toBeGreaterThan(80)
    const hits = scanExternalJson('probe.json', JSON.stringify({ items: [{ url: sample }] }))
    expect(hits.filter((h) => h.rule === 'metadata-too-long' || h.rule === 'url-too-long')).toEqual([])
  })

  it('变异 ⑤：超长 URL（> 300）⇒ 必须被 `url-too-long` 报出（不是悄悄放行）', () => {
    const sample = syntheticLongUrlSample()
    const hits = scanExternalJson('probe.json', JSON.stringify({ items: [{ url: sample }] }))
    expect(hits.some((h) => h.rule === 'url-too-long'), '超长 URL 没被报出').toBe(true)
    expect(hits.some((h) => h.rule === 'metadata-too-long'), 'URL 不该走非 URL 那一档').toBe(false)
  })

  // ⚠️ **逐字段长度覆写**（M9 P1b 实测引入）：附件的 `d`（资源描述）最长 115 字符（主清单）
  //   ／121 字符（速成专区）⇒ 撞默认的 80 会把两份种子判红。
  //   ⇒ 只给**那一个字段**放宽（`summary`），**不调全局上限**（那是给正文开后门）。
  //   下面四支证明：覆写生效、不是无限豁免、**别的字段照旧受 80**、去掉覆写就红。
  const RES_SEED = 'packages/core/src/db/seeds/lang_resources.json'

  it('覆写①：资源种子里的 115 字符描述**不该**被报出（覆写生效）', () => {
    const raw = readFileSync(join(REPO_ROOT, RES_SEED), 'utf8')
    const parsed = JSON.parse(raw) as { items: { summary: string }[] }
    const longest = Math.max(...parsed.items.map((i) => i.summary.length))
    expect(longest, '资源描述的最长值变了，覆写上限要跟着复核').toBeGreaterThan(80)
    const hits = scanExternalJson(RES_SEED, raw)
    expect(hits.filter((h) => h.rule === 'metadata-too-long')).toEqual([])
  })

  it('覆写②：描述超过覆写上限 ⇒ 必须被报出（覆写不是无限豁免）', () => {
    const raw = readFileSync(join(REPO_ROOT, RES_SEED), 'utf8')
    const parsed = JSON.parse(raw) as { items: Record<string, unknown>[] }
    parsed.items[0] = { ...parsed.items[0], summary: 'x'.repeat(131) }
    const hits = scanExternalJson(RES_SEED, JSON.stringify(parsed))
    expect(hits.some((h) => h.rule === 'metadata-too-long'), '超上限的描述没被报出').toBe(true)
  })

  it('覆写③：**没登记覆写的字段**（name）超 80 ⇒ 照旧被报出（覆写是逐字段的）', () => {
    const raw = readFileSync(join(REPO_ROOT, RES_SEED), 'utf8')
    const parsed = JSON.parse(raw) as { items: Record<string, unknown>[] }
    parsed.items[0] = { ...parsed.items[0], name: 'x'.repeat(100) }
    const hits = scanExternalJson(RES_SEED, JSON.stringify(parsed))
    expect(hits.some((h) => h.rule === 'metadata-too-long'), 'name 超长没被报出').toBe(true)
  })

  it('覆写④：反证 —— **没有覆写**的同一份内容 ⇒ 必须被报出（证明覆写是放行的原因）', () => {
    const raw = readFileSync(join(REPO_ROOT, RES_SEED), 'utf8')
    const parsed = JSON.parse(raw) as { items: Record<string, unknown>[] }
    parsed.items[0] = { ...parsed.items[0], summary: 'x'.repeat(115) }
    const hits = scanExternalJson('probe.json', JSON.stringify(parsed))
    expect(hits.some((h) => h.rule === 'metadata-too-long'), '没覆写的文件没被报出').toBe(true)
  })

  it('变异 ③：数据区塞 HTML 标签 ⇒ 必须报出', () => {
    const hits = scanExternalJson(
      'probe.json',
      JSON.stringify({ items: [{ title: 'Python3 教程', note: '<p>一整段网页正文</p>' }] }),
    )
    expect(hits.some((h) => h.rule === 'html-in-data'), '数据区的 HTML 没被报出').toBe(true)
  })

  it('变异 ④：采集脚本出现正文抽取器 ⇒ 必须报出', () => {
    const hits = scanExternalScript(
      'probe.py',
      ['from bs4 import BeautifulSoup', "soup = BeautifulSoup(html, 'html.parser')"].join('\n'),
    )
    expect(hits.some((h) => h.rule === 'body-scraper'), '正文抽取器痕迹没被报出').toBe(true)
  })

  it('变异 ⑤：清单里出现正文字段名（body / content）⇒ 必须报出', () => {
    const hits = scanExternalJson(
      'probe.json',
      JSON.stringify({ items: [{ title: 'x', body: '某段正文' }] }),
    )
    expect(hits.some((h) => h.rule === 'body-field'), '正文字段名没被报出').toBe(true)
  })

  it('变异 ⑥：清单里出现**未登记字段**（自造键名藏正文）⇒ 必须报出', () => {
    // ⚠️ 这一条堵的是首版扫描器的真实漏洞：键名不叫 body/content 时，
    //   长度与散文规则都可能放过它 ⇒ 键名本身必须闭集。
    const file = 'packages/core/src/db/seeds/lang_topics_python3.json'
    const original = JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as {
      items: Array<Record<string, unknown>>
    }
    const tampered = JSON.parse(JSON.stringify(original)) as {
      items: Array<Record<string, unknown>>
    }
    tampered.items[0]!['main_content'] = '某段正文'
    const hits = scanExternalJson(file, JSON.stringify(tampered))
    expect(
      hits.some((h) => h.rule === 'unknown-field'),
      '未登记字段没被报出（自造键名可以藏正文）',
    ).toBe(true)
  })

  it('变异 ⑦：外部源派生目录里多出一个文件 ⇒ 必须报出（临时目录，不碰真实证据目录）', () => {
    // ⚠️ **绝不在真实证据目录里造人造文件** —— 那里放的东西会被将来的读者当成实测。
    const dir = mkdtempSync(join(tmpdir(), 'ov-m9-scan-'))
    try {
      const probeDir = join(dir, 'M9-probe')
      mkdirSync(probeDir)
      writeFileSync(join(probeDir, 'runoob-python3-inventory.json'), '{}')
      writeFileSync(join(probeDir, 'scraped-body.json'), '{"items":[{"body":"正文"}]}')
      const hits = scanDirectoryClosure(dir, { 'M9-probe': ['runoob-python3-inventory.json'] })
      expect(
        hits.some((h) => h.rule === 'unregistered-file' && h.detail.includes('scraped-body.json')),
        '未登记文件没被报出（正文可以藏在多出来的文件里）',
      ).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('反证：散文阈值低于真实基线时必须报出（证明阈值在做事）', () => {
    // 用真实的说明区最长连续汉字（16）构造：若阈值被调到 16，它就该报
    const sample = '采集方法说明中的连续中文描述'.repeat(1)
    const hits = scanExternalJson('probe.json', JSON.stringify({ _notes: { x: sample } }))
    // 16 字 < 40 ⇒ 当前阈值下不报（这是期望行为）
    expect(hits.some((h) => h.rule === 'prose-run')).toBe(false)
    expect(PROSE_MIN_RUN).toBeGreaterThan(16)
  })
})

// ============================================================================
// DL-06 · 术语挂接不反向写 terms
// ============================================================================
describe('M9 P1.8 · DL-06 挂接不反向写 terms', () => {
  it('① 挂接只写 lang_topic_terms：terms 的内容指纹前后**完全不变**', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_a', '甲')
      insertTerm(h.db, 'trm_b', '乙')
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      const before = termsFingerprint(h.db)
      const rowsBefore = termsRowCount(h.db)
      const res = attachTopicTerms(h.db, topic.id, ['trm_a', 'trm_b'])
      expect(res.attached).toBe(2)
      expect(res.missing).toEqual([])
      expect(listTopicTerms(h.db, topic.id)).toEqual(['trm_a', 'trm_b'])
      // ⚠️ 守卫本体：terms 指纹与行数都没动
      expect(termsChanged(before, termsFingerprint(h.db)), '挂接动作改动了 terms 表').toBe(false)
      expect(termsRowCount(h.db)).toBe(rowsBefore)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('② 幂等：重复挂接同一批术语不增行', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_a', '甲')
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      attachTopicTerms(h.db, topic.id, ['trm_a'])
      const second = attachTopicTerms(h.db, topic.id, ['trm_a'])
      expect(second.attached).toBe(0)
      expect(second.rejected.length).toBeGreaterThan(0)
      expect(listTopicTerms(h.db, topic.id)).toEqual(['trm_a'])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('③ 缺失术语**不建行**、报 missing、terms 行数不变（§3.4 的出路是 M8 回流）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_a', '甲')
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      const before = termsRowCount(h.db)
      const res = attachTopicTerms(h.db, topic.id, ['trm_a', 'trm_不存在'])
      expect(res.attached).toBe(1)
      expect(res.missing).toEqual(['trm_不存在'])
      // ⚠️ 缺失的术语**没有被建出来**
      expect(termsRowCount(h.db)).toBe(before)
      const created = h.db.prepare(`SELECT COUNT(*) AS c FROM terms WHERE id = ?`).get('trm_不存在') as {
        c: number
      }
      expect(created.c).toBe(0)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('④ 每知识点 ≤ 3 条术语（§3.4），超出的被拒且不落库', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      for (const id of ['trm_a', 'trm_b', 'trm_c', 'trm_d']) insertTerm(h.db, id, `术语${id}`)
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      const res = attachTopicTerms(h.db, topic.id, ['trm_a', 'trm_b', 'trm_c', 'trm_d'])
      expect(res.attached).toBe(MAX_TERMS_PER_TOPIC)
      expect(res.rejected.length).toBeGreaterThan(0)
      expect(listTopicTerms(h.db, topic.id).length).toBe(MAX_TERMS_PER_TOPIC)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('⑤ 按自然键挂接（terms.id 是 newId 生成的，写死 id 就无法复跑）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_x', '闭包')
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      const res = attachTopicTermByNaturalKey(h.db, topic.id, '闭包')
      expect(res.attached).toBe(1)
      expect(listTopicTerms(h.db, topic.id)).toEqual(['trm_x'])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ①：注入一个「也写 terms」的挂接 ⇒ 守卫必须报出（terms 指纹变了）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_a', '甲')
      const topic = h.db.prepare(`SELECT id FROM lang_topics WHERE slug = ?`).get('python3-function') as {
        id: number
      }
      const before = termsFingerprint(h.db)
      // 注入：**违规的**挂接 —— 顺带把新术语写进 terms 表
      attachTopicTerms(h.db, topic.id, ['trm_a'])
      h.db
        .prepare(
          `INSERT INTO terms (id, zh, en, aliases, definition, example, created_at, updated_at)
           VALUES (?, ?, ?, '[]', ?, '', '2026-10-20', '2026-10-20')`,
        )
        .run('trm_偷建', '偷建的术语', 'en-steal', '不该出现的定义')
      // 闸红：terms 指纹变了
      expect(termsChanged(before, termsFingerprint(h.db)), 'terms 被改了却没被检出').toBe(true)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ②：改已有术语的定义（行数不变）⇒ 指纹守卫仍须报出', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      insertTerm(h.db, 'trm_a', '甲')
      const before = termsFingerprint(h.db)
      const rowsBefore = termsRowCount(h.db)
      h.db.prepare(`UPDATE terms SET definition = ? WHERE id = ?`).run('被改过的定义', 'trm_a')
      expect(termsRowCount(h.db)).toBe(rowsBefore)
      expect(termsChanged(before, termsFingerprint(h.db)), '行数没变但内容变了却没被检出').toBe(true)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})

// ============================================================================
// DL-14 · Python/Go 可筛选，且两门的数据都在
// ============================================================================
describe('M9 P1.8 · DL-14 两门数据都在且可筛选', () => {
  it('① 筛选器可选值来自库：语言两门都在，站 0..7，kind 两值', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const opts = topicFilterOptions(h.db)
      expect(opts.langs).toEqual(['go', 'python'])
      expect(opts.kinds.sort()).toEqual(['language', 'library'])
      // 站号连续（0..7），Go 侧 6/7 为空是事实不是缺口 ⇒ 取并集
      expect(opts.stages).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('② 两门的数据都在（实测：Python 85 ＋ Go 39 = 124）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const cov = langCoverage(h.db)
      expect(cov.map((c) => c.lang)).toEqual(['go', 'python'])
      const py = cov.find((c) => c.lang === 'python')!
      const go = cov.find((c) => c.lang === 'go')!
      expect(py.total).toBe(EXPECTED_PY_TOTAL)
      expect(go.total).toBe(EXPECTED_GO_TOTAL)
      expect(py.total + go.total).toBe(EXPECTED_TOTAL)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('③ 筛选器各组合与直接 SQL 对账（筛得对，不只是筛得出）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      const direct = (sql: string, ...p: Array<string | number>) =>
        (h.db.prepare(sql).get(...p) as { c: number }).c
      const cases: Array<[{ lang?: string; stage?: number; kind?: string }, string]> = [
        [{}, `SELECT COUNT(*) AS c FROM lang_topics`],
        [{ lang: 'python' }, `SELECT COUNT(*) AS c FROM lang_topics WHERE lang = 'python'`],
        [{ lang: 'go' }, `SELECT COUNT(*) AS c FROM lang_topics WHERE lang = 'go'`],
        [
          { lang: 'python', kind: 'language' },
          `SELECT COUNT(*) AS c FROM lang_topics WHERE lang = 'python' AND kind = 'language'`,
        ],
        [
          { lang: 'go', kind: 'library' },
          `SELECT COUNT(*) AS c FROM lang_topics WHERE lang = 'go' AND kind = 'library'`,
        ],
        [
          { stage: 0 },
          `SELECT COUNT(*) AS c FROM lang_topics WHERE stage_id = 0 AND kind = 'language'`,
        ],
        [
          { stage: 2, kind: 'language' },
          `SELECT COUNT(*) AS c FROM lang_topics WHERE stage_id = 2 AND kind = 'language'`,
        ],
        [
          { lang: 'python', stage: 0 },
          `SELECT COUNT(*) AS c FROM lang_topics WHERE lang = 'python' AND stage_id = 0 AND kind = 'language'`,
        ],
      ]
      for (const [filter, sql] of cases) {
        expect(filterTopics(h.db, filter).length, `筛选 ${JSON.stringify(filter)} 与直接 SQL 不一致`).toBe(
          direct(sql),
        )
      }
      // ⚠️ 站过滤**蕴含** kind='language'：否则站 0 会混进 46 条库级条目（DL-12 牙 ①）
      const stage0 = filterTopics(h.db, { stage: 0 })
      expect(stage0.length).toBe(17)
      expect(stage0.every((t) => t.kind === 'language')).toBe(true)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ①：把 Go 的行删光 ⇒ 筛选器选项只剩一门 ⇒ 闸红', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      expect(topicFilterOptions(h.db).langs).toEqual(['go', 'python'])
      h.db.prepare(`DELETE FROM lang_topics WHERE lang = 'go'`).run()
      const opts = topicFilterOptions(h.db)
      expect(opts.langs, 'Go 数据删光了但筛选器还提供 Go').not.toContain('go')
      expect(opts.langs.length, '筛选器只给一门了').toBe(1)
      const cov = langCoverage(h.db)
      expect(cov.find((c) => c.lang === 'go'), 'Go 的覆盖量还在').toBeUndefined()
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })

  it('变异 ②：某门少一行 ⇒ 覆盖量闸红（两门都得在，缺一不行）', () => {
    const h = newDb()
    try {
      seedLangTopics(h.db, SEEDS_DIR)
      h.db.prepare(`DELETE FROM lang_topics WHERE lang = 'go' AND slug = ?`).run('go-quiz')
      const cov = langCoverage(h.db)
      const go = cov.find((c) => c.lang === 'go')!
      expect(go.total, 'Go 少了一行却没被检出').toBe(EXPECTED_GO_TOTAL - 1)
      const total = cov.reduce((a, c) => a + c.total, 0)
      expect(total).toBe(EXPECTED_TOTAL - 1)
      h.close()
    } catch (err) {
      try {
        h.close()
      } catch {
        /* ignore */
      }
      throw err
    }
  })
})
