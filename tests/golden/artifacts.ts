import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { directoryFiles, type RenderedPack } from '@openvibe/core'

/** 本模块即位于快照根，不做二次跳转（曾错拼出 tests/tests/golden） */
export const GOLDEN_ROOT = dirname(fileURLToPath(import.meta.url))

/** 快照 = 目录导出形态（design §7.1 原样）+ 三份可读侧车 */
export function goldenArtifacts(rendered: RenderedPack): Record<string, string> {
  return {
    ...directoryFiles(rendered),
    'fingerprint.txt': `${rendered.fingerprint}\n`,
    'covered.txt': `${rendered.coveredPlatforms.join('\n')}\n`,
    'warnings.txt': rendered.warnings.length
      ? `${rendered.warnings.join('\n')}\n`
      : '',
  }
}

export function walkFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

// ============ adapter 夹具（adapter-fixtures.md FR-1/FR-2，A 级：队列 ㊺ 判 A）============

import { readFileSync } from 'node:fs'
import { ADAPTER_IDS, renderFrontmatter, type AdapterId, type ResolvedPack } from '@openvibe/shared'
import { ADAPTER_MAIN_PATH, registry } from '@openvibe/adapters'

/** adapter 夹具根：`tests/golden/adapters/<id>/`（G1/G2/G3 的同族目录，但按 id 一层） */
export const ADAPTER_FIXTURE_ROOT = join(GOLDEN_ROOT, 'adapters')

/** 每份夹具的固定文件集（存在性闸据此比对，spec FR-1） */
export const ADAPTER_FIXTURE_FILES = ['adapter.json', 'path.txt', 'shell.txt'] as const

/**
 * 单份 adapter 夹具的字节集。**只测 adapter 自己的职责：路径 + 壳**（FR-1.1）——
 * 不 import composer、不调 composePack，正文因此结构上无法进夹具（ADP-FIX-01 的静态前提）。
 * FR-1.2 可复算三禁：无时间戳、无绝对路径、无 locale 依赖（JSON 键序固定、码点序渲染）。
 */
export function adapterArtifacts(id: AdapterId, pack: ResolvedPack): Record<string, string> {
  const adapter = registry[id]
  if (!adapter) throw new Error(`adapter 夹具生成：注册表外 id ${id}`)
  const planned = adapter.plan(pack)
  const main = planned.find((f) => f.path === ADAPTER_MAIN_PATH[id])
  if (!main) throw new Error(`adapter ${id} 未产出主路径 ${ADAPTER_MAIN_PATH[id]}`)
  const meta = {
    id: adapter.id,
    mainPath: ADAPTER_MAIN_PATH[id],
    l1Capability: adapter.l1Capability,
    hasFrontmatter: main.frontmatter !== undefined,
  }
  return {
    'path.txt': `${ADAPTER_MAIN_PATH[id]}\n`,
    // 无 frontmatter 的四家 shell.txt 为空文件（零字节也是可复算字节）
    'shell.txt': main.frontmatter === undefined ? '' : renderFrontmatter(main.frontmatter),
    'adapter.json': `${JSON.stringify(meta, null, 2)}\n`,
  }
}

/**
 * FR-2.1 存在性闸的**纯函数核**（双向）：registry id 集与磁盘夹具目录集的对称差。
 * 变异腿（GOLD-ADP-02：删目录 ⇒ missing 红；多目录 ⇒ extra 红）直接单测本函数，无需动真实夹具。
 */
export function adapterFixtureDrift(
  registryIds: readonly string[],
  dirsOnDisk: readonly string[],
): { missing: string[]; extra: string[] } {
  const want = new Set(registryIds)
  const have = new Set(dirsOnDisk)
  const missing = [...want].filter((id) => !have.has(id)).sort()
  const extra = [...have].filter((d) => !want.has(d)).sort()
  return { missing, extra }
}

/** 生成态：注册表声明序的全部 id（FR-2 断言与生成脚本共用，保证两侧集合同源） */
export function allAdapterIds(): AdapterId[] {
  return [...ADAPTER_IDS]
}

/** 读磁盘上某 id 夹具的全部文件（生成脚本与测试共用同一读取路径） */
export function readAdapterFixture(id: AdapterId): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of ADAPTER_FIXTURE_FILES) {
    out[rel] = readFileSync(join(ADAPTER_FIXTURE_ROOT, id, rel), 'utf8')
  }
  return out
}
