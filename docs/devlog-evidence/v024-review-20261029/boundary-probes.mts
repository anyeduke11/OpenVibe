// Characterization only: exit 0 means the documented defects reproduced, not safety.
// Run from repository root: TSX_DISABLE_CACHE=1 pnpm exec tsx docs/devlog-evidence/v024-review-20261029/boundary-probes.mts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { InterpretProviderEntry } from '@openvibe/shared'
import { openDatabase, type SqliteDatabase } from '../../../packages/core/src/db/index.ts'
import { createExtractRunner } from '../../../packages/core/src/extract/runner.ts'
import type { RenderedPack } from '../../../packages/core/src/pack/composer.ts'
import { AgentIngestRepo } from '../../../packages/core/src/repos/agentIngest.ts'
import { APP_META_KEYS, AppMetaRepo } from '../../../packages/core/src/repos/appMeta.ts'
import { FlowTemplatesRepo } from '../../../packages/core/src/repos/flows.ts'
import { PacksRepo } from '../../../packages/core/src/repos/packs.ts'
import { ProjectsRepo } from '../../../packages/core/src/repos/projects.ts'
import { createAgentService } from '../../../packages/core/src/services/agentService.ts'
import { createPackService } from '../../../packages/core/src/services/packService.ts'
import { realKeychainStore } from '../../../packages/core/src/source-ai/keychain.ts'
import {
  readProviderCollection,
  writeProviderCollection,
} from '../../../packages/core/src/source-ai/provider-config.ts'
import { readSnippet } from '../../../packages/core/src/source-ai/snippet.ts'

const fixedTime = '2026-10-29T00:00:00.000Z'
const injectedFailure = 'boundary-probe-status-update'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
// Never print exception messages/stacks: they can contain random paths or credentials.
function safeError(error: unknown) {
  const e = error as { name?: unknown; code?: unknown; message?: unknown } | null
  const token = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,80}$/u.test(v) ? v : null)
  return {
    name: token(e?.name),
    code: token(e?.code),
    injected_status_failure: e?.message === injectedFailure,
  }
}
function attempt<T>(fn: () => T) {
  try {
    return { value: fn(), error: null }
  } catch (error) {
    return { value: null, error: safeError(error) }
  }
}
type Check = (name: string, actual: unknown, expected: unknown) => void
type Probe = {
  id: string
  independent_variables: unknown
  inference_boundary: string
  observations: Record<string, unknown>
  assertions: { name: string; actual: unknown; expected: unknown; passed: boolean }[]
  classification: 'not_completed' | 'observed_defect' | 'characterization_failed'
  error?: ReturnType<typeof safeError>
}
const probes: Probe[] = []
async function probe(
  id: string,
  variables: unknown,
  boundary: string,
  body: (o: Probe['observations'], check: Check) => Promise<void>,
) {
  const p: Probe = {
    id,
    independent_variables: variables,
    inference_boundary: boundary,
    observations: {},
    assertions: [],
    classification: 'not_completed',
  }
  probes.push(p)
  const check: Check = (name, actual, expected) => {
    const a = { name, actual, expected, passed: false }
    p.assertions.push(a)
    assert.deepStrictEqual(actual, expected, name)
    a.passed = true
  }
  try {
    await body(p.observations, check)
    p.classification = 'observed_defect'
  } catch (error) {
    p.classification = 'characterization_failed'
    p.error = safeError(error)
  }
}
let scratch: string | undefined
async function database<T>(
  label: string,
  body: (db: SqliteDatabase) => T | Promise<T>,
): Promise<T> {
  assert.ok(scratch)
  const db = openDatabase(join(scratch, `${label}.sqlite`))
  try {
    return await body(db)
  } finally {
    db.close()
  }
}

async function exportProbe() {
  await probe(
    'A_export',
    {
      changed: ['rendered.fingerprint', 'rendered.files[0].content'],
      arms: ['unchanged', 'changed'],
      held_fixed:
        'Fresh identical DB fixtures; pack, version=1.0.0, download then directory, injected clock, manifest, file metadata and writer spy are identical. Only the second render differs between arms.',
    },
    'Real service/repo with a synthetic renderer and memory-only writer spy. Proves writer invocation precedes VERSION_IMMUTABLE, not real filesystem overwrite or renderer/hash correctness. Repo-generated IDs/timestamps are excluded from output.',
    async (o, check) => {
      for (const changed of [false, true]) {
        const arm = changed ? 'changed' : 'unchanged'
        await database(`A-${arm}`, (db) => {
          const repo = new PacksRepo(db)
          const pack = repo.create({ name: 'boundary-pack', targets: ['claude-code'] })
          const rendered: RenderedPack = {
            files: [{ path: 'OPENVIBE.md', sha256: 'a'.repeat(64), content: 'synthetic-original' }],
            manifest: { pack: { name: 'boundary-pack' } } as unknown as RenderedPack['manifest'],
            manifestJson: '{"pack":{"name":"boundary-pack"}}',
            fingerprint: 'b'.repeat(64),
            warnings: [],
            coveredPlatforms: ['claude-code'],
          }
          const times: string[] = []
          const writes: Record<string, string>[] = []
          const service = createPackService({
            db,
            now: () => fixedTime,
            renderPack: (_pack, _version, time) => {
              times.push(time)
              return rendered
            },
            packExportDir: () => join(scratch!, 'spy-only-export'),
            writeDirectoryExport: (_root, artifacts) => {
              writes.push({ ...artifacts })
            },
          })
          const input = { packId: pack.id, version: '1.0.0' }
          const first = service.exportPackWithRecord({ ...input, channel: 'download' })
          const original = repo.exportByVersion(pack.id, input.version)
          const writesAfterDownload = writes.length
          if (changed) {
            rendered.fingerprint = 'c'.repeat(64)
            rendered.files[0]!.content = 'synthetic-changed'
          }
          const second = attempt(() =>
            service.exportPackWithRecord({ ...input, channel: 'directory' }),
          )
          const stored = repo.exportByVersion(pack.id, input.version)
          const observation = {
            download_status: first.status,
            writes_after_download: writesAfterDownload,
            directory_status: second.value?.status ?? null,
            directory_error: second.error,
            writes_after_directory: writes.length,
            writer_received_current_content:
              writes[0]?.['files/OPENVIBE.md'] === rendered.files[0]!.content,
            writer_content_sha256: hash(writes[0]?.['files/OPENVIBE.md'] ?? ''),
            export_rows: repo.exportsOf(pack.id).length,
            original_fingerprint_retained: stored?.fingerprint === first.fingerprint,
            reused_record: second.value ? second.value.export.id === first.export.id : null,
            stored_bundle_unchanged: stored?.bundleJson === original?.bundleJson,
            renderer_times: times,
          }
          o[arm] = observation
          check(`${arm}: initial download`, [first.status, writesAfterDownload], ['created', 0])
          check(
            `${arm}: directory outcome`,
            [observation.directory_status, second.error?.code ?? null],
            changed ? [null, 'VERSION_IMMUTABLE'] : ['idempotent', null],
          )
          check(
            `${arm}: writer already invoked with current content`,
            [writes.length, observation.writer_received_current_content],
            [1, true],
          )
          check(
            `${arm}: one immutable original record`,
            [
              observation.export_rows,
              observation.original_fingerprint_retained,
              observation.stored_bundle_unchanged,
            ],
            [1, true, true],
          )
          check(`${arm}: fixed render clock`, times, [fixedTime, fixedTime])
          if (!changed) check('unchanged: record reused', observation.reused_record, true)
        })
      }
    },
  )
}

async function ingestProbe() {
  await probe(
    'B_ingest',
    {
      arms: ['normal', 'reject_first', 'update_abort'],
      held_fixed:
        'Fresh identical DB fixtures; one accepted dev_log, same payload/key/project setup and injected clock. All arms call publish then repeat the identical publish.',
      changes: {
        reject_first: 'Only add a successful rejected review before the first publish.',
        update_abort:
          'Only add a TEMP trigger aborting the pending->published status UPDATE. Before retry, only remove that trigger; preserve the failed-call state.',
      },
    },
    'Real createAgentService, ingest/review repos and dev_log_entries. Demonstrates terminal-state inconsistency and non-atomic residue/duplicate for dev_log only. No concurrency, crash, HTTP route, other ingest kinds or automatic retry exercised.',
    async (o, check) => {
      for (const arm of ['normal', 'reject_first', 'update_abort']) {
        await database(`B-${arm}`, (db) => {
          const template = new FlowTemplatesRepo(db).create({
            name: 'boundary-flow',
            kind: 'light',
            stages: [{ name: 'start', checklist: [], artifacts: [] }],
          })
          const project = new ProjectsRepo(db).create({
            name: 'boundary-project',
            flowTemplateId: template.id,
          })
          new AppMetaRepo(db).write(APP_META_KEYS.agentWriteEnabled, true)
          const service = createAgentService({ db, now: () => new Date(fixedTime) })
          const repo = new AgentIngestRepo(db)
          const batch = service.ingestBatch({
            projectId: project.id,
            items: [
              {
                kind: 'dev_log',
                idempotencyKey: 'boundary-key',
                sourcePlatform: 'synthetic',
                payload: { type: 'DEV', title: 'synthetic-title', body: 'synthetic-body' },
              },
            ],
          })
          check(`${arm}: fixture accepted`, batch.accepted, 1)
          const id = batch.items[0]?.id
          assert.ok(id)
          const snapshot = () => {
            const rows = db
              .prepare('SELECT entry_no, title, body FROM dev_log_entries ORDER BY entry_no')
              .all() as { entry_no: number; title: string; body: string }[]
            return {
              status: repo.get(id)?.status ?? null,
              business_rows: rows.length,
              entry_numbers: rows.map((r) => r.entry_no),
              all_rows_match_payload: rows.every(
                (r) => r.title === 'synthetic-title' && r.body === 'synthetic-body',
              ),
            }
          }
          const initial = snapshot()
          check(`${arm}: initial state`, [initial.status, initial.business_rows], ['pending', 0])
          if (arm === 'reject_first') service.reviewIngest(id, 'rejected', null)
          if (arm === 'update_abort')
            db.exec(`CREATE TEMP TRIGGER boundary_abort BEFORE UPDATE OF status ON agent_ingests
          WHEN OLD.status = 'pending' AND NEW.status = 'published'
          BEGIN SELECT RAISE(ABORT, '${injectedFailure}'); END;`)
          const beforePublish = snapshot()
          const first = attempt(() => service.reviewIngest(id, 'published', null))
          const afterFirst = snapshot()
          o[arm] = {
            initial,
            before_publish: beforePublish,
            first_error: first.error,
            after_first: afterFirst,
          }
          check(
            `${arm}: controlled precondition`,
            [beforePublish.status, beforePublish.business_rows],
            [arm === 'reject_first' ? 'rejected' : 'pending', 0],
          )
          check(
            `${arm}: first error identity`,
            [first.error?.code ?? null, first.error?.injected_status_failure ?? false],
            arm === 'update_abort' ? ['SQLITE_CONSTRAINT_TRIGGER', true] : [null, false],
          )
          check(
            `${arm}: first state and business rows`,
            [afterFirst.status, afterFirst.business_rows],
            arm === 'update_abort' ? ['pending', 1] : ['published', arm === 'normal' ? 1 : 0],
          )
          if (arm === 'update_abort') db.exec('DROP TRIGGER boundary_abort')
          service.reviewIngest(id, 'published', null)
          const afterRetry = snapshot()
          Object.assign(o[arm] as object, { after_retry: afterRetry })
          const expectedRows = arm === 'update_abort' ? 2 : arm === 'normal' ? 1 : 0
          check(
            `${arm}: retry state and row count`,
            [afterRetry.status, afterRetry.business_rows, afterRetry.all_rows_match_payload],
            ['published', expectedRows, true],
          )
          check(
            `${arm}: allocated entry numbers`,
            afterRetry.entry_numbers,
            Array.from({ length: expectedRows }, (_, i) => i + 1),
          )
        })
      }
    },
  )
}

async function providerProbe() {
  await probe(
    'C_provider',
    {
      changed: 'enabled=true -> enabled=false; no other stored configuration field changes',
      selection_strata: ['default', 'explicit'],
      held_fixed:
        'Same DB, provider ID/name/model/endpoint/default binding, empty key, api_key_storage=none, kind=openai_http; never call runner.run.',
    },
    'Only runner construction is observed, not endpoint availability or successful LLM execution. Both default/explicit extraction paths construct a disabled runner. Project-bound routing and other provider kinds are not characterized.',
    async (o, check) => {
      await database('C-provider', async (db) => {
        const entry: InterpretProviderEntry = {
          id: 'synthetic-provider',
          name: 'synthetic',
          projects: [],
          enabled: true,
          kind: 'openai_http',
          cmd: '',
          args: [],
          endpoint: 'http://127.0.0.1:9/v1/chat/completions',
          model: 'synthetic-model',
          provider: 'synthetic',
          api_key: '',
          api_key_storage: 'none',
          timeout_ms: 30000,
        }
        o.synthetic_config = entry
        for (const explicit of [false, true]) {
          const mode = explicit ? 'explicit' : 'default'
          for (const enabled of [true, false]) {
            writeProviderCollection(db, {
              providers: [{ ...entry, enabled }],
              default_provider_id: entry.id,
            })
            const read = readProviderCollection(db)
            const stored = read.collection.providers[0]!
            check(`${mode}/${enabled}: only enabled differs`, { ...stored, enabled: true }, entry)
            const runner = await createExtractRunner(db, explicit ? entry.id : undefined)
            const observed = {
              configured: read.configured,
              stored_enabled: stored.enabled,
              runner_present: runner !== null,
              runner_id: runner?.id ?? null,
              model: runner?.model ?? null,
              local: runner?.local ?? null,
              has_run_function: typeof runner?.run === 'function',
            }
            o[`${mode}_${enabled ? 'enabled' : 'disabled'}`] = observed
            check(
              `${mode}/${enabled}: stored flag`,
              [read.configured, stored.enabled, stored.api_key_storage, stored.api_key.length],
              [true, enabled, 'none', 0],
            )
            check(
              `${mode}/${enabled}: usable runner shape (not invoked)`,
              [
                observed.runner_present,
                observed.runner_id,
                observed.model,
                observed.local,
                observed.has_run_function,
              ],
              [true, entry.id, entry.model, true, true],
            )
          }
        }
      })
    },
  )
}

async function pathProbe() {
  await probe(
    'D_path',
    {
      changed: 'Filesystem representation only: regular file vs file symlink vs directory symlink.',
      held_fixed:
        'Separate identical project/sibling layouts, identical bytes, same relative path slot/sample.txt, hit line 2, before=after=0. All files created by this script.',
    },
    'Proves readSnippet follows both symlink kinds outside the real project root while lexical ../ traversal is blocked. Only synthetic files read; no payload execution, exfiltration, TOCTOU, batch API or pre-existing machine file tested. Symlink creation failure is a failed characterization, not a skip/pass.',
    async (o, check) => {
      const text = 'alpha\nsynthetic-boundary-marker\nomega\n'
      const marker = 'synthetic-boundary-marker'
      const inside = (root: string, file: string) => {
        const r = relative(root, file)
        return !isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)
      }
      for (const arm of ['regular', 'file_symlink', 'directory_symlink']) {
        const base = join(scratch!, `D-${arm}`)
        const project = join(base, 'project')
        const sibling = join(base, 'sibling')
        const slot = join(project, 'slot')
        const file = join(slot, 'sample.txt')
        mkdirSync(project, { recursive: true })
        mkdirSync(sibling)
        const outside = join(sibling, 'sample.txt')
        writeFileSync(outside, text)
        if (arm === 'directory_symlink') symlinkSync(relative(project, sibling), slot, 'dir')
        else {
          mkdirSync(slot)
          if (arm === 'file_symlink') symlinkSync(relative(dirname(file), outside), file, 'file')
          else writeFileSync(file, text)
        }
        const result = readSnippet(project, 'slot/sample.txt', 2, { before: 0, after: 0 })
        const lexicalEscape = readSnippet(project, '../sibling/sample.txt', 2, {
          before: 0,
          after: 0,
        })
        const observed = {
          fixture_bytes: Buffer.byteLength(text),
          same_file_bytes: readFileSync(file, 'utf8') === text,
          lexical_inside: inside(project, file),
          real_target_outside: !inside(realpathSync(project), realpathSync(file)),
          failure: result.failure,
          line_count: result.window?.lines.length ?? 0,
          returned_sha256: hash(result.window?.lines.join('\n') ?? ''),
          marker_matches: result.window?.lines[0] === marker,
          lexical_escape_failure: lexicalEscape.failure,
        }
        o[arm] = observed
        check(
          `${arm}: same bytes and lexical boundary`,
          [observed.same_file_bytes, observed.lexical_inside],
          [true, true],
        )
        check(`${arm}: realpath boundary`, observed.real_target_outside, arm !== 'regular')
        check(
          `${arm}: snippet returned exact synthetic line`,
          [
            observed.failure,
            observed.line_count,
            observed.returned_sha256,
            observed.marker_matches,
          ],
          [null, 1, hash(marker), true],
        )
        check(
          `${arm}: literal traversal blocked`,
          [lexicalEscape.window, lexicalEscape.failure],
          [null, 'out_of_project'],
        )
      }
    },
  )
}

// Fail-closed capability sentinels; selection logic and all DB services remain real.
const originalFetch = globalThis.fetch
const originalKeychain = { ...realKeychainStore }
const safety = { fetch_attempts: 0, keychain_attempts: 0, temp_removed: false }
const fatalErrors: ReturnType<typeof safeError>[] = []
try {
  globalThis.fetch = async () => {
    safety.fetch_attempts++
    throw new Error('fetch_forbidden')
  }
  const blockKeychain = async (): Promise<never> => {
    safety.keychain_attempts++
    throw new Error('keychain_forbidden')
  }
  Object.assign(realKeychainStore, {
    support: blockKeychain,
    read: blockKeychain,
    store: blockKeychain,
    remove: blockKeychain,
  })
  scratch = mkdtempSync(join(tmpdir(), 'ov-v024-boundary-'))
  await exportProbe()
  await ingestProbe()
  await providerProbe()
  await pathProbe()
} catch (error) {
  fatalErrors.push(safeError(error))
} finally {
  globalThis.fetch = originalFetch
  Object.assign(realKeychainStore, originalKeychain)
  try {
    if (scratch) {
      rmSync(scratch, { recursive: true, force: true })
      safety.temp_removed = !existsSync(scratch)
    }
  } catch (error) {
    fatalErrors.push(safeError(error))
  }
}
const assertions = probes.flatMap((p) => p.assertions)
const ok =
  probes.length === 4 &&
  probes.every((p) => p.classification === 'observed_defect') &&
  fatalErrors.length === 0 &&
  safety.temp_removed &&
  safety.fetch_attempts === 0 &&
  safety.keychain_attempts === 0
process.stdout.write(
  `${JSON.stringify(
    {
      schema_version: 1,
      purpose: 'v0.2.4 controlled characterization; passing means defects reproduced, not safe',
      fixed_service_time: fixedTime,
      runtime: { node: process.versions.node, platform: process.platform },
      script_sha256: hash(readFileSync(new URL(import.meta.url), 'utf8')),
      classification: ok ? 'observed_defect' : 'characterization_failed',
      summary: {
        groups: probes.length,
        observed_defect_groups: probes.filter((p) => p.classification === 'observed_defect').length,
        assertions: assertions.length,
        failed_assertions: assertions.filter((a) => !a.passed).length,
      },
      safety,
      fatal_errors: fatalErrors,
      probes,
      not_run: [
        'Full test suite / full typecheck',
        'Real server / HTTP routes / UI',
        'LLM or network requests / runner.run / real Keychain',
        'User home or pre-existing project data',
        'Real directory writer / renderer integrity',
        'Provider projectId routing',
        'Concurrency / crash / TOCTOU / other ingest kinds',
      ],
    },
    null,
    2,
  )}\n`,
)
process.exitCode = ok ? 0 : 1
