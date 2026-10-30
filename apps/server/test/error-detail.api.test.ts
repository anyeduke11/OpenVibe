import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { AppError } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * **诊断原文通道（detail）的 HTTP 落地**。
 *
 * ## 为什么有这一支
 *
 * detail 通道要穿过**三道门**才到界面：
 * ① server 抛出点把它放进 `AppError.detail`；
 * ② server 的错误处理把它放进响应体的 `detail` 字段；
 * ③ web 的 `api/client.ts` 把它读进 `ApiError.detail`。
 *
 * 前面两支各自钉了 ① 与 ③，**中间那道门（②）没人钉**——响应体漏掉
 * `detail` 字段时，界面照样是中文的（看不出坏），但排障依据在半路丢了。
 * 这一支钉住 ②。
 *
 * ## 钉的是什么意图
 *
 * - 错误体里有 detail ⇒ 原样透出（不被改写、不被吞掉）；
 * - 错误体里没 detail ⇒ **不产生该字段**（无诊断信息不必多写一个字段，
 *   与 `summary.error.detail` 同一纪律）；
 * - `detail` 与 `details` 是两件事：前者是给人看的原文，后者是给程序看的结构化数据。
 */

const TOKEN = 'test-token'

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    if (h === undefined) continue
    void h.app.close()
    h.handle.close()
  }
})

describe('错误体的诊断原文通道（detail）', () => {
  it('AppError 带 detail ⇒ 响应体原样带出 detail 字段', async () => {
    const { app } = await makeHarness()
    app.get('/api/__probe/detail', async () => {
      throw new AppError(
        'REMOTE_UNREACHABLE',
        '请求远端失败: api.github.com',
        undefined,
        'getaddrinfo ENOTFOUND api.github.com',
      )
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/__probe/detail',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(502)
    const body = res.json() as { code: string; message: string; detail?: string }
    expect(body.code).toBe('REMOTE_UNREACHABLE')
    // message 是中文人话
    expect(body.message).toBe('请求远端失败: api.github.com')
    // detail 是英文诊断原文，原样带出
    expect(body.detail).toBe('getaddrinfo ENOTFOUND api.github.com')
  })

  it('AppError 没有 detail ⇒ 响应体不产生该字段（无噪声字段）', async () => {
    const { app } = await makeHarness()
    app.get('/api/__probe/nodetail', async () => {
      throw new AppError('NOT_FOUND', '项目不存在: p1')
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/__probe/nodetail',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    const body = res.json() as Record<string, unknown>
    expect('detail' in body).toBe(false)
  })

  it('detail 与 details 各归各位（一个是人看的原文，一个是给程序的数据）', async () => {
    const { app } = await makeHarness()
    app.get('/api/__probe/both', async () => {
      throw new AppError(
        'VALIDATION_ERROR',
        '请求参数校验失败',
        { fieldErrors: { name: ['必填'] } },
        'Invalid string',
      )
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/__probe/both',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    const body = res.json() as {
      message: string
      details?: { fieldErrors: Record<string, string[]> }
      detail?: string
    }
    expect(body.message).toBe('请求参数校验失败')
    expect(body.details?.fieldErrors.name).toEqual(['必填'])
    expect(body.detail).toBe('Invalid string')
  })
})
