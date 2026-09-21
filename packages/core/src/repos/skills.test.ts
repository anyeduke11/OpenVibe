import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeDirHash, parseSkillFrontmatter, SkillsRepo } from './skills'
import { newDb } from '../test-support/new-db'

describe('dirHash 算法（m2 FR-1.3）', () => {
  it('忽略 .DS_Store 与 node_modules；内容变化 → 哈希变化', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-skill-'))
    try {
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: pdf\ndescription: d\n---\nbody')
      const h1 = computeDirHash(dir)
      writeFileSync(join(dir, '.DS_Store'), 'junk')
      mkdirSync(join(dir, 'node_modules'))
      writeFileSync(join(dir, 'node_modules', 'x.js'), 'x')
      expect(computeDirHash(dir)).toEqual(h1)
      writeFileSync(join(dir, 'helper.md'), 'changed')
      expect(computeDirHash(dir).dirHash).not.toBe(h1.dirHash)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('frontmatter 容错解析：缺失 name 回退目录名', () => {
    expect(parseSkillFrontmatter('---\nname: pdf\ndescription: 解析 PDF\n---\nbody')).toMatchObject({
      name: 'pdf',
      description: '解析 PDF',
      ok: true,
    })
    expect(parseSkillFrontmatter('# 无 frontmatter').ok).toBe(false)
  })
})

describe('SkillsRepo.scan（m2 FR-1 验收前置）', () => {
  let root: string
  let handle: ReturnType<typeof newDb>

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ov-skills-root-'))
    handle = newDb()
    const mk = (name: string, content: string) => {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'SKILL.md'), content)
    }
    mk('pdf', '---\nname: pdf\ndescription: 解析 PDF\n---\nbody')
    mk('crawl', '---\nname: crawl\ndescription: 抓取\n---\nbody')
    mk('nofm', '# 没有 frontmatter 的 skill')
    mkdirSync(join(root, 'not-a-skill')) // 无 SKILL.md → 不计
  })

  afterEach(() => {
    handle.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('首次扫描 discovered=3 created=3，无 frontmatter 者回退目录名并警告', () => {
    const repo = new SkillsRepo(handle.db)
    const report = repo.scan([root])
    expect(report.discovered).toBe(3)
    expect(report.created).toBe(3)
    expect(report.warnings.length).toBeGreaterThan(0)

    const nofm = repo.list().find((s) => s.name === 'nofm')
    expect(nofm?.source).toBe('local')
    expect(repo.versions(nofm?.id ?? '')).toHaveLength(1)
  })

  it('未变更重扫全部 skipped；修改后追加版本 versions=2', () => {
    const repo = new SkillsRepo(handle.db)
    repo.scan([root])
    const again = repo.scan([root])
    expect(again.skipped).toBe(3)
    expect(again.created).toBe(0)
    expect(again.updated).toBe(0)

    writeFileSync(join(root, 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: 变了\n---\nbody2')
    const third = repo.scan([root])
    expect(third.updated).toBe(1)
    expect(third.skipped).toBe(2)
    const pdf = repo.list().find((s) => s.name === 'pdf')
    expect(repo.versions(pdf?.id ?? '')).toHaveLength(2)
  })
})

describe('手动登记与扫描并入（m2 FR-2.2 / §7.4）', () => {
  it('create 即生成无指纹的 v1 首版本；同名目录扫到后成为版本 2 且主档仍为 manual', () => {
    const handle = newDb()
    const dir = mkdtempSync(join(tmpdir(), 'ov-skills-manual-'))
    try {
      const repo = new SkillsRepo(handle.db)
      const manual = repo.create({
        name: 'my-skill',
        description: '手工说明',
        source: 'manual',
        installedTargets: ['claude-code'],
      })
      expect(manual.latestVersionId).toBeTruthy()
      expect(repo.versions(manual.id).map((v) => v.versionLabel)).toEqual(['v1'])

      mkdirSync(join(dir, 'my-skill'))
      writeFileSync(
        join(dir, 'my-skill', 'SKILL.md'),
        '---\nname: my-skill\ndescription: 扫出来的\n---\nbody',
      )
      expect(repo.scan([dir])).toMatchObject({ discovered: 1, created: 0, updated: 1, skipped: 0 })

      const merged = repo.get(manual.id)
      expect(merged?.source).toBe('manual')
      expect(merged?.installedTargets).toEqual(['claude-code'])
      expect(merged?.skillDir).toBe(join(dir, 'my-skill'))
      const vers = repo.versions(manual.id)
      expect(vers).toHaveLength(2)
      expect(merged?.latestVersionId).toBe(vers[1]?.id)

      // 再扫同一目录命中真实指纹 → skipped；空串指纹不参与判重
      expect(repo.scan([dir])).toMatchObject({ skipped: 1, updated: 0 })
      expect(repo.versions(manual.id)).toHaveLength(2)
    } finally {
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
