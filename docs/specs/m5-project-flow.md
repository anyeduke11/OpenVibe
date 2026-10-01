# SPEC · M5 项目与流程管理（完整版）

| 项 | 值 |
|------|------|
| 模块 | M5 项目与流程管理 |
| 优先级 | P0 · MVP 核心 |
| 上游 | PRD 3.2-M5、5.2/5.4（业务流）、6 章（操作流）、附录 C |
| 下游设计 | design.md §5、§6、§10（页面结构） |
| 关联任务 | tasks.md T5 |
| 版本 | v1.0（2026-09-20 定稿）· 未修订；本行为 2026-09-23 按 §0.3 补写的痕迹基线。条件项：D15 dogfooding 证伪线若在**真发布（`npm publish` 成功）后两周内**触发，工作台 UI（看板/日志/阶段条）后移 P1.1 并改本 spec §2 范围表（见 dev-plan §15 条件挂起项）。**「发布」指哪件事由 owner 2026-09-27 裁队列 ④ 钉死**：推 tag 不算起点；本格属口径落款、不改条件语义，故不升版（升版段可复核原则） → v1.1（2026-09-30，**新增 FR-8「端口与服务」只读卡**：`GET /api/projects/:id/ports` 合并「仓库声明的端口」与「本机实际监听的端口」，实现落 `apps/server/src/lib/port-scan.ts` + `routes/ports.ts` + `apps/web/src/components/projects/PortsPanel.tsx`，端口锁定见 `DEV-0070`。§2/§5/§6/§7/§8 各补一行，既有 FR 一字未改。**两处编号欠账明写**：① 端口波次**没有** DEV_LOG 记录，其截图挂在 `docs/devlog-evidence/DEV-0047/`，而 `DEV-0047` 这条号在 DEV_LOG 里是 2026-09-27 的「队列 ④（D15 观察窗起点）收口」笔，两者无关；② 本卡归属模块是 **M5 项目工作台**，代码注释里写的「m7」不是 PRD 3.2 的团队模块号（M7=多用户与评审），已随本笔把注释指向本 spec。两项待 owner 裁定补号，不在本轮文档笔内代填） → v1.2（2026-10-01，**owner 裁队列 ㉖ 的两处「契约写了、实现与界面不接」**。**(a)** §5-6 明写 `projectPath` 承认空串（未登记 `localPath` 时的合法出参）——§6-7 本就规定返回 `projectPath=''`，违例方是实现：`packages/shared/src/schemas/ports.ts` 的 `z.string().min(1)` 与自家 spec 相反，随裁放宽为 `z.string()`；钉住它的腿在 `packages/shared/src/shared.test.ts` 族名 `UT-PORTS-01`，RED 先落在「空串被拒」那一半件、改后转绿。**此刻不炸的唯一原因是出参侧没有运行时闸**，所以这条不是「修一个不会发生的崩溃」，而是拆掉「谁补出参校验谁就当场抛」那颗雷。**(b)** `listeners` 定性为 `services` 的合并输入、不出独立清单，§7-12 里「参考区未建」那句负向登记随之撤销，段末那条断言由钉现状升为钉契约。两处既有 FR 一字未改） |

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
| **端口与服务**只读卡（v1.1，2026-09-30 落地，FR-8）：项目仓库声明的端口 × 本机实际监听的端口 | 端口的**写动作**（启停服务、释放占用、改配置文件）与跨机器端口视图 |

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

### FR-8 端口与服务（只读台账，v1.1 新增，2026-09-30 落地）
1. 项目详情页一张**只读**卡，回答两个问题并交叉：这仓库**声明**了哪些端口（从配置文件认出来的），这台机器**正在监听**哪些（从系统查出来的）。同端口号合并成一行：有监听者 → `listening`（带进程名、pid、可点的 `http://localhost:<port>`）；无 → `idle`。**无持久化**——端口是易变态，每次现扫现报，库里不落表。
2. 声明侧认读面（固定名单、只读、解析失败静默跳过）：项目根一层 + **一级子包** `apps/*`、`packages/*`（monorepo 的服务几乎都长在子包里，只扫根等于没扫；深度固定两层、不递归）。文件名 `.env`/`.env.local`/`.env.example`、`package.json`、`vite.config.{ts,js}`、`{docker-}compose.{yml,yaml}`、`Dockerfile`。
3. 六类来源与优先级（同端口多来源时取**优先级数值最小**即最具体的一条，`sourceFile` 如实带子包前缀）：`dotenv`(1，`PORT=3000` / `export PORT=3000`) → `package-script`(2，scripts 里的 `--port` / `-p` / 行内 `PORT=`) → `config-file`(3，vite `port:`) → `compose`(4，`"8080:80"` 取主机侧) → `dockerfile`(5，`EXPOSE`) → `convention`(6，`package.json` 依赖命中约定表：vite 5173 / next·nuxt·react-scripts 3000 / astro 4321 / @angular/cli 4200 / @sveltejs/kit 5173 / flask 5000 / uvicorn·fastapi 8000)。约定类**仅当依赖里真实出现该包名**才报，不猜。
4. 监听侧：darwin/linux 走 `lsof`、win32 走 `netstat -ano`，一律 `execFile(固定二进制, 固定参数数组)`——**无 shell、无字符串拼接、任何项目路径或用户输入都不进 argv**；解析器是纯函数（文本进、结构出），单测喂罐头输出。地址归一为两类：全接口 `*`、具体地址（含 IPv6 `[::]` → `*`）。命令缺失/权限不足/执行失败 → 降级为 `listenersWarning`，**声明侧照常返回**，不整体报错。
5. 刷新节奏：Web 侧 15 s 轻轮询（`staleTime` 5 s）。不做 WebSocket、不做系统级监听订阅。
6. 出参 `{ projectPath, scannedFiles[], services[PortStatus], listeners[], listenersWarning? }`；`PortStatus` 的 `url` **只在监听中且端口为 http 语义时给**，且一律 `localhost`——服务端不猜测域名。`projectPath` **允许空串**（未登记 `localPath` 时的合法出参，口径同 §6-7），schema 侧不得对它加 `min(1)`；`listeners` 只作 `services` 的合并输入，**不出独立清单**（㉖(b)）。
7. **写动作一律不在本卡**（§2 Out）：启停服务、释放端口、改配置文件都不做，卡上没有任何按钮会改磁盘或发信号。这条与 FR-6.2「Web 端不写项目目录」是同一条纪律的两个落点。

## 5. 输入 / 输出

- **API**：`/api/projects`（含 `POST /:id/stages/current`，与 design §6 一致）、`/api/flow-templates`（含 `POST /:id/duplicate`）、`/api/projects/:id/tasks`、`/api/projects/:id/devlog`（含 `GET /:id/devlog/export`）、`/api/projects/:id/injection-status`、`/api/projects/:id/ports`（FR-8，只读）。
- **UI**：`/projects`（列表）、`/projects/:id`（工作台：健康摘要 + 阶段条 + 看板 + 日志 Tab + **端口与服务卡** `PortsPanel`）。
- **对下游输出**：流程阶段+清单（M6 打包 → CHECKLIST.md）；复盘回流 → M1/M3 草稿。

## 6. 边界与异常

1. localPath 指向文件而非目录 / 无权限 → 同「不存在」处理（warning）。
2. 阶段名在快照内重命名后，已有 ProjectCheckState 与 Task.stageName 以**旧名孤儿化**处理：显示为「（已移除阶段）<旧名>」分组，不丢数据，可手动归位。
3. entryNo 并发创建 → 以事务串行分配，保证不重号；冲突时重试一次。
4. lock 文件损坏/字段缺失 → 注入状态显示「未知（lock 文件异常）」，不影响其他功能。
5. 删除项目 → 级联删除任务/日志/勾选状态；确认框明示「将删除 N 条日志」。**不触碰 localPath 目录下任何文件**。
6. 导出日志中 Markdown 表格与正文转义遵循原样（日志正文不二次转义）。
7. **（FR-8）** 项目未登记 `localPath`（或为空串）→ 端口卡返回**空台账不报错**：`services=[]`、`scannedFiles=[]`、`projectPath=''`，只有本机监听清单；`localPath` 指向的目录当前不存在/不是目录 → 仍报本机监听，声明侧置空并给 `listenersWarning` 说明原因。项目 id 本身不存在 → 404 `NOT_FOUND`。
8. **（FR-8）** 声明侧只读白名单文件，解析失败静默跳过（非法 JSON 的 `package.json` 不炸整卡）；端口号只接受 1–65535 的整数，越界与 NaN 在入集前丢弃。
9. **（FR-8）** `lsof` / `netstat` 不可用（未安装、权限不足、非 darwin/linux/win32 平台）→ `listeners=[]` + `listenersWarning`，**声明侧仍完整返回**；测试用注入的 runner 抛错来固定这条降级路径，不依赖真机命令。
10. **（FR-8）** 深度固定为「根 + 一级子包」，不递归——大仓不会因为扫端口而走遍文件系统；`node_modules` 不在名单里，按文件名白名单天然不被触及。

## 7. 验收标准（pass/fail）

1. 用「个人轻量流」建项目并注入（配合 m6b）→ 工作台显示该包@版本与注入时间；改登记版本为更新版 → 出现「可更新」提示。
2. 复制「Spec 驱动流」为自定义 → 删除其中 1 个阶段、加 2 条清单项 → 新建项目选该模板 → 快照与编辑后一致；原内置模板未变。
3. 编辑内置模板的编辑入口被禁用（API 返回 403 `BUILTIN_IMMUTABLE`）。
4. 勾选 3/5 检查项 → 完成度 60%；刷新后状态保持；勾满后阶段 ✅。
5. 看板拖拽 todo→doing、列内排序 → 刷新后顺序与状态保持。
6. 连续创建 3 条 DEV 日志 → 编号 DEV-0001/0002/0003；导出 DEV_LOG.md 内编号有序、含 evidence 字段段。
7. 从一条日志「存为术语候选」→ 术语库出现 draft 词条，source=project:<名>，日志 linkedAssetIds 含其 id；词条详情显示来源反链。
8. 删除项目 → tasks/devlog/checkstate 计数为 0（SQLite 验证），目标目录文件原样（哈希对比不变）。
9. **（FR-8）** 造一个含 `.env PORT=3000` + `package.json`（scripts 带 `--port 5173`、依赖含 `next`）+ `docker-compose.yml` + `Dockerfile EXPOSE` 的夹具目录 → `scanDeclaredServices` 六类来源全部认出、同端口按优先级只留最具体的一条、`scannedFiles` 如实列出读过的文件；monorepo 夹具的 `apps/*/package.json` 约定依赖与 scripts 端口都被认出；空目录返回零声明零文件、非法 JSON 不抛。—— `apps/server/test/ports.api.test.ts`「port-scan · 声明扫描器（纯文件解析）」段三支（跑法 `pnpm vitest --project integration --run apps/server/test/ports.api.test.ts`）。
10. **（FR-8）** 监听解析用罐头输出断言：`lsof` 的 `TCP *:5173` / `127.0.0.1:8787` / `[::]:3000` 三类地址归一并按端口排序；`netstat -ano` 的 `0.0.0.0` / `[::]` 归一为 `*` 且提取 pid；注入的 runner 抛错时**降级为 warning 不抛**。—— 同文件「port-scan · 监听器解析（罐头输出）」段三支。
11. **（FR-8）** 端点合并语义：监听中的端口带 `process`/`pid`/`url`，未监听的 `state=idle` 且不带这三项；未登记 `localPath` 的项目返回空台账且 HTTP 200；`localPath` 指向已消失的目录时声明侧置空并给出 `listenersWarning`、本机监听照报；不存在的项目 404。—— 同文件「GET /api/projects/:id/ports」段（复算 `grep -cE '^[[:space:]]*it[\.(]' apps/server/test/ports.api.test.ts`；合并语义那支是改前旧腿，其余新腿见 `DEV-0081`。其中「路由级合并」走 `buildApp` 的 `listListenersImpl` 注入点，不依赖真机 `lsof`/`netstat`，三平台可复跑）。
12. **（FR-8）** 项目详情页渲染端口卡：`PortsPanel` 有自动化 DOM 断言（`apps/web/src/components/projects/PortsPanel.test.tsx`，族名 `WEB-PORTS`；段内逐支复算 `grep -cE '^[[:space:]]*it[\.(]' apps/web/src/components/projects/PortsPanel.test.tsx`），钉的是：监听行三件套（状态点文案==aria-label、进程列带 pid、打开列是真链接且 `rel` 含 `noreferrer`）、idle 行不泄漏进程/pid 且整行无链接、来源列同时给中文标签与仓库相对路径、`listenersWarning` 有则原样印无则节点不存在、`scannedFiles` 非空才出认读行、三种空卡文案互不串、`listeners` 非空而 `services` 空时不渲染表。另有人工凭据 `docs/devlog-evidence/DEV-0047/01-ports-panel.png`（真机 vite 5144 在监听 → 该行显示 `listening` 且端口可点）。**未验证面**：15 s 轻轮询（`apps/web/src/hooks/useProjectPorts.ts`，`refetchInterval: 15_000`）无断言——它验的是 react-query 的行为而非本仓代码，要钉需 fake timers；`data.listeners` 在 UI 无落点这一条**已从「未验证面」移出**——owner 2026-10-01 裁队列 ㉖(b)：该字段定性为 `services` 的合并输入、不出独立清单，schema 侧那句「参考区」promise 随之删掉，于是段末那条「`listeners` 非空而 `services` 空时不渲染表」断言由「钉现状」升为**钉契约**（要反过来建那一区，得先回本 spec 加验收条目）。前端 dev/preview 端口固定 5144 且被占即 `strictPort` 报错退出（不漂移），实测见 `DEV-0070`。

## 8. 依赖

- 依赖：T2 存储层；seed-content.md（3 套模板）；m6a（包版本登记）、m6b（lock 文件格式）；`apps/server/src/lib/port-scan.ts`（FR-8 的事实层：文件认读 + `lsof`/`netstat` 只读查询，契约在 `packages/shared/src/schemas/ports.ts`）。
- 被依赖：M6（CHECKLIST.md 素材）；M1/M3（回流草稿入口）。
