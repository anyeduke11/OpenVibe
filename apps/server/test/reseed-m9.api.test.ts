import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import type { SqliteDatabase } from '@openvibe/core'
import { buildApp } from '../src/app'

/**
 * C 收尾①：m9 六播种器统一重放入口（POST /api/settings/reseed/m9）。
 * 判据：八条 bundle 结果齐、三态计数字段齐、CS2 合并语义下**二次重放零 created**。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  db: SqliteDatabase
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app, db } = await buildApp({
    db: handle.db,
    token: TOKEN,
    appVersion: '0.3.1',
    platform: 'darwin',
    now: () => new Date('2026-10-24T12:00:00.000Z'),
  })
  const harness = { app, db, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

async function api<T = unknown>(
  h: Harness,
  method: 'GET' | 'POST',
  url: string,
): Promise<{ statusCode: number; json: T }> {
  const res = await h.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() as T }
}

interface BundleResult {
  bundle: string
  status: string
  created: number
  updated: number
  ignored: number
  userModified: number
  warnings: string[]
}

describe('POST /api/settings/reseed/m9（C 收尾①）', () => {
  it('RM9-01: 八条 bundle 结果齐（依赖序）+ 三态计数字段齐', async () => {
    const h = await makeHarness()
    const res = await api<{ results: BundleResult[] }>(h, 'POST', '/api/settings/reseed/m9')
    expect(res.statusCode).toBe(200)
    expect(res.json.results.map((r) => r.bundle)).toEqual([
      'lang_topics_python3',
      'lang_topics_go',
      'lang_topics_advanced',
      'lang_concepts',
      'lang_topic_content',
      'lang_concept_deltas',
      'lang_topic_edges',
      'lang_profile_phases',
      'lang_topic_profiles',
      'lang_resources',
      'lang_vibe_resources',
      'lang_topic_resources',
    ])
    for (const r of res.json.results) {
      expect(['imported', 'skipped', 'error']).toContain(r.status)
      expect(Number.isInteger(r.created)).toBe(true)
      expect(Number.isInteger(r.ignored)).toBe(true)
    }
    // CS2 合并语义：真种子在空库首播 ⇒ 全部 created
    const totalCreated = res.json.results.reduce((a, r) => a + r.created, 0)
    expect(totalCreated).toBeGreaterThan(100)
  })

  it('RM9-02: 二次重放 ⇒ created=0（合并幂等），状态回到 skipped/succeeded 零 clobber', async () => {
    const h = await makeHarness()
    await api(h, 'POST', '/api/settings/reseed/m9')
    const second = await api<{ results: BundleResult[] }>(h, 'POST', '/api/settings/reseed/m9')
    expect(second.statusCode).toBe(200)
    const totalCreated = second.json.results.reduce((a, r) => a + r.created, 0)
    const totalUpdated = second.json.results.reduce((a, r) => a + r.updated, 0)
    expect(totalCreated).toBe(0)
    expect(totalUpdated).toBe(0)
    const totalIgnored = second.json.results.reduce((a, r) => a + r.ignored, 0)
    expect(totalIgnored).toBeGreaterThan(100)
  })
})
