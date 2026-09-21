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
        group: others.flatMap((name) => [`@openvibe/${name}`, `../../${name}/*`]),
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
  prettier,
)
