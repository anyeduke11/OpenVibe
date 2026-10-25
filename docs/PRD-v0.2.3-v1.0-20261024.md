# OpenVibe（灵典）v0.2.3 PRD：分发解锁、首圈飞轮、核心收拢与 AI Native 助手

| 项 | 值 |
|---|---|
| 文档定位 | **v0.2.3 版本专题 PRD + 需求文档 + 重构计划 + AI 架构设计（四合一）**。由本日两份前稿合并而成：v0.2.2（分发解锁与核心收拢）＋ M10（AI Native：氛围编程助手）。只载范围、需求、架构、验收、批次与诚实条款；不占 decisions.md 队列号、不改任何既有文档、不自授判级（一切判级均为**预判**，判级权在 owner，依据 dev-plan §0.3） |
| 版本语义注记 | owner 指定 **v0.2.3**。登记备查：补丁位承载能力域新增（AI Native）偏离了「minor 位 = 能力域」的惯例（M10 前稿曾建议 v0.3.0）；按 owner 编号执行，本文不再另议 |
| 裁定登记 | ① **v0.2.3 范围裁定**：本日多框架分析产出（第一性原理 → 批判性审查 → 奥卡姆剃刀 → 消融实验 → 理想-现实差距映射 → 约束理论），结论：唯一约束 = 没有真实用户，一切排期以解除它为第一序；② **LLM 推断式候选提取启用**（owner 2026-10-24 指令）：分析文 §5.4 CP4 为启用预设的两个条件——「独立的 B 级裁定 + 明确的质量判据」——由本行与 AN5 的 QG1–QG4 分别闭合 |
| 合并说明 | 两份前稿（`PRD-v0.2.2-v1.0-20261024.md`、`PRD-M10-ai-native-v1.0-20261024.md`）由本文**取代并删除**；两稿的需求编号（RQ/AN）与命名空间原样保留、合并登记见第 12 章；合并未删除任何验收条目 |
| 证据源 | 本日全项目分析；[analysis-2026-10-02-first-principles.md](./analysis-2026-10-02-first-principles.md)（下称「分析文」，其 AD/MT/CP/RF/GP/J 命名空间沿用不改）；`docs/specs/m9-dev-language-roadmap.md` §5（AI native 集成的既有设计）；`docs/specs/m8-agent-bridge.md`、`m8-agent-panel.md`；PRD.md 第 10/11 章 |
| 证据口径 | 本文全部数字为 2026-10-24 在本机工作树现测，复算命令集中在附录 A。凡未复算者一律写「未复算」；转任务时按分析文 §10-8 的既有规矩重采一次 |
| 状态 | **待 owner 审阅 → 逐条裁定（采/否/改）→ spec 化 → 转 tasks.md / dev-plan 任务化**。本文不修改任何既有文档、不动一行代码、不进队列 |

---

## 第 0 章 · 一句话与四条版本目标

> **v0.2.3 做四件事：把已建成但从未通电的机器接上第一批真实燃料（发布与首圈飞轮）；补上两件「做了直接服务留存」的欠账（verify 与段级 diff）；偿还三笔阻碍长期演进的结构债（核心包收拢）；把 AI 从「标注者」升级为「候选生产者与上下文服务者」，使 OpenVibe 具备氛围编程（vibe coding，定义见 PRD.md 附录 B）AI 助手能力。**

| 目标 | 内容 | 北极星（机器可判） |
|---|---|---|
| **G1 分发解锁** | `openvibe-cli` 真正上 npm，干净机复验通过 | 干净机上 `npx openvibe-cli serve` 起服务且九命令全通；**D15 证伪线开始计时**（起点 = `npm publish` 成功当日，tasks.md §5 既有裁定） |
| **G2 首圈真实飞轮** | 在真实项目上完整跑一轮「注入 → 使用 → diff → 回流」 | 《飞轮首圈报告》：注入次数、冲突处置分布、回流条数、D15 两腿实测值——全部从 `local_events` 读出，零人工计数 |
| **G3 核心收拢** | packages/core 回归「领域包」口径，M9 以显式声明的第二产品线存在 | 产品运行时出口不含 CI 守卫模块；「老库不更新」语义消除；8 处复制 SQL 归一 |
| **G4 AI Native 助手** | AI 帮你沉淀（提取）、帮你查项目（问答）、让任何 AI 助手用上你的标准（MCP 生态） | 三闭环各有一条端到端用例；**采纳率有第一批真实数据**（≥20 条候选经人工裁决） |

**四条目标的次序不可换**（约束理论判定）：G1 是总开关——没有用户的 AI 能力会重演「量具造好了没量过」的空转（E3），收拢与 AI 都让位于发布。

---

## 第 1 章 · 背景与证据（E1–E11）

本章只登记事实，全部可按附录 A 复算。证据编号 **E1–E11 为本文命名空间**（见第 12 章）。

| # | 证据 | 现测值（2026-10-24） | 对 v0.2.3 的含义 |
|---|---|---|---|
| E1 | npm 发布状态 | `openvibe-cli` 404；`openvibe@1.0.0` 存在但为**无关同名包**（maintainer `boxiaolanya2008`） | README「30 秒上手」第一条命令对新用户不可用；发布名继续用 `openvibe-cli`，包名摇摆史（分析文 §8.1-2：三易其名）必须在发布前一次裁定终结 |
| E2 | 测试基线 | 163 文件 / 2095 用例全绿（`pnpm test`，28.27s） | 自证体系健康，收拢与 AI 增量都有安全网；**但全部是自证** |
| E3 | 证伪线状态 | D15（工作台真实使用 <10 次或 DEV 日志 <5 条即触发 M5-lite 砍单）计时起点 = `npm publish` 成功当日 | **发布未发生 ⇒ 证伪线从未开始计时**——项目给自己造的纠错机制正被最后一步空转 |
| E4 | M9 体量占比 | core/src/db 下 36 个非测试 `m9-*` 模块；迁移 0011–0018 产生 12 张 `lang_*` 表；server 端 lang* 三组 = **24/116 条路由（21%）**；web 端 `/dev`、`/resources` 两页 | 消融实验：整体摘除 M9，核心飞轮零损失。它是**未声明的第二产品线**，长进了核心包、核心 barrel 与核心迁移序列 |
| E5 | 守卫代码错位 | `m9-external-content-scan.ts`（836 行）与 `m9-time-window-guard.ts`（578 行）的消费者是 scripts/ 与 tests/，却随 `@openvibe/core` 运行时发布 | 「core 是纯领域包」的宣称口径被稀释 |
| E6 | 种子双轨 | 主通道 `db/seed.ts` 有 seed_hash 三态合并 + 用户改动保护；5 个 m9 播种器是「一次性 INSERT OR IGNORE」，文件头自陈**「老库不会自动更新」** | 语义债务：语言层种子修订后已装库永不刷新 |
| E7 | 复制与死重 | seed-registry upsert SQL 逐字复制 8 处/7 文件；4 个生产模块仅被测试引用；core barrel 约 420 符号中 267 个零消费 | 收拢成本低、收益纯，分批走 |
| E8 | 10-02 分析文欠账 | verify 三方一致性（AD3-L2）与只读段级 diff（AD4-4a）未落地；README 已知局限自陈「改一行也要做全文件决策」 | 两件都是「做完直接服务留存」的欠账，且都不触 A 级冻结面 |
| E9 | 治理自证闭环 | docs:check 可机判漂移四类现值全 0（本文写作当日基线） | 治理体系**防漂移有效但防蔓延无闸**——E4 的 M9 体内扩张正是从所有闸下溜过去的 |
| E10 | 自证面残留 | 看板拖拽无自动化证据；win32 腿门控跳过 8 支 POSIX 用例；装包形态只在 macOS + 单一 Node ABI 复验过 | 发布说明「未验证面」清单须随 RQ1 逐项翻转或显式残留 |
| E11 | **AI 管道已实装**（M10 的启用前提） | ① M8 确认管道：`agent_ingests` 表 + `reviewIngest` 唯一确认入口 + `dispatchPublish` 首次分发 + 幂等三态 + Web `PendingIngestList`（纯文本渲染、码点截断、短 hash）；② M9 AI 四件套：多 provider 配置（Keychain、三档状态、key 永不回显）、OpenAI 兼容 runner（超时归一、只露 host、schema_version 先比版本）、`redactAbsolutePaths` 双向脱敏、consent 逐项目记忆可清除；③ **M9 规格已预设本路径**：`divergence.ts` 引规格原文「AI 产出的知识点/术语一律走 M8 回流 + 人工确认」 | 「LLM 提取」不是破土新工程，是把两条已验证的管道接通最后一截。分析文反对的理由「全仓零实现」已不成立（**2026-10-24 现测**：`grep -rn 'dispatchPublish\|reviewIngest' packages/core/src apps/server/src --include='*.ts'` → **33 命中** ⇒ 已被实装证伪）；「质量不可判定」由 QG1–QG4 的确定性闸回应 |

---

## 第 2 章 · 用户与场景（v0.2.3 服务四种人）

| 用户 | 场景 | 对应需求 |
|---|---|---|
| **① 干净机上的第一个使用者**（首要） | `npm i -g openvibe-cli` → 首启播种 → `sync --pack default` → `diff`。任何卡点（原生模块 ABI、pnpm approve-builds）都应得到**可读诊断**而非原始堆栈 | RQ1、RQ3 |
| **② dogfooding 中的 owner** | 在 2 个真实项目上：注入 → 日常改资产 → diff 处置漂移 → 从开发日志回流资产 | RQ2、RQ5 |
| **③ 未来的维护者/贡献者** | 打开 packages/core 找注入逻辑：应当只看到领域代码；改语言层种子内容，期望与主通道一样幂等合并 | RQ6（CS 全部） |
| **④ 氛围编程中的开发者与其 AI 助手们** | 开发者写完一天日志，点「提取候选」，LLM 把踩过的坑变成术语/提示词草稿待确认；在面板里问「这个项目下一步该做什么」，回答逐段标注来源；AI IDE 通过 MCP 直接读到项目的阶段/标准/术语 | AN1–AN5 |

---

## 第 3 章 · 目标与非目标

### 3.1 目标

见第 0 章四条。补充两条设计总纲：

- **AI 的产出永远停在人确认之前，判定层永远保持确定性**（AN 系全部需求的根）；
- **收拢是行为不变的重构，AI 是纯新增面**——两者不共用代码域，只共用迁移号段规则（见批次 D 前置）。

### 3.2 非目标（不做清单，逐条防蔓延）

- ❌ **M7 团队协作落地**（纸面冻结维持）
- ❌ **多包叠加 / 一项目多包**（lock 单包结构不动）
- ❌ **段级写盘（AD4-4b/4c）与 `schemaVersion` 升位**（留给 RF4 契约定型批：owner 签字 + 独立复核 + golden 重基）
- ❌ **`update` / `rollback` 子命令**（依赖段级写盘；本版只做只读的 verify 与段级 diff）
- ❌ **英文版 / i18n 框架**
- ❌ **云端账号 / 云同步 / 新增网络面**（MCP 走 stdio 无监听，不属网络面；OM 指标全部本机读取）
- ❌ **Store 端口 / 换存储**（只做 RQ1 的失败可读诊断）
- ❌ **删除既有治理登记**（收拢的是维护工时，不是记录量）
- ❌ **M9 功能扩张**（学习线冻结；本版只收拢其结构性错位）
- ❌ **AI 自动入库 / 自动改既有资产**（pending 纪律 + draft 兜底，永不豁免）
- ❌ **LLM 参与判定层**（sync/diff/指纹/五状态永远确定性代码——红线 8）
- ❌ **通用聊天 / 多轮对话记忆 / agent 规划**（AI 问题域限定本项目/本库）
- ❌ **本版 CLI 提取入口**（`openvibe extract` 列 P2 待裁：先验证 Web 入口使用率）
- ❌ **修改 `openvibe ask` 既有语义**（确定性七词是外部 agent 的契约，FR-4.1.1 维持）
- ❌ **对话历史持久化**（问答即算即走，与「不做后台常驻」根设定一致）

---

## 第 4 章 · 需求列表（RQ1–RQ7 产品与工程 + AN1–AN5 AI Native）

判级均为预判；验收标准全部机器可判或留痕可查。RQ 系与 AN 系的完整边界见第 12 章命名空间。

### RQ1 · 分发解锁（P0，判级预判：运营动作 + B 诊断）

**描述**：完成 v0.1.0 留下的最后一步——按 README「从源码开始」既有流程上线 `openvibe-cli`；发布前终结包名摇摆（owner 一次性裁定后登记）；发布后在**至少两个平台**干净环境复验九条命令（serve/sync/scan/diff/clean + ask/status/session log/requirement add）与离线注入（`sync --file`）。**附带（B）**：better-sqlite3 载入失败时的**可读诊断**——不抛原始 ABI 错误，输出「Node 版本 + 平台 + 三条修复路径」（分析文 AD1 第一步，降级实现维持不做）。

**验收标准**：
1. `npm view openvibe-cli version` 非 404；
2. 干净机复验记录归档 `docs/devlog-evidence/`：两平台 × 九命令 + 离线注入，逐条 pass/fail；
3. release-notes 新增「复验矩阵」段：E10 三项残留逐项翻转或显式声明继续未验证；
4. 诊断分支有用例：模拟 require 失败 ⇒ 输出含平台、Node 版本、修复路径三要素；
5. **D15 计时开始**：起点日期登记进 DEV_LOG。

**依赖**：包名终裁（owner）；无代码前置。

### RQ2 · 首圈真实飞轮协议（P0，判级预判：C 流程 + B 报告）

**描述**：定义并执行一轮 dogfooding 协议：① 选 2 个真实项目（其一为本仓自己——已按 Spec 驱动流吃狗粮）；② 各自完整跑 `sync --pack default` → 日常 ≥1 周 → 至少 1 次改资产组新版本 → `diff` 处置漂移 → 从开发日志**回流 ≥3 条资产**；③ 全程不清空本机事件台账；④ 产出**《飞轮首圈报告》**：注入次数、冲突处置分布、`diff` 退出码分布、回流条数、D15 两腿实测值——全部从 `local-events/summary` 与既有表读出，零人工计数。

**验收标准**：
1. 报告落 `docs/devlog-evidence/`，附数据导出命令；
2. 回流资产 ≥3 条且带来源反链；
3. 报告含「D15 判定」节：两腿实测值 + 是否触发 M5-lite 预案——**触发不是失败，是证伪线按设计生效**；
4. 报告含「首圈摩擦清单」：每个卡点如实登记（本版之外下一版需求的唯一合法来源）。

**依赖**：RQ1。

### RQ3 · `openvibe verify`：三方一致性核验（P1，判级预判：B）

**描述**：落地分析文 AD3-L2。新增只读命令 `openvibe verify <dir>`：对**包内容 / `pack.lock.json` 期望哈希 / 磁盘实际**三方现算比对（三个哈希原语均在 core，无新算法），输出四态：`CONSISTENT` / `PARTIAL`（疑似上次注入中断）/ `STALE_LOCK` / `ORPHAN`，每态附一行人话 + 修复建议；**不写盘、不改 lock 契约**（一致性每次现算，不落盘）。

**验收标准**：
1. 四态各一支用例（人为造中间态：半途 kill 注入、手改 lock、手放新文件）；
2. 退出码语义入 README（0 一致 / 2 有偏差 / 1 出错，与 diff/clean 同族）；
3. `sync` 启动时内部跑一次 verify，PARTIAL 时提示「上次注入可能中断」（只提示不自动修复）；
4. golden 产物零变化。

### RQ4 · 段级差异展示，只读（P1，判级预判：B）

**描述**：`diff` 输出从「文件级 DRIFT」细化为「段级：哪一段变了、变了多少行」（对比包渲染的段文本与磁盘上按既有 `<!-- openvibe:begin/end -->` 标记切出的段文本）。**不改契约、不改写入行为、不改五状态判定**——标记已预埋三周+，这是它的第一个消费方。

**验收标准**：
1. 1000 行文件改 1 行 ⇒ 报文给出段名与行数；
2. 五状态判定与 `--strategy` 语义零变化；
3. 产物字节零变化（golden 不重基）；
4. 段外自由区显式标注「永不触碰」。

**依赖**：无硬依赖；排期放批次 C，A/B 滑期则让位。

### RQ5 · 输出侧度量最小集（P1，判级预判：B）

**描述**：落分析文 MT 层两个最小指标，数据全部来自本机 `local_events` 与既有表，零新增采集点、零出网：**OM1 有效上下文密度**（注入受管 token 数 ÷ 包覆盖资产数，含按资产归因 Top5）；**OM2 首次见效时间**（首启 → 第一次 `injection_confirmed` 墙钟差）。落点：设置页本机统计区或工作台飞轮卡（owner 裁）。

**验收标准**：
1. 同一包两次组装的密度可复算且确定；
2. 空台账显式显示「待采集」，不显示 0 或 NaN；
3. 「永不上报」文案沿用本机事件台账既有声明，一字不改。

**依赖**：RQ2。

### RQ6 · 核心收拢（P1，重构计划主体 → 第 5 章 CS1–CS6）

**描述**：消除 E4/E5/E6/E7 指向的结构性错位。全部为行为不变的重构（C）或纯内部语义修正（B），唯一对外可见变化是 `@openvibe/core` 出口面收窄。详见第 5 章。

### RQ7 · 发布工程与信任面（P2，判级预判：C 文档）

**描述**：把 RQ1 的复验动作沉淀为制度：release-notes 模板增补「复验矩阵」段；README「30 秒上手」在 publish 后实测复测；隐私承诺各节随 verify/段级 diff/AI 能力增量更新（措辞级 C）。

**验收标准**：README 无一处与新版本行为矛盾的数字（docs:check「被引用数字 vs 来源」闸兜底）。

### AN1 · LLM 推断式候选提取（P0〔AI 线内〕，判级预判：B）

**描述**：在项目工作台开发日志区新增「提取候选」动作（单条详情 + 多选）：把选中日志正文（＋可选资产上下文摘要）交 LLM 推断**术语 / 提示词 / 技巧**三类候选草稿，结果**一律落 `agent_ingests` 表 pending**（新增三个 kind，见 AN4），用户在既有 AgentPanel 待确认列表逐条裁决，首次确认才写业务表——terms/prompts/playbooks 各以 `status='draft'`、`source='ai_extract'`、**携带来源反链**（来源 dev_log id + 原文引用段）入库，与人工回流资产同形制。

**服务端后验锚定校验（本需求关键设计，QG3 落点）**：LLM 返回的每条候选在落 pending **之前**过确定性校验——候选的术语词/关键词必须逐字命中源日志原文；不过者**服务端直接丢弃**（计台账 `droppedCount`），不给用户看。理由：分析文反对的理由是「质量不可判定」——采纳与否不可判定，但「是否锚定在原文上」完全可判定；**幻觉候选在进人工视野前就被确定性代码杀掉**。

**验收标准**：
1. 三个新 kind 各一支端到端用例：日志含已知术语 ⇒ 提取 → pending → 人工确认 → 业务表 draft 行带来源反链；
2. 锚定校验用例：构造 LLM 返回原文中不存在的候选 ⇒ 丢弃且不出现于待确认列表、`droppedCount` 增 1；
3. 未确认前业务表零写入（复用 M8 既有断言模式）；
4. 提取开关关闭时入口不渲染（DL-08 口径）；
5. CLI 入口不在本版（第 10 章不做清单）。

### AN2 · 项目问答：确定性 `ask` 保留，AI 问答并列新增（P1〔AI 线内〕，判级预判：B）

**描述**：`openvibe ask` 七个闭集关键词**一字不改**（FR-4.1.1 不修订）；**并列新增** AI 问答通道：CLI `openvibe discuss "<自由文本>"`（命令名待 owner 裁）+ Web AgentPanel 新增「问」块，同一服务端端点。经服务端组装项目上下文（复用 context API 的 `?fields=`/`?budget=` 纪律）交 LLM 生成，回答**必须逐段标注「基于哪段上下文」**；预算不足按既有纪律如实声明 `truncated`——**答案每一段都要能追溯到 OpenVibe 自己管的数据**，这是它与通用聊天的本质区别。**问答只读**：零写库零写盘，local_events 只记调用事实不记内容。

**验收标准**：
1. `openvibe ask` 现有用例全绿零改动；
2. discuss 回答含逐段来源标注；伪造来源不可发生（来源列表由服务端随回答返回，不从 LLM 输出解析）；
3. 零写库断言：discuss 前后全部业务表逐字不变；
4. provider 未配置 ⇒ 入口不渲染 + CLI 人话提示（unconfigured/misconfigured 两态分列）。

### AN3 · MCP 上下文服务（P1〔AI 线内〕，可裁剪项，判级预判：B）

**描述**：新增 `openvibe mcp` 子命令：以 **stdio 形态**的 MCP（Model Context Protocol，AI IDE 与工具间的开放协议）暴露 2–3 个只读 tool——`project_context(project_id, fields?, budget?)`、`search_assets(query, kind?)`、`pack_diff(project_dir)`。全部转发到本地 serve 的既有 HTTP API（CLI 从不直接开 DB 的红线维持），**stdio 子进程无网络监听**，与「只听回环 + 关闭即零外联」根设定兼容。这是生态闭环：AI 助手们写代码时直接读到项目的阶段/标准/术语，OpenVibe 从「注入一次的静态文件」变成「随问随答的活上下文」。

**验收标准**：
1. MCP 协议握手 + 三 tool 的 schema 用例；
2. 全部 tool 只读：无任何写端点暴露；`pack_diff` 复用 diff 退出码语义；
3. serve 未启动 ⇒ 人话提示；
4. 离线场景首版明确不支持，登记发布说明。

### AN4 · AI 治理面：同意、台账、预算、开关（P0〔与 AN1 同批不可拆〕，判级预判：B）

**描述**：把 M9 已验证的治理四件套平移到提取/问答两个新出网场景：

| 件 | 设计 | 复用锚点 |
|---|---|---|
| **同意** | 新表 `ai_extract_consent`（project_id 主键，remember_all，remembered_at），语义逐字平移 `lang_source_consent`：逐项目（防跨项目授权泄漏）、出网前展示确切待发内容、记忆可清除、**清除 = 删行**（DL-21：不留「曾记住」残影）。问答通道出网物是脱敏后的上下文摘要，同样受逐项目同意管 | `m9-source-scan.ts` 三件套；`deriveConsentDetail` 服务端推导授权来源、不采信客户端 |
| **台账** | 新 kind `ai_extract_call`（提取出网）与 `ai_discuss_call`（问答出网）进 `LOCAL_EVENT_KINDS` 闭集——**SQLite 不能 ALTER CHECK，必须开新迁移**（0010/0011 先例）；payload 白名单逐键构造 9 键（`aiModel/aiProvider/inputHash/candidateCount/passedCount/droppedCount/result/failureReason/durationMs`），**无正文容器 ⇒ 日志原文在类型上进不来** | `ledger.ts`；`constants.ts` AGENT_PAYLOAD_SHAPE |
| **预算** | 单次提取 token 预算（默认值 spec 化时定，预判 8k）＋ 每日 token 上限（从台账 usage 累计现算）；超限当日拒绝并如实提示，**绝不静默降质** | `lang_source_shares.usage_total_tokens` 既有累计口径 |
| **开关** | `app_meta` 新增提取总闸（默认**关**，形态对齐 M8 `agentWriteEnabled`：关着整批拒绝、拦在服务层）；设置页新增「AI 与出网」汇总区：provider 多份配置、consent 列表、成本台账、清空入口 | `agentService.ts` 写侧总闸；设置页既有「解读服务配置、来源成本台账」区 |

**验收标准**：
1. 两个新 kind 的 CHECK 迁移用例（新 kind 可写、旧 kind 行为不变）；
2. payload 白名单守卫测试：构造含正文字段的载荷 ⇒ 台账行无该键（DL-16 模式）；
3. 清除 consent = 删行断言 + 清除后立即回到全不勾；
4. 总闸关闭时 AN1/AN2 全部入口 422 或不渲染（服务层拦截，非路由层）；
5. 预算熔断用例：构造超限台账 ⇒ 当日调用被拒且提示含「今日已用/上限」两个数。

### AN5 · 质量判据与影子门槛（P0〔AI 线内〕，判级预判：C 面板 + B 降级逻辑）

**描述**：分析文启用条件「质量判据」半边，全部可机判：

- **QG1 采纳率门槛**：采纳率 = `published ÷ (published + rejected)`（按 kind 分组，数据 = agent_ingests review 结果 join 台账）；统计窗口每轮 ≥20 条候选；**连续 2 轮 <25% ⇒ 设置页出现建议关闭横幅 + 新项目默认关提取**（已开项目不强制关，横幅如实呈现数据）。25% 与 20 条是首版预判值，owner 可改；改判据 = 改常量单源，不改逻辑。
- **QG2 成本上限**：见 AN4 预算件。
- **QG3 幻觉防线**：见 AN1 锚定校验。
- **QG4 台账完整性**：每次真的出网必有台账行（成功/失败都记）；没出网（provider 不可用/空输入）必无行——两条都有用例。

**验收标准**：采纳率面板从台账与 review 结果现算（无第二数据源）；门槛触发/解除用例各一支（构造连续低采纳窗口）。

---

## 第 5 章 · 重构计划（CS1–CS6）

**CS = Consolidation Step**。共同纪律：**行为零变化**（除 CS2 的显式语义修正外）、每批独立可回退、每批完成即 `pnpm test` + `docs:check` 全绿 + DEV_LOG 登记。

| # | 内容 | 动作 | 判级预判 | 验收标准（机器可判） |
|---|---|---|---|---|
| **CS1** | **CI 守卫迁出产品出口** | `packages/core/package.json` 增加 `exports` 子路径 `./tooling`；把消费者仅为 scripts/tests 的模块（`m9-external-content-scan`、`m9-time-window-guard`、p1b/p1d spec 解析器系）移入 `src/tooling/` 并从主出口移除 re-export；scripts/tests 改从 `@openvibe/core/tooling` 导入 | C | ① 主出口 grep 守卫模块 0 命中；② 导出面不含守卫符号（用例断言）；③ CI 全绿 |
| **CS2** | **种子纪律归一** | 5 个 m9 播种器接入主通道 seed_hash 三态合并语义（幂等 + 用户改过则跳过）；保留「一次性播种」快速路径但登记为同语义实现细节 | **B（语义修正）** | ① 改一条 m9 种子内容 ⇒ 已装库 reseed 后生效（新用例）；② 用户改过该行 ⇒ reseed 跳过（新用例）；③ 移除「老库不会自动更新」注释及行为 |
| **CS3** | **upsert SQL 归一** | 抽 `seedRegistryUpsert(bundle, contentHash)` helper，替换 7 文件 8 处逐字复制 | C | `grep -rn 'ON CONFLICT(bundle) DO UPDATE SET content_hash' packages/core/src` 仅剩 helper 一处；全部播种器用例绿 |
| **CS4** | **死模块处置** | 4 个仅测试引用的生产模块逐条 owner 裁定：`m9-topic-terms` / `m9-topic-filter` / `m9-p1b-readme` / `m9-p1f-grade-guard`——能接进生产的接，否则移入 `src/tooling/` 或删除 | C | core 内不存在「零生产消费者」的 src 模块（新守卫测试断言） |
| **CS5** | **barrel 分批收敛** | 267 个零消费符号按三批清理（每批 ≤80，先清纯类型/常量）；scripts 侧改深路径导入 | C | 每批后 CI 绿 + `wc -l packages/core/src/index.ts` 下降值登记 DEV_LOG；不设一次清零死线 |
| **CS6** | **M9 第二产品线声明与边界** | docs 增补「产品线边界」节：分发线（M1–M8 闭环）与学习线（M9）各自的范围、共享面与不共享面；约定 `lang_*` 迁移只占用独立号段，核心域迁移不与 lang 域混号 | C（文档）+ 可选 B：边界进 docs:check 机判面（与 CS1 验收共用） | 声明可被 docs:check 引用且自身过闸；号段规则写入 dev-plan 邻域并过 docs:check |

**批次内顺序**：CS3 → CS2（helper 先行）；CS1 与 CS4/CS5 可并行；CS6 最后（声明落在收拢后的事实上）。**收拢全程让位于 G1/G2**（批次 C 滑期不挤占发布与首圈）。

---

## 第 6 章 · AI Native 架构设计（增量最小化）

```
                       ┌─ AN1 提取 ──┐        ┌─ AN2 问答 ──┐
Web 日志区「提取候选」  │             │        │ AgentPanel 问块 │   CLI discuss
        └──────► apps/server/src/routes/extract.ts + discuss.ts（新，纯编排）
                              │
              packages/core/src/extract/（新目录，与 source-ai 平行）
              ├─ extract-service.ts   编排：读日志 → 组装 → 出网 → 锚定校验 → 落 pending
              ├─ extract-prompt.ts    提示词单源进 packages/shared（buildExtractPrompt + schema_version）
              └─ extract-schema.ts    候选 zod 契约（三类候选各自 shape + 版本比对）
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
  source-ai 既有件        agentService 既有件       ledger/consent 既有件
  provider-config         agent_ingests 表          新迁移：两个台账 kind
  http-runner/keychain    + 三个新候选 kind          + ai_extract_consent 表
  redact（双向脱敏）       reviewIngest/dispatch     + PAYLOAD 白名单键
                          （dispatch 增三分支）       + app_meta 总闸键
```

**要点**：

1. **不复用 `lang_source_consent` 表**而新建 `ai_extract_consent`：语义同构但用途域不同（源码片段 vs 日志正文），共用会让「清除源码同意」连带清掉日志同意，违反最小授权。
2. **`agent_ingests` 扩三个 kind 而非新表**：pending→review→dispatch 机器、幂等三态、Web 纪律全部白得；代价是开一个迁移扩 CHECK 闭集——这是**产品决定**（M8 纪律「扩列是产品决定」的正用：产品自己扩自己的列，走迁移、留登记）。
3. **`dispatchPublish` 增三个分支**：各写各的业务表，`status` 恒为 `'draft'` **不接受载荷值**（对齐 requirement 分支的二次兜底）；来源反链随载荷走白名单。
4. **runner 不新造**：注入接口原样用（prompt builder 与结果 schema 换新），失败六值闭集、版本比对、只露 host 全部继承。
5. **锚定校验是纯函数**（`extract/anchor.ts`）：先写用例再接 LLM（用例不依赖网络）。

**AI 红线（继承 M9 六条 + 新增三条，零放宽）**：

继承：① AI 结果不得绕过判定层/人工确认；② 台账只存指纹与计数，payload 白名单逐键构造；③ 出网前展示确切内容 + 同意记忆可清除且清除即删行；④ 路径相对化 + 正文脱敏双向；⑤ 失败降级如实显示，「没配」与「跑挂了」是两件事；⑥ 契约先比 `schema_version` 再谈字段。

新增：⑦ **内部 AI 产出按外部 agent 待遇**（pending → 人工确认才生效；候选 status 恒 draft 不接受载荷值）；⑧ **判定层零 AI**（五状态、漂移、指纹永远确定性）；⑨ **问答只读**（零写库零写盘；来源标注由服务端随答案返回，不从 LLM 输出解析）。

---

## 第 7 章 · 统一排期（批次 A–F）

名义 6 周（单人 + 并行 AI 会话口径）。**批次间软依赖，批次内可并行**；批次 A 不可让位。

| 批次 | 窗口 | 内容 | 出口判据 | 让位规则 |
|---|---|---|---|---|
| **A · 分发周** | 第 1 周 | RQ1 + RQ7 | `npm view openvibe-cli version` 非 404；两平台九命令复验归档；D15 计时开始 | **不可让位**——全版本关键路径 |
| **B · 首圈与自证** | 第 2–3 周 | RQ2 首圈（跨两周自然日，等待期做 RQ3/RQ5）、RQ3 verify、RQ5 度量 | 《首圈报告》落盘；verify 四态用例绿；OM1/OM2 上屏 | 首圈观察窗口 ≥1 周不可压缩，与开发并行 |
| **C · 核心收拢** | 第 3–4 周 | RQ4 段级 diff + CS1–CS6 | 第 5 章 CS 验收逐条 + RQ4 四条 | **A/B 滑期 ⇒ C 整体后移**，不切割 |
| **D · AI 提取闭环** | A 出口后 ~1 周，**可与 B/C 并行** | AN1 + AN4 + AN5（三者同批不可拆） | AN1/AN4/AN5 验收逐条；采纳率面板上屏 | 前置：**CS6 号段规则先落**（本批两个新迁移不与核心域混号）；provider 已配置的真实项目 ≥1 个 |
| **E · AI 问答** | D 后 ~1 周 | AN2 | AN2 四条验收；`ask` 回归零改动 | D 的 provider/同意/预算面就绪 |
| **F · AI 生态** | E 后 ~1 周，**可整体裁剪** | AN3（MCP） | AN3 四条验收 | serve API 稳定 |

**正交性声明**：本表与 PRD.md 第 10 章 RF0–RF5 正交——RF1 的 1-2（RQ3）与 1-3（RQ4）至此落地，RF2/RF3 其余条目（成长阶段机、推荐引擎等）不在本版；批次 D–F 与批次 B/C 无代码域交集（AI 全是新增面），唯一共享面是迁移号段规则。

---

## 第 8 章 · 版本 DoD（完成定义）

1. **G1**：npm 在线 + 两平台干净机九命令复验归档 + D15 计时开始（E1/E3 翻转）。
2. **G2**：《飞轮首圈报告》落 `docs/devlog-evidence/`，含 D15 判定节与首圈摩擦清单；回流资产 ≥3 条。
3. **G3**：CS1–CS6 验收逐条通过；`docs:check` 全绿。
4. **G4**：AN1–AN5 验收逐条通过；**采纳率有第一批真实数据**（D 出口后 2 周内 ≥20 条候选经人工裁决）——AI 能力不许重演「待采集」空转。
5. **自证增量**：RQ3/RQ4 与 AN 全部用例绿且 golden 零重基；`pnpm test` 用例数只增不减（运行器报告口径，不写死数字）。
6. **零回归**：`openvibe ask` 与全部既有 M8/M9 用例零改动通过。
7. **发布说明**：含「复验矩阵」「本版未验证的事」「AI 能力的出网清单」三节——后者逐项列出什么数据在什么同意下发给什么 provider（README 隐私节同步增补，措辞级 C）。
8. **治理面**：设置页「AI 与出网」区四件（provider/consent/成本/清空）齐且各有用例。

---

## 第 9 章 · 风险与反例（诚实条款：本文可能在哪儿错）

| # | 反例 | 触发条件 | 若成立，本文怎么改 |
|---|---|---|---|
| 1 | **包名第三次摇摆** | publish 前发现 `openvibe-cli` 语义/检索劣势，owner 想再议 | 排期全部后移；包名终裁前置为批次 A 第 0 号任务，且必须在 decisions 队列留痕 |
| 2 | **干净机复验大面积失败** | better-sqlite3 在某平台/ABI 上 prebuild 失败率不可接受 | RQ1 的「可读诊断」不够 ⇒ AD1 第二步（Store 端口降级实现）解锁条件触发，重议；本文唯一允许重开技术选型的情形 |
| 3 | **首圈飞轮证伪** | 《首圈报告》显示回流入口从未被自发使用，或 D15 两腿同时不达 | **按设计触发 M5-lite 预案**：工作台 UI 后移，流程模板仅经 CHECKLIST.md 注入；RQ5 收缩；下一版 PRD 以该报告为唯一证据源 |
| 4 | **收拢引发回归** | CS 批次任一条导致 >1 天修复 | 该 CS 条目回退（每批独立可回退是硬要求），收拢让位；G3 降级为「部分完成」如实登记 |
| 5 | **采纳率长期不达标** | QG1 连续 2 轮 <25% 且 owner 确认 | LLM 提取降级为「确定性提取 only」（分析文 CP4 形态回归），默认关——**这是判据生效，不是失败**；批次 E/F 不受影响（问答/MCP 与提取质量无关） |
| 6 | **成本失控** | QG2 熔断频繁触发 | 默认预算下调；provider 首选本机端点（`isLocalEndpoint` 已判别，本机模型不出网不进预算） |
| 7 | **隐私事故** | 任何一次出网内容超出同意范围 | 最高级回退：AI 功能整体关闭 + 事故登记 + 复盘进 DEV_LOG；consent 实现逐行审计后才可重开 |
| 8 | **MCP 无人消费** | 批次 F 交付后无任何 AI IDE 实际接入 | AN3 裁剪移除（stdio 服务零常驻成本，维护面归零） |
| 9 | **「助手能力」被读成聊天产品** | 需求评审出现「多轮对话/记忆/插件」类诉求 | 引用第 0 章定位边界拒绝；真要做 = 另开版本线重新裁定，不搭本版的车 |
| 10 | **口径腐烂** | 本文数字/代码锚点随 CS 收拢或发布翻转（如 E1 的 404、source-ai 文件迁出） | 全部数字带附录 A 复算命令，转任务时按分析文 §10-8 重采；E1 的 404 是 2026-10-24 现测，publish 后该行即过时 |

---

## 第 10 章 · 不做清单（合并汇总，见 3.2）

第 3.2 节十五条款即本版完整不做清单，此处不重复。其中三条因合并而需特别声明读法：

1. 原 v0.2.2 前稿的「❌ LLM 推断式候选提取」**已因裁定登记②撤销**——它现在是本文 AN1，受第 6 章九条红线与 AN5 影子门槛约束；
2. 原 M10 前稿的「CLI 提取入口 P2 待裁」**维持**——AI 能力本版只开 Web 入口；
3. 两条清单的其余各项无冲突，直接并集。

---

## 第 11 章 · 被本裁定触动的既有条文（待 owner 逐条走 §0.3，本文不代改）

| 既有条文 | 原文立场 | 本裁定后的处置 |
|---|---|---|
| `docs/specs/m4-playbook.md` §2 Out | 「自动从日志提取候选」不做，「全仓零实现且质量不可判定」（**2026-10-24 现测同值**：复算命令与判定口径见 `docs/specs/m4-playbook.md` FR-5 第 2 条） | **反转**：spec 升版，Out 节移除该项并指向本文 AN1/QG1–QG4（spec 化后指向 m10 spec） |
| PRD.md 第 10 章 §10.3 不做清单 | 「不做 LLM 推断式候选提取」全数采纳 | **反转**：owner 裁定记录进 decisions 队列（新号，本文不占号只建议）；PRD.md 附录 D 变更日志随版本章开档时登记 |
| `m8-agent-bridge.md` FR-4.1.1 | `openvibe ask` 不接 LLM | **不修订**（ask 契约不动）；AN2 是并列新通道，spec 化时登记相邻关系 |
| M9 `divergence.ts` 引规格原文 | 「AI 产出走 M8 回流 + 人工确认」 | **执行而非修订**——AN1 就是这条预设的落地 |
| 分析文 CP4 边界 | 确定性提取；LLM 须独立裁定 + 质量判据 | **两个启用条件由本文闭合**（裁定登记②；QG1–QG4） |
| 两份前稿（PRD-v0.2.2 / PRD-M10） | 各自独立待裁 | **已并入本文并删除**，命名空间合并登记见第 12 章 |

---

## 第 12 章 · 命名空间映射（防撞号）

| 本文 | 含义 | 与谁相邻 | 冲突 |
|---|---|---|---|
| E1–E11 | 证据条目（第 1 章） | 分析文 GP1–GP11（差距）、J1–J9（结论） | 无 |
| RQ1–RQ7 | 产品与工程需求（原 v0.2.2 前稿） | 分析文 R1–R5（健壮性五维）——RQ 刻意避开 R | 无 |
| AN1–AN5 | AI Native 需求（原 M10 前稿） | RQ 系——两系并存不重编号，合并说明见头表 | 无 |
| QG1–QG4 | AI 质量判据 | 分析文 MT1–MT6、R1–R5 | 无 |
| OM1–OM2 | 输出侧度量（RQ5 内） | MT1–MT6——OM 是 MT 子集的落点，不重定义 | 无 |
| CS1–CS6 | 收拢步骤（第 5 章） | 分析文 AD1–AD12、CP1–CP6、RF0–RF5 | 无 |
| 批次 A–F | 排期批次（第 7 章） | DEV_LOG 提交信息中「批次 A–E」（2026-10-22 owner 增强的历史用法）——**同名不同指，以第 7 章章节锚定** | 已登记 |
| `ai_extract_call` / `ai_discuss_call` | 新台账 kind（AN4） | 既有 `ai_recommend_call`（解读）——同族不同名 | 无 |

---

## 附录 A · 复算命令（全部数字的采样口径）

```bash
# E1 npm 状态（2026-10-24 现测；publish 后即过时）
npm view openvibe-cli version                 # → 404
npm view openvibe description maintainers     # → 无关包（boxiaolanya2008）

# E2 测试基线
pnpm test                                     # → 163 files / 2095 tests（28.27s，运行器报告为唯一权威口径）

# E4 M9 体量
ls packages/core/src/db/m9-*.ts | grep -v test | wc -l   # → 36
grep -rhoE 'CREATE TABLE (VIRTUAL )?lang_[a-z_]+' packages/core/src/db/migrations/*.sql | sort -u | wc -l   # → 12

# E5 守卫代码
wc -l packages/core/src/db/m9-external-content-scan.ts packages/core/src/db/m9-time-window-guard.ts   # → 836 / 578

# E6 种子双轨
sed -n '10,25p' packages/core/src/db/m9-p1-seed-lang-topics.ts   # → 自陈「老库不会自动更新」

# E7 复制与死重
grep -rn 'ON CONFLICT(bundle) DO UPDATE SET content_hash' packages/core/src --include='*.ts' | wc -l   # → 8
wc -l packages/core/src/index.ts              # → 511

# E8 欠账
grep -rn 'verify' apps/cli/src/index.ts | wc -l        # → 0（命令不存在）
grep -n '没有 `update` 子命令' README.md               # → 已知局限第 2 条

# E9 治理基线
pnpm docs:check                               # → 可机判漂移四类全 0（2026-10-24 基线）

# E10 自证残留（README 自陈）
grep -n '看板拖拽\|win32' README.md

# E3 证伪线（tasks.md §5 既有裁定）
grep -n 'D15' docs/tasks.md | head -3

# E11 AI 管道实装（AN 系的复用前提）
grep -n '不自动入库\|M8 回流' packages/core/src/source-ai/divergence.ts
ls packages/core/src/source-ai/
grep -n 'agentWriteEnabled' packages/core/src/services/agentService.ts | head -2
grep -n 'AGENT_INGEST_KINDS\|ai_recommend_call' packages/shared/src/constants.ts | head -4
grep -n 'reviewIngest\|dispatchPublish' packages/core/src/services/agentService.ts | head -4
ls apps/web/src/components/agent/
grep -n 'ASK_KEYWORDS' apps/cli/src/commands/ask.ts | head -2
```

## 附录 B · 术语

| 词 | 定义 |
|---|---|
| **收拢（consolidation）** | 行为不变的结构重构：把错位的代码归位、把复制的实现归一，不改变任何用户可见行为 |
| **首圈（first lap）** | 标准化飞轮在真实项目上的第一次完整旋转：注入 → 使用 → 漂移处置 → 回流 |
| **证伪线** | 预先登记的「不达标即触发预案」判据（D15），其价值在于可能证明产品假设错误 |
| **输出侧信号** | 描述「注入之后效果如何」的数据（密度/时效/使用事件），与「库里有多少」的输入侧计数相对 |
| **第二产品线** | 与核心飞轮无数据流因果关系的功能集合（M9 学习线），服务 owner 自己的学习场景 |
| **候选（candidate）** | LLM 从日志推断出的资产草稿（术语/提示词/技巧），未确认前只存在于 pending 队列 |
| **锚定校验（grounding check）** | 服务端确定性校验：候选关键词必须逐字命中源日志原文，否则丢弃——把「质量不可判定」中可判定的部分从 LLM 手里拿回来 |
| **影子门槛** | 预先登记的质量判据（QG1–QG4）与不达标时的自动降级动作；功能上线时即生效，不事后追溯 |
| **内部 AI 按外部 agent 待遇** | 系统自己的 LLM 产出与外部 agent 上报走同一条 pending→人工确认→分发管道，不因「是自己人」豁免 |

---

**本文完**（v0.2.3 专题 PRD v1.0，2026-10-24；由两份前稿合并而成，前稿已删除；待 owner 裁定）。

**下一步建议**：① owner 对 RQ1–RQ7 与 AN1–AN5 逐条标注（采/否/改），QG1 两个门槛值与预算默认值定数；② 批次 A 的包名终裁先落 decisions 队列；③ 第 11 章被触动条文逐条走 §0.3（m4 spec 升版 + decisions 新号）；④ **spec 化已完成（2026-10-24）**——按本文一级计划（批次 A–F / 目标 G1–G4）拆为五件，全部 v0.9 草案待裁：`specs/v023-a-launch.md`（批次 A/G1：RQ1+RQ7）、`specs/v023-b-first-lap.md`（批次 B/G2：RQ2+RQ3+RQ5）、`specs/v023-c-consolidation.md`（批次 C/G3：RQ4+CS1–CS6）、`specs/v023-d-ai-extract.md`（批次 D/G4：AN1+AN4+AN5）、`specs/v023-e-ai-assistant.md`（批次 E+F/G4：AN2+AN3）；各件的待裁清单见各 spec §8.2；⑤ 全部数字转任务时按分析文 §10-8 重采。
