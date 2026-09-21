import { createHash } from 'node:crypto'
import type { ResolvedPack } from '@openvibe/shared'

/**
 * golden 三夹具（dev-plan §9-T6「GOLDEN-G1/G2/G3 全产物字节断言」）。
 * 输入必须自包含——不读 content/seed，否则 owner 审校种子会误伤契约快照。
 */
const hash = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex')

/** exportedAt 冻结：让 manifest 也成为可比对的静态产物（正文本就零时间戳） */
export const GOLDEN_EXPORTED_AT = '2026-09-21T00:00:00Z'

const REVIEW_RULE = `评审代码时按下列顺序输出，每条结论都要给出行号：
1. 正确性与边界条件
2. 并发与资源释放
3. 可读性与命名
不要评论未被修改的行。`

const COMMIT_REFERENCE = `为当前改动写一条 conventional commit：
标题 <type>(<scope>): <一句话>，正文说明动机与影响，保留 {{variables}} 供人填。`

const PLAN_RULE = `接到需求先复述目标与验收标准，再给拆解；
拆解每项不超过半天，标注依赖与可验证产物。`

/** 唯一带变量的 rule：让 warnings.txt 成为静态产物（G3 专属，不进 G1/G2 正文） */
const RELEASE_RULE = `发布前逐条核对：
发布窗口 {{release_window}}，回滚负责人 {{rollback_owner}}。`

export interface GoldenFixture {
  id: 'G1' | 'G2' | 'G3'
  /** m6a 验收条目的对应关系（写进 DEV_LOG 用） */
  covers: string
  pack: ResolvedPack
}

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: 'G1',
    covers: 'm6a §7.4：claude-code + generic-agents + 6 术语 → 恰 4 文件',
    pack: {
      id: 'pk_golden_g1',
      name: 'overseas',
      version: '1.0.0',
      description: '海外双平台最小包',
      targets: ['claude-code', 'generic-agents'],
      flow: null,
      prompts: [
        {
          title: '代码审查请求',
          useAs: 'rule',
          platformMarks: ['claude-code', 'codex'],
          contentHash: hash(REVIEW_RULE),
          content: REVIEW_RULE,
        },
        {
          title: '提交信息生成',
          useAs: 'reference',
          platformMarks: ['generic'],
          contentHash: hash(COMMIT_REFERENCE),
          content: COMMIT_REFERENCE,
        },
      ],
      terms: [
        {
          zh: '规则漂移',
          en: 'rule drift',
          aliases: ['规范漂移'],
          definition: '注入的规则文件与资产库定义不一致的状态。',
          example: 'openvibe diff 检出 CLAUDE.md 漂移。',
        },
        {
          zh: '标准包',
          en: 'standard pack',
          aliases: [],
          definition: '由资产库选集组装出的纯文本项目规则集合。',
          example: '',
        },
        {
          zh: '指纹',
          en: 'fingerprint',
          aliases: ['内容指纹'],
          definition: '对包内全部文件哈希再聚合得到的内容标识。',
          example: '',
        },
        {
          zh: '注入',
          en: 'injection',
          aliases: [],
          definition: '把标准包写入目标项目并登记 lock 的过程。',
          example: '',
        },
        {
          zh: '资产库',
          en: 'asset library',
          aliases: [],
          definition: '提示词、术语、skill 的统一来源与版本库。',
          example: '',
        },
        {
          zh: '检查清单',
          en: 'checklist',
          aliases: ['清单'],
          definition: '流程阶段的可勾选产物列表。',
          example: '',
        },
      ],
      skills: [],
    },
  },
  {
    id: 'G2',
    covers: 'm6a §7.4b：国内三平台正文一致，trae 壳为 alwaysApply（T6 真机核验修订）',
    pack: {
      id: 'pk_golden_g2',
      name: 'domestic',
      version: '1.2.0',
      description: 'CodeBuddy / Trae / MiniCode 三包同名',
      targets: ['codebuddy', 'trae', 'minicode'],
      flow: null,
      prompts: [
        {
          title: '需求拆解纪律',
          useAs: 'rule',
          platformMarks: ['codebuddy'],
          contentHash: hash(PLAN_RULE),
          content: PLAN_RULE,
        },
      ],
      terms: [],
      skills: [],
    },
  },
  {
    id: 'G3',
    covers: 'design §7.3 全节序 + §7.4 全产物：六平台 + 流程 + skill + 变量警告',
    pack: {
      id: 'pk_golden_g3',
      name: 'full',
      version: '2.0.0',
      description: '全 adapter 全产物快照',
      targets: [
        'claude-code',
        'cursor',
        'generic-agents',
        'codebuddy',
        'trae',
        'minicode',
      ],
      flow: {
        templateName: '个人轻量流',
        kind: 'light',
        stages: [
          {
            name: '启动',
            checklist: [
              { id: 'st1', text: '需求一句话写清' },
              { id: 'st2', text: '确认验收标准' },
            ],
            artifacts: ['需求便签'],
          },
          { name: '执行', checklist: [{ id: 'st3', text: '小步提交并自测' }], artifacts: [] },
          { name: '收口', checklist: [], artifacts: ['DEV_LOG 条目'] },
        ],
      },
      prompts: [
        {
          title: '代码审查请求',
          useAs: 'rule',
          platformMarks: ['claude-code'],
          contentHash: hash(REVIEW_RULE),
          content: REVIEW_RULE,
        },
        {
          title: '发布前核对',
          useAs: 'rule',
          platformMarks: ['generic'],
          contentHash: hash(RELEASE_RULE),
          content: RELEASE_RULE,
        },
        {
          title: '需求拆解纪律',
          useAs: 'rule',
          platformMarks: ['generic'],
          contentHash: hash(PLAN_RULE),
          content: PLAN_RULE,
        },
        {
          title: '提交信息生成',
          useAs: 'reference',
          platformMarks: ['cursor'],
          contentHash: hash(COMMIT_REFERENCE),
          content: COMMIT_REFERENCE,
        },
      ],
      terms: [
        {
          zh: '标准包',
          en: 'standard pack',
          aliases: [],
          definition: '由资产库选集组装出的纯文本项目规则集合。',
          example: '',
        },
        {
          zh: '规则漂移',
          en: 'rule drift',
          aliases: [],
          definition: '注入的规则文件与资产库定义不一致的状态。',
          example: '',
        },
      ],
      skills: [
        {
          name: 'pdf',
          description: '读取与改写 PDF',
          skillDir: '~/.claude/skills/pdf',
          versionLabel: 'v3',
        },
        {
          name: 'changelog',
          description: '按提交历史生成变更记录',
          skillDir: '~/.trae/skills/changelog',
          versionLabel: '',
        },
      ],
    },
  },
]
