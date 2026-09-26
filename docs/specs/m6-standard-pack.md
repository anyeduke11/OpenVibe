# SPEC · M6a 标准包与注入 —— Web 侧（组装 / 预览 / 导出 / 版本治理）

| 项 | 值 |
|------|------|
| 模块 | M6 标准包与注入（Web 侧） |
| 优先级 | P0 · MVP 核心（全产品价值出口） |
| 上游 | PRD 3.2-M6、4.2（关键决策）、5.1/5.2（业务流） |
| 下游设计 | **design.md §7（标准包文件契约，权威）**、§8（adapter）、§5、§6 |
| 关联任务 | tasks.md T6 · P1.1 追加 T10（见 dev-plan §15） |
| 姊妹规格 | [m6-cli-injection.md](./m6-cli-injection.md)（CLI 侧） |
| 版本 | v1.0（2026-09-20 定稿，随 P0 门禁 G2 冻结 design §7 契约）→ v1.1（2026-09-23，P1.1 裁定 D19：新增 FR-6 预览体量与 token 估算、§5 API 补 `sizeEstimate`、§6.4 明确双防线、§7 验收补 8–12。**不动 design §7 冻结契约**，理由见 FR-6.5）→ v1.2（2026-09-24，T10 开工前规格/代码对撞自审：§7 验收 9 的 `perTarget` 键集合改指 `manifest.targets`（原句指 `coveredPlatforms`，实测 `targets:['claude-code','cursor'] → []` 而该包必须给 2 行，断言不可满足；证据 `packages/adapters/src/registry.ts:65`「额外覆盖平台」与 `compat.ts:12-48` 矩阵行 `reads` 全为 `AGENTS.md`），FR-6.3 表补两条口径——`adapter` 用 adapter id、`approxTokens` 按拼接后单次 `ceil` 而非逐文件相加。**行为面（阈值/公式/两视图/不阻断/零新依赖/冻结凭据）一字未改**，依 §0.3 属 B 级（行为规格措辞），`tests/golden/` 零改动） → v1.3（2026-09-24，T10 **Task 7 落地回填**：① §7 验收 10 的构造由「术语全选」改为「**资产全选**（术语 + 提示词）」并写明否证根因——真种子 109 条术语全选实测 **9,617 tok < 12,000**，因 `TERMS.md` 只渲染 `zh/en/aliases/definition` 四列、`example`/`tags` 从不落盘（`packages/shared/src/terms-md.ts:7-12,39`）；② FR-6.1 的口径注追加同一条教训的**第二维**：全字段语料口径 ≠ 落盘正文口径；③ FR-6.4 的三条字节折算值换成 `SRV-EST-04` 的**真 preview 实测**（预置包 15,213 / cursor 15,235 / trae 15,232，六 target 全 `warn=true`；footprint 67,621 tok / 186,365 B），并纠正折算的**归因错**——借错的只是 CJK 占比那一维（渲染表自身 ≈63%），字节基数本就是渲染后的 `TERMS.md`；④ §7 验收 10 的 sync 腿改述为**结构性保证**并登记未验证面（`sizeEstimate` 不进 `bundleJson()`/`directoryFiles()`，CLI 无从观察）。**阈值 12,000、系数 1.2/4、两视图口径、不阻断语义一律未动**；依 §0.3 属 B 级（行为规格措辞 + 实测数回填，owner 2026-09-24 批准），`tests/golden/` 与 `content/seed/` 零改动，`pnpm bundle:check` 入口 291.02 kB 与 BASE 前逐字节相同） → v1.4（2026-09-26，owner 裁定 ⑫：`selection.playbookIds` 从「传了也静默忽略」改为**非空即 422**——① §5 的 `playbookIds` 行补写拒绝口径与 `fieldErrors` 键名；② §6 第 3 条补拒绝理由：`packages/core/src/pack/resolve.ts` 从不读这一字段，放过等于替用户谎报「技巧库已挂上」，而 M4 上线时拆闸属**变宽**、不碎任何客户端；③ §7 验收 7 的「三种 4xx」校正为**四种**。**沟通口径纠正**：待决策项选项文本写的是 400，本仓 zod 失败一律 **422 `VALIDATION_ERROR`**（`apps/server/src/lib/validate.ts:20` 明文），实现按仓内约定落，**未为此新增状态码**。读侧不受影响——`PackOut` 虽复用 `PackSelection`，但服务端对库中取出的行不做 `PackOut.parse`（现测：全仓 `.parse`/`.safeParse` 命中只在新写的单测里），历史行仍读得出；**留下的后果**是持有非空 `playbookIds` 的旧行无法原样 PATCH 回来（PATCH 走 `PackUpdateInput`，同一道闸）。**FR-6 行为面（阈值 12,000 / 系数 1.2 与 4 / 两视图 / 不阻断 / 零新依赖）一字未改**；依 §0.3 属 B 级（`PackSelection` 在 `pack.ts:11`，位于 design §7 冻结块之前），`tests/golden/` 与 `content/seed/` 零改动） |

---

## 1. 目标与用户价值

「标准化」的物理载体：用户在 Web 向导里挑资产（提示词/术语/skill）+ 选流程模板 + 选目标平台 → 得到一个**纯 Markdown/YAML、git 友好、带版本和指纹的标准包**，供 CLI 注入或直接拷贝进项目。它同时是 P0 阶段的契约冻结对象——格式一旦定稿即承诺向后兼容。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| 标准包定义 CRUD + 组装向导（5 步） | 双向同步（项目改动回读比对，P1） |
| 文件生成与预览（所见即所得字节级一致） | 团队包共享与评审（P2/M7） |
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
    playbookIds: id[],                // 恒为 []（M4 未上）；**非空即 422 `VALIDATION_ERROR`**（owner 裁 ⑫，2026-09-26，理由见 §6 第 3 条）
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
   > **v1.3 追加同一条教训的第二维**：本 FR 上面的 14,622 码点 / 78.4% CJK 是**语料全字段**口径，而 `TERMS.md` **落盘只渲染 `zh`/`en`/`aliases`/`definition` 四列**（`packages/shared/src/terms-md.ts:7-12,39`），`example`/`tags` 从不上盘（109 条渲染后实测 25,472 B / 11,223 码点）。**语料口径不可当落盘正文口径用**——§7 验收 10 的原句就是踩了这一步，实测否证见该条。
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

## 5. 输入 / 输出

- **API**：`/api/packs` CRUD、`POST /api/packs/:id/preview`（返回 files[] + fingerprint + warnings + `sizeEstimate`，后者自 P1.1 / FR-6 起为可选字段）、`POST /api/packs/:id/export`（body: `{version, channel}`）、`GET /api/packs/:id/exports`、`POST /api/injections`（CLI 上报）。
- **UI**：`/packs`（列表 + 详情 + 导出历史）、`/packs/new`（5 步向导）。
- **对下游输出**：bundle JSON / 导出目录 → CLI sync；注入历史 → M5。

## 6. 边界与异常

1. name 冲突 → 创建时 422；name 含大写/下划线 → 422（slug 规则）。
2. selection 引用的资产在导出时已被删除 → 导出 422 `STALE_SELECTION`，向导标红失效项让用户重选（**快照语义只保护已导出实例，不保护未导出的定义**）。
3. targets 为空 → 阻断（至少一个平台）。**`playbookIds` 非空同样阻断**（422 `VALIDATION_ERROR`，`fieldErrors['selection.playbookIds']`）：`packages/core/src/pack/resolve.ts` 从不读这一字段，传了既不进产物也不改指纹，静默接受等于替用户谎报「技巧库已挂上」。M4（PRD「M4 技巧库」行，Phase 2）上线时把这道闸拆掉是**变宽**，不碎任何客户端（owner 裁定 ⑫，2026-09-26；断言 `UT-EXAMPLE-01` 的 `PackSelection` 腿 + `IT-ERR-04`）。
4. 生成文件总量 > 2MB 或单文件 > 512KB → 警告不阻断（注入侧有同类防线且**会**拒绝执行，m6b §6.3；原此处误写 `m6b §6.7`——§6.7 是 schemaVersion 不兼容，2026-09-23 按 §0.3 C 级修正）。**字节防线与 FR-6 的 token 估算是两条独立通道**：前者量落盘体积、后者量上下文压力，任一超限不触发另一条，估算超线也绝不阻断导出。
5. 目录导出目标已存在（同版本重导且指纹一致）→ 幂等覆盖前先比对，不一致则 409（与 FR-3.4 同源）。
6. 生成器对资产内容做**路径安全净化**：文件内容中出现的本地绝对路径（skillDir 等）在 SKILLS.md 中原样保留（信息用途），但不生成任何包含 `..` 或绝对路径的**文件路径**（契约校验，design §7.7）。

## 7. 验收标准（pass/fail）

1. 同一 pack 定义连续两次 preview → 文件集合与全部 sha256 完全一致。
2. preview 返回的某文件内容与目录导出后磁盘同名文件字节一致。
3. 导出 v1.0.0 → 修改包内一条提示词再导 v1.0.0 → 409 VERSION_IMMUTABLE；改 v1.1.0 → 成功且两条导出记录指纹不同。
4. 含 6 条术语 + claude-code + generic-agents targets 的包 → 生成文件恰为 `CLAUDE.md`、`AGENTS.md`、`TERMS.md`、`openvibe.pack.json`（无流程无 skill 时不出现 CHECKLIST/SKILLS）。
4b. targets 仅 codebuddy + trae + minicode 的包 → 生成文件恰为 `CODEBUDDY.md`、`.trae/rules/openvibe.md`、`MINI.md`、`openvibe.pack.json`（三个文件正文与 CLAUDE.md 主模板一致，仅文件名/壳不同；trae 含 `trigger: always` frontmatter）。
5. 删除已被某导出引用的提示词 → 该导出记录的 manifest 与再下载 bundle 不受影响（物化验证）。
6. bundle JSON 被 `openvibe sync --file` 成功消费（联测归 m6b 验收 1）。
7. `STALE_SELECTION` / `VERSION_IMMUTABLE` / 空 targets / 非空 `playbookIds` 四种 4xx 均有结构化错误码。
8. **`estimateTokens` 纯函数单测**（`CORE-SIZE-01..05`，不依赖 DB 与 HTTP）：空串 → 0；401 个 ASCII 字符 → 101（向上取整生效）；20 个汉字 → 24（系数 1.2 生效）；含一个非 BMP emoji 的串按**码点**计（同一串若按 `String.length` 会多出代理对那一位，断言取码点口径）；中英混合串 = 两系数之和向上取整。
9. preview 的 `sizeEstimate.perTarget[]` 中 `adapter` 集合与 **`rendered.manifest.targets` 集合**完全一致（**不是** `coveredPlatforms`：后者只来自兼容矩阵、返回平台展示名且矩阵行 `reads` 全是 `AGENTS.md`——`targets:['claude-code','cursor']` 的包实测返回 `[]`，而它必须给 2 条 perTarget 行，原句「与响应既有 `coveredPlatforms` 完全一致」不可满足。2026-09-24 T10 开工前按 §0.3 **B 级**修正，改因与实测见版本行）；`footprint.files[].path` 集合与主字段 `files[]` 集合完全相等（不多不少，含合成的 `openvibe.pack.json`）。
10. 阈值正负各一支：构造单平台估算 ≤12000 的包 → 全部 `warn=false`；把**资产改为全选（术语 + 提示词）**使某 target 估算 >12000 → 该 target `warn=true`，**且**同一包导出成功、响应 `warnings` 仍为空（估算不参与放行，FR-6.4 的负向断言）。
    > **v1.3 更正 · 原句「把术语改为『全选』」经实测否证**：真种子 109 条术语全部选中、提示词为空时，`perTarget[claude-code]` 实量 **9,617 tok < 12,000**——术语单选永远越不了线，原句的构造**不可能满足**。根因即 FR-6.1 那条追加教训：`TERMS.md` 只渲染四列，原句把**全字段语料口径**当成了**落盘正文口径**。owner 2026-09-24 裁定改为「资产全选」（该夹具现测 14,890；随种子与包名长度而变，故不作断言字面量），**阈值与系数一字未动**——调低阈值与「不得为消掉黄条而调高阈值」同源，一并禁止。
    > **sync 腿的凭据形态（不是遗漏，是口径）**：`openvibe sync --file` 的结果与 `warn` 无关这一腿，在 server 侧**没有**子进程级断言——`sizeEstimate` 既不进 `bundleJson()` 也不进 `directoryFiles()`（`apps/server/src/routes/packs.ts:91,98`），CLI 无从观察它，所以这是**结构性保证**而非被证明的命题；已在 DEV_LOG 的未验证面登记，收口叙述不得把它写成「已断言」。
    > **落地凭据**：`SRV-EST-02`（正负两支；正向支走真种子 ⇒ 断言与种子同源，种子瘦身到撑不起 12,000 时这支**应当**变红）、`SRV-EST-02b`（**纯函数侧**阈值边界：恰好 12,000 不 `warn`，防住 `>` → `>=` 的静默翻转）、`SRV-EST-04`（首启预置包六个 target 全 `warn=true`，即 FR-6.4 权威数的仓库内可复现驱动器）。
11. 确定性：同一 pack 定义连续两次 preview → `sizeEstimate` 序列化后逐字节相等。
12. **冻结契约未受影响的可执行证明**：加入 `sizeEstimate` 后 `pnpm test`（golden 三夹具字节比对）与 `pnpm bundle:check` 全绿，且 `git diff --name-only tests/golden/` 输出为空——这条就是 FR-6.6「属 B 级不属 A 级」那句结论的机器凭据，缺它则该结论只是自述。

## 8. 依赖

- 依赖：M1/M2/M3 素材、M5 流程模板、design.md §7 契约（生成器实现于 packages/core，Web/CLI 共用）。
- 被依赖：m6b CLI sync（唯一消费方）；M5 注入状态展示。
