import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  computeDirHash,
  discoverSkillRoots,
  hashSkillEntries,
  parseSkillFrontmatter,
  reviewSkill,
  SkillsRepo,
  zcodePluginSkillRoots,
} from './skills'
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

  it('frontmatter 剥引号（DEV-0067）：YAML 语法引号不是名字的一部分', () => {
    expect(
      parseSkillFrontmatter('---\nname: "PRD to Prototype"\ndescription: \'单引号描述\'\n---\nbody'),
    ).toMatchObject({ name: 'PRD to Prototype', description: '单引号描述', ok: true })
    // 值内部的引号保留
    expect(parseSkillFrontmatter('---\nname: say-"hi"\n---\nbody').name).toBe('say-"hi"')
  })

  it('hashSkillEntries 与 computeDirHash 同公式：同一套文件两边指纹一致', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-hash-'))
    try {
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: x\n---\nbody')
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'sub', 'b.txt'), 'bee')
      const local = computeDirHash(dir)
      const { createHash } = await import('node:crypto')
      const read = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
      const memory = hashSkillEntries([
        { rel: 'SKILL.md', sha256: read(join(dir, 'SKILL.md')) },
        { rel: 'sub/b.txt', sha256: read(join(dir, 'sub', 'b.txt')) },
      ])
      expect(memory).toEqual(local)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

  it('已扫根记入 scannedRoots；显式缺根告警并记 missingRoots（DEV-0063）', () => {
    const repo = new SkillsRepo(handle.db)
    const missing = join(root, 'no-such-root')
    const report = repo.scan([root, missing])
    expect(report.scannedRoots).toEqual([root])
    expect(report.missingRoots).toEqual([missing])
    expect(report.warnings).toContain(`扫描根不存在或不可读，跳过: ${missing}`)
    // 重复根在服务端去重：同一根不重复计数
    const dup = repo.scan([root, root])
    expect(dup).toMatchObject({ skipped: 3, discovered: 3 })
    expect(dup.scannedRoots).toEqual([root])
  })
})

describe('远程导入落账 upsertRemote（DEV-0067）', () => {
  let handle: ReturnType<typeof newDb>

  beforeEach(() => {
    handle = newDb()
  })
  afterEach(() => {
    handle.close()
  })

  const entry = (over: Partial<Parameters<SkillsRepo['upsertRemote']>[0]> = {}) => ({
    name: 'pdf-kit',
    description: '远程描述',
    source: 'github' as const,
    versionLabel: 'anthropics/skills@main',
    dirHash: 'deadbeef',
    fileCount: 3,
    remoteRef: 'github:anthropics/skills@main',
    remoteTreeHash: 'treehash-main',
    ...over,
  })

  it('新建 → 同指纹跳过 → 指纹变化追加版本（版本线带溯源串）', () => {
    const repo = new SkillsRepo(handle.db)
    expect(repo.upsertRemote(entry())).toBe('created')
    const one = repo.list()[0]
    expect(one?.source).toBe('github')
    expect(one?.skillDir).toBeNull()
    expect(one?.remoteRef).toBe('github:anthropics/skills@main')
    expect(repo.versions(one?.id ?? '').map((v) => v.versionLabel)).toEqual([
      'anthropics/skills@main',
    ])

    expect(repo.upsertRemote(entry())).toBe('skipped')
    expect(repo.versions(one?.id ?? '')).toHaveLength(1)

    expect(
      repo.upsertRemote(
        entry({ dirHash: 'changed', versionLabel: 'anthropics/skills@v2', remoteTreeHash: 'treehash-v2' }),
      ),
    ).toBe('updated')
    const vers = repo.versions(one?.id ?? '')
    expect(vers).toHaveLength(2)
    expect(vers.at(-1)?.versionLabel).toBe('anthropics/skills@v2')
    expect(repo.get(one?.id ?? '')?.remoteTreeHash).toBe('treehash-v2') // 树指纹随重导刷新
  })

  it('与本地同名条目合并：追加远程版本且不覆盖已有 skill_dir', () => {
    const repo = new SkillsRepo(handle.db)
    const dir = mkdtempSync(join(tmpdir(), 'ov-remote-merge-'))
    try {
      mkdirSync(join(dir, 'pdf-kit'))
      writeFileSync(join(dir, 'pdf-kit', 'SKILL.md'), '---\nname: pdf-kit\ndescription: 本地版\n---\nbody')
      repo.scan([dir])
      const local = repo.list()[0]
      expect(local?.skillDir).toBe(join(dir, 'pdf-kit'))

      expect(
        repo.upsertRemote(
          entry({
            name: 'pdf-kit',
            description: '远程版',
            dirHash: 'remote-hash',
            remoteRef: 'github:other/repo@main',
            remoteTreeHash: 'treehash-other',
          }),
        ),
      ).toBe('updated')
      const merged = repo.get(local?.id ?? '')
      expect(merged?.skillDir).toBe(join(dir, 'pdf-kit')) // 远程无目录，不得洗掉本地目录
      expect(merged?.description).toBe('远程版')
      expect(merged?.remoteRef).toBe('github:other/repo@main')
      expect(repo.versions(local?.id ?? '')).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('重复整理与内置审查（DEV-0067）', () => {
  let handle: ReturnType<typeof newDb>

  beforeEach(() => {
    handle = newDb()
  })
  afterEach(() => {
    handle.close()
  })

  it('duplicates：同内容不同名归组；目录消失记 stale；引号名记异常；manual 空指纹不参与', async () => {
    const { createHash } = await import('node:crypto')
    const dir = mkdtempSync(join(tmpdir(), 'ov-dup-'))
    try {
      const repo = new SkillsRepo(handle.db)
      const body = '---\nname: aa\ndescription: 同内容甲\n---\n完全一样的内容'
      for (const name of ['aa', 'aa-copy']) {
        mkdirSync(join(dir, name))
        writeFileSync(join(dir, name, 'SKILL.md'), body) // 两个目录内容逐字节一致 → 同名合并成一个台账条目
      }
      mkdirSync(join(dir, 'plain'))
      writeFileSync(join(dir, 'plain', 'SKILL.md'), '---\nname: plain\ndescription: x\n---\nbody')
      repo.scan([dir])

      // 同内容不同名的现实来源：旧版扫描留下的引号名存量行（hash 同、名字不同）。
      // 现解析已剥引号，直接造一行存量模拟。
      const expectHash = createHash('sha256')
        .update(`SKILL.md:${createHash('sha256').update(body).digest('hex')}\n`)
        .digest('hex')
      const legacy = repo.create({
        name: '"aa" (旧)',
        description: '',
        source: 'manual',
        installedTargets: [],
      })
      handle.db
        .prepare('UPDATE skill_versions SET dir_hash = ? WHERE skill_id = ?')
        .run(expectHash, legacy.id)
      const groups = repo.duplicates().sameContent
      expect(groups).toHaveLength(1)
      expect(groups[0]?.dirHash).toBe(expectHash)
      expect(groups[0]?.skills.map((s) => s.name).sort()).toEqual(['"aa" (旧)', 'aa'])

      // manual 条目（空指纹）不进同内容组
      repo.create({ name: 'handmade', description: '', source: 'manual', installedTargets: [] })
      expect(repo.duplicates().sameContent).toHaveLength(1)

      // 目录消失 → stale；引号名 → nameAnomalies
      repo.create({ name: '"带引号"', description: 'x', source: 'manual', installedTargets: [] })
      rmSync(join(dir, 'plain'), { recursive: true })
      const report = repo.duplicates()
      expect(report.stale.map((s) => s.name)).toEqual(['plain'])
      expect(report.nameAnomalies.map((s) => s.name).sort()).toEqual(['"aa" (旧)', '"带引号"'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reviewSkill：引号名 fail、空描述 fail、无触发词 info、凭据串 fail、家目录 warn、干净技能零问题', () => {
    expect(reviewSkill({ name: '"quoted"', description: 'd', content: null })).toContainEqual(
      expect.objectContaining({ code: 'name-quoted', severity: 'fail' }),
    )
    expect(reviewSkill({ name: 'ok-name', description: '', content: null })).toContainEqual(
      expect.objectContaining({ code: 'description-empty', severity: 'fail' }),
    )
    expect(reviewSkill({ name: 'ok-name', description: '把资料整理成表格', content: null })).toContainEqual(
      expect.objectContaining({ code: 'description-no-trigger', severity: 'info' }),
    )
    expect(reviewSkill({ name: 'ok-name', description: 'd', content: null })).toContainEqual(
      expect.objectContaining({ code: 'review-metadata-only', severity: 'info' }),
    )
    const secret = reviewSkill({
      name: 'ok-name',
      description: 'Use when …',
      content: '---\nname: ok-name\n---\nkey = sk-abcdefghijklmnopqrstuvwx',
    })
    expect(secret).toContainEqual(expect.objectContaining({ code: 'possible-secret', severity: 'fail' }))
    expect(
      reviewSkill({ name: 'ok-name', description: 'Use when …', content: '读 /Users/alice/secrets 下的文件' }),
    ).toContainEqual(expect.objectContaining({ code: 'leaks-user-path', severity: 'warn' }))
    // 降噪（DEV-0068）：fenced code block 内的示例 IP/路径不报，正文里的照报
    const withCodeBlock = reviewSkill({
      name: 'ok-name',
      description: 'Use when …',
      content:
        '---\nname: ok-name\n---\n正文。\n```\ncurl http://127.0.0.1:8080  # 本地示例\npath=/Users/demo/x\n```\n结束。',
    })
    expect(withCodeBlock.some((i) => i.code === 'private-ip-literal')).toBe(false)
    expect(withCodeBlock.some((i) => i.code === 'leaks-user-path')).toBe(false)
    expect(
      reviewSkill({
        name: 'ok-name',
        description: '当用户要解析 PDF 时使用',
        content:
          '---\nname: ok-name\ndescription: 当用户要解析 PDF 时使用\n---\n正文足够长的一段操作指引，包含具体步骤、输入输出与验收方式，覆盖常见失败分支的处理建议。',
      }),
    ).toEqual([])
  })
})

describe('默认扫描根发现（DEV-0063：~/.<tool>/skills 存在即扫）', () => {
  it('发现全部点目录下的 skills；.Trash 排除；非目录点项与无 skills 的点项忽略', () => {
    const home = mkdtempSync(join(tmpdir(), 'ov-home-'))
    try {
      for (const dot of ['.claude', '.qoder', '.trae', '.workbuddy', '.openclaw-autoclaw']) {
        mkdirSync(join(home, dot, 'skills'), { recursive: true })
      }
      mkdirSync(join(home, '.Trash', 'skills'), { recursive: true }) // 已删除，不复活
      mkdirSync(join(home, '.nodir')) // 点目录但没有 skills 子目录
      writeFileSync(join(home, '.afile'), 'x') // 点项但不是目录
      const roots = discoverSkillRoots(home, join(home, 'cwd-not-exist'))
      expect(roots).toEqual([
        join(home, '.claude', 'skills'),
        join(home, '.openclaw-autoclaw', 'skills'),
        join(home, '.qoder', 'skills'),
        join(home, '.trae', 'skills'),
        join(home, '.workbuddy', 'skills'),
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('cwd 的 .claude/skills 存在时并入同一清单（去重、无重复条目）', () => {
    const home = mkdtempSync(join(tmpdir(), 'ov-home2-'))
    const cwdRoot = mkdtempSync(join(tmpdir(), 'ov-cwd-'))
    try {
      mkdirSync(join(cwdRoot, '.claude', 'skills'), { recursive: true })
      mkdirSync(join(home, '.agents', 'skills'), { recursive: true })
      const roots = discoverSkillRoots(home, join(cwdRoot, '.claude', 'skills'))
      expect(roots).toHaveLength(2)
      expect(roots).toContain(join(home, '.agents', 'skills'))
      expect(roots).toContain(join(cwdRoot, '.claude', 'skills'))
      expect([...roots].sort()).toEqual(roots) // 排序稳定
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(cwdRoot, { recursive: true, force: true })
    }
  })
})

describe('ZCode 插件 skill 根（DEV-0066：清单钉版 + 缓存最高版本兜底）', () => {
  let home: string
  let manifest: string
  let cacheRoot: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ov-zcode-'))
    manifest = join(home, '.zcode', 'cli', 'plugins', 'installed_plugins.json')
    cacheRoot = join(home, '.zcode', 'cli', 'plugins', 'cache')
    mkdirSync(join(home, '.zcode', 'cli', 'plugins'), { recursive: true })
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const writeManifest = (plugins: unknown[]) =>
    writeFileSync(manifest, JSON.stringify({ version: 1, plugins }))

  it('清单插件按 installPath 收集；payload/skills 布局兼容；无 skills 的插件不收', () => {
    const hasSkills = join(cacheRoot, 'mkt', 'alpha', '1.0.0')
    const payloadLayout = join(cacheRoot, 'mkt', 'mimosa-like', '1.0.3')
    const noSkills = join(cacheRoot, 'mkt', 'beta', '2.0.0')
    mkdirSync(join(hasSkills, 'skills'), { recursive: true })
    mkdirSync(join(payloadLayout, 'payload', 'skills'), { recursive: true })
    mkdirSync(noSkills, { recursive: true })
    writeManifest([
      { id: 'alpha@mkt', installPath: hasSkills },
      { id: 'mimosa-like@mkt', installPath: payloadLayout },
      { id: 'beta@mkt', installPath: noSkills },
      { id: 'broken@mkt' }, // 缺 installPath → 跳过
      { id: 'gone@mkt', installPath: join(home, 'nowhere') }, // 目录不存在 → 跳过
    ])
    expect(zcodePluginSkillRoots(home)).toEqual([
      join(hasSkills, 'skills'),
      join(payloadLayout, 'payload', 'skills'),
    ])
  })

  it('清单钉版优先：钉版插件的历史缓存版本不参与；缓存内未钉插件只取最高版本', () => {
    const pinnedV1 = join(cacheRoot, 'mkt', 'alpha', '1.0.0')
    mkdirSync(join(pinnedV1, 'skills'), { recursive: true })
    mkdirSync(join(cacheRoot, 'mkt', 'alpha', '0.9.0', 'skills'), { recursive: true }) // 钉版插件的历史残留
    const latestOnly = join(cacheRoot, 'mkt', 'browser-like', '0.10.0') // 两位数版本号要求数值比较
    mkdirSync(join(latestOnly, 'skills'), { recursive: true })
    mkdirSync(join(cacheRoot, 'mkt', 'browser-like', '0.9.0', 'skills'), { recursive: true })
    writeManifest([{ id: 'alpha@mkt', installPath: pinnedV1 }])
    const roots = zcodePluginSkillRoots(home)
    expect(roots).toEqual([join(pinnedV1, 'skills'), join(latestOnly, 'skills')])
  })

  it('缓存插件最高版本无 skills 时不回落低版本；清单缺失/损坏仍走缓存兜底', () => {
    mkdirSync(join(cacheRoot, 'mkt', 'mcponly', '2.0.0'), { recursive: true }) // 最高版无 skills
    mkdirSync(join(cacheRoot, 'mkt', 'mcponly', '1.0.0', 'skills'), { recursive: true })
    writeManifest([])
    expect(zcodePluginSkillRoots(home)).toEqual([])

    writeFileSync(manifest, '{ 损坏 JSON') // 清单损坏：缓存兜底照常
    const keep = join(cacheRoot, 'mkt', 'solo', '1.0.0')
    mkdirSync(join(keep, 'skills'), { recursive: true })
    expect(zcodePluginSkillRoots(home)).toEqual([join(keep, 'skills')])

    rmSync(manifest) // 无 ZCode 清单：同上
    expect(zcodePluginSkillRoots(home)).toEqual([join(keep, 'skills')])
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
      expect(vers.map((v) => v.versionLabel)).toEqual(['v1', 'my-skill']) // 时间序：手工 v1 在前
      expect(merged?.latestVersionId).toBe(vers[1]?.id)

      // 再扫同一目录命中真实指纹 → skipped；空串指纹不参与判重
      expect(repo.scan([dir])).toMatchObject({ skipped: 1, updated: 0 })
      expect(repo.versions(manual.id)).toHaveLength(2)
    } finally {
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('同一毫秒落库的版本按落库顺序返回（id 兜底会把顺序颠倒）', () => {
    const handle = newDb()
    try {
      const repo = new SkillsRepo(handle.db)
      const manual = repo.create({
        name: 'tie',
        description: 'd',
        source: 'manual',
        installedTargets: [],
      })
      const ts = '2099-01-01T00:00:00.000Z'
      // 故意让后落库的行带更小的随机 id：以 id 兜底排序会把两条整个反过来
      for (const id of ['skv_zzzz', 'skv_aaaa']) {
        handle.db
          .prepare(
            `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
          )
          .run(id, manual.id, id, `hash-${id}`, ts)
      }
      expect(repo.versions(manual.id).map((v) => v.id)).toEqual([
        manual.latestVersionId,
        'skv_zzzz',
        'skv_aaaa',
      ])
    } finally {
      handle.close()
    }
  })
})
