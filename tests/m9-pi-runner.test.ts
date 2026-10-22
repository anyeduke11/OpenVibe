import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceInterpretResult } from '@openvibe/shared'

/**
 * M9 P1g · **Pi 包装脚本**的命令行契约（`scripts/pi-interpret-runner.ts`）
 *
 * ## 它断什么
 *
 * | 判据 | 一句话 | 对应的那支 |
 * |---|---|---|
 * | **命令适配器契约** | stdin 收请求、stdout 出结果（**stdout 上只有 JSON**） | 「契约」组 |
 * | **安全关键** | **逐个显式禁掉工具**（Pi 是带工具的 agent） | 「安全」组 |
 * | **DL-18** | 提示词走 **stdin**，**不进 argv**（否则源码会出现在 `ps` 里） | 「安全」组 |
 * | **纵深防御** | 工作目录不是项目目录 | 「安全」组 |
 *
 * ## ⚠️ 用「假 Pi」而不是真 Pi
 *
 * ⚠️ 真 Pi 会**出网**（要模型、要凭据）⇒ 测试不能依赖它。
 * ⇒ 这里用一个**假 Pi**：它把自己的 argv / stdin / cwd 记到文件里，
 *   然后吐一段**固定的事件流** ⇒ 于是「脚本有没有把工具禁掉、提示词走没走 stdin」
 *   这些**能离线验证的**事，全都能断。
 *
 * ⚠️ **真链路另有验证**（真实出网，见 dev-plan §6.14 的「真实出网验证」记录）：
 *   `CommandInterpretRunner` → 本脚本 → 真 Pi → 合法 `SourceInterpretResult`（实测 34.6s）。
 */
/**
 * ⚠️ **显式放宽超时到 60s** —— 这些用例要**真起子进程**（`tsx` 冷启动几百毫秒），
 *   而 unit 层默认 5s 在全量并发下会顶破（与 `tests/seed-check.test.ts` 同款理由）。
 *   ⚠️ **只放宽外层上限，断言一字未改**。
 */
const TEST_TIMEOUT = 60_000

const REPO_ROOT = join(import.meta.dirname, '..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'pi-interpret-runner.ts')
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx')

interface FakePi {
  bin: string
  argvFile: string
  stdinFile: string
  cwdFile: string
  dir: string
}

/** 造一个「假 Pi」：记下 argv / stdin / cwd，然后吐固定的事件流。 */
function makeFakePi(outputNdjson: string): FakePi {
  const dir = mkdtempSync(join(tmpdir(), 'ov-pi-fake-'))
  const bin = join(dir, 'fake-pi')
  const argvFile = join(dir, 'argv.txt')
  const stdinFile = join(dir, 'stdin.txt')
  const cwdFile = join(dir, 'cwd.txt')
  const outFile = join(dir, 'out.ndjson')
  writeFileSync(outFile, outputNdjson, 'utf8')
  writeFileSync(
    bin,
    [
      '#!/bin/sh',
      ': > "$FAKE_PI_ARGV_FILE"',
      'for a in "$@"; do printf \'%s\\n\' "$a" >> "$FAKE_PI_ARGV_FILE"; done',
      'cat > "$FAKE_PI_STDIN_FILE"',
      'pwd > "$FAKE_PI_CWD_FILE"',
      'cat "$FAKE_PI_OUTPUT_FILE"',
      '',
    ].join('\n'),
    'utf8',
  )
  chmodSync(bin, 0o755)
  return { bin, argvFile, stdinFile, cwdFile, dir }
}

function runScript(
  fake: FakePi,
  stdin: string,
  extraEnv: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(TSX, [SCRIPT], {
    input: stdin,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      FAKE_PI_ARGV_FILE: fake.argvFile,
      FAKE_PI_STDIN_FILE: fake.stdinFile,
      FAKE_PI_CWD_FILE: fake.cwdFile,
      FAKE_PI_OUTPUT_FILE: join(fake.dir, 'out.ndjson'),
      OPENVIBE_M9_PI_BIN: fake.bin,
      OPENVIBE_M9_INTERPRETER_MODEL: 'fake-model',
      OPENVIBE_M9_INTERPRETER_PROVIDER: 'fake-provider',
      ...extraEnv,
    },
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

const REQUEST = {
  schema_version: 1,
  topics: [{ slug: 'py-context-manager', title: '上下文管理器' }],
  fragments: [
    {
      finding_id: 7,
      path: 'examples/ctx.py',
      content: 'class Resource:\n    def __enter__(self):\n        return self\n',
      line: 1,
      topic_slug: 'py-context-manager',
      topic_title: '上下文管理器',
    },
  ],
}

/** 一段合法的 Pi 事件流（正文是**契约 JSON**）。 */
function ndjsonWithAnswer(answer: unknown): string {
  const text = JSON.stringify(answer)
  return [
    JSON.stringify({ type: 'session', version: 3 }),
    JSON.stringify({ type: 'agent_start' }),
    JSON.stringify({ type: 'turn_start' }),
    JSON.stringify({
      type: 'turn_end',
      message: { role: 'assistant', content: [{ type: 'text', text }] },
      toolResults: [],
    }),
    JSON.stringify({ type: 'agent_settled', aborted: false }),
    '',
  ].join('\n')
}

const VALID_ANSWER = {
  schema_version: 1,
  model: 'model-self-reported',
  provider: 'provider-self-reported',
  items: [
    {
      topic_slug: 'py-context-manager',
      summary: '用 __enter__ / __exit__ 实现上下文管理器。',
      risks: ['__exit__ 返回 True 会吞掉异常'],
      claim_state: null,
    },
  ],
}

describe('M9 P1g · Pi 包装脚本的命令行契约', () => {
  it('① stdin 收请求 ⇒ stdout 出**契约 JSON**（stdout 上没有别的）', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      const res = runScript(fake, JSON.stringify(REQUEST))
      expect(res.status).toBe(0)
      const parsed = SourceInterpretResult.safeParse(JSON.parse(res.stdout))
      expect(parsed.success).toBe(true)
      expect(parsed.data?.items[0]?.topic_slug).toBe('py-context-manager')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('② ⚠️ **model / provider 用实际跑的那一家覆盖模型自述**', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      const res = runScript(fake, JSON.stringify(REQUEST))
      const body = JSON.parse(res.stdout) as { model: string; provider: string }
      expect(body.model).toBe('fake-model')
      expect(body.provider).toBe('fake-provider')
      // ⚠️ 模型自报的名字**不采信**（台账要记事实）
      expect(body.model).not.toBe('model-self-reported')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('③ ⚠️ **安全关键**：逐个显式禁掉工具与本机上下文', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      runScript(fake, JSON.stringify(REQUEST))
      const argv = readFileSync(fake.argvFile, 'utf8') as string
      for (const flag of [
        '--no-tools',
        '--no-mcp',
        '--no-extensions',
        '--no-skills',
        '--no-context-files',
        '--no-session',
        '--no-approve',
      ]) {
        expect(argv.split('\n')).toContain(flag)
      }
      // ⚠️ **不许**出现「开工具」的开关
      expect(argv.split('\n')).not.toContain('--tools')
      expect(argv.split('\n')).not.toContain('-t')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('④ ⚠️ **提示词走 stdin，不进 argv**（源码会出现在 `ps` 里）', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      runScript(fake, JSON.stringify(REQUEST))
      const argv = readFileSync(fake.argvFile, 'utf8') as string
      const stdin = readFileSync(fake.stdinFile, 'utf8') as string
      // ⚠️ **源码片段不许出现在 argv**
      expect(argv).not.toContain('def __enter__')
      // ⚠️ 但**必须在 stdin** 里（提示词本体）
      expect(stdin).toContain('def __enter__')
      expect(stdin).toContain('py-context-manager')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('⑤ ⚠️ **工作目录不是项目目录**（纵深防御：上下文文件一律找不到）', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      runScript(fake, JSON.stringify(REQUEST))
      const cwd = readFileSync(fake.cwdFile, 'utf8').trim()
      expect(cwd).not.toBe(REPO_ROOT)
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('⑥ ⚠️ 契约版本对不上 ⇒ 失败（**stdout 上不留半个 JSON**）', () => {
    const fake = makeFakePi(ndjsonWithAnswer({ ...VALID_ANSWER, schema_version: 99 }))
    try {
      const res = runScript(fake, JSON.stringify(REQUEST))
      expect(res.status).not.toBe(0)
      expect(res.stdout.trim()).toBe('')
      expect(res.stderr).toContain('版本')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('⑦ ⚠️ 这一轮被中止 ⇒ 失败（结果不可信）', () => {
    const aborted = ndjsonWithAnswer(VALID_ANSWER).replace(
      '{"type":"agent_settled","aborted":false}',
      '{"type":"agent_settled","aborted":true}',
    )
    const fake = makeFakePi(aborted)
    try {
      const res = runScript(fake, JSON.stringify(REQUEST))
      expect(res.status).not.toBe(0)
      expect(res.stdout.trim()).toBe('')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)

  it('⑧ stdin 不合契约 ⇒ 退出码 2（不是 0）', () => {
    const fake = makeFakePi(ndjsonWithAnswer(VALID_ANSWER))
    try {
      const res = runScript(fake, JSON.stringify({ schema_version: 99 }))
      expect(res.status).toBe(2)
      expect(res.stdout.trim()).toBe('')
    } finally {
      rmSync(fake.dir, { recursive: true, force: true })
    }
  }, TEST_TIMEOUT)
})
