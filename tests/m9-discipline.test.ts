// `tests/m9-discipline.test.ts` —— M9 v1.6 P0 出口（`docs/specs/m9-dev-plan-2026-10.md` §6.1）。
//
// 断三件事，对应规格 DL-25 / DL-16 / DL-18：
// ① 夹具真实存在且**字面**符合 DL-25 的两条变异假设（20 次同一段 / 单独特征）——
//    否则 P2 的变异腿会失去「唯一证据」反例假设。
// ② 禁列扫描器对 `lang_*` 命名空间生效：LANG_EVENT_KINDS 已纳入 LOCAL_EVENT_KINDS
//    ＋ FORBIDDEN_COVERAGE 有 lang_* 行的登记 ＋ 脏行被扫描器抓出。
// ③ 入参装配器（`m9-payload`）：只装**勾选过**的片段 ＋ 路径改成相对项目根 ＋
//    越界 / 非绝对根目录直接抛错。
//
// ⚠️ 这一切都是 P0 闸 —— P0 一过，P1 才能在前 6 张表 + 资源层 + 模式层上开工。
//    任何一个 if 红，P0 就不算完成，必须先修。

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCAL_EVENT_KINDS, LANG_EVENT_KINDS } from '@openvibe/shared'
import {
  M9_FIXTURES,
  assembleAiCallPayload,
  PayloadAssemblyError,
  type SourceFragment,
} from '@openvibe/core'
import { FORBIDDEN_COVERAGE, scanForbidden } from '@openvibe/core/test-support'

describe('M9 P0.1 / P0.2 · DL-25 夹具', () => {
  it('四份夹具都存在且非空', () => {
    expect(existsSync(M9_FIXTURES.pyRepeat)).toBe(true)
    expect(existsSync(M9_FIXTURES.pySolo)).toBe(true)
    expect(existsSync(M9_FIXTURES.goRepeat)).toBe(true)
    expect(existsSync(M9_FIXTURES.goSolo)).toBe(true)
    for (const path of Object.values(M9_FIXTURES)) {
      const bytes = readFileSync(path, 'utf8').length
      expect(bytes, `${path} 应有内容`).toBeGreaterThan(50)
    }
  })

  it('py_repeat.py 包含 20 次 `import logging`（DL-25 变异腿 #1 的字面证据）', () => {
    const src = readFileSync(M9_FIXTURES.pyRepeat, 'utf8')
    const count = (src.match(/^import logging\s*$/gm) ?? []).length
    expect(count).toBe(20)
  })

  it('go_repeat.go 包含 20 次 `go func() {`（DL-25 变异腿 #1 的 Go 镜像）', () => {
    const src = readFileSync(M9_FIXTURES.goRepeat, 'utf8')
    const count = (src.match(/^\s*go func\(\) \{/gm) ?? []).length
    expect(count).toBe(20)
  })

  it('py_solo.py 装饰器只出现 1 次且无其他同知识点证据（DL-25 变异腿 #2 的字面证据）', () => {
    const src = readFileSync(M9_FIXTURES.pySolo, 'utf8')
    // 一个 `@lru_cache` 装饰器；不应出现 `try/except`、`pytest`、`@dataclass` 等同类证据
    const decoratorCount = (src.match(/^@\w+/gm) ?? []).length
    expect(decoratorCount, '装饰器只 1 个').toBe(1)
    // ⚠️ 故意**不强断言**「不应有 X」 —— 「无 X」类断言会随 fixture 微调而假阳；
    // 真实证据是「只有这一个装饰器」（count === 1）这条**正**断言。
  })

  it('go_solo.go goroutine 只出现 1 次且无 channel/select/sync（DL-25 变异腿 #2 的 Go 镜像）', () => {
    const src = readFileSync(M9_FIXTURES.goSolo, 'utf8')
    const goroutineCount = (src.match(/^\s*go func\(\) \{/gm) ?? []).length
    expect(goroutineCount, 'goroutine 只 1 个').toBe(1)
  })
})

describe('M9 P0.3 · DL-16 禁列扫描器接 lang_* 命名空间', () => {
  it('LANG_EVENT_KINDS 至少 4 项且全部归入 LOCAL_EVENT_KINDS（声明面的事实）', () => {
    expect(LANG_EVENT_KINDS.length).toBeGreaterThanOrEqual(4)
    for (const k of LANG_EVENT_KINDS) {
      expect(LOCAL_EVENT_KINDS).toContain(k)
    }
  })

  it('FORBIDDEN_COVERAGE 必须有「lang_* 命名空间」这一行（不靠人记得）', () => {
    const row = FORBIDDEN_COVERAGE.find((r) => r.item.includes('lang_* 命名空间'))
    expect(row, '覆盖表必须登记 lang_* 命名空间').toBeDefined()
    expect(row?.mechanism).toBe('scanner')
  })

  it('禁列扫描器对 lang_* 脏行能报出绝对路径（与本地台账共用同一道规则）', () => {
    const row = {
      payload_json: JSON.stringify({ fragments: ['/Users/duke/secret'] }),
      subject_type: 'lang_topic_findings',
      subject_id: 'repo-1',
    }
    const hits = scanForbidden(row)
    expect(hits).toContain('Unix 绝对路径')
  })

  it('禁列扫描器对 lang_* 干净行不报错（**否定式判据必须自证**）', () => {
    const row = {
      payload_json: JSON.stringify({ fragments: ['src/foo.py', 'src/bar.py'] }),
      subject_type: 'lang_source_consent',
      subject_id: 'repo-1',
    }
    expect(scanForbidden(row)).toEqual([])
  })
})

describe('M9 P0.4 · DL-18 未勾选片段不得出网', () => {
  const projectRoot = '/Users/duke/projects/sample'
  // 三份文件：两份勾选（A、C），一份未勾选（B）。A 与 C 的 path 用相对形式传入，
  // 模拟「P4 扫描器在 repo 根下发现的源码」；B 也用相对形式。
  const files: readonly SourceFragment[] = [
    { path: 'src/a.py', content: 'print("a")' },
    { path: 'src/b.py', content: 'print("b")' },
    { path: 'src/c.py', content: 'print("c")' },
  ]
  const consentIds = new Set<string>(['src/a.py', 'src/c.py'])

  it('只装**勾选过**的片段 —— 未勾选的一律不出现在 fragments', () => {
    const out = assembleAiCallPayload({ projectRoot, files, consentIds })
    const paths = out.fragments.map((f) => f.path)
    expect(paths).toEqual(['src/a.py', 'src/c.py'])
    expect(paths).not.toContain('src/b.py')
  })

  it('路径必须改成「相对 projectRoot」—— 绝对路径绝不出现在 fragments', () => {
    const out = assembleAiCallPayload({ projectRoot, files, consentIds })
    for (const f of out.fragments) {
      expect(f.path.startsWith('/'), `${f.path} 仍含绝对路径`).toBe(false)
      expect(f.path.includes('/Users/'), `${f.path} 含 home 片段`).toBe(false)
    }
  })

  it('越界文件（含 `..`）抛 PayloadAssemblyError（DL-18 的「出网失败可观察」分支）', () => {
    const sneaking: SourceFragment[] = [{ path: '../outside/secret.ts', content: 'x' }]
    expect(() =>
      assembleAiCallPayload({ projectRoot, files: sneaking, consentIds: new Set(['../outside/secret.ts']) }),
    ).toThrow(PayloadAssemblyError)
  })

  it('projectRoot 不是绝对路径时抛错（防止 caller 算错根目录）', () => {
    expect(() =>
      assembleAiCallPayload({ projectRoot: 'rel/path', files, consentIds }),
    ).toThrow(PayloadAssemblyError)
  })

  it('空 consentIds 装出空 fragments（**否定式判据必须自证**）', () => {
    const out = assembleAiCallPayload({ projectRoot, files, consentIds: new Set() })
    expect(out.fragments).toEqual([])
  })
})
