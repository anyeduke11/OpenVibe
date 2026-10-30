import { describe, expect, it } from 'vitest'
import { splitMessage } from '../src/output'

/**
 * `splitMessage` 的**判据校准**（2026-10-30）。
 *
 * ## 为什么有这份文件
 *
 * 判据的第一版是「连续 ≥3 个单词算英文句子」。用真实样本校准后**这个判据不成立**：
 * `npm rebuild better-sqlite3`（修复命令，3 词）与 `spawn xdg-open ENOENT`
 * （错误消息，3 词）词数相同 —— 按词数切，必然误伤一边，而误伤的一边是
 * **本仓写给人看的命令**（切走了排障就断了）。
 *
 * 故判据改为「片段带**错误特征**（errno 码 / 错误类名 / 错误语义词）才算诊断」。
 *
 * ## 样本从哪来
 *
 * 下面的样本**不是编造的**，而是从 `apps/cli/src`、`apps/server/src`、
 * `packages/core/src` 的真实文案里取的（`throw new XxxError(...)` 的第一个参数、
 * 以及中文文案里内嵌 `${e.message}` 的形态），并把模板求值成运行时形态。
 * 样本集的两侧都必须成立：
 *  - **该切**：来自 Node / 第三方库的英文机器串；
 *  - **不该切**：本仓自己写的中文人话，其中的英文是命令、标识符或路径。
 *
 * ⚠️ 这份文件的断言**编码的是判据的意图**，不是当前实现的快照：
 * 判据一旦退化（误伤命令、或漏切错误），这里必须变红。
 */

/** 该判为「英文诊断」⇒ 切进 detail 的真实机器串 */
const ERROR_SAMPLES = [
  "EACCES: permission denied, open '/tmp/x'",
  'Unexpected token < in JSON at position 0',
  'Unexpected end of JSON input',
  'connect ECONNREFUSED 127.0.0.1:8787',
  'spawn xdg-open ENOENT',
  'listen EADDRINUSE: address already in use 127.0.0.1:8787',
  'SQLITE_ERROR: no such table: openvibe_meta',
  'Was compiled against a different Node.js version using NODE_MODULE_VERSION 137',
  'Invalid URL',
  'Failed to fetch',
  'fetch failed',
  'The user name or passphrase you entered is not correct',
  "SyntaxError: Unexpected token '}'",
]

/** 不该判为「英文诊断」⇒ 留在人话通道的真实本仓文案（英文是命令/标识符/路径） */
const HUMAN_SAMPLES = [
  // 修复命令（native-load.ts 的三要素诊断之一）
  '在安装目录执行 npm rebuild better-sqlite3',
  '本 CLI 只支持 1——请升级 CLI（npx openvibe-cli@latest）后重试',
  // 命令用法
  '用法：openvibe sync <projectPath> [--pack name[@version] | --file bundle.json | --dir packDir]',
  '该目录还没有 pack.lock.json：尚未由 OpenVibe 托管。openvibe sync <projectPath> 首次注入',
  '缺少 lock 文件，先跑 openvibe sync',
  // 标识符与关键词清单
  '当前环境：darwin arm64；Node 26.4.0（ABI/NODE_MODULE_VERSION 137）',
  '问题词只能是闭集关键词：status | next | checklist | assets | terms | playbook | logs',
  '日志类型只能是 devlog | retro | note：xxx',
  '不是合法策略（refuse-overwrite / refuse-merge）：xxx',
  // 路径与 URL
  '非法 URL：https://example.com/a/b',
  '读取 /Users/x/y/z 失败',
]

describe('SPLIT-CALIB · splitMessage 判据的真实样本校准', () => {
  it('SPLIT-CALIB-01: 纯英文机器串整体进 detail，人话位置给中文兜底', () => {
    for (const raw of ERROR_SAMPLES) {
      const r = splitMessage(raw)
      expect(r.detail, raw).toBe(raw)
      expect(r.message, raw).toBe('执行失败')
    }
  })

  it('SPLIT-CALIB-02: 本仓人话里的命令与标识符不被误切（判据退化的第一道防线）', () => {
    // ⚠️ 这是本文件存在的**首要理由**：早先按「≥3 词」判定时，
    // `npm rebuild better-sqlite3` 被整段切走——排障的修复路径就没了。
    for (const raw of HUMAN_SAMPLES) {
      const r = splitMessage(raw)
      expect(r.detail, raw).toBeUndefined()
      expect(r.message, raw).toBe(raw)
    }
  })

  it('SPLIT-CALIB-03: 中文句子里夹的英文诊断被切走，人话只留中文', () => {
    // 真实形态（模板求值后）：错误消息混在中文文案里
    const cases: { raw: string; detail: string; keep: string }[] = [
      {
        raw: '清单不是合法 JSON：SyntaxError: Unexpected token < in JSON at position 0',
        detail: 'SyntaxError: Unexpected token < in JSON at position 0',
        keep: '清单不是合法 JSON',
      },
      {
        raw: '遥测上报异常：fetch failed',
        detail: 'fetch failed',
        keep: '遥测上报异常',
      },
      {
        raw: '拉取目录树失败: connect ECONNREFUSED 127.0.0.1:8787',
        detail: 'connect ECONNREFUSED 127.0.0.1:8787',
        keep: '拉取目录树失败',
      },
      {
        raw: '写系统钥匙串失败：The user name or passphrase you entered is not correct',
        detail: 'The user name or passphrase you entered is not correct',
        keep: '写系统钥匙串失败',
      },
    ]
    for (const c of cases) {
      const r = splitMessage(c.raw)
      expect(r.message, c.raw).toBe(c.keep)
      expect(r.detail, c.raw).toBe(c.detail)
    }
  })

  it('SPLIT-CALIB-04: 两词英文诊断也切走（早先按 ≥3 词判据会漏）', () => {
    // `fetch failed` / `Invalid schema` 只有两个词 —— 「≥3 词」判据下漏切，
    // 英文机器串会留在中文句子里。改用错误特征判据后已覆盖。
    expect(splitMessage('遥测上报异常：fetch failed').detail).toBe('fetch failed')
    expect(splitMessage('文件 CLAUDE.md 非法：Invalid schema（m1 §6.5 整批拒绝）').detail).toBe(
      'Invalid schema',
    )
  })

  it('SPLIT-CALIB-05: 错误语义词不收命令动词（否则人话里的命令会被切走）', () => {
    // `rebuild` / `install` / `run` / `sync` 这类动词在本仓人话里很常见，
    // 收进错误语义词就会把 `在安装目录执行 npm rebuild better-sqlite3` 整段切走。
    const r = splitMessage('在安装目录执行 npm rebuild better-sqlite3')
    expect(r.detail).toBeUndefined()
    expect(r.message).toContain('npm rebuild better-sqlite3')
  })
})
