import js from '@eslint/js'
import importX from 'eslint-plugin-import-x'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

// 依赖规则（design.md §1.1 / dev-plan §1.1）：
// R1 apps/* → packages/{core,adapters,shared}
// R2 packages/{core,adapters} → 仅 packages/shared
// R3 packages/core 禁止依赖任何 app（CLI 离线模式前提）
// R4 web 与 server 只经 HTTP API 交互（eslint 辅助，最终以代码评审为准）
const boundaryZones = [
  {
    target: './packages/shared',
    from: ['./apps', './packages/core', './packages/adapters'],
    message: 'R2: shared 是最底层包，禁止依赖上层',
  },
  {
    target: './packages/core',
    from: ['./apps'],
    message: 'R3: packages/core 禁止依赖任何 app/server（CLI 离线模式前提）',
  },
  {
    target: './packages/core',
    from: ['./packages/adapters'],
    message: 'R2: core 只依赖 packages/shared（编排发生在 apps/server）',
  },
  {
    target: './packages/adapters',
    from: ['./apps'],
    message: 'R2: adapters 禁止依赖 apps',
  },
  {
    target: './packages/adapters',
    from: ['./packages/core'],
    message: 'R2: adapters 只依赖 packages/shared',
  },
]

const r4NoCrossApp = (others) => [
  'error',
  {
    patterns: [
      {
        // 含子路径（@openvibe/x/*），否则 exports 子路径导出会绕过 R4
        group: others.flatMap((name) => [
          `@openvibe/${name}`,
          `@openvibe/${name}/*`,
          `../../${name}/*`,
        ]),
        message: 'R4: apps 之间只经 HTTP API 交互，禁止直接 import',
      },
    ],
  },
]

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**', 'content/**', '**/*.md'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // 验收走查驱动器（docs/devlog-evidence/**.mjs）：Node 侧脚本，起子进程 + 裸 CDP，
    // 不是产品代码也不进任何 app 运行时，故只补它用到的那几个全局。
    files: ['docs/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        WebSocket: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // 匿名遥测接收端（deploy/telemetry/*）：一份 Worker 源码 + 一层 node:http 外壳，
    // 既跑在 Cloudflare Workers 也跑在本地 node，只补它两边用到的那几个全局。
    files: ['deploy/**'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: boundaryZones }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: { 'no-restricted-imports': r4NoCrossApp(['server', 'cli']) },
  },
  {
    files: ['apps/server/**/*.ts'],
    rules: { 'no-restricted-imports': r4NoCrossApp(['web', 'cli']) },
  },
  {
    files: ['apps/cli/**/*.ts'],
    rules: { 'no-restricted-imports': r4NoCrossApp(['web', 'server']) },
  },
  {
    // serve 是 dev-plan §1.2 启动序列的组合根：步骤 3/4/6/7 归属 apps/server/src/bootstrap.ts
    // （design §3 把 bootstrap 画在 server），而发现链按 m6b §3 归属 CLI，故此处只能直接调
    // bootstrap 而非起子进程。全仓仅此文件被放行 import server；对 web 的禁令依旧（见 DEV-0018 C-40）。
    files: ['apps/cli/src/commands/serve.ts'],
    rules: { 'no-restricted-imports': r4NoCrossApp(['web']) },
  },
  prettier,
)
