# OpenVibe 深度对比分析报告

| 项 | 值 |
|------|------|
| 文档定位 | 与市面同类开源项目的深度对比：能力矩阵、重点深挖、平台覆盖、SWOT、竞争策略 |
| 对比基准 | **OpenVibe PRD v0.1.4（定义态，未发布）**——对比的是已冻结的产品定义，不是已实现产品；诚实声明：定义态无真实用户数据，成熟度列一律如实标注 |
| 数据快照 | 2026-09-20（Web 检索 + GitHub 核实；与同日早间的 [competitive-research.md](./competitive-research.md) 立项快照互补，**本文含其后发现的重大市场变化**） |
| 上游 | PRD v0.1.4、design.md §7/§8（契约与 adapter） |
| 版本 | v1.0（2026-09-20） |

---

## 一、市场格局变化（相对立项快照的四个关键更新）

1. **「规则同步」品类已经爆发** ⚠️（立项调研漏扫的区域）：`rulesync`、`Rulix`、`rulebook-ai`、`agent-rules-sync`、`AgentSync`、`Unblocked`、`AI Rules Manager` 等一批工具在做「一份规则源 → 同步到多个 AI 编码工具」——与 OpenVibe M6「标准包注入」概念空间直接重叠。**它们验证了需求真实存在，也意味着 M6 不再是无主之地**；差异化必须落在「工作台 + 版本治理 + 知识闭环」上（详见 §五深挖与 §九策略）。
2. **AGENTS.md 成为正式标准**：纳入 Linux 基金会 Agentic AI Foundation，60k+ 开源项目采用、60+ 工具支持。OpenVibe 的 `generic-agents` adapter + 兼容矩阵（zcode/Kimi/Codex 等零成本覆盖）踩在标准东风上。
3. **Spec 驱动赛道头部剧变**：spec-kit 冲到 ~90k★（最热门 SDD 工具）但社区质疑维护停滞（月开 22 个 PR 零合并）；BMAD ~48.4k★（MIT）稳定。头部越大，流程模板的可视化裁剪需求越真实（人人有模板，无人能管理模板）。
4. **Skill 管理内卷到 50+ 平台**：skills-manager（桌面端，50+ 工具）、skills.sh 出 VS Code 插件（11 agents）、mcpmarket 装机管理器等——M2 瘦身（只登记不分发）的克制是对的，正面进入这个红海没有胜算。

## 二、对比对象总览（14 个，四象限）

| 象限 | 项目 | 形态 | 规模/状态（快照日） | 与 OpenVibe 重叠 |
|------|------|------|---------------------|-------------------|
| 资产管家 | [legeling/PromptHub](https://github.com/legeling/PromptHub) | Electron+Web+CLI | 1.7k★，AGPL-3.0，活跃（已知 skill 更新误报 bug [#168](https://github.com/legeling/PromptHub/issues/168)） | ★★★★☆ |
| 资产管家 | [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) | 桌面应用 | 新兴，宣称支持 50+ 工具 | ★★★☆☆ |
| 规则同步新锐 | [dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync) | Node CLI（+PyPI 1.0.0，2026-04） | 小而美，"one source of truth" | ★★★★☆（M6 直接重叠） |
| 规则同步新锐 | [danielcinome/rulix](https://github.com/danielcinome/rulix) | TS CLI | 新兴，"One ruleset. Every AI coding tool." | ★★★☆☆ |
| 规则同步新锐 | [botingw/rulebook-ai](https://github.com/botingw/rulebook-ai) | CLI | 新兴，「打包并部署专家环境（规则+上下文+工具）」 | ★★★★☆（最接近「标准包」概念） |
| 规则同步新锐 | agent-rules-sync / AgentSync(Rust) / Unblocked / MDPilot / [AI Rules Manager](https://open-vsx.org/extension/ikaladev/ai-rules-manager) | CLI/服务/插件/移动端 | 各自小众 | ★★☆☆☆ |
| 流程框架 | [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | 方法论+模板+CLI | ~48.4k★，MIT | ★★★☆☆ |
| 流程框架 | [github/spec-kit](https://github.com/github/spec-kit) | CLI 脚手架 | ~90k★，**维护存疑**（[讨论 #1482](https://github.com/github/spec-kit/discussions/1482)，2026-09-20 检索复核存在） | ★★★☆☆ |
| 分发渠道 | [skills.sh](https://skills.sh)（+VS Code 插件）/ awesome 清单们 | Web/插件 | 1000+ skills | ★★☆☆☆ |

## 三、全量能力矩阵

图例：✅ 完整可用 ｜ ⚠️ 部分/简陋 ｜ ❌ 无 ｜ 📐 OpenVibe 为**定义态**（按冻结的规格承诺）

| 能力维度 | OpenVibe 📐 | PromptHub | rulesync | Rulix | rulebook-ai | BMAD | spec-kit |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 提示词 CRUD/版本/变量/搜索 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Skill 台账（扫描/登记） | ⚠️ 瘦身 | ✅ 强 | ❌ | ❌ | ⚠️ 工具部分 | ❌ | ❌ |
| **术语库（中英/别名/TERMS.md）** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 技巧库（playbook） | ❌ P2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 项目工作台（看板/检查清单/日志） | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ 模板即流程无看板 | ⚠️ 同左 |
| 流程模板可视化裁剪 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌（文件模板） | ❌（脚手架） |
| **标准包组装（选资产→打包→版本）** | ✅ | ❌（Rules 快照非组装） | ❌（单源文件） | ❌（单源规则） | ⚠️ 打包但无资产库可挑 | ❌ | ❌ |
| 多平台注入/同步 | ✅ 6+矩阵 | ✅ 15+ 平台（skill 分发） | ✅ 5 种文件 | ⚠️ 3 系 | ⚠️ 多工具 | ❌ | ❌ |
| 冲突保护（dry-run/备份/diff） | ✅ 三重 | ⚠️ 快照机制 | ❌ | ❌ | 未知 | ❌ | ❌ |
| 指纹/漂移检测 | ✅ | ✅（SHA-256 skill 指纹） | ❌ | ❌ | ❌ | ❌ | ❌ |
| 复盘回流（日志→资产草稿） | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 团队协作/评审 | ❌ P2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 开箱体验（预置包+向导） | ✅ | ⚠️ 内置技能商店 | ❌ | ❌ | ⚠️ | ✅ 脚手架即开箱 | ✅ |
| GUI | ✅ Web | ✅ 桌面+Web | ❌ | ❌ | ❌ | ❌ | ❌ |
| 本地优先/离线 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 规则质量校验（长度/含糊度/token 预算） | ❌ | ❌ | ❌ | ✅ **独有** | ❌ | ❌ | ❌ |

**矩阵三句话结论**：① 资产管理单点战 PromptHub 最全，OpenVibe 不与其拼广度（M2 瘦身的正确性再次确认）；② 「组装 + 版本治理 + 冲突保护 + 回流」的组合无人具备——规则同步新锐们有「同步」没有「治理」，PromptHub 有「指纹」没有「组装」；③ Rulix 的规则质量校验是全场独有且值得借鉴的功能。

## 四、重点深挖（5 个）

### 4.1 PromptHub——依然是最近似的竞品，但战场已分

- **它强**：提示词管理（版本/变量/关系树）与 skill 分发（15+ 平台、symlink/copy、SHA-256 指纹、冲突保护、安全扫描）做到了个人工具 80 分；主密码 AES-256-GCM、WebDAV/S3 同步。
- **它没有**（OpenVibe 的全部生存空间）：流程管理、术语库、复盘回流、团队治理、中文社区定位、**国内平台规则文件适配**（它的 15+ 平台是 skill 目录分发，不是 CLAUDE.md/CODEBUDDY.md/MINI.md 规则契约——两个不同的覆盖面）。
- **风险交互**：AGPL-3.0 协议——不可参考其代码实现（已在 D4 裁定中确认零参考）；skill 更新误报 bug（#168）说明「指纹比对 + 本地修改检测」这类机制的真实复杂度，OpenVibe 的五状态机（UPDATE/CONFLICT/DRIFT 分离）设计正是对此的预防。
- **结论**：错位共存。它管「我有哪些资产」，OpenVibe 管「我的标准如何进项目、项目经验如何回标准」。

### 4.2 rulesync——M6 概念的最小实现，验证需求而非威胁

- 一份统一规则源 → 生成 AGENTS.md / CLAUDE.md / .cursorrules/.mdc / GEMINI.md / copilot-instructions.md；Node CLI + Python 双实现（PyPI 1.0.0，2026-04）。
- **与 OpenVibe 的本质差异**：它是**开发者个人工具**（单文件源、无版本、无 GUI、无冲突语义、无资产库），M6 是**治理系统**（多资产挑选组装、manifest 快照、semver 不可变导出、fingerprint 防篡改、五状态机注入、lock 漂移检测）。
- **借鉴**：它支持的 `copilot-instructions.md`（Copilot）和 `GEMINI.md` 两个目标文件，正好对应我们 adapter 清单里 P1 可选的 gemini 和未列的 copilot——**建议把 `copilot` 补入 adapter 清单 P1 行**（design §8 一行文档改动）。

### 4.3 Rulix / rulebook-ai——两个新锐各有獠牙

- **Rulix**：独有**规则质量校验**（长度、含糊描述检测）与 **token 预算管理**——这是「规则文件越写越长把上下文窗口吃爆」这一真实痛点的解法。OpenVibe 的标准包正文模板暂无此机制；建议进 **P2/P3 功能备忘**（rule lint：打包预览时提示规则段 token 估算与质量告警），与现有「rule 类提示词含变量警告」同层。
- **rulebook-ai**：tagline 就是「打包并部署一致的专家环境（规则+上下文+工具）」——概念上最接近标准包。但它是无 GUI 的 CLI、无资产库挑选、无中文平台；需在 README 定位声明中点名区隔（我们=工作台+知识+治理，它=环境打包器）。
- **共同启示**：这个细分品类在 2026 上半年集中出现，说明「多工具规则不一致」痛点已被广泛感知——**时间窗口真实存在，但也在收窄**，P1 的 6.5 周交付节奏不宜再放。

### 4.4 BMAD / spec-kit——流程赛道的两座大山与一条裂缝

- spec-kit ~90k★ 但维护停滞（22 PR 零合并）；BMAD ~48.4k★ 稳定。两者都是「模板/脚手架」形态：**给了方法论，没给管理方法论的界面**。
- OpenVibe M5 的「复制模板→可视化裁剪→项目物化快照」正打这条裂缝；且内置「Spec 驱动流」模板本身就是对两者方法论的致敬与归一（PRD 3.2-M5 已注明裁剪来源）。
- **策略联动**：README/传播素材中可明确「内置 Spec 驱动流（裁剪自 spec-kit/BMAD 思路）」——借 138k★ 合计流量做关键词承接，注意各自协议（均为宽松协议，模板文字原创重写，无传染）。

### 4.5 skills-manager 等 Skill 管理内卷群——M2 克制的反面教材

50+ 平台的桌面端、VS Code 插件、装机管理器……这个方向一个月内能冒出三个新工具。OpenVibe M2 只做「扫描 + 登记」（供标准包引用 SKILLS.md），不进分发红海——**P2 恢复 M2 完整版规划时需重估**：届时生态可能已由 skills-manager/skills.sh 阵营定型，正确姿势或为「对接它们做源，而不是自建分发」。

## 五、平台覆盖对比（OpenVibe 核心差异化证据）

| 平台 | OpenVibe 📐 | PromptHub | rulesync | Rulix | rulebook-ai |
|------|:---:|:---:|:---:|:---:|:---:|
| Claude Code（CLAUDE.md） | ✅ | ✅（skill 目录） | ✅ | ✅ | ✅ |
| Cursor（.mdc） | ✅ | ✅（skill 目录） | ✅ | ✅ | ⚠️ |
| Codex/AGENTS.md 系 | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| **CodeBuddy（CODEBUDDY.md）** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Trae（.trae/rules）** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **MiniCode（MINI.md）** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **zcode / Kimi Code（AGENTS.md）** | ✅（矩阵） | ❌ | ⚠️（Kimi 非显式） | ❌ | ❌ |
| Windsurf | P1 | ✅ | ❌ | ❌ | ⚠️ |
| Gemini（GEMINI.md） | P1 可选 | ❌ | ✅ | ❌ | ❌ |
| Copilot（copilot-instructions.md） | **建议列 P1** | ❌ | ✅ | ❌ | ❌ |

**结论**：规则文件契约层的**国内平台覆盖是全场独占**（竞品全部停留在国际三件套 + skill 目录分发）；这是「中文社区优先」定位（D1）在产品层的具体兑现，也是传播素材的第一张牌。

## 六、架构与契约对比

| 维度 | OpenVibe 📐 | PromptHub | 规则同步新锐 | BMAD/spec-kit |
|------|--------------|-----------|--------------|----------------|
| 形态 | 自部署 Web + CLI（本地优先） | Electron+Web+CLI | 纯 CLI | CLI/模板文件 |
| 存储 | SQLite+FTS5（单文件可迁移） | SQLite + WebDAV/S3 同步 | 文件系统 | git 仓库 |
| 标准格式 | 开放：纯 MD/JSON manifest + schemaVersion（冻结 v1/v1.2，golden 快照防漂移） | 私有库 + 导出 | 单源文件（事实上开放） | 开放 MD 模板 |
| 版本治理 | semver 不可变导出 + fingerprint + lock 漂移检测 | skill 版本指纹 | ❌ | git 即版本 |
| 冲突语义 | 五状态机（NEW/IN_SYNC/UPDATE/CONFLICT/DRIFT）+ 三重保护 | 快照 + 手动 | ❌ 覆盖即写 | ❌ |
| 遥测 | 可选匿名三类白名单（默认关） | 无（本地优先） | 无 | 无 |
| 协议 | Apache-2.0 | **AGPL-3.0（代码隔离墙）** | MIT 系 | MIT/MIT |

## 七、SWOT（定义态视角）

| | 有利 | 不利 |
|---|------|------|
| **内部** | **S**：标准化飞轮全链路独占（组装-治理-注入-回流）；国内平台规则契约独占；术语库差异化；契约已冻结可快速开工；AGENTS.md 标准东风 | **W**：0 用户 0 star，冷启动全靠内容与 dogfooding；单人开发 6.5 周 vs 竞品既有成熟度；规则同步品类已有多玩家，教育市场的活可能被别人干了 |
| **外部** | **O**：spec-kit 维护裂缝；PromptHub 不做流程/知识/中文；AGENTS.md 生态扩张自动扩大兼容矩阵收益；国内平台（CodeBuddy/Trae/Kimi）崛起期无配套标准工具 | **T**：规则同步品类 2026H1 集中爆发，窗口收窄；平台原生资产同步若在 P1 期间上线（PRD 风险表）价值锚需加速转向流程/知识；PromptHub 若补齐中文平台与规则契约则正面相撞 |

## 八、竞争策略结论（七条）

1. **错位而非对撞**：不与 PromptHub 拼资产管家、不与 skills 内卷群拼分发、不与 rulesync 拼轻量 CLI——锚定「标准包治理 + 流程 + 知识回流」的空位（矩阵 §三的空白列）。
2. **第一张传播牌**：国内平台规则契约覆盖表（§五）+ 「10 分钟给新项目配好六个 AI 编码工具的标准」演示（双钩子落地）。
3. **关键词承接**：README 显式标注「内置 Spec 驱动流（裁剪自 BMAD/spec-kit 思路）」「AGENTS.md 标准兼容」，承接头部流量。
4. **定位区隔声明**（写进 README 首屏）：vs rulesync/Rulix/rulebook-ai——它们是「规则同步器」，OpenVibe 是「标准工作台」：规则只是资产之一，价值在版本治理、流程与回流闭环。
5. **借鉴清单**（不动 MVP 范围，入 P2/P3 备忘）：① Rulix 的规则质量校验 + token 预算（组包预览时告警）；② rulesync 的 copilot-instructions.md → **adapter 清单 P1 行补 `copilot`**（一行文档改动，随下次 §8 修订带入）；③ agent-rules-sync 的双向同步思路（P1 已有计划，参考其 3 秒级体验预期）。
6. **防御动作**：P1 发布后盯 PromptHub changelog 是否补中文平台/规则契约（正撞信号）；盯平台原生同步能力（PRD 风险表既有项）。
7. **节奏结论**：规则同步品类的出现把「窗口收窄」从假设变成事实——6.5 周排期（D8）不建议再放宽；若必须取舍，用变体④（国内 adapter 后移）保发布时间，保不住的是独占期。

## 九、数据与来源

快照 2026-09-20；star 数为二手来源（Augmentcode/Dev.to 盘点，2026-03/04 数据），个体项目数据以 GitHub 页为准：[PromptHub](https://github.com/legeling/PromptHub)｜[rulesync](https://github.com/dyoshikawa/rulesync)｜[Rulix（Cursor 论坛发布帖）](https://forum.cursor.com/t/rulix-ai-rules-manager-with-validation-token-budgets-cursor-claude-code-agents-md/151254)｜[rulebook-ai](https://github.com/botingw/rulebook-ai)｜[agents.md 官网](https://agents.md)｜[skills-manager](https://github.com/xingkongliang/skills-manager)｜[BMAD 盘点](https://www.augmentcode.com)（二手盘点，文章直链待补）｜[spec-kit 维护质疑](https://github.com/github/spec-kit/discussions/1482)｜[SDD 工具对比](https://dev.to)｜[AI Rules Manager 插件](https://open-vsx.org/extension/ikaladev/ai-rules-manager)。立项期基础数据见 [competitive-research.md](./competitive-research.md)（2026-09-20 上午快照）。链接修复：2026-09-20 评审时补齐裸域直链（spec-kit #1482 经检索证实为 Discussion 而非 Issue）。
