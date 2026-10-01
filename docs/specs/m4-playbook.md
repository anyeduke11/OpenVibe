# SPEC · M4 技巧库（草案：结构 + CRUD + 复盘回流 + PLAYBOOKS.md）

| 项 | 值 |
|------|------|
| 模块 | M4 技巧库（PRD 3.2 资产层第四格） |
| 优先级 | Phase 2（**D22 勘误判归**，PRD 3.3「M2 完整版、M4、M7 进 Phase 2」+ 第 8 章 P2 行）；表内三行的 P1 是模块**内部**相对优先级，不构成进 MVP 的承诺 |
| 上游 | PRD 3.2-M4（三行能力）、PRD D22、owner 裁定 ⑫（2026-09-26，`playbookIds` 闸的拆法） |
| 下游设计 | design.md §5（数据模型 DDL）、§7.3（确定性顺序）、§7.4（各产物文件格式）、§7.6（指纹）、§7.7（路径与规模安全） |
| 关联任务 | **无**。dev-plan §9 只到 T1–T9、tasks.md §2b 只到 T10–T11，全仓对 M4 的任务化落点为零（PRD D22 自陈此缺口）。开工闸的现行形态不是新 T 号而是 dev-plan **§15.1 裁定表**（痕迹闸在 §15.6 第 5 条）⇒ §8.2 待裁闭合后先入裁定表、再申请 T12。**本文件此刻不是开工依据** |
| 版本 | **v0.9 草案（2026-09-30，DEV-0074 新建）**。非 v1.0：§8.2 **七处**「待裁」（①–⑦）未闭合前不满足 §0.4 第 1/3/4 条对「定稿八段式 + 验收可判定 + No spec no task」的要求；本轮纯新文件，未改任何既有规格。§7.5 三探针已跑完（① terms 关联口径、② 脏数据 0 行、③ NAV 七字实况），探针债不挡定稿，挡定稿的是那七处裁 |

---

## 1. 目标与用户价值

- 技巧（playbook）记的是**踩过什么坑、怎么绕对的**：场景 + 问题 + 正确做法 + 反例 + 关联资产。它补齐的是资产层四种「说法」之外的第五种——**判断**。
- 与同层三格的分工（避免 M4 变成第三份提示词库）：M1 = 怎么说（可复用文案）、M2 = 怎么装（外部 skill 登记）、M3 = 叫什么（术语与定义）、**M4 = 什么情况下该怎么做（带反例的经验）**。
- 价值出口与 M3 同形：技巧本身不直接写用户项目文件，只经 M6 组包渲染成 `PLAYBOOKS.md`、由 CLI 注入（PRD 3.2-M3 审查修正说明对 M4 同样成立：Web 版无法写本地文件）。
- 飞轮位：PRD 第 6 章「M5 复盘 → M4/M3/M1 收录」这一腿目前只有 M3/M1 有承接面，M4 是零 ⇒ 本模块的首要输入端就是复盘回流。

## 2. 范围

| In（Phase 2 首批） | Out（明确不做，写明去向） |
|---|---|
| 五段结构 + CRUD + 检索（FTS） | 自动从日志提取候选（**全仓零实现且质量不可判定**，见 FR-5.2；写进 FR 就是假规格） |
| 「亲测有效」标记 + 手工使用证据 | 使用频次/热度自动统计与排序算法（依赖注入侧回传，属 M6/M7 之后） |
| 复盘回流：M5 日志选段 → 草稿 → **人工确认**入库 | 团队共享库、角色与 PR 式评审（M7，无 spec，见 §8.3） |
| `PLAYBOOKS.md` 渲染并进组包 / 指纹 / lock / token 估算 | adapter 侧单独消费技巧（现状：adapters 不消费 terms，产物由 composer 聚合，`packages/adapters/src/index.ts:2`） |
| 拆 `playbookIds` 闸（FR-8，owner 裁 ⑫ 预留的那一步） | 多语言渲染、注音形制（`theme.md` FR-5 只给词条卡） |
| 预置 seed + `seed:check` 门槛 | 技巧之间的依赖图/引用图（`related*` 三数组只作反链，不作图） |

## 3. 数据与核心概念

实体名 `playbook`，表名 `playbooks`。**命名纪律**：不得另起 `tip` / `trick` / `technique`——`playbookIds` 已写在 `packages/shared/src/schemas/pack.ts:18-23`、`packages/core/src/repos/packs.ts:38,59`、`apps/server/src/lib/default-pack.ts:56,83,231`、`apps/web/src/components/packs/PackWizard.tsx:115`，且被 golden 契约（design §7.2）与 `IT-ERR-04`（`apps/server/test/packs.api.test.ts:252`）、`shared.test.ts:61` 两条断言钉住；改名 = A 级碎契约。

| 字段 | 形态 | 必填 | 出处 / 对齐 |
|---|---|---|---|
| `id` | `pbx_<…>` | — | id 前缀律照既有资产（`pbx_` 已作为示例出现在 `apps/server/test/packs.api.test.ts:258`） |
| `scenario` | 短文本 | ✅ | PRD 3.2-M4「场景」 |
| `problem` | 文本 | ✅ | 「问题」 |
| `practice` | 长文本 | ✅ | 「正确做法」 |
| `antiPractice` | 长文本 | 可空 | 「反例」——PRD 明列为结构成员，但反例缺失不毁条目 |
| `relatedPromptIds` / `relatedTermIds` / `relatedSkillIds` | `string[]` | 默认 `[]` | 「关联资产」；悬挂口径照 terms（FR 见 §6.2 + §7.5 探针①） |
| `verified` | `boolean` | 默认 `false` | 「实战标记」，收紧规则见 FR-4 |
| `evidence` | `DevLogEvidence[]` | `verified` 时 ≥1 | **复用对象形制** `packages/shared/src/schemas/task.ts:28-32` 的 `{command, resultSummary}`；但 devlog 自己存的是**单个可空对象**（`task.ts:39` 入参 `.optional()`、`:52` 出参 `.nullable()`，列定义见 `0001_init.sql:119-131`）⇒ M4 存 `jsonb TEXT` 数组、渲染取前 N 条，不新建证据结构、也不改动 devlog 那侧（动它 = 改 `DevLogEvidence` 出参形状 = 碎既有断言） |
| `status` | `'draft' \| 'published'` | ✅ | 两态同源 `terms.status`（`packages/core/src/db/migrations/0001_init.sql:56-71`） |
| `source` | `'manual' \| 'reflow'` | ✅ | 回流可追溯，反链见 FR-5.4 |
| `tags` | `string[]` | 默认 `[]` | 照 terms/prompts |
| `seedHash` | 文本 | seed 项 | 幂等再跑，照 `TermsRepo.setSeedHash`（`packages/core/src/repos/terms.ts:255`） |
| `createdAt` / `updatedAt` | ISO | — | 照 terms |

长度上限进 `packages/shared/src/constants.ts` 的 `LIMITS` 对象，键名照 `termZhMax` / `termDefinitionMaxBytes` 律：`playbookScenarioMax`、`playbookProblemMaxBytes`、`playbookPracticeMaxBytes`、`playbookAntiPracticeMaxBytes`。**数值本 spec 不写死**（待裁③）。

## 4. 功能需求（FR）

### FR-1 条目结构与校验
1. `scenario` / `problem` / `practice` 三者非空；`antiPractice` 允许空串 ⇒ 渲染时该行整体省略（不产「反例：」空标签）。
2. 四段长度走 `LIMITS`，超限 422 `VALIDATION_ERROR` 且 `fieldErrors` 键为字段名（照 terms 端点现状）。
3. `status` 只接受两态字面量；新建默认 `draft`（安全默认，同 `ReflowActions.tsx:64-66` 的预填形态）。

### FR-2 存储与检索
1. 新迁移 `packages/core/src/db/migrations/0006_playbooks.sql`（现最高 `0005_skill_remote_tracking.sql`）：`CREATE TABLE playbooks` + FTS 影子表 `fts_playbooks` + `playbooks_fts_ai/ad/au` 三触发器，**逐形照** `0001_init.sql:56-71`（表）与 `:191-204`（FTS 与三触发器）。触发器与主表**同迁移**——分开发布是静默失效（建了表、检索永空）。
2. 检索复用 terms 的做法：`PlaybooksRepo.search` 对齐 `TermsRepo.search`（`repos/terms.ts:217`）与 `termMatchRanges`（`:58`）的中文命中语义（design §12）。**不得自造分词器**。
3. 幂等：`findByNaturalKey`（照 `:260`）+ `seedItemHash`（照 `:267`）。自然键取值属待裁④。
4. `sortForMd` 同类逻辑必须走 `compareCodeUnit`（`packages/shared/src/pack-contract.ts`，禁 `localeCompare`——CI 三平台字节一致性依赖此，design §7.3/§7.6）。

### FR-3 API
1. 六条端点，命名与动词律逐条对齐 `apps/server/src/routes/terms.ts:19-56`：`GET /api/playbooks`、`POST /api/playbooks`、`GET /api/playbooks/search`、`POST /api/playbooks/render-playbooks-md`（预览）、`PATCH /api/playbooks/:id`、`DELETE /api/playbooks/:id`。
2. 注册点 `apps/server/src/app.ts`（terms 腿在 `:64`）。
3. 错误面沿用既有码，不新增：404 / 422 `VALIDATION_ERROR` / `STALE_SELECTION`（后者来自组包侧，见 FR-7.1）。

### FR-4 实战标记与使用证据
1. `verified === true ⇒ evidence.length ≥ 1`，在 schema 层拦（`superRefine`，手法同 `pack.ts:18-23`，方向相反：这里是**收紧**）。
2. 置真必须是**显式动作**：`PATCH` 中 `false → true` 的腿要求随带非空 `evidence`；不接受「全量覆盖时顺手变 true」。理由与 owner 裁 ⑫ 的反谎报原则同源——静默把「没验过」写成「亲测有效」是资产库的信任事故。
3. `verified` 参与渲染标注（文字，不用颜色单义；`theme.md` FR-2 的颜色治理闸必须同批绿）。
4. PRD 原话「记录使用证据」在本 spec 采**手工登记**形态（可复算、零新基建）；自动统计属 §2 Out。

### FR-5 复盘回流（人工确认为唯一入库路径）
1. 复用现成面：`apps/web/src/components/projects/ReflowActions.tsx:24` 已实现「选中文本或整段 body → 预填编辑器 → `status:'draft'` 落库」，`DevLogRepo.linkAsset`（`packages/core/src/repos/devlog.ts:122`）回写 `linkedAssetIds`，`reflowOriginFor`（`:135`）+ `ReflowOriginOut`（`task.ts:59-67`）供反链。**M4 = 给该面板加第三个目标类型**（现两个：术语、提示词），不新建回流通道。
2. **禁止自动提取**：现取为凭据——`grep -rniE 'playbookCandidate|extractPlaybook' packages apps | wc -l` 当前为 0，且全仓对 `dev_log_entries.body` 无任何结构化解析（`extractVariables` 只处理提示词 `{{var}}`，`packages/shared/src/utils.ts:57`）。若未来要提取，先补一份可判定的「提取质量验收」规格，再动 FR。
3. **回流入口按项目、不按阶段猜**：`StageSchema`（`packages/shared/src/schemas/flow.ts:4-11`）只有 `{name, checklist, artifacts}`，复盘阶段仅是字符串 `复盘`（`content/seed/flow-templates.json:27,88`；「回流」只活在检查项文本里：`:31,91`，另有一条 `:103` 的「日志/指标/会话摘录齐备」已经把 M5 会话记录挂接当既成事实写着——那条 P1 子功能欠的正是这张 checklist 的账）；唯一机器信号是模板级 `kind:'retro'`（`constants.ts:60` `FLOW_KINDS`）。且项目侧存的是 `stages_snapshot` 物化副本（`0001_init.sql:90`）⇒ **后加字段不回溯既有项目**，任何「按阶段判定复盘」的实现都会对新旧项目给出不同答案。
4. 回流来源记 `source:'reflow'` 并写反链；不新建 candidate 表（候选态 = `status:'draft'` + `source:'reflow'`，两字段足够表达且已在库）。

### FR-6 `PLAYBOOKS.md` 渲染
1. 文件名常量 `PACK_FILE_PLAYBOOKS = 'PLAYBOOKS.md'`，与 `PACK_FILE_TERMS`（`packages/shared/src/pack-contract.ts:71`）同块声明；渲染器新文件 `packages/shared/src/playbooks-md.ts`，形制照 `renderTermsMdTable`（`packages/shared/src/terms-md.ts:28`：标题 / 引导语 / 表头 / 分隔 / 单元格转义全为常量）。
2. 只渲染 `status:'published'` 且被选中的条目；排序确定性见 FR-2.4。
3. 空集合 ⇒ **不产该文件**（不产空文件：空文件进指纹会把「没选」和「选了空的」混成同一字节）。
4. 单元格净化走 design §7.7 的既有路径安全闸，M4 不新写净化器。

### FR-7 组包接入
1. `packages/core/src/pack/resolve.ts`：`ResolveDeps`（`:16-21`）加 `playbooks`；`StaleDetails`（`:45-50`）加 `playbookIds: string[]`；`resolvePack`（`:57`）用同一个 `pick`（`:30`）取快照并物化进 `ResolvedPack`（物化 map 形制照 terms `:112-118`）。
2. `EMPTY_SELECTION`（`:92-97`）的判定链加入 playbooks 腿——否则「只选技巧」被拒时用户看不到归因。能否成包本身属待裁⑤。
3. composer（`packages/core/src/pack/composer.ts`；terms 推送在 `:182`、skills 在 `:188-190`）push 新产物后，指纹（`:192-195` `fingerprintOf`）与 lock（`buildPackLock`，`packages/core/src/inject/lock.ts:27`，`files` 源自 `plan.files`）**应当无需改动即自动覆盖**——这条现在只是推断，必须由 §7.3 的变异反证转正：往 composer 加一条技巧产物后若指纹未变，说明 lock/指纹链有第二处硬编文件清单，届时先修链再谈 M4。
4. token 估算必须收录新文件：`CONTEXT_AUX`（`apps/server/src/lib/pack-assemble.ts:88`）漏收 ⇒ m6a FR-6 的 ≈token 系统性低估（阈值与系数单源 `packages/core/src/pack/size.ts:13-16`）。
5. 字节防线（`LIMITS.singleFileMaxBytes` / `packTotalMaxBytes`，现值 512KB / 2MB）自动适用于 `PLAYBOOKS.md`，警告不阻断的既有口径不改。
6. **正文交叉引用行是必改的第二处落点**：composer 现按 `resolved.terms.length` 往主上下文正文里写「见 `TERMS.md`（N 条）」（`packages/core/src/pack/composer.ts:123-126`，该行在 `:125`）。技巧若只产文件不产引用行，注入侧的 AI 无从知道 `PLAYBOOKS.md` 存在 ⇒ 同处加一条技巧腿。**代价要说清**：这条腿会改**被注入文件的字节**，不止新增一个文件，所以它是 §7.4 那条零回归断言的靶心（未选技巧时字节必须不变 ⇒ 引用行也必须不出现）。
7. lock 的 schema 与 `schemaVersion` **都不动**：`PackLockSchema`（`packages/shared/src/schemas/pack.ts:248-285`）的 `files` 是开放数组，`superRefine` 只查重叠登记与哈希一致（`:265-280`），`schemaVersion: z.literal(1)` 在 `:249` ⇒ 新增一个产物文件不需要 bump。技巧条目本身不进 lock（lock 记的是文件与期望哈希，不记选集）。

### FR-8 拆 `playbookIds` 闸（owner 裁 ⑫ 预留的那一步）
1. 删除 `packages/shared/src/schemas/pack.ts:18-23` 的 `.refine((ids) => ids.length === 0, …)`；**字段保留**，注释改写为指向本 spec FR-8（注释现文已预告「M4 上线时把这道闸拆掉即可」）。
2. 同批改判两条反向断言，不得留孤儿：`apps/server/test/packs.api.test.ts:252` 的 `IT-ERR-04`（现断「非空即 422 且 `fieldErrors['selection.playbookIds']` 含 `M4`」）转断「非空且指向已删除 ⇒ 422 `STALE_SELECTION`」；`packages/shared/src/shared.test.ts:61` 的「非空即拒」腿转断「非空且有效 ⇒ 进产物」。
3. **文档同步是拆闸的一半**（§0.3 第③步的既有落点，逐处点名）：`docs/specs/m6-standard-pack.md` §3 里 `playbookIds` 那行（现写「恒为 `[]`…非空即 422」）与 §6 第 3 条（现写「M4 上线时把这道闸拆掉是变宽」），两处必须与代码同批改判；`docs/dev-plan.md` §15.2 裁 ⑫ 格指向处同步。**只拆代码不拆文档 = 规格谎报**，且拆闸后那份文档会教用户做一件已经不报错的事。
4. **变宽的零回归硬闸**：`playbookIds` 缺省或 `[]` 时，产物字节与包指纹必须与拆闸前逐字节相同（凭据形态见 §7.4）。这条是 owner「拆闸不碎任何客户端」这句裁定的**可证伪版本**——不测它，拆闸就是一次无人负责的契约变更。
5. 已导出的历史包实例不回溯（design §7.8 版本与不可变、快照语义 m6a §6.2）：拆闸只影响拆闸之后新建/重导的版本。

### FR-9 预置 seed
1. 新文件 `content/seed/playbooks.json`，`{schemaVersion:1, items:[…]}` 形态照 `content/seed/terms.json`（该形态的断言在 `packages/core/src/db/seed.ts:79-82`）。
2. 注册**两处**、缺一处就是「seed 写了但从不装载」：`BUNDLES`（`seed.ts:26-30`）加一行；`scripts/seed-check.ts` 加 `checkPlaybooks`（照 `checkTerms` `:125`）与 `THRESHOLDS`（`:24`，现有 `termsMin`）新键。门槛数值属待裁③。
3. 装载路径复用既有 `runSeed`（首启 `apps/server/src/bootstrap.ts:165`，目录由 `defaultSeedDir()` `apps/server/src/lib/seed-dir.ts:13`；重灌走 `apps/server/src/routes/settings.ts:122`）。**不新建装载入口。**
4. 演示包是否自动带上精选技巧属待裁⑥（`apps/server/src/lib/default-pack.ts:83,231` 现硬编 `playbookIds: []`）。

### FR-10 Web UI
1. 新页 `apps/web/src/pages/PlaybooksPage.tsx` + `components/playbooks/`，路由 `/playbooks`，注册形制照 terms（`apps/web/src/App.tsx:14` lazy、`:37` Route）。
2. **书脊单字冲突必须先解决**：`apps/web/src/components/AppShell.tsx:21-28` 的 `NAV` 已用「库 / 词 / 技 / 流 / 项 / 包 / 设」七字，且**「技」当前指向 `/skills` = M2 Skill 台账**（`:24`）。M4 抢「技」要改 M2 的既有心智；不抢则须新增第 8 字。候选与推荐见 §8.2 ②。标签单源 `apps/web/src/i18n/zh.ts` 的 `nav` 块（现 7 键）。
3. 技巧卡按 `theme.md` §1 的 mode-by-surface（内容面 = 书斋排印）落到 FR-5 的组件形制（四段小标题 + 反例弱色），每个组件同批交付空 / 加载 / 错误 / 超长四态（DESIGN.md 的 Do 项）。
4. 不引入新色名：`tests/design-tokens.test.ts` 四条治理断言（裸色阶零残留、裸 hex 只住 token 源、用到的都在 `@theme` 声明、声明的都被引用）必须同批绿。

## 5. 输入 / 输出

- **输入**：手动 CRUD；M5 复盘回流（人工确认）；预置 seed。
- **输出**：`PLAYBOOKS.md`（经 M6 组包 → CLI 注入），以及列表/搜索的只读检索服务。
- **不做**：M4 自身不写用户项目文件、不直连任何 AI 工具、不参与 adapter 清单（`packages/adapters/src/index.ts:2`：TERMS/CHECKLIST/SKILLS/manifest 由 composer 生成，M4 沿用该分工）。

## 6. 边界与异常

1. `verified=true` 而 `evidence` 为空 ⇒ 422，归因到 `verified` 字段（FR-4.1 的收紧是双向的）。
2. `related*` 指向已删除资产 ⇒ **照 terms 的既有语义：拒绝，不静默丢**，M4 不新造规则。三项同源证据（现取）：闸是模块私有函数 `validateRelatedIds`（`packages/core/src/repos/terms.ts:75`，非法即 `throw`，`:88-90`），`create` 在 `:123`、`update` 在 `:163` 各过一次；既有断言腿标题 `relatedTermIds 自指或引用不存在 → VALIDATION_ERROR`（`packages/core/src/repos/terms.test.ts:85`）。⇒ M4 的 `relatedPromptIds` / `relatedTermIds` / `relatedSkillIds` 三条共用同一把闸；§7.1 必须有对应的自指/不存在两型负向腿。
3. `status` 从 `published` 改回 `draft` ⇒ 已导出实例不变（快照语义），只影响之后的重导。
4. 空选集：`playbookIds: []` ⇒ 不产 `PLAYBOOKS.md`；「只选技巧、其余全空」能否成包属待裁⑤，未裁前 `resolvePack` 保持现行为（拒 `EMPTY_SELECTION`）。
5. seed 自然键撞车 ⇒ 走 `runSeed` 既有的 `SeedBundleResult`（`seed.ts:17-24`）形态：计入 `skipped` 并留 warning，不报错、不产生第二条同键记录（用户改过 ⇒ seed_hash 为 NULL 的条目按既有纪律同样跳过）。
6. 库中是否存在历史脏数据（拆闸期隐患）：闸自 `be0c885`（owner 裁 ⑫ 的落地笔）起就一直拦着，故 `standard_packs.selection`（`0001_init.sql:138`，表名 `standard_packs` 在 `:133`）JSON 里 `playbookIds` 非空**应为 0 行**；这不是假设，须由 §7.5 探针②实测为 0 才允许拆闸。若非 0，先做数据侧归零再拆。
7. 迁移与 FTS 触发器不同批 ⇒ 检索静默永空（无报错面），§7.2 的建表腿必须同时断言三触发器存在。
8. 超长条目（四段全打满 `LIMITS`）⇒ 渲染不得截断也不得撑破 `singleFileMaxBytes`，超线走既有警告通道（不阻断，m6a §6.4 的字节防线与 token 通道相互独立）。
9. **收窄选集不会自动退场**（既有行为，M4 只是多一个受影响的文件）：`buildPackLock` 对「包更新后消失的旧文件」是**原样留档、sync 不清理**（`packages/core/src/inject/lock.ts:40-44`，该处注释点名 m6b §6.2 / §6.10 的换包路径；退场归 `openvibe clean`，其断言腿含 `CLI-CLEAN-13`）。⇒ 从「带技巧」改回「不带技巧」重注入后，`PLAYBOOKS.md` 仍留在项目里且仍登记在 lock，而主上下文文件被新字节覆盖 ⇒ 出现「文件还在、正文不再提它」的半退场态。M4 **不新写退场逻辑**；§7.6 有人工腿要求写明「退场走 `clean`，不靠重注入」。

## 7. 验收标准（pass/fail）

> 纪律：§13-9——本节**不写测试支数与具名上界**，只写文件 + describe/it 标题 + 复跑命令；§13-8——任何实测数字必须与取数命令、采样 sha 同处。

### 7.1 结构与收紧（可自动化）
- 族名 `UT-PB-*`（unit 项目，新文件 `packages/shared/src/playbooks.test.ts`）：断言 FR-1 三必填、`antiPractice` 可空、`LIMITS` 超限、`verified` 无证据即拒、`status` 两态闭集。取数：`npx vitest --project unit --run packages/shared/src/playbooks.test.ts`。
- pass：`verified:true` 且 `evidence:[]` 的这一支必须 fail-fast（负向腿，缺它整族可信度归零）。

### 7.2 存储与检索（可自动化）
- 族名 `CORE-PB-*`（unit，新文件 `packages/core/src/repos/playbooks.test.ts`）：建表与三触发器存在（`sqlite_master` 查询，断言含 `playbooks_fts_ai` / `_ad` / `_au`）、`search` 命中中文与 `tags`、`findByNaturalKey` 幂等、`sortForMd` 码点序稳定性（同输入两次调用逐字节相同）。
- 迁移号：现取 `ls packages/core/src/db/migrations/` 的最大号为 `0005`，本模块占 `0006`（登记于 DEV_LOG，勿在此写死未来号）。

### 7.3 组包接入（含变异反证）
- 族名 `IT-PB-*`（integration，新文件 `apps/server/test/playbooks.api.test.ts`）：六端点、`STALE_SELECTION` 的 `playbookIds` 腿、`CONTEXT_AUX` 计入（技巧条数变化 ⇒ ≈token 必须变化）、`EMPTY_SELECTION` 归因。
- **FR-7.3 的推断转正**：构造两个包定义（同 prompts/terms/skills/flow，仅一个带 1 条技巧），断言二者**指纹不同且 lock `files` 差一条 `PLAYBOOKS.md`**。若指纹相同 ⇒ 链路上有第二处硬编清单，本条 fail 且 M4 不得开工 FR-8。

### 7.4 拆闸零回归（FR-8.4，A 级契约面）
- **凭据本体 = 契约快照断言**：`npx vitest --project unit --run tests/golden.test.ts`（`tests/**` 归 unit 项目；根 `package.json` 只有 `golden:update` 一条脚本，**没有 `golden:check`**，所以复跑命令必须写成 vitest 形态而不是 pnpm 脚本名）。断言住在 `tests/golden.test.ts` 的 `GOLDEN · 标准包契约快照` describe，`G1/G2/G3` 三支，它同时断「快照文件集 == 组包产物文件集」与「逐文件字节相等」——正是 §8.2 ⑦ 那句「指纹变没变」的可复算形态。未选技巧时三条必须全绿且 `git status -- tests/golden/` 无改动。
- 带 ref 锚的那一条（§13 DoD 第 7 条，不带 ref 的是空转凭据）：`git diff --name-only <拆闸前 sha>..HEAD -- tests/golden/ content/seed/` → **0 行**。
- 不留孤儿文档（FR-8.3 的文档半拆闸）：`grep -n 'playbookIds' docs/specs/m6-standard-pack.md | grep -E '恒为|非空即|未上'` → **0**。现测该文件有两处命中（§3 的 `playbookIds` 行写「恒为 `[]`…非空即 422」、§6 第 3 条写「非空同样阻断…M4 上线时把这道闸拆掉是变宽」），两条都必须在拆闸那笔里改判。
- 不留孤儿断言：`grep -n 'IT-ERR-04' apps/server/test/packs.api.test.ts` 命中行的断言目标须已从「422 拒绝」变为「`STALE_SELECTION`」，读该支标题即可判（人工复核腿，截图归档）。
- **反向闸**：`grep -n '非空即拒' packages/shared/src/shared.test.ts` 命中行（现写「PackSelection：playbookIds 非空即拒（M4 未上，owner 裁 ⑫）」）必须同批改判——它是 §7.1 `UT-PB-*` 的反向腿，留着就等于拆闸后有一条断言在教用户「技巧进不了包」。

### 7.5 探针（先跑，结论回填本 spec 才能定稿）
1. **terms 关联口径（本条已闭合，结论落 §6.2）**：拒。取数命令留档供复核：`npx vitest --project unit --run packages/core/src/repos/terms.test.ts`，读 §6.2 引的那条腿标题即可判（本轮实测于采样 sha `6246cb7`）。
2. **脏数据（本条已闭合，结论落 §6.6：实测 0 行，前置解除）**：取数于本机实例库的**只读副本**（`cp ~/.openvibe/data/openvibe.db{,-wal,-shm}` 到临时目录后 `sqlite3 -readonly`，避免对活库加锁）。
   - `select count(*) from standard_packs` → **1**
   - `select count(*) from standard_packs where instr(selection, '"playbookIds"') > 0` → **1**（键确实存进 JSON，排掉「列里根本没这键」型假 0）
   - `select count(*) from standard_packs where instr(selection, '"playbookIds":["') > 0` → **0**（本条判据）
   - **正对照**：同一形状对非空数组的腿 `instr(selection, '"termIds":["') > 0` → **1**，证明「`[\"` 匹配非空数组」这个模式本身有效，上面的 0 不是失配。
   - **口径与限度**：采样 sha `6246cb7`、副本 1,683,456 B（库文件 mtime 09-30 09:04 + WAL 16,512 B）。**只证这台机器**——本地优先单实例，不存在共享库，故此读数对「拆闸会不会撞上历史脏数据」是充分的（每个用户的历史脏数据只能在各自机器上归零，所以 FR-8 开工时必须把这条探针写成**执行前自检**而不是已完成的证词）。
3. **NAV 单字实况（本条已闭合，结论落 §8.2 ② 与 FR-10.2）**：`grep -n 'hz:' apps/web/src/components/AppShell.tsx` → 命中 **7 行**（`:22-28`），已用集合 = **库 / 词 / 技 / 流 / 项 / 包 / 设**，其中「技」在 `:24` 指向 `/skills`（M2 台账）。候选 **巧 / 训 / 例 / 坑** 四字**均未被占用**（7 行里无一命中），故 §8.2 ② 的「新增第 8 字」路线在代码层无冲突，只待 owner 选字。

### 7.6 人工腿（可截图归档，不接受「体验良好」类措辞）
- 截图目录 `docs/devlog-evidence/DEV-0074/`：① 技巧卡四态（空 / 加载 / 错误 / 超长）；② `ReflowActions` 面板出现第三个目标并落一条 `draft`；③ 组包向导第 2 步可选技巧、第 5 步预览出现 `PLAYBOOKS.md` 且 ≈token 随之变化；④ 未选技巧时导出目录**不含** `PLAYBOOKS.md`。
- 判读表由执行人逐条勾，每条给出「看到什么算过」。

### 7.7 未验证面（负向登记，不得读成已通过）
1. win32：本仓的 skip 形态是**测试作者手工落的 `it.skipIf(IS_WINDOWS)` 门控支**（既有例：`apps/cli/test/clean.test.ts` 的 `06e` 符号链接逃逸），FTS 三触发器与 `seedHash` 幂等**没有任何同类门控支**⇒ win32 上这两处既非通过也非主动跳过，而是**从未验证**。本机 darwin 绿不覆盖它。
2. 真实浏览器点击：本轮全部断言止于 jsdom 与端点级，`docs/` 里凡写「已验证 UI」须带裸 CDP 真输入凭据。
3. `PLAYBOOKS.md` 被六类工具实际读取后的效果：属外部工具行为，本 spec 只承诺字节与契约。
4. 多用户与并发写（M7）：本 spec 的写路径假定单进程 SQLite 单用户。

## 8. 依赖

- 上游：PRD 3.2-M4 / D22 / owner 裁 ⑫；design §5、§7。
- 平级：`m6-standard-pack.md`（FR-8 的文档同步落点，见 §4 FR-8.3）、`m6-cli-injection.md`（注入与 lock 面）、`m3-glossary.md`（`relatedTermIds` 与 `related*` 同形态）、`m5-project-flow.md`（复盘回流的数据源 `dev_log_entries`；**注意 m5 现 v1.1 的 FR-8 是端口面板，本模块与它无关**）、`theme.md`（卡片形制与颜色闸）、`seed-content.md`（预置内容审校流程，M4 seed 若走同一审校闸须登记裁决列）。
- 不做跨模块承诺：M4 不提供注入、不提供 skill 分发、不提供团队评审。

### 8.2 待裁清单（owner 裁完才能升 v1.0；每条给候选与推荐）

| # | 问题 | 候选 | 推荐 | 未裁的后果 |
|---|---|---|---|---|
| ① | 技巧进**独立 `PLAYBOOKS.md`** 还是并入主上下文新节 `## 实战技巧` | A 独立文件；B 新节（动 `PACK_SECTION_ORDER` 的「流程→规则→术语→参考」四节冻结序） | **A**：B 会让所有既有包指纹变化，FR-8.4 的零回归硬闸直接失效 | 拆闸是否「变宽」无法证明 |
| ② | 书脊第 8 个单字（「技」已被 M2 台账占用） | 巧 / 训 / 例 / 坑；或改 M2 的字 | **新增「巧」**，不动 M2 既有字（改字 = 改用户肌肉记忆，收益为零） | 导航出现两「技」或 M2 心智被打断 |
| ③ | 三处门槛数值：四段 `LIMITS` 上限、`THRESHOLDS.playbooksMin` | 参照 terms（定义 4KB / 示例 2KB / 词条 ≥100） | 建议 `practice` 4KB、`scenario`/`problem` 各 1KB、seed ≥10 起步 | 无门槛 = `seed:check` 不拦空库，M4 上线即「有模块没内容」 |
| ④ | seed 自然键 | `scenario` 唯一；或 `(scenario, problem)` | `(scenario, problem)`：同场景下多条不同问题应共存 | 重灌时静默 skip 掉该更新的条目 |
| ⑤ | 「只选技巧、其余全空」能否成包；`verified` 是否参与排序 | 能 / 不能；参与 / 不参与 | **不能**（技巧缺场景上下文时单发价值低）、排序不参与（确定性优先） | `EMPTY_SELECTION` 归因写不出来 |
| ⑥ | M4 精选技巧是否自动进 `default` 演示包 | 进 / 不进 | **不进**（首启零内容风险小，且演示包字节变了会牵动 §7.4 那条契约快照断言） | 开箱体验与契约快照谁先动，实现时才决定 = 返工 |
| ⑦ | 待裁① 派生：选 A（独立文件）时，包**指纹与 lock 登记到底变不变** | 不变（新增文件名只在被选时出现）／变（正文交叉引用行 FR-7.6 改了主上下文文件字节） | 判**会改**并把它写成 FR-7.6 的靶心断言，而非等实现时才发现 | 「一个包能产几种字节」无人能答，`sync` 的漂移/冲突判定与 `clean` 的退场集合都会读成含糊 |

### 8.3 M7 的边界（本 spec 不替 owner 决定）

PRD 3.2-M7 三行（多用户与角色 / PR 式评审 / 共享库与使用统计）是**能力清单**，不是可判定需求；且与产品既有根设定冲突——现形态是单进程本地服务 + 单文件 SQLite + `127.0.0.1` 端口锁定（m5 FR-8 那套 `strictPort` 5144 纪律），「多用户」在此架构下要么走服务端（推翻本地优先）、要么走文件同步（与 M6 双向同步撞面）。**M7 需要先有一份「架构前提裁定」，再谈八段式 spec**；该裁定单已另立 `docs/specs/m7-team-collab.md`（v0.1，§4 FR 有意留空），本模块的「团队共享库」Out 行以那份文件的 **P-1/P-2/P-3** 三裁为准，本轮不在此替 owner 决定。**另记一处 M7 的归属面漂移**（取数 `grep -rn 'M7' docs/specs/*.md`，采样 sha `6246cb7` 工作树）：M7 在四份兄弟 spec 的 Out 格里各有一个名字，且互不覆盖——`m1-prompt-library.md §2 范围 Out 栏`「团队评审流」、`m3-glossary.md §2 范围 Out 栏`「社区提案-审核流」、`m5-project-flow.md §2 范围 Out 栏`「多人协作 / 指派（注：`assignee` 字段已预留）」、`m6-standard-pack.md §2 范围 Out 栏`「团队包共享与评审」。⇒ **M7 的「一」实际是四张 Out 里的四条不同能力**，PRD 3.2-M7 的三行没有指定谁来收口这四条。另一侧的空白同样实测：`grep -n 'M7' docs/decisions.md` → **0 命中**（全库零裁定记录）。**并纠一处我初稿写错的读法**：`m5-project-flow.md §2 范围 Out 栏` 那句「assignee 字段预留不启用」我原本读成「库里已有该列、只是没启用」，实测否证——`grep -rn 'assignee' packages apps | wc -l` → **0**，代码里从来没有这个字段，所以它是**命名占位**而非 schema 债。该措辞留给 m5 自己改（不属本 spec 的落点），此处只登记读数口径：**读到「字段预留」时先 grep 代码，别按 schema 事实用**。
