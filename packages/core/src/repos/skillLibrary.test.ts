import { describe, expect, it, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SkillsRepo } from './skills'
import { zcodePluginSkillRoots } from './skills'
import { SqliteSkillLibrary, skillLibraryDir, skillLibraryRoot } from './skillLibrary'
import { defaultSkillRoots, expandKnownRoots, KNOWN_SKILL_ROOTS } from './skill-scan-roots'
import { newDb } from '../test-support/new-db'

/**
 * Skill 库 / 扫描根清单 / 失效清理的**行为**测试（2026-10-30）。
 *
 * 这三样是同一件事的三个面：
 *  - **扫描根清单**：决定「扫哪儿」（用户可配，覆盖国内主流 agent）；
 *  - **skill 库**：给 skill 一份与 agent 无关的副本（agent 卸载后内容还在）；
 *  - **失效清理**：把「路径没了 + 下不回来 + 没副本」的台账死记录清掉。
 */

const openHandles: { close: () => void }[] = []
const savedHome = process.env.OPENVIBE_HOME

afterEach(() => {
  while (openHandles.length > 0) openHandles.pop()?.close()
  // 还原环境变量：库根的解析依赖它，漏还原会污染别的测试文件
  if (savedHome === undefined) delete process.env.OPENVIBE_HOME
  else process.env.OPENVIBE_HOME = savedHome
})

function makeDb(): ReturnType<typeof newDb> {
  const h = newDb()
  openHandles.push(h)
  return h
}

/**
 * 造一个「OpenVibe 家目录」，并让**库根解析**认它。
 *
 * ⚠️ 必须走 `OPENVIBE_HOME`（仓内既有的家目录覆盖机制，`openvibeHome()` 同款）：
 *   若只把路径当构造参数传给 `SqliteSkillLibrary`，而别处按环境变量解析，
 *   两边就会分叉 ⇒「副本在不在库内」判错 ⇒ 删副本时留下孤儿目录。
 *   这个分叉正是本文件第一版踩到的坑。
 */
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'ov-skillhome-'))
  // OpenVibe 家目录与 agent 家目录分开：布局与生产一致（家目录下再开 .openvibe）
  process.env.OPENVIBE_HOME = join(home, '.openvibe')
  return home
}

/** 造一个含 SKILL.md 的 skill 目录 */
function makeSkillDir(root: string, name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody`, 'utf8')
  return dir
}

describe('扫描根清单（2026-10-30：改成可配置清单）', () => {
  it('KNOWN 清单覆盖用户点名的国内主流 agent（漏一个就是漏扫）', () => {
    // ⚠️ 这条钉的是**用户明确点名过的那几个**：漏一个 ⇒ 那个 agent 的 skill 永远扫不到。
    const mustHave = [
      '.workbuddy/skills',
      '.workbuddy/skills-marketplace/skills',
      '.trae/skills',
      '.trae-cn/skills',
      '.codex/skills',
      '.claude/skills',
      '.stepclaw/skills',
      '.kukuai/skills',
      '.openclaw-autoclaw/skills',
    ]
    const known = KNOWN_SKILL_ROOTS.join('\n')
    for (const rel of mustHave) {
      expect(known, `已知清单缺 ${rel}`).toContain(rel)
    }
  })

  it('ZCode 的插件根走另一条路（installed_plugins.json 清单，不在已知路径表里）', () => {
    // ⚠️ ZCode 的 skill 根**不是**固定路径：它由 `installed_plugins.json` 逐插件
    //   的 installPath 决定 ⇒ 只能运行时算，进不了「已知路径」这张静态表。
    //   这条钉住「ZCode 没被漏掉」（由 zcodePluginSkillRoots 负责）。
    const home = tempHome()
    try {
      const manifestDir = join(home, '.zcode', 'cli', 'plugins')
      mkdirSync(manifestDir, { recursive: true })
      const installPath = join(home, '.zcode', 'plugins', 'demo')
      mkdirSync(join(installPath, 'skills'), { recursive: true })
      writeFileSync(
        join(manifestDir, 'installed_plugins.json'),
        JSON.stringify({ plugins: [{ installPath }] }),
        'utf8',
      )
      expect(zcodePluginSkillRoots(home)).toContain(join(installPath, 'skills'))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('约定式发现覆盖嵌套形态与异形路径（原来够不着的那两类）', () => {
    const home = tempHome()
    try {
      // 嵌套形态：不是 home 的直接点目录子项
      const nested = join(home, '.config', 'loomy-opencode', 'skills')
      mkdirSync(nested, { recursive: true })
      // 非点目录：home 下的普通目录
      const plain = join(home, 'DoubaoWork', 'skills')
      mkdirSync(plain, { recursive: true })
      // 约定的直接形态
      const direct = join(home, '.claude', 'skills')
      mkdirSync(direct, { recursive: true })

      const roots = defaultSkillRoots(home)
      expect(roots).toContain(nested)
      expect(roots).toContain(plain)
      expect(roots).toContain(direct)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('不存在的路径不进根集合；expandKnownRoots 如实标 exists', () => {
    const home = tempHome()
    try {
      mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
      const roots = defaultSkillRoots(home)
      expect(roots.every((r) => existsSync(r))).toBe(true)
      const expanded = expandKnownRoots(home)
      const claude = expanded.find((e) => e.path.endsWith('.claude/skills'))
      expect(claude?.exists).toBe(true)
      const missing = expanded.find((e) => e.path.endsWith('.stepclaw/skills'))
      expect(missing?.exists).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('Skill 库（2026-10-30：独立于其他 agent）', () => {
  it('备份：副本落在 OpenVibe 自己的目录下，原目录不动', () => {
    const h = makeDb()
    const home = tempHome()
    const src = makeSkillDir(join(home, '.claude', 'skills'), 'pdf')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([join(home, '.claude', 'skills')])
      const skill = repo.list().find((s) => s.name === 'pdf')
      expect(skill).toBeDefined()

      const lib = new SqliteSkillLibrary(h.db)
      const r = lib.backup(skill!.id)
      expect(r.libraryDir).toBe(join(home, '.openvibe', 'skills', 'pdf'))
      expect(r.fileCount).toBe(1)
      expect(readFileSync(join(r.libraryDir, 'SKILL.md'), 'utf8')).toContain('name: pdf')
      // 原目录还在（备份是复制，不是搬家）
      expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
      // 台账记下副本位置
      expect(repo.get(skill!.id)?.libraryDir).toBe(r.libraryDir)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('备份的内容与原件同指纹（⇒ 可与扫描侧对账）', () => {
    const h = makeDb()
    const home = tempHome()
    makeSkillDir(join(home, '.claude', 'skills'), 'pdf')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([join(home, '.claude', 'skills')])
      const skill = repo.list().find((s) => s.name === 'pdf')!
      const lib = new SqliteSkillLibrary(h.db)
      const r = lib.backup(skill.id)
      const versions = repo.versions(skill.id)
      expect(r.dirHash).toBe(versions.find((v) => v.id === skill.latestVersionId)?.dirHash)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('恢复：原目录消失后能从库副本写回', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'pdf')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      const skill = repo.list().find((s) => s.name === 'pdf')!
      const lib = new SqliteSkillLibrary(h.db)
      lib.backup(skill.id)
      // 原目录没了（agent 被卸载）
      rmSync(src, { recursive: true, force: true })
      const r = lib.restore(skill.id)
      expect(r.targetDir).toBe(src)
      expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('移出库：删副本、清台账列，原 skill 目录不受影响', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'pdf')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      const skill = repo.list().find((s) => s.name === 'pdf')!
      const lib = new SqliteSkillLibrary(h.db)
      const r = lib.backup(skill.id)
      lib.remove(skill.id)
      expect(existsSync(r.libraryDir)).toBe(false)
      expect(repo.get(skill.id)?.libraryDir).toBeNull()
      // 原目录还在 —— 移出库不是删 skill
      expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('删台账条目不留孤儿目录：先移出库（清副本）再删行', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    makeSkillDir(root, 'pdf')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      const skill = repo.list().find((s) => s.name === 'pdf')!
      const lib = new SqliteSkillLibrary(h.db)
      const r = lib.backup(skill.id)
      // ⚠️ **顺序是契约**：先 library.remove（清副本文件），再 repo.delete（删行）。
      //   反了就查不到副本路径 ⇒ 副本留在磁盘上没人认领。
      lib.remove(skill.id)
      repo.delete(skill.id)
      expect(existsSync(r.libraryDir)).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('清理路径：删行前经 onRemove 清副本（不留孤儿目录）', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'gone')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      const skill = repo.list().find((s) => s.name === 'gone')!
      const lib = new SqliteSkillLibrary(h.db)
      const r = lib.backup(skill.id)
      rmSync(src, { recursive: true, force: true })
      // includeBackedUp=true ⇒ 连有副本的一起清
      const report = repo.cleanup({
        includeBackedUp: true,
        onRemove: (items) => lib.removeCopies(items.map((i) => i.id)),
      })
      expect(report.removed).toBe(1)
      expect(existsSync(r.libraryDir)).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('库根路径：~/.openvibe/skills（与 packs 同层，OPENVIBE_HOME 可覆盖）', () => {
    expect(skillLibraryRoot('/tmp/x')).toBe(join('/tmp/x', 'skills'))
    expect(skillLibraryDir('pdf', '/tmp/x')).toBe(join('/tmp/x', 'skills', 'pdf'))
  })
})

describe('失效条目清理（2026-10-30：一键批量清理）', () => {
  it('判据：目录已消失 ∧ 无远程溯源 ∧ 无副本 ⇒ 彻底丢失（该清）', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'gone')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      rmSync(src, { recursive: true, force: true })
      const preview = repo.cleanupPreview()
      expect(preview.items).toHaveLength(1)
      expect(preview.items[0]?.unrecoverable).toBe(true)
      expect(preview.summary.unrecoverable).toBe(1)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('路径还在的条目不算失效', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    makeSkillDir(root, 'alive')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      expect(repo.cleanupPreview().items).toEqual([])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('有远程溯源的条目保留（能重拉回来，删了等于让用户重新导入）', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'remote')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      // 补上远程溯源（远程导入会写这两列）
      h.db
        .prepare('UPDATE skills SET remote_ref = ? WHERE name = ?')
        .run('github:owner/repo@main', 'remote')
      rmSync(src, { recursive: true, force: true })
      const preview = repo.cleanupPreview()
      expect(preview.items[0]?.downloadable).toBe(true)
      expect(preview.items[0]?.unrecoverable).toBe(false)
      // 清理时保留
      expect(repo.cleanup({}).removed).toBe(0)
      expect(repo.get(repo.list().find((s) => s.name === 'remote')!.id)).not.toBeNull()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('有库内副本的条目保留（内容还在库里，删台账等于丢索引）', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'backed')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      const skill = repo.list().find((s) => s.name === 'backed')!
      new SqliteSkillLibrary(h.db).backup(skill.id)
      rmSync(src, { recursive: true, force: true })
      const preview = repo.cleanupPreview()
      expect(preview.items[0]?.backedUp).toBe(true)
      expect(preview.items[0]?.unrecoverable).toBe(false)
      expect(repo.cleanup({}).removed).toBe(0)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('远程条目（skillDir 为空）不算失效 —— 否则一键清空会删光刚导入的远程 skill', () => {
    const h = makeDb()
    try {
      const repo = new SkillsRepo(h.db)
      repo.create({ name: 'remote-only', source: 'github', installedTargets: [] })
      // 远程条目的 skillDir 恒为 null（只建档不落盘）
      expect(repo.get(repo.list()[0]!.id)?.skillDir).toBeNull()
      expect(repo.cleanupPreview().items).toEqual([])
    } finally {
      /* 台账随 handle 关闭而销毁 */
    }
  })

  it('清理只删台账行，不动磁盘文件', () => {
    const h = makeDb()
    const home = tempHome()
    const root = join(home, '.claude', 'skills')
    const src = makeSkillDir(root, 'gone')
    try {
      const repo = new SkillsRepo(h.db)
      repo.scan([root])
      rmSync(src, { recursive: true, force: true })
      const r = repo.cleanup({})
      expect(r.removed).toBe(1)
      expect(repo.list()).toHaveLength(0)
      // 磁盘上没多也没少（原件本就不存在）
      expect(existsSync(src)).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
