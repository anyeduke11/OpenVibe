# SPEC · M5 项目与流程管理（完整版）

| 项 | 值 |
|------|------|
| 模块 | M5 项目与流程管理 |
| 优先级 | P0 · MVP 核心 |
| 上游 | PRD 3.2-M5、5.2/5.4（业务流）、6 章（操作流）、附录 C |
| 下游设计 | design.md §5、§6、§10（页面结构） |
| 关联任务 | tasks.md T5 |
| 版本 | v1.0（2026-09-20 定稿）· 未修订；本行为 2026-09-23 按 §0.3 补写的痕迹基线。条件项：D15 dogfooding 证伪线若在发布后两周内触发，工作台 UI（看板/日志/阶段条）后移 P1.1 并改本 spec §2 范围表（见 dev-plan §15 条件挂起项） |

---

## 1. 目标与用户价值

AI 编码项目从「开工即失序」变成「有模板、有清单、有日志」：

- 新项目 10 分钟：建项目 → 选流程模板 → 拿到注入命令 → 开工；
- 每天 5-10 分钟：看板上扫一眼进度，勾掉当前阶段检查项，下班前补一条 DEV 日志；
- 项目收尾 30-60 分钟：过清单 → 写 CHECK 报告 → 把产出**一键回流**为术语/提示词草稿（飞轮第⑤步的 MVP 落地）。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| 项目 CRUD + 工作台（健康摘要） | 多人协作 / 指派（P2/M7，assignee 字段预留不启用） |
| 3 套内置流程模板 + 复制自定义 | 自定义模板从零新建（MVP 只能「复制后改」） |
| 阶段 + 检查清单（逐项勾选、完成度） | AI 会话记录自动挂接（P1；MVP 日志正文手动粘贴摘录） |
| 简化看板（待办/进行/完成，任务挂阶段） | 甘特/里程碑/多人负载 |
| 开发日志（DEV/CHECK 模板、编号递增、导出 DEV_LOG.md） | 日志全文检索（MVP 项目内过滤即可） |
| 复盘回流快捷入口（日志 → 术语/提示词草稿） | 复盘候选**自动**提取（P3；MVP 人工一键） |
| 工作台读取 `.openvibe/pack.lock.json` 显示注入状态 | 双向同步 / 远端项目（P1+） |

## 3. 数据与核心概念

```
Project {
  id: "prj_<nanoid>",
  name: string,                  // 必填 ≤100
  localPath: string,             // 本地绝对路径；可为空（仅登记不注入）
  flowTemplateId: id,            // 必填；实例化时物化 stages 快照到 Project.stagesSnapshot
  stagesSnapshot: Stage[],       // 复制自模板，此后与模板解耦（模板再改不影响存量项目）
  currentStage: string,          // 手动选定
  status: "active" | "paused" | "archived",
  standardPackId / standardPackVersion,   // 可空；组包后回填
  createdAt / updatedAt
}
Stage { name, checklist: [{ id, text }], artifacts: string[] }

FlowTemplate {
  id: "flw_<nanoid>",
  name, kind: "light" | "spec_driven" | "retro" | "custom",
  stages: Stage[],               // 结构同上
  builtin: boolean               // 内置模板 builtin=true，禁止编辑/删除，只可复制
}

Task { id: "tsk_<nanoid>", projectId, title, stageName(可空),
       status: "todo" | "doing" | "done", order: integer }

DevLogEntry {
  id: "log_<nanoid>", projectId,
  type: "DEV" | "CHECK",
  entryNo: integer,              // 项目内按类型独立递增：DEV-0001…、CHECK-0001…
  title, body(Markdown),
  relatedFiles: string[],        // 关联文件
  evidence: { command, resultSummary },   // 测试验证（可空）
  linkedAssetIds: string[],      // 回流产生的术语/提示词 id（反向可查）
  createdAt
}
```

**健康摘要（工作台顶栏）** = 当前阶段名 + 未勾检查项数/总数 + 最近一条日志时间 + 注入状态（读 lock 文件，FR-6）。

## 4. 功能需求（FR）

### FR-1 项目工作台
1. 项目列表：名称、状态、当前阶段、健康摘要三要素（未完项、最近日志、注入状态）、排序按 updatedAt。
2. 创建向导三步：基本信息（名称/localPath）→ 选流程模板（3 内置 + 自建 custom）→（可选）关联标准包并展示对应 `openvibe sync` 命令（一键复制）。
3. localPath 保存时服务端验证：存在 → 记录其是否含 `.openvibe/pack.lock.json`；不存在 → 允许保存但标 warning「路径当前不存在」。
4. 归档项目从默认列表隐藏，可筛选查看；暂停/激活仅切换状态。

### FR-2 流程模板
1. 内置 3 套（内容定义在 seed-content.md FR-2）：个人轻量流 / Spec 驱动流 / 复盘流；`builtin=true` 不可编辑删除。
2. 「复制为自定义」→ kind=custom、builtin=false，可增删改阶段/清单项/artifacts。
3. 阶段顺序拖拽调整；每阶段 checklist 项可增删改文本。
4. 模板变更不影响已创建项目（stagesSnapshot 已物化）；项目详情显示「快照自 <模板名>」。

### FR-3 阶段与检查清单
1. 工作台按 stagesSnapshot 顺序展示阶段条；当前阶段高亮。
2. 检查项勾选状态按项目持久化（ProjectCheckState: {stageName, itemId, checkedAt}）；勾选/取消即时保存。
3. 阶段完成度 = 已勾/总数；全部勾选后阶段标记 ✅，不强制（允许带着未勾项切换阶段，仅提示）。

### FR-4 任务看板
1. 三列：todo / doing / done；卡片 = 任务（标题 + 阶段标签）；同列内拖拽排序（order 持久化）。
2. 任务增删改、跨列移动、挂到任一阶段（或无阶段）。
3. 看板不做 WIP 限制、不做泳道（明确简化，防蔓延）。

### FR-5 开发日志
1. 新建日志选类型 DEV / CHECK，`entryNo` 服务端按「同项目同类型最大值 +1」分配，展示为 `DEV-0012`（4 位零填充，>9999 自然扩展位数）。
2. 正文预填模板（类型不同模板不同），占位含：时间、类型、关联文件、问题描述/实现思路、测试验证（command/result）——与全局 AGENTS 规范及 PRD 附录 C 对齐。
3. 日志列表按时间倒序、按类型过滤；单条查看渲染 Markdown。
4. 导出：项目全部日志 → 按类型合并为 `DEV_LOG.md` / `CHECK_LOG.md` 下载（格式与模板一致，编号有序）。

### FR-6 注入状态联动（只读桥接）
1. 工作台读取 `<localPath>/.openvibe/pack.lock.json`（存在时）：显示包名@版本、注入时间、与项目登记的 standardPackVersion 是否一致（不一致 → 「可更新」提示 + sync 命令）。
2. **只读**：Web 端不写项目目录任何文件（写路径唯一 = CLI）。

### FR-7 复盘回流快捷入口（飞轮第⑤步 MVP 落地）
1. 日志详情页两个动作：
   - 「存为术语候选」→ 打开术语表单，definition 预填日志选中段落（或整条正文），status=draft，source=`project:<项目名>`；
   - 「存为提示词草稿」→ 打开提示词表单，content 预填选中段落，status=draft。
2. 回流成功后日志 `linkedAssetIds` 记录新资产 id；资产详情页反向显示「来源：项目 X 的 DEV-0007」。
3. MVP 不做候选自动提取与去重判断——纯人工触发（自动提取 P3，见 proposal §3.1 Out）。

## 5. 输入 / 输出

- **API**：`/api/projects`（含 `POST /:id/stages/current`，与 design §6 一致）、`/api/flow-templates`（含 `POST /:id/duplicate`）、`/api/projects/:id/tasks`、`/api/projects/:id/devlog`（含 `GET /:id/devlog/export`）、`/api/projects/:id/injection-status`。
- **UI**：`/projects`（列表）、`/projects/:id`（工作台：健康摘要 + 阶段条 + 看板 + 日志 Tab）。
- **对下游输出**：流程阶段+清单（M6 打包 → CHECKLIST.md）；复盘回流 → M1/M3 草稿。

## 6. 边界与异常

1. localPath 指向文件而非目录 / 无权限 → 同「不存在」处理（warning）。
2. 阶段名在快照内重命名后，已有 ProjectCheckState 与 Task.stageName 以**旧名孤儿化**处理：显示为「（已移除阶段）<旧名>」分组，不丢数据，可手动归位。
3. entryNo 并发创建 → 以事务串行分配，保证不重号；冲突时重试一次。
4. lock 文件损坏/字段缺失 → 注入状态显示「未知（lock 文件异常）」，不影响其他功能。
5. 删除项目 → 级联删除任务/日志/勾选状态；确认框明示「将删除 N 条日志」。**不触碰 localPath 目录下任何文件**。
6. 导出日志中 Markdown 表格与正文转义遵循原样（日志正文不二次转义）。

## 7. 验收标准（pass/fail）

1. 用「个人轻量流」建项目并注入（配合 m6b）→ 工作台显示该包@版本与注入时间；改登记版本为更新版 → 出现「可更新」提示。
2. 复制「Spec 驱动流」为自定义 → 删除其中 1 个阶段、加 2 条清单项 → 新建项目选该模板 → 快照与编辑后一致；原内置模板未变。
3. 编辑内置模板的编辑入口被禁用（API 返回 403 `BUILTIN_IMMUTABLE`）。
4. 勾选 3/5 检查项 → 完成度 60%；刷新后状态保持；勾满后阶段 ✅。
5. 看板拖拽 todo→doing、列内排序 → 刷新后顺序与状态保持。
6. 连续创建 3 条 DEV 日志 → 编号 DEV-0001/0002/0003；导出 DEV_LOG.md 内编号有序、含 evidence 字段段。
7. 从一条日志「存为术语候选」→ 术语库出现 draft 词条，source=project:<名>，日志 linkedAssetIds 含其 id；词条详情显示来源反链。
8. 删除项目 → tasks/devlog/checkstate 计数为 0（SQLite 验证），目标目录文件原样（哈希对比不变）。

## 8. 依赖

- 依赖：T2 存储层；seed-content.md（3 套模板）；m6a（包版本登记）、m6b（lock 文件格式）。
- 被依赖：M6（CHECKLIST.md 素材）；M1/M3（回流草稿入口）。
