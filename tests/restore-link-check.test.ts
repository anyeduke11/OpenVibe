import { describe, expect, it } from 'vitest'
import {
  classifyTarget,
  collectSectionRefs,
  createMemoryRepoView,
  diffVerbatim,
  extractSection,
  linkDelta,
  sectionText,
  type PointerStatus,
  type SectionPointer,
} from '../scripts/restore-link-check'

/**
 * `tests/restore-link-check.test.ts` —— 「逐字恢复旧节」自带断链体检的判据。
 *
 * ## 它挡什么
 *
 * 「逐字恢复」只保证**文字一致**，不保证恢复进来的节里的 §-指针仍然落空 ——
 * 一个删掉的节号会被原样带回来，没人发现。本工具把两件事合成一次可复算的检查，
 * 测试就钉在这条缝上。
 *
 * ## 全部用内存夹具（不碰磁盘）
 *
 * 纯函数（取节 / 逐行比对 / 指针抽取 / 断链差）吃字符串；
 * 需要判「目标文件里有没有这一节」的判定层，用 `createMemoryRepoView` 注入一张
 * 内存文件表 ⇒ **一条用例都不读磁盘**，跑得快也不受工作树状态影响。
 */

/* ════════════════════════════════════════════════════════ 夹具 */

/** 一份带 `## §17` 顶层节与 `### 17.1` 子节的 Markdown（形态照抄本仓 docs/dev-plan.md） */
const MARKDOWN = [
  '# 顶部标题',
  '',
  '## §16 上一节',
  '',
  '上一节的正文。',
  '',
  '## §17 恢复回来的那一节',
  '',
  '本节正文第一行。',
  '',
  '### 17.1 子节标题',
  '',
  '子节正文。',
  '',
  '### 17.2 另一个子节',
  '',
  '另一个子节正文。',
  '',
  '## §18 下一节',
  '',
  '下一节的正文。',
  '',
].join('\n')

/** 判定层用的内存仓：`docs/tasks.md` 有 §2c，目标 `docs/specs/theme.md` 有 §3.4 */
const REPO = createMemoryRepoView({
  'docs/tasks.md': ['# tasks', '', '## 2c. P2 任务组', '', '正文。', ''].join('\n'),
  'docs/specs/theme.md': ['# theme', '', '### 3.4 撤销清单', '', '正文。', ''].join('\n'),
  'docs/PRD.md': ['# PRD', '', '## 3. 数据与核心概念', '', '正文。', ''].join('\n'),
})

/** 造一条限定型指针 */
function qualified(file: string, ref: string, line = 1): SectionPointer {
  return { raw: `${file} §${ref}`, file, ref, line, kind: 'qualified' }
}

/* ════════════════════════════════════════════════════════ 取节 */

describe('extractSection · 取整节', () => {
  it('取到 `## §17` 整节：含标题行，含子节，到下一个同级标题为止', () => {
    const s = extractSection(MARKDOWN, '17')
    expect(s).not.toBeNull()
    expect(s!.heading).toBe('## §17 恢复回来的那一节')
    expect(s!.body).toContain('本节正文第一行。')
    expect(s!.body).toContain('### 17.1 子节标题')
    expect(s!.body).toContain('### 17.2 另一个子节')
    // 同级标题 §18 不属于本节
    expect(s!.body).not.toContain('下一节的正文。')
    expect(s!.startLine).toBe(7)
    // 第 18 行是节间空行（§17 与 §18 之间的分隔）⇒ 不属本节
    expect(s!.endLine).toBe(17)
  })

  it('节号带子号（`17.1`）也能取到，且只取到下一个同级或更高级标题为止', () => {
    const s = extractSection(MARKDOWN, '17.1')
    expect(s).not.toBeNull()
    expect(s!.heading).toBe('### 17.1 子节标题')
    expect(s!.body).toContain('子节正文。')
    expect(s!.body).not.toContain('另一个子节')
  })

  it('节号不存在 ⇒ 返回 null（不抛异常）', () => {
    expect(extractSection(MARKDOWN, '99')).toBeNull()
    expect(extractSection(MARKDOWN, '')).toBeNull()
  })

  it('`§17` 与 `17` 是同一个节', () => {
    expect(extractSection(MARKDOWN, '§17')?.heading).toBe(
      extractSection(MARKDOWN, '17')?.heading,
    )
  })

  it('节末空行不算本节（两侧同样剔除 ⇒ 比对对称）', () => {
    const s = extractSection(MARKDOWN, '17')
    expect(s!.body.endsWith('\n')).toBe(false)
  })

  it('整节文本 = 标题行 ＋ 正文（逐字比对要连标题行一起比）', () => {
    const s = extractSection(MARKDOWN, '17')!
    expect(sectionText(s)).toBe(`## §17 恢复回来的那一节\n${s.body}`)
  })
})

/* ════════════════════════════════════════════════════════ 逐字比对 */

describe('diffVerbatim · 逐行严格比对', () => {
  it('完全一致 ⇒ identical，无差异', () => {
    const d = diffVerbatim('甲\n乙\n丙', '甲\n乙\n丙')
    expect(d.identical).toBe(true)
    expect(d.firstDiff).toBeNull()
    expect(d.diffs).toHaveLength(0)
    expect(d.totalLines).toBe(3)
  })

  it('差一个字符 ⇒ 定位到该行，标 changed', () => {
    const d = diffVerbatim('甲\n乙丙\n丁', '甲\n乙丁\n丁')
    expect(d.identical).toBe(false)
    expect(d.firstDiff).toEqual({
      line: 2,
      kind: 'changed',
      original: '乙丙',
      restored: '乙丁',
    })
    expect(d.diffCount).toBe(1)
  })

  it('差一行（恢复侧多一行）⇒ 标 only-restored', () => {
    const d = diffVerbatim('甲\n乙', '甲\n乙\n丙')
    expect(d.firstDiff).toEqual({ line: 3, kind: 'only-restored', restored: '丙' })
    expect(d.totalLines).toBe(3)
  })

  it('差一行（基准侧多一行）⇒ 标 only-original', () => {
    const d = diffVerbatim('甲\n乙\n丙', '甲\n乙')
    expect(d.firstDiff).toEqual({ line: 3, kind: 'only-original', original: '丙' })
  })

  it('差空行 ⇒ 空行算差异（恢复场景要严格逐字）', () => {
    const d = diffVerbatim('甲\n\n乙', '甲\n乙')
    expect(d.identical).toBe(false)
    expect(d.firstDiff).toEqual({ line: 2, kind: 'changed', original: '', restored: '乙' })
  })

  it('差行尾空白 ⇒ 算差异（编辑器顺手改缩进必须被抓住）', () => {
    const d = diffVerbatim('甲  \n乙', '甲\n乙')
    expect(d.identical).toBe(false)
    expect(d.firstDiff?.kind).toBe('changed')
    expect(d.firstDiff?.original).toBe('甲  ')
  })

  it('差异超上限时截断并标注', () => {
    const a = Array.from({ length: 260 }, (_, i) => `L${i}`).join('\n')
    const b = Array.from({ length: 260 }, (_, i) => `M${i}`).join('\n')
    const d = diffVerbatim(a, b)
    expect(d.diffCount).toBe(260)
    expect(d.diffs.length).toBeLessThanOrEqual(200)
    expect(d.truncated).toBe(true)
  })
})

/* ════════════════════════════════════════════════════════ 指针抽取 */

describe('collectSectionRefs · §-指针抽取', () => {
  it('分清限定型与裸型', () => {
    const refs = collectSectionRefs('见 docs/tasks.md §2c，另见 §17.4。')
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({
      kind: 'qualified',
      file: 'docs/tasks.md',
      ref: '2c',
      line: 1,
    })
    expect(refs[1]).toMatchObject({ kind: 'bare', ref: '17.4', line: 1 })
  })

  it('限定型指针带反引号与「的」也认', () => {
    const refs = collectSectionRefs('见 `docs/specs/theme.md` 的 §3.4。')
    expect(refs[0]).toMatchObject({ kind: 'qualified', file: 'docs/specs/theme.md', ref: '3.4' })
  })

  it('限定型指针不会同时被算成一条裸指针', () => {
    const refs = collectSectionRefs('docs/tasks.md §2c')
    expect(refs.filter((r) => r.kind === 'bare')).toHaveLength(0)
  })

  it('行号逐行递增', () => {
    const refs = collectSectionRefs('甲\n乙 docs/tasks.md §2c\n丙 §9')
    expect(refs.map((r) => r.line)).toEqual([2, 3])
  })
})

/* ════════════════════════════════════════════════════════ 落空判定 */

describe('classifyTarget · 指针落空判定', () => {
  const judge = (p: SectionPointer): PointerStatus =>
    classifyTarget(p, '.', REPO)

  it('目标文件存在且有该节 ⇒ ok', () => {
    expect(judge(qualified('docs/tasks.md', '2c'))).toBe('ok')
    expect(judge(qualified('docs/specs/theme.md', '3.4'))).toBe('ok')
  })

  it('目标文件存在但无该节 ⇒ dangling', () => {
    expect(judge(qualified('docs/tasks.md', '9'))).toBe('dangling')
    expect(judge(qualified('docs/specs/theme.md', '7.7'))).toBe('dangling')
  })

  it('目标文件不存在 ⇒ undecidable（不判红，不抢 FR-12.1 的口径）', () => {
    expect(judge(qualified('docs/does-not-exist.md', '3'))).toBe('undecidable')
    expect(judge(qualified('nope.md', '3'))).toBe('undecidable')
  })

  it('裸 § 指针 ⇒ undecidable（本仓裸 § 常指别的文档）', () => {
    expect(judge({ raw: '§17.4', ref: '17.4', line: 1, kind: 'bare' })).toBe('undecidable')
  })

  it('同名文件多处 ⇒ undecidable（不可判，不猜）', () => {
    const dup = createMemoryRepoView({
      'docs/a/theme.md': '## 1. 一\n',
      'docs/b/theme.md': '## 2. 二\n',
    })
    expect(classifyTarget(qualified('theme.md', '1'), '.', dup)).toBe('undecidable')
  })

  it('带路径的写法按仓内相对路径精确命中', () => {
    expect(classifyTarget(qualified('docs/tasks.md', '2c'), '.', REPO)).toBe('ok')
  })

  it('「相对所在目录写的路径」（`specs/onboarding.md`）按 basename 回退命中 —— 与 FR-12.1 同口径', () => {
    // 本仓这类写法普遍存在（`specs/onboarding.md` §7 实为 `docs/specs/onboarding.md`）。
    // FR-12.1 靠 basename 反查认它，本工具必须给出同一个答案，否则两个工具会互相打脸。
    expect(classifyTarget(qualified('specs/theme.md', '3.4'), '.', REPO)).toBe('ok')
    // 目标文件存在但无该节 ⇒ dangling（与 FR-12.1 对 onboarding.md §7 的判定一致）
    expect(classifyTarget(qualified('specs/tasks.md', '9'), '.', REPO)).toBe('dangling')
  })
})

/* ════════════════════════════════════════════════════════ 断链差 */

describe('linkDelta · 断链差', () => {
  it('新增与消除都能算出来', () => {
    const d = linkDelta(['a.md §1', 'b.md §2'], ['b.md §2', 'c.md §3'])
    expect(d.added).toEqual(['c.md §3'])
    expect(d.removed).toEqual(['a.md §1'])
  })

  it('两侧相同 ⇒ 新增与消除都是空', () => {
    const d = linkDelta(['a.md §1'], ['a.md §1'])
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
  })

  it('重复项不重复计数', () => {
    const d = linkDelta(['a.md §1', 'a.md §1'], ['a.md §1'])
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
  })
})
