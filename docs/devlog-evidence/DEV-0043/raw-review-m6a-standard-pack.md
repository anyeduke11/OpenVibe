# 独立复核报告 · `docs/specs/m6-standard-pack.md`（m6a）自报判级

仓库 `/Users/duke/Documents/OpenVibe` @ `6499139`（`feat/p1.1-t10-clean-size`），只读复核，工具调用 22 次（预算 35）。
现测复核过的取数：`git log --follow` 全史仅 5 笔（`211a345` 09-21 建线 → `99690bc` / `8b0c62e` / `f8dfbdb` 均 09-24 → `e79c0e6` 09-26）；`git diff --numstat 211a345..HEAD -- 文件` = **33 / 7**（与自报一致）。
判级纪律按简报 §0.3 定义逐条对（退出码 / `--json` 键与形状 / HTTP 状态码 / 删盘 / 路径语义 / 请求被接受还是被拒）。

## 逐次判定表

| 版本 | commit（可多个）| 自报判级 | 独立判定 | 同意? | 证据 |
|---|---|---|---|---|---|
| v1.1（声明日 09-23，实无 09-23 commit）| `99690bc`（26+/4−，与 v1.2 同笔首现）| 规格链内**未给 §0.3 判级**，只声明「不动 design §7 冻结契约，理由见 FR-6.5」；判级在 DEV_LOG（B 级）| **B 级**：preview 响应新增可选键 `sizeEstimate`（形状变化）+ 新阈值 12,000 黄条 + FR-1.5 UI；未触 design §7 | 判级同意；链内缺判级 + 指针写错（应为 FR-6.6）| `git diff 99690bc^ 99690bc` 见 §5 与整个 FR-6 新增；`docs/specs/m6-standard-pack.md:112,107`；`DEV_LOG.md:502`；同笔 design.md 11 行改动全落 §1/§2/§13/§16，未落 §7 |
| v1.2（09-24）| `99690bc`（无独立 commit）| **B 级**（行为规格措辞）+「行为面（阈值/公式/两视图/不阻断/零新依赖/冻结凭据）一字未改」+「`tests/golden/` 零改动」| B 级成立且**强于「措辞」**：`perTarget.approxTokens` 由逐文件相加改为拼接单次 `ceil`，改的是用户可见数字本身 | **不同意「一字未改」**：其自述改动正落在被点名「未改」的「公式/两视图」两项上；且 git 无 v1.1-only 中间态，该断言不可用 diff 证实 | `m6-standard-pack.md:11` vs `:102`；`apps/server/src/lib/pack-assemble.ts:103`（`estimateBundle`）；`packages/core/src/pack/size.ts:45-47`；golden：`99690bc --stat` 无 `tests/` 条目 |
| v1.3（09-24，称 owner 已批）| `8b0c62e`（7+/3−，仅 spec + T10 plan）| **B 级**（行为规格措辞 + 实测数回填）；「阈值 12,000、系数 1.2/4、两视图口径、不阻断语义一律未动」| B 级同意；四项「未动」经逐 hunk 复核**属实**（`12_000`/`1.2`/`4`/`>` 严格比较在码）；但同笔删掉验收 10 的 `openvibe sync --file` **退出码**断言腿，降述为「结构性保证」 | 判级同意，**轻报**：把验证面收缩写成纯回填；行为未变所以不升 A/不新增 B，但退出码是 B 级触发词，须单独签收 | `m6-standard-pack.md:105`；`packages/core/src/pack/size.ts:13,15-16,40`；`apps/server/src/lib/pack-assemble.ts:103`；`:137-139` vs `git diff 8b0c62e^ 8b0c62e` 验收 10 hunk |
| 不升版（09-24）| `f8dfbdb`（1+/1−）| 提交信息与正文行内记为 **C 级**（把复述的 kB 改指针）| 对本文件**确属 C**：只动 FR-6.5 的构建预算数字，不涉 API 字段/阈值/公式/`fieldErrors` 键/退出码/验收可满足性 | 同意判级，**不同意做法**：改的正是 v1.2「一字未改」清单里的「零新依赖」条目却不挂升版号 | `git diff f8dfbdb^ f8dfbdb`（唯一 hunk @FR-6.5）；`m6-standard-pack.md:106` |
| v1.4（09-26）| `e79c0e6`（4+/4−，仅 spec + DEV_LOG）| **B 级**（`PackSelection` 在 `pack.ts:11`，位于 design §7 冻结块之前）| **B 级成立且必须 B**：`selection.playbookIds` 非空从「静默接受」变「拒绝」= 请求被接受/被拒 | 同意（唯一实质判级完全一致的升版）；但链内节号与「现测」两处失实（见 findings 1、3）| `packages/shared/src/schemas/pack.ts:11,18-23`（`refine ids.length===0`）；`packages/shared/src/errors.ts:17`（`VALIDATION_ERROR: 422`）；`apps/server/test/packs.api.test.ts:252,265`（键恰为 `selection.playbookIds`）|
| v1.0 | `211a345` | 基线（P0 G2 冻结）| 未复核（A 级基线，简报已给「golden 自 `cc84870` 零改动」事实，未重复劳动）| — | `git log --follow` |

## findings（只列我判错/漏报的，按严重度排序）

1. **v1.4 的节号失实**：链上写「① §5 的 `playbookIds` 行补写拒绝口径与 `fieldErrors` 键名」，但 `e79c0e6` 对本文件的四个 hunk 是 行 11（链）、**§3 数据模型块**（现 `docs/specs/m6-standard-pack.md:39`）、§6 第 3 条（`:120`）、§7 验收 7（`:134`）——**§5（`:112`）一个字没改**，§5 里也没有 `playbookIds` 行。为什么算 finding：版本链是复核索引，指错节号会让人在 §5 找不到拒绝口径而误判「未落」。
2. **v1.2 的可证伪断言不成立**（`:11`「行为面…一字未改」）：其自述的两处改动之一正是把 `perTarget.approxTokens` 的算法口径改为「拼接后单次 `ceil`」（`:102`），而 `estimateBundle` 的单次取整就是用户看到的数与 `warn` 翻转位（`apps/server/src/lib/pack-assemble.ts:103` + `packages/core/src/pack/size.ts:45-47`）。「公式/两视图」被列入「一字未改」清单 = 自我矛盾。为什么算 finding：判级虽同为 B，但「未改行为面」把一次会移动可见数字的口径变更写成了纯措辞。
3. **v1.2/v1.1 无法用 git 验「一字未改」**：两段文本首次同现于 `99690bc`（`-S` 现测，与简报一致），仓库里不存在「v1.1 已提交、v1.2 未提交」的中间态。为什么算 finding：链以 diff 级事实的语气断言一件 git 里没有证据的命题。
4. **v1.4 的「现测」为假**：「全仓 `.parse`/`.safeParse` 命中只在新写的单测里」——非测试命中至少 11 处（`apps/server/src/lib/validate.ts:22`、`apps/cli/src/config.ts:107,113,114`、`apps/cli/src/pack-source.ts:137,200,219`、`packages/core/src/importers/index.ts:13`、`.../json-import.ts:15`、`packages/core/src/inject/lock.ts:61`、`packages/core/src/local/lock.ts:56`）。善意读法（服务端不把库中行 `PackOut.parse`）确实成立（`packages/core/src/repos/packs.ts:29` 手工构造；`PackOut` 在 server 只作 type）。为什么算 finding：一句「现测」被一次全仓 grep 直接推翻。
5. **v1.1 的指针错**：「不动 design §7 冻结契约，理由见 **FR-6.5**」——FR-6.5 是「零新依赖」，冻结凭据在 **FR-6.6**（`:107`）。
6. **测试 id 清单漏报（问题 3 的口径本身）**：现有点名不是 3 个。`docs/specs/m6-standard-pack.md` 实点名 **6 组**：`SRV-EST-02`（`:140`）、`SRV-EST-02b`（`:140`）、`SRV-EST-04`（`:105,140`）、`UT-EXAMPLE-01`（`:120`）、`IT-ERR-04`（`:120`）、`CORE-SIZE-01..05`（`:96,135`）。全部存在，无假 id：`apps/server/test/packs.api.test.ts:524`（SRV-EST-02）、`:615`（02b）、`:655`（04）、`packages/shared/src/shared.test.ts:28`（UT-EXAMPLE-01 的 describe，其 `PackSelection` 腿在 `:61-69`）、`apps/server/test/packs.api.test.ts:252`（IT-ERR-04）、`packages/core/src/pack/size.test.ts:9,13,17,21,27`（CORE-SIZE-01..05）。另注：v1.1 正文点名的 `SRV-EST-01` 已被 v1.3 撤出正文，但测试仍在 `packs.api.test.ts:456`（01/01b 两支恰好就是验收 9 与「拼接单次 ceil」的驱动者）——撤出后规格与 `SRV-EST-01` 的对应关系断了，属漏登记。
7. **「一笔 commit 补记两次升版」的声明覆盖了两笔，且写在 DEV_LOG 而非规格**：`DEV_LOG.md` 在 `99690bc` 新增行里明记「m6a **26/4**（含 DEV-0023 那轮未提交的 **v1.2/v1.1** 文本），本轮实际只重写 10 行（m6b 7 + m6a 3）」。所以 (a) 的答案是**覆盖两笔**，不是一笔遮一笔。为什么仍算 finding：规格文件自身（`:11`）与提交信息都不含此披露，读者只看 spec 会把 v1.1 当成 09-23 已入库。
8. **v1.1 的行内自评把 B 记成 C**：`:121`「原此处误写 `m6b §6.7`……2026-09-23 按 §0.3 **C 级**修正」——同一句新增的「注入侧……**会**拒绝执行」与「估算超线也绝不阻断导出」是「会不会阻断/退出码」级口径。指针修正本身是对的（`docs/specs/m6-cli-injection.md:115` §6.3 确为「>512KB 或 >2MB → 拒绝执行」，`:119` §6.7 确为 schemaVersion）。为什么算 finding：净效果被 v1.1 的 B 掩盖，但该句单独读会被当成可跳过的措辞。
9. **无升版的改动落在「未改」清单条目上 + 版本指针未回填**：`f8dfbdb` 无升版号却重写 FR-6.5（v1.2 清单里的「零新依赖」）；它立下「具体 kB 数不在本文复制」（`:106`），却把链上的「291.02 kB」（`:11`）留着 → 文内自我违反；`8b0c62e` 只改 spec + plan，其提交信息称「T9 登记项随之改写」不在该笔（DEV_LOG 对 v1.3 权威数的登记在后续条目 `DEV_LOG.md:650`）；`docs/tasks.md:161` 的版本指针至今停在 **v1.3**，v1.4 未回填。

## 我自报的口径本身对不对（次数 / +− 行数 / 补记与不升版那笔的归属）

- **`+33 −7`**：正确（`git diff --numstat 211a345..HEAD` 现测）。注意逐笔相加是 38+/12−，两点的净差 33/7 才是可复核口径——两种数不可混用，规格自己在 FR-6.1 立的「口径与数字同处」规矩同样适用于此。
- **「4 笔 commit」= 4 次升版？归属错了**：笔数对（`--follow` 全史除建线外正是这 4 笔），但**只有 3 笔带升版号**——`99690bc` 一笔同时首现 v1.1 与 v1.2，`f8dfbdb` 不带号。所以「4 次升版」和「4 笔 commit」是两个不同集合，不能互为凭据。
- **v1.1 声明日 09-23 无对应 commit**：`--follow` 里 09-23 没有本文件的任何提交；`f8dfbdb` / `8b0c62e` / `99690bc` 全部 09-24。即整条 v1.1→v1.2 是 09-24 一次性写入的回溯登记，含 v1.0 行本身（DEV_LOG：八份 spec 的「`| 版本 |` 行基线」也是这一笔补的）。
- **(b) 事后一次性补记 ≠ 当时停下裁定**：两次 B 级（v1.1/v1.2）在 DEV_LOG 里被明确记为 owner **未收/待复核**（「新增 ⑦ 复核本轮两份 v1.1/v1.2 规格」、风险条「这两份规格的复核（owner 待办 ⑥）**尚未走过**」），而口径已以「定稿」形态进入 HEAD。缓解事实：该轮**零产品代码、零 schema 变更**，`sizeEstimate` 彼时尚不可对用户生效，所以未发生「未裁先落地」的行为变更；但按 §0.3「停下等裁定」的字面，顺序是**先提交、后裁定**，v1.3/v1.4 才补上「owner 批准/裁定」字样。结论：判级本身没判错，错在裁定时点与披露位置（规格正文里查不到）。
- **(c) `f8dfbdb` 算不算绕过升版纪律的口径变更**：对本文件**不构成口径变更**（B 级六个触发词一个都没碰到），因此不算「借不升版偷改行为」；但它构成**升版纪律的可追溯性绕过**——被改行恰是 v1.2 声明「一字未改」的清单条目之一，之后任何人拿版本链当「这些行没动过」的凭据都会失真。判为程序性 finding（第 9 条），不判为等级错报。

## 抽检的代码实况（问题 4，抽了 9 处，超出要求的 5 处）

全部与规格一致，无符号名/字段名/状态码值错误：
1. `packages/core/src/pack/resolve.ts` **确实从不读 `playbookIds`**（全仓 grep 命中只在 `default-pack.ts` / `repos/packs.ts:38,59` / schema / 测试 / `PackWizard.tsx:115`，无 resolve.ts）。
2. `packages/shared/src/terms-md.ts:7-12`（`TermTableRow` 只有 `zh/en/aliases/definition`）+ `:39`（模板串只拼这四列）→ 「四列、`example`/`tags` 从不落盘」属实。
3. `packages/core/src/pack/size.ts:13,15-16,40`：`SIZE_WARN_THRESHOLD = 12_000`、系数 `1.2`/`4`、`ceil(other/4 + cjk*1.2)`；`:21-24` 四个码点区间与 FR-6.2 原文逐区间相同（`0x3000-0x30ff / 0x3400-0x9fff / 0xf900-0xfaff / 0xff00-0xffef`）；`:32` 用 `Array.from` 按码点。
4. `apps/server/src/lib/pack-assemble.ts:91-103`：`perTarget` 由 `manifest.targets` 排序生成、`adapter` 即 AdapterId、`approxTokens = estimateBundle(拼接)`、`warn = approxTokens > SIZE_WARN_THRESHOLD`（严格 `>`，与 `SRV-EST-02b` 的「恰好压线不亮」同源）。
5. `apps/server/src/routes/packs.ts:91` = `writeDirectoryExport(directoryPath, directoryFiles(rendered))`、`:98` = `bundleJson: bundleJson(rendered)`——规格点名的两行确为这两个导出集，`sizeEstimate` 不在其中（FR-6.6 凭据成立）。
6. `packages/adapters/src/registry.ts:65-70`：注释即「预览页『本包**额外**覆盖平台』」，函数返回 `row.platform`（展示名）→ 验收 9 的改指 `manifest.targets` 是对的。
7. `packages/adapters/src/compat.ts:12-48`：7 行矩阵 `reads` **全为** `'AGENTS.md'`（Cline/Codex/Kimi Code/OpenCode/Qwen Code/Trae CN/zcode）→ v1.2 的证据引用属实。
8. `apps/server/src/lib/validate.ts:20-26`：`:20` 注释明文「zod 失败 → 422 VALIDATION_ERROR + fieldErrors」，实现 `:22 safeParse` + `:24 AppError('VALIDATION_ERROR')`；真正的状态码表在 `packages/shared/src/errors.ts:17`。规格说「validate.ts:20 明文」成立（是注释不是映射表，属可接受）。
9. `packages/shared/src/schemas/pack.ts:11` 正是 `export const PackSelection = z.object({`（v1.4 的「在 `pack.ts:11`」按行号规矩不计缺陷，且此号恰好也对）。
实测数字只核了**记录位置**（未跑门禁）：`9,617` / `14,890` 记在 `apps/server/test/packs.api.test.ts:534,552-556` 的注释与 `docs/devlog-evidence/DEV-0037/seed-prescreen.md:162`；`15,213`/`67,621`/`186,365`/`11,223`/`25,472` 记在 `DEV_LOG.md:650` 与规格 `:11,105`；`apps/web/src/components/packs/PackPreviewPane.test.tsx:25,59` 把 `15213` 当展示夹具字面量（前端渲染测试，非门禁断言，与 FR-6.4「不进断言字面量」不冲突但值得一并知道）。

## 没查完的面（如实写）

- **未跑任何门禁**（按硬约束）：五道闸 rc=0、`449 tests`、`bundle:check 291.02 kB 与 BASE 前逐字节相同`、golden 零 diff 全部沿用简报给的已知事实，未复算。
- 未复算 `9,617` / `14,890` / `15,213` / `67,621 tok / 186,365 B` / `14,622 码点 78.4% CJK` / `10,662 码点 92.6%`，只核记录位置。
- 姊妹文件 `docs/specs/m6-cli-injection.md` 的 v1.2/v1.3 判级未复核（不在我这半边），只抽查了它的 §6.3 / §6.7 两行来验 m6a 的交叉引用。
- `docs/dev-plan.md` §0.3 原文未通读，B 级判据按简报给的定义逐条对；若 §0.3 另有例外条款，第 8 条（行内 C 级）的结论可能要跟着调。
- `tests/golden/artifacts.ts` 的三夹具 + 3 sidecar 具体清单、`content/seed/` 未被 v1.3/v1.4 触碰的逐文件确认，都没打开读（只用了 `--stat` 层面证据）。
- PRD「M4 技巧库」行（代码注释指向 `docs/PRD.md:168`）未对号；`PackUpdateInput` 与 `PackSelection` 的复用链只从 schema 注释与 `repos/packs.ts:75` 推断，没读完 PATCH 路由全文。
- 本文件之外、同四笔 commit 对 `dev-plan.md` / `tasks.md` / `PRD.md` / `design.md` 的 B 级影响（`99690bc` 改了其中三份各 25–136 行）不在我这半边，未逐条判级。
