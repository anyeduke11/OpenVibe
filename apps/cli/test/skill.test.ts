import { describe, expect, it } from 'vitest'
import { skillGetAction, SkillGetError } from '../src/commands/skill'
import type { ApiClient } from '../src/client'

/**
 * `openvibe skill get <name>` 的行为测试（2026-10-30）。
 *
 * 钉的是三态分流与两处易错：
 *  - **精确匹配**：服务端 `q` 是子串匹配 ⇒ "pdf" 会命中 "pdf-tool" ⇒ 客户端必须再精确一次；
 *  - **三态**：本机有目录 ⇒ 不取；只有库副本 ⇒ 报库内位置；远程且本机无目录 ⇒ 调下载；
 *  - **零下载的两态不能误发下载请求**。
 */

interface FakeCall {
  method: string
  path: string
  body: unknown
}

function fakeClient(
  items: {
    id: string
    name: string
    skillDir: string | null
    libraryDir: string | null
    remoteRef: string | null
  }[],
  download?: { targetDir: string; fileCount: number },
): { client: ApiClient; calls: FakeCall[] } {
  const calls: FakeCall[] = []
  const client: ApiClient = {
    serverUrl: 'http://127.0.0.1:8787',
    async getJson<T>(path: string): Promise<T> {
      calls.push({ method: 'GET', path, body: undefined })
      const q = new URL(path, 'http://x').searchParams.get('q') ?? ''
      const matched = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
      return { items: matched } as T
    },
    async postJson<T>(path: string, body: unknown): Promise<T> {
      calls.push({ method: 'POST', path, body })
      return download as T
    },
  }
  return { client, calls }
}

describe('openvibe skill get（从 OpenVibe 取回指定 skill）', () => {
  it('本机已有目录 ⇒ 不发下载请求，只报路径', async () => {
    const { client, calls } = fakeClient([
      {
        id: 's1',
        name: 'pdf',
        skillDir: '/home/u/.claude/skills/pdf',
        libraryDir: null,
        remoteRef: null,
      },
    ])
    const r = await skillGetAction({ name: 'pdf' }, { client })
    expect(r.downloaded).toBe(false)
    expect(r.path).toBe('/home/u/.claude/skills/pdf')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('只有库内副本 ⇒ 报库内位置，不发下载请求', async () => {
    const { client, calls } = fakeClient([
      {
        id: 's1',
        name: 'pdf',
        skillDir: null,
        libraryDir: '/home/u/.openvibe/skills/pdf',
        remoteRef: null,
      },
    ])
    const r = await skillGetAction({ name: 'pdf' }, { client })
    expect(r.downloaded).toBe(false)
    expect(r.path).toBe('/home/u/.openvibe/skills/pdf')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('远程条目且本机无目录 ⇒ 调下载端点并回报落点', async () => {
    const { client, calls } = fakeClient(
      [
        {
          id: 's1',
          name: 'pdf',
          skillDir: null,
          libraryDir: null,
          remoteRef: 'github:owner/repo@main',
        },
      ],
      { targetDir: '/home/u/.openvibe/skills/pdf', fileCount: 3 },
    )
    const r = await skillGetAction({ name: 'pdf' }, { client })
    expect(r.downloaded).toBe(true)
    expect(r.fileCount).toBe(3)
    expect(r.path).toBe('/home/u/.openvibe/skills/pdf')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'POST')?.path).toBe('/api/skills/s1/download')
  })

  it('精确匹配：子串命中不算数（pdf 不该命中 pdf-tool）', async () => {
    const { client } = fakeClient([
      {
        id: 's1',
        name: 'pdf-tool',
        skillDir: '/x/pdf-tool',
        libraryDir: null,
        remoteRef: null,
      },
    ])
    await expect(skillGetAction({ name: 'pdf' }, { client })).rejects.toBeInstanceOf(SkillGetError)
  })

  it('大小写不敏感：PDF 命中 pdf', async () => {
    const { client } = fakeClient([
      {
        id: 's1',
        name: 'pdf',
        skillDir: '/x/pdf',
        libraryDir: null,
        remoteRef: null,
      },
    ])
    const r = await skillGetAction({ name: 'PDF' }, { client })
    expect(r.name).toBe('pdf')
  })

  it('台账里没有 ⇒ 明确报 NOT_FOUND（中文人话）', async () => {
    const { client } = fakeClient([])
    await expect(skillGetAction({ name: 'nope' }, { client })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('既无目录也无溯源 ⇒ 报 NOT_AVAILABLE（不是「下载失败」）', async () => {
    const { client } = fakeClient([
      { id: 's1', name: 'pdf', skillDir: null, libraryDir: null, remoteRef: null },
    ])
    await expect(skillGetAction({ name: 'pdf' }, { client })).rejects.toMatchObject({
      code: 'NOT_AVAILABLE',
    })
  })

  it('空名 ⇒ 早失败（VALIDATION_ERROR）', async () => {
    const { client } = fakeClient([])
    await expect(skillGetAction({ name: '  ' }, { client })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})
