# OpenVibe 竞品调研报告

> **后续更新**：本报告为 2026-09-20 上午的立项快照。同日下午产出深度对比分析报告 [competitive-analysis.md](./competitive-analysis.md)（14 项目能力矩阵、规则同步新品类发现、平台覆盖对比、SWOT 与竞争策略）——阅读本报告后请以深度报告的市场结论为准。

- **调研时间**: 2026-09-20
- **调研方式**: Web 检索 + GitHub 仓库核实
- **结论先行**: 目前 GitHub 上**没有任何一个项目**同时覆盖「提示词 + Skill + 术语 + 技巧 + 项目流程」五类资产的标准化管理。各竞品分别占据单一象限；「vibe 术语库」和「技巧沉淀（playbook）」两块近乎空白；「团队级标准化闭环」无人做。

---

## 一、竞品总览

| 项目 | 定位 | 与本项目重叠度 | 关键差距 |
|------|------|:---:|------|
| [legeling/PromptHub](https://github.com/legeling/PromptHub) | 本地优先的 Prompt/Skill/Agent 资产工作台（桌面+Web+CLI） | ★★★★☆（最高） | 纯个人工具：无团队协作、无项目流程管理、无术语库、无技巧库 |
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) | AI 编码代理的看板编排器（并行跑 agent、worktree、diff 审查） | ★★☆☆☆ | 只管「代理执行过程」，不管资产沉淀与标准分发 |
| [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) + cursor.directory | Cursor 规则文件集合（约 40k stars，257+ 规则） | ★★☆☆☆ | 静态收藏夹，无管理/版本/分发能力 |
| [skills.sh](https://skills.sh) + [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | Agent Skill 的浏览/安装渠道（1000+ skills，兼容 Claude Code/Cursor/Codex 等） | ★★☆☆☆ | 是「商店」不是「工作台」：装完即止，无项目级编排与团队治理 |
| [Langfuse](https://langfuse.com) / [Agenta](https://agenta.ai) / Pezzo | LLMOps 提示词管理与评估平台 | ★★☆☆☆ | 面向生产环境 LLM 应用的调用链/观测/AB 测试，非编码工作台 |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)（约 48k stars） | 多角色 AI 代理的全生命周期开发方法论框架 | ★★★☆☆ | 有流程无资产库：方法论+模板以文件形式分发，无 GUI 工作台、无提示词/术语管理 |
| [github/spec-kit](https://github.com/github/spec-kit) / [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 规格驱动开发（spec-driven）脚手架 | ★★★☆☆ | 同上：流程工具，资产与知识沉淀缺位 |
| [Pimzino/claude-code-spec-workflow](https://github.com/Pimzino/claude-code-spec-workflow) | Claude Code 上的 spec 驱动工作流（重心已转向 MCP 版） | ★★☆☆☆ | 单平台、单流程 |
| SuperClaude Framework / [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | Claude Code 增强配置框架 / 资源清单 | ★☆☆☆☆ | 配置资产本身，不是管理工具 |

## 二、重点竞品深挖

### 2.1 PromptHub —— 最接近的竞品

- **规模**: 1.7k stars / 193 forks，AGPL-3.0，活跃开发中（v0.5.9 稳定 / v0.6.0-beta，776+ commits）
- **形态**: Electron 桌面 + 自部署 Web + CLI（pnpm monorepo）；React + Tailwind + SQLite(FTS5)
- **已有能力**（相当完整）:
  - Prompt 管理：文件夹/标签/收藏、`{{变量}}` 模板、全文搜索、版本历史与回滚、AI 生成/编辑、关系树
  - Skill 管理：内置 20+ 技能商店 + 自定义源（GitHub/skills.sh/ClawHub/本地），一键分发到 15+ 平台（Claude Code/Cursor/Windsurf/Codex/Antigravity/Cline/Trae 等），symlink/copy 双模式、版本指纹（SHA-256）与冲突保护、安全扫描
  - 其他资产：MCP 管理、Plugin 管理、Rules 管理（.cursor/rules、CLAUDE.md、AGENTS.md 快照）
  - 数据：WebDAV/S3 个人同步、主密码 + AES-256-GCM 加密、全量备份
- **明确没有的**（即本项目的差异化空间）:
  1. **无团队协作**——无多用户、权限、审核；同步仅限个人设备间
  2. **无项目流程管理**——没有流程模板、阶段、检查清单、看板、开发日志
  3. **无术语库**——不管理 vibe coding 术语/中英对照/团队语言统一
  4. **无技巧沉淀**——没有「场景→问题→做法→反例」的 playbook 知识库
- **启示**: 资产管理的单点功能 PromptHub 已做到 80 分，本项目**不要**与其全面竞争资产管家功能，应把重心放在它没有的「流程 + 知识标准化 + 团队」上；其 symlink/copy 分发、指纹冲突检测、加密方案值得借鉴。

### 2.2 流程框架类（BMAD / spec-kit / OpenSpec）

- 三者都是 2025-2026 年热门的 spec 驱动开发框架（BMAD 约 48.4k stars）
- 共性：以 Markdown 模板 + 角色提示词的形式落地方法论，靠 CLI 初始化到项目里
- 差距：流程「模板」有了，但模板本身**不可视化管理**、不可按团队裁剪组合、不与资产库联动、无使用数据回流
- **启示**: 本项目的 M5 流程管理模块应把此类方法论做成**可组合的流程模板**（内置「个人轻量流 / spec 驱动流 / 复盘流」），让用户在 GUI 里裁剪，而不是又造一个方法论

### 2.3 空白地带（机会）

| 空白点 | 现状 | 本项目对应模块 |
|--------|------|------|
| vibe 术语库 | 无任何工具管理（散落在博客/推文/翻译不一） | M3 术语库 |
| 技巧/避坑沉淀 | 散落在 awesome 清单和文章里，不可结构化检索 | M4 技巧库 |
| 团队级标准分发 | 无人做「标准包」一键注入 + 版本治理 | M6 标准包与注入 + M7 协作 |
| 资产↔流程闭环 | 管资产的不懂流程，管流程的不存资产 | 标准化飞轮（PRD 第 5 章） |

## 三、定位图

```
                资产管理（提示词/Skill/Rules）
                       ▲
        PromptHub ●    │
        skills.sh ●    │
                       │          ★ OpenVibe（目标位：资产×流程×标准化闭环）
  个人 ●───────────────┼────────────────● 团队
                       │
      awesome 清单 ●   │      ● BMAD / spec-kit（流程模板）
                       │      ● vibe-kanban（代理执行编排）
                       ▼
                流程/项目管理
```

## 四、对本项目的四条结论

1. **避开正面战场**: 不做「更强的个人资产管家」，PromptHub 已占位且开源（注意其 AGPL-3.0 协议，不可参考其代码实现做闭源产品）
2. **占空白**: 术语库 + 技巧库 + 团队标准包分发，是明确的无人区
3. **借生态**: skill 分发可对接 skills.sh / awesome 清单作为「源」，流程模板可裁剪 BMAD/spec-kit 的方法论（注意各自协议）
4. **打闭环**: 单点工具的护城河浅，「沉淀→分发→使用→回流」的标准化飞轮才是长期价值
