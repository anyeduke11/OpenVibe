import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResolvedPack } from '@openvibe/shared'
import { renderFrontmatter } from '@openvibe/shared'
import { ADAPTER_MAIN_PATH, registry } from '@openvibe/adapters'
import { COMPAT_MATRIX } from '@openvibe/adapters'
import {
  ADAPTER_FIXTURE_FILES,
  ADAPTER_FIXTURE_ROOT,
  adapterArtifacts,
  adapterFixtureDrift,
  allAdapterIds,
} from './golden/artifacts'
import { ADAPTER_FIXTURE_INPUT } from './golden/fixtures'

/**
 * adapter 产物夹具与存在性闸（adapter-fixtures.md §7，队列 ㊺ 判 A；refactor-goal-plan W-1·F-3）。
 * 单元层（不进 CLI/integration）：夹具只含「路径 + 壳」，composer 正文零耦合（ADP-FIX-01）。
 * 变异腿走纯函数 `adapterFixtureDrift`（GOLD-ADP-02），不动态增删真实夹具目录。
 */

const ids = allAdapterIds()

describe('GOLD-ADP · adapter 夹具与存在性闸', () => {
  it('GOLD-ADP-01：六个 adapter 各有一份夹具，文件集恰为 {adapter.json, path.txt, shell.txt}', () => {
    for (const id of ids) {
      const dir = join(ADAPTER_FIXTURE_ROOT, id)
      expect(existsSync(dir), `缺夹具目录 ${id}（重生成：pnpm adapters:golden:update）`).toBe(true)
      const onDisk = readdirSync(dir).sort()
      expect(onDisk, `${id} 夹具文件集漂移`).toEqual([...ADAPTER_FIXTURE_FILES].sort())
    }
  })

  it('GOLD-ADP-02（正向）：registry id 集与磁盘目录集相等', () => {
    const dirs = readdirSync(ADAPTER_FIXTURE_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    const drift = adapterFixtureDrift(ids, dirs)
    expect(drift, `夹具与注册表漂移：缺 ${drift.missing} / 多 ${drift.extra}`).toEqual({
      missing: [],
      extra: [],
    })
  })

  it('GOLD-ADP-02（变异腿·纯函数）：删目录 ⇒ missing 红；多目录 ⇒ extra 红；双差 ⇒ 双红', () => {
    const [a, b, c] = ids
    expect(adapterFixtureDrift([a!, b!, c!], [a!, b!, c!])).toEqual({ missing: [], extra: [] })
    // 删一个：磁盘少了 c ⇒ missing 红
    expect(adapterFixtureDrift([a!, b!, c!], [a!, b!])).toEqual({ missing: [c!], extra: [] })
    // 多一个：磁盘多出未注册 id ⇒ extra 红（防「已删平台仍留夹具」的假绿）
    expect(adapterFixtureDrift([a!, b!], [a!, b!, 'ghost-platform'])).toEqual({
      missing: [],
      extra: ['ghost-platform'],
    })
    // 双差
    expect(adapterFixtureDrift([a!], [b!])).toEqual({ missing: [a!], extra: [b!] })
  })

  it('GOLD-ADP-03：夹具可复算——现产与磁盘逐字节相同（无时间戳/无绝对路径/locale 无关）', () => {
    for (const id of ids) {
      const current = adapterArtifacts(id, ADAPTER_FIXTURE_INPUT)
      const onDisk = {
        'path.txt': readFileSync(join(ADAPTER_FIXTURE_ROOT, id, 'path.txt'), 'utf8'),
        'shell.txt': readFileSync(join(ADAPTER_FIXTURE_ROOT, id, 'shell.txt'), 'utf8'),
        'adapter.json': readFileSync(join(ADAPTER_FIXTURE_ROOT, id, 'adapter.json'), 'utf8'),
      }
      expect(onDisk, `${id} 夹具字节漂移（重生成：pnpm adapters:golden:update）`).toEqual(current)
    }
  })
})

describe('ADP-FIX · 夹具分层与路径不变量', () => {
  it('ADP-FIX-01：壳字节与 composer 正文零耦合——两个正文完全不同的 pack 产出同一夹具字节', () => {
    const withBody: ResolvedPack = {
      ...ADAPTER_FIXTURE_INPUT,
      terms: [
        {
          zh: '漂移',
          en: 'drift',
          aliases: [],
          definition: '与库定义不一致。',
          example: '',
        },
      ],
      prompts: [
        {
          title: '正文占位',
          useAs: 'rule',
          platformMarks: ['generic'],
          contentHash: 'x'.repeat(64),
          content: '这段正文永远不会进夹具（FR-1.1）。',
        },
      ],
    }
    for (const id of ids) {
      expect(adapterArtifacts(id, withBody)).toEqual(adapterArtifacts(id, ADAPTER_FIXTURE_INPUT))
    }
  })

  it('ADP-FIX-03(a)：主路径两两非大小写变体（macOS/Windows 不敏感文件系统互覆盖防线）', () => {
    const paths = ids.map((id) => ADAPTER_MAIN_PATH[id])
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const a = paths[i]!.toLowerCase()
        const b = paths[j]!.toLowerCase()
        expect(a, `路径大小写变体冲突：${paths[i]} vs ${paths[j]}`).not.toBe(b)
      }
    }
  })

  it('ADP-FIX-03(b)：无一路径是另一路径的前缀目录（嵌套冲突防线）', () => {
    const paths = ids.map((id) => ADAPTER_MAIN_PATH[id])
    for (const a of paths) {
      for (const b of paths) {
        if (a === b) continue
        expect(b.startsWith(`${a}/`), `嵌套冲突：${b} 在 ${a} 目录之下`).toBe(false)
      }
    }
  })
})

describe('ADP-FIX-04 · 矩阵生成物与 COMPAT_MATRIX 同源', () => {
  it('docs/adapter-matrix.md 现场重渲染 ≡ 磁盘字节（FR-3.3 的测试半；脚本半在 pnpm adapters:matrix:check）', () => {
    // 与 scripts/adapter-matrix.ts 同一渲染逻辑（此处独立重写以避免脚本/测试口径分叉的反向风险：
    // 若两者漂移，本测试会先红，提示先对齐渲染函数）
    const rows = COMPAT_MATRIX.map((r) => `| ${r.platform} | ${r.reads} | ${r.note ?? ''} |`)
    const rendered = [
      '<!-- GENERATED FROM packages/adapters/src/compat.ts — DO NOT EDIT',
      '     手改会被 `pnpm adapters:matrix:check` 判红；重生成：`pnpm adapters:matrix:update`。',
      '     生成范围 = COMPAT_MATRIX 的兼容平台行（adapter-fixtures.md FR-3.1）；',
      '     design §8 的六行专用 adapter 表是手写单源，不在此复制（队列 ㊺ 待裁③ = 不做）。 -->',
      '',
      '# 兼容矩阵 · COMPAT_MATRIX 生成视图',
      '',
      '| platform | reads | note |',
      '| --- | --- | --- |',
      ...rows,
      '',
    ].join('\n')
    const onDisk = readFileSync(join(process.cwd(), 'docs', 'adapter-matrix.md'), 'utf8')
    expect(onDisk).toBe(rendered)
  })

  it('矩阵的每行 reads 都指向某个注册表产物（UT-ADAPTER-04 同款判据，此处对生成物复核）', () => {
    const artifactPaths = new Set(ids.map((id) => ADAPTER_MAIN_PATH[id]))
    for (const row of COMPAT_MATRIX) {
      expect(
        artifactPaths.has(row.reads),
        `矩阵行 ${row.platform} reads=${row.reads} 无对应产物`,
      ).toBe(true)
    }
  })

  it('renderFrontmatter 对空 frontmatter 的行为契约（壳渲染单源与夹具零字节的一致性）', () => {
    // 无壳四家的 shell.txt 是零字节——这是「无 frontmatter」与「空 frontmatter」的区分：
    // renderFrontmatter 只在有 frontmatter 时被调用（artifacts.ts 的三目），本支钉住该语义
    const planned = registry['claude-code'].plan({
      ...ADAPTER_FIXTURE_INPUT,
      targets: ['claude-code'],
    })
    expect(planned[0]?.frontmatter).toBeUndefined()
    // 有壳侧：cursor 的壳以 `---\n` 开头（frontmatter 存在才渲染）
    const cursorPlanned = registry.cursor.plan({ ...ADAPTER_FIXTURE_INPUT, targets: ['cursor'] })
    expect(renderFrontmatter(cursorPlanned[0]!.frontmatter!)).toMatch(/^---\n/)
  })
})
