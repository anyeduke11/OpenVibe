# PROJECT.md — 项目心智模型

> **定位**：本文件是**索引与骨架**，供每次会话 30 秒建立上下文。**细则的唯一出处仍是**：`CLAUDE.md`（行为规则与收尾格式）、`DESIGN.md`（视觉口径）、`docs/decisions.md`（决策台账）、`docs/specs/*`（冻结契约）。本文件**不复写、不复制**上述内容；冲突时以上述文件为准。

## 项目概述

- **一句话**：OpenVibe（灵典）是本地优先的 vibe coding 工作台——把规则与上下文标准化成「标准包」，注入各家 AI coding agent，再做 diff/verify 与回流。
- **核心目标**（3 个）：① 规则资产可控分发（注入 → 校验 → 回流闭环）；② 多 Agent 中台化（本机指挥多 agent、规则一致可证）；③ 产出可沉淀为下一次的规则输入。
- **技术栈**：pnpm 11 monorepo（`apps/*` + `packages/*`）· Node ≥ 22 · TypeScript · Fastify · React · better-sqlite3 · zod · Vitest。

## 架构概览

依赖方向（单向，禁止反向）：

```
apps/web (React)  ─┐
apps/cli (commander)├→ apps/server (Fastify) → packages/core → packages/shared
apps/server ───────┘                          packages/adapters → packages/shared
```

边界约束（以代码注释为据，非推测）：

| 约束                                                                                    | 出处                                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/shared` 不依赖任何兄弟包                                                      | 各子包 `package.json` 依赖实读                                                                           |
| `packages/adapters` 只依赖 `shared`，且**不得被 `core` import**；编排留在 `apps/server` | [index.ts](file:///Users/duke/Documents/OpenVibe/packages/adapters/src/index.ts) 头注 R2                 |
| 新增平台 = 新增一个 adapter 模块 + `registry` 一行 + `ADAPTER_MAIN_PATH` 一行           | [registry.ts](file:///Users/duke/Documents/OpenVibe/packages/adapters/src/registry.ts) 头注（design §8） |
| `apps/cli` 通过 `apps/server` 复用服务逻辑，不重复实现                                  | 包依赖实读                                                                                               |

现状关键接口（3 个，全部为已建成契约）：

- `PackAdapter = { id: AdapterId; l1Capability: L1Capability; plan(pack: ResolvedPack): PlannedFile[] }` —— 见 [pack-contract.ts](file:///Users/duke/Documents/OpenVibe/packages/shared/src/pack-contract.ts#L56-L62)
- `adaptersFor(targets: AdapterId[]): PackAdapter[]` —— 按 `ADAPTER_IDS` 声明序返回，未知平台抛 `VALIDATION_ERROR`
- 端到端三条写入面：`apps/server` 路由（本地监听）· `apps/cli` 子命令 · `packages/core` 领域服务函数

技术选型与理由：

| 选型                | 理由                                                           |
| ------------------- | -------------------------------------------------------------- |
| Fastify             | 单进程本地 HTTP + 插件化；无云账号与常驻服务需求，契合 D-v25-7 |
| better-sqlite3      | 同步 API、单用户本机、免独立数据库进程                         |
| zod                 | 边界校验与 schema 单源，`shared` 内即契约                      |
| React + react-query | 消费本地 API；缓存与失效模型适配「本地写、轮询读」             |
| Vitest              | 与 TS 同栈、无需另起 runner                                    |

### 待定契约（v0.3.0 派发线提案，**全部未经 owner 裁定**）

| 缺口              | 现状事实                                         | 提案要点                                                                                                                                          | 约束                                   |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 派发能力位        | `PackAdapter` 只有 `plan()`，**无运行/派发方法** | 增可选 `run?(task, ctx)`，缺失即该 agent 不入注册表                                                                                               | **触 `design §8` 冻结面 ⇒ 走 A 级**    |
| 运行事件 schema   | 仓内无 agent 运行事件类型                        | 行级事件 `{ seq, ts, kind, sessionId?, payload }`，`kind` 取值 start / stdout / stderr / tool / result / exit                                     | 与既有本地事件台账同形，不新增监听端口 |
| 任务卡 / 结果证据 | 无结构定义                                       | `TaskCard{ id, rulesFingerprint, prompt, targets, createdAt }`；`ResultEvidence{ taskId, fingerprintSeen, exitCode, artifacts[], transcriptRef }` | 代码不出本机（B5）                     |
| **OM6** 分子分母  | 只写了「派发前规则一致性拦截率」，无可复算口径   | 分子 = 因规则指纹不一致被拒的派发请求数；分母 = 派发请求总数（含被拒）；7 天窗口，与 OM4 同口径                                                   | 表达式须能从本地事件台账复算           |

以上四行的落点是 **PRD 待裁定项**，不得据本文件直接开工；本文件只登记「缺口在哪、提案长什么样」。

## 模块地图

| 模块                | 职责                                                                                       | 对外接口                       | 依赖                         | 状态                 |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------- | -------------------- |
| `packages/shared`   | 跨包契约与单源常量：pack 契约、错误码、id、M9 状态机、提取提示词                           | 纯类型 + 常量 + schema（zod）  | 无兄弟依赖                   | 已建成               |
| `packages/core`     | 领域实现：db（SQLite 迁移与仓储）、inject、pack、repos、search、extract、services、local   | 领域服务函数                   | `shared`、better-sqlite3     | 已建成，持续扩展     |
| `packages/adapters` | 各 agent CLI 适配：claude-code / cursor / trae / codebuddy / minicode / generic + registry | adapter 接口 + registry        | `shared`                     | 已建成，注册表冻结面 |
| `apps/server`       | HTTP 面：routes / plugins / bootstrap / lib                                                | Fastify 路由（本地监听）       | `core`、`adapters`、`shared` | 已建成               |
| `apps/cli`          | 命令行：pack / inject / sync / verify / status / scan / mcp / serve                        | `commander` 子命令             | `server`、`core`、`adapters` | 已建成               |
| `apps/web`          | 工作台 UI：library / workbench / 设置 / 成长页等                                           | 消费 server API（react-query） | `shared` + server HTTP       | 已建成               |
| `docs/specs/*`      | 冻结契约与 FR 明细（含 §7 包契约、§8 adapter 注册表）                                      | 文档                           | —                            | 持续维护             |

## 编码约定

- **文件命名**：kebab-case；导出名 PascalCase（组件） / camelCase（函数）。
- **包名**：`@openvibe/<name>`；跨包只能走 `index.ts` 桶导出，不深穿内部路径。
- **类型与校验**：外部输入用 zod 在边界校验；内部调用信任类型，不重复校验。
- **测试**：Vitest；用例放同目录 `*.test.ts`；测试须编码「为什么」（业务不变量），不是只测「做了什么」。
- **格式与静态检查**：`pnpm format`（Prettier）、`pnpm lint`（ESLint + import-x 边界）、`pnpm typecheck`（tsc 两次：根 + web）。
- **注释**：只在逻辑不自明处写；中文即可，不写复述代码的注释。

## 质量红线

1. **单用户本机**：不做 admin/member、不做组织级共享库、不引入云账号体系（D-v25-7 永久有效）。
2. **不新增监听端口**：本地服务只监听本机；跨机形态仅「共享工件面 + 各机轮询」。
3. **agent 的判断不作为事实源**：agent 产出（含派发结果）一律进 pending 队列人工确认。
4. **冻结面不得擅动**：`pack.lock`、注入标记、MCP 只读工具面、`docs/design.md` §7 包契约与 §8 adapter 注册表——改动须走 A 级（owner 裁定 + 附录编号 + `schemaVersion+1` + 先改 golden）。
5. **颜色单源**：调用点只写语义 utility，不出现字面色阶与裸 hex；承载文字的配色两套主题均 ≥4.5:1（细则见 `DESIGN.md`）。
6. **落点只有三处**：既有批次验收标准 / `docs/decisions.md` / 观察池。

## 决策日志

**唯一出处**：`docs/decisions.md`（含 ㊹ 等编号条目）。本文件**不复写台账**，只记「本文件自身的变更」。

| 日期       | 决策                                    | 理由                                                                                                             | 替代方案                                                              |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 2026-11-19 | 创建本文件，设为索引层                  | 按 `prd-iterative` Phase 4 衔接要求生成；与既有文档冲突时以 `CLAUDE.md` / `DESIGN.md` / `docs/decisions.md` 为准 | 仅在 PRD 内补架构附录（未被采纳）                                     |
| 2026-11-19 | 架构段采用「现状契约 / 待定契约」两分法 | v0.3.0 派发线未裁定；现状与提案混写会让读者把提案当契约                                                          | 只写现状、缺口留空（会让下轮重新发现）／只写提案（等于代 owner 裁定） |
| 2026-11-19 | 四个缺口不新建 `docs/specs/*` 文件      | 缺口全部落在未裁定 PRD 内；写进冻结契约目录等于代裁定，且 `run()` 直接触 `design §8`                             | 建 `docs/specs/v030-dispatch.md`（待裁定后再建）                      |

## 已知问题

- `pnpm docs:check` 当前退出码 **1**（2026-11-19 实测）。已报出的成因为报数不判红绿的三类：3 份 spec 的 §8.2 裁决未在 decisions 留痕、16 个 DEV 号在 `DEV_LOG.md` 无对应标题、M8 探针结果留空 Q1/Q3/Q4。**具体触发红线的 error 行尚未定位**。
- 工作树 **306 个文件有未提交改动**（`git status --short`，2026-11-19），其中大量为既有批次的落地改动。
- 观察池 O1–O15 未清零（登记义务见 `CLAUDE.md` 与 `PRD v0.2.4 §14.3`）。
- `docs/PRD-v0.3.0-v0.9-20261119.md` 仍为**未裁定草案**：产品线边界（附录 A）、跨机载体形态、`design §7` 冻结面（FR-3.0-11）三项待 owner 裁定，不得据其开工。

## 生命周期

**当前阶段：开发**（v0.2.x 收尾 + v0.3.0 方案评审；非初始化、非架构阶段——本仓已有完整实现）。

| 阶段                             | 检查时间   | 结果                                                                                   | 发现的问题                                                                                 | 修复状态                                             |
| -------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 需求（v0.3.0 PRD 二次评审）      | 2026-11-19 | 通过（P0 7 项 + P1 6 项已修，三项静态闸全绿）                                          | P2 备忘 5 项；OM3/OM4 曾被误判为「无定义」                                                 | P2 已记录，OM3/OM4 引用已改正；剩余三项待 owner 裁定 |
| 初始化                           | 2026-11-19 | 完成（本轮生成本文件）                                                                 | 与既有文档存在重叠，靠「索引化 + 口径优先序」收敛                                          | 已在文件头写明优先序                                 |
| 架构                             | 2026-11-19 | **通过（带保留）**：模块划分 ✓ / 依赖无环 ✓ / 技术选型 ✓ / 红线覆盖 ✓ / **接口完整 ⚠** | 4 个缺口已转为「待定契约」登记：派发能力位、运行事件 schema、任务卡/结果证据、OM6 分子分母 | 现状契约已成文；4 项提案待 owner 裁定后方可开工      |
| 开发 / 测试 / 安全 / 交付 / 发布 | —          | 按既有批次推进（不走本文件流程）                                                       | —                                                                                          | —                                                    |
