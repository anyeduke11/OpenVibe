# SPEC · M8 Agent 接入层（读写核心：回流写入面 + CLI 读写面 + 聚合查询面）

| 项 | 值 |
|------|------|
| 模块 | **M8 · Agent 接入层**（PRD 第 3 章新增第 8 模块）。本 spec 覆盖其中**三个子面**：M8-B 回流写入面、M8-C CLI 读写面、M8-D 聚合查询面。**M8-A（官方 skill 包）与 M8-E（Web 面板）不在本 spec**，拆分理由见 §2 |
| 优先级 | **B**（新增表 + 新增端点 + 新增 CLI 命令；**不动** design §7 契约面 / §8 adapter 冻结面 ⇒ 不构成 A 级）。逐项判级见 §4 各 FR 末尾 |
| 上游 | `docs/PRD-M8-agent-bridge-v1.0-20261013.md`（M8 全模块）· `local-event-ledger.md`（台账，**其 §3-1 号位断言已随 owner 裁①于 2026-10-14 回改为 `0007`，见 §3-8 的历史采样**；**迁移已于 DEV-0094 落地 `0007`**）· `service-layer.md`（服务层，**部分落地** —— `agentService`/`contextService` 已写，`packService`/`injectService` 未写）· `m5-project-flow.md` · `m6-cli-injection.md` · `m2-skill-distribution.md` · `output-validation.md` · `dev-plan.md` §0.3 判级 / §0.4 第 4 条 / §1.2 |
| 下游设计 | `docs/design.md` §5（数据模型）· §6（路由面）· **§3 Monorepo 结构**（`:66` 依赖方向 —— 分层约束的真正出处，`apps/* → packages/{core,adapters,shared}`、`core → shared`、**core 不依赖 server**）＋ `docs/dev-plan.md` §1.1· §11.5（遥测白名单，本项**不触碰**） |
| 关联任务 | **无**。两条依据：① `dev-plan.md` §0.4 第 4 条「No spec, no task」——P1/P2 功能进入开发前必须先有 spec 八段式 + 验收条目；② PRD §10.4 第三组「本轮**不建任务组**，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」。下一空号 T14 须待 **Phase 1 开工前置（RF1-1 服务层 ＋ RF1-5 台账）转绿**后再申请 |
| 版本 | **v1.0（2026-10-14）**。§8.2 五处待裁**已全部闭合**（owner 亲裁），本 spec 由 v0.9 草案升为可开工依据的规格。⚠️ **「五项闭合」≠「可以开工」**——总闸 RF1-5 台账未落地，FR-1.1 已把 M8 排在台账下游 |
| 采样 | 2026-10-13 工作树；引用提交树 **`4b42642`**（上一采样 `54789b8` 已被 DEV-0090/0091/0092 三个提交超越，**旧行号全部失效**，§3 逐条重采） |

---

> ## 🔴 实施现状订正（2026-10-15 · 规格与实现已背离，必须先读这段）
>
> **本 spec 的 FR-5.4 / §6.2 / §6.8 三处「只声明不写入」「服务层为硬前置」的表述，在实现上已经不再成立。**
>
> | 本 spec 的原文 | 实际发生 |
> |---|---|
> | FR-5.4：「台账 spec 未落地 ⇒ **M8 五类 kind 只声明不写入**」 | **已写入**。`agentService` 与 `contextService` 两处调用 `localEvents.record`（DEV-0095/0096/0097） |
> | §6.2：「`service-layer.md` 未落地 ⇒ 本项的 route 若在服务层之前写，§3-7 命中数会**反向增长**」 | **未反向增长**。M8 的 route 只调服务层，`new [A-Z]*Repo(` 与 `db.prepare(` 在 `routes/agent.ts` 内命中数 **0** |
> | 头部「⚠️ 五项闭合 ≠ 可以开工——总闸 RF1-5 台账未落地」 | 迁移已落地（DEV-0094），但 **0-f 总闸判据仍未验过** |
>
> **背离的成因不是实现跑偏，而是 owner 越过前置**：owner 2026-10-15 指令「取消大量裁定，直接上手开发功能」⇒ 在 0-e/0-f 两闸仍红时直接开了 Phase 1。**本 spec 正文按「日志不回改」原样保留**，因为那三处正是 owner 裁⑤ 与前置约束的**证据**；回改会毁掉「当时为什么这么判」的链条。
>
> **欠的是什么账（须兑付，不得当已了结）**：
> 1. **0-f 台账总闸未验** —— M8 埋点建在未过总闸的台账上。总闸转绿后**必须重跑 M8 埋点判据**；
> 2. **M8-C（CLI 三只新命令）零实现** —— §7 中涉 C 的验收条目目前无实现可判，M8 spec §7 二十四条**尚未全绿**；
> 3. ~~FR-5.4 的口径需要正式改判~~ ✅ **已改判（2026-10-15，owner 授权 agent 落笔）** —— 见 FR-5.4 正文的划线原文 + 新增的改判段。本条从「待 owner 裁决」转为「已闭合，欠账只剩第 1 条」。
>
> ⚠️ **本段与 §3 的历史采样不冲突**：§3 里那些「命中 0」「未落地」是 2026-10-13 的**采样事实**，按「日志不回改」保留；本段记的是 2026-10-15 的**现状**。两者时点不同，都为真。

---

## 1. 目标与用户价值

- 用户价值不在「多了几条命令」，在**一句现在无法兑现的承诺**：OpenVibe 号称「标准化 AI 编码项目的工作台」，但它对 AI 编码助手而言**是单向的**——六个平台的 agent 都能被 `sync` 写入规则文件，却**没有任何一条通道能把项目实际发生的事读回来**。PRD §1.2 的 P1/P2 两个缺口在此落地。
- **净解锁（必须写进规格，否则本项被读成「三个新端点」）**：
  - 上一采样实测 **CLI 五个命令全在「写出去」方向**（`serve/sync/scan/diff/clean`），读取项目信息的命令数为 **0**（§3-1/§3-2）。⇒ 本项让 `openvibe status` 成为产品里**第一条只读的项目事实命令**。
  - 上一采样实测**会话（session）相关存储为 0 张表**，M5 的「AI 会话记录挂接」判为 P1 未实现（§3-3）⇒ 本项把「会话主要信息」提为一张表，是 PRD 附录 A 里唯一标「**M5 P1 提级为 P0**」的一条。
  - 上一采样实测 `packages/core/src/services/` **不存在**（§3-7）⇒ 本项的 route 必须在「服务层已落地」的前提下写，否则会把 `service-layer.md` FR-3 要收敛的形态再写一遍。
- 与既有裁定的关系是**正交不是替代**：`local-event-ledger.md` 管的是**一张横切表 + 一个聚合端点 + 设置页两节**；本项管的是**一个业务模块的读写面**。两者生命周期不同（台账可先于或后于 M8 落地），故**分两份 spec**，埋点在本 spec 内只做声明与判据、不复制台账的表设计（单源在台账，本文件只引，见 §4 FR-8）。

---

## 2. 范围

| **In（2026-10-14 按裁决更新）** | **Out（明确不做，写明理由与去向）** |
|---|---|
| 台账那次迁移**一次建四表**：`local_events`（`kind` 13 → **18** 项）＋ `agent_sessions` ＋ `agent_ingests` ＋ **`requirements`**（owner 裁④由 Out 转 In，见 FR-1.1a） | **M8-A 官方 skill 包**（PRD §3.1 FR-1.x）。**理由不是「不重要」，是它当前不可规格化**：它的核心形态取决于 Trae/CodeBuddy 的 skill 发现约定（目录/格式），而该约定**运行半边本轮未经真机核验**（PRD §11-待裁②、§8 验收未验证面①）。**探针结构半边已完成**（生态＝单一真源 `~/.agents/skills` 188 条 ＋ symlink 农场；子目录惯例与 FR-1.1 设计完全命中），但**形态三问（复制 vs symlink · 第二把锁的 `clean` 边界 · `minicode` 归属）未闭合**。另立 spec 的时点是待裁②闭合之后 ⇒ `m8-skill-bridge.md` 本轮不写 |
| `POST /api/agent/ingest` 单写端点 + `kind` 闭集五项 | **M8-E Web 面板**（PRD §3.5）。理由：纯 UI 面，且其「与 CLI 同源」断言（PRD FR-5.2）要在 M8-C 落地后才有东西可比；同一批做会让 UI 测试与 API 测试互相掩盖失败。**注**：owner 裁⑥把并发合并策略也判给了 M8-E，该裁决随本 spec 落地 |
| `GET /api/projects/:id/context` 只读聚合面 + token 预算裁剪 + `truncated` 可见性 | **`tasks.requirement_id`**（**owner 裁④的连带修正，提为禁区**）：加它需 `ALTER 0001_init.sql` 的既有表，既有 spec 明确禁止就地扩列 ⇒ `requirements` 与 `tasks` **两表独立、无外键**（FR-1.1a.1） |
| CLI 新命令三只：`ask` / `status` / `session log` ＋ **`requirement add`**（owner 裁④后随 `requirements` 表由 Out 转 In） | **不新造 409 状态码**（FR-6.1.3）：⚠️ 本仓信封**有** 409 先例（`VERSION_IMMUTABLE: 409`，`errors.ts:22`，两支测试守护）——不用的理由是**语义归属**（那是「资源状态不允许」而非「你重放的不是同一件事」），**不是「无先例」**，详见 FR-6.1.3 |
| M8 五类埋点 kind 的**声明与判据**（**owner 裁⑤：推迟到台账落地之后，只声明不写入**） | **「人工数」兜底**（owner 裁⑤否掉本 spec 原建议）：M8 可观测性完全押在台账上，台账延期则埋点同步延期 |
| `ERROR_CODES` **增一项 `IDEMPOTENCY_CONFLICT`**（owner 裁② 采 (c)，**11 → 12**）＋ **同批补该闭集的守护测试**（FR-6.1.2） | **`TELEMETRY_EVENTS`**（D3 白名单本体，A/B 级隐私面）——M8 **一条都不加**，见 FR-5.3 |
| `CLI_COMMANDS` 单源登记三只新命令 + 风险档位 | **新增 adapter**——复用既有六个（§3-4）。`windsurf/gemini/copilot`（`ADAPTER_IDS_P1`）本轮仍不实现，新增属 A 级（design §8 冻结面） |
| 与既有不变式的对接断言（§4 FR-10） | **让 agent 有删权**（触发 `clean`、删资产、删日志）。PRD B20 判为产品边界，本 spec 升格为 FR-10.4 的可测断言 |
| — | **不动 `projects` / `tasks` / `dev_log_entries` 任何既有列**。它们的闭集与语义已被既有 spec 钉住（`0001_init.sql` 的 `CHECK`），就地扩列属 A/B 级 |

---

## 3. 现状与实测基线（采样：2026-10-13 工作树；引用提交树 `4b42642`）

> **本次采样的头号发现**：`54789b8 → 4b42642` 三个提交落地了 **M4 技巧库**，带来**路由 10→13、repo 16→18、迁移占用 0001–0005 → 0001–0006**。任何引用旧树行号的文档此刻都已过期，含 PRD §1.1 的 5/7/11 三行。逐条重采如下。

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | CLI 已注册命令数 | **5**（`serve` / `sync` / `scan` / `diff` / `clean`），未变 | `grep -c "\.command('" apps/cli/src/index.ts` |
| 2 | CLI 中读取项目信息的命令数 | **0**。五个命令全在「写出去」（注入/退场/本地比对）或「常驻服务」方向 | `grep -n "\.command('" apps/cli/src/index.ts` |
| 3 | 会话（session）相关表 | **0 张**。`0001`–`0006` 六份迁移中无任何 `CREATE TABLE ... session` | `grep -rn 'CREATE TABLE' packages/core/src/db/migrations/*.sql \| grep -ci session` |
| 4 | 专用 adapter | **6 个**，`trae` 在内；`ADAPTER_IDS_P1`（windsurf/gemini/copilot）仍未实现 | `sed -n "$(grep -n 'ADAPTER_IDS = ' packages/shared/src/constants.ts \| cut -d: -f1),+7p" packages/shared/src/constants.ts` |
| 5 | **server 路由数** | **13**（较上一采样 **+3**）：新增 `cliCommands.ts` / `navCounts.ts` / `playbooks.ts` | `ls apps/server/src/routes/ \| wc -l` |
| 6 | **core repo 文件数** | **18**（含 5 支 `*.test.ts` ⇒ 实现文件 **13**），较上一采样 **+2**（`playbooks.ts` + `appMeta.ts` 已计） | `ls packages/core/src/repos/ \| wc -l` |
| 7 | 服务层 `packages/core/src/services/` | **不存在** ⇒ `service-layer.md` 仍未开工 | `ls packages/core/src/services 2>&1` |
| 8 | **已用迁移号** | **0001–0006**，`0006_playbooks.sql` **已被 M4 占用** ⇒ 下一空号是 **0007** | `ls packages/core/src/db/migrations/` |
| 9 | `local-event-ledger.md` 的 0006 断言 | **已过期**。该 spec 四处（`:8` 下游行、`:26` In 行、`:38` 基线 1、`:54` FR-1）断言「0006 号位可用」，现被 `0006_playbooks.sql` 占用 | `grep -n '0006' docs/specs/local-event-ledger.md` |
| 10 | 本机台账落地度 | `local_events` 命中 **0**；`LOCAL_EVENT_KINDS` 命中 **0** ⇒ 台账 spec 未开工 | `grep -rn 'local_events' --include='*.ts' --include='*.sql' apps packages \| grep -v dist \| wc -l` |
| 11 | 遥测白名单 | **3 类**未变（`pack_injected` / `flow_template_used` / `project_active`），行号由 `:73` 移至 `:75` | `grep -n 'TELEMETRY_EVENTS' packages/shared/src/constants.ts` |
| 12 | `ERROR_CODES` 闭集 | **11 项**（`VALIDATION_ERROR` / `EMPTY_SELECTION` / `STALE_SELECTION` / `VERSION_IMMUTABLE` / `BUILTIN_IMMUTABLE` / `NOT_FOUND` / `UNAUTHORIZED` / `FORBIDDEN_ORIGIN` / `NAME_CONFLICT` / `REMOTE_UNREACHABLE` / `INTERNAL`） | `sed -n '3,15p' packages/shared/src/errors.ts` |
| 13 | CLI 侧错误码是否受该闭集约束 | **不受**。`apps/cli/src/client.ts` 的 `ApiError` 第二参 `code: string`，另有 `ServerUnreachable` 专用类 ⇒ **CLI 层 code 是自由字符串**，闭集只约束服务端信封 | `grep -n 'class ApiError' -A8 apps/cli/src/client.ts` |
| 14 | `CLI_COMMANDS` 单源元数据 | **存在**，`packages/shared/src/cli-commands.ts`，五条快照齐全（PRD 写作时尚不存在此文件） | `ls packages/shared/src/cli-commands.ts` |
| 15 | **CLI 命令漂移检测** | **存在且会红**：`apps/server/test/cliCommands.api.test.ts` 断言 `[...CLI_COMMANDS].map(name).sort()` **逐字等于**从 `apps/cli/src/index.ts` 解析出的已注册名集合 ⇒ **新增 CLI 命令而不登记 `CLI_COMMANDS`，这支测试当场红** | `sed -n '99p' apps/server/test/cliCommands.api.test.ts` |
| 16 | `CLI_COMMAND_RISKS` 档位闭集 | **3 档**：`readonly`（零写入）/ `decision`（改状态但要人拍板或显式启动）/ `destructive`（删文件或不可逆覆盖）。既有五条的档位依据写在源文件注释里（逐条列了 `fs` 调用行号） | `grep -n 'CLI_COMMAND_RISKS' packages/shared/src/cli-commands.ts` |
| 17 | vitest project 划分 | **4 个**：`unit`（`packages/*/src/**/*.test.ts` + `tests/**`）/ `integration`（`apps/server/test/**`）/ `cli`（`apps/cli/test/**`）/ `web`（`apps/web/src/**`）⇒ 新测试族按此分四路 | `grep -n "name:\|include:" vitest.config.ts` |
| 18 | 工作树状态 | **50 个非本会话改动文件**（`git diff --name-only -- . ':!docs' ':!DEV_LOG.md'`），含 `apps/server/src/routes/navCounts.ts` ⇒ 开工前须逐文件核归属（承 `service-layer.md` §6.6 同纪律） | `git diff --name-only -- . ':!docs' ':!DEV_LOG.md' \| wc -l` |
| 19 | 三张既有表结构 | `projects`（`:85-98`，`status` 闭集 `active\|paused\|archived`）/ `tasks`（`:109-117`，`status` 闭集 `todo\|doing\|done`）/ `dev_log_entries`（`:119-132`，`type` 闭集 `DEV\|CHECK`） | `sed -n '85,98p' packages/core/src/db/migrations/0001_init.sql`（余两条同形换行号） |

**三个术语**：**双源** = 同一闭集同时写在 SQL `CHECK` 与 TS 常量里、须由一条测试比对；**idempotency_key** = 回流请求的去重凭据，同键同载荷判重、同键异载荷判冲突；**自由 code** = CLI 层 `ApiError` 的 code 字符串，不受 `ERROR_CODES` 11 项闭集约束（§3-12 vs §3-13 的这组对照是本 spec 最易被实现者读反的一条）。

---

## 4. 功能需求（FR）

### FR-1 迁移与表形（**B 级**：新增表，不动既有表）

- **FR-1.1 迁移与台账同笔（owner 2026-10-14 裁①：三表并进台账那次迁移）**。`0006` 已被 `0006_playbooks.sql`（M4，DEV-0091）占用 ⇒ 台账表取 **`0007`**，**`agent_sessions` / `agent_ingests` / `requirements` 三表并进该次迁移，与 `local_events` 一起「一次建四表」**。
  - FR-1.1.1 **`LOCAL_EVENT_KINDS` 闭集由 13 项扩至 18 项**（13 ＋ FR-5 五类），同一笔迁移内改 `CHECK`。**这是「同笔」的字面含义，不得分两次迁移。**
  - FR-1.1.2 **本 FR 是 v0.2.0 的 RF1-5（台账）的下游，不是并行项**——台账不落地 ⇒ 本迁移无法执行 ⇒ **Phase 1 第一步也动不了**。**本 spec 不含任何「M8 可以先行」的表述**，并进同一次迁移就意味着物理上无法先行。
  - FR-1.1.3 台账 spec `docs/specs/local-event-ledger.md` 的 `0006` 过期断言**共 6 处**（复算 `grep -c '0006' docs/specs/local-event-ledger.md` ⇒ **6**；逐处为 `:8`/`:26`/`:38`/`:54`/`:99`/`:105`，**措辞各异，只有 `:38` 明说「号位可用」**——`:105` 是验收条目 a，扫「可用/迁移/号位」类关键词会漏掉）。✅ **owner 2026-10-14 裁定「本轮同批回改」，六处已完成**，本 FR 的号位依赖至此解除（原先的「本 spec 不代劳」是回改前的状态，按「日志不回改」留在变更日志，本行只记现状）。
  - FR-1.1.4 **「合并不利于任一方独立回滚」是本 spec 原先的建议，owner 未采纳**（§8.2 待裁①原文留痕）。已知代价：台账迁移一旦出问题，M8 三表一并回滚。
- **FR-1.1a `requirements` 表（owner 2026-10-14 裁④：本轮一并建，原 §2 Out 第一行的 Out 判定作废）**，列：`id TEXT PRIMARY KEY / project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE / title TEXT NOT NULL / detail TEXT NOT NULL DEFAULT '' / priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0','P1','P2')) / status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','done','dropped')) / source_session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL / created_at TEXT NOT NULL`。
  - FR-1.1a.1 **与 `tasks` 两表独立、无外键**。理由：加 `tasks.requirement_id` 需 `ALTER 0001_init.sql` 的既有表，既有 spec 明确禁止就地扩列。⇒ **`tasks.requirement_id` 是禁区**，需求与任务靠 `project_id` ＋ 语义关联。
  - FR-1.1a.2 `source_session_id` 指向 `agent_sessions`（同笔迁移内建表 ⇒ 无跨迁移外键依赖问题）；用 `ON DELETE SET NULL` 而非 `CASCADE`——删会话不等于删需求。
  - FR-1.1a.3 `detail` 有长度上限（数值见 FR-2.6），**不建 FTS**（同 FR-1.3.2 理由）。
- **FR-1.2 `agent_ingests`（回流待确认队列）**，列：`id TEXT PRIMARY KEY / project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE / kind TEXT NOT NULL CHECK (kind IN (...)) / idempotency_key TEXT NOT NULL UNIQUE / payload_json TEXT NOT NULL / source_platform TEXT NOT NULL / source_session_id TEXT / cwd TEXT / status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected','conflict')) / reject_reason TEXT / created_at TEXT NOT NULL / reviewed_at TEXT`。
  - FR-1.2.1 索引两条：`(project_id, status, created_at DESC)`、`(idempotency_key)`（后者由 `UNIQUE` 自带隐式索引，实现时**不再手工建一条重复索引**）。
  - FR-1.2.2 `cwd` 存**上报方自报的绝对路径**，仅用于冲突判定与 Web 展示，**不进台账 `payload_json`**（承 `local-event-ledger.md` FR-6.3）。
  - FR-1.2.3 `status` 四态闭集写进 `CHECK`；**不得**引入第五态（「已过期」等）——过期是 `created_at + 时间窗` 的读侧判据，不是存储态。
- **FR-1.3 `agent_sessions`（会话主信息）**，列：`id TEXT PRIMARY KEY / project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE / platform TEXT NOT NULL / external_session_id TEXT NOT NULL / title TEXT NOT NULL DEFAULT '' / summary TEXT NOT NULL DEFAULT '' / started_at TEXT / ended_at TEXT / created_at TEXT NOT NULL`，`UNIQUE (project_id, platform, external_session_id)`。
  - FR-1.3.1 `external_session_id` 是**平台侧 id 的字符串**，OpenVibe 不解析、不校验其格式（各平台形态未知，强校验必误拒）。
  - FR-1.3.2 **`summary` 有长度上限**（数值见 FR-2.6），**不建 FTS**：本表是「这次会话聊了什么」的元数据，不是可检索正文的载体（要搜的正文在 `dev_log_entries.body`）。
- **FR-1.4 双源一致性测试（本项的硬要求）**：`kind` 的 `CHECK` 字面量与 `packages/shared/src/constants.ts` 新增的 `AGENT_INGEST_KINDS` 常量、`status` 四态同理，必须逐字相同，由一条测试解析迁移文本比对。**理由写成规格而非注释**：§3-10 与 `local-event-ledger.md` §3-4 都实证遥测那份双源**当前无人守**（`grep -rln 'TELEMETRY_EVENTS' --include='*.test.ts' apps packages` → 空），本项不得再落一个。
- **FR-1.5 向前兼容**：迁移只 `CREATE`，不 `ALTER` 既有表；老库升级即新增空表，历史项目**无记录属预期**，**不得回填**（回填要把历史行为编成数据，见 `local-event-ledger.md` §6.8 同型理由）。

### FR-2 回流写入面（`POST /api/agent/ingest`）（**B 级**）

- **FR-2.1 单一端点 + 五项 `kind` 闭集**：`dev_log` / `session` / `requirement` / `task_status` / `check_state`。**不按类型开五个端点**——五个端点意味着五套鉴权、五套校验、五套出参断言，而五类数据的差异只在 `payload_json` 内部。
  - FR-2.1.1 **`requirement` 落 `requirements` 表**（owner 2026-10-14 裁④推翻本条原判「本轮不落表」）：该 kind 的处理是「转成一条 `agent_ingests` 待确认记录，发布时落 `requirements` 草稿」。**FR-2.5 的人工确认门对这一类同样成立**——发布前它是 `draft`，用户确认后才算需求。**不得**改写为「直接落 `tasks` 草稿」（那是本条被推翻前的备选，见 §8.2 待裁④原文）。
- **FR-2.2 幂等**：请求必带 `idempotency_key`（非空字符串）。判定三态：
  - 同键 + 同 `payload_json` 逐字相同 ⇒ 返回 `status:'duplicate'`，**不重复落库**，响应含原记录 `id`；
  - 同键 + 载荷不同 ⇒ 返回 `status:'conflict'`，**先到者内容一个字节都不改**（FR-13）；
  - 键不存在 ⇒ 插入，返回 `status:'accepted'`。
- **FR-2.3 幂等键构造口径**：**由调用方构造，服务端不生成、不校验格式**。推荐式写进 `references` 文档但不强制：`sha256(project_id + kind + external_session_id + 本地序号)`。**理由**：服务端要校验格式就必须知道各平台 session id 的形态（§1 FR-1.3.1 同一未知性）。
- **FR-2.4 校验**：全部入参走既有 `parseOrThrow`（`apps/server/src/lib/validate.ts`），转 422 + `fieldErrors`，**不新增校验形制**。
- **FR-2.5 人工确认门（一律 pending）**：任何 kind 的记录**一律先落 `status='pending'`**，用户在 Web 点「确认」才转 `published`。理由：沿用 `m4-playbook.md` FR-5「人工确认是唯一入库路径」的既有纪律——**agent 的判断不可作为事实源**。这一条不因「回流量大」而放松。
- **FR-2.6 体量上限（owner 2026-10-14 裁③已定，三值）**：单条 `payload_json` 序列化后 ≤ **512 KB**；单请求条目数 ≤ **20**；**单请求总量 ≤ 2 MB**。`summary` 字段单独再限 **4 KB**。
  - FR-2.6.1 ⚠️ **第三值经连带修正**：本 spec 原建议是「单条 32 KB / 20 条 / 256 KB」，PRD 建议「照 m6b 同档 512 KB」。owner 裁定取 **单条 512 KB ＋ 20 条 ＋ 总量 2 MB**，其中第三值**不是照抄 m6b**——`constants.ts:108-109` 的 `packTotalMaxBytes: 2 * 1024 * 1024` 与 `singleFileMaxBytes: 512 * 1024` 同族，取 **2 MB** 才使「20 条 × 512 KB」的理论上限**不可能突破整包预算**。**实现时三值缺一即红**：一条测试断言三者同时成立（任一单条超限 / 条数超限 / 总量超限各自被拒）。
  - FR-2.6.2 ✅ **传输层已按端点放宽：2 MB 经 HTTP 现已可达**（owner 2026-10-15 裁「抬」，推翻同日早些时候的「不抬」处置）。实现落在 `apps/server/src/routes/agent.ts`：`POST /api/agent/ingest` 单条路由注册时带 `bodyLimit`，取 `AGENT_INGEST_BODY_LIMIT` = **8 MiB**；`apps/server/src/app.ts` **仍不设** `bodyLimit`，其余端点保持 Fastify 默认 1 MB。
    - **为什么是按端点而不是全局**：Fastify 5 的路由简写支持 `{ bodyLimit }` 覆盖（`fastify/types/route.d.ts` 的 `RouteShorthandOptions.bodyLimit`）。全局抬高等于让**所有**端点都接受更大请求体，超出「让 agent 能推大载荷」这一件事的范围。**实测**：同实例内被覆盖的端点吃 3 MiB、未被覆盖的端点仍在 1 MiB 处 413。
    - **为什么是 8 MiB**：Fastify 量的 `content-length` 是**整个序列化请求包**，严格大于域内口径（各条 `payload` 字节数之和）。差额来自包封层（`projectId`／`items` 数组／每条的 `kind`+`idempotencyKey`+`sourcePlatform` 键名与引号），且 `idempotencyKey` 的 schema 只有 `min(1)`、**没有上限**（`packages/shared/src/schemas/agent.ts`）。实测一组 20 条、每条约 104 KB、键长 70 字符的批次，包封层开销 **2,932 B**。8 MiB = 域内 2 MiB 的 **4 倍**，相对实测开销留约 2800 倍余量，同时**仍然有界**（9 MiB 照样 413）。
    - **抬后的净效果**：FR-2.6 的 2 MB 总量上限**第一次真正经由 HTTP 生效**——它此前被 1 MB 传输层上限整个挡在服务层之前，永远吃不到。超 2 MB 的批次现在由**服务层逐条裁决**（前若干条照落、累计超限那条 `rejected`），整体仍恒 200（FR-2.7 不变）。
    - **域内三值一条未松**：512 KB／20 条／2 MB 全部原样，仍由服务层执行。抬的只是**传输层**，域内规则与其落点未动。
  - FR-2.6.3 ⚠️ **本条曾被推翻过一次，留档**：同日早些时候本 spec 记的是「**不抬** `bodyLimit`」，理由是「那是全 server 面的改动」并要求 HTTP 侧按实况断言 413。owner 复核后裁定**按端点放宽即可**，该理由不成立（「全 server 面」只在走全局 `bodyLimit` 时才是问题）。被推翻的处置连同当时的 `agent.api.test.ts` 413 用例一并留在此处，不删除：**它是「传输层上限曾是瓶颈」这段事实的记录**，且新用例（服务层逐条裁决 / 上限仍有界 / 其他端点未被放宽）已覆盖它原本想守的判据且更强。
- **FR-2.7 部分成功**：20 条里 3 条校验失败 ⇒ **返回逐条结果**（每条带 `index` / `status` ∈ `accepted|duplicate|conflict|rejected` / `reason`），**不整包回滚**——agent 需要知道哪条能重试。整体响应 HTTP **200**（逐条结果在 body 内），全条失败时同理（逐条 `rejected`），**不为「全失败」单独造 4xx**（那会让 agent 无法读到哪条错了）。
- **FR-2.8 `dev_log` 发布的落点**：发布时**写入既有 `dev_log_entries`**，`type` 取 `DEV` 或 `CHECK`（既有闭集），`entry_no` 由既有 `DevLogRepo` 的递增逻辑分配。**本项不改 `dev_log_entries` 的表形，也不改其 `entry_no` 的分配规则**。
- **FR-2.9 `check_state` / `task_status` 发布的落点**：分别写 `project_check_states` 与 `tasks.status`。**`tasks.status` 三值闭集 `todo|doing|done` 不变**——agent 上报 `blocked` / `review` 之类值一律 `rejected`，**不得扩列**（扩列属 A/B 级，见 §2 Out 末行）。
- 🔴 **FR-2.9.1 `session` 类**当前**无落点**，是登记在案的缺口、不是漏写**（2026-10-16 owner 裁定：**维持现状，不补落点、不改 `kind` 闭集**）
  - **FR-2.8 / FR-2.9 / FR-2.1.1 三个落点都不含 `session`**，而 `agent_sessions` 表在 `0007` 里已建、**全仓零写入路径**（实测 `INSERT INTO agent_sessions` 命中 0）。发布时该类**只转状态、不落业务表**。
  - **为什么现在不补**：`agent_sessions` 的形状是 `(project_id, platform, external_session_id)` 且带 `UNIQUE(project_id, platform, external_session_id)`。后两个字段来自**各平台 agent 的会话标识形态** —— 正是 §7.1 ①「Trae / CodeBuddy 约定未核验」那同一类未知性。**形态未核验就落表**，一旦外部 id 不稳定，UNIQUE 会把一次 agent 会话误判成重复、拆成多条记录。而这是**只增不改的 append-only 面，拆错了没法回滚清洗**。
  - **连带代价（必须知道）**：`requirements.source_session_id` 外键指向 `agent_sessions(id)`。`session` 不落表 ⇒ `agent_sessions` 恒空 ⇒ **`requirements` 的会话溯源链断在第一环**，`source_session_id` 只能是 `NULL`（实现已按此处理：查无此会话即落 NULL，否则撞 FK）。
  - **解锁条件**：§7.1 ① 的运行半边五问闭合、外部 session id 形态确定后补落点。届时「若补落点即为红线」已由 `agentService.test.ts` 的一支测试钉住。
  - ⚠️ **不要用「顺手落个空 `agent_sessions`」的方式消除这个缺口** —— 那会让「表有行」看起来像功能存在，而溯源仍断。

### FR-3 聚合查询面（`GET /api/projects/:id/context`）（**B 级**）

- **FR-3.1 只读**：该面**只有 `GET`**。任何 agent 侧写操作必须走 FR-2 的单一 `POST`（写面单一才可审计）。
- **FR-3.2 出参形状**（进 `packages/shared/src/schemas/`，按 `output-validation.md` FR-2 注册契约断言面）：
  ```
  ProjectContextOut {
    project: { id, name, status, currentStage, flowTemplateId, updatedAt }
    stage:    { current, total, completed }
    checklist:{ stageName, items: [{ id, label, checked }] }
    tasks:    { todo, doing, done, items? }
    logs:     { items: [{ id, type, entryNo, title, evidence, createdAt }] }
    pack:     { id?, name?, version?, drifted?, outdated? }
    assets:   { prompts, skills, terms, playbooks }   // 计数，各段可空
    truncated: [{ section, dropped, reason }]
  }
  ```
  - FR-3.2.1 `pack` 段的 `drifted` / `outdated` **只在能读 `pack.lock.json` 时为真值**，读不到则为 `null` 且**必须在 `truncated` 里说明**（承 m6b「假零禁止」纪律）。
  - FR-3.2.2 **不返回任何 `body` 正文**（`dev_log_entries.body` 不进本响应）——本端点的消费者是 agent，上下文体积敏感；正文由单独的日志查询取。
- **FR-3.3 `?fields=` 裁剪**：接受 `stage,checklist,tasks,logs,pack,assets` 的逗号分隔子集；**空串或非法值 ⇒ `VALIDATION_ERROR` 并列出合法值**（不静默忽略）。
- **FR-3.4 `?budget=<chars>` token 预算裁剪**：超预算时**先砍 logs 条数 → 再砍 assets → 最后砍 checklist**（顺序固定，写进规格因为它决定 agent 看到什么）。**每次裁剪必须写进 `truncated`**——**禁止静默截断**：agent 会把「被砍掉的检查项」当成「不存在」，那比报错更坏。
- **FR-3.5 鉴权同构**：走既有 token + `Host` / `Origin` 双闸（`http-guard.ts`），**不新增免 token 通道**（承 `local-event-ledger.md` FR-4.1 同纪律）。`project_id` 不存在 ⇒ 既有 `NOT_FOUND`（11 项闭集内）。

### FR-4 CLI 读写面（**B 级**：新增命令是向后兼容的 minor 级变更）

- **FR-4.1 新增三只命令**（`requirement add` 随 §2 Out 第一行延后）：

  | 命令 | 形态 | 风险档（FR-4.3） | `writesDisk` |
  |---|---|---|---|
  | `openvibe ask <question> [--project <id>] [--json]` | 只读查询，`question` 取**闭集关键词** `status\|next\|checklist\|assets\|terms\|playbook\|logs` | `readonly` | `false` |
  | `openvibe status [<dir>] [--json]` | 单项目进度快照（阶段/完成度/未完检查项/任务分布/最近日志/绑定包与漂移态） | `readonly` | `false` |
  | `openvibe session log --project <id> --type DEV\|CHECK [--title] [--body] [--evidence] [--related <path>]` | 回流一条日志（经 HTTP 写服务端） | `decision` | `false` |

  - FR-4.1.1 `ask` **不接 LLM**：问题集是闭集关键词，**不接受自由文本**。理由：本地优先 + 随机性会让 agent 无法解析输出（确定性输出是可机读的前提）。
  - FR-4.1.2 `status` 的 `[<dir>]` 缺省时取**当前工作目录**；路径解析不出已登记项目 ⇒ 既有 `NOT_FOUND` + 列出候选项目名（≤5 条）。
  - FR-4.1.3 **端点归属（2026-10-16 补记，原文未指定）**：`status` 取 `GET /api/projects/:id/context?fields=stage,checklist,tasks,logs,pack`，**不是** `GET /api/projects/:id`。后者只有 `project + health` 两项，产不出本条要求的六项（完成度／未完检查项／任务分布／最近日志／绑定包与漂移态）。仍是纯 GET、仍不碰 DB（FR-4.4 红线不受影响）。
    - 目录→项目的解析取**最长前缀优先**且前缀比较带分隔符（`/w/openvibe-2` 不能落到 `/w/openvibe` 头上）。这与 `pack-source.ts:283` 的**精确**匹配有意不同：那里是 sync 只对项目根操作，这里的缺省参数就是 cwd，**子目录必须能命中**。
    - CLI 侧自己的「最近 5 条日志」裁剪也写进 `truncated`，**不静默少给**。
- **FR-4.2 JSON 契约沿用既有形制**：`--json` 下 **stdout 只有一个 JSON 对象**（承 m6b CLI 契约）；退出码沿用 `ExitCode` 三值 `{ ok: 0, error: 1, drift: 2 }`（`apps/cli/src/output.ts:9`）——**本项不新增退出码**。
  - 🔴 **2026-10-16 补齐（owner 追认 worker 的一处解读）**：本条原文只说「沿用三值」，**没说哪条命令产 `2`**，于是 `status` 该不该退 2 一度无据可依。实测三条命令的 `2` 档**语义完全一致** —— 都是「**产物与 `pack.lock.json` 不一致**」：
    | 命令 | 产生条件 | 位置 |
    |---|---|---|
    | `diff` | `diff.clean && !outdated ? 0 : 2` | `commands/diff.ts:208` |
    | `clean` | `summary.driftKept > 0 ? 2 : 0` | `commands/clean.ts:247` |
    | `status` | `snapshot.pack.drifted === true ? ExitCode.drift : ExitCode.ok` | `commands/status.ts:288` |

    ⇒ **明文规定**：`ask`（只读聚合，无漂移概念）与 `session log`（写命令，无本地产物）**恒不可达 2**；`status` 的 2 **仅在真漂移时**产生。
  - ⚠️ **读不到 `pack.lock.json`（`drifted === null`）退 0，不退 2** —— 「不可判定」不是「没漂移」，把它算成漂移会让每次没登记本地路径的项目都退 2。该方向由**反向变异腿**钉住（把 `null` 当漂移 ⇒ 精准红 2 支）。
- **FR-4.3 `CLI_COMMANDS` 单源登记（本项的硬要求，容易漏）**：三只新命令必须逐条登记进 `packages/shared/src/cli-commands.ts`，含 `name` / `usage` / `summary` / `flags` / `risk` / `writesDisk` 六字段。
  - FR-4.3.1 **漏登记 ⇒ `apps/server/test/cliCommands.api.test.ts` 当场红**（§3-15 实测该断言逐字比较命令名集合）。这不是「顺便维护」，是硬闸。
  - FR-4.3.2 `risk` 按 `CLI_COMMAND_RISKS` 三档闭集取值：`ask` / `status` = `readonly`（只发 GET）；`session log` = `decision`（改服务端 DB，与既有 `scan` 同档同因：源文件注释给 `scan` 判 `decision` 的理由是「改服务端 DB 且无确认闸」）。
  - FR-4.3.3 `summary` 字段须**逐字照抄** `apps/cli/src/index.ts` 的 `.description()`，漂移由 §4.3.1 那支测试同批兜（既有五条已遵此约定）。
- **FR-4.4 CLI 从不直接打开 DB**：三只命令全部经 HTTP（承 `dev-plan.md` §1.2 末「sync/scan 不碰 DB 文件锁」那条既有不变式的同型推理；§3-7 实测 CLI 侧 `openDb` / `better-sqlite3` 命中为 0，本项不得引入）。

### FR-5 M8 五类埋点 kind（**B 级**：增 kind 即改迁移，与台账同一笔）

- **FR-5.1 提案五项**，与台账 `LOCAL_EVENT_KINDS` 并集声明、**严格不同名**：`agent_ingest_accepted` / `agent_ingest_rejected` / `agent_context_served` / `cli_agent_command_run` / `agent_bridge_installed`。
  - FR-5.1.1 `payload_json` **允许键**（闭集，超出即测试红）：`agent_ingest_accepted` → `kind` / `sourcePlatform`；`agent_ingest_rejected` → `kind` / `reasonCode`（**枚举，非自由文本**）；`agent_context_served` → `fieldsCount` / `truncated`(**number**) / `platform`；`cli_agent_command_run` → `command`（枚举 `ask|status|session|requirement`）/ `exitCode` / `agent`；`agent_bridge_installed` → `adapter` / `packVersion`。
    - 🔴 **2026-10-15 订正：原文本写的是 snake_case，与全部实现相反**（实测 `agentService.ts:117/144` 用 `reasonCode` / `sourcePlatform`，`contextService.ts:172` 用 `fieldsCount`）。仓内 payload 命名一律 camelCase（承 `assetEventInput` 的 `assetType` / `origin`），故**以实现为准改 spec**。owner 2026-10-15 指令「按代码功能完成为依据」是本次订正的依据。
    - `cli_agent_command_run` 的 `agent` 字段：**原 spec 只给键名未给语义**（本仓第四次「引用既有 X 而 X 未定义」的变体）。**2026-10-16 owner 裁定**：
      - 取值来源：环境变量 `OPENVIBE_AGENT` 的平台标识字符串，**缺省 `null` 表示「人跑的」**。用 env 而非 flag 的理由是 agent 调 CLI 时能自报、而人类不会设这个变量。
      - 取值域：非空字符串，**长度上限 64**（超长在服务层拒 422）。含 `/`、`\`、`~` 一律拒——**防整段路径随埋点落进台账**（FR-5.1.2 把路径列为禁列）。
      - ⚠️ **它不是身份凭证，不得用于任何鉴权或授权判断**。它可被伪造（env 会继承、会被手设），只用于统计「CLI 侧有多少是 agent 驱动的」。鉴权全部在 token ＋ `Host`/`Origin` 双闸（FR-3.5），与本字段无关。**写清这条是为了防日后有人拿它当信任依据。**
  - FR-5.1.2 **禁列**：绝对路径、项目名、用户名、会话正文、`body` 任何片段、`cwd`。
    - ⚠️ **owner 2026-10-17 裁定（本条原为待裁）**：FR-5.1.1 原文写 `truncated` 是 **bool**，而 `contextService.ts` 实写的是 `truncated: truncated.length` —— **数字**。**裁 (b)：以实现为准，规格改 number。**理由：内部量本就是 `TruncationNote[]`（每次裁剪一条说明），取 `.length` 是最自然的标量；且与同键的 `fieldsCount`（同为计数）一致；改成 bool 会丢掉「裁了几处」这个本机台账正需要的量。**同时补判据**：键闭集只比键集合，**看不见值类型** —— 故 `AGENT_PAYLOAD_TYPES` 与 `AGENT_PAYLOAD_KEYS` 由同一张形状表派生，并有测试断实际写入值的 `typeof`。没有这一步，本条会长期潜伏：键名一致 ⇒ 键判据绿 ⇒ 类型分歧对所有闸隐形。
  - FR-5.1.3 FR-5.1.2 由一条单测对 `payload_json` 做**绝对路径与项目名模式扫描**兜（照 `local-event-ledger.md` §7-d 同型）。
- **FR-5.2 写入点集中**：写入只发生在服务层（`services/` 内一处），**不散落 repo 与 route**（承 `local-event-ledger.md` FR-3）。
- **FR-5.3 遥测白名单零改动**：M8 **一条都不加进 `TELEMETRY_EVENTS`**（D3 白名单是 A/B 级隐私面，§3-11 三类不变）。由断言守：`AGENT_EVENT_KINDS ∩ TELEMETRY_EVENTS === ∅`。
- **FR-5.4 无写入点时本 FR 不成立（owner 2026-10-14 裁⑤：推迟 M8 到台账落地之后）**：~~台账 spec 未落地（§3-10 实测命中 0）⇒ **M8 五类 kind 只声明不写入**。本 FR 全部转「声明态」——`LOCAL_EVENT_KINDS` 的 18 项闭集里 M8 那五项存在，但**没有任何写入路径**。~~
  - 🔴 **2026-10-15 正式改判（owner 授权 agent 落笔）**：本条的前提**已被实现推翻**——台账迁移已于 DEV-0094 落地 `0007`，M8 五类 kind **现已在写入**（`agentService` 2 处 ＋ `contextService` 1 处，共 3 个 `localEvents.record` 调用点，DEV-0095/0096/0097）。
  - **改判后本 FR 的口径**：FR-5.4 从「**是否**写入的条件句」改为「**写入必须满足台账已落地**」的前置约束。当前**已满足** ⇒ 本 FR 的其余各条（禁列白名单、写入点集中、遥测零新增）**全部转为强制生效**，不再是「将来写的时候再说」。
  - **改判没有推翻的是**：owner 裁⑤ 否掉「人工数」兜底这一点**仍然有效** —— 埋点仍直接写台账，不存在降级路径。
  - ⚠️ **欠账未销**：0-f 台账**总闸**判据仍未验过（迁移已落地 ≠ 总闸已通过），故「M8 埋点建立在已过总闸的台账上」这句**尚不成立**。总闸转绿后必须**重跑 M8 埋点判据**。
  - FR-5.4.1 ⚠️ **裁⑤否掉了本 spec 的原建议「降级人工数」**（§8.2 待裁⑤原文留痕）。**「人工数」不作为兜底**：owner 选了「推迟」，代价是 M8 的可观测性**完全押在台账上**，台账延期则 M8 埋点同步延期（这是已知且被接受的代价）。
  - FR-5.4.2 **FR-5.1.2 的禁列要求在声明态仍然成立**（它约束的是将来写入时的 `payload_json` 形状，不是写入行为），**FR-5.1.3 的扫描单测照写**——它扫的是 schema 与写入函数，不依赖台账存在。

### FR-6 错误码归属（**本项最易实现者读反的一条**）

- **FR-6.1 服务端信封**：`ERROR_CODES` 闭集**由 11 项扩为 12 项**（owner 2026-10-14 裁② 采 (c) 增新码）⇒ 增 **`IDEMPOTENCY_CONFLICT`**（**B 级**，理由见 FR-6.1.2）。M8 的映射表：

  | 场景 | 用既有码 | 理由 |
  |---|---|---|
  | 入参非法 / `fields` 未知 / 超体量（FR-2.6 三值任一） | `VALIDATION_ERROR`（422） | 既有 422 形制 + `fieldErrors` |
  | 项目 id 不存在 / 未绑定路径 | `NOT_FOUND`（404） | 既有 |
  | token 缺失或失效 | `UNAUTHORIZED`（401） | 既有 |
  | 幂等键冲突（同键异载荷） | **`IDEMPOTENCY_CONFLICT`（422）** —— **本轮新增** | 见 FR-6.1.2 |
  | 路径逃逸（`--related`） | `VALIDATION_ERROR` + `details.escapingPaths` | 照 m6b 的 `escapingPaths` 既有形状 |
  | 其余未预期 | `INTERNAL`（500） | 既有 |

  - FR-6.1.1 **owner 逐项否掉了两个既有码**：`STALE_SELECTION`（语义是「你手上这份选择已过期」，与幂等键冲突只是近邻而非同义）与 `NAME_CONFLICT`（语义是「同名实体撞了」，用在这里会让调用方误判为实体重名）。**两者均不用**，原文留痕于 §8.2 待裁②。
  - FR-6.1.2 **增新码属 B 级，且本仓该闭集当前零测试守护**——复算 `grep -rn 'ERROR_CODES\|ErrorCode' --include='*.test.ts' apps packages` ⇒ **0 命中**（生产侧也只有 `packages/shared/src/errors.ts:2` 一处定义）。⇒ **本 FR 的硬要求：增码同批必须给 `ERROR_CODES` 配一条守护测试**（12 项闭集逐字比对 + 断言 `IDEMPOTENCY_CONFLICT` 存在且未被 `TELEMETRY_EVENTS` 误纳）。**这是「发现一个已存在的缺口并顺手堵上」，不是新增要求**；不补则 M8 是本仓第一个让调用方依赖一个无守护码的模块。
  - FR-6.1.3 **422 而非 409**：**本仓信封已有 409 先例**——`ERROR_HTTP_STATUS` 中 `VERSION_IMMUTABLE: 409`（`packages/shared/src/errors.ts:22`，两支测试守护：`packs.api.test.ts:143`/`:362`）。⚠️ **本 FR 初稿写的「本仓信封无 409 先例」是假事实，已订正**。**真正的取舍是语义归属而非有无先例**：`VERSION_IMMUTABLE` 的 409 表达的是「**资源当前状态不允许该操作**」（版本不可变），而幂等冲突表达的是「**你重放的这条与已存的这条不是同一件事**」⇒ 后者是**调用方键构造有歧义**，不是服务端资源态冲突。用 409 会让调用方按「资源状态变了、去重新 GET」处理，而正确处理是「**换幂等键重试**」（FR-2.2 三态）。⇒ 取 422 并**在错误消息里点名 `idempotency_key`**，让调用方不必猜。**代价**：REST 语义上 409 更贴切，此处选「与调用方的正确处置对齐」。
- **FR-6.2 CLI 层自由 code**：§3-13 实测 `ApiError.code` 是自由字符串 ⇒ CLI 可用 `PROJECT_PATH_UNBOUND` / `UNKNOWN_QUERY` / `KEY_CONFLICT` / `SERVER_UNREACHABLE` 等**人读友好**的 code（`ServerUnreachable` 已是既有专用类）。**这些字符串不出现在服务端信封里**，也不进 `ERROR_CODES`。
- **FR-6.3 双向一致**：同一次失败，CLI 的自由 code 与服务端 11 项闭集码的映射关系**写进 `references/api.md`**，供 skill 侧解析；映射表缺失 ⇒ skill 只能靠文案猜。

### FR-7 幂等与冲突的对外可见性

- **FR-7.1 冲突必须可诊断**：同键异载荷时，响应含双方 `payload_json` 的 `sha256` **前 8 位**（不返回完整载荷——回显对方载荷等于泄露另一个会话的内容）。
- **FR-7.2 不静默覆盖**：先到者一个字节都不改（FR-2.2 三态的第二态）。写方须显式改键重试。
- **FR-7.3 并发回流**：允许并发写入，落库按 `created_at` 排序。**`UNIQUE (idempotency_key)` 是唯一仲裁者**——两个并发同键请求，一个成功一个拿冲突，**不做应用层锁**（SQLite 单写者已提供该保证，再加锁是第二套并发模型）。

### FR-8 与既有不变式的对接（**红线，写成可判**）

- **FR-8.1 core 不 import adapters**：`grep -rn "@openvibe/adapters" packages/core/src --include='*.ts' \| grep -v test \| wc -l` → 必须保持 `0`（既有 eslint R2 zone）。M8 的 `pack` 段需要平台产物路径时经 `deps` 注入（照 `pack-assemble.ts:39` 既有形制）。
- **FR-8.2 server 不 import apps/cli**：`eslint.config.js:127` 的 R4 放行线**一字不改**；M8 的命令元数据落 `packages/shared/src/cli-commands.ts`（§3-14 注释已说明这个归属理由）。
- **FR-8.3 不绕过注入面**：M8 **不得**新开一条绕过 `packages/core/src/inject/` 的写盘路径。所有需写盘的 agent 能力（若将来有）仍走既有三重保护与 `sync.lock`。
- **FR-8.4 golden 与 seed 零触碰**：`git diff --name-only <BASE>..HEAD -- tests/golden/ content/seed/` → **0 行**（`dev-plan.md` §0.3 要求的**带 ref 锚**形态；不带 ref 的工作树形态是空转凭据，本 spec 不采用）。

---

## 5. 输入 / 输出

| 方向 | 内容 | 形态 |
|---|---|---|
| 入 | 回流：`kind`、`idempotencyKey`、`payload`（按 kind 判形）、`sourcePlatform`、`sourceSessionId`、`cwd` | POST body，zod 经既有 `parseOrThrow` |
| 入 | 查询：路径参 `:id`（即 `GET /api/projects/:id/context`）、`fields` / `budget` query | path + query，zod 校验 |
| 入 | CLI：`ask <question>`、`status [dir]`、`session log --project --type [...]` | commander 已解析旗标 |
| 出 | `POST /api/agent/ingest` → `{ results: [{ index, status, id?, reason?, keySha? }], summary: { accepted, duplicate, conflict, rejected } }` | `AgentIngestOut`（新增 ⇒ 触 `output-validation.md` FR-2 出参断言面） |
| 出 | `GET /api/projects/:id/context` → `ProjectContextOut`（FR-3.2 全形） | `ProjectContextOut`（同上） |
| 出 | CLI `--json` → 单个 JSON 对象，`summary.ok` **从退出码推导**（照 `index.ts` 既有 `ok: outcome.exitCode === ExitCode.ok` 写法，m6b CLI-CLEAN-11b 钉过这条） | 既有 `Printer` 形制 |
| 出 | 错误 → 服务端 `{ code, message, details? }`（11 项闭集）；CLI `summary.error.code` 为自由串 + 可执行提示 | 既有 `AppError` / `ApiError` |

> **⚠️ owner 2026-10-17 订正（本表原为 snake_case，与实现相反）**：上两行的请求体字段与路径参
> 原写作 `idempotency_key` / `source_platform` / `source_session_id` / `project_id`，
> 而 `AgentIngestOne` 的 zod 入参是 **camelCase**、路由是 `/api/projects/:id/context`。
> **实测后果**：agent 照本表原样发请求 ⇒ zod 剥掉未知键 ⇒ 必填字段缺失 ⇒ **422**。
> 本表是 agent 实际会读的那一份，所以按 FR-5.1.1 同一口径**以实现为准**改为 camelCase。
> 守卫见 `agentPayload.test.ts` 的「请求体字段名与 zod 入参逐字一致」一条。

---

## 6. 边界与异常

- **6.1 `0006` 号位已被占用，两 spec 争号 —— ✅ 已闭合（owner 2026-10-14 裁①，本条按「日志不回改」保留原文，现状见括号）**。原状态：`0006_playbooks.sql` 已由 DEV-0091 落地（§3-8/§3-9），而 `local-event-ledger.md` 的 `0006` 断言全部过期 ⇒ 两份 spec 争同一空号。四条出路 (a) 本项取 `0007` 台账顺延／(b) 台账取 `0007` 本项顺延／(c) 本项并进台账那次迁移／(d) 各取一号＋就地登记号位变更；本 spec 原倾向 (a)。**现状态：owner 裁 (c)** —— 台账取 `0007`，**M8 三表并进台账那次迁移（一次建四表）**；且台账 spec 的过期断言**实为 6 处不是 4 处**（`:8`/`:26`/`:38`/`:54`/`:99`/`:105`，只有 `:38` 明说「号位可用」）。**owner 同批裁定「回改六处」，已完成**（本 spec 不再是「不代劳」状态）。⇒ **本条的号位依赖彻底解除**；M8 现在**排在台账下游**（FR-1.1.2）。
- **6.2 前置未闭合 ⇒ 本项不是「缺功能」，是「顺序错」**：`service-layer.md` 未落地（§3-7 实测）。本项的 route 若在服务层之前写，则 §3-7 那条零命中会**反向增长**，`service-layer.md` FR-3.1 的判定口径（route 内 `new [A-Z]*Repo(` 与 `db.prepare(` 命中数归零）将从「M8 尚未开工」变成「M8 破坏了收敛」。⇒ 本 spec 把服务层列为**硬前置**，不裁不开工。
- **6.3 体量上限数值的来历必须写清**：本 spec 原建议的三个数（32 KB / 20 条 / 256 KB）**不是实测得来的**，是照 m6b「单文件 512 KB」先例降一档的推算（理由：agent 常整段贴代码，比人写文档更容易撞上限）⇒ **登记为未实测**。**现值已是 owner 裁定的 512 KB / 20 条 / 2 MB**（FR-2.6），**但「未实测」这一条性质没有消失**——裁定改的是数值来源（从推算变成 owner 裁定），**不是把它变成实测**；实施轮若要动这三个数，仍应先取真实使用数据。
- **6.4 `requirement` kind 的悬空是本 spec 最大的半成品面**：FR-2.1.1 把 `requirement` 放进闭集，但 §2 Out 又把 `requirements` 表延后。⇒ 若待裁⑤未裁，`requirement` 的实现**必须选丢弃并给可执行提示**（「该 kind 尚未支持，用 `tasks` 或等版本升级」），**不得**自造第三张表、不得塞进 `tasks.title`、不得静默丢弃（静默丢弃会让 agent 以为记录成功了）。
- **6.5 幂等键的不可校验性**：FR-2.3 决定服务端不校验键格式（§1 FR-1.3.1 的同一未知性）。代价是**恶意/失控 agent 可以用同一键把所有回流打成 duplicate 而不落库**。⇒ 这是「键由可信调用方构造」这一前提的代价，写进规格而不是假装没有；缓解面是 FR-5.1.1 的 `duplicate` 事件计数（异常多的 duplicate 能在本机台账里看出来）。
- **6.6 `cwd` 是自报字段**：FR-1.2.2 存它只为冲突判定。**它不构成安全凭据**——不据此判定「agent 真的在那个目录里」，只据此提示用户「上报的目录与登记路径不一致」。判成 `conflict` 是提示，不是拒绝（拒绝会让多目录开发的工作流直接不可用）。
- **6.7 多目录工作流**：`local_path` 是单值（§3-19），而真实项目常在多台机器/多个目录。⇒ M8 **不解决**这个问题（本项不比对跨机），只在 §3.2 的 `status [dir]` 上给出「当前目录匹配不到已登记项目」的明确提示。
- **6.8 与 D3 / D29 的正交性**：M8 五类 kind 不进遥测白名单（FR-5.3）、台账不出网（承 `local-event-ledger.md` FR-6.2）——这两条是 D3/D29 的既有承诺，**M8 不因「数据更有价值」而松动**。若台账尚未落地，FR-5 全部只声明不写入（FR-5.4），**M8 不自建临时表**（§8.2 待裁⑤ 的 (b) 案）。
- **6.9 错误码的两种语言并存是既有事实不是缺陷**：§3-12 vs §3-13 的对照（服务端 11 项闭集 / CLI 自由串）**已存在于现状**（`ApiError` 今天就是这么写的）。本项只把映射关系写进文档（FR-6.3），**不改任一侧的形制**——改它会波及既有五条命令的错误输出。
- **6.10 并发读写的 SQLite 前提**：FR-7.3 依赖「SQLite 单写者」。若将来换存储引擎，本项的冲突判定语义会变 ⇒ 这条依赖须随迁移决策复核。

---

## 7. 验收标准（pass/fail）

> ### 🔴 2026-10-15 本表按 owner 裁定整体改判：**以代码功能完成为依据，功能运行正常则通过**
>
> **原表的 24 个测试 ID 全部虚构** —— `CORE-M8-01` / `SRV-M8-01` / `CLI-M8-01` / `MANUAL-M8-01` / `GOLD-M8-01` … 在 `apps` / `packages` / `tests` / `scripts` 里的 `.ts`/`.tsx`/`.sql` 中 **0 命中**（用 §7.2 自己给的复算命令实测）。**本仓第四次栽在「引用既有 X 而 X 不存在」**（前三次：台账 spec 的 13 个 ID、跨项目的 `EmptyState`、「本仓无 409 先例」）。
>
> **为什么当初写得出来**：那张表与台账 spec §7 是同一类错误——把「真测试 ID」「grep 命令行判据」「外部命令凭据」塞进同一列，看起来像有 24 条测试在守着，实际一条也没有。**人工复查抓不住**：那张表读过三遍，每遍都「看起来有凭据」。
>
> **这次改了什么**：① 24 个虚构 ID 逐条换成**真实可定位的指向**（文件 + `it()` 原文，或标出它本就是命令行判据）；② 状态按**实质行为**判定——owner 裁定「功能运行正常则通过」，故判据列的口径从「有没有一支叫这个名字的测试」改为「这条要求的行为是否真的成立并有东西守着」；③ **判据列的实质要求一条没松、条目一条没删**，「不通过」仍是「不通过」。
>
> **防复发**：新增 `tests/spec-claims.test.ts` —— 扫所有 spec 的验收表，**只断状态为 ✅ 的行**：其引用的路径/文件名必须在磁盘存在，其引用的测试 ID 必须在代码树被真实引用。这道闸配了四条变异腿（其中一条把台账那 13 个假 ID 逐个喂进去要求全部被抓出；开发过程中它真的抓出过一处**自指**：那 13 个 ID 逐字写在闸自己的源码里，于是 `includes` 全部为真）。
>
> **一条容易被忽略的观察**：「那 13 个 ID 全部虚构」这个断言**本身也会随代码演进而腐烂**——其中 `CORE-EVT-01` / `CORE-EVT-05` / `SRV-EVT-01` 在 DEV-0100 补测时被 worker 真的复用了（`packages/core/src/db/core-db.test.ts:223` 的 describe 名）。**所以新闸不去维护「哪些 ID 是假的」清单**，只断「声称存在的必须此刻可定位」——前者会腐烂，腐烂的那份比没有更危险。
>
> **原表头（保留留痕）**：测试 ID 不复用既有族（既有：`UT-PB-*` / `CORE-PB-*` / `IT-PB-*` / `CLI-CLEAN-*` / `CLI-SEC-*` / `CLI-VERIFY-*` / `SRV-EVT-*` / `CORE-EVT-*` / `GOLD-EVT-*`）。新族按 §3-17 的四个 vitest project 分配：`CORE-M8-*`（unit/project+core）· `SRV-M8-*`（integration）· `CLI-M8-*`（cli）· `UT-WEB-M8-*`（本 spec 无 web 面，留空登记）· `MANUAL-M8-*` / `GOLD-M8-*`。

| # | 条目 | 判据 | **真实凭据（可定位）** | 状态 |
|---|---|---|---|---|
| a | FR-1.5 迁移可执行且幂等（新库与既有库两径） | 两径建表后记账表逐字一致（**不是 `PRAGMA user_version`** —— runner 用自举的 `schema_migrations`，实测全仓 0 处 `user_version`；本条原文写的是 user_version，属同类假引用） | `packages/core/src/db/core-db.test.ts` → `CORE-EVT-01a`（账上停在 0006 的老库）/ `CORE-EVT-01b`（账上根本没有 0006，DEV-0091 之前的安装）；新库径 `UT-MIGRATION-01` | ✅ 通过 |
| b | FR-1.4 双源一致：`kind` / `status` 的 `CHECK` 字面量 ≡ TS 常量 | 解析迁移文本比对（逐字、逐序）；**变异腿**：临时给常量加一项 ⇒ 必判红 | `packages/core/src/db/m8-ledger-schema.test.ts` 8 支（含「kind 的 CHECK 字面量 ≡ LOCAL_EVENT_KINDS」「≡ 台账 13 ＋ M8 5 的并集」）；**变异实测红 3 支** | ✅ 通过 |
| c | FR-5.3 M8 kind 与遥测三事件交集为空 | 断言 `∩ = ∅` | `m8-ledger-schema.test.ts` → 「M8 kind 与遥测三事件严格不同名…」；**变异实测红** | ✅ 通过 |
| d | 三态幂等：同键同载荷重放 3 次 ⇒ 恰 1 条；同键异载荷 ⇒ 先到者内容 sha 逐字未变 | `SELECT COUNT(*)` + 内容 sha 比对 | `packages/core/src/repos/agentIngest.test.ts:51`（重放 3 次恰 1 条）/`:63`（**键序不同但内容相同也算 duplicate** —— agent 重试时 `JSON.stringify` 键序不保证稳定）/`:71`（先到者逐字未变）；HTTP 层 `apps/server/test/agent.api.test.ts:49` | ✅ 通过 |
| e | FR-7.1 冲突响应含双方 keySha 且**不返回完整载荷** | 断言 `details` 有前 8 位、无完整 `payload_json` | `agentIngest.test.ts:89`（「冲突响应只给双方 sha 前 8 位，**不回显完整载荷** —— 回显等于泄露另一个会话的内容」）；HTTP 层 `agent.api.test.ts:200` | ✅ 通过 |
| f | FR-2.7 部分成功：20 条中 3 条非法 ⇒ 17 条落库、逐条结果齐、HTTP 200 | 计数 + 逐条 status 断言 | `agent.api.test.ts:84`（整体 200）；`agentService.test.ts:93`（「超限那条拒掉，其余照落，返回逐条 index 与 status」） | ✅ 通过 |
| g | FR-2.6 体量上限：单条 512 KB / 20 条 / 总量 2 MB，**且**超限条目 `rejected` 而其余照落 | 边界值 ±1；**三值缺一即红** | `agentService.test.ts:47`（三值与 spec 一致）/`:53`（512 KB ±1B）/`:63`（总量越线后条拒前条照落，**自带变异腿**）/`:82`（20 放行 21 整批 422）；传输层另有 `agent.api.test.ts` 四支（2 MB 首次经 HTTP 可达 / 仍有界 / **按端点**放宽） | ✅ 通过 |
| h | FR-2.5 一律 pending：任何 kind 落库后 `status` 均为 `pending`，`reviewed_at` 为 null | 断言 | `agent.api.test.ts:64`；`agentIngest.test.ts:41` | ✅ 通过 |
| i | FR-2.8 `dev_log` 发布后落既有 `dev_log_entries` 且 `entry_no` 不冲突 | 断言递增 | ✅ **本轮才实现**（此前**从未有过任何实现与凭据**）：`agentService.ts` 的 `publishDevLog` 走既有 `DevLogRepo.create`（`entry_no` 由既有事务分配，本项不改表形也不改分配规则）；凭据 `agent.api.test.ts` 的 `i · 确认一条 dev_log ⇒ dev_log_entries 真多出一行`。`agentService.test.ts` 另有 4 支 | ✅ 通过 |
| j | FR-2.9 `tasks.status` 只接受三值，`blocked` 判 `rejected` | 表驱动含 4 个值 | ✅ **本轮才实现**：`agentService.ts` 的 `publishTaskStatus` 先过 `isTaskStatus`（`TASK_STATUS` 三项），不过即整条 `rejected`、**不扩列、业务表零写入**；凭据 `agent.api.test.ts` 的 `j · …blocked…整条 rejected…闭集仍是三项`，`agentService.test.ts` 另有 `it.each` 4 支 + 跨项目/任务不存在各 1 支 | ✅ 通过 |
| k | FR-3.5 鉴权双闸：无 token ⇒ 既有 401/403 形制 | 走既有 IT 鉴权形制 | `agent.api.test.ts:243`；聚合读面另有 `apps/server/test/context.api.test.ts` 的「无 token ⇒ 既有 401」 | ✅ 通过 |
| l | FR-3.3 `fields` 非法值 ⇒ 422 且响应列出合法值（不静默忽略） | 断言消息含**六个**合法段名 | 服务层 `contextService.test.ts:71`；**HTTP 层此前无凭据，本轮补** `apps/server/test/context.api.test.ts` 的 `§7-l` 5 支（422 而非 500 / 消息列全六段 / **空串非法而非「全选」** / 合法子集不误伤 / 项目不存在走 NOT_FOUND） | ✅ 通过 |
| m | FR-3.4 预算裁剪顺序（logs → assets → checklist）**且**每次裁剪都进 `truncated` | 构造三个阈值各判一次；断言**无静默截断** | `contextService.test.ts:189`（先砍 logs）/`:203`（砍 checklist 必须整段写明）/`:225`（裁剪顺序固定）/`:237`（低于结构下界 ⇒ 422）/`:244`（**钉死上游排序方向**：`DevLogRepo.list` 必须最新在前，否则裁剪会静默变成「留最旧的」）。⚠️ 2026-10-15 曾修掉一个真 bug：`shrinkLogs` 原本从数组末尾倒走，实际留下最旧的 | ✅ 通过 |
| n | FR-3.2.1 读不到 `pack.lock.json` 时 `drifted` 为 null 且 `truncated` 有说明 | 无 lock 夹具 | 服务层 `contextService.test.ts:107`；**HTTP 层本轮补** `context.api.test.ts` 的 `§7-n`（`drifted`/`outdated` 恒 **null** 而非 `false` ——「不可判定」不是「没漂移」）。**变异实测**：把无 lock 分支的 `drifted` 写成 `false` ⇒ 精准红 1 支 | ✅ 通过 |
| o | FR-4.3.1 `CLI_COMMANDS` 漂移闸：加命令不登记 ⇒ `cliCommands.api.test.ts` 变红 | **变异腿**（本项的判据是「能红」） | `apps/server/test/cliCommands.api.test.ts:96`（「shared 的命令名集合 == apps/cli 的真实注册名集合」，**逐字比较**）。登记已从 5 条扩至 **9 条**（＋`ask`/`status`/`session`/`requirement`） | ✅ 通过 |
| p | FR-4.2 `--json` 输出可被 `jq` 解析、`summary.ok` 与退出码一致 | 表驱动含 ok/error/drift 三值 | 既有 `apps/cli/test/output.test.ts` 的 `CLI-JSON-01`（stdout 恰好一个可 jq 解析的对象）/`:115`（fail 下仍是单对象）/`:133`（退出码常量冻结）。⚠️ **既有套件只覆盖 0 与 2，error 档（1）无断言**；本轮由新命令补齐：`ask.test.ts:252/283/343`（ok/error/**drift 在本命令不可达且明写理由**）与 `status.test.ts:249`（**三值齐全**：干净退 0 / 漂移退 2 / 解析不出退 1，`summary.ok` 逐档一致）。第四只命令 `requirement add` 另有 `apps/cli/test/requirement-add.test.ts` 20 支：ok/error 两档可达，**drift 档照既有形制明写不可达 ＋ 为什么**（纯写命令，本仓漂移的唯一语义是「项目树 vs `pack.lock.json`」，回流响应里无此概念），**未为凑三值造假的用例** | ✅ 通过 |
| q | `ask` 关键词非闭集 ⇒ `UNKNOWN_QUERY` + **列出全部合法关键词** | 断言消息含七词 | `apps/cli/test/ask.test.ts:100`（`CLI-ASK-01`，且**零请求**）/`:117`（闭集恰好七项，逐项可解析，**不接受任何自由文本**）/`:147`（表驱动：每个词只向服务端要它那一段） | ✅ 通过 |
| r | `session log` 在 serve 未启动 ⇒ 自由 code + 可执行提示，**不本地攒** | 退出码 + 提示文案 + 无落盘 | `apps/cli/test/session-log.test.ts:208`（`CLI-SESSION-08`：serve 没起 ⇒ 退 1 + 自由 code + 「先跑 openvibe serve」＋**临时 HOME 零文件**） | ✅ 通过 |
| s | FR-4.4 CLI 侧不开 DB | `grep -rln 'openDb\|better-sqlite3' apps/cli/src` → 空 | ⚠️ **本条是命令行判据，不是测试**。实测 → 0；本轮另有**测试化**的一支 `session-log.test.ts:137`（`CLI-SESSION-05`：三个命令模块零禁列命中 —— `node:fs` / 写类 API / DB 驱动）。**变异实测**：临时加字面量 ⇒ 1 | ✅ 通过 |
| t | FR-8.1 core 对 adapters 的 import 保持 0 | `grep` 断言 | ⚠️ **本条是命令行判据**。实测 `grep -rn "@openvibe/adapters" packages/core/src --include='*.ts' \| grep -v test \| wc -l` → **0** | ✅ 通过 |
| u | FR-5.1.2 `payload_json` 无禁列（绝对路径 / 项目名 / 用户名 / 会话正文 / `cwd`） | 四类**已写入** kind 逐类扫描（第五类 `agent_bridge_installed` 为声明态，见 ⚠️u） | `packages/core/src/services/agentPayload.test.ts` 10 支（四类键闭集 ＋ 四类禁列零命中 ＋ **扫描器自证**：嵌套两层必被抓、干净行必放行、坏 JSON 不得当成干净）＋ **单一出处 `AGENT_PAYLOAD_KEYS` 与本 FR-5.1.1 原文逐字比对**（防规格漂移）；`cli_agent_command_run` 侧另有 `apps/server/test/commandRun.api.test.ts` 20 支。⚠️ **扫描器已抽成单点实现** `packages/core/src/test-support/forbidden-scan.ts`（FR-6.3 与 FR-5.1.2 原先各有一份，会静默漂移） | ✅ **通过（2026-10-17 补齐）** —— 本行原判据写「扫描五类事件」而实测**只有一类有守卫**（`agent_ingest_rejected` 键与禁列**零覆盖**、另两类键断言硬编码且禁列只有点断言）。已补齐四类，见 ⚠️u |
| v | 遥测**关闭**时 M8 零网络调用（既有断言**逐字保留**），且台账仍有 M8 事件 | 承 `local-event-ledger.md` §7-e | `apps/server/test/telemetry-flush.test.ts:514`（`TF-15`：开关关闭 ⇒ fetch 零次，且 `local_events` 仍有行，「**关的是出网，不是记录**」）；既有零网络断言逐字保留 | ✅ 通过 |
| w | FR-8.4 带 ref 锚的 golden / seed 零触碰 | `git diff --name-only <BASE>..HEAD -- tests/golden/ content/seed/` → 0 行 | ⚠️ **本条是外部命令凭据，不是测试**。实测两条都为空：`git status --porcelain -- tests/golden/ content/seed/` → 空；`git diff --name-only 4b42642..HEAD -- tests/golden/ content/seed/` → 空。另 `pnpm seed:check` rc=0、`pnpm bundle:check` 入口 267.27 kB ≤ 300 kB | ✅ 通过 |
| x | **人工验收腿**：README 能不加解释讲清「agent 能读什么、能写什么、不能做什么」 | 屏摄归档；判不过须回报 owner 而非改文案了事 | 🟡 **判定物本轮才存在**：`README.md`「让 agent 接进来（M8）」一节，分「能读 / 能写 / **不能做**」三段，后者含「不能删 / 不能自己裁决幂等冲突 / 不能扩充既有闭集」三条。**屏摄归档仍缺** | 🟡 **待 owner 屏摄签收**（属 owner 腿，agent 不代判） |

- **7.1 未验证面（负向登记，不得读成已通过）**：
  ① **Trae / CodeBuddy 的 skill 发现约定未核验**（§2 Out 第二行）——本 spec 已把 M8-A 排除在外，故本 spec **的读写面**不受此影响；但**这是 M8 全模块的最大未验证面**，它挡住两件事：② §2 的拆分后件（M8-A skill 包），**以及 FR-2.9.1 的 `session` 落点**——`agent_sessions` 需要 `external_session_id` 与 `platform`，而这两个值的形态恰好是同一种未知性（2026-10-16 补记：此前只写了「挡住拆分后件」，漏了 session 落点这一处连带）；
  ② **FR-2.6 三个体量数值未实测**（§6.3）；
  ③ **§8.2 五处待裁未闭合**，任一未裁即本 spec 不构成开工依据；
  ④ **`requirements` 的最终形态未定**（§6.4），`requirement` kind 在裁前只能丢弃；
  ⑤ **工作树 50 个非本会话改动文件**（§3-18）的归属未核——若其中含 `apps/server/src/routes/*` 或 `packages/core/src/repos/*`，开工前须逐文件 `git diff -U1` 核归属（承 `service-layer.md` §6.6）；
  ⑥ win32 权限位与 junction 语义沿用 m6b §7-11 的既有未验证面，**本项未缩小它**。
- **7.2 不抄支数**：本节不写「N 支测试」这类数字——它们会在下一支测试落地的当天腐烂。复算命令：`grep -rhoE '(CORE|SRV|IT|CLI|MANUAL|GOLD)-M8-[0-9]+[a-z]?' apps packages tests | sort -u | wc -l`。

---

## 8. 依赖

### 8.1 依赖

| 依赖 | 状态（实测） | 不满足的后果 |
|---|---|---|
| **服务层**（`service-layer.md` FR-1 四服务） | **未落地**（§3-7 零命中） | **硬前置**：route 直连 repo 会反向增长 §3-7 那条命中数，使 FR-3 的判定口径从「未开工」变「已破坏」 |
| **本机台账**（`local-event-ledger.md` RF1-5） | **未落地**（§3-10 零命中） | FR-5 全部只声明不写入（§6.8）；§7-v 不可跑 |
| **`0007` 号位**（§6.1） | 空位存在，但**两份 spec 在争** | 待裁①未裁 ⇒ 迁移名不可写死 |
| **`projects` 表**（`projects(id)` 外键目标） | 已在（§3-19） | — |
| **`dev_log_entries` / `tasks` / `project_check_states`** | 已在（§3-19） | FR-2.8/FR-2.9 的发布落点 |
| **`ERROR_CODES` 11 项闭集** | 已在（§3-12） | 不得增删（FR-6.1） |
| **`CLI_COMMANDS` 单源 + 漂移测试** | 已在（§3-14/§3-15） | 不登记即红（FR-4.3.1） |
| **`parseOrThrow` / `http-guard` / `Printer`** | 已在 | 不新增校验与鉴权形制 |
| **`output-validation.md` FR-2 出参断言面** | 已在 | 两个新 `*Out` 须注册 |
| **M4 技巧库**（playbooks / `0006_playbooks.sql`） | **已落地**（DEV-0091） | `ask` 的 `playbook` 关键词与 `assets.playbooks` 计数段依赖它；且它是 0006 号位的占用方（§6.1） |

### 8.2 待裁（owner 裁决）—— **2026-10-14 五项全部闭合**

> **原纪律（`dev-plan.md` §0.4 第 4 条）仍成立**：本 spec 升 v1.0 后**才**构成开工依据；闭合前它是 v0.9 草案、不可开工。**「五项已闭合」≠「可以开工」**——总闸 RF1-5 台账未落地（§0 头部「关联任务」格仍为**无**）。
> **如实登记：①②③④⑤ 五项，owner 的选择与本 spec 原建议相反的有四项**（①②③⑤ 采了原建议之外的案；④ 同为「本 spec 建议之外」）。下表「原建议」列原样留痕。

| # | 待裁 | 选项 | **裁定（2026-10-14）** | 本 spec 原建议 | 落点 |
|---|---|---|---|---|---|
| **①** | **迁移号位归属**（台账 spec 六处 `0006` 陈旧断言见 §6.1） | (a) M8 取 `0007`、台账顺延；(b) 台账取 `0007`、M8 顺延；(c) 两张 M8 表并进台账迁移；(d) 各取一号 + 就地改台账 spec | **(c)**——台账取 `0007`（`0006` 被 M4 占用），**M8 三表并进同一次迁移**，台账 `kind` 13 → **18** 项。⚠️ 代价：台账迁移出问题时 M8 三表一并回滚；且 **M8 被台账物理阻塞** | **(a)**：两份 spec 生命周期不同，合并不利于任一方独立回滚 | **FR-1.1**（含 FR-1.1.1–1.1.4） |
| **②** | **幂等键冲突用哪个既有码**（FR-6.1） | (a) `STALE_SELECTION`；(b) `NAME_CONFLICT`；(c) 增新码 | **(c) 增 `IDEMPOTENCY_CONFLICT`**（B 级，422）⇒ 闭集 11 → **12**。**同批必须补该闭集的守护测试**——该闭集当前零测试守护（§8.2 附注） | **(a)**：语义近邻是「你手上这份已过期」 | **FR-6.1**（含 FR-6.1.1–1.3） |
| **③** | **回流体量上限三值**（FR-2.6 / §6.3） | (a) 32 KB / 20 条 / 256 KB；(b) 回到 m6b 同档 512 KB；(c) 更严 | **单条 512 KB / 20 条 / 总量 2 MB**。第三值**非照抄 m6b**，取 2 MB 才使「20 × 512 KB」的理论上限不可能突破整包预算（`constants.ts:108-109` 同族） | **(a)**：agent 比人更易撞上限（本 spec 自陈该建议是**推算非实测**） | **FR-2.6**（含 FR-2.6.1） |
| **④** | **`requirement` kind 的落地**（§6.4） | (a) 丢弃 + 可执行提示；(b) 本 spec 一并建 `requirements` 表；(c) 从闭集移除 | **(b) 一并建表** ⇒ 由 Out 转 In，**三表 → 四表**（连台账表）。连带：`requirements` 与 `tasks` **两表独立无外键**，`tasks.requirement_id` **提为禁区** | **(a)**：「不裁就丢弃」是实施底线，宁可功能缺角也不自造第三张表 | **FR-1.1a**（新增）＋ §2 表首行 |
| **⑤** | **台账未落地时 M8 埋点怎么办**（§6.8） | (a) M8 自建临时表；(b) 降级人工数；(c) 推迟 M8 | **(c) 推迟**——五类 kind **只声明不写入**，「人工数」兜底**被否**。代价：可观测性完全押在台账上 | **(b)**：不重复造表，也不让埋点绑死 M8 上线 | **FR-5.4**（含 FR-5.4.1–5.4.2） |

**附注（本轮实测新发现的既有缺口，不属五项待裁但与②直接相关）**：`ERROR_CODES` 11 项闭集**当前零测试守护**——`grep -rn 'ERROR_CODES\|ErrorCode' --include='*.test.ts' apps packages` ⇒ **0 命中**；生产侧也只有 `packages/shared/src/errors.ts:2` 一处定义。裁决②把它扩到 12 项 ⇒ 这不再是理论风险。处置写进 **FR-6.1.2**，作为增码的同批硬要求。

### 8.3 本 spec 之后的 spec 拆分（**不在本件**）

| 待立 spec | 覆盖 | 可规格化的前置 | 判级预告 |
|---|---|---|---|
| `m8-skill-bridge.md` | M8-A 官方 skill 包、意图→命令映射表、`scripts/`（sh + ps1）、随标准包分发 | **PRD §11-待裁②**：Trae / CodeBuddy 的 skill 发现约定**须先真机核验**；未核验前写规格 = 把猜测固化成 FR | A（动 adapter 产物集合 ⇒ design §8 冻结面） |
| `m8-agent-panel.md` | M8-E Web 面板、待确认回流三态、空态三态、与 CLI 同源断言 | 依赖 M8-C 落地（FR-5.2 的「同源」要有两路可比） | C（纯 UI，不动契约面） |
| `requirements` 决策 | 第三张表的最终形态 | 依赖 M5 `tasks` 与需求的关系判断（§6.4） | 待定 |

---

**变更日志**

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.9 | 2026-10-13 | 初版。基于 PRD v1.0 产出，覆盖 M8-B/M8-C/M8-D 三个子面；M8-A 与 M8-E 拆出（§2/§8.3）。采样提交树 `4b42642`（旧树 `54789b8` 的行号已全部重采）。五处待裁见 §8.2。 |
| **v1.0** | **2026-10-14** | **§8.2 五处待裁全部闭合（owner 亲裁），由 v0.9 草案升为可开工依据的规格**。逐条落点：**①** 迁移号位＝M8 三表**并进台账那次迁移**（台账取 `0007`，`kind` 13 → **18** 项）→ 改写 **FR-1.1** 并新增 FR-1.1.1（闭集 18 项须同笔迁移内改 `CHECK`）／FR-1.1.2（**本 spec 在 RF1-5 下游、不是并行项**）／FR-1.1.3（台账 spec `0006` 过期断言**共 6 处** `:8`/`:26`/`:38`/`:54`/`:99`/`:105`，**措辞各异、只有 `:38` 明说「可用」**；本 spec 不代劳只登记）／FR-1.1.4（原建议留痕）；**②** 增新码 **`IDEMPOTENCY_CONFLICT`**（闭集 11 → 12，422）→ 改写 **FR-6.1** 并新增 FR-6.1.1（两个既有码被否）／**FR-6.1.2**（增码同批**必须**补 `ERROR_CODES` 守护测试——该闭集当前零测试守护）／FR-6.1.3（不新造 409）；**③** 体量＝**单条 512 KB / 20 条 / 总量 2 MB** → 改写 **FR-2.6** 并新增 FR-2.6.1（三值缺一即红，第三值非照抄 m6b）；**④** **`requirements` 表由 Out 转 In** → **新增 FR-1.1a**（含与 `tasks` 两表独立无外键、`tasks.requirement_id` 提为禁区）；**⑤** 埋点**推迟到台账落地之后、只声明不写入**、「人工数」兜底被否 → 改写 **FR-5.4** 并新增 FR-5.4.1/5.4.2。**§2 范围表七行全部按裁定改判**（In/Out 两列多处对调）。**如实登记：五项中四项 owner 的选择与本 spec 原建议相反**（§8.2「原建议」列原样留痕，不改判不美化）。**v0.9 行按「日志不回改」原样保留。** ⚠️ **闭合 ≠ 可开工**：总闸 RF1-5 台账未落地，「关联任务」格仍为**无** |
