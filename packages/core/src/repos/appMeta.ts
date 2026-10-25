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
   * M10/D 的「AI 提取总闸」（spec v023-d-ai-extract FR-10）。
   * **默认关**（形态对齐 agentWriteEnabled：关着整批拒绝、拦在服务层）——
   * 出网能力默认关是信任模型的延续；与 agentWriteEnabled 刻意分开两个键，
   * 理由同款：合并会让「允许 agent 写入」与「允许 AI 出网提取」互相牵连。
   */
  aiExtractEnabled: 'aiExtractEnabled',
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
  /**
   * M9 P1g 的**当前成长阶段**（`m9-dev-language-roadmap.md` §3.21）。
   *
   * ⚠️ **刻意不进 `lang_*`** —— 与 `langModeChoice` 同款纪律：
   *   阶段是**用户偏好**（我处在成长路线的哪一阶段），不是语言学习状态。
   *
   * ⚠️ **值是 JSON 字面量**（`'0'` / `'1'` / `'2'` / `'3'` / `null`）——
   *   `AppMetaRepo.read` 会 `JSON.parse`，所以这里存的是**带引号的字符串或 null**。
   *
   * ⚠️ **它只是「推荐值的来源」，不是生效模式的落点** ——
   *   生效模式由 `resolveEffectiveProfile`（shared）现算：用户自选优先，
   *   没有自选才用阶段推荐（§3.21「默认推荐值来自阶段，用户可改」）。
   */
  langStageChoice: 'langStageChoice',
  /**
   * M9 的 **AI 解读 provider 配置**（owner 2026-10-22 裁决一「手动调控 ＋ 支持本地模型与 LLM API」）。
   *
   * ⚠️ **刻意不进 `lang_*`** —— 与 `langModeChoice` 同款纪律：
   *   它是**用户偏好**（我打算用哪个模型解释源码），不是语言学习状态。
   *
   * ⚠️ **值是 JSON 对象**（`InterpretProviderConfig` 的形状）⇒ 读回时按 schema 校验，
   *   **坏了就回落默认值**（`AppMetaRepo.read` 的容错 + 本层的 schema 校验，两道）。
   *
   * ⚠️ **API key 在这里明文落库** —— 这是取舍（`app_meta` 是本机明文 SQLite）；
   *   补偿手段是**读端永不回显全文**（视图里只有 `has_api_key` ＋ 末 4 位）。
   */
  langInterpretProvider: 'langInterpretProvider',
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
