# 开发计划 · OpenVibe v0.2.1 迭代版（M8 Agent 接入层）

| 项 | 值 |
|------|------|
| 产品 | **OpenVibe（灵典）** · npm `openvibe` |
| 迭代版 | **v0.2.1 · 独立轨道**（**不进** v0.2.0 的 RF 编号空间；`dev-plan.md` §16.2 的 27 个编号项一字不动） |
| 范围 | **M8 · Agent 接入层**五个子面全含：**A** 官方 skill 包 / **B** 回流写入面 / **C** CLI 读写面 / **D** 聚合查询面 / **E** Web 直调面板 |
| 上游 | `docs/PRD-M8-agent-bridge-v1.0-20261013.md`（M8 全模块 PRD，v1.1）· `docs/PRD.md` v0.2.0 第 11 章 · `docs/specs/m8-agent-bridge.md`（B/C/D，v1.0）· `docs/specs/local-event-ledger.md`（台账，**迁移已落地** `0007` · DEV-0094）· `docs/specs/service-layer.md`（服务层，**部分落地** —— `agentService`/`contextService` 已写，`packService`/`injectService` 未写） |
| 下游设计 | `docs/design.md` §5（数据模型）/ §6（路由面）/ §8（adapter 冻结面 · M8-A 会动）/ §11.5（遥测白名单，本迭代不触碰） |
| 关联任务 | **无**。No-spec-no-task（`dev-plan.md` §0.4 第 4 条）：Phase 0 的三份 spec 全部落地后，才在 `docs/tasks.md` 申请 **T14**。⚠️ **该前置现已满足**（三份 spec 均已 v1.0），T14 **尚未申请**——见 §4.2 落地进度 |
| 工期 | **未排**。照 `dev-plan.md` §16.6 约束 2 的先例：v0.2.1 的启动时点由 v0.2.0 的 **RF1-5** 决定（见 §3.1），排期须等那个时点确定，本文件**不预设工期数字** |
| 版本 | **v1.0（2026-10-14 开档）** |
| 采样 | 2026-10-14 工作树；引用提交树 **`4b42642`**（DEV-0092；2026-10-13 20:00 / 2026-10-14 09:39 / 2026-10-14 17:10 三次复采均未前进） |
| 反向指针 | `docs/dev-plan.md` **§18** · `docs/PRD.md` 第 11 章 + 附录 D **D34** · `docs/decisions.md` 队列 **㉞** |

---

## §0 本文件的定位与纪律

### §0.1 为什么另立文件（**owner 裁，推翻既有纪律**）

`dev-plan.md` §16 开档边界第 1 条原文：

> **不另立计划文件**。再写一份 `docs/plan-v0.2.0.md` 就是给本文造第二个真源……RF 线的排期只在这里长。

**owner 2026-10-14 裁：v0.2.1 另立 `docs/dev-plan-v0.2.1.md`，该条纪律对 v0.2.1 不适用。** 登记在 PRD **D34**。

**推翻的代价由双向指针对冲**，不是靠自觉：本文与 `dev-plan.md` §18 互指，两处指针都写死文件路径与节号；§18 段同时承载「谁是真源」的说明。代价清单如实登记在 §9.2。

### §0.2 本文必须遵守的既有纪律

| 纪律 | 出处 | 本文怎么落 |
|---|---|---|
| 不承诺工期 | `dev-plan.md` §16.6 约束 2 | 头部「工期」行写**未排** ＋ 说明由 RF1-5 决定 |
| 计数三成规 | `dev-plan.md` §13-8 | 任何计数与口径同处、与采样 sha 同处、**单源**；本文不复算别处已有的数 |
| 测试支数不入正文 | `dev-plan.md` §13-9 | 正文**不写**测试支数与具名上界，只给取数命令 |
| 冻结凭据带 ref 锚 | `dev-plan.md` §0.3 | 涉及 golden/seed 的断言一律写成 `git diff --name-only <BASE>..HEAD -- tests/golden/ content/seed/` 形态（**不带 ref 是空转凭据**，不采用） |
| 日志不回改 | 全局 | 历史数按原样留，不复用为现状口径 |
| No-spec-no-task | `dev-plan.md` §0.4 第 4 条 | `tasks.md` 本轮**不动**，T14 待三份 spec 落地后再申请 |

### §0.3 号位说明（**本节是一处已发生的冲突登记，不是待办**）

`dev-plan.md` 在提交树 `4b42642` 的 §17 是 **M4 技巧库开发计划**（`:1789`）。**2026-10-14 工作树把该节整节删除（−103 行），同时 `docs/tasks.md` 的 T12 人日口径从「已估 5.2 · 单源 = `dev-plan §17`」回退为「人日未估」，`docs/decisions.md` ㊫ 的状态从「已裁并已拆」回退为「已裁已落」。这批回退属一个并行会话、未提交、非本轮所作。**

⇒ **本迭代版取 §18，不取 §17。** 理由：若本文件占 §17 而那个会话随后恢复 M4 的 §17，即为**两节同号**，属硬冲突；取 §18 的最坏情况只是工作树若维持回退态时留下一个可解释的编号空洞（§16 → §18），本节即为该空洞的解释。**本文件按「未 commit 交付」处理**，号位归属最终由 owner 在入库时裁定。

---

## §1 结论（Summary）

1. **v0.2.1 是独立轨道**，范围 = M8 五子面全含，需 **三份 spec**（已有 B/C/D 合一 + 待建 A/E 两份）。
2. **本轮最重后果是 D9**：owner 裁「M8 两张表并进台账那次迁移」＋「埋点推迟到台账落地之后」⇒ **台账（v0.2.0 的 RF1-5）不落地，M8 连表都建不了、Phase 1 第一步也动不了**。v0.2.1 的启动时间因此**不由本迭代决定**。
3. **十二项裁决已于 2026-10-14 全部闭合**（§5），其中 **M8 八项 owner 的选择全部与我的建议相反** —— 逐条记在 §5，不改判、不美化。
4. **Phase 0 状态（owner 2026-10-14 裁定口径后）**：**判据是「spec 条目是否达到要求、任务是否完成」，不是闸号本身**。自办闸侧 **0-a / 0-b / 0-c / 0-h 已交付**，0-d **结构半边完成、运行半边 harness 已交付待 owner 跑**，0-i **owner 裁定本轮豁免**（非通过）；外部门 0-e / 0-f / 0-g 属 **v0.2.0 轨道**，本迭代只依赖不建设，**不在 Phase 0 判绿范围内**。
5. **0-e / 0-f / 0-g 三闸在 v0.2.0 轨道内**，本迭代只依赖、不重复建设。
6. **不排工期**。

---

## §2 范围

| In | Out（明确不做，写明去向） |
|---|---|
| **M8-B** 回流写入面（`POST /api/agent/ingest` 单一端点 + 五项 `kind` 闭集） | **M2 的 `defaultScanRoots()` 缺口**（`packages/core/src/repos/skills.ts:155` 不含 `~/.agents/skills`，致 188 个 skill 扫不到）——**登记为 M2 缺口，本轮不夹带**（§6.4） |
| **M8-C** CLI 读写面（三只新命令 `ask` / `status` / `session log` ＋ `requirement add`） | **改 `TELEMETRY_EVENTS`（D3 白名单本体）**——M8 一条都不加 |
| **M8-D** 聚合查询面（`GET /api/projects/:id/context` 只读聚合 + token 预算裁剪） | **新增 adapter**——复用既有六个；`windsurf/gemini/copilot` 仍不实现（新增属 A 级，design §8 冻结面） |
| **M8-A** 官方 skill 包（SKILL.md ＋ `scripts/` ＋ `references/`），**随标准包与独立 npm 包两者都发** | **让 agent 有删权**（触发 `clean`、删资产、删日志）——PRD B20 判为产品边界 |
| **M8-E** Web 直调面板（不经 shell fork，前端直接调后端能力） | **排期**——见头部「工期」行 |
| **台账迁移一次建四表**：`local_events`（`kind` 闭集 13 → **18** 项）＋ `agent_ingests` ＋ `agent_sessions` ＋ `requirements` | **动 `projects` / `tasks` / `dev_log_entries` / `0001_init.sql` 任何既有列**（`tasks.requirement_id` 会被提为禁区，见 §5 ④） |

### §2.1 三份 spec 的分工

| spec | 覆盖 | 本轮状态 |
|---|---|---|
| `docs/specs/m8-agent-bridge.md` | M8-B / C / D ＋ 台账迁移与 M8 五类埋点的**声明面** | **v0.9 → v1.0**（本轮回填五处待裁，§5） |
| `docs/specs/m8-agent-panel.md` | M8-E Web 面板、待确认回流三态、空态三态、与 CLI 同源断言 | **待建**（Phase 0 产出；不依赖探针 ⇒ 不被 M8-A 连坐） |
| `docs/specs/m8-skill-bridge.md` | M8-A 官方 skill 包、意图→命令映射表、`scripts/`（sh + ps1）、两通道分发 | **待建**，**阻塞于 0-d 运行半边**（§6.3） |

---

## §3 依赖与排序

### §3.1 硬链：服务层 → 台账 → M8（**D9 的直接后果**）

`docs/specs/service-layer.md` §8.3 明写：**它是 1–5 号台账的写入点前置**。owner 裁①把 M8 的两张表并进台账那次迁移 ⇒ 排序被钉死为：

```
服务层（v0.2.0 · RF1-1 · 部分落地：agentService/contextService 已写，packService/injectService 未写）
      ↓
本地事件台账（v0.2.0 · RF1-5 · 迁移已落地 0007 · 一次建四表 · 但总闸 0-f 仍红）
      ↓
M8 读写核心（本迭代 Phase 1 · B/D 已落地，C 未开工 ⇒ 见 §4.2 落地进度）
      ↓
M8 接入面（本迭代 Phase 2 · A + E）
```

**⇒ 台账不落地 ⇒ 本迭代 Phase 1 的第一步（迁移）也动不了。本文件不含任何「M8 可以先行」的表述**，那是错的：并进同一次迁移就意味着物理上无法先行。

> **2026-10-15 订正（不回头改上段的排序论证，只登记实际发生的事）**：这条排序被 **owner 授权越过**了。owner 2026-10-15 指令「取消大量裁定，直接上手开发功能」⇒ 在 **0-e/0-f 两道闸仍红**的情况下直接开了 Phase 1。上段三个「未落地」标签已按实况更新，但**排序论证本身依然成立**——欠的是 0-f 总闸的账（见 §4.2 末尾的偏差登记），不是排序错了。

### §3.2 轻链：0-g `docs:check` 不阻塞 M8 任何 FR

`docs:check`（RF0-4）在本迭代只有一处依赖关系：它未来应能校验 M8 三份 spec 的一致性。**反向不成立**——M8 的落地不要求 `docs:check` 先存在。故 0-g 在依赖图上**不进入**上面的主链。

### §3.3 待建 spec 之间的依赖

- `m8-agent-panel.md` **不依赖** `m8-skill-bridge.md` ⇒ 0-h 可与 0-i 并行，不连坐。
- `m8-skill-bridge.md` **依赖** 0-d 运行半边的实测结论 ⇒ 0-i 是 Phase 0 里唯一有外部依赖的一项。

---

## §4 三段式 Phase（owner 裁）

### §4.1 Phase 0 · 闸门（本轮执行范围）

**九道闸，现状分布（与下表逐格对应，复算口径见本节末）：2/9 已交付（0-a、0-h）＋ 2/9 文档已回填（0-b、0-c）＋ 1/9 部分（0-d，结构半边）＋ 1/9 豁免非通过（0-i，owner 裁定）＋ 3/9 外部门未建（0-e、0-f、0-g，v0.2.0 轨道）。**取数法**：`sed -n '/^### §4.1/,/^### §4.2/p' docs/dev-plan-v0.2.1.md | grep -c '✅'` → 2（本节所有 9 行逐行核对，不另设总数）。**owner 裁定的通过判据是「spec 条目是否达到要求、任务是否完成」，不是闸号**——闸号只是本文件的组织工具。

| 闸 | 内容 | 状态（2026-10-14 采样） | 落点 |
|---|---|---|---|
| **0-a** | 六处文档：本文新建、`dev-plan.md` §18 指针、`PRD.md` 第 11 章 ＋ D34、PRD-M8 升 v1.1、M8 spec 升 v1.0、`decisions.md` 立 ㉞ | ✅ **本轮已执行** | 六份文件 |
| **0-b** | PRD-M8 §11 七项待裁回填 | ⚠️ **对话已闭合（§5），文件已在本轮回填** | PRD-M8 v1.1 |
| **0-c** | M8 spec §8.2 五处待裁逐条落 FR | ⚠️ **同上，已回填** | M8 spec v1.0 |
| **0-d** | 六平台 skill 发现约定探针 | 🟡 **结构半边完成；运行半边 harness 与逐步指南已交付，待 owner 在 GUI 跑** | 本文 §6 ＋ `docs/devlog-evidence/M8-probe/` |
| **0-e** | RF1-1 服务层落地 | ✅ **已落地**（2026-10-16 订正：本行原记「❌ 不存在」，是采样早于 DEV-0098 所致） | `service-layer.md` · DEV-0098 `packService` 7 支 ＋ `injectService` 11 支 |
| **0-f** | **RF1-5 台账落地（总闸）** | 🟡 **被验收物已落地，§7 十一条通过、两条待办**（2026-10-16 订正：本行原记「❌ 不存在」，是采样早于 DEV-0101 所致。**总闸未转绿**，故 Phase 1 的「0-e 与 0-f 同时转绿」前置至今未满足） | `local-event-ledger.md` §7：余 d／j／k／l 四条（d、l 需裁定，j 是屏摄，k 是时间断言） |
| **0-g** | RF0-4 `docs:check` | 🟡 **首版已落地**（2026-10-16，owner 指令越过 §8.2 待裁与时间闸）。七条判据 ＋ 基线机制 ＋ 30 支变异样本判据测试；已作**第六道闸**进 CI（只增 7 行、零删除）。**未达规格 §7.1a「0 违规」** —— 未闭合项登记在 `docs/docs-check-baseline.json`（FR-1 十六个真空断号、FR-4.2 两份禁区 spec 的版本行列数、FR-5 全系待裁③、FR-6 触发不可靠）。**人测耗时闸至今未测**，故本闸不得被引用来声称任何「治理成本次线性」结论 | `scripts/docs-check.ts` ＋ `tests/docs-check.test.ts` ＋ `docs/docs-check-baseline.json` |
| **0-h** | `m8-agent-panel.md` | ✅ **v1.0 已交付**（2026-10-14，14 条验收 ＋ `WEB-M8E-*` 新族）。**顺带查出一处假引用并就地改判**：PRD-M8 FR-5.4 的「沿用既有 EmptyState 纪律」前提不成立——`grep -rln 'EmptyState' apps/web/src --include='*.tsx'` → **0 命中**，该组件在本仓不存在 ⇒ FR-5.4 改判为「**新建组件并落三态**」 |
| **0-i** | `m8-skill-bridge.md` | ⏸ **owner 裁定本轮豁免**（2026-10-14：「手把手教我真机跑」）——探针 harness 与逐步指南已交付（`docs/devlog-evidence/M8-probe/`），**等 owner 跑完运行半边五问后另起**。**豁免不等于通过** |

> **「Phase 0 已执行」≠「Phase 0 已通过」。** 0-a/0-b/0-c 三闸本轮交付的是**文档**，它们让 M8 的规格链闭合；它们**没有**让 0-e/0-f/0-g 这三道外部闸通过。总闸 0-f 仍红 ⇒ 本迭代**不可开工**。DEV_LOG 相应段落按此分开写。

### §4.2 Phase 1 · 读写核心（M8-B ＋ C ＋ D ＋ `requirements`）

**出口判据**：M8 spec v1.0 的 §7 二十四条 pass/fail 全绿。**开工前置**：0-e 与 0-f 同时转绿。

范围：
- 台账迁移（**与台账同一次迁移**，一次建四表）＋ `local_events.kind` 闭集扩至 18 项（13 ＋ M8 五类）
- `POST /api/agent/ingest` ＋ `GET /api/projects/:id/context` ＋ CLI 三只新命令 ＋ `requirements` 表
- M8 五类埋点的**声明与判据**（写入点随台账同批落地）
- `IDEMPOTENCY_CONFLICT` 新错误码（B 级）

**落地进度（2026-10-16 10:00 实测重采 · 提交树已推进至 `a4d7677`，本节各行凭据均可在该提交树上复算）**

> **本表在 2026-10-15 18:31 按 owner 指令整体重采**。上一版（11:27 采样 · 引用 `4b42642`）有两处明确错误已纠正：`packService`/`injectService` 标着「未开工」而实际 DEV-0098 已落地；出口判据那一行只写了「CLI 侧零覆盖」而没说出真实原因——**那 24 个测试 ID 全部虚构**。**「登记为未完成」与「登记为已完成」同样要付核实成本**，故本表每行的状态列都带凭据指向。

| 范围项 | 状态 | 凭据 |
|---|---|---|
| 台账迁移 `0007`（一次建四表 · kind 18 项） | ✅ 已落地 | DEV-0094 · `0007_local_events_and_agent_bridge.sql` · `m8-ledger-schema.test.ts` 8 支 |
| `IDEMPOTENCY_CONFLICT`（422） | ✅ 已落地 | DEV-0095 · `errors.ts` ＋ `errors.test.ts` 4 支 |
| `POST /api/agent/ingest` | ✅ 已落地 | DEV-0095/0096 · `agentIngest.ts` · `agentService.ts` 8 支 |
| `GET /api/projects/:id/context` | ✅ 已落地 | DEV-0097 · `contextService.ts` · `contextService.test.ts` 18 支 |
| `packService` / `injectService`（RF1-1 本体） | ✅ **已落地**（上一版误记为未开工） | DEV-0098 · `packService.ts` 7 支 ＋ `injectService.ts` 11 支 |
| **CLI 四只新命令（`ask`/`status`/`session log`/`requirement add`）** | ✅ **已落地** | DEV-0102/0103 · `apps/cli/src/commands/{ask,status,session,requirement}.ts` · `cli-commands.ts` 登记 5 → **9 条** |
| **`cli_agent_command_run` 埋点**（五类里唯一无写入点的一类） | ✅ **已落地** | DEV-0102/0103 · `POST /api/agent/command-run` + `packages/core/src/services/commandRunService.ts`（写入点在 `services/` 内一处）；`command` 闭集四值，`commandRun.api.test.ts` 20 支 |
| **发布时的 kind 分发（FR-2.8 / FR-2.9 / FR-2.1.1）** | ✅ **已落地** | **此前从未有过任何实现**：`AgentIngestRepo.review` 只改 `agent_ingests.status` 与 `reviewed_at`，不往 `dev_log_entries` / `project_check_states` / `tasks` / `requirements` 落行。现由 `agentService.ts` 的 `publishDevLog` / `publishTaskStatus` 补齐（后者先过三值闭集，不过即整条 `rejected`、不扩列、业务表零写入）；凭据 `agent.api.test.ts` 的 `i ·` 与 `j ·` 两支 ＋ `agentService.test.ts` 4 支 |
| **出口判据「M8 spec §7 二十四条全绿」** | 🟡 **23/24 已绿，余 1 条待 owner** | 2026-10-16 实测：§7 表 24 个数据行中 **23 条 ✅、1 条 🟡**，余下的是条 `x`（README 人工验收腿，**屏摄归档属 owner 腿**）。⚠️ 该表本轮之前不可判定 —— 24 个测试 ID 全部虚构（§7.2 复算 `→ 0`）；owner 2026-10-15 裁定「按代码功能完成为依据」后已按实质行为改判，并配 `tests/spec-claims.test.ts` 防复发（8 支，只断声称存在的必须此刻可定位） |

> **⚠️ 如实登记一处偏差：本节的「开工前置：0-e 与 0-f 同时转绿」并未满足，Phase 1 仍开工了。** §4.1 记 0-e/0-f 为「❌ 不存在（v0.2.0 轨道内，本迭代只依赖）」，而 owner 2026-10-15 指令「取消大量裁定，直接上手开发功能」⇒ 以 owner 授权越过该前置。**代价是明确的**：0-f 是本迭代总闸，它仍红，意味着**台账自身的总闸判据未被验过**，M8 的埋点建立在未过总闸的台账上。这不是「豁免即通过」，是**欠账**，兑付点在 0-f 转绿后重跑 M8 埋点判据。

### §4.3 Phase 2 · 接入面（M8-A ＋ M8-E）

**出口判据**：`m8-skill-bridge.md` 与 `m8-agent-panel.md` 各自的验收条目全绿。
**开工前置**：Phase 1 全绿 ＋ 0-d 运行半边闭合。

---

## §5 裁决台账（十二项 · owner 亲裁 · 2026-10-14）

> **如实登记：M8 那八项，owner 的选择全部与我的建议相反。** 本台账不改判、不把相反意见写成「本来就对」。

### §5.1 M8 八项

| # | 议题 | 选项 | **owner 裁定** | 我原建议 | 后果 |
|---|---|---|---|---|---|
| ① | M8 两张表的迁移号位 | (a) M8 取 `0007`、台账顺延；(b) 合并进台账那次迁移；(c) 各取一号＋改台账 spec | **(b) 并进台账那次迁移** | (a) | **D9**：M8 被台账物理阻塞（§3.1）；台账 spec 的号位须由 `0006` 改到 `0007` |
| ② | 幂等键冲突的错误码 | (a) `STALE_SELECTION`；(b) `NAME_CONFLICT`；(c) **增新码 `IDEMPOTENCY_CONFLICT`** | **(c) 增新码（B 级）** | (a) | `ERROR_CODES` 闭集 11 → 12 项；**该闭集当前零测试守护**（§8.2 风险 R4） |
| ③ | 回流体量上限 | 512 KB / 20 条 / **总量 2 MB** | **512 KB / 20 条 / 2 MB** | 512 KB / 20 条 / **512 KB** | 前两值与 `constants.ts:108-109` 同族；**第三值经连带修正**——20 条 × 512 KB 的理论上限远超整包 2 MB 预算 |
| ④ | `requirement` kind 的落地 | (a) 丢弃＋提示；(b) **本轮一并建 `requirements` 表**；(c) 移出闭集 | **(b) 一并建表** | (a) | 三张表 → **四张表**；`requirements` 与 `tasks` 解为**两表独立、无外键**（§5.3） |
| ⑤ | 台账未落地时 M8 埋点 | (a) M8 自建临时表；(b) 降级人工数；(c) **推迟 M8 到台账落地之后** | **(c) 推迟** | (b) | 与①叠加 ⇒ **D9**；M8 五类埋点只声明不写入 |
| ⑥ | 并发回流的合并策略 | (a) 时间序平铺；(b) 同源合并；(c) **交给用户在 Web 裁决** | **(c) 交 Web** | (a) | 合并逻辑落到 M8-E；M8-B/C 只保证数据可得 |
| ⑦ | 官方 skill 的分发形态 | (a) 随标准包；(b) 独立 npm 包；(c) **两者都发** | **(c) 两者都发** | (a) | 多一条通道要维护；`m8-skill-bridge.md` 须写两套安装路径 |
| ⑧ | — | — | *（七项中第 8 项为 §5.2 的三前置之一，此处不重复）* | | |

### §5.2 三前置四项（全部与我的建议一致）

| # | 议题 | **裁定** | 落点 |
|---|---|---|---|
| 前置 A | 服务层 FR-1 增列 `agentService` 作**第五个**服务 | **增列** | `service-layer.md` FR-1（待 0-e 落地时写） |
| 前置 B | 台账 `kind` 闭集 | **13 → 18 项**（＋M8 五类） | 台账迁移 `CHECK` 闭集 |
| 前置 C | 队列号位 | **M8 = ㉞**；**11-a = ㉟**（留给 RF1-5，本轮不立） | `docs/decisions.md` |
| 前置 D | 0-d 探针的真机环境 | **由 owner 提供**（GUI 操作；harness 已就绪，见 §6.3） | §6.3 |

### §5.3 ①②④ 三项裁定的连带修正（本轮新发现，须与裁定同批落）

1. **① ⇒ 台账迁移号位由 `0006` 改 `0007`。** `0006` 已被 `0006_playbooks.sql`（M4，DEV-0091）占用（复算：`ls packages/core/src/db/migrations/` ⇒ 0001–0006）。台账 spec 的过期断言**不是 4 处**（PRD v1.0 就地订正记的「四处」本身即错报），复算 `grep -c '0006' docs/specs/local-event-ledger.md` ⇒ **6 处、措辞各异**：`:8`「0006 号位」· `:26`「迁移 `0006_local_events.sql`」· `:38`「0001–0005，0006 空位 ⇒ 号位可用」· `:54`「FR-1：`0006_local_events.sql`」· `:99`「§6.8：`0006` 只 CREATE」· **`:105`「验收条目 a：`0006_local_events.sql` 迁移可执行且幂等」**。**其中只有 `:38` 是明说「可用」的断言，其余五处是引用同一号位**——`:105` 最易漏，它在验收表里，只扫「可用／迁移／号位」类关键词会漏掉。 ✅ **owner 2026-10-14 裁定「本轮同批回改六处」，已完成**——`docs/specs/local-event-ledger.md` 的 `:8`/`:26`/`:38`/`:54`/`:99`/`:105` 已由 `0006` 改为 `0007`（`:38` 另把「0001–0005，0006 空位」改为「0001–0006（`0006` = `0006_playbooks.sql`），本项取 `0007`」）。**这属 owner 显式授权的跨轨道同批动作，不再是「不代劳」**。
2. **③ ⇒ 第三值不是随手改的。** `constants.ts:108-109` = `singleFileMaxBytes: 512 * 1024` ＋ `packTotalMaxBytes: 2 * 1024 * 1024`，与裁定③的前两值同族；第三值取 **2 MB** 使单次回流不可能突破整包预算。
3. **④ ⇒ `requirements` 与 `tasks` 默认解。** 两表**独立、无外键**。理由：加 `tasks.requirement_id` 需 `ALTER` `0001_init.sql` 的既有表，而既有 spec 明确禁止就地扩列。

---

## §6 0-d 探针实测（**只读实测，未改任何文件**）

### §6.1 结构半边 · 已完成

| 平台 | 用户级 skill 目录 | 条数 | symlink |
|---|---|---|---|
| Qoder | `~/.qoder/skills` | 76 | 29 |
| CodeBuddy | `~/.codebuddy/skills` | 69 | **69 全部** |
| Trae | `~/.trae/skills` | 29 | **29 全部** |
| MiniMax Code | `~/.minimax/skills` | 11 | 2 |
| OpenCode | `~/.opencode/skills` | 6 | 0 |
| Claude | `~/.claude/skills` | 4 | 2 |
| **单一真源** | **`~/.agents/skills`** | **188** | — |

**四个结论：**

1. **六个平台全部支持 skill**，生态早已在用——M8-A 不是「开辟新地」，是「接一个已有的约定」。
2. **生态形态 = 单一真源 + symlink 农场**。Trae **29/29**、CodeBuddy **69/69** 全是 symlink，指向 `~/.agents/skills/`。存在 `~/.agents/.skill-lock.json`（27 KB）与 `_agents.mount_config`。
3. **项目级 `.trae/skills/` 确实存在并被真实项目使用**（secnews、gstack、cherrystudio 等 6 处命中）。
4. **子目录惯例命中**：`~/.agents/skills` 下 `<skill>/<subdir>`（`find . -maxdepth 2 -type d -name X`）实测 **`references/` 60 · `scripts/` 36 · `assets/` 5** ⇒ **`references/` 与 `scripts/` 是生态主流形态，M8 spec FR-1.1 的三目录设计成立，不必改设计**；`assets/` 只有 5 处，是**弱惯例**，M8 的 skill 若不放资源则可省。⚠️ **本条已订正过一次错报**：初稿记的「39 / 29 / 18」无任何单根单深度组合可复算（`~/.qoder/skills` 深度 3 给 40/29/18、`assets` 恰为 18 但 `references` 两头不靠），根因是**当时没标扫描根**——本行现附取数命令。

### §6.2 两个可直接改写规格的发现

- **frontmatter 跨平台安全子集 = `name` ＋ `description`**（Claude 多 `license`、Qoder 多 `metadata` 嵌套块）。
- **`description` 承载触发条件而非简介**（Qoder 样本原文佐证）⇒ **支持把「意图 → 命令」映射表放进 SKILL.md 正文**，不必另造触发机制。

### §6.3 运行半边 · harness 已交付，待 owner 在 GUI 跑（**owner 裁定「手把手教我真机跑」**）

加载时机 · 项目级与用户级的优先级 · skill 内脚本的可执行性 · Trae/CodeBuddy 对 symlink 的限制 · `minicode` adapter 的目标产品归属。

**⇒ 0-d 未闭合 ⇒ `m8-skill-bridge.md`（0-i）不具备可规格化条件。本轮不写。**

### §6.4 探针对 M8-A 产生的三个冲击点

| # | 冲击点 | 处置 |
|---|---|---|
| **1** | **§4.1 分布形态未定**：复制 vs symlink。若走 symlink ⇒ 落在 m6b 已有测试覆盖的形态上（`pack.lock.json` 的既有语义） | 0-d 运行半边定；本文件不预设 |
| **2** | **§4.2 双锁冲突**：`pack.lock.json` vs `~/.agents/.skill-lock.json`，且 `clean` 的删除边界（D20「只删未改动的受管文件」）对第二把锁**不可逆** | 0-i 必须显式写清两把锁的归属与 `clean` 边界 |
| **3** | **M2 扫描根缺口**：`packages/core/src/repos/skills.ts:155` 的 `defaultScanRoots()` 不含 `~/.agents/skills` ⇒ 188 个 skill 扫不到 | **登记为 M2 缺口，本轮不夹带** |

---

## §7 待裁

| # | 待裁 | 阻塞什么 | 出口 |
|---|---|---|---|
| ① | Phase 1 / Phase 2 的**人日与排期** | 全部实现工作 | owner 在 0-f 转绿后定 |
| ② | §0.3 的 **§17/§18 号位归属** | `dev-plan.md` 的入库形态 | owner 入库时裁定 |
| ③ ~~台账 spec 的**六处 `0006` 过期断言**回改~~ | ✅ **已闭合**——owner 2026-10-14 裁「本轮同批回改」，六处已改（§5.3-1） | — | — |
| ④ | 探针运行半边五问 | 0-i ⇒ Phase 2 | owner 的 GUI 环境（§6.3） |

---

## §8 风险

| # | 风险 | 应对 |
|---|---|---|
| **R1** | **D9 连锁**：v0.2.0 的 RF1-5 延期 ⇒ v0.2.1 整体顺延，且 Phase 1 连第一步都动不了 | 不排工期（头部）；§3.1 把链路画死，早期可见 |
| **R2** | **裁决② 扩 `ERROR_CODES` 闭集**，而该闭集**零测试守护** | 实施时**必须**给闭集配一条测试（同 M8 spec FR-1.4 对遥测双源的同型要求） |
| **R3** | **§4.2 双锁 + `clean` 不可逆** | 0-i 显式写归属与删除边界；不写清就不可开工 |
| **R4** | **裁决① 改了台账迁移号位**，台账 spec 六处断言腐烂 | 已登记（§5.3-1），随台账轨道同批回改 |
| **R5** | **并行会话在 `docs/` 上的未提交改动** | 本轮不 commit；每笔改动前跑 `git log --oneline -5` ＋ 逐文件 `git diff -U1` 核归属（§0.3 即本轮现撞） |

### §8.2 一处「有实据的未登记缺口」

`ERROR_CODES` 11 项闭集**当前零测试守护**——复算 `grep -rn 'ERROR_CODES\|ErrorCode' --include='*.test.ts' apps packages` ⇒ **0 命中**（生产代码里也只有 `packages/shared/src/errors.ts:2` 一处定义）。裁决②把它扩到 12 项 ⇒ **R2 不是理论风险，是已存在的缺口被本轮踩到**。

---

## §9 单源与指针纪律

### §9.1 双向指针（**「不另立计划文件」的对冲面**）

| 方向 | 指针 |
|---|---|
| `dev-plan.md` → 本文 | `dev-plan.md` **§18** 段 |
| 本文 → `dev-plan.md` | 头部「反向指针」行 ＋ §0.1 引用 §16 开档边界第 1 条原文 |
| `PRD.md` → 本文 | 第 11 章 ＋ 附录 D **D34** |
| 本文 → `PRD.md` | 头部「反向指针」行 |
| `decisions.md` → 本文 | 队列 **㉞** |
| 本文 → `decisions.md` | 头部「反向指针」行 |

### §9.2 推翻纪律的代价（如实登记）

第 1 条纪律被推翻后，**双源风险由 §9.1 的三对双向指针承担**。若任一指针腐烂（例如 `dev-plan.md` §18 被删而本文未察觉），本文即成孤本——**这是本决定已知的、可接受的代价，不是零成本**。owner 可随时撤销：撤销动作 = 删本文 ＋ 把内容并回 `dev-plan.md`。

### §9.3 复算口径（供 owner 或下一轮复核，别照抄本文数字）

```
grep -n '1[-]7' docs/dev-plan.md                                 # → 0（v0.2.1 不占 RF 编号空间）
#   ⚠️ 本行的模式用字符组 '1[-]7' 而非裸串：裸串会被本检查自己扫成命中，口径自毁（此注刻意不复写那个裸串）
grep -c 'dev-plan-v0.2.1.md' docs/dev-plan.md                  # → ≥1
grep -c 'dev-plan.md'  docs/dev-plan-v0.2.1.md                  # → ≥1
grep -o '^### T[0-9]\+' docs/tasks.md | sort -u -V | tail -1     # → ### T13（T14 空号待申请）
grep -oE '\bD3[0-9]\b' docs/PRD.md | sort -u -V | tail -1       # → D34（本轮已立，PRD.md:790）
# 台账 spec 六处已按 owner 裁定回改完毕，工作树现读数只剩 4（均为「0006 已被 playbooks 占用」的解释性提及）：
grep -c '0006' docs/specs/local-event-ledger.md                 # → 4（**不是 6**，六处已改；判据看有没有「号位可用」断言残留）
grep -c '0007' docs/specs/local-event-ledger.md                 # → 6（六处回改落点）
grep -rn '0006 号位可用' docs/specs/local-event-ledger.md      # → 0（该措辞从未存在，勿作判据）
# 回改**前**的六处须带 ref 取（不带 ref 是空转凭据）：
#   git show 4b42642:docs/specs/local-event-ledger.md | grep -c '0006'   # → 6
ls packages/core/src/db/migrations/                             # → 0001–0006（0006 = playbooks）
sed -n '108,109p' packages/shared/src/constants.ts              # → 512 KB / 2 MB（裁定③同族）
grep -oE '^\| [①-⑳㉀-㉟]+ ' docs/decisions.md | tr -d '| ' | sort -u | tail -1   # → ㉞（本轮已立，decisions.md:47）
```

---

## §10 变更日志

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-10-14 | **v0.2.1 独立迭代版开档**。owner 裁三件事：① 另立本文件（**推翻 `dev-plan.md` §16 开档边界第 1 条**，代价由 §9.1 双向指针对冲，登记为 PRD D34）；② **三段式 Phase**（闸门 / 读写核心 / 接入面）；③ **不排工期**。十二项裁决入账（§5）——M8 八项中 owner 的选择**全部与建议相反**，如实登记。本轮执行 Phase 0 的 0-a/0-b/0-c 三闸并**回填**已闭合的待裁，0-d 只完成结构半边（§6）。**「Phase 0 已执行」不等于「Phase 0 已通过」**——总闸 0-f（台账）仍红，本迭代不可开工。号位取 §18 而非 §17 的理由见 §0.3。 |