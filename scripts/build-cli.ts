/**
 * pkg:cli —— 把 workspace 形态的 CLI 变成可发布的 `openvibe-cli` 单文件包（T9-2）。
 *
 * 为什么必须有这一步（实测于 `bbf5fc2`，见 DEV-0019 之后的 T9 开工盘点）：
 * `apps/cli/package.json` 是 `private: true` + `bin → ./src/index.ts` 且**没有任何 build 脚本**，
 * 而 bootstrap/seed-dir 的产物路径按 monorepo 布局解析——`npx openvibe-cli serve --open`
 * 在今天的仓库形态下起不来（onboarding §7 验收 1 的第一条命令不成立）。
 *
 * 产出的暂存包（`apps/cli/pkg/`，gitignore）：
 *   package.json          发布清单：只留 better-sqlite3 一个外部依赖（原生模块不可 bundle）
 *   dist/cli.js           esbuild bundle（含 4 个 @openvibe/* 内部包 + 全部三方依赖）+ shebang
 *   dist/web/             apps/web/dist 的整份拷贝（asset-roots 的发布候选）
 *   dist/seed/            content/seed 的拷贝
 *   dist/migrations/      core 的 SQL（runner.ts 按 import.meta.url 找 ./migrations，打包后即此处）
 *   README.md / LICENSE
 */
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { CLI_VERSION } from '../apps/cli/src/version'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STAGE = join(REPO, 'apps', 'cli', 'pkg')
const DIST_WEB = join(REPO, 'apps', 'web', 'dist')
const SEED_DIR = join(REPO, 'content', 'seed')
const MIGRATIONS_DIR = join(REPO, 'packages', 'core', 'src', 'db', 'migrations')

/** D17 定案：npm 包名与冷启动命令 `openvibe-cli`（`openvibe` 已被占），装后 bin 为 `openvibe` */
export const PUBLISH_NAME = 'openvibe-cli'
/**
 * 不带 `./` 前缀：`npm publish` 的 normalize 会把 `./dist/cli.js` 改写成 `dist/cli.js`
 * 并打一条误导性的「was invalid and removed」警告（实测 npm 11）。写成品即可让
 * **我们沙箱里装过的那份清单 == npm 上别人装到的那份**。
 */
export const PUBLISH_BIN_PATH = 'dist/cli.js'

export interface PublishManifestOptions {
  version: string
  /** 打包后仍需 npm 安装的运行时依赖；目前只有原生模块（esbuild 不能 bundle .node） */
  runtimeExternal: Record<string, string>
}

/**
 * 由 workspace 清单生成发布清单：透传面向用户的元数据，替换 name/bin/files/type/dependencies，
 * 剥掉 private/scripts/devDependencies 与全部 workspace 协议依赖。
 * `pnpm publish --dry-run` 只生成临时清单，不会替仓库补 license/repository/engines——故这些
 * 必须写在 `apps/cli/package.json` 里，由 `tests/publish-manifest.test.ts` 逐条盯住。
 */
export function publishManifest(
  source: Record<string, unknown>,
  options: PublishManifestOptions,
): Record<string, unknown> {
  const passthrough = [
    'description',
    'keywords',
    'license',
    'author',
    'repository',
    'homepage',
    'bugs',
    'funding',
  ] as const
  const meta: Record<string, unknown> = {}
  for (const key of passthrough) if (source[key] !== undefined) meta[key] = source[key]
  return {
    name: PUBLISH_NAME,
    version: options.version,
    ...meta,
    type: 'module',
    bin: { openvibe: PUBLISH_BIN_PATH },
    files: ['dist'],
    engines: source.engines ?? { node: '>=22' },
    dependencies: options.runtimeExternal,
  }
}

function fail(message: string): never {
  console.error(`[pkg:cli] ${message}`)
  process.exit(1)
}

const kb = (bytes: number): string => (bytes / 1000).toFixed(2)

/**
 * ESM 产物里的 CJS 依赖（commander 等）会走 esbuild 的 `__require` 垫片，而垫片在 ESM 下
 * 默认抛 `Dynamic require of "node:events" is not supported`（实测：装好的包一起步就崩）。
 * 补一个真实的 `require`——tsup 的同款做法，`typeof require !== 'undefined'` 遂命中它。
 */
const ESM_REQUIRE_SHIM =
  "import { createRequire as __openvibeCreateRequire } from 'node:module';\nconst require = __openvibeCreateRequire(import.meta.url);\n"

export async function main(): Promise<void> {
  if (!existsSync(join(DIST_WEB, 'index.html'))) {
    fail(`缺少 Web 产物（${join(DIST_WEB, 'index.html')}），先跑 pnpm --filter @openvibe/web build`)
  }
  const sourceManifest = JSON.parse(
    readFileSync(join(REPO, 'apps', 'cli', 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  const coreDeps = (
    JSON.parse(readFileSync(join(REPO, 'packages', 'core', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
  ).dependencies
  const betterSqlite3 = coreDeps['better-sqlite3']
  if (!betterSqlite3) fail('packages/core 未声明 better-sqlite3，发布清单的运行时依赖无从取值')

  rmSync(STAGE, { recursive: true, force: true })
  mkdirSync(join(STAGE, 'dist'), { recursive: true })

  const outfile = join(STAGE, 'dist', 'cli.js')
  const result = await build({
    entryPoints: [join(REPO, 'apps', 'cli', 'src', 'index.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // .node 原生绑定不可 bundle；其余（含 4 个 workspace 包与 pinyin-pro 词表）全部内联
    external: ['better-sqlite3'],
    banner: { js: `#!/usr/bin/env node\n${ESM_REQUIRE_SHIM}` },
    legalComments: 'none',
    minify: false,
    metafile: true,
  })
  chmodSync(outfile, 0o755)

  cpSync(DIST_WEB, join(STAGE, 'dist', 'web'), { recursive: true })
  cpSync(SEED_DIR, join(STAGE, 'dist', 'seed'), { recursive: true })
  // 迁移脚本不是模块而是运行时 readdir 的目录（core/db/runner.ts 的 MIGRATIONS_DIR）：
  // bundle 后 import.meta.url 指向 dist/cli.js，SQL 必须与它同目录，否则装好的包一起步就 MIGRATION_FAILED。
  const migrationFiles = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    : []
  if (migrationFiles.length === 0) fail(`缺少迁移脚本（${MIGRATIONS_DIR}）`)
  cpSync(MIGRATIONS_DIR, join(STAGE, 'dist', 'migrations'), { recursive: true })
  copyFileSync(join(REPO, 'README.md'), join(STAGE, 'README.md'))
  copyFileSync(join(REPO, 'LICENSE'), join(STAGE, 'LICENSE'))
  writeFileSync(
    join(STAGE, 'package.json'),
    `${JSON.stringify(publishManifest(sourceManifest, {
      version: CLI_VERSION,
      runtimeExternal: { 'better-sqlite3': betterSqlite3 },
    }), null, 2)}\n`,
  )

  const inputs = Object.keys(result.metafile?.inputs ?? {}).length
  const bytes = statSync(outfile).size
  const warnCount = result.warnings.length
  console.log(
    `[pkg:cli] ${PUBLISH_NAME}@${CLI_VERSION} → ${STAGE.replace(`${REPO}/`, '')}/` +
      `（cli.js ${kb(bytes)} kB，${inputs} 个模块内联，${warnCount} 条 esbuild 警告）`,
  )
  if (warnCount > 0) for (const w of result.warnings) console.log(`  ! ${w.text}`)
}

// 被测试 import 时不触发构建：只有 `tsx scripts/build-cli.ts` 这种直接调用才走 main()
if ((process.argv[1] ?? '').endsWith('scripts/build-cli.ts')) await main()
