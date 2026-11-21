# 竞品分析：AI Coding 上下文标准化工具（2026-11-12）

> 面向 OpenVibe（灵典）的竞品分析。目标：为后续新功能设计提供**功能设计层面**的客观、可落地依据。
> 数据口径：GitHub REST API 实查（star 数 / 最新提交时间 / 仓库元数据），采集于 **2026-11-12**。
> 筛选口径：① 与 OpenVibe 同类型（AI coding 上下文/规则/技能的标准化与分发）；② 近 6 个月有活跃提交（2026-05-12 之后）；③ Star ≥ 500。

---

## 与既有竞品报告的关系

本仓已有一份主报告：[`docs/competitive-analysis.md`](./competitive-analysis.md)（v1.0，2026-09-20，DEV-0007），覆盖 **14 个项目、15 维度能力矩阵**（含 PromptHub / Rulix / rulebook-ai / BMAD 等本报告未展开的项目）。**那份仍是全景主报告，本报告不取代它。**

本报告是主报告的**刷新 + 聚焦**，差异在三点：

| 维度       | 主报告（2026-09-20）          | 本报告（2026-11-12）                               |
| ---------- | ----------------------------- | -------------------------------------------------- |
| 选型口径   | 14 项目四象限全量             | 按「近 6 月活跃 + ≥500★」筛 Top 5 深挖             |
| 分析维度   | 15 维度能力矩阵 + SWOT + 策略 | 六维度（含迭代路线）+ 可借鉴/可规避清单 + 落地顺序 |
| 数据新鲜度 | 2026-09-20 快照               | 2026-11-12 GitHub API 实查                         |

**本报告修正了主报告的两处过期判断**（主报告是历史快照，不改动，修正写在这里）：

1. **spec-kit 从「维护存疑」变为「活跃」** —— 主报告 §一.3 记「~90k★ 但维护停滞（月开 22 个 PR 零合并）」；本报告查 commits API，最新提交为 **2026-11-11**（`fix(workflows): expose bundled review verdict inputs (#5392)`），稳定版 3.2.7、4.x prerelease ⇒ 判活跃，纳入 Top 5。
2. **skills-manager 从「新兴」变为「成熟」** —— 主报告 §二记「新兴，宣称支持 50+ 工具」；本报告实查 **7,453★ / 56 工具 / Rust+Tauri+SQLite**，已是该品类头部。

**本报告新增主报告未覆盖的候选**：`Tencent/teamai-cli`（2026-04 开源，5,828★，团队 Git 仓分发）与 `obra/superpowers`（314,675★，技能方法论框架）—— 主报告的 14 项目里没有这两者。

---

## 0. 结论速览

**一句话结论**：OpenVibe 的差异化不在「同步规则/技能」这个动作上（rulesync、skills-manager 已做到极致），而在**「本地优先 + 内容台账 + 注入后校验」**这三件别人不做的事上 —— 竞品普遍只解决「生成/同步」，不解决「同步之后对不对」「用户到底用了什么」。

**Top 5 竞品**：

| #   | 项目                                                                            | Star    | 最近提交   | 类型           | 与 OpenVibe 的关系                          |
| --- | ------------------------------------------------------------------------------- | ------- | ---------- | -------------- | ------------------------------------------- |
| 1   | [dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync)                   | 1,600   | 2026-11-09 | CLI 规则同步   | **最直接竞品**：统一规则源 → 多工具配置生成 |
| 2   | [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) | 7,453   | 2026-11-10 | 桌面技能管理   | **最直接竞品**：技能库跨 56 工具同步        |
| 3   | [Tencent/teamai-cli](https://github.com/Tencent/teamai-cli)                     | 5,828   | 2026-11-12 | 团队配置分发   | 相邻：Git 仓即真相源 + 团队角色             |
| 4   | [obra/superpowers](https://github.com/obra/superpowers)                         | 314,675 | 2026-11-03 | 技能方法论框架 | 技能层：可组合 skills + 自动触发            |
| 5   | [github/spec-kit](https://github.com/github/spec-kit)                           | 51,387  | 2026-11-11 | 规格驱动开发   | 相邻：spec → plan → tasks 流程              |

**标准层（不在 Top 5，但影响设计）**：[agentskills/agentskills](https://github.com/agentskills/agentskills)（27,200★，开放 Agent Skills 标准 + 注册表）。

---

## 1. 筛选口径与候选池

### 1.1 筛选标准

| 标准   | 取值                                             | 理由                                                                          |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| 同类型 | AI coding 上下文/规则/技能的**标准化与分发**工具 | 排除纯 coding agent（Continue/Cline/Roo Code）与纯内容库（anthropics/skills） |
| 活跃   | 2026-05-12 之后有提交                            | 排除停更项目（如 sst/opencode 最新提交 2025-11-22）                           |
| 体量   | Star ≥ 500                                       | 排除个人玩具（如 fernandomenuk/openspec 仅 5★）                               |

### 1.2 候选池与落选说明

| 项目                         | Star    | 最近提交    | 判定         | 说明                                                                      |
| ---------------------------- | ------- | ----------- | ------------ | ------------------------------------------------------------------------- |
| dyoshikawa/rulesync          | 1,600   | 2026-11-09  | ✅ Top 5     | 直接竞品                                                                  |
| xingkongliang/skills-manager | 7,453   | 2026-11-10  | ✅ Top 5     | 直接竞品                                                                  |
| Tencent/teamai-cli           | 5,828   | 2026-11-12  | ✅ Top 5     | 团队分发                                                                  |
| obra/superpowers             | 314,675 | 2026-11-03  | ✅ Top 5     | 技能方法论                                                                |
| github/spec-kit              | 51,387  | 2026-11-11  | ✅ Top 5     | 规格驱动                                                                  |
| agentskills/agentskills      | 27,200  | 2026-11-04  | ✅ 标准层    | 开放标准 + 注册表                                                         |
| anthropics/skills            | 193,074 | 2026-11-06  | ➖ 内容层    | 官方技能库（内容，非工具）                                                |
| mattpocock/skills            | 322,068 | 2026-11-11  | ➖ 内容层    | 个人技能库（内容，非工具）                                                |
| continuedev/continue         | 36,462  | 2026-11-05* | ❌ 已停维    | 2026-06 被 Cursor 收购，仓库只读（*API 元数据与公开报道冲突，以报道为准） |
| cline/cline                  | 39,965  | 2025-04-14  | ❌ 停更      | 近 6 个月无提交                                                           |
| RooCodeInc/Roo-Code          | 24,236  | 2026-05-15  | ❌ 已归档    | `archived: true`                                                          |
| sst/opencode                 | 33,568  | 2025-11-22  | ❌ 停更      | 近 6 个月无提交                                                           |
| Aider-AI/aider               | 49,794  | 2026-05-22  | ❌ 不同类    | 终端 coding agent，非上下文管理工具                                       |
| jiweiyeah/Skills-Manager     | 1,058   | 2026-09-10  | ❌ 同类但小  | 与 xingkongliang/skills-manager 同类，体量小一个量级                      |
| Goldziher/ai-rulez           | 169     | 2026-11-09  | ❌ Star 不足 | 功能全面（52 工具 + 供应链）但 <500★                                      |
| lbb00/ai-rules-sync          | 40      | 2026-08-20  | ❌ Star 不足 | 同类但 <500★                                                              |
| fernandomenuk/openspec       | 5       | 2026-03-13  | ❌ Star 不足 | 同类但 <500★                                                              |

> ⚠️ **数据冲突说明**：`continuedev/continue` 的 GitHub API 元数据（`pushed_at=2026-11-05`、`archived=false`）与多家公开报道（2026-06 被 Cursor 收购、仓库只读、最终版 2.0.0）冲突。本报告以公开报道为准，将其列为「已停维」。

---

## 2. Top 5 逐个分析（六维度）

### 2.1 dyoshikawa/rulesync —— 最直接竞品

**定位**：Node.js CLI，把统一的 AI 规则文件（`.rulesync/`）自动生成成 60+ AI 工具的原生配置文件。

**核心功能模块**

| 模块                | 说明                                            |
| ------------------- | ----------------------------------------------- |
| `init`              | 建目录 + 样例规则 + `rulesync.jsonc`            |
| `fetch`             | 拉取外部规则源（Git 仓）                        |
| `generate`          | 按 `--targets` / `--features` 生成配置          |
| `import` / `export` | 与既有工具配置双向迁移                          |
| `convert`           | 直接 A 工具 → B 工具（不强制采用 `.rulesync/`） |
| `simulate`          | 模拟 commands / subagents                       |
| `--dry-run`         | 预览变更不写盘                                  |

**功能矩阵**：60+ 工具 × 9 特性（rules / ignore / mcp / commands / subagents / skills / hooks / permissions / checks），并区分 project / global / simulated / MCP tool config 四种模式。

**技术栈**：TypeScript CLI；分发走 npm + Homebrew tap + 单二进制（curl 安装）。

**用户交互设计**：CLI 优先 + 声明式 `rulesync.jsonc`。`--targets "*" --features "*"` 全量生成；`--dry-run` 预览；特性矩阵表直接印在 README。

**差异化优势**

- 特性矩阵最完整（60+ 工具 × 9 特性），是「跨工具配置」的事实参考。
- `import`/`export` 双向 + `convert` 轻量入口 —— 不强制用户采用 `.rulesync/` 工作流。
- 插件打包（claudecode-plugin / antigravity-plugin 等）与 `--output-roots` 解耦输入根。
- 明确的弃用政策（ignore → permissions 迁移、Continue 冻结兼容）。

**已知短板**

- **只生成，不校验**：没有「生成后文件是否被改」的漂移检测。
- **无内容库/台账**：不管「用户有哪些规则、用了哪些、效果如何」。
- 纯 CLI，无 GUI、无 Web、无本地库。
- 无 Windows 适配说明（单二进制除外）。

**迭代路线**：当前 14.x；ignore 特性弃用（迁 permissions）；Kiro 拆成 CLI/IDE 两个 target；Continue 冻结为兼容 target；4.x/5.x 未见公告。

**可借鉴亮点**

1. **特性矩阵（adapter 能力位）**：OpenVibe 的 6 adapter 能力位可扩成「工具 × 特性」矩阵，把「未声明」与「不支持」分开。
2. **`--dry-run` 与 `import/export` 双向**：OpenVibe 的 `diff` 已有只读预览，可补「导出到工具原生格式」的反向通道。
3. **`convert` 轻量入口**：允许用户不采纳整套标准包，只做「一次性把 A 工具配置转成 B 工具」—— 降低采用门槛。
4. **弃用政策**：冻结兼容 target、明确迁移路径，值得 OpenVibe 在 adapter 退场时照做。

**可规避的问题点**

1. **只生成不校验** —— 这正是 OpenVibe 的 `diff`/`verify` 差异化，必须守住。
2. **无库/台账** —— OpenVibe 的术语库/提示词库/技巧库/圈数台账是差异化，不要砍。
3. **纯 CLI 无 GUI** —— OpenVibe 的 Web 工作台是差异化。

---

### 2.2 xingkongliang/skills-manager —— 桌面技能管理

**定位**：一个桌面应用，管理所有 AI 工具的技能（skills）。写一次，同步到 56 个工具。

**核心功能模块**

| 模块                               | 说明                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Unified Library                    | 中央技能库（默认 `~/.skills-manager`），来源含 Git 仓 / 本地 / zip / .skill / skills.sh 市场 |
| Marketplace                        | 市场浏览 + 关键词搜索                                                                        |
| Presets                            | 技能分组，一键启停（**一次拷贝，非实时同步**）                                               |
| Global / Agent / Project Workspace | 三层工作区，逐 agent 管理                                                                    |
| Linked Workspace                   | 任意目录作为技能根                                                                           |
| Multi-tool sync                    | symlink 或 copy，单键同步                                                                    |
| Backup & Multi-device Sync         | 私有 GitHub 仓备份 + 多设备同步（skill-aware merge）                                         |
| CLI                                | 给 agent 用的命令行（`skills install/deploy/status/update/adopt`）                           |

**技术栈**：React 19 + TypeScript + Vite + Tailwind CSS + **Tauri 2** + **Rust** 后端 + **SQLite**（rusqlite）+ react-i18next。

**用户交互设计**：桌面 GUI 为主。侧栏三工作区；preset pill 一键启停；技能卡上的 agent badge 实时反映同步状态；批量操作；标签筛选；备份页带冲突处理（keep mine / use remote / keep both）。

**差异化优势**

- **56 工具**覆盖（Claude Code / Codex / Cursor / Copilot / Gemini CLI / OpenCode / Cline / Roo / Kiro / Trae / Qwen…）。
- **CLI for agents**：agent 可驱动 Skills Manager 安装/部署/查询技能，保住来源元数据与预设成员关系。
- **skill-aware 合并**：按技能而非按行合并，重命名与编辑可干净合并；冲突不阻塞，本地版本保留待人工选择。
- **Preset 语义明确**：一次拷贝，不是实时同步 —— 避免「预设一改，所有 agent 跟着变」的意外。
- 自定义工具 + 路径覆盖。

**已知短板**

- **只做 skills**：不管 rules / terms / prompts / MCP。
- **无漂移检测**：同步后不校验文件是否被改。
- 备份强依赖 GitHub 登录（设备流），自托管 Git 需手动配置。
- 无 Web 形态。

**迭代路线**：活跃（2026-11-10）；已支持 WSL 内 agent（Linux CLI 独立库）；CLI 与桌面共用同一 SQLite/同步引擎。

**可借鉴亮点**

1. **三层工作区模型**（Global / Agent / Project）—— 与 OpenVibe 的「本机 / 项目 / agent」分层高度同构，可直接对照。
2. **CLI for agents** —— OpenVibe 已有 MCP 桥，可补「让 agent 通过 MCP 管理技能」的通道。
3. **skill-aware merge 与冲突不阻塞** —— 若 OpenVibe 将来做技能库同步，这是可直接复用的合并策略。
4. **Preset 语义**（一次拷贝 vs 实时同步）—— OpenVibe 的标准包「注入」也是一次性动作，语义一致，可在 UI 上明确标注。
5. **agent badge 状态** —— 卡片上直接显示「哪些 agent 已装」，值得 OpenVibe 的库卡片借鉴。

**可规避的问题点**

1. **只做单一内容类型** —— OpenVibe 的多类型库（术语/提示词/技巧/流程）是差异化。
2. **无内容校验** —— 同 rulesync。

---

### 2.3 Tencent/teamai-cli —— 团队配置分发

**定位**：把团队的 skills / rules / agents / learnings / models / MCP 放进一个 Git 仓，队员初始化一次，之后自动同步。

**核心功能模块**（三层能力）

| 层                           | 内容                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Team Execution**           | skills / rules / culture / agents / hooks / mcp / workflows / env / models |
| **Team Context**（beta）     | learnings / codebase graph / teamwiki                                      |
| **Team Improvement**（beta） | usage / sessions / scorers / benchmarks                                    |

**技术栈**：TypeScript CLI（npm）；Git 仓为真相源；skill 驱动（`/teamai`）；支持 GitHub / GitLab / GitCode / CNB / TGit / 私有 Git。

**用户交互设计**：**一句话安装**（把 URL 发给 AI 工具，AI 自动装 skill 并搭建）；`/teamai` 对话式操作（ setup / join / share / open dashboard）；admin `init` + member `join`；workspace / user scope；dashboard。

**差异化优势**

- **Git 仓即真相源**：评审、版本、权限全在 Git；默认分支保护 + 分支推送权限。
- **admin / member 角色**：admin 发布，member 拉取。
- **自动同步**：每次 AI 会话自动 pull 最新资产，无需手动。
- **兼容矩阵**：16+ agent × 14 项能力，逐格标注（含 beta 标注）。
- **三层能力模型**（执行 / 上下文 / 改进）—— 从「让 agent 按团队方式工作」到「让 agent 理解团队」再到「让执行反哺团队」。

**已知短板**

- **团队向**：单用户/本机使用场景过重（需要建仓、配权限、拉分支）。
- **beta 功能多**：Context 与 Improvement 两层仍是 beta。
- **无漂移检测**。
- 无本地内容库（资产在 Git 仓，不在本机台账）。

**迭代路线**：2026-04 开源，活跃（2026-11-12）；已支持多 Git 商；beta 层持续扩展。

**可借鉴亮点**

1. **三层能力模型**（执行 / 上下文 / 改进）—— OpenVibe 的「成长与统计」目前偏「执行」与「上下文」，可对照补「改进」层（用得多的资产自动上浮）。
2. **兼容矩阵**（agent × 能力，含 beta 标注）—— 与 rulesync 的特性矩阵同构，OpenVibe 可做成常驻量具。
3. **admin / member 角色** —— 若 OpenVibe 未来做团队版，这是现成的角色模型。
4. **自动同步**（会话启动即拉取）—— 与 OpenVibe 的「注入」不同，但「无感更新」的体验值得参考。

**可规避的问题点**

1. **团队向假设** —— OpenVibe 的定位是「单用户本机」，不要照搬团队仓模式。
2. **beta 功能过多** —— 避免一次性铺开三层能力。

---

### 2.4 obra/superpowers —— 技能方法论框架

**定位**：给 coding agent 的**完整软件开发方法论**，由一组可组合 skills + 启动指令构成，确保 agent 会用它。

**核心功能模块**（14 个 skills）

| 类别 | Skills                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 测试 | test-driven-development                                                                                                                                                                                             |
| 调试 | systematic-debugging / verification-before-completion / diagnosing-superpowers                                                                                                                                      |
| 协作 | brainstorming / writing-plans / executing-plans / dispatching-parallel-agents / requesting-code-review / receiving-code-review / using-git-worktrees / finishing-a-development-branch / subagent-driven-development |
| 元   | writing-skills / using-superpowers                                                                                                                                                                                  |

**技术栈**：Markdown（`SKILL.md`）+ Shell 脚本；通过 16+ harness 的插件市场分发（Claude Code / Codex / Cursor / Gemini CLI / Copilot / Kimi / OpenCode / Pi / Qwen / Hermes / Muse / Devin / Factory Droid / Antigravity / Grok）。

**用户交互设计**：**自动触发**（agent 在任务前检查相关 skills）；设计分块展示（可读可确认）；计划拆成 2–5 分钟任务；subagent 两阶段审查（规格合规 → 代码质量）；`diagnosing-superpowers` 自查会话问题。

**差异化优势**

- **方法论优先**：TDD / YAGNI / DRY / evidence over claims，把「过程」写成内容。
- **跨 16+ harness**：同一套 skills 全平台可用。
- **自动触发**：不需要用户记命令。
- **diagnosing-superpowers**：会话出问题时让 agent 自查并导出脱敏报告。
- **遥测可选且最小**（只读版本号，可关）。

**已知短板**

- **只做 skills/方法论**：不做 rules / terms 管理，不做内容台账。
- **无库/台账**：不管用户有哪些技能、用了哪些。
- 无 GUI、无 Web。
- 遥测虽可选，但对「本地优先、不出网」的 OpenVibe 用户是敏感点。

**迭代路线**：活跃（2026-11-03）；314K★；有商业支持（Prime Radiant）；不接受随意新增 skill（要求跨全平台）。

**可借鉴亮点**

1. **自动触发的 skill 组合** —— OpenVibe 的技巧库/流程模板可补「按任务自动推荐」的触发机制。
2. **subagent 两阶段审查**（规格合规 → 代码质量）—— 若 OpenVibe 做「回流评审」，这是现成的审查模型。
3. **diagnosing-superpowers**（自我诊断）—— OpenVibe 的「覆盖地图 / 可读性量具」是同类思路，可补「一键诊断本会话」。
4. **分块展示设计** —— 长文档分块确认，避免一次性倾倒。

**可规避的问题点**

1. **无内容管理/校验** —— 同前。
2. **遥测争议** —— OpenVibe 的「不出网」是硬约束，不要引入任何默认遥测。

---

### 2.5 github/spec-kit —— 规格驱动开发

**定位**：GitHub 官方的 spec-driven development（SDD）工具包，把需求变成 spec → plan → tasks → implement。

**核心功能模块**：Specify CLI（bootstrap）；SDD 流程；bug-fixing 流程；idea assessment 流程；constitution/steering 文件；EARS 式验收标准；工作流与包（bundle）。

**技术栈**：Python CLI（PyPI `specify-kit`）；模板 + 脚本 + 工作流；agent 集成（Copilot / Claude Code / Gemini CLI 等）。

**用户交互设计**：CLI 脚手架；分阶段流程（spec / plan / tasks / implement），每阶段有闸门；constitution/steering 文件作为持久约束；4.x prerelease（charter rename）。

**差异化优势**

- **GitHub 官方**，生态位强。
- **流程化追溯**：spec → plan → tasks → commit 全链路可追溯。
- **constitution/steering 文件**：把团队约定写成持久约束。
- **EARS 验收标准**：结构化验收条件。
- 活跃维护（最新提交 2026-11-11；稳定版 3.2.7，4.x prerelease）。

**已知短板**

- **流程重**：单人/小项目用着过重。
- **无内容库/台账**。
- **与 OpenVibe 不同轴**：spec-kit 管「开发流程」，OpenVibe 管「上下文标准化」，两者互补而非竞争。
- 无 GUI。

**迭代路线**：活跃；4.x prerelease；charter rename；持续扩充工作流与包。

**可借鉴亮点**

1. **spec → plan → tasks 追溯链** —— OpenVibe 的「需求三面接通」（S3）可参考其追溯结构。
2. **constitution/steering 文件** —— 与 OpenVibe 的「红线」同构，可参考其「持久约束」的写法。
3. **EARS 验收标准** —— OpenVibe 的验收标准可结构化成 EARS 式。
4. **阶段闸门** —— 与 OpenVibe 的 StageGate 同构。

**可规避的问题点**

1. **流程过重** —— 不要照搬完整 SDD 流程到单用户本机场景。
2. **不同轴** —— 不要把 spec-kit 的「流程」误当 OpenVibe 的「上下文管理」竞品。

---

## 3. 横向对比矩阵

### 3.1 核心功能模块对比

| 维度                   | OpenVibe           | rulesync    | skills-manager | teamai-cli       | superpowers    | spec-kit    |
| ---------------------- | ------------------ | ----------- | -------------- | ---------------- | -------------- | ----------- |
| 规则/rules             | ✅ 标准包          | ✅✅ 最强   | ❌             | ✅               | ❌             | ✅ steering |
| 技能/skills            | ✅ 技巧库          | ✅          | ✅✅ 最强      | ✅               | ✅✅ 方法论    | ❌          |
| 术语/提示词            | ✅ 术语库/提示词库 | ❌          | ❌             | ✅（rules/docs） | ❌             | ❌          |
| MCP 配置               | ✅ MCP 桥          | ✅          | ❌             | ✅               | ❌             | ❌          |
| 多工具适配             | ✅ 6 adapter       | ✅✅ 60+    | ✅✅ 56        | ✅ 16+           | ✅ 16+         | ✅ 多 agent |
| 注入到项目             | ✅ 标准包注入      | ✅ generate | ✅ deploy      | ✅ 同步          | ✅ 插件安装    | ✅ 脚手架   |
| **注入后校验（漂移）** | ✅✅ diff/verify   | ❌          | ❌             | ❌               | ❌             | ❌          |
| **本地内容台账**       | ✅✅ 库/圈数台账   | ❌          | ✅ 库          | ❌（在 Git）     | ❌             | ❌          |
| 团队协作               | ❌（M7 P2）        | ❌          | ✅ 备份/多设备 | ✅✅ 最强        | ❌             | ❌          |
| 开发流程追溯           | 部分（S3）         | ❌          | ❌             | ✅ workflows     | ✅ plans       | ✅✅ 最强   |
| GUI                    | ✅ Web             | ❌ CLI      | ✅ 桌面        | 部分 dashboard   | ❌             | ❌          |
| 本地优先/不出网        | ✅✅ 硬约束        | ✅          | ✅             | ❌（Git 同步）   | ✅（遥测可选） | ✅          |

### 3.2 技术栈对比

| 项目           | 形态       | 技术栈                                                    | 分发                      |
| -------------- | ---------- | --------------------------------------------------------- | ------------------------- |
| OpenVibe       | CLI + Web  | Node/TS + Fastify + React 18 + Vite + Tailwind 4 + SQLite | npm tarball               |
| rulesync       | CLI        | TypeScript                                                | npm / Homebrew / 单二进制 |
| skills-manager | 桌面 + CLI | Tauri 2 + Rust + React 19 + SQLite                        | cask / installer / scoop  |
| teamai-cli     | CLI        | TypeScript                                                | npm                       |
| superpowers    | 技能包     | Markdown + Shell                                          | 各 harness 插件市场       |
| spec-kit       | CLI        | Python                                                    | PyPI                      |

### 3.3 用户交互设计对比

| 项目           | 主交互          | 关键设计                                      |
| -------------- | --------------- | --------------------------------------------- |
| OpenVibe       | Web 工作台      | 覆盖地图、设置页量具、库/台账、注入状态表     |
| rulesync       | CLI             | 声明式 jsonc + 特性矩阵 + dry-run             |
| skills-manager | 桌面 GUI        | 三工作区 + preset pill + agent badge + 备份页 |
| teamai-cli     | 对话式（skill） | 一句话安装 + `/teamai` + admin/member         |
| superpowers    | 自动触发        | skills 自动触发 + 分块确认 + 两阶段审查       |
| spec-kit       | CLI 流程        | 分阶段闸门 + constitution 文件                |

---

## 4. 对 OpenVibe 的启示

### 4.1 可借鉴亮点（按优先级）

| 优先级 | 亮点                                                  | 来源                  | 落点建议                                                     |
| ------ | ----------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| P0     | **特性矩阵（工具 × 能力，含「未声明」与 beta 标注）** | rulesync / teamai-cli | 把 OpenVibe 的 6 adapter 能力位扩成常驻矩阵，设置页可查      |
| P0     | **`--dry-run` 式预览 + 反向导出**                     | rulesync              | `diff` 已有只读预览；补「导出到工具原生格式」通道            |
| P0     | **三层工作区模型（Global / Agent / Project）**        | skills-manager        | 与 OpenVibe 的「本机 / 项目 / agent」分层对照，补 agent 维度 |
| P1     | **CLI/MCP for agents**（让 agent 管理技能）           | skills-manager        | OpenVibe 已有 MCP 桥，可补「agent 查询/安装技能」工具        |
| P1     | **skill-aware 合并 + 冲突不阻塞**                     | skills-manager        | 若做技能库同步，直接复用该合并策略                           |
| P1     | **agent badge 状态**（卡片上显示已装/未装）           | skills-manager        | 库卡片显示「已注入/未注入」状态                              |
| P1     | **Preset 语义明确**（一次拷贝 vs 实时同步）           | skills-manager        | 标准包「注入」在 UI 上明确标注为一次性动作                   |
| P2     | **三层能力模型（执行/上下文/改进）**                  | teamai-cli            | 成长页补「改进」层（用得多的资产自动上浮）                   |
| P2     | **subagent 两阶段审查**                               | superpowers           | 回流评审的审查模型                                           |
| P2     | **diagnosing 自我诊断**                               | superpowers           | 一键诊断本会话（覆盖地图/可读性量具的延伸）                  |
| P2     | **EARS 验收标准**                                     | spec-kit              | 验收标准结构化                                               |
| P3     | **一句话安装**                                        | teamai-cli            | 接入流程的「一键接入」已做，可补「发给 AI 工具自动装」       |

### 4.2 可规避的问题点

| 问题点                  | 来源                                              | 规避方式                                                      |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| **只生成/同步，不校验** | rulesync / skills-manager / teamai-cli            | 守住 `diff`/`verify` 的注入后校验，这是 OpenVibe 的核心差异化 |
| **无本地内容台账**      | rulesync / superpowers / spec-kit                 | 守住术语库/提示词库/技巧库/圈数台账                           |
| **只做单一内容类型**    | skills-manager（只 skills） / spec-kit（只 spec） | 保持多类型库（术语/提示词/技巧/流程/标准包）                  |
| **团队向过重**          | teamai-cli                                        | 坚持单用户本机定位（D-v25-7 已裁）                            |
| **流程过重**            | spec-kit                                          | 不照搬完整 SDD 流程                                           |
| **默认遥测**            | superpowers                                       | 坚持「不出网」硬约束，任何遥测默认关                          |
| **纯 CLI 无 GUI**       | rulesync / superpowers / spec-kit                 | 守住 Web 工作台                                               |
| **beta 功能过多**       | teamai-cli                                        | 不一次性铺开多层能力                                          |

### 4.3 建议的落地顺序

1. **先补「特性矩阵」**（P0，纯前端 + 共享数据）：把 6 adapter 的能力位做成工具 × 特性矩阵，设置页常驻。参考 rulesync 的矩阵口径（含「未声明」与 beta 标注）。
2. **再补「反向导出」**（P0）：`diff` 的只读预览已有，补「导出到工具原生格式」通道，对应 rulesync 的 `export`/`convert`。
3. **补 agent 维度的工作区视图**（P0/P1）：在项目/库视图上加「按 agent 看」的一层，参考 skills-manager 的三工作区。
4. **补「agent 通过 MCP 管理技能」**（P1）：与现有多 MCP 工具（project_context / search_assets / pack_diff）并列。
5. **补「改进」层**（P2）：成长页加「用得多的资产自动上浮」，参考 teamai-cli 的三层能力模型。
6. **补「一键诊断」**（P2）：把覆盖地图/可读性量具延伸成会话级自检。

---

## 5. 标准层与内容层（不在 Top 5 但影响设计）

### 5.1 agentskills/agentskills —— 开放标准

- **是什么**：Agent Skills 的开放标准（`SKILL.md` 格式）+ 注册表（agentskills.io）。
- **核心机制**：**渐进式披露**（progressive disclosure）—— 启动只加载 name/description，任务匹配时才读全文，控制上下文占用。
- **对 OpenVibe 的参考**：OpenVibe 的技巧库/技能注入可对照该标准的「发现 → 激活 → 执行」三阶段；`SKILL.md` 的 frontmatter（name/description）值得作为技能条目的格式参考。
- **注意**：标准由 Anthropic 发起、社区维护，MIT/Apache-2.0；采用时注意许可兼容。

### 5.2 anthropics/skills 与 mattpocock/skills —— 内容层

- anthropics/skills（193K★）与 mattpocock/skills（322K★）是**技能内容库**，不是工具。
- **对 OpenVibe 的参考**：内容库的「分类 + 精选 + 安装」形态；但 OpenVibe 定位是**工作台**，不是内容市场，不要把内容库当竞品。

---

## 6. 数据来源与口径说明

- **Star 数与最近提交**：GitHub REST API 实查（`api.github.com/repos/<owner>/<repo>`），采集于 2026-11-12。
- **spec-kit 活跃度**：仓库元数据的 `pushed_at` 字段与 commits API 结果不一致；本报告以 commits API 的最新提交（2026-11-11）为准，判定为活跃。
- **Continue 状态**：GitHub API 元数据（`pushed_at=2026-11-05`、`archived=false`）与多家公开报道（2026-06 被 Cursor 收购、仓库只读、最终版 2.0.0）冲突；本报告以公开报道为准。
- **功能描述**：来自各仓库 README（2026-11-12 抓取）与官方文档。
- **未实测**：本报告为**桌面调研**，未在本地运行任何竞品；功能判断基于公开文档与仓库元数据，落地前应对关键项做真机验证。

---

## 附：来源清单

- [dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync) · [文档](https://rulesync.dyoshikawa.com/)
- [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) · [官网](https://skillsmanager.dev)
- [Tencent/teamai-cli](https://github.com/Tencent/teamai-cli)
- [obra/superpowers](https://github.com/obra/superpowers)
- [github/spec-kit](https://github.com/github/spec-kit) · [文档](https://github.github.io/spec-kit/)
- [agentskills/agentskills](https://github.com/agentskills/agentskills) · [标准](https://agentskills.io/)
- [anthropics/skills](https://github.com/anthropics/skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
- [jiweiyeah/Skills-Manager](https://github.com/jiweiyeah/Skills-Manager)
- [Goldziher/ai-rulez](https://github.com/Goldziher/ai-rulez)
- [lbb00/ai-rules-sync](https://github.com/lbb00/ai-rules-sync)
- [fernandomenuk/openspec](https://github.com/fernandomenuk/openspec)
- [continuedev/continue](https://github.com/continuedev/continue)（已停维）
- [cline/cline](https://github.com/cline/cline)（停更）
- [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code)（已归档）
- [sst/opencode](https://github.com/sst/opencode)（停更）
- [Aider-AI/aider](https://github.com/Aider-AI/aider)（不同类）
