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
- [ ] P1：MVP 开发（按 tasks.md T1–T9，6.5 周 = 任务 31.5 人日 + 显式缓冲 1 人日；T3 提示词库垂直切片为下一步）

## 差异化定位（相对竞品）

- vs **PromptHub**（1.7k★，AGPL-3.0）：它是本地优先的个人资产管家；OpenVibe 做**流程 + 知识标准化 + 团队闭环**（术语库/技巧库/标准包治理均为空白地带）
- vs **BMAD / spec-kit**：它们是不可视化管理的方法论模板；OpenVibe 把流程做成**可裁剪组合的工作台**并与资产联动
- vs **skills.sh**：它是安装渠道；OpenVibe 管理分发后的版本、冲突与项目级编排
