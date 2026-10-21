import type { SqliteDatabase } from '../db'

/**
 * app_meta（design §5 的 C-1 表）：跨进程共享 KV 的唯一权威处。
 * 值一律以 JSON 字面量入库，读回按 fallback 容错——单个键损坏不该拖垮设置页与遥测闸门。
 */
export const APP_META_KEYS = {
  telemetryEnabled: 'telemetryEnabled',
  telemetryAskState: 'telemetryAskState',
  onboardingDone: 'onboardingDone',
  /**
   * M8-E 的「允许 agent 写入（回流）」总闸（`m8-agent-panel.md` FR-5.5.2.1）。
   *
   * **默认关**（读侧一律传 `fallback = false`）—— 与 PRD-M8 技能边界表「只读默认」一致
   * （PRD-M8 FR-1.3）。FR-5.2 的人工确认门是**读侧**防线，写侧还需要这道总闸，
   * 否则一次误配就让 agent 开始往库里写。
   *
   * ⚠️ **刻意不与既有两开关合并**：台账总开关与遥测总开关各有各的节（FR-5.5.2），
   * 重复开关会导致两处状态不一致 —— 用户改了一处发现另一处没变。
   */
  agentWriteEnabled: 'agentWriteEnabled',
  /**
   * M9 P1e 的**学习模式选择**（`m9-dev-language-roadmap.md` §3.19）。
   *
   * ⚠️ **刻意不进 `lang_*`** —— §3.19 第 3 条明写「选项属用户偏好，
   *   **不得写进 `lang_topic_state`，也不得进 `lang_profiles` 派生任何状态**」：
   *   一旦模式选择能影响状态，速成就又变成「更容易点亮」的路径。
   * ⇒ 它进 `app_meta`（跨进程共享的 KV 归口），**不进**任何 `lang_` 表。
   *
   * ⚠️ **值是 JSON 字面量**（`'\"vibe\"'` / `'\"master\"'` / `null`）——
   *   `AppMetaRepo.read` 会 `JSON.parse`，所以这里存的是**带引号的字符串**。
   */
  langModeChoice: 'langModeChoice',
} as const

export class AppMetaRepo {
  constructor(private readonly db: SqliteDatabase) {}

  read<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      { value: string } | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return fallback
    }
  }

  write(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, JSON.stringify(value))
  }
}
