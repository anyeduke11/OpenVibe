# SPEC · M7 团队协作（v1.0：三裁已落，含八段式 FR）

| 项 | 值 |
|------|------|
| 模块 | M7 团队协作（PRD 3.2-M7，`docs/PRD.md §3.2-M7` 三行能力） |
| 优先级 | Phase 2（PRD 3.3 + 第 8 章 P2 行）；表内三行的 P1 是模块**内部**相对优先级，不构成进 MVP 的承诺 |
| 上游 | PRD 3.2-M7、PRD §3.1 模块总览的「M7 横切所有模块」依赖关系行、design §11 安全设计的「只听本地」设定 |
| 关联任务 | **T13**（本模块申请号；`m4-playbook.md` 头部格已声明它开工时申请 T12，两处不撞）。**tasks.md 的登记尚未落**——该文件此刻有并行会话未提交改动，等它落库后单独一笔把 T13 行写进 `docs/tasks.md`，本行是预留声明不是已登记 |
| 版本 | **v1.0（2026-10-01，owner 三裁落定：P-1 = B+C、P-2 = c、P-3 = ii）**，由 v0.1「架构前提裁定单」升版（§0.3 B 级：owner 后改 + 本版本行）。§4 由「有意留空」改为八段式 FR-1–FR-7。**同版纠正一处 v0.1 的假事实**：原 §3 P-2 候选 c 写「`draft → published` 已是既有形态」——实况词表是 **`draft` / `active`**（`packages/core/src/db/migrations/0001_init.sql:66` 的 terms CHECK、`:13` 的 prompts CHECK 三值含 `deprecated`；zod 侧 `packages/shared/src/constants.ts:51-52`），**全仓无 `published` 这个词**（`grep -rn "published" packages/shared/src/constants.ts` → 0）。**另挂两条待确认**（§8.2-①②）：评审对象粒度 owner 未单列、P-3=ii 的目的端解释 |

---

## 1. 背景：为什么 v0.1 不写 FR

- PRD 3.2-M7 给的是**能力清单**（多用户与角色 / PR 式评审 / 共享库与使用统计），不是可判定需求：三条都没有验收口径，直接写进 FR 只能写成「支持多用户」这类无法判 pass/fail 的句子（§0.4 第 3 条禁止）。
- 更硬的一条：这三条与产品**根设定**冲突。现形态是单进程本地服务 + 单文件 SQLite + 只听回环（证据见 §2），「多用户」在此架构下要么服务端化（推翻本地优先与安全设定）、要么走文件同步（与 M6 双向同步撞面）。**先有架构裁定，才谈得上 FR**——这就是 v0.1 那份裁定单的用途，本节起转为背景。
- 现状纠偏（v0.1 内我自己写错又推翻的，留着因为它示范了这类错法）：曾把 M7 读成「全库零提及」。**否证**——按文件计数（`grep -rc 'M7' docs/specs/*.md`，采样 sha `6246cb7`）= 四份兄弟 spec `m1` **1** / `m3` **1** / `m5` **2** / `m6a` **1**，另加 `m4-playbook.md` **6** 与本文件自身；四份兄弟 spec 的 Out 格各挂一个名字：`m1-prompt-library.md §2 范围 Out 栏`「团队评审流」、`m3-glossary.md §2 范围 Out 栏`「社区提案-审核流」、`m5-project-flow.md §2 范围 Out 栏`「多人协作 / 指派（`assignee` 字段预留不启用）」、`m6-standard-pack.md §2 范围 Out 栏`「团队包共享与评审」⇒ **M7 的「一」实际是四条不同能力**。另一侧的真空同样实测：`grep -n 'M7' docs/decisions.md` → v0.1 时点 **0**（全库零裁定记录），现由该表 ㉓ 行闭合。
- 附带一条防误读（同样重要）：`m5-project-flow.md §2 范围 Out 栏` 的「`assignee` 字段预留」**不是** schema 事实——`grep -rn 'assignee' packages apps | wc -l` → **0**，代码里从无此字段，它只是命名占位。读到「字段预留」先 grep 代码。

## 2. 现状架构设定（本 FR 全部建立在这张表上）

| # | 约束 | 出处（实测） | M7 的处理 |
|---|---|---|---|
| C1 | server 只绑回环，非回环地址直接拒绝 | `apps/server/src/bootstrap.ts:48`（`LOOPBACK_HOSTS`）、`:83`、`:116`、`:121`、`:174`；`docs/design.md §11 安全设计` 第 1 条「只听本地」 | **不动**。共享走文件，远端连接一个也不开 |
| C2 | `Host` / `Origin` 双校验防 DNS rebinding 与恶意网页 | `docs/design.md §11 安全设计` 第 1 条及其 Origin 白名单子项 | **不动**。P-1 未选 A，故无需拆闸 |
| C3 | 单次 token，未传则每次启动随机生成 | `apps/server/src/bootstrap.ts:141`（`randomBytes(32)`） | **不动**。署名（FR-1）**不是**凭据，两者不同物 |
| C4 | 单文件 SQLite + WAL + `busy_timeout=5000` | `packages/core/src/db/index.ts:29`、`:31`；WAL 断言腿 `packages/core/src/db/core-db.test.ts:37` | **不动**。共享不走同一份可写库 |
| C5 | **实体表 16 张，零** user / role / member / session / account | 口径：migrations 的 `CREATE TABLE` 唯一名 **17** 个减去 `0004_skill_remote_sources.sql:5` 的重建临时表 `skills_new`；身份类 grep **0** 命中 | 仍**不建身份表**。M7 只加一张 `review_events`（署名写进它的列，见 FR-3） |
| C6 | 资产对外只有**只读产物**一条通道：组包 → CLI 注入 → lock | `packages/core/src/pack/composer.ts`、`packages/core/src/inject/lock.ts:27` | 复用其**形制**但不复用其通道：团队共享走资产源侧 JSON 文件（FR-4），注入产物与 lock 一律不改 |
| C7 | Web 端口锁 5144 + `strictPort` | `apps/web/vite.config.ts:24-28`、`:34-36` | **不动** |

## 3. 三处前提：裁定结果与其派生后果

### P-1 「多用户」的载体 → **owner 裁：B + C 叠加**
- B 文件级共享：每台机器各自本地服务，共享的是**资产文件**（git 仓库 / 云盘目录），落形制见 FR-4。
- C 本机署名：写操作留**署名**痕迹，支持「谁改的」，不支持「并发多人」。
- **未选 A（服务端化）** ⇒ C1/C2/C3/C4 四道设定全部原样，本模块不触发 A 级流程。
- **未选 D（裁掉）** ⇒ PRD 3.2-M7 三行保留，但**其措辞要与本裁定对齐**：「多用户与角色」在 B+C 下 = 「多人各自机器 + 署名留痕，无角色」，「角色」一词在产品里不存在（§6.1 明写天花板）。改判建议见 `DEV-0076`，本文件不代改 PRD。
### P-2 「先审后入」的载体 → **owner 裁：c（两段态 + 本机署名）**
- 形态：复用既有 `draft` / `active` 两态（纠正：不是 `published`，见头部版本行），把「谁能置 `active`」表达为一条**本地动作 + 署名事件**，而非权限位。
- **未选 b（借力外部 PR）** ⇒ 不新增「导出成 PR / 消费 PR 状态」的通道；评审发生在 OpenVibe 内。
- **未选 a（内建评审流）** 的边界要说清：c 是「两态 + append-only 事件」，**不是**评审人队列 + 工作台 UI 那套状态机（那属 a，且它依赖 P-1=A/C 的更强身份）。
- 评审对象粒度：owner 未单列 ⇒ 本文件按 **单条资产** 定形（FR-3.3），并把「变更集视图」作为导出前的核对手段；这一条要 owner 确认（§8.2-①）。
### P-3 「成员使用统计」的数据源 → **owner 裁：ii（注入侧回传聚合）**
- 落地形制（FR-6）：**目的端 = 团队共享仓库里的 append-only 计数文件**，由 CLI 在注入成功后写，成员 pull 后本地聚合。这样 ii 的「跨机器回传聚合」成立，而**不新开网络路径、不拆 C1/C2、不动 D13 匿名遥测的任何承诺**。
- **未选 i** ⇒ 纯本机统计不再是终态，但 FR-5 保留本机聚合作为 pull 前的可见面（同一份数据两种呈现）。
- 若 owner 本意是走 D13 那条匿名遥测通道出网 ⇒ **不是本 FR**，那是 A 级：要新增第四类白名单事件（`packages/shared/src/constants.ts:71` 现为三值）、要放开「五段之外一律不进请求体——路径、文件内容、机器标识不带出」（`packages/shared/src/schemas/settings.ts:149-157`），且这条承诺 README 与设置页对外公开过 ⇒ 须 `schemaVersion +1` + 新 D 编号（§8.2-②）。

## 4. 功能需求（FR）

### FR-1 本机署名
1. 署名 = `config.json` 新增一个非空字符串字段（上限 32 码点，与 `LIMITS` 同族纪律），首次使用团队功能时要求设置。**它是自陈标签，不是凭据**：C3 的单 token 机制不因它改变，网络面一个字节也不因它放开。
2. 署名历史不可追改：改名写一条 `review_events`（`kind='identity_renamed'`），历史事件里的旧署名**原样留着**——否则使用统计可被回填篡改，这是本模块唯一的数据可信性支点。
3. 不提供任何「按署名限制操作」的能力（§6.1）。

### FR-2 评审态贯通
1. 复用既有词表，**不新增第三态**：terms `draft|active`（`0001_init.sql:66`）、prompts `draft|active|deprecated`（`:13`）。`deprecated` 不参与评审流转，只作下线标记。
2. skills 侧现**无** `status` 列（口径：`grep -rn "status" packages/core/src/db/migrations/*.sql` → **6 行 / 4 张表**——prompts `:13`、terms `:66`、projects `:92`、tasks `:114` 是列定义，`0001_init.sql:18`/`:117` 是两条索引行不是列；无 skills）⇒ 新迁移加 `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active'))` + 同形索引（对齐 `idx_prompts_status`，`:18`）。
3. 存量 backfill 判据必须写进迁移报告（迁移后 `draft`/`active` 各多少行）。**seed 一侧已核，v0.1 挂的「导出首轮为空」担忧被否证**：三份 seed 文件的条目**都不带 status 字段**（`content/seed/` 实测 = prompts 21 / terms 109 / flow-templates 3 条，`'status' in item` 命中 **0/21、0/109、0/3**；`grep -rn 'status' content/seed/` 只有 **1** 行命中，且那是某条 prompt 正文里的 `git status` 字样，不是字段），但**导入路径硬编了 active**——`packages/core/src/db/seed.ts:124`（terms）、`:178`（prompts）、`:193`（flows）三处 create 均传 `status: 'active'`。⇒ seed 资产一进库就是 `active`，FR-4 的导出首轮**不为空**；`DEFAULT 'draft'` 只作用于本机新建与 skills 迁移回填，不会把精选内容挡在共享之外。
4. 只有 `active` 资产参与团队导出；`draft` 只在本机台账可见。

### FR-3 评审动作与署名留痕
1. 新表 `review_events(id, kind, asset_kind, asset_id, from_status, to_status, actor, at, note)`，**只 INSERT**：无 UPDATE/DELETE 路径，迁移与仓储层都不给（判读见 §7.2）。
2. 状态跃迁的**唯一入口**是一个 transition 函数（服务端一处），它同写资产列 + 写事件行，并拒绝同态自转（`draft→draft`）。除它之外不得有任何路径能改这三张表的 `status`。
3. **粒度 = 单条资产**（承 §3 P-2）。理由：status 本就挂在单条资产上；若另建「组包级审批」就需要第二套状态机，撞 FR-2.1 的「不新增第三态」。
4. 导出前给**变更集视图**：本次将进入共享的全部资产 + 各自最近一条事件，供人在团队仓库里逐条否决。这是 c 形态下「PR 式评审」的全部剩余形态，不假称它有 diff 评审能力。

### FR-4 团队共享 = 文件级（复用 `content/seed` 同形 JSON）
1. 导出目标：`<teamDir>/openvibe-team/{terms,prompts,skills}.json` + 一个 `meta.json`（`exportedAt` / `exportedBy`(署名) / `schemaVersion` / 每文件条数）。**字段形制与 hash 纪律沿用 `docs/specs/seed-content.md`**，不发明第二套资产格式。
2. 导入走**既有通道**（M1 prompts 导入 / M3 terms / M2 skills 登记），M7 不新建解析器、不新建合并算法；同名冲突沿用各处既有语义（同名并入版本线 / `seedHash` 比对）。
3. 传输由用户负责（git、云盘、拷 U 盘都行）：OpenVibe 只在 `<teamDir>` 里读写文件，**不联网**（守 C1/C2/C6）。
4. 空集合不产文件（与 `m4-playbook.md` 的 `PLAYBOOKS.md` 同律）；导出是幂等的：同库同态重导 ⇒ 字节相同（`cmp` 可验）。
5. 与 M6 的边界：M6 的 `sync`/`clean` 处理**项目内产物**，本 FR 处理**资产源**；两个「同步」不同物，UI 与文档都不得共用一个词。

### FR-5 本机统计（pull 前的可见面）
1. 数据源全部现成：M5 项目/任务/日志、M6 注入 lock、M2 台账、`review_events`；聚合走既有本地 SQL（与 `apps/server/src/routes/settings.ts` 的飞轮五项同法，零新埋点）。
2. 呈现复用既有卡片位，不新开页面。

### FR-6 注入侧计数回传（P-3 = ii 的落地）
1. 目的端：`<teamDir>/openvibe-team/usage/<署名>.jsonl`，一行一次注入事件，**固定六键** `{at, project, pack, packVersion, target, platform}`；多余键一律拒（严格解析）。
2. 生成点：CLI `sync` 成功之后写一行；**未配置 `<teamDir>` ⇒ 静默不写、不报错、不建目录**。写文件不新增网络路径。
3. 聚合：成员 pull 团队仓库后本地读全部 `<署名>.jsonl`，得「谁在哪个项目注入了哪个包几个平台」。
4. **本 FR 不使用、也不改动 D13 匿名遥测**：三类白名单（`constants.ts:71`）、五段体（`settings.ts:149-157`）、默认关与单出口函数 `reportEvent()`（`apps/cli/src/telemetry.ts:28`，「关闭即返回——不写队列、不外联」见 `:7`）全部原样保留。§7.10 用一条断言把这件事钉住。

### FR-7 明确不做（负向 FR，防范围回涨）
不提供：多用户登录、角色与权限、并发写合并、中心服务、远端读取、评审人队列与通知、按署名的配额。**任何一条要翻案，都要重开 §3 P-1 而不是加 FR。**

## 5. 输入 / 输出

- **文件契约**：`openvibe-team/{terms,prompts,skills}.json`（seed 同形）、`meta.json`、`usage/<署名>.jsonl`（六键固定）。字节级字段清单以 `docs/specs/seed-content.md` 为准，本文件不复制（避免第二真源）。
- **API**：`POST /api/team/export`、`POST /api/team/import`、`GET /api/team/changeset`（FR-3.4 视图）、`POST /api/assets/:kind/:id/transition`（FR-3.2 唯一跃迁入口）、`GET /api/team/usage`（FR-6.3 聚合读）。
- **CLI**：`openvibe sync` 成功后按 FR-6.2 追加一行（无新子命令）。
- **库**：新表 `review_events` 一张 + skills 一个 `status` 列，一支迁移。**包/lock 契约（design §7）与 adapter 产物（§8）零改动** ⇒ 本模块整体属 **B 级**（例外见 §8.2-②）。

## 6. 边界与异常

1. **署名不是身份**：任何人可改自己机器上的署名，统计可被自我夸大，`review_events.actor` 可被伪填。这是 B+C 形态的**已知天花板**，必须在设置页与 README 的团队段明写「本机自陈，不构成认证」；不写就是给用户假安全感（§7.11 负向登记）。
2. **`usage/*.jsonl` 是团队仓库里的明文**：含项目名、包名、平台。它与匿名遥测**不同域**——前者由用户自行选择把目录放进哪个仓库、可见范围由那个仓库决定；后者受 D13 三类白名单与「机器标识不带出」约束。UI 与文档不得把两者都叫「遥测」（本仓 §15.5-6 的同名异物教训在此重演风险最高）。
3. 团队目录不可写 / 不存在 → 导出与回传都记 warning 并跳过，**不影响本机台账与注入主流程**（注入成功是本模块任何动作的前置，不能被文件共享失败拖红）。
4. 导入遇到 `meta.json` 缺失或 `schemaVersion` 不匹配 → 拒绝导入并说明版本，不猜格式、不做静默降级解析。
5. `review_events` 只增不改 ⇒ 长期体积由审计价值兜着，不自动裁剪；清理策略若将来要加，须先裁「事件是否仍是唯一可信痕迹源」（FR-1.2 的支点）。
6. 端口设定不可被 M7 改动（C7）；回环绑定不可被 M7 改动（C1）。

## 7. 验收标准（pass/fail）

> 支数不入正文（dev-plan §13-8/§13-9）。每条给测试文件 + 具名族；取数：`grep -oE "IT-TEAM-[0-9]+" <文件> | sort -u`。本机与并行会话共存时串行复跑取数（`--no-file-parallelism`，凭据见 `DEV-0074`）。

1. 署名必填与改名留痕：未设署名时团队导出被拦并给一条可执行提示；改名后新写的事件带新署名、**历史事件字节不变**。—— `UT-M7-IDENT-01`
2. **审计表只增**：仓储层与迁移中不存在 `UPDATE review_events` / `DELETE FROM review_events`（源码 grep 断言 + 尝试调用不存在方法的负例）。—— `CORE-REVIEW-01`
3. 跃迁唯一入口：三条资产路由只 POST transition 才改 status；任何 PATCH 端点试图写 `status` → 422（FR-3.2「除它之外不得有任何路径能改这三张表的 status」）。—— `IT-TEAM-02`
4. 同态自转拒绝：`draft→draft` 报错且不产生事件行。—— `CORE-REVIEW-02`
5. skills 新列 backfill：迁移后条数报告与库内实况一致，存量 skill **一条不丢**（前后计数相等）。—— 迁移测试 `CORE-DB-*` 同族新支
6. `draft` 不进导出（正/负对照）：同一 kind 下备一条 draft 与一条 active，导出 JSON 只含后者，且条数字段与 `meta.json` 相符。—— `IT-TEAM-EXPORT-01`
7. 导出→导入 round-trip：字段与 hash 全等，同库重导两次字节相同（`cmp`）。—— `IT-TEAM-EXPORT-02`
8. 空集合不产文件；未配 `teamDir` 时零写入、零建目录、零外联。—— `IT-TEAM-EXPORT-03` + `UT-USAGE-01`
9. 回传行严格六键：多余键/缺键都拒；`sync` 成功后恰追加一行且不影响注入退出码。—— `UT-USAGE-02`
10. **隐私承诺未被动**（把 §3 P-3 的边界钉成断言）：`TELEMETRY_EVENTS` 仍为三值、`TelemetryBatchEvent` 仍为五字段、关闭态仍零网络调用。—— `SHARED-TELEMETRY-*` 同族新增一条形状断言
11. **未验证面（明写，不是遗漏）**：多人多机的真实并发使用**无实测**（单机多副本可测的是文件读写与幂等，测不出两人同时改同一资产）；FR-1 的署名天花板、FR-6 的明文可见范围只由文档与 UI 提示表达，**无自动化可证**；`/skills` 与工作台上的新入口属 DOM 未验证面（同 `m2-skill-registry.md` §7.14 形态）。

## 8. 依赖

- 上游：PRD 3.2-M7 / 3.3 / 第 8 章 P2 行；design §11 安全设计；`docs/specs/seed-content.md`（资产 JSON 字节形制）。
- 平级：`m6-cli-injection.md`（sync 成功后是 FR-6.2 的挂载点；§6.5 的措辞归属）、`m2-skill-registry.md`（FR-2.2 的 skills status 新列落在它的台账域）、`m1-prompt-library.md` / `m3-glossary.md`（FR-2.1 词表同源）、`m4-playbook.md` §8.3（同一结论的两份写法）、`onboarding.md` FR-3（FR-5 的卡片复用面）。
- 队列：`docs/decisions.md` ㉓ 行（三裁的单源）；D 编号：**D23**（`docs/PRD.md` 附录 D 新行，本模块三前提一条记）。
- 不做跨模块承诺：M7 不提供注入、不提供 skill 分发实现（见 `m2-skill-distribution.md`）、不替 owner 决定架构路线。

### 8.2 待确认（v1.0 只剩两条开口）

| # | 事项 | 为什么留 |
|---|---|---|
| ① | **评审对象粒度**（单条资产 vs 变更集）owner 未随三裁给出 | 本文件按单条资产定形（FR-3.3 给了理由），但 owner 若要「组包级审批」则 FR-2.1 的「不新增第三态」与 FR-3 的表形状都要改 ⇒ 这不是措辞问题，是 schema 问题，须 owner 点头后另升一版 |
| ② | **P-3=ii 的目的端解释** | 本文件走「团队仓库明文文件」这条合规解，代价是它**不是**匿名遥测、也不喂 D19 的增长看板。若 owner 本意是「注入侧回传到我们收」，那是 A 级（新白名单事件 + 放开机器标识 + README 承诺改写），须新 D 编号 + `schemaVersion +1`，不并入本模块 |

> v0.1 曾挂的第三条「`content/seed/*.json` 是否携带 status 字段」**已在同一轮闭合**，证据与结论见 FR-2.3：JSON 三条目均无该字段，但 `seed.ts:124/178/193` 硬编 `status: 'active'` ⇒ 「导出首轮为空」不成立。留这一行是为了记下「它当时是可测而未测」——写「未核」之前先跑一次 grep。
