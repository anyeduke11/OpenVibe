# SPEC · M6b 标准包与注入 —— CLI 侧（serve / scan / sync / diff / clean）

| 项 | 值 |
|------|------|
| 模块 | M6 CLI（`npx openvibe-cli`）——注入唯一物理通道（PRD 审查二 P0 修正） |
| 优先级 | P0 · MVP 硬依赖 |
| 上游 | PRD 3.2-M6、4.2、5.2（异常流）、8 章（关键依赖） |
| 下游设计 | design.md §7（契约）、§9（CLI 设计）、§11（安全） |
| 关联任务 | tasks.md T7 · P1.1 追加 T10（见 dev-plan §15） |
| 姊妹规格 | [m6-standard-pack.md](./m6-standard-pack.md)（Web 侧） |
| 版本 | v1.0（2026-09-20 定稿，随 P0 门禁 G2/G3 冻结）→ v1.1（2026-09-23，T8e 并发 sync 锁新增 §6.9 与验收 §7.9，commit `eef8925`；**本行为 2026-09-23 补记，当时未按 §0.3 B 级流程登记**）→ v1.2（2026-09-23，P1.1 裁定 D19/D20：新增 FR-6 `clean`、命令总览行、§6.10 一项目一包边界、验收 §7.10 a–j。**同轮自审补闸**：`clean` 的删除凭据加了 `managed === true`（design §7.5 的 `--target` 过滤会把未写入文件也登记期望哈希），故验收多一支 **j**、测试段改为 `CLI-CLEAN-01..10`）→ v1.3（2026-09-24，T10 开工前规格/代码对撞自审，**无新增行为**，三条按实测修正：**①** §7.10 j 与 FR-6.3 括号的构造按实测改写——`managed` 是「本次实写 ∪ 上次已受管」且**只升不降**（`lock.ts:36`），「全量 sync 后 `--target` 重刷 ⇒ 降为 false」不成立，改为「用户自己先写逐字节同名文件 + 首次即 `--target`」；**②** §6.10 换包语义由「整体重写、旧包独有文件脱离登记」改为「合并、旧条目留档并仍由 `clean` 一并退场」（与 `lock.ts:39-41` 一致），§6.2 与 FR-6.3 表尾的「孤儿文件」措辞随之收口；**③** FR-6.2 与 §7.10 f2 补「lock 存在但读不懂 ⇒ `LOCK_INVALID`、零删除」口径（原规格只写了「无 lock」一支）。依 §0.3 属 C 级（实现细节/验收构造，不改冻结契约），`tests/golden/` 零改动） |

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
5. **写入与登记**：写文件（权限 0644）→ 备份受影响旧文件到 `<project>/.openvibe/backup/<UTC时间戳>/`（保留相对路径）→ 写/更新 `<project>/.openvibe/pack.lock.json`（包名@版本、指纹、逐文件 sha256）→ 上报服务端注入历史（离线模式跳过上报，仅警告）。
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
   > **`managed` 位是删除凭据的一部分，不是修饰词**（design §7.5）：`sync --target cursor` 这类过滤注入会把**未写入**的文件也登记期望哈希并标 `managed: false`。若 clean 只看「磁盘 == 期望」就删，就会把「用户自己的同名文件恰好与包内容逐字节相同」的文件当成我方产物删掉——那是删别人写的东西。`managed !== true` ⇒ 归 `FOREIGN`，验证见 §7.10 j。**注意 `managed` 只升不降**：它是「本次实写 ∪ 上次已受管」（`lock.ts:36`），一次 `--target` 重刷不会把此前全量 sync 写下的文件降级成 `managed:false`；`managed:false` 只出现在**首次**注入即被过滤掉的文件上，所以 §7.10 j 的构造是「用户自己先写同名同字节文件 + 首次即 `--target`」而不是「全量后重刷」。
4. **删除前一律备份**：`IN_SYNC` 与 `--force` 分支都先 `copyFileSync` 进 `<project>/.openvibe/backup/<UTC时间戳>/`（保留相对路径，同戳追加 `-n`，规则同 FR-2.5 与 §6.4）。理由：`IN_SYNC` 理论上可用 `sync` 重放，但包可能已被删除或改动，"可重放"不构成删除凭据——与 design §11「覆盖前强制备份」是同一条纪律。
5. **lock 与备份的去留**：退场成功后**删除 `pack.lock.json`**（它描述的注入已不存在，留着会让后续 `diff` 长期报全量缺失）；**保留 `.openvibe/` 目录与 `backup/`**（用户资产的回退凭据）。收尾提示「确认无误后可手工删除 `.openvibe/`」——只提示，不代删、不改 `.gitignore`（同 FR-2.6 口径）。
6. **信任根净化**：clean 唯一的输入是 lock 文件，而 lock 可被手改，所以它是比 sync 更大的破坏面。删除前对每条 `files[].path` 走 design §7.7 路径净化：含 `..`、绝对路径、或 resolve 后逃出 `<projectPath>`（含符号链接）→ **整包拒绝**，退出码 1，报告违规项；不因单条违规而继续删其余条目（防「半退场」这种最难查的状态）。
7. **交互**：`--dry-run` 零写入零删除（不建 `.openvibe/`、不抢锁），只打印三态计划表；无 `--yes` 且 stdin 非 TTY → 退出码 1（FR-2.4 同规则）；`--yes` 只是确认**默认动作**，不升级为「全删」——要全删得同时给 `--force`。
8. **并发**：真删盘前抢同一把 `O_EXCL` `<projectPath>/.openvibe/sync.lock`，内容 `command` 字段写 `clean`，抢占/陈旧判定/接管/释放全部规则承 §6.9。这一条不是可选项：sync 正在写、clean 正在删会互吃对方的产物。
9. **退出码**：`0` 全清（无 `DRIFT` 残留）/ `2` 存在被保留的 `DRIFT` 文件（CI 需感知「没退干净」）/ `1` 错误（无 lock、路径非法、`SYNC_BUSY`、lock 净化失败、权限失败）。
10. **`--json` 契约**：`{ command:'clean', report:[{path,state,action,backupPath?}], summary:{inSyncRemoved,driftKept,driftForced,absent,backedUpTo,cleaned} }`（承 §5.1，`state` 取值即上表四词，脚本与测试依赖此形状）。

## 5. 输入 / 输出（约定）

1. 人读输出：表格 + 彩色状态；`--json` 输出 `{ command, plan[]/report[], summary }`（测试与脚本依赖此契约）。
2. 退出码：`0` 成功 / `1` 错误 / `2` 检测到漂移或冲突（diff 专用、sync 在 `--yes --strategy skip` 下遇 CONFLICT 也返回 2 以便 CI 感知）。
3. lock 文件与备份目录格式遵循 design.md §7.5。

## 6. 边界与异常（安全边界为本规格重心）

1. **路径安全**：manifest 中任何文件路径含 `..`、绝对路径或符号链接逃逸（resolve 后不在 `<projectPath>` 内）→ 整包拒绝执行退出码 1，报告违规项。
2. **绝不删除**：sync 永不删除 pack 之外的项目文件；pack 更新后消失的旧文件 sync 不清理（P1 `update` 向导处理），lock 保留其哈希备查。「不清理」只约束 sync——**这些旧文件仍是 `managed` 登记项，`clean` 会把它们一并退场**（见 §6.10 与 FR-6.1）。
3. 单文件 > 512KB 或包总解压内容 > 2MB → 拒绝执行（与 m6a §6.4 呼应，双保险）。
4. 备份目录已存在同时戳 → 追加 `-1`、`-2` 后缀，不覆盖已有备份。
5. 写文件失败（磁盘满/权限）→ 中止后续写入，打印已完成清单与回滚提示（从备份恢复的手工指引）；已写文件保留（幂等重跑可收敛）。
6. token 无效/服务端 401 → 提示 `openvibe serve` 重新生成或检查 config；不重试超过 2 次。
7. bundle schemaVersion 不兼容（> 当前支持）→ 拒绝并提示升级 CLI。
8. `<projectPath>` 不是目录 / 是文件 → 退出码 1。
9. **并发互斥（T8e，2026-09-23 补）**：真写盘前以 `O_EXCL`（`flag: 'wx'`）原子新建 `<projectPath>/.openvibe/sync.lock`，内容 `{pid, startedAt, command}`，权限 0600。抢不到即让路：退出码 1、错误码 `SYNC_BUSY`（CLI 本地标签，不进冻结的 `ERROR_CODES`）、零写入零备份、也不在拒绝前留下 `.openvibe/`。绝不排队等待——前一个 sync 可能正卡在交互确认上。陈旧判定：持有者 pid 已判死（`kill(pid,0)`，`EPERM` 算活）或 `startedAt` 距今 > 5 分钟（内容读不懂时按文件 mtime 判），命中则接管（内容读得出主人时，在 `summary.hints` 里报出其 pid / 命令 / 起时）。`--dry-run` 不抢锁也不被挡。释放走 `finally` + SIGINT/SIGTERM 处理器，且只删自己那一把（内容与 `{pid,startedAt}` 逐字段相符），因此接管发生后前任伤不到新锁。
10. **一项目一包（v1.2 显式化，收 §14-4 遗留项）**：`pack.lock.json` 是**单包结构**（design §7.5：一个 packName + 一个 version + 一份 files 映射），CLI 不支持同一项目叠加多包。再次 `sync --pack 另一包` 的语义是**换包**而非并包——lock 按 §6.2 同一机制**合并**：新包文件写入新哈希与 `managed` 位，旧包独有而新包不含的文件**仍在 lock 中备查**（含其原 `managed` 位，实现见 `packages/core/src/inject/lock.ts:39-41`），新包不再写它们；`clean` 视其为登记项并一并退场——它们确实由我方写入且（`IN_SYNC` 时）未被改动，留着反而使「零锁定」不成立；用户已手工删过的记 `ABSENT`，不动磁盘。多包叠加需 lock 结构升版，属 A 级契约变更，排 P2。**措辞修正记录（v1.3，C 级）**：原句「lock 整体重写为新包内容，旧包独有文件自此脱离登记……属不清理项（用户手工处置）」与实现相反，2026-09-24 T10 开工前按实况改写；`update` 向导仍属未来项。

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
   c. 六个进程同时抢同一项目 → 恰好 1 个抢到，5 个让路且报出赢家 pid，磁盘上只有一把锁。
   d. 持锁期间 `sync --dry-run` → 退出码 0、计划照算、零写入且不碰他人的锁。
10. **clean 逐项验证（P1.1，测试段 `CLI-CLEAN-01..10`，`apps/cli/test/clean.test.ts` + 临时项目目录，三平台 CI）**：
    a. `sync` 注入后未改动 → `clean --yes`：lock 内全部文件从磁盘消失；`.openvibe/backup/<ts>/` 内可找到逐字节一致副本；`pack.lock.json` 已删；`.openvibe/` 目录本身仍在；`diff` 报「未注入」退出码 1；`clean` 退出码 0。
    b. 手改 `TERMS.md` 后 `clean --yes`：**该文件仍在盘上**且内容等于用户改后版本，退出码 2，`--json` 的 `summary.driftKept = 1` 且 report 点名它；其余受管文件照常删除。
    c. 同 b 加 `--force`：该文件被删，且其**用户改后内容**（不是包内版本）完整存于 `.openvibe/backup/<ts>/TERMS.md`。
    d. `clean --dry-run`：执行前后整棵项目树快照（路径 / mtime / sha256 / 权限位）逐字节一致，且未新建 `.openvibe/`。
    e. 非 TTY 无 `--yes` → 退出码 1、零删除。
    f. 无 lock 的目录 `clean` → 退出码 1、提示未注入、零删除。f2. lock 存在但内容非法（非 JSON 或 schema 不符）→ 退出码 1、`LOCK_INVALID`、**一个字节都不删**、不建 `backup/`（FR-6.2，v1.3 补；测试 `CLI-CLEAN-06c`）。
    g. 篡改 lock 使某条 `path` 为 `../evil.txt` → 整包拒绝退出码 1、报告含违规路径、`evil.txt` 不存在、项目树逐字节未变（**含同 lock 内的合法条目也不删**）。
    h. 另一进程持 `sync.lock` 时 `clean --yes` → `SYNC_BUSY`、退出码 1、零删除、他人的锁原样在。
    i. **可重放律**：`sync` → `clean --yes` → 再 `sync` → `diff` 退出码 0 / clean，证明退场不残留污染态。
    j. **`managed:false` 不构成删除凭据**（FR-6.3 的那道闸）：临时项目内**先由用户自己写入** `CLAUDE.md`，内容取自包内 `CLAUDE.md` 的逐字节（模拟 FR-6.3 括号的例子「用户自己的同名文件恰好与包内容逐字节相同」），随后**首次**注入即 `sync --target cursor`（lock 里 `CLAUDE.md` 期望哈希在、`managed:false`）→ `clean --yes` 后：`.cursor/rules/openvibe.mdc` 消失并进备份，**`CLAUDE.md` 逐字节原样留在盘上**、report 标 `FOREIGN`、退出码 0（无 DRIFT 残留），且备份目录内**不得出现 `CLAUDE.md`**。**构造变更记录（v1.3，C 级）**：原句是「先全量 `sync` 再 `sync --target cursor` 重刷 ⇒ `managed` 降为 `false`」，2026-09-24 T10 开工前实测不成立——`managed = 本次实写 ∪ 上次已受管`（`packages/core/src/inject/lock.ts:36`，刻意设计，理由见同文件 :19-25 注释：按「本次是否写入」重算会让用户手改过的包内文件在下次全量 sync 时从 DRIFT 降级成 CONFLICT，属信息丢失），故已受管文件不会因一次 `--target` 而脱钩。判据（`managed:false` 不可删）不变，只改构造。

## 8. 依赖

- 依赖：m6a（bundle/目录格式）、design.md §7 契约、packages/core 生成器与校验器（fingerprint/路径净化复用）。
- 被依赖：M5 注入状态（lock 文件）、m6a 注入历史（上报）。
