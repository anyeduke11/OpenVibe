# OpenVibe · 灵典

[![CI](https://github.com/anyeduke11/OpenVibe/actions/workflows/ci.yml/badge.svg)](https://github.com/anyeduke11/OpenVibe/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)](./package.json)

> **Vibe coding 的标准化工作台** —— 把提示词、Skill、术语、技巧和项目流程变成可管理、可复用、可分发的工程标准。

## 名称由来

- **OpenVibe** = Open（开源 · 开放）+ Vibe（气韵/灵感）——直接承载「开源的 vibe coding 标准化工作台」定位
- 中文名**灵典**：「灵感之典」—— vibe（气韵/灵感）+ 典（典章/词典）
- 更名记录：原名 VibeCanon（2026-09-20 定名）→ **OpenVibe**（2026-09-21，D17）
- 2026-09-21 核验（D17）：GitHub 存在同名小仓库与近似名知名项目 OpenViBE（Inria，BCI 领域，大小写不同），搜索层面有撞车，中文社区传播以「灵典」关键词区隔；npm `openvibe` 已被占用，**包名与冷启动命令为 `openvibe-cli`**（registry 404 实测），安装后 bin 命令为 `openvibe`

## 解决什么问题

| 现状痛点 | OpenVibe 的答案 |
|----------|------------------|
| 提示词躺在聊天记录里，规则散落各项目 | 五类资产统一入库（M1-M4） |
| 每人喂给 AI 的规则质量天差地别 | 标准包一键注入所有项目（M6） |
| 踩过的坑、发明的词没有沉淀载体 | 术语库 + 技巧库（M3/M4） |
| AI 编码项目流程随意、质量靠运气 | 流程模板 + 检查清单 + 开发日志（M5） |

**核心闭环（标准化飞轮）**：沉淀资产 → 组装标准包 → 注入项目 → 复盘回流新资产。

## 仓库结构

```
openvibe/
├── docs/
│   ├── PRD.md                    # 产品需求文档（v0.1.4，三轮沟通 + 评审修订 + 更名定稿）
│   ├── competitive-research.md   # GitHub 竞品调研（2026-09-20 立项快照）
│   ├── competitive-analysis.md   # 深度对比分析报告（2026-09-20，14 项目能力矩阵/平台覆盖/SWOT/策略）
│   ├── proposal.md               # 立项提案：为什么做、做什么、做到哪（P0 文档）
│   ├── design.md                 # 设计方案：选型/数据/API/★标准包契约/★adapter 清单（P0 文档）
│   ├── tasks.md                  # 任务清单：T1–T9、依赖图、周计划、DoD（P0 文档）
│   ├── dev-plan.md               # P1 开发实施方案：架构/DDL/API/组件/T1–T9 分解/验收映射/日级排期/内容 SOP
│   └── specs/                    # 逐模块规格：输入输出、边界、验收标准
│       ├── m1-prompt-library.md        # 提示词库（完整）
│       ├── m2-skill-registry.md       # Skill 台账（瘦身）
│       ├── m3-glossary.md             # 术语库（瘦身）
│       ├── m5-project-flow.md         # 项目与流程（完整）
│       ├── m6-standard-pack.md        # 标准包·Web 侧（组装/导出）
│       ├── m6-cli-injection.md        # 标准包·CLI 侧（serve/scan/sync/diff）
│       ├── seed-content.md            # 种子内容（术语/模板/提示词）
│       └── onboarding.md              # 开箱体验（预置包+首启向导+飞轮面板）
├── DEV_LOG.md                    # 开发记录（按全局规范追加）
└── README.md
```

## 当前状态

- [x] 项目命名与查重
- [x] GitHub 同类项目调研
- [x] PRD v0.1.3 定稿（owner 三轮沟通 + 评审修订：社区优先 / 双钩子 / 可选遥测 / 开箱体验 / Apache-2.0 / 6.5 周 / **六 adapter 含国内平台 codebuddy·trae·minicode + 兼容矩阵 zcode/Kimi**；npm 包名 `vibecanon`〔旧名〕已核验可用，D17 更名后包名 `openvibe-cli`）
- [x] P0 设计文档集：proposal / specs×8 / design（标准包契约 v1 + adapter 清单 v1.2）/ tasks
- [x] P0 全部收口（2026-09-20）：门禁 G1–G6 关闭、平台契约核验完成、工期与端点定案
- [x] 深度竞品对比（2026-09-20）：发现「规则同步」新品类（rulesync/Rulix/rulebook-ai）→ 差异化锚定「标准包治理+流程+回流」，见 [docs/competitive-analysis.md](./docs/competitive-analysis.md)
- [x] 评审修订（2026-09-20 晚，PRD v0.1.3）：D13 遥测首次注入一次性 opt-in 询问 / D14 内容产能 AI 起草+owner 审校（6.5 周维持）/ D15 M5 两周证伪线 / D16 新仓库策略（发布时新开仓库，不带本仓库历史）
- [x] **项目更名 OpenVibe（2026-09-21，PRD v0.1.4 / D17）**：npm 包名与冷启动命令 `openvibe-cli`（`openvibe` 被占），bin 命令 `openvibe`；中文名沿用「灵典」
- [x] **P1/T1 工程脚手架完成（2026-09-21，DEV-0011）**：GitHub [anyeduke11/OpenVibe](https://github.com/anyeduke11/OpenVibe) 落地（Apache-2.0）；pnpm monorepo + packages/shared 全量 zod schemas + ESLint R1-R4 依赖边界 + vitest 三层；CI 三平台（macOS/Linux/Windows）首跑全绿
- [x] **P1/T2 存储核心完成（2026-09-21，DEV-0012）**：better-sqlite3 + migrations 0001/0002 + FTS5 trigram 六触发器 + 七 repos（版本快照/entryNo 事务/快照物化等）+ seed 幂等骨架；37 用例全绿
- [x] **P1/T3 M1 提示词库垂直切片完成（2026-09-21，DEV-0013）**：server 骨架（buildApp DI + 双通道鉴权 + 统一错误）+ 提示词九端点 + 四形态导入解析器 + Web `/library` 十组件（CodeMirror 双栏编辑、变量复制弹窗、版本 diff/回滚、导入导出）；m1 §7 八条验收逐条通过，53 用例全绿，浏览器实测截图与真实导出落 `docs/devlog-evidence/DEV-0013/`
- [x] **P1/T4 M3 术语库垂直切片完成（2026-09-21，DEV-0014）**：首批 **63 条**种子词条入库（附录 B 10 条必含项齐备）+ `pnpm seed:check` 成为 CI 独立闸门 + 术语五端点与确定性 `TERMS.md` 渲染（拼音/英 alphabetic 双序，跨平台字节一致）+ Web `/terms`（搜索降级提示、多选、关联双向展示、TERMS.md 预览/复制/下载）；m3 §7 五条 + seed-content §7 四条逐条通过，67 用例全绿，15 步浏览器走查证据落 `docs/devlog-evidence/DEV-0014/`
- [x] **P1/T5 M5 项目流程 + M2 Skill 台账垂直切片完成（2026-09-21，DEV-0015）**：29 个新端点（项目/模板/看板/日志/回流/injection-status/skills 扫描）+ 内置模板 403 只读 + Web 四页（`/projects` 三步向导、`/projects/:id` 阶段条+勾选+看板+日志+回流、`/flows` 模板裁剪、`/skills` 台账）；看板与模板编辑为 @dnd-kit 指针+键盘双模且同一 PATCH 有 ↑↓←→ 按钮兜底；m5 §7 八条 + m2 §7 五条逐条通过，103 用例全绿，四段浏览器走查 75 项断言全 PASS + 34 张截图落 `docs/devlog-evidence/DEV-0015/`
- [x] **P1/T6 M6a 组包导出 + 契约快照垂直切片完成（2026-09-22，DEV-0016）**：`packages/shared/pack-contract.ts` 契约类型 + 六 adapter（Trae 壳经二进制复核从 `trigger: always` 修正为 `{ description, alwaysApply: true }`）+ `core/pack`（composer/fingerprint/validate/bundle/resolve）+ server **11 端点**（preview/export/exports/injections + bundle 下载，409 VERSION_IMMUTABLE / 422 版本回退 / STALE_SELECTION）+ 目录导出与 bundle 双通道 + Web `/packs` 列表详情 + `/packs/new` 五步向导（三栏资产挑选 / 预览即产物字节一致 / 覆盖平台提示）+ C-25 项目↔包关联收口；golden 三夹具字节级快照进 CI；m6a §7 七条验收（#6 留 T7 联测）+ 两段浏览器走查 **82 项断言全 PASS**，152 用例全绿，证据落 `docs/devlog-evidence/DEV-0016/`
- [x] **P1/T7 M6b CLI 注入垂直切片完成（2026-09-22，DEV-0018）**：`openvibe serve/scan/sync/diff` 四命令 + config 五级发现链（令牌 **0600** 显式 chmod、损坏降级 warning）+ `--json` 单出口契约 `{command,plan?,report?,summary}` 与退出码 0/1/2 + 五状态注入内核（NEW/IN_SYNC/UPDATE/DRIFT/CONFLICT，`pack.lock.json` 的 `managed` 语义）+ 三层路径与规模防线（`packPathSchema` → 整包 `checkPackInjectable` → 每次写盘前 `resolveWriteTarget`）；**修复一处真漏洞**：目标是悬空符号链接时 realpath 必然失败，旧实现放行后 `writeFile` 顺链接在项目外凭空建文件（9664241，附 A/B 一手证据）；薄客户端守约（R4 仅 `serve` 单点放行 `@openvibe/server/bootstrap`，restriction 扩到子路径）；m6b §7 八条 + §6 安全样本由 **14 步真机走查**逐条实测（**驱动器脚本首次随证据入库**，可复跑；两遍独立建库指纹一致 `b611cec36934`，附不 import 仓库代码的 §7.6 独立重算），一次 dry-run 跑齐五状态；**307/307 用例全绿**（apps/cli 10 文件 / 57 个 `CLI-*` 用例 ID，≥25 门槛约 2.3 倍余量），证据落 `docs/devlog-evidence/DEV-0018/`
- [ ] P1：MVP 开发（按 tasks.md T1–T9，6.5 周 = 任务 31.5 人日 + 显式缓冲 1 人日；下一步 **T8 种子全量 + 开箱体验（含 `GET /api/settings` 与 `POST /api/settings/reseed` 两个未建端点，C-56）**；T4 的 63 条词条待 owner 审校，T8 补齐至 ≥100 条并将 `seed:check` 阈值切到 100/3/20）

## 隐私与网络行为（design §11.5）

- 除你配置的 `serverUrl`（注入/导出走本地 serve）外，**唯一可能的出网是可选匿名统计**，默认关闭。
- 白名单只有三类事件：`pack_injected` / `flow_template_used` / `project_active`；上报体固定五段
  `{event, value, day, os, appVersion}`，**不含路径、文件名、资产内容与任何机器标识**。
- **关闭即零外联**：开关关闭时连入队都不会发生；`config.json` 里没有 `telemetryEndpoint` 时 serve
  连上报定时器都不创建。`openvibe serve` 的启动信息会如实打出当前是否armed、间隔多久、发到哪个端点。
- 询问只在首次注入成功那一刻出现一次，拒绝即终点；随时可在设置页打开或关闭。
- 接收端是 owner 自部署的单文件计数端点（`deploy/telemetry/`），零第三方分析依赖。


- vs **PromptHub**（1.7k★，AGPL-3.0）：它是本地优先的个人资产管家；OpenVibe 做**流程 + 知识标准化 + 团队闭环**（术语库/技巧库/标准包治理均为空白地带）
- vs **BMAD / spec-kit**：它们是不可视化管理的方法论模板；OpenVibe 把流程做成**可裁剪组合的工作台**并与资产联动
- vs **skills.sh**：它是安装渠道；OpenVibe 管理分发后的版本、冲突与项目级编排
