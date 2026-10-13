# SPEC · 本机事件台账（草案：`local_events` 表、聚合端点与「本机统计／匿名统计」两节）

| 项 | 值 |
|------|------|
| 模块 | 横切能力（度量与隐私面，非 PRD 3.2 的资产模块）——沿用「横切能力用功能名」命名法（dev-plan §0.4 第 5 条） |
| 优先级 | **RF1-5**（PRD §10.2 表 RF1 行；分析文 §7 Phase 1 表判级预判 **B**：新表 + 新端点，不动任何白名单）。PRD §10.2 明写 RF1 行「1-5 受 §10.4 第一组的 **J7 前置约束**」 |
| 上游 | PRD **D29**（本地事件台账，owner 2026-10-02 裁）· §10.4.1（J7 逐表排除凭据，**本文件只引不复制**）· §10.5（隐私不变式）；分析文 §4.3（AD2）· §5.2（信号采集表）· §7 Phase 1 表 1-5 行（**出口判据单源在那里**）· §10-3（否证触发器） |
| 下游设计 | design §5（数据模型）、§6（路由面）、§11.5（遥测三事件与白名单本体）；`packages/core/src/db/migrations/` 的 0006 号位 |
| 关联任务 | **无**。PRD §10.4 第三组原文：「本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」 |
| 版本 | **v0.9 草案（2026-10-03，纯新文件；本轮不改任何既有规格）**。按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**：§8.2 四处待裁未闭合，其中待裁③（CLI 侧写入 vs dev-plan §1.2 末「serve 与 sync/scan 可并行」那条既有不变式）会决定本项的**实际范围**，不裁就先建表就是把范围写死 |

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
| 迁移 `0006_local_events.sql` + `core/repos/localEvents.ts` | 动 `TELEMETRY_EVENTS`（`packages/shared/src/constants.ts:73`）的任何一字——它是 D3 白名单本体，属 A/B 级隐私面，与本项正交 |
| `kind` 闭集写进 SQL 的 `CHECK`，且与 TS 常量有一致性测试（FR-1.4） | 把遥测三事件改名或复用（分析文 §4.3 第 2 条要求**严格不同名**，避免混淆） |
| 写入点集中在服务层（一处） | 前端埋点框架／通用 event bus——本项只要 4 个具体发射点，不需要一套机制 |
| `GET /api/local-events/summary` 按 kind/day 聚合 | 事件明细的对外 API（明细只在本机 DB 里；对外只给聚合，减少未来被当报表接口用的面） |
| 设置页两节并排「本机统计（永不出网）」「匿名统计（默认关，三类）」+ 一键清空 | 把台账数据上报／同步／导出到任何外部面（**若未来要导出，须另立 B 级裁定**，见 §6.6） |
| 「关闭遥测时零网络调用」既有断言逐字保持 | 迁移或废弃 `injections`／`dev_log_entries`——**并存不迁移**，两张既有表继续是各自事实源 |
| 供 RF2 成长阶段机消费的读取面（阶段判据落在 `growth-path.md`） | 用户／团队维度、跨机合并（M7 之后，且受队列 ㉓ 阻） |

## 3. 现状与实测基线（采样：2026-10-03 工作树；引用提交树 `54789b8` 的行号）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 已用迁移号 | **0001–0005**，0006 空位 ⇒ 分析文建议的 `0006_local_events.sql` 号位可用 | `ls packages/core/src/db/migrations/` |
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

- **FR-1 迁移与表形**：`0006_local_events.sql`，列 `id INTEGER PRIMARY KEY AUTOINCREMENT / kind TEXT NOT NULL CHECK (kind IN (...)) / subject_type TEXT / subject_id TEXT / project_id TEXT / payload_json TEXT NOT NULL DEFAULT '{}' / created_at TEXT NOT NULL / day TEXT NOT NULL`。
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
- **6.8 迁移的向前兼容**：`0006` 只 CREATE，不 ALTER 既有表；老库升级即新增空表，统计从零开始属预期（**不得回填**：回填要把历史行为编成事件，那是造数据）。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 | 测试 ID |
|---|---|---|---|
| a | `0006_local_events.sql` 迁移可执行且幂等（新库与既有库两径） | `core-db.test.ts` 同族形态；两径建表后 `PRAGMA user_version`／迁移表一致 | `CORE-EVT-01` |
| b | FR-1.4 双源一致：迁移 `CHECK` 字面量 ≡ `LOCAL_EVENT_KINDS` | 解析迁移文本比对；**变异腿**：临时给常量加一项 ⇒ 必判红 | `CORE-EVT-02` |
| c | FR-2.2 与遥测三事件交集为空 | 断言 `∩ = ∅` | `CORE-EVT-03` |
| d | 四个有写入点的 kind 各产生一条记录，字段齐备且 payload 无禁列 | 按 kind 断言 + 对 `payload_json` 做绝对路径／用户名模式扫描 | `CORE-EVT-04` |
| e | 遥测**关闭**时台账仍写入，且网络调用数与既有断言同值 | 既有「零网络调用」断言逐字保留 + 新增一行「`local_events` count > 0」 | `SRV-EVT-01` |
| f | `telemetry-flush.ts` 读取面不含 `local_events` | `grep -c 'local_events' apps/server/src/lib/telemetry-flush.ts` → 0 | `SRV-EVT-02` |
| g | `GET /api/local-events/summary` 鉴权与双闸生效（无 token ⇒ 既有 401/403 形态） | 走既有 IT 鉴权形制 | `IT-EVT-01` |
| h | FR-7 时间窗：窗内计数与累计计数可区分；`from`／`to` 边界含头不含尾口径唯一 | 表驱动，含跨日与跨时区两行 | `SRV-EVT-03` |
| i | 一键清空：全表归零、返回条数、且**不产生**「清空事件」行 | `SELECT COUNT(*)` 两值断言 | `SRV-EVT-04` |
| j | **人工验收腿**：README 与设置页两节文案能否不加解释讲清「本机≠遥测」 | 屏摄归档；此条是 §6.1 否证触发器的判定物，判不过须回报 owner 而非改文案了事 | `MANUAL-EVT-01` |
| k | 无回填：升级后首条事件时间 > 升级时间 | 单测断言 | `CORE-EVT-05` |
| l | 设置页两节并排且各自数据源不同表 | DOM 结构 + 两节各自 query key | `UT-EVT-01` |
| m | 现有闸零放松：golden 零 diff、`seed:check` 三精确值不变、`bundle:check` 入口余量不减 | 三条外部凭据 | `GOLD-EVT-01` |

- **7.7 未验证面**（负向登记，不得读成已通过）：① 待裁③选定前，CLI 侧事件覆盖为零，「用户全用 CLI」这一人群本项**测不到**；② 事件量对 DB 体积与聚合耗时的影响（无实测，未设上限）；③ D15 左半的机判「够不够格替代人工」——解锁的是**形式**（可机读），语义是否等价于「真实使用」属 owner 判读；④ 时区口径（待裁②）未定前，FR-1.3 的 `day` 列语义只是候选。

## 8. 依赖

- **8.1 上游依赖**：PRD D29（本项的授权来源）；`service-layer.md`（1-1，写入点唯一性）；`output-validation.md`（3-4，出参断言面）；下游消费方是 `growth-path.md`（2-1…2-7）与 `context-density.md`（3-1）与 M7 使用统计（队列 ㉓）。
- **8.2 待裁清单**（owner 裁前，本文件不构成开工依据）：

| # | 待裁项 | 候选与推荐 |
|---|---|---|
| ① | `kind` 闭集取十项还是十三项（FR-2） | (a) 采分析文的十项，成长判据降级到能表达的子集；(b) 采本 spec 的十三项（补齐 `asset_updated`／`asset_deleted`／`injection_failed`）。**推荐 (b)**——(a) 会让 2-1 的 F1 判据无源，届时又要改迁移；但 (b) 偏离了 owner 已读过的分析文原文，须他点头 |
| ② | `day` 的时区口径：本机日还是 UTC 日 | (a) UTC（与 `utcStamp`、`telemetry_events.day` 同源，跨机一致）；(b) 本机日（用户看自己的「今天」更直观）。**推荐 (a)**，前提是设置页把窗口按本机日展示时明确标注换算 |
| ③ | CLI 侧事件写不写？怎么写（§6.2 四选一） | **推荐 (d) 本项只收 web/server 侧**，理由见 §6.2（不损失 D15 左半的净解锁，且不破 dev-plan §1.2 末那条「不碰 DB 文件锁」不变式）。(a)(b)(c) 都要动既有不变式或新增写面，须先裁再动 |
| ④ | 「是否记录本机事件」要不要做成开关 | **推荐不做**（FR-3.2）。若 owner 要，则 §7 的 e 条必须拆成两条分支断言，且 D29 的「唯一机读源」地位不再无条件成立 |
