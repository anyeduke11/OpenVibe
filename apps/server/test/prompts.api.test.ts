import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { PacksRepo, PromptsRepo } from '@openvibe/core'
import { buildApp } from '../src/app'

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
    void h?.app.close()
    h?.handle.close()
  }
})

/** CLI 通道注入（不带 Origin → Bearer）；method 用窄字面量避免 fastify/light-my-request 的 HTTPMethods 版本差 */
function injectApi(
  h: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}` } })
}

describe('T3d · m1 §7 验收映射（API 行为层）', () => {
  it('IT-API-PROMPT-01（§7.1）: 含 {{language}}/{{task}} 创建 → variables 恰两项 + warnings 语义', async () => {
    const h = await makeHarness()
    const res = await injectApi(h, 'POST', '/api/prompts', {
      title: '代码审查请求',
      content: '审查 {{language}} 代码，关注：{{task}}',
      useAs: 'reference',
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.variables).toEqual(['language', 'task'])
    expect(body.warnings).toEqual([])

    const rule = await injectApi(h, 'POST', '/api/prompts', {
      title: '规则类',
      content: '始终输出 {{language}}',
      useAs: 'rule',
    })
    expect(rule.json().warnings.join('')).toContain('不会自动填充')
  })

  it('IT-API-PROMPT-02（§7.2）: 保存 3 次 → v1/2/3；回滚 v1 → v4 且内容==v1', async () => {
    const h = await makeHarness()
    const created = await injectApi(h, 'POST', '/api/prompts', { title: '版本流', content: 'c1' })
    const id = created.json().id as string

    await injectApi(h, 'PATCH', `/api/prompts/${id}`, { content: 'c2' })
    await injectApi(h, 'PATCH', `/api/prompts/${id}`, { content: 'c3' })

    const versions = await injectApi(h, 'GET', `/api/prompts/${id}/versions`)
    expect(versions.json().map((v: { versionNo: number }) => v.versionNo)).toEqual([1, 2, 3])

    const restored = await injectApi(h, 'POST', `/api/prompts/${id}/versions/1/restore`)
    expect(restored.statusCode).toBe(200)
    expect(restored.json().newVersionNo).toBe(4)
    expect(restored.json().prompt.content).toBe('c1')

    const after = await injectApi(h, 'GET', `/api/prompts/${id}/versions`)
    const list = after.json() as { versionNo: number; changelog: string }[]
    expect(list).toHaveLength(4)
    expect(list[3]?.changelog).toBe('回滚自 v1')

    // 浏览器侧契约：restore 无请求体，客户端若仍带 content-type 会被 400 拒绝
    // （T3f 实测踩过，web client 已改为「有 body 才设 header」）
    const emptyWithCt = await h.app.inject({
      method: 'POST',
      url: `/api/prompts/${id}/versions/1/restore`,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    })
    expect(emptyWithCt.statusCode).toBe(400)
  })

  it('IT-API-PROMPT-03（§7.4）: 中文子串「规则漂移」与英文 memo 前缀命中', async () => {
    const h = await makeHarness()
    const prompts = new PromptsRepo(h.handle.db)
    prompts.create({
      title: '反漂移规则',
      content: '检测 {{x}}，防止 规则漂移 累积',
      tags: ['质量工程'],
    })
    prompts.create({ title: 'memory dump 规范', content: 'write a memo about the session' })

    const zh = await injectApi(h, 'GET', `/api/prompts?q=${encodeURIComponent('漂移')}`)
    expect(zh.json().items.map((p: { title: string }) => p.title)).toContain('反漂移规则')

    const zhLong = await injectApi(h, 'GET', `/api/prompts?q=${encodeURIComponent('规则漂移')}`)
    expect(zhLong.json().total).toBe(1)

    const en = await injectApi(h, 'GET', '/api/prompts?q=memo')
    expect(en.json().items.map((p: { title: string }) => p.title)).toContain('memory dump 规范')
  })

  it('IT-IMPORT-01（§7.5）: 导出 10 → 清库回导 → 再导出一致（除 exportedAt/id，见 DEV-0013）', async () => {
    const h1 = await makeHarness()
    for (let i = 0; i < 10; i++) {
      await injectApi(h1, 'POST', '/api/prompts', {
        title: `词条 ${String(i)}`,
        content: `内容 ${String(i)} 含 {{var}}`,
        tags: ['精选'],
        folderPath: '/精选',
        useAs: i % 2 ? 'rule' : 'reference',
      })
    }
    const exp1 = await injectApi(h1, 'GET', '/api/prompts/export?format=json')
    expect(exp1.statusCode).toBe(200)
    expect(exp1.headers['content-disposition']).toContain('prompts-export.json')
    const file1 = JSON.parse(exp1.body)
    expect(file1.items).toHaveLength(10)

    const h2 = await makeHarness()
    const imp = await injectApi(h2, 'POST', '/api/prompts/import', { items: file1.items })
    expect(imp.json().created).toHaveLength(10)
    expect(imp.json().skipped).toHaveLength(0)

    const exp2 = await injectApi(h2, 'GET', '/api/prompts/export?format=json')
    const file2 = JSON.parse(exp2.body)
    const strip = (items: Record<string, unknown>[]) =>
      JSON.stringify(items.map(({ id: _id, ...rest }) => rest))
    expect(strip(file2.items)).toBe(strip(file1.items))

    // 二次导入 → 全部按 title+contentHash 去重跳过
    const again = await injectApi(h2, 'POST', '/api/prompts/import', { items: file1.items })
    expect(again.json().created).toHaveLength(0)
    expect(again.json().skipped).toHaveLength(10)
  })

  it('IT-IMPORT-02（§7.6）: .cursorrules 文件导入 → rule + cursor 标记', async () => {
    const h = await makeHarness()
    const res = await injectApi(h, 'POST', '/api/prompts/import', {
      files: [{ filename: '.cursorrules', content: 'always answer in zh-CN' }],
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().created).toHaveLength(1)

    const list = await injectApi(h, 'GET', '/api/prompts')
    const [prompt] = list.json().items
    expect(prompt.useAs).toBe('rule')
    expect(prompt.platformMarks).toContain('cursor')
    expect(prompt.title).toBe('.cursorrules')
  })

  it('IT-DELETE-01（§7.7）: 删带 5 版本的提示词 → 两表零残留；被包引用列出包名', async () => {
    const h = await makeHarness()
    const created = await injectApi(h, 'POST', '/api/prompts', { title: '将被删除', content: 'v1' })
    const id = created.json().id as string
    for (const c of ['v2', 'v3', 'v4', 'v5']) {
      await injectApi(h, 'PATCH', `/api/prompts/${id}`, { content: c })
    }
    expect((await injectApi(h, 'GET', `/api/prompts/${id}/versions`)).json()).toHaveLength(5)

    new PacksRepo(h.handle.db).create({
      name: 'demo-pack',
      description: '',
      selection: {
        promptIds: [id],
        termIds: [],
        skillIds: [],
        playbookIds: [],
        flowTemplateId: null,
      },
      targets: ['claude-code'],
    })

    const del = await injectApi(h, 'DELETE', `/api/prompts/${id}`)
    expect(del.statusCode).toBe(204)
    expect(del.headers['x-referenced-packs']).toBe('demo-pack')

    const counts = h.handle.db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM prompts WHERE id=?) AS p, (SELECT COUNT(*) FROM prompt_versions WHERE prompt_id=?) AS v',
      )
      .get(id, id) as { p: number; v: number }
    expect(counts).toEqual({ p: 0, v: 0 })
  })

  it('IT-ERR-01（§7.8）: 空 title / 超 512KB / 错 id → 结构化 {code,message}', async () => {
    const h = await makeHarness()

    const emptyTitle = await injectApi(h, 'POST', '/api/prompts', { title: '', content: 'x' })
    expect(emptyTitle.statusCode).toBe(422)
    expect(emptyTitle.json().code).toBe('VALIDATION_ERROR')
    expect(emptyTitle.json().message).toBeTruthy()

    const big = await injectApi(h, 'POST', '/api/prompts', {
      title: '太大',
      content: 'x'.repeat(600 * 1024),
    })
    expect(big.statusCode).toBe(422)
    expect(big.json().code).toBe('VALIDATION_ERROR')

    const missing = await injectApi(h, 'GET', '/api/prompts/prm_nonexistent')
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('NOT_FOUND')

    const badRestore = await injectApi(h, 'POST', '/api/prompts/prm_nonexistent/versions/1/restore')
    expect(badRestore.statusCode).toBe(404)

    const badRoute = await injectApi(h, 'GET', '/api/nope')
    expect(badRoute.statusCode).toBe(404)
    expect(badRoute.json().code).toBe('NOT_FOUND')
  })

  it('IT-AUTH-01（design §11）: Origin 白名单 / Bearer 双通道 / health 豁免 / Host 校验', async () => {
    const h = await makeHarness()

    const browser = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(browser.statusCode).toBe(200)

    const evilOrigin = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { origin: 'https://evil.example.com' },
    })
    expect(evilOrigin.statusCode).toBe(403)
    expect(evilOrigin.json().code).toBe('FORBIDDEN_ORIGIN')

    const noAuth = await h.app.inject({ method: 'GET', url: '/api/prompts' })
    expect(noAuth.statusCode).toBe(401)
    expect(noAuth.json().code).toBe('UNAUTHORIZED')

    const wrongToken = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { authorization: 'Bearer nope' },
    })
    expect(wrongToken.statusCode).toBe(401)

    const health = await h.app.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode).toBe(200)

    const evilHost = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { host: 'evil.example.com', origin: 'http://localhost:5173' },
    })
    expect(evilHost.statusCode).toBe(403)
    expect(evilHost.json().code).toBe('FORBIDDEN_ORIGIN')

    // C-10：下载链接/地址栏导航无 Origin，靠 Sec-Fetch-Site 放行
    const download = await h.app.inject({
      method: 'GET',
      url: '/api/prompts/export?format=json',
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    expect(download.statusCode).toBe(200)
    const addressBar = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { 'sec-fetch-site': 'none' },
    })
    expect(addressBar.statusCode).toBe(200)
    // 跨站页面发起（带不上本地 Origin 时也带不上 same-origin）→ 仍 401
    const crossSite = await h.app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.statusCode).toBe(401)
  })

  it('IT-VERSION-02-API（§7.3）: 只改 tags 不产生版本', async () => {
    const h = await makeHarness()
    const created = await injectApi(h, 'POST', '/api/prompts', { title: '元数据流', content: 'c1' })
    const id = created.json().id as string

    const patched = await injectApi(h, 'PATCH', `/api/prompts/${id}`, { tags: ['提示工程'] })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().versionCreated).toBeNull()

    const versions = await injectApi(h, 'GET', `/api/prompts/${id}/versions`)
    expect(versions.json()).toHaveLength(1)
  })
})
