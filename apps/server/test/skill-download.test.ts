import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadSkillFiles } from '../src/lib/skill-remote'
import { downloadSkillToDisk } from '../src/lib/skill-download'

/**
 * 下载落盘的行为测试（2026-10-30）。
 *
 * 钉的是「**真的落盘**」与「**落盘是原子的**」：
 *  - 现状「远程导入」只建档不落盘 ⇒ 这条路径是新增能力，必须自己钉住；
 *  - 中途失败不得留下半份内容（半份 skill 比没有更坏：能扫到，但 SKILL.md 是残的）。
 *
 * 上游用注入的 fetchImpl mock（不碰真实网络）。
 */

const temps: string[] = []

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true })
})

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ov-dl-'))
  temps.push(d)
  return d
}

const GITHUB_TREE = {
  tree: [
    { path: 'skills/pdf/SKILL.md', type: 'blob', sha: 'a1' },
    { path: 'skills/pdf/helper.md', type: 'blob', sha: 'b2' },
    { path: 'README.md', type: 'blob', sha: 'c3' },
  ],
}

/** mock 上游：repo API 给默认分支、trees API 给目录树、raw 给文件内容 */
function mockGithub(files: Record<string, string>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    if (url.endsWith('/repos/owner/repo')) {
      return new Response(JSON.stringify({ default_branch: 'main' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/git/trees/')) {
      return new Response(JSON.stringify(GITHUB_TREE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    for (const [path, content] of Object.entries(files)) {
      if (url.endsWith(path)) {
        return new Response(content, { status: 200 })
      }
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

describe('downloadSkillFiles（按 remoteRef 取回文件内容）', () => {
  it('GitHub：按 remoteRef 的 path 段切子树，只取该 skill 的文件', async () => {
    const fetched = await downloadSkillFiles(
      'github:owner/repo@main:skills/pdf',
      mockGithub({
        'skills/pdf/SKILL.md': '---\nname: pdf\n---\nbody',
        'skills/pdf/helper.md': 'helper',
      }),
    )
    expect(fetched.files.map((f) => f.rel).sort()).toEqual(['SKILL.md', 'helper.md'])
    expect(fetched.origin).toBe('github:owner/repo@main:skills/pdf')
    // 指纹与本地同公式（相对路径 + 内容 sha256）
    expect(fetched.dirHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('GitHub：仓库 API 404 ⇒ 口径与导入路径一致（REMOTE_UNREACHABLE，detail 带远端原文）', async () => {
    // ⚠️ 刻意与 `importFromGithub` **同口径**：那边仓库 404 也是 REMOTE_UNREACHABLE。
    //   两处判据不同会让同一个仓库在不同入口报不同的错，排障时更困惑。
    const notFound = (async () =>
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })) as typeof fetch
    await expect(
      downloadSkillFiles('github:owner/repo@main:skills/pdf', notFound),
    ).rejects.toMatchObject({ code: 'REMOTE_UNREACHABLE' })
  })

  it('GitHub：仓库存在但拿不到默认分支 ⇒ NOT_FOUND', async () => {
    const noBranch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch
    await expect(
      downloadSkillFiles('github:owner/repo@main:skills/pdf', noBranch),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('无法识别的溯源串 ⇒ VALIDATION_ERROR', async () => {
    await expect(downloadSkillFiles('ftp://x/y', mockGithub({}))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('raw 不可达 ⇒ 回退到 api.github.com 的 contents 端点（直连也能下）', async () => {
    // ⚠️ 这条钉的是**回退路径**：本机实测 `raw.githubusercontent.com` 不可达
    //   （api.github.com 200/0.7s，raw 直接超时）⇒ 只走 raw 的话下载功能等于没有。
    const rawDead = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.includes('raw.githubusercontent.com')) {
        throw new Error('fetch failed')
      }
      if (url.endsWith('/repos/owner/repo')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify(GITHUB_TREE), { status: 200 })
      }
      if (url.includes('/contents/')) {
        const body = Buffer.from('from-api', 'utf8').toString('base64')
        return new Response(JSON.stringify({ content: body, encoding: 'base64' }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch
    const fetched = await downloadSkillFiles('github:owner/repo@main:skills/pdf', rawDead)
    expect(fetched.files.length).toBeGreaterThan(0)
    expect(fetched.files.every((f) => f.content === 'from-api')).toBe(true)
  })

  it('缺 SKILL.md ⇒ 报错，不把残缺内容当成功', async () => {
    // ⚠️ 没有 SKILL.md 的目录**不是**一个 skill（m2 FR-1.1 的判定依据）。
    //   缺了它却报「下载成功」⇒ 台账指向一个扫不到、用不了的目录。
    const noSkillMd = {
      tree: [{ path: 'skills/pdf/helper.md', type: 'blob', sha: 'b2' }],
    }
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/repos/owner/repo')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify(noSkillMd), { status: 200 })
      }
      return new Response('x', { status: 200 })
    }) as typeof fetch
    await expect(
      downloadSkillFiles('github:owner/repo@main:skills/pdf', fetchImpl),
    ).rejects.toMatchObject({ code: 'REMOTE_UNREACHABLE' })
  })
})

describe('downloadSkillToDisk（落盘）', () => {
  it('真的把文件写进磁盘，并保留相对路径结构', async () => {
    const target = join(tempDir(), 'pdf')
    const r = await downloadSkillToDisk({
      remoteRef: 'github:owner/repo@main:skills/pdf',
      targetDir: target,
      fetchImpl: mockGithub({
        'skills/pdf/SKILL.md': '---\nname: pdf\n---\nbody',
        'skills/pdf/helper.md': 'helper',
      }),
    })
    expect(r.fileCount).toBe(2)
    expect(existsSync(join(target, 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(target, 'helper.md'), 'utf8')).toBe('helper')
  })

  it('中途失败不留半份内容（临时目录被清掉）', async () => {
    const target = join(tempDir(), 'pdf')
    // repo/trees 成功但 raw 全 404 ⇒ 一个文件都没下到
    const treeOnly = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/repos/owner/repo')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify(GITHUB_TREE), { status: 200 })
      }
      return new Response('nope', { status: 404 })
    }) as typeof fetch
    await expect(
      downloadSkillToDisk({
        remoteRef: 'github:owner/repo@main:skills/pdf',
        targetDir: target,
        fetchImpl: treeOnly,
      }),
    ).rejects.toBeDefined()
    // 目标目录不存在（半份内容不留）
    expect(existsSync(target)).toBe(false)
    expect(existsSync(`${target}.partial`)).toBe(false)
  })

  it('远端路径带 `..` ⇒ 跳过该文件（远端路径不可信，不能写到目标目录外）', async () => {
    const evil = {
      tree: [
        // 合法文件：让流程走到「落盘」这一步
        { path: 'skills/pdf/SKILL.md', type: 'blob', sha: 'a1' },
        // 切掉前缀 skills/pdf/ 后 rel = ../evil.md ⇒ 试图写到目标目录之外
        { path: 'skills/pdf/../evil.md', type: 'blob', sha: 'b2' },
      ],
    }
    const evilFetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/repos/owner/repo')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 })
      }
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify(evil), { status: 200 })
      }
      return new Response('x', { status: 200 })
    }) as typeof fetch
    const target = join(tempDir(), 'pdf')
    const r = await downloadSkillToDisk({
      remoteRef: 'github:owner/repo@main:skills/pdf',
      targetDir: target,
      fetchImpl: evilFetch,
    })
    // 非法路径的文件被跳过（带一条 warning），合法文件正常落盘
    expect(r.fileCount).toBe(1)
    expect(r.warnings.some((w) => w.includes('路径非法'))).toBe(true)
    expect(existsSync(join(target, 'SKILL.md'))).toBe(true)
    // 目标目录外没有多出文件
    expect(existsSync(join(target, '..', 'evil.md'))).toBe(false)
  })
})
