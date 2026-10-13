# SPEC · M6a 标准包与注入 —— Web 侧（组装 / 预览 / 导出 / 版本治理）

| 项 | 值 |
|------|------|
| 模块 | M6 标准包与注入（Web 侧） |
| 优先级 | P0 · MVP 核心（全产品价值出口） |
| 上游 | PRD 3.2-M6、4.2（关键决策）、5.1/5.2（业务流） |
| 下游设计 | **design.md §7（标准包文件契约，权威）**、§8（adapter）、§5、§6 |
| 关联任务 | tasks.md T6 · P1.1 追加 T10（见 dev-plan §15） |
| 姊妹规格 | [m6-cli-injection.md](./m6-cli-injection.md)（CLI 侧） |
| 版本 | v1.0（2026-09-20 定稿，随 P0 门禁 G2 冻结 design §7 契约）→ v1.1（2026-09-23，P1.1 裁定 D19：新增 FR-6 预览体量与 token 估算、§5 API 补 `sizeEstimate`、§6.4 明确双防线、§7 验收补 8–12。**不动 design §7 冻结契约**，理由见 FR-6.6（原写 FR-6.5，而 FR-6.5 是「零新依赖」；2026-09-26 队列 ⑥ 复核纠正此指针））→ v1.2（2026-09-24，T10 开工前规格/代码对撞自审：§7 验收 9 的 `perTarget` 键集合改指 `manifest.targets`（原句指 `coveredPlatforms`，实测 `targets:['claude-code','cursor'] → []` 而该包必须给 2 行，断言不可满足；证据 `packages/adapters/src/registry.ts:65`「额外覆盖平台」与 `compat.ts:12-48` 矩阵行 `reads` 全为 `AGENTS.md`），FR-6.3 表补两条口径——`adapter` 用 adapter id、`approxTokens` 按拼接后单次 `ceil` 而非逐文件相加。**行为面（阈值/公式/两视图/不阻断/零新依赖/冻结凭据）一字未改**，依 §0.3 属 B 级（行为规格措辞），`tests/golden/` 零改动） → v1.3（2026-09-24，T10 **Task 7 落地回填**：① §7 验收 10 的构造由「术语全选」改为「**资产全选**（术语 + 提示词）」并写明否证根因——真种子 109 条术语全选实测 **9,617 tok < 12,000**，因 `TERMS.md` 只渲染 `zh/en/aliases/definition` 四列、`example`/`tags` 从不落盘（`packages/shared/src/terms-md.ts` 的 `TermTableRow` 与 `renderTermsMdTable`，**行号不入正文**）；② FR-6.1 的口径注追加同一条教训的**第二维**：全字段语料口径 ≠ 落盘正文口径；③ FR-6.4 的三条字节折算值换成 `SRV-EST-04` 的**真 preview 实测**（预置包 15,213 / cursor 15,235 / trae 15,232，六 target 全 `warn=true`；footprint 67,621 tok / 186,365 B），并纠正折算的**归因错**——借错的只是 CJK 占比那一维（渲染表自身 ≈63%），字节基数本就是渲染后的 `TERMS.md`；④ §7 验收 10 的 sync 腿改述为**结构性保证**并登记未验证面（`sizeEstimate` 不进 `bundleJson()`/`directoryFiles()`，CLI 无从观察）。**阈值 12,000、系数 1.2/4、两视图口径、不阻断语义一律未动**；依 §0.3 属 B 级（行为规格措辞 + 实测数回填，owner 2026-09-24 批准），`tests/golden/` 与 `content/seed/` 零改动，`pnpm bundle:check` 入口 291.02 kB 与 BASE 前逐字节相同） → v1.4（2026-09-26，owner 裁定 ⑫：`selection.playbookIds` 从「传了也静默忽略」改为**非空即 422**——① §3 数据概念块的 `playbookIds` 行补写拒绝口径与 `fieldErrors` 键名（**2026-09-26 队列 ⑥ 复核纠正节号**：原写「§5 的 `playbookIds` 行」，而 §5 输入输出本轮一字未改，且其中从来没有 `playbookIds` 行）；② §6 第 3 条补拒绝理由：`packages/core/src/pack/resolve.ts` 从不读这一字段，放过等于替用户谎报「技巧库已挂上」，而 M4 上线时拆闸属**变宽**、不碎任何客户端；③ §7 验收 7 的「三种 4xx」校正为**四种**。**沟通口径纠正**：待决策项选项文本写的是 400，本仓 zod 失败一律 **422 `VALIDATION_ERROR`**（`apps/server/src/lib/validate.ts:20` 明文），实现按仓内约定落，**未为此新增状态码**。读侧不受影响——`PackOut` 虽复用 `PackSelection`，但服务端对库中取出的行不做 `PackOut.parse`（**2026-09-26 队列 ⑥ 复核否证了此处原写的「现测：全仓 `.parse`/`.safeParse` 命中只在新写的单测里」**——排除 `*.test.ts` 与 `/test/` 后仍有数十处非测试命中，复算 `grep -rn --include="*.ts" --include="*.tsx" -E "\.(parse\|safeParse)\(" apps packages \| grep -vE "\.test\.ts\|/test/\|node_modules\|/dist/\|/pkg/"`；成立的只是前半句那件具体的事：`apps/server` 不把库中取出的行过 `PackOut`，`PackOut` 在 server 侧只作 type），历史行仍读得出；**留下的后果**是持有非空 `playbookIds` 的旧行无法原样 PATCH 回来（PATCH 走 `PackUpdateInput`，同一道闸）。**FR-6 行为面（阈值 12,000 / 系数 1.2 与 4 / 两视图 / 不阻断 / 零新依赖）一字未改**；依 §0.3 属 B 级（`PackSelection` 在 `pack.ts:11`，位于 design §7 冻结块之前），`tests/golden/` 与 `content/seed/` 零改动。**④ 行号清理（C 级，随 ⑥ 复核）**：本轮把两处**指针型**行号（`terms-md.ts` 的四列定义、`packs.ts` 的导出腿）换成符号名；链表内另留 4 处**证据引用型**行号（`registry.ts:65`、`compat.ts:12-48`、`validate.ts:20`、`pack.ts:11`）**不动**——它们引的是那一行写着的文字，换成符号名就把证据本身换掉了，与「清零」是两件事。）→ v1.5（2026-10-01，**V2 换肤轮的「治理文档先行」第 4 件**：新增 **FR-7「Web 侧干跑与漂移对照」**——两条只读端点 `POST /api/packs/:id/dry-run` 与 `GET /api/projects/:id/diff`，并在 §2 In/Out、§5 API 与 UI、§6.7–6.12、§7.13–7.21 同步。**零新增算法**：五状态规划器 `planInjection` 与磁盘比对器 `diffPackLock` 早已入库并在 CLI 侧交付（`packages/core/src/inject/planner.ts`，被 `apps/cli/src/commands/sync.ts` 与 `diff.ts` 消费），本段新增的只是一条 HTTP 只读通道与它的口径。**三条承重判断各自带凭据**：**①** 干跑基线 = **导出实例**（`latestExport` → `exportByVersion` → `bundle_json` 过 `PackBundleSchema` 并逐条复算哈希，与 CLI `verifyPack` 同判据）而不是现渲 `renderPack`——CLI 注入消费的是导出实例，用定义哈希回答「明天 `sync` 会怎样」会给出一个 CLI 永远写不出的哈希集，凭据 = §7.15 的双腿反证（钉「等于 v1 导出哈希」**且**否证「等于当前 preview 哈希」，单腿会被内容巧合蒙过）；**②** Web **不落盘**，`applyDecisions`、备份目录、`sync-lock` 抢锁全部不在范围，界面唯一出口是一条把路径单引号包住的命令，凭据 = §7.19 的目录快照前后比对（顺带登记一条 finding：既有 `suggestedCommand` 是不带引号的拼接，带空格路径粘进终端会断成两个参数，改它要动四处已入库的字符串断言、属 B 级，本轮不动，新端点的 `command` 字段不复用它）；**③** 响应**原样透出** `defaultDecision`（DRIFT 与 CONFLICT 均为 `overwrite`），而 DESIGN.md 建议界面预选「保留本地」——两者不是同一个东西，同屏必须并列显示，产品默认值变更属行为裁定 ⇒ **新立队列 ㉕**（`docs/decisions.md`，状态待裁），凭据 = §7.20（㉕ 若裁改产品默认，该断言**应当变红**并被显式升版，不许被顺手改掉）。**另纠正一处字面歧义**：规划器给 `CONFLICT` 两个 `options`、`DRIFT` 三个，而 DESIGN.md 组件条与 `specs/theme.md` FR-5.6 写的「冲突三选一」在 CONFLICT 那档实为两选一 ⇒ 界面按 `options` 渲染，DESIGN.md 那行随本笔同步改写。**判级**：依 §0.3 属 **B 级**（新增对外端点与响应形状，动的是 specs 的 FR／边界／验收条目）；**不触 A 级冻结面**——design §7 契约、`schemaVersion`、`PackBundleSchema` 与 `PackLockSchema` 的形状一字未动，新 schema 只在读侧响应末尾追加、住在 §7 冻结块之外，错误码一条都不新增（`ERROR_CODES` 是闭集）。**本轮纯文档**：未落任何代码、未跑任何测试，因此**不声称跑过**；`tests/golden/` 与 `content/seed/` 此刻工作树零改动（复算 `git status --porcelain tests/golden/ content/seed/` 输出为空，采样 2026-10-01 工作树），§7.21 要求的带 ref 锚凭据（§13-7）与 dev-plan §9／§15.3 的验收-测试映射行**按定义只能在代码轮落地后补**——测试此刻不存在，先写映射行等于再造一条悬空引用，落点与判据写在 `[DEV-0080]` 的未完成段。） → v1.6（2026-10-03，**M4 技巧库上线带来的 `playbookIds` 改判**——本段是 `m4-playbook.md` FR-8「拆闸」那把刀的**文档半拆闸**，与代码那半同笔；owner 已裁（D25 的三处同批口径）＋ standing 指令「未开发的 phase 本次一并实现」授权）：owner 裁 ⑫（v1.4）那道「非空即 422」闸拆除。**§3 的 `playbookIds` 行**由「恒为 `[]`（M4 未上）；非空即 422」改为「非空**可成包**，产出 `PLAYBOOKS.md` ＋ 正文一行交叉引用；引用的技巧已删除 → 422 `STALE_SELECTION`」；**§6 第 3 条**改写为「不再是拒绝项」，并保留裁 ⑫ 的原立论作为**已消解的前提**记在案（`resolve.ts` 从不读该字段 ⇒ 静默接受等于替用户谎报——M4 让这条立论的前提消失，不是让这条立论失效）；**§7 验收第 7 条**由「四种 4xx」改回「三种」（第 4 种随闸撤下，且该场景现在与第 1 种同码 `STALE_SELECTION`，单列会教用户两个码对应一件事）。**行为面未动的部分**：`STALE_SELECTION` / `VERSION_IMMUTABLE` / 空 targets 三条原样；`FR-6` 的阈值 12,000、系数 1.2 与 4、两视图口径、不阻断语义一字未改；`design §7` 契约与 `schemaVersion` 未动（`PlaybookIds` 只在 `PackSelection` 里多了一条真腿）。**判级**：依 §0.3 属 **A 级**（拆的是 `design §7` 冻结块边缘的选集契约，owner 已裁）；零回归凭据形态在 `m4-playbook.md` §7.4。**一处凭据形态的修正见同批的 `m4-playbook.md` v1.2**——§7.4 那条 grep 闸的口径本身有洞，本段一并登记。） |

---

## 1. 目标与用户价值

「标准化」的物理载体：用户在 Web 向导里挑资产（提示词/术语/skill）+ 选流程模板 + 选目标平台 → 得到一个**纯 Markdown/YAML、git 友好、带版本和指纹的标准包**，供 CLI 注入或直接拷贝进项目。它同时是 P0 阶段的契约冻结对象——格式一旦定稿即承诺向后兼容。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| 标准包定义 CRUD + 组装向导（5 步） | 双向同步的**写侧**（把项目改动收为资产、Web 侧落盘）——只读半边已由 FR-7 交付 |
| 文件生成与预览（所见即所得字节级一致） | 团队包共享与评审（P2/M7） |
| 注入前干跑计划 + 漂移只读对照（**FR-7**，2026-10-01 新立；零新增算法，复用 core 规划器与比对器） | 逐行正文 diff（要返回磁盘正文，属新增暴露面，另立 FR） |
| 导出：单文件 bundle（HTTP 下载）+ 目录导出（离线/git 共享） | 包市场 / 订阅 |
| 版本治理：semver、指纹、不可变重导校验 | |
| 注入历史登记（供 M5 显示与 CLI 溯源） | |

## 3. 数据与核心概念

```
StandardPack（定义，可迭代）{
  id: "pk_<nanoid>", name,            // name 全局唯一，slug 规则 [a-z0-9-]
  description,
  selection: {
    promptIds: id[],                  // 引用当前版本内容；导出时物化快照
    termIds: id[],
    skillIds: id[],
    playbookIds: id[],                // M4 技巧库已上线（2026-10-03），非空**可成包**：产出 `PLAYBOOKS.md` + 正文一行交叉引用；引用的技巧已删除 → 422 `STALE_SELECTION`（见 §6 第 3 条）
    flowTemplateId: id                // 导出时物化 stages 快照
  },
  targets: ("claude-code"|"cursor"|"generic-agents"|"codebuddy"|"trae"|"minicode")[],  // MVP 六个（D7+D9/D10 扩充，2026-09-20），见 design §8 v1.2
  version: semver,                    // 手动设定，导出时校验
  createdAt / updatedAt
}
PackExport（导出实例，不可变）{
  id, packId, version, fingerprint,   // 算法见 design §7.6
  manifestJson（完整快照，含各资产内容）,
  exportedAt, channel: "download" | "directory"
}
```

**关键语义**：定义可编辑，导出不可变。每次导出把 selection 引用的资产内容**物化**进导出记录——之后资产被改/删，不影响已导出包的可复现性。

## 4. 功能需求（FR）

### FR-1 组装向导（5 步）
1. **步骤1 基本信息**：name（唯一性即时校验）、描述。
2. **步骤2 流程模板**：单选（内置/自定义任一）；选中后展示阶段预览。
3. **步骤3 资产挑选**：三栏多选（提示词按 active + useAs/platformMarks 过滤；术语支持「选集/全部」；skill 全列）；默认按「最近更新」排序。
4. **步骤4 目标平台**：多选 claude-code / cursor / generic-agents / codebuddy / trae / minicode（决定生成哪些文件，见 FR-2）；页面同步展示**兼容矩阵**提示（本包额外覆盖 zcode / Kimi Code / Codex 等读 AGENTS.md 的平台，见 design §8）。
5. **步骤5 预览与版本**：左侧文件树 + 右侧内容查看（等宽渲染）；设定 version；显示校验结果与警告；文件树每行显示体量（`kB · ≈tok`），顶部显示 **perTarget 上下文成本条**与 footprint 总量（FR-6，`warn` 时黄条）。
6. 向导任意步可回退；定义保存后可再次编辑重新导出。

### FR-2 文件生成
1. 生成文件集合由 targets 决定（**完整字节级格式规范 = design.md §7，本 spec 只锁行为**）：
   - `claude-code` → `CLAUDE.md`；
   - `cursor` → `.cursor/rules/openvibe.mdc`；
   - `generic-agents` → `AGENTS.md`；
   - `codebuddy` → `CODEBUDDY.md`（正文复用主模板）；
   - `trae` → `.trae/rules/openvibe.md`（v1.2 自定义文件名 + frontmatter `trigger: always`，正文复用主模板）；
   - `minicode` → `MINI.md`（MiniCode `/init` 约定，正文复用主模板）；
   - 任一 target + 含术语 → `TERMS.md`；含流程 → `CHECKLIST.md`；含 skill → `SKILLS.md`；恒生成 `openvibe.pack.json`。
2. 规则段（useAs=rule）进主文件「行为规则」节；参考类（useAs=reference）进「任务提示词参考」附录节——由生成器统一编排，用户不逐文件排版。
3. **预览即产物**：预览接口与导出接口调用同一生成器函数；预览展示的字节 = 导出写入的字节。
4. rule 类提示词含 `{{变量}}` → 警告列出（不阻断）；selection 为空（无任何资产且无流程）→ 阻断 422。

### FR-3 导出
1. **bundle 下载**：单 JSON 文件 `openvibe-pack-<name>-<version>.json`，内含 manifest + 全部生成文件内容（CLI `sync --file` 直接消费）。
2. **目录导出**：写 `~/.openvibe/packs/<name>@<version>/`（`openvibe.pack.json` + `files/` 按真实路径展开），git 友好（纯文本、无时间戳抖动：文件内不含生成时间，时间只在 manifest）。
3. 导出成功 → 创建不可变 PackExport 记录 + 更新导出历史。
4. 同 `(packId, version)` 重复导出：指纹一致 → 幂等成功（不新建记录）；指纹不一致 → **409 `VERSION_IMMUTABLE`**，提示升版本号。

### FR-4 版本与指纹
1. version 必须合法 semver；新导出版本必须 > 最近导出版本（允许 patch 级）。
2. fingerprint 计算遵循 design.md §7.6（对排序后 (path, fileSha256) 对做 sha256）；预览页实时展示指纹。
3. 资产变更不影响已导出实例；再次导出前向导提示「以下资产相对上次导出有变化」。

### FR-5 注入历史
1. CLI sync 成功后上报（或 sync 前领取任务时登记，见 m6b FR-2.5）：记录 packId@version、项目路径、时间。
2. Web 端包详情页展示注入历史；M5 项目工作台读取同一数据（配合 lock 文件，见 m5 FR-6）。

### FR-6 预览体量与 token 估算（P1.1 加入 · D19，收 dev-plan §14-1）

1. **要解决的问题**：用户组完包看不出「这份注入物会吃掉目标工具多少上下文」，而规则文件挤占上下文正是 vibe coder 的真实痛点。**§14-1 原提议的 `chars/4` 口径经实测不成立**——本仓种子语料高度 CJK：`content/seed/terms.json` 109 条的**全部字符串字段**（`zh`/`en`/`aliases`/`definition`/`example`/`tags`，按码点计）实量 **14,622 码点 / 78.4% CJK**，按本 FR 公式 ≈ **14,544** tok，而 `chars/4` 只给 3,656 ⇒ **低估 4.0 倍**。故本 FR 锁定**分字区双系数**口径。
   > **口径必须与数字同处登记**（本轮自查撞出的教训）：只统计 `zh`+`definition`+`example` 三字段是 10,662 码点 / 92.6% CJK / ≈12,044 tok——换字段口径就换数，**不写口径的数字一律不可复核**，落地时 `CORE-SIZE-*` 夹具按「全字段」口径写。
   > **v1.3 追加同一条教训的第二维**：本 FR 上面的 14,622 码点 / 78.4% CJK 是**语料全字段**口径，而 `TERMS.md` **落盘只渲染 `zh`/`en`/`aliases`/`definition` 四列**（`packages/shared/src/terms-md.ts` 的 `TermTableRow` 与 `renderTermsMdTable`，**行号不入正文**），`example`/`tags` 从不上盘（109 条渲染后实测 25,472 B / 11,223 码点）。**语料口径不可当落盘正文口径用**——§7 验收 10 的原句就是踩了这一步，实测否证见该条。
2. **估算函数**：`packages/core/src/pack/size.ts` 导出纯函数 `estimateTokens(content)` → `{ codePoints, cjk, other, approxTokens }`，其中 `approxTokens = ceil(other/4 + cjk*1.2)`。CJK 判定取码点区间 `[0x3000,0x30ff] ∪ [0x3400,0x9fff] ∪ [0xf900,0xfaff] ∪ [0xff00,0xffef]`；遍历用 `Array.from(content)`（**按码点**，不是 UTF-16 的 `String.length`，否则代理对与 emoji 虚增）。`1.2` 与 `4` 是粗估常数、不是任何 tokenizer 的实测曲线，因此展示层一律带 `≈`，且措辞必须是「近似上下文量（非计费口径）」，不得出现「token 数」这类断言式表达。
3. **两个视图，不许混成一个数**：preview 响应新增**可选**字段 `sizeEstimate`：
   | 子字段 | 含义 |
   |--------|------|
   | `perTarget[]` | `{ adapter, files[], approxTokens, warn }`——该平台**实际读进上下文**的量 = 它的主文件 + `TERMS.md` + `CHECKLIST.md` + `SKILLS.md`。`adapter` 取 `manifest.targets` 里的 **adapter id**（不是展示名，也不是 `coveredPlatforms`——后者只描述兼容矩阵的额外覆盖，见 §7 验收 9）；`approxTokens` 由该平台读入的这些文件**拼接后整体估算**（单次 `ceil`），**不是**逐文件 `approxTokens` 相加——逐文件相加把每份的取整余数各进一次，系统性高估且差值随文件数增长 |
   | `footprint` | `{ files[], approxTokens, bytes }`——整包落盘足迹（含被六个 adapter 各自复制的主文件） |
   必须分开：六个 target 的主文件是同一份内容复制六遍，只报 footprint 会把重复算进上下文压力，得出近 6 倍虚高的结论。
4. **只提示，永不阻断**：`perTarget.approxTokens > 12000` → 该 target `warn=true`，Web 侧黄条。与既有字节防线**并列且不可互相替代**——§6.4（>2MB / 单文件 >512KB 警告）与 m6b §6.3（同口径**拒绝执行**）是硬边界，token 估算不参与任何放行判断，超线也不改变导出与 sync 的结果。default 包单平台的量，**自 v1.3 起为真 preview 实测**（驱动器 = `SRV-EST-04`，在 `apps/server/test/packs.api.test.ts` 里跑 `runSeed` + `ensureDefaultPack` + `preview`——一个要进规格的数字必须有仓库内可复现路径，不能只活在报告文字里）：拼接后单次 `ceil` 得 **claude-code / codebuddy / generic-agents / minicode 各 15,213，cursor 15,235，trae 15,232**，六个 target **全部 `warn=true`**；整包 `footprint` = **67,621 tok / 186,365 B**。**这些是当前估算常数（`1.2` / `4`）与 `SIZE_WARN_THRESHOLD = 12_000` 下的测量值，不是任何 tokenizer 的读数**，且随种子语料与包名长度而变（包名进主文件抬头，改一个字符即挪 1 tok），故一律**不进断言字面量**——断言钉命题，数字由具名分支现测。历史说明：v1.2 及以前此处给的是三条字节折算值（DEV-0020/DEV-0022 的 主文件 14,525 B + `TERMS.md` 25,464 B + `CHECKLIST.md` 482 B = **40,471 B**，CJK 占比取 0.60 / 0.784 / 0.926 ⇒ ≈15.1k / 15.7k / 16.0k），实测 15,213 落在第一档附近；**v1.3 自查纠正该折算的归因**：其字节基数**是**渲染后的 `TERMS.md`，借错的只是 **CJK 占比那一维**（0.60/0.784/0.926 来自全字段/子集语料口径，渲染表自身占比 ≈63%）。结论不依赖取哪一档，也不因纠正而变——**每一档都越过 12,000 阈值**，故**首启预置包自己就会亮黄条**：这是刻意的真话，向导文案与发布说明都不得为消掉它而调高阈值。
5. **零新依赖**：不引入任何 tokenizer 包。`bundle:check` 的入口体积**贴着 300 kB 预算线、余量只剩个位数百分比**（DEV-0019 风险②），把词表塞进前端即撞线；**具体 kB 数不在本文复制**——它是每次打包都变的量，单源走 `pnpm bundle:check` 现测（dev-plan §13-8 的「口径与数字同处登记、跨文不抄数」规矩；原句此处曾硬写「291 kB / 余量仅 3%」，2026-09-24 仓库级扫描发现它与同日实跑数不等，已按 C 级改写为指针形态）。估算在服务端算完随响应下发。
6. **「不动冻结契约」的凭据**：`sizeEstimate` 只在 `toPreviewOut`（`apps/server/src/lib/pack-assemble.ts`）组装，**既不写进 `openvibe.pack.json`，也不进 `directoryFiles()` 导出集**——而 golden 三夹具捕的正是导出目录（`tests/golden/artifacts.ts` 只取 `directoryFiles()` + 3 个 sidecar）。因此本变更属 §0.3 **B 级**而非 A 级；该结论由 §7 验收 12 做成机器断言，不靠本文这句话自证。
7. **确定性**：同一 pack 定义连续两次 preview → `sizeEstimate` 逐字段相等（纯函数，无时间与随机成分）。

### FR-7 Web 侧干跑与漂移对照（2026-10-01 新立 · V2 换肤轮的治理文档先行第 4 件）

> **为什么立在这里而不是 m5**：数据侧的两个纯函数早就入库并在 CLI 侧交付了——五状态规划器 `planInjection` 与磁盘比对器 `diffPackLock` 都在 `packages/core/src/inject/planner.ts`，被 `apps/cli/src/commands/sync.ts`、`diff.ts` 各自消费。**本 FR 零新增算法**，新增的只是「Web 怎么只读地拿到同一份结论」这条通道，而通道另一头连的是「组包导出面」——包侧的干跑属 M6a，项目侧只读展示（`injection-status`）继续归 m5 FR-6，**两份契约不互相复制**。

1. **两条端点，都是只读计算**：
   - `POST /api/packs/:id/dry-run`，body `{ projectId }` → `PackDryRunOut`。
   - `GET /api/projects/:id/diff` → `ProjectDiffOut`。
   动词形态：dry-run 用 POST 与既有 `POST /:id/preview` 同族（带 body 的计算，不是资源创建，无 201）；diff 用 GET（幂等、无 body）。两者响应形状新立在 `packages/shared/src/schemas/pack.ts` 末尾（追加，不动 design §7 冻结块内的任何 schema）。

2. **干跑基线 = 导出实例，不是包定义**（本 FR 的承重判断，§7.15 做成反证断言）：文件集合与期望哈希取自该包**最近一次导出**——`packs.latestExport(id)` → `packs.exportByVersion(id, version)` → `bundle_json` 过 `PackBundleSchema`，再逐条 `fileSha256(content)` 与 `manifest.files[].sha256` 复算比对（与 CLI 侧 `verifyPack` 那条腿同判据）。
   **为什么不用 `renderPack` 现渲**：CLI 注入消费的是导出实例（bundle 下载或目录导出），不是库里当前定义。用定义现渲的哈希去回答「明天跑 `sync` 会怎样」，在资产已被改动时会给出一个 **CLI 永远不可能写出的哈希集合**——那不是「预览即产物」，是它的反面。
   无导出记录 → **`NOT_FOUND`（404）**，文案给出「先导出」这个动作；**不新增错误码**（`ERROR_CODES` 是闭集，本 FR 一条都不加）。

3. **规划器复用，字段不裁不改**：调 `planInjection({ files, readDisk, lock, targets })`——`lock` 由 `<localPath>/.openvibe/pack.lock.json` 经 `parsePackLock` 取（读不到 / 解不开走 §6.7、§6.8），`targets` 固定 `null`（Web 不做 CLI 的 `--target` 逐平台过滤，MVP 整包口径）。响应逐项透出 `plan.files[]` 的 `status` / `options` / `defaultDecision` / `packSha256` / `diskSha256` / `lockSha256` / `managed` / `inScope` 与 `plan.counts`、`plan.pending`。
   **裁剪一次就多一处漂移源**：CLI 打印的计划表和 Web 的干跑表必须是同一个 `InjectPlan` 对象，否则「在 Web 上看着没事、到终端跑出 DRIFT」这种分裂会直接烧掉本产品的信任面。

4. **Web 不写盘**（继承 m5 FR-6.2 与 m6b 的「写路径唯一 = CLI」对外承诺）：`applyDecisions`、备份目录、`sync-lock` 抢锁**都不在本 FR 范围**。界面上不得出现任何会落盘的「应用 / 覆盖 / 一键注入」按钮；本屏的唯一出口是一条可复制的命令
   `npx openvibe-cli sync '<projectPath>' --pack <name>@<version>`。
   > **路径必须单引号包住**——既有 `suggestedCommand`（`packages/core/src/local/lock.ts` 的 `readInjectionStatus`）是不带引号拼接的，带空格的 `localPath` 粘进终端会断成两个参数。这是一条 **finding**：改它要同时动四处已入库的字符串断言，属 B 级行为变更，**本轮不动**；新端点的 `command` 字段按带引号形态出，**不与旧字段同源复用**（免得「修一个字段」被读成「两条腿都已修」）。

5. **待决项的真实形状是 2 或 3，不是一律 3**：规划器给 `CONFLICT` 两个 `options`（`overwrite | skip`）、`DRIFT` 三个（`overwrite | keep-local | skip`）。DESIGN.md 组件条与 `specs/theme.md` FR-5.6 写的「冲突三选一」在 CONFLICT 这一档实为**两选一**——界面按响应里的 `options` 数组渲染，不硬写三档 radio。（本 FR 顺带纠正 DESIGN.md 那行的字面歧义，改在组件条正文。）

6. **界面预选 ≠ 规划器默认动作，两者同屏并列**（owner 待裁 ⇒ 队列 `docs/decisions.md` **㉕**）：`defaultDecision` 对 DRIFT / CONFLICT 都是 `overwrite`（「以包为准」），这是**已入库且随 v0.1.0 对外发布过的 CLI 行为**；DESIGN.md 建议 Web 分段控件初始高亮「保留本地」（手改不被无声覆盖的安全默认）。响应**原样带 `defaultDecision`**，一个字都不改；界面可以高亮别的，但同一屏必须显示「CLI 默认：以包为准」——否则用户在 Web 看到的预选与终端里 `--yes --strategy` 的实际批量结果**方向相反**。本轮代码按「界面预选 = 保留本地 / 响应 = 原样」落地并挂 ㉕ 待裁；owner 若裁「改产品默认」，那是 CLI 行为变更（B 级以上），不属本 FR 的措辞。

7. **混合选择在 CLI 侧不可用一条命令表达**：`--strategy` 是**单值批量**且只作用在 `plan.pending` 上（`strategyToDecisions` 既有实现），逐项处置只有交互式。⇒ 界面允许逐文件不同选择时，给出的建议命令必须是**不带 `--yes`** 的交互形态并在计划表点名待决项数；只有全部取同一策略时才允许拼 `--yes --strategy <那一个>`。

8. **diff 的四态与降级姿态**（GET 腿）：`status` 取 `clean | drifted | absent | invalid`。`absent` = 无 lock（尚未注入）→ **200 不抛错**，工作台卡片要能显示它而不是弹红；`invalid` = lock 在但解析失败或含非法路径 → **200 + `error` 文案**，且**绝不回 `clean`**（把「读不懂」当成「一致」是本模块最危险的假绿，与 m6b v1.4 那条「f2 一档不许被跳过」同源）。`drifted[]` 只带 `{ path, expected, actual }`（三个都是哈希），**不含正文**。
   > **逐行正文 diff 不在本 FR**：返回磁盘正文等于新开一条「按路径读任意文件内容」的数据面，而 `DiffResult` 从来只给哈希。要做属新增 FR，走 §0.3 B 级。

9. **读盘范围（安全边界，逐条可查）**：只读三类路径——`pack.lock.json` 本身、`plan` 侧来自导出 `files[].path` 的生成文件（design §7.7 契约校验过）、`lock.files[].path`（`PackLockSchema` 的 `packPathSchema` + `sanitizeLockEntries` 两道闸）。每个相对路径都过 `resolveWriteTarget(projectPath, relPath)`，返回 `null`（解析后跳出项目根）⇒ **整条请求拒绝**，落 `VALIDATION_ERROR` + `details.escapingPaths`（与 CLI 的 `PATH_ESCAPE` 同判据、不同载体）。**不列目录、不 glob、不递归**——沿用 `GET /api/projects/:id/injection-status` 那句「只回 `InjectionStatusOut`，绝不列目录内容」的同一条纪律。

10. **路径一律从库里取**：`projectPath` = `projects` 记录的 `localPath`，**不接受客户端传绝对路径**。这与既有 `GET /api/injection-status?dir=` 那条权宜通道**不同**——后者是 onboarding FR-2.4 在项目尚未登记时的例外，本 FR 不复制这个例外（新增面要小于既有面，才谈得上收口）。

11. **确定性口径**：dry-run / diff 是「(导出实例, 磁盘快照, lock) → 计划」的纯函数，无时间、无随机。两次调用结果可以不同，**唯一合法的变化源是磁盘或 lock 变了**。响应里的 `exportedAt` / `injectedAt` 是回显导出记录与 lock 里**既有**的时间戳，不是本次计算的时刻——否则「两次响应不等」会被误读成规划器不稳定。

12. **零新依赖 / 不触冻结面**：不引入 diff/tree-sitter/tokenizer 库，不写进 `openvibe.pack.json`，不进 `directoryFiles()` 与 `bundleJson()`——与 FR-6.6 同理，`tests/golden/` 三夹具由 §7.21 的 ref 锚形态自证零触碰。

## 5. 输入 / 输出

- **API**：`/api/packs` CRUD、`POST /api/packs/:id/preview`（返回 files[] + fingerprint + warnings + `sizeEstimate`，后者自 P1.1 / FR-6 起为可选字段）、`POST /api/packs/:id/export`（body: `{version, channel}`）、`GET /api/packs/:id/exports`、`POST /api/injections`（CLI 上报）；**FR-7 追加**（只读计算，不改以上任何一条的形状）：`POST /api/packs/:id/dry-run`（body `{projectId}` → `PackDryRunOut`）、`GET /api/projects/:id/diff`（→ `ProjectDiffOut`）。
- **UI**：`/packs`（列表 + 详情 + 导出历史）、`/packs/new`（5 步向导）；**FR-7 追加两处落点**：`/packs/:id` 详情的「注入前干跑」面板（选目标项目 → 五状态计划表 + 建议命令），`/projects/:id` 的注入状态卡升级为「漂移对照」（四态 + 待决项计数 + 同一命令出口）。
- **对下游输出**：bundle JSON / 导出目录 → CLI sync；注入历史 → M5；**干跑与漂移只输出「会怎样」，不输出「已怎样」**（写侧结果永远来自 CLI 的 `sync` 上报，不在 Web 侧造第二条真相源）。

## 6. 边界与异常

1. name 冲突 → 创建时 422；name 含大写/下划线 → 422（slug 规则）。
2. selection 引用的资产在导出时已被删除 → 导出 422 `STALE_SELECTION`，向导标红失效项让用户重选（**快照语义只保护已导出实例，不保护未导出的定义**）。
3. targets 为空 → 阻断（至少一个平台）。**`playbookIds` 现状（2026-10-03 M4 上线后）**：不再是拒绝项。owner 裁 ⑫ 当年那道闸（2026-09-26，把非空选集判为 422）的立论是「`packages/core/src/pack/resolve.ts` 从不读这一字段，传了既不进产物也不改指纹，静默接受等于替用户谎报『技巧库已挂上』」——**M4 上线把这条立论的前提消掉了**：`resolve.ts` 现在真读它、真物化出快照、composer 真产出 `PLAYBOOKS.md`，且正文写一行交叉引用（`m4-playbook.md` FR-7.6）。非空且全部存在 ⇒ 正常成包；**引用已被删除 ⇒ 沿用第 2 条那把闸：导出 422 `STALE_SELECTION`**，归因须指向「只选了技巧」而非「空选集」。闸的拆除是 `m4-playbook.md` FR-8 的 **A 级契约面变更**，零回归凭据形态在该 spec §7.4（golden `G1/G2/G3` 全绿 + `git status -- tests/golden/` 零改动 + 四处孤儿文档/断言同批改判）。**本行若再次改判，须与 `m4-playbook.md` FR-8 同批**——只拆一处不拆另一处，等于把「拆闸是变宽」这句承诺教给用户两次。
4. 生成文件总量 > 2MB 或单文件 > 512KB → 警告不阻断（注入侧有同类防线且**会**拒绝执行，m6b §6.3；原此处误写 `m6b §6.7`——§6.7 是 schemaVersion 不兼容，2026-09-23 按 §0.3 C 级修正）。**字节防线与 FR-6 的 token 估算是两条独立通道**：前者量落盘体积、后者量上下文压力，任一超限不触发另一条，估算超线也绝不阻断导出。
5. 目录导出目标已存在（同版本重导且指纹一致）→ 幂等覆盖前先比对，不一致则 409（与 FR-3.4 同源）。
6. 生成器对资产内容做**路径安全净化**：文件内容中出现的本地绝对路径（skillDir 等）在 SKILLS.md 中原样保留（信息用途），但不生成任何包含 `..` 或绝对路径的**文件路径**（契约校验，design §7.7）。
7. **（FR-7）** 无 lock 但磁盘已有同名文件 → 全部判 `CONFLICT`，界面必须说清「本包从未登记过这些文件」，**不得显示成「检测到漂移」**：DRIFT 的含义是「我们拥有过它、之后被改」，把 CONFLICT 说成 DRIFT 等于替用户认下一笔他没做过的账（规划器 `managed` 那条分水岭已给对，此处只禁措辞漂移）。
8. **（FR-7）** 磁盘读失败要分两类：`ENOENT` / `ENOTDIR` = 文件没了（进 `missing` / 判 `NEW`）；**其余读错误（权限、IO）不能当成「没找到」**——CLI 侧同判据是 `READ_FAILED` 中止，Web 侧落既有 `INTERNAL`（500）并在文案点名绝对路径。把 IO 失败误判为 missing，用户会以为文件被删了而去重注入覆盖，这是**假阴性里最贵的一种**。
9. **（FR-7）** `lock` 存在但解析不出或含非法路径 → diff 侧 `status='invalid'`（200 + `error`），dry-run 侧同样拒绝出计划（`VALIDATION_ERROR`）：一份被改过的 lock 不能当比对基准，这条与 m6b 的 `LOCK_INVALID` 一档同判据。**两个方向都不许降级成 `clean`**。
10. **（FR-7）** `projectPath` 为空、不存在或不是目录 → `VALIDATION_ERROR`（`fieldErrors.localPath`）。这一条与 m5 §6.1 的「保存项目时降级为 warning」**刻意不同**：保存路径可以是未来的事（先登记后 clone），读盘比对没有「路径未知也算通过」这一档。
11. **（FR-7）** 导出记录里 `bundle_json` 的内容与 `manifest.files[].sha256` 不一致（库内数据被手工改过）→ `VALIDATION_ERROR` 并点名违规路径，**不比 CLI 更宽松**：CLI 在这一步拒写，干跑若照常出计划，就是把同一份坏数据展示成两条相反结论。
12. **（FR-7）** 请求的 `:id` 与该项目登记的包不是同一个（m6b §6.10 的一项目一包边界）→ **照常出计划**并带一条 `warnings`（「该项目登记的是另一个包」）：干跑回答的是「如果注入这个包会怎样」这个问句，问句本身合法，不该被库里另一条登记挡掉。但 `lock.files[]` 里属于另一个包的受管项会走 `CONFLICT` 而非 `UPDATE`——界面按状态说话，不按"是不是同一个包"另造一套词。

## 7. 验收标准（pass/fail）

1. 同一 pack 定义连续两次 preview → 文件集合与全部 sha256 完全一致。
2. preview 返回的某文件内容与目录导出后磁盘同名文件字节一致。
3. 导出 v1.0.0 → 修改包内一条提示词再导 v1.0.0 → 409 VERSION_IMMUTABLE；改 v1.1.0 → 成功且两条导出记录指纹不同。
4. 含 6 条术语 + claude-code + generic-agents targets 的包 → 生成文件恰为 `CLAUDE.md`、`AGENTS.md`、`TERMS.md`、`openvibe.pack.json`（无流程无 skill 时不出现 CHECKLIST/SKILLS）。
4b. targets 仅 codebuddy + trae + minicode 的包 → 生成文件恰为 `CODEBUDDY.md`、`.trae/rules/openvibe.md`、`MINI.md`、`openvibe.pack.json`（三个文件正文与 CLAUDE.md 主模板一致，仅文件名/壳不同；trae 含 `trigger: always` frontmatter）。
5. 删除已被某导出引用的提示词 → 该导出记录的 manifest 与再下载 bundle 不受影响（物化验证）。
6. bundle JSON 被 `openvibe sync --file` 成功消费（联测归 m6b 验收 1）。
7. `STALE_SELECTION` / `VERSION_IMMUTABLE` / 空 targets 三种 4xx 均有结构化错误码。**原第 4 种「非空 `playbookIds`」已于 2026-10-03 随 M4 上线撤下**（`m4-playbook.md` FR-8；该场景现在走 `STALE_SELECTION`，与前三种里的第 1 种同码，故不再单列）。
8. **`estimateTokens` 纯函数单测**（`CORE-SIZE-01..05`，不依赖 DB 与 HTTP）：空串 → 0；401 个 ASCII 字符 → 101（向上取整生效）；20 个汉字 → 24（系数 1.2 生效）；含一个非 BMP emoji 的串按**码点**计（同一串若按 `String.length` 会多出代理对那一位，断言取码点口径）；中英混合串 = 两系数之和向上取整。
9. preview 的 `sizeEstimate.perTarget[]` 中 `adapter` 集合与 **`rendered.manifest.targets` 集合**完全一致（**不是** `coveredPlatforms`：后者只来自兼容矩阵、返回平台展示名且矩阵行 `reads` 全是 `AGENTS.md`——`targets:['claude-code','cursor']` 的包实测返回 `[]`，而它必须给 2 条 perTarget 行，原句「与响应既有 `coveredPlatforms` 完全一致」不可满足。2026-09-24 T10 开工前按 §0.3 **B 级**修正，改因与实测见版本行）；`footprint.files[].path` 集合与主字段 `files[]` 集合完全相等（不多不少，含合成的 `openvibe.pack.json`）。
10. 阈值正负各一支：构造单平台估算 ≤12000 的包 → 全部 `warn=false`；把**资产改为全选（术语 + 提示词）**使某 target 估算 >12000 → 该 target `warn=true`，**且**同一包导出成功、响应 `warnings` 仍为空（估算不参与放行，FR-6.4 的负向断言）。
    > **v1.3 更正 · 原句「把术语改为『全选』」经实测否证**：真种子 109 条术语全部选中、提示词为空时，`perTarget[claude-code]` 实量 **9,617 tok < 12,000**——术语单选永远越不了线，原句的构造**不可能满足**。根因即 FR-6.1 那条追加教训：`TERMS.md` 只渲染四列，原句把**全字段语料口径**当成了**落盘正文口径**。owner 2026-09-24 裁定改为「资产全选」（该夹具现测 14,890；随种子与包名长度而变，故不作断言字面量），**阈值与系数一字未动**——调低阈值与「不得为消掉黄条而调高阈值」同源，一并禁止。
    > **sync 腿的凭据形态（不是遗漏，是口径）**：`openvibe sync --file` 的结果与 `warn` 无关这一腿，在 server 侧**没有**子进程级断言——`sizeEstimate` 既不进 `bundleJson()` 也不进 `directoryFiles()`（两者都在 `apps/server/src/routes/packs.ts` 的导出腿，**行号不入正文**），CLI 无从观察它，所以这是**结构性保证**而非被证明的命题；已在 DEV_LOG 的未验证面登记，收口叙述不得把它写成「已断言」。
    > **落地凭据**：`SRV-EST-02`（正负两支；正向支走真种子 ⇒ 断言与种子同源，种子瘦身到撑不起 12,000 时这支**应当**变红）、`SRV-EST-02b`（**纯函数侧**阈值边界：恰好 12,000 不 `warn`，防住 `>` → `>=` 的静默翻转）、`SRV-EST-04`（首启预置包六个 target 全 `warn=true`，即 FR-6.4 权威数的仓库内可复现驱动器）。
11. 确定性：同一 pack 定义连续两次 preview → `sizeEstimate` 序列化后逐字节相等。
12. **冻结契约未受影响的可执行证明**：加入 `sizeEstimate` 后 `pnpm test`（golden 三夹具字节比对）与 `pnpm bundle:check` 全绿，且 `git diff --name-only tests/golden/` 输出为空——这条就是 FR-6.6「属 B 级不属 A 级」那句结论的机器凭据，缺它则该结论只是自述。
13. **（FR-7）** dry-run 的 `plan.files[].path` 集合与该导出实例 `bundle.files[].path` 集合**完全相等**（不含 `openvibe.pack.json`——`buildBundle()` 只放 `rendered.files`，manifest 是导出目录的 sidecar、从来不是注入目标；与 `toPreviewOut` 为展示而追加的那一行不是一回事）。
14. **（FR-7）** 五状态各至少一支：同一临时项目里按「先注入 → 分别造 NEW / IN_SYNC / UPDATE / CONFLICT / DRIFT」构造（写 lock + 写盘即可，不需要真跑 CLI 子进程），断言 `plan.counts` 与逐项 `status`；**同一磁盘快照连跑两次 → 响应逐字节相等**（FR-7.11 的确定性腿）。测试族 `SRV-DRY-*`（**支数与具名上界不入正文**，§13-9；取数 `grep -roE 'SRV-DRY-[0-9]+[a-z]?' apps/server/test | sort -u`）。
15. **（FR-7）** 基线来源反证——这条是 FR-7.2 的机器凭据，缺它则「取导出实例而不是现渲」只是散文：导出 v1 → **改包内一条提示词** → 再 dry-run，计划里那一项的 `packSha256` 仍是 **v1 导出实例的哈希**，且断言它**不等于**当前 `preview` 同一 `path` 的 `sha256`（两条腿都要：钉住"用了旧的"，同时否证"等于新的"，否则实现改用现渲也可能因内容巧合相等而蒙过）。
16. **（FR-7）** 前置缺失的两种形状：无导出记录 → 404 `NOT_FOUND`；无 lock 且磁盘已有同名文件 → 该项 `CONFLICT`（**不是 DRIFT**，§6.7）。
17. **（FR-7）** 逃逸项整条拒绝：手工造一份 `lock.files[].path` 含 `../escape.txt`（或符号链接解析后跳出项目根）的 lock → `VALIDATION_ERROR` + `details.escapingPaths` 点名该路径，且**响应体不含任何项目外路径的读取结果**。**否证腿**：把 `resolveWriteTarget` 返回 `null` 那一支改成「跳过这一项继续比」，本支应当变红——静默吞掉逃逸项的实现照样能返回一个"看起来对"的结论，那才是这条断言要拦的东西。
18. **（FR-7）** `invalid` 不判 `clean`：喂一份存在但解析不出（或含非法 path）的 lock → diff 返回 `status='invalid'`，且**即使 `drifted` 与 `missing` 都为空也不得出现 `clean`**。配一条负向对照：空 lock 文件、非 JSON 体、合法 JSON 但 `files[].path` 违规三种输入各一支。
19. **（FR-7）** **零写入反证**（本 FR 不写盘这条对外承诺的唯一凭据）：dry-run 与 diff 各跑若干次后，对 `<projectPath>` 跑前后各取一次目录快照（路径 + mtime + 字节数）并比对——**不得新增任何条目**（特别是 `.openvibe/backup/` 与 `.openvibe/` 本身），`pack.lock.json` 的 mtime 不变，项目外路径零访问。这条同时拦住两类实现：一是顺手建目录，二是"为了预览方便先落一份临时文件"。
20. **（FR-7）** `defaultDecision` 原样透出：DRIFT 项 `defaultDecision === 'overwrite'` 且 `options` 长度 3；CONFLICT 项 `options` 长度 2（FR-7.5/7.6 两腿）。**界面怎么高亮是 UI 的事，响应改一个字就是行为变更**——㉕ 若裁「改产品默认」，这条断言应当变红并被显式升版，不许被顺手改成 `keep-local`。
21. **（FR-7）** 冻结契约未受影响：代码轮落地后 `tests/golden/` 与 `content/seed/` 零触碰，凭据按 §13-7 用带 ref 锚的形态给（`git diff --name-only <BASE>..<HEAD> -- tests/golden/ content/seed/` → 0 行，`<BASE>` = 该轮起点 sha 并与登记同处写明），且 `pnpm test` / `pnpm bundle:check` 全绿。**不带 ref 的那条只作补充**——本轮是纯文档轮，此条待代码轮自证，不得提前声称。

## 8. 依赖

- 依赖：M1/M2/M3 素材、M5 流程模板、design.md §7 契约（生成器实现于 packages/core，Web/CLI 共用）。
- 被依赖：m6b CLI sync（唯一消费方）；M5 注入状态展示。
