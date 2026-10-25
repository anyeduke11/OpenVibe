# SPEC · v0.2.3 批次 C：核心收拢（G3 · CS1–CS6 + 只读段级 diff）

| 项 | 值 |
|------|------|
| 模块 | **v0.2.3 · 批次 C / 目标 G3**。对应 PRD `docs/PRD-v0.2.3-v1.0-20261024.md` 第 4 章的 RQ6（核心收拢，展开为 CS1–CS6）与 RQ4（只读段级 diff） |
| 优先级 | **P1**。判级构成：CS2 与 RQ4 为 **B**，其余为 **C**（行为不变的重构与文档）。逐项判级见 §4；一切判级均为预判，判级权在 owner（dev-plan §0.3） |
| 上游 | `docs/PRD-v0.2.3-v1.0-20261024.md`（§1 E4–E7/E9、§5 CS 表、§9 反例 4）· `docs/analysis-2026-10-02-first-principles.md`（AD4-4a 段级 diff；FP5 治理边界：收拢的是维护工时不是记录量）· `docs/specs/m9-dev-language-roadmap.md`（第二产品线声明的对象）· eslint.config.js R1–R5（分层 zone，本 spec 不新增不改语义） |
| 下游设计 | `docs/design.md` §7.3（整文件受管 + 块标记预埋——段级 diff 的切分依据；**升契约的 4-c 不在本版**）· `packages/core/src/inject/planner.ts`（五状态判定，**不改**）· `tests/golden/`（字节级契约快照，本 spec 全程**零重基**）· `packages/core/package.json`（CS1 的 exports 子路径落点） |
| 关联任务 | **无**（任务号待本 spec 裁定后在 tasks.md 另起） |
| 版本 | **v1.0（2026-10-25）**。§8.2 两处按既成事实收口（复盘补记，owner 复盘指令授权）；CS1–CS6 + RQ4 全部落地并有用例背书（[DEV-0118/0139/0140/0141/0147]） |
| 采样 | 2026-10-24 本机工作树 |

---

## 1. 目标与用户价值

- PRD E4/E5/E6/E7 四条证据指向同一件事：packages/core 的「领域包」口径被两股力量稀释——**CI 守卫与规格解析器住在产品出口里**（约 3000 行）、**M9 以未声明第二产品线的身份长进核心包**（36 个非测试模块 / 12 张表 / 21% API 面）；外加三笔明确的债（种子双轨、8 处复制 SQL、267 个零消费导出）。
- 本 spec 的价值主张是**让未来的每一次改动更便宜**：core 里找注入逻辑不再先翻过 836 行版权扫描器；改语言层种子内容的行为与主通道一致；barrel 收窄后类型检查与打包面变小。
- **防蔓延声明**（PRD E9 的直接回应）：现有全部闸门测的是「一致性」不测「范围」——M9 体内扩张正是从所有闸下溜过去的。CS6 的产品线边界声明是对「范围」立闸的第一步。

## 2. 范围

| **In** | **Out（明确不做，写明理由与去向）** |
|---|---|
| CS1 守卫迁出：`@openvibe/core/tooling` 子出口 + 主出口移除 re-export + scripts/tests 改导入 | **删除守卫功能**。迁出是归位不是裁撤；`docs:check`/`m9:fingerprint` 等闸一条不减 |
| CS2 种子纪律归一：5 个 m9 播种器接入 seed_hash 三态合并（**唯一一处语义修正**） | **改主通道 `db/seed.ts` 语义**——它是对的，是 m9 侧向它看齐 |
| CS3 upsert helper（8 处 → 1 处） | **动 `seed_registry` 表结构**（helper 只收拢 SQL 文本，不改 schema） |
| CS4 死模块处置（4 个，逐条 owner 裁） | **一次性清零 barrel**——CS5 分三批，每批 ≤80，不设死线 |
| CS6 产品线边界声明 + 迁移号段规则（文档 + 可选机判） | **M9 任何功能增减**（学习线冻结，PRD §3.2） |
| RQ4 只读段级 diff（报文细化，不改写入） | **段级选择 / 段级受管 / `schemaVersion` 升位**（AD4-4b/4c，留给 RF4 契约定型批：owner 签字 + 独立复核 + golden 重基） |
| — | **`update` / `rollback` 子命令**（依赖段级写盘，PRD §3.2） |

## 3. 现状与实测基线（采样：2026-10-24）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 守卫模块体量 | `m9-external-content-scan.ts` **836 行**、`m9-time-window-guard.ts` **578 行**，消费者均为 scripts/tests，且从主出口 re-export（`index.ts:64-65` 自注「采集脚本也用它」） | `wc -l packages/core/src/db/m9-external-content-scan.ts packages/core/src/db/m9-time-window-guard.ts`；`grep -n 'm9-external-content-scan' packages/core/src/index.ts` |
| 2 | 种子双轨 | 主通道 `db/seed.ts`：seed_hash 三态合并 + 用户改动保护；5 个 m9 播种器：一次性 INSERT OR IGNORE，文件头自陈「老库不会自动更新」 | `sed -n '10,25p' packages/core/src/db/m9-p1-seed-lang-topics.ts` |
| 3 | upsert 复制 | `ON CONFLICT(bundle) DO UPDATE SET content_hash...` 逐字出现 **8 处 / 7 文件** | `grep -rn 'ON CONFLICT(bundle) DO UPDATE SET content_hash' packages/core/src --include='*.ts' \| wc -l` |
| 4 | 疑似死模块 | 4 个：`m9-topic-terms` / `m9-topic-filter` / `m9-p1b-readme` / `m9-p1f-grade-guard`（仅测试引用） | `grep -rln 'm9-topic-terms' apps packages scripts tests --include='*.ts'`（仅 test 命中） |
| 5 | barrel 体量 | `packages/core/src/index.ts` **511 行**，约 420 符号，其中 267 个 core 之外零消费 | `wc -l packages/core/src/index.ts` |
| 6 | 分层强制 | eslint R1–R5 五条 zone + `tests/lint-boundary.test.ts`（规则本身被测试锁住）——CS1 的 zone 变更若违规会当场红 | `sed -n '15,38p' tests/lint-boundary.test.ts` |
| 7 | 块标记预埋 | 产物首尾已有 `<!-- openvibe:pack=... begin/end -->`；`planner` 按**整文件 sha** 判五状态——RQ4 只加报文，不动判定 | `grep -n 'openvibe:pack' packages/core/src/pack/composer.ts \| head -2` |
| 8 | 迁移占用 | **0001–0018** 已用，下一空号 **0019**（批次 D 的前置锚点） | `ls packages/core/src/db/migrations/ \| tail -3` |
| 9 | 测试基线 | 163 文件 / 2095 用例全绿（收拢的安全网） | `pnpm test` |

## 4. 功能需求（FR）

### FR-1（CS1）守卫迁出产品出口（**C 级**）

1. `packages/core/package.json` 增加 `exports` 子路径 `./tooling`，指向 `src/tooling/` 入口。
2. 迁移清单：`m9-external-content-scan`、`m9-time-window-guard`、`m9-p1b-spec` / `m9-p1d-spec` 系规格解析器，以及基线 #1/#4 中消费者仅为 scripts/tests 的模块——逐条列清单随实施登记，判据 = 「该模块的生产消费者集合为空或仅 scripts/tests」。
3. 主出口 `index.ts` 移除上述 re-export；`scripts/` 与 `tests/` 改从 `@openvibe/core/tooling` 导入。
4. 验收：主出口 grep 守卫模块 0 命中；新增用例断言 `import('@openvibe/core')` 导出面不含守卫符号；CI 全绿。

### FR-2（CS2）种子纪律归一（**B 级：语义修正**）

1. 5 个 m9 播种器接入主通道同款 seed_hash 三态合并：内容没变跳过 / 变了且用户没改过则更新 / **用户改过则跳过并保持沉默保护**。
2. 「一次性 INSERT OR IGNORE」保留为同语义的实现细节（首装路径），注释改为指向主通道口径；**移除「老库不会自动更新」语义**。
3. 验收：① 改一条 m9 种子内容 ⇒ 已装库 reseed 后生效（新用例）；② 用户改过该行 ⇒ reseed 跳过（新用例）；③ 主通道与 m9 通道对同一行的合并行为用同构断言比对。

#### FR-2 · 第二段设计预研（2026-10-24 立档；**同日第二段已落地** [DEV-0141]，落定值见状态列；转任务时按分析文 §10-8 重采）

**第一段已交付**（[DEV-0139]）：迁移 0019（10 张 lang 播种表加 `seed_hash`，不回填）+ `seed-merge.ts` 的 `mergeSeedRow` 五动作 + lang_topics 播种器三态化（12 用例）。**机制**：seed_hash 存「上次播种内容的哈希」；判「用户没动过」= 现内容重算哈希 == stored——不需要存旧内容。**unchanged 必须双比**（新种子==上次播种 且 现内容==上次播种），单比会把用户改过的行误判 unchanged（CS2-02 当场抓到并修正）。老行（NULL）一律按用户态对待、**不回填**。

**第二段范围与逐表设计**（现状 = 第一段实测）：

| 播种器 | 表 | 业务键 | 内容列（入哈希） | 现状语义 | 第二段动作 |
|---|---|---|---|---|---|
| m9-p1-5 | `lang_concepts` | `slug` | title / summary / content_level（`updated_at` 记账列） | `ON CONFLICT(slug) DO UPDATE` **无条件覆盖** | ✅ mergeSeedRow 化（clobber 消除）。⚠️ 登记纠缠：p1-5 的「概念挂接」会回写 `lang_topics.summary`（【概念层】前缀）——那是派生态不是种子内容，保持无条件写；与 p1-seed 的 summary 内容列的双源根治留第三段设计题 |
| m9-p1-5 | `lang_topic_content` | `(ref_kind, ref_id, kind)`——**裁定已落**：迁移 **0020** 去重 + 唯一索引 `uq_lang_topic_content_ref`（历史无键表先按 rowid 保留最新去重） | body_md / content_level（updated_at 记账列仅 INSERT 写入） | update-then-insert（无条件覆盖 body_md） | ✅ mergeSeedRow 化（`LANG_TOPIC_CONTENT_MERGE_SPEC`） |
| m9-p1-6 | `lang_concept_deltas` | `concept_id + lang + aspect + since_version` | summary / until_version（supersedes 是第二遍按 id 回填的链路数据，不在内容列、保持原样） | `ON CONFLICT(…) DO UPDATE` **无条件覆盖** | ✅ mergeSeedRow 化（第一遍） |
| m9-p1d | `lang_profile_phases` | `UNIQUE(profile, lang, ord)` | label / title / duration_label / points / outcome | `ON CONFLICT DO UPDATE` 无条件覆盖 | ✅ mergeSeedRow 化（`PROFILE_PHASES_MERGE_SPEC`） |
| m9-p1d | `lang_topic_profiles` | `(topic_id, profile)`（ON CONFLICT 实测） | depth / required / rank / est_minutes | `ON CONFLICT DO UPDATE` 无条件覆盖 | ✅ mergeSeedRow 化（`TOPIC_PROFILES_MERGE_SPEC`）；「清陈旧行」DELETE 逻辑保持原样 |
| m9-p1-7 | `lang_topic_edges` | `(topic_id, prereq_topic_id)` | 无内容列 ⇒ 无覆盖面 | INSERT OR IGNORE | ✅ **登记保留 IGNORE**（无内容列即无 clobber 面，引入 merge 只添复杂度） |
| m9-p1-7 | `lang_topics.stage_id` 写回 | 与 **m9-p1-seed 的 contentColumns（含 stage_id）双写** | — | UPDATE 可重入 | ✅ **裁定改判：写回保留**。理由：存量库的「118 行 stage_id 全 0」修复依赖它（合并的用户态保护会让 0 站位老行永不更新——正是修不动的死结）。双源根治（站位数据并入 topics json、p1-7 只写 edges）留第三段设计题 |
| m9-p1b | `lang_resources`（键 `lang+name`）/ `lang_vibe_resources`（键 `` `group`+name``，保留字列已由 helper 加引号）/ `lang_topic_resources`（键 `(topic_id, resource_id)`） | 各内容列（is_fav/star/phase_id 为用户态/登记列，仅 INSERT 写入——收藏不被 reseed 冲掉） | INSERT OR IGNORE | ✅ mergeSeedRow 化（三表各一 SPEC） |

**force 语义**（预判，owner 裁）：默认永远保护用户态；「放弃用户态、强制回种子」做成**显式 CLI 旗标**（未来 `reseed --force` 形态，per-bundle 粒度），server 的 reseed 端点**不提供** force——强制覆盖属于装机者动作，不是面板按钮。替代兜底：覆盖前本来就有备份目录。

**测试矩阵（每表同构）**：五动作各一支（用 0019 后真迁移的临时库）+ e2e 两例（修订生效 / 用户手改保留）+ 列序无关一支（parse 契约见 `seed-merge.test.ts` 的风险⑤防线用例）。

**诚实条款**：本表是**设计预研**不是裁定——`lang_topic_content` 的键裁定与 p1-7 退化裁定改变行为，开工前须 owner 各签一次（B 级）。

### FR-3（CS3）upsert helper（**C 级**）

抽 `seedRegistryUpsert(bundle, contentHash)` 单源；替换 7 文件 8 处逐字复制。验收：基线 #3 的 grep 仅剩 helper 一处；全部播种器用例绿。

### FR-4（CS4）死模块处置（**C 级**，逐条 owner 裁）

4 个疑似死模块逐条裁定三选一：接入生产（如 `m9-topic-terms` 若为回流候选的既定零件）/ 移入 `src/tooling/` / 删除。验收：core 内不存在「零生产消费者」的 src 模块——新增一条守卫测试（对 src 下每个非测试模块断言存在生产或脚本消费者）。

### FR-5（CS5）barrel 三批收敛（**C 级**）

每批 ≤80 个零消费符号，先清纯类型/常量；scripts 侧改深路径导入以减少 barrel 依赖。验收：每批后 CI 绿 + `wc -l index.ts` 下降值登记 DEV_LOG；不设一次清零死线（分析文 FP5：收拢工时，不追仪式）。

### FR-6（CS6）产品线边界声明与迁移号段规则（**C 级文档 + 可选 B 机判**）

1. docs 增补「产品线边界」节：分发线（M1–M8 的库→包→注入→回流闭环）与学习线（M9）各自的范围、共享面（shared schema、SQLite 库文件）与不共享面；声明落点建议 README 或独立 `docs/product-lines.md`（owner 裁）。
2. 迁移号段规则：`lang_*` 域迁移占用独立号段，核心域不与 lang 域混号；规则写入 dev-plan §0 邻域并过 docs:check。**本规则是批次 D 的开工前置**（D 的两个新迁移按规则落号）。
3. 可选机判（B）：「m9/守卫模块不得出现在主出口」静态断言，与 FR-1 验收共用。

### FR-7（RQ4）只读段级 diff（**B 级**）

1. `diff` 报文从「文件级 DRIFT」细化为段级：按包渲染文本与磁盘文本按既有 begin/end 标记切段对比，逐段给「段名 + 变更行数」；段外自由区显式标注「永不触碰」。
2. **五状态判定与 `--strategy` 语义零变化**（整文件 sha 仍是决策单位）；产物字节零变化（golden 零重基）；写入路径一行不改。
3. 验收：1000 行文件改 1 行 ⇒ 报文给出段名与行数；既有五状态用例全绿；golden 快照逐字节不变。

## 5. 输入 / 输出

- **输入**：基线 §3 的全部现测事实；批次 D 对号段规则的前置需求。
- **输出**：`@openvibe/core` 出口收窄后的包；归一后的种子通道；helper 单源；死模块处置清单；产品线边界文档；段级 diff 报文；每批 DEV_LOG 登记。

## 6. 边界与异常

- **行为零变化是硬闸**（CS2 的显式修正除外）：任一 CS 条目若导致用户可见行为变化，当场回退该条目并登记（PRD §9 反例 4）。
- **收拢让位**：批次 A/B 滑期 ⇒ 批次 C 整体后移，不切割（PRD §7 让位规则）；CS 内部顺序 CS3 → CS2（helper 先行），CS1 与 CS4/CS5 可并行，CS6 最后。
- **不动冻结面**：design §7/§8、golden 快照、lock 形状、遥测白名单、eslint 既有 zone 语义——全部只读。
- CS1 迁移模块时若发现某「守卫」其实有生产消费者 ⇒ 移出迁移清单并登记（判据是消费者集合，不是文件名前缀）。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 |
|---|---|---|
| 1 | CS1 | 主出口 grep 0 命中；导出面用例断言；`pnpm lint` / `lint-boundary` 绿 |
| 2 | CS2 | reseed 生效 + 用户改动保护两条新用例绿；「老库不更新」注释及行为消失 |
| 3 | CS3 | 复制 grep 归一；播种器用例全绿 |
| 4 | CS4 | 守卫测试（零生产消费者 = 0）就位；4 模块处置各有 DEV_LOG 登记 |
| 5 | CS5 | 每批 CI 绿 + 行数下降登记；批次总数 ≤3 |
| 6 | CS6 | 边界文档落盘并过 docs:check；号段规则可被批次 D 引用 |
| 7 | RQ4 | 段级报文用例（长文件改 1 行）；五状态与 golden 零变化 |
| 8 | 全程 | 每条目完成时 `pnpm test` 全绿 + `docs:check` 全绿 + DEV_LOG 登记 |

## 8. 依赖

### 8.1 依赖

- 无发布依赖（不依赖批次 A），可与 A/B 并行；**CS6 是批次 D 的开工前置**。
- 测试安全网：2095 用例（基线 #9）；golden 快照是「行为零变化」的机器裁判。

### 8.2 裁定记录（2026-10-25 收口；两处按落地既成事实补记——独立复盘发现本 spec 停在 v0.9 而事已全决）

1. **CS4 四模块去向**：topic-terms / topic-filter / p1b-readme **接入生产**（`GET /api/lang/topics/:id` 的 attached_terms、`GET /api/lang/topics`、`GET /api/lang/resources/readme`，[DEV-0139]）；grade-guard **保留为仓库卫生闸**（`pnpm m9:grade-guard`，扫源码非 db，无 server 接缝）。
2. **CS6 边界声明落点**：`docs/product-lines.md`（含迁移号段规则与派生列清单，被 0021–0023 落号实际引用）；可选机判由 `tests/tooling-face.test.ts` 承担（工具面符号不得进主出口）。

### 8.3### 8.3 让位规则

批次 C 整体让位于 A/B（不切割）；CS2 是唯一 B 级语义修正，若 owner 对「老库自动更新」有保留，可将其降级为「登记现状 + 提供显式 reseed 指引」，其余 CS 不受影响。
