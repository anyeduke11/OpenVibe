# OpenVibe 产品线边界（v0.2.3 批次 C CS6）

> 定位：本文回答「这个仓库里哪些东西属于哪条产品线」——治理闸门测的是**一致性**，不测**范围**；
> M9 曾以未声明第二产品线的身份长进核心包（PRD-v0.2.3 E4/E9），本文就是给「范围」立的闸。
> 变更本文 = 产品边界变更，须 owner 裁定并同步 DEV_LOG。

## 两条产品线

| | **分发线（核心）** | **学习线（第二产品线）** |
|---|---|---|
| 回答的问题 | 「把规则/知识编译成 AI 可用的项目上下文并分发出去」 | 「owner 自己的开发学习：学什么、到哪个阶段、怎么学」 |
| 里程碑 | M1–M8 + v0.2.3 批次 A/B | M9 |
| 用户旅程 | 库 → 组包 → 注入 → diff/verify → 回流 | 站位图 → 模式选择 → 资源清单 → 源码解读 |
| 代码面 | apps/server 的 M1–M8 路由、CLI 五+九命令、`core/{pack,inject,search,repos,services}` | `lang*` 三组路由（24 条）、`core/db/m9-*` 的产品半、web `/dev` `/resources` |
| Web 面 | `/library` `/terms` `/skills` `/flows` `/projects` `/packs` `/growth` `/settings` | `/dev` `/resources` |

## 共享面（两线都依赖，改动需双侧评估）

- `packages/shared` 的 zod 契约与常量（含 `LOCAL_EVENT_KINDS` 闭集）。
- `~/.openvibe/data/openvibe.db`（同一 SQLite 库；`lang_*` 12 张表与业务表同库不同域）。
- `packages/core/src/source-ai/`（解读链，学习线的 AI 面；v0.2.3 批次 D 的提取链将复用其 provider/脱敏/同意/台账）。

## 工具面（不属于任何产品线，只服务仓库自身）

`@openvibe/core/tooling` 子出口（批次 C CS1）：采集脚本、规格解析器、静态守卫
（freshness / p1b-spec / p1b-necessity / time-window-guard / p1d-spec）。
**产品主出口 `@openvibe/core` 不得 re-export 这些符号**——闸：`tests/tooling-face.test.ts`。

## 迁移号段规则（CS6 第二件）

`packages/core/src/db/migrations/` 按域分段，**核心域与 lang 域不混号**：

| 号段 | 域 | 现状 |
|---|---|---|
| 0001–0010 | 核心域（资产/项目/台账/agent） | 已用 |
| 0011–0018 | **lang 域**（学习线，`lang_*` 表） | 已用 |
| 0019 起 | 核心域下一号 | 空闲 |
| lang 域下一个 | **0019 之后的下一个空号由批次 D 的迁移规则定**（v0.2.3 PRD 批次 D 前置：CS6 号段规则先落） | 规则 = 两种域各自**单调取号、跳过对方域已占号**，不再按域预留连续段 |

判定口径：看迁移文件名的目标表——建/改 `lang_*` 表的属 lang 域，其余属核心域。
批次 D 的两个新迁移（`ai_extract_consent` 表 + 台账 kind CHECK 扩列）按本规则取号。

## 派生列清单（C 收尾②：种子推导、非用户内容的声明表）

这些列由播种器在 reseed 时**无条件重写**（派生自种子数据或现算），三态合并的用户保护**不覆盖**它们——
用户手改派生列会在下一轮 reseed 被冲掉。根治方向各列自明；改「派生 ⇒ 用户内容」的定性 = owner 裁定。

| 列 | 派生源 | 写入点 | 用户可改？ | 根治方向 |
|---|---|---|---|---|
| `lang_topics.summary`（【概念层】前缀） | 概念挂接（p1-5） | `m9-p1-5-concept-content.ts` 的挂接回写 | 名义上可改但会被冲 | 挂接数据并入 topics json 或独立表 |
| `lang_topics.stage_id` | 分站分配（p1-7 写回） | `m9-p1-7-topic-stages.ts`（保留写回，DEV-0141 裁定②） | 同上 | 站位并入 topics json、p1-7 只写 edges |
| `lang_concept_deltas.supersedes` | 种子链路第二遍回填 | `m9-p1-6-concept-deltas.ts` | 同上 | 链路数据随种子 json 单源化 |
| `lang_topic_profiles` 的清陈旧行 DELETE | `assignTopicProfiles` 现算 | `m9-p1d-seed-profiles.ts` | —（整行派生） | 现算结果与库的差集语义已在行注释声明 |

## 收拢台账（批次 C 进度）

| 步骤 | 状态 |
|---|---|
| CS3 upsert SQL 归一（8 处 → `seedRegistryUpsert` 单源） | ✅ 本批 |
| CS1 工具面子出口（5 模块迁出主 barrel + `tests/tooling-face.test.ts` 闸） | ✅ 本批 + **物理归位 v2 完成**（5 模块文件与其测试已迁 `src/tooling/`，级联：mode-assign/necessity/tests 的相对导入随迁） |
| CS4 最终处置 | ✅ **接入生产**：topic-terms → `GET /api/lang/topics/:id` 的 `attached_terms`；topic-filter → `GET /api/lang/topics`（含 coverage/options）；p1b-readme → `GET /api/lang/resources/readme`；grade-guard → `pnpm m9:grade-guard` 闸（仓库卫生守卫，无 server 接缝，生产化 = 独立闸） |
| CS6 产品线声明 + 号段规则 | ✅ 本文件 |
| CS2 种子纪律归一 | ✅ **两段完成**：第一段（0019 + `mergeSeedRow` + lang_topics）＋ 第二段（0020 唯一索引 + p1-5/p1-6/p1d/p1b 全部播种器三态化）——**全部播种内容表的单源纪律归一**，覆盖式 clobber 面清零。登记：p1-7 edges 保留 IGNORE（无内容列）；stage_id 双源写回留第三段设计题；p1-5 概念挂接回写 summary 是派生态 |
| CS5 barrel 收敛 | ✅ 工具 `pnpm barrel:audit` 交付；**首批即收官**：CS1 摘除工具面后，主出口 388 符号零消费仅 1（`InjectAskFn` 别名）已摘，现值 **0**——此前的「267 零消费」实为工具面家族的错位 |
| RQ4 只读段级 diff | ✅ `diffSections` 纯函数 + diff 命令挂接（包侧可达时段级明细，离线降级文件级；五状态判定与 golden 不动） |
