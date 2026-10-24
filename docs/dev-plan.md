# OpenVibe P1 开发实施方案（dev-plan）

| 项 | 值 |
|------|------|
| 文档定位 | **P1 MVP 详细工程实施方案 + 执行计划**：架构 / 数据库 / API / 后端 / 前端组件 / CLI / 领域核心 / 平台适配 / T1–T9 分解 / 测试映射 / 日级排期 / 内容生产 SOP |
| 上游 | [PRD.md](./PRD.md)、[specs/](./specs/)（行为规格）、[design.md](./design.md)（§7 标准包契约 / §8 adapter 清单为**冻结契约**）。**本行不抄 PRD 版本号、不抄 specs 支数**（同下一行对 `decisions.md` 队列上界的规矩，按 §13-8 数字单源）——PRD 头部「版本」格与 `docs/specs/` 目录本身是各自的单源，抄在这里必腐：本行此前长期停在「v0.1.4／×8」，2026-10-03 现测两者均已错位（PRD 版本格现值复算 `grep -m1 '^\| 版本 \|' docs/PRD.md`，specs 支数复算 `ls docs/specs/*.md \| wc -l`；两处采样值与判级登记在本文 §16.12 末行）。**v0.1.4 这一串号本身还另有历史**——PRD 版本行自陈 v0.1.4 是 2026-09-21 的 D17 更名版，即本行停在了九天前那一版 |
| 姊妹文档 | [tasks.md](./tasks.md)（里程碑概览：门禁 / 依赖图 / 人日口径——本文不改变其任何数字，只做执行展开）、[decisions.md](./decisions.md)（**待决策项队列的单源**；本文不抄队列上界——它随立项升版，当前范围与条数一律读该文件的表格行首序号。本文与其冲突时以该文件为准，见 `DEV_LOG [DEV-0038]`） |
| 下游 | T1–T9 每日执行；DEV_LOG 记录依据；CI 用例命名 |
| 版本 | v1.0（2026-09-20） |
| 执行纪律 | **任何 T 任务开工前先读 §0**；本文与 specs/design 冲突时，冻结契约 > spec > 本文（按 §0.3 分级处理冲突本身）。**勾选语义（2026-09-25 定口径）**：本文 §T1–T9 的 `- [ ]` / `- [x]` 是**写作当时的计划展开**，**不追踪执行**——34 个未勾框（含「仓库落地（D16/D17）」「落 `LICENSE`」两项，**均已实装**）**不代表欠账**，读它当 todo 会凭空造出 34 项工作量；**执行台账单源在 [tasks.md](./tasks.md)**（65 勾 / 5 未勾，那 5 项逐条可归因：1 条自称 T9 历史、1 条阻塞真发布、1 条归 P2、2 条 P0 期已划掉），判进展一律走 tasks.md + 门禁实测，**不得回头补勾本文的框**（补勾等于把计划文档改成第二份台账，正面撞 §13-8 单源规矩与本行纪律）。口径登记于 `DEV_LOG [DEV-0028]` 2026-09-25 后记。 |

---

## §0 SPEC 流程与规范

### 0.1 执行循环（每个任务的标准节奏）

```
①读规格    打开对应 spec 的 FR 与「边界与异常」节，列出本任务覆盖的 FR 编号区间
②按权威实现 实现细节以 design.md 权威节为准（§6 API / §5 DDL / §7 契约 / §8 adapter）
③逐条验收  对照 §9 的「验收-测试映射表」，逐条跑用例或录屏，全绿才勾任务
④记录      每完成一个任务组（或组内完整功能）→ DEV_LOG 追加 DEV-NNNN（编号递增）
```

- **完成判定**：映射表该任务所有行 = pass（自动化用例绿 / 人工项录屏归档）。部分通过 = 未完成，DEV_LOG 记「未实现」清单。
- **反例（禁止）**：跳过映射表直接勾任务；实现时顺手改 spec 而不走 §0.3；用「实现现状」反向充当验收标准。

### 0.2 Dogfooding：Spec 驱动流阶段映射

OpenVibe 自身开发按内置「Spec 驱动流」（seed-content §3.3 ②）执行——产品吃自己的狗粮：

| 流阶段 | 状态 | 产物 / 证据 |
|--------|------|------------|
| 1 需求澄清 | ✅ | PRD 第 0 章、2.2 用户故事 |
| 2 PRD | ✅ | PRD 第 0 章、2.2 用户故事。**本行不抄 PRD 版本号、不抄变更日志条数**（规矩同本文头部「上游」行与 §13-8 数字单源）——两个单源分别在 PRD 头部「版本」格与该节表格本身，复算 `grep -m1 '^\| 版本 \|' docs/PRD.md` 与 `grep -cE '^\| v0\.' docs/PRD.md`。本行原写「v0.1.3（变更日志 5 版）」，2026-10-03 现测两数均已错位（版本格现值 **v0.2.0（2026-10-02）**、表格行数现值 **12**），登记见本文 §16.12 第 9 行 |
| 3 Spec 规格 | ✅ | [specs/](./specs/)。**本行不抄支数、不抄清单**（同上一条规矩）——目录本身是单源，复算 `ls docs/specs/*.md \| wc -l`。本行原写「×8（m1/m2/m3/m5/m6a/m6b/seed/onboarding）」，2026-10-03 现数 **21**（其中 9 份为当日 RF0–RF3 那轮新建；原清单另已漏 `m4-playbook.md` 与 `theme.md`），登记见 §16.12 第 9 行 |
| 4 计划 | ✅ | tasks.md + 本文档 |
| 5 实现 | ▶ P1 | T1–T9（本文 §9），每任务完成即验证（§0.1） |
| 6 审查 | ▶ P1 | 每任务组完成后跑三维审查快查：**逻辑一致性 / 批判性 / 第一性原理**（PRD 附录 D 方法，检查表见下） |
| 7 复盘 | ▶ P1 | T9 retro + 首批回流资产 ≥3 条入库（DoD 第 5 条） |

- **三维审查快查表**（每任务组 15 分钟，结果写入对应 DEV-NNNN 的「验证记录」）：
  1. 逻辑一致性：实现与 spec FR/验收有无断链？数据流有无缺字段/缺通道？
  2. 批判性：有没有「物理不可行 / 过度前置」的实现选择？
  3. 第一性原理：这个任务交付物对「标准化飞轮」是否必要？有没有更小的等价实现？
- **节奏检查**：每 40 轮对话 → 生成 CHECK-NNNN 报告（维度：重复性 / 达达度 / 变更追踪 / 合规性 / 引用可靠性，对齐全局规范）。

### 0.3 变更控制分级（实现中发现 spec 缺陷 / 需求变化时）

| 级别 | 涉及对象 | 处理流程 |
|------|----------|----------|
| **A 冻结契约** | design §7（标准包契约）、§8（adapter 清单）、schemaVersion、golden 快照 | ① DEV_LOG 记问题与证据 → ② owner 裁定（PRD 附录 D 新增 D 编号）→ ③ 契约升版（schemaVersion +1，旧版可读）→ ④ **先改 golden 快照基线**再改实现 |
| **B 行为规格** | specs 的 FR / 边界 / 验收条目 | ① DEV_LOG 登记 → ② 修改 spec 并在 spec 头部加版本行（格式：`版本 v1.1（2026-09-22，D13 增 FR-4.2）`）→ ③ 同步本文 §9 映射表 |
| **C 实现细节** | design 非冻结节（§2–§6、§9–§16）、代码结构 | 直接修改 + DEV_LOG 登记「C 级变更」小节 |
| 判定规则 | 拿不准往高级别归 | — |

- **升版段可复核原则**（2026-09-26 队列 ⑥ 复核后立，**只对此后生效**）：规格版本链里每一段 `→ v1.x（…）` 必须对应**一笔可 `git show` 的改动**。若一次 commit 补记多段升版（分档决策攒到最后一起写是允许的），**须在所涉及的每一段里自注一句「本段与 v1.y 段同笔入库（`<sha>`），无独立可复核态」**。立这条的原因不是洁癖：⑥ 复核时实测 `m6-cli-injection.md` 的 v1.1–v1.3 与 `m6-standard-pack.md` 的 v1.1–v1.2 **各在同一笔 commit 内首现**，git 里没有中间态 ⇒ 链上「由 A 改为 B」式的自述只能信散文，**逐次判级因此不可独立复算**，而 §0.3 的整套分级恰恰依赖"这次改了什么"能被独立查出来。**只带日期的补记不满足这条**——日期不告诉你哪一笔是那一笔。
- **反漂移原则**：spec 与本文引用 design 权威节用「链接 + 节号」，**不复制正文数值**（双源必漂移——立项当天 T7 人日 / 端点名的漂移即教训）。
- **本文已登记的 C 级变更**（随 DEV-0009 落档，并已回写 design）：
  - C-1：`app_meta` 表（向导完成标记、`telemetryAskState` 的持久化载体；design §5 原缺）→ 见 §2.4
  - C-2：`telemetry_events` 本地队列表（design §11.5 提及、§5 原未列）→ 见 §2.4
  - C-3：`GET/POST /api/settings/telemetry` 两端点（D13 卡片与设置页共用的开关读写通道；design §6 原缺）→ 见 §3.12
  - C-4：D13 询问的**单一数据源**裁定——`app_meta.telemetryAskState` 为唯一权威；CLI 离线注入时不询问、延迟到 Web 向导③完成卡片（避免 CLI 本地标记与 app_meta 双源冲突）

### 0.4 SPEC 编写规范（新增 / 修订 spec 时）

1. **八段式固定结构**（与现有 specs 一致）：目标与用户价值 → 范围（In/Out 表）→ 数据与核心概念 → 功能需求 FR → 输入/输出 → 边界与异常 → 验收标准（pass/fail）→ 依赖。
2. **FR 编号递增不重排**：修订插值用 `FR-N.M`（如 FR-4.2），删除保留编号并在该行标注「已删除（原因，日期）」。
3. **验收标准必须可判定**：每条要么自动化（指明测试 ID 段），要么人工可录屏/截图归档；禁止「体验良好」类措辞。
4. **No spec, no task**：P1.1/P2 功能进入开发前必须先有 spec 八段式 + 验收条目，才允许进 dev-plan 迭代版。
5. 命名：`m<N>-<slug>.md`（模块号沿用 PRD 3.2）；横切能力用功能名（如 `onboarding.md`）。

---

## §1 架构总览

### 1.1 分层与依赖规则

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web (React SPA)      apps/server (Fastify)   apps/cli      │
│  页面/组件/Query 缓存       REST API + 静态托管     serve/scan/   │
│                                                  sync/diff      │
└──────┬───────────────────────┬──────────────────────┬───────────┘
       │           zod schema / 类型 / 错误码（packages/shared）   │
       └───────────┬───────────────────────┬───────────┘
                   ▼                       ▼
          packages/core                packages/adapters
          db / repos / pack /           六平台 Adapter + registry +
          importers / search            兼容矩阵常量
                   │                       │
                   └───────────┬───────────┘
                               ▼
                    ~/.openvibe/data/openvibe.db（SQLite WAL + FTS5）
                    目标项目目录（CLI 写入，唯一文件写通道）
```

依赖规则（T1 用 ESLint 强制）：

| # | 规则 | 强制方式 |
|---|------|----------|
| R1 | `apps/*` 可依赖 `packages/{core,adapters,shared}` | allow 清单 |
| R2 | `packages/adapters`、`packages/core` 只依赖 `packages/shared` | 同上 |
| R3 | **`packages/core` 禁止依赖任何 app / server**（CLI 离线模式前提） | no-restricted-imports 硬禁 |
| R4 | web 与 server 只经 HTTP API 交互，不共享进程状态 | 代码评审纪律 |

### 1.2 运行形态与启动序列

`npx openvibe-cli serve [--port 8787] [--open]` 启动序列（bootstrap.ts，§4.3）：

```
1 解析配置发现链（旗标 > env > ~/.openvibe/config.json）
2 首启判定：config.json 不存在 → 初始化 ~/.openvibe/{data,packs,logs}
  + 生成 token（crypto.randomBytes(32).hex）写 config.json（chmod 0600）
3 打开 SQLite（WAL，foreign_keys=ON）→ 跑未执行的 migrations（§2.5）
4 seed 播种（terms → flow-templates → prompts，幂等，§7.4）
5 首启追加：自动组装预置 default 包（onboarding FR-1，复用 m6a 导出通道）
6 Fastify listen 127.0.0.1:8787 → 注册路由与鉴权插件
7 托管 apps/web 构建产物（plugins/static），SPA 404 回退
8 --open 时调系统浏览器
```

- serve 与 sync/scan 可并行：sync/scan 只读 HTTP API + 写目标项目目录，不碰 DB 文件锁。
- CLI 离线模式：`sync --file/--dir` 直接用 packages/core 的 composer/validate，不联网（R3 的存在理由）。

### 1.3 三条核心数据流（时序）

```
① 组包导出流
  Web 向导(§5 PackWizard 5 步) → POST /packs/:id/preview
  → core/pack/composer 解析 selection → 物化资产内容快照
  → adapters.plan() 计算文件集 → 生成 files[]（确定性，§7.2）
  → fingerprint（§7.2）→ 预览返回
  → POST /packs/:id/export → 校验(409 VERSION_IMMUTABLE / STALE_SELECTION)
  → PackExport 不可变记录 + bundle 下载 / 目录导出 ~/.openvibe/packs/

② 注入流（唯一文件写通道 = CLI）
  openvibe sync <path> → 解析包(--pack 拉 API / --file / --dir)
  → schemaVersion + fingerprint 重算校验 → 路径安全校验（§7.2 validate）
  → 逐文件五状态判定（§6.2）→ dry-run 打印 / 交互确认(@clack)
  → 写文件(0644) + 备份 .openvibe/backup/<UTC>/ + 写 pack.lock.json
  → POST /injections 上报（离线跳过仅警告）
  → 首次成功 → D13 一次性 opt-in 询问（§6.5）

③ 回流流（飞轮第⑤步）
  日志详情页(§5 ReflowActions) → 「存为术语候选/提示词草稿」
  → POST /terms | /prompts（status=draft, source=project:<名>）
  → 日志 linkedAssetIds 回写 → 资产详情页反链「来源：项目X DEV-0007」
  → 下次组包选用 → 标准包自动更优
```

### 1.4 数据目录布局

```
用户机器
├── ~/.openvibe/
│   ├── config.json          # { serverUrl, token, port, telemetryEndpoint? } 权限 0600
│   ├── data/openvibe.db    # SQLite（WAL）+ FTS5 虚表
│   ├── packs/<name>@<ver>/  # 目录导出的标准包（git 共享）
│   └── logs/serve.log       # 滚动日志
└── <目标项目>/
    └── .openvibe/
        ├── pack.lock.json       # 注入指纹登记（design §7.5）
        └── backup/<UTC时间戳>/  # 被覆盖文件备份（建议 gitignore）
```

### 1.5 Monorepo 目录树（三级）

```
openvibe/
├── apps/
│   ├── web/src/{pages,components,api,hooks}
│   │   ├── pages/{Library,Terms,Skills,Flows,Projects,ProjectDetail,Packs,PackNew,Settings}.tsx
│   │   ├── components/（§5.3 清单）
│   │   ├── api/client.ts + 各资源模块（fetch 封装 + token 注入）
│   │   └── hooks/（usePrompts/useTerms/useProjects/usePacks…Query 封装）
│   ├── server/src/
│   │   ├── routes/{prompts,skills,terms,flowTemplates,projects,tasks,devlog,packs,injections,search,settings}.ts
│   │   ├── plugins/{auth,static}.ts
│   │   └── bootstrap.ts
│   └── cli/src/
│       ├── commands/{serve,scan,sync,diff,clean}.ts
│       ├── config.ts / output.ts / telemetry.ts
│       └── index.ts（commander 入口 + bin: openvibe）
├── packages/
│   ├── core/src/
│   │   ├── db/{index.ts,migrations/0001_init.sql,0002_app_meta_telemetry.sql,runner.ts,seed.ts}
│   │   ├── repos/{prompts,terms,skills,flows,projects,devlog,packs}.ts
│   │   ├── pack/{composer,fingerprint,validate,bundle}.ts
│   │   ├── importers/{cursorrules,mdc,rulesFile}.ts + index.ts
│   │   └── search/fts.ts（查询路由）
│   ├── adapters/src/{types.ts,registry.ts,compat.ts,claude-code.ts,cursor.ts,
│   │                 generic-agents.ts,codebuddy.ts,trae.ts,minicode.ts}
│   └── shared/src/{schemas/*.ts,errors.ts,constants.ts,ids.ts,utils.ts}
├── content/seed/{terms.json,flow-templates.json,prompts.json}
├── docs/（PRD/specs/design/tasks/dev-plan/proposal/竞品×2）
├── scripts/seed-check.ts（pnpm seed:check 入口；SEED_DIR 可用 OPENVIBE_SEED_DIR 只读覆盖，供 SCRIPT-SEED-01/02 在临时副本上跑负向探针）
├── scripts/seed-review.ts（pnpm seed:review 入口：按 git 基线摊开新增词条/提示词全文，供 owner 逐条审校，D14）
├── scripts/bundle-check.ts（pnpm bundle:check 入口：读 dist 产物断言入口/chunk 预算）
├── scripts/golden-update.ts（pnpm golden:update 入口：重新生成 tests/golden/** 契约快照）
├── scripts/failure-evidence.sh（pnpm evidence 入口：固化测试失败的现场——git 状态 + vitest 全量输出 + 两套 tsc 输出；用法 `pnpm evidence [<测试文件>] [-o 目录]`，全绿自清、失败保留现场供回放；**报障约定：跑出失败后把脚本打印的证据目录路径原样贴出**）
├── scripts/dev-all.mjs（pnpm dev / dev:all 入口：一条命令同时起 web 与 server，Ctrl-C 会清干净孙进程）
├── scripts/collect-m9-sources.ts（pnpm m9:collect 入口：M9 素材采集，P1.9 收口）
├── scripts/collect-m9-github-sources.ts（pnpm m9:collect:github 入口：M9 另三源采集）
├── scripts/m9-content-fingerprint.ts（pnpm m9:fingerprint 入口：内容指纹，验「内容未变」）
├── scripts/check-m9-links.ts（pnpm m9:links 入口：资源链接失效巡检，逐个 HEAD）
├── scripts/extract-m9-guide-phases.ts（pnpm m9:phases 入口：抽《Python 与 Go 系统学习指南》的分期路线）
├── scripts/build-cli.ts（pnpm pkg:cli 入口：把 workspace CLI 打成可发布的 openvibe 单文件包）
├── scripts/mutation-run.ts（pnpm mutation:run 入口：变异测试执行器）
├── scripts/ownership-check.ts（pnpm ownership:check 入口：提交归属核验）
├── scripts/docs-check.ts（pnpm docs:check 入口：文档治理闸）
├── scripts/section-ref-audit.ts（pnpm docs:refs 入口：§-引用解析器，判定引用三态并出对账表）
├── scripts/verify-matrix.ts（pnpm verify:matrix 入口：v0.2.3 批次 A FR-2 复验矩阵工具）
├── scripts/export-agent-memory.ts（pnpm memory:check / memory:verify 入口：把 agent 记忆目录导出进仓）
├── deploy/telemetry/{worker.js,adapter-node.mjs}（匿名统计接收端：一份 CF Worker 源码 + 一层 node:http 外壳，fail-closed 白名单）
└── .github/workflows/ci.yml
```

---

## §2 数据库设计

### 2.1 表清单（17 张）

权威=design §5（摘要级）；本节给实现级 SQL。**C 级变更已登记**（§0.3 C-1/C-2）并在 DEV-0009 回写 design §5 摘要。

| 表 | 用途 | 级联删除 |
|----|------|:---:|
| prompts / prompt_versions | M1 提示词与版本快照 | ✅ |
| skills / skill_versions | M2 台账 | ✅ |
| terms | M3 术语 | — |
| flow_templates | M5 流程模板 | — |
| projects / project_check_states / tasks / dev_log_entries | M5 项目域 | ✅ |
| standard_packs / pack_exports / injections | M6 包域 | exports ✅ |
| seed_registry | 种子幂等 | — |
| schema_migrations | migration 版本表 | — |
| **app_meta**（C-1） | 向导标记 / telemetryAskState 等 KV | — |
| **telemetry_events**（C-2） | 遥测本地队列 | — |
| fts_prompts / fts_terms（虚表） | FTS5 trigram | 触发器同步 |

通用约定：主键 = `TEXT`（前缀 + nanoid，见 §7 shared/ids.ts：`prm_ pvr_ sk_ skv_ trm_ flw_ prj_ cks_ tsk_ log_ pk_ pex_ inj_`）；时间戳 = TEXT ISO-8601 UTC；数组/对象列 = TEXT(JSON)。

### 2.2 migrations/0001_init.sql

```sql
PRAGMA journal_mode = WAL;          -- 连接级设置，写在 db/index.ts
PRAGMA foreign_keys = ON;

-- ============ M1 提示词 ============
CREATE TABLE prompts (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description    TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL,                      -- ≤512KB 由 zod 层限制
  content_hash   TEXT NOT NULL,
  variables      TEXT NOT NULL DEFAULT '[]',         -- JSON string[]
  tags           TEXT NOT NULL DEFAULT '[]',
  folder_path    TEXT NOT NULL DEFAULT '/',
  platform_marks TEXT NOT NULL DEFAULT '[]',
  use_as         TEXT NOT NULL DEFAULT 'reference' CHECK (use_as IN ('rule','reference')),
  status         TEXT NOT NULL DEFAULT 'draft'  CHECK (status IN ('draft','active','deprecated')),
  seed_hash      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_prompts_status ON prompts(status);
CREATE INDEX idx_prompts_folder ON prompts(folder_path);

CREATE TABLE prompt_versions (
  id           TEXT PRIMARY KEY,
  prompt_id    TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version_no   INTEGER NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  changelog    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  UNIQUE (prompt_id, version_no)
);

-- ============ M2 Skill 台账 ============
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL CHECK (source IN ('local','manual')),
  skill_dir         TEXT,
  latest_version_id TEXT,
  installed_targets TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE TABLE skill_versions (
  id           TEXT PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  dir_hash     TEXT NOT NULL,
  file_count   INTEGER NOT NULL,
  scanned_at   TEXT NOT NULL,
  UNIQUE (skill_id, dir_hash)
);

-- ============ M3 术语 ============
CREATE TABLE terms (
  id               TEXT PRIMARY KEY,
  zh               TEXT,
  en               TEXT,
  aliases          TEXT NOT NULL DEFAULT '[]',
  definition       TEXT NOT NULL,                    -- ≤4KB zod 层
  example          TEXT NOT NULL DEFAULT '',
  related_term_ids TEXT NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL DEFAULT 'manual',   -- openvibe-seed | manual | project:<name>
  tags             TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
  seed_hash        TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (zh IS NOT NULL OR en IS NOT NULL)
);

-- ============ M5 流程与项目 ============
CREATE TABLE flow_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('light','spec_driven','retro','custom')),
  stages     TEXT NOT NULL,                          -- JSON Stage[]
  builtin    INTEGER NOT NULL DEFAULT 0,
  seed_hash  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  local_path           TEXT,
  flow_template_id     TEXT REFERENCES flow_templates(id),
  stages_snapshot      TEXT NOT NULL,                -- JSON Stage[]（物化，与模板解耦）
  current_stage        TEXT,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  standard_pack_id     TEXT,
  standard_pack_version TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

CREATE TABLE project_check_states (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE (project_id, stage_name, item_id)
);

CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  stage_name TEXT,
  status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  order_     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_tasks_project ON tasks(project_id, status, order_);

CREATE TABLE dev_log_entries (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('DEV','CHECK')),
  entry_no         INTEGER NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  related_files    TEXT NOT NULL DEFAULT '[]',
  evidence         TEXT,                             -- JSON {command, resultSummary}
  linked_asset_ids TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL,
  UNIQUE (project_id, type, entry_no)
);

-- ============ M6 标准包 ============
CREATE TABLE standard_packs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE CHECK (name GLOB '[a-z0-9-]*' AND length(name) BETWEEN 1 AND 64),
  description TEXT NOT NULL DEFAULT '',
  selection   TEXT NOT NULL,                         -- JSON {promptIds,termIds,skillIds,playbookIds,flowTemplateId}
  targets     TEXT NOT NULL,                         -- JSON adapterId[]
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE pack_exports (
  id            TEXT PRIMARY KEY,
  pack_id       TEXT NOT NULL REFERENCES standard_packs(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  manifest_json TEXT NOT NULL,                       -- 完整内容快照（m6a §3）
  channel       TEXT NOT NULL CHECK (channel IN ('download','directory')),
  exported_at   TEXT NOT NULL,
  UNIQUE (pack_id, version)
);

CREATE TABLE injections (
  id           TEXT PRIMARY KEY,
  pack_id      TEXT,
  pack_version TEXT,
  project_path TEXT NOT NULL,
  injected_at  TEXT NOT NULL
);
CREATE INDEX idx_injections_time ON injections(injected_at DESC);

-- ============ 种子与 migration ============
CREATE TABLE seed_registry (
  bundle      TEXT PRIMARY KEY,                      -- 'terms' | 'flow-templates' | 'prompts'
  content_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE TABLE schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

### 2.3 FTS5 虚表与触发器（并入 0001_init.sql）

外部内容表（external content）方案：虚表挂靠宿主表 rowid，触发器单向同步，避免业务代码双写。

```sql
CREATE VIRTUAL TABLE fts_prompts USING fts5(
  title, content, tags,
  content='prompts', content_rowid='rowid',
  tokenize='trigram'
);
CREATE TRIGGER prompts_fts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO fts_prompts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;
CREATE TRIGGER prompts_fts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO fts_prompts(fts_prompts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
END;
CREATE TRIGGER prompts_fts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO fts_prompts(fts_prompts, rowid, title, content, tags)
  VALUES ('delete', old.rowid, old.title, old.content, old.tags);
  INSERT INTO fts_prompts(rowid, title, content, tags)
  VALUES (new.rowid, new.title, new.content, new.tags);
END;

CREATE VIRTUAL TABLE fts_terms USING fts5(
  zh, en, aliases, definition,
  content='terms', content_rowid='rowid',
  tokenize='trigram'
);
-- terms 同构三触发器：terms_fts_ai / _ad / _au（列替换为 zh,en,aliases,definition）
```

- **trigram 理由**（design §12）：零词典、零额外 native 构建，中文按 3 字符滑窗，任意 ≥3 字符子串可 MATCH；代价索引约 ×3（万级数据无压力）。
- `tags` 索引的是 JSON 字符串原文——标签命中走子串路径，够用（design §5 要点）。

### 2.4 migrations/0002_app_meta_telemetry.sql（C-1 / C-2）

```sql
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,          -- 'onboardingDone' | 'telemetryEnabled' | 'telemetryAskState' | …
  value TEXT NOT NULL              -- JSON（string/bool/object）
);

CREATE TABLE telemetry_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event       TEXT NOT NULL CHECK (event IN ('pack_injected','flow_template_used','project_active')),
  value       TEXT NOT NULL DEFAULT '',
  day         TEXT NOT NULL,       -- YYYY-MM-DD（去标识聚合键）
  os          TEXT NOT NULL CHECK (os IN ('mac','linux','win')),
  app_version TEXT NOT NULL,
  queued_at   TEXT NOT NULL,
  sent_at     TEXT                 -- NULL=未上报；上报成功打点
);
CREATE INDEX idx_telemetry_pending ON telemetry_events(sent_at) WHERE sent_at IS NULL;
```

- `telemetryEnabled`（总开关，默认 false）与 `telemetryAskState`（unset/accepted/declined）分离：开关可反复切换，询问只发生一次。
- **上报体形状固定**（design §11.5）：`{event, value, appVersion, os, day}`——不含路径/内容/机器标识。

### 2.5 Migration Runner（packages/core/db/runner.ts）

```
启动时：
1 SELECT version FROM schema_migrations（现有集合 S）
2 按 migrations/ 目录文件名升序遍历：version ∉ S → 单事务执行 SQL + INSERT 版本行
   （better-sqlite3 的 .transaction() 包裹；失败整体回滚并抛错，serve 拒绝启动）
3 只前进：不存在 down；改历史脚本 = 禁止（新增变更走 0003+）
```

### 2.6 关键事务算法

**entryNo 分配**（m5 §6.3）：

```ts
const assign = db.transaction(() => {
  const row = db.prepare(`SELECT MAX(entry_no) n FROM dev_log_entries
                          WHERE project_id=? AND type=?`).get(projectId, type);
  return (row.n ?? 0) + 1;            // UNIQUE 冲突 → 上层捕获重试一次
});
```

**版本快照触发**（m1 FR-4.1）：UPDATE prompts 时若 `content_hash` 变化 → 同事务 INSERT prompt_versions(version_no = max+1)；仅元数据变化不产生版本。

**导出幂等 409**（m6a FR-3.4）：export 事务内 `SELECT fingerprint FROM pack_exports WHERE pack_id=? AND version=?`——无记录 → 插入；有且一致 → 幂等返回既有；有且不一致 → 抛 `VERSION_IMMUTABLE`。

---

## §3 API 设计

### 3.0 全局约定

- 前缀 `/api`；JSON only。**鉴权三通道**（design §11，§4.2 实现）：

| 请求形态 | 判定 | 要求 |
|----------|------|------|
| 带 `Origin` 头（浏览器） | Origin ∈ {http://localhost:*, http://127.0.0.1:*} | 否则 403 `FORBIDDEN_ORIGIN` |
| 不带 `Origin`（CLI 等程序） | Bearer token | `Authorization: Bearer <token>`，token=config.json 值；失败 401 `UNAUTHORIZED` |
| `GET /api/health` | 豁免 | — |

- 分页：`?page=1&size=50`（size ≤ 200）；列表响应统一 `{items, total, page}`。
- 排序默认 `updatedAt DESC`（除特别标注）。
- 错误体统一：`{ "code": "MACHINE_CODE", "message": "人读信息", "details"?: object }`。
- **错误码总表**（shared/errors.ts）：

| code | HTTP | 场景（spec 出处） |
|------|:---:|------------------|
| VALIDATION_ERROR | 422 | zod 校验失败（各 spec 边界节：空 title / >200 字 / 超 512KB / zh+en 全空…） |
| EMPTY_SELECTION | 422 | 空 selection 导出（m6a）、空选集 render TERMS.md（m3） |
| STALE_SELECTION | 422 | selection 引用资产已删（m6a §6.2） |
| VERSION_IMMUTABLE | 409 | 同版本重导指纹不一致（m6a FR-3.4） |
| BUILTIN_IMMUTABLE | 403 | 编辑/删除内置模板（m5 FR-2） |
| NOT_FOUND | 404 | 资源不存在 |
| UNAUTHORIZED / FORBIDDEN_ORIGIN | 401/403 | 鉴权失败 |
| NAME_CONFLICT | 422 | pack name 冲突 / slug 规则（m6a §6.1） |

### 3.1 提示词（8 端点）

| 方法 路径 | 说明 | 请求 | 响应 |
|-----------|------|------|------|
| GET `/prompts` | 列表+过滤 | `?page&size&tag&folder&platform&status&q` | `{items,total,page}` |
| POST `/prompts` | 创建 | `PromptCreateInput` | `PromptOut + warnings[]` |
| GET `/prompts/:id` | 详情 | — | `PromptOut` |
| PATCH `/prompts/:id` | 更新（可能触发快照） | `PromptUpdateInput` | `{prompt, versionCreated, warnings}` |
| DELETE `/prompts/:id` | 硬删（确认在前端） | `?force` | 204；响应头 `X-Referenced-Packs` 列引用包名 |
| GET `/prompts/:id/versions` | 版本列表 | — | `PromptVersionOut[]` |
| POST `/prompts/:id/versions/:no/restore` | 回滚（旧内容存为新版本） | — | `{prompt, newVersionNo}` |
| POST `/prompts/import` | JSON/MD/规则文件批量导入 | multipart 或 `{items[]}` | `{created, skipped:[{title,reason}]}` |
| GET `/prompts/export` | 导出 | `?format=json\|md&<过滤>` | 文件流 |

示例——创建（含规则类变量警告，m1 FR-2.4）：

```jsonc
// POST /api/prompts
{ "title": "代码审查请求", "useAs": "rule", "platformMarks": ["generic"],
  "content": "审查 {{language}} 代码，关注：…" }
// 201
{ "id": "prm_x", "variables": ["language"], "status": "active",
  "warnings": ["规则类提示词含变量 {{language}}，注入后不会自动填充"] }
```

### 3.2 Skill（5 端点）

`GET/POST /skills`、`PATCH/DELETE /skills/:id`、`GET /skills/:id/versions`、`GET /skills/duplicates`（重复整理报告，DEV-0067）、`POST /skills/review`（内置审查，DEV-0067）、`POST /skills/remote/search|remote/import|remote/check-updates`（SkillHub / GitHub 远程获取与更新检查，DEV-0067/0068；GitHub 导入可选 `path` 只导子目录；check-updates 按 `remote_tree_hash` 树指纹对比，GitHub 整仓一次 trees 调用零内容下载）、`POST /skills/scan`（body 可带 `roots[]` 覆盖默认，空数组即不扫、不回落默认；响应 `{discovered, created, updated, skipped, warnings[], scannedRoots[], missingRoots[]}`，m2 FR-1.5）。默认扫描根 = home 下全部 `~/.<tool>/skills`（存在即扫，`.Trash` 除外）+ ZCode 已装插件的 `installPath/skills`（读 `~/.zcode/cli/plugins/installed_plugins.json`，只扫生效版本）+ cwd `.claude/skills`（DEV-0063/0064）；显式缺根告警并记 `missingRoots`，默认模式缺根静默。skill 来源枚举 `local/manual/github/skillhub`（0004 迁移）；远程条目无本地目录，溯源 key `remote_ref`（`github:owner/repo@branch[:path]` / `skillhub:slug`）与树指纹 `remote_tree_hash` 落档（0005 迁移），内容指纹与本地扫描同公式（跨源去重），溯源串进版本线 `version_label`。远程出站走 http-guard：仅 https、主机白名单（api.github.com / raw.githubusercontent.com / api.skillhub.cn + 重定向放行 *.myqcloud.com）、DNS 解析结果须全为公网、重定向逐跳复检、单请求 15s 超时。

### 3.3 术语（5 端点）

`GET/POST /terms`、`PATCH/DELETE /terms/:id`、`GET /terms/search?q=`（高亮偏移在响应 `matches` 字段）、`POST /terms/render-terms-md`：

```jsonc
// POST /api/terms/render-terms-md
{ "termIds": ["trm_a","trm_b"], "orderBy": "en-alpha" }
// 200  { "content": "# 术语表 · 选集\n\n| 术语 | English | 别名 | 定义 |\n|---|---|---|---|\n| …" }
// 422  { "code": "EMPTY_SELECTION" }        // 空选集
```

### 3.4 流程模板（4 端点）

`GET/POST /flow-templates`、`PATCH/DELETE /flow-templates/:id`（builtin → 403 `BUILTIN_IMMUTABLE`）、`POST /flow-templates/:id/duplicate`（kind→custom，builtin=0，名称加「副本」）。

### 3.5 项目（6 端点）

`GET/POST /projects`、`GET/PATCH/DELETE /projects/:id`、`POST /projects/:id/stages/current`（body `{stageName}`）、`GET /projects/:id/injection-status`（服务端只读解析 `<localPath>/.openvibe/pack.lock.json`）：

```jsonc
// GET /api/projects/prj_x/injection-status
{ "lockPresent": true, "pack": { "name": "default", "version": "1.0.0", "fingerprint": "…" },
  "injectedAt": "2026-09-20T02:11:00Z",
  "registered": { "packId": "pk_x", "version": "1.2.0" },
  "upToDate": false, "suggestedCommand": "npx openvibe-cli sync /path --pack default" }
// lock 缺失/损坏 → { "lockPresent": false, "error": "lock 文件异常" }（m5 §6.4，不影响其他字段）
```

### 3.6 任务（2 端点）

`GET/POST /projects/:id/tasks`、`PATCH /tasks/:id`（拖拽 = PATCH `{status, order_}`；`DELETE /tasks/:id`）。

### 3.7 日志（2 端点）

`GET/POST /projects/:id/devlog`（POST 时服务端分配 entryNo，返回 `DEV-0012` 形态展示号）、`GET /projects/:id/devlog/export`（按类型合并下载 `DEV_LOG.md`/`CHECK_LOG.md`）。

### 3.8 标准包（6 端点）

`GET/POST /packs`、`GET/PATCH/DELETE /packs/:id`、`POST /packs/:id/preview`、`POST /packs/:id/export`（body `{version, channel}`）、`GET /packs/:id/exports`、`POST /injections`（CLI 上报，body `{packId, packVersion, projectPath}`）。

```jsonc
// POST /api/packs/pk_x/preview
{ "files": [ { "path": "CLAUDE.md", "sha256": "…", "content": "…" },
             { "path": "TERMS.md",  "sha256": "…", "content": "…" } ],
  "fingerprint": "…",
  "warnings": ["规则类提示词「SQL 约束」含 {{变量}}"],
  "coveredPlatforms": ["zcode","Kimi Code","Codex"] }   // 兼容矩阵展示（m6a FR-1.4）
// POST /api/packs/pk_x/export  同版本不同指纹 →
// 409 { "code": "VERSION_IMMUTABLE", "message": "v1.0.0 已导出且内容已变化，请升版本号" }
```

### 3.9 全局搜索（1 端点）

`GET /search?type=prompt|term&q=`（查询路由见 §7.5）。

### 3.10 设置（2 + C-3 新增 2）

`GET /settings`（服务信息 / 数据目录 / 种子状态）、`POST /settings/reseed`（重播种子，幂等规则同 §7.4）；
**C-3 新增**：`GET /settings/telemetry` → `{enabled:false, askState:"unset", whitelist:[三类]}`；`POST /settings/telemetry` body `{enabled:boolean}` → 写 `app_meta.telemetryEnabled`（D13 accepted 动作同时写 `askState`）。

### 3.11 zod schema 文件清单（packages/shared/src/schemas/）

| 文件 | 导出 |
|------|------|
| prompt.ts | `PromptCreateInput / PromptUpdateInput / PromptQuery / PromptOut / PromptVersionOut / PromptImportItem` |
| term.ts | `TermCreateInput / TermUpdateInput / TermOut / TermMatch / TermSearchOut / RenderTermsMdInput`——`TermOut.pinyin` 是**派生只读字段**（非入参、非库列），随 m3 v1.1 FR-5 登记 |
| skill.ts | 台账与扫描：`SkillCreateInput / SkillUpdateInput / SkillQuery / SkillOut / SkillVersionOut / SkillScanInput / SkillScanReport`；P2 完整版另加远程族 `SkillRemoteSearchInput / SkillRemoteImportInput / SkillRemoteCheckInput / SkillRemoteCheckOut / SkillRetrackInput / SkillRetrackOut / DuplicateReport / SkillReviewInput / SkillReviewOut`（规格 `specs/m2-skill-registry.md` FR-4–FR-7，2026-09-30 补写） |
| flow.ts | `FlowTemplateCreateInput / FlowTemplateOut / StageSchema` |
| ports.ts | `PortDeclaration / PortListener / PortRow / PortsOut`——项目端口台账（m5 FR-8，只读，无入参 schema） |
| project.ts | `ProjectCreateInput / ProjectUpdateInput / ProjectOut / InjectionStatusOut` |
| task.ts / devlog.ts | `TaskCreateInput / TaskOut / DevLogCreateInput / DevLogOut` |
| pack.ts | `PackCreateInput / PackUpdateInput / PackOut / PreviewOut / ExportInput / PackManifestSchema`（对齐 design §7.2） |
| settings.ts | `SettingsOut / TelemetrySettingsOut / TelemetryToggleInput` |

字段约束在此层全量落地（≤200/≤512KB/zh-en-至少一项…），API 与 CLI 共用（design 选型表 zod 行）。

---

## §4 后端服务（apps/server）

### 4.1 文件结构

见 §1.5。每资源一个 route 文件，统一签名：

```ts
export function promptRoutes(app: FastifyInstance) { app.get('/api/prompts', …) }
// bootstrap.ts 内逐个注册 + app.setErrorHandler + plugins
```

### 4.2 plugins/auth.ts（双通道）

```
preHandler（挂 /api 全局，/api/health 除外）：
  origin = req.headers.origin
  if origin:
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? next() : 403 FORBIDDEN_ORIGIN
  else:
    req.headers.authorization === `Bearer ${token}` ? next() : 401 UNAUTHORIZED
附加：onRequest 校验 Host ∈ {localhost, 127.0.0.1}（防 DNS rebinding，design §11.1）
```

token 来源：`~/.openvibe/config.json`（首启生成，0600）。

### 4.3 bootstrap.ts 启动序列

按 §1.2 八步实现；要点：migration 失败 → 进程退出码 1 并打印版本号；seed 失败不阻塞（seed-content FR-1，逐文件 try/catch 记 warning）；预置包组装失败 → 跳过 + warning + 向导②降级链接（onboarding §4.1）。

### 4.4 统一错误处理

`app.setErrorHandler`：业务错误（shared/errors.ts 的 `AppError`）→ 映射 code→HTTP（§3.0 总表）+ 统一体；zod 失败 → 422 `VALIDATION_ERROR` + `details.fieldErrors`；未知错误 → 500 `INTERNAL`（不含堆栈，堆栈进 serve.log）。

### 4.5 plugins/static.ts

托管 `apps/web/dist`；`GET /` 与未命中静态资源的非 `/api` 路径 → 回退 `index.html`（SPA 路由）；`Cache-Control: no-cache`（本地开发语义）。

### 4.6 遥测端点（C-3）

`GET/POST /api/settings/telemetry` 读写 `app_meta`（§3.10）；**开关关闭时**：`telemetry_events` 中 pending 记录保留不发送，且 `POST /api/telemetry/events` 直接回 `{queued:false, reason:'disabled'}` 连入队都不写。**上报循环只在 serve 进程内**（T8d 定案：每 60s 批量取 pending ≤100 条 POST 到 `config.json` 的 `telemetryEndpoint`，端点回 2xx 才写 `sent_at`，失败留队等下一轮）——关闭前已入队、尚未送出的那几行在开闸后随下一批发出，即「补发」是留队的自然结果而非单独机制（TF-02 断言）；CLI 侧只入队、不外发，队列由在跑的 serve 排空；`telemetryEndpoint` 缺省或空串时连上报定时器都不建，故「关闭即零外联」是结构性的。接收端见 `deploy/telemetry/`（D12 自部署单文件 Worker + 计数）。

---

## §5 前端（apps/web）

### 5.1 路由表

| 路由 | 页面组件 | 主要区块 |
|------|----------|----------|
| `/library` | LibraryPage | PromptList + FolderTree + TagFilterBar + PromptEditorDrawer |
| `/terms` | TermsPage | 搜索 + TermsTable（多选条）+ TermEditorDrawer + TermsMdPreview |
| `/skills` | SkillsPage | SkillList + SkillScanReport + 手动登记表单 |
| `/flows` | FlowsPage | FlowTemplateCard 网格 + FlowTemplateEditor |
| `/projects` | ProjectsPage | ProjectList |
| `/projects/:id` | ProjectDetailPage | ProjectDashboard + StageBar + ChecklistPanel + KanbanBoard + DevLog Tab + ReflowActions |
| `/packs`、`/packs/new` | PacksPage / PackNewPage | 列表+导出历史 / PackWizard 5 步 |
| `/settings` | SettingsPage | SettingsSections（含遥测开关、向导重置、种子重播） |

AppShell 侧栏固定七项（库/术语/Skill/流程/项目/标准包/设置）；OnboardingBar + FlywheelCard 常驻顶栏。

**分包与预算（T8f，2026-09-23）**：上表九个页面组件全部走 `React.lazy`，`<Suspense>` 只包 AppShell 里的 `<Outlet/>`（顶栏与侧栏不随路由闪）；分包边界**只**由动态 import 决定，`vite.config.ts` 刻意不写 `manualChunks`（按包名强分组会让 vite 往 index.html 塞 modulepreload，首屏反而从 291kB 涨到约 962kB）。预算为**入口 ≤300kB、任一 chunk ≤500kB**，由 `pnpm bundle:check`（`scripts/bundle-check.ts`，自带一次 vite build）在 CI 守；实测入口 291.01kB / 23 个分包，最大 347.45kB，`/library` 首屏 JS 只传 361.16kB（总分包 1240.50kB 的 29.1%），CodeMirror 与 react-markdown 分别在编辑抽屉挂载、预览挂载时才落地（走查驱动器 `docs/devlog-evidence/DEV-0019/lazy-chunk-walk.mjs`）。

### 5.2 共享组件清单（24 个，props 摘要）

| 组件 | props（摘要） | spec 出处 |
|------|--------------|-----------|
| AppShell | `{children}` | design §10 |
| OnboardingBar | `{step, onSkip, onDone}`；步骤③轮询 lock（2s × ≤60 次） | onb FR-2/FR-2.4 |
| FlywheelCard | `{assets, packs, injections, reflows, loops}`（来自 `/settings`/stats 聚合端点） | onb FR-3 |
| TelemetryAskCard | `{askState, onChoose}`（D13 一次性卡） | onb FR-4.2 |
| PromptList | `{items, total, filters, onEdit, onCopy}` | m1 FR-1/3 |
| FolderTree | `{paths[], selected, onSelect, onDropPrompt}`（路径字符串树） | m1 FR-3.2 |
| TagFilterBar | `{tags[], selected, onToggle}` | m1 FR-3.4 |
| PromptEditorDrawer | `{prompt, onSaved}`；CodeMirror6 双栏+预览懒加载 | m1 FR-1.2 |
| VariableFillModal | `{variables[], template, onCopy}`；必填校验+实时替换预览 | m1 FR-2.2 |
| VersionHistoryPanel | `{promptId}`；两版 diff 入口 | m1 FR-4.2 |
| DiffViewer | `{oldText, newText}`；jsdiff diffLines + 行高亮 | m1 FR-4.2 |
| TermsTable | `{items, selected, onToggle, onSelectAll}` | m3 FR-4 |
| TermEditorDrawer | `{term, onSaved}` | m3 FR-1 |
| TermsMdPreview | `{termIds, orderBy}`；调 render-terms-md 只读展示 | m3 FR-4.1 |
| SkillList / SkillScanReport | `{items}` / `{report}` | m2 FR-1/3 |
| FlowTemplateCard | `{template, onDuplicate, onEdit}` | m5 FR-2 |
| FlowTemplateEditor | `{template, onSaved}`；阶段拖拽排序+清单项增删改 | m5 FR-2.3 |
| ProjectList | `{items}`；健康摘要三要素 | m5 FR-1.1 |
| ProjectDashboard | `{project, injectionStatus}` | m5 §3 健康摘要 |
| StageBar | `{stages, current, onSwitch}` | m5 FR-3.1 |
| ChecklistPanel | `{projectId, stage, checkStates, onToggle}`；勾选即时保存 | m5 FR-3.2 |
| KanbanBoard | `{tasks, onMove, onReorder}`；三列原生 DnD + order 持久化 | m5 FR-4 |
| DevLogList / DevLogEditor | `{entries, filter}` / `{projectId, type}`；模板预填（时间/编号/关联文件） | m5 FR-5 |
| ReflowActions | `{entry, onReflow(kind)}`；预填+linkedAssetIds | m5 FR-7 |
| PackWizard | `{initial?, onSaved}`；5 步（§3.8 预览接口驱动步骤5） | m6a FR-1 |
| PackPreviewPane | `{preview}`；文件树+等宽内容+coveredPlatforms 提示 | m6a FR-1.5 |
| ExportHistoryPanel | `{exports[]}` | m6a FR-5.2 |
| SettingsSections | `{settings, onReseed, onTelemetry, onResetWizard}` | seed FR-3 / onb FR-4 |

### 5.3 TanStack Query 约定

- `staleTime: 15_000`（design §10）；错误统一 toast（Radix Toast）。
- key 目录与失效映射：

| mutation | invalidate |
|----------|-----------|
| 创建/更新/删除 prompt | `['prompts']`、`['prompt', id]` |
| restore / 快照产生 | `+ ['prompt-versions', id]` |
| import prompts | `['prompts']` |
| scan skills | `['skills']` |
| term CRUD / render | `['terms']`、`['term', id]` |
| flow duplicate/edit | `['flows']` |
| project CRUD / 切阶段 / 勾选 / 任务移动 | `['projects']`、`['project', id]`、`['project-tasks', id]` |
| devlog 创建 / 回流 | `['project-devlog', id]`、`['terms']` 或 `['prompts']`（回流侧） |
| pack 保存/导出 | `['packs']`、`['pack-exports', id]`、`['pack-preview', id]` |
| injection 上报（CLI 侧） | Web 下次聚焦自动 refetch（无推送） |
| telemetry 开关 / reseed / 向导重置 | `['settings']`、`['stats']` |
| 向导③ 轮询 `injection-status` 探到 lock（T8c 补，非 mutation） | `['stats']`——注入次数不能等 15 s `staleTime`，探到即刷 |

### 5.4 交互实现要点

- **不引拖拽库**：Kanban/FolderTree/阶段排序用原生 HTML5 DnD（`draggable` + `dataTransfer`）；排序持久化在 `drop` 时批量 PATCH order。
- CodeMirror 仅在 PromptEditorDrawer/TermEditorDrawer 懒加载（`React.lazy`）。
- 搜索框 debounce 300ms；<3 字符时提示「短词走降级匹配，排序可能不同」（m1 §6.4）。
- 中文 UI 文案集中在 `src/i18n/zh.ts`（A1 中文社区优先）。

### 5.5 样式基线

Tailwind v4 + Radix Primitives（Dialog/Popover/Tabs/Toast/Tooltip/Select）；无组件库锁定（design §2 UI 行）；深浅色 MVP 仅浅色（P1.1 评估暗色）。

**2026-09-30 同步（承 D19 的「归 P2」项）**：上一行的「仅浅色」已作废——暗色主题与设计 token 化随 `453a535` 落地。口径入口三层：`DESIGN.md`（设计系统规范源，gstack spec 格式）→ `docs/specs/theme.md`（横切行为规格：双 token 源、持久化与预涂、字体自托管、组件形制、治理闸）→ `apps/web/src/index.css` 的 `@theme` 亮块 + `[data-theme='dark']` 暗块（颜色的单一出处）。机器闸 = `tests/design-tokens.test.ts` 的 `WEB-TOKENS · 颜色单一出处`。本行不抄 token 数、色族数与字体体积（§13-9），取数命令在 `theme.md` §7。

---

## §6 CLI（apps/cli）

### 6.1 命令矩阵与配置发现链

| 命令 | 旗标 | 说明 |
|------|------|------|
| `openvibe serve` | `--port`（默认 8787）`--open` | §1.2 启动序列 |
| `openvibe scan` | `--skills` `--project <path>` `--roots <dir>…` | 两者可同时给；皆缺 → 用法报错（m6b FR-4.3） |
| `openvibe sync <projectPath>` | `--pack name[@ver]` `--file` `--dir` `--dry-run` `--yes` `--strategy skip\|overwrite\|keep-local` `--target <adapter>…` | 三包源互斥；缺省 `--pack` 取项目登记包 |
| `openvibe diff <projectPath>` | — | 漂移 + 新版本探测 |
| `openvibe clean <projectPath>` | `--dry-run` `--yes` `--force` | 退场：按 lock 删受管文件（`DRIFT` 默认保留，仅 `--force` 删），删前逐字节备份、收尾删 lock。**这是第二个会动磁盘的 CLI 命令**（§13 记的法条冲突在此），删除边界与键集合以 `specs/m6-cli-injection.md` FR-6 为单源，本表不抄 |
| 全局 | `--server` `--token` `--json` `--version` `help` | 配置链：旗标 > `OPENVIBE_SERVER/TOKEN` > config.json |

HTTP `fetch` 超时 5s；401 → 提示重跑 serve 检查 config，重试 ≤2。

### 6.2 sync 五状态机（判定顺序即伪码）

对 manifest.files 逐文件（路径先过 §7.2 validate）：

```
diskSha = exists(path) ? sha256(read(path)) : null
lockE   = lock.files.find(f => f.path === path)

if (!exists)                          → NEW      动作：写入
if (diskSha === manifest.expectSha)   → IN_SYNC  动作：跳过
if (lockE?.managed):
    if (diskSha === lockE.sha256)     → UPDATE   动作：备份后写入      # 包升级、本地未动
    else                              → DRIFT    动作：交互三选（以包为准[默认]/保留本地/跳过），前两者先备份
else                                  → CONFLICT 动作：交互确认（覆盖[默认]/跳过），覆盖前备份
```

- `--dry-run`：只打印计划表，**零写入零删除**（不建 `.openvibe/`、不动备份）——测试用全树哈希断言（m6b §7.1a）。
- `--yes --strategy`：CONFLICT/DRIFT 批量处置；skip 策略下遇 CONFLICT → 退出码 2（CI 感知）。
- 非 TTY 且无 `--yes` → 拒绝执行退出码 1（防挂起）。
- 写入顺序：先备份受影响文件 → 写新文件（0644）→ 写/更新 lock → 上报（离线跳过+警告）→ 打印摘要 + 「建议将 `.openvibe/backup/` 加入 .gitignore」（只提示不代写）。
- 中途写失败：中止后续，打印已完成清单 + 从备份手工恢复指引；已写文件保留（幂等重跑收敛，m6b §6.5）。

### 6.3 lock 与备份

- lock 写入规则（design §7.5）：`files[]` 登记**全部**期望哈希；`--target` 过滤未写入的文件 `managed:false`（后续补齐依据）。
- 备份目录：`.openvibe/backup/<UTC时间戳>/`（保留相对路径）；同时戳冲突 → `-1`、`-2` 后缀。
- sync **永不删除** pack 外文件；包升级后消失的旧文件 sync 不清理（P1 `update` 向导，m6b §6.2）。—— **「不清理」只约束 `sync`**：那些旧文件仍是 lock 里的 `managed` 登记项，`clean` 会把它们连同本包文件一并退场（m6b §7.10 **k** 腿，测试 `CLI-CLEAN-13`，2026-09-26 队列 ⑥ R1 补；本行原写「MVP 不清理」而未提 `clean` 半边，是第三层复核抓出的抄写缺口）。

### 6.4 `--json` 输出契约与退出码

```jsonc
// openvibe sync --json
{ "command": "sync",
  "plan": [ { "path": "CLAUDE.md", "state": "UPDATE", "action": "backup+write" } ],
  "summary": { "new":1, "inSync":2, "update":1, "conflict":0, "drift":0,
               "written":2, "skipped":2, "backedUp":1 } }
```

| 退出码 | 语义 |
|:---:|------|
| 0 | 成功 / diff clean 且无新版；**clean** = 受管项已全清（判据 `driftKept === 0` 即删 lock，m6b FR-6.5 的 v1.4 ④）|
| 1 | 错误（校验失败/路径攻击/token/非 TTY 拒绝）；**clean** 的 `LOCK_INVALID` 落这一档（`index.ts` 的 `catch` → `ExitCode.error`，v1.6 明写**不新增退出码**）⇒ 一个字节都不删 |
| 2 | diff 检出 drifted 或 pack-outdated；sync `--yes --strategy skip` 遇 CONFLICT；**clean** 有 `DRIFT` 保留 **或交互式答「不」/ Ctrl-C**——后者零删除仍是 2（返回 0 会把「什么都没做」报成「已全清」，m6b FR-6.9 ①，测试 `CLI-CLEAN-05c`）|

`clean --json` 的信封形状以 `specs/m6-cli-injection.md` FR-6.10 为单源，本文件不抄键名清单；只记一条容易被"对齐"掉的口径：**枚举六键是下限不是闭集**，`hints` 是必带键（m6b v1.5，队列 ⑥ R3 改判 B 级）。

### 6.5 遥测与 D13 一次性询问

- `reportEvent()` **单出口**（apps/cli/src/telemetry.ts）：先查 `app_meta.telemetryEnabled`（经 `GET /settings/telemetry`）——关 → 直接 return（单测断言零网络调用）；开 → 写 `telemetry_events` 队列，serve/CLI 进程内 60s 批量上报（≤100 条/批）。
- **首次成功询问（D13）**：sync 成功收尾后，若 `askState === 'unset'` 且 stdout 是 TTY → @clack confirm 一行（「开启匿名统计？三类事件白名单见 README，可随时在设置关闭」）→ POST 决定；**非 TTY / 离线 → 跳过询问**，延迟到 Web 向导③完成卡片（C-4 单一数据源：`app_meta.telemetryAskState`）。declined 后永不再问。

---

## §7 领域核心（packages/core）

### 7.1 repos 接口清单（方法签名）

```ts
class PromptsRepo {
  create(input: PromptCreateInput): { prompt: Prompt; warnings: string[] }
  update(id: string, patch: PromptUpdateInput):
    { prompt: Prompt; versionCreated: PromptVersion | null; warnings: string[] }
  delete(id: string): void
  get(id: string): Prompt | null
  list(q: PromptQuery): { items: Prompt[]; total: number; page: number }
  versions(promptId: string): PromptVersion[]
  restore(promptId: string, versionNo: number): { prompt: Prompt; newVersionNo: number }
  importBatch(items: PromptImportItem[]): { created: string[]; skipped: { title: string; reason: string }[] }
  exportAll(q?: PromptQuery): Prompt[]
}
class TermsRepo { create/update/delete/get/list/search(q): Term[]; renderMd(termIds, orderBy): string }
class SkillsRepo {
  scan(roots?: string[]): { discovered; created; updated; skipped; warnings; scannedRoots; missingRoots }   // dirHash 算法 m2 FR-1.3
  create/update/delete/list/versions(id)
}
class FlowTemplatesRepo { list/get/create/update(builtin→AppError)/delete/duplicate(id) }
class ProjectsRepo {
  create(input): Project            // 物化 stagesSnapshot（D10）
  update/get/delete/list
  switchStage(id, stageName): void
  checkState(id, stage, itemId, checked): void
  healthSummary(id): { stage; unchecked; total; lastLogAt; injection }          // 聚合查询
}
class DevLogRepo {
  create(input): DevLogEntry        // entryNo 事务分配（§2.6），冲突重试一次
  list(id, {type?})/export(id): string
  linkAsset(id, assetId): void      // 回流反链
}
class PacksRepo {
  create/update/delete/get/list
  preview(id): { files: PlannedFile[]; fingerprint; warnings; coveredPlatforms }
  export(id, {version, channel}): PackExport      // 409 幂等（§2.6）
  exportsOf(id): PackExport[]
  reportInjection({packId, packVersion, projectPath}): void
}
```

### 7.2 pack/：composer / fingerprint / validate

**composer（§7.3 组合规则实现）**：

```
输入：ResolvedPack（selection 物化后的资产内容快照 + flow.stages）
1 对每个 target adapter 调 plan(pack) 得文件集（主文件 + TERMS/CHECKLIST/SKILLS + manifest）
2 主文件正文按固定节序组装（空节整体省略）：
    ## 工作流程   ← flow.stages：### 阶段名 + 清单 + 产物行（保模板原序）
    ## 行为规则   ← prompts[useAs=rule]：#### 标题 + 正文
    ## 术语表     ← 恒一行「见 TERMS.md（N 条）」；未生成 TERMS.md 时内联表格
    ## 任务提示词参考 ← prompts[useAs=reference]（保留 {{变量}} 占位）
3 排序键（确定性来源）：
    prompts：title.toLowerCase() 后 code-unit 比较
    terms：(en||zh).toLowerCase() 后 code-unit 比较
    stages：模板原序
4 首尾受管块标记：<!-- openvibe:pack=<name>@<version> begin (regenerate: npx openvibe-cli sync) -->
  … <!-- openvibe:end -->（P1 块级合并预留）
5 TERMS.md 表格内 `|` 转义为 `\|`；CHECKLIST.md 每阶段 `## 阶段 N · 名` + `- [ ]` 项 + `**产物**:` 行
6 文件内零时间戳（时间只在 manifest.exportedAt）——幂等/字节级 golden 的数学基础
```

**fingerprint（design §7.6）**：

```ts
const fingerprint = sha256(
  files.sort(byPathCodeUnit)                    // 码点序，禁 localeCompare（ICU 漂移）
       .map(f => `${f.path}\t${sha256(utf8(f.content))}\n`)
       .join('')
);
```

**validate（design §7.7 全规则）**：`files[].path` 必须——相对路径；`/` 切分无空段、无 `..` 段、不含 `\`、不以 `/` 开头；单段 ≤128 字符；总长 ≤255；文件总数 ≤200。任一失败 → 整包拒绝（CLI 退出码 1 / 服务端导出前同跑）。写入时二次校验：`path.resolve(projectPath, rel)` 必须仍在 projectPath 内（防符号链接逃逸）。规模双保险：单文件 >512KB 或总内容 >2MB 拒绝（CLI 与服务端两道，m6a §6.4）。

### 7.3 importers/：规则文件解析表（m1 FR-6）

| 输入 | 解析 | title 默认 | useAs | platformMarks 推断 |
|------|------|-----------|-------|--------------------|
| `.cursorrules` | 全文入 content | 文件名 | rule | `[cursor]` |
| `.mdc` | 剥离 YAML frontmatter → description；正文入 content | 文件名 | rule | `[cursor]` |
| `CLAUDE.md` | 全文 | 文件名 | rule | `[claude-code]` |
| `AGENTS.md` | 全文 | 文件名 | rule | `[generic]` |

去重：`title + contentHash`；导入版本历史合并为「导入前单版本」。CLI `scan --project` 与 Web 导入落同一 API（m1 FR-6.3）。

### 7.4 db/seed.ts：幂等流程（design §15）

```
首启/重播 → 逐 bundle（terms → flow-templates → prompts）：
 1 contentHash = sha256(bundle 文件)
 2 比对 seed_registry：相同 → skip（计数不变）
 3 内容变了 → 逐条并入：
    a 新条目（title / zh+en / name 不存在）        → INSERT，写 seed_hash
    b 既有且 seed_hash === bundle 条目哈希（未改过）→ UPDATE
    c 既有且 seed_hash 为 NULL（用户建/用户改）     → 跳过该条 + 结果 warning
 4 处理完 → upsert seed_registry
单文件解析失败 → 跳过该文件继续（启动永不因内容阻塞）
```

### 7.5 search/fts.ts：查询路由（design §12）

```
q 长度 ≥3 → FTS MATCH（q 原样作为 trigram 匹配串）→ BM25 排序
q 长度 <3 → LIKE '%q%'（中文两字词如「漂移」走此路径）→ updatedAt 排序
两个入口：/prompts?q=（title+content+tags）与 /terms/search（zh+en+aliases+definition）
```

---

## §8 平台适配（packages/adapters）

### 8.1 接口与 registry

```ts
export interface Adapter {
  id: string;                       // manifest.targets 取值（与 m1 platformMarks 枚举对齐）
  plan(pack: ResolvedPack): PlannedFile[];   // 主规则文件路径 + 是否复用主正文 + 壳差异
}
export const registry: Record<AdapterId, Adapter>;
export const COMPAT_MATRIX: { platform: string; reads: string; note?: string }[];  // 仅展示用
```

新增平台 = 新增一个 Adapter 模块 + registry 一行；兼容平台 = 改 COMPAT_MATRIX 常量一行（零代码，design §8 结论）。

### 8.2 六 adapter 产物映射（v1.2 冻结）

| id | 写入文件 | 壳差异 |
|----|----------|--------|
| claude-code | `CLAUDE.md` | 主正文原样 |
| cursor | `.cursor/rules/openvibe.mdc` | YAML frontmatter：`{description: "OpenVibe 标准包 <name>@<ver>", globs: "", alwaysApply: true}` |
| generic-agents | `AGENTS.md` | 主正文原样（Codex/zcode/Kimi 等经兼容矩阵读此文件） |
| codebuddy | `CODEBUDDY.md` | 主正文原样（无此文件时 CodeBuddy 回退读 AGENTS.md） |
| trae | `.trae/rules/openvibe.md` | frontmatter `{ description, alwaysApply: true }`（v1.2 自定义文件名，D10；**T6 真机复核推翻原 `trigger: always`**，二进制只认 `globs`/`alwaysApply`/`description`/`scene`） |
| minicode | `MINI.md` | 主正文原样（MiniCode `/init` 约定，D9） |

辅助产物（**不属 adapter**，composer 直接生成）：`TERMS.md` / `CHECKLIST.md` / `SKILLS.md` / `openvibe.pack.json`。

### 8.3 兼容矩阵常量（compat.ts）

`zcode → AGENTS.md`（一手证据）；`Trae CN → AGENTS.md`（一手证据：二进制默认开启 + T6 GUI 暗号实测，DEV-0016 C-39）；`Kimi Code → AGENTS.md`（较强，子 Agent 感知缺陷为上游 bug，文档如实标注）；`Codex / OpenCode / Cline / Qwen Code → AGENTS.md`；P1 可选：`gemini → GEMINI.md`、`copilot → .github/copilot-instructions.md`。

### 8.4 T6 真机复核 checklist（半天）

1. ✅ Trae 真机复核（2026-09-22）：`.trae/rules/openvibe.md` 保留自定义文件名，但 frontmatter 从 `trigger: always` 改为 `{ description, alwaysApply: true }`——Trae CN 二进制一手证据显示只解析 `globs`/`alwaysApply`/`description`/`scene`，未知键静默丢弃，`trigger` 不会触发自动加载；`project_rules.md` 回退预案未触发（同二进制证实 `.trae/rules/` 支持多规则文件共存）。见 `docs/devlog-evidence/DEV-0016/trae-frontmatter-probe.txt` + DEV-0016 C-26。✅ owner GUI 手工清单已完成（2026-09-22）：`.trae/rules/openvibe.md` 与 `AGENTS.md` 各埋一枚暗号，不引用文件发问后两枚全对 ⇒ `alwaysApply: true` 自动加载与 AGENTS.md 通道均经真实 GUI 证实，`project_rules.md` 回退预案正式关闭（C-39，`trae-gui-manual-check.txt`）。
2. Kimi Code 抽测 AGENTS.md 感知（主会话生效即算过）。
3. （顺带）三平台产物在真机打开确认无编码/换行问题（CRLF 纪律：一律 `\n`）。

---

## §9 T1–T9 任务分解（执行本体）

> 每任务四段：**排期 / SPEC 依据 / 工作项 / 验收-测试映射**。工作项引用 §1–§8 具名对象。映射表用例 ID 约定：`UT-`(unit) `IT-`(integration) `CLI-` `E2E-` `GOLDEN-` `SCRIPT-` + 模块 + 序号。

### T1 · 工程脚手架（W1D1 全天 + W1D2 上午，1.5 人日）

**SPEC 依据**：design §1–§3（结构/依赖规则 R1–R4）、§2 选型表；tasks T1。

**工作项**
- [ ] 仓库落地（D16/D17）：`git checkout --orphan main-ov`（工作区文件不带历史）→ 提交本套 docs/README/DEV_LOG → `gh repo create <owner>/OpenVibe --public` → 推送 → 旧 duke 仓库保留为存档不再挂载
- [ ] 落 `LICENSE`（Apache-2.0）+ `.gitignore`（node_modules/dist/.DS_Store/.mimosa/*.db 等）
- [ ] pnpm workspace：根 `package.json` scripts（`dev / build / test / lint / seed:check`）+ `pnpm-workspace.yaml`
- [ ] 根 `tsconfig.base.json`（strict、`moduleResolution: bundler`）+ 各包继承
- [ ] ESLint（含 R1–R3 import 边界规则）+ Prettier
- [ ] 建空骨架：`apps/{web,server,cli}`、`packages/{core,adapters,shared}`、`content/seed/`、`scripts/`
- [ ] `packages/shared`：§3.11 zod schema 全量 + `errors.ts` 错误码枚举 + `constants.ts`（schemaVersion=1、adapterId 枚举、受控标签词表八类）+ `ids.ts`（前缀 nanoid）
- [ ] vitest 三层配置（unit / integration(app.inject+临时 DB) / cli-project 夹具 helper）+ 每层 1 个示例用例
- [ ] GitHub Actions：lint+test，**三平台矩阵**（macos/ubuntu/windows，D5），预留 `seed:check` 挂点
- [ ] README 徽章 + CONTRIBUTING 起点（跨平台路径/换行符纪律清单）

**验收-测试映射**（tasks T1 验收：全绿 + CI 首跑）

| 验收 | 用例 |
|------|------|
| `pnpm i && lint && test` 全绿 | UT-EXAMPLE-01 / IT-EXAMPLE-01 / CLI-EXAMPLE-01 |
| CI 三平台首跑通过 | CI 日志归档 DEV_LOG |
| 依赖规则 R3 生效 | UT-LINT-01（core 引 server → lint 报错夹具） |

### T2 · 存储核心（W1D2 下午 – W1D4，2.5 人日）

**SPEC 依据**：design §5（DDL 权威）、§12（FTS）、§15（seed 机制）；m1 §7.2/3、m3 §7.1/4 存储前置。

**工作项**
- [ ] `core/db/index.ts`：打开/建目录/WAL/foreign_keys/better-sqlite3 封装
- [ ] `migrations/0001_init.sql`（§2.2 全表+索引）+ `0002_app_meta_telemetry.sql`（§2.4）
- [ ] `core/db/runner.ts`（§2.5 只前进规则）
- [ ] FTS 虚表 + 六触发器（§2.3）+ `core/search/fts.ts` 查询路由（§7.5）
- [ ] repos：prompts（快照/回滚）/terms/skills/flows/projects（stagesSnapshot 物化）/devlog（entryNo 事务）/packs（§7.1 签名）
- [ ] `core/db/seed.ts` 骨架（§7.4 幂等；数据 T4/T8 到位）
- [ ] 单测夹具：临时 DB helper（`newDb()` 每用例新建）

**验收-测试映射**

| 验收（出处） | 用例 |
|------|------|
| 版本快照触发/不触发（m1 §7.2/3 前置） | UT-VERSION-01/02 |
| 级联删除计数（m1 §7.7 / m2 §7.5 前置） | UT-CASCADE-01/02 |
| FTS 中英命中（m1 §7.4 / m3 §7.2 前置） | UT-FTS-01/02/03 |
| seed 幂等（夹具 bundle 跑两遍） | UT-SEED-01 |
| entryNo 并发不重号 | UT-ENTRYNO-01 |
| migration 重跑幂等 | UT-MIGRATION-01 |

### T3 · M1 提示词库垂直切片（W1D5 – W2D3，4 人日）

**SPEC 依据**：m1 FR-1–FR-7 全部；design §6 提示词端点、§12。

**工作项**
- [ ] `server/routes/prompts.ts`：§3.1 八端点（含 import/export、versions/restore、warnings 语义）
- [ ] `core/importers/`（§7.3 四解析器 + 去重）
- [ ] `web/pages/LibraryPage` + 组件：PromptList / FolderTree / TagFilterBar / PromptEditorDrawer / VariableFillModal / VersionHistoryPanel / DiffViewer（§5.2 props）
- [ ] Query 封装 `hooks/usePrompts.ts`（§5.3 失效映射）
- [ ] JSON/MD 导入导出 + 去重报告 UI
- [ ] 集成测试覆盖 m1 §7 全部 8 条对应 API 行为

**验收-测试映射（m1 §7 ×8）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| 1 | 变量提取恰两项 + 复制无残留 | IT-API-PROMPT-01 + UI 录屏 |
| 2 | 3 版本 + 回滚 v4=v1 | UT-VERSION-01 + IT-API-PROMPT-02 |
| 3 | 改 tags 不产生版本 | UT-VERSION-02 |
| 4 | 中文子串「规则漂移」/ 英文前缀 | UT-FTS-01/02 + IT-API-PROMPT-03 |
| 5 | 导出 10 → 清库回导字节一致 | IT-IMPORT-01 |
| 6 | `.cursorrules` 导入 rule+cursor | IT-IMPORT-02 |
| 7 | 硬删级联计数 0 | IT-DELETE-01 |
| 8 | 422/404 结构化错误 | IT-ERR-01 |

### T4 · M3 术语库 + 首批词条（W2D4–D5，2.5 人日）

**SPEC 依据**：m3 FR-1–FR-4；seed-content §3.2；design §7.4（TERMS.md 契约）。

**工作项**
- [ ] `server/routes/terms.ts`（§3.3 五端点，render-terms-md 确定性排序 + `|` 转义）——**⚠️ 2026-09-25 校正：「五端点」是写作当时的计划数，实落六个；端点清单以 `apps/server/src/routes/terms.ts` 的路由注册为准（本文与 `tasks.md` 都不再各自枚举，见 `tasks.md:82` 的 2026-09-24 自纠）**。本框按文件头「勾选语义」行读作计划展开，不表示未做。
- [ ] `web/pages/TermsPage` + TermsTable / TermEditorDrawer / TermsMdPreview
- [ ] `content/seed/terms.json` 首批 60 条（批次 A/B，§11 SOP）
- [ ] `scripts/seed-check.ts`（schema+数量+受控词表），CI 阈值 60 先行

**验收-测试映射（m3 §7 ×5）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| 1 | seed ≥60（先行门槛）二次启动不变 | UT-SEED-01/02 |
| 2 | 搜「漂移」/RAG/别名命中 | UT-FTS-03/04 + IT-API-TERM-01 |
| 3 | TERMS.md 两次 sha256 相同 + 无表格错位 | UT-COMPOSE-01 |
| 4 | 删词条关联清理 | UT-TERM-01 |
| 5 | zh/en 全空 422 | IT-ERR-02 |

### T5 · M5 项目流程 + M2 Skill 台账（W3D1–D4，4 人日）

**SPEC 依据**：m5 FR-1–FR-7（P2 追加 FR-8）、m2 FR-1–FR-3（P2 完整版追加 FR-4–FR-7）；design §5/§6。横切视觉另见 `specs/theme.md`，注音数据见 `specs/m3-glossary.md` FR-5。

**工作项**
- [ ] `server/routes/{flowTemplates,projects,tasks,devlog}.ts`（§3.4–3.7；含 builtin 403、switch-stage、injection-status 只读解析 lock 夹具）
- [ ] 回流两端点动作（→ 术语/提示词草稿；source=project、linkedAssetIds 回写）
- [ ] `web/pages/{ProjectsPage,ProjectDetailPage,FlowsPage,SkillsPage}` + ProjectDashboard/StageBar/ChecklistPanel/KanbanBoard/DevLogList/DevLogEditor/ReflowActions/FlowTemplateCard/FlowTemplateEditor/SkillList/SkillScanReport
- [ ] `server/routes/skills.ts` 扫描端点（dirHash 算法 m2 FR-1.3）
- [ ] 3 套流程模板数据随代码常量（阶段定义照抄 seed-content §3.3；T8 迁 seed 文件）

**验收-测试映射（m5 §7 ×8 + m2 §7 ×5）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| m5-1 | 注入状态显示 + 「可更新」提示 | IT-PROJECT-01 + UI 录屏 |
| m5-2 | 复制模板快照一致、原模板未变 | IT-FLOW-01 |
| m5-3 | builtin 编辑 403 BUILTIN_IMMUTABLE | IT-FLOW-02 |
| m5-4 | 勾选 60% 持久化 + 勾满 ✅ | IT-PROJECT-02 |
| m5-5 | 看板拖拽/排序持久化 | IT-TASK-01 + UI 录屏 |
| m5-6 | DEV-0001/2/3 + 导出含 evidence | IT-DEVLOG-01 |
| m5-7 | 回流草稿 + 反链 + linkedAssetIds | IT-REFLOW-01 |
| m5-8 | 删项目级联 0 + 目标目录哈希不变 | IT-PROJECT-03 |
| m2-1 | 3 skill 扫描报告（1 无 frontmatter） | IT-SKILL-01 |
| m2-2 | 改后重扫 versions=2 | IT-SKILL-02 |
| m2-3 | 未变更全 skipped | IT-SKILL-03 |
| m2-4 | 手动+同名目录合并 versions=2 | IT-SKILL-04 |
| m2-5 | 删 skill 级联 | UT-CASCADE-02 |

**P2 波次追加映射（2026-09-30 补 spec 时同步；实现先于规格，逐笔 = `060690a` 远程/整理/审查、`db6bb8d` 端口面板、`453a535` 主题与注音）**

> 本表按 §13-9 只写**文件 + describe/it 标题**，不抄支数与具名上界；取数命令的单源在 `docs/tasks.md` §2b 的 T10 验收行。列「未验证面」的行是**负向登记**，不得读成已通过。

| # | spec 验收 | 用例 / 凭据 |
|---|-----------|-------------|
| m2-6 | FR-4.2–4.4 GitHub 整仓与子目录导入、URL 归一、同内容 skipped | `apps/server/test/skills.api.test.ts` describe「远程导入 / 整理 / 审查（DEV-0067）」的 it「GitHub 整仓导入：建账带溯源版本串；重扫同内容 skipped；仓库 URL 归一」+ it「GitHub 指定子目录导入（DEV-0068）：path 过滤 + 树指纹建档；检查更新三态」 |
| m2-7 | FR-4.5 SkillHub 清单 sha256 与 core 同公式、COS 302 放行 | 同 describe 的 it「SkillHub 按 slug 导入：清单 sha256 直接算指纹（与 core 同公式）；SKILL.md 走 COS 302」；搜索面 it「SkillHub 搜索映射 slug/名称/下载量；非法仓库格式 422」 |
| m2-8 | FR-4.6 落账复用 `recordVersion` 三态 + 与本地同名合并 | `packages/core/src/repos/skills.test.ts` describe「远程导入落账 upsertRemote（DEV-0067）」，逐支：it「新建 → 同指纹跳过 → 指纹变化追加版本（版本线带溯源串）」／it「与本地同名条目合并：追加远程版本且不覆盖已有 skill_dir」 |
| m2-9 | FR-5.3 检查更新四态（upToDate / remoteChanged / notTracked / checkFailed） | it「SkillHub 检查更新：清单 sha256 指纹对比 upToDate；建档字段写入」+ m2-6 引用的子目录导入支（含三态断言）；**`checkFailed` 的单列覆盖只在 API 层注入失败，真网络失败未测** |
| m2-10 | FR-6 重复整理只报告不删（同内容组 / stale / 名称异常 / manual 不参与） | 两侧同族：`skills.api.test.ts` it「重复整理与审查端点：同内容组/失效目录/名称异常 + 审查分级」；`skills.test.ts` describe「重复整理与内置审查（DEV-0067）」的 duplicates 支 |
| m2-11 | FR-7 内置审查的 issue 码与分级 | `skills.test.ts` it「reviewSkill：引号名 fail、空描述 fail、无触发词 info、凭据串 fail、家目录 warn、干净技能零问题」 |
| m2-12 | FR-5.5 存量一键建档（retrack） | it「retrack 补档（DEV-0069）：存量条目按版本线溯源串重导建档；解析失败逐条报」 |
| m2-13 | FR-4.7/§6.2 出站安全面（https-only、主机白名单、DNS 公网、逐跳复检、超时） | `apps/server/test/http-guard.test.ts` 的 describe 逐个：「isPublicIp · 环回/私有/保留地址判定」（该 describe 用 `it.each`，无逐案具名标题）「assertRemoteUrl · 协议与主机白名单（DNS 之前）」「guardedFetch · 重定向逐跳复检」；测试注入 `fetchImpl`/解析结果，**不碰真实网络**。**超时腿负向登记**：`apps/server/src/lib/http-guard.ts:107` 的 `AbortSignal.timeout(FETCH_TIMEOUT_MS)` 无用例（`grep -rn 'FETCH_TIMEOUT\|AbortSignal' apps/server/test` 对 http-guard 族零命中）⇒ 本行第二列的「超时」由实现承担、不由测试承担，不得读成已通过 |
| m2-14 | FR-1.1 默认根发现（存在即扫、`.Trash` 排除、cwd `.claude/skills` 并入）与 ZCode 插件根（清单钉版 + 缓存最高版本） | `skills.test.ts` describe「默认扫描根发现（DEV-0063：~/.<tool>/skills 存在即扫）」，逐支：it「发现全部点目录下的 skills；.Trash 排除；非目录点项与无 skills 的点项忽略」／it「cwd 的 .claude/skills 存在时并入同一清单（去重、无重复条目）」 + describe「ZCode 插件 skill 根（DEV-0066：清单钉版 + 缓存最高版本兜底）」，逐支：it「清单插件按 installPath 收集；payload/skills 布局兼容；无 skills 的插件不收」／it「清单钉版优先：钉版插件的历史缓存版本不参与；缓存内未钉插件只取最高版本」／it「缓存插件最高版本无 skills 时不回落低版本；清单缺失/损坏仍走缓存兜底」 |
| m2-15 | **未验证面**（m2 spec §7.14）：四个远程对话框（导入 / 检查更新 / 整理 / 审查）**无 DOM 断言、无截图凭据**；`docs/devlog-evidence/` 无 DEV-0067/0068/0069 目录 | 判据 = 端点级与算法级绿，**界面级零覆盖**；符号链接环（`ELOOP` 整批抛出）与 256KB 截断两条 spec 修正**无实现无用例** |
| m5-9 | FR-8.2/8.3 端口声明六源、优先级去重、monorepo 一级子包、非法 JSON 不炸 | `apps/server/test/ports.api.test.ts` describe「port-scan · 声明扫描器（纯文件解析）」 |
| m5-10 | FR-8.4 监听解析（lsof / netstat 地址归一）与真机不可用降级 warning | describe「port-scan · 监听器解析（罐头输出）」，含 it「真机 lsof 不可用时降级为 warning 不抛（runner 注入抛错）」——该腿的期望命令与 argv 按 `process.platform` 分支（`[DEV-0077]` 补） |
| m5-11 | FR-8.5/8.6 声明 × 监听合并、`url` 仅 localhost、未登记路径空台账、项目 404 | describe「GET /api/projects/:id/ports」，逐支：it「路由级合并（注入监听实现）：监听中的带 process/pid/url，未监听的三者一律缺席」／「未登记 localPath ⇒ 空台账且 HTTP 200（projectPath 是空串，不是缺键也不是 4xx）」／「localPath 指向已消失的目录 ⇒ 声明侧置空 + listenersWarning 说明原因，本机监听照报」／「不存在的项目 404」／「声明 × 监听合并：监听中的带进程与 url，未监听 idle」（末支是扫描器级拼装，`[DEV-0081]` 已把标题改窄）。路由级合并经 `apps/server/src/app.ts` 的 `listListenersImpl` 注入点——**该注入点此前声明了没接线**，`[DEV-0081]` 接上后才不依赖真机 `lsof`/`netstat` |
| m5-12 | **未验证面**（m5 spec §7.12，2026-10-01 `[DEV-0081]` 就地复核后重写）：① 15 s 轻轮询无断言（`apps/web/src/hooks/useProjectPorts.ts:12` 的 `refetchInterval: 15_000`，验的是 react-query 的行为而非本仓代码，要钉需 fake timers）；② `data.listeners` 在前端无落点（`PortsPanel.tsx` 只读 `listenersWarning`，归队列 ㉖ (b) 待裁）；③ 三平台真机命令的**输出差异**本身无凭据，断言只钉「按平台分派了哪条 argv」。**已移出**（原列此处、现已被验）：`listenersWarning` 的前端渲染与端口卡本体 ⇒ `apps/web/src/components/projects/PortsPanel.test.tsx`（族名 `WEB-PORTS`），三平台 CI 已覆盖到（run 见 `[DEV-0081]` 补记）。**仍成立的一半**：实现波 `db6bb8d` 自身无独立 DEV_LOG 条目，端口卡截图仍挂在无关的 `DEV-0047/01-ports-panel.png` | 判据 = 端点侧（注入监听、跑路由）＋两个纯解析器＋前端 DOM 腿，四组全在 CI 上；机器凭据 `docs/devlog-evidence/DEV-0081/`（变异清单 + 空窗探针），人工凭据仍是那张 0047 截图 |
| thm-1 | `specs/theme.md` FR-2 token 治理（调用点零裸色阶、裸 hex 只住 token 源、引用必声明、声明必被引用） | `tests/design-tokens.test.ts` describe「WEB-TOKENS · 颜色单一出处」四道 `it`；unit project（`pnpm vitest run --project unit tests/design-tokens.test.ts`） |
| thm-2 | `theme.md` FR-1/FR-3/FR-4/FR-5（主题持久化、预涂、双主题同构、字体 asset、组件形制） | **人工凭据**：`docs/devlog-evidence/DEV-0046/01-library-light.png`、`02-library-dark.png`、`03-terms-dark-ruby.png`（暗色那张做过 PNG 采样）；对比度按 `theme.md` §7.4 的 node 一行复算 |
| thm-3 | **未验证面与未对齐** | `theme.md` §7.6（无像素回归、无 `data-theme` 断言、win32/linux 系统字重未目验）与 §7.5 未对齐清单（头词字号、宋体切片体积、注音开关、落章动画未挂、暗色朱砂 AA 未达标） |
| term-py-1 | m3 FR-5 注音派生字段（带声调词级串、多音字按词组消歧、纯英文空串） | `packages/core/src/repos/terms.test.ts` describe「UT-TERM-OUT · pinyin 派生字段（头词 ruby 注音，DESIGN.md term-card）」；与排序同源面 = describe「UT-COMPOSE-01 · 排序口径」的 it「pinyin 走词典键（多音字按词组消歧），与码点序不同」+ `apps/server/test/terms.api.test.ts` it「IT-TERM-RENDER-01（§7.3）」的 pinyin 次序断言 |
| term-py-2 | m3 §7.9 纠偏：`IT-SEED-REAL-01（§7.1）` 断言的是 `>= 60`，**低于 m3 §7.1 的 ≥100** ⇒ ≥100 由 `SCRIPT-SEED-01`（负向闸）与 `UT-SEED-02` 保证 | 判据落在 `seed:check` 与 UT 层，IT 层不背书 ≥100（本行为口径声明，不是新增用例） |


### T6 · M6a 组包导出 + 契约快照（W3D5 – W4D5 上午，5.5 人日）★ 关键路径

**SPEC 依据**：m6a FR-1–FR-5；design **§7 契约 / §8 adapter（冻结，A 级变更红线）**。

**工作项**
- [x] `core/pack/composer.ts`（§7.2 组合规则/排序键/受管标记/TERMS 转义）
- [x] `core/pack/fingerprint.ts` + `validate.ts`（§7.2 全规则）+ `bundle.ts`（单文件 bundle 打包/解包）
- [x] `adapters/`：types/registry/compat + 六模块（§8.2 映射）
- [ ] **真机复核**（§8.4 checklist 半天）
- [x] `server/routes/packs.ts`：preview/export/exports/injections（409/STALE_SELECTION/NAME_CONFLICT）+ 11 端点
- [x] bundle 下载（migration 0003 `bundle_json`）+ 目录导出双通道（幂等/409 漂移拒写）
- [x] `web/pages/PackNewPage` PackWizard 5 步 + PackPreviewPane（文件树+内容+coveredPlatforms）+ `PacksPage` ExportHistoryPanel
- [x] **golden 快照**：三夹具（G1 claude-code+generic-agents / G2 codebuddy+trae+minicode / G3 全六 targets+skill+含变量 rule）全部产物字节级断言，进 CI

**验收-测试映射（m6a §7 ×8）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| 1 | 连续两次 preview sha256 全一致 | UT-COMPOSE-02 |
| 2 | preview 字节 = 磁盘导出字节 | IT-PACK-01 |
| 3 | 409 → 升 v1.1.0 成功指纹不同 | IT-PACK-02 |
| 4 | 恰 4 文件（CLAUDE/AGENTS/TERMS/manifest） | GOLDEN-G1 |
| 4b | 国内三平台正文一致 + trae frontmatter | GOLDEN-G2 |
| 5 | 删提示词不影响已导出（物化） | IT-PACK-03 |
| 6 | bundle 被 sync --file 消费 | CLI-SYNC-06（联测） |
| 7 | 三种 4xx 结构化错误码 | IT-ERR-03 |

### T7 · CLI（W4D5 下午 – W5D4，4.5 人日）★ 关键路径

**SPEC 依据**：m6b FR-1–FR-5；design §7.5/7.6/7.7、§9、§11。

**工作项**
- [x] `cli/src/config.ts` 发现链 + token（0600）+ `--json` 契约 —— DEV-0018/T7a
- [x] `commands/serve.ts`（§1.2 八步首启初始化+播种+托管+--open）—— DEV-0018/T7b
- [x] `commands/scan.ts`（--skills/--project → 调 T4/T5 端点 + 报告渲染）—— DEV-0018/T7e
- [x] `commands/sync.ts` 五状态机（§6.2）+ @clack 交互 + 旗标 + 备份 + lock + 上报 —— DEV-0018/T7c+T7d
- [x] `commands/diff.ts`（lock 比对 + 在线新版本探测 + 退出码 0/1/2）—— DEV-0018/T7e
- [x] `cli/src/telemetry.ts`：reportEvent 单出口 + D13 一次性询问（§6.5）—— DEV-0018/T7d
- [x] 安全用例集：路径攻击样本、512KB/2MB 防线、非 TTY 防挂起、fingerprint 篡改 —— DEV-0018/T7f（含新堵的悬空符号链接逃逸）
- [x] CLI 集成测试：临时目录全树哈希断言 dry-run 零写入 —— DEV-0018（10 文件 / 106 it / 57 CLI-* 用例 ID）

**验收-测试映射（m6b §7 ×8）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| 1a | dry-run 零写入（mtime+sha256 全树） | CLI-SYNC-02 |
| 1b | 备份内容一致 | CLI-SYNC-03 |
| 1c | 非 TTY 无 --yes → 退出码 1 零写入 | CLI-SYNC-04 |
| 2 | 改 TERMS.md → diff=2 → DRIFT → 修复 clean | CLI-DIFF-01 + CLI-SYNC-05 |
| 3 | 离线 --file 注入（lock 写入，上报仅警告） | CLI-SYNC-06 |
| 4 | 篡改 bundle → 退出码 1 零写入 | CLI-SYNC-07 |
| 5 | 恶意路径 `../evil.txt` 整包拒绝 | CLI-SEC-01 |
| 6 | scan 首次 2 条、重跑全 skipped | CLI-SCAN-01 |
| 7 | --json 可 jq + 五状态字段 | CLI-JSON-01 |
| 8 | serve 0600 + 二次启动不重播 | CLI-SERVE-01 |

### T8 · 种子全量 + 开箱体验（W5D5 – W6D3，4 人日）

**SPEC 依据**：seed-content FR-1–4、onboarding FR-1–4；design §15。

**工作项**
- [x] terms.json 补至 ≥100（批次 C/D，§11）；prompts.json 20 条（两批）——**实量单源在 §9 映射表 seed-2 一行**（本行原写死「104 / 20」，2026-09-23 按 §0.3 反漂移原则移除；两个时点的历史真值 104 与 109 见 DEV-0019 / DEV-0022，不在此重复）
- [x] 模板从代码常量迁 `flow-templates.json`（老库幂等升级验证）——T4 即已按 C-15 以 seed 文件落盘，本轮只补 UT-SEED-02 的真实 seed 全量验证
- [x] `seed:check` 阈值切正式（100/3/20）进 CI + §3.4 构成配额（C-57）+ 负向探针命名用例
- [x] 预置演示包：首启组装 `default`（20 提示词+全术语+轻量流+六 targets+1.0.0+一次目录导出，onboarding FR-1，D-3 跳过口径）
- [x] 首启向导：OnboardingBar 三步（真实副作用红线）+ 步骤③ lock 轮询自动确认（D11）
- [x] FlywheelCard 五项统计 + TelemetryAskCard（FR-4.2，D13）+ 设置页遥测开关
- [x] SettingsSections：种子重播/数据目录/备份说明/向导重置（含结清 C-56 的 `GET /api/settings` 与 `POST /api/settings/reseed`）
- [x] 四端点读出口：`GET /api/settings` / `POST /api/settings/onboarding` / `POST /api/settings/reseed` / `GET /api/stats` / `GET /api/injection-status?dir=`（D-4/D-5）
- [x] （owner 追加 D-6）遥测外发闭环：serve 进程内 60s 批量出队 + `deploy/telemetry/worker.js` fail-closed 接收端 + `config.json` 的 `telemetryEndpoint?`，结清 C-50
- [x] （owner 追加 D-7）并发 sync 文件锁（`O_EXCL` 非阻塞抢占 + pid/5 min 判死接管）
- [x] （owner 追加 D-7）Web 主包拆包 + `pnpm bundle:check` 成 CI 第五闸（入口 1,155.62 kB → 291.01 kB）
- [x] 排序确定性收口（DEV-0017 风险②/DEV-0018 风险①）：17 处 `ORDER BY` 补唯一键 + UT-ORDER-01 静态守卫 + UT-ORDER-02 双库反序对照 + 导出口径与展示序分离（C-58/C-59）

**验收-测试映射（seed §7 ×4 + onboarding §7 ×8）**

| # | spec 验收 | 用例 |
|---|-----------|------|
| seed-1 | seed:check 门槛（词条数压到门槛之下 → 非零） | SCRIPT-SEED-01（`tests/seed-check.test.ts`，临时副本上截到 95 条 → `95 条 < 门槛 100 条` 退出码 1；按**绝对量**截而非「删 N 条」，种子只增不减才不会让负向样本重新达标（DEV-0022 C-85）；篡改前同一副本先跑 exit 0 作对照） |
| seed-2 | 首启计数 100/7/21 + 升级导入 | UT-SEED-02（真实 `content/seed` 全量入 SQLite，terms ≥100 / 模板 =7 / prompts =21 逐条无 warning；**当前实量 109/7/21**——第 21 条由 `DEV-0059` 2026-09-29 追加；模板 3→7 由 `DEV-0074` 2026-10-01 加四套问答框架，断言见 `packages/core/src/db/seed.test.ts` 的 UT-SEED-02，定值单源 `specs/seed-content.md` FR-4） |
| seed-3 | 模板 3/7/4 阶段逐字一致 | SCRIPT-SEED-02 两支（阶段名改一字 → 点名「阶段名需逐字一致，收到 启动 / 开发 / 回顾」；删一个阶段 → 「阶段数期望 7，收到 6」） |
| seed-4 | 词条质量抽查 | 机器侧由 `seed:check` 把关（definition ≥20 字 / aliases 非空 / example 覆盖 100% / 受控词表 / 附录 B 基线）；人工侧 `docs/devlog-evidence/DEV-0019/seed-review.md` 摊开 41 词条 + 20 提示词全文，**裁决表待 owner 填**（DEV-0019 风险①） |
| onb-1 | ≤3 命令/≤5 分钟产物清单 | `onboarding-walk.mjs`「验收 1（onb-1）」段（九项产物逐条 `statSync` + 第三条命令 `diff` 判 clean + 用户侧 4.0 s / 构建 1.5 s 单列，计时口径 C-74）+ IT-ONB-05 |
| onb-2 | 跳过不再现/重置再现 | 走查「验收 2：跳过/重置」段 + IT-ONB-03/04 |
| onb-2b | 未注入不点亮 + lock 自动确认 | 走查「验收 2b」段（提示如实点名 `pack.lock.json` → sync 后自动点亮）+ IT-ONB-15..18 |
| onb-3 | 步骤②与 preview API 同源 | 走查「验收 3」段（向导指纹 == `POST /api/packs/:id/preview` 指纹）+ IT-PACK-01/UT-COMPOSE-02 |
| onb-4 | 飞轮圈数=1/删除回落 | 走查「验收 4」段（`{assets:124,…,loops:1}` → 删夹具项目后 `loops:0`，顶栏双向）+ IT-ONB-12/13/14 |
| onb-5 | 默认关 + 零外联断言 | UT-TELEMETRY-01 + TF-09（无端点连 `setInterval` 都不建）+ `telemetry-egress.mjs` 17/17（关闭态第二个 60 s 窗口计数 `3→3`）+ 走查 host 清单全为 `127.0.0.1` |
| onb-5b | 一次性询问 declined 永不再问 | 走查「验收 5b」段（询问卡出现 → 选「暂不」→ 刷新不再问 → `askState=declined / enabled=false`）。**2026-09-27 起这条有了两道凭据**：`SM-3h/3i` 改成「刷新之后轮询到落库为止（≤5 s）」，产品侧那一发 POST 带 `keepalive` 让请求活过页面——起因是 ⑧ 的常驻闸在 macos runner 上量到 `askState=unset`（队列 ⑳ / `[DEV-0057]`；三平台凭据已到账：run `36309712878` 三侧 `SM-3h/3i` 同读 `askState=declined`） |

> Playwright 版 `E2E-ONBOARD-01..04` / `E2E-FLYWHEEL-01` / `E2E-TELEMETRY-01` 仍按 dev-plan §9-T9 排期：本仓**当时**无 jsdom（该前提已于 2026-09-26 由 owner 裁定 ⑪ 换掉，见 `DEV_LOG [DEV-0033]`），本轮以**入库的真机走查驱动器**（headless Chrome + 裸 CDP，可对 HEAD 复跑）承担同一口径的证据，T9 决定是否提升为 CI 内 E2E。

### T9 · 飞轮 E2E + 发布（W6D4–D5 + W7D1，3 人日）

**SPEC 依据**：全部 specs 验收汇总；design §13。

**工作项**
- [x] Playwright 主链 E2E-FLOW-01：首启播种 → 建提示词 → 建项目 → 组包导出 → CLI sync 临时目录 → 手改文件 → diff 报漂移 → 日志回流建术语草稿 —— **八腿主链 2026-09-23 收（DEV-0020），实现层改判**：按 §14-6 的 owner 裁定留在 vitest `cli` 项目（`apps/cli/test/e2e-flow.test.ts`，真 serve 子进程 + 真 HTTP + 真 CLI 退出码；`apps/cli/**` 受 R4 边界约束，测试也不 import server），Playwright 因此不承担主链
- [ ] 冒烟 ×3：E2E-SMOKE-01 导入→复制 / 02 术语搜索→TERMS.md / 03 向导三步 —— 转**人工录屏/截图**（P1.1 若引入 Playwright 再收，见 §14-6：合成点击拿不到 transient user activation，复制类动作在自动化下必然被拒）
- [x] 干净环境演练（清空 HOME 沙箱全流程计时录屏，onb-1 口径）—— **自动化半边 2026-09-23 收（DEV-0020）**：`docs/devlog-evidence/DEV-0020/publish-walk.mjs` 走 `npm pack` → 空目录安装 → 只跑装出来的 bin，**45 断言全 PASS**（T9c 补两支 npm 装包探针后 41 → 45；用户侧 4.3 s / 构建+pack+装包 27.6 s 双数字，C-74 口径；秒数是瞬时量，同路径两轮实测 1.0–4.3 s 与 27.6–52.0 s）；录屏仍属人工半边
- [x] README 重写用户视角（快速上手/架构一图/FAQ/遥测披露段）—— **2026-09-23 收（DEV-0022）**：九节按「装包的人怎么读」重排，`npx` 三步 + 九文件产物表 + 架构一图 + adapter 表 + 数据落点 + 隐私与网络行为（默认关 / 三类白名单 / 关闭即零外联）+ FAQ + 已知局限；计数与产物尺寸取干净沙箱实测（109 词条、TERMS.md 25,464 B、cli.js 3.57 MB）
- [x] `pnpm publish --dry-run` + tag `v0.1.0` + 发布说明（含已知局限：单项目单包、无 update 清理）—— **2026-09-23 收（DEV-0022）**：三路 dry-run 全 rc=0（npm 默认 / npm 显式 npmjs / pnpm `--no-git-checks`），36 文件 1.1 MB、解包 4.9 MB；**默认注册表是 npmmirror 镜像**（C-88），发布须显式 `--registry=https://registry.npmjs.org`；发布说明 `docs/release-notes/v0.1.0.md` 带「测量口径」表与「本版未验证」段；tag `v0.1.0` 本地未 push，真实 `npm publish` 待 owner
- [x] retro 复盘会 → 首批回流 ≥3 条资产入库（飞轮 dogfooding 第⑤步实证）—— **2026-09-23 收（DEV-0022）**：`docs/devlog-evidence/DEV-0022/retro.md` 按自家 `复盘流` 四阶段（`retro-1-1…retro-4-1`）复盘 T1–T9，决议表 8 条按修/缓/记录 + P0/P1/P2 定级；**回流 5 条词条入种子（104 → 109）**，`seed:check` 与 `UT-SEED-02` 双绿

**验收-测试映射**：CI 五闸全绿（lint/unit/integration+cli/e2e/golden+seed:check+bundle:check）+ 演练录屏归档 + DoD §13。`ci.yml` 的**步骤**清单自 T8f 起为 Lint / Typecheck / Test / Seed check / Bundle check 五步（三平台各一遍）。
—— **实测收口 2026-09-23 17:50**：run `35844980582` @ `3e852c2` 三个 `verify` job 全 success、五步各一遍；用例数按平台不等（macOS / ubuntu **381 passed**，windows **378 passed + 3 skipped**，跳过的三条是 win32 语义不适用的 `CLI-SEC-01b`/`CLI-SEC-04` 符号链接逃逸与 `CLI-CFG-03` 0600 权限位）。`E2E-FLOW-01` 三平台 4.40 / 6.11 / 9.34 s。演练**录屏**仍属人工半边（§14-6 / 任务 #59）。

### 映射总账与数量对齐（design §13）

| 层 | 本文分配 | design 目标 |
|----|----------|------------|
| UT（VERSION/CASCADE/FTS/SEED/ENTRYNO/COMPOSE/TERM/MIGRATION/TELEMETRY/LINT…） | ≥ 120（各 repo 算法逐条） | ≥120 ✅ |
| IT（API/IMPORT/PACK/PROJECT/FLOW/TASK/DEVLOG/REFLOW/SKILL/ERR…） | ≥ 60 | ≥60 ✅ |
| CLI（SYNC/DIFF/SCAN/SERVE/JSON/SEC…） | ≥ 25 | ≥25 ✅ |
| E2E（FLOW-01 主链 + SMOKE×3 + ONBOARD/FLYWHEEL/TELEMETRY） | 1 主链 + ≥7 | 1+3 ✅ |
| GOLDEN（G1/G2/G3 全产物字节断言） | 3 夹具 | 3 ✅ |

---

## §10 日历总表（6.5 周 = 31.5 人日 + 显式缓冲 1 = 32.5）

| 周-日 | 任务（人日） | 当日要点 |
|-------|--------------|----------|
| W1D1 | T1（1.0） | 仓库落地 D16 → 脚手架 → shared schemas |
| W1D2 | T1（0.5）+ T2（0.5） | CI 三平台首跑 → DB 封装起步 |
| W1D3 | T2（1.0） | migrations + FTS 触发器 |
| W1D4 | T2（1.0） | repos + seed 骨架 → T2 验收 |
| W1D5 | T3（1.0） | 提示词 API + importers 起步 |
| W2D1 | T3（1.0） | 八端点 + 集成测试 |
| W2D2 | T3（1.0） | Library 页组件 |
| W2D3 | T3（1.0） | 版本/diff/导入导出 → m1 §7 全过 |
| W2D4 | T4（1.0） | terms API + 页面；**词条批次 A 起草**（§11） |
| W2D5 | T4（1.0） | 批次 B + seed:check(60) → T4 验收 |
| W3D1 | T5（1.0） | 模板/项目 API |
| W3D2 | T5（1.0） | 看板/日志/勾选 |
| W3D3 | T5（1.0） | 回流端点 + injection-status |
| W3D4 | T5（1.0） | Skills 扫描 + 3 模板常量 → T5 验收 |
| W3D5 | T6（1.0） | composer 骨架跑通（仅 M1 素材即可，tasks §1） |
| W4D1 | T6（1.0） | fingerprint/validate/bundle |
| W4D2 | T6（1.0） | 六 adapter + registry |
| W4D3 | T6（1.0） | packs API + 409 语义 |
| W4D4 | T6（1.0） | PackWizard UI；**prompts 批次 1 起草**（§11） |
| W4D5 | T6（0.5 收尾）+ T7（0.5） | **真机复核** + golden 三夹具进 CI → T6 验收；CLI config 起步 |
| W5D1 | T7（1.0） | serve + scan |
| W5D2 | T7（1.0） | sync 五状态机 |
| W5D3 | T7（1.0） | diff + 安全用例集 |
| W5D4 | T7（1.0） | 遥测 + D13 询问 + --json 契约 → T7 验收 |
| W5D5 | T8（1.0） | 模板迁 seed + 阈值切换；**prompts 批次 2 + 词条批次 C** |
| W6D1 | T8（1.0） | 词条批次 D 补至 100+ + 审校 |
| W6D2 | T8（1.0） | 预置包 + 向导三步 |
| W6D3 | T8（1.0） | 飞轮面板 + 遥测卡 + 设置页 → T8 验收 |
| W6D4 | T8 收尾（0.5）+ T9（0.5） | onboarding 验收扫尾；E2E 主链搭建 |
| W6D5 | T9（1.0） | 冒烟 ×3 + 干净环境演练 |
| W7D1 | T9（1.0） | README 重写 + publish dry-run + tag v0.1.0 + retro 回流 |
| W7D2 | **显式缓冲（1.0）** | 偏差吸收；无偏差则提前 dogfooding（真实项目注入） |

---

## §11 内容生产 SOP（D14：AI 起草 + owner 审校 ≈ 2-3 人日）

### 11.1 批次计划

| 批次 | 时间 | 内容 | 门槛 |
|------|------|------|------|
| terms-A/B | W2D4–D5 | 2×30 条 = 60 条 | 变体③首发门槛；附录 B 10 条必须含 |
| terms-C/D | W5D5–W6D1 | 2×20+ 条补至 ≥100 | 正式门槛 |
| prompts-1/2 | W4D4 / W5D5 | 2×10 条 = 20 条 | §11.2 构成要求 |
| flow-templates | T5 随代码 → T8 迁 seed | 3 套 | 阶段定义照抄 seed-content §3.3（冻结对象，逐字） |

### 11.2 AI 起草 prompt 模板

**terms 批次模板**（每批一次调用，输出 JSONL）：

```
你是 OpenVibe 术语库的内容起草器。产出 {n} 条 vibe coding 高频术语词条，输出 JSONL（每行一个 JSON 对象），字段：
{ "zh": "中文名(≤100)", "en": "English(≤100)", "aliases": ["别名/缩写/常见误写"],
  "definition": "定义，中文 ≥20 字，Markdown", "example": "用法示例(可选，目标 ≥60% 条目有)",
  "tags": ["从受控词表选 1-2 个"] }
硬性规则：
1 zh/en 至少一项；2 definition 中的表格符 | 写作 \|；
3 tags 只能取：基础概念/方法论/工具平台/质量工程/协作流程/风险陷阱/提示工程/数据与存储；
4 不得与这 10 条重复（附录 B 基线）：氛围编程/提示词/技能/规则文件/上下文窗口/规则漂移/规格驱动开发/幻觉/检查点/检索增强生成；
5 本批主题聚焦：<批次主题，如「提示工程」「工具平台」「质量工程」…按受控词表轮转>；
6 source/status 由系统写入，不要输出。
```

**prompts 批次模板**：

```
产出 10 条精选提示词（JSONL），字段对齐 Prompt 实体（title/description/content/tags/folderPath="/精选"/platformMarks/useAs）。
构成硬性要求（整库 20 条口径，本批按清单分配）：
≥6 条 useAs=rule（行为规则，组包即用；content 不得含 {{变量}}）；
其余 reference 任务型，≥8 条含 {{变量}}（合法名 [a-zA-Z_][a-zA-Z0-9_-]*）；
平台标记 claude-code / cursor / generic 各 ≥4 条（整库口径）；单条 content ≤2KB。
本批主题清单（逐条对应，不得偏题）：<从 seed-content §3.4 的 20 主题清单切 10 个>
```

### 11.3 审校清单（owner 逐条过，每条约 30-60 秒）

**terms**：□ zh/en 至少一项 □ definition ≥20 字且准确 □ aliases 覆盖常见缩写 □ tags ∈ 受控词表 □ `|` 已转义 □ 与既有词条不重复/不冲突（搜索确认） □ example 可读（有则）。
**prompts**：□ 主题与清单对应 □ rule 类无变量 / reference 类变量合法 □ content ≤2KB □ 平台标记合理 □ 中文表述（A1）。

### 11.4 seed:check 门禁与阈值切换

- T4 期：`terms ≥ 60 / templates = 3 / prompts = 0`；**T8a-1（a6f5cb1，2026-09-23）已切正式 `100 / 3 / 20`**（阈值常量在 scripts/seed-check.ts，见 DEV-0019），并给 prompts 侧补 §3.4 构成配额（C-57）。
- 校验内容：schema（zod 复用 §3.11）+ 数量 + 受控词表 + 模板阶段名与 seed-content §3.3 逐字断言 + `|` 转义检查。

### 11.5 60→100 热补演练（发布后动作，同时是种子升级机制的公开演示）

```
1 发布时若词条=60：发布说明如实标注「词条库热补中」
2 批次 C/D 合入 content/seed → 发 patch 版本
3 用户侧：文件 contentHash 变化 → seed_registry 不匹配 → 逐条并入（用户改过的跳过）
4 记 DEV_LOG：对比升级前后 SELECT count(*) FROM terms WHERE source='openvibe-seed'
5 传播素材：以自身热补过程演示「种子幂等升级」机制（差异化能力的活案例）
```

---

## §12 风险与触发点（做的时候回看）

| 触发信号 | 回看 | 预案 |
|----------|------|------|
| Cursor/Claude 规则格式又变 | design §8（A 级） | 只改对应 adapter + registry；golden 快照锁定其余产物不变；走 §0.3 A 级流程 |
| FTS 中文召回差评 | design §12 | LIKE 全表兜底在线；P2 评估分词器替换 |
| sync 状态机分支漏测 | m6b §4/§7 + 本文 §6.2 | 以 §7 验收行为回归集；新分支先补夹具再改码 |
| 词条产出慢于排期 | §11 批次 | 60 条发布 + 追补（变体③，热补即演示） |
| 工期偏差 > 缓冲 1 人日 | tasks §3 变体备案 | 按备案①②③④顺序（国内 adapter 后移为第④） |
| **dogfooding 两周证伪线触发（D15：工作台使用 <10 次或 DEV 日志 <5 条；**起点 = `npm publish` 成功当日**，队列 ④ owner 2026-09-27 裁；两条腿的可测性见队列 ⑱）** | m5 / PRD 3.2-M5 | 启动 M5-lite：工作台 UI 后移 P1.1，模板/清单仅经 CHECKLIST.md 注入；记 DEV_LOG 并排 P1.1 |
| AI 词条质量不达标 | §11.3/11.4 | seed:check 是唯一硬闸；不过则缩小批次人工重写 |

观测升级口径：CI 红 / 验收映射行 fail → 当日修；C 级变更 → 随 DEV_LOG；B/A 级 → 先 owner 后动手。

---

## §13 DoD（MVP 完成定义）

1. specs 八份（m1/m2/m3/m5/m6a/m6b/seed/onboarding）验收标准**逐条**通过——核对法 = 本文 §9 各映射表全行 pass（人工项录屏/截图归档 DEV_LOG）。
2. CI 五闸全绿：lint / unit / integration+cli / e2e / golden + seed:check + bundle:check。
3. 干净环境 ≤3 条命令 / ≤5 分钟冷启动演练通过（W7D1 计时录屏）。
4. 标准包契约与 adapter 清单与 design §7/§8 **零偏差**（golden 三夹具背书）。
5. `v0.1.0` 发布 + dogfooding 复盘回流 ≥3 条资产入库。
6. §0.3 变更痕迹核查：P1 期间所有 A/B 级变更均有 spec 版本行 + DEV_LOG 对应记录；C 级变更在 DEV_LOG「C 级变更」小节可枚举。
7. **冻结契约凭据必须带 ref 锚**：登记「A 级未触碰」时，`git diff --name-only tests/golden/` 这种**不带 ref** 的形态比的是工作树 vs 索引，本轮改动一旦提交就必然返回空行——它是**空转凭据**，不能当凭据用。必须写成 `git diff --name-only <BASE>..<HEAD> -- tests/golden/ content/seed/` 并给出 0 行（`<BASE>` = 分支分叉点或任务起点，与登记同一处写明）；工作树态那条只作补充。（反例见 `DEV_LOG [DEV-0027]` 修复轮 M-6：P1.1 T10 收口时按计划原文登记的就是前者，实测整支 30 个提交零触碰是靠 ref 锚形态才证成的。）
8. **计数的三条成规（口径 / 出处 / 单源）**：任何写进文档的用例数、体量数、比率，必须 ① **与口径同处**——说清数的是哪个集合（文件支数 ≠ 具名 id 数 ≠ 描述命中行数；跨文件族并报时必须分别标注，禁止把两个相反口径写成一对数字）；② **与采样 sha 同处**——计数快照即过期源，引用者据此判断是否需重跑；③ **单源**——同一笔账只允许一处推导，其余位置指向该处，不得各处重推。**可 grep 检查项**：文档里出现的每个「N 支 / N 例」，同一句或同一表格行内须能找到口径词与 `it(` 集合名或文件路径。反例两条见 `DEV_LOG [DEV-0027]` 修复轮 M-4（13/16 与 15/14 两个源推同一笔账）与 I-1（`CORE-SIZE-*` 数成文件支、`SRV-EST-*` 数成具名 id）。
9. **测试支数与具名上界不入正文，只以取数命令入正文**：凡**陈述现状**的句子（任务行、验收行、规格「现测」段、README 的测试规模句），不写 `XXX-*` 族的**文件支数**与**具名上界**（如「29 支」「具名 `01..05`」「住在 17 支里」），改写取数命令——文件支数 `grep -cE "^[[:space:]]*it[\.(]" <测试文件>`、具名 id `grep -oE "<族名>-[0-9]+[a-z]?" <测试文件> | sort -u`，两口径不得混写（口径定义见第 8 条①）。命令的**单源**放在 `docs/tasks.md` §2b 的 T10 验收行，其余位置指向该处。**为什么第 8 条不够**：第 8 条只要求「与采样 sha 同处」，而带 sha 的计数**半衰期是天级**——`986689e` 那次现测的「29 / 6 / 17」被随后三笔各自作废（`bb7d671`、`be0c885`、`5444450`，逐笔对应关系见 `docs/tasks.md` T10 验收行），三笔都只动测试不动文档，**sha 只能标明它何时错，拦不住它变错**。**豁免两类**：① 门禁的**运行时输出数**（`pnpm test` 打印的 `450 passed / 48 files` 是实测不是抄写，登记时须带采样时刻、树态与平台）；② `DEV_LOG` 登记行与规格版本链里**记录「当时测得」的历史行**——日志不回改，历史数按原样留着，但**不得把历史数复用为现状口径**，引用时写「`<sha>` 时测得 N，现值以命令为准」。**可 grep 检查项**：`grep -rnE '[0-9]+ (支|例)' --include='*.md' README.md CONTRIBUTING.md docs/*.md docs/specs/*.md | grep -vE 'grep|sort -u|it\['`——本条给的是**候选清单，不是恒零闸**：2026-09-27 08:0x 实测 14 行命中，其中 `docs/PRD.md`「G3 支撑」、`docs/decisions.md` ⑰ 行「09-23 那支树」是中文量词假阳性，其余须逐条判「现状 or 历史」。**反例（本轮改正的两处落点）**：`docs/dev-plan.md` §15.2 的 `openvibe clean` 格写死「`CLI-CLEAN-*` 现测 29 支 + `retirement.test.ts` 8 支」；`docs/tasks.md` T10「预览体量与 token 估算」实现行写死「`CORE-SIZE` 段 6 支 / `SRV-EST-*` 具名 6 支住在 17 支里」——后者的同族说明 `[DEV-0045]` 当时**只改在验收行、实现行漏改**，正是 `[DEV-0046]`／`[DEV-0047]` 立的「同一断言按全仓落点扫」的又一处。

---

## §14 遗留评审建议（原文保留，**2026-09-23 已全部裁定 → 结论见 §15**）

> 本节六项是 MVP 收口时挂起的未裁定项。owner 指令「开始 P1.1」后逐项裁定，本节文字不再作为待办入口，只作追溯；**判读以 §15 裁定表为准**（含对 §14-1 原口径的实测否证）。

1. **组包预览 token 估算**：preview 返回各文件 chars/4 估算与总量告警（借 Rulix，约 0.5 人日）。
2. **`openvibe clean`**：按 lock 清除注入文件 + 备份，补全「零锁定」的退场半边（约 0.5 人日，竞品全部没有）。
3. **CLAUDE.md `@import` 受管子文件 spike**：若 Claude Code 支持 `@file` 导入，主规则可移至 `.openvibe/pack.md` 受管、CLAUDE.md 只留一行导入——把整文件 DRIFT 摩擦降一个量级（30 分钟真机验证）。
4. **m6b 单包边界声明**：lock 单包结构下「一项目一包」假设显式写进 spec 边界节（B 级变更一行）。
5. **发布执行清单**：渠道帖（V2EX/掘金/知乎）、demo GIF/asciinema、社群入口、awesome 清单 PR——当前 tasks T9 只有 README 重写，无传播执行项。
6. **Playwright E2E（design §13 原口径）**——**owner 已裁定：T9 不引入，延至 P1.1 评估（2026-09-23）**。裁定依据是**当时**的实测证据面：本仓无 jsdom（该前提 2026-09-26 起失效：owner 裁 ⑪ 建了 vitest `web` project，见 `DEV_LOG [DEV-0033]`；**本条裁定与理由不改写**，日志不回改），T8 三段入库驱动器（`onboarding-walk.mjs` 29 断言 / `lazy-chunk-walk.mjs` 29 / `telemetry-egress.mjs` 17）零 `Input.dispatchMouseEvent`、零 `Input.dispatchKeyEvent`、零 clipboard，仅 2 处 `Runtime.evaluate` 内的合成 `b.click()`（`onboarding-walk.mjs:201`、`lazy-chunk-walk.mjs:265`），即其证据类型是「navigate 之后读 DOM」而非真实用户动作。因此合成 `b.click()` 拿不到 transient user activation，`navigator.clipboard.writeText` 在自动化下必然被拒 → `E2E-SMOKE-01 导入→复制`、`02 术语搜索`（受控 input 中文输入 + debounce）、`m5-5 @dnd-kit 看板拖拽` 三处**在 v0.1 由人工录屏/截图承担**，CDP 驱动器只作渲染与数据面回归；发布说明与 DEV_LOG 须如实标注「自动化证据不含真实点击/复制/拖拽」。P1.1 若引入，只承担冒烟 ×3、仅 chromium、仅单 OS，主链 `E2E-FLOW-01` 留在 vitest `integration`+`cli`。

---

## §15 P1.1 迭代版（2026-09-23 owner 开档 · **本轮产出为规格，不含实现**）

**开档口径**：owner 指令「开始 P1.1」，本轮产出形态 = 先裁范围 + 补 spec。按 §0.4 第 4 条 No-spec-no-task，本节是 P1.1 各项进入实施的唯一入口闸；只有裁定表里**落点已写出且标 ✅ 已写规格**的行才允许开工。

### 15.1 范围裁定表（候选 13 项 → 四类判决）

| 判决 | # | 项 | 出处 | 落点与规格状态 | 人日 |
|---|---|---|---|---|---|
| **进 P1.1 · T10 退场与信任** | 0 | 八份 spec 版本行痕迹基线 | 15.5-1 撞出的 DoD⑥ 假绿 | `docs/specs/*.md` 头部 · ✅**本轮已写** | 0.3 |
| | 1 | `openvibe clean` | §14-2 | `m6-cli-injection.md` FR-6 + §6.10 + 验收 10a–10k · ✅已写（**spec 版本以该文件头部 `\| 版本 \|` 行为单源**，本格不再抄版本号——2026-09-26 体检实测此格曾写死 `v1.5` 而 spec 已 `v1.7`，见 `DEV_LOG [DEV-0038]`）· ✅**已实现（2026-09-24 T2–T5）**：族 `CLI-CLEAN-*`（`apps/cli/test/clean.test.ts`；**支数与具名上界不入正文**，§13-9，取数命令单源见 `docs/tasks.md` §2b 的 T10 验收行。本格原写「现测 29 支」是**现状陈述**，已被 `5444450` 补 `CLI-CLEAN-13` 作废 ⇒ 按本条退出正文；三平台口径不变：win32 有 `it.skipIf(IS_WINDOWS)` 门控支（本族为 `06e` 符号链接逃逸），**跳过 ≠ 通过**；**2026-09-24 21:49 起这不再只是应然**：run `36007700628` @ tip `787eb4c` 三平台实跑，darwin/linux 各 29、win32 28 实跑 + 1 skip ⇒ 见 §15.6 DoD ①（已勾，带 sha）与 ③（半收，留白是 win32 skip 与三条人工腿））+ core 侧 `retirement.test.ts`（同属退场分类器，支数不入正文，§13-9） | 1 |
| | 2 | 预览体量与 token 估算 | §14-1（**原 `chars/4` 口径已被实测否证**，见 S0） | `m6-standard-pack.md` FR-6 + §5 + 验收 8–12 · ✅已写（**spec 版本以该文件头部 `\| 版本 \|` 行为单源**，同上一格的理由；此格曾写死 `v1.3` 而 spec 已 `v1.4`）· ✅**已实现（2026-09-24 T6–T8）**：`CORE-SIZE` 与 `SRV-EST-*` 两族**支数不入正文**（§13-8；文件支数与具名 id 两口径的取数命令单源在 [tasks.md §2b](./tasks.md) 的 T10 验收行）——本格原抄「现测 6 支 = 文件支数（具名 `CORE-SIZE-01..05` 五支 + 一支**无名**负向腿）+ `SRV-EST-*` 具名 6 支（在 `packs.api.test.ts` 的 17 支里）」，那组数实测于采样 sha `986689e` 且**本格当时不带 sha**（同族问题在 §15.6-1 已修，这里是漏搜的第二处落点），此后分别被 `bb7d671`（补 `CORE-SIZE-06` ⇒ 6→7）与 `be0c885`（`packs.api.test.ts` 加第 18 支）作废；`SRV-EST-04` 承 FR-6.4 权威数；Web 展示四处**已有 DOM 断言**（2026-09-26 队列 ⑪ `[DEV-0033]` 落地：vitest 第 4 个 project `web`（jsdom）+ `apps/web/src/components/packs/PackPreviewPane.test.tsx`，六次变异反证全部命中，取数 `npx vitest --project web --run`。本格原写「只有静态闸，无 DOM 断言（owner 裁定不引入组件测试基建）」——那条裁定已被 ⑪ 自己作废，此处是第三层复核抓出的**状态声明腐烂**，与前两处的数字腐烂同因） | 0.5 |
| | 3 | 一项目一包边界声明 | §14-4 | `m6-cli-injection.md` §6.10 · ✅已写 · ✅**以 Task 1 的 §6.10 修正收口（2026-09-24；无实现项，规格随实况：换包是合并保留而非整体重写）** | 0.1 |
| **进 P1.1 · T11 发布运营** | 4 | 三条冒烟的真实输入证据 | §14-6 | ✅**探针已跑（2026-09-23）：三条判据在有头 Chrome 全过；无头侧判据①不成立且属环境限制** ⇒ 前置解除，证据形态定为「有头裸 CDP 真输入跑判据①，无头只跑②③」，驱动器已入库（`docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs`）。本轮按 D21 改的 Playwright 口径（不引入 + 三条冒烟标未验证缺口）是裁定本身，不随探针结果回退。结论单源见 §15.4-S2；**2026-09-24 三条场景已各自接上该骨架并跑通（有头 FAIL=0 SKIP=0，两支日志各 26 断言），数字单源见 §15.4b** | 0.5–1 |
| | 5 | CLAUDE.md `@import` 受管子文件 | §14-3 | S-1 spike 卡 · ✅**探针已跑完**（结论见下） | 0.5 |
| | 6 | 发布传播执行清单 | §14-5 | `tasks.md` 新 T11 组勾选项（非产品功能，不占 §0.4 八段式闸）· ✅已立 | 0.5 |
| **归 P2** | 7 | 暗色主题 | `:754`「P1.1 评估暗色」 | 前置是**设计 token 化重构**：实测 `apps/web/src/index.css` 的 `@theme` 只有 `--color-brand`/`--color-brand-soft` 两个 token，`.html-md` 内 30+ 处字面 hex，全仓 `dark` / `prefers-color-scheme` / `[data-theme]` **零命中**——不是加 class，是重构，量级不估。**→ 已交付（2026-09-30）**：token 化与暗色双源随 `453a535` 落地，规格补在 `specs/theme.md`（本行前面那段「实测」是 09-23 时点现状，按日志不回改的原样留着）；`prefers-color-scheme` 至今零命中，**系统跟随仍是未做面**（`theme.md` §6.7） | — |
| | 8 | **遥测增长看板**（基于埋点计数的对外公开页） | `tasks.md §3 变体备案` ② | 需新 spec（横切 M1/M5 + design §11.5 Worker 计数端点），未开。**本项原名「飞轮遥测面板」是同名异物，已改称**：MVP 已交付的是**本地**飞轮五项卡片（`apps/web/src/components/onboarding/FlywheelCard.tsx` + `GET /api/stats`，规格 `specs/onboarding.md` FR-3，`apps/server/src/routes/settings.ts:146` 注释明写「全本地 SQL 聚合，不参与遥测」），归 P2 的是**用遥测计数的对外看板**——两者不同物，勿再混称（见 15.5-6） | — |
| | 9 | **M4 技巧库** | `PRD.md` 3.2-M4 标 P1 优先级 | **PRD 与计划间口径断裂**：`tasks.md` / `dev-plan.md` 全文零次提及 M4，`docs/specs/` 无 m4 spec——既未实现也未被显式裁掉；且 PRD **自身**三处冲突（3.2-M4 标 P1 vs 3.3「M4 进 Phase 2」vs 第 8 章 P2 行）。**已裁并勘误：D22**（2026-09-23，PRD v0.1.5 就地改标题为「（P1，Phase 2）」+ 勘误留痕，第 8 章 P2 行加注）；进入实施前仍须补 m4 spec。**→ m4 spec 已立（2026-09-30 `DEV-0074`）**：`docs/specs/m4-playbook.md`，八段式八节齐全 + FR-1–FR-10 + 新测试族 `UT-PB-* / CORE-PB-* / IT-PB-*`，**但版本行是 v0.9 草案不是 v1.0**——§8.2 七处待裁（① 产物形态独立文件 vs 主上下文新节、② 书脊第 8 字、③ 三处门槛数值、④ seed 自然键、⑤ 只选技巧能否成包、⑥ 是否进 `default` 演示包、⑦ 指纹与 lock 会不会变）未闭合，按 §0.4 第 1/3/4 条**不构成开工依据**；spec 自身「关联任务」格写 **无**，下一空号 T12 须待七裁落地再申请。**→ §8.2 七裁已于 2026-10-01 到账、spec 升 v1.0（`[DEV-0085]`）**：①③④⑤⑥⑦ 全按表内推荐采、② 按推荐采并**判不作废**（作废声明的前提经提交树现测否证）；③ 留两处未覆盖（`antiPractice` 无上限、`scenario` 单位含糊），已写进 spec 的裁定里等实现前收口。本行「不构成开工依据」的后半句此刻仍成立——**七裁闭合只解掉闸的第一道**，T12 仍未申请。**→ §0.4 入口闸的两步已于 2026-10-01 落地（`[DEV-0087]`）⇒ 本行改判 ✅ 已写规格**：T12 正式申请于 `docs/tasks.md` §2c，spec 头部「关联任务」格由 **无** 同步为 **T12**，三处同一笔落库。上一句「T12 仍未申请」是七裁到账那轮的时点话，按本行的箭头序列原样留着，由本句接住。**开工仍带 spec 已写明的三道前置**（它们是 §8.2 / §7 里既有的条件，不是我新加的第四道闸）：① ③ 的两处数值必须 owner 补（`playbookAntiPracticeMaxBytes` 无值、`playbookScenarioMax` 的单位在「KB」与「字符」之间含糊），替他补 = 静默选单位；② FR-7.3 的推断转正必须先跑（两个只差一条技巧的包，指纹必须不同且 lock 差一条 `PLAYBOOKS.md`），跑平即 fail 且 FR-8 不开；③ FR-8 拆闸属 **A 级契约面**，凭据形态已在 §7.4 写死（golden `G1/G2/G3` 全绿 + `git status -- tests/golden/` 零改动 + 带 ref 的 `git diff --name-only <拆闸前 sha>..HEAD -- tests/golden/ content/seed/` = 0 行 + 四处孤儿文档/断言同批改判）。按本节开档口径（「只有落点已写出且标 ✅ 已写规格的行才允许开工」），本行现在可读作**允许开工**，开的是前置①未挡的那几面（迁移 0006 的 DDL 与 FTS 三触发器、`sortForMd` 码点序、`PLAYBOOKS.md` 渲染），`LIMITS` 那三条等 ① 闭合。**→ 2026-10-01 前置① 闭合（`[DEV-0088]`，owner 裁「四段全按字节族、`antiPractice` 2048 B」）**：上句「① 的两处数值必须 owner 补」已答完，本行可开的面由「DDL／FTS／`sortForMd`／渲染」扩到 `schemas/playbooks.ts` 的 `LIMITS`（四值与键名单源在 m4 spec §3，本行不复制）。**前置②③ 不因本裁消失**：② 仍是那条必须先跑的推断转正断言，③ 是 FR-8 的 A 级凭据形态——而 ㉘ 那处 A 级红线今日也裁了「三处同批全改」，授权在 PRD **D25**、落地另起一笔，与本行的 M4 开闸是两条路，别混读成「M4 现在可以碎契约」。本行前面那段「全文零次提及 M4、`docs/specs/` 无 m4」是 09-23 时点现状，按日志不回改的原样留着 | — |
| | 10 | `@import` 受管子文件**落地** | S-1 结论 | 可行，但属 **A 级契约变更**（文件集合改变 → golden 三夹具全量失效），须走 `schemaVersion +1` 独立流程，不并进 P1.1 | — |
| | 11 | 一项目多包叠加 | 本轮写 §6.10 时显式化 | 需 lock 结构升版，A 级 | — |
| **判作废（文档陈旧，不再排期）** | 12a | 「首启向导后移 P1.1」 | `tasks.md §3 变体备案` ① | **MVP 已交付**：`docs/specs/onboarding.md` + `onboarding-walk.mjs` 29 断言 | — |
| | 12b | 「国内三 adapter 后移 P1.1」 | `tasks.md §3 变体备案` ④ | **MVP 已交付**：`packages/core` adapter 表含 `codebuddy`/`trae`/`minicode`；DEV-0020 走查实测 `CODEBUDDY.md`/`MINI.md`/`.trae/rules/openvibe.md` 各约 14.5 kB 落盘 | — |
| **条件挂起（不占名额）** | 13 | M5-lite（工作台 UI 后移） | `PRD.md` 决策表 **D15** 行 | 起点已裁（队列 ④，owner 2026-09-27）：**窗从真发布 = `npm publish` 成功当日起算两周**，推 tag 不算。07:43 复测 `npm view openvibe-cli --registry=https://registry.npmjs.org version` 仍 **404** ⇒ 窗未开、现在无法判定；触发即插队 P1.1 并挤掉 T11 非必须项。**本格原写的凭据「tag `v0.1.0` 仅本地」已于 2026-09-26 16:20 作废**（tag 首推远端，`git ls-remote --tags` 现测 deref 到 `5f7fd3c`），指针 `PRD.md:509` 亦按「行号不入正文」换成行名 | — |
| **归 P2 · 三裁已落（2026-10-01）** | 14 | **M7 团队协作**（本表原无该行——`grep -c 'M7' docs/dev-plan.md` 于 HEAD `7e8d82a` 与本笔工作树均 **0** 命中：M7 此前只活在 PRD 侧，计划文档连「欠一条裁定」都没记） | `PRD.md §3.2-M7` 三行能力（用节锚；`docs/PRD.md` 行号随并行会话漂移）+ PRD 附录 D **D23** | **前提裁定闭合、spec 升 v1.0**：owner 三裁 P-1=B+C / P-2=c / P-3=ii，落地 `docs/specs/m7-team-collab.md`（八段式 FR-1–FR-7 + §7 十一条验收）与队列 ㉓。**仍不得读成已开工**：① ~~`docs/tasks.md` 的 T13 行未登记~~ **已登记**（2026-10-01 `DEV-0078`，落 `docs/tasks.md` **§2c·T13** 三条 `- [ ]`；复跑判据 `grep -c 'T13' docs/tasks.md` 由 **0 → ≥1**，T12 仍故意留空）；② spec §8.2 残留两项待裁（评审对象粒度 / ii 的目的端），后者若翻成出网回传即 **A 级**、整段隐私边界重写；③ 本行只登记规格状态，不承诺人日——同第 9 行 M4 的纪律 | — |

**T10 + T11 ≈ 3.4 人日**（含缓冲 ≈ 4 人日 = 单人一周）；第 4 项的工期不再随探针结论浮动——探针已跑完，结论与「无头拿不到判据①」这条限制见 §15.4-S2。

### 15.2 版本与兼容口径

- **阶段名 ≠ 版本号**：P1.1 是本文的阶段编号；发布物按 semver 走 **v0.2.0**——新增 CLI 命令与新增响应字段都是向后兼容的新增，minor 级。**2026-10-02 就地修一处与 PRD D26 的冲突**：本行原写「走 v0.2.0 **而非 v0.1.1**」，而 **D26** 已裁「发布树从 `main` 当前 tip 切 **v0.1.1**、发 `openvibe`、tag `v0.1.0` 不移动」。相容的读法是**两个版本号各管一件事**：**v0.1.1 = 过渡发布**（只为解除「npm 上一版都没有」这个阻塞，内容 = D26 裁定时点的 `main` tip）；**v0.2.0 = P1.1 余项 + PRD 第 10 章 RF0–RF5 重构的合并发布**。原句那个「而非」把两者读成互斥，是**漂移不是裁定**（该行未被任何 D 号授权过 ⇒ C 级就地修；PRD §10.6 的 D26 接口行记了这笔，分析文 §8.1 那 10 行漂移表**漏了它**）。
- **不触 `DEFAULT_PACK_VERSION`**：T10/T11 全部改动都不写进 `openvibe.pack.json`、不进导出目录（`m6-standard-pack.md` FR-6.6 已就此设机器断言），故 default 包指纹不变、已注入项目不会集体报 DRIFT。**P1.1 期间一旦要动 `content/seed`，必须同步升 `apps/server/src/lib/default-pack.ts` 的 `DEFAULT_PACK_VERSION` 并写进发布说明**——P1 期间「无人持有旧 lock」的豁免已不成立。
- **前置关系**：P1.1 的实施**不以 v0.1.0 已发布为条件**（规格与 T10 代码可先行）；但 T11 的冒烟归档与传播清单**以真发布为执行条件**。owner 手上未收的发布四步（真 `npm publish --registry=https://registry.npmjs.org` / `gh release create` / 推 tag / 种子人工审校）不在本节范围。

### 15.3 验收-测试映射（接 §9 表式）

| 组 | 验收出处 | 测试 ID 与形态 | 人日 |
|---|---|---|---|
| clean-a…k | `specs/m6-cli-injection.md` §7.10 a–k（含 f2 / e2 / e3） | `CLI-CLEAN-*`（`apps/cli/test/clean.test.ts`，临时项目目录 + `--json`，三平台 CI；**本行不抄连续区间**：`01..10` 的写法在 29 支时代就已失实——实落含 `06b/06d/06e/12b` 等字母后缀，现测具名 id **30** 个、编号排到 `13`，取数 `grep -oE 'CLI-CLEAN-[0-9]+[a-z]?' apps/cli/test/clean.test.ts \| sort -u`） | 1 |
| 估算·纯函数 | `specs/m6-standard-pack.md` §7.8 | `CORE-SIZE-01..05`（`packages/core/src/pack/size.test.ts`，不依赖 DB/HTTP） | 0.2 |
| 估算·API | 同上 §7.9–7.11 | `SRV-EST-*`（server 集成：真 SQLite + 真 preview；**具名上界与支数不入正文**——本行原抄 `SRV-EST-01..03`，而 `SRV-EST-04` 早已作为 FR-6.4 权威数的驱动器存在，抄一次即落后一次。取数 `grep -roE 'SRV-EST-[0-9]+[a-z]?' apps/server/test \| sort -u`） | 0.2 |
| 估算·UI | 同上 FR-1.5 + FR-6.4 | 人工截图归档 → `docs/devlog-evidence/DEV-00NN/`（黄条出现 + 导出不被阻断两帧） | 0.1 |
| 契约未受影响 | 同上 §7.12 | 既有 golden 三夹具 + `bundle:check` 复跑 + `git diff --name-only tests/golden/` 为空——**这条按 §13 DoD 第 7 条读作工作树补充，不是凭据**：不带 ref 时它比的是工作树 vs 索引，任务一提交就必然 0 行。A/B 分级结论的凭据是**带 ref 锚**的那一条（`git diff --name-only <分叉点>..HEAD -- tests/golden/ content/seed/`），且 0 行数与 ref 锚须同处登记 | 0 |
| 冒烟 ×3 | `tasks.md §2b·T11` + `specs/onboarding.md` §7 | S-2 **已过**：要扩的那个驱动器本体已入库（`docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs`——真 `Input.dispatch*`、剪贴板显式 UTF-8 进程外读回、负向对照排在任何真输入之前、自带子进程与临时目录清理断言），T11 只需把三条冒烟的场景接上去（**2026-09-24 已接上并跑通，见 §15.4b**）；**限制：判据①（系统剪贴板）在有头才成立，无头 CI 不得声称已证** | 0.5–1 |

### 15.4 spike 卡

**S0 · 估算口径（已跑，结论已入 FR-6）**

- 假设：§14-1 的「各文件 `chars/4`」够用。
- 探针：对 `content/seed/terms.json` 109 条与 `prompts.json` 20 条实测码点构成（一次性脚本，不入库）。**统计口径 = 条目的全部字符串字段**（terms: `zh`/`en`/`aliases`/`definition`/`example`/`tags`），按 `Array.from` 逐码点。
- 结果：terms **14,622 码点 / 78.4% CJK / ≈14,544 tok**（`chars/4` → 3,656，**低估 4.0 倍**）；prompts 6,859 码点 / 69.3% CJK / ≈6,232 tok（`chars/4` → 1,715）。
- **本轮自查追加的一条纪律**：本卡初版写作 12,642 / 78.1% / ≈12,539 与 prompts 的 5,585 / 71.8% / ≈5,204——**六个数当场一个也复算不出来**，因为探针未记字段口径（按「仅 `zh`+`definition`+`example`」重算得 10,662 / 92.6% / ≈12,044，同样对不上，即初版数字来自一个已记不清的字段子集）。**方向结论不受影响**（低估 4 倍在两口径下都成立），但「实测」二字要求数字可复算，故初版六数作废、以本行带口径的数为准；同一教训写进 `specs/m6-standard-pack.md` FR-6.1 引注与 15.5-12。
- 结论：口径改为分字区双系数 `ceil(非CJK/4 + CJK*1.2)`，写进 FR-6.2；`chars/4` 作为实现方案作废，§14-1 的问题陈述保留。

**S1 · CLAUDE.md `@import`（已跑完，§14-3 的 30 分钟项兑现）**

- 假设：Claude Code 会把 CLAUDE.md 中 `@path` 指向的文件读进上下文。
- 判据：被导入文件里放一个**只存在于该文件**的 sentinel，非交互问答能否逐字复述并说出来源文件名。
- 探针：两个临时项目目录，分别写 `@./.openvibe/pack.md` 与 `@.openvibe/pack.md`；`claude -p` 各一支（用 owner 真登录态，2 次模型调用；日志 `/tmp/ov-import-probe.out`，一次性产物不入库）。
- 结果：**两支均成立**——模型逐字复述 `OVIMPORT-SENTINEL-7Q4X-KAZZ` 并正确报出 `.openvibe/pack.md`，rc=0；两种写法等效。
- **但结论不是「那就做」**：把主规则移进 `.openvibe/pack.md`、CLAUDE.md 只留一行导入，意味着**生成文件集合改变**（`CLAUDE.md` 从 14.5 kB 主模板变成一行壳），golden 三夹具 `tests/golden/G1..G3`（含 `fingerprint.txt`/`covered.txt`/`files/*`）全量失效。按 §0.3 这是 **A 级**：需 `schemaVersion +1` + 先改 golden 基线 + owner 出 D 编号。**故落地归 P2（裁定表第 10 项），P1.1 只收这份探针结论。**
- 探针未覆盖：只证「读得到」，未证各会话形态（IDE 内嵌 / 子 Agent / 长会话压缩后）稳定注入；落地前须补测。

**S2 · CDP 真输入可行性（已跑，2026-09-23 —— T11 第 4 项的前置已解除）**

- 假设：`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` / `Input.insertText` 能让现有三段裸 CDP 驱动器拿到 §14-6 判为缺失的「真实用户动作」证据。
- 判据（三条各自独立成立才算过，任一不过即整体不过）：
  ① `navigator.clipboard.writeText` 在自动化下 resolve **且系统剪贴板真拿到内容**（需 `--clipboard-sanitized-write` 与 clipboard 权限授予；只测 promise 不算过）；
  ② 中文串经 `Input.insertText` 进受控 input 后，debounce 检索命中该词条；
  ③ Radix Dialog 打开后，键盘 Tab/Enter 能驱动焦点转移与确认。
- 结论：**成立，但按浏览器形态分叉——两条日志各自说话**（驱动器 `docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs`，重跑：`node …/s2-cdp-real-input.mjs` 与 `HEADLESS=0 CDP_PORT=9349 node …`；证据 `s2-cdp-real-input{,-headed}.txt` + 2 张 PNG）。
  | 判据 | 有头 Chrome（`s2-cdp-real-input-headed.txt`） | 无头 `--headless=new`（`s2-cdp-real-input.txt`） |
  |---|---|---|
  | ① 真点击 → 系统剪贴板 | **过**：pbpaste 195 字符与提示词正文**逐字节相等**，toast 同步出现 | **不过，且属环境限制不是产品缺陷**：writeText resolve、页内 `clipboard.readText()` 读得到、toast「已复制到剪贴板」出现，而 pbpaste 一字未变（仍是 32 字符哨兵）⇒ **无头 Chrome 的剪贴板不接系统 pasteboard** |
  | ② 中文 `insertText` → debounce 检索 | **过** | **过**（两支同值：DOM value=「复盘报告」；第 **300 ms** 发出 `?q=%E5%A4%8D%E7%9B%98%E6%8A%A5%E5%91%8A`；`共 1 条` / 渲染 1 行 / 全量 20） |
  | ③ Radix Dialog 键盘流 | **过**：初始焦点在 `[role=dialog]` 内 → 三个变量框各收中文 `["甲乙0丙","甲乙1丙","甲乙2丙"]` → **Tab 4 跳**落在「复制到剪贴板」→ 按钮由 disabled 变可激活 → **Enter 关闭 Dialog** 且剪贴板 == 变量替换后预览（280 字符逐字节相等） | **过**（键盘部分逐项同值；其剪贴板落点 ③h 与①同因不过） |
  | N1 负向对照（合成 `el.click()`） | 剪贴板未变 + 错误 toast「剪贴板不可用」出现 | 同 |
- **四条方法级副产品（比结论本身更贵，都是撞出来的）**：
  1. **无头拿不到系统剪贴板**——「promise resolve + toast + 页内 readText 三件齐」在①上全部为真而 pbpaste 不动，正是判据①写明「只看 promise 不算过」要防的那种假绿；无头 CI 里这条**结构上不可证**，只能有头跑或降级为人工录屏。
  2. **`pbcopy`/`pbpaste` 依赖 UTF-8 locale**：本机 shell 不导出 `LANG`/`LC_CTYPE`，裸 pbpaste 把 CJK 走系统旧码页（实测 `# 日志约定` → `# ־Լ`），与「产品没写进剪贴板」长得一模一样；驱动器必须显式 `LANG/LC_ALL/LC_CTYPE=en_US.UTF-8`。
  3. **transient activation 有约 5 秒窗口**：一次真点击之后再 `el.click()` 会**继承**那份激活（第一版有头跑就是这样，负向对照当场失效）。 ⇒ 负向对照必须排在**任何真输入之前**；本驱动器已按此重排，两形态均拿到 `NotAllowedError` 版正确对照。
  4. **headless 默认视口 800×600**：20 行的深列表里按钮在视口外，`Input.dispatchMouseEvent` 会点到空处（第一轮 ①③ 的 FAIL 全属此因）。真点击前必须 `setDeviceMetricsOverride` + `scrollIntoView` + **`elementFromPoint` 命中校验**，不校验就是把驱动缺陷记成产品缺陷。
- **另记一笔自审**：第一轮 ②b/②c 的 FAIL 是我自己的**时序 bug**——debounce 300 ms 却在 187 ms 上断言「没发请求」；③ 的一支 FAIL 是驱动器里一个藏在字符串引号里的笔误（`button")]`），`pnpm lint`/`typecheck` 都看不见、只有运行时才炸。**登记：驱动器页面的选择器表达式改动后，须让 `pnpm eslint` 之外真跑一次，因为语法错藏在字符串里时静态闸全绿。**
- 退路（不再需要，但保留口径与边界）：**判据①在无头侧不成立** ⇒ 三条冒烟里凡以「用户真的复制到了」为验收点的，CI 不得声称已证；**有头本机可自动化**（本驱动器就是可复用底座）。**但探针不等于冒烟完成**：探针实测的三个动作与三条冒烟**同类型不同场景**——`E2E-SMOKE-01 导入→复制` 走 `ImportExportDialog`、`02 术语搜索→TERMS.md` 走术语库与 `TermsMdPreview` 的复制按钮、`03 向导三步` 是 onboarding 向导（现有 `onboarding-walk.mjs` 29 断言全用合成点击，需按本探针的形态重做一遍输入层）。T11 第 4 项的活是**把这三条场景接到本骨架上**，不是「已顺手覆盖」。人工录屏仍是发布说明「本版未验证」段的合法证据形态。**（2026-09-24：三条场景已各自接上并跑通 ⇒ 本段「探针 ≠ 冒烟」的区分仍然成立，但冒烟一侧已收口，见下条 S-2b；人工录屏退路不再启用。）**

### 15.4b S-2b 三条冒烟接上骨架（2026-09-24 收口；**本块是三条冒烟数字的单源**，其余文档只写状态）

驱动器 `docs/devlog-evidence/DEV-0025/three-smokes.mjs`（重跑：`node docs/devlog-evidence/DEV-0025/three-smokes.mjs` 为无头，`HEADLESS=0 CDP_PORT=9351 node …` 为有头；**CI 形态 `SHOTS=0 EXPECT_SKIP=2 node …`**，见队列 ⑧（owner 2026-09-27 裁 (a)：只把可机判腿接成每次 push 的常驻闸，`EXPECT_SKIP` 一设即断言 SKIP 条数，多一条就红）；剪贴板两腿只在有头可证，故仍按发布节奏人工跑。证据 `three-smokes.txt` / `three-smokes-headed.txt` + 3 张有头 PNG）。两支日志的断言条数不抄正文，取数 `grep -cE '^(PASS|FAIL|SKIP) ' docs/devlog-evidence/DEV-0025/three-smokes*.txt`；三条冒烟各自独立判定（任一不过即整体不过，口径同 §15.4-S2）。

| 冒烟 | 有头 Chrome（`three-smokes-headed.txt`） | 无头 `--headless=new`（`three-smokes.txt`） |
|---|---|---|
| **SM-1 导入→复制** | **过**：真点击「导入」开弹窗 → 真点击「选择文件…」**真触发** `Page.fileChooserOpened`（`mode=selectMultiple`）→ `DOM.setFileInputFiles` 从浏览器输入管线注入一个磁盘 `.md` → 导入报告「新建 1 条，跳过 0 条」→ 真中文检索发出 `?q=冒烟导入夹具…` → 服务端 `content` 与磁盘文件 **62 字符逐字节相等** → 真点击该行「复制」→ **`pbpaste` == 那个 `.md` 的字节** | 8 条 PASS + 剪贴板腿 **SKIP**（不可判 ≠ 通过） |
| **SM-2 术语搜索→TERMS.md** | **过**：真中文 `insertText` 检索真发出 `/api/terms/search?q=瞬时用户` → 结果行勾选框（`aria-label` 即中文名）真点击 → 底部「已选 1 条」→ 真点击「生成 TERMS.md」→ 预览 `<pre>` **248 字符 == 服务端 `render-terms-md` 248 字符**（`orderBy=en-alpha` 取自页内 select，非写死）→ 真点击「复制全文」→ `pbpaste` == 同一字节 | 6 条 PASS + 剪贴板腿 **SKIP** |
| **SM-3 开箱向导三步** | **过**：三步全程真点击；步②渲染文件树与指纹 `13c6584f0bef…`（与 preview API 同源）；步③从页面文本解析建议命令 → 真跑 `openvibe-cli sync` 到临时项目 → **lock 探测自动点亮、无人工点击（D11）** → 真点击「完成向导」→ 一次性询问卡真点击「暂不」→ 向导条消失、**刷新后不再询问** → 后端 `askState=declined` 与之一致 | 9 条全 PASS（本条不依赖剪贴板，两形态同值） |
| **汇总** | **FAIL=0 SKIP=0** ⇒ §2b·T11 的冒烟证据已自动化留档 | **FAIL=0 SKIP=2** ⇒ 无头侧只认非剪贴板腿 |

- **被测构建的归属**：日志尾注 `HEAD 2862829`，而 tag `v0.1.0` 在 `3e852c2`；`git diff --name-only 3e852c2..HEAD -- ':!docs' ':!DEV_LOG.md'` **行数 0**，且工作树脏项里无任何产品文件 ⇒ **本轮跑的产品代码与 v0.1.0 逐字节同源**，这条证据可以记到 v0.1.0 名下（`release-notes/v0.1.0.md` 据此勾销三条未验证项）。
- **S-2b 撞出的三条方法级副产品**（也都是撞出来的，不是设计时想到的）：
  1. **按文本全局查按钮会撞上 toast 的同名按钮**：SM-1 首跑在「关闭」上 FAIL，`elementFromPoint` 落在一个无文本的 `div` 上。现场 INFO 数出页内 **3 个 `textContent` 恰为「关闭」的按钮**——两个 `aria-label="关闭提示"` 的 toast 键（rect 右下 1325,891 / 1299,945）与一个弹窗页脚键（925,659）。成因：Radix `Toast.Root` 会 `createPortal` 进 `Toast.Viewport`（`@radix-ui/react-toast/dist/index.mjs:371`、容器取 `context.viewport` 见 `:474`），而 Viewport 渲染在 `#root` 内（`apps/web/src/index.tsx:34`），Dialog 的 Portal 挂在 `document.body` 末尾 ⇒ **DOM 序上 toast 在前**，`querySelectorAll('button')` 的 `find` 先命中它，而弹窗的 `z-40` overlay 盖住其中心点，真点击必然命不中。**沉淀：弹窗内按钮一律按 `[role="dialog"]` 作用域查。**2026-09-27 队列 ⑨ 补充：这条**不因改可访问名而作废**——弹窗头部 `✕` 补了 `aria-label="关闭弹窗"` 之后，三颗关闭按钮的可访问名互不相同了，但**可见文本仍是两个「关闭」**，按文本查照旧多命中。规范性口径与「同一时刻至多一支弹窗」的前提见 design §13 的自动化定位约定，用例锚点是 `apps/web/src/components/ui/Dialog.test.tsx`。
  2. **「按钮出现」不等于「内容就绪」**：SM-2f 首跑 FAIL 读到 0 字符——预览 `<pre>` 只在字节到位后才渲染（`apps/web/src/components/terms/TermsMdPreview.tsx:48` 的 `content !== ''` 条件），而「复制全文」从首帧就在、只是 `disabled`。⇒ 断言要**轮询等目标节点**，且点击选择器须排除 `disabled`（点了个禁用按钮再去问「剪贴板为何不变」是自坑）。
  3. **负向对照留下了可见证据**：有头截图 `01-headed-sm1-import-copy.png` 里同时挂着「剪贴板不可用，请手动复制预览文本」（N1 合成点击被拒）与「已复制到剪贴板」（SM-1h 真点击）两条 toast —— 一张图就是正反对照的现场，不必只靠日志。
- **本驱动器与 DEV-0024 的分工**：键盘流（Tab 焦点转移 / Enter 提交）**不在这里重复取证**，那是 §15.4-S2 判据③已单独证过的**能力**；S-2b 跑的是**场景链**，输入只用真鼠标点击 + `Input.insertText`。文件注入走 `Page.setInterceptFileChooserDialog` + `DOM.setFileInputFiles`（OS 原生选择框 CDP 驱动不了，也不该在用户屏幕上弹），**`Page.fileChooserOpened` 事件发生本身**就是「按钮真接线」的断言，不是绕过 React。

### 15.5 本轮（P1.1 开档）暴露并处置的文档缺陷

| # | 缺陷 | 证据 | 处置 |
|---|---|---|---|
| 1 | **DoD 第 6 条是假绿**：`:1344` 声明「P1 期间所有 A/B 级变更均有 spec 版本行」 | `grep -rn '修订\|规格版本\|变更记录\|版本 v' docs/specs/*.md` → 零命中；P1 期间唯一改 spec 的是 `eef8925`（T8e，+6 行 §6.9），未登记版本行 | 已补：八份 spec 全加 `\| 版本 \|` 行，v1.1 行显式标注「补记，当时未按 §0.3 登记」；承诺改写进 15.6 第 5 条。**⚠️ 2026-09-24 22:05 追注：本行这条 pattern 已被 §15.6 第 5 条的自纠替换为「逐份数 `^\| 版本 \|`」，别再照本行复跑**（本行的四个关键词对修订最频繁的三份 spec 永久盲，且会命中正文假阳性） |
| 2 | 实量数字双源：`:1163` 写死 104/20 与 `:1181` 写「当前实量 109」并存 | 同文件两行冲突 | 已改：`:1163` 去数字，指向 seed-2 单源（历史真值留在 DEV-0019/DEV-0022，不在正文重复） |
| 3 | `m6-standard-pack.md` §6.4 交叉引用指错节：写「注入侧同类防线 m6b §6.7」，而 §6.7 是 schemaVersion 不兼容，字节防线实为 §6.3 | 两文件对读 | 已按 §0.3 **C 级**就地修正并留痕 |
| 4 | `tasks.md §3 变体备案` 两条「后移 P1.1」实为已交付 | 见裁定表 12a/12b 证据 | 已在 `tasks.md` 标作废，避免下轮重新排工 |
| 5 | M4 技巧库 PRD 与计划口径断裂 | `PRD.md` **3.2-M4** 标 P1 vs tasks/dev-plan 零提及、无 spec；且 PRD **内部**也不自洽（**3.3**「M2 完整版、M4、M7 进 Phase 2」与**第 8 章 P2 行**早已把 M4 划进 Phase 2） | 已裁：D22 勘误把 3.2-M4 的 P1 标注改判 P2，与 3.3／第 8 章 P2 行对齐（原「仅登记、不代裁」的说法随 owner 确认裁定表而解除）。**2026-10-02 追注（`v0.2.0` 重构开档那轮）**：本行原用三个裸行号 `PRD.md:168`／`:215`／`:423` 指这三处，本轮往 PRD 插入第 10 章（约 +120 行）与 1.1 补注（+2 行）后行号全部失效（实测于 `54789b8`：168→170、423→425；`:215` 更早在 HEAD 就已指错——它落在 `#### M7 团队协作` 节内的「团队共享库与成员使用统计」一行，与 M4 无关），故按 **§15.5-7 自己定的「跨文件引用一律换节锚」**就地换成节锚。即本行是 §15.5-7 那次替换**漏掉的同类第四处**（它当时只扫了带 `.md:` 前缀的形态，裸 `:215`／`:423` 不带文件名，任何 `x\.md:[0-9]+` 型 grep 都扫不到） |
| 6 | **同名异物**：「飞轮面板」在 `tasks.md §3 变体备案` ② 指未做的**遥测看板**，在 `PRD.md` 第 8 章 P1 行与代码里指**已交付的本地统计卡片** | `apps/web/src/components/onboarding/FlywheelCard.tsx` 存在且常驻顶栏（`AppShell.tsx:71`）；`settings.ts:146` 注释「全本地 SQL 聚合，不参与遥测」 | 已消歧：裁定表第 8 项改称「遥测增长看板」并写出两者差异；`tasks.md` ② 就地加注——否则下轮会按「P1 该有面板」重复排工，或按「面板归 P2」误判已交付功能是缺陷 |
| 7 | **跨文件行号引用会随编辑腐烂**：§15 用 `tasks.md:165` / `:143` 指位置 | 本轮给 `tasks.md` 加 §2b 后行号整体下移：原 ①②④ 所在行从 165 移到 **191**（`:165` 现为 §2b·T10 验收段后的空行），原 Playwright 待办从 143 移到 **145**（`:143` 现指向我本轮新写的 T9 冻结注——**恰好同一段才没被发现**，属于运气不是正确） | 已改：跨文件引用一律换成**节锚**（`tasks.md §3 变体备案` / `§2b·T11`）；本文件内的 `:754`/`:1163`/`:1181`/`:1344` 逐条复读核对后**仍准**（本轮未在其之前插行），故保留 |
| 8 | **D 编号双命名空间差点撞号**：PRD 附录 D 与 design §16 各自独立从 D1 编号 | 本轮写 PRD 决策行时按 PRD 本表续号得 **D18**，而 `design.md:397` 已有 D18（遥测惊喜时刻）；且 `design.md` 的编号说明原写「本表 D1–D17 / PRD D1–D12」，两张表的实际尾号（18 / 17→22）都已越出其自述范围 | 已定约定并落文档：**新决策取全局下一空号**（本轮按 D19–D22 登记，与已写的四份 spec/tasks 引用一致）；design §16 编号说明整段改写，并加一行指针指向 PRD 附录 D（不复述正文） |
| 9 | ~~`design.md` 文档头与实际进度脱节：`状态 = 草案`、`版本 = v0.1（2026-09-20）`~~ **已修**（2026-09-27 队列 ⑤ 裁「翻状态 + 版本并存」） | §7/§8 契约实际已 v1.3 并随 P0 门禁 G2/G3 冻结（**契约版现值不在本文抄**，取数看 design 文档头「契约版 ≠ 文档版」那一行）；v0.1.0 tag 曾长期只打在本地 `3e852c2`（2026-09-26 队列 ③ 已把它移到并推至有 CI 凭据的 `5f7fd3c`，取数 `git ls-remote --tags origin`） | 已改三处：状态行翻为「已冻结」并写明**谁能翻**（owner 裁决，走 `docs/decisions.md` 队列）；版本行按 PRD 的「本版 + 上版 + 日期 + 一句因由」口径升一档；新增一行声明**契约版与文档版互不映射**——文档版只在整体口径变化时升，§7/§8 各自升版不动它。**这最后一句同时是脱节的成因**：§7/§8 从 v1.0 走到 v1.3 的整整一周里，文档版一次都没有理由动 |
| 10 | `design.md §1` 硬约束 2 字面失效：「写路径收敛到 `openvibe sync`」 | D19/T10 新增 `openvibe clean` 是第二个会动磁盘的 CLI 命令 | 已就地改写：唯一性指**通道**唯一（浏览器永不写本地），命令从 1 个变 2 个；**C 级**留痕。**⚠️ 2026-09-24 22:05 扫描加限定（原句会被读成「CLI 只有两处碰盘」）**：这里的「2 个」限定在**写目标项目目录 = 注入通道**（`commands/sync.ts` 10 处、`commands/clean.ts` 6 处写盘 API）；CLI 另有两个命令写**自身 data home**——`commands/serve.ts:89` 建目录、`config.ts:126-127` 写 `config.json`+chmod，合计 5 处，**不在硬约束 2 的辖域内**（该约束管的是「会不会动用户的仓库」）。写盘 API 分布现测：sync 10 / clean 6 / serve 2 / config.ts 3 |
| 11 | `proposal.md` 第 5 章交付物 4 仍承诺「E2E 自动化测试 = Playwright + CLI 集成测试」——对外文档里的假承诺 | `grep -n Playwright docs/proposal.md` 命中该条；D21 已裁定不引入 | 已按 D21 改写并升 `proposal` v0.2.1（同时把上游依据从 PRD v0.1.4 刷到 v0.1.5）；三条冒烟在 proposal 里也明写为「未验证缺口」**（该「缺口」写法只活到 2026-09-23：三条冒烟已于 2026-09-24 收口，`proposal` 现升 v0.2.3 并把该条改为「已收」，见 §15.4b——读这行时别把它当成当前状态）** |
| 12 | **本轮自己的两处「实测」不成立**：① S0 的 terms/prompts 六个数字复算不出来（探针脚本未记字段口径，且脚本已随 `/tmp` 清理丢失）；② `m6a FR-6.4` 把「字节→码点折算」写成了「实测 default 包单平台 ≈17.7k」 | 重跑一次性统计脚本：全字段口径 14,622 码点 / 78.4%，三字段口径 10,662 / 92.6%，**两者都不等于初版的 12,642 / 78.1%**；17.7k 亦无法由它自己列出的三个字节数推出（按公式折算实为 15.1k–16.0k） | 两处均已改写：S0 换成带口径的可复算数字并明写初版作废；FR-6.4 标注「折算非实测」，权威数交 `SRV-EST-01` 的真 preview。**方向结论不变**（`chars/4` 低估 4 倍、首启必亮黄条在两口径下都成立）。**沉淀的规矩：登记数字必须同处登记口径；写「实测」就必须能被别人复算** |
| 13 | **自审撞出的删除安全漏洞（规格级）**：`clean` 的分类条件原写「lock 登记 且 磁盘 == 期望」，**漏了 `managed` 位** | `design.md:237` 明写 `--target` 过滤注入会把**未写入**的文件也登记期望哈希并标 `managed: false`；照原条件，`sync --target cursor` 重刷后 `clean` 会把用户自己的、或上一轮全量注入留下的 `CLAUDE.md` 当成我方产物删掉 | 已补闸：FR-6.1 定位与 FR-6.3 两态条件都加 **`managed === true`**，「`managed !== true` ⇒ `FOREIGN`」写成显式规则；验收加一支 **j**（两段 sync 后 `CLAUDE.md` 必须逐字节留在盘上、且备份目录内不得出现它），测试段 `CLI-CLEAN-01..09` → **`01..10`**（tasks/PRD/dev-plan 六处引用同步改） |
| 14 | **本文 §15.2 的版本号口径与 PRD D26 直接冲突**：§15.2 原写「发布物按 semver 走 **v0.2.0** 而非 v0.1.1」，而 **D26**（2026-10-01）已裁「发布树从 `main` 当前 tip 切 **v0.1.1**、发 `openvibe`、tag `v0.1.0` 不移动」 | 两文件对读：`docs/PRD.md` 附录 D 的 D26 行 vs 本文 §15.2 第一条。**这是分析文 §8.1 那张 10 行漂移表漏掉的第 11 行**（该表 2026-10-02 现测，未扫到本条） | 已按 §0.3 **C 级**就地修：§15.2 那条改为「两个版本号各管一件事」的相容读法（v0.1.1 = 过渡发布解 npm 阻塞；v0.2.0 = P1.1 余项 + PRD 第 10 章 RF0–RF5 的合并发布），并在原句处留痕说明那个「而非」是**漂移不是裁定**（该行从未被任何 D 号授权过）。PRD §10.6 的 D26 接口行与本行互为指针 |
| 15 | **§15.5-7 那次「跨文件引用一律换节锚」的替换是不完全的**：它只换了带文件名前缀的形态（`tasks.md:165`），**裸行号**（`（\`:215\` 与 \`:423\` …）`）一处都没换，而它们同样是跨文件指针 | 本轮 `docs/PRD.md` 净增 **+178 行**（543→721；`git diff --numstat` 记 +182/−4）后现测（`54789b8`）——**位移源不是第 10 章**：那处插入是 **+166**（hunk `@@ -454,0 +458,166 @@`）且落在这些引用的**下方**，真正把 168/423 推下去的是第 40 行之后的一处 +2。结果：§15.5-5 那行的 `PRD.md:168` 由 168 移到 **170**、`:423` 由 423 移到 **425**；而裸 `:215` 更早在 HEAD 就已指错——它落在 `#### M7 团队协作` 节内的「团队共享库与成员使用统计」一行，与该行声称的「M4 划进 Phase 2」无关（那句话在 **3.3**）。**成因是检查口径本身有洞**：`grep -rnoE '[A-Za-z0-9_.-]+\.md:[0-9]+'` 这个模式（本表第 7 行与治理电池的检查 4 都用它）**结构上扫不到不带文件名的裸行号**，所以第 7 行当时报「已改完」是真的按它的口径改完了，漏的是口径 | 已按 §0.3 **C 级**就地修：§15.5-5 与 §15.1-9 两行的 `PRD.md:168`／`:215`／`:423` 全换成节锚（3.2-M4／3.3／第 8 章 P2 行），并在 §15.5-5 留追注记下原行号与失效量（按「旧行号不回改、加后记」）。**口径修正已于本轮落地**（改在用户级 skill `openvibe-doc-governance-self-audit`：`scripts/consistency-battery.sh` 的检查 4 拆成 **4a**（带文件名前缀）与 **4b**（裸 `` `:NNN` ``），SKILL.md 步 0 变量块与检查 3/4/6 三节同步）：跨文件引用检查必须**同时**跑两种模式——带文件名的 `[A-Za-z0-9_.-]+\.md:[0-9]+`，与裸行号的「本文之外出现 `（\`:NNN\`」型 token；后者无法用一条正则穷尽，实际可行的替代是**禁止在跨文件语境里写裸行号**（写就必须带文件名，从而落进第一种模式）。同族的第五处在 `docs/analysis-2026-10-02-first-principles.md` §8.1（四个裸/半裸 PRD 行号），因该文件按其 §12 不改、且**尚未入库**（`git grep` 口径同样扫不到它），处置登记在 PRD §10.0 的第 2 条 |
| 16 | **表格单元格里的裸竖线会多切列**——同一族五行、跨四个文件：本表第 1 行（6 列 vs 表头 4）、`docs/decisions.md` 队列 ② 与 ㉘ 两行（各 7 列 vs 表头 6）、`docs/specs/m6-cli-injection.md` 与 `docs/specs/m6-standard-pack.md` 各自的**版本行**（3 列／8 列 vs 表头 2） | 现测 `54789b8`：五行**全部在 HEAD 即已存在**（对 `git show HEAD:<file>` 同法数列得同样结果），不是本轮引入。成因都是把 shell 管道或 ERE 交替符直接写进了代码跨度：`git status --porcelain \| wc -l`、`… \| grep -E`、`grep -vE "\.test\.ts\|/test/\|node_modules\|/dist/\|/pkg/"`。**GFM 的表格切分先于代码跨度解析，反引号不保护它**。**治理电池原先查不到这一类**：检查 2 只断言版本行「存在」（`^\|[[:space:]]*版本[[:space:]]*\|`），不断言它的列数——同一次运行报「12/12 全绿」，而 `m6-standard-pack.md` 的版本行正以 8 列挂在一张 2 列表上 | 已按 §0.3 **C 级**就地把裸竖线改成反斜杠转义形态：GitHub 渲染出的命令与原文逐字相同，可照常复制复跑；**代价**是从**原始 md 文本**直接复制会多带反斜杠（ERE 里转义竖线是字面竖线、shell 管道会退化成一个参数），故复算命令一律以渲染页为准。同步给治理电池补了**检查 8「表格列数自洽」**（逐表按表头列数比每一行；转义竖线先挖掉再数，否则会把已正确转义的格子误判成多列），这一类从此不靠运气发现。补完后现测：电池的 19 份文档（`$DOCS` 6 ＋ `docs/specs` 12 ＋ `DEV_LOG.md`）mismatched-rows = **0** |

### 15.6 P1.1 退出定义（DoD）

1. **代码**：T10 三项**实现完毕**（2026-09-24 收口，见 `DEV_LOG [DEV-0027]`）——`CLI-CLEAN-*` 现测 **30 支**（2026-09-26 23:23 在 `9651801` 上复测：`clean.test.ts` 文件支数与具名 id 数同为 30；`986689e` 采样时该数为 29，多出的 `CLI-CLEAN-13` 由队列 ⑥ R1 补上，见 `[DEV-0044]`）、`CORE-SIZE` **7 支 = `size.test.ts` 的文件支数**（具名 `CORE-SIZE-01..06` 六支 + 一支**无名**负向腿，具名数是 6 不是 7；`986689e` 采样时该段为「6 支文件 / 具名 01..05」，第 7 支由 `bb7d671`（待决策项 ④ 落地，09-25 23:50）补入而**未回填本行**，见 `[DEV-0045]`）、`SRV-EST-*` **具名 6 支**（在 `packs.api.test.ts` 的 **18** 支里；该文件 17→18 由 `be0c885`（⑫ 落地，09-26 08:04）所加，同样未回填）在本机 darwin 全绿（§13-8：口径、数、**采样 sha** 同处登记——本行三个数现采自 `9651801`，2026-09-26 23:2x），全仓 `pnpm test` **433 支 / 47 文件**（cli 145 / unit 191 / integration 97）；T11 侧三条冒烟已收（§15.4b），发布传播清单未做（前置是 v0.1.0 真发布）。**支数一律以 `grep -c "^\s*it[\.(]" <测试文件>` 与 vitest 汇总行现测为准，不抄历史数字**，也**不得写成「规格点名的若干支全绿」**（实落里有大量规格没点名的 sub-branch）。⚠️ **本条仍未勾**：五闸虽本机全过（lint / typecheck / test / seed:check / bundle:check 入口 293.07 kB ≤ 300 kB），但分支 `feat/p1.1-t10-clean-size` **未推**、**没有任何一次 CI 跑到过 tip sha** ⇒「三平台 CI 全绿且跑到 tip sha」这半句零证据，不得以本机绿冒充。 → **✅ 2026-09-24 21:49 复核改写：「未推 / 零证据」这半句前提已被实测推翻，本条现勾**。owner 放行后 `main` 快进 `2862829..787eb4c`（**显式 SSH-over-443 URL**，因 `github.com:443` 直连与代理双双不通：`nc -z github.com 443` rc=1；未改 git config、非 force），**run `36007700628` @ tip `787eb4c` 三平台全 `success`**：**ubuntu 433 passed / 0 skipped**、**macOS 433 passed / 0 skipped**、**win32 429 passed + 4 skipped**（`Test Files` 三侧恒 47）。四条 skip 全部点名在 `DEV_LOG [DEV-0027]` 后记，**skip 计入未验证面、不并入「全绿」**；且该 run 只验 tip 一个 sha，分支其余 37 笔是**随 tip 一起**被验。**代价**：这一格是**带 sha 的快照**，tip 之后再落任何 commit，本句即降级为历史证据，须重跑而不是引用。 → **2026-09-25 指针（不重砸本行历史数）**：本行的 `433 支` 与三平台分平台数是 `787eb4c` 的快照；此后 4 处行内 POSIX 守卫改成具名 skip（拆出 `CLI-SERVE-01b`、`CLI-SYNC-03d`），win32 的 skip 预期 4 → 8 **尚未在 win32 实证**（→ **2026-09-26 体检收口该留白**：已实证，见 `DEV_LOG [DEV-0032]`，run `36159308661` @ `5a963ff` 的 win32 腿 **430 passed + 8 skipped**；本句读作历史，不再重砸数字）。**本机支数与 skip 数不在本行复制**：单源是 `DEV_LOG` 最新一条的「测试验证」段。这条限定是本指针自己挣来的——它上一版在这里写了 `435 passed / 0 skipped`，而写下那个数的**同一轮**之后又补了三支，即本行按 §13-8「不复制正文数值」的口径改掉的样子。
2. **契约**：`git diff --name-only tests/golden/` 为空。若非空 ⇒ 期间发生了 A 级变更，必须回到 §0.3 A 级流程重裁（`schemaVersion +1` + owner D 编号），**不得顺手更新基线**。—— ✅ **2026-09-24 收口实测成立**：该命令输出 **0 行**，`content/seed/` 亦 **0 行**；T10 全程（T2–T9）未触 A 级冻结契约。**按 §13 第 7 条补正**：上面那句字面命令比的是工作树 vs 索引，**一旦提交就必然为空，只作工作树补充**；本条的真凭据是带 ref 锚的那一条——**`git diff --name-only 99690bc..HEAD -- tests/golden/ content/seed/`** → 实测 **0 行**（`99690bc` = T10 开工的分叉点，即 `c11430f` 的父；`HEAD` = 采样 sha `986689e`）。更强的形式同测亦成立：`git log 99690bc..HEAD -- tests/golden/ content/seed/` → **0 个 commit**。
3. **退场可证**：验收 10a–10k 在 CI 里跑，不只在本机。—— **未收**：a–k 加 f2/e2/e3 已在本机（darwin）以真子进程 + 真磁盘断言跑绿，但**「分支未推 ⇒ CI 侧零证据」这半句经 2026-09-26 23:5x 就地复核为假**：分支已推，且 `787eb4c` 在远端拿到过三平台 `success`（run `36007700628`；判据 `git merge-base --is-ancestor 787eb4c origin/main` 为真）。成立的一截是**CI 未跑到 tip**（见本条末尾 2026-09-26 的 k 腿条款），而不是零证据；且即便 CI 绿，win32 腿上 `CLI-CLEAN-06e`（符号链接逃逸）是 `it.skipIf(IS_WINDOWS)`，**跳过不等于通过**。 → **◐ 2026-09-24 21:49 半收（本条按设计不能全勾）**：「在 CI 里跑」这半句**已成立**——run `36007700628` @ `787eb4c` 上 `clean.test.ts` 三平台各跑一次：darwin/linux **29/29**，win32 **28 实跑 + 1 skip**（日志原文 `(29 tests | 1 skipped)`，正是本条原先的应然预言）。**留白不变**：`06e` 符号链接逃逸腿在 win32 **至今无可执行证据**，「跳过 ≠ 通过」这一条**不因 CI 绿而消解**；退场演练的三条人工腿（真 PTY 取消退 `2`、真 SIGKILL 中断恢复、`PATH_ESCAPE` 端到端构造）也不是 CI 能补的，仍需人跑。 → **◐ 2026-09-26 23:4x 腿区间随队列 ⑥ 扩到 a–k，而新腿在 CI 上零证据**：§7.10 **k**（测试 `CLI-CLEAN-13`）由 `5444450` 入库，远端 CI 最后覆盖的 commit 早于它 ⇒ **上面那组 29/29 不含 k 腿**，本条"在 CI 里跑"因此**没有因为 ⑥ 落改而前进**。取数：`gh run list -L 1 --json headSha,conclusion` 对 `git log --format=%h -1 5444450`。 → **✅ 2026-09-27 07:57 本条前进（承 `[DEV-0048]` 的第 6 次推送）**：`5f7fd3c..af185c4` 共 12 笔入远端 `main`，run **`36280869393`** 三平台 `success` ⇒ **k 腿确实三台都跑到**——判据两条：`CLI-CLEAN-13` 是裸 `it(`（`apps/cli/test/clean.test.ts:531`，不在这 8 支门控里），而 win32 侧读数 **442 passed + 8 skipped = 450** 与另两侧的 **450 / 0 skip** 只差恰为那 8 支。**本条仍不整格收**：`06e`（`clean.test.ts:595` 的 `it.skipIf(IS_WINDOWS)`）在 win32 至今无可执行证据、「跳过 ≠ 通过」不因 CI 绿而消解，退场演练的三条人工腿（真 PTY 取消退 `2` / 真 SIGKILL 中断恢复 / `PATH_ESCAPE` 端到端构造）也不是 CI 能补的。
4. **证据**：S-2 结论已落 §15.4-S2（**前置已解除**，驱动器 `docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs` 入库并自带清理断言与负向对照）；**三条冒烟已于 2026-09-24 各自接到该骨架上并跑通**（§15.4b：有头 **FAIL=0 SKIP=0**、无头 **FAIL=0 SKIP=2**，两条 SKIP 都是系统剪贴板腿）——凡「用户真复制到」类断言，**有头才算证据、无头 CI 不得声称已证**；人工录屏退路未启用，发布说明的「本版未验证」清单改为**按构建归属逐条勾销**（v0.1.0 的三条冒烟项据 §15.4b 的构建同源判定勾销，其余项不动）。
5. **痕迹**：每个任务组一条 `DEV-NNNN`；且收口时**复跑 15.5-1 的那条 grep 并要求非空**——把「spec 有版本行」从口头承诺变成可查项，这是本轮欠账的真正闭环动作。—— ✅ **2026-09-24 收口已复跑**：`grep -rn '修订\|规格版本\|变更记录\|版本 v' docs/specs/*.md` → **6 行命中（非空）**，八份 spec 各含 1 行 `\| 版本 \|`； → **⚠️ 同日 22:05 仓库级扫描自纠：那条 grep 与它想证明的命题不同源，凭据作废换模式**。现测那 6 行里 **5 行纯靠版本行末尾的「未修订」三字命中**、第 6 行 `m6-cli-injection.md:152` 是正文 `j.` 段的**假阳性**，而**改得最多的三份 spec 一条都没命中**（`m6-cli-injection.md:11`、`m6-standard-pack.md:11`、`seed-content.md:11` 的版本行写「→ v1.1」，不含四个关键词）⇒ 这条闸**对修订最频繁的 spec 永久盲**。换成逐份数行本身：**`grep -c '^| 版本 |' docs/specs/*.md`** → 现测 **8 份各 1**（`grep -l` 计数 = 8/8）。**新增规则（§13-8 的同族）：痕迹闸必须「逐份数行、要求每份 ≥1」，「全库命中非空」不算凭据**——非空只证明有字，不证明八份齐。T10 组的痕迹是两条——`DEV-0026`（开工前计划落库 + 三处冲突定稿）与 `DEV-0027`（T2–T9 实现收口 + 五闸凭据）。**第 4 条的「按构建归属逐条勾销」本轮不发生在 T10**：本组新添的未验证面（Web 四处渲染、win32 符号链接腿、`auditLockPaths` 的 win32 词法子句等）已在 `DEV_LOG [DEV-0027]` 逐条点名，发布说明的「本版未验证」清单待 owner 放行/真发布时按那份清单**增补**，而非勾销。

---

## §16 v0.2.0 迭代版（RF0–RF5 · 2026-10-03 开档 · **本节产出为规格落点与排期，不含实现**）

> 依据：PRD 第 10 章（2026-10-02 开档）。**裁定面已闭合**（D27–D33，其中 D32／D33 的状态是「待签」不是「已裁」），本节只补两件事：§0.4 第 4 条要的**规格落点**，和 PRD §10.4 第三组要的**不建任务组**。
> 与 §15 的关系：§15 是 P1.1 的迭代版，本节是 v0.2.0 的迭代版，两节互不覆盖。RF 线与 P1.1 余项**同期推进、正交**（PRD §10.2 首句），不是「§15 做完再做 §16」。

四条开档即定的边界：

1. **不另立计划文件**。再写一份 `docs/plan-v0.2.0.md` 就是给本文造第二个真源，与 §15.5 第 14、15 两行记的是同一族缺陷（版本号双源、行号指针腐烂）。RF 线的排期只在这里长。

   > **⚠️ 本条已被 owner 于 2026-10-14 推翻，适用范围仅限 v0.2.1。** v0.2.0 的 RF 线仍在本文 §16 内长，**§16.2 的 27 个编号项一字不动**。v0.2.1（M8 Agent 接入层）另立 [`docs/dev-plan-v0.2.1.md`](./dev-plan-v0.2.1.md)，登记为 PRD **D34**，双向指针见本文 **§18**。推翻理由与代价（双源风险由双向指针对冲，非零成本）见该文件 §0.1 与 §9.2。
2. **出口判据、MT 定义、周期数字一律不复制**，取数处见 16.1。本节出现的每个数字都带口径与采样点（§13-8）。
3. **本轮 13 份规格都不构成开工依据**：9 份新建全为 v0.9 草案且头部「关联任务」格为**无**，4 份既有规格只加追加面并 bump 版本行（判级全 B，无 A）。
4. **本节不新增裁定、不改判任何已裁项**。16.11 与 16.12 记的是缺口，处置是「登记 + 指回该谁裁」。

### 16.1 单源声明

| 要引的东西 | 单源 | 本节的写法 |
|---|---|---|
| 各 RF 项的门禁判据原文 | 分析文 §7 · Phase N 表的「门禁判据」列（PRD §10.2 已把它挂为出口判据） | 只写「见分析文 §7 · Phase N 表 x-y 行」，不复述判据 |
| MT1–MT6 的定义／现状／目标形态 | 分析文 §9.1 表（PRD §10.0 右列改号，本节沿用 MT） | 只写归属与「此刻算不算得出」（16.3） |
| 周期与合计 | PRD §10.2 末段，那里明写「本章唯一一处做加法」 | 不复制数字，只写它对排期的约束（16.6） |
| 每条 RF 的验收细则 | 九份新规格的 §7（含各自的 §7.7 未验证面）＋ 四份既有规格的对应 FR | 本节只到「落点」粒度 |
| 现有闸的阈值现值 | `scripts/bundle-check.ts`、`scripts/seed-check.ts`、`.github/workflows/`、`tests/golden/` | 只写「不动」（16.10），现值去代码读 |
| 待裁项全文 | 各规格的 §8.2 | 本节只给总账与扫法（16.14） |

### 16.2 落点全量表（27 个编号项 ⇒ 23 项有规格落点 · 4 项无）

| RF 项 | 动作（简称；判据去分析文 §7 读） | 落点 | 落点里的位置 | 本轮态 |
|---|---|---|---|---|
| 0-1 | i18n 按命名空间懒加载（AD7 步 1） | `specs/entry-budget.md` | FR-1／FR-2／FR-3 | v0.9 · 待裁 2 |
| 0-2 | `bundle:check` 升级为差值报告（AD7 步 2） | 同上 | FR-4／FR-5 | 同上 |
| 0-3 | 常量单源 + `shared` 出口面拆分（AD10） | 同上 | FR-6／FR-7 | 同上 |
| 0-4 | `docs:check` 脚本（AD11 的 11-b 最小集） | `specs/docs-governance-check.md` | FR-1…FR-6、FR-9 | v0.9 · 待裁 3 |
| 0-5 | skill 扫描的失败隔离 | `specs/m2-skill-registry.md` | §6.1 条 3／条 4 | **v1.2**（改既有） |
| 1-1 | 薄服务层（AD9） | `specs/service-layer.md` | FR-1…FR-4 | v0.9 · 待裁 3 |
| 1-2 | `openvibe verify` + 三方一致性（AD3 的 L2） | `specs/write-selfproof.md` ＋ `specs/m6-cli-injection.md` | 前者 FR-1／FR-3／FR-4；后者 FR-7（命令面与退出码） | v0.9（待裁 4）＋ **m6 v1.11** |
| 1-3 | 段级差异展示（AD4 的 4-a，**只读**） | 同上两份 | 前者 FR-5；后者 FR-8.2 的输入 | 同上 |
| 1-4 | adapter 产物夹具 + 矩阵生成（AD6） | `specs/adapter-fixtures.md` | FR-1…FR-5 | v0.9 · 待裁 4，**判级未定**（16.5） |
| 1-5 | 本机事件台账 + 统计页（AD2 = PRD D29） | `specs/local-event-ledger.md` | FR-1…FR-6 | v0.9 · 待裁 4 |
| 1-6 | 冲突处置的「为什么」层（AD3 的 L3） | `specs/write-selfproof.md` | FR-6 | v0.9 |
| 2-1 | 资产 `audience`／`freshness` 字段 + UI 语义 | `specs/growth-path.md` | FR-1 | v0.9 · 待裁 6（RF2 整段共用） |
| 2-2 | 成长阶段机 C1 | 同上 | FR-2／FR-3 | 同上 |
| 2-3 | 渐进披露层 C3 | 同上 | FR-5 | 同上 |
| 2-4 | 成长面板 C6 | 同上 **＋** `specs/onboarding.md` | 前者 FR-6；后者 FR-5（**只给接入位，不改向导**） | **onboarding v1.2** · 待裁 1（MT2 左端点） |
| 2-5 | 推荐引擎 v0 C2 | `specs/growth-path.md` | FR-7 | v0.9 |
| 2-6 | 教学内容内嵌 C5 | 同上 | FR-8 | 同上 |
| 2-7 | 复盘候选确定性提取 C4 | 同上 | FR-9 ＋ CP4 边界行 | 同上 |
| 3-1 | 有效上下文密度指标 + 面板（MT1） | `specs/context-density.md` | FR-1…FR-4 | v0.9 · 待裁 5 |
| 3-2 | `openvibe update`（变更集预览 + 段级应用）（AD5） | `specs/m6-cli-injection.md` | FR-8 | **v1.11** · 待裁② |
| 3-3 | `openvibe rollback`（AD5） | 同上 | FR-9 ＋ §6.12（同名异物登记） | **v1.11** · **整条阻在待裁①** |
| 3-4 | 出参三边界校验（AD8） | `specs/output-validation.md` | FR-1…FR-3 | v0.9 · 待裁 5 |
| 3-5 | A/B/C 判级自动化辅助（AD11 的 11-c／11-d） | `specs/docs-governance-check.md` | FR-5／FR-6／FR-8 | v0.9 |
| 4-1 | 段级受管标记进契约（AD4 的 4-c）＝ **A** | **无落点** | — | 不写规格：阻于 D32 待签（队列 ㉛） |
| 4-2 | `schemaVersion` 1→2 与队列 ㉘ 改名同批 ＝ **A** | **无落点** | — | 载体是 D25 的**落地笔**，不是规格文件 |
| 4-3 | 用户盘迁移路径（旧 lock → 新契约）＝ **A** | **无落点** | — | 阻于 D33 待签 |
| 4-4 | 三层保证 L3 完整化（段级「为什么」） | **无落点** | — | 依赖 4-1；其只读半边已由 1-3／1-6 接住 |
| RF5 ① | M7 的「使用统计」必须建在台账上 | `specs/m7-team-collab.md` | FR-5.3／FR-5.4 | **v1.1** |
| RF5 ② | 评审对象粒度建议为**变更集** | 同上 | §8.2 待裁①（补 owner 侧建议值，**不代裁**） | v1.1 |

**读数口径三条**：

- RF5 的两条不算编号项（分析文 Phase 5 表就没有 x-y 编号），所以分母是 27 而不是 29。
- **开档时我口算的「3 处无落点」不成立，实数 4 处**：4-2 虽由 D25 授权、不走规格，它对「本轮有没有规格文件」这一问的回答同样是「无」。按四项登记。
- 2-4 与 3-2／3-3 各有两个落点（面板本体／接入位、命令面／细则），表里两份都写了——**同一个 RF 项的两个落点之间也必须指回单源**，细则归新规格、命令面与退出码归 m6，这条分工写在 m6 §8 的「追加面的细则单源」那一行。

### 16.3 MT1–MT6 归属表（PRD §10.2 那句「RF3 度量面 = MT1–MT6」的真意）

**这张表存在的理由**：不写它，下一轮就会把「MT1–MT6」读成六张工单。六条度量里**只有 MT1 有自己的 RF 编号项**（3-1），其余五条的载体分散在别的项里或根本没有落点。

| MT | 名称（定义单源在分析文 §9.1 对应行） | 落点 | 此刻算不算得出 | 缺的那一块 |
|---|---|---|---|---|
| MT1 | 有效上下文密度 | 3-1 ⇒ `context-density.md` FR-1／FR-3 | 算得出（分子分母都有现成件，估算器复用 `estimateTokens`，不新造） | 分母口径待裁（那边 §8.2①） |
| MT2 | 首次见效时间 | 2-4 ⇒ `onboarding.md` FR-5.3 | **算不出** | 右端有源（`injections.injected_at`），左端「首启时刻」**全仓无承载** ⇒ onboarding §6 待裁①，裁前**面板不得显示 MT2**（**2026-10-24 现测同值**：复算命令 `grep -rniE 'first_launch\|launched_at\|installed_at\|first_run\|首启时刻' packages/core/src/db/migrations/ packages/core/src/repos/ packages/shared/src/schemas/` → **0 命中**） |
| MT3 | 往返成本 | 3-2 ⇒ `m6-cli-injection.md` FR-8 | 现状可数（≥3 步），目标形态要等 `update` | 否证器（分析文 §10 第 7 条）未跑 ⇒ 16.5 |
| MT4 | 验证覆盖比 | 0-4／3-5 ⇒ `docs-governance-check.md` FR-7 | 能算，但**从未统计过** | 该 FR 自己要求「单调不降」，故**首值必须在开工那一笔采**并登记，否则没有基线可比 |
| MT5 | 治理维护成本 | 应为 11-a（队列结构化）＋ 11-c —— **11-a 在 RF0–RF5 里没有落点**（16.11） | 半边悬空 | 「登记字节数下降而信息项不减少」需要结构化字段，而 `docs/queue.yaml` 不在任何 Phase 行里 |
| MT6 | 文档漂移数 | 0-4 ⇒ `docs-governance-check.md` FR-8 | 现值只有「人工扫出来的 10 组」，检测方式本身不可持续 | 分析文 §8.1 那张表**已被本文追加到 11 行**（§15.5-14 那一条）——这一行就是 MT6 的第一个可复算样本，也是「漂移速度 ≥ 修复速度」的现场证据 |

### 16.4 依赖图

箭头方向 = 被依赖者在前。「分析文 §7 各表『依赖』列」是这张图的上游依据，本节只加**本轮写规格时新撞出来的三条**（16.12 的第 1、4、5 行），其余照抄形状不照抄判据。

```
RF0（本周内 · 五项互不阻塞，唯一一条是 0-3 → 0-1）
  0-3 常量单源 ──▶ 0-1 i18n 命名空间拆分 ──▶ 0-2 bundle:check 差值报告
  0-4 docs:check ──▶ 上线后反过来盯 0-1…0-5 自己的登记（自指，故 FR-9 要能豁免自己）
  0-5 skill 扫描失败隔离（独立；先例就在 port-scan.ts 里）

RF1（2–3 周 · 1-1 是唯一根，绕不过去）
  1-1 薄服务层 ──┬─▶ 1-2 verify ──┬─▶ 1-6 冲突「为什么」层
                 │                └─▶ 3-3 rollback 的「回退后必须报 CONSISTENT」判据
                 ├─▶ 1-3 段级只读 diff ──▶ 3-2 update（段级应用）──▶ 3-3 rollback
                 ├─▶ 1-4 adapter 夹具（判级未定，可能整条挂进 A 级链）
                 └─▶ 1-5 事件台账 ──▶ RF2 全段 ──▶ MT1／MT2／北极星圈数
                                    └─▶ RF5 ①（M7 使用统计的唯一合法数据源）

RF2（3–4 周 · 整段先过分析文 §10 第 1 条的五人走查）
  1-5 ──▶ 2-1 ──▶ 2-2 阶段机 ──┬─▶ 2-3 披露 ──▶ 2-6 教学锚点
                               ├─▶ 2-4 面板 ──▶ 2-5 推荐 v0
                               └─▶ 2-7 复盘候选（确定性，CP4 边界见 16.8）

RF3（3 周）
  1-5 ──▶ 3-1 密度（MT1）      1-1 ──▶ 3-4 出参三边界      0-4 ──▶ 3-5 判级辅助

RF4（A 级链，见下一块）──▶ 4-1 ──▶ 4-4；4-2 ──▶ 4-3
```

**RF4 的 A 级前置链**（PRD §10.4 第二组原文的形状，顺序不可换、不可并步）：

```
D25 的落地笔（尚未发生 —— D25 行末自陈「本行只是授权与代价登记，落地另起一笔」）
   ↓
D32 / D33 owner 逐条签字（→ 队列 ㉛）
   ↓
两名无上下文只读 reviewer 分头独立复核（按 [DEV-0043] 先例：原文照录 + 逐条独立复算）
   ↓
golden 重基（排在改实现之前 —— §0.3 对 A 级的要求）
   ↓
才改实现
```

一条工程事实同批带上：`.zwork/commit0083a.py` 会拦触 `tests/golden/` 与 `content/seed/` 的提交，重基那一笔要**显式放行**，**不得用 `--no-verify` 绕过**（那道拦截本身就是设计）。

**本轮新撞出的一条硬依赖**（不在这条链里，但它挡 RF2／RF5）：`write-selfproof.md` FR-1.2 的 `PARTIAL` 可判性依赖写入留痕文件存在，而留痕是 1-2 的新产物 ⇒ **1-2 的留痕形状一变，`PARTIAL` 的判据跟着变**。这条已作为待裁④同时挂在 m6 §8 与 write-selfproof §8.2（两边同题，任一处闭合须同步另一处）。

### 16.5 前置闸清单（开工前必须有人先做的那几件事）

| 被挡的项 | 前置 | 满足判据去哪看 | 未满足时的处置 |
|---|---|---|---|
| **RF0-4**（`docs:check`） | 队列 ㉜ 的 J6 余量：**「复审一行耗时」待人测** | PRD §10.4.1 末段（人测口径已写死：两类各抽 3 行、报各类中位数、不报总平均） | 可按「**4 处计数错报 ＋ 1 次断号 ＋ 18/33 行无就地复核路径**」立项；**仍不得**声称 FP5「治理成本次线性」已被证明，文档里也不得出现任何未经该口径产出的耗时数字 |
| **RF0-4 立项依据的写法** | 同上 | PRD §10.4.1 推论 3 | 不得写成分析文那句「2 次计数错报」——那个数只数了一个类，同类第二类和第二个类都在 `decisions.md` 里有就地记录 |
| **PRD §10.0 单源声明的对外成立性**（2026-10-03 本笔新加，触发 = 同日现测） | **被链接的文件必须已入库**：`docs/analysis-2026-10-02-first-principles.md` 仍是未跟踪态，且**引用它的 PRD 第 10 章整章也没进提交树**（三棵树复算见 §16.13 第 2 笔） | 两条都是命令，不是措辞：`git ls-files --error-unmatch docs/analysis-2026-10-02-first-principles.md` 现测**退出码非 0**；`git show HEAD:docs/PRD.md \| grep -c 'analysis-2026-10-02-first-principles'` 现测 **0**（索引同为 0，工作树为 6）。已升为 `docs-governance-check.md` 的 **FR-3.4**，正向对照用 `docs/specs/m6-cli-injection.md`（退出码 0） | 入库之前，「一切数字与复算命令都在分析文里、本文只按节锚引用」这句话**对外不成立**：GitHub 上每条链接都是死链。⇒ README／release／About 等**对外文本一律不得引用这条单源声明**，要引只能引本文自足的段落。**这笔不需要裁决，需要的是一笔提交 + 一次归属确认**（索引里此刻另有并行会话 staged 的一处 PRD 改动，同文件不可分离，见 §16.13 第 2 笔） |
| **RF1-4**（adapter 夹具） | 判级 A／B **未定**（`adapter-fixtures.md` §8.2①） | §0.3：A 级定义含「golden 快照」，而本项要**往 `tests/golden/` 加**基线；判定规则是「拿不准往高级别归」 | 若 owner 判 A ⇒ 本项**整条挂进 16.4 的 RF4 前置链**（含独立复核与重基），RF1 排期随之重算。规格写成 v0.9 正是为了不让这件事悄悄发生 |
| **RF2 全段** | 分析文 §10 第 1 条：Phase 2 落地前**先做 5 人可用性走查** | 触发条件「『阶段切换』被理解为『功能阉割』」 | 一旦触发 ⇒ 撤回 D28 的 CP1／CP2／CP6，只留 C3（披露可手工配置）与 C5（教学文案）；**growth-path.md 随之作废一半**，这就是它不写 v1.0 的原因 |
| **3-2 update** | 分析文 §10 第 7 条：先统计 `pack_exported` 的**版本增速** | 现成的表就是数据源（`pack_exports`），无外联 | 若增速低到「`clean + sync` 就够用」⇒ 撤回 `update`，保留 `verify` 与 `rollback`；m6 FR-8.1 与 §7.12 f 已把这扇否证窗写着 |
| **RF4 整段** | D25 落地笔 → D32／D33 签字 → 独立复核 → golden 重基 | 队列 ㉛、PRD §10.4 第二组 | 任一未发生 ⇒ RF4 不得开工，且 **1-3 的段级展示必须停在只读**（不得被读成 4-1 已落地的提前兑现） |
| **RF5** | 队列 ㉓（`m7-team-collab.md` §8.2 现为**三条**开口） | m7 §8.2 | 不排期；本轮只把两条方向约束接住并登记，**未替 owner 采纳「变更集」建议** |
| **1-5 的立项话术** | J7 **已闭合**（PRD §10.4.1 的逐表排除） | 同处 | 可以声称「既有表都不够用」，AD2／D29 不撤回；但引用时必须带那张排除表的指针，不得只带结论 |
| **台账的话术风险** | 分析文 §10 第 3 条：被读成「变相遥测」 | 判定方式 = README 与设置页文案能否**不加解释**讲清 | 触发 ⇒ 撤回 D29，或降级为只在内存 + 显式导出（不落库）；`local-event-ledger.md` FR-5 的两节并排文案就是为这条准备的 |

### 16.6 周期口径

**数字的单源不在本节**：RF1+RF2+RF3 的周数、RF0 的「本周内」、合计量级，全部只在 PRD §10.2（那里明写「本章唯一一处做加法」）。本节只登记这些数对排期的三条约束：

1. 任何「先做 RF2 再说」的提议都要回答它怎么绕开 1-1 → 1-5 → 2-x 这条链（16.4），**而不是回答周期够不够**。
2. RF4「待签后另计」意味着**这一段的周期此刻不可承诺**。写 v0.2.0 的发布计划时，把 RF4 记为「未排」，不要记为「0 周」。
3. RF5「远期不计入」不等于不做——它当前的唯一状态是**已裁三前提（D23）+ 规格 v1.1**，`m7-team-collab.md` 的开工闸是任务号（T13 已在 `tasks.md §2c` 挂着，人日未估）。

### 16.7 本轮不建任务组（PRD §10.4 第三组）

原文照抄，因为这句话的效力来自它的字面：

> 本轮**不建任务组**。RF0–RF5 各阶段开工前须先在 `docs/specs/` 补规格，任务组编号（T14 起）待规格落地后在 `tasks.md` 另起。**「RF0–RF5 全量裁定」不等于「任务已排」**

- 现测：`tasks.md` 的任务组上界是 **T13**（`## 2c. P2 任务组` 下的 T12 M4、T13 M7），所以 T14 确实是下一个空号。复算：`grep -o '^### T[0-9]\+' docs/tasks.md | sort -u -V | tail -1` ⇒ `### T13`。**两个坑**：① 这条取的是**上界**，`grep -c '^### T1[0-9] '` 取的是**个数**（现返 4，即 T10–T13 四组），拿后者证明「上界是 T13」是把个数当号——本行第一版就犯了这个错，2026-10-03 就地改；② 少了 `-V` 会按字典序排，`tail -1` 返 `### T9`（T9 排在 T10…T13 之后），是个静默返错值的负对照。
- **v0.9 → v1.0 的三条口子**（三条齐了才许申请任务号，缺一条就是假规格）：① 该 spec §8.2 的待裁**全部闭合**；② 头部「关联任务」格从「无」换成实际任务号（`docs-governance-check.md` FR-2 会把这一格当成可机判项来查——它自己查自己）；③ 治理电池对它报 0 违规（含 §7.7 未验证面仍在、未被勾销）。
- 先例照 `m4-playbook.md`：v0.9 → 七裁 → v1.0 → v1.1，每步一条版本行，**待裁清单不空就不许升 v1.0**。

### 16.8 不做清单

**分析文 §7.1 七条全采**（PRD §10.3 已整段采纳，此处不重述理由）：不引入 i18n 框架／第二语言 · 不引入服务端渲染／换前端框架 · 不做云端账号与云同步 · 不做后台常驻与系统级文件监听 · **不做 LLM 推断式候选提取** · 不做双向同步 · 不为「治理太重」而删除既有登记。

**PRD §10.3 另加三条**：不重写技术栈 · 不重新划分五类资产 · **不新增网络面**。

**本节对 RF 线单独加三条**（都在本轮写规格时被具体撞到过，不是泛泛的自律）：

- ❌ **CP4 不越界**：`growth-path.md` FR-9 的复盘候选是**确定性提取**（显式 `[[术语]]` 或选中段落点按钮）。`m4-playbook.md §2 Out` 那条「自动从日志提取候选」不作废；要引入 LLM 推断，须先有一次**独立的 B 级裁定 + 明确的质量判据**。
- ❌ **1-3 不提前兑现 4-1**：段级差异展示是**只读**的，整文件 sha 判定一字不改；产物里出现「段级受管标记」属 4-1 的授权面，本轮任何规格都不写它。
- ❌ **`consistency` 不写进 `pack.lock.json`**：lock 形状是 A 级冻结契约，一致性状态**每次现算**（理由三条写在 `write-selfproof.md` 与 m6 FR-7.7）。这是本节最容易在实现时被「顺手加个字段」破掉的一条。

### 16.9 分析文 §10-8 的重采样登记（转入任务时的「全部数字再采一次」，本轮已执行）

采样对象 = **`54789b8` 的工作树**（2026-10-02 首采，**2026-10-03 本轮逐行复跑**；构建产物一列取自 `apps/web/dist/` 的**文件字节数**，未为本次采样重跑构建）。判读汇总：**十行里 7 行同口径可复算 · 1 行数值不符但成因是「两棵不同的树」（`export *`）· 1 行是三条口径并立、判定被本轮先立后撤（`shared` 引用点）· 1 行分析文根本没记（`compat.ts`）**。**另有两处本轮纠正的是我自己 10-02 那次登记的东西**：「adapter 薄实现 5 个」是口径污染（4 才对），「121 已腐」是**复核动作没先查文档里现成的命令**而误立的判定（121 一直是对的）。所以这一节的内容从「重采分析文的数」升级成「重采分析文的数 ＋ 复核我上一轮重采的数」，后一半是本轮撞出来的、原计划里没有。

| 量 | 分析文 | 现测 | 判 | 复算口径 |
|---|---|---|---|---|
| 入口 chunk ／ 余量 | 299,978 B ／ 22 B | **299,978 ／ 22**（`index-Cdha5hfz.js`；上限 `entryMaxKb:300` 在 `scripts/bundle-check.ts`） | ✅ 未腐 | `stat -f '%z %N' apps/web/dist/assets/index-*.js` |
| 最大 chunk | 347,445 B | **347,445**（上限 500,000） | ✅ | 同法取全产物 max |
| `zh.ts` | 786 行 ／ 52 引用点 | **786 ／ 52** | ✅ | `wc -l apps/web/src/i18n/zh.ts` ＋ `grep -rl "i18n/zh" apps/web/src --include="*.tsx" --include="*.ts" \| wc -l`（口径是**引用它的文件数**，不是 import 行数——两种读法都能叫「52 个引用点」而给出别的数） |
| `shared` 的 `export *` | 13 | **15** | ❌ 不符，但**成因是两棵不同的树，不是腐烂**：多出的 2 条是 `interview.ts` 与 `roadmap.ts` 的导出，而这两个文件此刻是 **未入库**（`?? packages/shared/src/interview.ts`、`?? packages/shared/src/roadmap.ts`，并行会话产物）⇒ 分析文在提交树上没错，本轮在脏工作树上也没错 | `grep -c '^export \*' packages/shared/src/index.ts`（其余九个文件各 0，口径无歧义）；对照用：`git show HEAD:packages/shared/src/index.ts` 同法数 ⇒ **13** |
| `shared` 引用点 | 135 | **两个数都成立，是两条不同口径**：135（分析文口径，`@openvibe/shared` 一切命中、辖域 `apps/*/src packages/*/src`）· 121（本轮规格口径，只数 `from '@openvibe/shared'` 这个串且排除 `.test.` 与 `dist`）· 155（辖域放宽到含 `test/` 目录） | ⚠️ **「121 已腐」这个判定本轮先立后撤**：我一度判它复算不出，是因为**没先去文档里找它自己记的那条命令**——`entry-budget.md` §3 的现测行里就写着口径与管道，照跑即得 121。**错在复核动作，不在数**。结论改为：分析文与本轮规格都没错，但**引用点数必须带串形与辖域**，否则同一件事有三个「现值」而读者无从判断谁腐了 | 135：`grep -rn "@openvibe/shared" apps/*/src packages/*/src --include="*.ts" --include="*.tsx"` 的命中行数；121：`entry-budget.md` §3 那条（含两个 `grep -v` 环节）；155：把辖域换成 `apps packages` |
| adapter 薄实现 | 4 个 11 行 | **4**（`claude-code`／`codebuddy`／`generic-agents`／`minicode`） | ⚠️ **同样是本轮纠正自己**：先前记的「5 个（含 `index.ts`）」是**口径污染**——`index.ts` 恰好也是 11 行，但它是 barrel 不是 adapter。分析文的 4 在自己口径下仍准 | `wc -l packages/adapters/src/*.ts`（11 行的确有 5 个文件，判「是不是 adapter」要看内容：`cursor.ts` 26／`trae.ts` 32 是带规则目录的异形 adapter） |
| adapter `compat.ts` | **未记** | **48 行，存在** | ⚠️ 分析文漏 | `grep -c '^' packages/adapters/src/compat.ts`（本轮把它认作 1-4 矩阵生成器的现成家，见 `adapter-fixtures.md`） |
| 迁移的 `CREATE TABLE` | 19 处 ／ 16 实表 | **19 ／ 16** | ✅ 与 PRD §10.4.1 的 J7 穷举同数 | `grep -rcE 'CREATE (VIRTUAL )?TABLE' packages/core/src/db/migrations/*.sql`（逐文件相加 = 19；减 `skills_new` 过渡态与 2 张 FTS5 虚表 ⇒ 16 实表） |
| DEV ／ CHECK ／ 队列行 | 96 ／ 0 ／ — | **96 ／ 0 ／ 33** | ✅ CHECK 仍为 0（这就是 0-4 的立项现场） | DEV：`grep -cE '^## \[DEV-[0-9]{4}\]' DEV_LOG.md` ⇒ 96（**这是本行采样时点的值**：`DEV-0089` 一落笔工作树就变成 97——同一笔自己把现测顶走，正是 §16.12 第 10 行的形态；本行判读只看 CHECK，总数只认这条命令的现跑结果）。**CHECK 的口径必须是「段落标题」而不是「字样」**：`grep -cE '^## \[CHECK-[0-9]' DEV_LOG.md` ⇒ 0，而 `grep -c CHECK DEV_LOG.md` ⇒ **7**（正文提及，非独立条目）——用后者读这条会当场判我报错。队列行：**必须用 python3**（`python3 -c "import re;print(sum(1 for l in open('docs/decisions.md',encoding='utf-8') if re.match(r'^\| [①-㉟]+ +\|', l)))"` ⇒ **33**）——同一正则用 BSD `grep -cE` 跑出来是 **21**，`[①-㉟]` 只认到 ㉑、㉒–㉝ 那 12 行被静默丢掉，且它给的是一个像样的数而不是 0。这条已写成 `docs-governance-check.md` 的 FR-2.4／2.5（本行是它的现场凭据） |
| `local_events`／`verify`／四个 `*Service` | 未建 | **三处均 0 命中** | ✅ 确为空地（本轮规格的落点前提） | `grep -rn "local_events" packages/core/src apps/server/src apps/cli/src --include="*.ts"`（**glob 必须加引号**，zsh 会吞掉未加引号的 `--include=*.ts` 并返回假的 0） |

**四条教训要带走**（前两条与 §15.5-12「登记数字必须同处登记口径」同族，且本轮是它自己复发了一次）：

1. **假 0 与假「腐烂」都是探针的错，不是仓库的错**。最后那行的假 0 来自 zsh 吞掉未加引号的 glob；「121 已腐」来自**复核时没先在同一批文档里找它自己登记的那条命令**（`entry-budget.md` §3 就写着口径和两个 `grep -v` 环节，照跑即得 121）。所以规矩要加半句：**宣布某个现测「复算不出」之前，先在文档里找它的口径；找不到口径本身才允许这么说，且说了要能被别人推翻**。本轮这一条是我自己撞的。
2. **比对必须声明是哪棵树**。`export *` 的 13→15 完全由工作树里两个**未入库**文件造成；拿脏工作树对提交树下的结论，会把「并行会话的在制品」读成「文档腐烂」。本表的处置是**两个数都写**，并各标自己的树（`git show HEAD:<file>` 那条就是给读者留的对照位）。
3. **每个 0 都要配一个正向对照**（本表最后一行的 `telemetry_events` 就是干这个的）：同一条命令换个必然存在的词，命中非零才证明口径通。零命中本身不说明任何事——它可能是「真的没有」，也可能是 glob 被 shell 吃掉、路径写错、或扫了空的目录。
4. **比 0 更坏的是「像一个合理的大数」的错值**。本轮收尾复算队列行时撞出：同一正则 `^\| [①-㉟]+ +\|`，BSD `grep -cE` 返 **21**、python3 返 **33**——区间字符类只认到 ㉑，㉒–㉝ 那 12 行被静默丢弃。它不报错、不返 0，返的是一个「比 33 小一点、看着像我没数全」的数，**恰好落在最容易被人自我怀疑成自己算错的区间**。⇒ 处置写进 `docs-governance-check.md` FR-2.4／2.5：**跨多字节序号（①②③…㊿）的计数禁用 shell 区间字符类，且登记时必须写清用的哪个工具**。前一条教训（正向对照）挡的是假 0，这一条挡的是假非零——两道都要有，因为它们的失效形状相反。

### 16.10 现有闸不放松（PRD §10.5 末段的本节镜像）

`bundle:check` 的入口／chunk 阈值与**单 `<script>` 断言** · `seed:check` 的三个精确值 · `pnpm lint`／`typecheck`／`test` · 三平台 CI 与 `three-smokes` 的 `EXPECT_SKIP` · `tests/golden/` —— **全部不动**。RF 线新增的只有两样：**差值归因信息**（0-2，不改阈值只改失败时的输出）与 **`docs:check` 第六道闸**（0-4）。

- 0-1（i18n 拆分）**不许**顺手调阈值来「让门禁过」。它的出口判据就是「入口回落 ≥ 15 kB」，是**体积真的变小**，不是门禁让路。
- 1-4 若被判 A 级，它动的是 golden 的**新增基线**，走 16.4 的链，不走「顺手加一个快照」。
- `docs:check` 自己也要被管：规则条数 > 8 即触发分析文 §10 第 4 条的复审（「治理即代码变成第二个官僚层」），触发处置是撤回 11-a 只留 11-b 最小集。**口径必须写死，否则这条触发器会被误读成已经响过**：数的是**能红能绿的独立判据条数**。按 `docs-governance-check.md` 现规格逐条数：FR-1 编号连续唯一｜FR-2 队列枚举与计数自洽｜FR-3 单源可解析｜FR-4 版本链单调｜FR-5 登记五段齐备｜FR-6 A 级变更模板 = **6 条**，再加 **FR-9 的「冻结面零 diff」判据**（同一条 FR 里「进 CI」是接入动作、不是判据）= **共 7 条**；FR-7（MT4）与 FR-8（MT6）是**输出面**，各产一个数、不判红绿，不计入。**7 ≤ 8 ⇒ 未触发，但只剩一格余量**——下一轮再加任何判据都会当场触发，那时要先做的是按本条给出处置（撤回 11-a），不是把闸调松。另一种数法会立刻判它已越线：按 FR 号数是 9、按子条（FR-2 已拆到 2.1–2.5）数是 13，**所以本条不是措辞问题，是闸的启动条件本身**。**同日本笔补一条口径澄清，否则下一轮会误判已触发**：`docs-governance-check.md` 当日追加了 **FR-3.4（相对链接目标必须已入库）** 与 **FR-1.4（重号的补记除外规则 ＋ 当前基线违规）**，两条都是**子条**，判据数仍为 7——本口径的单位是「能红能绿的独立判据」，一个 FR 无论拆到几子条都只产出一道红绿。**反向的那笔账要写清**：「按子条数」这个替代数**不可写死**——本笔之前它被记为 13，本笔加两条子条后当场就变了，所以这里只给口径不给数（`grep -cE '^- FR-[0-9]+\.[0-9]+' docs/specs/docs-governance-check.md`），且该数**不构成 §10 第 4 条的触发判断**；把它当依据的写法每轮都会自己制造一次假触发。**7 ≤ 8 且余量仍是一格**，这条没有把它吃掉（吃掉它是 FR-3.4 被写成独立 FR 的后果，故当场选择挂到子条位）。这条已写进 `docs-governance-check.md` 的 FR-9 边界。

### 16.11 两处无落点的缺口——登记，不自裁

PRD §10.2 给的单源是「RF0–RF5 ＝ 分析文 §7 的六个 Phase 表」。**按这张表，下面两条没有任何落点**，因此它们**不属于 RF0–RF5**，也不属于本节该替 owner 补的范围：

| 缺口 | 它本来的位置 | 为什么没有落点 | 处置 |
|---|---|---|---|
| **AD1 的后半**（`better-sqlite3` 载入失败时的**可读诊断**） | 分析文 §4.2，其 §10 第 6 条给了它一个否证器 | Phase 0–5 表里没有一行提它；PRD §10.2 的判级构成里也没有 | 待 owner 裁：要么并进 0-x（它是「装不上时的第一屏」，与 RF0 的「解除阻塞」同性质），要么归 P2/P3。**我不扩 PRD §10.2 的表** |
| **AD11 的 11-a**（`docs/queue.yaml` 队列结构化） | 分析文 §4.11 三条子里最重的一条 | 同上——Phase 表只收了 11-b（0-4）与 11-c／11-d（3-5） | 代价要写清：0-4 只让**计数错报事后报警**，让它在结构上不可能发生的才是 11-a。㉜ 已登记 4 处错报，**少 11-a 就会长第 5 处**。MT5（治理维护成本）的半边也挂在这里（16.3 已记） |

两条共同的形状：分析文自己在 §7 表末把它们划到「本文不给排期」的一侧，而 PRD §10.2 照抄了这一侧。**这不是遗漏，是未裁**。

### 16.12 本轮写规格撞出的事实缺口（先例 = §15.5）

十条（原八条，本笔补第 9、10 两条）：前七条全是撞出来的、不是设计时想到的，**共同点：每一条都足以让下一轮「按文档行事」的会话做出错误决定**，所以逐条登记并指回规格。第 8、9、10 三条不同——它们撞的是**文档自己的数字纪律**（第 8 行是本文头部「上游」行，第 9 行是 §0.2 的 dogfooding 阶段映射表，第 10 行是本轮新写的规格与工具文案），三条都是分析文 §8.1 那张漂移表的同类。**三条的递进关系就是本节最有用的结论**：第 8 处抄的是**别人**的数，第 9 处是**同一族没扫到的第二处**，第 10 处是**自己刚采的数也被自己随后的动作作废**——所以规矩不能是「采得勤」或「带日期」，只能是「不进字面量」。

| # | 缺口 | 现测凭据 | 落在哪份规格 | 性质 |
|---|---|---|---|---|
| 1 | **MT2 的左端点没有任何承载** | `app_meta` 是 `key TEXT PRIMARY KEY, value TEXT NOT NULL`（`packages/core/src/db/migrations/0002_app_meta_telemetry.sql`）**没有时间戳列**；`APP_META_KEYS` 三键里与首启有关的只有一个布尔 `onboardingDone`；台账 kind 闭集里没有首启类 | `onboarding.md` FR-5.3 ＋ §6 待裁①（三条出路） | **待裁**，且裁前 MT2 不得显示 |
| 2 | **`rollback` 在产品里已有主人**（资产版本语义），不是空地 | 代码 6 处命中全在资产侧（`apps/web/src/components/library/VersionHistoryPanel.tsx` 的 rollback 调用与 `apps/web/src/i18n/zh.ts` 的「回滚到此版本」），CLI 侧 `.command('rollback')` **0 处**。复算：`grep -oE "\.command\('[a-z]+'\)" apps/cli/src/index.ts \| sort -u` ⇒ 现为 5 个命令 | `m6-cli-injection.md` §6.12 ＋ §8 待裁①；**FR-9 整条阻在这里** | 同名异物 ⇒ 命名必须区分，否则文档与 UI 各说一件事 |
| 3 | **`verifyPack` 与 `verify` 近名，是两个不同的谓词** | `apps/cli/src/pack-source.ts` 的 `verifyPack(raw, contents, origin)` 查的是**包内自洽**（fingerprint／manifest／内容），不碰盘；新 `verify` 查的是**包／lock／磁盘**三方 | m6 FR-7.3 显式分工 ＋ §6.13「谓词分工，不得合并」 | 已在规格里钉死；实现时把两者混用会造出一个「绿了但什么都没验」的命令 |
| 4 | **备份目录今天是只写不读，且保留策略零规则** | `sync`／`clean` 只有 `copyFileSync` 进 `.openvibe/backup/<ts>/`，**无任何读回路径**；`clean` 的收尾提示写的是「可逐个复制回去」（手工）。复算：`grep -rn "backup" apps/cli/src/commands/clean.ts` 命中里无 read 侧 | m6 FR-9.4（登记为缺口）＋ §8 待裁③ | `rollback` 是**第一条读侧腿**；它一上线，这个目录就从卫生问题变成数据保全问题 |
| 5 | **M7 的 `usage/<署名>.jsonl` 与 `local_events` 会同屏双写** | `m7-team-collab.md` FR-6.2 由 CLI `sync` 写明文文件，而 `local-event-ledger.md` FR-3 把写入点集中到服务层——两条都成立时，同一事实有两个作者、两个时刻 | m7 FR-6.5 ＋ §8.2 待裁③（派生视图 vs 平行写两案，推荐倾 (a) 但不自裁） | 选 (a) 会把 RF5 排到 RF1-5 之后；选 (b) 必须加跨面同键相等断言 |
| 6 | **「台账」现在一名两指** | M2 的「Skill 台账」（`m2-skill-registry.md`）与 AD2 的「事件台账」（`local-event-ledger.md`）都叫台账，而后者是 append-only 事件流、前者是登记簿 | m7 FR-5.5：**记位置不记次数**（复算命令会随我自己的追加而变，故只列出现处） | 建议把 M2 侧改称「登记簿」，属措辞裁定，归 owner |
| 7 | **分析文 §4.10 的「继续用 zone 钉住」按 eslint 的形状做不到** | `import-x/no-restricted-paths` 的 zone 只管目录对（target／from），管不住 `fastify`／`commander` 这类**传输依赖**（`eslint.config.js` 的 `boundaryZones` 现形制） | `service-layer.md` FR-4 拆成两条形制：新 zone（禁向上依赖）＋ 新 `no-restricted-imports` 块（传输无关） | 规格已按可行形状写，并在原处注明此处更正分析文 |
| 8 | **本文头部「上游」行抄了两个会腐的数**（PRD 版本号 + specs 支数） | 现测于 2026-10-03 工作树：本行写「v0.1.4／×8」，而 PRD 版本格现值 = **v0.2.0（2026-10-02）**（复算 `grep -m1 '^\| 版本 \|' docs/PRD.md`），`docs/specs/*.md` 现数 = **21**（复算 `ls docs/specs/*.md \| wc -l`，其中 9 份本轮新建） | 本文头部「上游」行（已就地删号，规矩同下一行对 `decisions.md` 队列上界的自陈）；不需新规格 | **C 级就地修 + 留痕**：该行未被任何 D 号授权，且 §13-8 明写「记位置不记次数」——本轮加 9 份 spec 的瞬间，「×8」就同时错了两次号 |
| 9 | **同族缺陷本文还有第二处**：§0.2「dogfooding 阶段映射」表把 PRD 版本号与 specs 支数**当现状**抄了进去 | 现测于 2026-10-03 工作树：该行写「PRD v0.1.3（变更日志 5 版）」与「specs/×8（m1/m2/m3/m5/m6a/m6b/seed/onboarding）」，而 PRD 版本格现值 = **v0.2.0（2026-10-02）**、变更日志表行现值 = **12**（复算 `grep -cE '^\| v0\.' docs/PRD.md`）、`docs/specs/*.md` 现数 = **21**（复算 `ls docs/specs/*.md \| wc -l`）；那份清单另已漏掉两支**早在本轮之前**就入库的 spec（`m4-playbook.md` 2026-09-30、`theme.md`） | 不需新规格（第 8 行立的「记位置不记次数」已覆盖）；两处均已**就地删号 + 留痕**，单源分别指回 PRD 头部版本格与 `docs/specs/` 目录本身 | **C 级就地修 + 留痕**。真正的教训不在第二处数字，而在**第 8 行登记完就收工**：那次只指了头部一行，没跑同族扫描，于是第二处活到了本轮之后。同族复算：`grep -nE 'PRD v0\.[0-9]+\|specs/×\|specs ×' docs/dev-plan.md docs/PRD.md docs/tasks.md README.md` ⇒ 修完后余下三处命中**全是带日期的历史陈述**（`docs/tasks.md` G1 行的「PRD v0.1.2 第 0 章」、本文 §15.5-11 与 §15.5-15 的时点话），不是现状断言，按「日志不回改」原样留 |
| 10 | **同族第三处，形态更坏：本轮自己新写的规格与工具文案里各写死了一个「当日现测数」，其中一个被同一笔随后的动作作废** | (a) `docs/specs/docs-governance-check.md` FR-4.1 原写「现测 12/12 已有」——本轮新建 9 份 spec 的那一刻它就腐了，同法复算现为 **21 = 21**（`ls docs/specs/*.md \| wc -l` 与 `grep -l '^\| 版本 \|' docs/specs/*.md \| wc -l` 两数）；(b) 给个人电池加 `SCOPE=diff` 时，顺手在它的提示文案里写「现测 DEV_LOG.md = 273」，**本笔登记追加完的三十秒内该数变 275**，遂删数留口径。（两个工具输出的数从此只作观察量，**本行故意不抄它们**——抄了就是下一个） | 由 **FR-4.1 改分式判据**（通过数 = 总数即绿，份数不进字面量）＋ 新增 **FR-5.5** 接住（存量／增量两档的实现口径 = `SCOPE=diff`；约束 (b) 明写「基线数字不写进闸自身的输出文案」） | **C 级就地修 + 留痕**。**这一处与第 8、9 行的区别必须说清**：那两处抄的是别人的数，本处写的是**自己刚采的**数——采得再新鲜，只要落成字面量就一定腐。所以本仓 §13-8 的要害不是「带采样日期」而是**「不进断言字面量」**：带日期的数只是腐得可追责，不腐的唯一形态是写成比值／存在性 ＋ 一条复算命令 |

### 16.13 本轮的两笔痕迹欠账（如实报，不硬塞）

1. **`DEV_LOG.md` 本轮未追加** → **本笔已就地补上 `[DEV-0089]`（三笔合一：PRD 第 10 章开档 + RF0–RF3 规格落地 + 本轮未通过/待增强收口），残留只剩「未入库」**。原判断是「此时取号会撞号，故由提交人同笔补」——**该判断被本轮的现测加强而不是推翻**：工作树里 `DEV_LOG.md` 有 **7 组真撞号**（0044／0045／0046／0074／0075／0076／0077 每号一支已入库 + 一支未入库新笔；复算 = `python3` 按 `^## \[DEV-(\d{4})\]` 分组，两树各跑，口径见 `docs-governance-check.md` FR-1.4），**成因正是「各自按自己采样时点的最大值取号」**。⇒ 本笔按 FR-1.2 取两树最大号 0088 + 1 = **0089**（现测 = 工作树该号标题 **1 支**、提交树 **0 支**，差值就是「本笔尚未入库」这一件事本身；引用处按 §13-8 记位置不记次数——除登记自身，只有 `docs-governance-check.md` FR-1.4 与本文 §16.13 第 1 笔两处指针），并把撞号风险写进该条风险②，而不是继续把它当不取号的理由。**为什么不再等提交人**：这一条的欠账本身会让 MT6／FR-1 的违规基线漂多一轮，而取号纪律的破口要靠「有人按规矩取一次并留下复算」来收，不靠少取。
2. **分析文与 PRD 第 10 章都还没入库——本笔把原登记的严重度改判为「低估」**。原写「分析文仍未入库（`??`）」并把后果限定为「本文对它的 markdown 链接是断链」。2026-10-03 复算三棵树，实测范围更大：`git show HEAD:docs/PRD.md | grep -c 'analysis-2026-10-02-first-principles'` ⇒ **0**，`git show :docs/PRD.md | grep -c '同串'` ⇒ **0**，工作树同法 ⇒ **6**；`git diff --numstat -- docs/PRD.md` ⇒ **+182/−4**。**结论**：断链的成因不是「分析文一个文件没提交」，而是**引用它的那一整章也还挂在工作树**——两者必须同笔落地，单独提交分析文修不好任何一条链接。**为什么这笔不能由我顺手 commit**：索引里此刻另有并行会话 staged 的一处 PRD 改动（`git diff --cached --numstat -- docs/PRD.md` ⇒ **+1/−1**；`git diff --cached -- docs/PRD.md` 现读内容 = 把第 4 章 P1 行的「20 精选提示词」改成指向 `specs/seed-content.md` FR-4 的单源写法，属 `[DEV-0059]` 那条线）。它与本轮第 10 章的改动**在同一个文件里**，任何形态的 `git commit -- docs/PRD.md` 都会把那行按**我的**作者身份带进提交——共享工作树里这条我踩过（路径限定的 add／commit 仍会吞别人在同一文件的未提交行）。**处置**：归属由 owner 定，本轮不代决。本轮能做且已做的是把这件事从「靠人记」变成「可由闸判定」——§16.5 前置表加一行「单源声明的对外成立性」，并把该检查升成 `docs-governance-check.md` 的 **FR-3.4**（正向对照 `git ls-files --error-unmatch docs/specs/m6-cli-injection.md` 退出码 0，负向即今日的分析文）。

### 16.14 待裁总账（本轮新登记 42 条）

| 来源 | 条数 |
|---|---|
| 9 份新规格 §8.2 | **36**（entry-budget 2 · docs-governance-check 3 · service-layer 3 · local-event-ledger 4 · write-selfproof 4 · adapter-fixtures 4 · growth-path 6 · context-density 5 · output-validation 5） |
| `m6-cli-injection.md` v1.11 §8 | **4**（两个 `rollback` 的命名／`update` 选择粒度／`backup/` 保留策略／`verify` 第四态无写入留痕时叫什么） |
| `onboarding.md` v1.2 §6 | **1**（MT2 左端点用什么承载） |
| `m7-team-collab.md` v1.1 §8.2 | **1**（`usage/*.jsonl` 平行写 vs 台账派生视图；该节另两条 ①② 是 D23 三裁时就挂着的旧账，不算本轮） |

**最要紧的四条**（其余 38 条按各自规格 §8.2 逐条裁即可）：**① 1-4 判 A 还是 B**（决定它挂不挂进 RF4 前置链、RF1 排期要不要重算）· **② 两个 `rollback` 怎么区分命名**（FR-9 整条阻塞）· **③ RF2 的五人走查先不先做**（不做就是拿 D28 的三裁赌一次实现）· **④ MT2 左端点的承载**（不裁则 PRD §10.5 承诺的「北极星首次获得机读源」只覆盖 MT1／MT3–MT6，缺 MT2）。

**这四条裁完各要改哪一格**（2026-10-03 本笔补；先写下来是为了让「裁了」与「落地」之间有可核对的格子清单，不至于下一轮再反推一次、反推错了就是新的错报）：

| 裁哪条 | 裁完要动的格（逐格列，单源不复制结论） | 不裁则哪一格一直悬着 |
|---|---|---|
| **① 1-4 判 A／B** | `docs/specs/adapter-fixtures.md` 头部「优先级」格 ＋ §8.2① 的裁定记录；本文同笔四处：§16.2 落点全量表 1-4 行（现写「v0.9 · 待裁 4，**判级未定**」）、§16.4 依赖图 1-4 节点（现写「可能整条挂进 A 级链」）、§16.5 前置表 RF1-4 行、§16.10 第二条 bullet | RF1 的排期定不下来；§16.4 那张图上的条件态一直挂着 |
| **② 两个 `rollback` 的命名** | `docs/specs/m6-cli-injection.md` 的 **FR-9**（命令名本身）＋ §6.12 ＋ §8 待裁①；**若裁成改 CLI 侧名**，PRD 附录 **D31** 那行含 `openvibe update` / `openvibe rollback` 字样——那是 owner 已裁的决策文字，**改字权在 owner，本笔不代改**，只在裁定里点名它 | m6 **FR-9 整条阻塞**；文档与 UI 继续各指一个 `rollback` |
| **③ RF2 五人走查先不先做** | 做 ⇒ `docs/specs/growth-path.md` 停在 v0.9 直到走查结论入账，并同批改 PRD 附录 **D28**（CP1／CP2／CP6 是否撤回）、本文 §16.5 的 RF2 行与 §16.2 的 RF2 各行；不做 ⇒ 撤掉 §16.5 那行前置，`growth-path.md` 才具备升 v1.0 的条件 | RF2 全段落点顺序未定；D28 三裁等于没被验证过 |
| **④ MT2 左端点的承载** | `docs/specs/onboarding.md` 的 **FR-5.3** ＋ §6 待裁①（三条出路 (a) 台账加首启类 kind／(b) 新迁移给「首启」配带时间戳的载体／(c) 退化为「首次注入时刻 − 首条资产时刻」的本机现算近似）；本文 §16.3 MT2 行（现写「算不出」）与 §16.2 的 2-4 行；PRD §10.5 那条「北极星指标首次获得机读源」要补一句它此刻覆盖哪几个 MT | 面板不得显示 MT2；PRD §10.5 的承诺实覆盖 **5 个度量、缺 MT2** |

**复算口径**（本表数字的扫法，供 owner 或下一轮复核）：`python3` 逐份数 §8.2 块里以 `| ①`…`| ⑫` 开头的表格行——两个扫法陷阱必须一起带上：**(a)** m6 与 onboarding 的待裁用**bullet**（`  ① …`）不用表格，同一条命令扫不到；**(b)** `m4-playbook.md` 有 7 行同形状命中，但那节标题是「**裁定记录**（原待裁清单，2026-10-01 闭合）」，属已闭合项，不得计入待裁。**这两个坑是本轮现撞的**：第一次全库扫得到 52，按上面两条修正后才是 42（本轮）＋ 8（旧账：`m2-skill-distribution.md` 6 条 + m7 ①②）。

---

## §17 M4 技巧库开发计划（T12 落地轮 · 2026-10-03 开档）

> **本节是 `docs/tasks.md` §2c·T12 那格「人日未估」的对账**，单源在本文 §17.4；T12 格只回指不复述数字（§13-8「记位置不记次数」的同族纪律）。
> **规格单源是 `docs/specs/m4-playbook.md` v1.1**，本节不复述 FR 全文，只做三件事：把 §2c 停了几轮的「实现工作面」一条依赖链拆成可派工的工作包、给出人日与并行度、登记**实现期撞出的四处方言缺口**（17.6）。
> **开工依据是 owner 本轮的显式指令**（「对于没有开发的 phase，本次制定开发计划一并实现」），它覆盖 §15.1-9 那条 standing 指令的第 5 段。因此本节**不改判 §15.1-9**，只在 17.7 写清本轮解开了哪几道闸、哪几道仍未解。

### 17.1 本轮的工作面为什么是「整条链」而不是「几块砖」

M4 在 PRD §3.2 是资产层第四格，但它的**价值出口不在自己页面**——spec §5 写死了：技巧本身不写用户项目文件，只经 M6 组包渲染成 `PLAYBOOKS.md` 由 CLI 注入。所以「技巧库做完」的可判定形态不是「页面能开」，而是：

```
技巧入库 → 进选集 → 组包解析出快照 → composer 产出 PLAYBOOKS.md → 指纹与 lock 登记它
        → ≈token 估算收录它 → 注入侧真的读到它
```

这条链上**任一环断开，页面上看着完好的技巧库就是一件没用的东西**。这解释了为什么本节把工时拆成九个包而不是「先做页面」（demo 那种做法恰好是反的：它给了一个锁页，并把链路留空）。

### 17.2 九个工作包（依赖序，非工期承诺）

| # | 工作包 | 落点 | 依赖 | 级 |
|---|---|---|---|---|
| **W1** | `LIMITS` 四键 + `schemas/playbooks.ts`（FR-1 结构 + FR-4.1 收紧） | `packages/shared/src/constants.ts`、`packages/shared/src/schemas/playbooks.ts` | 前置①（`[DEV-0088]` 已闭合） | C |
| **W2** | 迁移 + FTS 三触发器 | `packages/core/src/db/migrations/0006_playbooks.sql` | — | C |
| **W3** | `PlaybooksRepo`（FR-2：`findByNaturalKey` 复合键、`sortForMd` 码点序、三条 `related*` 闸）＋ `searchPlaybookRowids` | `packages/core/src/repos/playbooks.ts`、`packages/core/src/search/fts.ts` | W1 · W2 | C |
| **W4** | `playbooks-md.ts` 渲染器（FR-6，全常量纪律） | `packages/shared/src/playbooks-md.ts` | W1 | C |
| **W5** | 六端点 + 注册 | `apps/server/src/routes/playbooks.ts`、`apps/server/src/app.ts` | W3 | C |
| **W6** | 组包接入（FR-7）＋ **拆 `playbookIds` 闸**（FR-8） | `pack-contract.ts`、`schemas/pack.ts`、`pack/resolve.ts`、`pack/composer.ts`、`lib/pack-assemble.ts` | W3 · W4 · **前置②③** | **A**（W6 后半） |
| **W7** | 预置 seed ＋ `seed:check` 门槛 | `content/seed/playbooks.json`、`packages/core/src/db/seed.ts`、`scripts/seed-check.ts` | W3 · W5 | C |
| **W8** | Web 页 + 组包向导第 2 步 + 复盘回流第三目标 | `apps/web/src/pages/PlaybooksPage.tsx`、`components/playbooks/`、`components/packs/PackWizard.tsx`、`components/projects/ReflowActions.tsx` | W5 | C |
| **W9** | 三测试族 ＋ FR-8 零回归凭据 | `playbooks.test.ts`×2、`apps/server/test/playbooks.api.test.ts` | W1–W8 | C |

**级判定**（§0.3）：只有 **W6 的「拆闸」那一刀**是 **A 级**（动 `design §7` 契约面、golden 快照面、`schemaVersion` 同居的那一面）。其余八个包全判 C——它们新增文件、新增端点、新增页面，不改任何既有契约的形状。**W6 前半（组包接入）本身也是 C**，因为它在选集为空时字节不变；把它和拆闸捆在一个包里只是因为两者改同一个文件、分开派工会出现同文件双写。

### 17.3 串行/并行怎么切（这一段是本节唯一有排期价值的内容）

依赖图只有两条真边：**W6 依赖前置②③**、**W8 依赖 W5**。其余可全并行。按这个图切：

- **轨道 1（后端契约）**：W1 → W2 → W3 → W4 → W5 → W7。这是链最长的一段，且它的每一环都是下一环的模板。
- **轨道 2（A 级那一刀）**：W6，**只能在 W1–W5 全绿之后动**。它之所以独立成轨，是因为它的失败模式最贵——拆闸的零回归凭据（spec §7.4）一旦不过，回滚面是「契约面已动而基线未复算」。
- **轨道 3（前端）**：W8。起点是 W5 的六端点契约，**不依赖 W6**——`PlaybooksPage` 先能建能查能改，`PLAYBOOKS.md` 的组包腿晚一步接上，中间那段用户看到的是「技巧能管但还进不了包」，可接受。

**关键路径 = 轨道 1**。人日 5.2 的估算（17.4）里轨道 2 只占 0.6，但那 0.6 是**不可并行压缩**的——它要等前两条轨道的产物齐。

### 17.4 人日估算（首次给出 · 口径写死）

| 轨道 | 包 | 人日 | 估法 |
|---|---|---|---|
| 1 | W1 | 0.3 | 照 `schemas/term.ts` 镜像，四键 + 一个 `superRefine` |
| 1 | W2 | 0.2 | 照 `0001_init.sql` 两段复制，三触发器逐形对齐 |
| 1 | W3 | 0.5 | 仓储层最大的一块：三条 `related*` 闸 + 幂等 + 码点序 |
| 1 | W4 | 0.2 | 纯函数，全常量纪律 |
| 1 | W5 | 0.3 | 照 `routes/terms.ts` 六条端点 |
| 1 | W7 | 0.8 | 代码 0.3 ＋ **内容 0.5**（10 条真实条目起草与自校，见下） |
| 2 | W6 | 0.6 | 组包接入 0.3 ＋ 拆闸与零回归凭据 0.3 |
| 3 | W8 | 1.2 | 页面 + 组件 0.8 ＋ 向导/回流两处既有面接入 0.4 |
| 3 | W9 | 0.5 | 三族骨架 0.3 ＋ FR-8 凭据取证 0.2 |
| | **合计** | **5.2** | 三轨并行 ⇒ **日历 ≈ 3.2 天**（关键路径轨道 1 = 2.3 天 ＋ 轨道 2 串在其后 0.6 ＋ 缓冲） |

**两处估算纪律，写下来是为了下轮能核**：

1. **W7 的 0.5 内容人日不可压**。Duke 是 10 年金融安全从业者，**「某银行」「某项目」这类占位符在 10 秒内就会被识破**，而种子内容的审校成本（agent 起草 → 人工逐条过 → 返修）正是 §11.3 那张清单的用途。这 0.5 不是打字，是审校。
2. **本表是人日不是日历承诺**，且**不含 §7.6 的四条人工腿**（截图归档 + 裸 CDP 真点击）。spec §7.7 第 2 条已明写本仓的断言止于 jsdom 与端点级，**UI 那一半的证据必须另算**——把 1.2 读成「UI 已验证」是误读。

### 17.5 与 demo 的关系（这一节防的是一件具体的错）

用户提供的 demo 有技巧库的「锁页」形态（Phase-2 未实现占位）。**本轮不走那条路**：spec v1.1 的 FR-1–FR-10 全是可判定的，且 §2 的 Out 栏已经把手绘场景限死。锁页在产品里的代价是——一个永久存在的入口，点进去只有一句「即将上线」，而它会**把用户对这个模块的信任前置消耗掉**。宁可这一轮交不出条目数，也不给锁页。

**从 demo 取的只有信息架构**（第 5 步：场景/问题/正确做法/反例/亲测有效 的四段呈现顺序），**视觉一律不出 demo**（单源是 `DESIGN.md` V2，demo 的朱砂与衬线已作废，见 `theme.md` §3.4）。

### 17.6 实现期撞出的四处方言缺口（登记，不自裁 · 先例 = §15.5）

这四条是本轮实现绕不过去、而 spec 没有正面回答的**措辞缺口**。按 §15.5 的纪律逐条登记、指回落点，**不替 owner 裁**：

| # | 缺口 | 为什么 spec 答不了 | 本轮实现的取值（待追认） |
|---|---|---|---|
| 1 | **`source` 的取值域** | spec §3 写 `'manual' \| 'reflow'` 两态，但 seed 条目必须能被认出是种子条目——terms 的做法是三态（`openvibe-seed` 加在闭集里） | 闭集取 `/^(openvibe-seed\|manual\|reflow)$/`，照 `TERM_SOURCE_RE` 的形制。**代价是这确实是 spec 字面之外的一个值**，落在 §4 FR-1.3「`status` 只接受两态字面量」的同类条款上，须 owner 追认或改 spec |
| 2 | **正文交叉引用行挂哪一节** | FR-7.6 要求「同处加一条技巧腿」，但 §8.2 ① 已裁「不新增第五节」，`PACK_SECTION_ORDER` 是四节冻结序 ⇒ 这一行**只能挂进现有某节**，而 spec 没说是哪一节 | 挂 `PACK_SECTION_RULES`（「## 行为规则」）——四节里唯一语义通用的一节（技巧是行为指引）。空选集时该节整体省略 ⇒ 未选技巧时字节不变，§7.4 的零回归闸仍成立 |
| 3 | **`sortForMd` 的排序键** | FR-2.4 只说「必须走 `compareCodeUnit`」，§8.2 ⑤ 裁的是「`verified` 不参与排序」，**没给主键** | 主键 `scenario`，`id` 兜底；**不引入 `orderBy` 枚举**（terms 有 `en-alpha/pinyin/manual` 是因为它有 `en`/`zh` 双键，技巧没有这层结构） |
| 4 | **`renderMd` 空选集的错误面** | FR-6.3 说「空集合 ⇒ 不产该文件」，但那只讲组包侧；**独立预览端点**拿到空数组该回什么，spec 没说 | 照 terms：`EMPTY_SELECTION`（`AppError` 单一出处仍在仓储层）。理由与 terms §6.3 同源——空渲染预览对用户零信息量 |

四条里有三条（1／3／4）**是措辞缺口而非设计缺口**，实现取值都选了「与既有同族代码一致」的方向；只有第 2 条碰到了冻结面（`PACK_SECTION_ORDER`），故单列并说明零回归闸为何仍成立。

### 17.6b 第五处缺口：FR-8.3 的同步落点写错了文件（已就地修，登记不改判）

FR-8.3 点名三处文档落点，前两处（`m6-standard-pack.md` §3 / §6）实测存在并已改判，**第三处「`docs/dev-plan.md` §15.2 裁 ⑫ 格指向处」在本仓不存在**：

- §15.2 是「版本与兼容口径」，其三行分别讲阶段名 vs 版本号、`DEFAULT_PACK_VERSION` 不触、前置关系——**没有 ⑫ 这一格**（复算 `grep -n '⑫' docs/dev-plan.md` → 仅两处命中：§9 那段 T10 的历史叙述，与 §16.14 复算口径里的「①…⑫」枚举，**都不在 §15.2**）。
- ⑫ 的队列行真位置是 **`docs/decisions.md` 的队列表（⑫ 行）**（该文件**没有 §2** —— 队列表在 H1「待决策项队列（单源）」之下；复算 `grep -c '^| ⑫ ' docs/decisions.md` → **1**；原文 `⑫ | playbookIds 的契约处理 | 已裁已落 | [DEV-0034]：非空即 422 …`），那一行才是需要随拆闸改判的地方。

**处置**：已在 `docs/decisions.md` 那一行补现状追记（状态由「已裁已落」改判为「已裁并已拆」，**原裁文本按「日志不回改」原样留着**），并把 `m4-playbook.md` FR-8.3 的落点指针改为指向 `decisions.md`。**为什么值得单列而不是顺手改掉**：这正是 §16.12 那族缺陷的第四例——**规格里的跨文件指针本身指错位置**，照着做的人会去一个不存在的格子里「同步」，找不到就以为已经同步过了，孤儿文档就此留下。**同族的判法**（供下轮复用）：动 FR-8 这类「文档半拆闸」条款时，落点清单里的每一处都要先 `grep` 证明它存在，再动手。

### 17.7 本轮解开与未解开的闸（对照 §15.1-9 的三道前置）

| 闸 | 状态 |
|---|---|
| 前置①（§8.2 ③ 的两处数值） | **已闭合**（`[DEV-0088]`，2026-10-01）。本轮只消费，不重裁 |
| 前置②（FR-7.3 推断转正） | **本轮执行**。它是 §9 工作包 W6 的**准入条件**不是 W6 的产物：先跑变异反证，指纹不同才允许动拆闸那一刀。判读口径见 spec §7.3 第三条 |
| 前置③（FR-8 的 A 级凭据形态） | **本轮执行**。凭据形态在 spec §7.4 已写死，本节不复述；**归 A 级流程**（§0.3：DEV_LOG 记问题与证据 → owner 裁定 → 契约升版 → 先改基线再改实现）。**注意 PRD D25 那笔「三处同批全改」是另一条路**，本节的拆闸若与它同笔，必须在 DEV_LOG 里点名两者关系，不能合并成一笔 |

**未解开的**：§15.1-9 那句「本行现在可读作允许开工」限定在「前置①未挡的那几面」——本轮把前置②③也跑完了，但**「允许开工」不等于「已收口」**：spec §7.6 的四条人工腿（截图归档）与 §7.7 的四条未验证面（win32 的 FTS 触发器与 seedHash 幂等**从未验证**、真实浏览器点击、`PLAYBOOKS.md` 被六类工具读取后的效果、多用户并发写）**本轮一条都不因代码落地而消解**。§13 DoD 的「五闸全绿」也不覆盖这四条。

## §18 v0.2.1 迭代版（M8 Agent 接入层 · 2026-10-14 开档）

> **本节是指针，不是内容。** v0.2.1 的全部内容在 **[`docs/dev-plan-v0.2.1.md`](./dev-plan-v0.2.1.md)**；本段只承担两件事——指路，以及交代它与 §16 的关系。

### 18.1 指针

| 项 | 值 |
|---|---|
| 计划真源 | **`docs/dev-plan-v0.2.1.md`**（v1.0，2026-10-14 开档） |
| 范围 | **M8 · Agent 接入层**五个子面全含：A 官方 skill 包 / B 回流写入面 / C CLI 读写面 / D 聚合查询面 / E Web 直调面板 |
| 轨道 | **独立轨道**，**不进** §16.2 的 RF 编号空间（那 27 个编号项一字不动） |
| 上游 PRD | `docs/PRD-M8-agent-bridge-v1.0-20261013.md`（升 v1.1）＋ 本文件所属 `docs/PRD.md` 第 11 章 ＋ 附录 D **D34** |
| 队列 | `docs/decisions.md` **㉞**（出生态＝**可做待排**，不是待裁） |
| 工期 | **未排**——启动时点由 §16 的 **RF1-5** 决定 |
| 规格 | `docs/specs/m8-agent-bridge.md`（B/C/D，升 v1.0）· `m8-agent-panel.md`（E，待建）· `m8-skill-bridge.md`（A，待建，阻塞于探针） |
| 任务 | **无**——No-spec-no-task（§0.4 第 4 条）；三份 spec 落地后才申请 `tasks.md` **T14** |

### 18.2 与 §16 的关系（**为什么不并进本节**）

§16 开档边界第 1 条「**不另立计划文件**」已被 owner 于 2026-10-14 **推翻**，但**适用范围仅限 v0.2.1**，理由与代价见 §16 该条下的推翻记录、以及 `dev-plan-v0.2.1.md` §0.1 与 §9.2。

两条轨道**互不覆盖**，但**存在一条物理依赖**，须在此写死以免误读成「两条可以并行开工」：

```
§16 RF1-1 服务层  →  §16 RF1-5 本地事件台账  →  v0.2.1 Phase 1（M8 读写核心）  →  v0.2.1 Phase 2（M8 接入面）
```

owner 裁「M8 两张表并进台账那次迁移」＋「埋点推迟到台账落地之后」两项叠加 ⇒ **台账（RF1-5）不落地，M8 连表都建不了**。**v0.2.1 与 §16 不是并行关系，是接在 §16 尾部的后半段。** 详见 `dev-plan-v0.2.1.md` §3.1。

### 18.3 为什么是 §18 而不是 §17（**编号空洞已闭合**）

提交树 `4b42642` 的 §17 是 **M4 技巧库开发计划**（`:1789`）。2026-10-14 的工作树里，那一节被一个**并行会话**整节删除（−103 行），同时 `docs/tasks.md` 的 T12 人日口径回退为「未估」、`docs/decisions.md` ㊫ 的状态回退为「已裁已落」——**该批回退未提交、非 v0.2.1 这轮所作**。

⇒ v0.2.1 取 **§18**，避免与该会话恢复的 §17 **同号硬冲突**。

**2026-10-24 owner 裁定（`dev-plan-v0.2.1.md` §7 待裁② 闭合）：§17 原样恢复。** §17 自提交树 `4b42642` **逐字取回**（100 行，未改一字），§18 仍归 v0.2.1 ⇒ **§16 → §17 → §18 号位连续，编号空洞闭合**；本段由「空洞的解释」改记为「空洞的闭合记录」。

⚠️ **该批回退的其余两处仍在回退态**：\`docs/tasks.md\` 的 T12 仍写「人日未估」、\`docs/decisions.md\` ⑫ 仍写「已裁已落」——**不在本次裁定范围**（owner 2026-10-24 只裁了「恢复 §17」）⇒ §17.4 的人日 5.2 与 \`tasks.md\` 的「未估」**暂不一致**，待该批回退一并处置后再对齐。

### 18.4 复算

```
grep -c 'dev-plan-v0.2.1.md' docs/dev-plan.md   # 本段指针在位
grep -c 'dev-plan.md' docs/dev-plan-v0.2.1.md   # 反向指针在位（§9.1 的双向纪律）
grep -n '1[-]7' docs/dev-plan.md                 # → 0，v0.2.1 未侵占 RF 编号空间
#   ⚠️ 本行的模式用字符组 '1[-]7' 而非裸串：裸串会被本检查自己扫成命中，口径自毁（此注刻意不复写那个裸串）
```
