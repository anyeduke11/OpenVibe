# DEV_LOG — OpenVibe

> 按全局开发记录规范追加；编号全局递增。

---

## [DEV-0001] 项目立项：命名、竞品调研与 PRD v0.1.1
- **时间**: 2026-09-20 10:09
- **类型**: 功能开发（项目启动文档产出）
- **关联文件**: `docs/PRD.md`, `docs/competitive-research.md`, `README.md`
- **问题描述**: 用户提出开发「标准化 vibecoding 助手工作台」（管理提示词/skill/vibe 术语/技巧/coding 项目管理流程），需要：①项目命名 ②GitHub 同类项目调研 ③完整 PRD。
- **实现思路**: 按 prd-iterative 技能产出 PRD；因自主执行模式无法进行 7 轮交互澄清，改为「假设显式标注」策略（PRD 第 0 章列 7 项假设待 owner 确认）。竞品调研先行，用调研结论反哺 PRD 的差异化定位。
- **核心变更**:
  - `docs/competitive-research.md`: 新建，9 类竞品对比 + PromptHub 深挖 + 空白地带分析（术语库/技巧库/团队标准包闭环为无人区）
  - `docs/PRD.md`: 新建，9 章完整 PRD：7 模块设计（M1 提示词库/M2 Skill 中心/M3 术语库/M4 技巧库/M5 流程管理/M6 标准包注入/M7 团队），核心业务流「标准化飞轮」，4 Phase 里程碑；含三维审查记录（3 个 P0 修正：CLI 为 MVP 硬依赖、术语注入通道统一走 M6、DevLog 补 evidence 字段）
  - `README.md`: 新建，命名由来（OpenVibe/灵典，GitHub 查重通过）与差异化定位
- **测试验证**:
  - 测试命令: 无代码，不适用
  - 验证结果: 文档交付；名称查重（Web 检索 GitHub）确认 OpenVibe/Vibelex 无同名项目
- **潜在风险**: PRD 中 7 项「[假设]」未经 owner 确认（用户画像/技术栈/形态等），进入 P0 开发前必须评审；竞品数据为 2026-09-20 快照，BMAD star 数等来自二手来源。

---

## [DEV-0002] P0 设计文档集：proposal / specs×7 / design / tasks
- **时间**: 2026-09-20 14:58
- **类型**: 功能开发（设计文档产出）
- **关联文件**: `docs/proposal.md`, `docs/design.md`, `docs/tasks.md`, `docs/specs/{m1-prompt-library,m2-skill-registry,m3-glossary,m5-project-flow,m6-standard-pack,m6-cli-injection,seed-content}.md`, `README.md`
- **问题描述**: DEV-0001 交付 PRD 后，P0 阶段（PRD 第 8 章）要求产出「架构与文件契约定稿 + adapter 清单」及配套实施计划；需将 PRD 的模块级需求细化为可开发、可验收的规格与任务序列。
- **实现思路**: 四层递进——proposal（为什么/做什么/边界）→ specs（逐模块输入输出/边界/验收标准，模块编号与 PRD M1–M6 对齐保持可追溯）→ design（技术方案，标准包文件契约与 adapter 清单作为 P0 冻结对象单列 §7/§8）→ tasks（依赖图 + T1–T9 + 周计划 + DoD）。关键设计决策：CLI 为注入唯一通道（继承审查修正）；标准包纯 Markdown/JSON 且确定性输出（文件内零时间戳，时间集中在 manifest）——幂等导出与漂移检测的数学基础；FTS5 trigram 解决中文子串搜索（<3 字符 LIKE 降级）；种子内容三文件带 schema 与 CI 校验门槛。
- **核心变更**:
  - `docs/proposal.md`: 新建——MVP 范围裁定（M1 完整+M5 完整+M6 完整+M3/M2 瘦身）、成功度量（产品侧+工程侧 pass/fail）、8 项待确认假设表（含新增 A8：npm 包名未核验）
  - `docs/specs/`: 新建 7 份——每份含范围 In/Out 表、实体字段、编号 FR、边界异常、pass/fail 验收标准；m6 拆 Web 侧（组装/导出/版本治理）与 CLI 侧（serve/scan/sync/diff 五状态机）两份
  - `docs/design.md`: 新建——选型表（Fastify/better-sqlite3/无 ORM/CodeMirror 等 12 项含否决理由）、monorepo 结构、DDL 摘要、API 清单、**§7 标准包文件契约**（manifest schema/组合规则/指纹算法/路径安全/lock 格式）、**§8 adapter 清单**（claude-code/cursor/generic-agents MVP + windsurf P1）、安全（Origin+Bearer 双通道）、测试金字塔（含 golden 契约快照）、12 条决策记录
  - `docs/tasks.md`: 新建——P0 门禁 G1–G6、依赖图、T1–T9（26.5 人日，关键路径 T1→T2→T3→T6→T7→T9）、周计划与 PRD「4 周」假设的偏差说明（甲：接受 4.5–5 周；乙：三级砍单序保 4 周）、MVP DoD 五条
  - `README.md`: 仓库结构补全新文件；当前状态勾选「P0 设计文档集」
- **测试验证**:
  - 测试命令: 无代码，不适用（文档交付）
  - 验证结果: 文档内交叉链接与模块编号经逐文件核对与 PRD 对齐（M4/M7 未出规格，与「Phase 2」边界一致）；工期估算 26.5 人日 vs PRD 4 周假设的偏差已在 tasks §3 显式声明并给出 owner 决策项 G6
- **潜在风险**: ① design §7/§8 契约尚未经 owner 冻结（G2/G3），冻结前不应启动 T6/T7；② npm 包名 `openvibe` 可用性未核验（proposal A8，T1 首个动作）；③ 开源协议未定（G4）；④ 中文 FTS 的 trigram 方案索引体积约 ×3，MVP 量级可承受但需在 T2 单测中验证实际查询延迟（design §12 已标注）。

---

## [DEV-0003] PRD v0.2.0：owner 澄清对话定稿 + 文档集联动更新
- **时间**: 2026-09-20 15:48
- **类型**: 功能开发（需求澄清与文档修订）
- **关联文件**: `docs/PRD.md`, `docs/proposal.md`, `docs/design.md`, `docs/tasks.md`, `docs/specs/onboarding.md`(新), `README.md`
- **问题描述**: PRD v0.1 的 7 项假设自产出起未经 owner 确认（DEV-0001 遗留风险①）；用户发起 brainstorming 澄清对话，要求细化 PRD、澄清需求、确定目标。
- **实现思路**: 按 brainstorming 技能走 architectural 路径：先写回理解，再逐题澄清（5 问，一次一题），达成决策后落文档。owner 明确作答 3 题（D1/D2/D3 与 D4，其中 D4 含 D5 连锁）；2 题（协议 G4、工期 G6）未作答，按「不冒充用户选择」原则以默认值生效并显式标注可推翻。
- **核心变更**:
  - 决策台账（PRD 附录 D 新增）：D1 中文社区开源优先；D2 双钩子=标准包注入+流程模板（G1+G2 主、G3 支撑）；D3 可选匿名遥测（默认关/事件三类白名单/可随时关）；D4 预置演示包+≤3 步首启向导+飞轮面板；D5 三平台硬要求（CI 矩阵）；D6 协议默认 Apache-2.0
  - `docs/PRD.md`: v0.1.1→v0.2.0——第 0 章假设表改决策表（10 行）；1.3 加目标权重；1.4 改双层指标口径（遥测下界+生态代理）；2.1 加社区新用户画像（P0）；3.2-M3 补角色说明；新增 3.4 开箱体验与 6.0 首启操作流；4.4 加遥测端点；第 8 章 P1 重估 6 周/30 人日（保 4 周变体备案）；第 9 章加遥测信任与 Windows 兼容两行风险
  - `docs/specs/onboarding.md`: 新建——预置包（可删可重建、不劫持默认行为）、向导（真实副作用红线）、飞轮面板（圈数口径：同项目「导出→注入→回流」去重计数）、遥测开关入口，验收 5 条
  - `docs/design.md`: §2 CI 行加三平台矩阵；新增 §11.5 遥测设计（白名单/单出口函数/自托管端点、禁第三方 SDK）；§13 E2E 冒烟 2→3 条；§16 加 D13/D14
  - `docs/tasks.md`: §0 门禁状态更新（G1 完成、G4/G6 默认生效）；T1 加三平台 CI+LICENSE；T7 加遥测埋点；T8 扩为「种子全量+开箱体验」（1.5→3.5 人日）；§3 周计划重写为 6 周（30 人日）+ 保 4 周变体备案
  - `docs/proposal.md`: 头部状态、§3.1 加开箱体验行、§6 双层指标、§7 P1 6 周、§9 假设表改「假设与决策状态」表（12 行）
  - `README.md`: PRD 版本与状态行、specs 目录加 onboarding.md
- **测试验证**:
  - 测试命令: 无代码，不适用（文档修订）
  - 验证结果: 澄清对话 5 问中 3 问获 owner 明确作答并逐条落档；PRD 变更日志/附录 D 决策记录与第 0 章决策表三处口径互检一致；文档集联动点（proposal §6§7§9、design §2§11§13§16、tasks G/T1/T7/T8/T9/§3）已逐一同步
- **潜在风险**: ① D6 协议与 G6 工期为默认值，owner 发布前推翻需回改 PRD 第 0 章/第 8 章、tasks §0/§3、proposal §7/§9 五处（已在文档内标注可推翻）；② 遥测端点选型（自托管计数服务）留 P1 内决定，若 owner 有既有统计设施应提前告知；③ 向导与面板使 T8 达 3.5 人日，若走保 4 周变体需按 tasks §3 备案顺序后移并记 DEV_LOG。

---

## [DEV-0004] owner 裁定收口：P0 门禁全关 + adapter 扩充国内平台（D7）
- **时间**: 2026-09-20 16:06
- **类型**: 配置变更（决策定案与文档修订）
- **关联文件**: `docs/PRD.md`, `docs/design.md`, `docs/tasks.md`, `docs/proposal.md`, `docs/specs/m6-standard-pack.md`, `docs/specs/m1-prompt-library.md`, `README.md`
- **问题描述**: DEV-0003 遗留两项默认值（协议 D6、工期 G6）与两项契约门禁（G2/G3）待 owner 最终裁定；owner 逐项裁定时对 G3 提出修订意见：adapter 需覆盖国内主流开发 Agent 平台（codebuddy、zcode、minicode、kimi code、Trae 等）。
- **实现思路**: 裁定先行核实后落档——不凭记忆写平台契约（PRD 第 9 章「平台契约变化」风险的正确姿势）：CodeBuddy/Trae/Kimi 走 Web 检索核验（官网文档与社区指南），zcode 用一手证据（本会话即按 AGENTS.md 约定加载指令），MiniCode 检索无果诚实标注「待核验」并挂 T1。设计上区分「专用 adapter」（有专有文件契约：codebuddy→CODEBUDDY.md、trae→.trae/rules/project_rules.md）与「兼容矩阵」（读既有产物：zcode/Kimi/Codex→AGENTS.md），避免为读同一文件的平台重复造 adapter。
- **核心变更**:
  - 裁定落档: D6 Apache-2.0 定案；G6 6 周/32 人日定案（+2 人日国内平台扩充）；G2 契约冻结 v1；G3 adapter 冻结 v1.1（扩充版）；遥测端点按默认自托管
  - `docs/design.md`: §8 重写为「五专用 adapter（+codebuddy/+trae，含核验来源与日期）+ 兼容矩阵表（zcode/Kimi/MiniCode/Codex 等，标注证据强度）」；§7.3 主模板适用文件清单扩充；§16 增 D15（专用×2+矩阵的分层设计理由）
  - `docs/specs/m6-standard-pack.md`: targets 枚举扩为五个；FR-1 步骤4 加兼容矩阵提示；FR-2.1 加 codebuddy/trae 文件映射；验收增 4b（两新 adapter 的文件集与正文一致性）
  - `docs/specs/m1-prompt-library.md`: platformMarks 枚举扩充并注明兼容平台用 generic 覆盖
  - `docs/PRD.md`: v0.2.0→v0.2.1——第 0 章第 10 行转定案并新增第 11 行（D7 平台覆盖）；3.2-M6 文件生成行加 CODEBUDDY.md/.trae/rules；第 8 章工时 32 人日定案；附录 D 增 D7 与变更日志 v0.2.1
  - `docs/tasks.md`: §0 门禁 G2/G3/G4/G6 全部 ✅（G3 尾巴=MiniCode 核验挂 T1）；T1 增平台契约核验收口项；T6 扩五 adapter+兼容矩阵常量+golden 夹具（其一 targets=codebuddy+trae）；§3 工期 32 人日/6 周定案，保 4 周变体备案增第④条（国内 adapter 可后移）
  - `docs/proposal.md`: §7 P1 行与 §9 D6/G6/D7 行同步
  - `README.md`: 状态更新为 P0 全收口
- **测试验证**:
  - 测试命令: 无代码，不适用（文档修订）
  - 验证结果: 平台契约三项核验有据（CodeBuddy 官网+腾讯云文档、Trae 官方 docs+知乎/InfoQ 指南、Kimi 官方文档+GitHub issue），zcode 一手证据，MiniCode 显式标待核验；门禁表 G1-G6 状态与 PRD 第 0 章/附录 D/proposal §9 三处口径互检一致
- **潜在风险**: ① MiniCode 契约未核实（检索无确切产品信息），若 T1 核验发现非 AGENTS.md 约定需加专用 adapter（+0.5 人日，兼容矩阵一行变 adapter 一行）；② Trae 多文件识别行为待复核，MVP 保守用其默认文件名 project_rules.md，若支持自由文件名可改 openvibe.md 以降低与用户手工规则的冲突面；③ Kimi 感知链证据强度中等（官方兼容声明+社区 issue），建议 T6 golden 夹具外的真机抽测一次；④ 32 人日贴 6 周窗口上限，机动仅约 2.5 人日，执行中偏差超 2 人日需回看 tasks §3 变体备案第④条。

---

## [DEV-0005] P0 收尾：四项 spike 核验就地完成 + 四项裁定（D8–D12）落档
- **时间**: 2026-09-20 16:22
- **类型**: 功能开发（核验与决策落档）
- **关联文件**: `docs/PRD.md`, `docs/design.md`, `docs/tasks.md`, `docs/proposal.md`, `docs/specs/{m6-standard-pack,m1-prompt-library,onboarding}.md`, `README.md`
- **问题描述**: DEV-0004 交付报告的「未实现」三项（A8 npm 名、MiniCode 契约、Trae 多文件）与「需补充考虑」两项（工期缓冲、Kimi 抽测）待处理；owner 发起 brainstorming 沟通收口。
- **实现思路**: 分类为「spike 核验 ×4 + bounded 决策 ×4」。核验全部就地执行（只读探针）：npm registry 实测、MiniCode GitHub README 直读、Trae 官方文档（JS 渲染失败）转社区+半官方来源交叉、Kimi 二次检索补强证据。核验产出直接改写决策选项，再经 AskUserQuestion 四问一次收口。
- **核心变更**:
  - 核验结果: ① `openvibe` registry 404 = 可用（备选两名亦空闲）→ A8/G5 关闭；② MiniCode = GitHub 开源轻量终端 Agent（LiuMengxuan04/MiniCode，1.1k★ MIT），`/init` 生成 `MINI.md` → **升为专用 adapter**（D9）；③ Trae `.trae/rules/` 多文件 + frontmatter（trigger: always/manual）由社区仓库与 W3Cschool/火山引擎教程交叉证实 → 文件名改 `openvibe.md`（契约 v1.2，D10）；④ Kimi 证据升「较强」（官方 CLI 文档 + 借鉴 CLAUDE.md 机制报道），T6 真机抽测挂账
  - 裁定落档（PRD 附录 D）: D8 工期 6.5 周（任务 31.5 + 显式缓冲 1 人日，修订原 6 周口径）；D11 向导「我已注入」改 lock 文件自动检测（手动按钮降级保留）；D12 遥测端点自写极简（单文件 Cloudflare Worker，owner 自部署）
  - `docs/design.md`: §8 升 v1.2（六专用 adapter：+minicode→MINI.md；trae 改自定义文件名+trigger:always；兼容矩阵删 MiniCode 行、Kimi 证据升级）；§11.5 端点定案；§16 增 D15 修订/D16/D17
  - `docs/specs/`: m6a targets 六枚举+FR-2.1 文件映射+验收 4b 三平台版；m1 platformMarks +minicode；onboarding FR-2.4 自动确认+边界 2 改写+验收 2b
  - `docs/PRD.md`: v0.2.2——第 0 章第 11 行更新（六 adapter）、3.2-M6 文件清单（+MINI.md、trae 路径 v1.2）、第 8 章 P1 行与工时行（6.5 周/31.5+1）、附录 D 增 D8–D12 与 A8 关闭行、变更日志 v0.2.2
  - `docs/tasks.md`: G5/G6 收口；T1 核验项划掉（P0 期完成，1.5 人日）；T6 5.5 人日（六 adapter+真机复核 checklist）；T8 4 人日（+lock 自动确认）；§3 工期段重写（32.5 人日/6.5 周，W6 后半周=显式缓冲）
  - `docs/proposal.md`: §7 P1 行、§9 A8/D7/D8-D12 行；`README.md`: 状态三行收口
- **测试验证**:
  - 测试命令: `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/openvibe`（=404）
  - 验证结果: npm 三名实测 404；MiniCode/Trae/Kimi 契约均有可引用来源（README 原文、社区+半官方交叉、官方文档+媒体报道）；文档口径终检——grep「待核验/6 周/32 人日/五 adapter/project_rules」无残留矛盾（trae 回退条件为显式预案非矛盾）
- **潜在风险**: ① Trae 文件名证据为社区+半官方（官方 docs JS 渲染未能直读），T6 真机复核不符则回退 project_rules.md（预案已写入 §8 与 T6）；② 6.5 周中显式缓冲仅 1 人日，若 T6 真机复核三项全返工（最坏 +1 人日）将耗尽缓冲，触发 tasks §3 变体④；③ Kimi 子 Agent 感知 bug 属上游问题，兼容矩阵声明「主会话生效」，文档已如实标注。

---

## [DEV-0006] 全文档一致性检修：D7–D12 涟漪全面同步（含 specs）
- **时间**: 2026-09-20 16:26
- **类型**: 重构（文档一致性）
- **关联文件**: `docs/specs/{onboarding,seed-content}.md`, `docs/{PRD,design,tasks,proposal}.md`, `README.md`
- **问题描述**: DEV-0005 落档 D8–D12 时存在涟漪未扫净：owner 指示「更新所有相关文档，包括 SPEC」。全量审计（grep 定向扫描平台枚举/数量编号/产物清单三类口径）发现 10 处不同步。
- **实现思路**: 以「六 adapter + 兼容矩阵」为唯一权威口径（design §8 v1.2），向全部下游文档扇出；同时消除 design §16 与 PRD 附录 D 两套 D 系列编号的歧义。
- **核心变更**:
  - `specs/onboarding.md`: 预置包 targets「三平台全集」→ 全部六 adapter；验收 1 注入产物清单补 CODEBUDDY.md / MINI.md / .trae/rules/openvibe.md
  - `specs/seed-content.md`: 平台标记门槛说明更新——claude-code/cursor/generic 各 ≥4 条维持，codebuddy/trae/minicode 酌情标记不作门槛（多数提示词平台无关）
  - `docs/tasks.md`: DoD「specs 七份」→ 八份（v0.2.0 轮新增 onboarding 后漏改）；§5 风险表「乙③」遗留标签 → §3 变体③
  - `README.md`: 仓库树 PRD 注释 v0.2.0 → v0.2.2
  - `docs/design.md`: §7.4 根级规则文件条目扩为四个（CLAUDE/AGENTS/CODEBUDDY/MINI 同正文）+ trae frontmatter；§16 增编号消歧注记（设计 D 系列与 PRD 裁定 D 系列独立）
  - `docs/PRD.md`: 4.1 架构图分发目标补国内平台；3.2-M2 多平台分发行（P1）补 CodeBuddy/Trae/MiniCode；3.2-M1 平台标记示例补 CodeBuddy
  - `docs/proposal.md`: §3.2 交付形态图目标项目文件清单同步六 adapter 产物
- **测试验证**:
  - 测试命令: `grep -rn "三平台\|七份\|乙③\|五 adapter\|specs×7" docs/ README.md`
  - 验证结果: 修复后仅剩 OS 语义的「三平台」（macOS/Linux/Windows，D5 正当引用）——adapter 语义过时引用清零；specs 八份与 DoD、README「specs×8」三处计数一致
- **潜在风险**: 无新增；此轮属纯文档同步，不涉及已冻契约内容（§7/§8 主体未动，仅 §7.4 表述补全）。

---

## [DEV-0007] 深度竞品对比分析报告（14 项目，含规则同步新品类发现）
- **时间**: 2026-09-20 16:42
- **类型**: 功能开发（竞品分析与文档产出）
- **关联文件**: `docs/competitive-analysis.md`(新), `docs/PRD.md`, `docs/design.md`, `docs/competitive-research.md`, `README.md`
- **问题描述**: owner 要求与市面同类开源 GitHub 项目深度对比。立项快照（DEV-0001 产物）仅覆盖 9 类项目，且未扫描「规则同步」工具品类。
- **实现思路**: 七轮定向检索（PromptHub 现状 / 规则管理工具 / 中文生态 / SDD 赛道 / skills 管理 / Rulix / rulesync）刷新数据并挖掘新品类，以 PRD v0.2.2 定义态为对比基准（诚实标注非已发布产品），按四象限 14 项目展开：能力矩阵 → 重点深挖 5 个 → 平台覆盖 → 架构契约 → SWOT → 七条策略。
- **核心变更**:
  - `docs/competitive-analysis.md`: 新建（~200 行）——四个关键市场更新：①**「规则同步」品类爆发**（rulesync/Rulix/rulebook-ai/agent-rules-sync 等，与 M6 概念空间重叠，立项调研漏扫）；②AGENTS.md 成 Linux 基金会标准（60k+ 项目）；③spec-kit ~90k★ 但维护存疑；④skills 管理内卷（50+ 平台工具）；14 项目能力矩阵（15 维度）；平台覆盖矩阵（国内平台契约层全场独占）；七条竞争策略（错位定位/传播牌/关键词承接/借鉴清单）
  - `docs/design.md`: §8 P1 可选 adapter 补 `copilot`（.github/copilot-instructions.md，借鉴 rulesync 已验证契约）
  - `docs/PRD.md`: 附录 A 改为双报告引用并摘录深度报告关键更新
  - `docs/competitive-research.md`: 顶部加「以深度报告结论为准」指向注记
  - `README.md`: 仓库结构与当前状态各加一行
- **测试验证**:
  - 测试命令: 无代码，不适用（文档产出）
  - 验证结果: 所有项目数据带快照日期与来源链接（star 数标注二手来源）；对比基准的「定义态」属性在报告头部显式声明；借鉴清单明确不动 MVP 范围（copilot 为 P1 可选行、Rulix 校验入 P2/P3 备忘）
- **潜在风险**: ① star 数取自 2026-03/04 盘点（二手），发布前 README 引用具体数字时需再核；② 规则同步品类窗口收窄的判断基于品类密度（半年 6+ 工具），属推断 💡 而非实测；③ Rulix/rulebook-ai 为新兴项目（快照日未取到 star 数），若其快速长大需更新 §四深挖结论；④ spec-kit 维护停滞若被官方修复，「流程裂缝」论据弱化（矩阵结论不受影响）。

---

## [DEV-0008] 评审对话落档：D13–D16 四项裁定 + 文档一致性修复
- **时间**: 2026-09-20 17:20
- **类型**: 配置变更（决策定案与文档修订）
- **关联文件**: `docs/{PRD,design,tasks,proposal}.md`, `docs/specs/{onboarding,seed-content,m5-project-flow}.md`, `docs/competitive-analysis.md`, `README.md`
- **问题描述**: 外部评审（全文档批判性走查 + 竞品支柱事实抽查）提出四问：① M5 首个日活用户是谁；② 0.5 内容编辑是否真人；③ 仓库发布策略（现仓库 git 历史为 Hotspot 排班系统，GPL-3.0，与 Apache-2.0 裁定冲突）；④ 首次注入后一次性 opt-in 遥测询问是否可接受。owner 逐项作答并裁定工期收口方式。
- **实现思路**: 四答转裁定（D13–D16）按既有涟漪路径扇出落档。工期数学重算：原「0.5 内容编辑 ≈ 6.5 人日并行轨」与 owner 单人事实冲突（31.5 + 6.5 = 38 人日 vs 32.5 人日窗口，缺口 5.5），以「AI 起草初稿 + owner 审校 ≈ 2-3 人日 + 变体③转为首选内容兜底」收口，6.5 周维持。M5 价值假设补可证伪触发线。顺带修复评审发现的三处口径漂移与竞品报告裸域链接。
- **核心变更**:
  - D13 遥测「惊喜时刻」询问：首次 sync 成功后一次性 opt-in（CLI 一行 + Web 向导③卡片，双入口共享本地标记 telemetryAskState，拒绝永不再问，白名单三类不变）——落 design §11.5 新增段 + §16-D18、onboarding FR-4.2 + 验收 5b、PRD 第 0 章 12 行/4.4/附录 D、tasks T7/T8
  - D14 内容产能：0.5 编辑并行轨取消，AI 起草 + owner 审校 ≈ 2-3 人日；60 条词条首发可接受（seed 幂等热补至 100，热补即种子升级机制公开演示）——落 PRD 1.4 内容层/第 8 章工时/第 0 章 13 行/附录 D、tasks T4/T8/§3 工期段/§3 变体③、seed-content 执行角色、proposal §6/§7/§9
  - D15 M5 dogfooding 证伪线：发布后两周内工作台真实使用 ≥10 次且 DEV 日志 ≥5 条，否则启动 M5-lite（工作台 UI 后移 P1.1）——落 tasks §5 风险表、PRD 附录 D
  - D16 仓库策略：新开 GitHub openvibe 仓库，初始提交 = docs/README/DEV_LOG + LICENSE + .gitignore（排除 .mimosa/.DS_Store），不携带现仓库 Hotspot（GPL-3.0）历史——落 tasks T1、PRD 附录 D、README 当前状态
  - 一致性修复：tasks T7 4→4.5、T9 2.5→3 人日（对齐 §3 合计 31.5）；m5 端点 `switch-stage` → `stages/current`（对齐 design §6 权威名）；competitive-analysis 裸域链接补直链 5 处（spec-kit #1482 经 2026-09-20 检索证实为 Discussion）
  - PRD v0.2.2 → v0.2.3（版本/状态行、第 0 章 12-13 行、附录 D 增 4 行、变更日志 v0.2.3）；README 树注释与当前状态同步
- **测试验证**:
  - 测试命令: `grep -n "](https://github.com)" docs/competitive-analysis.md`；`grep -rn "内容编辑并行\|switch-stage\|其中词条撰写" docs/ README.md`；`grep -n "预估 4.5 人日\|预估 3 人日\|T7 4.5" docs/tasks.md`；`grep -c "D13" docs/{PRD,proposal,tasks}.md README.md docs/design.md docs/specs/onboarding.md`
  - 验证结果: 人日口径三处一致（T7 4.5 / T9 3 / §3 合计 31.5，头部与汇总不再矛盾）；`switch-stage` 清零；「0.5 内容编辑」仅存于 D14 修订说明语境（非活口径）；裸域仅剩 augmentcode 二手盘点（已标注「直链待补」）；D13 在六份文档落点齐全
- **潜在风险**: ① AI 起草词条质量完全依赖 owner 审校投入，`pnpm seed:check` 门槛是唯一硬闸，60 条首发兜底需如实写入发布说明；② M5 证伪线观察期落在发布后两周，若触发 M5-lite 需另排 P1.1 且双钩子暂缺其一；③ 新仓库须在 T1 脚手架前建好（remote/LICENSE/.gitignore 就位），现仓库在此之前的提交注意不要混入产品代码；④ spec-kit 维护停滞为竞争策略支柱论据之一，其 #1482 讨论若被官方回应化解，「流程裂缝」叙事需更新。

---

## [DEV-0009] PRD 版本重编号 v0.1.3 + P1 详细开发实施方案落档（dev-plan.md）
- **时间**: 2026-09-20 18:05
- **类型**: 配置变更（版本重编号与 P1 执行计划产出）
- **关联文件**: `docs/PRD.md`, `docs/dev-plan.md`(新), `docs/{design,tasks,proposal,competitive-analysis}.md`, `docs/specs/onboarding.md`, `README.md`
- **问题描述**: owner 两项裁定：① PRD 版本整体重编号——v0.2.x 序列压缩并入 v0.1.x，终版 v0.1.3；② 制定详细开发计划，要求覆盖前端/后端/架构/API/数据库/组件/功能，并补 SPEC 流程与规范。
- **实现思路**: 版本映射 `v0.2.0+v0.2.1→v0.1.2`、`v0.2.2+v0.2.3→v0.1.3`，变更日志两行合并重写并保持单调，15 处跨文档引用逐一改写（grep 枚举驱动，DEV_LOG 历史条目按追加式日志原则保留原版本号）。dev-plan.md 按「工程实施方案 + 执行计划」双层定位新建十五节：全部内容从冻结契约（design §7/§8）、specs×8 验收、tasks T1–T9 推导展开，不新造决策；实现推导中暴露的设计缺口按 dev-plan §0.3 变更分级以 **C 级**登记并回写 design。
- **核心变更**:
  - 版本重编号: PRD 头部 → v0.1.3；变更日志 6 行 → 4 行（v0.1 / v0.1.1 / v0.1.2 / v0.1.3，后两行注明合并来源）；README×3、proposal×4、competitive-analysis×2、tasks G1、design §11.5、onboarding 头部同步
  - `docs/dev-plan.md` 新建（约 1100 行，15 节）：§0 SPEC 流程与规范（执行循环/Dogfooding 阶段映射/A-B-C 变更分级/八段式编写规范）｜§1 架构（依赖规则 R1-R4/启动序列/三条数据流/目录三级树）｜§2 数据库（17 表实现级 SQL + FTS 触发器 + migration runner + 事务算法）｜§3 API（8 资源 34 端点 + 错误码总表 + zod schema 清单）｜§4 后端（路由拆分/双通道鉴权/错误处理）｜§5 前端（路由表 + 24 组件 props + Query 失效映射 + 交互要点）｜§6 CLI（五状态机判定伪码/lock/--json/退出码/D13 询问）｜§7 领域核心（repos 签名/composer/fingerprint/validate/importers/seed 幂等）｜§8 adapters（六模块映射/兼容矩阵/T6 真机复核）｜§9 T1–T9 四段式分解 + 验收-测试映射 55 行（覆盖 53 条 spec 验收条目：onboarding 含 2b/5b 增补共 7 条）+ golden 三夹具定义｜§10 日历总表（W1D1–W7D2，人日合计 31.5+1=32.5 与 tasks §3 零偏差）｜§11 内容生产 SOP（批次/起草模板全文/审校清单/热补演练）｜§12 风险触发点（含 D15 证伪线）｜§13 DoD｜§14 遗留评审建议 5 条（未裁定不进 MVP）
  - C 级变更登记（回写 design）: C-1 `app_meta` 表、C-2 `telemetry_events` 表 → design §5 DDL 摘要补两行；C-3 `GET/POST /api/settings/telemetry` → design §6 设置行；C-4 D13 询问单一数据源裁定（app_meta 为权威，CLI 离线时延迟到 Web 向导卡片，不做本地双源）→ dev-plan §6.5
  - `docs/tasks.md` 头部加姊妹文档行；`README.md` 仓库树补 dev-plan.md
- **测试验证**:
  - 测试命令: `grep -rn "v0\.2\.[0-9]" docs/ README.md`；`wc -l docs/dev-plan.md`；`grep -c "^| " docs/dev-plan.md`；`grep -n "app_meta\|settings/telemetry" docs/design.md`
  - 验证结果: v0.2.x 引用仅剩 PRD 变更日志 2 行「合并来源」溯源注记与 DEV_LOG 历史条目（追加式日志不改写的既定原则）；dev-plan 15 节齐全（1339 行）、映射表 55 行覆盖 m1×8/m2×5/m3×5/m5×8/m6a×8/m6b×8/seed×4/onboarding×7 全部 53 条验收（m6b 验收 1 拆 1a/1b/1c 三行）；design §5/§6 已含 C-1/C-2/C-3 回写；人日口径与 tasks §3 一致（T1 1.5 + T2 2.5 + T3 4 + T4 2.5 + T5 4 + T6 5.5 + T7 4.5 + T8 4 + T9 3 = 31.5 + 缓冲 1）
- **潜在风险**: ① dev-plan 的组件清单/SQL/API 示例为实现级推导，T2/T3 落地时若与 spec 验收冲突按 §0.3 分级回流，禁止静默改 spec；② §11 起草模板依赖 AI 输出稳定性，批次审校发现系统性偏差（如 definition 普遍 <20 字）应回改模板而非逐条手补；③ 重编号后外部若有引用旧版本号的地方（如既有讨论/笔记）需口头对齐，仓库内已清零。

---

## [DEV-0010] D17 项目更名 VibeCanon → OpenVibe：npm 主名被占，包名/冷启动命令定为 openvibe-cli
- **时间**: 2026-09-21 10:55
- **类型**: 配置变更（全局更名与契约字符串更新）
- **关联文件**: 全部 17 份 .md + 仓库目录改名（Documents/openvibe → Documents/OpenVibe）
- **问题描述**: owner 裁定整体更名 OpenVibe（含项目文件夹与所有文件）。执行前查证发现两个硬冲突：① npm `openvibe` 已被占用（registry HTTP 200）——冷启动 `npx openvibe` 会安装他人包，击穿 A8 命名门禁；② GitHub 已有多个同名 `openvibe` 仓库，且存在知名项目 OpenViBE（Inria，BCI 领域，大小写不同）。owner 复核后裁定：产品/仓库名 OpenVibe，npm 包名与冷启动命令 `openvibe-cli`（404 实测可用），bin 命令 `openvibe`（装后直呼），中文名沿用「灵典」。
- **实现思路**: 机械替换三档大小写（VibeCanon→OpenVibe / vibecanon→openvibe / VIBECANON→OPENVIBE）+ 前置特判 `npx vibecanon`→`npx openvibe-cli`；**历史核验语句不做机械篡改**——A8/G5 的「registry 404 可用」事实属旧名，逐处保留旧名并补注 D17 新核验，避免伪史；契约层（design §7/§8）按 A 级变更升 **v1.3**（仅字符串更新、结构不变，尚无已发布消费者故无需 schemaVersion 升位）；PRD 升 v0.1.4。DEV_LOG 历史条目中的名称字符串随机械替换更新（映射表见本条目，原文语义未改写）。
- **核心变更**:
  - 替换映射表（旧 → 新）：`VibeCanon`→`OpenVibe`｜`npx vibecanon`→`npx openvibe-cli`｜`vibecanon`→`openvibe`（含 `~/.vibecanon`→`~/.openvibe`、`.vibecanon/`→`.openvibe/`、`vibecanon.pack.json`→`openvibe.pack.json`、`vibecanon-pack-*`→`openvibe-pack-*`、`vibecanon.db`→`openvibe.db`、`.trae/rules/vibecanon.md`→`openvibe.md`、`.cursor/rules/vibecanon.mdc`→`openvibe.mdc`）｜`VIBECANON_SERVER/TOKEN`→`OPENVIBE_SERVER/TOKEN`｜发布名 → `openvibe-cli`（design §9）｜GitHub 仓库名 → `OpenVibe`（D16 相关行）
  - PRD v0.1.3→v0.1.4：第 0 章表 +第 14 行（命名）、附录 D +D17、A8 行改为「旧名事实 + D17 承接」、变更日志 v0.1.4
  - design §7/§8 冻结头注记升 v1.3（结构不变声明）；§9 分发行改写（bin openvibe / 发布名 openvibe-cli / npx openvibe-cli）
  - README：名称由来整节重写（Open+Vibe 语义、更名记录、2026-09-21 核验披露：npm 被占/GitHub 同名/Inria OpenViBE 撞车与「灵典」区隔策略）、状态行 +D17、树注释 v0.1.4
  - tasks G5/T1 两行、proposal A8/上游行、competitive-analysis 基准/上行（v0.1.4）、dev-plan 上游行 + T1 仓库行（`gh repo create <owner>/OpenVibe`、orphan 分支 main-ov）
  - 仓库目录改名：`/Users/duke/Documents/vibecanon` → `/Users/duke/Documents/OpenVibe`
- **测试验证**:
  - 测试命令: `grep -rn -i "vibecanon" README.md docs/`；`grep -rn "npx openvibe " README.md docs/`（裸命令，应为 0）；`curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/openvibe`（=200，被占）；`…/openvibe-cli`（=404，可用）
  - 验证结果: 旧名残留仅存在于 D17/A8/G5/README 更名记录的**有意历史注记**（约 6 处，逐处确认）；`npx openvibe `（裸命令）清零；npm 核验数据如上（2026-09-21 实测）；PRD 版本引用（dev-plan/competitive-analysis/proposal/README 四处）与 v0.1.4 一致
- **潜在风险**: ① 与 Inria OpenViBE 搜索撞车（领域不同、大小写不同，非法律阻断）——中文传播需持续用「灵典」关键词区隔，README 已披露；② 冷启动命令 `openvibe-cli` 比理想名长 4 字符，README 首屏与传播物料需醒目统一；③ `openvibe` 包现为他人所有——任何情况下不接盘、不依赖其行为；④ 本地 `.qoder` 项目记忆按路径索引，目录改名后新路径启用新记忆目录（原路径记忆为空，无迁移损失）；⑤ git 远端（duke.git 存档）不受影响，D16 新仓库落地时统一切换。

---

## [DEV-0011] P1/T1 工程脚手架：新仓库落地 + monorepo + shared 全量 + CI 三平台首跑全绿
- **时间**: 2026-09-21 11:38
- **类型**: 功能开发（P1 首个任务组，dev-plan §9-T1）
- **关联文件**: `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`, `packages/shared/**`, `apps/{server,cli,web}/**`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `LICENSE`, `docs/tasks.md`, `README.md`
- **问题描述**: P1 启动，按 dev-plan §9-T1 十项工作清单搭建工程脚手架并达成三项验收（本地全绿 / CI 三平台首跑 / R3 边界生效）。
- **实现思路**: 仓库落地采用「原地改造」变体执行 D16——dev-plan 原文在家目录切 orphan 分支，但家仓库工作树上有 hotspot 未提交改动（344 文件），切分支将波及其他跟踪文件；改为 `Documents/OpenVibe` 内 `git init` 零历史新仓库（等效达成 D16「不带旧历史」），home 存档仓库 `git rm -r --cached` 解除跟踪（历史保留于 647c6e5）并加入其 .gitignore。远端发现 owner 今早 10:49 已手建 `anyeduke11/OpenVibe`（仅 1 个 auto-init 提交 5653ec6），不强推覆盖，将本地两提交 rebase 其上后普通推送。
- **核心变更**:
  - 仓库: `git init -b main` + Apache-2.0 LICENSE（官方文本）+ .gitignore（.mimosa/.DS_Store/*.db 排除）+ .gitattributes（eol=lf 跨平台纪律）+ CONTRIBUTING（R1-R4 依赖规则 + 跨平台清单）；提交序列 init(5653ec6, owner) → docs 211a345 → scaffold 4d35a3e
  - Monorepo: pnpm workspace（apps/{web,server,cli} + packages/{core,adapters,shared}）+ tsconfig.base（strict/bundler/noEmit）+ 根 scripts（dev/build/test/lint/typecheck/seed:check 占位）
  - `packages/shared` 全量（dev-plan §3.11）: zod schemas×9（prompt/term/skill/flow/project/task+devlog/pack/settings，字段约束对齐各 spec 边界节）+ errors.ts（10 错误码 + code→HTTP 映射 + AppError）+ constants.ts（schemaVersion=1 / 六 adapter / 八类受控词表 / LIMITS / ID 前缀×13）+ ids.ts（前缀 nanoid + idKindOf 反查）+ utils（§7.7 路径安全规则、变量提取正则、TextEncoder 字节口径）
  - ESLint R1-R4: import-x no-restricted-paths 五 zones（shared←上层层、core←apps/adapters、adapters←apps/core）+ 跨 app no-restricted-imports；Prettier
  - vitest 三层: unit（packages+tests）/ integration（server app.inject，/api/health 真实端点）/ cli（临时项目夹具 helper makeTempProject/writeProjectFile/cleanup）
  - CI: GitHub Actions lint+typecheck+test，三平台矩阵（macos/ubuntu/windows，D5），seed:check 挂点注释预留 T4
- **测试验证**:
  - 测试命令: `pnpm i && pnpm lint && pnpm typecheck && pnpm test && pnpm seed:check`
  - 验证结果: lint 0 错误；tsc noEmit 通过；测试 4 文件 10 用例全过（UT-EXAMPLE-01 shared×6 / UT-LINT-01+01b 边界×2 / IT-EXAMPLE-01 health / CLI-EXAMPLE-01 夹具）；CI 首跑 run 35558098022 三平台全 success（2026-09-21 11:37 实测）；R3 生效性以 UT-LINT-01 背书——core 虚拟文件 import `../../../apps/server/src/app` 被 import-x/no-restricted-paths 拒绝，对照组 core→shared 合法
  - 坑位记录: ① pnpm 11 构建脚本审批需 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` + `pnpm approve-builds <pkg>` 双动作，仅前者不消除 ERR_PNPM_IGNORED_BUILDS 退出码 1；② UT-LINT-01 夹具相对路径必须真实可解析（no-restricted-paths 按解析后路径匹配 zone），首版少一层 `../` 未触发
---

## [DEV-0012] P1/T2 存储核心：SQLite 封装 + migrations + FTS5 + 七 repos + seed 骨架
- **时间**: 2026-09-21 11:55
- **类型**: 功能开发（P1 第二个任务组，dev-plan §9-T2）
- **关联文件**: `packages/core/src/db/{index,runner,seed}.ts`, `packages/core/src/db/migrations/000{1,2}_*.sql`, `packages/core/src/search/fts.ts`, `packages/core/src/repos/{prompts,terms,skills,flows,projects,devlog,packs,util}.ts`, `packages/core/src/test-support/new-db.ts`, `packages/shared/src/schemas/*`（Input 类型口径修订）, `pnpm-workspace.yaml`
- **问题描述**: 按 dev-plan §9-T2 七项工作清单落地存储层，达成六条验收映射（UT-MIGRATION/VERSION/CASCADE/FTS/SEED/ENTRYNO）。
- **实现思路**: 严格按 design §5 DDL 逐表建 0001（含 FTS5 trigram 虚表与六触发器，外部内容表方案）+ 0002（app_meta/telemetry_events）；migration runner 自举 schema_migrations 并只前进；FTS 查询路由按 len(q)≥3 MATCH / <3 LIKE；repos 按 §7.1 签名实现，packs 的 preview/export 留待 T6（依赖 composer+adapters）。
- **核心变更**:
  - 依赖: core + better-sqlite3@12.11.1（构建白名单+approve-builds；本地 node 26 与 FTS5 trigram 实测通过）
  - db: openDatabase（WAL/foreign_keys/busy_timeout=5000/自动迁移）；migrate 只前进（文件名升序、单事务、失败回滚）；schema_migrations 由 runner 自举（C 级偏差：dev-plan §2.2 曾把该表放 0001 内，与 runner 自举冲突）
  - 七 repos: prompts（创建即 v1 / 内容变更快照 / restore 以旧版建新版不改写历史 / importBatch title+hash 去重）；terms（renderMd 码点序确定性 + `\|` 转义 / 删除引用清理）；skills（scan + dirHash 忽略 .DS_Store·node_modules + frontmatter 容错回退目录名）；flows（builtin 403 / duplicate 副本去重）；projects（stagesSnapshot 物化 / switchStage 校验 / checkState upsert-delete / healthSummary 三要素）；devlog（entryNo 事务分配+UNIQUE 重试一次 / displayNo 零填充 / export 按类型合并 md / linkAsset 幂等）；packs（CRUD + recordExport 409/幂等 + reportInjection）
  - seed: 三 bundle 幂等（registry contentHash 短路；新条目插入 / seed_hash 非 NULL 则更新 / NULL 跳过+warning；单文件失败不阻塞）
  - shared 口径修订: *Input 类型由 z.infer 改 z.input（默认值字段在调用方可选，repo 内落默认）——修复 T1 遗留的输入类型误用
- **测试验证**:
  - 测试命令: `pnpm typecheck && pnpm test && pnpm lint`
  - 验证结果: 37/37 用例全绿（10 文件）；T2 映射逐条——UT-MIGRATION-01（两版本+重跑空+WAL/FK）✓、UT-VERSION-01/02（3 版本+回滚 v4=v1 / 元数据不变不产生版本）✓、UT-CASCADE-01/02（prompt 版本与 project 三表级联清零）✓、UT-FTS-01/02/03（中文子串「规则漂移」/ 两字 LIKE「漂移」/ 英文「memoiz」/ 术语别名「大模型漂移」）✓、UT-SEED-01/02（跑两遍计数不变 / 升级：新并入+未改更新+用户改过跳过）✓、UT-ENTRYNO-01（1/2/3 递增、跨类型独立、DEV-0001 零填充）✓；另含 dirHash 忽略规则、TERMS.md 两次渲染 sha256 一致、BUILTIN_IMMUTABLE 等前置
  - 坑位记录: ① zod 的 z.infer 对含 .default() 字段产出必填输出态——*Input 必须用 z.input；② newDb 夹具默认自动迁移，显式 migrate 断言需 autoMigrate:false
- **潜在风险**: ① migrations 以 fs+import.meta.url 定位，后续若对 server/CLI 做产物打包需确认 .sql 随包分发；② TERMS.md 的 pinyin 排序暂以 en-alpha 近似（T4 复核，m3 FR-4.2）；③ entryNo 并发重试在单连接 better-sqlite3 下天然串行，多进程写库场景依赖 busy_timeout；④ better-sqlite3 在 CI 三平台需预编译产物可用（node 22 主流 ABI，如遇缺失将回落 node-gyp 编译）。

---

## [DEV-0013] P1/T3 M1 提示词库垂直切片：九端点 API + 四解析器 + Web /library + 浏览器实测
- **时间**: 2026-09-21 15:07
- **类型**: 功能开发（P1 第三个任务组，dev-plan §9-T3）
- **关联文件**: `apps/server/src/{app,index}.ts`、`apps/server/src/plugins/{auth,errors}.ts`、`apps/server/src/routes/prompts.ts`、`apps/server/test/prompts.api.test.ts`、`packages/core/src/importers/{index,rule-files,markdown,json-import}.ts` + `importers.test.ts`、`packages/core/src/db/index.ts`、`apps/web/**`（23 源文件 + vite/tsconfig/index.html）、`pnpm-workspace.yaml`、`docs/devlog-evidence/DEV-0013/**`、`docs/tasks.md`、`README.md`
- **问题描述**: 按 dev-plan §9-T3 六项清单，把 T2 存储层向上打通为可点击的第一条垂直切片——server 骨架（DI + 双通道鉴权 + 统一错误）、提示词九端点、四形态导入解析器、m1 §7 八条验收的 API 行为测试，以及 design §5.2 全部 10 个 Web 组件构成的 `/library` 页面；最后以真实浏览器走查取证（T3 验收要求「UI 项人工过一遍并录屏存档」）。
- **实现思路**: 自下而上分六段（T3a 骨架 → T3b 路由 → T3c 解析器 → T3d 集成测试 → T3e Web → T3f 实测），每段先跑单元/集成再进下一段，避免垂直切片退化为分层堆叠。鉴权与错误处理做成 Fastify plugin 而非路由内联，使 `buildApp({db,token})` 可被 `app.inject` 直接复用（C-7）；解析器放 `packages/core/importers`（不放 server），使 T7 CLI 的 `import` 命令与 Web 共用同一份形态识别；Web 严格只依赖 `@openvibe/shared`（R4 薄客户端），HTTP 层单文件 `api/client.ts` 收口。
- **核心变更**:
  - server 骨架: `buildApp` DI（缺省 `:memory:` 自动迁移 + 随机 token，token 随返回值导出供 config 写入/测试）；`plugins/auth.ts` design §11.2 双通道（Host 白名单 → Origin 正则 → Bearer）；`plugins/errors.ts`（AppError→§3.0 code/HTTP 映射、ZodError→422+`details.fieldErrors`、未知→500 零堆栈）；`index.ts` 最小可跑启动（8787，`OPENVIBE_HOME` 覆盖数据根）
  - 九端点（`routes/prompts.ts`）: list（PromptQuery 全过滤 + 分页）/ create（201 + `warnings`）/ get / patch（`{prompt,versionCreated,warnings}`）/ delete（先扫 `standard_packs.selection` → `X-Referenced-Packs` 头，C-6）/ versions / restore / import（`{items[]}` 或 `{files[]}` 双形态，整批 422 语义）/ export（`?format=json|md`，json 带 `schemaVersion+exportedAt` 附件流，md 单文件拼接每条 frontmatter，C-5）
  - 四解析器（`core/importers`）: `.cursorrules`/`.mdc`（剥 YAML frontmatter 取 description）/`CLAUDE.md`/`AGENTS.md` → `useAs=rule` + 平台标记推断；单 `.md` → 一级标题或文件名；`.json` → FR-7 导出格式回导校验；未知扩展名报错；去重仍归 `PromptsRepo.importBatch`（title+contentHash）
  - Web `/library`: AppShell 七项侧栏 + LibraryPage（列表/分页/状态·平台·标签过滤/搜索 debounce 300ms + <3 字降级提示）+ FolderTree（路径树 + 行拖拽移动）+ PromptEditorDrawer（CodeMirror/react-markdown 双栏懒加载 + 元数据表单 + 变量识别）+ VariableFillModal（必填禁用 + 实时替换预览 + 剪贴板）+ VersionHistoryPanel（两版勾选 → jsdiff 行级 diff → 回滚以旧版建新版）+ ImportExportDialog（FileReader 读文本 → 解析器 → 去重报告 + 导出锚点）；TanStack Query 按 §5.3 表精确失效，中文文案集中 `i18n/zh.ts`
  - 契约级变更登记（续 dev-plan §0.3 C 系列）: **C-5** md 导出为单文件拼接（浏览器无法接收多文件流）；**C-6** 删除引用提示走 `standard_packs.selection` 扫描 + 响应头 `X-Referenced-Packs`；**C-7** `buildApp` DI，§1.2 八步 bootstrap 完整实现留 T7；**C-8** dev 脚本用 `tsx watch`；**C-9** import 只收 JSON body（不收 multipart，Web 侧 FileReader 读文本）；**C-10** 鉴权补 `Sec-Fetch-Site: same-origin|none` 子通道——导出锚点/地址栏请求不带 Origin，原双通道会把它们全 401（实测 200 + 真实落盘）
- **测试验证**:
  - 测试命令: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @openvibe/web build`
  - 验证结果: lint 0 错误；tsc 两遍（node/DOM）通过；**53/53 用例全绿（12 文件：unit 42 / integration 10 / cli 1）**；vite build 成功（编辑器分包 968 kB，见潜在风险①）
  - m1 §7 八条映射: 7.1=IT-API-PROMPT-01 + 截图 02/04/05/06（变量恰两项、未填禁用、替换预览与剪贴板均无 `{{}}` 残留）；7.2=UT-VERSION-01 + IT-API-PROMPT-02 + 截图 07/08（v1/v2/v3 → 回滚出 v4 且内容==v1）；7.3=UT-VERSION-02 + IT-VERSION-02-API（只改 tags → `versionCreated=null`）；7.4=UT-FTS-01/02 + IT-API-PROMPT-03 + 截图 10（两字「漂移」走 LIKE 并显示降级提示、三字「规则漂移」走 MATCH）；7.5=IT-IMPORT-01 + 真实下载 `prompts-export.json`(2146B)/`prompts-export.md`(1271B)；7.6=IT-IMPORT-02 + 截图 11（`.cursorrules`/`CLAUDE.md`/`.md` → `useAs=rule` + cursor/claude-code 标记，报告「新建 3 条，跳过 0 条」）；7.7=UT-CASCADE-01 + IT-DELETE-01 + 截图 14（确认框含「连同全部版本历史硬删」）；7.8=IT-ERR-01（空 title/超 512KB/错 id → 422/404 结构化）；另 IT-AUTH-01 守 design §11
  - 三维审查快查（dev-plan §0.6）: **逻辑一致性**——九端点响应形状与 shared schema 逐一对齐，`versionCreated`/`warnings` 在 UI 与 IT 同口径；**批判性**——浏览器实测推翻了两处「测试全绿即正确」的假象（见坑位①②），并暴露 app.inject 无法覆盖的 header 语义；**第一性原理**——UI 的价值判据统一为「能否替代一次人工复制粘贴」（复制弹窗直写剪贴板、导出直落盘），凡不服务该判据的组件（如批量选择）不进 T3
  - 浏览器实测取证方式: chrome-devtools MCP 的 `take_screenshot` 拒绝向工作区外路径写文件、browser-use MCP 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`，故改用一次性 CDP 驱动器（Node 内建 WebSocket 直连 headless Chrome `--remote-debugging-port`，脚本留在 `/tmp` 不入库）自持截图与日志；产物 16 张 PNG + `walkthrough-log.txt` + 两份真实导出落 `docs/devlog-evidence/DEV-0013/`
  - 实测发现并修复的缺陷（全绿测试未覆盖）: ① **restore 400**——web `api/client.ts` 对无 body 的 POST 仍发 `content-type: application/json`，Fastify 以 `VALIDATION_ERROR: Body cannot be empty` 拒绝；改为「有 body 才设 header」，并在 IT-API-PROMPT-02 补一条「空 body + JSON header → 400」契约断言（`app.inject` 不带该 header，故原九条 IT 全绿仍漏网）；② **toast 串位**——Toaster 用单一 `open` 布尔驱动队列，第二条 toast 会挂在 `open=false` 的隐藏态且首条不自动消失；改为每条 `defaultOpen` 自管、`dismiss(id)` 精确移除，并把定位交给 Viewport 使多条纵向堆叠；③ **回滚后「当前」口径**——VersionHistoryPanel 的 `currentContent` 取抽屉草稿，回滚后草稿未同步导致 diff 恒为 0/0；新增 `onRestored` 回调把服务端内容写回草稿，回滚后 v3↔当前 正确显示「删除 2 行」；④ **/library 首屏白屏**——`@codemirror/lang-javascript` 6.2.5 声明 `@lezer/javascript ^1.0.0` 却需要 1.5+ 的 `SingleExpression` 顶层规则，pnpm 嵌套解析出 1.0.0 后在浏览器抛 `RangeError: Invalid top rule name`；`apps/web` 加直接依赖无效（不改内部解析），最终以 `pnpm-workspace.yaml` 的 `overrides: {'@lezer/javascript': ^1.5.5}` 修复
  - 坑位记录: ① Radix `Tabs.Trigger` 不响应合成 `el.click()`，自动化必须下发真实指针事件；② Radix Toast 的 `[role=status]` 是播报活区（文本带 `Notification ` 前缀），可见 toast 需另取节点；③ CodeMirror `.cm-content` 可比 `.cm-scroller` 宽，点击坐标若按 content 右缘计算会落到编辑器外（`activeElement` 变成外层 DIV），须按 scroller 取点；④ zsh 不对未加引号的变量做词分割，`for id in $IDS` 只迭代一次——批量删除改用 node 脚本；⑤ `create()` 即快照 v1，`update()` 仅在 contentHash 变化时产生新版本（版本计数口径以 §4.1 为准）
- **潜在风险**: ① 懒加载的编辑器分包 968 kB（gzip 321 kB），MVP 可接受但 T8 开箱体验需复核（可考虑按需引 markdown 语言包）；② `/library` 的 UI 证据链依赖一次性 CDP 驱动器（`/tmp/ov-t3f/driver.mjs`，未入库），若需回归该走查须重建脚本或把驱动器正式纳入仓库（T9 E2E 决策点）；③ 鉴权 `Sec-Fetch-Site` 子通道（C-10）在「同 Host 的其他本地进程」面前不设防，与 design §11「本机单用户」前提一致，但多用户/远程化前必须重做；④ 导出 md 为单文件拼接（C-5），与 T6 标准包的「多文件目录树」契约不同，组包侧不可复用该通道；⑤ 文件夹树以 `folderPath` 字符串聚合，无独立实体表，重命名/移动子树在 T4 之后需补 API。

---
