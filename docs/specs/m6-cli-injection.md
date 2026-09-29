# SPEC · M6b 标准包与注入 —— CLI 侧（serve / scan / sync / diff / clean）

| 项 | 值 |
|------|------|
| 模块 | M6 CLI（`npx openvibe-cli`）——注入唯一物理通道（PRD 审查二 P0 修正） |
| 优先级 | P0 · MVP 硬依赖 |
| 上游 | PRD 3.2-M6、4.2、5.2（异常流）、8 章（关键依赖） |
| 下游设计 | design.md §7（契约）、§9（CLI 设计）、§11（安全） |
| 关联任务 | tasks.md T7 · P1.1 追加 T10（见 dev-plan §15） |
| 姊妹规格 | [m6-standard-pack.md](./m6-standard-pack.md)（Web 侧） |
| 版本 | v1.0（2026-09-20 定稿，随 P0 门禁 G2/G3 冻结）→ v1.1（2026-09-23，T8e 并发 sync 锁新增 §6.9 与验收 §7.9，commit `eef8925`；**本行为 2026-09-23 补记，当时未按 §0.3 B 级流程登记**）→ v1.2（2026-09-23，P1.1 裁定 D19/D20：新增 FR-6 `clean`、命令总览行、§6.10 一项目一包边界、验收 §7.10 a–j。**同轮自审补闸**：`clean` 的删除凭据加了 `managed === true`（design §7.5 的 `--target` 过滤会把未写入文件也登记期望哈希），故验收多一支 **j**、测试段改为 `CLI-CLEAN-01..10`）→ v1.3（2026-09-24，T10 开工前规格/代码对撞自审，**无新增行为**，三条按实测修正：**①** §7.10 j 与 FR-6.3 括号的构造按实测改写——`managed` 是「本次实写 ∪ 上次已受管」且**只升不降**（`buildPackLock` 的 `managed` 一行），「全量 sync 后 `--target` 重刷 ⇒ 降为 false」不成立，改为「用户自己先写逐字节同名文件 + 首次即 `--target`」；**②** §6.10 换包语义由「整体重写、旧包独有文件脱离登记」改为「合并、旧条目留档并仍由 `clean` 一并退场」（与 `buildPackLock` 的旧条目留档循环一致），§6.2 与 FR-6.3 表尾的「孤儿文件」措辞随之收口；**③** FR-6.2 与 §7.10 f2 补「lock 存在但读不懂 ⇒ `LOCK_INVALID`、零删除」口径（原规格只写了「无 lock」一支）。依 §0.3 原判 C 级（实现细节/验收构造，不改冻结契约），`tests/golden/` 零改动；**2026-09-26 队列 ⑥ 复核把 ② 改判 B 级并准入**（R1，owner 裁「留，并补测试」）——「换包后旧包独有文件仍由 `clean` 一并退场」是用户可见的删盘口径，而 golden 零改动从来不构成 C 的反证；①③ 维持 C（构造与读锁口径）——本段补记见 v1.8 ③）→ v1.4（2026-09-24，**T3 实施审查引发的两处口径收口，无新增功能**：**①** FR-6.9 补「交互式答『不』/ Ctrl-C ⇒ 退出码 **2**」并加验收 **§7.10 e2**（测试 `CLI-CLEAN-05c`）——原规格只给了 `0` 全清 / `2` 有 DRIFT 残留 / `1` 错误三档，未覆盖「用户主动拒绝、一个文件都没删」这一条，而实现按 `0` 返回会把「什么都没做」报成「已全清」；**②** FR-6.6 补「路径净化**先于** `PackLockSchema` 整机校验」的先后口径并点名净化归 core——实测 `packPathSchema`（`packages/shared/src/schemas/pack.ts`）会先把 `../evil.txt` 判成 schema 不符，若顺序反过来 §7.10 g 要的「报告含违规路径」永远出不来、只剩 f2 的 `LOCK_INVALID`，两道闸互吃。**③** 原 v1.3 只登记了三条修正，本轮另发现 CLI 侧 `sanitizeLockEntries` 是 core 规则的弱复制（`isPlainRelative` 漏了空段/超长），②的口径即为收它。**④** FR-6.5 的「退场成功后删 lock」补判据：**`driftKept === 0` 即删**，而非「本次 unlink 数 > 0」——否则用户手工删光注入文件后 `clean` 永久停在「保留 lock」且无命令可收尾，与 §6.3 `ABSENT` 行「计入已自行退场」矛盾；配验收 **e3**、测试 `CLI-CLEAN-06b`（原 06b 的标题与实际断言相反，已按新口径重写）。依 §0.3 原判：**①属 B 级**（新增一条用户可见的退出码口径），**②③④属 C 级**（实现顺序、归属与判据口径，不改既有正常路径行为）；**2026-09-26 队列 ⑥ 复核把 ④ 改判 B 级并准入**（R2，owner 裁「留（含全 `FOREIGN` 也删 lock）」——「一个文件都没动也删 lock」正是删盘口径，登记理由「不改既有正常路径行为」说的恰好是它的用户可见性），**② 同轮上调为 B 级**（两道闸的先后决定用户看到「报告含违规路径」还是只剩 `LOCK_INVALID`；**这条不在 owner 逐条裁定的四项里，是我按 §0.3「拿不准往高级别归」自行上调；owner 2026-09-26 23:3x 追认为 B**（四处改判至此全部有 owner 落款：v1.3② / v1.4② / v1.4④ / v1.5）），③ 维持 C（core 侧弱复制的收口，纯实现归属），`tests/golden/` 零改动）→ v1.5（2026-09-24，**T5 实施审查引发的一处口径收口，无新增功能**：FR-6.10 补「枚举六键是**下限不是闭集**」——原文可被读成闭集，而实现早已附加 `foreign`（v1.2 的 §7.10 j 要求 FOREIGN 可见），按闭集读法下一个读者会去「对齐」掉它；本轮同时把 `hints` 定为必带，承重理由是**三条「解释只在 hints 里」的腿**（交互取消 v1.4 ① / `--dry-run` / 陈旧锁接管；细则与「为什么排除法不算理由」见 FR-6.10 正文，那里并按实况自纠了一处过强措辞：退出码 `2` 的 DRIFT 腿其理由本就是枚举键 `driftKept`，不必重复塞散文）——而 `--json` 的全部意义正是机器读者不必去猜。依 §0.3 原判 **C 级**（自述「形状口径澄清 + 一个附加键，不改任何既有键名与退出码」——**同一对括号里自我否定**：键集合变化就是形状变化），**2026-09-26 队列 ⑥ 复核改判 B 级并准入**（R3，owner 裁「留，只改判级标签为 B」），`tests/golden/` 零改动。**同段的二次自纠不满足当日新立的「升版段可复核原则」**：FR-6.10 现文的「三条承重腿」由 `5a22800`（2026-09-24）携带，而该 commit **改写的是 v1.5 那一段自身的文本**（它同时动了链表行与 FR-6.10，没有新增段）⇒ 同一段文字先后经 `94b2bd3`（立段）→ `7ce3d83`（一次自纠）→ `5a22800`（二次自纠）三笔成形，**段与 commit 不是一一对应**，「不另计次」的实义就是「无独立可复核态」。复算：`git log -L 11,11:docs/specs/m6-cli-injection.md --format='%h %ad %s' --date=short | grep -E '^[0-9a-f]{7} '` ⇒ 7 笔改过本链表行（本轮初稿据此处写成「`5a22800` 版本链表行一字未动」，**那是假的**，`-L` 一跑即现形）。v1.8 ① 已把其中「钉文案原文」那半收回） → v1.6（2026-09-25，**P1.1 待决策项 ④ 的终审遗留修复，无新增功能**：`PackLockSchema.files[].path` 加**冲突闸**（`packages/shared/src/schemas/pack.ts`）：同一 `path` 重复登记且**凭据不一致**（`sha256` 或 `managed` 有差异）的 lock **整机读不回**，落既有 **§7.10 f2** 那一档（`LOCK_INVALID`、一个字节都不删），**不新增退出码**；`sync` 侧同情形走它既有的「按未注入处理 + 覆盖前仍备份」告警腿。**逐字节同名的重复条目不在这一档**，仍按 T3 修复轮登记的「按条目计」口径读得回、不去重。**为什么要收冲突**：`planner` 把 lock 收成按 `path` 索引的映射（后写覆盖前写），`clean` 则逐条目重新比盘 ⇒ 同一 `path` 挂两套凭据时「保留还是删除」取决于条目在数组里的排列顺序，而删除凭据最不该依赖顺序。**为什么只收冲突**：写入端 `buildPackLock` 以 `path` 为键合并，实测自造不出任何重复 ⇒ 闸只会打在手工编辑或手工合并过的 lock 上，而那一类 lock 的重复早被 `clean` 删除循环的注释明文定为「lock 冗余而非安全违规」。**本轮否证（owner 裁定收紧）**：本条初稿写的是「任何重复登记都落 f2」，现测把已入库的 `CLI-CLEAN-06f` 打红（全量 437 支里唯一红的一支，且机器负载已从 176 降到 18 ⇒ 不是环境噪声），并与那句登记注释直接对冲 ⇒ 撤成「冲突才拒」。依 §0.3 属 **B 级**（读侧新增一条输入拒绝；字段形状、`schemaVersion`、退出码枚举与 design §7.5 契约一字未动），`tests/golden/` 零改动；测试 `UT-INJECT-LOCK-04` 补两支——冲突腿断言**报错文案点名冲突的那个路径**（否则任何无关的 schema 失败都能满足这条测试，它就没有判别力），同名腿钉住「仍读得回且不去重」，两支合起来才是这一档的边界。同轮另自纠一处腐坏引用：`inject/security.ts` 与本行 v1.4 里写死的 `pack.ts:130` 实为 `packPathSchema`，已改指符号名（**行号不入正文**）——**后半句为假，2026-09-26 队列 ⑥ 复核抓到**：`security.ts` 那侧确已改，本文件里那两处（v1.4 段 + FR-6.6 正文）当时一字未动，且 `pack.ts` 那个行号今已指向另一个符号；本轮按 C 级补齐为符号名；本行 v1.6 初稿里的四处 `file:line` 也按同一规矩换成符号名。） → v1.7（2026-09-26，**待决策项 ⑯ 的实现对齐，无新增功能**：§6.9 补「0 字节空窗」条——`writeFileSync(..., {flag:'wx'})` 的 open 与写内容之间，锁文件以 **0 字节**对并发读者可见；实测 **100 波 × 6 个真子进程抢同一把锁 = 600 条首行里 7 条** 落在窗口里，让路方因此报 `BUSY unreadable -1` 而拿不到赢家 pid。处置是对「文件在、内容解析不出」做**有界重读**（上限 `SYNC_LOCK_REREAD_LIMIT`；重读中途文件消失改判「此处无锁」而不是谎报有人在跑；真损坏的内容仍按 mtime 判并在上限处收口成 `unreadable`），修后同规格探针 **0 条异常**（100 波 / 600 行）。§7.9 c 追加一条口径注。**用户可见口径一字未改**：`SYNC_BUSY`、退出码、`reason` 枚举、陈旧判定、`--dry-run` 不抢锁、release 归属校验全部原样——这一条是**实现对齐既有验收**（9c 早就写着「5 个让路且报出赢家 pid」）。依 §0.3 属 **C 级**（并发时序的实现细节），`tests/golden/` 与 `content/seed/` 零改动；测试 `SL-13`/`SL-14` + 四次变异反证，否证探针与前后测数入库 `docs/devlog-evidence/DEV-0035/`） → v1.8（2026-09-26，**队列 ⑥ 复核的落改**，两处行为面 + 两处登记面：**①（R4，owner 裁「降契约：只要求给出理由，不锁字句」）** FR-6.10 的 `hints` 三腿**不再锁文案**——契约只要求「本轮没动盘、而原因不在枚举键里 ⇒ 必须在 `hints` 给出可读理由」，接管那条须指认被接管的是谁；降的理由是保护面不对称（实测：`--dry-run` 腿只钉住文案的关键短语 `零写入零删除`、取消腿只钉三个字 `未删除`、`clean` 的接管腿在 `apps/cli/test/clean.test.ts` 零命中，而 `sync` 侧同族文案由 `CLI-LOCK-02` 钉着）。**②（R1，owner 裁「留，并补上跨包退场的回归测试」）** §6.10 换包口径补验收 **§7.10 k** 与测试 `CLI-CLEAN-13`，`buildPackLock` 那半句注释补全为「`sync` 不清理、`clean` 退场」。**③** 三段**判级标签改正**：v1.3 的 ②、v1.4 的 ④、v1.5 的 `hints` 必带，由我自报的 C 级改判 **B**，各在对应段落就地注明「2026-09-26 队列 ⑥ 复核准入」；owner 的三条裁定（R1 留 / R2 留（含全 `FOREIGN` 也删 lock）/ R3 留、只改标签）写进 FR-6.3、FR-6.5、FR-6.10 正文。**④** 两处腐烂修正：§7.10 头部那格「`CLI-CLEAN-12b`、现测 29 支」在**同一天**被 `CLI-CLEAN-13` 作废，改为不抄具名上界与支数、只留复算命令（承 §13-8 数字单源）；正文与 v1.3 段里 6 处**指针型**行号（`lock.ts` 的 `managed` 行 ×2、旧条目留档循环 ×2、同文件函数注释 ×2）换成符号名；只留 `pack.ts:130` 两处——它们引的是「当初写死的那个错号」本身，是证据不是指针，换掉就把证据换掉了。**行为面净变化只有 ①②**：无新增退出码、无新增键、`--json` 形状与 `clean` 的删除判据一字未改；③④不改行为，只改登记。依 §0.3 本段属 **B 级**（放松一条对外承诺 + 新增一条验收腿），`tests/golden/` 与 `content/seed/` 零改动。本段与 m6a 的 v1.4 段④同笔入库，两文件各以 `git show <sha> -- <path>` 单独可复核，不违反当日新立的「升版段可复核原则」。）→ v1.9（2026-09-27，**硬链接写穿的写侧收口**：新增边界 **§6.11** 与验收 **§7.11**，FR-2.5 补落盘方式与 `hints` 可见性。owner 裁「**替换式写入，不拒绝**」。机理：§6.1 那三道路径闸全是解析侧的——`checkWritePath` 抓符号链接靠 realpath 归一加 `lstat.isSymbolicLink()`，而**硬链接不是 reparse point**，两道判据都看不出它，于是 `writeFileSync` 打开的是那个 inode 本身，一次声称「只动项目内」的注入把内容写进了项目外那条路径。`mklink /H` 在 NTFS **免特权**（本机 `linkSync` 复现），所以这是 §7 三平台硬要求下最现实的穿透形状，而不是 POSIX-only 的边角。判级 **B 级**（用户可见的落盘语义变了：目标 inode 会换、`summary.hints` 多一条点名；无新增退出码、无新增 `--json` 键、`tests/golden/` 与 `content/seed/` 零改动）。**同轮在 §6.11 尾登记了三段边界**：a 是 `clean` 的删除循环节**刻意不改**、b 是 `config.json` 的 0600 写**刻意不接本助手**、c 是备份落点上**本轮没管**的第三处（无测试腿，但把将来收口时的判据写死了）——三段各带理由，免得下一轮把 a/b 当成漏网，或误以为 c 已被覆盖。**另有一处 C 级叙述修正**：FR-2.5 原句把「写文件」排在「备份」之前，与实现相反且自相矛盾（备份留的是写前字节），本轮按实况改成「逐文件先备份后写」，行为未变。） → v1.10（2026-09-30，**发布产物补齐 README 引用资产**（owner 裁「SVG 进包 + 链接绝对化」，队列 ㉑(a)）：§5 新增第 4 条锁定 tarball 的条目集合，`publishManifest()` 的 `files` 由 `["dist"]` 扩为 `["dist", "assets/readme"]`，`scripts/build-cli.ts` 的拷贝清单跟着补 `README_ASSETS` 两支、缺文件即 `fail()` 不产出裂首屏的包；README 侧把 `./CONTRIBUTING.md`（1 处）与 `./DEV_LOG.md`（2 处）换成 `…/blob/main/…` 绝对 URL，两张图保持相对（现在包内解析得开）。**判级 B 级**：装包产物的文件集合与清单形状都变了，§0.3 的「拿不准往高级别归」在这条上是正面生效——此前包内 README 的 4 个引用目标（两张图 + 两份文档）**只在 tar 内断、GitHub 页面正常**，所以它不是仓库内部的事，是用户拿到手的交付物的形状。**无新增命令、无新增退出码、无新增 `--json` 键**，`tests/golden/` 与 `content/seed/` 零改动；闸 = `tests/publish-manifest.test.ts` 的 `SCRIPT-PKG-01`（改钉两条 `files`）+ 新增 `SCRIPT-PKG-05`（逐条解析 README 的 `](./…)` 与 `src="./…"`，未解析集合非空即红，并钉住「零命中＝正则失效」不许静默通过）。依 §0.3 B 级第 ③ 步「同步 dev-plan §9 映射表」本轮**无可同步格**：`grep -rn "SCRIPT-PKG\|pkg:cli\|build-cli" docs/dev-plan.md docs/tasks.md` 零命中——发布暂存包从来只由 `tests/publish-manifest.test.ts` 与 `[DEV-0019]`/`[DEV-0020]` 的走查承载，不在 §9 的 FR 映射表里，故不为此凭空造一格。） |

---

## 1. 目标与用户价值

把标准包**安全地**写进真实项目目录。安全 = 三重保护（PRD 9 章）：dry-run 默认可预览、覆盖前自动备份、破坏性动作显式确认。同时 CLI 承担本地扫描（skills / 规则文件）与服务器启动。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| `openvibe serve`（启动 API + Web UI） | `openvibe update`（包升级迁移向导） |
| `openvibe scan --skills / --project` | 定时扫描 / watch 模式 |
| `openvibe sync`（默认交互确认；`--dry-run`；`--yes` 非交互） | 双向同步 `sync --pull`（P1） |
| `openvibe diff`（漂移检测 + 新版本探测） | 多项目管理命令（`projects list` 等，Web 已覆盖） |
| `openvibe clean`（受管文件退场，P1.1 / D19 加入） | 包升级迁移中的旧文件清理（`update` 向导，见 §6.2） |
| 冲突自动备份 + 注入登记（lock 文件 + 服务端上报） | |

## 3. 命令总览

| 命令 | 一句话 | 详见 |
|------|--------|------|
| `openvibe serve [--port 8787] [--open]` | 启动本地服务（API + Web UI），首启生成配置与令牌 | FR-1 |
| `openvibe scan [--skills] [--project <path>] [--roots <dir>...]` | 扫描 skill 目录 / 项目规则文件，登记进服务端 | FR-3/FR-4 |
| `openvibe sync <projectPath> [--pack name[@ver]] [--file bundle.json] [--dir <packDir>] [--dry-run] [--yes] [--strategy skip\|overwrite\|keep-local] [--target <adapter>...]` | 注入标准包 | FR-2 |
| `openvibe diff <projectPath>` | 漂移检测 + 新版本探测 | FR-5 |
| `openvibe clean <projectPath> [--dry-run] [--yes] [--force]` | 退场：删除**当前 lock 登记且未被改动**的受管文件（P1.1 / D20） | FR-6 |
| `openvibe --version / help` | 常规 | — |

全局旗标：`--server <url>`（默认 `http://127.0.0.1:8787`）、`--token <t>`、`--json`（机器可读输出，供脚本/测试）。配置发现顺序：旗标 > 环境变量（`OPENVIBE_SERVER`/`OPENVIBE_TOKEN`）> `~/.openvibe/config.json`。

## 4. 功能需求（FR）

### FR-1 serve
1. 启动 Fastify 服务（API + 托管 Web 静态产物）；绑定 `127.0.0.1`，不监听公网。
2. 首次启动：初始化 `~/.openvibe/`（config.json 含 token，权限 0600；data/；packs/）、建库、跑种子导入；`--open` 自动开浏览器。
3. serve 与 sync/scan 可并行（sync 只读 HTTP API）。

### FR-2 sync（核心状态机）
1. **解析包**（三选一，互斥，缺省 `--pack` 取项目登记包）：
   - `--pack name[@version]` → 服务端 API 拉取 bundle；
   - `--file bundle.json` → 本地 bundle（离线）；
   - `--dir <packDir>` → 导出目录（离线）。
   校验 manifest `schemaVersion` 与 fingerprint（重算防篡改/防损坏），不符 → 退出码 1。
2. **计算计划**：对 manifest.files 逐文件比对磁盘状态，落五类：
   | 状态 | 条件 | 默认动作 |
   |------|------|----------|
   | `NEW` | 磁盘不存在 | 写入 |
   | `IN_SYNC` | 内容 sha256 一致 | 跳过 |
   | `UPDATE` | lock 标记受管 且 磁盘内容 == 注入时内容 | 备份后写入 |
   | `CONFLICT` | 磁盘存在、内容不同、且**非本包受管** | 交互确认（覆盖[默认]/跳过）；备份后覆盖 |
   | `DRIFT` | lock 标记受管 但 磁盘内容 ≠ 注入时内容 | 交互三选（以包为准[默认]/保留本地/跳过）；前两者均先备份 |
3. **dry-run**：`--dry-run` 只打印计划表（状态/路径/动作），**零写入零删除**（含不写 lock、不动备份目录）。
4. **非交互**：`--yes --strategy skip|overwrite|keep-local` 把 CONFLICT/DRIFT 按策略批量处置；无 `--yes` 且 stdin 非 TTY → 拒绝执行退出码 1（防 CI 意外挂起）。
5. **写入与登记**：逐文件**先备份后写**——受影响的旧文件先 `copyFileSync` 进 `<project>/.openvibe/backup/<UTC时间戳>/`（保留相对路径，同戳追加 `-n`，规则同 §6.4），再落盘新内容（权限 0644；**落盘方式见 §6.11**：目标在磁盘上挂着额外链接时按「解链后新建」写，并在 `summary.hints` 点名条目与路径）→ 写/更新 `<project>/.openvibe/pack.lock.json`（包名@版本、指纹、逐文件 sha256）→ 上报服务端注入历史（离线模式跳过上报，仅警告）。（v1.9 的 C 级修正：原句把「写文件」排在「备份」之前，与实现相反——备份的意义是留住**写前**那一份字节，顺序反过来留到的就是新内容了。只改叙述顺序，行为一字未动。）
6. **收尾输出**：计划摘要（各类计数）+「建议将 `.openvibe/backup/` 加入 .gitignore」提示（**只提示，不改 .gitignore**）。
7. **目标过滤**：`--target` 限定本次写入的 adapter 子集（如只刷 cursor 文件），lock 记录全部文件的期望哈希但只标注实际写入项。

### FR-3 scan --skills
1. 调服务端 `POST /api/skills/scan`（目录解析与指纹逻辑在服务端，规格见 m2 FR-1）；CLI 负责参数与报告渲染。
2. 服务端不可达 → 明确报错并提示先 `openvibe serve`（扫描强依赖服务端 DB，无离线模式）。

### FR-4 scan --project
1. 在 `<path>` 下探测规则文件：`.cursorrules`、`.cursor/rules/*.mdc`、`CLAUDE.md`、`AGENTS.md`（不递归 node_modules/.git）。
2. 逐个调 `POST /api/prompts/import`（推断规则同 m1 FR-6.3），按 title+contentHash 去重；输出「新增/跳过」清单。
3. `--skills --project` 可同时给；两者皆缺 → 报错给出用法。

### FR-5 diff
1. 读 `<project>/.openvibe/pack.lock.json`：无 lock → 提示未注入，退出码 1。
2. 逐文件比对磁盘 vs lock 期望哈希 → 报告 `clean / drifted(文件列表)`。
3. 在线时向服务端查询该项目登记包是否有更新导出版本 → 追加 `pack-outdated(当前@v → 最新@v)`；离线跳过该步。
4. 退出码：clean 且无新版本 = 0；drift 或 outdated = 2；错误 = 1。

### FR-6 clean（受管文件退场 · P1.1 加入，裁定 D19/D20）

1. **定位**：sync 的反向半边，补齐「零锁定」承诺。只处理 `<projectPath>/.openvibe/pack.lock.json` **当前登记且标 `managed: true`** 的条目；纯离线，不调服务端、不删服务端注入历史（注入过是事实，退场不抹账）。
2. **前置**：无 lock → 打印「未注入，无需退场」，退出码 1，零删除（与 FR-5.1 同口径）。lock **存在但读不懂**（不是 JSON / schema 不符 / `parsePackLock` 返回 null）→ 退出码 1、错误码 `LOCK_INVALID`、零删除零备份，提示「删掉它即承认这些文件归你所有，本命令不替你删」——**被改过的 lock 不能当删除依据**，这是 §6.6 信任根净化在读锁这一环的对称面（v1.3 补记：原规格只写了「无 lock」一支）。
3. **三态分类**（**判据与状态名直接沿用 FR-2.2 的磁盘 vs lock 期望哈希比对，不另造一套词**——同一谓词两个名字会让实现者去写第二个分类器，边界处理随即分叉；此处仅新增 `ABSENT` 一词）：
   | 态 | 条件 | 默认动作 |
   |------|------|----------|
   | `IN_SYNC` | lock 登记 **且 `managed === true`** 且 磁盘 sha256 == lock 期望（= 「确实由本次注入写下且未被改动」） | 备份后**删除** |
   | `DRIFT` | lock 登记 **且 `managed === true`** 但 磁盘 ≠ 期望（用户注入后改过） | **保留不删**并点名；仅 `--force` 时备份后删 |
   | `ABSENT` | lock 登记（`managed` 任意）但 磁盘已不存在 | 计入「已自行退场」，不动盘 |
   三态之外的一切文件一律记 `FOREIGN`，**永不删除**（§6.2 教条在此不放开）——含 `.openvibe/` 自身、用户自己的 `CLAUDE.md`、`managed !== true` 的登记项，以及**根本不在 lock 里的磁盘文件**（clean 只走 lock 登记项，未登记即不出现在 report 中，也就不会被删）。注意 v1.3 的口径修正：**换包后旧包独有文件不算这一类**——§6.10 规定 lock 合并、它们仍带 `managed` 位，因此按磁盘比对落进 `IN_SYNC`/`DRIFT`/`ABSENT`，而非 `FOREIGN`。
   > **`managed` 位是删除凭据的一部分，不是修饰词**（design §7.5）：`sync --target cursor` 这类过滤注入会把**未写入**的文件也登记期望哈希并标 `managed: false`。若 clean 只看「磁盘 == 期望」就删，就会把「用户自己的同名文件恰好与包内容逐字节相同」的文件当成我方产物删掉——那是删别人写的东西。`managed !== true` ⇒ 归 `FOREIGN`，验证见 §7.10 j。**注意 `managed` 只升不降**：它是「本次实写 ∪ 上次已受管」（`buildPackLock` 的 `managed` 一行，**行号不入正文**），一次 `--target` 重刷不会把此前全量 sync 写下的文件降级成 `managed:false`；`managed:false` 只出现在**首次**注入即被过滤掉的文件上，所以 §7.10 j 的构造是「用户自己先写同名同字节文件 + 首次即 `--target`」而不是「全量后重刷」。
4. **删除前一律备份**：`IN_SYNC` 与 `--force` 分支都先 `copyFileSync` 进 `<project>/.openvibe/backup/<UTC时间戳>/`（保留相对路径，同戳追加 `-n`，规则同 FR-2.5 与 §6.4）。理由：`IN_SYNC` 理论上可用 `sync` 重放，但包可能已被删除或改动，"可重放"不构成删除凭据——与 design §11「覆盖前强制备份」是同一条纪律。
5. **lock 与备份的去留**：退场成功后**删除 `pack.lock.json`**（它描述的注入已不存在，留着会让后续 `diff` 长期报全量缺失）；**保留 `.openvibe/` 目录与 `backup/`**（用户资产的回退凭据）。收尾提示「确认无误后可手工删除 `.openvibe/`」——只提示，不代删、不改 `.gitignore`（同 FR-2.6 口径）。**「退场成功」的判据是 `driftKept === 0`，不是「删过东西」**（v1.4 补，T3 审查引发；**2026-09-26 队列 ⑥ 复核改判 B 级**——它决定「一个盘上文件都没动的一轮要不要删 lock」，是用户可见的删盘口径，不是实现细节。owner 当场裁「留（含全 `FOREIGN` 也删 lock）」：全 `FOREIGN` 那一档里 lock 说这些文件归包管、盘上却是用户的内容，删 lock 等于对外承认「这些文件自此归你」，这个语义不该藏在一条 C 级登记里）：只要没有被我方保留下来的 `DRIFT` 文件，lock 描述的注入即已不成立，`pack.lock.json` 照删、`cleaned = true`、退出码 `0`——包括**全部登记项都已 `ABSENT`（用户自己删过文件）或全部为 `FOREIGN`（`managed !== true`）** 这种「一个盘上文件都没动」的情形。反例口径：若判据写成「本次 unlink 数 > 0」，用户手工删光注入文件后 `clean` 会永久停在「保留 lock」，`diff` 长报全量缺失且无任何命令能收尾，与 §6.3 `ABSENT` 行的「计入已自行退场」自相矛盾。走到 §6.9 早退（`NO_LOCK`/`LOCK_INVALID`/`PATH_ESCAPE`/`SYNC_BUSY`）与交互取消（§6.9 v1.4）**不**算退场成功，lock 原样保留。测试 `CLI-CLEAN-06b`（全 `ABSENT` ⇒ 照样删 lock）+ `CLI-CLEAN-06d`（全 `FOREIGN`、文件都在盘上 ⇒ 零 unlink 仍删 lock）；「取消/早退 ⇒ lock 原样保留」那一半由 `CLI-CLEAN-05b`/`05c` 钉。
6. **信任根净化**：clean 唯一的输入是 lock 文件，而 lock 可被手改，所以它是比 sync 更大的破坏面。删除前对每条 `files[].path` 走 design §7.7 路径净化：含 `..`、绝对路径、或 resolve 后逃出 `<projectPath>`（含符号链接）→ **整包拒绝**，退出码 1，报告违规项；不因单条违规而继续删其余条目（防「半退场」这种最难查的状态）。**两道闸的先后是口径的一部分**（v1.4 补；**2026-09-26 队列 ⑥ 复核改判 B 级**：两条闸的先后决定用户看到的是「报告含违规路径」还是只剩 `LOCK_INVALID`，属对外可见的输入拒绝口径）：路径净化必须**先于** `PackLockSchema` 的整机校验——`packPathSchema`（`packages/shared/src/schemas/pack.ts`，即 `isValidPackRelativePath`）会把带 `../evil.txt` 的 lock 直接判成 schema 不符，若先跑 schema 就只剩 §7.10 f2 的 `LOCK_INVALID`，§7.10 g 要的「报告含违规路径」永远出不来。故 `clean` 先以宽松方式读出 `files[].path` 字符串逐条净化（能读出对象就报得出违规项），再谈 schema；**非 JSON** 或路径合法但其它字段不符 ⇒ 才落 `LOCK_INVALID`。净化归 core（薄客户端，与 `checkPackInjectable` 同侧），不在 CLI 里再造一份弱化的路径判断。
7. **交互**：`--dry-run` 零写入零删除（不建 `.openvibe/`、不抢锁），只打印三态计划表；无 `--yes` 且 stdin 非 TTY → 退出码 1（FR-2.4 同规则）；`--yes` 只是确认**默认动作**，不升级为「全删」——要全删得同时给 `--force`。
8. **并发**：真删盘前抢同一把 `O_EXCL` `<projectPath>/.openvibe/sync.lock`，内容 `command` 字段写 `clean`，抢占/陈旧判定/接管/释放全部规则承 §6.9。这一条不是可选项：sync 正在写、clean 正在删会互吃对方的产物。
9. **退出码**：`0` 全清（无 `DRIFT` 残留）/ `2` 存在被保留的 `DRIFT` 文件（CI 需感知「没退干净」）/ `1` 错误（无 lock、路径非法、`SYNC_BUSY`、lock 净化失败、权限失败）。**交互取消同样走 `2`**（v1.4 补，B 级，T3 审查引发）：确认提示上答「不」或 Ctrl-C ⇒ 零改动、`summary.cleaned = false`、退出码 `2`。理由：`0` 的口径是「全清」，一次什么都没删的执行报 `0` 是假信号；`1` 的枚举里全是错误，而用户主动拒绝不是错误；`2` 正是「没退干净」这一既有语义，CI 侧无需新增分支。测试 `CLI-CLEAN-05b`（注入后答「不」的构造）与 `CLI-CLEAN-05c`（真走 `confirmWithClack`，含 accept / cancel 两条腿）。
10. **`--json` 契约**：`{ command:'clean', report:[{path,state,action,backupPath?}], summary:{inSyncRemoved,driftKept,driftForced,absent,backedUpTo,cleaned} }`（承 §5.1，`state` 取值即上表四词，脚本与测试依赖此形状）。**枚举的六个键是下限，不是闭集**（v1.5 补；**2026-09-26 队列 ⑥ 复核改判 B 级**：`summary.hints` 是 `--json` 新增的必带键，而键集合变化本身就是形状变化——原登记自述「一个附加键，不改任何既有键名与形状」，同一对括号里自我否定）：§5.1 的信封本来就给每条命令附加 `ok`/`exitCode`/`warnings`，`clean` 另加 `foreign`（§7.10 j 要求 FOREIGN 可见）与 `hints`。**「带得出理由」分两条轨，不必都塞进 `hints`**（v1.5 自纠，C 级）：退出码 `2` 有两条来路——「有 DRIFT 保留」的理由**已经**是枚举键 `driftKept`（数值即理由，机器读者不需要散文）；「交互取消」（v1.4 ①）在枚举键里**没有专属对应**（那一轮 `driftKept === 0` 且 `cleaned === false`）。**准确的说法不是「无从区分」**——按今天的分支集合，`exitCode 2 + driftKept 0 + cleaned false` 靠排除法确实唯一指向取消（「全清失败」那一腿走的是退出码 `0`，不撞）。但**排除法不是机器可读的理由**：它把结论押在「分支集合已封闭」这个前提上，多加第三条 `2` 的路径就当场失效。真正承重的是另外三条**理由只存在于 `hints`** 的腿：交互取消、`--dry-run`、陈旧锁接管（`clean` 与 `sync` 各一把锁、各一条文案）。**这三条各报什么字句不入契约**（v1.8 降契约，owner 裁「只要求给出理由，不锁字句」）：契约只要求「本轮没有动盘、而原因不在枚举键里」的情形必须在 `hints` 给出**可读理由**，接管那条还须指认被接管的是谁。**为什么降**：把原文钉进契约的代价实测过——2026-09-26 ⑥ 复核逐腿查保护面，dry-run 腿钉住关键短语（`零写入零删除`）、取消腿只钉三个字（`未删除`）、`clean` 的接管腿在 `apps/cli/test/clean.test.ts` 零命中（`sync` 侧同族文案由 `CLI-LOCK-02` 钉着），三腿保护不对称，而「锁字句」会让一次改措辞变成 B 级改动（可测性不是障碍：`--dry-run` 与接管两条都不需要 PTY）。**不得为了「对齐枚举」而删附加键。**人读轨 `printer.info` 在 JSON 轨是 no-op，不加 `hints` 这三条理由就地消失。**不得为了「对齐枚举」而删附加键。**

## 5. 输入 / 输出（约定）

1. 人读输出：表格 + 彩色状态；`--json` 输出 `{ command, plan[]/report[], summary }`（测试与脚本依赖此契约）。
2. 退出码：`0` 成功 / `1` 错误 / `2` 检测到漂移或冲突（diff 专用、sync 在 `--yes --strategy skip` 下遇 CONFLICT 也返回 2 以便 CI 感知）。
3. lock 文件与备份目录格式遵循 design.md §7.5。
4. **发布产物（`openvibe-cli` tarball）的文件集合**（v1.10 加入，owner 裁「SVG 进包 + 链接绝对化」，队列 ㉑(a)）：暂存目录由 `scripts/build-cli.ts` 组装、清单形状由 `publishManifest()` 决定——
   | 条目 | 来源 | 为什么必须在 |
   |------|------|--------------|
   | `dist/` | esbuild bundle + Web 产物 + seed + migrations | 命令本体与首启数据 |
   | `assets/readme/` | 仓库根 README 首屏引用的两张 SVG | 包内 `README.md` 与仓库根**同源**（本仓不另维护精简版），图不进包 ⇒ 装包方与 npm 页面第一屏就是死链 |
   | `README.md` / `LICENSE` / `package.json` | npm 无条件附带，不受 `files` 约束 | 许可与自述 |
   由此推出对 README 的一条硬约束：**它引用的每个相对路径都必须在包内解析得开**；仓库内文档（`CONTRIBUTING.md`、`DEV_LOG.md`）一律写 `https://github.com/anyeduke11/OpenVibe/blob/main/…` 绝对 URL。这条不是走查笔记——`tests/publish-manifest.test.ts` 的 `SCRIPT-PKG-05` 逐条解析 README 里的 `](./…)` 与 `src="./…"`，未解析集合非空即变红（`refs.length > 0` 那一条同时防住「正则失效导致的恒真通过」）。

## 6. 边界与异常（安全边界为本规格重心）

1. **路径安全**：manifest 中任何文件路径含 `..`、绝对路径或符号链接逃逸（resolve 后不在 `<projectPath>` 内）→ 整包拒绝执行退出码 1，报告违规项。
2. **绝不删除**：sync 永不删除 pack 之外的项目文件；pack 更新后消失的旧文件 sync 不清理（P1 `update` 向导处理），lock 保留其哈希备查。「不清理」只约束 sync——**这些旧文件仍是 `managed` 登记项，`clean` 会把它们一并退场**（见 §6.10 与 FR-6.1）。
3. 单文件 > 512KB 或包总解压内容 > 2MB → 拒绝执行（与 m6a §6.4 呼应，双保险）。
4. 备份目录已存在同时戳 → 追加 `-1`、`-2` 后缀，不覆盖已有备份。
5. 写文件失败（磁盘满/权限）→ 中止后续写入，打印已完成清单与回滚提示（从备份恢复的手工指引）；已写文件保留（幂等重跑可收敛）。
6. token 无效/服务端 401 → 提示 `openvibe serve` 重新生成或检查 config；不重试超过 2 次。
7. bundle schemaVersion 不兼容（> 当前支持）→ 拒绝并提示升级 CLI。
8. `<projectPath>` 不是目录 / 是文件 → 退出码 1。
9. **并发互斥（T8e，2026-09-23 补）**：真写盘前以 `O_EXCL`（`flag: 'wx'`）原子新建 `<projectPath>/.openvibe/sync.lock`，内容 `{pid, startedAt, command}`，权限 0600。抢不到即让路：退出码 1、错误码 `SYNC_BUSY`（CLI 本地标签，不进冻结的 `ERROR_CODES`）、零写入零备份、也不在拒绝前留下 `.openvibe/`。绝不排队等待——前一个 sync 可能正卡在交互确认上。陈旧判定：持有者 pid 已判死（`kill(pid,0)`，`EPERM` 算活）或 `startedAt` 距今 > 5 分钟（内容读不懂时按文件 mtime 判），命中则接管（内容读得出主人时，在 `summary.hints` 里报出其 pid / 命令 / 起时）。**0 字节空窗（v1.7 补，C 级）**：`wx` 的 `open` 与写内容之间，锁文件会以 **0 字节**对并发读者可见，此时「文件在、内容解析不出」有两种成因——写家还差一瞬，或内容真坏了。实现必须对这一情形做**有界重读**（上限 `SYNC_LOCK_REREAD_LIMIT`）把空窗让过去，让 §7.9 c 那句「让路方报出赢家 pid」成立；重读中途文件消失 ⇒ 判「此处无锁」转去新建，不得掉进 `unreadable`（那会把一个没人在跑的目录谎报成有人在跑）。**上限存在的理由是坏文件不能把调用方挂在自旋里**：真损坏的内容仍按 mtime 判、并在上限处收口成 `unreadable`。**这一重读不算上面那条「绝不排队等待」的违例**：它不等锁释放（抢到/让路的结论与时刻都不变），只把「谁持着锁」看清，上限是常数级次数、量级为微秒到几毫秒，与「前一个 sync 卡在交互确认上」那种等待不同量级。`--dry-run` 不抢锁也不被挡。释放走 `finally` + SIGINT/SIGTERM 处理器，且只删自己那一把（内容与 `{pid,startedAt}` 逐字段相符），因此接管发生后前任伤不到新锁。
10. **一项目一包（v1.2 显式化，收 §14-4 遗留项）**：`pack.lock.json` 是**单包结构**（design §7.5：一个 packName + 一个 version + 一份 files 映射），CLI 不支持同一项目叠加多包。再次 `sync --pack 另一包` 的语义是**换包**而非并包——lock 按 §6.2 同一机制**合并**：新包文件写入新哈希与 `managed` 位，旧包独有而新包不含的文件**仍在 lock 中备查**（含其原 `managed` 位，实现见 `packages/core/src/inject/lock.ts` 的 `buildPackLock` 旧条目留档循环；**行号不入正文**），新包不再写它们；`clean` 视其为登记项并一并退场——它们确实由我方写入且（`IN_SYNC` 时）未被改动，留着反而使「零锁定」不成立；用户已手工删过的记 `ABSENT`，不动磁盘。**v1.8 补**：这一条的**后果侧**此前无具名回归（留档侧有 `UT-INJECT-LOCK-03` + `CLI-SYNC-05c`，两支都只断言「旧条目还在 lock 里」），现由 `CLI-CLEAN-13` 钉住「换包后 `clean` 真把旧包独有文件删掉且逐字节备份」；owner 裁「留」。**这条口径原注释只说了一半**（`sync` 侧「不清理」），已补成「`sync` 不清理、`clean` 退场」。多包叠加需 lock 结构升版，属 A 级契约变更，排 P2。**措辞修正记录（v1.3，C 级）**：原句「lock 整体重写为新包内容，旧包独有文件自此脱离登记……属不清理项（用户手工处置）」与实现相反，2026-09-24 T10 开工前按实况改写；`update` 向导仍属未来项。
11. **写侧的「只动这一个目录项」保证（v1.9 补，B 级，owner 裁「替换式写入，不拒绝」）**：§6.1 的路径安全全靠**解析侧**的三道闸——`isValidPackRelativePath`（语法）→ `checkPackInjectable`（整包）→ `checkWritePath`（逐写：realpath 归一 + `lstat.isSymbolicLink()`），而**硬链接不是 reparse point**：realpath 原样返回该目录项，lstat 说它是普通文件，三道闸一道都看不出它「还挂在别处」。解析放行之后 `writeFileSync` 打开的是那个 **inode 本身**，包内容于是出现在项目外的另一条路径上——「只动项目内」这句对外承诺当场破功。`mklink /H`（NTFS）与 `link()`（APFS/ext4）都**免特权**，`cp -al` 迁移、物化快照、pnpm store 的硬链接安装都会天然产出这个形状，所以它是三平台硬要求下**最现实**的穿透形状，不是 POSIX 边角。
    - **处置：解链后新建，而不是拒绝整包。** 落盘前对目标 `lstat`，`isSymbolicLink()` 或 `isFile() && nlink > 1` ⇒ 先 `unlinkSync` 解掉**这一个目录项**，再按新内容新建（`cp --remove-destination` 语义；实现是 `packages/core/src/inject/atomic-write.ts` 的 `writeReplacingLinks`，sync 的两个落盘写点——包文件与 `pack.lock.json`——都走它）。**为什么不拒绝**：为一个合法的日常磁盘形状整包拒收，等于把 `cp -al` 出来的项目永久挡在注入之外，而用户从中拿不到任何保护；解链只让**本次写入**落到新 inode，链外那份一字未动。**代价要写进契约**：目标的 inode 换了，注入前就持有旧句柄的进程（常驻 `tail`、某些编辑器缓冲）看不到新内容——git 与常规编辑器不受影响；这是替换式写入的固有语义，不是缺陷。**不得静默**：本轮解过链的条目必须在 `summary.hints` 点名（条数 + 具体路径 + 链外那份未动），理由与 FR-6.10 的 hints 条同源——那次是「没动盘而原因不在枚举键里」，这次是「动了盘而方式与用户以为的不同」；**具体字句不入契约**（承 v1.8 的降契约口径）。
    - **a. `clean` 的删除循环节刻意不接本助手**：它走 `unlinkSync`，语义本来就是「只解这一个目录项」，而内容在删除前已进备份（FR-6.4）。若改成「发现 `nlink > 1` 就中止」，恰好在 `cp -al` 造出来的项目上永久退不出场——那是要治的形状，不是要躲的形状。故 §7.11 c 给的是**正向断言**（链外那份在 `clean` 之后仍在且 `nlink` 归 1），不是行为变更。
    - **b. `config.json` 的 0600 写刻意不接本助手**：`apps/cli/src/config.ts` 的 `writeConfigFile` 写的是 `~/.openvibe/config.json`，与项目目录无关；能在那个目录里植一条指向外部文件的硬链接的人，已经拥有这个 home，替换式写在这里不增加任何保护，反倒会静默打断用户自己建的链接。`sync.lock` 结构上写穿不了：§6.9 的 `flag: 'wx'` 只在路径**不存在**时创建成功，存在即让路。
    - **c. 本轮没管的第三处（登记，不是遗漏）**：备份写入本身（`copyFileSync` 进 `.openvibe/backup/<ts>/…`）走的是普通覆盖写，因此「目标已存在且挂着额外链接」这一形状在备份落点上依然成立。它的暴露面比注入侧小得多：`uniqueBackupRoot` 保证同戳不覆盖（§6.4 的 `-1`/`-2` 后缀），要命中就得**预先**在 `.openvibe/backup/<那一秒的 UTC 戳>/` 下按相对路径植好链——而能做到这一步的人已经能写项目内的 `.openvibe/`，那时 §6.6 的「lock 可被手改」是更大的破坏面。本轮不收口，也**没有**对应的测试腿；若下一轮要收，判据是同 §7.11 a（备份那份必须等于源文件的磁盘实况）。

## 7. 验收标准（pass/fail）

1. **三重保护逐项验证**：
   a. `sync --dry-run` 后目标目录所有文件 mtime 与 sha256 无任何变化，`.openvibe/` 未创建；
   b. 预置非受管 `CLAUDE.md`（内容不同）→ sync 交互默认路径执行后：原文件可在 `.openvibe/backup/<ts>/CLAUDE.md` 找到且内容一致；
   c. 非 TTY + 无 `--yes` → 退出码 1 且零写入。
2. 注入后手改 `TERMS.md` → `diff` 报 drifted 且退出码 2；`sync` 对该文件走 DRIFT 分支，选「以包为准」后 `diff` 恢复 clean。
3. `--file` 离线 bundle 在断开服务端的情况下完成注入（lock 写入，上报缺失仅警告）。
4. 篡改 bundle 内某文件内容（fingerprint 校验失败）→ 退出码 1 零写入。
5. 构造恶意 manifest（文件路径 `../evil.txt`）→ 整包拒绝，报告含违规路径，`../evil.txt` 不存在。
6. `scan --project` 对含 `.cursorrules` 与 `CLAUDE.md` 的目录：首次新增 2 条提示词，重跑全部 skipped。
7. `--json` 输出可被 `jq` 解析且 plan 数组含全部五类状态字段（测试夹具覆盖）。
8. `serve` 首启 → `~/.openvibe/config.json` 权限为 0600，二次启动不重复播种（terms 计数不变）。
9. **并发互斥逐项验证（T8e，2026-09-23 补）**：真子进程跑，不靠注入假 pid（`apps/cli/test/sync-lock.test.ts` + `helpers/sync-lock-holder.ts`，三平台 CI）。
   a. 另一进程持锁时 `sync --yes` → 退出码 1、`summary.error.code = SYNC_BUSY`、错误文案点得出持有者 pid 与命令，整棵项目树快照（含 mtime/sha256/权限位）与执行前逐字节一致，锁文件内容未被改写；持锁者正常收工后重跑即成功。
   b. 持锁者被 SIGKILL（锁作为残留留在盘上，`startedAt` 远未过 5 分钟）→ 下一次 `sync` 按 pid 判死接管、`summary.hints` 报出接管了谁的锁、写完包并留下 `pack.lock.json`，结束时 `sync.lock` 已消失。
   c. 六个进程同时抢同一项目 → 恰好 1 个抢到，5 个让路且报出赢家 pid，磁盘上只有一把锁。（**v1.7 补口径**：这一支在 2026-09-26 之前实测有约 7% 的波次**做不到**「报出赢家 pid」——让路方落在写家的 0 字节空窗里，报成 `BUSY unreadable -1`。规格口径本身没动，是实现对齐规格；机理与有界重读的处置见 §6.9 的「0 字节空窗」条，否证探针与前后测数入库在 `docs/devlog-evidence/DEV-0035/`，单测 `SL-13`/`SL-14`。）
   d. 持锁期间 `sync --dry-run` → 退出码 0、计划照算、零写入且不碰他人的锁。
10. **clean 逐项验证（P1.1，测试段 `apps/cli/test/clean.test.ts`；**此处不抄具名上界与支数**——两个数每加一支就腐烂：v1.2 写的「测试段 `CLI-CLEAN-01..10`」与 2026-09-26 上午同一格写的「`CLI-CLEAN-12b`、现测 29 支」都在**当天**被下一支测动作废（承 §13-8 数字单源）。复算：`grep -oE 'CLI-CLEAN-[0-9]+[a-z]?' apps/cli/test/clean.test.ts | sort -u | wc -l` + 临时项目目录，三平台 CI。下面 a–k 逐条按**行为**给出该腿的具名用例（2026-09-26 23:5x 队列 ⑥ 第三层复核补：本行原写 a–j，而 v1.8 已在下面补入 **k** 腿 ⇒ 单源自己的索引行落后于自己的枚举，属指针修正、无行为变化，故不另立版本段），具名不随加测变化）**：
    a. `sync` 注入后未改动 → `clean --yes`：lock 内全部文件从磁盘消失；`.openvibe/backup/<ts>/` 内可找到逐字节一致副本；`pack.lock.json` 已删；`.openvibe/` 目录本身仍在；`diff` 报「未注入」退出码 1；`clean` 退出码 0。
    b. 手改 `TERMS.md` 后 `clean --yes`：**该文件仍在盘上**且内容等于用户改后版本，退出码 2，`--json` 的 `summary.driftKept = 1` 且 report 点名它；其余受管文件照常删除。
    c. 同 b 加 `--force`：该文件被删，且其**用户改后内容**（不是包内版本）完整存于 `.openvibe/backup/<ts>/TERMS.md`。
    d. `clean --dry-run`：执行前后整棵项目树快照（路径 / mtime / sha256 / 权限位）逐字节一致，且未新建 `.openvibe/`。
    e. 非 TTY 无 `--yes` → 退出码 1、零删除。e2. 交互式确认上答「不」（或 Ctrl-C）→ 退出码 **2**、整棵项目树逐字节未变、`pack.lock.json` 仍在、未新建 `.openvibe/backup/`（FR-6.9 v1.4 补；测试 `CLI-CLEAN-05b` + `05c`）。e3. 全部登记项已 `ABSENT`（用户自己删过注入文件）→ 不动任何盘也**删 `pack.lock.json`**、`cleaned = true`、退出码 `0`、不建 `backup/`（FR-6.5 v1.4 补；测试 `CLI-CLEAN-06b`）。
    f. 无 lock 的目录 `clean` → 退出码 1、提示未注入、零删除。f2. lock 存在但内容非法（非 JSON 或 schema 不符）→ 退出码 1、`LOCK_INVALID`、**一个字节都不删**、不建 `backup/`（FR-6.2，v1.3 补；测试 `CLI-CLEAN-06c`）。**v1.6**：`files[].path` 同一路径重复登记**且凭据不一致**（`sha256` 或 `managed` 有差异）也落这一档；**逐字节同名**的重复条目不算非法，仍按「按条目计」口径处理（凭据见 FR-6 与 `apps/cli/src/commands/clean.ts` 的删除循环注释；测试 `UT-INJECT-LOCK-04` 冲突腿 + 同名腿，另一端由 `CLI-CLEAN-06f` 钉住）。
    g. 篡改 lock 使某条 `path` 为 `../evil.txt` → 整包拒绝退出码 1、报告含违规路径、`evil.txt` 不存在、项目树逐字节未变（**含同 lock 内的合法条目也不删**）。
    h. 另一进程持 `sync.lock` 时 `clean --yes` → `SYNC_BUSY`、退出码 1、零删除、他人的锁原样在。
    i. **可重放律**：`sync` → `clean --yes` → 再 `sync` → `diff` 退出码 0 / clean，证明退场不残留污染态。
    j. **`managed:false` 不构成删除凭据**（FR-6.3 的那道闸）：临时项目内**先由用户自己写入** `CLAUDE.md`，内容取自包内 `CLAUDE.md` 的逐字节（模拟 FR-6.3 括号的例子「用户自己的同名文件恰好与包内容逐字节相同」），随后**首次**注入即 `sync --target cursor`（lock 里 `CLAUDE.md` 期望哈希在、`managed:false`）→ `clean --yes` 后：`.cursor/rules/openvibe.mdc` 消失并进备份，**`CLAUDE.md` 逐字节原样留在盘上**、report 标 `FOREIGN`、退出码 0（无 DRIFT 残留），且备份目录内**不得出现 `CLAUDE.md`**。**构造变更记录（v1.3，C 级）**：原句是「先全量 `sync` 再 `sync --target cursor` 重刷 ⇒ `managed` 降为 `false`」，2026-09-24 T10 开工前实测不成立——`managed = 本次实写 ∪ 上次已受管`（`buildPackLock` 的 `managed` 一行，**行号不入正文**；刻意设计，理由见同文件 `buildPackLock` 的函数注释：按「本次是否写入」重算会让用户手改过的包内文件在下次全量 sync 时从 DRIFT 降级成 CONFLICT，属信息丢失），故已受管文件不会因一次 `--target` 而脱钩。判据（`managed:false` 不可删）不变，只改构造。
    k. **换包的后果侧（v1.8 补，B 级，队列 ⑥ R1，owner 裁「留，并补测试」）**：同一项目先 `sync --file 包A` 再 `sync --file 包B`（两包路径集必须有差集，否则夹具失效即被测出来）→ `pack.lock.json` 里 A 独有路径**仍在**且 `managed: true`，盘上内容仍是 A 渲染的那一份（换包的 `sync` 不重写它）；`clean --yes` 后 **A 独有与 B 的全部路径都从磁盘消失**、`inSyncRemoved` 等于 lock 条目数、`driftKept/foreign/absent` 均 0、`cleaned = true`、退出码 `0`、`pack.lock.json` 一并收尾，且备份目录内**每一份都等于删前的磁盘字节**（备份判据只能比「删前磁盘实况」：共用路径在换包时已被改写成 B 那一份，拿 A 的渲染结果比会假红）。测试 `CLI-CLEAN-13`。**变异反证（2026-09-26 实测）**：注释掉 `buildPackLock` 的旧条目留档循环 ⇒ 全量套件恰好红 3 支——本支 + `UT-INJECT-LOCK-03` + `CLI-SYNC-05c`，后两支只断言「旧条目还在 lock 里」，即这一档的**后果侧**在本支之前零覆盖。
11. **免特权链接形状逐项验证（v1.9 补，B 级，三平台 CI）**：这一档要能在一台**没有建链接特权**的 Windows runner 上跑，故全部用免特权形状（硬链接 / 目录 junction）。落点是下面逐条点名的那几份 v1.9 新测试文件；**测试侧零配置改动**（vitest 的 project 全是 glob include）。**支数不抄进正文**（承 §13-8 与上面第 10 条同一规矩），复算：`grep -oE 'UT-AW-[0-9]+' packages/core/src/inject/atomic-write.test.ts | sort -u` · `grep -c '^  it(' packages/core/src/inject/security-link.test.ts`（腿名挂在 describe `UT-INJECT-SEC-02L` 下，无独立编号） · `grep -oE 'CLI-(SEC|CLEAN)-[0-9]+[a-z0-9]*' apps/cli/test/inject-hardlink.test.ts | sort -u` · `grep -oE 'CLI-FACT-[0-9]+' apps/cli/test/win32-facts.test.ts | sort -u`。临时项目一律 `mkdtempSync(join(tmpdir(), 'ov-…-'))`——**不写死 `/tmp` 路径**，名字随机不重复（owner 硬约束）。
    a. **硬链接目标 → `sync` 照成功**（不是整包拒绝）：`CLAUDE.md` 预置成指向项目外文件的硬链接（`nlink === 2`）→ `sync --yes` 退出码 `0`、项目内那份变成包内容、`summary.hints` 点名 `CLAUDE.md` 与「解链后新建」、其余条目（`.cursor/rules/openvibe.mdc`）照写、`pack.lock.json` 照建；**链外那份逐字节未变且 `nlink` 归 1**。备份判据：`.openvibe/backup/<ts>/CLAUDE.md` **等于写前磁盘上那一份**（= 链外可见的内容）而不是包内容——判据写成「等于包内容」的话，实现备份什么都不红。测试 `CLI-SEC-01c`。
    b. **幂等 + 提示不外溢**：同一次注入后重跑 `sync --yes` ⇒ `writes` 为空数组、`backupRoot` 为 null、**hints 里不再出现解链那条**（解链只发生一次）、目标 `nlink === 1`。刻意**不**用「整棵树快照不变」断言：`pack.lock.json` 每轮都重写，mtime 必然变，那样断言会假红。测试 `CLI-SEC-01c2`；单元侧 `UT-AW-01..05` 钉最小分支（解链 / 普通覆盖 / NEW 首建 / 第二次不再解链 / 目标是一条目录 ⇒ **抛错**，`sync` 把它翻成 `WRITE_FAILED` 走 §6.5 的中止腿）。
    c. **`IN_SYNC` 的硬链接 → `clean` 只退场项目内那一项**：链外那份**仍在**且 `nlink` 归 1、report 标 `IN_SYNC`、`pack.lock.json` 一并收尾、备份逐字节等于删前磁盘实况——这是 §6.11 a「删除循环节刻意不改」的正向凭据，不是漏网点。**反面对照**：从链外那份改内容（同一个 inode ⇒ 项目内这份跟着变 `DRIFT`）→ `clean --yes` 保留不删、`summary.driftKept === 1`、两份都还是用户那一份。判据是**磁盘实况**而非「谁动的手」。测试 `CLI-CLEAN-06g` + `CLI-CLEAN-06g2`。
    d. **目录链接 → 整包拒绝**：`.cursor` 整条链接到项目外（win32 用 `junction`、其余平台用 `dir` symlink，两者对**目录**都免特权）⇒ 退出码 1、`escapingPaths` 点名 `.cursor/rules/openvibe.mdc`、**链外目录里一个文件都没多出**（`readdirSync` 为空）。core 侧同形状另两条：`checkWritePath` 直接返回 `{ok:false, reason:'ESCAPE'}` 且 `resolveWriteTarget` 为 null；链接埋在更深的**待创建**父目录（`.cursor/rules`）时，上溯到最近存在祖先照样判逃逸（§6.1 的真实形状，不是构出来的边角）。测试 `CLI-SEC-01d` + `UT-INJECT-SEC-02L` 的后两条腿。
    e. **机理前提必须可被推翻**：`UT-INJECT-SEC-02L` 第一条腿显式断言「硬链接目标在 `checkWritePath` 下返回 `{ok:true}`」——这正是 §6.11 的整个前提。将来谁把闸改成解析侧 `nlink > 1` 拒绝，这支当场变红，规格与实现的分叉被迫现形，而不是两边各自悄悄漂移（与 §13 的「恒真断言」清单一脉：能红的断言才算断言）。
    f. **诚实边界（本条不得被读成「win32 已验」）**：`it.skipIf(IS_WINDOWS)` 那一族**一支未删**（复算：`grep -rn 'skipIf(IS_WINDOWS)' apps packages | wc -l`），win32 的 skip 未验证面没有因本条缩小；本条只是把**免特权可造**的形状升成三平台都跑的正向断言。**文件符号链接**与**悬空符号链接**在 win32 仍是未验证面（建文件符号链接要特权或开发者模式）。win32 上 `stat.mode` 的真实语义、以及 `realpathSync` 是否穿透 junction，是两件**未实测的 runner 事实**，由 `apps/cli/test/win32-facts.test.ts` 以 `[win32-facts]` 前缀打日志取数（`gh run view <run-id> --log-tail` 读回）；该文件只在「解析结果确实落到项目外」时对 `ESCAPE` 下断言，解析不进就当场说明「本平台没有可测的逃逸形态」。**拿到那份 runner 日志之前，不得据本条宣称 win32 权限位或 junction 已验**（§7.8 的 0600 那一档在 win32 读的是 `stat.mode` 的 CRT 模拟值，绿了也不构成安全性质）。

## 8. 依赖

- 依赖：m6a（bundle/目录格式）、design.md §7 契约、packages/core 生成器与校验器（fingerprint/路径净化复用）。
- 被依赖：M5 注入状态（lock 文件）、m6a 注入历史（上报）。
