# SPEC · 薄服务层（草案：`core/src/services/` 四服务与传输无关约束）

| 项 | 值 |
|------|------|
| 模块 | 横切能力（分层工程面，非 PRD 3.2 的资产模块）——沿用 `onboarding.md`／`theme.md`／`seed-content.md` 的「横切能力用功能名」命名法（dev-plan §0.4 第 5 条） |
| 优先级 | **RF1-1**（PRD §10.2 表 RF1 行首项；分析文 §7 Phase 1 表 1-1 行判级预判 **C**）。周期落在 RF1 的 2–3 周段，且是 1-2…1-6 与 2-1…2-7 的**前置**（分析文 §4.10 末句：「它是 D2/D3/D4/D12 的前置，建议优先」） |
| 上游 | PRD 第 10 章 §10.2/§10.3；分析文 §4.10（D9 薄服务层）· §7 · Phase 1 表 1-1 行（**出口判据的单源在那里，本文件不复制**）· §7.2 反例 5（服务层收益为负） |
| 下游设计 | design §1.1 与 dev-plan §1.1 的分层规则 R1–R4；`eslint.config.js` 的 `boundaryZones`（`:11-37`）与 `r4NoCrossApp`（`:39-54`）；`packages/adapters/src/index.ts:2-4` 的 R2 自陈 |
| 关联任务 | **无**。PRD §10.4 第三组原文：「本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」 |
| 版本 | **v1.0（2026-10-14，§8.2 三项待裁全部闭合 · 判级由 C 改判 B）**。本 spec 现构成开工依据。**三项连带修正**：① **判级 C → B**（判级取最高一档 —— 待裁② 的「planner 侧新增非受管判定」是可观察行为变化、待裁③ 的 R5 规则表改动是文档层；逐条理由见 §8.2）；② **服务数由四服务改五服务**，本轮落**三个**（`packService` / `injectService` / `agentService`），`growthService` 与 `statsService` 随 RF1-5／RF2-1 同批 —— owner 2026-10-14 已另裁「FR-1 增列 `agentService` 作第五个服务」；③ **本轮判级不是「附条件升 B」而是「已定 B」**。<br>**上一版**：**v0.9 草案（2026-10-03，纯新文件；本轮不改任何既有规格）**。按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**：§8.2 三处待裁未闭合，且 §6.3 登记了「两个服务此刻没有可实现内容」这一硬事实。**判级预判 C，但附一条上行条件**：只要实现过程动了 dev-plan §1.1 的 R1–R4 规则表（新增 R5 即是），本轮判级即按 §0.3「拿不准往高级别归」升 **B**——见 §8.2 待裁③ |

---

## 1. 目标与用户价值

- 用户看不见这一层，但它决定后面每一面**埋点埋几次**。RF1 的写盘自证（1-2/1-3）、RF2 的本机台账（1-5）与成长阶段（2-1…2-7）都要在「一次用户意图完成」的那一刻记账或核验；没有服务层，这些点必须**在 server 路由与 CLI 命令里各埋一遍**，从此每个新面都是一条双写线。
- 现存的重复已经可数：「lock 记的哈希与磁盘是否一致」这一个问题在 `packages/core` 内有**两处独立实现、三套状态词**（凭据见 §3）。这是分析文 §4.10 的张力（P5：每次改动要在两处保持一致，是文档量与错误率的乘数）在本仓的实证形态。
- 本层的价值判据不是「架构更漂亮」，而是一条可复核的减法：**同一规则的实现处数从 N 降到 1**，且降低的数量在 §7 里逐条给测试 ID。

## 2. 范围

| In（本 spec 覆盖） | Out（明确不做，写明理由与去向） |
|---|---|
| `packages/core/src/services/` 四文件与各自签名 | 重写或合并 `repos/`（服务层**只承载「一次用户意图」级的编排**，分析文 §4.10 原话「不是重写 repos」） |
| 一致性比对的三处合一（§4 FR-2） | 引入 DI 框架／容器／装饰器（本仓无 DI，函数 + `deps` 参数已是既有形制，见 `composer.ts:167`） |
| route/command 退化为「解析 → 调 service → 序列化/渲染」 | 改变任何对外 API 形状、状态码、CLI 输出文案与退出码（**行为零变化是 FR-6 的硬判据**） |
| 两条新 lint 规则：禁向上依赖 + 服务层传输无关（FR-4） | 放宽 R2/R3 为服务层让路（§6.1 明写为红线；R3 是 CLI 离线模式前提） |
| `AdapterBundle` 类注入面在服务层的保持与推广（FR-5） | 微服务／进程拆分／把 server 变成纯传输网关的部署形态变化 |
| 与既有 `packages/core/src/index.ts` 出口面的对接（FR-1.5） | 动 `design §7` 的 pack 契约与产物字节（那是 A 级，与本项无关：本层不产新字节） |

## 3. 现状与实测基线（采样：2026-10-03 工作树；改动面全在提交树 `54789b8` 之后，逐条给复算命令）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | `packages/core/src/services/` | **不存在** | `ls packages/core/src/services` → `No such file or directory` |
| 2 | 四个服务名在代码里的命中 | **0**（`packService`／`injectService`／`growthService`／`statsService`） | `grep -rn 'packService\|injectService\|growthService\|statsService' --include='*.ts' apps packages \| grep -v dist` |
| 3 | server 路由文件自行实例化 repo | **10 个路由文件全部命中，共 14 处** | `grep -rnE 'new [A-Z][A-Za-z]*Repo\\(' apps/server/src/routes` |
| 4 | 路由里藏的业务规则（可点名两处） | `settings.ts:60` `countOf`（裸 SQL 计数助手）、`settings.ts:63` `seedSummaryOf`（种子摘要规则）、`settings.ts:149-172` 飞轮五项含两条 `EXISTS` 聚合 SQL；`packs.ts:76-121` 导出编排（semver 比对 `:82` → 渲染 `:89` → 落盘 `:91` → 回读 `:102` → 拼 bundle 路径 `:116`） | `sed -n '140,173p' apps/server/src/routes/settings.ts` |
| 5 | CLI 命令编排规模 | `sync.ts` **546 行**、`clean.ts` 421、`scan.ts` 247、`diff.ts` 185、`serve.ts` 129；其中 `sync.ts` 的 `syncAction` 从 `:295` 到 `:461`（**167 行**，占该文件 31%；口径 = 从 `export async function syncAction(` 那一行到下一个顶层 `function statusOf`（`:463`）之前的最后一个 0 缩进 `}`） | `wc -l apps/cli/src/commands/*.ts`；`grep -n '^export async function syncAction\|^function statusOf' apps/cli/src/commands/sync.ts` |
| 6 | TTY 耦合位置（**与直觉不同**） | `commander` **只出现在 `apps/cli/src/index.ts`**，五个命令文件都不 import 它；真正把终端拽进编排函数的是 `sync.ts:9` 的 `@clack/prompts`（`isCancel`／`select`） | `grep -rln 'commander' apps/cli/src`；`grep -rln '@clack' apps/cli/src/commands` |
| 7 | app 侧 import `@openvibe/adapters` 的非测试点 | **2 处**：`apps/server/src/lib/pack-assemble.ts:1`、`apps/cli/src/commands/sync.ts:10`（另 5 个测试文件） | `grep -rn '@openvibe/adapters' --include='*.ts' apps \\| grep -v test` |
| 8 | 同一规则两处实现 + 三套状态词 | `planner.ts:215-226` 用 `{clean, drifted, missing}`；`retirement.ts:40-60` 用 `ABSENT／FOREIGN／IN_SYNC／DRIFT`；`pack-source.ts:169-170` 用 `modified[]` | `sed -n '215,226p' packages/core/src/inject/planner.ts` |
| 9 | 行为零变化的对照基线 | **文档所载（旧值，已被取代，保留见下）**：`Test Files 58`；ubuntu／macOS `538 passed`；win32 `530 passed + 8 skipped` | 见 `DEV_LOG.md` 最新一笔 ⑦ 行（`grep -n 'Test Files 58' DEV_LOG.md`）。**本轮纯文档，未重跑测试，此数不记作本轮实测** |

## 3-9b. 行为零变化的对照基线 · **2026-10-15 重采样（取代 §3-9 第 9 行的 58／538）**

**为什么必须重采样**：FR-6.1 要求 CI 三侧支数与 §3-9 基线**逐字相同**，而 §3-9 记的 58／538 是
2026-10-03 的文档值。此后 M8（agent 回流面）与本轮服务层各自新增了测试，
**旧基线早已过期**——不重采就判「支数逐字」通过是自欺。

### 采样环境（可复算）

| 项 | 值 |
|---|---|
| 采样时刻 | **2026-10-15 12:10 CST** |
| 提交树 sha | **`c2122c2`**（`git rev-parse --short HEAD`；完整 `c2122c286348977ac18872f898b631c248f74aec`） |
| 工作树 | **脏**（`git status --porcelain \| wc -l` = 79，含并行会话产物）——见下方「这条基线的边界」 |
| 工具链 | vitest **3.2.7**，node **v26.4.0**，darwin-arm64 |
| 平台 | **仅 macOS/darwin 一侧**；ubuntu 与 win32 **本轮未采**（见「未验面」） |

### 命令原文与实测值

**扫描根**：仓库根 `/Users/duke/Documents/OpenVibe`，扫描范围由根 `vitest.config.ts` 的
**四个 project** 决定（`unit` / `integration` / `cli` / `web`），各自 `include` 根见该文件。
**未指定任何目录参数**——即不缩到某个子目录跑。

总数（**连跑 5 轮，5 轮全同**）：

```
pnpm test
# 第 1..5 轮，每轮逐字相同：
#   Test Files  72 passed (72)
#        Tests  673 passed (673)
```

分侧（**逐 project 单跑**）：

```
npx vitest run --project=unit          #  Test Files  36 passed (36)   Tests  326 passed (326)
npx vitest run --project=integration   #  Test Files  17 passed (17)   Tests  172 passed (172)
npx vitest run --project=cli           #  Test Files  15 passed (15)   Tests  156 passed (156)
npx vitest run --project=web           #  Test Files   4 passed (4)    Tests   19 passed (19)
```

**两个总数对得上**（这就是本次采样的自洽判据，不靠印象）：
文件 `36 + 17 + 15 + 4 = 72` ＝ 总数的 72；
测试 `326 + 172 + 156 + 19 = 673` ＝ 总数的 673。**两式均逐字相符**。

### 新基线（FR-6.1 引用这一组数）

| 侧 | Test Files | Tests |
|---|---|---|
| `unit` | 36 | 326 |
| `integration` | 17 | 172 |
| `cli` | 15 | 156 |
| `web` | 4 | 19 |
| **合计（`pnpm test` 实测）** | **72** | **673** |

### 旧基线的处置（**不回改，留档**）

- **旧值 58 文件／538 支（win32 记 530+8 skipped）** 仍留在 §3-9 第 9 行，标注为「已被取代」。
  按本仓库「日志不回改」纪律**保留原样，不删除、不改写**。
- **取代关系**：旧值采样于 **2026-10-03**（提交树 `54789b8` 之后的改动面），**于 2026-10-15 12:10 CST
  在提交树 `c2122c2` 上被本节取代**。取代原因是 M8 与服务层两轮各自新增测试，使 58／538 失去判据效力。
- **取代的净变化**：58 → 72 文件（**+14**）；538 → 673 支（**+135**）。
  其中本轮（bodyLimit 按端点放宽）净增 **+3 支**（`agent.api.test.ts`：11 → 14）。
- ⚠️ **旧值与新值不可直接相比**：旧值是 **58／538** 且带 win32 分叉（530+8 skipped），
  新值是 **72／673** 且**只采了 macOS 一侧**。FR-6.1 说「CI 三侧」——
  **本次只落实了其中一侧，另两侧的支数未采**（见「未验面」）。

### 这条基线的边界（必须对读者讲清，否则会被当成「已完全落实 FR-6.1」）

1. ⚠️ **基线采在脏工作树上**，且其中含**并行会话的未跟踪文件**
   （`git status` 里的 `?? packages/core/src/inject/consistency.ts` 与 `consistency.test.ts` 等）。
   换言之 **673 里有相当一部分不来自提交树 `c2122c2`**。
   **本轮实测到一个直接证据**：采样途中 `consistency.test.ts`（并行会话在写）被改动过一次，
   总数当轮就从 **665 变到 673**（`71 → 72` 文件），且该文件一度出现
   **隔离跑时 2–5 支判红、其后连跑 5 次全绿**的不稳定态。
   ⇒ **在并行会话合流、文件入库之前，本基线只能作为「当前工作树」的对照数，不能作为 CI 的门禁数。**
2. **未删任何用例**：本轮只**新增**测试，未删改既有断言（FR-6.1「只许移动位置，不许增删改断言」在本轮**未被违反**，
   但 `consistency.test.ts` 等文件由并行会话增删，不在本轮可核范围）。

**三个术语在本文件里的定义**（避免「服务层」被读成任意一种分层）：

- **编排（orchestration）**：一次用户意图跨多个 repo／多个纯函数的固定次序与错误处理。判据：这段代码换个传输方式（HTTP → 终端）仍需一字不改，它就是编排。
- **传输无关**：不出现 HTTP 请求／响应对象、不出现终端原语（`@clack`、`readline`、TTY 探测）、不退出进程（`process.exit`）。
- **deps 注入**：外部能力作为参数传入而非 import。既有先例两处：`composer.ts:167 composePack(resolved, deps: ComposeDeps)` 与 `pack-assemble.ts:39 export const packAdapters: AdapterBundle = { planMainFiles, coveredPlatforms }`。

## 4. 功能需求（FR）

- **FR-1 四服务文件与边界**：`services/packService.ts`（组包 → 预览 → 导出 → 校验）、`services/injectService.ts`（计划 → 决策 → 应用 → 核验）、`services/growthService.ts`（信号 → 阶段判定 → 建议）、`services/statsService.ts`（本机统计聚合）。
  - FR-1.1 每文件对外只暴露「一次用户意图」级的入口函数（如 `exportPackWithRecord(...)`、`planAndApply(...)`），**不建 class、不建 container**，与既有 core 的函数式出口一致。
  - FR-1.2 入口函数签名里必须显式列出 `deps`（repo 工厂、时间源、外部能力）。禁止在函数体内 `new XxxRepo(db)` 之外的隐式全局取用。
  - FR-1.3 服务文件不得出现 `import ... from 'node:child_process'`、`@clack/*`、`fastify`、`@fastify/*`、`commander`（由 FR-4 的闸强制，不靠自觉）。
  - FR-1.4 `growthService`／`statsService` 的**可实现内容受 §6.3 约束**，本轮不得写空壳并声称已落。
  - FR-1.5 出口对接：`packages/core/src/index.ts` 增 services 出口段；只**加**不改既有出口名（改名属 B，见 §6.5）。
- **FR-2 一致性比对合一**：把 §3-8 的三处 sha 比对收成一处 `verifyAgainstLock(declared, readDisk)`，返回**单一状态词表**；三个既有调用点改为映射到自己的旧形态。
  - FR-2.1 合一只合「比对规则」：排序口径（`compareCodeUnit`，三处已有两处用了它，`pack-source.ts` 那处需对齐）、缺失判定、`managed` 标志的处理必须逐字保持既有语义。
  - FR-2.2 **app 侧可见输出不变**：CLI 的 `IN_SYNC`／`DRIFT` 文案、`planRows` 的行形态、`--force` 语义不变。合一的是内部函数，不是用户词汇。
  - FR-2.3 状态词表统一方案见 §8.2 待裁②（本文件不替 owner 定词）。
- **FR-3 route／command 退化**：路由 = 解析参数 → 调 service → 序列化；命令 = 解析旗标 → 调 service → 渲染。
  - FR-3.1 可判定口径：`apps/server/src/routes/*.ts` 里 `new [A-Z]*Repo(` 与 `db.prepare(` 的命中数归零（**组合根除外**——`bootstrap.ts`、路由注册处持有 `deps` 的装配点仍合法）。
  - FR-3.2 `settings.ts:60 countOf`、`:63 seedSummaryOf` 与 `:149-172` 的聚合 SQL 整体迁入 `statsService`；`packs.ts:76-121` 的导出编排整体迁入 `packService`。这两处是本 spec 唯一**已点名、已实证**的搬迁对象，其余按 FR-3.1 的命中数自然收敛。
  - FR-3.3 `sync.ts` 的拆分线：终端交互（`@clack` 的 `select`／`isCancel`）**留在 app 侧**，作为 `AskFn` 传入。既有类型 `sync.ts:84 export type AskFn = (file: InjectPlanFile) => Promise<InjectDecision>` 已经是正确形制——服务层接受它，不 import 它。
- **FR-4 两条新规则，且必须写清各自用哪种 eslint 形制**（**此处更正分析文**：分析文 §4.10 说「继续用 zone 钉住，与现有 R1–R4 同法」，但 `import-x/no-restricted-paths` 的 zone 只描述**本地路径**之间的依赖，表达不了「不得 import fastify／@clack」。所以是 **1 条 zone + 1 个 `no-restricted-imports` 块**，不是「新增 2 条 boundaryZones」。）
  - FR-4.1 **新 zone（禁向上依赖）**：`{ target: './packages/core/src/services', from: ['./packages/core/src/repos', './packages/core/src/db'], message: 'R5: repos／db 是下层，禁止回调服务层' }`。这条是纯路径关系，zone 能表达。
  - FR-4.2 **新 `no-restricted-imports` 块（传输无关）**：`files: ['packages/core/src/services/**/*.ts']`，patterns 覆盖 `fastify`、`@fastify/*`、`commander`、`@clack/*`、`node:http`、`node:https`、`node:net`、`node:readline`、`node:tty`。**必须含子路径形式**——`eslint.config.js:44` 的既有注释已写明理由：「含子路径（`@openvibe/x/*`），否则 exports 子路径导出会绕过 R4」。照 `r4NoCrossApp`（`:39-54`）写法扩展，不另起一套。
  - FR-4.3 两条规则都进现有 `pnpm lint`，**不新建脚本、不新建 CI job**。
- **FR-5 R2 不得为服务层让路**（红线，写成可判）：
  - FR-5.1 `packages/core/**` 对 `@openvibe/adapters` 的 import 命中数**必须保持 0**：`grep -rn "@openvibe/adapters" packages/core/src --include='*.ts' | grep -v test | wc -l` → `0`。
  - FR-5.2 需要平台产物路径时（§3-7 的 `ADAPTER_MAIN_PATH`）经 `deps` 注入，形制照 `pack-assemble.ts:39`。既有 zone（`eslint.config.js:22-26`，message 原文「R2: core 只依赖 packages/shared（编排发生在 apps/server）」）一字不改。
  - FR-5.3 若实现中发现「非破 R2 不可」⇒ **停手并回报**，这正好命中分析文 §7.2 反例 5，按 §6.1 的处置走。
- **FR-6 「行为零变化」的判定口径**（不是主观陈述；四条外部凭据缺一不判过）：
  - FR-6.1 CI 三侧 `Test Files`／`Tests` 支数与 §3-9 基线**逐字相同**。**基线已于 2026-10-15 重采样，见 §3-9b：72 文件 / 673 支（macOS 一侧实测）**，取代 §3-9 的旧值 58／538。用例只许移动位置，不许增删改断言。
    - ⚠️ **本条尚未完全闭合**：§3-9b 只采了 macOS 一侧，**ubuntu 与 win32 两侧支数未采**；且基线采在含并行会话未跟踪文件的脏工作树上。「CI 三侧逐字」因此**仍是未验面**，不是已通过。
  - FR-6.2 `tests/golden/` 零 diff（本项不产新字节；若 diff 非零即为实现出错，不是「更新基线」）。
  - FR-6.3 `bundle:check` 入口不减余量（现基线见 `entry-budget.md` §3）。
  - FR-6.4 CLI 输出既有断言（`apps/cli/test/*`）逐字绿。

## 5. 输入 / 输出

| 方向 | 内容 | 形态 |
|---|---|---|
| 入 | server 路由的已解析参数 + `deps`（`db`、token、时间源） | 纯对象，无 `FastifyRequest` |
| 入 | CLI 命令的已解析旗标 + `AskFn` + 磁盘读写器 | 纯对象 + 函数，无 `@clack` 类型 |
| 出 | 领域结果对象（`RenderedPack`／`InjectPlan`／`ConsistencyResult`／`FlywheelStatsOut` 等既有类型） | **不新增对外类型即不触 API 契约**；服务层内部分享的 `deps` 类型属内部面 |
| 出 | 错误仍以既有 `AppError`／`SourceError` 的 code 集合表达 | code 集合**不得增删**（增删属 B 级：它改变调用方可观察行为） |

## 6. 边界与异常

- **6.1 分析文 §4.10 的现状句部分不成立，本 spec 据实改写**。原文：「同一规则两处实现（包渲染：`server/lib/pack-assemble.ts` ↔ CLI `pack-source.ts verifyPack`）」。实测：`verifyPack` 只存在于 `apps/cli/src/pack-source.ts:132`（全仓 3 个命中全在该文件），`pack-assemble.ts` 里没有任何 verify 函数——两者是**渲染侧与校验侧的分工**，不是同一规则写两遍。真正的「同一规则两处」是 §3-8 那三处 sha 比对。**因此本项采分析文 §7.2 反例 5 已经准备好的处方**：「撤回 D9 中『合一』的部分，只做把规则搬出 route 文件」，并把「合一」的范围收窄到 FR-2 那三处有实证的重复。这不推翻 D9，是给它划定证据支持的范围。
- **6.2 反例 5 的触发条件原样采**：搬迁 diff 中出现 **>3 处** `if (isServer)`／`if (isCli)` 型分支 ⇒ 判定「server 与 CLI 的差异是真实差异」，本项降级为「只做搬出，不做合一」，并回报 owner。
- **6.3 两个服务此刻没有可实现的内容**（诚实登记，别写成已落）：`statsService` 的落点是 D2 本机台账（RF1 的 1-5，**未开工**），`growthService` 的落点是 CP 阶段机（RF2 的 2-1…2-7，**未开工**且硬阻于 §10-1 五人走查）。⇒ 本轮可选三种处置，见 §8.2 待裁①。共同底线：**建空文件不算落地**，spec 里也不得把四服务写成「已完成」。
- **6.4 `apps/cli/src/index.ts:405` 的 `counts` 键名隐式约定**属 `entry-budget.md` FR-7（`SYNC_STATES` 与 `INJECT_STATUSES` 合一），本 spec 不重复立项；两处若同批做，顺序是 entry-budget 的状态合一在前，因为服务层签名要用它。
- **6.5 出口面改名的判级**：只增 services 出口属 **C**；若为服务层重命名任何既有 core 出口属 **B**（它改变三个 app 的 import 面）。
- **6.6 共享工作树归因**：本轮实测 `git diff --name-only -- . ':!docs' ':!DEV_LOG.md'` 有 **33 个非本会话改动文件**（含 `apps/server`、`apps/cli`、`packages/*` 内文件）。开工前必须逐文件 `git diff -U1 -- <file>` 核归属；**本 spec 的 FR-3.2 点名的 `settings.ts`／`packs.ts`／`sync.ts` 若已带他人未提交行，须先与并行会话对齐再动**。
- **6.7 组合根不动**：`eslint.config.js:133-136` 有一段既有裁定注释（`serve` 是 dev-plan §1.2 启动序列的组合根，全仓仅 `apps/cli/src/commands/serve.ts` 被放行 import server）。服务层引入**不得触碰这段放行**，也不得把 `bootstrap.ts` 的步骤归属重排。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 | 测试 ID |
|---|---|---|---|
| a | 四服务（或待裁①定下的实际子集）各有直接单测，且测试文件位于 `packages/core/src/services/*.test.ts` | 不 import fastify／commander／@clack 即可跑通 | `UT-SVC-01` |
| b | 服务层单测在 core 包内独立运行，不起 server、不起子进程 | `pnpm -F @openvibe/core test` 覆盖到 | `UT-SVC-02` |
| c | **变异腿**：临时在某 `repos/*.ts` 里 import `../services` ⇒ lint 必判红，撤销后必判绿 | 命中 FR-4.1 的 message 文本 | `LINT-ZONE-01` |
| d | **变异腿**：临时在 `services/*.ts` 里 import `@clack/prompts` ⇒ lint 必判红 | 命中 FR-4.2 | `LINT-ZONE-02` |
| e | **变异腿（绕过面）**：`import '@clack/prompts/dist/x'` 子路径形式同样判红 | 证明 patterns 未漏子路径 | `LINT-ZONE-03` |
| f | FR-2 合一后，同一输入经三条既有路径（planner／retirement／pack-source）得到**语义一致**的比对结果 | 三分支表逐行断言，含「磁盘缺失」「managed=false」「sha 不符」三态 | `UT-SVC-03` |
| g | server 路由既有集成测试**未改断言逐字绿**（API 形状零变化） | `apps/server/test/*.test.ts` 的 git diff 为空 | `IT-SVC-01` |
| h | CLI 既有测试未改断言逐字绿（输出与退出码零变化） | `apps/cli/test/*.test.ts` 的 git diff 为空 | `UT-SVC-04` |
| i | `tests/golden/` 零 diff | `git status --porcelain -- tests/golden` → 空 | `GOLD-SVC-01` |
| j | `bundle:check` 入口余量不减 | 现测 ≥ 基线 | `BUILD-SVC-01` |
| k | R1–R4 既有 zone 与三个 `r4NoCrossApp` 块**未被删改**；FR-5.1 的 core→adapters 命中仍为 0 | `eslint.config.js` diff 只含新增；grep 计数 0 | `LINT-ZONE-04` |
| l | FR-3.1 的收敛判据达成 | `grep -rnE 'new [A-Z][A-Za-z]*Repo\\(' apps/server/src/routes \| wc -l` → 0（组合根除外，且**除外项须逐个点名并写明为何是装配点**） | `UT-SVC-05` |
| m | FR-6 四条凭据齐备（CI 支数逐字、golden 零 diff、bundle 不减余量、CLI 断言未改） | 缺一条即判**不通过**，不得以「等价重构」替代 | `REV-SVC-01` |

- **7.7 未验证面**（负向登记，不得读成已通过）：① Windows 终端下服务层与 `@clack` 的边界是否真能隔离（本轮只静态读代码，未在三平台跑过交互）；② 多一层函数调用的性能影响（未测，预判可忽略但不构成结论）；③ FR-4 两条规则在 CI 三平台的实际执行位置与耗时（未测）；④ `statsService`／`growthService` 的有效实现（阻于 §6.3，本轮无法验收）。

### 7.8 验收条目的实测状态（2026-10-15 实跑，DEV-0098）

| # | 实测 | 证据 |
|---|---|---|
| a | ✅ | `services/` 下 4 支单测共 **36 支**：`packService.test.ts` 7 · `injectService.test.ts` 11 · `agentService.test.ts` 8 · `contextService.test.ts` 18。**都不 import fastify／commander／@clack**（这是 R5 新规则正在守的东西） |
| b | ✅ | 全部在 `packages/core` 内跑，不起 server、不起子进程 |
| c/d/e | ✅ | **三条变异腿逐条实跑**，各命中 FR-4.1 的 zone message 与 FR-4.2 的 `no-restricted-imports`；子路径绕过面（`@clack/prompts/dist/x`）同样判红；撤销后判绿 |
| f | ❌ **未做** | FR-2 的 `verifyAgainstLock` 合一本轮未做，`UT-SVC-03` 无对应测试 |
| g | ✅ | `apps/server/test/packs.api.test.ts` **18/18 逐字绿**，`git diff` 为空 |
| h | ✅ | `apps/cli/test/` **全部零改动**；涉 sync 的 6 个文件 **99/99 逐字绿**（含真子进程 CLI 契约测试） |
| i | ✅ | `git status --short -- tests/golden/ content/seed/` → 空 |
| j | ✅ | 入口 267.27 kB ≤ 300 kB，余量**未减** |
| k | ✅ | R1–R4 既有 zone 与三个 `r4NoCrossApp` 块**一字未改**（`eslint.config.js` diff 只含新增）；`core→adapters` 命中 **0** |
| l | ❌ **未达成** | FR-3.1 收敛判据**本轮未达成**：`apps/server/src/routes/` 的 `new [A-Z]*Repo(` ＋ `db.prepare(` 命中数仍为 **19**。已搬的只有 FR-3.2 点名的导出编排（`packs.ts`）与决策规则（`sync.ts`）；**`settings.ts` 的聚合 SQL 指向 `statsService`，而该服务随 RF1-5 一起未开工**，故那一处不能夹带 |
| m | 🟡 **部分** | 四条凭据里 ①②④ 齐备（golden 零 diff、bundle 不减余量、CLI 断言未改）。**①「CI 支数逐字」的基线已于 2026-10-15 重采样（§3-9b：72 文件 / 673 支，分侧 36/17/15/4 与 326/172/156/19，两式均与总数逐字相符，连跑 5 轮稳定）**，取代旧的 58／538。**但本条仍未闭合**：只采了 macOS 一侧，ubuntu／win32 两侧未采；且基线采在含并行会话未跟踪文件的脏工作树上 |

> **⚠️ FR-4.1 的 zone 方向勘误（2026-10-15 实测发现，spec 原文有误）**
>
> FR-4.1 写的是 `{ target: './packages/core/src/services', from: ['./packages/core/src/repos', './packages/core/src/db'] }`。
> 但 `import-x/no-restricted-paths` 的语义是「**target 里的文件不得 import from 里的路径**」——
> 照抄实测会得到**恰好相反**的规则：禁止服务层 import repos（首次实跑即报 **14 处错**，全部在 `services/` 内）。
> 那会把服务层打死，因为服务层的本职就是编排 repo。
>
> spec 自己写的 message「repos／db 是下层，禁止回调服务层」才是对的语义：**禁止下层回调上层**。
> 故正确写法是 `target: [repos, db]`、`from: [services]`，与 R1–R4 全部五条 zone 同一形制。
> **已按 message 语义实现**，spec 正文的字面配置待下次改版时同步订正。

## 8. 依赖

- **8.1 与既有文档的关系**：本项是 `design §1.1`／`dev-plan §1.1` 分层规则的**增补**（新增 R5），不是替代。落地时须同步：dev-plan §1.1 规则表加一行、`eslint.config.js:6-10` 的 R1–R4 注释头补 R5。**这两处一动，本项判级按 §0.3 升 B**（见 §8.2 待裁③）。
- **8.2 待裁清单**（✅ **2026-10-14 owner 授权逐条裁决，三项全部闭合，本 spec 升 v1.0 后构成开工依据**）：

| # | 待裁项 | 候选与推荐 |
|---|---|---|
| **①** | `growthService` 与 `statsService` 本轮建不建？它们的落点（1-5 台账、2-1 阶段机）都未开工 | **(a) 本轮不建这两个服务**——但**不是「只落两服务」，是「落三服务」**：(b) 与 (c) 同样被否（(b) 留下「四服务已建」的假象，(c) 把 1-5 的 J7 前置绕过去）。**⚠️ 修正了选项本身的措辞**：本项原写「本轮只落 `pack`＋`inject` 两服务」，那是 2026-10-03 写 spec 时的三服务设想；**owner 2026-10-14 已另裁「FR-1 增列 `agentService` 作第五个服务」**（登记 PRD **D34** 同批、`dev-plan-v0.2.1.md` §5.2 前置 A）。⇒ **本轮实际落三个服务：`packService` / `injectService` / `agentService`**；`growthService` 与 `statsService` **本轮不建**，随 RF1-5／RF2-1 同批。`agentService` 之所以不属「无内容可实现」那类：它的落点是 M8 三张表，而那三张表**已在 `0007` 落地**（实测 `0007_local_events_and_agent_bridge.sql` 四表齐） |
| **②** | 三套状态词收成哪一套（FR-2.3） | **(a) 沿用 `retirement.ts` 的四态**（`ABSENT`／`FOREIGN`／`IN_SYNC`／`DRIFT`，实测 `retirement.ts:7` 的 `RETIREMENT_STATES` 就是这四个）。**理由**：`FOREIGN`（`retirement.ts:53` —「`!managed` 或 `isOpenVibeInternal`」时命中）表达了 planner 侧没表达的那一类「这个文件在盘上，但不是我们管的」；另起一套中性词会让四态与二态并存却互不相认。**判级复核结论：本项判 B，不是 C** —— (a) 要求 planner 侧新增「非受管」判定，属 `dev-plan §0.3` 定义的**可观察行为变化**（planner 的输出多一态、既有断言要跟着动），不能按「纯内部重构」留在 C。**代价已知**：B 级意味着要 DEV_LOG 登记 ＋ spec 版本行，且 planner 的既有测试不能「一字不改」 |
| **③** | 新增 R5 进 dev-plan §1.1 规则表的判级 | **B**。理由：动的是**分层规则表本身**（`dev-plan §1.1` 的 ASCII 依赖图 ＋ `eslint.config.js:6-10` 的 R1–R4 注释头），不是实现细节。**连带结论：本 spec 整体判 B** —— 判级由**最高的那一档**取，不是逐条取；即便 ① 与 FR-1～FR-5 本身多为 C 级实现面，② 的可观察行为变化与本条的规则表改动已把整项抬到 B |

- **8.3 与其他 RF 项的依赖**：本项是 1-2（写盘自证）、1-3（sync 起始核验）、1-5（本机台账）的**写入点前置**——分析文 §5「写入点集中在服务层（D9）而非散落各处，这正好是 D9 的第一个收益」。反向依赖：`entry-budget.md` FR-7 的状态词合一是本项服务签名的输入，若同批做须先合状态词。
