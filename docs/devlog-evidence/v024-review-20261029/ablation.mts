import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import {
  AppMetaRepo,
  DevLogRepo,
  FlowTemplatesRepo,
  M9_SEEDS_DIR,
  PacksRepo,
  ProjectsRepo,
  PromptsRepo,
  seedConceptContent,
  seedConceptDeltas,
  seedLangResourceLayer,
  seedLangTopics,
  seedProfilePhases,
  seedTopicEdges,
  seedTopicProfiles,
} from '../../../packages/core/src/index.ts'
import { newDb } from '../../../packages/core/src/test-support/new-db.ts'
import { anchorCandidates } from '../../../packages/core/src/extract/anchor.ts'
import { runExtraction } from '../../../packages/core/src/extract/service.ts'
import { scanProjectSource } from '../../../packages/core/src/source-scan/scan.ts'
import { detectGoToolchain } from '../../../packages/core/src/source-scan/go-scanner.ts'
import { renderPack } from '../../../apps/server/src/lib/pack-assemble.ts'
import type { ExtractCandidateItem } from '../../../packages/shared/src/index.ts'

const fixtureRoot = fileURLToPath(
  new URL('../../../packages/core/src/fixtures/m9', import.meta.url),
)
const baseline = await scanProjectSource({ projectId: 'ablation', root: fixtureRoot, scanId: 1 })
const withoutPython = await scanProjectSource({
  projectId: 'ablation',
  root: fixtureRoot,
  scanId: 1,
  pythonBin: '/nonexistent/openvibe-ablation-python',
})
const goFindings = (result: typeof baseline) =>
  result.findings.filter((finding) => finding.file_rel_path.endsWith('.go'))
assert.equal(baseline.languages.find((language) => language.lang === 'python')?.mode, 'parser')
assert.deepEqual(goFindings(baseline), goFindings(withoutPython))
assert.equal(withoutPython.languages.find((language) => language.lang === 'python')?.mode, null)
assert.ok(withoutPython.warnings.some((warning) => warning.includes('Python')))
assert.ok(baseline.findings.length > withoutPython.findings.length)

const candidate: ExtractCandidateItem = {
  kind: 'prompt',
  title: '日志处理约束',
  body: '禁止记录明文口令。',
  quote: '禁止记录明文口令。',
  log_index: 0,
}
const candidates = [
  candidate,
  { ...candidate, body: '应当记录明文口令。' },
  { ...candidate, quote: '源日志中不存在的语句。' },
]
const anchored = anchorCandidates(candidates, [{ index: 0, text: '项目约束：禁止记录明文口令。' }])
assert.equal(anchored.passed.length, 2)
assert.equal(anchored.dropped.length, 1)
assert.ok(anchored.passed.some((item) => item.body === candidates[1]?.body))

const h = newDb()
let isolation
try {
  const count = (table: string) =>
    (h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  const { prompt } = new PromptsRepo(h.db).create({
    title: '隔离夹具',
    content: '修改前先复现问题，修改后执行回归测试。',
    useAs: 'rule',
    status: 'active',
  })
  const pack = new PacksRepo(h.db).create({
    name: 'v024-ablation',
    description: 'Synthetic evidence only',
    selection: {
      promptIds: [prompt.id],
      termIds: [],
      skillIds: [],
      playbookIds: [],
      flowTemplateId: null,
    },
    targets: ['claude-code', 'generic-agents'],
  })
  const render = () => renderPack(h.db, pack, '1.0.0', '2026-10-29T00:00:00.000Z')
  const beforeSeed = render()
  const topicsBefore = count('lang_topics')
  assert.equal(topicsBefore, 0)
  const seedResults = [
    ...seedLangTopics(h.db, M9_SEEDS_DIR),
    ...seedConceptContent(h.db, M9_SEEDS_DIR),
    seedConceptDeltas(h.db, M9_SEEDS_DIR),
    seedTopicEdges(h.db, M9_SEEDS_DIR),
    ...seedProfilePhases(h.db, M9_SEEDS_DIR),
    ...seedTopicProfiles(h.db),
    ...seedLangResourceLayer(h.db, M9_SEEDS_DIR),
  ]
  assert.ok(seedResults.every((result) => result.status !== 'error'))
  const afterSeed = render()
  assert.ok(count('lang_topics') > topicsBefore)
  assert.deepEqual(afterSeed, beforeSeed)

  const flow = new FlowTemplatesRepo(h.db).create({
    name: '消融流程',
    kind: 'light',
    stages: [{ name: '验证', checklist: [], artifacts: [] }],
  })
  const project = new ProjectsRepo(h.db).create({ name: '消融项目', flowTemplateId: flow.id })
  const log = new DevLogRepo(h.db).create(project.id, {
    type: 'DEV',
    title: '合成日志',
    body: candidate.quote,
  })
  const input = { projectId: project.id, logIds: [log.id], confirm: true }
  let calls = 0
  const runner = {
    id: 'synthetic',
    model: 'synthetic',
    provider: 'synthetic',
    local: false,
    async run() {
      calls += 1
      return JSON.stringify({ schema_version: 1, candidates: [candidate] })
    },
  }
  const deps = { runner, now: () => new Date('2026-10-29T00:00:00.000Z') }
  const beforeExtraction = render()
  const promptsBefore = count('prompts')
  const closed = await runExtraction(h.db, input, deps)
  assert.equal(closed.status, 'gate-closed')
  assert.equal(calls, 0)
  assert.equal(count('agent_ingests'), 0)
  new AppMetaRepo(h.db).write('aiExtractEnabled', true)
  const open = await runExtraction(h.db, input, deps)
  assert.equal(open.status, 'ok')
  assert.equal(calls, 1)
  assert.equal(open.passedCount, 1)
  assert.equal(count('agent_ingests'), 1)
  const pending = h.db.prepare('SELECT status FROM agent_ingests').get() as { status: string }
  assert.equal(pending.status, 'pending')
  assert.equal(count('prompts'), promptsBefore)
  assert.deepEqual(render(), beforeExtraction)
  isolation = {
    m9Data: {
      intervention: 'Same temporary migrated database and fixed pack before/after M9 seed content',
      topicsBefore,
      topicsAfter: count('lang_topics'),
      seedBundles: seedResults.length,
      seedRowsCreated: seedResults.reduce((sum, result) => sum + result.created, 0),
      renderedFiles: beforeSeed.files.length,
      renderedBytesAndFingerprintUnchanged: true,
      inferenceLimit:
        'One synthetic pack; shared migrations/modules remain loaded; not removal or user-value evidence',
    },
    aiGate: {
      intervention:
        'Only aiExtractEnabled changes; same explicit consent, log and synthetic runner',
      closed: { status: closed.status, runnerCalls: 0, pendingRows: 0 },
      open: { status: open.status, runnerCalls: calls, pendingRows: 1 },
      corePromptCountUnchanged: true,
      renderedBytesAndFingerprintUnchanged: true,
      inferenceLimit:
        'Runner is injected; does not test real provider selection, network, model quality or human review',
    },
  }
} finally {
  h.close()
}

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../../', import.meta.url)) })
const lintImport = async (specifier: string) => {
  const results = await eslint.lintText(
    `import { bootstrap } from '${specifier}'\nvoid bootstrap\n`,
    {
      filePath: 'apps/web/src/components/__v024_boundary_probe.ts',
    },
  )
  return results.flatMap((result) => result.messages.map((message) => message.ruleId))
}
const aliasRules = await lintImport('@openvibe/server/bootstrap')
const relativeRules = await lintImport('../../../server/src/bootstrap')
assert.ok(aliasRules.includes('no-restricted-imports'))
assert.equal(relativeRules.length, 0)

console.log(
  JSON.stringify(
    {
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      scope:
        'Local synthetic ablations and characterization probes; no production changes or external requests',
      scanner: {
        sample: 'Four repository synthetic fixtures, not real-project recall evidence',
        intervention: 'Only pythonBin changes to a nonexistent executable',
        goToolchain: await detectGoToolchain(),
        baseline: {
          languages: baseline.languages,
          findings: baseline.findings.length,
          warnings: baseline.warnings,
        },
        withoutPython: {
          languages: withoutPython.languages,
          findings: withoutPython.findings.length,
          warnings: withoutPython.warnings,
        },
        goFindingsUnchanged: true,
        missingPythonExplicit: true,
      },
      anchor: {
        sample:
          'Three handcrafted candidates, including one contradicted body and one absent quote',
        intervention: 'Anchor filter enabled vs shadow pass-through on the same candidates',
        enabled: { passed: anchored.passed.length, dropped: anchored.dropped.length },
        shadowDisabled: { passed: candidates.length, dropped: 0 },
        contradictedBodyWithLiteralQuotePassed: true,
        inferenceLimit:
          'Literal source membership, not entailment; not model hallucination-rate measurement',
      },
      isolation,
      importGuard: {
        intervention:
          'Equivalent illegal cross-app dependency, alias vs relative spelling; lintText only',
        aliasRules,
        relativeRules,
        observedDefect: 'Relative spelling bypasses this R4 import guard',
        inferenceLimit: 'One path-depth pair; not a complete dependency audit',
      },
    },
    null,
    2,
  ),
)
