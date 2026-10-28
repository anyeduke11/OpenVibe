# SPEC · v0.2.3 批次 E/F：AI 问答与生态（G4 · AN2 项目问答 + AN3 MCP 上下文服务）

| 项       | 值                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模块     | **v0.2.3 · 批次 E（问答）+ 批次 F（生态，可整体裁剪）/ 目标 G4**。对应 PRD `docs/PRD-v0.2.3-v1.0-20261024.md` 第 4 章的 AN2（项目问答：`ask` 保留 + `discuss` 并列新增）与 AN3（MCP 上下文服务）。提取闭环（AN1/AN4/AN5）在 `v023-d-ai-extract.md`                                                                                                                               |
| 优先级   | **P1（AI 线内）**。判级构成：FR-1/2/5/6 为 **B**，FR-3/4/7 为 **C**。逐项判级见 §4；一切判级均为预判，判级权在 owner（dev-plan §0.3）                                                                                                                                                                                                                                            |
| 上游     | `docs/PRD-v0.2.3-v1.0-20261024.md`（§4 AN2/AN3、§6 架构、§7 批次 E/F、§9 反例 8/9）· `docs/specs/m8-agent-bridge.md` FR-4（`openvibe ask` 确定性契约与 context API 的 `?fields=`/`?budget=` 纪律，**本 spec 的复用单源与不修订对象**）· `docs/specs/m8-agent-panel.md`（AgentPanel 三子块形制）· `apps/cli/src/commands/ask.ts`（`ASK_KEYWORDS` 七词闭集与 `askLines` 同源纪律） |
| 下游设计 | `GET /api/projects/:id/context`（fields 白名单 + budget 字符预算 + `truncated` 可见性——discuss 的上下文组装直接复用）· `docs/design.md` §11.5（遥测白名单，本 spec **不触碰**）· `packages/core/src/source-ai/`（provider/runner/redact 复用，同批次 D）· MCP（Model Context Protocol）stdio 形态——子进程 **无网络监听**，与「只听回环 + 关闭即零外联」根设定兼容                |
| 关联任务 | **无**（任务号待本 spec 裁定后在 tasks.md 另起）                                                                                                                                                                                                                                                                                                                                 |
| 版本     | **v1.0（2026-10-25）**。§8.2 三处全部裁定（③ 手写 MCP / ① `discuss` 命名 / ② 与提取共闸共行+预算独立）；批次 E（AN2 问答，[DEV-0146]）与批次 F（AN3 MCP，[DEV-0145]）均已落地——§7 验收全部有对应用例（DISC-01…06 / DISC-CLI-01…03 / DISC-W1…2 / MCP-01…07 / ask 19 支零回归）                                                                                                    |
| 采样     | 2026-10-24 本机工作树                                                                                                                                                                                                                                                                                                                                                            |

---

## 1. 目标与用户价值

- 提取闭环（批次 D）解决「沉淀」，本 spec 解决「查询」与「生态」：**问自己的项目**（AI 回答，逐段可追溯到 OpenVibe 管的数据）与**让任何 AI 助手用上你的标准**（MCP 把 context API 变成 Claude Code / Cursor / Zcode 的工具）。OpenVibe 的差异化不在通用智能，在**它独占项目的阶段/清单/标准/漂移事实**——本 spec 把这个独占面以两种方式开放：给人（discuss）与给 AI（MCP）。
- **净解锁**：① `openvibe discuss "<自由文本>"`——第一条 AI 问答命令，回答的每一段标注「基于哪段上下文」，预算不足如实声明 `truncated`；② AgentPanel 新增「问」块（与待确认回流、上下文预览并列）；③ `openvibe mcp`——stdio 只读三 tool，零网络监听。
- **纪律声明**：`openvibe ask` 七词闭集**一字不改**（FR-4.1.1 不修订）——它是给外部 agent 解析 stdout 用的，确定性是存在前提；discuss 是并列的人用通道，不混流。

## 2. 范围

| **In**                                                                                | **Out（明确不做，写明理由与去向）**                                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 服务端 discuss 端点：上下文组装（复用 context API 纪律）→ LLM → 逐段来源标注（FR-1）  | **多轮对话 / 对话历史持久化 / agent 规划**（PRD §3.2：单轮即算即走，上下文每次现组装，与「不做后台常驻」根设定一致） |
| CLI `openvibe discuss` 命令（FR-2）                                                   | **改 `openvibe ask` 任何语义**（七词闭集 + 确定性输出是外部 agent 的契约；`ASK_KEYWORDS` 一字不动）                  |
| AgentPanel「问」块（FR-3）                                                            | **通用聊天界面**（无历史侧栏、无会话管理、无插件）——回答落点就是面板一个块 + CLI stdout                              |
| MCP stdio 服务：`project_context` / `search_assets` / `pack_diff` 三只读 tool（FR-5） | **任何写端点经 MCP 暴露**（ingest/注入/删除全部不可达——MCP 是只读面，写通道仍是 M8 桥 + 人工确认）                   |
| `ai_discuss_call` 台账 kind（FR-6）                                                   | **MCP 离线模式**（首版不支持，登记发布说明——stdio 服务依赖本地 serve）                                               |
| —                                                                                     | **来源标注从 LLM 输出解析**——来源列表由服务端随回答返回，LLM 无权声明出处（红线 9）                                  |

## 3. 现状与实测基线（采样：2026-10-24）

| #   | 量                    | 现测值                                                                                                                                                      | 复算命令                                                                              |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | `ask` 契约            | `ASK_KEYWORDS` 七项（`status/next/checklist/assets/terms/playbook/logs`）；不接 LLM（FR-4.1.1）；自由文本抛 `AskError('UNKNOWN_QUERY')`                     | `sed -n '1,25p' apps/cli/src/commands/ask.ts`                                         |
| 2   | context API           | `GET /api/projects/:id/context`：`?fields=` 白名单（非法值 422 并列全段名）、`?budget=` 字符预算、按 `logs → assets → checklist` 顺序砍且每次写 `truncated` | `grep -n 'truncated\|budget' packages/core/src/services/contextService.ts \| head -4` |
| 3   | AgentPanel            | 三子块顺序写死：上下文预览 → 待确认回流 → 接入指引；`PendingIngestList` 纯文本渲染红线——「问」块作为第四子块并入时沿用同纪律                                | `sed -n '1,40p' apps/web/src/components/agent/AgentPanel.tsx`                         |
| 4   | `CLI_COMMANDS` 漂移闸 | 新增 CLI 命令必须登记单源（`cliCommands.api.test.ts` 断言集合相等）——`discuss` 与 `mcp` 都要走这道闸                                                        | `sed -n '99p' apps/server/test/cliCommands.api.test.ts`                               |
| 5   | provider/capability   | 复用批次 D 的同一套探测（`ready` 才渲染入口，不发网络请求探测）                                                                                             | `grep -n 'resolveProvider' packages/core/src/source-ai/provider-config.ts \| head -2` |
| 6   | diff 只读快照         | `pack_diff` tool 的数据源 = 既有 `diff` 只读比对（退出码 0 一致 / 2 漂移语义现成）                                                                          | `grep -n "command('diff'" apps/cli/src/index.ts`                                      |
| 7   | MCP 参考面            | 仓内**零 MCP 实现**（全仓 grep 0 命中）⇒ 三 tool 的 stdio JSON-RPC 形态是新写面，协议实现选择见 §8.2 待裁③                                                  | `grep -rn 'model context protocol\|mcp' packages apps --include='*.ts' -i \| wc -l`   |
| 8   | 测试基线              | 163 文件 / 2095 用例全绿                                                                                                                                    | `pnpm test`                                                                           |

## 4. 功能需求（FR）

### FR-1 服务端 discuss 端点（**B 级**）

1. `POST /api/projects/:id/discuss`，body：问题文本（长度上限对齐 ingest 单条纪律）+ 可选 `fields`/`budget`（透传 context API 白名单）+ 可选 `provider_id`。
2. 组装链：context 组装（**服务端现算，`truncated` 如实透出**）→ 正文过 `redactAbsolutePaths` → LLM → 返回 `{ answer_segments: [{text, source_ref}], sources: [...], truncated, usage }`。
3. **来源标注由服务端返回**：`sources` 是服务端实际组装的上下文段清单，`answer_segments[].source_ref` 指向其下标；服务端拒绝回答「组装范围之外」的问题（无法锚定即如实说「上下文不足以回答」——不编造）。
4. 同意：问答出网受批次 D 的逐项目同意面管辖（`ai_extract_consent` 同表同语义，问答复用同一 consent 行——**同为「本项目上下文出网」用途域，不另立表**；此点与 FR-7 提取共用，PRD §4 AN4 的口径）。

### FR-2 CLI `openvibe discuss`（**B 级**；命令名待裁）

1. 纯编排：HTTP 调 discuss 端点（CLI 从不直接开 DB——既有红线）；serve 不可达时人话提示（同 ask 形态）。
2. 输出：逐段渲染 + 来源下标标注 + `truncated` 提示；`--json` 单对象（三旗标纪律）。
3. 登记 `CLI_COMMANDS`（风险档位 `readonly`——本命令零写库零写盘）。

### FR-3 AgentPanel「问」块（**C 级 UI**）

1. 第四子块置于接入指引之前（顺序：上下文预览 → 待确认回流 → **问** → 接入指引）；provider 未 ready 或总闸关则不渲染（DL-08）。
2. 输入框 + 回答区：逐段渲染 + 来源下标徽标（点击展开对应上下文段）；`truncated` 徽标。
3. 纯文本渲染红线沿用（禁 `dangerouslySetInnerHTML`）；回答不落库，页面刷新即走（会话不持久化）。

### FR-4 问答只读断言（**B 级**）

discuss 前后**全部业务表逐字不变**（用例遍历既有表行数与内容哈希）；`local_events` 只增 `ai_discuss_call` 一类行。

### FR-5 MCP stdio 服务（**B 级**；批次 F，可整体裁剪）

1. `openvibe mcp`：stdio JSON-RPC（MCP 协议）子进程，**无网络监听**；三只读 tool：
   - `project_context(project_id, fields?, budget?)` → 转发 context API；
   - `search_assets(query, kind?)` → 转发既有 FTS/LIKE 搜索端点；
   - `pack_diff(project_dir)` → 复用 diff 只读比对，退出码语义 0/2 透出。
2. 全部转发到本地 serve 的 HTTP API（含 token 鉴权，config.json 既有通道）；serve 不可达 ⇒ tool 返回人话错误。
3. `CLI_COMMANDS` 登记 `mcp`（风险档位 `readonly`）。
4. 协议实现：优先官方 SDK，若依赖体量不可接受则手写最小 stdio JSON-RPC 子集（§8.2 待裁③）。

### FR-6 台账 kind `ai_discuss_call`（**B 级**）

与 `ai_extract_call` 同族形制：9 键白名单（键名同款）、出网才记、失败也记；与批次 D 的两个新 kind **同一笔迁移**（避免两次 CHECK 扩列迁移——三 kind 一次到位）。

### FR-7 出网清单与发布说明（**C 级**）

发布说明「AI 能力的出网清单」节回填：问答通道出网物 = 脱敏后的项目上下文段；同意来源、provider、预算口径逐项列出；README 隐私节同步增补（措辞级）。

## 5. 输入 / 输出

- **输入**：问题文本；项目上下文（服务端现算）；consent（与批次 D 共用行）；provider 配置。
- **输出**：逐段带来源的回答（Web 块 + CLI stdout + `--json`）；`ai_discuss_call` 台账行；MCP 三 tool 的 stdio 服务。

## 6. 边界与异常

- **红线 9（问答只读）**：discuss 与 MCP 全链路零写库零写盘；来源标注服务端返回不从 LLM 解析；「上下文不足以回答」是合法回答，不是失败。
- **`ask` 与 `discuss` 不混流**：确定性七词给 agent、AI 通道给人——两个入口、两种保证，文档与帮助文本分列；未来任何「给 ask 加 AI」的诉求引用本条拒绝。
- **MCP 是只读面**：写动作（ingest/注入/删除）不经 MCP 暴露；AI IDE 要写回走 M8 桥既有 pending 通道（那是产品决定，不是本 spec 范围）。
- **隐私事故即最高级回退**：问答出网超出同意范围 ⇒ 与批次 D 同款处置（整体关闭 + 事故登记 + 审计后重开）。
- **无网络监听**：MCP 子进程出现任何 `listen` 调用即违约（用例断言）。

## 7. 验收标准（pass/fail）

| #   | 条目           | 判据                                                                                                                                                                                                                                                    |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ask` 零回归   | 既有 ask 用例全绿零改动（并列不覆盖的回归证明）                                                                                                                                                                                                         |
| 2   | discuss 服务端 | 回答含逐段来源标注；伪造来源不可发生（来源列表服务端返回）；上下文不足 ⇒ 明示而非编造                                                                                                                                                                   |
| 3   | discuss 只读   | 前后业务表逐字不变；`local_events` 只增 `ai_discuss_call`                                                                                                                                                                                               |
| 4   | CLI discuss    | 登记 `CLI_COMMANDS` + 漂移闸绿；serve 不可达人话提示；`--json` 单对象                                                                                                                                                                                   |
| 5   | 问块 UI        | 未 ready 不渲染；纯文本渲染红线；`truncated` 徽标                                                                                                                                                                                                       |
| 6   | MCP            | ✅ 批次 F 已落地：握手 + 三 tool schema（MCP-01/02）；无写端点暴露（只 dispatch 三名 + 未知即拒，MCP-06）；无 `listen` 调用（MCP-05 静态断言）；serve 不可达人话含「先 openvibe serve」（MCP-04）；另补 EOF 干净退出（MCP-07）与 drift 修复（本地比对） |
| 7   | 台账           | `ai_discuss_call` 9 键白名单守卫；与 `ai_extract_call` 同笔迁移                                                                                                                                                                                         |
| 8   | 回归           | `pnpm test` 用例数只增不减；docs:check 全绿                                                                                                                                                                                                             |

## 8. 依赖

### 8.1 依赖

- **批次 D 出口**（provider/consent/预算/总闸四件就绪——问答复用同一套治理面，FR-1.4 共用 consent 行）。
- 批次 F 另需 serve API 稳定（context/搜索/diff 三端点既有，无新端点依赖）。

### 8.2 待裁（owner）——本 spec 三处

1. **CLI 命令名——已裁（2026-10-25）**：**`discuss`**。与 `ask`（确定性七词，给外部 agent）形成「问人 vs 问机」的语义对照，`ask-ai`/`chat` 易与聊天产品混淆（第 0 章定位边界拒绝读法）。
2. **共行口径——已裁（2026-10-25，按预判采纳）**：discuss 与提取**共用** `ai_extract_consent` 同一行与总闸 `aiExtractEnabled`（同属「本项目上下文出网」用途域）；清除一次清两通道（设置页文案已按此表述）。预算独立计数（kind 分开：`ai_extract_call` / `ai_discuss_call` 各自每日上限）——问答的高频特性不应挤占提取配额。
3. **MCP 协议实现——已裁（2026-10-24，批次 F 落地）**：**手写最小 stdio JSON-RPC 子集**（`apps/cli/src/commands/mcp.ts`：initialize / notifications/initialized / tools/list / tools/call 四方法 + -32700/-32601/-32602/-32603 错误码；stdin 逐行、stdout 单行协议流——config 警告只走 stderr）。依据：CLI 是单文件 bundle（5.1 MB），官方 SDK 依赖树会显著膨胀且 stdio transport 语义极小；回显客户端 protocolVersion 保兼容。

### 8.3 让位规则

批次 E 依赖 D 出口；批次 F **可整体裁剪**（交付后无 AI IDE 实际接入 ⇒ 移除，stdio 服务零常驻成本但维护面归零——PRD §9 反例 8）。批次 E/F 均不可挤占批次 A。
