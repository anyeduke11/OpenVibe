# SPEC · 有效上下文密度（草案：一次注入的受管上下文量 ÷ 包覆盖的资产数，可复算、可归因、上脸）

| 项 | 值 |
|------|------|
| 模块 | 横切能力（度量面，非 PRD 3.2 的资产模块）——沿用「横切能力用功能名」命名法（dev-plan §0.4 第 5 条）；代号 **MT1**（PRD §10.0 右列的 MT 命名空间） |
| 优先级 | **RF3-1**（PRD §10.2 表 RF3 行；分析文 §7 Phase 3 表 3-1 行判级预判 **B**：新增展示字段，不改现有两视图语义） |
| 上游 | PRD §10.2/§10.3；分析文 §9.1 度量表 **D1 行**（「一次注入写入的**受管 token 数** ÷ 该包在库里覆盖的资产数」，现有能力栏原文「无（只有 `estimateTokens` 单点估算）」，产出栏「面板显示 + 按资产归因（哪 5 条最占地方）」）· §7 Phase 3 表 3-1 行（**出口判据单源在那里**）；`docs/specs/m6-standard-pack.md` FR-6（体量与 token 估算的既有裁定，本文件建立在它之上而不是重做它） |
| 下游设计 | design §7.3（正文四段与标记）、§7.4（三个辅助产物）、§7.6（码点序与指纹）；`docs/specs/service-layer.md`（密度是 `packService` 的派生量，不是 route 里的临时算式） |
| 关联任务 | **无**。PRD §10.4 第三组原文：「本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」 |
| 版本 | **v0.9 草案（2026-10-03，纯新文件；本轮不改任何既有规格）**。按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**：分母口径有两个读法且**差 28%**（§3-6 现算），未裁之前写实现等于替 owner 选一个数 |

---

## 1. 目标与用户价值

- 用户组包时看得到「多少条提示词、几个文件、多大字节」，看不到的是**这些问题往 AI 的上下文里塞了多少**。分析文 §3.2 命题四把产品的稀缺资源定义为「上下文额度」，但直到今天，界面上没有任何一个数回答「这个包划不划算」——`perTarget` 给了总量，用户得自己做除法，而且**不知道该除以什么**。
- 除法今天就能算，且**算错的成本极低**：同一份 golden 夹具里，按「全套文件」口径 G3 每资产 ≈315，按「某一个平台真正读进去的那批文件」口径是 ≈78（§3-5 现算，4 倍差）。**没有单一口径，任何比较都是噪声**——这正是本文件存在的理由：不是新增估算器，而是把已有零件钉成一个口径。
- 第二层价值是**归因**。「密度太高」是句没法行动的话，「这 5 条提示词占了 61%」才是可行动的。`composer.ts` 里每类资产本来就有各自的渲染函数（`promptBlock`、`stageBlock`、术语表行、Skill 表行），归因所需的信息**结构上已经分离存在**，只是没人把它接出来（FR-3）。
- 明确不做的一件事：密度**不是质量指标**。它没有「越低越好」的方向性——一条 3,000 字的长提示词密度极高但可能正是全包最值的那条（§6.6）。本项把它做成**读数 + 归因**，不做排行、不做阈值告警。

## 2. 范围

| In（本 spec 覆盖） | Out（明确不做，写明理由与去向） |
|---|---|
| 唯一密度口径的定义（分子视图／分母口径／显示单位三要素齐全） | 新的 token 估算器、新系数、新 tokenizer（**明令复用** `estimateTokens`，见 FR-1.4） |
| 派生量 `density` 进 `sizeEstimate`，与 `perTarget`／`footprint` 并列展示 | 改 `perTarget`／`footprint` 的任何语义或数值（两视图一字不动，FR-6） |
| 按资产归因（每条资产渲染段的 ≈ 值 + 结构性开销，恒等式成立） | 落盘后的「真实受管量」（磁盘上用户手改过的那份归 `write-selfproof.md` FR-5 的段切分口径） |
| 面板显示（既有 `PackPreviewPane` 的体量块加一行 + top-5） | 任何阈值、告警、排行、跨包比较榜单（§6.6 是设计戒律，不是遗漏） |
| 复算性验收（同包两次组装逐位相同 + G1/G2/G3 三个期望值） | 把 `tokens` 变成计费口径的表述（`m6-standard-pack.md` FR-6 的措辞约束继续全量生效，FR-4.3） |
| MT1 入度量表（一条 grep／一条命令可复算，供 `docs-governance-check.md` 取数） | 新增网络面、新增 DB 列、新增运行期依赖（三项都零） |

## 3. 现状与实测基线（采样：2026-10-03 工作树；golden 为提交树 `54789b8` 内容）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 估算器现状 | `packages/core/src/pack/size.ts`：`estimateTokens(content) → {codePoints, cjk, other, approxTokens}`，`approxTokens = ceil(other/4 + cjk*1.2)`；`SIZE_WARN_THRESHOLD = 12_000`；`estimateBundle(parts)` 求和。CJK 取四段码点区间，遍历按**码点** | `sed -n '1,50p' packages/core/src/pack/size.ts` |
| 2 | 两视图现状 | `buildSizeEstimate(files, manifestJson, targets)`（`apps/server/src/lib/pack-assemble.ts:90-115`）产出 `perTarget[]`（该 adapter 的主文件 + `TERMS.md`／`CHECKLIST.md`／`SKILLS.md` 三辅助产物，存在才算）与 `footprint`（**全部文件 + manifest**）。`CONTEXT_AUX` 常量在 `:88` | `grep -n 'CONTEXT_AUX' apps/server/src/lib/pack-assemble.ts` |
| 3 | 展示与挂载点现状 | `PreviewOut.sizeEstimate` 是 **optional**（`packages/shared/src/schemas/pack.ts:164`）；面板 `apps/web/src/components/packs/PackPreviewPane.tsx:44-50` 已在渲染 `perTarget` 表格；`sizeEstimate` 缺席时**整块不渲染**（测试用例 `05 假零禁止` 在 `PackPreviewPane.test.tsx:78`） | `grep -n 'sizeEstimate' apps/web/src/components/packs/PackPreviewPane.tsx` |
| 4 | **密度分子所需的「受管」范围** | 主文件正文 = `PACK_MARKER_BEGIN … PACK_MARKER_END`（`packages/core/src/pack/composer.ts:109`／`:129`），四段常量 `PACK_SECTION_{FLOW,RULES,TERMS,REFERENCE}`（`packages/shared/src/pack-contract.ts:56-59`）。**术语正文不在主文件里**——主文件只写一行「见 TERMS.md（N 条）」（`composer.ts:123-126`） | `grep -n 'PACK_SECTION\|MARKER' packages/shared/src/pack-contract.ts` |
| 5 | **两口径差多少（G3 现算）** | G3 夹具：`targets` 六个，资产 **9** 条（4 提示词 + 2 术语 + 2 Skill + 1 流程模板）。claude-code 的 `perTarget` = `CLAUDE.md` 419 + `TERMS.md` 125 + `CHECKLIST.md` 81 + `SKILLS.md` 73 = **≈698**，密度 = 698÷9 ≈ **78**；`footprint` 把 9 个文件全加 = **≈2834**，同一分母得 ≈ **315** ⇒ **同一包两个数差 4.0 倍** | `python3` 按第 1 行公式跑 `tests/golden/G3/files/**`（口径见 `.zwork/ovc-density.py`，采样时现算） |
| 6 | **分母两个读法差多少（G3 现算）** | 资产口径：4 + 2 + 2 + 1 = **9**（流程模板算 1 条）。渲染段口径：4 个 `####` 提示词块 + 3 个 `###` 阶段块 + 2 术语行 + 2 Skill 行 = **11** ⇒ 698÷9 ≈ 77.6 与 698÷11 ≈ 63.5，**相差 28.2%**。G3 的阶段结构是「启动 2 项／执行 1 项／收口 0 项」清单 | `grep -c '^####' tests/golden/G3/files/CLAUDE.md`（=4）、`grep -c '^###' …`（=3） |
| 7 | 另两组夹具的现算密度 | **G1**：2 提示词 + 6 术语 = 8 资产，claude-code 读 `CLAUDE.md` 260 + `TERMS.md` 259 = **≈519** ⇒ ≈ **65**／资产。**G2**：1 提示词、无辅助产物，trae 的主文件 **≈176**（含 frontmatter）、codebuddy/minicode **≈156** ⇒ 密度即单文件值 176 或 156 | 同第 5 行脚本跑 `tests/golden/G1`、`G2` |
| 8 | 各 adapter 之间的密度差有多大 | G3 六个主文件 ≈：**419（CLAUDE/CODEBUDDY/MINI/AGENTS）／438（.trae）／441（.cursor）** ⇒ 极差 **22 tok（5.2%）**，且**唯一来源是 frontmatter**（正文 `body` 六份全同，`composer.ts:173-178`）。结论：跨 adapter 的密度差**不构成信息** | 同第 5 行脚本的逐文件输出 |
| 9 | 归因所需的渲染分段 | `promptBlock`（`composer.ts:99`）、`stageBlock`（`:92`）、`renderChecklistMd` 逐阶段行（`:138-147`）、`renderSkillsMd` 逐 Skill 行（`:149-165`）、`renderTermsMdTable`——**五个都已是「一条资产一个字符串」的形状，但四个是模块私有（未 export）** | `grep -n 'function promptBlock\|function stageBlock' packages/core/src/pack/composer.ts` |
| 10 | 资产数此刻在不在响应里 | **不在**。`PreviewOut` 的字段是 `files`／`fingerprint`／`warnings`／`coveredPlatforms`／`sizeEstimate`（`schemas/pack.ts:158-166`）；manifest 里有 `prompts`／`terms`／`skills`／`flow`，但那是**另一个对象**，前端要算密度得把 manifest 再传一遍 | `sed -n '158,166p' packages/shared/src/schemas/pack.ts` |
| 11 | 顺序确定性的既有防线 | `tests/order-determinism.test.ts` 已专门测确定性排序（含 `['飞轮','flywheel']` 这类码点序用例）⇒ FR-2 的「同包两次组装逐位相同」不是新规矩，是给既有规矩加一条数值断言 | `grep -n 'describe\|it(' tests/order-determinism.test.ts \| head` |

## 4. 数据与核心概念

- **密度是一个三元组，不是一个数**：`(分子视图, 分母口径, 显示单位)`。三者任一变动都会让「同一个数」不可比，所以定义必须一次钉全，写进类型名与界面文案，而不只写在文档里。
- **分子（本文件的裁定）**：某个 target 的 `perTarget.approxTokens` ——即「该平台一次读进去的受管内容近似量」。不取 `footprint`（六份主文件复制，实测 4.0× 虚高，§3-5）；不取主文件 alone（术语与 Skill 正文在辅助文件里，主文件只有一行指针，§3-4）。跨 target 只报 **max**，因为 §3-8 实测各 target 差异只来自 frontmatter，报 min/mean 会制造假精度。
- **分母（待裁，见 §8.2①）**：包内**资产条数**（选中语义：4 提示词 + 2 术语 + 2 Skill + 1 流程 = 9）或**渲染段数**（展开语义：阶段各算一段 = 11）。两者差 28%（§3-6）。
- **受管内容**：位于 `<!-- openvibe:pack=… begin/end -->` 标记之间或由标记归属的产物正文。辅助产物（`TERMS.md`／`CHECKLIST.md`／`SKILLS.md`）**整体计入**——它们整份由包生成，不存在段外内容。
- **结构性开销**：总量减去所有单资产段之和 = 标记行 + 包标题 + 导语 + 四个段头 + 空行 + Skill 表头表尾。**它必须作为一个具名余数出现**（FR-3.3），恒等式 `Σ 单资产段 + 结构性开销 = 总量` 是可测的（不是排版建议）。
- **近似性**：`1.2` 与 `4` 是粗估常数、不是任何 tokenizer 的实测曲线（`m6-standard-pack.md` FR-6.2 原文）。所以本文件的每个数都带 `≈`，且**密度不许变成第二个精确到小数的数**——FR-4 的取整规则由此而来。

## 5. 功能需求

### FR-1 · 口径唯一化

1. 密度的唯一定义落在服务端：`density = max(perTarget[].approxTokens) ÷ 资产数`，两个输入都取自已有的 `buildSizeEstimate` 与 `ResolvedPack`，**不接受第三个来源**。
2. 派生字段名 `density`，形状 `{ approxPerAsset: number, numerator: number, denominator: number, basis: 'perTarget-max' }`。**分子与分母都随值下发**（`PreviewOut` 里任何只给结果不给成分的展示数字都会导致口径腐化，这是 §3-2 两视图被混用的根因）。
3. 单一真源：`packages/shared/src/schemas/pack.ts` 的 `SizeEstimate` 族加一个可选子对象。**不改** `perTarget`／`footprint` 的既有字段。
4. **禁止**新建估算函数、修改系数、引入任何 tokenizer 依赖（分析文 §9.1 的 D1 行「需新增」列写的是「无（只有 `estimateTokens` 单点估算）」，本项的实质就是把这个「单点」接成一条线）。

### FR-2 · 可复算

1. 同一包（同一 `ResolvedPack`）连续组装两次，`density` 三要素逐位相同。落为 `IT-DENS-01`，与既有 `tests/order-determinism.test.ts` 同一族的纪律。
2. golden 三个夹具的期望值写进测试：G1 → `519/8`、G2 → `176/1`（trae 视角，含 frontmatter 的那一份为 max）、G3 → `698/9`（§3-5、§3-7 现算）。**期望值以分母待裁结果为准重写一次**，不偷偷取另一个数凑通过。
3. 界面文案里出现的数与 API 里的数同源（禁止前端再算一次除法，禁止 `Math.round` 两套）。

### FR-3 · 按资产归因

1. `composer.ts` 产出**逐资产渲染段**的近似量：提示词按 `promptBlock`、阶段按 `stageBlock`、术语表行、Skill 表行——**复用这些既有私有函数**，把它们导出或就地汇总，**不新写第二套渲染**。
2. 每条 `{ kind, refId | title, approxTokens }`，按 `approxTokens` 降序（同值按码点序，与 §7.6 同一口径）。取 **top-5** 展示，其余折叠为「其余 N 条 ≈M」，折叠项的和必须可加回（FR-3.3）。
3. **恒等式**：`Σ(单资产段) + structuralOverhead = 分子`。断言方式：一条测试直接减出余数并断言非负；面板把余数当作「结构性开销」一栏显示，**不许摊进某条资产**。
4. 归因粒度与分母解耦：即便 §8.2① 裁「按资产」，归因仍按渲染段给（一条提示词就是一段），界面明写两者口径不同（一句人话，FR-4.4）。

### FR-4 · 上脸

1. 显示位 = **既有**体量块（`PackPreviewPane.tsx:44` 那块）新增一行「每资产 ≈N（分子／分母 折叠可见）」+ 一个 top-5 折叠列表。不新造页面、不新造面板（与 `growth-path.md` FR-4「不新造交互语言」同一条约束）。
2. `sizeEstimate` 或 `density` 缺席 ⇒ 整行不渲染，**不得显示 0 或「—」**（`m6-standard-pack.md` FR-6.4 的假零禁止是既有裁定，直接沿用其测试形制 `PackPreviewPane.test.tsx` 的 `05` 用例）。
3. 措辞沿用 `m6-standard-pack.md` FR-6 的约束：一律带 `≈`，出现单位处标注「非计费口径」；**不得**写「token 数」「节省 X token」「上下文成本 X 元」这类断言式或换算式表达（产品侧不做计费承诺）。
4. 一句口径解释常驻可点开（「这里是这一个平台一次读进去的量，不含它自己的历史对话」）。文案进 i18n 命名空间——若 `entry-budget.md` FR-1 已拆命名空间，本条文案落 `zh.packs`（该文件里给的例子正是 `i18n/zh/packs.ts`）；否则落现 `zh.ts` 并登记为迁移点。

### FR-5 · 不放松既有防线

1. `perTarget` 的 `warn`（> 12,000 亮黄条）与字节防线（`m6b §6.3`）语义与阈值全不动，密度**不参与任何告警判定**。
2. 密度只在服务端组装（`toPreviewOut`），前端零计算 ⇒ 入口 chunk 不受影响（`entry-budget.md` FR-5 的余量 22 B 不能被本项吃掉，验收 `BUILD-DENS-01` 就是 `bundle:check` 绿）。
3. `sizeEstimate` 不进 manifest、不进 `directoryFiles()`、不进指纹——**这条既有钉法（P1.1-T10 计划里写死的「属 B 不属 A 的物理凭据」）对本项派生字段同样生效**，违反即升 A。

### FR-6 · 判级与凭据

1. 判级 **B**：新增可选展示字段，不改契约、不改产物字节、不改任何既有数值语义。先例同款：`sizeEstimate` 当年即以「**B 级 · 只在 `toPreviewOut` 组装 ⇒ 不触 design §7 冻结契约**，凭据是 golden 零 diff」登记入账（`[DEV-0023]` 的「两份新 FR-6 规格」段），本项的 `density` 挂同一个对象、继承同一判级理由。
2. 凭据必须是**现算**：`tests/golden/` 零 diff + §3-5/§3-6/§3-7 的数字可一条脚本复算 + `bundle:check` 绿。不得以「测试通过」代替这三件。

## 6. 边界与异常

### 6.1 空包与零资产
分母为 0（未选任何资产的包）⇒ `density` **不下发**（字段缺席），不是 `0`、不是 `Infinity`、不是 `NaN`。这是 FR-4.2 假零禁止最容易踩的一脚，必须写成独立用例。

### 6.2 辅助产物被六个 target 共享 ⇒ 归因不能按 target 分摊
`TERMS.md` 一份、六个平台都读（§3-2 的 `CONTEXT_AUX`）。若按 target 分摊，同一术语会被计 6 次。所以归因表的口径是**单 target 视角**（选一个平台看它读进去什么），面板默认展示 max 那个 target 并写明是哪个。

### 6.3 分母待裁期间不许「先随便选一个」
§8.2① 未裁前，任何实现都会把 28% 的口径差固化进界面数字与测试期望值（FR-2.2）。所以本项的开工前置**就是那条裁定**，不是它的排期。这也是本文件写成 v0.9 的直接原因。

### 6.4 估算误差的诚实条款
系数不是 tokenizer 曲线（§4 末条），跨 CJK/ASCII 混合的误差方向未知。因此：密度只用于**同一包内部的相对比较**（这条资产占多少），不用于跨包绝对值承诺。若 §7.7-② 的实测偏差 > 15%，界面须降级为区间而非点值——阈值写死，不靠手感。

### 6.5 与 `write-selfproof.md` 的分工
本文件度量**组包时**的应然密度；落盘后被手改的实然密度归那份文件的段级切分。两者共用「标记边界」这一套知识（§3-4），但**不得共用实现**：本文件的分子来自内存中的渲染结果，那边来自磁盘文本切分。合并成一个函数会把「应然」与「实然」混成一个数，正是本文件要治的病。

### 6.6 密度不是 KPI（设计戒律）
低密度可能是「资产多而每条短」（好），也可能是「包体小」；高密度可能是「一条超长规则」（该拆）也可能是「一条精准定义」（不该拆）。因此**禁止**：阈值告警、排行榜、「优化到 X 以下」的 DoD。这条写进 spec 而不是靠评审记忆，因为它是全仓最容易在下一轮被「顺手加个进度条」破坏的地方。

### 6.7 与 `entry-budget.md` 的唯一接触面
本项给前端的只是 `PreviewOut` 里几个数（值随响应下发，估算在 core 跑），因此**不得**把 `estimateTokens` 或任何 core 值 import 进 `apps/web`（P1.1-T10 计划已把这条列为 FR-6.5 的禁止项，实测判据是 web 源码 grep `@openvibe/core` 零命中）。

## 7. 验收标准（pass／fail 二值）

| ID | 判据 | pass 条件 |
|---|---|---|
| `UT-DENS-01` | 分子口径 | `density.numerator` 等于该包 `perTarget[].approxTokens` 的 max，且**不等于** `footprint.approxTokens`（构造六 target 夹具时后者必然更大） |
| `UT-DENS-02` | 分母口径 | 分母取 §8.2① 裁定后的唯一口径；G3 夹具断言 = 该口径下 9 或 11，二选一**写死在测试名里** |
| `UT-DENS-03` | 恒等式 | `Σ(归因段) + structuralOverhead = numerator`，夹具 G3 上成立且余数 ≥ 0 |
| `UT-DENS-04` | top-5 与折叠 | 折叠项之和 + top-5 之和 = 全量；降序稳定（同值按码点序） |
| `SRV-DENS-01` | 派生字段挂载 | `density` 只在 `toPreviewOut` 组装；manifest／`directoryFiles()`／指纹内零命中（一条 grep） |
| `IT-DENS-01` | 可复算 | 同包两次组装三要素逐位相同（G1/G2/G3 三组期望值全中） |
| `WEB-DENS-02` | 假零禁止 | `density` 缺席或分母 0 ⇒ 整行不渲染；用例断言 DOM 内不出现「0」「—」「Infinity」「NaN」 |
| `WEB-DENS-03` | 措辞 | 界面出现 `≈` 与「非计费口径」标注；全仓 grep 无「节省」「token 数」「成本」式表述（词表见 FR-4.3） |
| `BUILD-DENS-01` | 预算不动 | `pnpm bundle:check` 绿 **且** `grep -rn '@openvibe/core' apps/web/src` 命中 0 |
| `GOLD-DENS-01` | 契约零变化 | `tests/golden/` 零 diff（产物字节不受本项影响） |
| `REG-DENS-01` | 度量入账 | MT1 行登记「口径三元组 + 复算命令」，且命令能复算出 §3-5/§3-6 的两个数 |

### 7.7 未验证面（负向登记，不得读成已通过）

- **① 真机 token 数**：本文件所有数都是 `ceil(other/4 + cjk*1.2)` 的输出，与任何真实模型 tokenizer 的偏差**未测**（§6.4 的 15% 降级线需要一次真测才能激活，现在只有阈值没有数据）。
- **② 系数来源**：`1.2` 与 `4` 的取值理由在 `m6-standard-pack.md` FR-6.2 只写作「粗估常数」，无实测曲线支撑。本项沿用而不重测，是**继承缺陷**，不是验证通过。
- **③ 用户是否看得懂**：FR-4 的一切措辞未经五人走查（分析文 §10-1 的走查是 RF2 的硬前置，本项虽属 RF3，其展示层同样受它管辖）。走查前不得声称「面板易懂」。
- **④ 真实包的密度**：§3-5/§3-7 用的是 **golden 夹具**（G1/G2/G3 是合成包）。`content/seed` 的 `default` 预置包（术语 109 条量级）密度未算——它更可能是全仓第一个「密度看起来离谱」的真实样本，须在实现时补算并判断是不是口径问题。
- **⑤ 落盘侧**：用户手改后实然密度与本项应然密度的差值分布未测（那是 `write-selfproof.md` 的面，本文件不声称覆盖）。

## 8. 依赖

| 方向 | 项 |
|---|---|
| 前置 | **§8.2① 的分母裁定**（不裁则 FR-2.2 的期望值无法定稿）；`service-layer.md`（密度归 `packService`／`toPreviewOut`，路线搬迁后再挂，避免同一函数改两遍） |
| 并行 | `entry-budget.md`（i18n 文案落哪个命名空间取决于 FR-1 是否已拆；两者互不阻塞实现，只阻塞文案落点） |
| 后置 | `growth-path.md` FR-6（C6 成长面板若要显示密度，取本文件的派生字段，不得自己算）；`docs-governance-check.md`（MT1 行入账） |
| 不依赖 | `local-event-ledger.md`（度量与事件台账正交：密度是**包属性**，与使用次数无关）、`adapter-fixtures.md`（§3-8 已证跨 adapter 差无信息量，本项不依赖 adapter 夹具） |

### 8.2 待裁清单（不代 owner 裁）

| # | 待裁 | 我的倾向与理由 |
|---|---|---|
| ① | **分母口径**：资产条数（9）还是渲染段数（11）？现算差 **28.2%**（§3-6） | 倾向**资产条数**：它是用户在选择界面里**看得见的东西**（勾了几条），而段数依赖渲染细节（流程模板展开成几段），后者变一次密度就变一次，用户无从解释。但「看得见的数」与「稳定的数」在这里第一次不一致，须 owner 定取舍 |
| ② | **流程模板算 1 条还是算它的阶段数**（这是 ① 的具体分歧点，单独裁是因为它最容易被默认掉） | 倾向算 1 条资产（模板是被选的单位），但**归因表里按阶段展开显示**，两个口径同时可见、各自标注 |
| ③ | **`density` 要不要进 `PreviewOut`（可选字段）还是新端点** | 倾向并进 `PreviewOut.sizeEstimate`：零新端点、零新 schema 根对象、判级停在 B；新端点会把它变成独立契约面，收益只有「响应更小」，不成立 |
| ④ | **跨 target 报 max 还是逐 target**（§3-8 实测差 5.2%，信息量低但非零） | 倾向报 max 并在成分里给出是哪个 target；逐 target 会让面板多六行而几乎同值，是**噪音不是信息** |
| ⑤ | 界面出现「token」字样的许可度（FR-4.3 我按 `m6-standard-pack.md` 的禁令写成「不得出现断言式 token 表述」，但分析文 §9.1 的度量名本身叫「有效上下文密度」且定义里写「受管 token 数」） | 倾向**文档保留 token、界面只说「近似上下文量」**：文档要能被复算，界面要不能被读成承诺是另一件事。这是措辞裁定，归 owner，不自作 |
