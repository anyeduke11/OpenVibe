import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveSeedDir, resolveWebRoot } from '../src/lib/asset-roots'

/**
 * T9a-1：`npx openvibe-cli` 的产物链。bootstrap 与 seed-dir 原先各写一条 monorepo 相对路径
 * （bootstrap.ts:50 `HERE/../../web/dist`、seed-dir.ts:13 四级上跳到 content/seed），
 * 打包后两处 HERE 都变成 `<pkg>/dist`，两条解析全部落空 → serve 只剩 API、向导页 404。
 * 注意两个模块的 dev HERE 深度不同（src vs src/lib），所以候选序按各自 HERE 各算一遍。
 */

const roots: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ov-asset-'))
  roots.push(dir)
  return dir
}

/** 发布布局：<pkg>/dist/{cli.js,web/index.html,seed/terms.json}，两处 HERE 同为 dist */
function publishedHere(): string {
  const dist = join(tempRoot(), 'dist')
  mkdirSync(join(dist, 'web', 'assets'), { recursive: true })
  mkdirSync(join(dist, 'seed'), { recursive: true })
  writeFileSync(join(dist, 'cli.js'), '#!/usr/bin/env node\n')
  writeFileSync(join(dist, 'web', 'index.html'), '<!doctype html><div id="root"></div>')
  writeFileSync(join(dist, 'web', 'assets', 'app.js'), 'console.log(1)')
  for (const f of ['terms.json', 'flow-templates.json', 'prompts.json']) {
    writeFileSync(join(dist, 'seed', f), '[]')
  }
  return dist
}

/** 仓库布局：返回 bootstrap 侧 HERE（apps/server/src）与 seed 侧 HERE（apps/server/src/lib） */
function repoHeres(): { webHere: string; seedHere: string } {
  const root = tempRoot()
  const webDist = join(root, 'apps', 'web', 'dist')
  const seed = join(root, 'content', 'seed')
  const lib = join(root, 'apps', 'server', 'src', 'lib')
  mkdirSync(webDist, { recursive: true })
  mkdirSync(seed, { recursive: true })
  writeFileSync(join(webDist, 'index.html'), '<!doctype html>')
  writeFileSync(join(seed, 'terms.json'), '[]')
  return { webHere: join(root, 'apps', 'server', 'src'), seedHere: lib }
}

const ENV_KEYS = ['OPENVIBE_WEB_ROOT', 'OPENVIBE_SEED_DIR'] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  while (roots.length) rmSync(roots.pop() ?? '', { recursive: true, force: true })
})

describe('发布产物资源根（T9a-1）', () => {
  it('ASSET-01: 发布布局下 web/seed 双双命中 dist 内的真实目录', () => {
    const dist = publishedHere()
    expect(resolveWebRoot(dist)).toBe(join(dist, 'web'))
    expect(resolveSeedDir(dist)).toBe(join(dist, 'seed'))
  })

  it('ASSET-02: 仓库布局解析结果与 T8 之前逐字一致（不回归开发者路径）', () => {
    const { webHere, seedHere } = repoHeres()
    expect(resolveWebRoot(webHere)).toBe(join(webHere, '..', '..', 'web', 'dist'))
    expect(resolveSeedDir(seedHere)).toBe(join(seedHere, '..', '..', '..', '..', 'content', 'seed'))
  })

  it('ASSET-03: 环境变量覆盖优先于两种布局', () => {
    const dist = publishedHere()
    const explicit = tempRoot()
    process.env.OPENVIBE_WEB_ROOT = explicit
    process.env.OPENVIBE_SEED_DIR = explicit
    expect(resolveWebRoot(dist)).toBe(explicit)
    expect(resolveSeedDir(dist)).toBe(explicit)
  })

  it('ASSET-04: 半残产物（只拷了 web）不会把 seed 一起判丢', () => {
    const dist = publishedHere()
    rmSync(join(dist, 'seed'), { recursive: true, force: true })
    expect(resolveWebRoot(dist)).toBe(join(dist, 'web'))
    // seed 无产物时如实回落到仓库候选——serve 的警告文案要打的是真正找过的路径
    expect(resolveSeedDir(dist)).toBe(join(dist, '..', '..', '..', '..', 'content', 'seed'))
  })
})
