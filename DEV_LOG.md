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

## [DEV-0014] P1/T4 M3 术语库垂直切片：63 条种子 + seed:check 硬门槛 + 五端点 + Web /terms + 浏览器实测
- **时间**: 2026-09-21 16:54
- **类型**: 功能开发 + 内容生产（P1 第四个任务组，dev-plan §9-T4；门槛按 §11.4）
- **关联文件**: `content/seed/{terms.json,flow-templates.json}`、`scripts/seed-check.ts`（删 `seed-check.mjs` 占位）、`package.json`、`pnpm-lock.yaml`、`.prettierignore`、`eslint.config.js`、`.github/workflows/ci.yml`、`packages/shared/src/{terms-md.ts,schemas/term.ts,constants.ts,index.ts}` + `shared.test.ts`、`packages/core/src/repos/{terms,util}.ts` + `terms.test.ts`、`apps/server/src/{index.ts,app.ts,lib/refs.ts,routes/terms.ts,routes/prompts.ts}`、`apps/server/test/terms.api.test.ts`、`apps/web/src/{pages/TermsPage.tsx,components/terms/{TermsTable,TermEditorDrawer,TermsMdPreview}.tsx,hooks/useTerms.ts,i18n/zh.ts,App.tsx,components/AppShell.tsx}`、`docs/devlog-evidence/DEV-0014/**`、`docs/tasks.md`、`README.md`
- **问题描述**: 按 dev-plan §9-T4 四项清单，把 T2 已就位的 `TermsRepo` 向上打通为第二条垂直切片——首批 ≥60 条种子词条（附录 B 十条必含）、`pnpm seed:check` 从 T1 预留的空挂点变成 CI 硬门槛、术语五端点（含确定性 `render-terms-md`）、design §5.2 的 `/terms` 页面；并以真实浏览器走查取证 m3 §7 五条 + seed-content §7 四条验收。术语库是 M6 组包（TERMS.md 素材）与 M5 复盘回流（「存为术语候选」）的上游，故本组的产物契约（表头、转义、排序）必须先冻结。
- **实现思路**: 分五段按序推进（T4a 内容+门槛 → T4b core/shared 术语层 → T4c server 端点+IT → T4d Web → T4e 实测+登记）。把 TERMS.md 的**渲染契约下沉到 `packages/shared`**，让「服务端渲染 / Web 预览 / seed:check 断言 / 导出格式回导」四方共用同一份表头常量与转义函数，避免 T6 组包时出现表头漂移；把「数量、受控词表、definition 长度、example 覆盖率、模板阶段名」全部做成 seed:check 的机器断言而非人工检查（内容 SOP 的可执行化）；`relatedTermIds` 维持**单向存储、双向展示并集**（FR-1.2），删除时按引用方剔除而不级联（FR-1.3），使 UI 与仓储层口径一致。
- **核心变更**:
  - 种子内容: `content/seed/terms.json` **63 条**（附录 B 十条打头：提示词版本/规则漂移/上下文窗口/幻觉/RAG 等；一条一行便于 owner 逐条审校），`flow-templates.json` 三套模板（个人轻量流 3 阶段 / Spec 驱动流 7 阶段 / 复盘流 4 阶段，阶段名与 seed-content §3.3 逐字一致）
  - `scripts/seed-check.ts`（门槛 terms≥60 / templates=3 / prompts=0）: schema 键白名单、`definition` 去空白 ≥20 字、标签须取自 `CONTROLLED_TAG_VOCAB`、example 覆盖率、受控词表、模板阶段数与阶段名，并**用 shared 契约实渲染一遍 TERMS.md** 校验表头逐字一致 + 每数据行恰 5 个裸 `|`（六列）；CI 新增 `Seed check` 步骤（T1 预留挂点自 T4 生效）
  - shared 术语层: `terms-md.ts` 纯函数集（`TERMS_MD_{TITLE_PREFIX,LEAD,HEADER,DIVIDER}`、`escapeMarkdownCell`、`renderTermsMdTable`、`dedupeAliases`、`bidirectionalRelatedIds`、`findMatchRanges`）；`schemas/term.ts` 补 `TERMS_ORDER_BY` 与创建/更新校验（zh/en 至少一项、definition 非空且 ≤4KB、example ≤2KB、别名去重）
  - core 术语层: `TermsRepo` 补 `search()` 的 `matches` 偏移返回与 `renderMd()`（`EMPTY_SELECTION`/`STALE_SELECTION` 在仓储层抛出）；拼音排序取 `pinyin-pro` 词典键，**全仓禁用 `localeCompare`**（design §7.3 确定性，跨三平台 ICU 数据差异会破坏 sha256 复现）
  - server 五端点（`routes/terms.ts`）: list（`{items,total}`）/ create（201）/ search（空 q → `VALIDATION_ERROR`）/ render-terms-md / patch / delete（`X-Referenced-Packs` 头 + 204）；`lib/refs.ts` 把提示词侧的选集引用扫描泛化为 `referencedPackNames(db,id,selectionKey)` 供两类资产共用；`index.ts` dev 入口按 design §15 幂等播种（`OPENVIBE_SEED_DIR` 可覆盖）
  - Web `/terms`: TermsPage（搜索 debounce 300ms + <3 字降级提示 + 状态/标签过滤 + 选集自动剔除不可见项）+ TermsTable（六列 + `<mark>` 高亮按服务端偏移切片 + 种子/自建标记）+ TermEditorDrawer（中英文名/别名/定义/示例/受控标签 chip/相关词勾选 + 反向引用只读展示 + 自引用护栏）+ TermsMdPreview（复制/下载 + 确定性说明）；TanStack Query 按 §5.3 精确失效 `['terms']/['term-search']/['terms-render']`
  - 契约级变更登记（续 DEV-0013 的 C-10）: **C-11** TERMS.md 渲染契约下沉 `packages/shared/src/terms-md.ts`，四方（server/web/seed:check/回导）共用同一实现；**C-12** dev 入口直接 `runSeed`，§1.2 八步 bootstrap（config.json token 持久化等）仍留 T7；**C-13** 种子 JSON 一条一行 + `.prettierignore` 排除 `content/seed/*.json`（prettier 拆行会毁掉逐条 diff）；**C-14** 拼音排序用词典键、禁用 `localeCompare`；**C-15** `flow-templates.json` 提前于 T4 落盘（dev-plan 原列 T5「代码常量」），因 §11.4 的 T4 门槛要求 `templates=3`；**C-16** `seed:check` 由 `.mjs` 占位改为 TS 脚本（根 devDeps 加 `tsx`+`@openvibe/shared`），阈值 60/3/0，T8 切 100/3/20；**C-17** 术语端点统一 `{items,total}` 不分页，且 `render-terms-md` 请求体在路由层放宽为空数组，使 `EMPTY_SELECTION`/`STALE_SELECTION` 由仓储层抛出而非被 zod 的 `VALIDATION_ERROR` 吞掉
- **测试验证**:
  - 测试命令: `pnpm lint && pnpm typecheck && pnpm test && pnpm seed:check && pnpm --filter @openvibe/web build`
  - 验证结果: lint 0 错误；tsc 两遍（node/DOM）通过；**67/67 用例全绿（13 文件：unit 51 / integration 15 / cli 1）**，较 T3 的 53 例净增 14（unit 42→51 即术语 repos +5 与 shared 术语层 +4；integration 10→15 即术语 IT +5）；`seed:check` 通过——`terms ≥60 / templates=3 / prompts=0`、example 覆盖 100%、TERMS.md 渲染 63 行表头/列数一致、模板阶段数 3/7/4；vite build 成功（`index-0VDuKdOH.js` 987.61 kB / gzip 325.49 kB）
  - 门槛负向实测（seed-content §7.1 后句）: 备份后删 5 条 → `[seed:check] 未通过（1 项）✗ terms.json · 数量 — 58 条 < 门槛 60 条`，退出码 1；还原后 `shasum` 与备份逐字节一致
  - m3 §7 五条映射: **7.1**=IT-SEED-REAL-01（真实 seed 文件 63 条导入、二次全 `skipped`、零 warning）+ 走查 01（真实文件库首启「共 63 条 / 其中种子词条 63 条」）+ 复启复验（见下）；**7.2**=走查 02/03/04/05/06（「漂移」LIKE 降级并显示提示、"context" FTS5 MATCH、"RAG" 命中「检索增强生成」且 `matches=en[0,3]+aliases[36,39]`、给「幻觉」加别名「大模型幻觉」后搜该别名命中）+ IT-API-TERM-01；**7.3**=走查 10/11（5 条选集两次渲染 sha256 均为 `5168fd546c134b69…`、en-alpha 与 pinyin 行序确不同、下载产物 sha == 服务端渲染 sha、每数据行 5 个裸 `|` 即 `|` 已转义）+ IT-TERM-RENDER-01 + seed:check 表头断言；**7.4**=IT-TERM-01-API（两个引用方 `relatedTermIds` 均清空 + `x-referenced-packs: term-pack`）+ 走查 13/14（UI 单引用方删除后反向引用行消失）；**7.5**=IT-ERR-02（zh/en 全空 → 422 且 `details.fieldErrors.zh`、库内 total 仍 0）+ 走查 12（UI 护栏两条 toast + 「未落库」断言 true）
  - seed-content §7 四条映射: 7.1=门槛绿 + 删 5 条非零；7.2=首启 63/3/0（阈值 60 先行，100 在 T8 补齐后切换）+ 改内容重启后「未编辑种子并入」；7.3=模板阶段数 3/7/4 与 §3.3 阶段名逐字脚本断言；7.4=definition 去空白 ≥20 字 + 标签须在受控词表内（全量断言，非抽查）
  - 复启与种子升级复验（真实文件库 `/tmp/ov-t4-home`，非 `:memory:`）: ① 种子未变时二次启动三 bundle 全 `skipped` 且**不打印任何日志**（计数不变，§7.1 后句）；② 把 `terms.json` 中「提示词版本」定义追加一句后以 `OPENVIBE_SEED_DIR` 重启 → `seed terms: imported +0 ~62 跳过1` + `warning: 词条已被用户修改，跳过升级: 幻觉`，API 复核未编辑的 62 条已并入新定义、走查中编辑过的「幻觉」四条别名与 `seedHash=NULL` 均保留（m3 FR-2.3）
  - 三维审查快查（dev-plan §0.6）: **逻辑一致性**——seed:check、IT、走查三处共用同一 shared 渲染契约，「裸 `|` 存库、渲染时转义」的不变量由「每数据行恰 5 个裸 `|`」反向锁死；**批判性**——主动推翻两条「绿了即对」的假象：二次启动全跳过是静默路径（无日志），故补两次真实复启取证；2 条选集在 en-alpha 与 pinyin 下行序恰好相同，「换排序即换字节」会假阴性，故把选集扩到 5 条并专挑中英排序分歧的词条（规则漂移 vs 全文检索）；**第一性原理**——术语库的唯一判据是「人与 AI 对同一个词有同一份口径」，故 TERMS.md 的字节确定性优先于交互便利，词条分页、批量编辑、导入向导等无助于该判据的均不进 T4
  - 浏览器实测取证方式: 沿用 DEV-0013 结论——chrome-devtools MCP 的 `take_screenshot` 虽有 `filePath` 参数，但受服务端 workspace 白名单限制（仓库内与 `/tmp` 路径一律 `Access denied`，报错显示其根目录是家目录），browser-use MCP 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`；故仍用一次性 CDP 驱动器（Node 内建 `WebSocket` 直连 headless Chrome，脚本留 `/tmp` 不入库）。产物 **15 张 PNG + `walkthrough-log.txt` + `terms-md-sample.md`（1019 B，真实下载件，sha256 前缀 `5168fd546c134b69`）** 落 `docs/devlog-evidence/DEV-0014/`
  - 本轮修复（走查/typecheck 阶段发现）: ① `TermsMdPreview` 引用了未声明的 `props.orderBy` 且不存在的 i18n key `terms.selection.selected`（typecheck 两处 TS2339/TS2353）——补 props 与 `selection.label`；② 下载按钮 toast 复用了按钮文案「下载 TERMS.md」，改为完成态文案 `preview.downloaded`；③ `TermsTable` 用 `React.ReactNode` 未引入 React，改 `import type { ReactNode }`
  - 坑位记录: ① 表格行内的按钮若落在 900px 视口之外，`getBoundingClientRect()` 仍返回坐标但指针事件点不到——自动化必须先 `scrollIntoView({block:'center'})` 再取点（本轮首跑即在「规则漂移」行静默失效）；② React 受控组件直接赋 `.value` 不触发 `onChange`，须走 `HTMLInputElement/HTMLSelectElement/HTMLTextAreaElement` 的原生 setter + `input`/`change` 事件；③ 搜索框只有 `placeholder`、排序下拉只有 `aria-label`，取值通道要分开（`setByLabel` 只适用于 `<label>`+相邻控件）；④ 「每行 5 个裸 `|`」的日志过滤条件 `!l.startsWith('| 术语')` 会把词条「术语漂移观测」整行误剔，计数只剩 4 行——按表头整行精确比对而非前缀；⑤ `seed:check` 的 definition 门槛按**去空白后**字数计，Markdown 换行与中英混排空格会让目测字数虚高
- **潜在风险**: ① 63 条词条为 AI 起草，dev-plan §11.3 的 **owner 审校尚未发生**（属用户步骤）——`seed:check` 只保证形态与门槛，不保证语义质量；② T8 需再补 ≥37 条至 100、20 条种子提示词，并把 `THRESHOLDS` 切到 100/3/20（脚本常量，切换点须与 §11.4 同步）；③ `X-Referenced-Packs` 的 UI 面在 T4 无真实标准包可引（M6 在 T6），仅 IT 覆盖，且删除确认框只在删除后以 toast 提示，T6 组包后需复核提示位置与文案；④ 术语列表无分页/虚拟滚动，63→100 条后首屏高度与滚动性能需复核（C-17）；⑤ 拼音排序对多音字（如「长会话退化」cháng/zhǎng）取 `pinyin-pro` 词典默认读音，扩量到 100 条时需抽查，必要时在词条上持久化排序键；⑥ UI 证据链仍依赖 `/tmp` 的一次性 CDP 驱动器（未入库），与 DEV-0013 风险②同源，留 T9 E2E 决策点统一处理。

---

## [DEV-0015] P1/T5 M5 项目流程 + M2 Skill 台账垂直切片：29 端点 + Web 四页 + 拖拽「键盘可访问 + 按钮兜底」+ 浏览器实测
- **时间**: 2026-09-21 22:04
- **类型**: 功能开发（P1 第五个任务组，dev-plan §9-T5；含 T5 拖拽裁定与 design D10 的落点）
- **关联文件**: `packages/core/src/repos/{tasks,projects,skills,devlog,flows}.ts` + `{tasks,projects,skills}.test.ts`、`packages/core/src/local/{lock.ts,lock.test.ts}`（新目录）、`packages/core/src/index.ts`、`packages/shared/src/{constants.ts,schemas/{project,task,flow,skill}.ts}`、`apps/server/src/{app.ts,routes/{projects,tasks,devlog,flowTemplates,skills}.ts}`、`apps/server/test/{flow,skills}.api.test.ts`、`apps/web/src/{App.tsx,i18n/zh.ts,api/client.ts,package.json}`、`apps/web/src/pages/{ProjectsPage,ProjectDetailPage,FlowsPage,SkillsPage}.tsx`、`apps/web/src/components/projects/{ProjectList,ProjectWizard,ProjectDashboard,StageBar,ChecklistPanel,KanbanBoard,DevLogList,DevLogEditor,ReflowActions}.tsx`、`apps/web/src/components/flows/{FlowTemplateCard,FlowTemplateEditor}.tsx`、`apps/web/src/components/skills/{SkillList,SkillEditorDrawer,SkillScanReportView}.tsx`、`apps/web/src/hooks/use{Projects,Tasks,DevLog,Flows,Skills}.ts`、`apps/web/src/components/{library/PromptEditorDrawer,terms/TermEditorDrawer}.tsx`（回流反链展示）、`pnpm-lock.yaml`、`docs/devlog-evidence/DEV-0015/**`、`docs/tasks.md`、`README.md`
- **问题描述**: 按 dev-plan §9-T5 六项清单，把 T3/T4 已有的资产库向上接成「一条真实研发流程」——项目 CRUD 与三步建项向导（本地目录只校验不落盘）、流程模板（内置只读 + 复制为自定义 + 阶段裁剪）、看板任务（三列 + 列内排序）、DEV/CHECK 日志与单文件导出、回流双通道（日志段落 → 术语草稿 / 提示词草稿 + 来源反链）、injection-status 只读端点，以及 M2 Skill 台账（扫描发现 / 手动登记 / 版本合并 / 级联删除）。验收口径是 m5 §7 八条 + m2 §7 五条，且 UI 项须真实浏览器走查留证。
- **实现思路**: 分四段按序推进（T5a core 缺口 → T5b server 路由+IT → T5c Web 四页 → T5d 实测+登记），每段先跑测试再进下一段。三条主线约束设计：**① 项目目录只读不写**——`local/lock.ts` 只做 `statSync` 与 `readFileSync`，任何失败降级为旁路字段（注入状态不得影响工作台其他卡片），写入通道整体留给 T7 CLI `sync`（m5 §6.5）；**② 模板与项目解耦按 D10 物化**——建项目即冻结 `stages_snapshot`，模板后续增删阶段/清单项都不回写存量项目，删除模板只把 `flow_template_id` 置空而快照与 `project_check_states` 原样保留；**③ 回流不建新表**——复用 M1/M3 的创建端点，权威源只有 `dev_log_entries.linked_asset_ids`（JSON 列），反链由单一端点解析。拖拽按 T5 裁定实现：@dnd-kit 键盘传感器可达，且同一 PATCH 必须由显式 ↑↓←→ 按钮等价驱动——指针拖拽只是快捷方式，不是唯一入口。
- **核心变更**:
  - core 缺口: 新增 `TasksRepo`（`create/list/move/remove`，跨列与列内重排在**单事务**内整列重写 `order_`，避免两条任务撞同一序号）；`local/lock.ts` 的 `checkLocalPath`（路径不存在/非目录 → 降级为 warning，仍允许保存）与 `readInjectionStatus`（解析 `.openvibe/pack.lock.json` 的 name/version/fingerprint/injectedAt，并生成 `npx openvibe-cli sync <path> --pack <name>` 建议命令、与库内登记版本比对给 `upToDate`）；`ProjectsRepo` 补 `setStage` 与 check-states 读写；`DevLogRepo` 补 `linkAssets`（幂等并入 `linked_asset_ids`）与 `reflowOrigin`（按资产 id 反查日志 → 项目名 + `DEV-00NN`）；`SkillsRepo` 的 `computeDirHash`/`parseSkillFrontmatter`/`defaultScanRoots` 与**手动登记并入**（`create` 即生成无指纹 v1，扫描到同名目录则该手动条目产生 v2 且 `source` 保持 manual）；`FlowTemplatesRepo.duplicate`（`副本`/`副本2`/`副本3` 命名，kind 转 custom）
  - server 29 端点（五个新路由）: projects 9（list/create/get/patch/delete/`POST stages/current`/`GET+PUT check-states`/`GET injection-status`）、tasks 4、devlog+回流 5（list/create/export/`POST devlog/:logId/assets`/`GET /api/reflow-origin/:assetId`）、flow-templates 5（含 `POST :id/duplicate`）、skills 6（list/create/`POST scan`/versions/patch/delete）；内置模板 PATCH+DELETE 由仓储层抛 `AppError('BUILTIN_IMMUTABLE')` → 403；`localPath` 非绝对路径在路由层拒绝（`fieldErrors.localPath`，因相对路径会让 lock 读取目标随 cwd 漂移）
  - Web 四页 / 14 组件 / 5 hooks: `/projects`（ProjectList 健康摘要 + ProjectWizard 三步向导）、`/projects/:id`（ProjectDashboard 四 Tab：StageBar 阶段条 + ChecklistPanel 勾选完成度 + KanbanBoard + DevLogList/DevLogEditor + ReflowActions）、`/flows`（FlowTemplateCard 内置只读徽章 + FlowTemplateEditor）、`/skills`（SkillList + SkillEditorDrawer 版本时间线 + SkillScanReportView 扫描报告）；`@dnd-kit/{core,sortable,utilities}` 提供指针与键盘两种拖拽，每个可拖行同时渲染 ↑↓（列内/阶段内）与 ←→（跨列）按钮，二者调用同一 `useMove` mutation；TermEditorDrawer / PromptEditorDrawer 新增「来源：项目 X 的 DEV-00NN」反链行
  - 契约级变更登记（续 DEV-0014 的 C-17）: **C-18** 新增 `GET/PUT /api/projects/:id/check-states`——dev-plan §3.5 端点清单未列，但勾选记录需要独立写入口，否则「刷新后保持」只能整快照回写（会与 D10 的快照不可变冲突）；**C-19** 不实现 `GET /api/flow-templates/:id`——列表端点已回完整 `stages`，前端无单查需求；**C-20** injection-status 用**夹具 lock 文件**驱动走查，不等 T7 CLI（tasks.md §T5 第 3 项原文即要求「用夹具文件驱动」）；**C-21** 日志正文以 CodeMirror 源码态编辑 + 只读 Markdown 预览呈现（m5 FR-5.2 的「渲染后」按阅读侧满足，不做所见即所得）；**C-22** Skill 版本数以 `GET /api/skills` 行内联 `versionCount` 提供，不建独立计数端点；**C-23** 模板编辑器补 ↑↓ 阶段/清单项按钮（P0 文档只写拖拽）——跨上下文（阶段↔清单项、列↔列）dnd-kit 键盘传感器不覆盖，兜底按钮让同一 PATCH 仍可驱动，是 T5 裁定的落点；**C-24** 扫描根清单的增删改 UI 推到 T8 设置页，本轮走默认根（`~/.claude/skills` + `<cwd>/.claude/skills`）；**C-25** 建项目向导第 3 步为标准包占位（回显 lock 三要素 + CLI 建议命令），项目↔包真实关联由 T6 交付
- **测试验证**:
  - 测试命令: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @openvibe/web build`
  - 验证结果: lint 0 错误；tsc 两遍（node/DOM）通过；**103/103 用例全绿（17 文件：unit 72 / integration 30 / cli 1）**，较 T4 的 67 例净增 36——新增 4 个测试文件 `core/repos/tasks` 14、`core/local/lock` 5、`server/flow.api` 10、`server/skills.api` 5（合计 34），另 `projects.test`/`skills.test` 各补 1 条（模板删除后快照保留 / 手动登记并入）；vite build 成功（`index-BVdGWFxR.js` 1,099.92 kB / gzip 357.68 kB，较 T4 涨 112 kB，见潜在风险①）
  - m2 §7 五条映射（第 1 段，截图 01–07）: **7.1** 造 3 个 skill 目录（1 个无 frontmatter）→ discovered=3/created=3、name 回退目录名、warnings 含 parseWarning；**7.2** 改 SKILL.md 重扫 → updated=1/skipped=3、versions=2、`latestVersionId` 指向末条且指纹不同、抽屉「当前」标记；**7.3** 未变更再扫 → created=0/updated=0/skipped=4 且 `skill_versions` 总数 5→5；**7.4** 手动登记 → 扫描根放同名目录再扫 → 该条目 versions=2、`source` 仍为 manual、`installedTargets` 保留；**7.5** 删除 skill → 只读连接直查 `skills`/`skill_versions` 计数归零，磁盘目录不受影响
  - m5 §7 八条映射: **7.1** 第 3 段 4 行（lock 三要素 + 注入时间 + CLI 建议命令上卡面；库内==lock 判「一致」；库内改 0.2.0 → 「可更新：注入 0.1.0 → 库内 0.2.0」）｜13–18；**7.2** 第 2 段 6 行（复制 Spec 驱动流 → 7 阶段/14 项、删 1 阶段 → 6、加 2 项 → 4 且自动补 id c3/c4、保存 6 阶段/15 项、内置 `stages` 逐字未变）+ 第 3 段快照侧（新项目选该自定义模板 → 快照 2 阶段含新增项，与模板一致）｜08–12、15、16；**7.3** 第 2 段 3 行（内置卡只有「复制为自定义」+「不可直接编辑」、3 张内置卡按钮总数=3、PATCH+DELETE 均 403 `BUILTIN_IMMUTABLE`）｜08；**7.4** 第 3 段 3 行（勾 3/5 → 阶段 60%、全项目 3/8·38%；刷新后 5 条勾选仍在；勾满 → 阶段条 ✅）｜19–20；**7.5** 第 4 段 6 行（键盘 Space→↑→Space 换序、「下移」按钮驱动同一 PATCH、指针拖拽跨列、「移到右列」按钮跨列、`status`/`order`/阶段标签落库、刷新后列内顺序与标签保持）｜23–25；**7.6** 第 4 段 3 行（CodeMirror 真实按键写入、DEV-0001/0002/0003 连号且列表倒序、导出附件名 `DEV_LOG.md` + 编号有序 + `- 测试命令:`/`- 结果:`/`- 关联文件:` 证据段在位）｜26-1…27；**7.7** 第 4 段 6 行（段落级选中 → 抽屉预填 `definition`/`status=draft`、词条 `source=project:走查项目 β`、`linkedAssetIds` 回写 + 「已关联 1 个回流资产」、`GET /api/reflow-origin` 反链、抽屉显示「来源：项目 走查项目 β 的 DEV-0003」；提示词侧按 id 取回 title/content/status=draft）｜28–30；**7.8** 第 4 段 4 行（删除前说明连带 3 日志/3 卡、GET 404、只读连接按 `project_id` 统计 projects/tasks/dev_log_entries/project_check_states 与日志关联总数全为 0、目标目录 README sha256 仍为 `d4fc5a3e…` 且目录内只有 README.md）｜31–32；design **D10** 第 3 段 2 行（模板 +1 阶段 / 删阶段后，存量项目快照与 5 条勾选记录完整保留）｜21–22；m5 **§6.1/§6.5** 相对路径被拦不落库 + 全程未写项目目录
  - 三维审查快查（dev-plan §0.6）: **逻辑一致性**——看板列内顺序的口径统一为「列内 `order_` 从 0 连续」，仓储层整列重写、UI 与 IT 与 SQLite 三方同判；**批判性**——主动推翻两条自我证据：`page.events.filter(e => e.method==='exceptionThrown')` 恒不匹配（真实事件名是 `Runtime.exceptionThrown`），使「页面无未捕获异常」是一条**永真断言**，补 `exceptions()` 通道后重跑四段；以及第 2 段首跑的 3 条 FAIL 全部是我方期望写错（把自定义计数写成 1、臆造阶段名、拖拽高亮探针取了行 1 而非被拖的行 2），逐条回读代码后改判而非改代码；**第一性原理**——M5 的唯一判据是「一个人能在真实项目里跑完启动→开发→复盘并留下可复用资产」，故凡不服务该闭环的都未进 T5（项目分页、批量任务、回收站、zip 打包导出）
  - 浏览器实测取证方式: 沿用 DEV-0013/0014 结论（chrome-devtools MCP 的 `take_screenshot` 受 workspace 白名单限制写不进仓库、browser-use MCP 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`），继续用裸 CDP 自持截图与日志；**harness 从 `/tmp` 迁至 `/Users/duke/.local/share/openvibe-t5d`（持久沙箱，仍未入库）**，含四段幂等脚本 `t5-walk-{skills,flows,projects,kanban}.mjs` 与共用的 `t5-cdp.mjs`（真实 `Input.dispatchMouseEvent`/`dispatchKeyEvent`，非合成 `click()`）。产物 **34 张 PNG + 229 行 `walkthrough-log.txt`（75 项断言全 PASS / 0 FAIL，四段 20/15/17/23）** 落 `docs/devlog-evidence/DEV-0015/`；日志头部记录环境（vite `localhost:5173` IPv6 → tsx `127.0.0.1:8787`、`OPENVIBE_HOME` 沙箱、README 基线哈希、夹具 lock）与「所有点击/拖拽均为真实事件」口径，尾部附本节 §7 映射与 C-18…C-25 偏差清单
  - 本轮修复（走查阶段发现，全绿测试未覆盖）: ① **toast 吞点击**——Radix Toast 右下角可视层是可交互节点，第 4 段首跑三次「添加任务」只成功两次，后续 4 条断言连锁 FAIL 并最终 `no element` 崩溃；改为 `click()`/`drag()` 前置 `dismissToasts()` + `addTask` 轮询重试（重跑后重试次数 `[1,1]`，即无重试）；② **永真的异常断言**——见上；③ **SQL 字面量**——只读断言里用 `JSON.stringify(id)` 生成双引号字符串，better-sqlite3 视作列名报 `no such column: "sk_…"`，改单引号字面量；④ 第 2 段三条错误期望（见批判性）
  - 坑位记录: ① dnd-kit 键盘拖拽进行中，被拖行**仍占原 DOM 索引**（位移靠 transform），故「高亮态」断言必须在 drop 前取原行号，否则采到的是别的行；② server 以 `HOME=沙箱` 启动时 `defaultScanRoots()` 的第二根解析到 `apps/server/.claude/skills`（cwd 派生）必然不存在，扫描报告恒定带一条「扫描根不存在或不可读，跳过」——属预期，故 §7.1 断言只校验 frontmatter 那条 warning；③ vite dev 只绑 IPv6，`127.0.0.1:5173` 连不上，必须 `localhost:5173`；④ `better-sqlite3` 只能在 `packages/core` 为 cwd 时解析（pnpm 嵌套），跨目录调用需显式 `cwd`；⑤ 无独立回流表，`linked_asset_ids` 是 JSON 列，「关联计数归零」需逐行 parse 后求和而非 `COUNT(*)`；⑥ 走查夹具放 `/tmp` 会被系统清理（本项目已发生一次，重跑成本 ≈ 整轮），夹具与 harness 一律落 `~/.local/share/…`
- **潜在风险**: ① Web 主包 1.10 MB / gzip 358 kB（@dnd-kit + CodeMirror + 四页同 chunk），T8 开箱体验必须复核（候选：按路由拆包、看板与编辑器各自 dynamic import）；② 走查 harness 仍在仓库外（`~/.local/share/openvibe-t5d/harness`），与 DEV-0013② / DEV-0014⑥ 同源，`docs/devlog-evidence/DEV-0015/walkthrough-log.txt` 是结果而非可重放的驱动器——留 T9 E2E 决策点统一收口；③ M5 的两周证伪线（D15）要的是真实自用数据，本轮只证明「流程可用」不证明「会被用」，T8 前需 owner 用真实项目跑一遍并记录勾选/日志频次；④ Skill 台账依赖 `~/.claude/skills` 默认根，非 Claude 用户首启是空台账（C-24 后由 T8 的扫描根 UI 解决），届时 §7.1 的夹具根需一并复核是否仍只测到默认根；⑤ injection-status 只解析单个 `pack.lock.json`，design §7.5 若 T6 扩为多包 `entries[]` 则该函数与卡面文案需同步升版（A 冻结契约，先改快照基线）；⑥ 删除项目为硬删（m5 FR-1.5 明确「不可恢复」），当前仅有连带量提示的确认框，无回收站/无输入项目名的强确认，误删只能靠 SQLite 文件备份——T8 开箱前需裁定是否加强。

---

## [DEV-0016] P1/T6 M6a 组包导出 + 契约快照垂直切片：六 adapter + core/pack 五模块 + 11 端点 + Web 五步向导 + 双通道导出 + 真机复核修正 Trae 壳 + 浏览器实测
- **时间**: 2026-09-22 00:52
- **类型**: 功能开发（P1 第六个任务组，dev-plan §9-T6，★ 关键路径；design §7/§8 A 级冻结契约首次落地，并据二进制一手证据完成一次真机复核修正）
- **关联文件**: `packages/shared/src/pack-contract.ts`、`packages/adapters/src/{registry,compat,claude-code,cursor,generic-agents,codebuddy,trae,minicode}.ts` + `adapters.test.ts`、`packages/core/src/pack/{composer,fingerprint,validate,bundle,resolve,index}.ts` + `pack.test.ts`、`packages/core/src/db/migrations/0003_pack_exports_bundle_json.sql`、`packages/core/src/repos/packs.ts`、`apps/server/src/{routes/packs.ts,lib/pack-assemble.ts}`、`apps/server/test/packs.api.test.ts`、`apps/web/src/{pages/{PacksPage,PackNewPage}.tsx,components/packs/{PackWizard,AssetPicker,PackPreviewPane,PackDetailSheet,ExportHistoryPanel}.tsx,hooks/usePacks.ts,i18n/zh.ts,App.tsx,components/projects/ProjectWizard.tsx}`、`tests/golden.test.ts` + `tests/golden/{fixtures.ts,G1/**,G2/**,G3/**}` + `scripts/golden-update.ts`、`.gitignore`、`docs/{design.md,dev-plan.md,tasks.md}`、`docs/devlog-evidence/DEV-0016/**`、`README.md`
- **问题描述**: 按 dev-plan §9-T6 七项清单，把 T3/T4/T5 沉淀的提示词 / 术语 / skill / 流程模板，经 design §7（A 级冻结契约，schemaVersion 1）组合成可注入的**标准包**——一次「组装 → 预览 → 导出 → 版本治理」的闭环。验收口径是 m6a §7 七条 + design §7/§8 与实现零偏差（golden 快照背书），且 UI 项须真实浏览器走查留证、平台壳须真机一手证据。核心难点是 §7.3 确定性（正文零时间戳、可重复预览）、§7.6 指纹（`path\tsha256` 码位序拼接）、§7.8 版本不可变（`UNIQUE(pack_id,version)` + 漂移 409），以及「预览所见字节 = 磁盘导出字节」这条 A 级承诺。
- **实现思路**: 分六段按序推进（T6a shared 契约 + 六 adapter → T6b core/pack → T6c golden ×3 → T6d server 路由 + IT → T6e Web 向导 → T6f 真机复核 + 走查 + 登记），每段先绿再进。四条主线约束设计：**① 单一生成器**——preview 与 export 都走同一 `renderPack`，仅 `exportedAt` 入参不同（preview 传 `pack.updatedAt`、export 传 `nowIso()`），从根上保证「所见即所得」，§7.2 唯一字节例外即 manifest 的 `pack.exportedAt`；**② 契约类型上收 shared**——`pack-contract.ts` 是 web/server 唯一合法类型出处（R2 边界：adapters 内部类型不外泄）；**③ 导出即物化**——`pack_exports.bundle_json`（migration 0003）存整包，删源资产 / 删目录都不影响历史 bundle（§7.5）；**④ 兼容矩阵只展示不分支**——`coveredPlatforms()` 按产物路径反查矩阵、口径为「额外覆盖」，新增平台加一行零代码。
- **核心变更**:
  - core/pack 五模块: `composer.ts`（§7.2 组合规则：受管标记 begin/end、TERMS.md 转义、CHECKLIST `- ` 未完成项、四根级规则文件正文一致、排序键 `compareCodeUnit`+`termSortKey`）；`fingerprint.ts`（§7.6 对排序后 `path\tsha256(content)` 串接取 sha256）；`validate.ts`（§7.7 路径净化 / slug / targets≥1）；`bundle.ts`（单文件 bundle 打包解包 + 目录形态 `<name>@<ver>/{openvibe.pack.json,files/<相对路径>}`）；`resolve.ts`（selection→内容快照，引用资产被删一次性报全部 `STALE_SELECTION`，§6.2 快照语义只护已导出实例）
  - adapters 六模块 + registry + compat: 每 adapter 决定唯一主文件与 frontmatter；`registry.ts` 的 `planMainFiles`/`coveredPlatforms`；`compat.ts` 七行矩阵（Cline/Codex/Kimi Code/OpenCode/Qwen Code/Trae CN/zcode 全读 `AGENTS.md`），行正确性由 UT-ADAPTER-04 守
  - server 11 端点: packs CRUD（list/create/get/patch/delete）+ `preview`/`export`/`exports`/`exports/:exportId/bundle`（attachment + `x-pack-fingerprint`）/`injections` + `POST /api/injections`；错误码 409 `VERSION_IMMUTABLE`、422 版本回退（`fieldErrors.version: string[]`）、`STALE_SELECTION`、`NAME_CONFLICT`、`EMPTY_SELECTION`；`lib/pack-assemble.ts` 把 `PreviewOut.files` 拼上 manifest 并按码位序排
  - Web: `/packs`（PacksPage 列表 + PackDetailSheet 详情抽屉 + ExportHistoryPanel 导出历史 + 删除确认框）、`/packs/new` 与 `/packs/:id/edit` 共用 PackWizard 五步（基本信息 / 流程 / AssetPicker 三栏 / 目标平台 / PackPreviewPane 预览即产物）；`usePacks.ts` 六 hook，`PACK_STALE_TIME=15s`
  - golden 三夹具: G1（claude-code+generic-agents，恰 4 文件）、G2（codebuddy+trae+minicode，国内三平台正文一致 + trae `alwaysApply` 壳）、G3（全六 targets + skill + 含变量 rule），全部产物字节级断言进 CI；`scripts/golden-update.ts` 显式升版
  - 契约级变更登记（续 DEV-0015 的 C-25）: **C-26** Trae 壳 frontmatter 从 design 原稿 `trigger: always` 修正为 `{ description, alwaysApply: true }`（裸 description 值）——Trae CN 二进制一手证据：解析器只认 `globs`/`alwaysApply`/`description`/`scene` 四键、未知键静默丢弃，`trigger` 不触发自动加载；`.trae/rules/openvibe.md` 自定义名保留（同二进制证实目录支持多规则共存），§8.4 的 `project_rules.md` 回退预案**未触发**；design §7.4/§8.4 + dev-plan §8.2/§8.4 + tasks 同步修正，golden G2/G3 基线本已是 `alwaysApply`，属文档滞后于已发字节的订正、非行为变更；**C-27** 契约类型落 `packages/shared/src/pack-contract.ts` 而非 `adapters/src/types.ts`（R2 import 边界，shared 是 web/server 唯一合法跨层类型出处）；**C-28** `manifest.files` 不含 manifest 自身，`exportedAt` 由调用方传入，§7.2「预览字节 = 导出字节」的唯一例外是 `openvibe.pack.json` 的 `pack.exportedAt`（走查 E9 实证磁盘与 API manifest 仅此字段不同）；**C-29** `coveredPlatforms` 口径为「额外覆盖」——只来自兼容矩阵、按产物路径反查、所选平台自身不重复列，矩阵删去早期臆造的 `CLAUDE.md` 行、保留 `Trae CN → AGENTS.md`；**C-30** §7.3「terms 为空时内联术语兜底」不实现——FR-2.1 保证 terms 非空必生成 TERMS.md、正文恒为一行引用，兜底分支不可达（`composer.ts:122` 注记）；**C-31** `fieldErrors` 归一为 `string[]`（`zodIssuesToFieldErrors`），422 与 409 共用同一形状，前端零分支；**C-32** 排序键合并为 `compareCodeUnit`（码位序，替代 `localeCompare`）+ `termSortKey`，供 composer 三处排序与 bundle 文件序共用；**C-33** 注入块 begin `<!-- openvibe:pack=<name>@<ver> begin (regenerate: npx openvibe-cli sync) -->` / end `<!-- openvibe:end -->`，end 前留空行，CHECKLIST 未完成项用 `- ` 而非 `- [ ]`；**C-34** frontmatter 逐字渲染差异（cursor description 带引号、trae 裸值）按各二进制实际接受形态产出，golden 锁字节；**C-35** `routes/packs.ts` 实为 **11 端点**，dev-plan §3.8 标题「6 端点」系 P0 早期估算未随工作项同步，本切片如实标注、§3.8 标题留 T8 文档一致性检修统一收口；**C-36** C-25 收口——项目↔标准包真实关联由 `standardPackId`+`standardPackVersion` 落库，建项向导第 3 步选中已导出包即 PATCH 写入并给可复制 `openvibe sync <path> --pack <name>@<version>`（版本取最新导出），未导出包给 amber 提示；**C-37** m6a FR-4.3「相对上次导出的变化」实现为**指纹差异提示**（preview 指纹 ≠ 上次导出指纹 ⇒ changedSince 文案），非逐资产 diff（资产级 diff 属 M6b 增量同步，不预支）；**C-38** `.gitignore` 未锚定的 `packs/` 命中 `apps/web/src/components/packs/`，致 5 个 T6e 组件被 git 忽略（永不入库）且 Tailwind 扫描跳过（`lg:grid-cols-3` 不生成、三栏在 1440px 塌陷为单列），改 `/.openvibe/` + `/packs/` 锚定修复——走查期间由「三栏变一栏」反查发现；**C-39**（2026-09-22 回填）Trae CN GUI 手工核验通过：owner 实机在 golden G3 产物副本里投两枚暗号（A 在 `.trae/rules/openvibe.md`、B 在 `AGENTS.md`），不引用文件发问后**两枚全对** ⇒ ① `alwaysApply: true` 确实使自定义名规则每次对话自动进上下文，C-26 从二进制推断升为 GUI 一手证据；② `coveredPlatforms` 的 `Trae CN → AGENTS.md` 行保留（证据强度订正为「一手 GUI 实测」，此前风险⑤所指缺口闭合）；③ dev-plan §8.4 的 `project_rules.md` 回退预案正式关闭；④ 无契约变更，golden G2/G3 基线不动（证据 `docs/devlog-evidence/DEV-0016/trae-gui-manual-check.txt`）
- **测试验证**:
  - 测试命令: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @openvibe/web build`
  - 验证结果: lint 0 错误；tsc 两遍（node/DOM）通过；**152/152 用例全绿（21 文件）**，较 T5 的 103 净增 49——新增 `core/pack/pack.test.ts` 20（UT-COMPOSE-01/02 等）、`adapters/adapters.test.ts` 11（UT-ADAPTER-01…04）、`server/packs.api.test.ts` 11（IT-PACK-01…10 + 错误码）、`tests/golden.test.ts` 3（G1/G2/G3）；vite build 成功且订正 `.gitignore` 后 `lg:grid-cols-3` 正常产出
  - m6a §7 七条映射: **1** 连续两次 preview sha256 全一致｜UT-COMPOSE-02 + 走查 E（预览可重复）；**2** preview 字节 = 磁盘导出字节｜IT-PACK-01 + 走查 E8（正文逐字节等）；**3** 409 → 升 v1.1.0 成功且指纹不同｜IT-PACK-02 + 走查 E17/E20；**4** 恰 4 文件（CLAUDE/AGENTS/TERMS/manifest）｜GOLDEN-G1；**4b** 国内三平台正文一致 + trae frontmatter｜GOLDEN-G2；**5** 删提示词不影响已导出（物化）｜IT-PACK-03 + 走查 E22（旧 bundle 指纹不变）；**6** bundle 被 `sync --file` 消费｜**CLI-SYNC-06（T7 联测项，本切片未建 CLI，留 T7）**；**7** 三种 4xx 结构化错误码｜IT-ERR-03 + 走查 E17(409)/E19(422)/H(STALE)
  - 真机复核（一手证据，非提案）: **Trae CN** `/Applications/Trae CN.app` 二进制 `workbench.desktop.main.js` 命中 `alwaysApply===!0?IS.AlwaysApply:…`、`alwaysApply":a.alwaysApply=g.toLowe…`、`.trae/rules/`、`project_rules.md`，且 `trigger:always` 作为规则键**零命中** → 坐实 C-26（证据 `docs/devlog-evidence/DEV-0016/trae-frontmatter-probe.txt`）；**Codex CLI 0.144.6** 原生二进制含 `core/src/agents_md.rs`、`AGENTS.md`/`AGENTS.override.md`、「root of the repo and any directories」、「More-deeply-nested AGENTS.md files take precedence」、「Failed to read global AGENTS.md」→ 坐实 generic-agents 主文件与兼容矩阵 `Codex→AGENTS.md` 行（证据 `codex-agents-probe.txt`，binary sha256 前缀记录在文件头）
  - 三维审查快查（dev-plan §0.6）: **逻辑一致性**——「预览即产物」在 server（单一 `renderPack`）、golden（锁字节）、走查（DOM `pre` 逐字节 = API）三处同判，`exportedAt` 唯一例外三处口径一致；**批判性**——主动推翻两条自我证据：① 三栏塌陷最初误判为「dev server 缓存 / Tailwind 未热更」，`touch index.css` 无效后递归遍历 CSSOM 才发现 `lg:grid-cols-3` 根本没进产物，顺藤摸到 `.gitignore` 吞源码（C-38），改判为真缺陷而非环境噪声；② 探针脚本 `if (r.cssRules)` 分支在 Chrome 里对每个 CSSStyleRule 都为真（嵌套样式表），导致首版 gridCols 命中恒 0 的假阴性，改 `selectorText` 优先判定；**第一性原理**——M6a 唯一判据是「一份选集能确定性地产出跨工具一致、可回放下载的包」，故凡不服务该闭环的都未进 T6（增量 diff、多包 lock、CLI 注入、回收站）
  - 浏览器实测取证方式: 沿用 DEV-0013/0014/0015 结论（chrome-devtools MCP `take_screenshot` 受 workspace 白名单写不进仓库、browser-use MCP `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`），继续用裸 CDP 自持截图与日志；harness 落持久沙箱 `/Users/duke/.local/share/openvibe-t6/harness`（仍未入库），含 `t6-cdp.mjs`（新增页内 `fetch` 记录仪 `recordFetch()`/`reqs()`，断言「请求真的发出 + 服务端回了什么状态」）+ 两段脚本 `t6-walk-wizard.mjs`（66 断言）/`t6-walk-manage.mjs`（16 断言）。产物 **8 张 PNG + `walk1-wizard-log.txt`(66 PASS) + `walk2-manage-log.txt`(16 PASS) + 两份真机探针 `*-probe.txt`** 落 `docs/devlog-evidence/DEV-0016/`；日志头部记录环境（vite `localhost:5173` IPv6 → tsx `127.0.0.1:8787`、`OPENVIBE_HOME` 沙箱）与「点击/导出请求均真实发出并断言 HTTP 状态」口径
  - 本轮修复（走查阶段发现，全绿测试未覆盖）: ① **`.gitignore` 吞源码**（C-38）——`packs/` 未锚定，5 个 Web 组件既进不了 git 也进不了 Tailwind 扫描；② **toast 采样竞态**——单次读 toast 易与 Radix 挂载抢跑（duration 4000ms，非过期），改 `clickExport` 内 11×150ms 采样 + 断言 HTTP 状态双证；③ **headless 偶发吞点击**——导出按钮点击未触发请求时补点一次；④ `pre` 尾换行被 `innerText` 吃掉，逐字节比对改用 `textContent`
  - 坑位记录: ① Tailwind v4 自动内容扫描**尊重 `.gitignore`**，被忽略的源码目录其 utility 不会生成——症状是「类名在 DOM 上但计算样式不生效」，须查 `dist/*.css` 而非只看 dev server；② `.gitignore` 里像 `packs/`、`build/` 这类通用名一旦不锚根，会连带命中 `src/**/<同名>/` 源码目录，务必 `/packs/` 前缀锚定；③ 直接打 API 触发导出不会让 React Query 失效（`staleTime` 15s），走查里跨通道看新导出记录要先 `reload()` 清缓存；④ 断言「请求发出」须靠页内 fetch 包装，`pollFor(bodyText 变化)` 会被上一轮 toast 残留骗过；⑤ CSSOM 递归遍历判 style rule 要先看 `selectorText` 再看 `cssRules`（Chrome 里两者对 CSSStyleRule 同时为真）
- **潜在风险**: ① 63 条词条仍是 AI 起草、owner 审校未发生（承 DEV-0014），标准包 TERMS.md 质量随词条质量，T8 前不闭合；② m6a §7 第 6 条（bundle 被 `sync --file` 消费）本切片只到「bundle 可下载且指纹自证」，真正的 CLI 消费闭环在 T7，T6↔T7 契约缝（`pack.lock.json` 格式、`--pack name@ver` 解析）须 T7 首跑即回测；③ 走查 harness 与探针脚本仍在仓库外（`~/.local/share/openvibe-t6/harness`），`docs/devlog-evidence/DEV-0016/*.txt` 是结果非可重放驱动器，与 DEV-0013/0014/0015 同源，留 T9 E2E 决策点统一收口；④ `.gitignore` 教训（C-38）暴露「源码目录名 == 运行时产物目录名」的系统性风险，T8 应加一条 CI 守卫：`git ls-files --others --ignored --exclude-standard` 命中 `apps/**` 或 `packages/**` 即 fail；⑤ ~~coveredPlatforms 依赖兼容矩阵行正确性，Trae CN/Kimi 的 AGENTS.md 读取行为是二进制/文档推断，真实 GUI 手工清单（owner 3 分钟）结果待回填本节~~ **已闭合（2026-09-22）**：Trae CN 双通道暗号实测全对（C-39，`trae-gui-manual-check.txt`）；余下 Kimi Code 仍为文档证据，待有真实客户端时补同法抽测；⑥ 目录导出落 `OPENVIBE_HOME/packs/`，与仓库运行时同名，多用户共享 HOME 时的并发导出未加锁（单用户 MVP 可接受，T8 开箱复核）。

---

## [DEV-0017] 缺陷修复：skill 版本时间序被随机 id 兜底翻转（CI macOS 首曝，本地 11/25 复现）
- **时间**: 2026-09-22 11:02
- **类型**: 缺陷修复（CI 三平台不对称暴露；T5 遗留，无契约变更、无 migration）
- **关联文件**: `packages/core/src/repos/skills.ts`、`packages/core/src/repos/skills.test.ts`
- **问题描述**: push `adf7780`（只改文档 + `compat.ts` 一行展示文案）后，CI run 35680932897 的 `verify (macos-latest)` 在 `packages/core/src/repos/skills.test.ts:115` 失败：`expected 'skv_KI_xxDVseGNTrv-X-Fyqr' to be 'skv_dghoeInU3JI4wW9Fsjzgv'`——同一 commit 的 ubuntu 与 windows 全绿。表面看是「文档提交弄挂了测试」，实际不成立：该 commit 未触碰任何 skill 代码路径。
- **原因分析**: 根因是**排序键不确定**，不是文档改动。`SkillsRepo.versions()` 用 `ORDER BY scanned_at ASC, id ASC`，而 `nowIso()` 精度只到毫秒（`packages/core/src/db/runner.ts:8`）、`id` 是 `nanoid()`（`packages/shared/src/ids.ts:4`）。`create()` 与紧随其后的 `scan()` 产生的两条版本几乎必然落在同一毫秒，平局于是交给随机字符串——「最后一条 = 最新」变成抛硬币。macOS arm64（runner 与本机）快所以稳定撞见；Linux/Windows 因 `computeDirHash` 的目录走查跨过毫秒边界而侥幸通过。三段证据：① 本机同文件重跑 25 次失败 **11 次**；② 一次性探针 6/6 次采到两条版本 `scanned_at` 逐字符相同（如 `v1@02:55:33.895Z` 与 `my-skill@02:55:33.895Z`），其中 2/6 次排序末条 ≠ `latestVersionId`；③ 新增回归用例以「后落库的行带更小随机 id」构造平局，修复前 **100%** 失败。
- **解决方案**: `versions()` 的平局兜底由随机 `id` 改为 **`rowid ASC`**（SQLite 隐式 rowid 即落库序，本表非 WITHOUT ROWID），一行改动打在不确定性的源头而非测试断言上。选它而非加 `seq` 列，是因为仓内已有同型先例：`devlog.ts:143` 用 `created_at ASC, rowid ASC`、`prompts.ts:251` 用单调 `version_no ASC`——本表只是漏了这一层。
  - 同类排查（结论驱动，非顺手改）: `devlog` 有 rowid + `entry_no` 双兜底 ✅；`tasks` 的 `ORDER BY order_, id` 中 `order_` 由 `MAX(order_)+1` 与整列重写保证同列唯一，`id` 兜底不可达 ✅；`packs.ts:176/247` 导出历史列表在同一毫秒双导出时次序不定 ⚠️，但仅影响展示、且 `:281` 取「最新导出」另有 `version DESC` 确定兜底 → 本次不动，记入潜在风险①。
- **测试验证**:
  - 测试命令: `npx vitest run packages/core/src/repos/skills.test.ts`（含 25 次循环）+ `pnpm lint && pnpm typecheck && pnpm test`
  - 新增用例 `同一毫秒落库的版本按落库顺序返回（id 兜底会把顺序颠倒）`（确定性复现根因）；既有 §7.4 用例补 `expect(vers.map(v => v.versionLabel)).toEqual(['v1', 'my-skill'])`，把「时间序」从隐含假设写成显式期望
  - 验证结果: 修复前本地 11/25 失败 + 新用例 100% 失败 → 修复后 **0/25 失败**；lint 0 错误；tsc 两遍通过；**153/153 用例全绿（21 文件）**；golden ×3 基线未动（确认无契约漂移）
- **潜在风险**: ① `packs.ts:176/247` 的导出历史列表在同一毫秒双导出时展示次序不定（无正确性反转，仅顺序抖动），T8 与「最新导出」的 `version` 字典序缺陷（`1.0.10 < 1.0.9`）一并收口；② 本缺陷类是「毫秒时间戳 + 随机 id 兜底」，任何只存 ISO 时间戳的新表都会复发，T8 建议加守卫：`ORDER BY` 出现 `<ts 列>, id` 形态即 fail（与 DEV-0016 风险④的 `.gitignore` 守卫同批）；③ 三平台 CI 里 macOS 会持续最先暴露时序类缺陷，「本地 25 次循环重跑」应作为此类 flake 的标准诊断动作，而不是看一次绿就收工。

---
