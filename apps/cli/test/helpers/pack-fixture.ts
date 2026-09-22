import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { coveredPlatforms, planMainFiles } from '@openvibe/adapters'
import { buildBundle, composePack, directoryFiles, type AdapterBundle } from '@openvibe/core'
import {
  PACK_NAME_RE,
  SEMVER_RE,
  type AdapterId,
  type PackBundle,
  type PackManifest,
  type PlannedFileOut,
  type ResolvedPack,
} from '@openvibe/shared'

/**
 * 标准包注入夹具：用**真 adapter** 组合出 bundle，因此路径集与生产一致
 * （`CLAUDE.md` / `.cursor/rules/openvibe.mdc` / `TERMS.md` / `CHECKLIST.md` …），
 * `--target` 与路径安全相关的断言才有意义（packages/core/src/pack/pack.test.ts 用的是桩 adapter）。
 */
const adapters: AdapterBundle = { planMainFiles, coveredPlatforms }

export const EXPORTED_AT = '2026-09-21T00:00:00Z'

export interface PackFixture {
  manifest: PackManifest
  bundle: PackBundle
  /** 渲染产物（含内容），按路径码点序 */
  files: PlannedFileOut[]
  fingerprint: string
}

export interface DemoOptions {
  name?: string
  version?: string
  targets?: AdapterId[]
  /** 主正文里唯一可变的规则提示词内容——换它即让全部主规则文件的哈希变化（UPDATE 分支） */
  ruleBody?: string
  /** 术语尾注：换它只让 TERMS.md 变化 */
  termTail?: string
  withFlow?: boolean
  withSkills?: boolean
  id?: string
}

export function demoResolved(options: DemoOptions = {}): ResolvedPack {
  const name = options.name ?? 'fixture'
  const version = options.version ?? '1.0.0'
  if (!PACK_NAME_RE.test(name) || !SEMVER_RE.test(version)) {
    throw new Error(`夹具包名/版本不合法：${name}@${version}`)
  }
  const targets = options.targets ?? ['claude-code', 'cursor', 'generic-agents']
  return {
    id: options.id ?? 'pk_fixture',
    name,
    version,
    description: 'CLI 注入测试夹具包',
    targets,
    flow:
      options.withFlow === false
        ? null
        : {
            templateName: '规格驱动流',
            kind: 'spec_driven',
            stages: [
              {
                name: '设计',
                checklist: [{ id: 'ck-1', text: '确认边界与验收' }],
                artifacts: ['spec.md'],
              },
            ],
          },
    prompts: [
      {
        title: '写作规范',
        useAs: 'rule',
        platformMarks: [],
        contentHash: '',
        content: `规则正文：${options.ruleBody ?? '第一版'}`,
      },
    ],
    terms: [
      {
        zh: '提示词',
        en: 'prompt',
        aliases: [],
        definition: `喂给模型的需求文本${options.termTail ?? ''}`,
        example: '',
      },
    ],
    skills:
      options.withSkills === true
        ? [
            {
              name: 'demo-skill',
              description: '演示技能',
              skillDir: '/tmp/demo',
              versionLabel: 'v1',
            },
          ]
        : [],
  }
}

export function demoPack(options: DemoOptions = {}): PackFixture {
  const rendered = composePack(demoResolved(options), { adapters, exportedAt: EXPORTED_AT })
  return {
    manifest: rendered.manifest,
    bundle: buildBundle(rendered),
    files: rendered.files,
    fingerprint: rendered.fingerprint,
  }
}

/** 内容查表：路径 → 包内文本 */
export function contentOf(fixture: PackFixture): Record<string, string> {
  return Object.fromEntries(fixture.files.map((f) => [f.path, f.content]))
}

/** bundle 落盘为 `--file` 的目标文件，返回绝对路径 */
export function writeBundleFile(
  dir: string,
  fixture: PackFixture,
  fileName = 'bundle.json',
): string {
  const abs = join(dir, fileName)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, `${JSON.stringify(fixture.bundle, null, 2)}\n`, 'utf8')
  return abs
}

/** 目录导出落盘（`--dir`：openvibe.pack.json + files/<相对路径>），返回导出根目录 */
export function writePackDir(parentDir: string, fixture: PackFixture, dirName = 'packDir'): string {
  const root = join(parentDir, dirName)
  const map = directoryFiles({
    files: fixture.files,
    manifest: fixture.manifest,
    manifestJson: `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    fingerprint: fixture.fingerprint,
    warnings: [],
    coveredPlatforms: [],
  })
  for (const [rel, content] of Object.entries(map)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

/** 深拷贝 + 逐段改写：篡改类用例（§7.4 / §7.5）不污染夹具本身 */
export function cloneBundle(fixture: PackFixture): PackBundle {
  return JSON.parse(JSON.stringify(fixture.bundle)) as PackBundle
}
