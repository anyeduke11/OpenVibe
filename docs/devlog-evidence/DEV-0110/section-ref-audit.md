# §-引用对账表

> 生成方式：`npx tsx scripts/section-ref-audit.ts --write <本文件>`。
> 判定口径与边界见 `scripts/section-ref-audit.ts` 文件头（**只判限定型引用；红只出在「目标文件连顶层节都没有」**）。
> 本表是**点时快照**：文档改了要重跑重写；它不替代闸，`scripts/section-ref-audit.ts` 才是闸。
> ⚠️ 判定基于**当前工作树**（不是 HEAD）—— 未提交的改动会改变本表（某节尚未入库、或已从工作树移除）。

## 1. 判定摘要

| 项 | 数 |
|---|---|
| 限定型引用（可判面） | 275 |
| ├ 标题型绿 | 225 |
| ├ 条目型绿 | 45 |
| ├ 不可判（父节在、子项未登记） | 4 |
| └ 断链（红） | 1 |
| 裸引用（不可判，只报数） | 3257 |
| 目标文件重名而不可判 | 0 |

## 2. 断链清单

| 位置 | 被引 | 状态 | 说明 |
|---|---|---|---|
| `docs/dev-plan.md:1440` | `docs/specs/onboarding.md §7` | 已知存量（只报不改） | 指向 `docs/specs/onboarding.md` 的 §7 —— 该 spec 的节只到 §6（验收标准是 §5），故这条引用指空。**该文件属并行会话保留区（owner 2026-10-24 裁定「原样保留、等那个会话自己收」），只登记不改**；待该会话收尾后改成 §5。**登记是精确登记（不是通配）** ⇒ 本闸其余断链一律判红。 |

## 3. 拆分影响面：谁引用了 `docs/dev-plan.md` 的哪一节

| 被引节号 | 引用处数 | 引用位置 |
|---|---|---|
| §15 | 7 | `docs/PRD.md:7`、`docs/PRD.md:429`、`docs/PRD.md:436`、`docs/decisions.md:16`、`docs/decisions.md:16`、`docs/tasks.md:7`、`docs/tasks.md:153` |
| §18 | 6 | `docs/PRD.md:790`、`docs/decisions.md:47`、`docs/decisions.md:72`、`docs/dev-plan-v0.2.1.md:28`、`docs/dev-plan-v0.2.1.md:126`、`docs/dev-plan-v0.2.1.md:912` |
| §0.3 | 6 | `docs/analysis-2026-10-02-first-principles.md:10`、`docs/analysis-2026-10-02-first-principles.md:804`、`docs/design.md:8`、`docs/dev-plan-v0.2.1.md:37`、`docs/specs/m8-agent-bridge.md:7`、`docs/specs/m8-agent-bridge.md:250` |
| §0.4 | 6 | `docs/dev-plan-v0.2.1.md:10`、`docs/dev-plan-v0.2.1.md:39`、`docs/specs/m3-terms-learning.md:9`、`docs/specs/m8-agent-bridge.md:9`、`docs/specs/m8-agent-bridge.md:363`、`docs/specs/m8-agent-panel.md:9` |
| §16 | 5 | `docs/PRD.md:790`、`docs/PRD.md:807`、`docs/decisions.md:72`、`docs/dev-plan-v0.2.1.md:22`、`docs/dev-plan-v0.2.1.md:941` |
| §16.6 | 4 | `docs/PRD-M8-agent-bridge-v1.0-20261013.md:559`、`docs/decisions.md:47`、`docs/dev-plan-v0.2.1.md:11`、`docs/dev-plan-v0.2.1.md:34` |
| §15.2 | 4 | `docs/PRD.md:617`、`docs/PRD.md:806`、`docs/dev-plan.md:1381`、`docs/specs/m4-playbook.md:102` |
| §1.2 | 3 | `docs/PRD-M8-agent-bridge-v1.0-20261013.md:349`、`docs/PRD-M8-agent-bridge-v1.0-20261013.md:359`、`docs/specs/m8-agent-bridge.md:196` |
| §15.5-14 | 2 | `docs/PRD.md:617`、`docs/PRD.md:806` |
| §16.2 | 2 | `docs/PRD.md:637`、`docs/dev-plan-v0.2.1.md:6` |
| §18.3 | 2 | `docs/decisions.md:47`、`docs/decisions.md:72` |
| §15.5 | 1 | `docs/decisions.md:17` |
| §15.5-9 | 1 | `docs/decisions.md:17` |
| §15.4b | 1 | `docs/decisions.md:20` |
| §15.4-S2 | 1 | `docs/decisions.md:21` |
| §11 | 1 | `docs/decisions.md:30` |
| §13-8 | 1 | `docs/dev-plan-v0.2.1.md:35` |
| §13-9 | 1 | `docs/dev-plan-v0.2.1.md:36` |
| §1.1 | 1 | `docs/specs/m8-agent-bridge.md:8` |
| §15.1-9 | 1 | `docs/specs/theme.md:76` |

合计 **56 处**限定型引用指向 `docs/dev-plan.md`。

⚠️ **这张表不含裸引用** —— 裸 `§N` 的指向不可判定（见文件头「为什么只判限定型」）。拆分时裸引用必须**逐条人工确认**，机械改写会改错指向。

## 4. 附面：仓根 md（`DEV_LOG.md` / `README.md`）—— 只报数，不判红

**为什么不判红**：仓根的日志记录的是**当时为真**的状态，条目里出现已被删掉的节号属正常（如 §17 的整节删除）。把它们算进红，等于要求三年前的日志补今天的结构 —— 那是给历史制造噪声。但它们**必须被看见**：日志里指着已删节号的条目，正是「谁在依赖这一节」的线索。

| 项 | 数 |
|---|---|
| 限定型引用 | 91 |
| 裸引用（不可判） | 935 |
| 断链（只报数） | 6 |

| 位置 | 被引 | 上下文 |
|---|---|---|
| `DEV_LOG.md:2118` | `docs/dev-plan.md §17` | 2. **号位冲突的处置——取 §18 不取 §17**：HEAD `4b42642` 的 `dev-plan.md` §17 是 **M4 技巧库开发计划**（`:1789`），而 2026-10-14 的**工作树**把该节整节删除（− |
| `DEV_LOG.md:2140` | `docs/dev-plan.md §17` | - **owner 手上未收的**: ① **Phase 1/2 的工期与人日**——本迭代**不排工期**，启动时点由 v0.2.0 的 RF1-5 决定；② **`dev-plan.md` 的 §17/§18 号位最终归属**——取 § |
| `DEV_LOG.md:2913` | `docs/dev-plan.md §17` | - **断链清单两条，各有归属**：① `docs/dev-plan.md:1440` → `specs/onboarding.md §7` —— **真断链**（onboarding 的节只到 §6，验收标准是 §5），但该文件属 own |
| `DEV_LOG.md:2928` | `docs/dev-plan.md §17` | ⑧ **描述断指针的文字本身也会被扫成断链**：本条目里写着「`docs/dev-plan.md` §17」这种被引形态，附面扫到就会记一条（**附面只报数，所以不判红**）。⇒ 附面的数**随日志正文变化**，本条目因此**不写死它**（ |

