# SPEC · 写盘可自证（草案：`openvibe verify` 三方比对、写入留痕与段级只读展示）

| 项 | 值 |
|------|------|
| 模块 | 横切能力（写盘信任面，非 PRD 3.2 的资产模块）——沿用「横切能力用功能名」命名法（dev-plan §0.4 第 5 条） |
| 优先级 | **RF1-2 · RF1-3 · RF1-6**（PRD §10.2 表 RF1 行；分析文 §7 Phase 1 表三行判级预判全 **B**）。依赖顺序（同表「依赖」列原文）：1-2 ← 1-1，1-3 ← 1-1，**1-6 ← 1-2** |
| 上游 | PRD **D30**（三层保证与 `openvibe verify`，owner 2026-10-02 裁）· §10.6 · 第 9 章写盘信任风险行（**缓解列「三重保护」保持不动**，D30 原话）；分析文 §4.4（AD3，L2/L3）· §4.5（AD4 的 4-a 档）· §7 Phase 1 表 1-2/1-3/1-6 行（**出口判据单源在那里**）· §10-2（否证触发器） |
| 下游设计 | design §7.3（整文件管理 + 预留标记）、§7.5（`pack.lock.json` 形状）、§7.7（路径与规模安全）、§9（薄客户端：状态机在 core）；`packages/shared/src/pack-contract.ts:43-45`（受管标记本体） |
| 关联任务 | **无**。PRD §10.4 第三组原文：「本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起」 |
| 版本 | **v0.9 草案（2026-10-03，纯新文件；本轮不改任何既有规格）**。按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**：§8.2 四处待裁未闭合。**判级红线（引 D30 原话）**：「核验命令本身是 B 级；**若改 `pack.lock` 形状则升 A 级**，届时须另起 D 号并按 §10.4 第二组走完整链」⇒ 本 spec 的 FR-7 就是把这条红线写成不可实现的形态 |

---

## 1. 目标与用户价值

- 现在的系统能回答「我要不要覆盖这个文件」，答不出「我上一轮是不是没写完」「这台机上的东西到底是谁改的」。用户只能靠 `.openvibe/backup/` 一个个文件比对回去——**这是「保护」，不是「自证」**。
- 分析文 §4.4 的原话是：「L2 的三方一致性**不需要新算法**——三个哈希都已存在……它现在是『信息都在但没人把它们放在一起看』」。**实测比这句更乐观**：`packages/core/src/inject/planner.ts:22-36` 的 `InjectPlanFile` **已经把三个哈希放在同一个对象里**（`packSha256`／`diskSha256`／`lockSha256`，注释原文「上次注入时登记的期望哈希（null = lock 里没有这个路径）」），只是这个对象在 `sync` 的一次交互里用完就丢。⇒ **本项的实现形态是「把已有算源变成随时可问」，不是「新造一个比对引擎」**。这条决定了工作量判断，也决定了 §4 FR-1.1 的约束。
- 用户可见的三件东西：一条命令（`openvibe verify <dir>`）、项目页一枚一致性徽标、冲突屏上「为什么」那一行。

## 2. 范围

| In（本 spec 覆盖） | Out（明确不做，写明理由与去向） |
|---|---|
| `openvibe verify <dir>`：三方四态、只读、可 `--json` | 把一致性状态写进 `pack.lock.json`（**新键 = A 级**，D30 判级边界；FR-7 每次现算） |
| 写入协议留痕：`.tmp` 预备 → 逐文件写 → 原子替换 lock | 自动修复（verify 只出四态 + 建议，不代用户决定「以包为准」还是「保留本地」——那是队列 ㉕ 的待裁面） |
| `sync` 起始内部 verify + 「上次注入可能中断」+ `--resume` | 段级**写入**／段级选择（4-b）与分析文 §10-2 的统计判据未出结果前不排；段级受管标记 + `schemaVersion` 1→2（4-c）归 RF4 与队列 ㉘ 合批，是 **A 级** |
| 段级差异**只读**展示（1-3 / AD4-4-a） | 改整文件 sha 判定（Phase 1 表 1-3 行出口判据明写「整文件 sha 判定不变」） |
| 冲突屏「为什么」层（1-6 / D3-L3） | 引入新的受管标记／段标记（引入即触 4-c，见 §6.4 的推论） |
| `GET /api/projects/:id/consistency` + Web 只读徽标 | Web 侧写入／修复（Web 无法写本地文件是 README 既有限制，本项不越） |
| 与 `retirement`／`diff` 既有两方比对的收口（`service-layer.md` FR-2 的同一批） | 改第 9 章「三重保护」缓解列原文（D30 明写保持不动） |

## 3. 现状与实测基线（采样：2026-10-03 工作树；引用提交树 `54789b8` 的行号）

| # | 量 | 现测值 | 复算命令 |
|---|---|---|---|
| 1 | 三哈希是否已同处一对象 | **是**：`InjectPlanFile` 含 `packSha256`／`diskSha256`／`lockSha256` 三字段（`packages/core/src/inject/planner.ts:22-36`） | `sed -n '22,36p' packages/core/src/inject/planner.ts` |
| 2 | planner 五态 | `['NEW','IN_SYNC','UPDATE','CONFLICT','DRIFT']`（`planner.ts:14`）；决策三值 `['overwrite','keep-local','skip']`（`:18`） | `sed -n '14,19p' packages/core/src/inject/planner.ts` |
| 3 | lock 是否原子替换 | **不是**：全仓 `renameSync` **0 命中**；`atomic-write.ts:37` 是 `writeFileSync` 直写，前置 `lstat`+`unlink` 只解硬链接（`:29-32`，注释与 `:1-5` 说明「硬链接不是链接文件，三道闸一律放行」） | `grep -rn 'renameSync' --include='*.ts' packages apps \| grep -v test`（空） |
| 4 | 现写入顺序实测 | `sync`：**取锁**（`:75` `tryAcquireSyncLock`）→ **信号释放**（`:85` `releaseLockOnSignal`）→ **逐文件：备份后写**（`:92-108`，`uniqueBackupRoot`＋`copyFileSync`＋`mkdir`）→ **lock 最后写**（`:136-137` `writeReplacingLinks(lockPath, packLockJson(nextLock), 0o644)`）⇒ 与分析文 §4.4 设想的「先写 lock `.tmp`」次序**不同** | `sed -n '295,462p' apps/cli/src/commands/sync.ts \| grep -nE 'backup\|rename\|lock'` |
| 5 | 中断处理的既有零件 | `sync-lock.ts` 已有持锁者探活与陈旧接管：`SyncLockHolder { pid, startedAt, command }`（`:19-22`）、`state: 'absent' \| 'held' \| 'stale'`（`:100`）、`tookOver`（`:42`）、`isAlive` 缺省 `process.kill(pid, 0)`（`:29-30`） | `sed -n '14,45p' packages/core/src/inject/sync-lock.ts` |
| 6 | 既有**两方**只读比对（不是零起点） | `openvibe diff <projectPath>`（m6b FR-5）已在做「磁盘 vs lock」：`diff.ts:3` import `diffPackLock`、`:9` 注释「磁盘 vs pack.lock.json 的只读比对」、`:149` 调用、`:176-177` 出 `clean`／`drifted`／`missing` | `sed -n '9,12p;145,180p' apps/cli/src/commands/diff.ts` |
| 7 | 三方数据源形状 | 包侧：`PackManifestSchema.files[].{path, sha256}`（`packages/shared/src/schemas/pack.ts:222-228`，**字段名是 `sha256`；分析文写的 `fileSha256` 是 `fingerprint.ts:5` 的函数名**）；bundle 侧带全文：`PackBundleSchema { bundleSchemaVersion: literal(1), manifest, files[].content }`（`:234-243`）；lock 侧：`PackLockSchema { schemaVersion: literal(1), pack.{id,name,version,fingerprint}, injectedAt, files[].{path,sha256,managed} }`（`:246-284`） | `sed -n '218,284p' packages/shared/src/schemas/pack.ts` |
| 8 | CLI 冲突屏现有信息 | **只有选项 label 不带理由**：`decide` 内 `select` 的 `label: DECISION_LABEL[d] + (d === file.defaultDecision ? '（默认）' : '')`——三哈希一个都没上屏 | `grep -n 'DECISION_LABEL' apps/cli/src/commands/sync.ts` |
| 9 | Web 侧注入冲突面 | **无**：`apps/web/src` 内 `CONFLICT` 命中 4 处全是 `NAME_CONFLICT`（同名冲突），与注入无关 ⇒ 一致性徽标是新增只读面，落点 `apps/web/src/pages/ProjectDetailPage.tsx` | `grep -rn 'CONFLICT' apps/web/src --include='*.tsx' \| wc -l` |
| 10 | 段界可推导（不需要新标记） | 产物内既有层级与分隔：`## 阶段 N · <stage.name>`（`composer.ts:141`）、`### <stage.name>`（`:94`）、`#### <prompt.title>`（`:100`）、`SKILLS_MD_DIVIDER`（`:136`）；受管块标记本体在 `pack-contract.ts:43`（begin）与 `:45`（`<!-- openvibe:end -->`） | `grep -n '## ' packages/core/src/pack/composer.ts \| head` |
| 11 | `local_events` 侧的挂接点 | 本项三类事件（`injection_confirmed`／`injection_conflict_resolved`／`injection_failed`）**受 `local-event-ledger.md` §6.2 待裁③ 阻**（CLI 从不打开 DB）⇒ 本 spec 不得把「verify 结果进台账」写成已完成 | `grep -rln 'openDb\|better-sqlite3' apps/cli/src`（空） |

**三个术语**：**三方** = 包内容哈希 / lock 期望哈希 / 磁盘实时哈希；**四态** = `CONSISTENT`／`PARTIAL`／`STALE_LOCK`／`ORPHAN`（D30 已裁的名字，本文件不另起）；**投影** = 四态由既有算源导出、不新增比较逻辑的关系（FR-1.1）。

## 4. 功能需求（FR）

- **FR-1 `openvibe verify <dir>`**：只读三方核验，输出四态 + 逐文件三哈希 + 修复建议。
  - FR-1.1 **不新建比对引擎**：算源必须是 `planInjection` 产出的 `InjectPlanFile`（或与其同一函数），四态是其上的**投影表**（下表）。新增第二套哈希比较逻辑即判不过——那正是 `service-layer.md` FR-2 要消灭的东西。

| 四态 | 由既有事实导出的条件 |
|---|---|
| `CONSISTENT` | 范围内每个文件 `diskSha256 === lockSha256 === packSha256`，且 lock 的 `pack.fingerprint` 等于本次指定导出的指纹 |
| `STALE_LOCK` | lock 的 `pack.{version,fingerprint}` ≠ 本次指定导出的指纹，而磁盘与 lock 一致（即「注入没坏，但指的是旧导出」） |
| `ORPHAN` | 磁盘文件含受管标记（`pack-contract.ts:43/45`）但 lock 无对应条目；**或** lock 有条目而磁盘无文件（后者是 `retirement.ts:50` 的 `ABSENT`、`diff.ts:177` 的 `missing`） |
| `PARTIAL` | **仅在写入留痕存在时**判得出：见 FR-1.2 |

  - FR-1.2 **PARTIAL 的可判性前提（本 spec 最重要的一条诚实约束）**：纯三方哈希**不能**区分「上一轮注入中断」与「用户手改了文件」——两者的观测完全相同（磁盘 ≠ lock 且磁盘 ≠ 包）。⇒ `PARTIAL` 必须依赖 FR-2 的写入留痕（`.tmp` 或 `.pending` 清单）才成立；留痕缺席时该态退化为「三哈希不一致，成因未知」，**不得冒充 PARTIAL**。退化形态选哪个，见 §8.2 待裁①。
  - FR-1.3 输出：人类可读为默认，`--json` 为机器面；退出码沿用 CLI 既有约定（**不得新造**：本项零写入，成功态返回既有 0，不可判态返回既有非 0 码位并登记）。
  - FR-1.4 **零写入是结构保证**，不是靠调用方记得加分支——照 `planner.ts:2-3` 注释立的形制（「纯函数：磁盘由 readDisk 注入……dry-run 的『零写入』因此是结构保证」）。
  - FR-1.5 包侧来源的优先级见 §6.1（三个来源不能同时满足时以哪个为准，属 §8.2 待裁④）。
- **FR-2 写入协议留痕 + 原子替换**（这是 FR-1.2 的前置，不是并列项）：
  - FR-2.1 次序固定：备份先行（**已有，L1 保持不动**：`sync.ts:98-105`）→ 目标 lock 文本写 `.tmp` 并留 `.pending` 清单（本次要写哪些路径）→ 逐文件写 → **rename 原子替换 lock** → 删 `.pending`。
  - FR-2.2 原子替换用 rename，且必须验：**Windows 上 rename 覆盖既有文件的行为在本机测不到**（本机 macOS；`process.platform` 在 core/cli 仅 `serve.ts:54` 一处分支）⇒ 凭据只能取三平台 CI 的 `three-smokes`，不得以「本地通过」申报。
  - FR-2.3 rename 与既有 `writeReplacingLinks` 的关系要写明：rename 天然不穿 inode，故硬链接穿透问题在 lock 这条路径上消失；**但普通产物文件仍走 `writeReplacingLinks`**，本项不简化它（简化属行为变更，另判）。
- **FR-3 `sync` 起始内部 verify**：
  - FR-3.1 `sync` 在取锁之后、规划之前跑一次内部 verify；检出留痕 ⇒ 提示「上次注入可能中断（`<path>` 半新半旧）」并给 `--resume`。
  - FR-3.2 `--resume` **不得成为第二套锁语义**：既有 `tryAcquireSyncLock` 的 `tookOver`（`sync-lock.ts:42`）已处理「持锁进程已死」，`--resume` 只做「按 `.pending` 清单把未完成的那部分重新规划」，锁的获取与接管一字不改。
  - FR-3.3 无 `--resume` 时 `sync` 行为与今天**逐字一致**（不得因为加了前置 verify 就改变原有三选/默认值语义）。
- **FR-4 Web 侧**：`GET /api/projects/:id/consistency`（只读）+ `ProjectDetailPage` 一枚徽标（四态各一形）。
  - FR-4.1 一致性**每次现算**，不缓存进 DB、不写进 lock（FR-7）。
  - FR-4.2 出参注册到 `output-validation.md` 的断言面（新增类型即新增断言）。
- **FR-5 段级差异展示（1-3 / AD4-4-a，只读）**：
  - FR-5.1 实现路径 = 「包渲染出的段文本」vs「磁盘按既有标记切出的段文本」，段界**只由既有结构推出**（§3-10 的 `##`/`###`/`####`/`SKILLS_MD_DIVIDER` + `pack-contract.ts` 的 begin/end），**不得引入新标记**——引入新标记就是 4-c，是 A 级。
  - FR-5.2 出口判据照 Phase 1 表 1-3 行：1000 行文件改 1 行 ⇒ 报文给出**段名与行数**；**整文件 sha 判定不变**（段级只读，不参与任何写入决策）。
  - FR-5.3 展示面：`diff` 报文扩展（只读命令，天然同处）；CLI 与 Web 复用同一切段函数（**不得两处各写一套切段**）。
- **FR-6 冲突屏「为什么」层（1-6 / D3-L3）**：
  - FR-6.1 每个待决文件一行，上屏「lock 记的哈希 X、磁盘 Y、包 Z」+ 一句人话理由（状态名已有，缺的是理由文本）。现状凭据 = §3-8（今天只印选项 label）。
  - FR-6.2 哈希展示口径统一（建议前 8 位 + 全长进 `--json`），否则 CLI 与 Web 会各写一套，见 §6.7。
  - FR-6.3 文案进 i18n（与 `entry-budget.md` FR-1 的命名空间对齐）；**不新造交互语言**（沿用 `select` 的既有三选形制，只是把 label 上方的说明行写实）。
- **FR-7 lock 契约冻结（红线，写成可判）**：`PackLockSchema`（`pack.ts:246-284`）**零新增键**；CI 断言 = 该 schema 的键集合与提交树 `54789b8` 逐字相同。任何「把一致性状态／段清单写进 lock」的实现路径都判不过并须回报 owner。

## 5. 输入 / 输出

| 方向 | 内容 | 形态 |
|---|---|---|
| 入 | `verify <dir>` + 可选包侧来源（`--file`／`--dir`／`--version`／DB 登记的项目） | 旗标；离线时禁走 HTTP（`sync --file/--dir` 的既有约束，dev-plan §1.2） |
| 出 | 四态 + 逐文件三哈希 + 建议 + 段级差异列表 | CLI 文本 / `--json`；Web 徽标用同一枚举，**不得有第二套词**（见 §6.5） |
| 出 | 留痕文件（`.tmp`／`.pending`） | 只存在于注入过程窗口内，成功后必须删除；残留即 §8.2 待裁① 的判据物 |

## 6. 边界与异常

- **6.1 包侧来源有三处，且互斥场景真实存在**：`--file/--dir` 指定的 bundle（离线）、DB 中项目登记的 `standard_pack_id` 及其导出、磁盘 lock 自记的 `pack.{name,version,fingerprint}`。三者不一致时谁是基准？离线模式（无 DB）时又怎么办？⇒ §8.2 待裁④。规格先给出**行为底线**：来源不足时 `verify` 必须报「无法核验（缺包侧基准）」并**退出码非 0**，不得退化成「只比 lock 与磁盘」（那是 `diff` 已有的语义，两条命令不能长得一样却含义不同）。
- **6.2 与 `diff` 的分工必须写死**：`diff` = 两方（lock ↔ 磁盘，既有 m6b FR-5）；`verify` = 三方（包 ↔ lock ↔ 磁盘）。⇒ 用户可见差异要讲清，否则多出一枚「看起来重复的命令」。处置：`verify` 的输出里包含 `diff` 的两方结论作为子集，并在 `--help` 一句话说明分工。
- **6.3 备份面（L1）不动**：`uniqueBackupRoot`（`sync.ts:155`）与 `utcStamp`（`:147`）的既有语义、备份路径上屏（`sync.ts` 内的「被覆盖的旧文件在 `${backupRoot}`，可逐个复制回去」提示行）保持。本项**不新增备份层**，只新增 lock 的原子性。
- **6.4 段级展示的假绿风险**：段落**重排**（内容不变、次序变）会同时报「多段变更」。⇒ §7 必须有一条重排夹具（k 条），且切段函数对「同名段出现两次」要有确定行为（`composer.ts:141` 的 `## 阶段 N · <name>` 带序号，天然不重复；但 `#### <prompt.title>` 可重复——**这条要测**）。
- **6.5 三套状态词已经存在，本项极易变成第四套**：`INJECT_STATUSES` 五态（`planner.ts:14`）、`retirement` 四态（`ABSENT`／`FOREIGN`／`IN_SYNC`／`DRIFT`，`retirement.ts:48-53`）、`diffPackLock` 的 `{clean, drifted, missing}`（`diff.ts:176-177`）。⇒ 本 spec 采 `service-layer.md` FR-2 的合一结果；若 1-1 未落地，则本项**并行投影**并在 §7 的 m 条留一条债断言（四态映射表与三套旧词的对应关系逐行有测试），不得静默新增第四套枚举。
- **6.6 否证触发器挂在 D30**：分析文 §10-2 的条件是「RF1-3 上线后若统计出用户漂移集中在『整文件重写』，则段级路线撤回，本行的 `verify` 仍保留」，判定方式在 PRD D31 行写作「RF3 前统计 `pack_exported` 版本增速」。⇒ 本项把「统计口径可算」列为 §7 的人工腿（n），并明确：**没有这条统计，1-3 的收益主张就停在假设上**（不得以「已实现」代替「已验证有收益」）。
- **6.7 哈希展示口径**：64 位 hex 上屏会把冲突屏挤成不可读；但截断后无法核对。⇒ 定「屏上前 8 位 + 全形进 `--json` 与 Web 详情」，两处同口径（FR-6.2）。
- **6.8 与队列 ㉘／4-c 的关系**：4-c（段级受管 + `schemaVersion` 1→2 + golden 重基）属 RF4 与队列 ㉘ 合批的 **A 级**动作。本项**只读**，不产生任何契约变更；若实现中途发现「非加段标记不可」，立即停手回报，不得把工作树推进 A 级流程。

## 7. 验收标准（pass/fail）

| # | 条目 | 判据 | 测试 ID |
|---|---|---|---|
| a | 四态各一支用例，且**人为造出中间态能被判出**（Phase 1 表 1-2 行原句） | 四支：CONSISTENT／PARTIAL（带留痕）／STALE_LOCK／ORPHAN 各一 | `CLI-VERIFY-01..04` |
| b | 零写入：`verify` 跑过后目标目录 sha256 树不变 | 复用 `apps/cli/test/helpers/tree.ts` 的树比对 | `CLI-VERIFY-05` |
| c | FR-1.1 无第二套引擎 | `grep -rn 'fileSha256' packages/core/src --include='*.ts' \| grep -v test` 的命中集合**不因本项新增比较函数**（新增只允许出现在既有算源路径） | `UT-VERIFY-01` |
| d | lock 原子替换：写入过程中 SIGKILL 后，磁盘上 lock 要么是旧全文要么是新全文，**绝无半截** | 崩溃注入测试（`.tmp`+rename 分支），三平台 CI 各跑 | `CLI-VERIFY-06` |
| e | `--resume` 不改既有三选语义；无 `--resume` 时 `sync` 输出与基线逐字一致 | 快照对比（既有 `apps/cli/test/sync.test.ts` 断言不改） | `CLI-VERIFY-07` |
| f | 留痕文件成功后不残留 | `existsSync` 两态断言 | `CLI-VERIFY-08` |
| g | `GET /api/projects/:id/consistency` 鉴权与双闸生效 | 无 token ⇒ 既有 401/403 形态 | `SRV-CONSIST-01` |
| h | FR-7 lock 键集合与 `54789b8` 逐字相同 | schema 键集快照 | `UT-VERIFY-02` |
| i | 段级：1000 行产物改 1 行 ⇒ 报文给出段名与行数，且其余段判「未变」 | 夹具两段式（`UT-SEGDIF-*` 表驱动） | `UT-SEGDIF-01` |
| j | 段级：整文件 sha 判定不变 | `planner` 五态断言全部未改（`git diff` 该测试文件为空） | `UT-SEGDIF-02` |
| k | 段级：**重排夹具**不误报内容变更（或按声明的口径如实报「两段移动」） | 同内容换序断言 | `UT-SEGDIF-03` |
| l | 段名可重复面的确定行为（`#### <prompt.title>` 允许同名） | 同名两段 ⇒ 有唯一 id 或明确报「多段同名」 | `UT-SEGDIF-04` |
| m | 四态 ↔ 三套旧状态词的映射逐行有测试（§6.5） | 表驱动映射断言 | `UT-VERIFY-03` |
| n | **人工腿**：`pack_exported` 版本增速统计口径可算且已出数（§6.6 否证触发器的判定物） | 一条查询 + 结果登记；未出数则 1-3 判「已实现未验证收益」 | `MANUAL-VERIFY-01` |
| o | 现有闸零放松：golden 零 diff、`bundle:check` 余量不减、`seed:check` 三精确值不变 | 三条外部凭据 | `GOLD-VERIFY-01` |

- **7.7 未验证面**（负向登记，不得读成已通过）：① Windows 的 rename 覆盖语义本机测不到（§3 无 `process.platform` 分支），只在三平台 CI 上有凭据；② `PARTIAL` 在留痕缺席时的真实退化形态（待裁①）；③ 段级展示的实测收益（要等 n 条的统计）；④ verify 结果进本机台账（受 `local-event-ledger.md` §6.2 待裁③ 阻，本项不含）；⑤ 崩溃注入测试在 CI 上的稳定性（`fs` 时序敏感，可能成为 flaky 源）。

## 8. 依赖

- **8.1 上游**：PRD D30（授权与判级红线）；`service-layer.md`（1-1，四态投影与算源合一的落点）。**1-6 依赖 1-2**（Phase 1 表原文），故 FR-6 的排期在 FR-1 之后。
- **8.2 待裁清单**（owner 裁前，本文件不构成开工依据）：

| # | 待裁项 | 候选与推荐 |
|---|---|---|
| ① | 写入留痕缺席时，第四态叫什么、算不算缺陷 | (a) 增设 `UNDETERMINED`（诚实，但四态变五态、与 D30 已裁的名字不一致 ⇒ 须 owner 认）；(b) 保持四态但把该情形并入 `PARTIAL` 并在报文写「成因未知」（**假绿风险**，不推荐）；(c) 本轮不做 `PARTIAL`，只交付三态可判。**推荐 (a)**，前提是 owner 接受 D30 的四态命名需要扩一次 |
| ② | 段界推导规则（FR-5.1 只说「由既有结构推出」，具体切法要定） | (a) 按标题层级（`##`/`###`/`####`）+ `SKILLS_MD_DIVIDER`；(b) 只按阶段标题；(c) 只按受管块内一级分隔。**推荐 (a)**——它与 §3-10 实测的既有渲染结构逐条对应，且不需要新标记 |
| ③ | **4-b（段级选择）的决策点归谁、何时判**：分析文原话「4-b 视 4-a 的实测收益决定」——不写下来它会沉默消失 | 推荐：把判定点钉在 §7 的 n 条出数之后，由 owner 明确「继续／撤回」并登记队列项；**本 spec 不代他排期**，也不得把 4-b 写成「顺带做了」 |
| ④ | 包侧基准来源优先级（§6.1） | (a) 显式旗标 > bundle 自带 manifest > DB 登记；(b) 永远以 DB 为准（离线模式则拒绝核验）。**推荐 (a)**，因为 CLI 离线模式是 R3 的存在理由，(b) 会让离线项目完全无法自证 |

- **8.3 与其他 spec 的接缝**：`m6-cli-injection.md` 要接住 `verify` 的子命令面（本轮同批修订，含**两个 `rollback` 同名异物的登记**）；`m6-standard-pack.md` FR-7 的干跑屏是 D3-L3「为什么」层的 Web 对应面（分析文 §11：「FR-7 干跑 ⇒ 强化，D3-L3 的『为什么』层正好落在这一屏」）；队列 ㉕（冲突默认值）与队列 ㉘（`schemaVersion` 1→2）分别挡住本项 FR-6 的默认倾向与 4-c 路线。
