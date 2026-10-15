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
  {
    // R5: 服务层在 repos/db **之上**（service-layer.md FR-4.1）。
    //
    // ⚠️ **spec 的 FR-4.1 把 target/from 写反了，本处按其 message 的语义纠正**。
    // spec 原文：`{ target: './packages/core/src/services', from: ['./packages/core/src/repos', './packages/core/src/db'] }`，
    // 但 `no-restricted-paths` 的语义是「target 里的文件不得 import from 里的路径」，
    // 照抄实测会得到**恰好相反**的规则：禁止服务层 import repos（实测 lint 报 14 处错，全在这里）。
    // 那会把服务层打死 —— 服务层的本职就是编排 repo。
    // spec 自己写的 message「repos／db 是下层，禁止回调服务层」才是对的语义：**禁止下层回调上层**。
    // 故 target = 下层（repos/db），from = 上层（services）。这正是 R1–R4 全部五条 zone 的同一形制。
    target: ['./packages/core/src/repos', './packages/core/src/db'],
    from: ['./packages/core/src/services'],
    message: 'R5: repos／db 是下层，禁止回调服务层',
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
    // build/ 与 .zwork/ 已在 .gitignore 里，本机却会长期驻留临时脚本：ESLint 默认不受 gitignore
    // 约束，这些文件会把 pnpm lint 变成噪声闸（实测一次 228 条报错全来自它们）。dist 已经排除，
    // 同类的本机产物一并排除；CI 是干净 checkout，少不掉任何真实覆盖。
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'build/**',
      '.zwork/**',
      'coverage/**',
      'content/**',
      '**/*.md',
    ],
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
  {
    // R5 · 传输无关（service-layer.md FR-4.2）。
    //
    // **为什么要单列一条 `no-restricted-imports` 而不是并进 R5 zone**：`no-restricted-paths`
    // 的 zone 只描述**本地路径**之间的依赖，表达不了「不得 import fastify／@clack」——
    // 这些是包名不是路径。分析文 §4.10 说「与现有 R1–R4 同法」是错的，本条已订正。
    //
    // **必须含子路径形式**（`@clack/*`、`fastify/*`），否则 `exports` 子路径导出会绕过它——
    // 理由照 `:44` 的既有注释，`@clack/prompts/dist/x` 这类写法正是绕过面。
    // `node:child_process` 不在 FR-4.2 原列表，但 FR-1.3 明写禁止：core 起子进程就破坏了
    // 「core 可在无 app 环境下运行」的前提，故一并纳入。
    files: ['packages/core/src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fastify',
                'fastify/*',
                '@fastify/*',
                'commander',
                '@clack/*',
                'node:http',
                'node:https',
                'node:net',
                'node:readline',
                'node:tty',
                'node:child_process',
              ],
              message:
                'R5: 服务层与传输无关，禁止 import 传输层／终端交互／子进程依赖（终端交互经 deps 注入）',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
