import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { newDb } from '../test-support/new-db'
import { seedLangTopics } from './m9-p1-seed-lang-topics'
import { seedConceptContent } from './m9-p1-5-concept-content'
import { seedConceptDeltas } from './m9-p1-6-concept-deltas'
import { seedTopicEdges } from './m9-p1-7-topic-stages'
import { seedProfilePhases, seedTopicProfiles } from './m9-p1d-seed-profiles'
import { seedLangResourceLayer } from './m9-p1b-seed-resources'

/**
 * 播种性能护栏（批次 C 收尾③）：mergeSeedRow 是**每行 SELECT + 判定 + 写**的
 * 行级协议，种子规模增长会让启动/重放耗时线性涨——用「真种子目录、全链重放、
 * 宽松天花板」抓**数量级回归**（天花板 10s 是数量级闸，不是性能承诺；
 * 精确耗时按「只报数」随 CI 日志走，不做环境敏感的紧断言）。
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SEEDS_DIR = join(HERE, '..', '..', '..', 'content', 'seed')

describe('播种性能护栏（数量级闸）', () => {
  it('m9 全链重放（合并语义）天花板 10s；各段耗时按只报数输出', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-seedperf-'))
    mkdirSync(dir, { recursive: true })
    // 真种子目录的四个 json 复制进临时目录（与运行时同源，避免合成数据自洽自欺）
    for (const f of [
      'lang_topics_python3.json',
      'lang_topics_go.json',
      'lang_topics_advanced.json',
      'lang_concepts.json',
      'lang_topic_content.json',
      'lang_concept_deltas.json',
      'lang_topic_edges.json',
      'lang_resources.json',
      'lang_vibe_resources.json',
      'lang_topic_resources.json',
    ]) {
      try {
        writeFileSync(join(dir, f), readSeedFile(f), 'utf8')
      } catch {
        /* 不存在的种子文件跳过（段内自会 error 记账） */
      }
    }
    const h = newDb()
    try {
      const stages: [string, () => unknown][] = [
        ['topics', () => seedLangTopics(h.db, dir)],
        ['concepts/content', () => seedConceptContent(h.db, dir)],
        ['deltas', () => seedConceptDeltas(h.db, dir)],
        ['edges', () => seedTopicEdges(h.db, dir)],
        ['profile-phases', () => seedProfilePhases(h.db, dir)],
        ['topic-profiles', () => seedTopicProfiles(h.db)],
        ['resources', () => seedLangResourceLayer(h.db, dir)],
      ]
      let total = 0
      for (const [name, run] of stages) {
        const t0 = Date.now()
        run()
        const ms = Date.now() - t0
        total += ms
        console.log(`seed-perf · ${name}: ${String(ms)}ms`)
      }
      console.log(`seed-perf · 全链合计: ${String(total)}ms`)
      expect(total).toBeLessThan(10_000)
    } finally {
      h.close()
    }
  })
})

function readSeedFile(file: string): string {
  return readFileSync(join(SEEDS_DIR, file), 'utf8')
}
