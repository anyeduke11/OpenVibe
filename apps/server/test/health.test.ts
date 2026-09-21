import { expect, it } from 'vitest'
import { buildApp } from '../src/app'

// IT-EXAMPLE-01 · 集成层示例：app.inject 模式（design §13 集成行）。
// T3 起全部 API 路由的集成测试沿用本模式（app.inject + 临时 DB）。
it('IT-EXAMPLE-01: GET /api/health 返回 200 与版本信息', async () => {
  const app = await buildApp({ appVersion: '0.1.0-test' })
  const res = await app.inject({ method: 'GET', url: '/api/health' })

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toContain('application/json')

  const body = res.json()
  expect(body.status).toBe('ok')
  expect(body.app).toBe('openvibe')
  expect(body.version).toBe('0.1.0-test')
  expect(body.schemaVersion).toBe(1)
})
