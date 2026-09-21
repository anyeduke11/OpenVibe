import { describe, expect, it } from 'vitest'
import {
  ADAPTER_IDS,
  PACK_GENERATOR,
  PackBundleSchema,
  PackManifestSchema,
  SCHEMA_VERSION,
  AppError,
  type AdapterId,
  type ResolvedPack,
} from '@openvibe/shared'
import { FlowTemplatesRepo } from '../repos/flows'
import { PromptsRepo } from '../repos/prompts'
import { SkillsRepo } from '../repos/skills'
import { TermsRepo } from '../repos/terms'
import { newDb } from '../test-support/new-db'
import {
  buildBundle,
  bundleFileName,
  composePack,
  directoryFiles,
  fingerprintOf,
  resolvePack,
  validatePackFiles,
  type AdapterBundle,
} from './index'

// ============ 夹具 ============

/** 与 packages/adapters 同构的最小 adapter 注入（R2：core 不得 import adapters，注入即契约） */
const PATHS: Record<AdapterId, string> = {
  'claude-code': 'CLAUDE.md',
  cursor: '.cursor/rules/openvibe.mdc',
  'generic-agents': 'AGENTS.md',
  codebuddy: 'CODEBUDDY.md',
  trae: '.trae/rules/openvibe.md',
  minicode: 'MINI.md',
}

const SHELLS: Partial<Record<AdapterId, Record<string, string | boolean>>> = {
  cursor: { description: '"OpenVibe 标准包 default@1.0.0"', globs: '""', alwaysApply: true },
  trae: { description: 'OpenVibe 标准包 default@1.0.0', alwaysApply: true },
}

const adapters: AdapterBundle = {
  planMainFiles: (pack) =>
    pack.targets
      .map((id) => ({ path: PATHS[id], frontmatter: SHELLS[id] }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  coveredPlatforms: () => ['Codex', 'Cursor'],
}

const base = (): ResolvedPack => ({
  id: 'pk_demo',
  name: 'default',
  version: '1.0.0',
  description: '演示包',
  targets: ['claude-code', 'generic-agents'],
  flow: null,
  prompts: [],
  terms: [],
  skills: [],
})

const compose = (resolved: ResolvedPack) =>
  composePack(resolved, { adapters, exportedAt: '2026-09-21T00:00:00Z' })

// ============ UT-COMPOSE-01 · 确定性与节序 ============

describe('UT-COMPOSE-01 · 正文组装与确定性（m6a §7.1/§7.2）', () => {
  it('同一 resolved 连续两次组装 → 文件集合与逐文件 sha256 完全一致', () => {
    const resolved = base()
    resolved.prompts = [
      {
        title: 'B 规则',
        useAs: 'rule',
        platformMarks: [],
        contentHash: 'h1',
        content: '第一行\n第二行',
      },
      {
        title: 'a 参考',
        useAs: 'reference',
        platformMarks: ['generic'],
        contentHash: 'h2',
        content: '参考正文',
      },
    ]
    const first = compose(resolved)
    const second = compose(base_reshuffled(resolved))
    expect(second.files.map((f) => [f.path, f.sha256])).toEqual(
      first.files.map((f) => [f.path, f.sha256]),
    )
    expect(second.fingerprint).toBe(first.fingerprint)
  })

  it('CLAUDE.md 首尾为受管标记，节序固定且空节整体省略', () => {
    const files = compose(base()).files
    const claude = files.find((f) => f.path === 'CLAUDE.md')!
    const lines = claude.content.split('\n')
    expect(lines[0]).toBe(
      '<!-- openvibe:pack=default@1.0.0 begin (regenerate: npx openvibe-cli sync) -->',
    )
    expect(lines[1]).toBe('# OpenVibe 标准包：default@1.0.0')
    expect(lines[2]).toBe('')
    expect(lines[3]).toBe('> 本文件由 OpenVibe 生成。要修改标准，请回资产库改后重新注入；')
    expect(lines[4]).toBe('> 本地手改会被 `openvibe diff` 漂移检测发现。')
    // 无资产无流程 ⇒ 四个节全部消失，只剩标记收尾
    expect(lines.slice(5)).toEqual(['', '<!-- openvibe:end -->', ''])
    expect(claude.content.endsWith('\n')).toBe(true)
  })

  it('四节按 工作流程/行为规则/术语表/任务提示词参考 出现，prompts 按标题码点序', () => {
    const resolved = base()
    resolved.flow = {
      templateName: '个人轻量流',
      kind: 'light',
      stages: [
        {
          name: '启动',
          checklist: [{ id: 'c1', text: '需求一句话写清' }],
          artifacts: ['需求便签'],
        },
        { name: '收口', checklist: [], artifacts: [] },
      ],
    }
    resolved.prompts = [
      { title: 'z 规则', useAs: 'rule', platformMarks: [], contentHash: 'h', content: 'Z 正文' },
      { title: 'A 规则', useAs: 'rule', platformMarks: [], contentHash: 'h', content: 'A 正文' },
      {
        title: 'm 参考',
        useAs: 'reference',
        platformMarks: [],
        contentHash: 'h',
        content: 'M 正文',
      },
    ]
    resolved.terms = [
      { zh: '规则漂移', en: 'rule drift', aliases: [], definition: '定义', example: '' },
    ]
    const claude = compose(resolved).files.find((f) => f.path === 'CLAUDE.md')!
    const headings = claude.content
      .split('\n')
      .filter((l) => l.startsWith('## ') || l.startsWith('### ') || l.startsWith('#### '))
    expect(headings).toEqual([
      '## 工作流程',
      '### 启动',
      '### 收口',
      '## 行为规则',
      '#### A 规则',
      '#### z 规则',
      '## 术语表',
      '## 任务提示词参考',
      '#### m 参考',
    ])
    expect(claude.content).toContain('见 TERMS.md（1 条）')
    expect(claude.content).toContain('- 需求一句话写清\n\n**产物**: 需求便签')
    // 收口阶段无清单无产物 ⇒ 只剩标题
    expect(claude.content).toContain('### 收口\n\n## 行为规则')
  })

  it('正文零时间戳：换 exportedAt 后所有渲染产物字节不变', () => {
    const resolved = base()
    const a = composePack(resolved, { adapters, exportedAt: '2026-01-01T00:00:00Z' })
    const b = composePack(resolved, { adapters, exportedAt: '2027-12-31T23:59:59Z' })
    expect(b.files).toEqual(a.files)
    expect(b.fingerprint).toBe(a.fingerprint)
    expect(b.manifest.pack.exportedAt).toBe('2027-12-31T23:59:59Z')
    expect(b.manifestJson).not.toBe(a.manifestJson)
  })

  it('壳只在 adapter 声明处叠加：cursor/trae 有 frontmatter，其余正文一致', () => {
    const resolved = base()
    resolved.targets = [...ADAPTER_IDS]
    const files = compose(resolved).files
    const plain = files.find((f) => f.path === 'AGENTS.md')!.content
    expect(files.find((f) => f.path === 'CLAUDE.md')!.content).toBe(plain)
    const cursor = files.find((f) => f.path === '.cursor/rules/openvibe.mdc')!
    expect(cursor.content.startsWith('---\n')).toBe(true)
    expect(cursor.content).toContain(`---\n${plain}`)
    expect(files.find((f) => f.path === '.trae/rules/openvibe.md')!.content).toContain(
      'alwaysApply: true\n---\n',
    )
  })
})

function base_reshuffled(resolved: ResolvedPack): ResolvedPack {
  // 资产顺序打乱 + targets 顺序打乱 ⇒ 产物必须一致（排序键是契约，不是输入顺序）
  return {
    ...structuredClone(resolved),
    targets: [...resolved.targets].reverse(),
    prompts: [...resolved.prompts].reverse(),
  }
}

// ============ UT-COMPOSE-02 · 产物文件集合（m6a §7.4/§7.4b） ============

describe('UT-COMPOSE-02 · 文件集合由 targets + selection 决定', () => {
  it('claude-code + generic-agents + 6 条术语、无流程无 skill → 恰 4 文件（含 manifest）', () => {
    const resolved = base()
    resolved.terms = Array.from({ length: 6 }, (_, i) => ({
      zh: `术语${i}`,
      en: `term-${i}`,
      aliases: [],
      definition: '定义',
      example: '',
    }))
    const r = compose(resolved)
    expect([...r.files.map((f) => f.path), 'openvibe.pack.json'].sort()).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'TERMS.md',
      'openvibe.pack.json',
    ])
    expect(r.coveredPlatforms).toEqual(['Codex', 'Cursor'])
  })

  it('codebuddy + trae + minicode → 恰 4 文件，三份正文与主模板一致', () => {
    const resolved = base()
    resolved.targets = ['codebuddy', 'trae', 'minicode']
    resolved.prompts = [
      { title: '规则', useAs: 'rule', platformMarks: [], contentHash: 'h', content: '正文' },
    ]
    const r = compose(resolved)
    expect(r.files.map((f) => f.path).sort()).toEqual([
      '.trae/rules/openvibe.md',
      'CODEBUDDY.md',
      'MINI.md',
    ])
    const body = r.files.find((f) => f.path === 'CODEBUDDY.md')!.content
    const trae = r.files.find((f) => f.path === '.trae/rules/openvibe.md')!.content
    expect(trae.endsWith(body)).toBe(true)
    expect(r.files.find((f) => f.path === 'MINI.md')!.content).toBe(body)
  })

  it('含流程 → CHECKLIST.md；含 skill → SKILLS.md；恒有 manifest', () => {
    const resolved = base()
    resolved.flow = {
      templateName: '规格驱动流',
      kind: 'spec_driven',
      stages: [
        { name: '对齐', checklist: [{ id: 'a', text: '写规格' }], artifacts: ['spec.md'] },
        { name: '验收', checklist: [{ id: 'b', text: '过清单' }], artifacts: [] },
      ],
    }
    resolved.skills = [
      {
        name: 'pdf',
        description: '处理 PDF',
        skillDir: '~/.claude/skills/pdf',
        versionLabel: 'v3',
      },
    ]
    const r = compose(resolved)
    expect(r.files.map((f) => f.path)).toEqual([
      'AGENTS.md',
      'CHECKLIST.md',
      'CLAUDE.md',
      'SKILLS.md',
    ])
    expect(r.files.find((f) => f.path === 'CHECKLIST.md')!.content).toBe(
      [
        '# 项目检查清单 · default@1.0.0',
        '',
        '## 阶段 1 · 对齐',
        '- [ ] 写规格',
        '',
        '**产物**: spec.md',
        '',
        '## 阶段 2 · 验收',
        '- [ ] 过清单',
        '',
      ].join('\n'),
    )
    expect(r.files.find((f) => f.path === 'SKILLS.md')!.content).toBe(
      [
        '# Skill 清单 · default@1.0.0',
        '',
        '| Skill | 说明 | 本地路径 | 版本 |',
        '|-------|------|----------|------|',
        '| pdf | 处理 PDF | ~/.claude/skills/pdf | v3 |',
        '',
      ].join('\n'),
    )
  })

  it('术语行序按 (en||zh) 小写码点序，`|` 与换行按 m3 §6.5 处理', () => {
    const resolved = base()
    resolved.terms = [
      { zh: '中文优先', en: '', aliases: ['别名|二'], definition: '含\n换行', example: '' },
      { zh: '斑马', en: 'zebra', aliases: [], definition: '定义', example: '' },
      { zh: '苹果', en: 'Apple', aliases: [], definition: '定义', example: '' },
    ]
    const termsMd = compose(resolved).files.find((f) => f.path === 'TERMS.md')!.content
    expect(termsMd.split('\n').slice(0, 7)).toEqual([
      '# 术语表 · default@1.0.0',
      '',
      '> AI 与团队共用的词汇标准；新词请先入库再使用。',
      '',
      '| 术语 | English | 别名 | 定义 |',
      '|------|---------|------|------|',
      '| 苹果 | Apple |  | 定义 |',
    ])
    expect(termsMd).toContain('| 中文优先 |  | 别名\\|二 | 含 换行 |')
    expect(termsMd).toContain('| 斑马 | zebra |  | 定义 |')
  })
})

// ============ UT-FINGERPRINT-01 ============

describe('UT-FINGERPRINT-01 · §7.6 指纹', () => {
  it('对 (path, sha256) 按码点序拼接后取 sha256', async () => {
    const { createHash } = await import('node:crypto')
    const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
    const files = [
      { path: 'CLAUDE.md', sha256: sha('b') },
      { path: '.trae/rules/openvibe.md', sha256: sha('a') },
    ]
    expect(fingerprintOf(files)).toBe(
      sha(`${files[1]!.path}\t${files[1]!.sha256}\n${files[0]!.path}\t${files[0]!.sha256}\n`),
    )
    // 输入顺序无关
    expect(fingerprintOf([...files].reverse())).toBe(fingerprintOf(files))
  })

  it('manifest.files 与指纹自洽：改一个字节即换指纹', () => {
    const r = compose(base())
    expect(r.manifest.fingerprint).toBe(r.fingerprint)
    expect(r.manifest.files.map((f) => f.path)).toEqual(r.files.map((f) => f.path))
    const next = compose(
      (() => {
        const r2 = base()
        r2.description = '另一个描述'
        return r2
      })(),
    )
    expect(next.fingerprint).toBe(r.fingerprint) // 描述不进正文
    const changed = base()
    changed.prompts = [
      { title: '规则', useAs: 'rule', platformMarks: [], contentHash: 'h', content: '正文！' },
    ]
    expect(compose(changed).fingerprint).not.toBe(r.fingerprint)
  })
})

// ============ UT-VALIDATE-01 ============

describe('UT-VALIDATE-01 · §7.7 路径与规模', () => {
  it('非法路径整包拒绝并列出违规项', () => {
    expect(() =>
      validatePackFiles([
        { path: '../escape.md', content: 'x' },
        { path: 'ok.md', content: 'y' },
      ]),
    ).toThrowError(AppError)
    try {
      validatePackFiles([{ path: '/abs.md', content: 'x' }])
      expect.unreachable()
    } catch (err) {
      const e = err as AppError
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(e.httpStatus).toBe(422)
      expect((e.details as { invalidPaths: string[] }).invalidPaths).toEqual(['/abs.md'])
    }
  })

  it('单文件 >512KB / 总量 >2MB → 警告不阻断（m6a §6.4）', () => {
    const big = 'a'.repeat(512 * 1024 + 1)
    expect(validatePackFiles([{ path: 'CLAUDE.md', content: big }])).toHaveLength(1)
    const many = Array.from({ length: 5 }, (_, i) => ({
      path: `f${i}.md`,
      content: 'a'.repeat(500 * 1024),
    }))
    expect(validatePackFiles(many).length).toBeGreaterThan(0)
    expect(() =>
      validatePackFiles(
        Array.from({ length: 201 }, (_, i) => ({ path: `f${i}.md`, content: 'x' })),
      ),
    ).toThrowError(/200/)
  })

  it('composePack 把 rule 提示词的 {{变量}} 落成警告（不阻断）', () => {
    const resolved = base()
    resolved.prompts = [
      {
        title: '带变量',
        useAs: 'rule',
        platformMarks: [],
        contentHash: 'h',
        content: '审查 {{language}} 的 {{scope}}',
      },
      { title: '无变量', useAs: 'rule', platformMarks: [], contentHash: 'h', content: '纯文本' },
    ]
    expect(compose(resolved).warnings).toEqual([
      'rule 提示词「带变量」含 2 个变量（language, scope），注入后需人工填充',
    ])
  })
})

// ============ UT-BUNDLE-01 ============

describe('UT-BUNDLE-01 · 两种交付形态（design §7.1）', () => {
  it('bundle：schemaVersion=1 + manifest 全文 + 文件内容，文件名冻结', () => {
    const r = compose(base())
    const bundle = buildBundle(r)
    expect(bundle.bundleSchemaVersion).toBe(1)
    expect(bundle.manifest).toEqual(r.manifest)
    expect(bundle.files.map((f) => f.path)).toEqual(r.files.map((f) => f.path))
    expect(bundle.files[0]!.content).toBe(r.files[0]!.content)
    expect(bundleFileName('default', '1.0.0')).toBe('openvibe-pack-default-1.0.0.json')
    expect(PackBundleSchema.safeParse(bundle).success).toBe(true)
    expect(PackManifestSchema.safeParse(r.manifest).success).toBe(true)
  })

  it('目录形态：openvibe.pack.json + files/<真实相对路径>', () => {
    const resolved = base()
    resolved.targets = ['cursor']
    const r = compose(resolved)
    const map = directoryFiles(r)
    expect(Object.keys(map).sort()).toEqual([
      'files/.cursor/rules/openvibe.mdc',
      'openvibe.pack.json',
    ])
    expect(map['openvibe.pack.json']).toBe(r.manifestJson)
    expect(map['files/.cursor/rules/openvibe.mdc']).toBe(r.files[0]!.content)
  })

  it('manifest 契约：schemaVersion=1、generator 固定、资产快照全量内嵌（§7.2）', () => {
    const resolved = base()
    resolved.prompts = [
      {
        title: '规则',
        useAs: 'rule',
        platformMarks: ['cursor'],
        contentHash: 'h',
        content: '正文',
      },
    ]
    const manifest = compose(resolved).manifest
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION)
    expect(manifest.pack.generator).toBe(PACK_GENERATOR)
    expect(manifest.pack.id).toBe('pk_demo')
    expect(manifest.targets).toEqual(['claude-code', 'generic-agents'])
    expect(manifest.prompts[0]!.content).toBe('正文')
    expect(manifest.flow).toBeNull()
  })
})

// ============ UT-RESOLVE-01 · 选集物化 ============

describe('UT-RESOLVE-01 · selection → 内容快照（m6a §6.2）', () => {
  function fixture() {
    const h = newDb()
    const prompts = new PromptsRepo(h.db)
    const terms = new TermsRepo(h.db)
    const skills = new SkillsRepo(h.db)
    const flows = new FlowTemplatesRepo(h.db)
    const prompt = prompts.create({
      title: '代码审查请求',
      content: '审查 {{language}}',
      useAs: 'rule',
      platformMarks: ['generic'],
    }).prompt
    const term = terms.create({ zh: '规则漂移', en: 'rule drift', definition: '定义内容' })
    const skill = skills.create({ name: 'pdf', description: '处理 PDF', skillDir: '/tmp/pdf' })
    const flow = flows.create({
      name: '个人轻量流',
      kind: 'light',
      stages: [{ name: '启动', checklist: [{ id: 'c1', text: '写清需求' }], artifacts: ['便签'] }],
    })
    return { h, prompts, terms, skills, flows, prompt, term, skill, flow }
  }

  const selectionOf = (f: ReturnType<typeof fixture>) => ({
    promptIds: [f.prompt.id],
    termIds: [f.term.id],
    skillIds: [f.skill.id],
    playbookIds: [],
    flowTemplateId: f.flow.id,
  })

  it('四类资产 + 流程全部物化，字段口径对齐 manifest', () => {
    const f = fixture()
    const resolved = resolvePack(
      { id: 'pk_1', name: 'default', description: '', targets: ['claude-code'] },
      selectionOf(f),
      '1.0.0',
      { prompts: f.prompts, terms: f.terms, skills: f.skills, flows: f.flows },
    )
    expect(resolved.prompts[0]).toEqual({
      title: '代码审查请求',
      useAs: 'rule',
      platformMarks: ['generic'],
      contentHash: f.prompt.contentHash,
      content: '审查 {{language}}',
    })
    expect(resolved.terms[0]).toMatchObject({
      zh: '规则漂移',
      en: 'rule drift',
      definition: '定义内容',
    })
    expect(resolved.skills[0]).toMatchObject({ name: 'pdf', skillDir: '/tmp/pdf' })
    expect(resolved.flow).toEqual({
      templateName: '个人轻量流',
      kind: 'light',
      stages: [{ name: '启动', checklist: [{ id: 'c1', text: '写清需求' }], artifacts: ['便签'] }],
    })
    f.h.close()
  })

  it('引用资产已删除 → STALE_SELECTION，明细列出各失效 id', () => {
    const f = fixture()
    f.prompts.delete(f.prompt.id)
    f.terms.delete(f.term.id)
    try {
      resolvePack(
        { id: 'pk_1', name: 'default', description: '', targets: ['claude-code'] },
        selectionOf(f),
        '1.0.0',
        { prompts: f.prompts, terms: f.terms, skills: f.skills, flows: f.flows },
      )
      expect.unreachable()
    } catch (err) {
      const e = err as AppError
      expect(e.code).toBe('STALE_SELECTION')
      expect((e.details as { promptIds: string[] }).promptIds).toEqual([f.prompt.id])
      expect((e.details as { termIds: string[] }).termIds).toEqual([f.term.id])
    }
    f.h.close()
  })

  it('无资产且无流程 → EMPTY_SELECTION（targets 由 schema 挡）', () => {
    const f = fixture()
    expect(() =>
      resolvePack(
        { id: 'pk_1', name: 'default', description: '', targets: ['claude-code'] },
        { promptIds: [], termIds: [], skillIds: [], playbookIds: [], flowTemplateId: null },
        '1.0.0',
        { prompts: f.prompts, terms: f.terms, skills: f.skills, flows: f.flows },
      ),
    ).toThrowError(/EMPTY|空/)
    f.h.close()
  })
})
