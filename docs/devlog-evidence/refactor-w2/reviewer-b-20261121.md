# Reviewer B 独立复核报告 · D32 向后兼容与用户盘影响视角（2026-11-21）

> ㊾ ③-b 要求的两名无上下文 reviewer 之二（与 Reviewer A 互不沟通、完全独立）。全文由会话原样照录（仅还原传输层的 HTML 实体）；复核当时代码状态 = 本笔修复（吞空行 / 模板空行 / 文档残留追注）之前，全部修复均已按其结论执行并复测。**B 的归属修正**：报告问题 1 把 `apps/cli/src/commands/verify.ts` 的 4 行常量替换与 `pack-contract.ts` 的 `PACK_MARKER_PREFIX` 抽常量归给本笔——两者实为并行会话（N3/N4 · DEV-0276 线）的未提交改动，B 在混合工作树上误归，其「值不变、无行为影响」的判读本身正确。

---

# Reviewer B 独立复核报告 · D32「段级受管标记进契约」（向后兼容与用户盘影响视角）

复核仓库：`/Users/duke/Documents/OpenVibe`（main 分支，HEAD = `54f0811`）。全程只读，未修改任何仓库文件；探针脚本均置于 `/tmp/ov-probe-d32/`。本文所有命令与关键输出均为原文照录。

---

## 问题 1：改了什么（改动集归属）

**结论**：工作树共 361 条状态（244 M + 1 D + 116 ??，合计 245 文件 / +9617 −2999）。属于本次 D32 A 级变更（含同笔 D33 兼容读修复）的**核心文件集约 12 个**；其余 300+ 条属于并行会话的其他工作线（N3 hooks、N4 m11、refactor-w0/w1/w2 服务层收敛、安全路径权威、Web 大改、CI/scripts 等），部分文件被**多条工作线混合修改**——这正是 decisions ㊽ 登记的「合并窗口归因事后无法分开归因」代价。

**复算过程**：

```
$ git status --porcelain | head -40
 M .github/workflows/ci.yml
 M .gitignore
 M .prettierignore
 M CLAUDE.md
 M DESIGN.md
 M DEV_LOG.md
 M README.md
 M apps/cli/src/commands/clean.ts
 ...（共 361 行，前 40 行略，原文照录于执行记录）

$ git diff --stat | tail -1
245 files changed, 9617 insertions(+), 2999 deletions(-)

$ git status --porcelain | awk '{print $1}' | sort | uniq -c
 116 ??
   1 D
 244 M
```

**属于本笔（D32 ＋ 同笔 GAP-1/D33 修复）的文件集**（逐一经 diff 原文核对）：

| 文件                                                                    | 本笔改动                                                                                                                     | 备注                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/shared/src/pack-contract.ts`                                  | `PACK_SECTION_MARKER`/`PACK_SECTION_MARKER_PREFIX` 新增（:81-85）、`PACK_MARKER_PREFIX` 抽常量（:67）                        | 同文件混入 N3/N4 的类型与 `PACK_CONTEXT_AUX_FILES`           |
| `packages/core/src/pack/composer.ts`                                    | `section()` 在节标题上方插段标记（:179 `lines.push('', PACK_SECTION_MARKER(heading), heading)`，空节连标记省略）             | 同文件混入 N4 的 `termsRef`/`playbooksRef`/L1 正文变体       |
| `packages/core/src/inject/section-diff.ts`（+ `.test.ts`）              | `sliceSections`/`sectionName`、段数不一致退回整块、`managedChanged` 口径改为 `region !== '块外自由区'`（:102-118, :127-154） | 纯本笔                                                       |
| `packages/core/src/pack/pack.test.ts`                                   | :162 D32 期望串（含标记）                                                                                                    | 混有 N4 桩                                                   |
| `tests/golden/G1/G2/G3`（files/*、fingerprint.txt、openvibe.pack.json） | 产物正文加段标记、哈希/指纹重基                                                                                              | manifest 同批混入 N3 `schemaVersion:2` 与 N4 `l1` 字段       |
| `packages/shared/src/schemas/pack.ts`                                   | :295 `schemaVersion: z.union([z.literal(1), z.literal(SCHEMA_VERSION)])`（GAP-1 修复）                                       | 同文件混入 N3 `hooks`/N4 `l1` schema                         |
| `apps/cli/src/pack-source.ts`                                           | 版本闸 `!==` 改 `>`（`<` 兼容、`>` 拒超前，:126-143）                                                                        | 纯本笔（D33 闭合的 manifest 侧）                             |
| `apps/cli/test/pack-source.test.ts`                                     | :162 `SOURCE-06a` 新增                                                                                                       |                                                              |
| `apps/cli/test/diff-sections.test.ts`                                   | DSEC-01 改按「受管段·术语表」断言 ＋ 段级隔离断言                                                                            |                                                              |
| `apps/cli/src/commands/verify.ts`                                       | 仅 4 行：`PRODUCT_MARKER` 字面量换用 `PACK_MARKER_PREFIX` 常量（值不变）                                                     | D32 卫生改动（**当值会话注：归属应为并行会话，见文件头注**） |
| `docs/decisions.md`                                                     | :60 ㊽（2026-11-20，**上一会话 DEV-0280**）、:62 ㊾（2026-11-21，本笔）、:71 汇总行                                          |                                                              |
| `docs/design.md`                                                        | §7 标头 v1.5 行（:150）、§7.3 模板加段标记（:213 起）、区域模型三条 bullet（:236-238）                                       | 同文件混入 v1.4（N3）行                                      |

**不属于本笔、归属可疑的代表性改动**（均已在 diff 原文中核实为其他工作线）：

- **N3 hooks / N4 m11（㊼·DEV-0276 线，A 级已另行走链）**：`packages/shared/src/constants.ts`（SCHEMA_VERSION 1→2、`LIMITS.hooks`、`L1_*`）、`packages/adapters/src/*.ts`（`l1Capability`，registry `adapterId` 盖章）、`composer.ts` 的 L1 正文变体、golden 的 `l1` 字段、未跟踪的 `apps/cli/src/commands/commands.ts`/`hooks.ts` 与 `apps/cli/test/commands.test.ts`/`hooks.test.ts`/`sync-hooks.test.ts`。
- **refactor-w0/w1/w2 服务层收敛（DEV-0280 线）**：`apps/server/src/routes/*` 大批删改、`packages/core/src/local/lock.ts`（新增 `scanInjectionFiles`，复用 `diffPackLock`）、`packages/core/src/index.ts` 出口扩容。
- **安全路径权威（v0.2.4 F4/R3 线）**：`packages/core/src/inject/security.ts`（读写共路径权威）、`packages/core/src/inject/sync-lock.ts`（`.openvibe` symlink 闸）、`apps/cli/src/commands/status.ts`。
- **Web/脚本/CI/文档**：`apps/web/src/*` 大批、`scripts/*`、`.github/workflows/ci.yml`、未跟踪的 `docs/PRD-v0.2.6-v1.0-20261112.md`、`docs/PRD-v0.3.0-v0.9-20261119.md`、`docs/refactor-goal-plan-20261119.md`、`docs/prototypes/*` 等。
- **DEV_LOG.md**：+1997 行为 DEV-0275～DEV-0281 各会话条目（无 DEV-0282，见问题 6-⑧）。

---

## 问题 2：旧产物兼容（diffSections 探针）

**结论**：兼容腿成立。**无段标记的正文走「受管块」两分法（与 D32 之前逐字节同行为）**；**两侧都有段标记才走逐段**；段数不一致（旧混新、标记被手删）**退回整块，不硬切错位**。

**复算过程**：探针脚本 `/tmp/ov-probe-d32/section-diff-probe.mjs`（未写入仓库），以 `tests/golden/G1/files/CLAUDE.md`（带标记的新正文）为「新契约渲染」，以手工滤除所有 `<!-- openvibe:section=` 行的同文件为「旧版产物」（保留 begin/end 壳），另加六个对照腿：

```
$ node --import tsx /tmp/ov-probe-d32/section-diff-probe.mjs
== A: expected=NEW(带段标记) actual=OLD(旧产物,无段标记)
  region=块外自由区 status=same exp=1 act=1
  region=受管块 status=changed exp=29 act=26
  managedChanged=true freeChanged=false
== B: expected=NEW actual=NEW_DRIFT(受管段内改动一行)
  region=块外自由区 status=same exp=1 act=1
  region=壳头 status=same exp=6 act=6
  region=受管段·行为规则 status=changed exp=8 act=8
  region=受管段·术语表 status=same exp=3 act=3
  region=受管段·任务提示词参考 status=same exp=6 act=6
  managedChanged=true freeChanged=false
== C: expected=OLD actual=OLD_DRIFT(两侧均无段标记)
  region=块外自由区 status=same exp=1 act=1
  region=受管块 status=changed exp=26 act=26
  managedChanged=true freeChanged=false
== D: expected=NEW actual=NEW(零漂移)
  region=块外自由区 status=same exp=1 act=1
  region=壳头 status=same exp=6 act=6
  region=受管段·行为规则 status=same exp=8 act=8
  region=受管段·术语表 status=same exp=3 act=3
  region=受管段·任务提示词参考 status=same exp=6 act=6
  managedChanged=false freeChanged=false
== E: expected=NEW actual=去壳文本
  region=受管块 status=changed exp=29 act=0 missing=true
  region=块外自由区 status=changed exp=1 act=29
  managedChanged=true freeChanged=true
== F: expected=OLD actual=NEW(旧渲染 vs 新产物)
  region=块外自由区 status=same exp=1 act=1
  region=受管块 status=changed exp=26 act=29
  managedChanged=true freeChanged=false
== G: expected=NEW actual=NEW(仅删「术语表」段标记一行)
  region=块外自由区 status=same exp=1 act=1
  region=受管块 status=changed exp=29 act=28
  managedChanged=true freeChanged=false
```

**判读**：

- 腿 A（**旧产物兼容主腿**）：磁盘旧产物无段标记 ⇒ `aSecs.length===1` 与 `eSecs.length===4` 不等 ⇒ 走 :113 整块 `受管块` 分支，报告形态与 D32 之前完全一致（`块外自由区` ＋ `受管块`），`managedChanged=true` 不误报、不崩溃、不错位。
- 腿 B：逐段对齐生效，漂移精确归因到单一受管段（`section-diff.test.ts` 新增两支测试同验证，`npx vitest run packages/core/src/inject/section-diff.test.ts apps/cli/test/diff-sections.test.ts` = 23 tests 全绿）。
- 腿 C：v1 对 v1 与旧实现同构。
- 腿 G：用户手删一行段标记 ⇒ 段数不等 ⇒ 退回整块，实现注释「如实报告而非硬切错位」与行为一致。

---

## 问题 3：v1 旧包兼容（SOURCE-06a）

**结论**：通过，两条腿都有覆盖。`PackManifestSchema.schemaVersion` 已是 `z.union([z.literal(1), z.literal(2)])`（`packages/shared/src/schemas/pack.ts:295`），版本闸改为 `>` 语义（`apps/cli/src/pack-source.ts:126-143`，bundle 闸与 manifest 闸分开判定，注释明写「`<` 兼容（旧版可读），只有高于本 CLI 支持的版本才要求升级」）。

**复算过程**：

```
$ npx vitest run apps/cli/test/pack-source.test.ts
 ✓ |cli| apps/cli/test/pack-source.test.ts (16 tests) 22ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

两条腿核对（`apps/cli/test/pack-source.test.ts`）：

- **腿一（v1 可读）**：`SOURCE-06a`（:162）构造 `schemaVersion: 1` 的 bundle，断言 `loaded.manifest.schemaVersion).toBe(1)` 且指纹照常核验（注释原文：「兼容读不等于放宽验签：逐文件哈希与整体指纹照常核（旧包内容被篡改仍要拒）」）。
- **腿二（集合外值仍拒）**：同测试内 `schemaVersion: 0` 与字符串 `'2'` 均 `toThrowError(/manifest\.schemaVersion/)`；另有 `SOURCE-06`（:133）验「超前版本先于 zod 报出」——`bundleSchemaVersion: 2`（>1）与 manifest `schemaVersion: 99`（>2）均 `SCHEMA_UNSUPPORTED`。

---

## 问题 4：写入判定未动

**结论**：成立。planner 五态、verify 六态、inject/lock 形状**三处 diff 全空**；golden 三个 manifest 的 `schemaVersion` 均为 2，属 manifest 契约（N3/N4 消耗的版本位），与 lock 的 `schemaVersion: 1` 是两个独立对象。

**复算过程**：

```
$ git diff --stat packages/core/src/inject/planner.ts packages/core/src/inject/verify.ts packages/core/src/inject/lock.ts
（空输出，退出码 0）
$ git diff packages/core/src/inject/planner.ts packages/core/src/inject/verify.ts packages/core/src/inject/lock.ts | wc -l
       0
```

逐文件核对现状（diff 为空即与 HEAD 逐字一致）：

- **planner 五态**：`planner.ts:15` `INJECT_STATUSES = ['NEW','IN_SYNC','UPDATE','CONFLICT','DRIFT']`，:62-76 RULES 表、:92-98 判定序（内容一致优先 → managed＋lock 相等 ⇒ UPDATE / 不等 ⇒ DRIFT → 否则 CONFLICT）零改动。
- **verify 六态**：`verify.ts:31-32` `VerifyState = 'CONSISTENT'|'PARTIAL'|'ORPHAN'|'DISK_DRIFT'|'STALE_LOCK'|'UNVERIFIED'`，:69-75 优先级与 :121-131 STALE_LOCK（信息态，exitCode 2）零改动。
- **lock 形状**：`lock.ts:46` `schemaVersion: 1`；`packages/shared/src/schemas/pack.ts:353` `PackLockSchema.schemaVersion: z.literal(1)`——与 ㊾ 行「lock 仍 `z.literal(1)`」的原话一致。`parsePackLock`（lock.ts:59-67）schema 不符才返回 null，旧 lock 照常解析。
- golden：

```
$ grep -n 'schemaVersion' tests/golden/G*/openvibe.pack.json
tests/golden/G3/openvibe.pack.json:2:  "schemaVersion": 2,
tests/golden/G1/openvibe.pack.json:2:  "schemaVersion": 2,
tests/golden/G2/openvibe.pack.json:2:  "schemaVersion": 2,
```

该值是 `openvibe.pack.json`（manifest 契约）字段，版本位由 N3/N4（DEV-0276·㊼）消耗到 2，D32 按 ㊾ 不再 bump；与 `.openvibe/pack.lock.json`（`PackLockSchema`，literal(1)）无字段共用、无形状耦合。golden 回归全绿：`npx vitest run tests/golden.test.ts tests/golden-adapters.test.ts` = 13 tests passed。

- 另核实 `PACK_MARKER_BEGIN` 重构后字节不变（`pack-contract.ts:67-71`，模板串与旧实现逐字相同），故新旧渲染的壳标记字节兼容。

---

## 问题 5：用户盘影响评估

**结论**：对已注入旧版产物的用户项目，本次变更**不产生任何被动漂移或误报**；重 `sync` 时走既有 UPDATE/DRIFT 两态，覆盖前一律备份。逐命令给出文件依据：

**(a) `openvibe verify` 判什么？**
`verify` 的磁盘比对只有「disk ↔ lock」两方（`apps/cli/src/commands/verify.ts:189` 调 `diffPackLock`，`planner.ts:243-269` 只拿 lock 登记哈希对磁盘哈希），**从不对照「当前代码会渲染成什么样」**。旧项目的磁盘与 lock 逐字节一致 ⇒ `drifted=[]` ⇒ 落到 :148-157 **`CONSISTENT`（退出码 0）**；若服务端有更新的导出 ⇒ :121-131 **`STALE_LOCK`**（信息态，fix 指向 `diff`＋`sync`）；离线 ⇒ **`UNVERIFIED`**。lock schema 未变 ⇒ 旧 lock 解析不失败。**不误报**——与 ㊾ 行「verify 判 CONSISTENT 不误报，`verify.ts:123` 的 STALE_LOCK 是服务端有更新导出的信息态」的推理相互独立地复算成立。

**(b) `openvibe diff` 会怎样？**
diff 同样以 lock 为基准（`diff.ts:189-190`）。旧项目未手改 ⇒ `clean`、无 `drifted` ⇒ 段级明细**整段跳过**（`diff.ts:208` 段级仅对 `buckets.drifted` 里的文件触发），输出与 D32 之前无异。若用户曾手改（drifted）且服务端包已按 D32 重导：段级明细拿 `/preview` 渲染（带段标记）对磁盘旧正文，即探针**腿 A**——整块 `受管块 changed`，归因保守如实，报文形态与 D32 之前相同（不产生比旧版更差的误归因）。

**(c) 重新 `sync` 会发生什么？**
关键在 planner（未改动）的判定序 `planner.ts:92-98`：

- 磁盘 == lock（旧产物未手改）且 ≠ 新包内容 ⇒ **`UPDATE`**：`options=[]` 无决策点，`defaultDecision='overwrite'`、`defaultAction='backup-write'`（:65）——**自动覆盖且先备份**。备份路径：`sync.ts:423-462`，`write.backup` 在 `planner.ts:187`（`backup: file.status !== 'NEW'`）为 true，落到 `.openvibe/backup/<UTC时间戳>[-n]/`（`PACK_BACKUP_REL`，`inject/lock.ts:8`；目录冲突后缀 `uniqueBackupRoot`，`sync.ts:153-159`），提示「被覆盖的旧文件在 …，可逐个复制回去」（sync.ts:456）。
- 用户手改过（managed 且 disk ≠ lock）⇒ **`DRIFT`**：三选 `overwrite / keep-local / skip`（:71-76），选 overwrite 同样 backup-write；keep-local 不写盘。
- 包源未更新（还是旧包）⇒ `IN_SYNC`，零写入。
- **不存在迁移命令/迁移写入路径**：D33 按 ㊾ 闭合为「兼容读」形态——lock 侧现状已满足（本节 a/c 即证据），manifest 侧缺口由本笔 union(1,2) 落地（问题 3）。用户盘的唯一变化时机是用户**主动**拿新版包 re-sync，且有备份兜底。`npx vitest run apps/cli/test/sync.test.ts apps/cli/test/verify.test.ts apps/cli/test/sync-lock.test.ts apps/cli/test/diff.test.ts`（93 tests）全绿佐证以上路径无回归。

---

## 问题 6：独立风险清单（清单之外，本人自行发现）

1. **【新发现 · 建议修复后收口】段级明细对「受管段内空行漂移」失明**：`sliceSections`（`section-diff.ts:135`）`if (!line) continue` 把**所有空行**（不止 `split('\n')` 的尾空串）从切段里丢弃。探针实测（`/tmp/ov-probe-d32/blank-line-probe.mjs`，输出照录）：

   ```
   == 空行漂移探针：受管段内删一个空行
     region=块外自由区 status=same exp=1 act=1
     region=壳头 status=same exp=1 act=1
     region=受管段·行为规则 status=same exp=3 act=3
     region=受管段·术语表 status=same exp=4 act=4
     managedChanged=false freeChanged=false
   ```

   删掉受管段内一个空行 ⇒ 段级明细与零漂移**输出逐字相同**（`managedChanged=false`），而文件级 diff 仍报 DRIFT——同一屏「漂移 1 项」与「段级全部一致」自相矛盾。D32 之前整块比较用原始行数组，空行漂移会被 `受管块 changed` 捕获，故这是**本笔新引入的报告保真度回退**。影响面：仅报告层（planner 整文件 sha 判定不读此函数，写入行为不受影响），但违反本文件头注「回答这一行漂移漂在哪」的承诺。修法一行（只跳过末尾空串，或一律不跳）。

2. **段名可被包内容伪造（幻影切段）**：切段依据是 `includes(PACK_SECTION_MARKER_PREFIX)` 对**任何**受管行（`section-diff.ts:139`），`sectionName` 取首个前缀到首个 `-->`（:148-154）。若提示词正文/代码块里出现字面 `<!-- openvibe:section=… -->`，会切出幻影段、区域标签可被注入。两侧同渲染 ⇒ 通常对称、不破坏对齐，且仅影响 diff 报文标签；但 `受管段·<任意串>` 会原样进 CLI stdout（`apps/cli/src/index.ts:479`）。节名本体安全：四个节名是固定常量（`pack-contract.ts:96-99`），flow 阶段名只进 `###` 子标题不进段标记。
3. **逐段对齐是按位置不按段名**（`section-diff.ts:106-110`）：两侧段数相等但段名不同（用户重排/改写标记后恰巧段数一致）时按索引对齐，区域标签取包侧名。极端混合态下的标签混淆，仅报告层。
4. **design.md §7.3 模板与实现/golden 字节分歧**：design.md 模板段标记与标题之间有空行（`docs/design.md:215` `<!-- openvibe:section=工作流程 -->` ＋ 空行 ＋ `## 工作流程`），实现与 golden 是**紧邻**（`composer.ts:179` 推 `'', MARKER, heading`；`tests/golden/G1/files/CLAUDE.md:6-13`；`pack.test.ts:163` 断言 `\n<!-- openvibe:section=行为规则 -->\n## 行为规则`）。§7 自称「规范以本节为唯一权威」——此空行分歧在 begin/标题处**早已存在**（非本笔新造），但既然本笔把模板逐行升级到 v1.5，建议顺手对齐。
5. **docs 语义残留未同步（grep 实证）**：`docs/specs/write-selfproof.md:80` FR-5.1 仍为规范性表述「**不得引入新标记**——引入新标记就是 4-c，是 A 级」（仅 :145 附近 §8.2-② 格加了 D32 追注，:45 §3-10 行「段界可推导（不需要新标记）」也无追注）；`docs/specs/v023-c-consolidation.md:105` FR-7 仍把切段描述为「按既有 begin/end 标记切段对比」（该文件 :8/:30 虽已把 4-c 划出本版范围，属历史语义，但无指向 D32 的追注）；`README.md:266` 用户面文案「整文件管理，无块级合并：受管单位是整个产物文件」对写入判定仍准确，但未提 diff 报文已段级化。`docs-check`/`spec-claims`（123 tests）全绿——这些是散文句、不被机检，属登记性残留而非闸门漏洞。
6. **PRD 附录 D D32/D33 仍标「待签」**（`docs/PRD.md:793-794`）：㊾ 连带登记①已明写「PRD 行变更随下版 bump，日志不回改」，属**已登记的故意不同步**，非遗漏。
7. **AI IDE 解析影响评估**：`<!-- … -->` 是 CommonMark 合法注释块、渲染不可见；段标记紧邻标题行不破坏 ATX 解析（探针正文即此形态）；每主文件净增 4 行（约 30-40 token），design §7 v1.5 已接受；cursor `.mdc` 中标记位于 frontmatter 之后安全。残余：生成文件含裸 HTML 注释会被部分 Markdown linter 告警——纯观感，无功能影响。**低风险**。
8. **落档缺口**：decisions ㊾（`docs/decisions.md:62`）自称「`[DEV-0282]` 落档」，但 `DEV_LOG.md` 最新条目为 `[DEV-0281]`（:5600），**尚无 DEV-0282 条目**；本 reviewer 报告按流程将录入该条。收口时须确认 DEV-0282 连同双 reviewer 原文一并落档，否则 ㊾ 的「落档」表述超前于事实。
9. **`SectionRegion.region` 从字面量联合放宽为 `string`**（`section-diff.ts:19`）：全仓 grep 确认无非测试消费方依赖旧字面量（CLI 仅逐行打印），当前无回归；但编译器对 region 的穷尽性检查已失效，后续新增 region 分支只能靠测试兜住。
10. **golden 回归快照的归因混流已固化**：G1-G3 manifest 同批含 `schemaVersion:2`、`l1`、段标记三源变化，事后无法从快照单独归因 D32——㊽ 已登记此代价并给出「分次提交留存快照」的缓解；本工作树**尚未提交**，缓解手段（提交历史层归因）能否生效取决于提交时是否分笔留档。

---

## Reviewer B 独立结论

**需修复后收口**（一处小修 + 两处落档补全；不建议直接收口，也远不构成不可收口）。

理由：本笔的两条兼容主命题都被我独立复算成立——①旧产物（无段标记）在 `diffSections` 里确凿走「受管块」两分法且行为与 D32 之前逐字节同构（探针腿 A/C/G，含异常态退回整块不硬切）；②v1 旧包「可读 ＋ 集合外值仍拒」两腿齐备且测试全绿；③planner/verify/lock 三处 diff 为空、写入判定（五态/六态/lock 形状）零改动，`PackLockSchema` 仍 `z.literal(1)`；④用户盘推理（verify 判 CONSISTENT 不误报、diff 不新增漂移、re-sync 走 UPDATE/DRIFT 且一律先备份）全部有文件行号依据并与 ㊾ 行的声明吻合，未见夸大。但存在一处**本笔新引入的报告层缺陷**（受管段内空行漂移使段级明细与文件级结论自相矛盾，问题 6-①，探针输出已固化）——虽不触碰写入安全，却违背 section-diff 自身的头注承诺，属一行级修复；连同 design.md §7.3 模板空行与 golden 对齐（6-④）、write-selfproof FR-5.1「不得引入新标记」旧规范句追注（6-⑤）一并处理后，加上 DEV-0282 条目与双 reviewer 原文落档（6-⑧），即可收口。上述修复均不动契约字节与判定逻辑，不需要重走 A 级链。

—— reviewer B（无上下文独立复核，视角：向后兼容与用户盘影响）

**处置记录（当值会话补）**：6-① 吞空行 bug 已修（`line === undefined` 守卫 ＋ 回归腿「受管段内删空行 ⇒ 该段 changed」，golden 确定性哈希复验不变 `f9f6a44e…`）；6-④ 模板空行已对齐 golden 字节（含 begin/标题同类分歧）＋ 围栏改 ```text 防 prettier 复发；6-⑤ 四处追注已落（write-selfproof FR-5.1 与 §3-10、v023-c FR-7、README）；6-⑧ DEV-0282 连同本报告与 Reviewer A 报告原文落档。6-②③⑨⑩ 登记不改（幻影切段/按位对齐/穷尽性/golden 混流归因——均为报告层理论边界或既有登记代价）。
