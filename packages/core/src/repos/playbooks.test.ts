import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AppError } from '@openvibe/shared'
import { newDb } from '../test-support/new-db'
import { PlaybooksRepo } from './playbooks'

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

function mk(
  repo: PlaybooksRepo,
  input: Partial<Parameters<PlaybooksRepo['create']>[0]> = {},
): ReturnType<PlaybooksRepo['create']> {
  return repo.create({
    scenario: '商业银行核心系统投产前的变更评审',
    problem: '评审只看功能清单，回退方案口头带过',
    practice: '三件套：变更清单、可执行回退脚本、影响面清单；回退耗时必须实测。',
    ...input,
  })
}

describe('CORE-PB-01 · 迁移落库与 FTS 三触发器（§7.2 / §6.7）', () => {
  it('主表与 fts_playbooks 同批存在，三触发器齐全', () => {
    const h = newDb()
    const rows = h.db
      .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','trigger')`)
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    expect(names).toContain('playbooks')
    expect(names).toContain('fts_playbooks')
    // 分开发布触发器 = 检索静默恒空且无报错面，故这里逐个点名
    for (const trigger of ['playbooks_fts_ai', 'playbooks_fts_ad', 'playbooks_fts_au']) {
      expect(names, trigger).toContain(trigger)
    }
    h.close()
  })

  it('触发器真的同步：增删改后 FTS 与主表一致', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const a = mk(repo)
    expect(repo.search('变更评审')).toHaveLength(1)

    repo.update(a.id, { practice: '改写后的做法：先在测试环境实测回退耗时。' })
    expect(repo.search('测试环境实测')[0]?.playbook.id).toBe(a.id)

    repo.delete(a.id)
    expect(repo.search('变更评审')).toHaveLength(0)
    expect(repo.search('测试环境实测')).toHaveLength(0)
    h.close()
  })
})

describe('CORE-PB-02 · 检索（FR-2.2）', () => {
  it('中文命中 scenario / practice，tags 命中且带偏移', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    mk(repo, { tags: ['风险陷阱'] })
    mk(repo, {
      scenario: '数据分类分级制度已发布',
      problem: '定级靠业务部门口头判断',
      practice: '用 information_schema.columns 导出字段清单后抽样统计定级。',
      antiPractice: '让各业务部门凭印象定级。',
      tags: ['数据与存储'],
    })

    const byScenario = repo.search('数据分类分级')
    expect(byScenario).toHaveLength(1)
    expect(byScenario[0]?.matchedFields).toContain('scenario')
    const range = byScenario[0]?.matches.find((m) => m.field === 'scenario')
    expect(range && byScenario[0]?.playbook.scenario.slice(range.start, range.end)).toBe(
      '数据分类分级',
    )

    // 两字词走 LIKE 降级路径（len < 3 不进 FTS）
    expect(repo.search('抽样')).toHaveLength(1)
    expect(repo.search('抽样')[0]?.matchedFields).toContain('practice')

    const byTag = repo.search('风险陷阱')
    expect(byTag).toHaveLength(1)
    expect(byTag[0]?.matchedFields).toContain('tags')
    h.close()
  })
})

describe('CORE-PB-03 · 复合自然键幂等（FR-2.3 / 裁定 ④）', () => {
  it('同场景不同问题共存；重灌按 (scenario, problem) 定位而不新增第二条', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const first = mk(repo, { status: 'published' })
    const sibling = mk(repo, { problem: '回退脚本在测试环境从没跑过' })
    expect(sibling.id).not.toBe(first.id)

    expect(repo.findByNaturalKey(first.scenario, first.problem)?.id).toBe(first.id)
    expect(repo.findByNaturalKey(first.scenario, sibling.problem)?.id).toBe(sibling.id)
    expect(repo.findByNaturalKey('不存在的场景', 'x')).toBeNull()

    // seed 重灌腿：定位 → 覆盖 → 记 seed_hash，条数不变
    repo.setSeedHash(first.id, 'seed-1')
    const existing = repo.findByNaturalKey(first.scenario, first.problem)
    expect(existing?.seedHash).toBe('seed-1')
    expect(repo.list()).toHaveLength(2)
    h.close()
  })
})

describe('CORE-PB-04 · 排序确定性（FR-2.4 / §8.2 ⑤）', () => {
  it('同输入两次渲染逐字节相同；码点序而非 localeCompare，verified 不参与排序', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const b = mk(repo, { scenario: 'B 场景', practice: '做法 B。', verified: true })
    const a = mk(repo, { scenario: 'A 场景', practice: '做法 A。' })
    const c = mk(repo, { scenario: 'C 场景', practice: '做法 C。', verified: true })

    const ids = [c.id, a.id, b.id]
    expect(sha(repo.renderMd({ playbookIds: ids }))).toBe(sha(repo.renderMd({ playbookIds: ids })))
    // 输入顺序打乱后字节不变 ⇒ 排序键不依赖选集顺序
    expect(sha(repo.renderMd({ playbookIds: [b.id, c.id, a.id] }))).toBe(
      sha(repo.renderMd({ playbookIds: [a.id, b.id, c.id] })),
    )
    const md = repo.renderMd({ playbookIds: ids })
    expect(md.indexOf('A 场景')).toBeLessThan(md.indexOf('B 场景'))
    expect(md.indexOf('B 场景')).toBeLessThan(md.indexOf('C 场景'))
    h.close()
  })

  it('空选集 → EMPTY_SELECTION；缺失 id → STALE_SELECTION（错误码单一出处）', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const a = mk(repo)
    expect(() => repo.renderMd({ playbookIds: [] })).toThrow(AppError)
    try {
      repo.renderMd({ playbookIds: [a.id, 'pbx_gone'] })
      expect.unreachable()
    } catch (err) {
      expect((err as AppError).code).toBe('STALE_SELECTION')
    }
    h.close()
  })
})

describe('CORE-PB-05 · related* 三道闸（§6.2）', () => {
  it('三个数组各自的自指与不存在两型负向腿均拒 VALIDATION_ERROR', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const prompt = h.db
      .prepare(
        `INSERT INTO prompts (id, title, content, content_hash, created_at, updated_at)
         VALUES ('prm_x','t','c','h','t','t')`,
      )
      .run()
    const term = h.db
      .prepare(
        "INSERT INTO terms (id, zh, definition, created_at, updated_at) VALUES ('trm_x','甲','d','t','t')",
      )
      .run()
    const skill = h.db
      .prepare(
        `INSERT INTO skills (id, name, description, source, created_at, updated_at)
         VALUES ('sk_x','pdf','d','manual','t','t')`,
      )
      .run()
    expect([prompt.changes, term.changes, skill.changes]).toEqual([1, 1, 1])

    const a = mk(repo)
    // 存在的引用放行（三张表都通）
    const linked = mk(repo, {
      scenario: 'S2',
      problem: 'P2',
      relatedPromptIds: ['prm_x'],
      relatedTermIds: ['trm_x'],
      relatedSkillIds: ['sk_x'],
    })
    expect(linked.relatedTermIds).toEqual(['trm_x'])

    // 自指：三条腿各一条
    expect(() => repo.update(a.id, { relatedPromptIds: [a.id] })).toThrow(/relatedPromptIds/)
    expect(() => repo.update(a.id, { relatedTermIds: [a.id] })).toThrow(/relatedTermIds/)
    expect(() => repo.update(a.id, { relatedSkillIds: [a.id] })).toThrow(/relatedSkillIds/)

    // 不存在：三条腿各一条
    expect(() => repo.update(a.id, { relatedPromptIds: ['prm_missing'] })).toThrow(/prm_missing/)
    expect(() => repo.update(a.id, { relatedTermIds: ['trm_missing'] })).toThrow(/trm_missing/)
    expect(() => repo.update(a.id, { relatedSkillIds: ['sk_missing'] })).toThrow(/sk_missing/)

    // 负向腿必须留痕：非法引用不得半落库
    const unchanged = repo.get(a.id)
    expect(unchanged?.relatedPromptIds).toEqual([])
    expect(unchanged?.relatedTermIds).toEqual([])
    expect(unchanged?.relatedSkillIds).toEqual([])
    expect(() =>
      mk(repo, { scenario: 'S3', problem: 'P3', relatedSkillIds: ['sk_missing'] }),
    ).toThrow(/sk_missing/)
    h.close()
  })

  it('删除只动自身：related* 指向的是另外三张表，删技巧不会让任何引用悬挂', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const term = h.db
      .prepare(
        "INSERT INTO terms (id, zh, definition, created_at, updated_at) VALUES ('trm_y','乙','d','t','t')",
      )
      .run()
    expect(term.changes).toBe(1)
    const target = mk(repo)
    const other = mk(repo, { scenario: 'S4', problem: 'P4', relatedTermIds: ['trm_y'] })
    expect(other.relatedTermIds).toEqual(['trm_y'])

    repo.delete(target.id)
    expect(repo.get(target.id)).toBeNull()
    expect(repo.get(other.id)?.relatedTermIds).toEqual(['trm_y'])
    expect(() => repo.delete(target.id)).toThrow(/技巧不存在/)
    h.close()
  })
})

describe('CORE-PB-06 · FR-4.2 置真须显式带证据', () => {
  it('false→true 的腿不带本次 evidence 即拒；补证据即过', () => {
    const h = newDb()
    const repo = new PlaybooksRepo(h.db)
    const a = mk(repo)

    expect(() => repo.update(a.id, { verified: true })).toThrow(/evidence/)
    expect(repo.get(a.id)?.verified).toBe(false)

    const done = repo.update(a.id, {
      verified: true,
      evidence: [{ command: 'grep -c ERROR /var/log/app.log', resultSummary: '0 行 ERROR' }],
    })
    expect(done.verified).toBe(true)
    expect(done.evidence).toHaveLength(1)
    h.close()
  })
})
