# SPEC · Slash 命令文件（N2 · Track N 第二站）

| 项       | 值                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模块     | 横切能力（平台命令面，非 PRD 3.2 的资产模块）——沿用「横切能力用功能名」命名法（dev-plan §0.4 第 5 条）                                                                                                                                    |
| 优先级   | **N2**（decisions ㊻ / `[DEV-0272]`，2026-11-14 owner 裁定「Track N 全做」：N1 探针 → **N2 slash 命令文件** → N3 hooks（A 级）→ N4 m11（A 级））。**N2 未被标 A 级**——A 级链只点名 N3/N4                                                  |
| 上游     | decisions ㊻（`[DEV-0272]`）· `docs/devlog-evidence/N1-probe/conclusions.md`（N1 三档能力位，本 spec 不依赖其差异化）· `docs/PRD-v0.2.6-v1.0-20261112.md` R-6（`commands`「项目级命令片段库」，**提议未排期**，本 spec 为其首个落地形态） |
| 下游设计 | `packages/shared/src/cli-commands.ts`（`CLI_COMMANDS` 单一真相源，13 条命令元数据）· `packages/shared/src/pack-contract.ts`（`PlannedFileOut` 产物形态）· `apps/cli/src/index.ts`（`buildProgram()` 命令注册）                            |
| 关联任务 | **N2 本轮新建任务行**（tasks.md）。按 dev-plan §0.4「No spec, no task」，本 spec 落地后在 tasks.md 登记 N2 任务行                                                                                                                         |
| 版本     | **v1.0（2026-11-15，纯新文件；本轮不改任何既有规格）**。实现路径已由 owner 裁定：**独立产物线，不触发 A 级链**（不修改 `design.md` §7/§8 冻结契约、不 `schemaVersion+1`、不改 golden 基线）                                               |

---

## 1. 目标与用户价值

Track N（新手 vibecoding 助手单轨）要把 OpenVibe 的能力以「对话内可触发」的形态交给新手。slash 命令（`/命令名`）是主流 AI 助手（Claude Code、CodeBuddy、Cursor 等）的原生交互入口：用户在对话里敲 `/ov-sync`，助手即按命令文件里写定的指引执行对应的 OpenVibe CLI 能力。

**N2 交付的是「slash 命令文件」这套独立产物**：为 OpenVibe 的每条 CLI 命令生成一个命令文件，作为用户可取用的对话入口。它的价值是：

1. **把 CLI 能力搬进对话**——新手不必离开助手去终端敲 `openvibe sync`，在对话里 `/ov-sync` 即可，对齐「能在浏览器/对话里一次做完」的硬要求。
2. **命令元数据单一出处**——每个 slash 命令文件的用途、参数、风险全部由 `CLI_COMMANDS`（shared，CLI 真相源）派生，**不另写一份快照**，从结构上杜绝「文档说的」与「CLI 实际做的」漂移。
3. **独立于标准包契约**——slash 命令文件是独立产物，不进标准包 manifest、不经 adapter 产出，与主规则文件（CLAUDE.md 等）并列但互不耦合。

## 2. 范围

| In（本 spec 覆盖）                                                                    | Out（明确不做，写明理由与去向）                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 为 `CLI_COMMANDS` 全部 13 条命令各生成一个 slash 命令文件（**完整集**，owner 已裁定） | 按六平台 adapter 分别生成不同形态的 slash 命令（**独立产物线，不碰 design §8**；平台差异化留待 N3/N4 或另裁） |
| slash 命令文件的生成器（纯函数、确定性输出，`packages/core/src/slash/`）              | 改 `CLI_COMMANDS` 的元数据（它是 CLI 真相源，本 spec 只读不写）                                               |
| CLI 子命令 `openvibe commands export [dir]`（导出 slash 命令文件集到指定目录）        | 把 slash 命令文件并入标准包 manifest 或 fingerprint（**独立产物，不进 manifest**，否则触发 A 级）             |
| slash 命令文件的生成测试（确定性 / 覆盖 / 元数据一致性）                              | hooks 集成（N3，A 级）· m11 L0/L1 分层加载（N4，A 级）——各为独立一站                                          |
| 在 tasks.md 登记 N2 任务行、更新 dev-plan/decisions/DEV_LOG                           | 命令的**执行引擎**（slash 命令文件只描述「怎么调 CLI」，实际执行仍走 CLI 本体，本 spec 不造执行器）           |

## 3. 设计

### 3.1 独立产物线（不触发 A 级的保证）

slash 命令文件**不通过 composer 的 `generated` 流产出、不进 `manifest.files`、不经 adapter 的 `plan()`**。它与标准包是两条平行的产物线：

- **不改 `design.md` §7**（标准包契约：manifest schema / 组合规则 / 产物格式）——slash 命令文件不进 manifest，§7.4「各产物文件格式」不扩。
- **不改 `design.md` §8**（adapter 清单）——adapter 仍只回答主规则文件写到哪，slash 命令文件不属 adapter。
- **不 `schemaVersion+1`、不改 golden 基线**——`tests/golden/` 的 pack 快照不受影响。
- **纯增量**：新增 shared 常量文件、core 生成器、CLI 子命令，不改动任何既有契约面。

理由：decisions ㊻ 只给 N3/N4 标了 A 级，N2 未标；owner 已裁定 N2 走独立产物线。把 slash 命令文件与标准包解耦，既符合该裁定，也避免「为一条新能力翻整个标准包契约」的重代价。

### 3.2 命令集（完整集）

覆盖 `CLI_COMMANDS`（`packages/shared/src/cli-commands.ts`）全部 13 条命令：`serve / sync / scan / skill / diff / verify / discuss / mcp / clean / ask / status / requirement / session`。

每条命令对应一个 slash 命令，命名统一前缀 `ov-`，避免与平台原生命令冲突：

| CLI 命令           | Slash 命令    | 说明                  |
| ------------------ | ------------- | --------------------- |
| `openvibe sync`    | `/ov-sync`    | 注入标准包            |
| `openvibe scan`    | `/ov-scan`    | 扫描 skill / 项目规则 |
| `openvibe verify`  | `/ov-verify`  | 三方一致性核验        |
| `openvibe diff`    | `/ov-diff`    | 比对产物与 lock       |
| `openvibe discuss` | `/ov-discuss` | 向 AI 问项目问题      |
| …（其余 8 条同理） | `/ov-<name>`  | 一一对应              |

**数据源单一出处**：命令名、usage、summary、flags、risk、writesDisk 全部从 `CLI_COMMANDS` 读取，生成器不复制任何字面量。`CLI_COMMANDS` 增删命令时，slash 命令集自动跟随——这是确定性与一致性的数学基础。

### 3.3 落点

- **产物目录**：`commands/`（独立产物根，非标准包内）。
- **文件命名**：`commands/ov-<command>.md`，每条命令一个文件。
- **导出**：`openvibe commands export [dir]`，`dir` 缺省为当前目录下的 `commands/`；导出时按文件路径码点序写入（确定性）。
- **用户取用**：用户可把导出的 `commands/ov-*.md` 按需放入所用助手的 commands 目录（如 Claude Code 的 `.claude/commands/`、CodeBuddy 的 `.codebuddy/commands/`），**平台差异由用户自选，本 spec 不强制**。

### 3.4 命令文件格式

每个 `ov-<command>.md` 由 frontmatter + 正文组成，内容全部由 `CLI_COMMANDS` 元数据渲染（确定性，同一输入 → 字节级相同）：

```markdown
---
slash: /ov-sync
cli: openvibe sync
risk: decision
writesDisk: true
---

# /ov-sync · openvibe sync <projectPath> [flags]

把标准包注入项目（三重保护：默认预览+确认，覆盖前自动备份）。

## 参数

| 旗标     | 取值               | 说明                                 |
| -------- | ------------------ | ------------------------------------ |
| `--pack` | `<name[@version]>` | 服务端标准包（缺省取该项目登记的包） |
| …        | …                  | …                                    |

## 示例

/ov-sync

## 风险

- risk: **decision**（改状态需人拍板或显式启动）
- writesDisk: **true**（写本机磁盘）
```

- **frontmatter**：`slash`（命令名）、`cli`（对应 CLI 前缀）、`risk`（三档闭集）、`writesDisk`（布尔）。值原样落盘，与 `renderFrontmatter` 同口径。
- **正文**：标题（slash 名 + CLI usage）→ 摘要（summary）→ 参数表（flags，无旗标则省略该节）→ 示例 → 风险。空节整体省略，保证确定性。

## 4. 验收标准

| 维度       | 验收                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 确定性     | `generateSlashCommands()` 同输入两次调用，产物字节级相同；导出目录内文件按路径码点序                                              |
| 覆盖       | 产物文件数 = `CLI_COMMANDS.length`（13），每条命令恰好一个 `commands/ov-<name>.md`；`CLI_COMMANDS` 增删命令时产物集自动跟随       |
| 一致性     | 每个命令文件的 `cli`/`risk`/`writesDisk`/参数表与 `CLI_COMMANDS` 对应条目逐字段一致（测试从 `CLI_COMMANDS` 反查产物，不另写快照） |
| 契约不动   | `design.md` §7/§8 零改动；`packages/adapters` 零改动；`tests/golden/` 的 pack 快照零改动；`SCHEMA_VERSION` 不变                   |
| CI 全绿    | lint / typecheck / unit / integration+cli / e2e / golden+seed:check+bundle:check 五闸全绿                                         |
| docs:check | `docs:check` error 0（本 spec 与 tasks/dev-plan/decisions/DEV_LOG 的版本行、引用自洽）                                            |

## 5. 实现落点

| 文件                                             | 作用                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/slash-contract.ts`（新）    | slash 命令文件契约：目录常量、前缀、文件名、frontmatter 类型、命名函数（与 `pack-contract.ts` 分离，明确独立产物线） |
| `packages/core/src/slash/generate.ts`（新）      | `generateSlashCommands()`：基于 `CLI_COMMANDS` 渲染命令文件集，返回 `PlannedFileOut[]`，确定性                       |
| `packages/core/src/slash/index.ts`（新）         | 导出生成器                                                                                                           |
| `packages/core/src/index.ts`（改，加导出）       | 导出 `generateSlashCommands`                                                                                         |
| `apps/cli/src/commands/commands.ts`（新）        | `commandsExportAction(dir)`：调生成器、写目录、返回产物清单（纯本地，不经服务端）                                    |
| `apps/cli/src/index.ts`（改，加命令组）          | 注册 `commands` 命令组 + `export` 子命令（接在 `session` 之后，`return program` 之前）                               |
| `packages/core/src/slash/generate.test.ts`（新） | 生成测试：确定性 / 覆盖 / 一致性                                                                                     |
| `apps/cli/test/commands.test.ts`（新，可选）     | CLI 子命令导出的落盘测试                                                                                             |

## 6. 已知代价与未对齐（如实登记）

- **平台差异化未做**：本 spec 产出**统一一套** slash 命令文件，不按六平台分别生成不同形态。平台差异化（如各平台 commands 目录路径、frontmatter 键差异）留待 N3/N4 或另裁——这是「独立产物线不触发 A 级」的直接代价。
- **执行器不在范围内**：slash 命令文件只描述「怎么调 CLI」，实际执行仍走 CLI 本体。助手如何把 `/ov-sync` 映射到执行 `openvibe sync`，属助手平台行为，本 spec 不造执行器。
- **`serve`/`mcp` 的语义**：`serve`（常驻服务）与 `mcp`（stdio 服务）作为 slash 命令语义上非一次性操作，本 spec 仍按完整集覆盖（用户可按需不取用），不为此裁剪命令集。
