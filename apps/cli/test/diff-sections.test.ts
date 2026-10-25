import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { contentOf, demoPack, writeBundleFile } from './helpers/pack-fixture'
import { syncAction } from '../src/commands/sync'
import { diffAction } from '../src/commands/diff'
import type { ApiClient } from '../src/client'

/**
 * v0.2.3 批次 C RQ4 的 CLI 端到端腿：漂移文件在包侧可达时给出段级明细
 * （受管块 / 块外自由区 + 两侧行数），离线降级为文件级报告。
 * 纯函数腿在 packages/core/src/inject/section-diff.test.ts。
 */

const roots: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

afterAll(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

async function injectedProject(): Promise<{ project: string; pack: ReturnType<typeof demoPack> }> {
  const root = tempDir('ov-dsec-')
  const project = join(root, 'proj')
  mkdirSync(project)
  const pack = demoPack()
  const bundlePath = writeBundleFile(root, pack)
  const outcome = await syncAction({ projectPath: project, file: bundlePath, yes: true }, {})
  if (outcome.writes.length === 0) throw new Error('夹具注入未产生写入')
  return { project, pack }
}

const fakeClient = (pack: ReturnType<typeof demoPack>): { client: ApiClient } => ({
  client: {
    getJson: async () => ({ items: [] }),
    postJson: async () => ({
      files: Object.entries(contentOf(pack)).map(([path, content]) => ({ path, content })),
    }),
  } as unknown as ApiClient,
})

describe('diff 的段级明细（RQ4，包侧可达时）', () => {
  it('DSEC-01: 改受管块内一行 ⇒ sections 给出受管块 changed 与两侧行数', async () => {
    const { project, pack } = await injectedProject()
    const claude = join(project, 'CLAUDE.md')
    const text = readFileSync(claude, 'utf8')
    // 在受管块内追加一行（END 标记之前）
    const edited = text.replace('<!-- openvibe:end -->', '用户在受管块里加的一行\n<!-- openvibe:end -->')
    writeFileSync(claude, edited, 'utf8')

    const outcome = await diffAction({ projectPath: project }, fakeClient(pack))
    expect(outcome.exitCode).toBe(2)
    const entry = outcome.sections.find((s) => s.path === 'CLAUDE.md')
    expect(entry).toBeDefined()
    const managed = entry?.result.regions.find((r) => r.region === '受管块')
    expect(managed?.status).toBe('changed')
    expect(managed?.actualLines).toBe((managed?.expectedLines ?? 0) + 1)
    expect(outcome.hints.join('\n')).toContain('永不触碰')
  })

  it('DSEC-02: 离线（无 client）⇒ sections 为空，文件级报告不受影响', async () => {
    const { project } = await injectedProject()
    const claude = join(project, 'CLAUDE.md')
    writeFileSync(claude, `${readFileSync(claude, 'utf8')}\n手改\n`, 'utf8')

    const outcome = await diffAction({ projectPath: project }, {})
    expect(outcome.exitCode).toBe(2)
    expect(outcome.sections).toEqual([])
    expect(outcome.drifted.map((d) => d.path)).toContain('CLAUDE.md')
    expect(outcome.hints.join('\n')).toContain('离线')
  })
})
