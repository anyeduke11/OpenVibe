# SPEC · v0.2.3 批次 D：AI 提取闭环（G4 · AN1 LLM 候选提取 + AN4 治理面 + AN5 影子门槛）

| 项 | 值 |
|------|------|
| 模块 | **v0.2.3 · 批次 D / 目标 G4**。对应 PRD `docs/PRD-v0.2.3-v1.0-20261024.md` 第 4 章的 AN1（LLM 推断式候选提取）、AN4（治理面：同意/台账/预算/开关）、AN5（质量判据与影子门槛）。三者**同批不可拆**——提取没有治理面不得出网，治理面没有质量判据不得常态化。问答与生态（AN2/AN3）在 `v023-e-ai-assistant.md` |
| 优先级 | **P0（AI 线内）**。判级构成：除采纳率面板（C）外全部 **B**（新增表 + 新增 kind + 新增出网场景 + 服务层总闸）。逐项判级见 §4；一切判级均为预判，判级权在 owner（dev-plan §0.3） |
| 上游 | `docs/PRD-v0.2.3-v1.0-20261024.md`（§1 E11、§4 AN1/AN4/AN5、§6 架构与九条红线、§7 批次 D、§9 反例 5/6/7）· **裁定登记**：owner 2026-10-24 指令启用 LLM 推断式候选提取；分析文 §5.4 CP4 的两个启用条件（B 级裁定 + 质量判据）由该裁定与 QG1–QG4 闭合 · `docs/specs/m4-playbook.md` §2 Out（被本裁定反转的条文，升版处置见 PRD §11）· `docs/specs/m8-agent-bridge.md`（pending→review→dispatch 管道与幂等三态，本 spec 的复用单源） |
| 下游设计 | `packages/core/src/source-ai/`（provider-config / http-runner / keychain / redact / ledger / snippet——**只 import 不改**，除非 §6 声明）· `packages/core/src/services/agentService.ts`（`agentWriteEnabled` 总闸形制、`reviewIngest`/`dispatchPublish`）· `packages/core/src/db/migrations/`（0007 `agent_ingests` 表形、0010 台账 kind CHECK 先例；**SQLite 不能 ALTER CHECK ⇒ 扩 kind 必须开新迁移**）· `docs/design.md` §11.5（遥测白名单，本 spec **不触碰**——AI 出网走自己的 consent，与遥测是两件事） |
| 关联任务 | **无**（任务号待本 spec 裁定后在 tasks.md 另起） |
| 版本 | **v1.0（2026-10-24）**。§8.2 四处已按 owner「按建议进行 D 批次收尾」指令定稿即现实现（裁定记录见该节）；§7 验收 11 条全部落地（EXT-01…16，16 支用例）；DEV-0142/0143/0144 |
| 采样 | 2026-10-24 本机工作树 |

---

## 1. 目标与用户价值

- 开发者每天在日志里写下踩过的坑、发明的词、验证过的做法——这些是资产，但「写日志」和「沉淀资产」之间隔着一道手工整理的墙。M9 规格早已预设解法：`divergence.ts` 引规格原文「AI 产出的知识点/术语**一律走 M8 回流 + 人工确认**」。本 spec 把这最后一截管道接通：**AI 起草，人裁决，机器防幻觉**。
- **净解锁**：① 日志区新增「提取候选」，LLM 把日志变成术语/提示词/技巧草稿；② 幻觉候选在进人工视野**之前**被确定性锚定校验丢弃——分析文反对理由「质量不可判定」的正面回应：采纳与否不可判定，但「是否锚定在原文上」完全可判定；③ 出网同意、白名单台账、预算熔断、影子门槛四件治理面让能力**可关、可查、可断**。
- **红线（AI 线总纲，PRD §6 九条的 1–4 与 7）**：内部 AI 产出按外部 agent 待遇（pending → 人工确认才生效）；候选 `status` 恒 `'draft'` 不接受载荷值；判定层零 AI；台账只存指纹与计数，正文在类型上进不来。

## 2. 范围

| **In** | **Out（明确不做，写明理由与去向）** |
|---|---|
| Web 提取入口：日志详情页「提取候选」+ 日志多选批量（FR-1） | **CLI 提取入口 `openvibe extract`**（P2 待裁：先验证 Web 入口使用率，PRD §3.2） |
| `core/src/extract/` 新目录：service 编排 + zod 契约 + 锚定校验纯函数（FR-2/3/4） | **复用 `lang_source_consent` 表**——用途域不同（源码片段 vs 日志正文），共用会让清除动作互相污染（最小授权，PRD §6 要点 1） |
| `agent_ingests` 扩三个候选 kind + 迁移扩 CHECK（FR-5） | **新开候选表**——pending→review→dispatch 机器、幂等三态、Web 纪律全部白得，代价只是一次迁移（PRD §6 要点 2） |
| `dispatchPublish` 三分支：terms/prompts/playbooks 草稿入库（FR-6） | **AI 直写业务表 / 自动确认 / 批量默认通过**——红线 1/7 永不豁免 |
| `ai_extract_consent` 表 + 出网同意流程（FR-7） | **全局同意**。逐项目粒度（防跨项目授权泄漏，平移 `lang_source_consent` 语义） |
| 台账 kind `ai_extract_call`（FR-8） | **payload 增加正文容器**——白名单逐键构造，日志原文在类型上进不来（DL-16 纪律） |
| 预算熔断：单次 token 预算 + 每日上限（FR-9） | **静默降质**（换小模型、砍候选数凑预算）——超限就拒绝并如实提示 |
| 提取总闸（FR-10）：默认关，形态对齐 M8 `agentWriteEnabled` | **总闸默认开**——出网能力默认关是本产品信任模型的延续 |
| 影子门槛：采纳率面板 + 连续低采纳自动降级建议（FR-11） | **强制关闭已开项目**——门槛触发只出横幅 + 新项目默认关，已开项目尊重用户选择 |

## 3. 现状与实测基线（采样：2026-10-24）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 确认管道 | `agentService.ts` 的 `ingestBatch`（写侧总闸 `agentWriteEnabled` 默认关、批量上限 20、幂等三态）+ `reviewIngest`（**唯一确认入口**，首次裁决才 `dispatchPublish`）已实装 | `grep -n 'agentWriteEnabled\|reviewIngest\|dispatchPublish' packages/core/src/services/agentService.ts \| head -5` |
| 2 | kind 闭集 | `AGENT_INGEST_KINDS` 五项（`dev_log/session/requirement/task_status/check_state`），CHECK 在迁移 0007——**扩 kind 必须开新迁移** | `grep -n 'AGENT_INGEST_KINDS' packages/shared/src/constants.ts`；`grep -n 'kind' packages/core/src/db/migrations/0007*.sql \| head -3` |
| 3 | AI 基础设施 | `source-ai/` 十件套在：多 provider 配置（app_meta 集合、Keychain、key 永不回显）、OpenAI 兼容 runner（超时归一、只露 host、`schema_version` 先比版本）、`redactAbsolutePaths`、失败六值闭集 | `ls packages/core/src/source-ai/` |
| 4 | 台账先例 | kind `ai_recommend_call` 在 `LOCAL_EVENT_KINDS`（迁移 0010 进 CHECK）；payload 9 键白名单（`aiModel/aiProvider/inputHash/candidateCount/passedCount/droppedCount/result/failureReason/durationMs`）——本 spec 的新 kind 照抄此形 | `grep -n 'ai_recommend_call' packages/shared/src/constants.ts packages/core/src/source-ai/ledger.ts` |
| 5 | consent 先例 | `lang_source_consent`（迁移 0016）：逐项目 `remember_all`；`clearConsent` **删行**不留残影（DL-21）；`deriveConsentDetail` 服务端推导授权来源、不采信客户端 | `grep -n 'readConsent\|clearConsent\|deriveConsentDetail' packages/core/src/db/m9-source-scan.ts packages/core/src/source-ai/interpret-service.ts \| head -4` |
| 6 | 迁移号位 | **0001–0018 已用，下一空号 0019**；号段规则待批次 C 的 CS6——本 spec 的迁移编号服从该规则 | `ls packages/core/src/db/migrations/ \| tail -3` |
| 7 | 待确认列表 UI | `PendingIngestList.tsx` 纯文本渲染红线（禁 `dangerouslySetInnerHTML`、码点截断 80 字符、冲突短 hash FNV-1a 8 位）——候选 kind 复用此列表 | `sed -n '1,30p' apps/web/src/components/agent/PendingIngestList.tsx` |
| 8 | 规格预设 | `divergence.ts:12-15` 引规格原文「解读结果不自动入库——AI 产出的知识点/术语一律走 M8 回流 + 人工确认」 | `grep -n 'M8 回流\|不自动入库' packages/core/src/source-ai/divergence.ts` |
| 9 | 测试基线 | 163 文件 / 2095 用例全绿 | `pnpm test` |

## 4. 功能需求（FR）

### FR-1 提取入口（**C 级 UI + B 级服务面**）

1. 日志详情页新增「提取候选」按钮；日志列表支持多选批量提取（单次上限对齐 M8 批量上限 20 条日志）。
2. 入口渲染前置：provider `ready`（复用 capability 探测，**不发网络请求**）且总闸开且当日预算未熔断——三条件任一不满足则入口不渲染，附人话原因（DL-08：「没配」与「跑挂了」分列）。
3. 提交前展示**确切的待发内容**（选中日志的脱敏正文 + 上下文摘要）并取得同意（FR-7）。

### FR-2 `core/src/extract/extract-service.ts`（**B 级**：编排）

1. 编排链：读日志（`dev_log_entries`，**只读**）→ 组装请求（正文过 `redactAbsolutePaths`，路径相对化）→ `runner.interpret()` → **锚定校验**（FR-4）→ 合格候选落 `agent_ingests`（pending）→ 记台账（FR-8）。
2. runner 复用 `source-ai` 注入接口（`CommandInterpretRunner` / `HttpInterpretRunner`），prompt builder 与结果 schema 换新；失败六值闭集、版本比对、只露 host 全部继承。
3. **零业务表写入**：本服务除 `agent_ingests` / `local_events` / `ai_extract_consent` 外不触碰任何表。

### FR-3 候选契约（**B 级**）

`packages/shared` 新增候选 zod schema：三类候选各自 shape（term/prompt/playbook），统一带 `schema_version`（进 prompt、进校验，先比版本再谈字段）；来源反链字段（`source_log_id` + 原文引用段）必填。

### FR-4 锚定校验（**B 级**：确定性纯函数）

1. `extract/anchor.ts` 纯函数：输入候选 + 源日志原文，输出通过 / 丢弃 + 命中位置；判据 = 候选的术语词/关键词**逐字命中**源日志原文（子串级，码点口径）。
2. 丢弃的候选**服务端直接丢弃**，不进待确认列表；计入台账 `droppedCount`。
3. 用例**全部不依赖网络**（LLM 只是它的调用方）：先写用例再接 runner。

### FR-5 `agent_ingests` 扩三个候选 kind（**B 级**：迁移）

1. 新增 kind：`term_candidate` / `prompt_candidate` / `playbook_candidate`；`source` 标记 `ai_extract`（与外部 agent 上报区分，供采纳率统计与 UI 徽标）。
2. 迁移（号位 0019 或按 CS6 规则）：扩 `agent_ingests.kind` 的 CHECK + `LOCAL_EVENT_KINDS` 的 CHECK（SQLite 不能 ALTER CHECK，新迁移是唯一路径，0010/0011 先例）。
3. 扩列是**产品决定**：走迁移、DEV_LOG 登记，并在 `constants.ts` 同步闭集（双源比对测试沿用 M8 既有形制）。

### FR-6 `dispatchPublish` 三分支（**B 级**）

1. `term_candidate` → `terms`、`prompt_candidate` → `prompts`、`playbook_candidate` → `playbooks`，各写各的业务表。
2. `status` **恒为 `'draft'`，不接受载荷值**（对齐 requirement 分支的二次兜底）；`source='ai_extract'` + 来源反链随载荷走白名单。
3. 分发失败 ⇒ 整条转 `rejected` 且业务表零写入（M8 既有语义）；**分发只发生一次**（重复 review 不再触发）。

### FR-7 `ai_extract_consent` 同意面（**B 级**）

1. 新表：`project_id` 主键 + `remember_all` + `remembered_at`，语义逐字平移 `lang_source_consent`：逐项目粒度、出网前展示确切待发内容、记忆可清除、**清除 = 删行**（不留「曾记住」残影）。
2. 授权来源由**服务端推导**（记忆内容 + 本次发送集合 + 客户端 `user_touched` 上报），不采信客户端——客户端谎报只会让审计分类失真，不会多发一条。
3. consent 记录写点与读取走 `m9-source-scan.ts` 同构 API（新表新函数，不复用旧表）。

### FR-8 台账 kind `ai_extract_call`（**B 级**）

0. **允许键闭集（逐字，双源闸的解析面）**——允许键 · `ai_extract_call` → `aiModel` / `aiProvider` / `inputHash` / `candidateCount` / `passedCount` / `droppedCount` / `result` / `failureReason` / `durationMs`；允许键 · `ai_discuss_call` → `aiModel` / `aiProvider` / `inputHash` / `candidateCount` / `passedCount` / `droppedCount` / `result` / `failureReason` / `durationMs`。
1. 每次真的出网写一行：9 键白名单逐键构造（照抄 `ai_recommend_call` 形制，键名同款）——`inputHash` 是请求指纹 sha256 前 16 位；**失败也记**（`result='error'`）；「没出网不记行」。
2. payload 守卫测试：构造含正文字段的载荷 ⇒ 台账行无该键（DL-16 模式）；键闭集由 `AGENT_PAYLOAD_SHAPE` 同族常量钉住。

### FR-9 预算熔断（**B 级**）

1. 单次提取 token 预算（默认值 §8.2 待裁，预判 8k）+ 每日 token 上限（从 `lang_source_shares.usage_total_tokens` 同族口径累计现算——新 kind 的 usage 落同构字段）。
2. 超限当日拒绝：返回人话提示含「今日已用 / 上限」两个数；**绝不静默降质**。
3. 本机端点（`isLocalEndpoint` 判别）不计入出网预算——本机推理零外联（§8.2 待裁②确认此口径）。

### FR-10 提取总闸（**B 级**）

1. `app_meta` 新键，默认**关**；关着时 FR-1 入口不渲染 + 服务端整批 422（**拦在服务层，不拦路由**——防绕过，M8 既有形制）。
2. 设置页「AI 与出网」汇总区：provider 多份配置（复用既有解读配置组件）、consent 列表与清空、成本台账（按 provider/model 分组）、总闸开关。

### FR-11 影子门槛（**B 级降级逻辑 + C 级面板**）

1. 采纳率 = `published ÷ (published + rejected)`，按 kind 分组；数据 = `agent_ingests` review 结果 join 台账，**无第二数据源**。
2. 统计窗口每轮 ≥20 条候选（QG1 首版预判值，owner 可改，常量单源）；**连续 2 轮 <25%** ⇒ 设置页建议关闭横幅 + 新项目默认关提取；已开项目不强制关。
3. 门槛触发 / 解除各一支用例（构造连续低采纳窗口）；面板空数据显示「待采集」。

## 5. 输入 / 输出

- **输入**：选中日志正文（脱敏后）；provider 配置（复用 `langInterpretProvider` 形制的独立键或同键分用途——§8.2 待裁③）；consent；预算台账。
- **输出**：`agent_ingests` pending 候选（三个新 kind）；`ai_extract_call` 台账行；采纳率面板；AgentPanel 待确认列表的新 kind 行。

## 6. 边界与异常

- **红线即边界**（PRD §6 九条在本 spec 的落点）：AI 结果只进 pending（红线 1/7）；判定层零 AI——五状态、漂移、指纹一行不碰（红线 8）；台账无正文容器（红线 2）；出网前展示确切内容（红线 3）。
- **与解读链的分工**：M9 interpret 是「读源码、标注分歧、不入库」；本 spec 是「读日志、产候选、入 pending」。两者共用 provider 基建，**不共用 consent 表与业务语义**；`divergence.ts` 的「不入库」原文不改——它说的解读结果仍然不入库，本 spec 是另一条已预设的管道。
- **LLM 失败降级**：runner 六值闭集错误如实透出（人话），不重试风暴（单次手动触发，无自动重试）；「AI 不可用」不记台账（没出网）。
- **批量纪律**：单次 ≤20 条日志（对齐 M8 ingestBatch 上限）；单条日志超长按 snippet 既有上限截断并如实标注。
- **隐私事故即最高级回退**：任何一次出网超出同意范围 ⇒ 功能整体关闭 + 事故登记进 DEV_LOG + consent 实现逐行审计后才可重开（PRD §9 反例 7）。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 |
|---|---|---|
| 1 | 端到端 | 三个新 kind 各一支：日志含已知术语 ⇒ 提取 → pending → 人工确认 → 业务表 draft 行带来源反链 |
| 2 | 锚定校验 | 构造原文中不存在的候选 ⇒ 丢弃、不进列表、`droppedCount` 增 1；校验用例零网络依赖 |
| 3 | pending 纪律 | 未确认前业务表零写入（解读/提取前后业务表逐字不变，M8 既有断言模式）；重复 review 不二次分发 |
| 4 | draft 兜底 | 载荷携带 `status='published'` 之类 ⇒ 入库仍为 `'draft'` |
| 5 | 迁移 | 0019（或 CS6 规则号位）建 consent 表 + 两处 CHECK 扩列；旧 kind 行为不变用例 |
| 6 | consent | 清除 = 删行；清除后立即全不勾；服务端推导授权来源（谎报 `user_touched` 不改变发送集合） |
| 7 | 台账 | 9 键白名单守卫（正文键进不来）；成功/失败都记；没出网无行 |
| 8 | 预算 | 超限熔断提示含两个数；本机端点不进预算（若 §8.2② 采此口径） |
| 9 | 总闸 | 关闭时入口不渲染 + 服务端 422（服务层拦截断言） |
| 10 | 影子门槛 | 连续低采纳触发横幅 + 新项目默认关；解除用例；面板「待采集」态 |
| 11 | 回归 | `pnpm test` 用例数只增不减；`ask` / M8 / M9 既有用例零改动通过；docs:check 全绿 |
| 12 | 收尾补齐（v1.0） | 双闸独立性（EXT-13）；本机豁免（EXT-14）；consent 四值推导落 `ai_extract_shares`（EXT-15/16：explicit_tick/user_reticked 与 remembered/memory_applied、失败不落 shares、usage 分组）；anchor 纯函数 6 支零网络用例；§7-6 第三条与 §7-8 第二条就此闭合 |

## 8. 依赖

### 8.1 依赖

- **批次 A 出口**（PRD §7：AI 能力排在发布之后——没有用户的 AI 能力会重演「量具造好了没量过」）。
- **批次 C 的 CS6 号段规则先落**（或 owner 临时指定号段并登记——迁移号位竞态的唯一解）。
- 复用单源：agentService 管道（基线 #1）、source-ai 基建（#3）、台账与 consent 形制（#4/#5）、PendingIngestList UI 纪律（#7）——零新基建。

### 8.2 裁定记录（2026-10-24 闭合；owner 指令「按建议进行D批次收尾」授权，定稿即现实现）

1. **QG1 门槛值**：25% / 窗口每轮 ≥20 条候选 / 连续 2 轮——常量单源 `extract/adoption.ts` 与 `adoption-snapshots.ts`（`ADOPTION_THRESHOLD` / `ADOPTION_WINDOW_MIN` / `CONSECUTIVE_ROUNDS_TRIGGER`）；改判据 = 改常量。「新项目默认关提取」的执行面留批次 E（横幅建议已上屏）。
2. **本机端点免出网预算**：**采纳**。`ExtractRunner.local` 标记 + 预算检查移至 runner 就绪后，local 端点不计数（EXT-14；熔断提示含「本机推理端点不受此限」）。
3. **provider 配置存放**：**复用 `langInterpretProvider` 同键**（偏离原预判「新键」）——配置面零新增，用户配一次两线可用；设置页 AI 区有同源指引文案（「与解读服务区共用同一份配置」）。设置页同源关系已可见，owner 可推翻（撤回成本：新键 + 迁移配置）。
4. **预算制式**：**次数制**（每日 20 次调用，`DAILY_CALL_LIMIT`）替代 token 制——9 键台账白名单无 token 位，次数制零契约改动达成同等保护；审计面的计数粒度由 `ai_extract_shares` 表（0023）承载。owner 若坚持 token 制需扩白名单（B 级契约变更，另立裁定）。

**收尾补齐登记（同日）**：consent 四值推导走**专用表** `ai_extract_shares`（0023，对齐 M9 lang_source_shares 先例）——`deriveExtractConsent` 服务端推导（记忆+本次确认两输入，客户端无权上报分类），9 键白名单不动；「AI 与出网」区补齐 provider 同源指引与成本台账（`GET /api/ai/extract/usage`）；anchor 纯函数独立测试（6 支，零网络）；双闸独立性断言（EXT-13：agentWriteEnabled 关 + aiExtractEnabled 开 ⇒ 提取照常，M8 外部入口同时被拒）。

### 8.3 让位规则

批次 D 不可挤占批次 A（发布）；与批次 B/C 并行（代码域零交集，唯一共享面是迁移号段规则）。QG1 长期不达标且 owner 确认 ⇒ LLM 提取降级为「确定性提取 only」（分析文 CP4 形态回归），批次 E/F 不受影响。
