import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import { mergeSeedRow, seedRowHash, type SeedMergeSpec } from './seed-merge'
import { seedLangTopics } from './m9-p1-seed-lang-topics'

/**
 * v0.2.3 批次 C CS2（spec `v023-c-consolidation.md` FR-2）验收：
 * ① 改一条 m9 种子内容 ⇒ 已装库 reseed 后生效（updated）；
 * ② 用户改过该行 ⇒ reseed 永不覆盖（user-modified）；
 * ③ 老行（0019 前，seed_hash 为 NULL）按用户态对待，零 clobber；
 * 另附 mergeSeedRow 五动作矩阵的单元腿。
 */

const SPEC: SeedMergeSpec = {
  table: 'lang_topics',
  keyColumns: ['lang', 'slug'],
  contentColumns: ['title', 'summary', 'stage_id', 'ref_url', 'ref_title', 'source_kind', 'kind', 'content_level'],
}

const baseRecord = (over: Record<string, string | number | null> = {}): Record<string, string | number | null> => ({
  lang: 'python',
  slug: 'cs2-fixture',
  title: '原标题',
  summary: '',
  stage_id: 3,
  ref_url: 'https://example.com/a',
  ref_title: 'A',
  source_kind: 'owner_guide',
  source_checked_at: '2026-10-24',
  kind: 'language',
  content_level: 'point',
  ...over,
})

describe('mergeSeedRow 五动作矩阵', () => {
  it('created → unchanged：首插后原样重放不动', () => {
    const h = newDb()
    try {
      const rec = baseRecord()
      expect(mergeSeedRow(h.db, SPEC, rec)).toBe('created')
      expect(mergeSeedRow(h.db, SPEC, rec)).toBe('unchanged')
    } finally {
      h.close()
    }
  })

  it('updated：内容变化且用户未手改 ⇒ 覆盖并推进哈希', () => {
    const h = newDb()
    try {
      mergeSeedRow(h.db, SPEC, baseRecord())
      const action = mergeSeedRow(h.db, SPEC, baseRecord({ title: '新标题' }))
      expect(action).toBe('updated')
      const row = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='cs2-fixture'`).get() as { title: string }
      expect(row.title).toBe('新标题')
    } finally {
      h.close()
    }
  })

  it('user-modified：用户手改过 ⇒ 永不覆盖', () => {
    const h = newDb()
    try {
      mergeSeedRow(h.db, SPEC, baseRecord())
      h.db.prepare(`UPDATE lang_topics SET title='用户的手改' WHERE slug='cs2-fixture'`).run()
      const action = mergeSeedRow(h.db, SPEC, baseRecord({ title: '种子想覆盖的新标题' }))
      expect(action).toBe('user-modified')
      const row = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='cs2-fixture'`).get() as { title: string }
      expect(row.title).toBe('用户的手改')
    } finally {
      h.close()
    }
  })

  it('列序无关：record 键的插入顺序不影响哈希与判定（风险⑤的防线用例）', () => {
    const h = newDb()
    try {
      const first = baseRecord()
      expect(mergeSeedRow(h.db, SPEC, first)).toBe('created')
      // 同值但键序整体倒置的新 record——哈希必须相同（pickRecord 按 contentColumns 重排）
      const shuffled: Record<string, string | number | null> = {}
      for (const k of Object.keys(first).reverse()) {
        shuffled[k] = (first as Record<string, string | number | null>)[k] ?? null
      }
      expect(mergeSeedRow(h.db, SPEC, shuffled)).toBe('unchanged')
    } finally {
      h.close()
    }
  })

  it('legacy：0019 前的老行（seed_hash 为 NULL）——内容相同才补登，不同则按用户态跳过', () => {
    const h = newDb()
    try {
      // 老行：直接 INSERT，不带 seed_hash（模拟 0019 前的库）
      h.db
        .prepare(
          `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, ref_url, ref_title, source_kind, source_checked_at, kind, content_level)
           VALUES ('python','legacy-a','老标题','','3','https://example.com/l','L','owner_guide','2026-10-01','language','point')`,
        )
        .run()
      // 与老行逐字相同的新种子 ⇒ legacy-adopted（补登哈希，不改内容）
      const rec = baseRecord({ slug: 'legacy-a', title: '老标题', ref_url: 'https://example.com/l', ref_title: 'L', source_checked_at: '2026-10-01' })
      expect(mergeSeedRow(h.db, SPEC, rec)).toBe('legacy-adopted')
      const stored = h.db.prepare(`SELECT seed_hash FROM lang_topics WHERE slug='legacy-a'`).get() as { seed_hash: string | null }
      expect(stored.seed_hash).toBe(seedRowHash(SPEC.contentColumns.reduce<Record<string, unknown>>((acc, c) => ((acc[c] = (rec as Record<string, unknown>)[c] ?? null), acc), {})))

      // 收编后的行已被跟踪：种子再修订 ⇒ 正常 updated（与播种器种下的行同权）
      const revised = mergeSeedRow(h.db, SPEC, baseRecord({ slug: 'legacy-a', title: '种子想改的标题' }))
      expect(revised).toBe('updated')
      const row = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='legacy-a'`).get() as { title: string }
      expect(row.title).toBe('种子想改的标题')

      // 另一条从未匹配过种子的老行 ⇒ user-modified，老内容原样保留
      h.db
        .prepare(
          `INSERT INTO lang_topics (lang, slug, title, summary, stage_id, ref_url, ref_title, source_kind, source_checked_at, kind, content_level)
           VALUES ('python','legacy-b','用户的手笔','','3','https://example.com/b','B','owner_guide','2026-10-01','language','point')`,
        )
        .run()
      const conflict = mergeSeedRow(h.db, SPEC, baseRecord({ slug: 'legacy-b', title: '种子想改的标题' }))
      expect(conflict).toBe('user-modified')
      const kept = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='legacy-b'`).get() as { title: string }
      expect(kept.title).toBe('用户的手笔')
    } finally {
      h.close()
    }
  })
})

describe('CS2 验收：lang_topics 播种器端到端（真种子文件 + reseed）', () => {
  const SEED_FILE = 'lang_topics_python3.json'

  it('CS2-01: 改一条种子内容 ⇒ 已装库 reseed 后生效（updated 计数可见）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-cs2-'))
    const h = newDb()
    try {
      const raw = JSON.stringify({
        schemaVersion: 1,
        collected_at: '2026-10-24',
        items: [
          { lang: 'python', slug: 'cs2-e2e', title: '原题', summary: '', stage_id: 2, ref_url: 'https://e.com/1', ref_title: '1', source_kind: 'owner_guide', source_checked_at: '2026-10-24', kind: 'language' },
        ],
      })
      writeFileSync(join(dir, SEED_FILE), raw, 'utf8')
      const first = seedLangTopics(h.db, dir)
      expect(first[0]?.status).toBe('imported')

      // 修订种子：同 slug 改标题
      const modified = JSON.stringify({
        schemaVersion: 1,
        collected_at: '2026-10-24',
        items: [
          { lang: 'python', slug: 'cs2-e2e', title: '修订后的题', summary: '', stage_id: 2, ref_url: 'https://e.com/1', ref_title: '1', source_kind: 'owner_guide', source_checked_at: '2026-10-24', kind: 'language' },
        ],
      })
      writeFileSync(join(dir, SEED_FILE), modified, 'utf8')
      const second = seedLangTopics(h.db, dir)
      expect(second[0]?.updated).toBe(1)
      expect(second[0]?.status).toBe('imported')
      const row = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='cs2-e2e'`).get() as { title: string }
      expect(row.title).toBe('修订后的题')
    } finally {
      h.close()
    }
  })

  it('CS2-02: 用户手改该行 ⇒ reseed 跳过且内容保留（userModified 计数可见）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-cs2-'))
    const h = newDb()
    try {
      const items = { schemaVersion: 1, collected_at: '2026-10-24', items: [
        { lang: 'python', slug: 'cs2-e2e', title: '原题', summary: '', stage_id: 2, ref_url: 'https://e.com/1', ref_title: '1', source_kind: 'owner_guide', source_checked_at: '2026-10-24', kind: 'language' },
      ] }
      writeFileSync(join(dir, SEED_FILE), JSON.stringify(items), 'utf8')
      seedLangTopics(h.db, dir)
      h.db.prepare(`UPDATE lang_topics SET title='我的手改' WHERE slug='cs2-e2e'`).run()

      // 种子同内容再 reseed：用户态行不被覆盖
      const again = seedLangTopics(h.db, dir)
      expect(again[0]?.userModified).toBe(1)
      const row = h.db.prepare(`SELECT title FROM lang_topics WHERE slug='cs2-e2e'`).get() as { title: string }
      expect(row.title).toBe('我的手改')
    } finally {
      h.close()
    }
  })
})
