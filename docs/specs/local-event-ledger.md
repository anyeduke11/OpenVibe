# SPEC · 本机事件台账（草案：`local_events` 表、聚合端点与「本机统计／匿名统计」两节）

| 项 | 值 |
|------|------|
| 模块 | 横切能力（度量与隐私面，非 PRD 3.2 的资产模块）——沿用「横切能力用功能名」命名法（dev-plan §0.4 第 5 条） |
| 优先级 | **RF1-5**（PRD §10.2 表 RF1 行；分析文 §7 Phase 1 表判级预判 **B**：新表 + 新端点，不动任何白名单）。PRD §10.2 明写 RF1 行「1-5 受 §10.4 第一组的 **J7 前置约束**」 |
| 上游 | PRD **D29**（本地事件台账，owner 2026-10-02 裁）· §10.4.1（J7 逐表排除凭据，**本文件只引不复制**）· §10.5（隐私不变式）；分析文 §4.3（AD2）· §5.2（信号采集表）· §7 Phase 1 表 1-5 行（**出口判据单源在那里**）· §10-3（否证触发器） |
| 下游设计 | design §5（数据模型）、§6（路由面）、§11.5（遥测三事件与白名单本体）；`packages/core/src/db/migrations/` 的 **0007 号位**（**2026-10-14 改**：`0006` 已被 `0006_playbooks.sql`（M4，DEV-0091）占用，见 §3-1） |
| 关联任务 | **无**。PRD §10.4 第三组原文：「本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」 |
| 版本 | **v1.0（2026-10-14，§8.2 四项待裁全部闭合）**。本 spec 现构成开工依据。<br>**上一版**：**v0.9 草案（2026-10-03，纯新文件；本轮不改任何既有规格）**＋ **行内订正（2026-10-14）**：owner 裁① 后本 spec 的迁移号位由 `0006` 改 `0007`，共六处（`:8`/`:26`/`:38`/`:54`/`:99`/`:105`）已同批回改；**本次只改号位断言，未动任何功能条款、判级或验收判据**，故版本号不变（行内订正不 bump 版本）。按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**：§8.2 四处待裁未闭合，其中待裁③（CLI 侧写入 vs dev-plan §1.2 末「serve 与 sync/scan 可并行」那条既有不变式）会决定本项的**实际范围**，不裁就先建表就是把范围写死 |

---

## 1. 目标与用户价值

- 用户价值不在「多一张表」，在**一句现在无法兑现的承诺**：产品一直说「默认不开埋点、不开就不发任何网络请求」，但同一句话被读成「不开就什么都不知道」——于是 D15 的左半「工作台真实使用 ≥10 次」至今只能人工数。本项把这两件事拆开：**「不开埋点」与「没有信号」不是同义词**（分析文 §4.3 关键洞察）。
- **净解锁（必须写进规格，否则本项被读成一张空表）**：
  - 队列 ④／⑱ 与 PRD D15 左半的「工作台真实使用 ≥10 次」自此**有可机读形式** = `stage_view_switched` 与 `flow_template_run` 两类事件的计数。这条解锁**不推翻队列 ⑱ 的结论**——⑱ 当时判「左半无机读源」是对的，本项是**给它补源**，不是否证它（分析文 §11 同一口径）。
  - 北极星「飞轮圈数」此前由 `GET /api/stats` 用录入侧数字近似（`apps/server/src/routes/settings.ts:149-172`，两条 `EXISTS` 聚合），本项给出行为侧的同名口径。
- 与 D3 的关系是**正交不是替代**（PRD D29 原话）：遥测三类白名单、五段体、「机器标识不带出」承诺一字不改，台账不新增任何网络面。

## 2. 范围

| In（本 spec 覆盖） | Out（明确不做，写明理由与去向） |
|---|---|
| 迁移 **`0007_local_events_and_agent_bridge.sql`**（2026-10-14 由 `0006` 改号） + `core/repos/localEvents.ts` | 动 `TELEMETRY_EVENTS`（`packages/shared/src/constants.ts:73`）的任何一字——它是 D3 白名单本体，属 A/B 级隐私面，与本项正交 |
| `kind` 闭集写进 SQL 的 `CHECK`，且与 TS 常量有一致性测试（FR-1.4） | 把遥测三事件改名或复用（分析文 §4.3 第 2 条要求**严格不同名**，避免混淆） |
| 写入点集中在服务层（一处） | 前端埋点框架／通用 event bus——本项只要 4 个具体发射点，不需要一套机制 |
| `GET /api/local-events/summary` 按 kind/day 聚合 | 事件明细的对外 API（明细只在本机 DB 里；对外只给聚合，减少未来被当报表接口用的面） |
| 设置页两节并排「本机统计（永不出网）」「匿名统计（默认关，三类）」+ 一键清空 | 把台账数据上报／同步／导出到任何外部面（**若未来要导出，须另立 B 级裁定**，见 §6.6） |
| 「关闭遥测时零网络调用」既有断言逐字保持 | 迁移或废弃 `injections`／`dev_log_entries`——**并存不迁移**，两张既有表继续是各自事实源 |
| 供 RF2 成长阶段机消费的读取面（阶段判据落在 `growth-path.md`） | 用户／团队维度、跨机合并（M7 之后，且受队列 ㉓ 阻） |

## 3. 现状与实测基线（采样：2026-10-03 工作树；引用提交树 `54789b8` 的行号）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 已用迁移号 | **0001–0006**（`0006` = `0006_playbooks.sql`，M4 · DEV-0091）⇒ 本项取 **`0007_local_events_and_agent_bridge.sql`** | `ls packages/core/src/db/migrations/` |
| 2 | `local_events` 在代码里的命中 | **0**（表、repo、路由、页面全无） | `grep -rn 'local_events\|localEvents\|local-events' --include='*.ts' --include='*.tsx' apps packages \| grep -v dist \| wc -l` |
| 3 | 遥测三事件（须严格不同名的对象） | `['pack_injected','flow_template_used','project_active']`（`packages/shared/src/constants.ts:73`），SQL 侧另有一份字面量（`0002_app_meta_telemetry.sql` 的 `CHECK (event IN (...))`） | `sed -n '73p' packages/shared/src/constants.ts`；`grep -n 'CHECK (event IN' packages/core/src/db/migrations/0002_app_meta_telemetry.sql` |
| 4 | 「SQL 字面量 = TS 常量」是否已有测试守住 | **没有**。现存唯一读迁移的测试是 `packages/core/src/db/core-db.test.ts`，未比对枚举 | `grep -rln 'TELEMETRY_EVENTS' --include='*.test.ts' apps packages \| grep -v dist` → 空 |
| 5 | web 侧对事件端点的发射命中 | **0**（`api/telemetry/events`／`local-events`／`trackEvent` 全仓 web 侧零命中）⇒ 本项要新建发射点，不是在既有埋点上改 | `grep -rn 'api/telemetry/events\|local-events\|trackEvent' apps/web/src --include='*.ts*' \| wc -l` |
| 6 | CLI 是否打开过 DB | **从未**：`apps/cli/src` 内 `openDb`／`better-sqlite3`／`dataDir` **0 命中**；且 dev-plan §1.2 末那条 bullet 把「sync/scan 不碰 DB 文件锁」写成既有条款 | `grep -rln 'openDb\|better-sqlite3' apps/cli/src`（空）；`grep -n '不碰 DB 文件锁' docs/dev-plan.md` |
| 7 | 资产「来自 seed」的现有表达 | `prompts`／`terms`／`flow_templates` 有 `seed_hash TEXT`（`0001_init.sql:14,67,80`），**`skills` 没有**，它用 `source` 枚举且值域里**不含 `'seed'`**（`0001_init.sql:37`，0004 扩为四值） | `grep -n 'seed_hash' packages/core/src/db/migrations/0001_init.sql` |
| 8 | 设置页现有分节 | **6 节**：`ServiceSection`／`SeedSection`／`PackSection`／`TelemetrySection`／`WizardSection`／`BackupSection`（`apps/web/src/pages/SettingsPage.tsx:22-27`） | `sed -n '20,28p' apps/web/src/pages/SettingsPage.tsx` |
| 9 | 「一键清空」的既有先例 | **无同类**：`app.delete` 全仓 7 处，全是单资源按 id 删；没有批量清空端点可抄 | `grep -rn 'app.delete' apps/server/src/routes \| wc -l` |
| 10 | 现有 UTC 时间戳形制 | `apps/cli/src/commands/sync.ts:147 export function utcStamp(now: Date): string`；`telemetry_events` 已带 `day TEXT NOT NULL` 列（**先例：按 day 聚合要落一列，不要每次现算**） | `grep -n 'day' packages/core/src/db/migrations/0002_app_meta_telemetry.sql` |
| 11 | J7 的逐表排除凭据 | **本文件不复制**——单源是 PRD §10.4.1（结论：16 张实表无一可机读替代「工作台真实使用 ≥10 次」⇒ D29 不撤回、前置已解除） | 见 PRD §10.4.1 与 D29 行末「影响面」列 |

**三个术语**：**append-only** = 只有 INSERT 与整体清空，无 UPDATE、无按条 DELETE；**kind 闭集** = 事件类型是 SQL `CHECK` 里的字面集合，新增须改迁移；**正交** = 与 D3 遥测不同名、不同表、不同出口，任一侧改动不影响另一侧。

## 4. 功能需求（FR）

- **FR-1 迁移与表形**：**`0007_local_events_and_agent_bridge.sql`**（2026-10-14 由 `0006` 改号，理由见 §3-1），列 `id INTEGER PRIMARY KEY AUTOINCREMENT / kind TEXT NOT NULL CHECK (kind IN (...)) / subject_type TEXT / subject_id TEXT / project_id TEXT / payload_json TEXT NOT NULL DEFAULT '{}' / created_at TEXT NOT NULL / day TEXT NOT NULL`。
  - FR-1.1 `subject_type`／`subject_id`／`project_id` **可空**（阶段视图切换无 subject），但 `kind`／`created_at`／`day` 必须 `NOT NULL`。
  - FR-1.2 索引两条：`(kind, day)`、`(created_at)`。**不建 FTS**（台账不做全文检索，别顺手加面）。
  - FR-1.3 `day` 落列不现算，照 `telemetry_events` 的先例（§3-10）；口径见 §8.2 待裁②。
  - FR-1.4 **双源一致性测试（本项的硬要求）**：`kind` 的 `CHECK` 字面量与 `packages/shared/src/constants.ts` 新增的 `LOCAL_EVENT_KINDS` 常量必须逐字相同，由一条测试解析迁移文本比对。理由写成规格而非注释：§3-4 已实证遥测那份同样的双源**当前无人守**，本项不得再落一个。
- **FR-2 `kind` 集合**：分析文 §4.3 给的是**十项闭集**。本 spec 实测该闭集**表达不出它自己 §5.1 的阶段判据**——`asset_updated`（F1 毕业条件）与 `injection_failed`（§5.2「卡在哪」一行）都不在十项里。
  - FR-2.1 提案 **13 项** = 十项 + `asset_updated` + `asset_deleted` + `injection_failed`（§5.2 的「改过什么」一行同时列了 `asset_deleted`）。
  - FR-2.2 与遥测三事件**严格不同名**，由一条断言守：`LOCAL_EVENT_KINDS ∩ TELEMETRY_EVENTS === ∅`。
  - FR-2.3 首版实际写入的 kind **只要求 4 类**（`stage_view_switched`、`flow_template_run`、`checklist_item_checked`、`asset_created`／`asset_updated` 中的已有点位）——其余 kind 声明了但暂不写入是**允许的**，`§7` 的验收只测有写入点的类。
  - FR-2.4 增删 kind 属**改迁移** ⇒ 判级按 §0.3 现算（本表非 design §7/§8 契约面，非 golden），**预判 B**。
- **FR-3 写入点集中**：写入只发生在服务层（`services/` 内一处），不散落 repo 与 route。
  - FR-3.1 **硬依赖 RF1-1**（`service-layer.md`）。若 1-1 未落地，降级形态是「repo 层单点写入 + route 调用」，**但必须在写入处加注释指向本 FR**，禁止散到 14 个 repo 方法里。
  - FR-3.2 关闭遥测与否**不影响写入**：台账是无条件本机写（默认开），这与 D29「本机、不出网、可清空」一致；用户可见的开关是「一键清空」，不是「是否记录」。**不得把「是否记录本机事件」做成开关**——那会让 §7 的隐私断言变成两条分支，也会让「永不出网」的承诺多一个可被误读的状态。
- **FR-4 聚合端点**：`GET /api/local-events/summary`，返回按 `kind` × `day` 的计数矩阵。
  - FR-4.1 走既有鉴权与 `Host`／`Origin` 双闸面（`apps/server/src/lib/http-guard.ts`），**不新增免 token 通道**。
  - FR-4.2 只读。没有 `POST /api/local-events`——若需要外部写入面，那是 §6.1 否证触发器要处理的事，不在本项。
  - FR-4.3 出参形状进 `packages/shared`，并按 `output-validation.md` FR-2 的出参断言面注册。
- **FR-5 设置页两节并排**：
  - FR-5.1 「本机统计（永不出网）」节展示聚合；「匿名统计（默认关，三类）」节沿用既有 `TelemetrySection` 内容——**两节同屏并列是刻意的**，它是 D29 否证触发器的判定物（能否「不加解释讲清」）。
  - FR-5.2 「一键清空」按钮：二次确认 + 文案明写不可撤销、历史归零。**不得**把清空动作本身作为一种 kind 写回台账（自指：清空后那条记录会替被清掉的数据说话）。
  - FR-5.3 文案全部进 i18n 命名空间（与 `entry-budget.md` FR-1 的 `settings` 命名空间对齐；若 0-1 尚未落地则进 `zh.ts` 的 `settings.*` 键位）。
- **FR-6 隐私不变式（一字不改的三条）**：
  - FR-6.1 「遥测关闭时零网络调用」的既有断言必须**逐字保持、不得改措辞**；新增断言是「且此时 `local_events` 仍在写入」。
  - FR-6.2 台账表**不出现在任何网络路径**：`telemetry-flush.ts` 的批量外发只读 `telemetry_events`，本项不得进入其读取面（断言方式：`grep` 该文件不含 `local_events`）。
  - FR-6.3 `payload_json` 只放 **id 与枚举值**，不放绝对路径、项目名、用户名、资产正文。理由不靠「反正不出网」——见 §6.6。
- **FR-7 窗内 vs 累计口径**：D15 的判据是「真发布当日起两周**窗内** ≥10 次」，而台账是累计 append-only。⇒ 解锁「可机判」不等于「可直接读累计值」，聚合端点必须支持时间窗参数（FR-4 的 `from`／`to`），且**发布前产生的事件不得计入窗内**。

## 5. 输入 / 输出

| 方向 | 内容 | 形态 |
|---|---|---|
| 入 | 服务层写入：`kind`、可选 subject、可选 project、payload | `recordLocalEvent(input)`；payload 为受限 JSON |
| 入 | 聚合查询：`from`／`to`／可选 `kind` 过滤 | query string，zod 校验 |
| 出 | `{ items: [{ kind, day, count }], totals, window: {from,to} }` | `LocalEventsSummaryOut`（新增类型 ⇒ 触 `output-validation.md` 的出参断言面） |
| 出 | 设置页两节 + 清空结果 | Web 组件；清空走 POST 返回被删条数（**返回条数，不返回内容**） |

## 6. 边界与异常

- **6.1 否证触发器挂在 D29 上，本 spec 必须让它可以被判定而不是被忘记**：分析文 §10-3 设的条件是「若社区把它读成『变相遥测』⇒ 撤回 D29 或降级为『只在内存 + 显式导出』」，判定方式 = README 与设置页文案能否**不加解释**讲清。⇒ 本项要求：文案评审作为 §7 的一条人工验收腿（j），且「两节并排」（FR-5.1）就是为这条判定准备的形态。触发后的处置属 owner，不属实现。
- **6.2 CLI 侧写入与既有不变式冲突（本项最大的一条，见 §8.2 待裁③）**：分析文 §4.3 的第三条理由是「覆盖 CLI 侧（用户可能全用 CLI，前端埋点抓不到）」，但 §3-6 实测 **CLI 从不打开 DB**，且 dev-plan §1.2 末那条 bullet 明文规定「serve 与 sync/scan 可并行：sync/scan 只读 HTTP API + 写目标项目目录，**不碰 DB 文件锁**」。四条出路：(a) CLI 经 HTTP 写服务端点（要求 serve 在跑，且新增写端点）；(b) CLI 直开 DB（**破既有不变式**）；(c) CLI 落 sidecar 再由 server 摄取（新存储面）；(d) **本项只收 web/server 侧事件**，`injection_confirmed`／`injection_conflict_resolved`／`injection_failed` 三类推迟另裁。推荐 (d)：D15 左半的解锁只依赖 `stage_view_switched` + `flow_template_run`（§1），两者都是 web 侧，(d) **不损失那条净解锁**，只是把分析文的第三条理由挂起。选 (a)/(b)/(c) 都动既有不变式或新增写面，须 owner 先裁。
- **6.3 `seed` 来源没有统一列，四类资产用了两套机制**（影响 F2 判据，见 `growth-path.md` FR-1）：`prompts` 与 `flow_templates` 只有 `seed_hash`（`0001_init.sql:14`、`:80`）；`skills` 只有 `source` 枚举且值域不含 `'seed'`（`:37`，0004 扩为四值）；`terms` 两者都有（`:64` 的 `source` 默认 `'manual'` + `:67` 的 `seed_hash`）。⇒ 成长阶段 F2 的「`asset_created` 且 `source != seed`」不能跨四类统一算，须在 `payload_json.origin` 里落 `'seed' | 'user'`——**写入时按各自机制判定一次**，不留给读取时跨四表反推。
- **6.4 按行计数与按事件计数的口径必须先定**：`grep -c` 按行、聚合按行也是按行；「一次点击产生一行」是本表的前提，若某发射点会重渲染重复触发（React StrictMode／query 重取）就会虚高。⇒ 每个发射点须带**去重键**说明，或在 §7 用「同一秒同 kind 同 subject 记 1」的口径显式承认。
- **6.5 append-only 与「一键清空」的张力是设计选择不是缺陷**：清空后「走了几圈飞轮」「窗内使用次数」全部归零，且**不可恢复**。文案必须写出这一后果（FR-5.2），否则「可清空」会变成「用户以为自己可以撤销」。
- **6.6 未来导出面**：一旦提供「导出本机统计」，`payload_json` 的内容就变成对外内容 ⇒ 这正是 FR-6.3 现在就限列的理由（不要等到有导出面时再洗历史数据）。
- **6.7 与队列 ⑱ 的关系**：⑱ 裁的是「左半承认人工数」，本项是**新存储补源**，不是把 ⑱ 改判。写进 §7 的人工对读条目，防止实现者顺手把 ⑱ 改成「已机读」。
- **6.8 迁移的向前兼容**：`0007` 只 CREATE，不 ALTER 既有表；老库升级即新增空表，统计从零开始属预期（**不得回填**：回填要把历史行为编成事件，那是造数据）。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 | **真实凭据（可定位）** | 状态 |
|---|---|---|---|---|
| a | `0007_local_events_and_agent_bridge.sql` 迁移可执行且幂等（**新库与既有库两径**） | 两径建表后 `schema_migrations` 表逐字一致（**不是 `PRAGMA user_version`**——runner 用自举的 `schema_migrations` 记账，实测全仓 0 处 `user_version`） | `packages/core/src/db/core-db.test.ts` → `CORE-EVT-01a`（账上停在 0006 的老库 ⇒ 只补 0007 一行，四表齐且空，既有行零丢失）/ `CORE-EVT-01b`（账上根本没有 0006 的 DEV-0091 之前的安装 ⇒ 0006 与 0007 连补两行）；新库径 `UT-MIGRATION-01` | ✅ **通过**（2026-10-16 核实：两径已落地） |
| b | FR-1.4 双源一致：迁移 `CHECK` 字面量 ≡ `LOCAL_EVENT_KINDS` | 解析迁移文本比对；**变异腿**：临时给常量加一项 ⇒ 必判红 | `m8-ledger-schema.test.ts` → `it('kind 的 CHECK 字面量 ≡ LOCAL_EVENT_KINDS（逐字、逐序）')` ＋ `it('kind 的 CHECK 字面量 ≡ 台账 13 ＋ M8 5 的并集')`（**变异实测红 3 支**） | ✅ **通过** |
| c | FR-2.2 与遥测三事件交集为空 | 断言 `∩ = ∅` | `m8-ledger-schema.test.ts` → `it('台账 kind 与遥测三事件严格不同名…')`（**变异实测红**） | ✅ **通过** |
| d | **四个有写入点的 kind** 各产生一条记录，字段齐备且 payload 无禁列 | 按 kind 断言 + 对 `payload_json` 做绝对路径／用户名模式扫描 | 🟡 **三个 kind 已落地**：`apps/server/test/local-events.writepoints.test.ts`（11 支）。写入点：`routes/{prompts,skills,terms,playbooks,flowTemplates}.ts` 的 POST/PATCH（`asset_created`/`asset_updated` 五类资产各一条，`subject_id` **逐条断言等于该资产真实 id**）＋ `routes/projects.ts` 的 `PUT /check-states`（`checklist_item_checked`）。禁列判据含**扫描器自证**支（故意灌脏行，必须报错 ＋ 必须放行干净行）＋ 键白名单自证支 | 🟡 **三个通过，两个不可判**（见下注 ⚠️d） |
| e | 遥测**关闭**时台账仍写入，且网络调用数与既有断言同值 | 既有「零网络调用」断言逐字保留 + 新增一行「`local_events` count > 0」 | `apps/server/test/telemetry-flush.test.ts`（前半的既有断言逐字保留；**后半本轮补**） | ✅ **通过**（2026-10-16 核实：`telemetry-flush.test.ts` 的 `TF-15` 已在仓 —— 开关关闭 ⇒ fetch 零次且 `local_events` 仍有行，「关的是出网，不是记录」） |
| f | `telemetry-flush.ts` 读取面不含 `local_events` | `grep -c 'local_events' apps/server/src/lib/telemetry-flush.ts` → 0 | ⚠️ **本条是命令行判据，不是测试**。实测 `→ 0`；加强版 `grep -rn 'local_events' apps/server/src`（整个 server 树）**同样 0**。**变异实测**：临时加字面量 ⇒ 1 | ✅ **通过** |
| g | `GET /api/local-events/summary` 鉴权与双闸生效 | 走既有 IT 鉴权形制 | ✅ `apps/server/test/local-events.api.test.ts` 的 `describe('§7-g · 鉴权与双闸生效')`（3 支）。**起真 app**（`buildApp`）而非单挂路由 —— 401 形态由全局 auth 插件保证，只单挂路由就验不到「端点确实落在插件覆盖范围内」 | ✅ **通过** |
| h | FR-7 时间窗 `from`／`to`；窗内与累计可区分 | 表驱动，含跨日与跨时区两行 | ✅ `repos/localEvents.ts` 的 `summaryInWindow(from, to)`（**`[from, to)` 含头不含尾，全仓唯一边界口径**）＋ `cumulativeByKind()`；直测 `repos/localEvents.test.ts` 11 支；端点侧 `local-events.api.test.ts` 的 `describe('§7-h')`（窗内/累计分列、边界含头不含尾）。日历有效性用**分歧输入**校验（`2026-04-31` 这类「`new Date` 不报错但顺延」的日子），**变异实测红 1 支** | ✅ **通过** |
| i | 一键清空：全表归零、返回条数、**不产生**清空事件行 | `SELECT COUNT(*)` 两值断言 | ✅ 端点 `POST /api/local-events/clear` **回传删掉的条数**；`local-events.api.test.ts` 的 `describe('§7-i')` 3 支（含「清空本身不落台账行」「空表清空 ⇒ `cleared: 0`」）；UI 侧 `components/settings/LocalLedgerSection.tsx` 带**二次确认 Dialog**，清空后果写进确认框正文 | ✅ **通过** |
| j | **人工验收腿**：README 与设置页两节文案能否讲清「本机≠遥测」 | 屏摄归档；判不过须回报 owner 而非改文案了事 | 🟡 **判定物已存在**：`README.md`「隐私与网络行为」下新增「本机事件台账：和匿名遥测是两件不同的事」（对照表五维 ＋ 禁列的测试兜底 ＋ 清空后果）；设置页两节各有独立正文。**屏摄归档仍缺** | 🟡 **待 owner 屏摄签收**（属 owner 腿，agent 不代判） |
| k | 无回填：升级后首条事件时间 > 升级时间 | 单测断言 | ✅ **通过**（`core-db.test.ts` 的 `CORE-EVT-05`：「存量库升级后写下的首条事件，时间晚于升级动作本身」—— 表里**只有这一条**（迁移没偷偷回填历史行）＋ `created_at` **严格大于**升级时刻 ＋ `day` 与事件时间一致 ＋ 存量行未变。⚠️ 断言刻意把事件推进至少 1ms：毫秒精度下若两者同刻，「>」会因分辨率而非因语义成立）。另有结构代理在 `m8-ledger-schema.test.ts` 的「迁移只 CREATE、不 ALTER 既有表」一条 | ✅ **通过** |
| l | 设置页两节并排且各自数据源不同表 | DOM 结构 + 两节各自 query key | ✅ `LocalLedgerSection`（`/api/local-events/summary` → `local_events`）与 `TelemetrySection`（`/api/settings/telemetry` → `telemetry_events`）**在同一列相邻挂载**，query key 前缀 `['local-events', …]` vs `['telemetry']`。⚠️ 见下方 ⚠️l | 🟡 **结构成立，文案有冲突待裁** |
| m | 现有闸零放松：golden 零 diff、`seed:check` 三精确值不变、`bundle:check` 入口余量不减 | 三条外部凭据 | ⚠️ **本条是三条命令，不是测试**：`git status --porcelain -- tests/golden/ content/seed/` → 空；`pnpm seed:check` rc=0（7/21 精确值命中）；`pnpm bundle:check` 入口 267.27 kB ≤ 300 kB | ✅ **通过** |

> ### 🟢 本表于 2026-10-15 第二轮回填（DEV-0101）：补齐 0-f 的被验收物
>
> 第一轮把 13 个虚构测试 ID 换成真实指向；第二轮把**缺失的被验收物本身做出来**（聚合端点、时间窗、一键清空、设置页两节、`localEvents` 直测、server 侧写入点、README 判定物）。**判据列一个字没动，条目一条没删。**
>
> **d 条为何是 🟡 不是 ✅**：FR-2.3 点名五个 kind，本轮落地三个，另外两个**在产品里没有对应动作**，不是漏写：
> - `flow_template_run`：`FlowsPage` 只有编辑／复制／删除，**全仓没有「跑一个流程模板」这个用户动作**（`useFlows.ts` 无 run/execute）。要它有写入点，得先有那个动作 —— 那是扩产品面，不在本轮授权内。**需 owner 拍板**：补动作 / 从 kind 闭集里删 / 改判据措辞。
> - `stage_view_switched`：写入点在 `apps/web/**`，与并行活跃会话的 58 个文件正面交叠，本轮未动。
>
> **本轮抓到的三处「判据比实现弱」**（都是加严，没有一处放松）：
> 1. 日历有效性校验原先只用 `2026-10-32`／`2026-13-01` 做非法样例，而它们**恰好落在两条校验支的交集里** —— 把 `!isNaN` 与「构造后读回相等」两条支都删掉，测试仍全绿。穷举 98 万组后发现两者在 **67,575** 组上分歧（如 `2026-04-31`：`new Date` 不报错但顺延到 5 月 1 日），已把这三类分歧输入补进断言，变异实测红 1 支。
> 2. FR-6.3 的禁列扫描是**否定式判据** —— 写对了永远绿，扫描器写错也永远绿。故新增**扫描器自证**支：故意往库里灌一条含绝对路径与用户名的脏事件，必须报错；再换回干净 payload，必须放行。
> 3. `PUT /check-states` 是**幂等端点**，直接在 handler 里记事件会把计数虚高（§6.4 要求发射点自带去重）。故只在**状态真正翻转**时记一条，并有用例钉死「重复 PUT 不重记／取消不记／取消后再勾记第二条」。
>
> **一处判据修正（不是放松）**：`tests/order-determinism.test.ts` 的 `UT-ORDER-01` 是**纯文本**判定（`ORDER BY` 末键须为 id/rowid/entry_no/version_no），误伤 `GROUP BY kind, day … ORDER BY day DESC, kind ASC` 这类**排序键恰为分组键**的聚合 —— 分组键已使结果唯一，平局结构上不可能发生，而给聚合加裸 `id` 反倒是取组内任意值的坏 SQL（本轮一度真写出来了）。已改为语义判定：**豁免仅当 `ORDER BY` 排序键 ⊆ `GROUP BY` 分组键**。新增 `UT-ORDER-01a` 五条把两侧钉死，其中一条在真实文件上做整仓级变异（把排序改成未覆盖分组键的形态 ⇒ 必须报错）。
>
> ### ⚠️l 设置页存在一处**语义冲突**，需 owner 裁定（agent 不代改，并行会话正在写该文件）
>
> 并行会话的 `LedgerSection`（`components/settings/SettingsSections.tsx:218`）挂着 chip「不出网」与文案「append-only · 可清空 · 本机可复算 · 不出网」「与匿名遥测正交：本层永远在，关掉遥测它照样记账」，**但它读的是 `/api/telemetry/events` → `telemetry_events` 表**：受 `telemetryEnabled` 开关控制（关掉则 `{queued:false, reason:'disabled'}`）、带 `sent_at`、**会被发出**。`hooks/useLedger.ts` 的头注释同样写着「只读本机 SQLite，绝不出网……不是遥测」，而契约就写在下一行 —— 注释与实现相反。
>
> 这正是 FR-2.2 要禁的混名：**界面上写着「不出网」，数据其实会出网**，且「关掉遥测照样记账」不成立。本轮因此**另起** `LocalLedgerSection` 走真台账端点，而不是去改它（该文件属并行会话 795 行改动，改它等于抢写）。**三节并存时的读感与最终取舍请 owner 定。**

> ### 🔴 本表于 2026-10-15 被改写（owner 授权），改的是「凭据列」，不是「要求列」
>
> **原表的 13 个测试 ID 全部是虚构的** —— `CORE-EVT-01…05`／`SRV-EVT-01…04`／`IT-EVT-01`／`MANUAL-EVT-01`／`UT-EVT-01`／`GOLD-EVT-01` 在 `apps`／`packages`／`scripts` 的 `.ts`/`.tsx`/`.sql` 里 **0 命中**，只存在于本 spec 自身（实测复算）。连带 `m8-agent-bridge.md` 里「这些族是既有」的说法也是假引用。
>
> **为什么当初写得出来**：那张表混了三种东西而没区分 —— 真测试 ID、**grep 命令行判据**（f 条）、**外部命令凭据**（m 条），三者都塞进同一列「测试 ID」，于是看起来像有 13 条测试在守着，实际一条也没有。
>
> **这次改了什么**：① 已通过的 4 条改成**可定位的真实指向**（文件 + `it()` 原文，并标明哪几条本就是命令行判据而非测试）；② 未落地的 7 条把虚构 ID 换成**「❌ 无凭据／被验收物不存在」＋ 缺口指向**；③ 新增**状态列**。
>
> **这次没改什么**：**判据本身一条没松、条目一条没删**。「不通过」就是「不通过」，不是「这条要求作废了」。**RF1-5 判不过这个事实仍然成立**，M8 的台账欠账不能销。

- **7.7 未验证面**（负向登记，不得读成已通过）：① 待裁③选定前，CLI 侧事件覆盖为零，「用户全用 CLI」这一人群本项**测不到**；② 事件量对 DB 体积与聚合耗时的影响（无实测，未设上限）；③ D15 左半的机判「够不够格替代人工」——解锁的是**形式**（可机读），语义是否等价于「真实使用」属 owner 判读；④ 时区口径（待裁②）未定前，FR-1.3 的 `day` 列语义只是候选。

## 8. 依赖

- **8.1 上游依赖**：PRD D29（本项的授权来源）；`service-layer.md`（1-1，写入点唯一性）；`output-validation.md`（3-4，出参断言面）；下游消费方是 `growth-path.md`（2-1…2-7）与 `context-density.md`（3-1）与 M7 使用统计（队列 ㉓）。
- **8.2 待裁清单**（✅ **2026-10-14 owner 授权逐条裁决，四项全部闭合，本 spec 升 v1.0 后构成开工依据**）：

| # | 待裁项 | 候选与推荐 |
|---|---|---|
| **①** | `kind` 闭集取十项还是十三项（FR-2） | **(b) 十三项** —— ✅ **本项已被 owner 2026-10-14 的 M8 裁①**（登记 PRD **D34** 同批）**事实上闭合**：那一裁要求台账 `kind` 由 **13 项扩至 18 项**（13 ＋ M8 五类），等于 **(b) 胜出**。⚠️ 本行**不是新裁定，是溯源**：spec §8.2 曾把它列作待裁，是因为它当时确未裁；后被另一笔裁带出结论。**已随 `0007_local_events_and_agent_bridge.sql` 落地**（实测 `LOCAL_EVENT_KINDS` 18 项，`LEDGER_EVENT_KINDS` 13 项，由 `packages/core/src/db/m8-ledger-schema.test.ts` 逐字比对守护） |
| **②** | `day` 的时区口径：本机日还是 UTC 日 | **(a) UTC**。**证据（2026-10-14 实测）**：`packages/shared/src/utils.ts:36` 的日戳单源是 `at.toISOString().slice(0, 10)` —— **本仓现有唯一的「一天」定义就是 UTC 日**，选 (b) 会在同一仓里造出第二种 day 语义，让 `telemetry_events.day` 与 `local_events.day` 同名不同义（这正是 §7-7 ② 那条「事件量对 DB 体积影响未实测」的同类风险）。**代价已知并接受**：用户在设置页看「今天」时是本机日，**展示层必须标注换算**，否则用户会以为看到的窗口与写入的窗口不一致。**FR-1.3 相应收紧**：`day` **必须**由该单源派生，禁止在 repo 内另写 `new Date().toLocaleDateString()` 形态 |
| **③** | CLI 侧事件写不写？怎么写（§6.2 四选一） | **(d) 本项只收 web/server 侧**。**证据（2026-10-14 实测）**：`grep -rln 'openDb\|better-sqlite3' apps/cli/src` → **空**，CLI 至今从不打开 DB。(a)(b)(c) 都要么动 `dev-plan §1.2` 末那条「sync/scan 不碰 DB 文件锁」不变式、要么新开一条写盘路径，代价高于收益。**代价已知并接受**：**「只用 CLI 的用户」这一人群在台账里事件覆盖为零**，§7-7 ① 的未验证面**不因此消解**，仍须在设置页如实说明「本机统计只覆盖工作台操作」 |
| **④** | 「是否记录本机事件」要不要做成开关 | **不做**（即 FR-3.2 的原判）。台账是无条件本机写，用户可见的开关是「一键清空」而非「是否记录」。**理由**：做成开关会让 §7 的 e 条（遥测关闭时台账仍有事件）必须拆成两条分支断言，且 D29 的「永不出网」承诺会多出一个可被误读的状态（「关掉了是不是就不记了」）。**这条不是「暂缓」是「已裁」** |
