import { it, expect } from 'vitest'
import { ESLint } from 'eslint'
import eslintConfig from '../eslint.config.js'

const cwd = process.cwd()

async function lintAs(filename: string, code: string) {
  const eslint = new ESLint({
    overrideConfig: eslintConfig as never,
    overrideConfigFile: true,
    cwd,
  })
  const [result] = await eslint.lintText(code, { filePath: filename })
  return (result?.messages ?? []).map((m) => m.ruleId)
}

// UT-LINT-01 · 依赖规则 R3 生效性（tasks T1 验收第 3 行）：
// packages/core 引 apps/server → import-x/no-restricted-paths 必须报错。
it('UT-LINT-01: core import server 被边界规则拒绝（R3）', async () => {
  const ruleIds = await lintAs(
    'packages/core/src/__lint_fixture__.ts',
    `import { buildApp } from '../../../apps/server/src/app'\nexport { buildApp }\n`,
  )
  expect(ruleIds).toContain('import-x/no-restricted-paths')
})

it('UT-LINT-01b: core import shared 合法、adapters import core 被拒（R2）', async () => {
  const ok = await lintAs(
    'packages/core/src/__lint_fixture_ok__.ts',
    `import { SCHEMA_VERSION } from '@openvibe/shared'\nexport const v = SCHEMA_VERSION\n`,
  )
  expect(ok).not.toContain('import-x/no-restricted-paths')

  const bad = await lintAs(
    'packages/adapters/src/__lint_fixture__.ts',
    `import { CORE_VERSION } from '@openvibe/core'\nexport const v = CORE_VERSION\n`,
  )
  expect(bad).toContain('import-x/no-restricted-paths')
})
