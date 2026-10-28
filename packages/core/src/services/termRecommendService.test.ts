import { describe, expect, it } from 'vitest'
import { AppError, TERM_RECOMMEND_LIMIT, TERM_RECOMMEND_THRESHOLD } from '@openvibe/shared'
import { newDb, type TestDbHandle } from '../test-support/new-db'
import { createTermRecommendService } from './termRecommendService'
import { TermsRepo } from '../repos/terms'
import { PacksRepo } from '../repos/packs'
import { nowIso } from '../db/runner'

/**
 * P3 · FR-6.2 确定性基线层验收。
 *
 * 口径：**凡是恒真的都不写进来**。每条判据都配一个「改错了就红」的反例说明，
 * 并在关键处自证前置（夹具真的落在门槛以下 / 上限真的咬到了）。
 */

let seqProject = 0

interface StageFixture {
  name: string
  checklist: string[]
}

/** 直插 projects 行：`ProjectsRepo.create` 的阶段来自模板，夹具要自己控阶段与 checklist */
function seedProject(
  h: TestDbHandle,
  opts: { stages: StageFixture[]; localPath?: string; packId?: string },
): string {
  seqProject += 1
  const id = `prj_test_${String(seqProject)}`
  const ts = nowIso()
  h.db
    .prepare(
      `INSERT INTO projects (id, name, local_path, flow_template_id, stages_snapshot,
         current_stage, status, standard_pack_id, standard_pack_version, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, NULL, 'active', ?, NULL, ?, ?)`,
    )
    .run(
      id,
      '夹具项目',
      opts.localPath ?? null,
      JSON.stringify(
        opts.stages.map((s) => ({
          name: s.name,
          checklist: s.checklist.map((text, i) => ({ id: `it_${i}`, text })),
          artifacts: [],
        })),
      ),
      opts.packId ?? null,
      ts,
      ts,
    )
  return id
}

function seedSkill(h: TestDbHandle, name: string, description: string): string {
  const id = `skl_${name}`
  const ts = nowIso()
  h.db
    .prepare(
      `INSERT INTO skills (id, name, description, source, skill_dir, latest_version_id,
         installed_targets, created_at, updated_at)
       VALUES (?, ?, ?, 'manual', NULL, NULL, '[]', ?, ?)`,
    )
    .run(id, name, description, ts, ts)
  return id
}

function seedTerm(
  h: TestDbHandle,
  t: { zh: string; en?: string; aliases?: string[]; domain?: string | null; starter?: boolean },
): string {
  return new TermsRepo(h.db).create({
    zh: t.zh,
    en: t.en,
    aliases: t.aliases ?? [],
    definition: `${t.zh} 的定义`,
    status: 'active',
    domain: (t.domain ?? null) as never,
    starter: t.starter ?? false,
  }).id
}

/** 主夹具：阶段名「复盘」本身就是术语 ⇒ 项目领域 = {产品}；checklist 两句各有命中 */
function seedBaselineFixture(h: TestDbHandle) {
  const tReview = seedTerm(h, { zh: '复盘', domain: '产品' })
  const tAccept = seedTerm(h, { zh: '验收标准', domain: '测试' })
  const tSplit = seedTerm(h, {
    zh: '分而治之',
    domain: '产品',
    aliases: ['任务拆分'],
    starter: true,
  })
  const tCold = seedTerm(h, { zh: '冷门深水', domain: '产品' })
  const projectId = seedProject(h, {
    stages: [{ name: '复盘', checklist: ['任务拆分有依赖序', '输入输出/边界/验收标准逐条可测'] }],
  })
  return { projectId, tReview, tAccept, tSplit, tCold }
}

describe('P3 · FR-6.2 基线打分', () => {
  it('⚠️ 只有够门槛的词条进推荐，且四条夹具走了四种不同路径', () => {
    const h = newDb()
    const { projectId, tReview, tAccept, tSplit, tCold } = seedBaselineFixture(h)
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)

    // 自证前置：这条夹具**确实**造出了非空推荐，否则下面「只剩一条」是永真
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.map((i) => i.termId)).toEqual([tSplit])

    // 被门槛挡掉的四条，各自的原因可复算：
    //   复盘     0(checklist) + 1.5(领域重合) + 0(starter) − 2.0(冷门惩罚) = −0.5
    //   验收标准 2.0(checklist) + 0(领域不重合) + 0 − 2.0 = 0
    //   冷门深水 0 + 1.5 + 0 − 2.0 = −0.5
    for (const id of [tReview, tAccept, tCold]) {
      expect(r.items.find((i) => i.termId === id)).toBeUndefined()
    }

    // 命中的那条：2.0 + 1.5 + 0.5 = 4.0
    expect(r.items[0]?.score).toBe(4.0)
    expect(r.items[0]?.starter).toBe(true)
    h.close()
  })

  it('⚠️ 项目领域由阶段名反推：阶段名一改，结论就翻（证明 1.5 因子不是恒等）', () => {
    const h = newDb()
    const terms = new TermsRepo(h.db)
    const tSplit = seedTerm(h, {
      zh: '分而治之',
      domain: '产品',
      aliases: ['任务拆分'],
      starter: true,
    })
    // 阶段名换成与任何术语都无关的串 ⇒ 推不出项目领域 ⇒ 1.5 消失 ⇒ 2.0+0.5=2.5 < 3.0
    const projectId = seedProject(h, {
      stages: [{ name: '无关阶段', checklist: ['任务拆分有依赖序'] }],
    })
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)

    expect(r.projectDomains).toEqual([])
    expect(r.items.find((i) => i.termId === tSplit)).toBeUndefined()
    // 自证：把阶段名换回「复盘」并补一条名为「复盘」的同领域术语，结论必须回来
    terms.create({
      zh: '复盘',
      definition: '定义',
      status: 'active',
      domain: '产品' as never,
      starter: false,
    })
    const project2 = seedProject(h, { stages: [{ name: '复盘', checklist: ['任务拆分有依赖序'] }] })
    const r2 = createTermRecommendService({ db: h.db }).recommend(project2)
    expect(r2.projectDomains).toEqual(['产品'])
    expect(r2.items.map((i) => i.termId)).toContain(tSplit)
    h.close()
  })

  it('⚠️ 上限真的咬到：造 20 条够门槛的词条，结果不超过上限（不是恒小于 20 的永真）', () => {
    const h = newDb()
    seedTerm(h, { zh: '复盘', domain: '产品' })
    const made: string[] = []
    for (let i = 0; i < 20; i++) made.push(`批量命中词${String(i)}`)
    // checklist 那一句必须**包含**每个词面（打分是 `checklistText.includes(词面)`，方向不能反）
    const projectId = seedProject(h, { stages: [{ name: '复盘', checklist: [made.join(' ')] }] })
    for (const zh of made) seedTerm(h, { zh, domain: '产品', starter: true })
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)

    expect(made.length).toBe(20)
    // 上限必须小于造出来的条数，否则这条判据测不出「上限」而只是测「全都能进」
    expect(TERM_RECOMMEND_LIMIT).toBeLessThan(20)
    expect(r.limit).toBe(TERM_RECOMMEND_LIMIT)
    expect(r.items).toHaveLength(TERM_RECOMMEND_LIMIT)
    h.close()
  })

  it('⚠️ 每条推荐都带非空理由，且理由装的是命中的原文（FR-6.4 可解释）', () => {
    const h = newDb()
    const { projectId } = seedBaselineFixture(h)
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)

    // 自证：本次夹具确实产出了推荐
    expect(r.items.length).toBeGreaterThan(0)
    for (const item of r.items) {
      expect(item.reasons.length).toBeGreaterThan(0)
      for (const reason of item.reasons) expect(reason.text.length).toBeGreaterThan(0)
    }
    // 逐字核对：checklist 理由必须等于项目里那一句原文，不是模板话
    const checklistReason = r.items[0]?.reasons.find((x) => x.kind === 'checklist')
    expect(checklistReason?.text).toBe('任务拆分有依赖序')
    h.close()
  })

  it('⚠️ 推荐结果不含 projects.local_path（FR-7.2）', () => {
    const h = newDb()
    seedTerm(h, { zh: '复盘', domain: '产品' })
    const projectId = seedProject(h, {
      stages: [{ name: '复盘', checklist: ['任务拆分有依赖序'] }],
      localPath: '/Users/duke/绝密本机路径-abc123',
    })
    seedTerm(h, { zh: '分而治之', domain: '产品', aliases: ['任务拆分'], starter: true })
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)

    // 自证：结果非空，否则「不含」是查了个空串
    expect(r.items.length).toBeGreaterThan(0)
    expect(JSON.stringify(r)).not.toContain('绝密本机路径')
    expect(JSON.stringify(r)).not.toContain('/Users/duke')
    h.close()
  })

  it('同一项目两次调用结果逐字一致（纯本地计算，FR-7.1）', () => {
    const h = newDb()
    const { projectId } = seedBaselineFixture(h)
    const svc = createTermRecommendService({ db: h.db })
    expect(JSON.stringify(svc.recommend(projectId))).toBe(JSON.stringify(svc.recommend(projectId)))
    h.close()
  })

  it('项目不存在抛 NOT_FOUND，而不是给一份空推荐假装算过了', () => {
    const h = newDb()
    expect(() => createTermRecommendService({ db: h.db }).recommend('prj_不存在')).toThrow(AppError)
    h.close()
  })

  it('回显门槛与上限，调用方能区分「被挡掉」与「没有」', () => {
    const h = newDb()
    const { projectId } = seedBaselineFixture(h)
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)
    expect(r.source).toBe('baseline')
    expect(r.threshold).toBe(TERM_RECOMMEND_THRESHOLD)
    h.close()
  })
})

describe('P3 · FR-6.1 skill 源（项目绑定的标准包）', () => {
  it('⚠️ skill 因子只在项目**绑了包**时生效，解绑后同一条推荐消失', () => {
    const h = newDb()
    // skill 描述里出现「灰度发布」⇒ 该术语拿 1.0
    const skillId = seedSkill(h, 'release-gate', '发布前的灰度发布与回滚闸')
    seedTerm(h, { zh: '复盘', domain: '产品' }) // 提供项目领域 ⇒ 1.5
    seedTerm(h, { zh: '灰度发布', domain: '产品', starter: true }) // 1.5 + 1.0 + 0.5 = 3.0
    const pack = new PacksRepo(h.db).create({
      name: 'gate-pack',
      targets: ['claude-code'],
      selection: { skillIds: [skillId] },
    })
    const projectId = seedProject(h, {
      stages: [{ name: '复盘', checklist: ['发布闸走查'] }],
      packId: pack.id,
    })
    const svc = createTermRecommendService({ db: h.db })
    const bound = svc.recommend(projectId)
    // 自证：3.0 恰好压线进推荐，且理由里有 skill 来源
    const grey = bound.items.find((i) => i.zh === '灰度发布')
    expect(grey?.score).toBe(3.0)
    expect(grey?.reasons.some((x) => x.kind === 'skill' && x.text === 'release-gate')).toBe(true)

    // 解绑 ⇒ skill 因子消失 ⇒ 1.5+0.5=2.0 < 3.0
    h.db.prepare('UPDATE projects SET standard_pack_id = NULL WHERE id = ?').run(projectId)
    const unbound = svc.recommend(projectId)
    expect(unbound.items.some((i) => i.reasons.some((x) => x.kind === 'skill'))).toBe(false)
    h.close()
  })

  it('⚠️ 包未绑定时不得回退到「全部已装 skill」（否则 438 条全成候选）', () => {
    const h = newDb()
    seedSkill(h, 'release-gate', '发布前的灰度发布与回滚闸')
    seedTerm(h, { zh: '复盘', domain: '产品' })
    const projectId = seedProject(h, { stages: [{ name: '复盘', checklist: ['发布闸走查'] }] })
    const r = createTermRecommendService({ db: h.db }).recommend(projectId)
    expect(r.items.some((i) => i.reasons.some((x) => x.kind === 'skill'))).toBe(false)
    h.close()
  })
})
