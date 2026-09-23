# SPEC · M6b 标准包与注入 —— CLI 侧（serve / scan / sync / diff）

| 项 | 值 |
|------|------|
| 模块 | M6 CLI（`npx openvibe-cli`）——注入唯一物理通道（PRD 审查二 P0 修正） |
| 优先级 | P0 · MVP 硬依赖 |
| 上游 | PRD 3.2-M6、4.2、5.2（异常流）、8 章（关键依赖） |
| 下游设计 | design.md §7（契约）、§9（CLI 设计）、§11（安全） |
| 关联任务 | tasks.md T7 |
| 姊妹规格 | [m6-standard-pack.md](./m6-standard-pack.md)（Web 侧） |

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
| 冲突自动备份 + 注入登记（lock 文件 + 服务端上报） | |

## 3. 命令总览

| 命令 | 一句话 | 详见 |
|------|--------|------|
| `openvibe serve [--port 8787] [--open]` | 启动本地服务（API + Web UI），首启生成配置与令牌 | FR-1 |
| `openvibe scan [--skills] [--project <path>] [--roots <dir>...]` | 扫描 skill 目录 / 项目规则文件，登记进服务端 | FR-3/FR-4 |
| `openvibe sync <projectPath> [--pack name[@ver]] [--file bundle.json] [--dir <packDir>] [--dry-run] [--yes] [--strategy skip\|overwrite\|keep-local] [--target <adapter>...]` | 注入标准包 | FR-2 |
| `openvibe diff <projectPath>` | 漂移检测 + 新版本探测 | FR-5 |
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

## 5. 输入 / 输出（约定）

1. 人读输出：表格 + 彩色状态；`--json` 输出 `{ command, plan[]/report[], summary }`（测试与脚本依赖此契约）。
2. 退出码：`0` 成功 / `1` 错误 / `2` 检测到漂移或冲突（diff 专用、sync 在 `--yes --strategy skip` 下遇 CONFLICT 也返回 2 以便 CI 感知）。
3. lock 文件与备份目录格式遵循 design.md §7.5。

## 6. 边界与异常（安全边界为本规格重心）

1. **路径安全**：manifest 中任何文件路径含 `..`、绝对路径或符号链接逃逸（resolve 后不在 `<projectPath>` 内）→ 整包拒绝执行退出码 1，报告违规项。
2. **绝不删除**：sync 永不删除 pack 之外的项目文件；pack 更新后消失的旧文件 MVP 不清理（P1 `update` 向导处理），lock 保留其哈希备查。
3. 单文件 > 512KB 或包总解压内容 > 2MB → 拒绝执行（与 m6a §6.4 呼应，双保险）。
4. 备份目录已存在同时戳 → 追加 `-1`、`-2` 后缀，不覆盖已有备份。
5. 写文件失败（磁盘满/权限）→ 中止后续写入，打印已完成清单与回滚提示（从备份恢复的手工指引）；已写文件保留（幂等重跑可收敛）。
6. token 无效/服务端 401 → 提示 `openvibe serve` 重新生成或检查 config；不重试超过 2 次。
7. bundle schemaVersion 不兼容（> 当前支持）→ 拒绝并提示升级 CLI。
8. `<projectPath>` 不是目录 / 是文件 → 退出码 1。
9. **并发互斥（T8e，2026-09-23 补）**：真写盘前以 `O_EXCL`（`flag: 'wx'`）原子新建 `<projectPath>/.openvibe/sync.lock`，内容 `{pid, startedAt, command}`，权限 0600。抢不到即让路：退出码 1、错误码 `SYNC_BUSY`（CLI 本地标签，不进冻结的 `ERROR_CODES`）、零写入零备份、也不在拒绝前留下 `.openvibe/`。绝不排队等待——前一个 sync 可能正卡在交互确认上。陈旧判定：持有者 pid 已判死（`kill(pid,0)`，`EPERM` 算活）或 `startedAt` 距今 > 5 分钟（内容读不懂时按文件 mtime 判），命中则接管（内容读得出主人时，在 `summary.hints` 里报出其 pid / 命令 / 起时）。`--dry-run` 不抢锁也不被挡。释放走 `finally` + SIGINT/SIGTERM 处理器，且只删自己那一把（内容与 `{pid,startedAt}` 逐字段相符），因此接管发生后前任伤不到新锁。

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

## 8. 依赖

- 依赖：m6a（bundle/目录格式）、design.md §7 契约、packages/core 生成器与校验器（fingerprint/路径净化复用）。
- 被依赖：M5 注入状态（lock 文件）、m6a 注入历史（上报）。
