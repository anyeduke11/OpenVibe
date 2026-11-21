# 竞品分析：多 Agent 编排与中台（2026-11-19）

> 面向 OpenVibe（灵典）的**定位升级**竞品分析。目标：为「OpenVibe 不仅是新手 vibe coding 助手，更是多 Agent 中台——指挥国内外 AI agent 完成 vibecoding 任务」这一定位提供**功能设计层面**的客观、可落地依据。
> 数据口径：GitHub REST API 实查（Star / 最近提交 / 许可证 / 归档态），采集于 **2026-11-19**；README 与官方文档经 GitHub API / 网页读取。**未 clone 任何仓库、未执行任何抓取代码。**
> 方法：四条调研线并行——① 编排器赛道（指挥多个 coding agent 干活的工具）；② 被指挥对象（国内外 coding agent CLI 的可编程控制面）；③ 通用 Agent 中台框架与协议；④ **跨机联动（多电脑组网，owner 2026-11-19 追加的关键场景）**。

---

## 与既有竞品报告的关系

本仓已有两份竞品报告，本报告是第三份，三者分工如下：

| 报告                                                                                   | 覆盖赛道                                            | 回答的问题                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| [`competitive-analysis.md`](./competitive-analysis.md)（v1.0，2026-09-20）             | 14 项目四象限全景                                   | 「上下文标准化」品类长什么样                              |
| [`competitive-analysis-20261112.md`](./competitive-analysis-20261112.md)（2026-11-12） | 规则/技能同步分发 Top 5 深挖                        | 「分发」这个动作上谁做得最好                              |
| **本报告（2026-11-19）**                                                               | **多 Agent 编排器 + agent 可指挥面 + 中台框架协议** | 「指挥多个 agent 干活」这条新定位上，谁在做什么、空档在哪 |

2026-11-12 报告的筛选口径**刻意排除了**「纯 coding agent 与编排类项目」；本报告补的正是被排除的部分。两份合读 = 完整竞品地图：分发轴看 2026-11-12 报告，指挥轴看本报告。

**本报告同时修正了 2026-11-12 报告的多处过期事实**（旧报告是历史快照，不回改，修正写在这里）：

1. `sst/opencode` 判「停更」**已过期** —— 仓库 301 重定向到 `anomalyco/opencode`，v2 活跃开发（2026-11-19 当日有推送），npm 包名 `@opencode/cli`，228k★。
2. `block/goose` 已捐入 Linux 基金会旗下 Agentic AI Foundation（重定向到 `aaif-goose/goose`），活跃。
3. `parruda/claude-swarm` **原仓库已删除**（API 404 无重定向）。
4. 新增 2026 年爆发的重要玩家：gastown（18.8k★）、happy（24.7k★）、ruflo（原 claude-flow，82k★）、amux（562★，技术栈与 OpenVibe 最同构）、OpenHands Agent Canvas（93.8k★，转向多 agent 控制面）。

---

## 0. 结论速览

**一句话结论**：「指挥多个 coding agent 干活」的赛道 2025 年中爆发、2026 年进入**洗牌与分化期**——先发商业公司接连退出（Vibe Kanban 母公司关停、Plandex Cloud 关停、Conductor 卖身 Meta），开源侧出现新重量级玩家（gastown / happy / ruflo）。**全场竞品都在做「任务→隔离→并行→合并」的管道，没有一家做「规则/上下文的编译-注入-漂移回流」闭环**——编排管道已高度同质化，规则层闭环无人占据，这是 OpenVibe 中台定位的空档。

### 0.1 三个支撑结论的关键事实

| #   | 事实                                                                                                                                                                                                                                                                      | 证据                                                   | 对 OpenVibe 的含义                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| F1  | **编排管道同质化**：vibe-kanban / claude-squad / gastown / nimbalyst 全部收敛到「git worktree 隔离 + tmux/会话并行 + 看板聚合 + diff 评审」                                                                                                                               | 四项目逐项核（§2.1）                                   | 隔离与并行**不必自造**，git worktree 即事实标准；OpenVibe 编排层做薄                  |
| F2  | **规则层闭环无人做**：16 个编排项目中，零项目覆盖「规则编译→注入→漂移检测→回流修正」                                                                                                                                                                                      | 横向矩阵（§3），编排能力 ✅ 数与规则能力 ❌ 的全列反差 | OpenVibe 的核心资产（pack/diff/verify/回流）恰是竞品空白，**接入指挥链 = 差异化成立** |
| F3  | **可指挥面已就绪**：国内外 12 个 agent 中 5 个具备「headless + 结构化事件流 + 会话恢复 + hooks」完全无人值守三件套（Claude Code / Codex / Qwen Code / Kimi Code / MiniMax Code），且存在**最小公共协议**（单命令无头执行 + JSONL 事件 + 按 session id 续跑 + 退出码语义） | 12 agent × 9 问逐项核（§2.2）                          | OpenVibe 做统一指挥层**不需要等生态成熟**，adapter 契约可立即定义                     |

### 0.3 第四个支撑结论：跨机联动是真空，且不需要开端口

| #   | 事实                                                                                                                                                                                                                                          | 证据              | 对 OpenVibe 的含义                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| F4  | **跨机 coding agent 编排无独立品类**（七组关键词实搜零命中）；已有项目的跨机能力都是「共享工件面 + 各自轮询」（dsh-superagent 监听 GitHub/飞书、happy 走 relay、amux 走 Tailscale、gastown 走 DoltHub），**没有一家做「跨机规则一致性证明」** | 竞品 §2.4.1–2.4.2 | 跨机**不需要破「只听本地」**——共享工件面即可；且 OpenVibe 的**内容指纹**是现成的跨机同源证明工具 |

### 0.2 赛道格局速览（Top 项目表）

| #   | 项目                                               | Star   | 最近提交                 | 类型                                    | 与 OpenVibe 中台定位的关系                                             |
| --- | -------------------------------------------------- | ------ | ------------------------ | --------------------------------------- | ---------------------------------------------------------------------- |
| 1   | OpenHands/OpenHands（Agent Canvas）                | 93,767 | 2026-11-18               | 平台级 agent 控制中心                   | 最完整的控制中心范本；企业向，OpenVibe 的个人本地版对标                |
| 2   | ruvnet/ruflo（原 claude-flow）                     | 82,051 | 2026-11-18               | agent harness/swarm 框架                | 流量最大的 harness，重 agent 内编排；OpenVibe 走跨工具规则中台可差异化 |
| 3   | musistudio/claude-code-router（CCR）               | 38,230 | 2026-11-16               | 本地模型/账号网关                       | **正交互补**：它管模型路由，OpenVibe 管规则与漂移                      |
| 4   | BloopAI/vibe-kanban                                | 28,738 | 2026-11-15               | 编排看板（母公司 2026-04 关停，转社区） | 最直接对标，公司已退出——**真空期**                                     |
| 5   | slopus/happy                                       | 24,706 | 2026-11-18               | 多 harness 客户端 + E2E 加密移动端      | 入口层竞合；订阅复用话术与移动 HITL 值得参考                           |
| 6   | getAsterisk/claudia（**重定向至 winfunc/opcode**） | 22,454 | 2026-11-06               | Claude Code 专用 GUI                    | 单工具管理台天花板；其 CLAUDE.md 管理器与 OpenVibe 直接相关            |
| 7   | gastownhall/gastown                                | 18,834 | 2026-11-14               | 多 agent 工作区管理器（Go）             | 编排方法论最重；其 Refinery 合并门禁可与 OpenVibe verify 对位          |
| 8   | plandex-ai/plandex                                 | 15,923 | 2025-10-03（停滞 13 月） | 计划-执行引擎                           | 历史标杆，diff 沙箱设计可借鉴；已事实弃养                              |
| 9   | smtg-ai/claude-squad                               | 8,829  | 2026-11-13               | 终端多实例管理                          | 轻量工作台证明「多实例管理」一个二进制就够                             |
| 10  | omnara-ai/omnara                                   | 3,418  | 2026-11-18               | 托管 agent 平台（approvals API）        | 云端 API 型；approvals 一等公民设计是 HITL 标杆                        |
| 11  | nimbalyst/nimbalyst（原 Crystal）                  | 2,093  | 2026-11-18               | 可视化 agent 工作台                     | 红/绿 diff 逐条评审是全场最细的评审 UX                                 |
| 12  | yohey-w/multi-agent-shogun                         | 1,421  | 2026-08-06（边缘）       | tmux 层级指挥链（Shell）                | 作者 2026-08 公开解散 10-agent 编队——**重要反面证据**                  |
| 13  | SethGammon/Citadel                                 | 930    | 2026-11-12               | 仓库级治理插件                          | 证据体系（receipts）+ HITL 边界设计最佳                                |
| 14  | mixpeek/amux                                       | 562    | 2026-11-18               | **Rust+SQLite 本地优先控制面**          | **技术栈同构的最直接竞品**（本地优先 + 单二进制 + SQLite + tmux）      |

通用中台框架与协议线（AutoGen / CrewAI / LangGraph / MetaGPT / A2A / MCP 等）见 §2.3；被指挥对象 12 agent 九问见 §2.2；**跨机联动线见 §2.4**。

---

## 1. 筛选口径与候选池

### 1.1 筛选标准

| 标准           | 取值                                                     | 理由                                       |
| -------------- | -------------------------------------------------------- | ------------------------------------------ |
| 同类型（线一） | 指挥/编排多个 coding agent 的工具                        | 与 OpenVibe 中台定位同轴                   |
| 同类型（线三） | 通用 agent 平台/框架/协议/支撑层                         | 提供中台能力分层参照，不要求 coding 专用   |
| 活跃           | 近 3 个月有提交（边缘活跃如实标注）                      | 赛道迭代极快，半年前的形态判断已不可靠     |
| 体量           | Star ≥ 300 入深挖（协议/方法论项目与重要反面样本不受限） | 赛道年轻，500 门槛会漏掉 amux 这类同构竞品 |

### 1.2 候选池与落选说明（线一）

| 项目                                     | Star（API 实查） | 最近提交                | 判定                   | 说明                                                                                         |
| ---------------------------------------- | ---------------- | ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| parruda/claude-swarm                     | —                | —                       | ❌ 仓库已删            | API 404 无重定向；同名 affaan-m/claude-swarm（479★，2026-02 停滞）非同一项目                 |
| conductor.build                          | 闭源             | —                       | ❌ 闭源 + 被收购       | 官网页脚「Conductor from Meta © 2026 Meta」；macOS/iOS 应用 + Cloud microVM 沙箱，10 万+用户 |
| openclaw/openclaw                        | 394,759          | 2026-11-18              | ❌ 定位不符            | Star 赛道第一但为个人 AI 助理网关，非 coding 编排器                                          |
| eyaltoledano/claude-task-master          | 28,374           | 2026-04-28（停滞 7 月） | ❌ 停更（简析见 §2.1） | PRD→任务分解全场最强，但社区已实质停滞，并入 Hamster 商业品牌                                |
| stravu/crystal                           | 3,128            | 2026-02-26              | ❌ 已迁移              | README 自述「now Nimbalyst」，并入 nimbalyst 条目                                            |
| LiteLLM-Labs/litellm-agent-control-plane | 1,334            | 2026-10-24              | ❌ 不同层              | 统一 agent API/运行时网关，偏 runtime 调度                                                   |
| humanlayer/agentcontrolplane             | 527              | 2025-07-02              | ❌ 停更                | K8s 外环调度器，16 个月无提交                                                                |
| caura-ai/caura                           | 567              | 2026-11-18              | ➖ 相邻                | agent 舰队共享记忆层（MCP 原生），非编排器；对记忆层有参考价值                               |
| bocoboho/wardendeck                      | 100              | 2026-10-21              | ➖ 观察池              | 飞书/Lark + Claude Code 控制台（审批+审计+隔离），中文市场方向与 OpenVibe 相近               |
| LIUTod/scream-code                       | 141              | 2026-11-18              | ➖ 观察池              | 中文项目（零远程自治编队）                                                                   |
| kibitzsh/kibitz                          | 494              | 2026-10-02（边缘）      | ✅ 简析                | VS Code 扩展，实时监听多会话生成解说 feed + 定向派发——「监督面」最低成本实现                 |
| kingbootoshi/codex-orchestrator          | 361              | 2026-05-28              | ❌ 停更                | tmux 派发 Codex，6 个月无提交                                                                |
| yohey-w/kagemusha                        | 16               | 2026-11-15              | ➖ 方法论样本          | shogun 后继（判断回路治理），支撑 F-反面证据                                                 |
| trillion-labs/claude-code-orchestrator   | 22               | 2026-11-13              | ❌ 过小                | —                                                                                            |

---

## 2. 三线深挖

### 2.1 线一：多 agent 编排器/指挥台

#### 2.1.1 BloopAI/vibe-kanban —— 最直接对标，公司已退出（28,738★，Rust，Apache-2.0）

- **定位**：给 coding agent 的看板编排台——「用看板规划、给 agent 开工作区、审 diff、发 PR」。
- **重大状态**：README 顶部横幅宣布 sunsetting；母公司 bloop 于 **2026-04-10 关停**（理由「绝大多数用户免费、找不到商业模式」），转社区维护，远程服务（云看板/评论/组织）已移除，**全面转本地架构**，最新版含数据导出。仓库仍有社区提交。
- **核心模块**：看板 issues（建卡/排序/分配）· Workspaces（每 workspace = 独立分支 + 终端 + dev server）· diff 行内评论（反馈直接回传 agent）· 应用预览（内置浏览器 devtools/inspect/设备模拟）· 多 agent（Claude Code / Codex / Gemini CLI / Copilot / Amp / Cursor / OpenCode / Droid / CCR / **Qwen Code** 等 10+）· PR 流（AI 生成 PR 描述 → GitHub 评审 → 合并）。
- **编排细目**：任务分解 🟡（人工建卡）/ 并行 ✅ / 隔离 ✅（git worktree）/ 聚合 ✅ / 评审合并 ✅ / HITL ✅ / A2A ❌。
- **可借鉴**：diff 行内评论→agent 的评审-修正闭环；workspace 三件套；对国产 agent（Qwen/CCR）的支持思路。
- **可规避**：商业化失败样本——纯编排台收不到钱，价值锚必须放在规则资产与验证数据；其云依赖（PostHog/中继）是死因之一。

#### 2.1.2 gastownhall/gastown —— 编排方法论最重（18,834★，Go，MIT）

- **定位**：Steve Yegge 的多 agent 工作区管理器——Mayor 统领 / Polecats 干活 / Refinery 合并的「数字化小镇」。
- **核心模块**：Mayor（首席 AI 协调者）· Rig/Crew/Polecat（项目容器/人工区/持久身份 worker）· Hooks（worktree 持久化状态，崩溃可恢复）· Beads/Convoy（git 后端结构化工单 + 打包分发）· Molecules（TOML 公式→多步工作流，含 checkpoint）· Witness/Deacon/Dogs（三层看门狗：卡死检测→恢复→基建维护）· **Refinery**（每项目合并队列：批量 MR、验证门禁、**Bors 式二分合并**、失败隔离重派）· Escalation（P0-P2 分级上报）· Seance（`.events.jsonl` 会话考古）· Wasteland（经 DoltHub 跨机联邦）。
- **编排细目**：分解 ✅ / 并行 ✅（宣称稳定 20-30 agent，调度器限流防限额）/ 隔离 ✅ / 聚合 ✅ / **评审合并 ✅（全场最强）** / HITL ✅ / A2A ✅（mailbox/身份/交接 + 联邦）。
- **可借鉴**：①「合并前验证」做成自动化门禁队列——与 OpenVibe verify 天然同构，规则漂移检查可进同类门禁；② Beads 用 git 存工单（本地优先）；③ Seance 会话考古对回流有启发；④ 限额调度器。
- **可规避**：概念体系过重（Mayor/Rig/Polecat/Convoy/Molecule…学习曲线陡）；强制 Dolt+Go+tmux 全家桶；2025-12 创建，成熟度待观察。

#### 2.1.3 mixpeek/amux —— 技术栈最同构的直接竞品（562★，Rust，MIT + Commons Clause）⚠️ 重点盯防

- **定位**：「Run an AI engineering team」——本地优先 agent 控制面：Claude Code/Codex/Gemini CLI 并行干活，共享任务板，互发消息，限额到了自动等待。
- **核心模块**：共享任务板（**卡片认领是原子操作**——两 agent 不会抢同一活）· agent 互发消息（询问/交接/解除阻塞，无需人转达）· 限额恢复（usage limit 命中→挂起→重置自动续）· 调度与循环（`daily at 9am` / `every 15m` / 过夜节奏）· 移动+桌面（Tailscale HTTPS、iOS 原生 app、Dock badge）· agent 插件（Claude Code/Codex/Gemini 内 `/plugin install amux@amux` 反向 delegate/status）· amux Cloud（$39-129/mo）。
- **技术栈**：**单 Rust 二进制 + SQLite**（README 原文「Local-first: one Rust binary and SQLite on your own machine」）+ tmux；数据在 `~/.amux`。
- **编排细目**：分解 🟡 / 并行 ✅ / 隔离 🟡（tmux，非 worktree）/ 聚合 ✅ / 评审合并 🟡 / HITL ✅ / **A2A ✅（互发+交接）** / 跨 harness ✅（每 worker 可换 Claude/Codex/Gemini/OpenCode/Ollama）。
- **可借鉴**：①技术栈几乎同构且已验证「本地控制面+移动审批+限额恢复」可交付；②原子认领解决并发抢活；③通过 agent 侧插件让 Claude Code 反向委托给控制面（对 OpenVibe agent bridge 的反向集成参考）。
- **可规避**：不做规则/上下文层（无规则注入、无漂移检测概念——**这正是 OpenVibe 的差异化空档**）；crash 恢复不全（README 自述不会自动重启崩溃 agent）。

#### 2.1.4 slopus/happy —— 多 harness 入口层（24,706★，Swift/TS，MIT）

- **定位**：一个应用编排 Claude/Codex/Grok/Gemini——复用已付费订阅，端到端加密同步到手机，原生多人协同。
- **要点**：多 harness 会话（含 ACP 协议任意 agent）· 订阅复用（不新增账单）· E2E 加密移动端（iOS 4.9 分）· multiplayer 共同 watch/steer · CLI（`happy claude` / `happy codex`）。
- **编排细目**：分解 🟡 / 并行 ✅ / 隔离 🟡 / 聚合 ✅ / 评审合并 🟡 / **HITL ✅（手机实时 steer）** / A2A 🟡。
- **可借鉴**：「复用已有订阅」的话术直击成本痛点；E2E 加密中继 + 推送的架构（若 OpenVibe 将来做远程查看）；ACP 作为开放接入标准。
- **可规避**：多端+中继+推送工程复杂度极高；编排深度有限（更像多入口遥控器而非分解-合并编排器）。

#### 2.1.5 OpenHands/OpenHands —— 企业级控制中心范本（93,767★，TS/Python，MIT）

- **定位**：自托管「编码 agent 开发者控制中心」（产品名 Agent Canvas）——把 OpenHands/Claude Code/Codex/Gemini/Pi/OpenCode 或任何 ACP 兼容 agent 变成常驻工程团队。org 由 all-hands-ai 改名 OpenHands，重心从单体 agent 转向多 agent 控制面。
- **要点**：多 backend（本地/Docker/VM/企业设施/Cloud）· **ACP 接第三方 agent** · Automations（定时/webhook 触发工作流，如 GitHub issue 自动分解为任务、报告发 Slack）· 集成（Slack/GitHub/Linear/Notion/Datadog）· LLM Profiles（BYO 任意模型）· 前后端分离部署。
- **编排细目**：分解 ✅（automation 含 issue→任务分解）/ 并行 ✅ / 隔离 ✅（Docker/VM/microVM）/ 聚合 ✅ / 评审合并 🟡 / HITL ✅ / A2A 🟡。
- **可借鉴**：①ACP 成为其多 harness 接入标准——OpenVibe 支持国产 agent 也应定义等价协议层而非逐一硬编码；②automation = 触发器 × 工作流，规则分发可做成同类 automation；③分离部署。
- **可规避**：企业化导致个人上手重（npm+uv+多容器）；沙箱全开时 agent 拥有完整文件系统权限——本地优先定位必须给更严的默认权限边界。

#### 2.1.6 ruvnet/ruflo（原 claude-flow）—— 流量最大的 harness（82,051★，TypeScript，MIT）

- **定位**：「Agent 元 harness」——Claude Code/Codex 的执行层外壳，加 100+ 专业化 agent、swarm 协同、自学习记忆、跨机联邦。已由 claude-flow 改名 ruflo（API 重定向核实为同一项目）。
- **要点**：Swarm 编排 · 跨会话记忆（RuVector 本地向量检索）· MCP 服务器 · Console/TUI 三视图 · 跨机联邦 · Claude 插件市场官方目录上架（`/plugin install ruflo-core@ruflo`）。
- **编排细目**：分解 ✅ / 并行 ✅ / 隔离 🟡 / 聚合 ✅ / 评审合并 🟡 / HITL 🟡 / A2A ✅。
- **可借鉴**：「init 注入式安装」与 OpenVibe 规则注入同构（它写 agent/钩子/记忆，OpenVibe 写规则文件）；本地向量记忆（无 LLM 也可检索）可挂进 SQLite 库。
- **可规避**：宣传口径极重（meta-harness/neural/federation 概念堆叠），核心价值集中在 swarm+记忆；叙事应克制、以可验证功能为主。

#### 2.1.7 getAsterisk/claudia（现 opcode）—— 单工具管理台天花板（22,454★，Tauri 2，AGPL-3.0）

- **要点**：Claude Code 命令中心 GUI：直接读 `~/.claude/projects/` 浏览/恢复历史会话 · CC Agents（自定义 agent 库，后台执行）· 用量看板（成本/Token/模型/项目维度，可导出）· MCP 管理 · Timeline/Checkpoints（会话版本化/分支/fork/diff）· **CLAUDE.md 管理器**（扫描/编辑/预览项目内所有规则文件）。
- **可借鉴**：CLAUDE.md 管理器只管 Claude 一家的规则文件，OpenVibe 可做「全家桶版」；checkpoint+fork 会话树；用量成本分析是强刚需。
- **可规避**：绑定单一 agent 的天花板（正是它没扩散到多 harness 的原因）；AGPL；改名品牌混乱。

#### 2.1.8 musistudio/claude-code-router（CCR）—— 模型层编排，正交互补（38,230★，TypeScript，MIT）

- **定位**：本地模型网关与控制面——给所有 agent 一个稳定本地端点，背后统一管理 provider/模型/账号/路由/工具。描述已从「router」升级为「one local control plane for every AI agent」。
- **要点**：统一端点（Claude Code/Codex/Grok CLI/Kimi CLI/Kilo Code/OpenCode/Pi/ZCode/WorkBuddy 等）· 路由与容错（重试/凭据池/key 轮换/有序 fallback）· 能力融合（Fusion 视觉/web search/MCP 工具/ToolHub）· 观测（请求日志/命中路由/延迟/Token/成本/账号状态）· **国产生态最全**（Z.AI/Bailian/Kimi/ZCode/WorkBuddy）。
- **编排细目**：分解 ❌ / 并行 ❌（不管会话）/ 隔离 ❌ / 聚合 ✅（请求级）/ 评审合并 ❌ / HITL ❌ / A2A ❌——**它是「模型/账号层」编排，不是「任务层」编排**。
- **可借鉴**：与 OpenVibe **完全正交互补**（CCR 管每请求走哪个模型，OpenVibe 管每 agent 用哪套规则）→ 应做集成对象而非竞品；其国产 agent 适配清单是 6 adapter 之外扩展的现成参考。
- **可规避**：open_issues 高达 1,145——兼容性 bug 背债重；纯代理层无法感知任务语义。

#### 2.1.9 其余四项（紧凑）

- **smtg-ai/claude-squad**（8,829★，Go，AGPL-3.0）：一个终端窗口管理多个 AI 终端 agent，后台并行。隔离 ✅（git workspace + tmux）/ auto-yes 分级放开。借鉴：极致轻量证明编排层不应做重；规避：无结构化任务/规则沉淀，AGPL。
- **plandex-ai/plandex**（15,923★，Go，MIT，**停滞 13 月**）：计划-执行引擎，2M token 上下文；**累积 diff 评审沙箱**（改动与项目文件隔离，随时回滚）+ plan 级版本控制 + 可配置自治度。Cloud 版 2025-10-03 关停。借鉴：「改动先落沙箱、评审后才进项目」与 OpenVibe「规则变更先入库、验证后才注入」同构；规避：事实弃养。
- **omnara-ai/omnara**（3,418★，Go，Apache-2.0）：托管 agent 平台（Claude Managed Agents / OpenAI Agents API 的自托管替代）。**approvals 是 API 一等动词**（launch/input/event stream/approvals 并列）；agent.yaml 声明式配置；事件日志按 agent 落 Postgres。借鉴：把人工审批做成 API 动词——OpenVibe 的写队列若加审批门可照此建模；规避：平台化姿态重（org/project/API key/云控制台）。
- **nimbalyst/nimbalyst**（2,093★，TS，MIT）：可视化 agent 工作区。**红/绿 diff 逐条 accept/reject（全场最细评审 UX）**；并行会话每会话独立 worktree；MCP 工具结果渲染成可视化 widget；纯文件存储；iOS 伴侣（语音/滑 diff/排队任务）。借鉴：agent 与人编辑同一文件 + 渲染层 diff 评审；「一切皆纯文件」哲学。规避：7 种编辑器矩阵开发成本巨大。

#### 2.1.10 反面证据与监督面

- **yohey-w/multi-agent-shogun**（1,421★，Shell，边缘活跃）：武士军团隐喻的 tmux 层级指挥链（Shogun→Karo→7 Ashigaru+Gunshi），支持 7 种 agent。**关键事件（README 实查）**：作者 2026-08 宣布**解散自己的 10-agent 编队**，缩到单 agent，转向后继项目 kagemusha（判断回路：纠正→原则→长期规则）。**解读：「并行 agent 数量」不是价值，「判断与规则的沉淀」才是**——OpenVibe 的中台叙事应直面这条裂缝。
- **kibitzsh/kibitz**（494★，TS，边缘）：VS Code 扩展+CLI，实时监听多个 Claude/Codex 会话生成解说 feed，一个 composer 向任意会话派发 prompt（`/N <prompt>`）。「进度聚合」的最低成本实现；规避：只读观察层，无编排闭环。
- **SethGammon/Citadel**（930★，TS，MIT）：Claude Code+Codex 的开源操作层插件。**evidence 证据体系**（receipts/digests/doctor checks）+ 明确的「Needs You / Resume」人工边界（agent 只在平台强制信任或真实冲突时打断你）。借鉴：证据化治理（每次变更留 receipt）可嫁接到 verify 回流。

### 2.2 线二：被指挥对象——12 个 agent 的可指挥面（九问）

> 这一节回答：中台能指挥到什么程度。九问 = ① 非交互/无头模式 ② 结构化输出 ③ 会话恢复 ④ 生命周期钩子 ⑤ MCP client ⑥ 子代理/多 agent 原生机制 ⑦ 权限/沙箱档位 ⑧ 并行多实例 ⑨ 官方 SDK。

#### 2.2.1 仓库现状核查（全部 API 实查，2026-11-19）

| 对象                                           | 现状                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Claude Code（anthropics/claude-code，156k★）   | 活跃                                                                                                                      |
| Codex CLI（openai/codex，Rust，136k★）         | 活跃                                                                                                                      |
| Gemini CLI（google-gemini/gemini-cli，109k★）  | 活跃                                                                                                                      |
| Crush（charmbracelet/crush，29k★）             | 活跃                                                                                                                      |
| Goose                                          | **已搬家**：`block/goose` → `aaif-goose/goose`（捐入 Linux 基金会 AAIF），57k★，活跃                                      |
| OpenCode                                       | **已复活搬家**：`sst/opencode` → `anomalyco/opencode`，v2 活跃，228k★，npm `@opencode/cli`                                |
| Qwen Code（QwenLM/qwen-code，31k★）            | 活跃                                                                                                                      |
| **iFlow CLI（iflow-ai/iflow-cli）**            | **已死**：官方公告 **2026-04-17 停止服务**，仓库最后推送 2026-03-20。**不应再纳入中台指挥对象**                           |
| CodeBuddy Code（腾讯）                         | 无 GitHub 仓；npm `@tencent-ai/codebuddy-code`（v2.185.0，2026-11-17 更新），源码在腾讯 cnb.cool                          |
| Trae（字节）                                   | 双轨：`bytedance/trae-agent` 开源研究型 CLI（近停滞，2026-02 后无实质提交）；Trae 产品本体是 IDE，**无公开 headless CLI** |
| Kimi Code CLI（MoonshotAI/kimi-code，8k★）     | **已换代**：旧 `kimi-cli`（Python）归档，新仓 kimi-code（TypeScript）活跃                                                 |
| MiniMax Code（MiniMax-AI/minimax-code，2.3k★） | 活跃（`mcode`，2026-09 起源码开源）                                                                                       |

#### 2.2.2 九问总表

✅=官方文档/源码实证 ｜ 🟡=有但有条件 ｜ ❌=无 ｜ ⚠️=文档不足待真机验证

| 对象         | 1 非交互          | 2 结构化输出                           | 3 会话恢复                      | 4 钩子                       | 5 MCP client               | 6 子代理                                                          | 7 权限/沙箱档                      | 8 并行多实例                       | 9 SDK                                  |
| ------------ | ----------------- | -------------------------------------- | ------------------------------- | ---------------------------- | -------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ---------------------------------- | -------------------------------------- |
| Claude Code  | ✅ `claude -p`    | ✅ json/stream-json + `--json-schema`  | ✅ `--continue`/`--resume <id>` | ✅ 33 事件                   | ✅ stdio/http/sse/ws       | ✅ subagents（teams 仅 TUI）                                      | ✅ 6 档 + OS sandbox               | ✅ 按 session_id 独立              | ✅ TS+Python                           |
| Codex CLI    | ✅ `codex exec`   | ✅ `--json` JSONL + `--output-schema`  | ✅ `exec resume --last/<id>`    | ✅ 14 事件（协议层实证）     | ✅ stdio + streamable HTTP | ✅ 协议层 subagent/collab + message-board-mcp                     | ✅ 3 档 + execpolicy               | ✅ 无全局锁                        | ✅ TS+Python                           |
| Gemini CLI   | ✅ `-p`           | ✅ json/stream-json                    | ✅ `--resume latest/index/uuid` | ✅ 11 事件                   | ✅ stdio/SSE/HTTP          | ✅ subagents + **A2A 远程子代理**                                 | ✅ 4 档 + 容器/Seatbelt            | 🟡 `--worktree` 实验               | ❌（仅实验 ACP）                       |
| Crush        | ✅ `crush run`    | 🟡 仅文本 stdout                       | ✅ `-s <id>`/`-C`               | ✅ 13 事件（CC 兼容）        | ✅ stdio/http + channels   | ❌                                                                | ✅ `-y`/`-yy` + allow/deny         | 🟡 server 单实例多客户端           | 🟡 `crush server` OpenAPI              |
| Goose        | ✅ `goose run -t` | ✅ text/json/stream-json               | ✅ `--resume`/`--session-id`    | ✅ Open Plugins 规范         | ✅ + 自身可变 MCP server   | 🟡 经 recipes/MCP 组合                                            | ✅ `GOOSE_MODE=auto(默认)/approve` | ✅ scheduler + `goose serve`       | ✅ GDK + REST                          |
| OpenCode     | ✅ `opencode run` | ✅ `--format json`                     | ✅ `--continue`/`--session`     | ✅ 插件钩子                  | ✅ local/remote            | ✅ `mode: subagent` + 每 agent 权限                               | ✅ permissions 规则 + `--auto`     | ✅ `serve` 多客户端                | ✅ `@opencode-ai/sdk`                  |
| Qwen Code    | ✅ `qwen -p`      | ✅ json/stream-json + `--input-format` | ✅ `--continue`/`--resume`      | ✅ 工具前后/会话始末         | ✅                         | ✅✅ SubAgents + Teams + **Arena** + Workflows（均 experimental） | ✅ 5 档 + sandbox                  | ✅ `qwen daemon`（HTTP+SSE）       | ✅ TS+Python+Java                      |
| CodeBuddy    | ✅ `codebuddy -p` | ✅ text/json/stream-json               | ✅ `-c`/`-r <id>`               | ✅（细节 ⚠️）                | ✅ `mcp` 子命令            | ⚠️                                                                | ⚠️ 细节不足                        | ⚠️                                 | ✅ `@tencent-ai/agent-sdk`             |
| Trae agent   | ✅ `trae-cli run` | 🟡 仅 trajectory JSON                  | ❌                              | ❌                           | ❌                         | ❌                                                                | ❌                                 | ✅ 无状态可并发                    | ❌                                     |
| Kimi Code    | ✅ `kimi -p`      | ✅ stream-json（含 resume_hint）       | ✅ `-S <id>`/`-c`/`-r`          | ✅ 15 事件（可阻断）         | ✅ 对话式配置              | ✅ coder/explore/plan + Tower（实验）+ KAP 协议                   | ✅ 3 档 + deny 规则                | 🟡 会话占用报 exit 4               | ✅ `@moonshot-ai/kimi-agent-sdk` + ACP |
| MiniMax Code | ✅ `mcode exec`   | ✅ stream-json 双向                    | ✅ `--session <id>`             | ✅ **CC/Codex 双格式适配器** | ✅                         | ✅ SubagentStart/Stop                                             | ✅ 云分类器+本地规则+sandbox       | ✅ profile/`MINIMAX_DATA_DIR` 隔离 | ✅ `@minimax-ai/code-sdk`              |

#### 2.2.3 横向结论

**梯队判定**：

- **第一梯队（完全无人值守：无头 + 结构化输出 + hooks 三件套齐 + SDK）**：Claude Code（33 hooks，唯一扣分：agent teams 不进无头模式）、Codex CLI（天生为 CI 设计，工程化程度最高）、**Qwen Code（国内唯一全栈：五档审批 + sandbox + daemon + Teams/Arena/Workflows，experimental 部分待验证）**、**Kimi Code（15 hooks + Tower + KAP，控制面完整度直逼 Claude Code）**、**MiniMax Code（双格式 hooks 适配器，对中台最贴脸）**。
- **第二梯队（能无人跑，有短板）**：OpenCode（hooks 是插件代码形态，集成成本略高）、Goose（三件套齐但无原生 subagent，**默认 auto 模式等于裸奔，接中台必须显式管理**）、Gemini CLI（三件套齐 + 独有 A2A 远程子代理，但无官方 SDK）。
- **第三梯队（要人盯或能力残缺）**：Crush（无结构化输出，只能走其 OpenAPI server）、CodeBuddy（文档面齐全但细节不透明，真机验证后才能升梯队）、Trae（fire-and-forget 批处理器，无会话无钩子）、iFlow（已停服，除名）。

**最小公共协议（八对象交集）**：

1. 单命令无头执行；2. JSON 行级事件流；3. 按会话 ID 续跑；4. 退出码语义。
   建议 agent adapter 以这四件为**必选契约**，其余做能力协商（hooks 阻断 / sandbox 档位映射 / 原生 subagent 编排 = 探测到才启用）。

**旗标映射表（可直接进 adapter 配置）**：

| 契约                 | 映射                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| headless 旗标        | `-p`（claude/qwen/gemini/kimi/codebuddy）/ `exec`（codex/mcode）/ `run`（crush/goose/opencode）                                                 |
| resume 旗标          | `--resume <id>`（claude/qwen/gemini）/ `exec resume <id>`（codex）/ `-S <id>`（kimi）/ `--session <id>`（mcode/opencode）/ `-s <id>`（crush）   |
| JSON 事件流          | `stream-json` 同名四家（claude/qwen/kimi/mcode）/ `--json`（codex）/ `--output-format stream-json`（gemini/goose）/ `--format json`（opencode） |
| 统一事件 schema 蓝本 | Codex 的 `thread/turn/item` 三层 或 Kimi 的 `assistant/tool/meta` 三类（两者最简洁）                                                            |

**国内外差异四要点**：① 国际是「CLI 即产品」，国内头部（Qwen/Kimi/MiniMax/CodeBuddy）是账号订阅制 + 本地 CLI，无头场景支持 API key——中台要做**登录态托管**（每 agent 一份凭据目录）；② **编排野心倒挂**：国内 Qwen（daemon/Teams/Arena/钉钉飞书企微 Telegram IM channel）与 Kimi（Tower/KAP）的多 agent 原生能力比多数国际选手激进，国际的差异化在协议与沙箱工程化；③ 开放性分层：CodeBuddy 半开放（npm 可用源码不开放浏览）、Trae 产品本体不开放——按「黑盒+官方文档」设计，接口稳定性风险自担；④ **国内单点工具死亡率高（iFlow 一年停服）**：provider 注册表必须带健康检查 + 归档机制；国际项目也在搬家（goose/opencode 换 org），**owner/org 比仓库名更稳定**。

### 2.3 线三：通用 Agent 中台框架与协议 —— 中台能力分层清单

> 本节的交付物不是「谁更好」，而是**一张分层清单 + 一张取舍表**：一个像样的 Agent 中台应该有哪几层能力、每层谁做得最好、哪些层已有开放标准、单机本地优先形态该取哪几层。

#### 2.3.1 项目速览（Star / 最近提交 / 许可证均 API 实查，2026-11-19）

| 项目                                      | Star    | 最近提交                   | 许可证      | 补的是中台哪一层                          |
| ----------------------------------------- | ------- | -------------------------- | ----------- | ----------------------------------------- |
| langgenius/dify                           | 161,464 | 2026-11-19                 | NOASSERTION | 应用编排平台（可视化工作流 + RAG）        |
| Significant-Gravitas/AutoGPT              | 188,096 | 2026-11-19                 | NOASSERTION | 自治 agent 平台（平台侧，历史包袱重）     |
| anthropics/claude-code                    | 156,201 | 2026-11-19                 | NONE        | 单 agent 运行时（被指挥对象，非中台）     |
| modelcontextprotocol/servers              | 92,091  | 2026-11-18                 | NOASSERTION | 工具接入标准（MCP 官方 server 集）        |
| FoundationAgents/MetaGPT                  | 71,351  | **2026-01-21（停 10 月）** | MIT         | 多 agent 角色流水线（软件公司隐喻）       |
| mem0ai/mem0                               | 69,218  | 2026-11-18                 | Apache-2.0  | 记忆层                                    |
| crewAIInc/crewAI                          | 61,088  | 2026-11-19                 | MIT         | 角色化编排（crew/flow）                   |
| BerriAI/litellm                           | 63,513  | 2026-11-19                 | NOASSERTION | 模型网关（100+ LLM API）                  |
| OpenBMB/ChatDev                           | 34,807  | 2026-11-06                 | Apache-2.0  | 多 agent 协作开发（中文，多角色）         |
| langchain-ai/langgraph                    | 45,137  | 2026-11-19                 | MIT         | 状态图编排（durable execution）           |
| langfuse/langfuse                         | 37,612  | 2026-11-19                 | NOASSERTION | 观测与评测（AI 工程平台）                 |
| modelscope/agentscope                     | 36,263  | 2026-11-19                 | Apache-2.0  | agent 运行时 + 沙箱                       |
| openai/openai-agents-python               | 30,757  | 2026-11-19                 | MIT         | 轻量 handoff 编排（官方 SDK）             |
| mastra-ai/mastra                          | 29,624  | 2026-11-19                 | NOASSERTION | TypeScript agent 框架                     |
| promptfoo/promptfoo                       | 27,436  | 2026-11-18                 | MIT         | 评测与红队                                |
| a2aproject/A2A                            | 26,590  | 2026-11-18                 | Apache-2.0  | **agent 间通信标准**                      |
| agentskills/agentskills                   | 27,442  | 2026-11-04                 | Apache-2.0  | **技能格式标准 + 渐进式披露**             |
| letta-ai/letta                            | 25,483  | 2026-10-18                 | Apache-2.0  | 有状态 agent 运行时（记忆自管理）         |
| google/adk-python                         | 22,268  | 2026-11-19                 | Apache-2.0  | agent 开发工具包（code-first，评估+部署） |
| ag-ui-protocol/ag-ui                      | 20,482  | 2026-11-18                 | MIT         | **agent↔前端事件协议**                    |
| e2b-dev/E2B                               | 14,926  | 2026-11-18                 | Apache-2.0  | 沙箱执行环境                              |
| ag2ai/ag2                                 | 5,076   | 2026-11-19                 | Apache-2.0  | 对话式多 agent 编排（AutoGen 续脉）       |
| kyegomez/swarms                           | 7,389   | 2026-11-19                 | Apache-2.0  | 轻量 swarm 编排                           |
| agentclientprotocol/agent-client-protocol | 4,675   | 2026-11-18                 | Apache-2.0  | **编辑器↔agent 接入协议**                 |
| AgentOps-AI/agentops                      | 5,963   | **2026-06-25（停 5 月）**  | MIT         | agent 观测 SDK                            |

#### 2.3.2 中台能力分层清单（核心交付）

| 层                                | 关键能力点                                                                                      | 代表项目与实现方式                                                                                                                                                                                                                                                                                                             | 开放标准                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **L1 接入层**（我指挥谁）         | agent/编辑器注册与发现 · 能力声明与协商 · 协议适配 · 登录态与凭据托管 · 健康检查与归档          | `agentclientprotocol/registry`（ACP agent 注册表，465★）· `agentclientprotocol/agent-client-protocol`（4,675★，editor↔agent 协议）· `modelcontextprotocol/servers`（92k★，工具侧接入）                                                                                                                                         | **ACP**（编辑器↔agent）· **MCP**（agent↔工具）✅ 均有标准   |
| **L2 编排层**（怎么拆活）         | 任务分解 · DAG / 状态图 / swarm 三种编排范式 · 角色与交接（handoff）· 断点续跑 · 并发与限额调度 | `langgraph`（45k★，图状态 + durable execution，宕机恢复是其核心卖点）· `crewAI`（61k★，crew=角色组 / flow=确定性流程两条线）· `openai-agents-python`（30.7k★，最轻，handoff 为主）· `ag2`（5k★，对话式双 agent 协作）· `swarms`（7.4k★）· `MetaGPT`（71k★，SOP 式角色流水线，但已停更 10 月）· `ChatDev`（34.8k★，中文多角色） | ❌ **无统一编排标准**（各家范式互不兼容，这是最大的空档）   |
| **L3 上下文层**（agent 知道什么） | 规则/技能/记忆的装载 · 渐进式披露 · 上下文预算 · 资产来源标注 · **注入后漂移检测**              | `agentskills`（27.4k★，SKILL.md + 渐进式披露标准）· `mem0`（69k★，记忆层，可挂 SQLite 语义层）· `letta`（25.5k★，记忆自管理运行时）· `mastra`（29.6k★，TS 侧）· `agentscope`（36.3k★）                                                                                                                                         | **agentskills** ✅（技能格式）· ❌ 记忆层与漂移检测均无标准 |
| **L4 执行隔离层**（在哪跑）       | 容器 / microVM / 目录沙箱 · 文件系统与网络权限边界 · 会话与进程隔离 · worktree 级代码隔离       | `e2b-dev/E2B`（14.9k★，microVM 级沙箱）· `agentscope`（内置沙箱）· 各 coding agent 自带 sandbox 档位（Claude Code OS sandbox / Codex 3 档 / Qwen sandbox）· `gastown`/`vibe-kanban`（worktree 级）                                                                                                                             | ❌ 无标准（各家自建）                                       |
| **L5 观测层**（发生了什么）       | trace / span · token 与成本 · 工具调用链 · 会话事件流 · 脱敏与本地留存                          | `langfuse`（37.6k★，AI 工程平台 + 网关）· `AgentOps`（6k★，观测 SDK，但已停更 5 月）· `mastra`（内置 observability）                                                                                                                                                                                                           | ❌ 无标准（OTEL 语义近似可借用）                            |
| **L6 评测层**（好不好）           | prompt/agent/RAG 评测 · 回归集 · 红队 · 采纳率类指标                                            | `promptfoo`（27.4k★）· `google/adk-python`（评估+部署工具包）· `dify`（工作流内评测）                                                                                                                                                                                                                                          | ❌ 无标准                                                   |
| **L7 治理层**（谁说了算）         | 人工介入点（HITL）· 审批门 · 权限与授权 · 审计台账 · 成本治理                                   | `omnara`（approvals 一等动词）· `Citadel`（Needs You/Resume 边界）· `dify`（工作流节点人工审核）· `langfuse`（评测门禁）                                                                                                                                                                                                       | ❌ 无标准                                                   |
| **L8 分发层**（怎么到达用户）     | 技能/插件市场 · 一键安装 · 版本与升级 · 组织级分发                                              | `agentskills`（注册表）· `ruflo`（Claude 插件市场官方上架）· `BMAD-METHOD`（`npx skills add` 跨工具安装器）· `skills-manager`（市场 + preset）                                                                                                                                                                                 | **agentskills** ✅                                          |
| **L9 交互层**（怎么被看见）       | agent↔前端事件协议 · 聊天/流式 UI · 移动端 · 审批 UI                                            | `ag-ui-protocol/ag-ui`（20.5k★，agent 事件推前端）· `happy`（E2E 加密移动端）· `nimbalyst`（可视化 diff 评审）                                                                                                                                                                                                                 | **AG-UI** ✅                                                |

#### 2.3.3 本地优先单机中台 vs 云端平台型中台：取舍表

| 层        | 云端平台型（Dify / AutoGPT / OpenHands Cloud） | 本地优先单机型（OpenVibe 应取）                                          | 取舍理由                                                    |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| L1 接入   | 平台自带 agent 列表 + BYO key                  | **采纳 ACP/MCP 双标准 + 本地 agent 注册表（含旗标映射与健康检查）**      | 本地 agent 不进云；注册表须带归档机制（iFlow 教训）         |
| L2 编排   | 工作流引擎 + 多租户队列                        | **不建通用编排引擎**；只做「单任务 + 少量并行 + 人工确认」的最小派发     | 编排范式无标准、且竞品在此同质化；自建通用引擎必输          |
| L3 上下文 | 向量库 + RAG 管道                              | **规则层用确定性注入（已有）+ 渐进式披露 + 漂移检测**；记忆挂本地 SQLite | 这是 OpenVibe 既有资产，也是竞品空白层（L3 漂移检测无人做） |
| L4 隔离   | microVM 池（E2B/Firecracker）                  | **用 git worktree + 各 agent 自带 sandbox 档位**                         | 本机跑 microVM 太重；worktree 是全场收敛的事实标准          |
| L5 观测   | 云端 trace 平台                                | **本机事件台账（已有，23+ kind 闭集）+ 扩展 agent 事件**                 | 本地优先根设定；台账已有，是零迁移的落点                    |
| L6 评测   | 云端评测流水线                                 | **不建通用评测平台**；用「采纳率/核验通过率」（OM3/OM4）做产品内评测     | 通用评测是 promptfoo 的地盘；产品内自证更贴合定位           |
| L7 治理   | 平台权限与审批流                               | **pending 队列 = 审批门**（已有 M8 机制），派发结果同样进队列            | 「agent 的判断不可作为事实源」是既有纪律，扩展它而非另建    |
| L8 分发   | 平台市场                                       | **不建内容市场**；标准包导出 + Git 仓分发                                | 内容市场是 anthropics/skills、skills-manager 的地盘         |
| L9 交互   | 云控制台 + 移动 App                            | **复用现有 Web 工作台**；派发看板是工作台的一个视图                      | 已建 Web 工作台是差异化，不另起炉灶                         |

**三条结论**：① **无标准的是编排层、治理层、记忆层——恰恰是中台最难标准化、也最难被复制的部分**（⇒ OpenVibe 在这三层的选择即护城河）；② **有标准的是接入层与分发层**（MCP/ACP/AG-UI/agentskills）⇒ 不要在标准层造轮子，直接适配；③ **单机形态的可行组合 = 标准层全适配 + 非标准层做深本地化 + 通用引擎层不做**。

### 2.3.4 两个补充事实

- **`agentclientprotocol/registry`**（465★）：ACP 的 **agent 注册表**已存在——说明「agent 目录化」正在标准化。OpenVibe 的 agent 注册表应**兼容 ACP 注册表格式**而非另立格式。
- **`ag-ui-protocol/ag-ui`**（20,482★，2026-11-18 活跃）：agent↔前端事件协议，是 OpenVibe Web 工作台「实时看 agent 干活」的现成协议参照——不必自造前端事件格式。

### 2.4 线四：跨机联动（多电脑组网）——本轮新增线

> 触发：owner 指出「多台电脑组网、A 机联动 B 机」是关键缺口场景。此前的三线调研把跨机当作「不同轴」排除，本节补齐。
> 结论先行：**GitHub 上没有「跨机 coding agent 编排」这个独立品类**（`cross-machine agent orchestration` / `agent mesh peer-to-peer` / `distributed agent swarm cluster` / `agent federation remote machines` / `homelab agent server` / `remote agent execution ssh` / `multi-computer agent team` 七组关键词实搜**全部零命中或仅 1 条 0★ 命中**）——**这是真空，不是红海**。

#### 2.4.1 五个参照项目

| 项目                                     | Star    | 最近提交   | 许可               | 跨机形态                                                                                     |
| ---------------------------------------- | ------- | ---------- | ------------------ | -------------------------------------------------------------------------------------------- |
| **deepseek-ai/dsh-superagent-prototype** | 23,886  | 2026-11-03 | MIT                | **参考架构**：监听 GitHub（+ 可选飞书），多机各自独立跑，靠共享事件流协同                    |
| deepseek-ai/deepseek-harness             | 283,884 | 2026-11-18 | —                  | 插件化 agent harness（dsh-superagent 是它的 bundle）                                         |
| lobehub/lobehub                          | 85,832  | 2026-11-19 | NOASSERTION        | 「Super-Agents on Your Team」——接进团队已有的聊天工具，自主领活、每周变好                    |
| EverMind-AI/Raven                        | 6,259   | 2026-11-19 | Apache-2.0         | 「harness 的 harness」/ Host Agent，多 agent DAG + 轨迹时间线（每 agent 每轮每步一条时间轴） |
| gastownhall/gastown（Wasteland）         | 18,834  | 2026-11-14 | MIT                | 跨 town 联邦：经 DoltHub 认领他镇工作、提交完成证据、赚可携声誉                              |
| slopus/happy                             | 24,706  | 2026-11-18 | MIT                | relay 中继 + E2E 加密，多端同步会话（手机/桌面多人协同）                                     |
| mixpeek/amux                             | 563     | 2026-11-18 | MIT+Commons Clause | Tailscale HTTPS + iPhone 原生 App，多设备审批                                                |
| aaif-goose/goose                         | 57k+    | 2026-11-19 | —                  | `roam` P2P 能力（同侪互联）                                                                  |

#### 2.4.2 三条架构结论（跨机设计的可复用规律）

**结论 A · 接缝在「共享事件流 / 共享工件面」，不在「远程控制面」**

dsh-superagent 的 README 原文：它「**listens to GitHub and, optionally, Feishu**」，被问到时才开工作项，「works on it **in its own agent session and directory**」，用网页面板显示「需要人处理的事」。架构文档进一步说明：passes「one pass at a time, **every two seconds**」——**轮询式拉取**，不是 A 机开端口推给 B 机。

其余项目同构：happy 走 relay 中继、amux 走 Tailscale HTTPS、gastown 走 DoltHub 仓。⇒ **「多机联动」的通用实现是「共享一个双方都能访问的存储 + 各自轮询」，不是「建立机器间的控制通道」**。

**结论 B · 授权是独立的领域概念，不是权限开关**

dsh-superagent 的领域模型用五个概念承载跨机授权：`Source`（事件流，持有读位置，**重启不重放**）/ `Trigger`（不可变事件，审计与幂等的单位）/ `Policy`（**版本化**的评估规则 + 每个 Source 的允许名单 + **名单如何同步**）/ `Mandate`（一次受理授予什么：策略版本、范围、强度、匹配规则、发起人身份——**不可变**）/ `Assignment`（Ticket 绑到一个 Executor 实例，pending→running→ended **独立于 Ticket 自身状态**）。

三条可直接借用的规则：

1. **「消息、评论、被引用的文档是决策的输入，不能改变权限」**（授权文档原文）——这是防提示注入的结构性设计。
2. **强度分级**：`explicit`（名单内的人直接点名）/ `inferred`（名单外的人追加需求）/ `not admitted`（不受理）——人机协作的粒度不是开关，是档位。
3. **策略变更不撤销存量授权**（变更被记录并投递给在办的任务）——与 OpenVibe 的「快照/派生列不覆盖用户态」纪律同源。

**结论 C · 「面板只显示需要人处理的事，健康状态不占空间」**

dsh-superagent 哲学文档原文：「A panel that shows only what needs a person. **A healthy state takes no space.**」这与 OpenVibe 既有哲学（覆盖地图、可读性量具、本机自证层）同构。

#### 2.4.3 对 OpenVibe 最关键的一条：标准包 = 授权来源

dsh-superagent 的核心原则原文：「**It acts only when asked, or when a written rule allows it.**」——agent 自主工作的条件是「团队写的规则允许」。

⇒ **这条与 OpenVibe 的标准包是同一个东西的两面**：OpenVibe 的标准包今天装的是「给 AI 看的知识（术语/提示词/流程）」，在跨机场景下它可以同时装「**授权**（哪些动作允许无人值守做、哪些必须等人确认）」。这不是新增概念，是既有资产在新场景下多出的一种载荷。

#### 2.4.4 可借鉴 / 可规避

| 可借鉴                                                           | 可规避                                                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 共享工件面 + 轮询的跨机形态（不改「只听本地」就能跨机）        | ① **不照抄八个领域概念**（Source/Thread/Eval/Mandate/Ticket/Assignment/Subscription/Policy）——那是 GitHub 单仓专用的复杂度，OpenVibe 只需其中两三个概念的等价物 |
| ② 授权独立成概念：规则包承载授权 + 强度分级 + 策略变更不撤销存量 | ② 不做「身份跨源映射」（文档明写「跨 Source 的身份映射是 prompt 文本，不是领域概念」）——OpenVibe 无账号体系，正好不做                                           |
| ③ 面板只显示需人处理项                                           | ③ 不做 DoltHub 式联邦（gastown 的声誉/认领/跨镇经济）与 Tailscale/relay 式中继                                                                                  |
| ④ 事件幂等（Trigger 不可变 + 接受两次只产生一个 Ticket）         | ④ 不做「每个 Ticket 一个目录 + 独立 agent session」的完整生命周期——那是 harness 的活，不是中台的活                                                              |
| ⑤ 授权文档那句话：内容是决策输入，不能改权限                     | ⑤ 不做厂商云 agent 路线（Codex Web 已把 agent 放上云）                                                                                                          |

#### 2.4.5 厂商已覆盖的部分与真空

- **厂商云端 agent**（Codex Web）已能远程跑 agent 跑你的仓库 ⇒ 「多机协同」的一部分需求被覆盖。**但代价是代码与上下文上云**，与 OpenVibe 的本地优先硬承诺直接冲突。
- ⇒ **OpenVibe 跨机形态的差异化主张**：**代码始终留在各自本机，跨机只共享「规则包 + 任务工件 + 结果证据」**。这不是功能差异，是**信任模型的差异**——而信任模型正是 OpenVibe README 里写明的竞争护城河（「对一个会写你文件的工具，这一节是信任底线」）。

---

## 3. 横向对比矩阵（编排能力 × 竞品）

✅ 完整支持 ｜ 🟡 部分/间接 ｜ ❌ 无

### 3.1 编排管道 vs 规则层（核心反差矩阵）

| 能力                       | vibe-kanban | claude-squad | ruflo      | gastown      | happy | opcode                    | openhands | omnara         | amux | nimbalyst | task-master | plandex | **OpenVibe 现状**     |
| -------------------------- | ----------- | ------------ | ---------- | ------------ | ----- | ------------------------- | --------- | -------------- | ---- | --------- | ----------- | ------- | --------------------- |
| 任务分解与分发             | 🟡          | ❌           | ✅         | ✅           | 🟡    | ❌                        | ✅        | 🟡             | 🟡   | 🟡        | ✅          | ✅      | ❌                    |
| 多会话并行管理             | ✅          | ✅           | ✅         | ✅           | ✅    | 🟡                        | ✅        | ✅             | ✅   | ✅        | 🟡          | ❌      | ❌                    |
| 隔离（worktree/容器/tmux） | ✅          | ✅           | 🟡         | ✅           | 🟡    | 🟡                        | ✅        | ✅             | 🟡   | ✅        | ❌          | ✅      | ❌                    |
| 进度聚合与监督             | ✅          | ✅           | ✅         | ✅           | ✅    | ✅                        | ✅        | ✅             | ✅   | ✅        | 🟡          | 🟡      | ❌                    |
| 结果评审与合并             | ✅          | ✅           | 🟡         | ✅           | 🟡    | 🟡                        | 🟡        | 🟡             | 🟡   | ✅        | ❌          | ✅      | ❌                    |
| 人工介入点（HITL）         | ✅          | ✅           | 🟡         | ✅           | ✅    | ✅                        | ✅        | ✅             | ✅   | ✅        | 🟡          | ✅      | 🟡（M8 pending 队列） |
| agent 间通信               | ❌          | ❌           | ✅         | ✅           | 🟡    | ❌                        | 🟡        | 🟡             | ✅   | 🟡        | 🟡          | ❌      | ❌                    |
| **规则/技能注入多工具**    | ❌          | ❌           | ❌         | ❌           | ❌    | 🟡（仅 CLAUDE.md 编辑器） | ❌        | ❌             | ❌   | ❌        | ❌          | ❌      | **✅✅（核心）**      |
| **注入后漂移检测**         | ❌          | ❌           | ❌         | ❌           | ❌    | ❌                        | ❌        | ❌             | ❌   | ❌        | ❌          | ❌      | **✅✅（唯一）**      |
| **经验回流沉淀**           | ❌          | ❌           | 🟡（记忆） | 🟡（seance） | ❌    | ❌                        | ❌        | 🟡（事件日志） | ❌   | ❌        | ❌          | ❌      | **✅✅（唯一）**      |

**矩阵读法**：只有 gastown 拿满编排 6 项 ✅（代价是概念复杂度全场最高）；「分解✅ + 合并✅」组合只有 gastown/task-master/plandex（前两者无一做规则回流）。**没有任何一个项目同时覆盖「任务编排闭环」+「规则/上下文中台」——OpenVibe 的复合定位仍无人占据。** 反过来，OpenVibe 的编排 6 项全是 ❌——中台化不是加强现有功能，是**补一条新管道并把已有规则层资产接进去**。

### 3.2 可指挥面梯队（复述 §2.2.3 结论）

| 梯队         | agent                                                      | 指挥含义                            |
| ------------ | ---------------------------------------------------------- | ----------------------------------- |
| 完全无人值守 | Claude Code / Codex / Qwen Code / Kimi Code / MiniMax Code | 中台首期指挥对象                    |
| 半自动       | OpenCode / Goose / Gemini CLI                              | 第二批（能力协商降级启用）          |
| 要人盯/黑盒  | Crush / CodeBuddy / Trae / 各家 GUI                        | 兼容矩阵登记，不做 headless adapter |
| 出局         | iFlow（停服）                                              | 注册表带归档机制的教训样本          |

---

## 4. 对 OpenVibe 多 Agent 中台方向的启示（递进链条）

> 排列方式：从赛道事实 → 到定位判断 → 再到动作，四步成链，每步由上一步推出。

**第一步（赛道事实）**：编排管道同质化 + 商业失败频发（bloop/Plandex/Conductor 三重死亡）。⇒ **推论：编排台本身不构成价值锚，价值必须在编排之外。**

**第二步（定位判断）**：编排之外的价值是什么？竞品矩阵给出唯一空档——**规则层闭环**（注入/漂移/回流无人做），且 OpenVibe 已有全套资产。同时 shogun 反面证据说明「并行数量」叙事已现裂缝，「判断与规则沉淀」才是资产。⇒ **推论：OpenVibe 中台叙事 = 「多 agent 是手段，规则与判断的沉淀是资产」；指挥层做薄，规则层做深。**

**第三步（可行性确认）**：可指挥面九问证明 5 个 agent（含 3 个国内）已具备无人值守三件套，最小公共协议只有四件，旗标映射可直接进配置。⇒ **推论：统一指挥层技术上立即可做，无需等生态成熟；adapter 契约以「四件必选 + 能力协商」定义。**

**第四步（跨机推论）**：跨机品类是真空（F4），且已有实现全部是「共享工件面 + 各自轮询」，**没有一家破监听端口，也没有一家做跨机规则一致性证明**。⇒ **推论：跨机形态可以做到「OpenVibe 零新增监听端口」——共享工件面承载任务与规则包，各机轮询；跨机的独家价值落在「证明各机同源」，而这正是内容指纹的天然职责。**

**第五步（动作清单）**：由此推出——

| 优先级 | 动作                                                                                                                                                                                                                                                                 | 来源竞品                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P0     | **派发前规则联动**：agent 接任务前自动确认标准包注入状态（未注入/漂移即拦截）——把核心差异化接进指挥链                                                                                                                                                                | 本报告 F2 空档                                                                |
| P0     | **汇聚验证门禁**：dispatch 完成 → verify + 测试 → 结果入 pending 队列待人确认 → merge 由人执行（gastown Refinery/Bors 思路 × OpenVibe verify）                                                                                                                       | gastown · plandex diff 沙箱                                                   |
| P0     | **agent 注册表**：12 agent 控制面映射（旗标/JSON/resume）+ 健康检查 + 归档（iFlow 教训）                                                                                                                                                                             | §2.2 旗标映射表                                                               |
| P1     | **dispatch 指挥原语**：headless/JSONL/resume 的归一化包装 + `--dry-run` 预览                                                                                                                                                                                         | §2.2 最小公共协议                                                             |
| P1     | **git worktree 隔离**：不自造沙箱，用全场收敛的事实标准                                                                                                                                                                                                              | F1 · vibe-kanban/nimbalyst/gastown                                            |
| P1     | **HITL 审批门**：approvals 做成一等动词，覆盖 dispatch 结果确认（扩展 M8 pending 队列）                                                                                                                                                                              | omnara · Citadel 边界 · amux Dock badge                                       |
| P1     | **结果回流提取**：dispatch 事件流 → M10 提取链候选（术语/提示词/技巧草稿）                                                                                                                                                                                           | seance · kagemusha 判断回路                                                   |
| P2     | **任务看板最小面**：SQLite 任务表 + 原子认领（不做重型看板）                                                                                                                                                                                                         | amux · vibe-kanban                                                            |
| P2     | **CCR 正交集成**：模型路由接 claude-code-router，不自建网关                                                                                                                                                                                                          | CCR                                                                           |
| P2     | **轻量 A2A**：一张消息表 + MCP 工具暴露即可达成 amux 级互发，不上联邦                                                                                                                                                                                                | amux · gastown mailbox                                                        |
| P3     | **VK 数据导入**：vibe-kanban 关停真空期抢用户（其最新版自带导出）                                                                                                                                                                                                    | vibe-kanban                                                                   |
| **P3** | **机器注册表 + 共享工件面跨机派发**（各机轮询，OpenVibe 不开放监听端口）                                                                                                                                                                                             | §2.4 结论 A（dsh-superagent 轮询范式 + happy/amux 中继范式）                  |
| **P3** | **跨机规则一致性证明**（各机 lock 指纹比对，出具「同源证明」）                                                                                                                                                                                                       | §2.4 结论 B + F4 真空；OpenVibe 指纹机制的独占延伸                            |
| **P3** | **授权随规则包下发**（标准包兼作自主性策略：什么允许无人值守做）                                                                                                                                                                                                     | dsh-superagent 哲学「acts only when asked, or when a written rule allows it」 |
| ⛔     | 不做云端控制面/账号体系（三重死亡教训 + 本地优先根设定）；不做模型网关自建（CCR 正交）；不做跨机联邦声誉经济（Wasteland 太重）；不做容器沙箱自造（各 agent 自带 sandbox 档 + worktree 已够）；**不做 A 机开端口远程控制 B 机**（共享工件面即可，且守住「只听本地」） | §2.1 各「可规避」· §2.4.4                                                     |

---

## 5. 数据来源与口径说明

- **Star / 最近提交 / 许可证 / 归档态**：GitHub REST API 实查（`gh api repos/<owner>/<repo>`），采集于 2026-11-19。
- **功能与编排细节**：各仓库 README 经 GitHub API raw 读取；官方文档（docs.anthropic.com / developers.openai.com / Google 仓库 docs / npm registry）经 WebFetch/web_reader。
- **协议两说如实登记**：BMAD（API: NOASSERTION / README 徽章: MIT）、task-master（API: NOASSERTION / README: MIT+Commons Clause）、amux（MIT + Commons Clause）。
- **改名/搬家核实**：claude-flow→ruflo、claudia→**winfunc/opcode**、all-hands-ai→OpenHands、crystal→nimbalyst、block/goose→aaif-goose、sst/opencode→anomalyco/opencode（均经 API 重定向确认）；parruda/claude-swarm 已删（404 无重定向）；Conductor 闭源并入 Meta（官网页脚）。
- **星数复验说明**：线一的 13 个项目与线三的 23 个项目**均在本轮内独立复验一次**（2026-11-19 两次 API 查询），两次结果的星数差异 ≤ 16（如 vibe-kanban 28,738 / 28,740，ruflo 82,051 / 82,064）——**属并发计数漂移，非数据矛盾**。以本报告首次采集值为准；**星数不作为任何结论的唯一依据**（结论依赖的是能力矩阵与控制面，不是体量）。
- **线四数据口径**：跨机线的 8 个项目 Star / 最近提交 / 许可证为 GitHub API 实查（2026-11-19）；dsh-superagent 的架构结论来自其仓库 `docs/000-philosophy.md`、`001-domain.md`、`002-authorization.md`、`007-architecture.md` 四篇文档全文读取（GitHub API raw）；**「跨机无独立品类」的结论基于七组关键词实搜零命中，属搜索口径内的判定，非穷举证明**。
- **数字复算命令**：`gh api repos/<owner>/<repo> --jq '{stars:.stargazers_count,pushed:.pushed_at,archived:.archived,issues:.open_issues_count}'`（线一 13 项 + 线三 23 项 + 线四 8 项逐条同上）。
- **未实测**：本报告为桌面调研，未运行任何竞品；功能判断基于公开文档与仓库元数据。落地前对关键项（尤其 CodeBuddy/Trae 的黑盒部分、Qwen experimental 面）做真机验证。
- **线三数据口径**：框架层的 Star / 最近提交 / 许可证为 GitHub API 实查（2026-11-19）；各框架的能力分层归属依据其 README 与官方文档（桌面调研，未运行任何框架）。**编排层/治理层/记忆层「无标准」的判断基于本报告覆盖的 23 个项目中未出现跨项目通用规范**，非穷举证明。

## 附录 · 来源清单

- 线一：[OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) · [ruvnet/ruflo](https://github.com/ruvnet/ruflo) · [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) · [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)（+ [关停公告](https://vibekanban.com/blog/shutdown)）· [slopus/happy](https://github.com/slopus/happy) · [getAsterisk/claudia](https://github.com/getAsterisk/claudia)（现 opcode）· [gastownhall/gastown](https://github.com/gastownhall/gastown) · [plandex-ai/plandex](https://github.com/plandex-ai/plandex) · [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) · [omnara-ai/omnara](https://github.com/omnara-ai/omnara) · [nimbalyst/nimbalyst](https://github.com/nimbalyst/nimbalyst) · [yohey-w/multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun) · [SethGammon/Citadel](https://github.com/SethGammon/Citadel) · [mixpeek/amux](https://github.com/mixpeek/amux) · [kibitzsh/kibitz](https://github.com/kibitzsh/kibitz) · [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
- 线二：[anthropics/claude-code](https://github.com/anthropics/claude-code) · [openai/codex](https://github.com/openai/codex) · [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) · [charmbracelet/crush](https://github.com/charmbracelet/crush) · [aaif-goose/goose](https://github.com/aaif-goose/goose) · [anomalyco/opencode](https://github.com/anomalyco/opencode) · [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code) · [iflow-ai/iflow-cli](https://github.com/iflow-ai/iflow-cli)（停服）· [@tencent-ai/codebuddy-code](https://www.npmjs.com/package/@tencent-ai/codebuddy-code) · [bytedance/trae-agent](https://github.com/bytedance/trae-agent) · [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) · [MiniMax-AI/minimax-code](https://github.com/MiniMax-AI/minimax-code)
- 线三：[langgenius/dify](https://github.com/langgenius/dify) · [Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) · [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) · [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) · [mem0ai/mem0](https://github.com/mem0ai/mem0) · [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) · [BerriAI/litellm](https://github.com/BerriAI/litellm) · [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) · [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) · [langfuse/langfuse](https://github.com/langfuse/langfuse) · [modelscope/agentscope](https://github.com/modelscope/agentscope) · [openai/openai-agents-python](https://github.com/openai/openai-agents-python) · [mastra-ai/mastra](https://github.com/mastra-ai/mastra) · [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) · [a2aproject/A2A](https://github.com/a2aproject/A2A) · [agentskills/agentskills](https://github.com/agentskills/agentskills) · [letta-ai/letta](https://github.com/letta-ai/letta) · [google/adk-python](https://github.com/google/adk-python) · [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui) · [e2b-dev/E2B](https://github.com/e2b-dev/E2B) · [ag2ai/ag2](https://github.com/ag2ai/ag2) · [kyegomez/swarms](https://github.com/kyegomez/swarms) · [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol) · [agentclientprotocol/registry](https://github.com/agentclientprotocol/registry) · [AgentOps-AI/agentops](https://github.com/AgentOps-AI/agentops)
- 线四：[deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（研究原型，MIT）· [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) · [lobehub/lobehub](https://github.com/lobehub/lobehub) · [EverMind-AI/Raven](https://github.com/EverMind-AI/Raven) · [gastownhall/gastown](https://github.com/gastownhall/gastown)（Wasteland 跨 town 联邦）· [slopus/happy](https://github.com/slopus/happy)（relay 中继）· [mixpeek/amux](https://github.com/mixpeek/amux)（Tailscale）· [aaif-goose/goose](https://github.com/aaif-goose/goose)（roam P2P）· [openai/codex](https://github.com/openai/codex)（Codex Web 云端 agent） · [Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) · [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) · [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) · [mem0ai/mem0](https://github.com/mem0ai/mem0) · [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) · [BerriAI/litellm](https://github.com/BerriAI/litellm) · [OpenBMB/ChatDev](https://github.com/OpenBMB/ChatDev) · [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) · [langfuse/langfuse](https://github.com/langfuse/langfuse) · [modelscope/agentscope](https://github.com/modelscope/agentscope) · [openai/openai-agents-python](https://github.com/openai/openai-agents-python) · [mastra-ai/mastra](https://github.com/mastra-ai/mastra) · [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) · [a2aproject/A2A](https://github.com/a2aproject/A2A) · [agentskills/agentskills](https://github.com/agentskills/agentskills) · [letta-ai/letta](https://github.com/letta-ai/letta) · [google/adk-python](https://github.com/google/adk-python) · [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui) · [e2b-dev/E2B](https://github.com/e2b-dev/E2B) · [ag2ai/ag2](https://github.com/ag2ai/ag2) · [kyegomez/swarms](https://github.com/kyegomez/swarms) · [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol) · [agentclientprotocol/registry](https://github.com/agentclientprotocol/registry) · [AgentOps-AI/agentops](https://github.com/AgentOps-AI/agentops)
