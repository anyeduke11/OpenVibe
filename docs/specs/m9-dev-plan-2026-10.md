# M9 v1.6 详细开发计划（2026-10-19 派生自 `m9-dev-language-roadmap.md` v1.6）

| 项 | 值 |
|------|------|
| 模块 | **横切能力**（与 `m9-dev-language-roadmap.md` 同源 —— 本计划是该规格 §9 的子任务级展开） |
| 状态 | ✅ **v1.6 同步**。规格 v1.6 commit `26ee979` 后落仓；本计划随规格版本号同步刷新，**不独立发版** |
| 版本 | **v1.6（2026-10-19）· 首次落仓**。⚠️ 本计划不复制规格的判据、人日、待裁口径，只把它们落到子任务、依赖、周次、待裁决策时点这一层。**判据与人日冲突时以规格为准**（见 §10 第 4 条「不允许改本计划不改规格」） |
| 角色 | 单开发者（owner 本人）· 5 人日/周 · 不切给子 agent · 38 人日 / 8 周主线 |
| 角色与节奏 | 角色、节奏、commit 纪律见 §1 · 周甘特见 §2 · 关键路径见 §3 · 待裁决策时点见 §4 |
| 下游 | P0 的夹具 → `tests/m9-discipline.test.ts`；P1 的迁移 → `0011_lang_topics.sql`；P3 的页面 → `apps/web/src/pages/dev/`（新建）；§11 的配套检查器 → `tests/m9-spec-consistency.test.ts` |

> ⚠️ **本计划是 §9 的展开**，不是替代。规格在 `docs/specs/m9-dev-language-roadmap.md`（v1.6，本仓 commit `26ee979`），本文**不复制判据与人日的口径**，只把它们落到子任务、依赖、周次、待裁决策时点这一层。
> 判据、人日、待裁含义有冲突时，**以规格为准**；本文也按这条写自检（见 §11）。

---

## 0. 一页摘要

| 项 | 值 |
|---|---|
| 来源规格 | `m9-dev-language-roadmap.md` v1.6（commit `26ee979`） |
| 累计人日 | **38 人日**（P0=2 · P1=4 · P1b=4 · P1c=2 · P1d=6 · P1e=3 · P1f=3 · P2=2 · P3=4 · P4=5 · P5=3） |
| 11 期分组 | 三组：纪律闸（P0）· 知识点+资源+模式（P1/P1b/P1c/P1d/P1e/P1f）· 派生与界面（P2/P3/P4/P5） |
| 关键路径 | P0 → P1 → P1b → {P1c ∥ P1d} → P1e → P1f → P2 → P3 → P4 → P5 |
| 待裁 | 9 条（第 6/8 条⛔，第 8 条必须在第 6 条之后定） |
| 50 条判据 | 50 ＝ 17 界面形态已跑 ＋ 28 仅能靠单测 ＋ 2 需真实环境 ＋ 3 需人工确认 |
| 角色 | **单开发者**（Duke 本人），以本仓既有节奏反推人日；不切分给子 agent；review 计入返工时间 |
| 排期 | 5 人日/周 → **约 8 周完成主线**（不含 P5 等 Pi 接入与待裁阻塞） |
| 本计划产物 | 一份计划 + 一个 `tests/m9-spec-consistency.test.ts`（配套 spec 自检） + 每周一次 owner sync 看 9 条待裁进度 |

---

## 1. 角色与节奏

- **开发者**：Duke 本人，**单线程**。不切给 worker 子 agent（子 agent 写代码易越界与规格约束，且难与判据对齐）。
- **节奏**：5 人日/周（按本仓 P1/P2/P3 各 2–4 人日的实测值）。**不含 review 与返工**，若发生返工需在下一周 plan 里显式登记。
- **代码评审**：每个 phase 出口走一次「自检 → 提交 → owner 同步」三步；自检必须以**本仓五闸 + M9 自检 + 变异腿**为准，不靠人眼。
- **每周末强制 sync**：把本周实际人日 vs 估算写入本计划 §9「实际进度」，与规格 §6.3 待裁状态同步刷新。

---

## 2. 总体时间线（8 周甘特，5 人日/周）

```
       W1   W2   W3   W4   W5   W6   W7   W8
P0     ##                                    （2d）
P1        ###                                （4d · 跨 W2）
P1b           ####                           （4d · W2–W3）
P1c              ##                           （2d · W3）
P1d              ######                      （6d · W3–W5 · #6 须在 W3 末定）
P1e                    ###                   （3d · W5–W6）
P1f                       ###                （3d · W6 · #8 须在 W6 末定）
P2                          ##                （2d · W6–W7）
P3                          ####              （4d · W7）
P4                              #####         （5d · W7–W8）
P5                                 ###        （3d · W8）
─────────────────────────────────────────────
       W1   W2   W3   W4   W5   W6   W7   W8
合   2    6    4    3    5    5    4    5   ＝ 34 + 4 缓冲 = 38
```

⚠️ **甘特是估，不是合同**：实际进度在 §9 周更；缓冲 4 人日（1 周）放在 P3/P4 之间吸收返工。

⚠️ **三条硬次序（来自 §9.1）**：
- P0 最先，DL-25 缺陷不阻塞任何东西但**晚发现代价最大**；
- P2 必在 P3 前（文案纪律与算法同批落地）；
- P5 必在 P4 后（Pi 未接入时 T2 的降级形态就是它必须的行为）。

---

## 3. 关键路径

```
P0 → P1 → P1b ┬→ P1c
              └→ P1d → P1e → P1f → P2 → P3 → P4 → P5
```

| 关系 | 原因 | 拖延代价 |
|---|---|---|
| P0 → P1 | P1 的 `computeState()` 测试靠 P0 夹具（DL-25 缺陷的最小复现面） | 没夹具时缺陷要等 P2 才发现 |
| P1 → P1b | 资源挂接要求 `lang_topics` 在场（DL-31 关键级条目挂接） | 资源先做就只能挂到空 topics |
| P1b → P1c | 巡检脚本写 `lang_resources` 表（DL-30 写死） | 巡检无处写 |
| P1b → P1d | NEC 矩阵计算依赖六类字段在 `lang_resources` 上 | 矩阵无法用 |
| P1d → P1e | P1e 的转档/标记用 P1d 的 phase 与 `lang_topic_profiles` | 转档映射没数据 |
| P1d → P1f | P1f 的「模式推荐值由阶段推导」需要 `lang_profile_phases` 21 段 | 推导公式空跑 |
| P1e → P1f | P1e 的转档写入 `lang_topic_state`（覆盖）后 P1f 的「深链落点」才能验 | #8 待裁落点不对就验不出 |
| P1f → P2 | P2 的掌握度推导把模式字段排除在 `computeState()` 入参（DL-34），需 P1f 完成后才能验 | P2 提前做会覆盖 P1f 的"模式不影响掌握度"约定 |
| P1/P2 → P3 | 页面文案与算法必须同批 | 文案与算法漂移 |
| P3 → P4 | P4 抽屉需要 P3 的「开发能力」侧栏入口 | 抽屉没入口 |
| P4 → P5 | P5 解读只对 P4 发现的勾选片段入参 | T2 误把未勾选片段送出去 |

---

## 4. 九条待裁决策时间表（⚠️ 这是 owner 必看的清单）

| 待裁 # | 一句话 | 卡住哪期 | ⚠️ **决策周次** | 不定的连锁影响 |
|---|---|---|---|---|
| 1 | 「掌握」阈值 N=3 | P2 | **W6**（P2 开工前） | DL-25 字面量 / `computeState()` 判定 |
| 2 | 负面状态文案 | P2 + P3 | **W6**（P2+P3 开工前） | DL-05/DL-07 文案常量 |
| 3 | 收录非中文源 | P1 | **W1**（P1 开工前；本轮默认已取中文源） | 采集脚本范围 |
| 4 | 知识点可否自建 | P1 | **W1**（P1 开工前） | DL-04 守卫范围 |
| 5 | 三段内容节奏 | P1 | **W2**（P1 中段） | DL-15 / 24 条取舍 |
| **6** | ⛔ **精通/熟悉必学集是否真正分开** | **P1d** | **W3 末** ⛔ | DL-33 / DL-35 / §3.20 资源标记档数 |
| 7 | 首次进入是否默认速成 | P1e | **W5** | DL-38 渲染断言 / onboarding 组件 |
| **8** | ⛔ **「熟悉→精通」中间态怎么表达** | **P1f** | **W6 末** ⛔（**必须在第 6 条之后**） | DL-33 三层包含 / `lang_profile_phases` schema |
| 9 | 成才方案是否入库 | P1f | **W5** | 是否新增 `lang_eval_*` 表（破零新增表承诺） |

⚠️ **W3 末 / W6 末** 是关键截止 —— 这两次没定，P1d / P1f 就开不了工。W3 末前一周发提醒（见 §10 文档维护纪律）。

---

## 5. 开工前清单（来自 §9.2 + 本轮新增）

开工前必须就位，否则 P0 写完卡住：

1. **`DESIGN.md` 登记 `.tag` 形制**（§9.2 第 1 条；**P3 的新增 chip 全部要等它**）—— 联系 owner 加一节；本计划期间不允许动 `DESIGN.md`。
2. **Go / Python 真实项目样本**（§9.2 第 2 条）—— 找 1 个真实 Go 仓库（用 go-zero 之类有 `go/parser` 能识别的语法），1 个真实 Python 项目（不是 P0 的合成夹具），作为 P4 的 DL-19 / DL-22 真实环境验证。**候选**：本仓 `packages/adapters/src/adapters.test.ts` 用过的 fixture 仓库；**不允许把合成夹具当真实项目跑**。
3. **`tests/m9-spec-consistency.test.ts` 落地**（P0-pre 任务，见 §11）—— 把规格的 DL-44/45/46 + §3.17.1 的 21 段逐格比对 + §3.22 四块条数全数收进仓内 vitest。**这是 M9 唯一在零产品代码时就能跑的判据集**，落不进仓就等于规约"零通过"永远零通过。
4. **本仓禁列扫描器接到 `lang_*` 命名空间**（P0 子任务，提前到 P0-pre）—— 否则 P0 写完还得回头接。

---

## 6. 任务清单（11 期 × 子任务 × 判据）

每个子任务格式：**{内容} / 判据 / 依赖 / 人日**。

### 6.1 M9-P0 夹具与三条纪律闸（**2 人日**）

- **P0.1** Python 夹具 `packages/core/src/fixtures/m9/sample.py` —— 含「抄了 20 次同一段」与「有 goroutine 但无其他证据」两支 / **DL-25** / - / 0.5
- **P0.2** Go 夹具 `packages/core/src/fixtures/m9/sample.go` —— 同上两支 / **DL-25** / - / 0.5
- **P0.3** 禁列扫描器接 `lang_*` 命名空间 —— 复用本仓既有禁列扫描器，加 namespace 限制 / **DL-16** / - / 0.5
- **P0.4** 「未勾选片段不得出网」入参捕获测试 `tests/m9-discipline.test.ts` —— 用 node 内建 fetch mock，断言捕获的入参里**只有勾选过的片段** / **DL-18** / P0.1, P0.2 / 0.5
- **P0 出口**：`pnpm test tests/m9-discipline` ＋ `pnpm typecheck` ＋ `pnpm lint` 全绿

### 6.2 M9-P1 知识点库与 DAG（**4 人日** · 子任务 P1.1–P1.10）

- **P1.1** 迁移 `0011_lang_topics.sql` —— §3.1 的前 6 张表（lang_concepts / lang_concept_deltas / lang_topic_content / lang_topics / lang_topic_edges / lang_topic_terms） / **DL-04 DL-12 DL-13 DL-26 DL-06 DL-24** / P0 / 1
- **P1.2** runoob Python3 84 条入库 —— 只入标题/摘要/链接/取证日；正文一字不进仓 / **DL-01 DL-02 DL-14** / P0 / 0.5
- **P1.3** runoob Go 34 条入库 —— 同上 / **DL-14** / P1.2 / 0.25
- **P1.4** 84 + 34 两条清单的可复算分类（库级 36% ± 抽样误差） / **DL-13** / P1.2, P1.3 / 0.25
- **P1.5** 概念层 8 个三段内容（步骤/样例/原理解析）—— 写满 / **DL-15** / P0 / 1
- **P1.6** 语言差异层 —— Python 与 Go 在 8 个概念上的差异条目（since_version / until_version） / **DL-24** / P1.5 / 1
- **P1.7** 分站与前置边 ＋ 无环守卫 —— `m9-topic-dag.ts`（112 条前置边，Python/Go 各自成 DAG）＋ `m9-p1-7-topic-stages.ts`（库级/杂项分流） / **DL-04 DL-12** / P1.1 / 0（原估内）
- **P1.8** 外部层三件套 —— `m9-external-content-scan.ts`（DL-02 教程正文零进仓守卫）＋ `m9-topic-terms.ts`（DL-06 挂接不反向写 terms）＋ `m9-topic-filter.ts`（DL-14 两门可筛选） / **DL-02 DL-06 DL-14** / P1.1, P1.2 / 0（原估内）
- **P1.9** 采集脚本 `scripts/collect-m9-sources.ts` —— runoob 两门 118 条逐条可复算（只入标题/摘要/链接/取证日，正文一字不进仓） / **DL-01 DL-02** / P1.2, P1.3 / 0（原估内）
- **P1.10** 停更源必须标红 —— `packages/core/src/db/m9-source-freshness.ts`：新鲜度按 **§1.5 登记**算（**不设天数阈值**），六份清单各带 `source_freshness` 段（停更源带停更日期 ＋ 标红文案；每份**自报参照日 `computed_at`** ⇒ 重新采集后闸不误红） / **DL-03** / P1.8, P1.9 / 0（原估内）
- **P1.11** 文档里的实测数字必须与实跑值相等 —— `packages/core/src/db/m9-doc-numbers.ts`：从 **dev-plan §6.2 的 P1 出口条件**与 **spec §1.4 三档表**（45 / 30 / 9）把实测数字读出来，与实跑逐项对账（三处出处两两相等 ＋ 都等于实跑） / **DL-13 DL-26**（同一手法：doc ↔ 实跑） / P1.7, P1.8 / 0（原估内）
- **P1 出口**：`pnpm test` 全绿 + 「lang_topics 节点数 = 78 + lang_topic_edges 不成环」+ §3.1 表数复算 17 ✓ —— ⚠️ **节点数订正过三轮，只认这一版**（owner 裁定「接受实测值」；订正链见 spec §1.4 的下游同步注记）：**路线节点口径**（库里 `kind='language'` 的知识点总数）实测 **Python 语言知识点 46 ＋ Go 语言知识点 32 = 78**（P1.4 分类规则把 Go 34 条源条目里的 7 条判成库级/杂项，不进学习路线；P1d 再补建冷门底层六条：Python ＋1 元类 · Go ＋5）⇒ 复算：`python3 packages/core/src/db/seeds/_build/build-lang-topics-stages.py`；＋ **DL-03 停更源标记**（六份清单各带 `source_freshness` 段，停更源带停更日期 ＋ 标红文案）⇒ 复算：`npx vitest run packages/core/src/db/m9-p1-10-source-freshness.test.ts`；＋ **文档里的实测数字 ↔ 实跑值对账**（⚠️ 「节点数」此前只活在注释里，文档与实跑之间**没有任何一处把它们绑在一起**）⇒ 复算：`npx vitest run packages/core/src/db/m9-p1-11-doc-numbers.test.ts`

> ⚠️ **上面 P1.7–P1.11 的「人日 0（原估内）」是什么意思** —— 它们**不是计划外的新范围**：
> spec §9 的 **M9-P1 判据列本就把 DL-01/02/03/04/12/13/14/15 列在 P1**；
> P1.7–P1.9 是 P1.1/P1.2/P1.3 的**判据守卫与采集**（实施中形成的期次编号），
> P1.10 是 **DL-03**（此前 §9 列了它、§6.2 却没给它子任务行 ⇒ 两份台账不一致，本轮补上），
> P1.11 是**让 P1 出口条件可复算**（「节点数 = 78」这条条款一直在计划里，只是**没有闸盯它** —— 同一条款里的「表数复算 17」由 DL-26 盯着，两条待遇不一样）。
> ⇒ **§6.2 前六行已占用全部 4 人日**，故这几行不新增人日。
> ⚠️ **但「实际投入是否超出原估 4 人日」本轮未计量** —— 重估要连带改 §0 累计人日（38）、
> spec §0 速览（≈38 人日）、spec §9 M9-P1 行（4）与甘特周次（8 周 × 5 人日/周），**属 owner 决定**；
> 本轮只把子任务台账补齐，**不擅自改口径**。这条欠账**登记在此，不静默留着**。

### 6.3 M9-P1b 资源层 ＋ 挂接（**4 人日** · v1.6 扩为全量）

- **P1b.1** 提取附件 89 条资源（PY_DATA + GO_DATA）→ `seed/lang_resources.json` —— 落仓脚本 `scripts/extract-m9-guide-resources.ts`（**附件路径走命令行，不落仓**；仓内 demo 原型是同一份数据的副本，但**丢了 `TIER` 映射与速成专区的六个字段** ⇒ 不能当上游）/ **DL-47** / P1 / 0.5
- **P1b.2** `lang_resources` 迁移 ＋ 9 字段闭集 ＋ **tier 列** ＋ 必学/推荐/可跳过 必要性由**三模式 × 六档 tier** 矩阵现算（⚠️ **矩阵的轴是 tier，不是展示分类** —— 见 spec §1.6.1 的 2026-10-20 订正）/ **DL-47 DL-48** / P1b.1 / 1
- **P1b.3** `lang_vibe_resources` 11 条（VIBE_TOOLS 6 + VIBE_TUTS 5）—— 不带分类/费用/阶段维度（⚠️ 附件**有**费用/阶段/精选，是按 **DL-41 刻意不落库**；**描述与时效（d/f）落了**）/ **DL-41** / P1b.1 / 0.5
- **P1b.4** 87 个去重 URL 的探测调度（同一 URL 只发一次 HEAD；连续 2 次失败标灰不删） / **DL-30 DL-47（主键部分）** / P1b.2 / 0.5
- **P1b.5** `lang_topic_resources` 单向多对多挂接 + 要点级条目每条至少一条去处 / **DL-31** / P1b.2, P1 / 0.5
- **P1b.6** 导出 README.md（只导链接不导正文 / 零本机路径 / 条数一致） / **DL-32** / P1b.2 / 0.5
- **P1b 出口**：`lang_resources` = 89 行 ＋ `lang_vibe_resources` = 11 行 ＋ leetcode.cn 与 7days-golang 各占 2 行 ＋ 巡检 HEAD 实际只发 87 次 ＋ **每行 tier 落在 a/b/c/d/e 五个值内** ＋ **矩阵 × tier 现算 == spec §1.6.1 记的三档分布**（精通 53/36/0 · 熟悉 25/28/36 · 速成 8/0/81）＋ **118 个要点级知识点逐条有去处** ⇒ 复算：`npx vitest run packages/core/src/db/m9-p1b-resources.test.ts`

> ⚠️ **P1b 本轮订正了三处规格**（都是「文档说的」与「附件实测的」对不上，**以附件为准**）：
> ① **必要性矩阵的轴是 `tier`（a/b/c/d/e/v），不是展示分类**（official/github/course/book/video/practice）——
>    两者**恰好都是六项**，肉眼看不出来；而按错的轴算出的分布与 spec 记的数**对不上**（六类计数 13/19/16/14/13/14 里**没有任何子集能加到 53**）⇒ 实为**矩阵列头写错**，**分布那三个数一直是对的**（spec §1.6.1 已订正，分布数字不动）。
> ② **`lang_topics.content_level` 补列** —— §3.11 要求、DL-31 的判据要遍历它，而 §3.1 的列清单当时漏了 ⇒ 0012 用 `ALTER TABLE ADD COLUMN` 补上（默认 `'point'`）。
> ③ **`lang_vibe_resources` 补 `freshness` 列** —— 附件那 11 条**有**描述与时效；此前说「只有名称与 URL」是**照着 demo 副本**说的（副本丢了那六个字段）⇒ 现在描述与时效都落了。
> ⚠️ **这三条订正不新增判据、不改判据数**（仍 50 条）、**不新增表**（仍十七张）、**不新增待裁**（仍九条）。

### 6.4 M9-P1c 失效巡检（**2 人日**）

- **P1c.1** `scripts/check-m9-links.ts` —— HEAD only，状态码与计数落库 / **DL-30** / P1b.2 / 1
- **P1c.2** `lang_vibe_resources` 纳入同一脚本（11 条 AI 工具站文档改版频繁） / **DL-30** / P1c.1 / 0.5
- **P1c.3** 手动触发入口（不进启动流程） / - / P1c.1 / 0.5
- **P1c 出口**：连跑两次失败 ⇒ `alive=0` ＋ **行仍在表里** ＋ 单次失败 `alive=1`

> ✅ **P1c 已产出**（本轮）：
> - **P1c.1** —— `scripts/check-m9-links.ts`（**真出网**）＋ `packages/core/src/db/m9-p1c-links.ts`（执行侧：Node 标准库 `http`/`https` 的 HEAD，**零第三方依赖**）。落库的只有 `last_status_code` / `consecutive_fails` / `alive` / `last_checked_at` 四列 —— **响应体零落库**（传输层返回值**只有状态码**，没有 body 通道）。
> - **P1c.2** —— **同一支脚本**覆盖两张表：主清单 89 行（**87 个去重 URL**）＋ 速成 11 行（11 个 URL）⇒ 合计 **98 个去重 URL**（两张表实测无交集）。**状态机与去重规则仍只有一份**（`m9-p1b-probe.ts`，P1b.4 建、P1c.2 扩到第二张表）⇒ 改阈值只改一处。
> - **P1c.3** —— 手动入口 `pnpm m9:links`：**默认 dry-run**（只列计划，**一个请求都不发、库一个字都不改**），`--execute` 才真出网；`--db` / `--seed` / `--json` / `--all` / `--timeout` 五个开关。**不进启动流程**由单测钉住：app 目录下**零引用**巡检模块。
> - **DL-30 三支的证据**：本地起**真的** HTTP 服务（真 socket、真 HEAD、真状态码）—— ① 服务端收到的 method 全是 `HEAD` 且请求体 **0 字节**；② 连跑两次失败 ⇒ `alive=0` 且**行数一条不少**；③ 单次失败 ⇒ `alive` 仍为 1。**变异腿实跑**：把 `FAIL_THRESHOLD` 改成 1 ⇒ 第 ③ 支与 P1b 的两支**当场变红**（已复原）。
> - **DL-03 的 P1c 半**（§7 里 DL-03 一行的「巡检时发现已停更 ⇒ 并入失效巡检」）—— 资源层的「已过时」由 **`tier='e'`** 承载（附件 tier 图例逐字：e = 过时补充，**机器可读**），巡检把它与存活三档**并排输出**且**不算「有效来源」**（`verdictOf().usable=false`）。⚠️ **不用 `freshness` 文案做关键词匹配** —— 那等于再造一份口径（关键词表），必然漂移。⚠️ **tier='e' 的行数不写死**（spec §1.6.1 钉的是 `old` 10 条，不是 tier 分布）—— 单测 ⑧ 断言「巡检报告里的过时行数 == 库里的 tier='e' 行数」；实测那批行**全部落在附件 `old` 标记的 10 条里**，余下 1 条是 tier c（内容偏旧但仍在主线 ⇒ 由文案承载，已登记在 `lang_resources.json` 的 `_notes.old_note`）。**源级停更（`awesome-python-cn` 停更 4 年）不归本模块** —— 那是 P1.10 的 `m9-source-freshness.ts` 按 spec §1.5 登记负责的**知识点出处侧**，两层不混。
> - **P1c 出口复算**：`npx vitest run packages/core/src/db/m9-p1c-links.test.ts`（12 支）＋ `npx vitest run packages/core/src/db/m9-p1b-resources.test.ts`（39 支，P1b 侧未受影响）

### 6.5 M9-P1d 三模式层（**6 人日** · v1.6 填满时间线 · ✅ #6 已于 2026-10-20 闭合）

- **P1d.1** 提取附件 21 段分期 → `seed/lang_profile_phases.json`（脚本 `scripts/extract-m9-guide-phases.ts` + 解析 tl-block） / **DL-49** / P1b / 0.5
- **P1d.2** 冷门底层条目（runtime/反射/unsafe/cgo/pprof/元类）按 #6 决定补 / 是否真实分开 / **DL-33 DL-35** / #6 / 1.5
- **P1d.3** `lang_profile_phases` 迁移 21 行 ＋ 产出栏前缀逐字保留（产出 10 · 练习 2 · 跳过 2 · 空 7） / **DL-49** / P1d.1 / 1
- **P1d.4** `lang_topic_profiles` 迁移（topic × 模式；depth/required/rank/est_minutes） / **DL-33 DL-36** / P1d.2 / 1
- **P1d.5** 速成专区作为静态内容（**但 6 段时间线照常显示**） / **DL-35** / P1d.3 / 0.5
- **P1d.6** 两套阶段分工约束实现：lang_topics 无 phase 列；§3.6 表与 §3.22.1 表共存且不映射 / **DL-50** / P1d.3 / 0.5
- **P1d 出口**：21 行 + 7 段空产出 + 3 种前缀齐全 + #6 待裁已收

> ✅ **P1d 已产出**（本轮；owner 2026-10-20 裁定 §6.3 第 6 条取「**真正分开**」）：
> - **P1d.1** —— `scripts/extract-m9-guide-phases.ts`（**零第三方依赖**，正则解析 `tl-block`/`tl-item`/`tl-time-d`/`ph-name`/`ph-weeks`/`ul li`/`out`）＋ 种子 `packages/core/src/db/seeds/lang_profile_phases.json`（**21 段**）。脚本自带**五重自检**：21 段 / 每语言每模式段数 / 产出栏前缀分布（**产出 10 · 练习 2 · 跳过 2 · 空 7**）/ **与 spec §3.17.1 逐格对账** / 每段要点 ≥2；支持 `--check`（只查不写）。⚠️ **附件路径走命令行参数**（仓内零本机路径）。
> - **P1d.2** —— **6 类冷门底层条目补建到完整内容**：知识点（`lang_topics_advanced.json`，6 条 · `kind='language'` · `content_level='full'`）＋ 概念层 6 个 ＋ **三段内容 18 段**（步骤/样例/原理解析，全部自撰）＋ 前置边 6 条 ＋ 资源挂接 12 条。⚠️ **三段内容挂概念层而非 topic 侧**（DL-15：loader 主动拒绝 `ref_kind='topic'`）⇒ 概念层从 8 个变 **14 个**（8 共通 ＋ 6 语言专有）。⚠️ **出处链接逐条 HEAD 核实**（2026-10-20，`go.dev/cgo/cgo.html` 已 404 ⇒ 换 `pkg.go.dev/cmd/cgo`）。
> - **P1d.3** —— 迁移 `0013_lang_profiles.sql`：`lang_profile_phases`（21 行 · UNIQUE(profile,lang,ord) · `points` 存 JSON 数组文本 ＋ `CHECK json_valid`）＋ `lang_topic_profiles`（复合主键 (topic_id,profile) ⇒ **查表不许 ORDER BY**，排序放 JS）。装载器 `m9-p1d-seed-profiles.ts`。
> - **P1d.4** —— `lang_topic_profiles` 的 **234 行由代码现算**（`m9-p1d-mode-assign.ts`）⇒ **不落种子 JSON**：`topic_id` 是自增行号（换个库就不是同一个数），快照在别的库上是错的；且**口径只留一处**。三条规则：① 必学集只从 `kind='language'` 里选（库级不进路线，DL-12）② 深度按模式给上限（master=full / familiar=concept / vibe=headline）③ 顺序按站序与能力序。
> - **P1d.5** —— 速成专区四块静态内容（**6 能力 · 每门 7 项最小知识 · 4 步工作流 · 6 翻车点**）落在 `m9-vibe-static.ts`（**不建表、不进 DAG、不参与掌握度**）＋ spec §3.17.2 的**逐字对照面**；**6 段时间线照常进 `lang_profile_phases`**（时间线是时间，其余四块是叙述，两者不混）。
> - **P1d.6** —— DL-50 守卫 `m9-p1d-stage-phase-guard.ts`：`lang_topics` **无 phase 类列** ＋ 仓内**无「站↔段」映射表** ＋ **反证支**（§3.6 两列分工表与 §3.22.1 三套分段表都在，且都写了「不映射」）。⚠️ **反向判据必须配真变异的腿**：本轮真 `ALTER TABLE` 加过 `phase_id`、真在临时目录建过 `lang_stage_phase_map`。
> - **速成必学集的口径** —— 由附件 CHAPTER 06 的 **6 项能力**反推；其中「会反馈 / 小步迭代 / 会兜底」是**工作流能力** ⇒ 属静态内容，**不映射知识点**；真正映射的是「看得懂 / 会运行 / 读报错」三支（Python 15 条 / Go 16 条，分钟合计 131 / 137）。⚠️ **分钟数只算「看懂并能提问」**，不含练习与做项目。
> - **P1d 出口复算**：`npx vitest run packages/core/src/db/m9-p1d-mode-profiles.test.ts`（25 支）＋ `npx vitest run packages/core/src/db/m9-p1d-vibe-static.test.ts`（5 支）＋ `npx vitest run packages/core/src/db/m9-p1-11-doc-numbers.test.ts`（15 支，节点数改判后的对账闸）

### 6.6 M9-P1e 模式交互层（**3 人日**）

- **P1e.1** 转档组件（速成专区底部「这些学够了，下一步 →」弹层） / **DL-37** / P1d / 1
- **P1e.2** 首次进入的一次性提问组件（一个主问题 + 两个选项 + 「跳过」出口） / **DL-38** / P1d / 1
- **P1e.3** 资源页两档模式标记（由必学集合反查派生） / **DL-39** / P1d, P1b.2 / 0.5
- **P1e 出口**：转档文案不含「已完成」字样 + 跳过与选速成渲染逐字相同

> ✅ **P1e 已产出**（本轮）：
> - **P1e.1** —— `apps/web/src/components/dev/ModeTransferPanel.tsx`（速成专区底部「这些学够了，下一步 →」弹层 · Radix `DialogPanel` ＋ 既有 note 形制，**不新增形制**）。**只给位置不给结论**：文案写「你已经站到第 N 站之前」，**不写「已完成第 N 站」**；一条都没点亮时回落「精通路线完整 **N** 站，从第 1 站开始」（**N 按该语言实测站数给出** —— Python 8 站 / Go 6 站）。⚠️ 弹层里**必须有一句提醒**：速成是看懂并能提问，精通是能独立写出。
> - **P1e.2** —— `apps/web/src/components/dev/ModeOnboarding.tsx`（**一个问题 ＋ 两个选项 ＋ 一个出口**）。⚠️ **「跳过」与「速成」走同一个代码入口**（`chooseVibe`）⇒ DL-38 的「渲染逐字相同」成为**结构上必然**。**折叠 ≠ 隐藏**：精通/熟悉**折叠成一行**「以后要深入再来」，该行在提问屏与速成落点屏**都常驻可点**（§3.19 第 4 条）。**落点不进 `lang_*`**：回调载荷只有 `'vibe' | 'master'`；组件源码里不得出现 `lang_topic_state` / `computeState` / `topic_id`。
> - **P1e.3** —— `apps/web/src/components/dev/ResourceModeChip.tsx`（两档 chip，**恒「图标 + 文字」**；点开列出「这条覆盖了本模式必学里的哪几条」）。**由必学集合反查派生**，与转档**共用同一个 `isRequiredIn`**（§3.20 第 3 条）。
> - **计算层落在 `@openvibe/shared`**（`m9-mode-interaction.ts` ＋ `m9-mode-guard.ts`）—— ⚠️ **不落 core**：转档站位与资源标记都**要在浏览器里现算**（资源标记随模式切换即时重算），而 `packages/core` 带 `better-sqlite3` 原生依赖、`apps/web` 没有指向它的 workspace 链接 ⇒ 放 core 就等于让 web 抄一份 ⇒ **两处口径必然漂移**。`LangProfile` 枚举随之迁到 shared（`m9-modes.ts`），core 侧从 shared **转出**（既有 import 路径不变，枚举仍只此一份）。
> - **顺带订正 spec §3.20 的一处误述**：P1d 写的「`familiar.required` 不再是 `master.required` 的子集」**把包含方向说反了**（给精通集加条目不会破坏 ⊆）—— 实测 **熟悉必学 72 ⊆ 精通必学 78**（熟悉必学而精通不必学 = **0** 条）⇒ **「熟悉用」仍是恒空分支** ⇒ **两档实施不仅正确，理由还更强**。spec §3.20 与 §6.3 第 6 条已同批订正。
> - **P1e 出口复算**：`npx vitest run packages/core/src/db/m9-p1e-mode-interaction.test.ts`（14 支）＋ `npx vitest run packages/shared/src/m9-mode-guard.test.ts`（14 支）＋ `npx vitest run apps/web/src/components/dev/`（21 支）

### 6.7 M9-P1f 阶段联动层（**3 人日** · ⚠️ #8 须 W6 末定）

- **P1f.1** `lang_stage_tracks` 照抄配套方案 **八格对照面**（落库 **6 行** · 阶段 0/1 不建 Go 行） / **DL-40** / P1d / 0.5
- **P1f.2** 模式推荐值由阶段推导（自选降级为覆盖） / **DL-40** / P1f.1, #8 / 1
- **P1f.3** Python 主线/Go 选学文案 + Go 默认收起 / **DL-40** / P1f.1 / 0.5
- **P1f.4** 深链锚点 `#mode-*` 优先于 onboarding 默认（带 hashchange） / **DL-43** / P1e / 0.5
- **P1f.5** `lang_vibe_resources` 11 条纳入 DL-30 巡检（已在 P1c.2 写过，此处确认 4 个新 seed 已落）/ **DL-41** / P1f.1 / 0.5
- **P1f 出口**：**6 行** tracks（八格对照面 · 阶段 0/1 Go 行数 = 0） + 三个 #mode-* 深链各自落位 + DL-42 职业等级断言守卫注入即报

> ✅ **P1f 已产出**（本轮）：
> - **P1f.1** —— `scripts/extract-m9-stage-tracks.ts`（**零第三方依赖**，从配套方案 §4 每个阶段对象的 `tracks` 数组抽 6 行）＋ 种子 `packages/core/src/db/seeds/lang_stage_tracks.json`（**6 行** · 逐字）。脚本自带**六道自检**（阶段数 4 · 轨道行数 6 · 阶段 0/1 无 Go · 阶段 2/3 每语言各 1 条 · 每行 `goals` ≥ 2 条 · **阶段 2 的矛盾仍在**）＋ **与 spec §1.7 第 ② 条八格逐格对账**；支持 `--check`（只对账不写盘）。⚠️ **附件路径走命令行参数**（仓内零本机路径）。⚠️ **取块必须按方括号配对计数**（`tracks` 里嵌着 `goals` 与 `links` 两个数组，取第一个 `]` 会截断）。
> - **⚠️ 不越 §6.3 第 9 条的线** —— 第 9 条的「只做外链，不入库」说的是配套方案那 **155 KB 评测专业域**（能力矩阵 / BARS / 四种评价方式 / SOP / 数据集选型）；本轮入库的只有**编程轨道**（阶段名 / 周期 / 语言 / 模式 / 要点，即 §1.7 取的那 5 条编程相关口径之一）。**阶段出口（`pass` 字段那类「评测能力」指标）与任何「职业等级」数据一条不入库** —— §1.7 第 ③ 条与 §3.21 第 4 条明写「开发能力绝不能声称能判断『你到了 L1』」⇒ DL-42 守卫守的正是这条边界。
> - **规格先订正（0011 迁移纪律：先订正规格再落列）** —— ① spec §3.1 与 §3.21 的 `lang_stage_tracks` schema 补齐**源文档逐字列**（`stage_name` / `period` / `source_mode` / `mode_name` / `goals` / `note`）；② spec §1.7 第 ② 条阶段 0 的 Python 格由「速成」订正为「**了解 · 速成**」（与源文档 `modeName` 及同表阶段 2 的 Go 格一致）；③ 「8 行 tracks」改为「**八格对照面 ⇒ 落库 6 行**」—— 原文自相矛盾（不建 Go 行 ⇒ 最多 6 行）；④ spec §9 的 P1f 行与合计说明里的「八行 / 8 行」同批订正。
> - **P1f.2** —— 模式推荐值由阶段推导（`recommendedProfileForStage`，取 `is_default=1` 的那行 ⇒ **Go 不参与默认**，否则两门等权并排，正是 §3.21 第 1 条要拆掉的东西）。⚠️ **自选降级为覆盖**：推荐值只是一个默认值，另外两档轨道仍在表里、仍可切过去。
> - **P1f.3** —— `apps/web/src/components/dev/StageTracks.tsx`（Python 带「**主线**」、Go 带「**选学**」＋ 写清适用方向；**Go 默认收起**，但**收起的那一行可点** —— DL-14 不变，收起的是**默认落点**不是把 Go 从产品里拿掉；阶段 0/1 **不渲染 Go 那一块**，不造「本阶段无 Go 轨道」的空卡；阶段 2 的 Python 显示派生出的「**熟悉**」**并把标注显示出来**，不把「熟悉 → 精通」当第三档摆出来）。
> - **P1f.4** —— `apps/web/src/components/dev/ModeDeepLink.tsx` ＋ `packages/shared/src/m9-stage.ts` 的 `resolveProfileFromHash`。**URL 片段优先于 §3.19 的 onboarding 默认模式**（用户是**从别人给的链接进来的**，那个链接指向哪一档就该落哪一档）；带 `hashchange` 跟随（同文档内切档不改路由）；提示条**只在深链命中时**出现（直接进入时不加这行噪音）。
> - **P1f.5** —— **确认**（不是新建）：`lang_vibe_resources` 11 条已在库（P1c.2 已落 · tools 6 ＋ tuts 5），`PROBE_TABLE_NAMES` 已含该表 ⇒ DL-30 的失效纪律对它**同样成立**（巡检所需四列 `last_status_code` / `consecutive_fails` / `alive` / `last_checked_at` 都在）。
> - **DL-40 三道闸** —— `packages/core/src/db/m9-p1f-stage-guards.ts`：库↔源**逐格**相等 ＋ 库↔spec §1.7 八格**逐格**相等 ＋ **反证腿**（阶段 0/1 的 `lang='go'` 行数必须 **= 0**）。⚠️ **断的是「那些行根本不存在」**，不是「那些行 `required=0`」—— 后者正是本判据要防的那种「建了空行再标 0」的做法。
> - **DL-42 守卫** —— `packages/core/src/db/m9-p1f-grade-guard.ts`：界面不得出现越过编程证据的职业等级断言。⚠️ **只认「对人的主语 ＋ 断言」结构**（主语必须是「你/您/用户/学员」，且中间段与前缀不得带否定/疑问标记）⇒ 规则说明里**引用**「你已达成 L1」是**必须能写出来的**。⚠️ **反向判据必须自证**：注入一条必被报出。
> - **阶段 2 的 Python：矛盾留在数据里，不替 owner 裁** —— 源文档 `mode:"mas"`（精通）却叫「熟悉 → 精通」⇒ §6.3 第 8 条待裁前**实现里不许偷偷选一个**：派生取「**熟悉**」**并带 `note` 标注**（spec §3.21 第 3 条的原话「如实暴露缺口，也比假装枚举够用强」）；两个源字段 `source_mode` 与 `mode_name` **都逐字保留**。⚠️ **§6.3 第 8 条仍是待裁**，裁定后本轮这一格的 `profile` 会变。
> - **计算层落 `@openvibe/shared`**（`m9-stage.ts`）—— `deriveStageTrack` 是 `profile` / `required` / `is_default` / `note` 四条派生规则的**唯一定义处**；core 侧只负责把源逐字字段入库 ＋ 调它现算 ⇒ **派生不落种子**（口径会随 §6.3 第 8 条裁定而改，落进种子就变成快照）。
> - **P1f 出口复算**：`npx vitest run packages/core/src/db/m9-p1f-stage-tracks.test.ts`（14 支）＋ `npx vitest run packages/shared/src/m9-stage.test.ts`（21 支）＋ `npx vitest run apps/web/src/components/dev/ModeDeepLink.test.tsx`（9 支）＋ `npx vitest run apps/web/src/components/dev/ModeDeepLink.mutant.test.tsx`（4 支）＋ `npx vitest run apps/web/src/components/dev/StageTracks.test.tsx`（13 支）

### 6.8 M9-P2 掌握度推导（**2 人日**）

- **P2.1** `computeState(topic, evidence)` 服务 —— 写进代码（§3.13 写进代码而不是写进注释） / **DL-25** / P0.1, P0.2 / 1
- **P2.2** 三态文案（「本项目用到过」/「本项目未涉及」/「掌握」） / **DL-05 DL-07** / P2.1 / 0.5
- **P2.3** 资源字段全部不出现在 `computeState()` 入参 / **DL-28** / P2.1 / 0.5
- **P2 出口**：P0 夹具跑通「20 次同一段」/「goroutine 单独」⇒ 封顶 `active`；P0-P1b 全套 fixture 跑过不出 `mastered`

> ✅ **P2 已产出**（本轮 · 2026-10-21）：
> - **P2.1** —— 纯计算层落 `@openvibe/shared`（`packages/shared/src/m9-state.ts`）：`computeState(topic, input)` ＋ `computeStates` ＋ `countEvidence` ＋ `ownStateOf`。⚠️ **§3.13 明写「写进代码而不是写进注释」** ⇒ 封顶与去重两条规则都落进了**可执行**的代码（`source_hit` 证据在场 ⇒ 状态上限 `active`；同一出处只计 1 次）。
> - **P2.2** —— 三态文案落 `MASTERY_STATE_LABELS`（「本项目用到过」/「本项目未涉及」/「掌握」）＋ 冷门说明常量 `COLD_TOPIC_NOTE`（「本项目永远可能用不到它（冷门知识点）」—— §6.3 第 2 条要求详情页写明）。
> - **P2.3** —— 入参只有**拓扑 ＋ 证据**两样（`MasteryInput` = `nodes` ＋ `byTopic`；`TopicEvidence` = `kind` ＋ `ref` ＋ `count`）⇒ DL-28 与 DL-34 **结构上成立**，不靠「实现时记得别用」。
> - **迁移 0015**（`packages/core/src/db/migrations/0015_lang_topic_state.sql`）—— `lang_topic_state` 的六列**逐字取自 §3.1**（`topic_id` · `project_id` · `state` · `evidence_kind` · `evidence_ref` · `computed_at`）；⚠️ **表数不变**（这张表在 §3.1 的十七张里早就有名字，只是 P2 才真正建表 ⇒ DL-26 复算仍 17）。
> - **落库服务**（`packages/core/src/db/m9-p2-state.ts`）—— 推导 ＋ 落库 ＋ 读回；⚠️ **先清后写**（「可重算、可丢弃」）；⚠️ **次数活得下来**：非源码证据出现 N 次落 **N 行**、源码证据同一出处**只落一行** ⇒ 读回来的证据**总数不变** ⇒ 「换算法后重算」这条路真的通（有一条测试专门复算一遍）。
> - **三道守卫**（DL-28 / DL-34）—— ① **运行时闭集**（`assertMasteryInput`：入参多一个键就**当场抛**，证据多一个键也抛，证据种类不在闭集内也抛）；② **类型层结构守卫**（`tests/support/m9-state-shape.ts`，用编译器 API 看**语法树**：接口成员集合 ＋ 函数参数表 ＋ 证据种类闭集）；③ **推导路径禁读表**（`packages/core/src/db/m9-p2-guards.ts`：推导源码里出现资源三表或模式三表的表名即红）。
> - **文案守卫**（DL-05 / DL-07）—— `findForbiddenMasteryCopy`：全仓（`apps/*/src` ＋ `packages/*/src`）**0 命中**「你已掌握」与「未触及」；⚠️ **扫前先去注释**（规则说明里必须能引用被禁形态）⇒ 扫的是去注释后的整段文本 ⇒ **JSX 文本也照样被抓到**（它不是字符串字面量）。
> - **⚠️ 三处规格张力，本轮各取一个方向并写进代码注释**（**未改规格**）：① **§3.3 的阶梯不是划分**（三行都只给了充分条件，没说「不满足时归哪一档」）⇒ 取**降级**方向（永远是低估，§3.3 已知不可靠处第 1 条）；⚠️ **副作用如实登记**：降级到 `unused` 时文案「本项目未涉及」严格说是**低估**。② **「前置」的判定口径**：若按**递归**理解，实测本仓 DAG 的祖先闭包最深 **14 层**、**63/72** 个知识点有前置 ⇒ 只有 9 个根知识点可能显示「本项目用到过」，三态形同虚设 ⇒ 口径写死为「**在用**这一档比前置的**自身状态**（不递归放大）、**掌握**这一档比前置的**最终状态**（递归 ⇒ 冷门知识推不出掌握）」。③ **阈值 N 数哪些证据**：§3.3 写「出现 ≥ N 次」，§6.3 第 1 条写「N 只对三类证据计数」，而 DL-25 要求「只有源码证据 ⇒ 必须停在 active」⇒ 本轮取**唯一能同时满足三条**的那个口径：「**出现过没有**」看总计数、「**够不够 N**」只看非源码计数、封顶另算。
> - **P2 出口复算**：`npx vitest run packages/shared/src/m9-state.test.ts`（31 支）＋ `npx vitest run packages/core/src/db/m9-p2-state.test.ts`（27 支）＋ `npx vitest run tests/m9-p2-guards.test.ts`（9 支）—— **67 支全绿**；⚠️ **P2 出口腿实跑**：真实 DAG 上给**每一个**知识点都喂四支夹具的源码证据 ⇒ **0 个**到 `mastered`（比「只喂一个知识点」更能暴露封顶被删）。

### 6.9 M9-P3 页面与侧栏（**4 人日**）

- **P3.1** NAV 侧栏新增「开发能力」（`assets` 组、紧随「术语」） / **DL-11 DL-10** / P1, P2 / 0.5
- **P3.2** 站列 + DAG 当前层 + 三态 + 完整度标记组件 / **DL-11** / P1, P2 / 0.5
- **P3.3** 详情页三段 + 差异 + 外链 + 术语挂接 / - / P1 / 0.5
- **P3.4** 双修规划时间线（9 段 · §3.22.1 静态面板） / - / P1d / 0.5
- **P3.5** 语言对照表（8 维 · §3.22.2 静态面板） / - / - / 0.5
- **P3.6** 练习原则常驻提示条（6 条 · §3.22.4 · 折叠机制见 §11.4） / - / - / 0.5
- **P3.7** `DESIGN.md` 登记 `.tag` 形制（owner 任务） / **DL-11** / - / 0.5
- **P3 出口**：设计系统四道闸（design-tokens.test.ts）依旧全绿 + 新增 chip 形制登记进 DESIGN.md

> ✅ **P3 已产出**（本轮 · 2026-10-21）：
> - **P3.1** —— 侧栏 `assets` 组**紧随「术语」之后**新增「开发能力」（图标 `compass`）＋ 路由 `/dev`（懒加载）；⚠️ 侧栏项文案放 `i18n/core.ts` 的 `nav.devAbility`，**没往 `i18n/zh.ts` 加键**（新组件一律就地定义文案常量，照 `TermFilterBar` 的 `L` 惯例）。
> - **P3.2** —— 站列（`StageColumn`，竖排 8 站 ＋ 站号**从 1 起**）＋ DAG 当前层（`TopicLayer`）＋ 三态 chip（`MasteryChip`，文案取自 P2 的 `MASTERY_STATE_LABELS`）＋ 完整度标记（`CompletenessMark`）；⚠️ 派生口径只落一处（`packages/shared/src/m9-roadmap.ts` 的 `deriveCurrentStage` / `stationCompleteness` / `stageNoOf`）。
> - **P3.3** —— 详情页（`TopicDetail`）：三段（缺段**不渲染**）＋ 差异 ＋ 外链 ＋ 术语挂接；⚠️ 冷门说明常驻（`COLD_TOPIC_NOTE`，§6.3 第 2 条）。
> - **P3.4 / P3.5 / P3.6** —— 三块静态面板：双修规划 **9 段**（精通 5 ＋ 熟悉 4，**照抄不推导**）／语言对照 **8 维** ＋ 选学顺序 **3 条**／练习原则 **6 条**（**不做可勾选清单**）。⚠️ 内容落 `packages/shared/src/m9-panels.ts`（**不建表**、随代码走），并配**逐格对账 spec §3.22** 的闸（`m9-panels.test.ts` 11 支）。
> - **P3.7** —— `DESIGN.md` 登记 `.tag` 形制 ＋ 状态 chip 六形制 ＋ M9 三态落法（见下方 DL-11 行）。
> - **本轮补的最小读接口**（计划未写，但页面不能是空壳）：`packages/core/src/db/m9-roadmap-read.ts`（`readRoadmap` / `readStates` / `readTopicDetail`）＋ 两个 GET 端点（`/api/lang/roadmap` · `/api/lang/topics/:id`）＋ `packages/shared/src/schemas/lang.ts` 的 zod 契约 ＋ `apps/web/src/hooks/useLangRoadmap.ts`。
> - **⚠️ 本轮各取一个方向的规格张力**（**未改规格**）：① **「你在第 M 站」规格无公式**（§3.5 只写了这句话，§2.3 说「由 ①② 推出」却没写怎么推）⇒ 按 §3.18 的站位语义取「**已点亮知识点的最大站号；一个都没点亮 ⇒ 第 1 站**」，文案只写「**你站到第 M 站**」不写「已完成第 M 站」。② **知识点 → 概念的挂接在库里没有结构化列**（`lang_concepts` 无挂接列，§3.1 也没列）⇒ 沿用 P1.5 装载器的落法（`lang_topics.summary` 的「**【概念层】标题：**」前缀）还原，还原不出就没有差异条目（**不编**）；⚠️ 前缀被改则挂接丢失（已知脆弱点）。③ **四块静态内容「不建表」** ⇒ 内容随代码走（`m9-panels.ts`），不落库、不进 DAG、不参与掌握度。
> - **⚠️ 本轮未挂载**：P1e/P1f 的既有组件（`ModeOnboarding` / `ModeTransferPanel` / `ResourceModeChip` / `StageTracks`）**仍未挂进页面** —— 它们要 `lang_topic_profiles` 的模式必学集，而本轮读端**没提供 profile 过滤** ⇒ 模式切换（精通/熟悉/速成）与转档弹层**未接线**；源码解读抽屉属 P4。
> - **P3 出口复算**：P3 相关 **72 支**全绿 —— 侧栏 4（`AppShell.nav.test.tsx` · P3.1）＋ 路线与详情 12（`Roadmap.test.tsx`）＋ 静态面板 12（`StaticPanels.test.tsx`）＋ 派生口径 10（`m9-roadmap.test.ts`）＋ 面板内容对账 11（`m9-panels.test.ts`）＋ 读端 16（`m9-roadmap-read.test.ts`）＋ 端点 7（`langRoadmap.api.test.ts`）；⚠️ 全量 **137 文件 / 1700 支**全绿；⚠️ **设计四闸 4 支全绿** ＋ **token 仍 29 支**；⚠️ 测试当场抓到一处真缺陷（`deriveCurrentStage` 在「一个都没点亮」时返回 0，应为第 1 站）⇒ 已修并补变异腿。

### 6.10 M9-P4 源码 T0 ＋ T1（**5 人日**）

- **P4.1** Python `ast` 扫描器（`scripts/scan-m9-source.ts`） / **DL-17** / P1 / 1
- **P4.2** Go 双路径：`go/parser` 优先 + 正则回退 + 路径显式可见 / **DL-19 DL-20** / §5.2 真实项目 / 1.5
- **P4.3** `lang_topic_findings` 存相对路径（不存绝对路径） / **DL-22 DL-23** / P4.1, P4.2 / 0.5
- **P4.4** 抽屉 UI + 导出清单（用户可自查） / **DL-22** / P3 / 1
- **P4.5** `lang_source_consent` 记忆与清除 / **DL-21** / P3 / 0.5
- **P4.6** `lang_source_shares` 计数（consent_source 二分） / - / P4.5 / 0.5
- **P4 出口**：(a) 夹具全跑过；(b) 真实项目样本上 DL-19 parser ⊇ 正则；(c) DL-22 grep 复现 100%

> ✅ **P4 已产出**（本轮 · 2026-10-21）：
> - **P4.1** —— Python `ast` 扫描器：`packages/core/src/source-scan/python-scanner.ts`，**起 `python3 -c <内嵌 ast 脚本>`**（零 npm 依赖）；CLI 入口 `scripts/scan-m9-source.ts`（dev-plan 指定路径）**只读不写库**。⚠️ **没有 python3 ⇒ 显式失败、不静默少扫**（§3.8 只给 Go 定义了回退路径 ⇒ Python 侧没有合法回退）。⚠️ **模式登记表落 `packages/shared/src/m9-source-patterns.ts`**（知识点 ↔ 代码模式，**单源**：Python 13 条 ＋ Go 13 条）—— ⚠️ **规格里没有「代码模式」这一列**（§3.1 的 `lang_topics` 十一列里没有）⇒ 模式表**随代码走**（同 §3.22 四块静态内容的处置），代价是它与 `lang_topics` 会分叉 ⇒ 由**孤儿检查**钉住（每个 `topic_slug` 必须在种子里存在）。⚠️ **模式覆盖 26/78 个语言级知识点**（其余如「环境搭建」「pip」源码里本无痕迹）⇒ 「扫不到」是诚实结果，不是漏扫。
> - **P4.2** —— Go 双路径：`go/parser` 优先（`packages/core/src/source-scan/goparse/main.go`，**只用标准库** · `go.mod` 零 require · 按内容哈希缓存到 tmpdir）＋ 正则回退（**先抹注释与字符串**，`stripGoComments` 保留长度与换行 ⇒ 行号仍准）；**回退必须显式告警**（§3.8.2 第 1 条）⇒ CLI 与抽屉都显示 notice（DL-20）。
> - **P4.3** —— 迁移 `0016_lang_source_scan.sql`：`lang_topic_findings`（**九列逐字取自 §3.10** ＋ `confidence`/`scanner_mode` 的 CHECK 兜底）＋ `lang_source_consent` ＋ `lang_source_shares`；⚠️ **P4 不新增表**（三张表都在 §3.1 的十七张里）⇒「表不越界」由 `tests/m9-source-tables.test.ts` 断（库里的 `lang_*` 表必须都在 §3.1 名单内 ＋ **缺口显式记账**：目前只差 `lang_topic_requests`，属 §3.11 增强③，不在 P4 范围）。
> - **P4.4** —— 抽屉 `apps/web/src/components/dev/SourceDrawer.tsx`（`variant="sheet"`）：**扫描模式显式可见**（DL-20）＋ **两档不混**（已确认 / 可能分节）＋ **默认全不勾** ＋ 记忆三选一 ＋ 清除记忆 ＋ 导出清单链接（`/api/lang/source/export?project=…`）。
> - **P4.5 / P4.6** —— 记忆按项目（`lang_source_consent`）＋ **清除＝删行**（不是置 0：置 0 会留下「曾经记住过」的残影）＋ 设置页「源码授权记忆」区（**逐项目可清**，DL-21 要求的「设置页清除」入口）；出网台账 `lang_source_shares` **只存计数**（`consent_source ∈ {explicit_tick, remembered}`，**不存片段、不存路径**）。
> - **端点**（`apps/server/src/routes/langSource.ts`，七个）：`POST /api/lang/scan`（**只回扫描的账，不回命中列表**）/ `GET /api/lang/findings`（**不带项目参数** —— 命中只属于最近一次扫描）/ `GET|POST|DELETE /api/lang/source/consent` / `GET /api/lang/source/consents` / `GET /api/lang/source/export`（attachment）/ `POST /api/lang/source/share`。
> - **⚠️ 本轮各取一个方向的规格张力**（**未改规格**）：① **DL-22 与 §3.10 的内在张力** —— spec 举例 `matched_pattern` = `'ast.Call'`（**不是可 grep 的字面串**），而 DL-22 要求 `grep -n '<matched_pattern>'` 必须命中它声称的 `file:line` ⇒ 本轮落库的是**命中的源码文本**（**BRE 安全化后**：遇 `\ * [ ] ^ $ | & # ~` 即截断，保留的仍是**原文前缀** ⇒ grep 必然命中那一行），**规范模式名另存模式表**供界面显示。② **`lang_topic_findings` 没有项目列**（§3.10 字段清单里没有）⇒ 命中只属于**最近一次扫描**（扫了项目 B 会覆盖项目 A 的命中）—— **不主动加列**（0011 迁移纪律：字段逐字取自规格）。③ **`scan_id` 没有对应的表**（§3.10 列了它，十七张表里没有「扫描」表）⇒ 做成**分组键**（扫描时刻毫秒数），不建外键、不加表。
> - **⚠️ 真实样本的来源（如实登记）** —— DL-19 的真实样本用 **Go 标准库源码树**（`go env GOROOT` 的 `src/net/http`，107 个 .go 文件）＋ **仓内真实 Python 构建脚本**（`packages/core/src/db/seeds/_build/*.py`，4 个 · 1973 行）；⚠️ dev-plan §5 第 2 条给的候选（「`packages/adapters/src/adapters.test.ts` 用过的 fixture 仓库」）**经查不存在**（该测试文件里没有任何 fixture 仓库）⇒ §8 的 R4 风险**本轮以这两个来源消解**。
> - **P4 出口复算**：(a) **夹具全跑过** —— Python 走 parser（Python 3.15.0 · 2 文件 **43 条**）＋ Go 走 parser（go1.24.5 · 2 文件 **44 条**），`warnings` 为空；(b) **真实项目样本上 DL-19 parser ⊇ 正则** —— 夹具 ＋ Go 标准库 `net/http` 两处实测 **0 违规**（⚠️ 本轮在标准库样本上**抓到 9 处真违规**（全是 `go-funclit`）：正则把**函数类型**（`map[string]func(T){`）误当函数字面量 ⇒ 已**删掉 `go-funclit` 的正则** —— 宁可少报不错报，§3.8.2 允许的「精度下降」）；(c) **DL-22 grep 复现 100%** —— `packages/core/src/db/m9-source-scan.test.ts` 里**真起 `grep` 子进程**逐项核对命中的行号 == 清单声称的行号。
> - **P4 判据测试**（**64 支**）：core 扫描 12（DL-17 正支＋变异腿 · DL-19 夹具＋真实样本＋变异腿）＋ core 落库 17（DL-21 ＋ DL-22 **真跑 grep** ＋ DL-23 ＋ 迁移与表结构）＋ server 端点 17 ＋ web 抽屉 8（DL-20 ＋ 默认全不勾 ＋ 两档不混）＋ web 抽屉**变异腿** 2（模式标签恒空 ⇒ 生产断言当场红）＋ web 设置页 3（DL-21 的设置页清除）＋ 仓根表闸 5（含**变异腿**：真建一张规格外的表 ⇒ 闸红）。
> - **⚠️ 本轮修掉的真缺陷**：① Go 助手写了不存在的 `ast.RecvStmt` ⇒ **编译失败**（改为 `*ast.AssignStmt` ＋ `token.ARROW` 判定，并新增 `reportTarget` 报 `<-ch` 表达式）；② `hitKey` 用错字段名（`pattern_id` vs `spec_id`）⇒ 所有命中塌成同一个 `undefined` 命名空间、⊇ 比较**看着有违规其实是键算错了**；③ 导出清单的**模式串只在扫描侧 BRE 安全化** ⇒ 手工塞进库的脏值会让用户的 `grep` **报语法错** ⇒ 已在**导出侧再兜一道**（`exportGrepPattern`，并配守卫自证：脏值确实含危险字符）。
> - **⚠️ 本轮未做**：**T1 的「勾选 → 出网」那一段**（勾选只落在**组件本地 state**，**没有**接到 P0 的 `assembleAiCallPayload` 出网入口 —— 那是 P5 的活）；⚠️ `lang_topic_findings` **无项目列**（见上）⇒ 多项目场景下命中互相覆盖，属**规格缺口**，未自行加列。
> - ⚠️ **P5 补正（2026-10-21）**：上一条的「勾选 → 出网」**已由 P5 补上** —— 但**不是**接到 P0 的 `assembleAiCallPayload`（那是**文件粒度**），而是 P5 另建的**片段粒度**装配器 `assembleInterpretRequest`（`packages/core/src/source-ai/assemble.ts`）⇒ **两处不是同一道闸**（§5.5：一个片段是粒度上限，不是「一个文件」），**共用的只有路径口径**（都用 P0 的 `toRelativePath`）。⇒ **P4 的 §3.8 T1 硬要求（「出网前必须展示将要发送的确切内容」）也在 P5 补齐**（抽屉一次读完片段并常驻显示，读不到内容的命中**勾选框禁用**）。⚠️ 「`lang_topic_findings` 无项目列」这条**规格缺口仍然未闭合**（P5 未自行加列）。

### 6.11 M9-P5 源码 T2（AI 解读）（**3 人日** · ⚠️ P4 三条待裁未闭合则本期待排）

- **P5.1** 解读面板（只对勾选过的片段入参） / **DL-16** / P4 / 1
- **P5.2** 出网前替换绝对路径 / **DL-18** / P5.1 / 0.5
- **P5.3** 与确定性层分歧显式标注 / **DL-09** / P2, P4 / 1
- **P5.4** `ai_recommend_call` 台账（只存指纹与计数） / **DL-08** / P5.1 / 0.5
- **P5 出口**：AI 不可用时仍能跑（DL-08）+ 分歧标注为 0 时仍能显示（DL-09 注入式）

> ✅ **P5 已产出**（本轮 · 2026-10-21）：
> - **P5.1** —— 解读面板（`apps/web/src/components/dev/SourceDrawer.tsx` 的 T2 区）＋ **T1 的硬要求补齐**：§3.8 要求「出网前必须展示**将要发送的确切内容**」⇒ 抽屉**一次读完**每条命中的本地片段（`GET /api/lang/snippets`）并**常驻显示**在勾选框旁边；⚠️ **读不到内容的命中 ⇒ 勾选框禁用**（看不见内容就不许勾，否则「勾选」是在盲签）。T2 区**只在 AI 可用时渲染**（DL-08）。
> - **P5.2** —— 出网前替换绝对路径（`packages/core/src/source-ai/redact.ts`）：**项目内**的绝对路径 ⇒ **相对路径**（不丢信息也不泄露目录结构）；**项目外**的 ⇒ `<外部路径>`；⚠️ **正文也要脱敏**（只改路径字段不够 —— `log_path = "/Users/…/app.log"` 照样出网）。⚠️ **脱敏顺序固定**：先项目根 ⇒ 再家目录 ⇒ 最后剩下的绝对路径（此时它们**不可能**是项目内的）。
> - **P5.3** —— 与确定性层的**分歧显式标注**（`divergence.ts`，**纯函数**）：判定层是**权威**，AI 的 `claim_state` 只用于比对；分歧里**两处并列**（`确定性层：X` / `AI 声称：Y`），**分歧数为 0 也要显示**（P5 出口条件）。⚠️ 「AI 没声称」与「说了且一致」都**不算**分歧。
> - **P5.4** —— `ai_recommend_call` 台账（`packages/core/src/source-ai/ledger.ts`）：payload **按白名单逐键构造**（9 键，与 `AGENT_PAYLOAD_KEYS` 逐字一致）⇒ **只存指纹与计数**（正文进 sha256 指纹，不进台账）。⚠️ **不新增表** —— 这个 kind 早就在迁移 0010 的 CHECK 闭集里（**声明态、写入点属 AI 增强层**）⇒ P5 成了它的**第一个生产写入点**，**表数仍是十七张**。
> - **⚠️ 补上 §3.9 的「出网计数」**：`lang_source_shares`（P4 建表、P4 没有出网所以一直是空的）⇒ P5 是**第一次真的出网**，每次出网写一行（`topic_id_count` / `snippet_count` / `consent_source`）。⚠️ **`consent_source` 在服务端推导**（不采信客户端说法）：记忆是「全发」且这次发的**正是全部可勾命中** ⇒ `remembered`；「全不发」且**一条都没发** ⇒ `remembered`；其余 ⇒ `explicit_tick`。
> - **⚠️ 补上 §3.9 的「记忆要真的有行为」**：P4 的「记住全发」只是**记了一行**（抽屉并没有据此预勾选）⇒ P5 让它**真的预勾**（可读的命中全勾；「记住全不发」保持全不勾）⇒ 记忆从「台账里的一行字」变成**行为**。
> - **runner 契约（P5 的关键分界）**：**可注入**的 `SourceInterpretRunner`（`interpret(request) → result`）。⚠️ **仓内不硬编任何 provider**：① owner 的口径是「不直接接 LLM API，语义层通过 AI Agent 做」；② M3 的 FR-6.3 同款（走 Pi，**不接 LLM API**）；③ dev-plan §9 合计段落明写「⚠️ **不含 Pi 接入本身**」⇒ M9 交付**契约 ＋ 降级 ＋ 台账 ＋ 界面**，provider 由宿主接。**命令适配器**的契约是「**stdin 收 JSON、stdout 出 JSON**」（M3 FR-6.3.2：必须结构化输出，不解析自然语言），**零依赖**，任何遵守这个契约的东西都能当 runner。⚠️ **配置来源是环境变量**（`OPENVIBE_M9_INTERPRETER` ＋ `_MODEL` ＋ `_PROVIDER`）⇒ 没配 = AI 不可用 = 确定性层照常。
> - **端点**（`apps/server/src/routes/langSourceAi.ts`，四个）：`GET /api/lang/snippet`（单条，本地读）· `GET /api/lang/snippets`（批量，一次读完）· `GET /api/lang/interpret/capability`（AI 可用性）· `POST /api/lang/interpret`（解读）。
> - **⚠️ 本轮修掉的两个真缺陷**：① **命令适配器用了 `execFile`** —— 它**没有 `input` 选项**（那是 `execFileSync` 才有的）⇒ 子进程会收到**空 stdin**，契约成了「只出不进」⇒ 已改用 P4 已有的 `runWithStdin`（`spawn` 管管道）；② **片段形状里没有 `finding_id`** ⇒ 台账的 `consent_source` 只能拿**行号**当代理（两个片段可能同行）⇒ 已把 `finding_id` 贯穿到契约里。
> - **P5 出口复算**：**AI 不可用时仍能跑**（DL-08）—— 注入必失败的 runner ⇒ `status=failed` ＋ 台账记 error ＋ **确定性层前后逐字相等**；**分歧标注为 0 时仍能显示**（DL-09 注入式）—— `divergence_count=0` 时摘要里仍有这个数，界面显示「没有分歧」。
> - **P5 判据测试**：core 15 支（DL-18 正支＋2 条变异腿 · DL-16 正支＋变异腿 · DL-08 正支＋2 条变异腿 · DL-09 正支＋2 条变异腿 · §3.9 出网计数 2 支）＋ server 12 支（含**真起一个子进程**跑命令适配器：入参真的送到了、输出真的被解析、坏输出被归一成失败）＋ web 抽屉 13 支（新增 5 支：片段常驻显示 ＋ 读不到即禁用 ＋ T2 区渲染 ＋ 分歧两处并列 ＋ 结果与风险点）＋ web 抽屉**变异腿** 4 支（新增 DL-08 那条）。

### 6.12 六项增强（P5 之后的补强 · 2026-10-21）

> ⚠️ **本节不新增判据、不新增表、不改人日**（判据仍是 50 条 · 表仍是十七张 · 仍是 38 人日）——
>   下面是 P5 收尾时提出的六项「未考虑但该考虑」的需求，本轮**逐项落地**。

> - **增强一 · 出网计数要能读到**（`lang_source_shares` 之前**只写不读**）：
>   core 加 `readShareSummary`（按项目聚合：次数 · 片段累计 · 最近时刻 · **两种授权来源分开计数**）；
>   新增 `GET /api/lang/source/share-summary`；设置页新增「源码出网记录」区（**只读**）。
>   ⚠️ **单独一区而不是挂在「授权记忆」下面**：当次勾了但**没记住**的出网，
>   在 `lang_source_shares` 里却**不在** `lang_source_consent` 里 ⇒ 挂错地方会让**当次授权的出网整段消失**。
>   ⚠️ **清除记忆不改变这个计数**（记忆管「下次」，这里记「已发生」）。
> - **增强二 · 片段读不到要说清为什么**：`readSnippet` 的返回形状从 `窗口 | null` 改成
>   `{ window, failure }`，失败原因**六种**（`file_missing` / `out_of_project` /
>   `line_out_of_range` / `too_large` / `unreadable` / `not_loaded`）。
>   ⚠️ **行号越界不再夹逼** —— 夹到文件末尾等于把**另一行**当成命中行给用户看。
>   文案映射单独成文件（`sourceFailureText.ts`）⇒ 口径只留一处 ＋ **可被变异腿打中**。
> - **增强三 · runner 契约带版本号**：请求与响应各加 `schema_version`（当前 **1**）；
>   适配器**先比版本再谈字段** ⇒ 不兼容归一成**自己的**失败原因 `runner-version-mismatch`
>   （而不是笼统的「不合 schema」—— 那会让人误判成「工具坏了」）。
>   ⚠️ **这是契约变更**：宿主侧的实现必须原样带回版本号，否则会被判「版本对不上」。
> - **增强四 · 解读结果可导出**（§3.8「只展示不留存」在**本机状态**里的形态）：
>   core 加 `formatInterpretMarkdown`；新增 `POST /api/lang/interpret/export`（**服务端脱敏**，
>   不采信客户端说「我已经脱敏了」）；抽屉 T2 区加「保存这次解读」按钮。
>   ⚠️ **产物里没有绝对路径、也没有源码正文**；⚠️ **文件名由服务端给**（清洗规则只留一处）。
> - **增强五 · 「记住全发」记的是**范围**不是快照**：spec §3.9 **补了明文**（此前只有实现侧默认）——
>   新扫出来的命中**自动进入**「全发」范围；「全不发」则始终不发；**可勾 = 读得到正文的那批**。
>   ⚠️ **判据数不变**（这是既有增强①的细则，不是新判据）。
> - **增强六 · P1e / P1f 的四个界面件真正挂载**（此前写好了却**一直没有挂载**）：
>   根因是**读端缺「模式相关的行」这一层** ⇒ 新增 core 读端 `m9-mode-read.ts`
>   （`lang_topic_profiles` 全量行 · `lang_topics` 站位 · `lang_topic_resources` **反查** ·
>   「已点亮」= 状态**不是** `unused`）、新增端点 `GET /api/lang/modes` ＋ `POST /api/lang/modes/choice`、
>   新增前端容器 `ModePanels.tsx`（`ModeOnboarding` 在**首屏**、其余在页面底部）。
>   ⚠️ **模式选择落 `app_meta`（`langModeChoice`），不进任何 `lang_` 表**（§3.19 第 3 条：
>   模式不得影响掌握度）⇒ **不新增表**。
>   ⚠️ **另起文件的原因**：DL-34 的可执行形态是**源码扫描** —— 模式三表名出现在掌握度推导文件里即红。
>   ⚠️ **补上 §3.19 第 1 条的另一半**：首屏提问**只做一半**会让「答错」**不可挽回**
>   （首屏已经不再问了，界面上却没有任何地方能改）⇒ 设置页新增「学习模式」区（两个选项 ＋ 当前值），
>   改完立即生效。
>   ⚠️ **不新增页面**：资源模式标记挂在开发能力页的「资源与模式」区（资源**页**本身仍不存在）。
>
> - **本轮的判据测试（新增）**：core 21 支（增强一 3 · 增强二 7 · 增强三 3 · 增强四 4 · 增强五 4）
>   ＋ core 读端 5 支（增强六）＋ server 5 支（增强六端点）＋ server 5 支（增强一/四端点）
>   ＋ web 抽屉 15 支（新增：失败原因具体 ＋ 导出按钮）＋ web 抽屉**变异腿** 6 支
>   （新增：四种原因塌成一个兜底 ⇒ 生产断言当场红）＋ web 失败文案 3 支 ＋ web 设置页 7 支
>   （出网记录 4 ＋ 学习模式重选 3）＋ web 模式面板 3 支。

---

## 7. 判据 → 任务 反向矩阵

50 条判据的归属（用 §7 判据做索引；48 条进工程期，2 条 DL-44/45/46 留在 §11 配套检查器）：

| 判据 | 期 | 子任务 | 状态 |
|---|---|---|---|
| DL-01 | **P1.2/P1.3**（知识点侧）＋ **P1b.1/P1b.2**（资源侧） | 每条出处都带取证日期 | **两侧都已产出** —— P1 侧（P1.2/P1.3 · m9-p1-seed-lang-topics.ts，`lang_topics.source_checked_at` 非空有闸且已覆盖全部 118 条）；P1b 侧（P1b · m9-p1b-seed-resources.ts）**资源侧的 DL-01 语义是「列不许缺、值不许冒充核过」**：`lang_resources` / `lang_vibe_resources` 的 `source_checked_at` **恒 NULL** ＋ `verified_by` 只能 `'owner_guide'`（CHECK 兜住） |
| DL-02 | P1.2 | 教程正文零进仓守卫 | 已产出（P1.8 · m9-external-content-scan.ts） |
| DL-03 | **P1.10**（源级标记）＋ **P1c.1**（巡检时发现停更） | 停更源显式标记 | **两侧都已产出** —— ① P1 侧（P1.10 · m9-source-freshness.ts）：**源级停更标记**（按 §1.5 登记，采集时写停更日期 ＋ 标红文案，即 §9 里 DL-03 归 M9-P1 的那一半）；② P1c 侧（P1c · m9-p1c-links.ts）：**巡检时把「已过时」并入判定** —— 资源层用 **`tier='e'`**（附件 tier 图例逐字：e = 过时补充，**机器可读**；实测 9 条），`verdictOf().usable=false` ⇒ **不得当有效来源**，且**不因过时而删行**。⚠️ **两层不混**：源级停更（`awesome-python-cn` 停更 4 年）归 P1 侧的**知识点出处侧**；P1c 侧管的是**资源层 100 条链接**。⚠️ **不用 `freshness` 文案做关键词匹配**（那是再造一份口径，必然漂移） |
| DL-04 | P1.1 | DAG 无环守卫 | 已产出（P1.7 · m9-topic-dag.ts） |
| DL-05 | P2.2 | 不得出现「你已掌握」 | **已产出**（P2 · `packages/core/src/db/m9-p2-guards.ts`）—— 全仓（`apps/*/src` ＋ `packages/*/src`）**0 命中**；被禁形态两条：「你已掌握」（§3.3 末段）与「未触及」三个字（§6.3 第 2 条）。⚠️ **扫前先去注释** —— 规则说明里**必须能引用**被禁形态（「界面不得出现「你已掌握」」这句话本身是必需的）⇒ 扫原文会把规则判红；⚠️ 扫的是**去注释后的整段文本**而不是「字符串字面量集合」⇒ JSX 文本（`<p>你已掌握</p>` 里的字是 JSXText 不是字面量）也照样被抓到。⚠️ **守卫自证**：注入「你已掌握这个知识点」当场被报出；反证「规则说明里引用这些词」与三态正常文案均不命中 |
| DL-06 | P1.1 | 挂接不反向写 terms | 已产出（P1.8 · m9-topic-terms.ts） |
| DL-07 | P2.2 | 冷门知识点显示文案 | **已产出**（P2 · `packages/shared/src/m9-state.ts` ＋ `packages/core/src/db/m9-p2-state.ts`）—— 零证据知识点 ⇒ 状态 `unused` ⇒ 文案「**本项目未涉及**」（§6.3 第 2 条）；冷门补充说明「本项目永远可能用不到它（冷门知识点）」也落成常量（`COLD_TOPIC_NOTE`）。⚠️ **状态图覆盖全部知识点**（`readTopicStateMap` 把没有证据行的知识点也填成 `unused`）⇒ 界面永远拿得到文案，不会有空白。⚠️ **文案纪律**：「你已掌握」与「未触及」三个字都不许进文案（同 DL-05 的守卫） |
| DL-08 | P5.4 | AI 不可用时确定性层照常 | **已产出**（P5 · `packages/core/src/source-ai/interpret-service.ts` ＋ `apps/server/src/routes/langSourceAi.ts`）—— **runner 是可注入的**（`SourceInterpretRunner`）⇒ 「注入必失败的 runner」这条判据**可执行**：失败被**归一**成 `InterpretRunnerError` ⇒ 台账记 `result='error'` ＋ 原因，界面显示「解读失败」，而**确定性层一字未改**（解读**从不写** `lang_topic_state`，由测试断言前后逐字相等）。⚠️ **「不可用」与「失败」是两件事**：没配 runner ⇒ `status=unavailable`、**不出网、不写台账**、界面**不渲染 T2 区**；配了但跑挂了 ⇒ `status=failed` ＋ 台账有一行。⚠️ **变异腿实跑**：`vi.mock` 把能力改成不可用 ⇒ 生产断言「T2 区必须渲染」当场红（`SourceDrawer.mutant.test.tsx`） |
| DL-09 | P5.3 | AI 结果不得绕过判定层 | **已产出**（P5 · `packages/core/src/source-ai/divergence.ts` ＋ `apps/web/src/components/dev/SourceDrawer.tsx`）—— 判定层是**权威**（§3.8 三条线第 3 条：解读结果**不自动入库** ⇒ 本模块**从不写** `lang_topic_state`），AI 的 `claim_state` **只用于比对**。⚠️ **两处并列**：分歧里同时给出「确定性层：X」与「AI 声称：Y」，界面两处都显示。⚠️ **「AI 没声称」与「说了且一致」都不是分歧**（不凭空多出分歧）；⚠️ **分歧数为 0 时也要显示**（P5 出口条件：分歧标注为 0 时仍能显示，不许空白）。⚠️ **变异腿实跑**：把判定改成「只比计数」⇒ 当场红 |
| DL-10 | P3.1 | 新增页面零字面色阶 | **已产出**（P3 · `apps/web/src/components/dev/` ＋ `apps/web/src/pages/DevAbilityPage.tsx`）—— 全部颜色走 `index.css` 的语义 token；⚠️ 由 `tests/design-tokens.test.ts` 四道闸实测（**零字面色阶** ＋ 裸 hex 只住 token 源 ＋ 用到的语义色都已声明 ＋ 声明的都被引用），本轮复跑 4 支全绿、token 仍 **29 支** |
| DL-11 | P3.1/P3.7 | 形制登记进 DESIGN.md | **已产出**（P3.7 · `DESIGN.md`）—— ① **`.tag` 形制**（**36 处 / 15 个文件**此前在用却**从未登记** ⇒ 本轮补上，含 mono 变体与「状态一律走 chip」的分工）；② **状态 chip 六形制**（默认 ＝ 中性的 `panel-sunk` 底，其余五形制 ＝ soft 三件套）＋ **M9 掌握度三态的落法**（未涉及＝默认 / 在用＝accent / 掌握＝ok，文案取自 `MASTERY_STATE_LABELS`）。⚠️ 同批**按实现订正**了 chip 描述（字号 11px、默认形制底色）—— 描述与实现分叉时**实现是已交付的事实** |
| DL-12 | P1.1 | 库级条目不进学习路线 | 已产出（P1.7 · m9-p1-7-topic-stages.ts）⚠️ 见附注① |
| DL-13 | P1.4 | 清单带 kind 且可复算 | 已产出（P1.4 · m9-classify-lang-topics.ts） |
| DL-14 | P1.2/P1.3 | 两门数据都在且可筛选 | 已产出（P1.8 · m9-topic-filter.ts） |
| DL-15 | P1.5 | 概念层跨语言复用 | 已产出（P1.5 · m9-p1-5-concept-content.ts） |
| DL-16 | P0.3 | 源码片段不得进台账 | **两侧都已产出** —— ① **P0 侧**（`tests/m9-discipline.test.ts`）：禁列扫描器接上 `lang_*` 命名空间；② **P5 侧**（`packages/core/src/source-ai/ledger.ts`）：`ai_recommend_call` 的 payload **按白名单逐键构造**（9 个键，与 `AGENT_PAYLOAD_KEYS` 逐字一致）⇒ **没有** `content`/`text`/`fragments`/`path` 这类容器 ⇒ 源码正文**在类型上就进不来**（正文进**指纹**，不进台账）。⚠️ **失败也要记**（`result='error'` ＋ `failureReason`）——「没出网」不记（那是 `unavailable`），「出了网但挂了」必须记（FR-9：不可复算的东西要可追责） |
| DL-17 | P4.1 | T0 不依赖 AI | **已产出**（P4 · `packages/core/src/source-scan/` ＋ `services/m9-source-service.ts`）—— 扫描链路**零 AI 依赖**（源码守卫扫 `fetch(` 与 `openai|anthropic|ai_recommend|chat.completions|llm` ⇒ **0 命中**）⇒ 「AI 不可用时 T0 照常工作」是**结构上**成立的（没有依赖可失败）。⚠️ **变异腿实跑**：往 `scan.ts` 插一个 `fetch('https://api.openai.com/v1/chat/completions')` ⇒ 守卫当场报出两条 |
| DL-18 | P0.4 | 未勾选片段不得出网 | **两侧都已产出** —— ① **P0 侧**（`tests/m9-discipline.test.ts`）：文件粒度的装配器（`assembleAiCallPayload`）；② **P5 侧**（`packages/core/src/source-ai/assemble.ts` ＋ `redact.ts`）：**片段粒度**（§5.5：「一个片段」是粒度上限，不是「一个文件」）—— 勾一条**只发那一条**，同一个文件里的别的命中**不发**；⚠️ **两处不是同一道闸、也不该合并**（合并会把片段粒度退化成文件粒度 ⇒ 正是 §5.5 禁止的形态），**共用的只有路径口径**（相对化 ＋ 越界判定都用 P0 的 `toRelativePath`）。⚠️ **正文里的绝对路径也要脱敏**（只改路径字段不够：`log_path = "/Users/…/app.log"` 照样出网）⇒ 项目内路径变**相对路径**、项目外路径变 `<外部路径>`。⚠️ **入参捕获**是唯一可执行形态（进程内假 runner 把入参截下来） |
| DL-19 | P4.2 | Go 回退只降精度不减结果 | **已产出**（P4 · `packages/core/src/source-scan/subset-check.ts` ＋ `go-scanner.ts`）—— **parser ⊇ 正则**在两处实测 **0 违规**：① 夹具（`packages/core/src/fixtures/m9`）；② **真实样本**（Go 标准库 `src/net/http`，107 个 .go 文件）。判定式 `findSubsetViolations` 是**纯函数**（吃两个集合、不做 I/O）。⚠️ **变异腿实跑**：给 `go-struct` 配一条比解析器判定更宽的正则（`\bstruct\b|\binterface\b`）⇒ ⊇ 立刻被打破。⚠️ **本轮在标准库样本上抓到 9 处真违规**（全是 `go-funclit`：正则把**函数类型**（`map[string]func(T){`）误当函数字面量）⇒ 已**删掉该正则**（宁可少报不错报，§3.8.2 允许的「精度下降」）—— ⚠️ **函数字面量与函数类型在文本上不可区分**，这是那条正则配不出来的根因 |
| DL-20 | P4.2 | 回退必须显式告知 | **已产出**（P4 · `apps/web/src/components/dev/SourceDrawer.tsx` ＋ `packages/shared/src/m9-source-scan.ts`）—— 界面**每一门语言一行模式说明**（`完整解析（工具链版本）` / `启发式模式` / `未扫描`）＋ **回退 notice 必须出现在界面上**（CLI 同步显示）。⚠️ **模式文案只留一处**（`describeScannerMode`）⇒ 抽屉、CLI、将来的导出清单共用。⚠️ **变异腿实跑**：`vi.mock` 把 `describeScannerMode` 换成恒 `''` ⇒ **生产断言当场红**（`SourceDrawer.mutant.test.tsx`，变异体独占一份文件 —— `vi.mock` 按文件生效） |
| DL-21 | P4.5 | 「记住不发」清除后回到全不勾 | **已产出**（P4 · `packages/core/src/db/m9-source-scan.ts` ＋ `apps/web/src/components/settings/SourceConsentSection.tsx`）—— 记忆**按项目**（全局记忆会让一个项目的授权泄漏到另一个项目）＋ **清除＝删行**（不是把 `remember_all` 置 0：置 0 会留下「曾经记住过」的残影）⇒ 读回来是 `null`（**没有行 ＝ 没有记忆**）⇒ 下次扫描回到全不勾。**设置页有逐项目的清除入口**（DL-21 原文要求的「设置页清除」）＋ 抽屉里也有。⚠️ **变异腿实跑**：只清字段不删行 ⇒ 判定式当场报出「清除没生效」 |
| DL-22 | P4.4 | 导出清单可 grep 复现 | **已产出**（P4 · `packages/core/src/db/m9-source-scan.ts` ＋ `packages/core/src/source-scan/pattern-text.ts`）—— **真跑 grep**：导出后逐项起 `grep` 子进程，核对它命中的行号 == 清单声称的行号（不是只断言清单结构）。⚠️ 落库的 `matched_pattern` 是**可 grep 的字面串**（BRE 安全化后的**源码文本**）—— 规格举例的 `'ast.Call'` 那种**节点名不可 grep** ⇒ **规范模式名另存模式表**供界面显示。⚠️ **导出侧再兜一道**（`exportGrepPattern`）⇒ 库里的脏值不会让用户的命令报语法错；**守卫自证**：脏值确实含 BRE 危险字符 |
| DL-23 | P4.3 | 导出清单不含绝对路径 | **已产出**（P4 · `packages/core/src/source-scan/` ＋ `packages/core/src/db/m9-source-scan.ts`）—— 命中**产生的那一刻**就是相对路径（扫描侧）＋ 导出全文搜家目录 / `/Users/` / `/home/` **0 命中**。⚠️ **守卫自证**：注入一条绝对路径必被报出 —— 防线是「**绝对路径根本进不来**」，不是「导出时过滤掉」 |
| DL-24 | P1.6 | since_version 影响条目报出 | 已产出（P1.6 · m9-concept-deltas.ts） |
| DL-25 | P0.1/P0.2/P2.1 | 源码证据封顶 active | **两侧都已产出** —— ① **P0 侧**（P0 · tests/m9-discipline.test.ts）：四支夹具的字面事实（20 次同一段 / 单独特征），见附注②；② **P2 侧**（P2 · `packages/shared/src/m9-state.ts` ＋ `packages/core/src/db/m9-p2-state.test.ts`）：封顶与去重**写进代码**（§3.13）—— `source_hit` 证据在场 ⇒ 状态上限 `active`，任何组合都到不了 `mastered`；同一出处只计 1 次。⚠️ **P2 出口腿实跑**：真实 DAG 上给**每一个**知识点都喂上四支夹具的源码证据 ⇒ **0 个**到 `mastered`（比「只喂一个知识点」更能暴露封顶被删）。⚠️ **如实登记**：去重规则在**状态层被封顶遮蔽**（去掉去重而留着封顶，输出逐字不变）⇒ 它的真正落点是**计数层**（`countEvidence` 对同一出处的 20 次命中只计 1），本轮有一支「登记腿」把这个事实钉住 |
| DL-26 | P1.1 | §3.1 表数可复算 | 已产出（P1.7 · m9-p1-7-topic-stages.test.ts） |
| DL-27 | P1b.2 | 资源层无前置边、不进 DAG | 已产出（P1b · m9-p1b-resources.test.ts）—— 资源表无边列 ＋ 仓里没有「资源×边」表 ＋ 给资源插边被外键挡住 |
| DL-28 | P2.3 | 资源层不得参与掌握度 | **已产出**（P2 · 三道）—— ① **运行时闭集**（`packages/shared/src/m9-state.ts` 的 `assertMasteryInput`）：入参多一个键就**当场抛**，证据多一个键也抛，证据种类不在闭集内也抛；② **类型层结构守卫**（`tests/support/m9-state-shape.ts`）：用编译器 API 看**语法树** —— `MasteryInput` 的成员集合必须逐字等于 `nodes` ＋ `byTopic`、函数参数表必须逐字是 `(topic, input)`、`EvidenceKind` 必须是那四个字面量的联合；③ **推导路径禁读表**（`packages/core/src/db/m9-p2-guards.ts`）：推导源码里出现资源三表或模式三表的表名即红。⚠️ **变异腿实跑**：把 `lang_resources` 塞进推导源码副本 ⇒ 闸当场红；把 `required` 或 `resourceIds` 塞进 `MasteryInput` ⇒ 类型层闸当场红 |
| DL-29 | P1c.1 | owner 提供来源不得标 self | 已产出（P1b · m9-p1b-seed-resources.ts ＋ 0012 的 CHECK）—— 资源侧的值域只有 `'owner_guide'` |
| DL-30 | P1c.1/P1b.4 | 巡检只发 HEAD + 永不删除 | **两侧都已产出** —— ① P1b.4 侧（m9-p1b-probe.ts）：去重到 87 个 URL ＋ 状态机，单次失败不判死、连续两次标灰不删、传输层**结构上**只能发 HEAD 且没有 body 通道；② **P1c.1 侧**（m9-p1c-links.ts ＋ `scripts/check-m9-links.ts`）：**真出网的 HEAD**（Node 标准库，零第三方依赖）＋ 状态码与计数落库 ＋ **两张表同一支脚本**（98 个去重 URL）＋ **手动触发**（默认 dry-run，不进启动流程）。⚠️ **三条纪律的证据形态**：本地起**真的** HTTP 服务抓 method（服务端看到的是 HEAD、请求体 0 字节）—— 假 transport 验不了这条（它是我们自己写的，验的是「自己有没有骗自己」）。**变异腿实跑**：`FAIL_THRESHOLD` 改 1 ⇒ 「单次失败不判死」那支当场红 |
| DL-31 | P1b.5 | 要点级至少一条去处 | 已产出（P1b · m9-p1b-resources.test.ts）—— 118 个要点级知识点逐条有挂接；变异腿「删一条挂接 ⇒ 红」＋ 反证「`full` 级挂 0 条允许」 |
| DL-32 | P1b.6 | README 导出满足零正文 | 已产出（P1b · m9-p1b-readme.ts）—— 零本机路径 ＋ 条数一致 ＋ 每行带 `lang_resources.id` 可溯源；守卫自证（注入绝对路径必被报出） |
| DL-33 | P1d.4 | 必学集逐层包含 | **已产出**（P1d · m9-p1d-profile-guards.ts）—— `vibe ⊆ familiar ⊆ master` **逐条比**（不是比计数）；**冷门六条是这条判据第一次被真正触发的地方**（精通必学 / 熟悉可跳过 ⇒ 精通 ⊋ 熟悉）。⚠️ **变异腿实跑**：把一条速成必学改成「熟悉不必学」⇒ 当场红 |
| DL-34 | P2.3 | 模式不影响掌握度 | **已产出**（P2 · 与 DL-28 同三道 ＋ 一条行为腿）—— 推导路径**只读拓扑两张表**（`lang_topics` ＋ `lang_topic_edges`），**不读模式三表**（`lang_topic_profiles` ＋ `lang_profile_phases` ＋ `lang_stage_tracks`）⇒ 「切模式不改状态」是**结构上**成立的，不是「实现时记得别用」。⚠️ **行为腿**：同一个知识点在库里**换档**（真实往模式表写行）前后，状态**逐字相等**。⚠️ **spec §7 那一列的「界面形态已跑」本轮据实保留** —— §10.2 已有 DL-34 的对应行（速成专区那格）⇒ 改档会让这两处脱节，而 DL-45 正是断它们不许脱节 |
| DL-35 | P1d.2/P1d.5 | 必学集非空 | **已产出**（P1d · m9-p1d-profile-guards.ts ＋ m9-vibe-static.ts）—— 六个「语言 × 模式」组合逐一断言非空；**反证那一半**（空列表必须有兜底文案、不许空白）在数据层落地：速成专区**恒有内容**（四块静态内容 ＋ 6 段时间线）＋ `VIBE_EMPTY_STATE_TEXT`。⚠️ **变异腿实跑**：清空某一门的熟悉必学集 ⇒ 当场红 |
| DL-36 | P1d.4 | 速成必学有 est_minutes | **已产出**（P1d · m9-p1d-profile-guards.ts）—— 速成必学逐条有正整数分钟；**速成不必学与精通/熟悉一律 NULL**（逐条估分钟是伪造精度）。⚠️ **变异腿实跑**：置 NULL 与给精通填分钟各一条，都当场红 |
| DL-37 | P1e.1 | 转档起始站 = 映射结果 | **已产出**（P1e · `packages/shared/src/m9-mode-interaction.ts` ＋ `apps/web/src/components/dev/ModeTransferPanel.tsx`）—— 映射**查表不维护**（站位取 `lang_topics.stage_id`，不建对照表）；**集合相等**（不是计数相等 —— 计数相等但成员错位也必须被抓到）；**只给位置不给结论**（界面文本**不含「已完成第 … 站」**）；一条都没点亮时显示**完整站数**（Python **8** 站 / Go **6** 站），不许空白或 0。⚠️ **变异腿实跑**：抽掉**任意一条**映射（逐条抽，不只试一条）⇒ 闸当场红；**真改代码**的腿：源码里塞一条硬编码 slug ⇒ 「不建对照表」闸红 |
| DL-38 | P1e.2 | 跳过与选速成逐字一致 | **已产出**（P1e · `apps/web/src/components/dev/ModeOnboarding.tsx`）—— **「跳过」与「速成」走同一个代码入口** ⇒ 渲染逐字相同成为**结构上必然**（断言用**同一份 DOM 快照**比对，不是比几个字段相等）；首屏**只出现一个主动作**（速成）；精通/熟悉**折叠成一行**且**常驻可点**（§3.19 第 4 条）。⚠️ **反证实跑**：作答题落点不进 `lang_topic_state` / 不进 `computeState()` 入参（源码守卫）＋ 作答前后已点亮状态不变。⚠️ **变异腿实跑**：把「折叠」写成「隐藏」⇒ 生产断言当场红（`ModeOnboarding.hidden-mutant.test.tsx`） |
| DL-39 | P1e.3 | 资源标记 = 必学集反查 | **已产出**（P1e · `apps/web/src/components/dev/ResourceModeChip.tsx` ＋ `packages/shared/src/m9-mode-interaction.ts`）—— **由必学集合反查派生**，与转档**共用同一个 `isRequiredIn`**（判定式在代码里**只出现一次**，守卫数过）；**只有两档**（`ResourceModeLabel` 用类型收死，**「熟悉用」第三档不存在**）。⚠️ **变异腿实跑**：清空某条资源的挂接 ⇒ 标记翻成「仅扩展阅读」并判红；标记**随模式切换即时重算**（换 profile 即变，不要求刷新） |
| DL-40 | P1f.1/P1f.2 | 阶段轨道逐格相等（**6 行**） | **已产出**（P1f · `packages/core/src/db/m9-p1f-stage-guards.ts`）—— 库↔源**逐格**相等（8 个源字段逐条比，不是比计数）＋ 库↔spec §1.7 八格**逐格**相等（两侧走**同一个**归一化）；**八格对照面 ⇒ 落库 6 行**（阶段 0/1 的 Go 在源文档里没有该轨道 ⇒ **不建行**，不是建行再标 `required=0`）。⚠️ **反证腿实跑**：给阶段 0 补一条 Go 行并标 `required=0` ⇒ 反证闸当场红（断的是「那些行根本不存在」，不是「那些行 `required=0`」）；删掉阶段 2 的 Go 行 ⇒ 主条与 spec 条两条闸同时红。⚠️ **阶段 2 的 Python 矛盾不替 owner 裁**：派生取「熟悉」＋ `note` 标注，两个源字段逐字保留（§6.3 第 8 条仍待裁） |
| DL-41 | P1f.5 | 11 条速成专区在库 | **已产出**（P1b · m9-p1b-resources.test.ts）—— 11 条在库（tools 6 ＋ tuts 5）、不与主清单混表、无分类/费用/阶段/精选列。⚠️ **P1f.5 是确认不是新建**：P1c.2 已把这 11 条落库、且 `PROBE_TABLE_NAMES` 已含 `lang_vibe_resources` ⇒ DL-30 的失效纪律（单次失败不判死 · 连续两次标灰不删）对它**同样成立**；巡检所需四列 `last_status_code` / `consecutive_fails` / `alive` / `last_checked_at` 都在 |
| DL-42 | P1f.1 | 不得出现职业等级断言 | **已产出**（P1f · `packages/core/src/db/m9-p1f-grade-guard.ts`）—— 界面不得出现越过编程证据的职业等级断言；全仓（`apps/*/src` ＋ `packages/*/src`）**0 命中**。⚠️ **只认「对人的主语 ＋ 断言」结构**（主语必须是「你/您/用户/学员」，且中间段与前缀不得带否定/疑问标记）⇒ 规则说明里**引用**「你已达成 L1」是**必须能写出来的**。⚠️ **反向判据必须自证**：注入「你已经达成 L1…」当场被报出；反证「本模块不判断你是否达到专家级」**不算命中**（守卫跳过自身与 `*.test.ts`） |
| DL-43 | P1f.4 | 深链落档（#mode-* 优先） | **已产出**（P1f · `apps/web/src/components/dev/ModeDeepLink.tsx` ＋ `packages/shared/src/m9-stage.ts`）—— 三个锚点 `#mode-vibe` / `#mode-master` / `#mode-familiar` **各自落位**（落位 = 单一，不是三档并排）；**URL 片段优先于** §3.19 的 onboarding 默认模式（用户是**从别人给的链接进来的**，那个链接指向哪一档就该落哪一档）；`hashchange` 跟随（同文档内切档不改路由）；提示条**只在深链命中时**出现。⚠️ **变异腿实跑**：`vi.mock` 把 `resolveProfileFromHash` 换成恒 `null` ⇒ 三个锚点全落默认档 ⇒ **生产断言当场红**（`ModeDeepLink.mutant.test.tsx`，变异体独占一份文件 —— `vi.mock` 按文件生效） |
| DL-44 | §11.1 | §0 数字与正文一致 | **已产出**（2026-10-21 · `tests/support/m9-spec-consistency.ts` ＋ `tests/m9-spec-consistency.test.ts`）—— §0 速览的**六个数**（十四条增强 / 十七张表 / 五十条判据 / 十一期 / ≈38 人日 / 九条待裁）逐个与正文**各自的出处**对账（增强数↔§3.0 · 表数↔§3.1 代码块 · 判据数↔§7 · 期数与人日↔§9 逐期求和 ＋ §9 合计段落 · 待裁数↔§6.3）。⚠️ **兜底那支断的是「分组口径的成员集合」**（§0 的「知识点 7 · 源码与记忆 4 · 资源 2 · 模式与阶段 3 ＋ 语言差异 1」逐组与 §3.1 抬头**逐项相等**、并集与代码块 17 个表名**不重不漏**）—— 只比总数的话，**分组整体错位一格照样绿**（那正是 v1.5 修过的那次）。⚠️ **人日那支锚在「合计 ≈ N 人日」的标题形状上**（同一行后半句还留着旧值「合计 35 → 38 人日」），按行内第一个数字取必错 —— 本轮实测抓到**真缺陷**：§9 合计段落写「35 人日」而逐期求和是 38，已订正 |
| DL-45 | §11.1 | 判据标注与 §10.2 不矛盾 | **已产出**（2026-10-21 · 同上）—— §7 里每条标成「界面形态已跑」的判据，§10.2 的「demo 不能证明什么」表里**必须有对应行**。⚠️ **范围写法不算「单独出现」**：§10.2 第一行是总括句「不证明任何一条 DL-01~DL-50」，若把范围展开，每条判据都会在那一行里「找到」⇒ 闸变永真 ⇒ 两端贴着 `~` 的编号一律跳过 |
| DL-46 | §11.1 | 台账卡住哪期与 §9 依赖一致 | **已产出**（2026-10-21 · 同上）—— §6.3 台账标 ⛔ 的条目提到的期必须在 §9 存在；§6.3.1 依赖链声明的「A 必须先于 B」⇒ **B 卡的那一期的依赖里必须有 A 卡的每一期**。⚠️ **⛔ 只看格首标记**（台账那几格的说明文字本身写着「仍登记 ⛔ 是为了保留 DL-46 断的那条依赖关系」，用整格 `includes('⛔')` 判的话去掉格首标记也照样算「还标着」）。⚠️ 本轮顺带订正规格：第 8 条的 ⛔ 原先落在「待裁项」与「建议决策时点」两列（与第 6 条不同列）⇒ 已归位到「⛔ 卡住哪期」列 |
| DL-47 | P1b.1/P1b.2 | 资源层逐条相等含去重主键 | 已产出（P1b · scripts/extract-m9-guide-resources.ts ＋ m9-p1b-resources.test.ts）—— 89 ＋ 11 ＋ 六类逐类 ＋ 9 字段齐全 ＋ tier 列非空 ＋ 两个共用 URL 各占 2 行（去重 87） |
| DL-48 | P1b.2 | 必要性必须由矩阵推导 | 已产出（P1b · m9-p1b-necessity.ts）—— ⚠️ **轴是 tier 不是展示分类**（2026-10-20 实测纠正，spec §1.6.1 已订正）；矩阵 × tier 现算 == spec 记的三档分布（53/36/0 · 25/28/36 · 8/0/81） |
| DL-49 | P1d.1/P1d.3 | 分期 21 段逐格相等 + 7 段空 + 3 前缀 | **已产出**（P1d · m9-p1d-spec.ts ＋ m9-p1d-seed-profiles.ts）—— 段序/标签/阶段名/耗时/产出整串**逐格等于 spec §3.17.1**；前缀分布 **产出 10 · 练习 2 · 跳过 2 · 空 7**；**恰 7 段为空**（py 精通第 5 段 ＋ 两门各 3 段速成）。⚠️ **变异腿实跑**：润色「3–4 周」⇒ 红；把「跳过：」剥成「产出：」⇒ 红；给空栏填自撰文案 ⇒ 红 |
| DL-50 | P1d.6 | 8 站与分期不得映射 | **已产出**（P1d · m9-p1d-stage-phase-guard.ts）—— `lang_topics` **无 phase 类列** ＋ 仓内**无「站↔段」映射表** ＋ **反证支**（§3.6 两列分工表与 §3.22.1 三套分段表都在且都写了「不映射」）。⚠️ **反向判据必须配真变异的腿**：本轮真 `ALTER TABLE` 加过 `phase_id`、真在临时目录建过 `lang_stage_phase_map`、真删过 spec 里「不映射」那句 —— 三条都当场红 |

> 状态「可立刻开工」= **不依赖任何工程代码**，本周 W1 落仓（见 §5.3 与 §11）。
>
> **状态「已产出（期 · 文件）」** = 判据已有**可执行闸**（单测或扫描器）在仓里，括号里是产出它的期与落点文件。文件名除 `tests/` 开头者外，**P1b 之前**的都在 `packages/core/src/db/` 下；⚠️ **P1e 起有两处例外**：① **纯计算层落在 `packages/shared/src/`**（`m9-mode-interaction.ts` / `m9-mode-guard.ts` / `m9-modes.ts`）—— 转档站位与资源标记都要**在浏览器里现算**，而 core 带原生依赖、web 没有指向它的 workspace 链接 ⇒ 放 core 就等于让 web 抄一份；② **界面组件落在 `apps/web/src/components/dev/`**（P3 建页面时挂上去）。⚠️ **「已产出」不等于「已签收」** —— 本列只登记「闸在仓里」；闸是否覆盖判据原文的每一句，由各期交付报告负责。P1 期六轮（P1.4–P1.9）落地后，本表已从「全列未开工」订正为当前实况。
>
> **P1.11 补记** —— 它**不新增判据**（判据仍 **50 条**，§0 速览与 §6.3 台账的计数不动），
> 只给 **P1 出口条件「节点数 = 78」**与 **spec §1.4 三档表**补了「**文档 ↔ 实跑**」对账闸
> （`packages/core/src/db/m9-doc-numbers.ts`）⇒ 从此这几个数改了文档或改了库都会红。
> ⚠️ **P1d 起这道闸按两个口径分断**（**源清点** 45/30/9＝84 对 §1.4 三档表 · **路线节点** 46＋32＝78 对 P1 出口）
> —— P1d 补建冷门底层六条后，两者在 Python 侧分岔（45 vs 46）⇒ 用一个口径混着比必然误红。
>
> **附注①（DL-12 · 四颗牙齿，但判据原文未能完整表达）** —— 站列表纯度 / kind 可复算 / 站号指派 / 边四颗牙都已落地，但**「不进站列表」在当前 schema 下无法由数据独立表达**：`lang_topics.stage_id` 是 `NOT NULL CHECK 0..7`，表里没有「不入站」这个取值 ⇒ 库级条目靠 `kind='library'` 与站列表过滤区分，闸实际断的是「**库级条目出现在站列表里**」，不是「库级条目不存 `stage_id`」。要让判据原文字面成立，需要 `stage_id` 可空或加一列站外标记 —— **属 schema 契约改动，未做**，登记为增强需求。
>
> **附注②（DL-25 · 三条子任务里只完成了两条）** —— P0.1/P0.2 的封顶部分已产出（20 次同段 ⇒ 封顶 `active`，夹具与变异腿在 `tests/m9-discipline.test.ts`）；**P2.1 的 `computeState()` 服务尚未开工** ⇒ 判据原文那半句「P0-P1b 全套 fixture 跑过不出 `mastered`」目前没有执行者。

---

## 8. 风险与缓解

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | **#6 待裁 W3 末不定** | 中 | P1d 全员停工 5+ 天 | W2 末发提醒（见 §10）；W3 末设硬截止 |
| R2 | **#8 待裁 W6 末不定** | 中 | P1f 全员停工 3 天 | W5 末发提醒；W5 中就提早把两种读法（精通+子集 vs 加第四档）的取舍都准备好让 owner 选 |
| R3 | **附件 21 段抽取脚本挂掉** | 低 | P1d.1 卡住 | 脚本已就位在 `/tmp/dump.mjs`，本计划 W1 落仓到 `scripts/extract-guide-resources.mjs` |
| R4 | ~~**真实 Go/Python 项目样本找不到**~~ | ✅ **已消解**（2026-10-21 · P4） | — | ✅ **P4 已用真实样本**：Go ＝ **标准库源码树**（`go env GOROOT` 的 `src/net/http`，107 个 .go 文件）＋ Python ＝ **本仓真实构建脚本**（`packages/core/src/db/seeds/_build/*.py`，4 个 · 1973 行）⇒ DL-19 在真实样本上实测 **0 违规**。⚠️ 原候选「awesome-go 子模块 / `packages/adapters/src/adapters.test.ts` 用过的 fixture 仓库」**经查不存在**（该测试文件里没有任何 fixture 仓库） |
| R5 | **`DESIGN.md` 编辑需 owner** | 中 | P3 chip 全部要等 | 开工前就发请求（见 §5.1），不要到 P3 才催 |
| R6 | **Pi 接入不到位** | 高 | P5 全期待排 | P5 写在 W8 末，**且「Pi 接入」本身不在本计划**；W7 末复审 P5 是否真要排进 W8 还是推到 v1.7 |
| R7 | **网络不通** | 高（已实锤） | DL-01/29/30 资源取证日恒 NULL | 不强求；DL-01 已写明「owner 提供的来源首取证日恒为 NULL」是允许的；用 `verified_by='owner_guide'` 标记 |
| R8 | **返工** | 中 | 38 人日是估算不含返工 | 每周 sync 留 §9「实际进度」；连续两周超 20% 触发重排 |
| R9 | **本仓禁列扫描器接错命名空间** | 低 | DL-16 不报 | P0 写两支断言式（必须报 / 注入一片段必须报） |

---

## 9. 每周实际进度表（live tracking）

> 每周日 Duke 填一行；累计超 20% 偏差触发重排。

| 周 | 计划 | 实际 | 偏差 | 待裁更新 | 备注 |
|---|---|---|---|---|---|
| W1 | P0 + P1 起 |  |  | #3 #4 W1 提醒发出 |  |
| W2 | P1 完 + P1b 起 |  |  | #5 W2 决 |  |
| W3 | P1b 完 + P1c + P1d 起 |  |  | **#6 W3 末决** |  |
| W4 | P1d 续 |  |  |  |  |
| W5 | P1d 完 + P1e + P1f 起 |  |  | #7 #9 W5 决 |  |
| W6 | P1e 完 + P1f + P2 起 |  |  | **#8 W6 末决** |  |
| W7 | P2 完 + P3 + P4 起 |  |  |  |  |
| W8 | P4 完 + P5 |  |  |  |  |

---

## 10. 文档维护纪律

1. **每周日**写 §9 进度行 + 同步 `docs/specs/m9-dev-language-roadmap.md` 的人日实际（如果发生显著漂移）。
2. **W3 末前一周（周二）** 发 #6 决策提醒；W6 末前一周发 #8 提醒。
3. **每个 phase 出口** 跑 `pnpm test` ＋ `pnpm typecheck` ＋ `pnpm lint` ＋ `pnpm docs:check` ＋ `./scripts/head-typecheck.sh` ＋ `M9SPEC=docs/specs/m9-dev-language-roadmap.md python3 tests/m9-spec-consistency.test.ts` —— 缺一不可。
4. **不允许改本计划不改规格** —— 计划是规格的展开，与规格冲突时以规格为准；规格是「真」。
5. **不允许跳期** —— P5 之外的每一期都必须独立完成（含其所有判据），不允许「先做 P4 反正 P3 还没好」。

---

## 11. 配套检查器（**已落仓 2026-10-21** · 不依赖任何工程代码）

`tests/m9-spec-consistency.test.ts` ＋ `tests/m9-mutations.test.ts` —— 把规格里的 DL-44/45/46 + §3.17.1 21 段 + §3.22 四块 + §3.1 17 张表全数收进仓内 vitest 用例。

> ✅ **§11 已落仓**（2026-10-21）：
> - **正支** `tests/m9-spec-consistency.test.ts`（3 支）—— 真 spec **零违规** ＋ **检查器非空壳**（断言它读到了 10 行速览 / 14 条增强 / 17 张表 / 50 条判据 / 11 期 / 38 人日 / 9 条待裁）＋ **表格结构体检**。
> - **变异腿** `tests/m9-mutations.test.ts`（21 支）—— **19 条真改 spec 文本的腿**（不是喂假样本），逐条断言**闸组**当场红。
> - **闸组 = 新检查器 ＋ 既有 P1b/P1d 的 spec 文本解析器**（`parseSpecPhaseRows` / `tallyOutcomePrefixes` / `checkNoMappingStatements` / `parseSpecNecDistribution` / `parseSpecResourceCounts`）—— ⚠️ **不重写既有解析器**：两处各写一份解析，两边会**错得一模一样**，闸就成了同义反复。
> - **检查器是纯函数**（`tests/support/m9-spec-consistency.ts`，**一行 I/O 都不做**）—— 变异腿要拿**改过的 spec 文本**喂进来。
> - ⚠️ **本计划原写的「本轮脚本已就位在 `/tmp/m9check16.py` / `/tmp/m9mut16.py`」** —— 实测那两个脚本**早已不在**（`/tmp` 不持久）⇒ 「本轮已就位」这句话**只活了一轮**。⇒ 本轮**重写**并**直接落仓**。
> - ⚠️ **本轮实测抓到两处真缺陷**（都是闸组自己的价值证明）：① §9 合计段落写「合计 ≈ 35 人日」而**逐期求和是 38** ⇒ 已订正为 38；② §6.3 台账第 8 条那一行被编辑成 **9 格**（表头 8 列）⇒ 表格**静默变形**，按列号取值会取错列 ⇒ 已修，并**补了「表格结构体检」**这道闸（行宽必须与表头一致）。

### 11.1 内容（原：脚本在 `/tmp/m9check16.py`，**已于 2026-10-21 重写并落仓**）

- **DL-44**：断言 §0 表中的「十四条增强 / 十七张表 / 五十条判据 / 十一期 / ≈38 人日 / 九条待裁」与正文各自出处**逐项相等**。
- **DL-45**：对每条标成「界面形态已跑」的判据，断言它在 §10.2 的「demo 不能证明什么」表里**必须有对应行**。
- **DL-46**：断言 §6.3 台账里标了 ⛔ 的两条（第 6、8 条）确实卡在 §9-P1d / §9-P1f 上。
- **DL-47~50**：见 §7 表（资源 100 条 / 矩阵分布 53/36/0+25/28/36+8/0/81 / 21 段逐格 + 7 段空 + 3 种前缀 / 无 phase 映射列与映射表）。
- **DL-26**：§3.1 表数 = 17。
- **DL-44 解析兜底**：§0 的分组口径「知识点 7 · 源码与记忆 4 · 资源 2 · 模式与阶段 3 ＋ 语言差异 1」逐项与 §3.1 的代码块一致。

### 11.2 变异腿（必须能红）

15 条变异腿已就位（`/tmp/m9mut16.py`），本计划 W1 一并落仓为 `tests/m9-mutations.test.ts`：

- M1-M5：v1.5 的 5 条（M1 人日改 39 / M2 标注改档 / M3 删 §10.2 登记 / M4 删 ⛔ / M5 删 DL-46 标注）
- M6-M7：§0 / §3.1 分组口径改错
- **M8-M13：v1.6 新增 6 条**（润色耗时 / 剥产出前缀 / 删一段分期 / §0 判据数改 49 / 删分组口径 / 空产出栏填自撰）
- **M14-M15：DL-50 反向**（加 `phase_id` 列 / 新建映射表）

### 11.3 与五闸的关系

- 本检查器**不替代** typecheck / lint / test / docs:check / head-typecheck；与它们并列。
- 本检查器在 §6.3 第 9 条待裁（成材方案是否入库）被定下来之前就能跑 —— **这是 M9 唯一在零产品代码时就能「通过」的判据集**。
- DL-44/45/46/47~50 一旦绿，**§10.2 第一行的「50 条判据本轮零通过」就要改口**，**记录到这一刻就进 §0**。

### 11.4 练习原则的折叠机制（v1.6 §3.22.4 的承诺）

P3 阶段交付时实现：默认只显示「少看多敲」一条；其余 5 条折叠为一行；点开后本机记住；设置页有清除入口。**断言**（P3 出口跑）：
- 默认状态断言「6 条里可见 1 条」
- DOM 中勾选控件数量断言为 0（**绝不是可勾选清单**）
- 折叠状态本机持久化

---

## 12. 与并行会话的边界

⚠️ 本计划**不触碰**以下文件（并行会话禁区）：
- `apps/server/src/routes/navCounts.ts`
- `apps/server/test/navCounts.api.test.ts`
- `packages/shared/src/schemas/nav.ts`
- `docs/decisions.md` · `docs/dev-plan.md` · `docs/tasks.md`
- `docs/specs/m4-playbook.md` · `docs/specs/m6-standard-pack.md`
- `docs/specs/m9-dev-language-roadmap.md`（规格在并行面之外，但本计划**不修改它**；若规格需要更新，按 §10 第 4 条走）

新建文件允许在：`apps/` · `packages/` · `tests/` · `docs/specs/`（不含 m9 主规格）· `scripts/`。

---

## 13. 一页给 owner 看的清单

W1 周一开工时 Duke 应做的三件事：
1. **回复 #3 #4 决策**（采集中文源 / 不允许自建 DAG 节点）—— 否则 P1 启动即停。
2. **本计划** `docs/specs/m9-dev-plan-2026-10.md` 提 PR 自审，**关键路径图与判据矩阵先看 5 分钟**。
3. **`tests/m9-spec-consistency.test.ts` 与 `tests/m9-mutations.test.ts` 同步 PR** —— 这是 M9 零产品代码时唯一能绿的判据集。

W3 末 / W6 末之前**不接受 W4 / W7 才开始看 #6 #8** 的诉求；硬截止就是硬截止。
