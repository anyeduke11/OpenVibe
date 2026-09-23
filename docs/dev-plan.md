# OpenVibe P1 开发实施方案（dev-plan）

| 项 | 值 |
|------|------|
| 文档定位 | **P1 MVP 详细工程实施方案 + 执行计划**：架构 / 数据库 / API / 后端 / 前端组件 / CLI / 领域核心 / 平台适配 / T1–T9 分解 / 测试映射 / 日级排期 / 内容生产 SOP |
| 上游 | [PRD.md](./PRD.md) v0.1.4、[specs/](./specs/)×8（行为规格）、[design.md](./design.md)（§7 标准包契约 / §8 adapter 清单为**冻结契约**） |
| 姊妹文档 | [tasks.md](./tasks.md)（里程碑概览：门禁 / 依赖图 / 人日口径——本文不改变其任何数字，只做执行展开） |
| 下游 | T1–T9 每日执行；DEV_LOG 记录依据；CI 用例命名 |
| 版本 | v1.0（2026-09-20） |
| 执行纪律 | **任何 T 任务开工前先读 §0**；本文与 specs/design 冲突时，冻结契约 > spec > 本文（按 §0.3 分级处理冲突本身） |

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
| 2 PRD | ✅ | PRD v0.1.3（变更日志 5 版） |
| 3 Spec 规格 | ✅ | specs/×8（m1/m2/m3/m5/m6a/m6b/seed/onboarding） |
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
│       ├── commands/{serve,scan,sync,diff}.ts
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

`GET/POST /skills`、`PATCH/DELETE /skills/:id`、`GET /skills/:id/versions`、`POST /skills/scan`（body 可带 `roots[]` 覆盖默认；响应 `{discovered, created, updated, skipped, warnings[]}`，m2 FR-1.5）。

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
| term.ts | `TermCreateInput / TermUpdateInput / TermOut / TermSearchOut / RenderTermsMdInput` |
| skill.ts | `SkillCreateInput / SkillOut / SkillVersionOut / SkillScanInput / SkillScanReport` |
| flow.ts | `FlowTemplateCreateInput / FlowTemplateOut / StageSchema` |
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

---

## §6 CLI（apps/cli）

### 6.1 命令矩阵与配置发现链

| 命令 | 旗标 | 说明 |
|------|------|------|
| `openvibe serve` | `--port`（默认 8787）`--open` | §1.2 启动序列 |
| `openvibe scan` | `--skills` `--project <path>` `--roots <dir>…` | 两者可同时给；皆缺 → 用法报错（m6b FR-4.3） |
| `openvibe sync <projectPath>` | `--pack name[@ver]` `--file` `--dir` `--dry-run` `--yes` `--strategy skip\|overwrite\|keep-local` `--target <adapter>…` | 三包源互斥；缺省 `--pack` 取项目登记包 |
| `openvibe diff <projectPath>` | — | 漂移 + 新版本探测 |
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
- sync **永不删除** pack 外文件；包升级后消失的旧文件 MVP 不清理（P1 `update` 向导，m6b §6.2）。

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
| 0 | 成功 / diff clean 且无新版 |
| 1 | 错误（校验失败/路径攻击/token/非 TTY 拒绝） |
| 2 | diff 检出 drifted 或 pack-outdated；sync `--yes --strategy skip` 遇 CONFLICT |

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
  scan(roots?: string[]): { discovered; created; updated; skipped; warnings }   // dirHash 算法 m2 FR-1.3
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
- [ ] `server/routes/terms.ts`（§3.3 五端点，render-terms-md 确定性排序 + `|` 转义）
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

**SPEC 依据**：m5 FR-1–FR-7、m2 FR-1–FR-3；design §5/§6。

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
- [x] terms.json 补至 ≥100（批次 C/D，§11）；prompts.json 20 条（两批）——**104 / 20**
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
| seed-2 | 首启计数 100/3/20 + 升级导入 | UT-SEED-02（真实 `content/seed` 全量入 SQLite，≥100/3/20 逐条无 warning；当前实量 109/3/20） |
| seed-3 | 模板 3/7/4 阶段逐字一致 | SCRIPT-SEED-02 两支（阶段名改一字 → 点名「阶段名需逐字一致，收到 启动 / 开发 / 回顾」；删一个阶段 → 「阶段数期望 7，收到 6」） |
| seed-4 | 词条质量抽查 | 机器侧由 `seed:check` 把关（definition ≥20 字 / aliases 非空 / example 覆盖 100% / 受控词表 / 附录 B 基线）；人工侧 `docs/devlog-evidence/DEV-0019/seed-review.md` 摊开 41 词条 + 20 提示词全文，**裁决表待 owner 填**（DEV-0019 风险①） |
| onb-1 | ≤3 命令/≤5 分钟产物清单 | `onboarding-walk.mjs`「验收 1（onb-1）」段（九项产物逐条 `statSync` + 第三条命令 `diff` 判 clean + 用户侧 4.0 s / 构建 1.5 s 单列，计时口径 C-74）+ IT-ONB-05 |
| onb-2 | 跳过不再现/重置再现 | 走查「验收 2：跳过/重置」段 + IT-ONB-03/04 |
| onb-2b | 未注入不点亮 + lock 自动确认 | 走查「验收 2b」段（提示如实点名 `pack.lock.json` → sync 后自动点亮）+ IT-ONB-15..18 |
| onb-3 | 步骤②与 preview API 同源 | 走查「验收 3」段（向导指纹 == `POST /api/packs/:id/preview` 指纹）+ IT-PACK-01/UT-COMPOSE-02 |
| onb-4 | 飞轮圈数=1/删除回落 | 走查「验收 4」段（`{assets:124,…,loops:1}` → 删夹具项目后 `loops:0`，顶栏双向）+ IT-ONB-12/13/14 |
| onb-5 | 默认关 + 零外联断言 | UT-TELEMETRY-01 + TF-09（无端点连 `setInterval` 都不建）+ `telemetry-egress.mjs` 17/17（关闭态第二个 60 s 窗口计数 `3→3`）+ 走查 host 清单全为 `127.0.0.1` |
| onb-5b | 一次性询问 declined 永不再问 | 走查「验收 5b」段（询问卡出现 → 选「暂不」→ 刷新不再问 → `askState=declined / enabled=false`） |

> Playwright 版 `E2E-ONBOARD-01..04` / `E2E-FLYWHEEL-01` / `E2E-TELEMETRY-01` 仍按 dev-plan §9-T9 排期：本仓无 jsdom，本轮以**入库的真机走查驱动器**（headless Chrome + 裸 CDP，可对 HEAD 复跑）承担同一口径的证据，T9 决定是否提升为 CI 内 E2E。

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
| **dogfooding 两周证伪线触发（D15：工作台使用 <10 次或 DEV 日志 <5 条）** | m5 / PRD 3.2-M5 | 启动 M5-lite：工作台 UI 后移 P1.1，模板/清单仅经 CHECKLIST.md 注入；记 DEV_LOG 并排 P1.1 |
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

---

## §14 遗留评审建议（未裁定，不进 MVP——owner 裁定后入 P1.1）

1. **组包预览 token 估算**：preview 返回各文件 chars/4 估算与总量告警（借 Rulix，约 0.5 人日）。
2. **`openvibe clean`**：按 lock 清除注入文件 + 备份，补全「零锁定」的退场半边（约 0.5 人日，竞品全部没有）。
3. **CLAUDE.md `@import` 受管子文件 spike**：若 Claude Code 支持 `@file` 导入，主规则可移至 `.openvibe/pack.md` 受管、CLAUDE.md 只留一行导入——把整文件 DRIFT 摩擦降一个量级（30 分钟真机验证）。
4. **m6b 单包边界声明**：lock 单包结构下「一项目一包」假设显式写进 spec 边界节（B 级变更一行）。
5. **发布执行清单**：渠道帖（V2EX/掘金/知乎）、demo GIF/asciinema、社群入口、awesome 清单 PR——当前 tasks T9 只有 README 重写，无传播执行项。
6. **Playwright E2E（design §13 原口径）**——**owner 已裁定：T9 不引入，延至 P1.1 评估（2026-09-23）**。裁定依据是实测证据面：本仓无 jsdom，T8 三段入库驱动器（`onboarding-walk.mjs` 29 断言 / `lazy-chunk-walk.mjs` 29 / `telemetry-egress.mjs` 17）零 `Input.dispatchMouseEvent`、零 `Input.dispatchKeyEvent`、零 clipboard，仅 2 处 `Runtime.evaluate` 内的合成 `b.click()`（`onboarding-walk.mjs:201`、`lazy-chunk-walk.mjs:265`），即其证据类型是「navigate 之后读 DOM」而非真实用户动作。因此合成 `b.click()` 拿不到 transient user activation，`navigator.clipboard.writeText` 在自动化下必然被拒 → `E2E-SMOKE-01 导入→复制`、`02 术语搜索`（受控 input 中文输入 + debounce）、`m5-5 @dnd-kit 看板拖拽` 三处**在 v0.1 由人工录屏/截图承担**，CDP 驱动器只作渲染与数据面回归；发布说明与 DEV_LOG 须如实标注「自动化证据不含真实点击/复制/拖拽」。P1.1 若引入，只承担冒烟 ×3、仅 chromium、仅单 OS，主链 `E2E-FLOW-01` 留在 vitest `integration`+`cli`。
