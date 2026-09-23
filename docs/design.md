# OpenVibe MVP 设计方案（design）

| 项 | 值 |
|------|------|
| 文档定位 | 怎么实现：选型、结构、数据、API、**标准包文件契约★**、**adapter 清单★**、安全、测试 |
| 上游 | [proposal.md](./proposal.md)、[specs/](./specs/)（行为规格，本文实现之） |
| 下游 | [tasks.md](./tasks.md)（按本文结构排任务） |
| 状态 | 草案 —— ★ 两节为 PRD P0 必交付契约，owner 评审冻结后向后兼容承诺生效 |
| 版本 | v0.1（2026-09-20） |

---

## 1. 设计总览与硬约束

1. **本地优先**：MVP 单用户，全部数据在 `~/.openvibe/`，无外部服务、无外传（PRD 假设 A6）。
2. **CLI 是注入唯一通道**：浏览器写不了本地项目文件——Web 只读展示项目状态，写路径收敛到 `openvibe sync`（PRD 审查二 P0 修正）。
3. **标准包是纯文件契约**：Markdown + JSON，零私有二进制格式，git 友好、工具无关（PRD 4.2 决策 1）。
4. **确定性输出**：同一输入 → 字节级相同的产物（文件内不含时间戳；时间只在 manifest）。这是 diff/漂移检测/幂等导出的数学基础。
5. **平台变化隔离在 adapter 层**：目标平台目录/格式契约的任何变化只改 `packages/adapters`（PRD 4.2 决策 3）。

## 2. 技术选型（proposal A7 工作默认；替换点集中在 §3 的包边界）

| 层 | 选择 | 理由（一句话） | 替换成本 |
|----|------|----------------|----------|
| 运行时 | Node.js 22 LTS + TypeScript 5（strict） | 前后端 CLI 同语言，类型三端共享 | 高（全栈换） |
| Monorepo | pnpm workspaces（**不引入 turborepo**） | 9 个包规模下 `pnpm -r` 脚本足够，少一个构建黑盒 | 低 |
| Web | React 18 + Vite + TanStack Query v5 | 标准 SPA；服务端状态缓存交给 Query，免自研状态机 | 中 |
| UI | Tailwind CSS v4 + Radix Primitives | 无组件库锁定，可访问性原语现成 | 中 |
| 编辑器 | CodeMirror 6（@uiw/react-codemirror） | Markdown 编辑够用且轻（Monaco 过重，Electron 才需要） | 低 |
| Diff | jsdiff（diff-lines）+ 自绘高亮 | 版本对比只需行级统一 diff | 低 |
| Server | Fastify 5 | 内置 JSON Schema 校验与 `app.inject()` 测试注入，性能冗余 | 中 |
| DB | better-sqlite3（编译内置 FTS5）+ 手写 migration | 同步 API 好写好测；无 ORM 魔法，FTS5 触发器直达（见 §12） | 高（数据层） |
| 校验 | zod（packages/shared 统一 schema，三端复用） | API 边界与 CLI 参数共用一套类型 | 低 |
| CLI | commander + @clack/prompts + picocolors | 参数解析 + 漂亮的交互确认，依赖极轻 | 低 |
| ID | nanoid + 类型前缀（`prm_`/`pk_`…） | 日志与外键肉眼可辨 | — |
| 测试 | vitest（单测/集成，含 CLI 临时目录）+ Playwright（E2E 一条龙） | 见 §13 | 中 |
| 质量 | ESLint + Prettier + GitHub Actions（lint/test/seed:check，**三平台矩阵 macOS/Linux/Windows——澄清 D5 硬要求**；T8f 起再加 bundle:check：入口 ≤300kB、任一 chunk ≤500kB，见 dev-plan §5.1） | CI 见 tasks T1 | 低 |

## 3. Monorepo 结构（对齐 PRD 4.3，细化到目录）

```
openvibe/
├── apps/
│   ├── web/                    # SPA（Vite 构建，产物由 server 托管）
│   │   └── src/{pages,components,api,hooks}
│   ├── server/                 # Fastify：REST API + 静态托管 + 首启初始化
│   │   └── src/{routes/,plugins/auth.ts,plugins/static.ts,bootstrap.ts}
│   └── cli/                    # npx openvibe-cli（bin: openvibe）
│       └── src/{commands/{serve,scan,sync,diff}.ts,config.ts,output.ts}
├── packages/
│   ├── core/                   # 领域核心：Web/CLI 共用，不依赖任何 app
│   │   └── src/
│   │       ├── db/             # better-sqlite3 封装、migrations/、seed.ts
│   │       ├── repos/          # prompts/terms/skills/flows/projects/packs 仓储
│   │       ├── pack/           # ★ composer.ts（组装）/ fingerprint.ts / validate.ts
│   │       ├── importers/      # .cursorrules/CLAUDE.md 解析、JSON 互导
│   │       └── search/         # FTS 封装（trigram + LIKE 降级）
│   ├── adapters/               # ★ 平台契约（§8）：每 adapter 一个模块 + registry
│   └── shared/                 # zod schema、类型常量、错误码、utils
├── content/seed/               # terms.json / flow-templates.json / prompts.json
├── docs/                       # PRD、本套规划文档
└── .github/workflows/ci.yml
```

依赖方向：`apps/* → packages/{core,adapters,shared}`；`adapters → shared`；`core → shared`。**core 不依赖 server**——CLI 离线模式（`--file/--dir`）直接用 core 的 composer/validate，不联网。

## 4. 运行形态与数据目录

```
用户机器
├── ~/.openvibe/
│   ├── config.json          # { serverUrl, token, port, telemetryEndpoint? } 权限 0600（serve 首启生成；缺省/空 = 永不外发，§11.5）
│   ├── data/openvibe.db    # SQLite（WAL），含 FTS 虚表（§5）
│   ├── packs/               # 目录导出的标准包（git 共享用）
│   └── logs/                # serve 运行日志（滚动）
└── <目标项目>/
    └── .openvibe/
        ├── pack.lock.json   # 注入指纹登记（§7.5）
        └── backup/<UTC时间戳>/   # 被覆盖文件备份（建议 gitignore）
```

- 启动：`npx openvibe-cli serve [--open]` → 初始化目录/DB/种子 → 监听 `127.0.0.1:8787` → 托管 Web。
- 升级：启动时按 `schema_migrations` 表顺序执行未跑的 migration（只加不改历史脚本）。
- Web 与 CLI 的耦合面 = HTTP API（§6）+ 包契约（§7），两者皆有版本号（`schemaVersion`），可独立升级。

## 5. 数据模型（SQLite DDL 摘要）

主表（字段规格以各 spec §3 为准，此处列键与索引）：

```sql
prompts(id PK, title, content, content_hash, description, variables JSON,
        tags JSON, folder_path, platform_marks JSON, useAs, status,
        seed_hash NULL, created_at, updated_at);
  prompt_versions(id PK, prompt_id FK→prompts ON DELETE CASCADE,
                  version_no, content, content_hash, changelog, created_at,
                  UNIQUE(prompt_id, version_no));
skills(id PK, name UNIQUE, description, source, skill_dir,
       latest_version_id, installed_targets JSON, timestamps);
  skill_versions(id PK, skill_id FK CASCADE, version_label, dir_hash,
                 file_count, scanned_at, UNIQUE(skill_id, dir_hash));
terms(id PK, zh, en, aliases JSON, definition, example,
      related_term_ids JSON, source, tags JSON, status,
      seed_hash NULL, timestamps);
flow_templates(id PK, name, kind, stages JSON, builtin, seed_hash NULL, timestamps);
projects(id PK, name, local_path, flow_template_id,
         stages_snapshot JSON, current_stage, status,
         standard_pack_id, standard_pack_version, timestamps);
  project_check_states(id PK, project_id FK CASCADE, stage_name, item_id,
                       checked_at, UNIQUE(project_id, stage_name, item_id));
  tasks(id PK, project_id FK CASCADE, title, stage_name, status, order_);
  dev_log_entries(id PK, project_id FK CASCADE, type, entry_no, title, body,
                  related_files JSON, evidence JSON, linked_asset_ids JSON,
                  created_at, UNIQUE(project_id, type, entry_no));
standard_packs(id PK, name UNIQUE, description, selection JSON, targets JSON, timestamps);
  pack_exports(id PK, pack_id FK, version, fingerprint, manifest_json,
               channel, exported_at, UNIQUE(pack_id, version));
  injections(id PK, pack_id, pack_version, project_path, injected_at);
seed_registry(bundle PK, content_hash, imported_at);
app_meta(key PK, value JSON);                    -- C-1（2026-09-20 dev-plan §2.4 补齐）：向导完成标记/telemetryAskState
telemetry_events(id PK, event, value, day, os, app_version, queued_at, sent_at);  -- C-2：遥测本地队列（§11.5）
-- FTS 虚表与触发器见 §12；schema_migrations(version PK, applied_at)
```

要点：
- **标签/数组用 JSON 列**（MVP 量级 ≤ 万级，`json_each` 过滤足够；FTS 同时索引标签文本）。
- **版本/勾选/任务/日志全部 `ON DELETE CASCADE`**——spec 中的「级联删除」验收由外键保证。
- `seed_hash` 列支撑种子升级导入的「用户改过则跳过」判定（§15）。

## 6. API 设计（REST/JSON，前缀 /api，统一错误体 `{code, message, details?}`）

| 资源 | 端点（方法 路径） | 备注 |
|------|------------------|------|
| 健康 | `GET /health` | 无鉴权，含版本与 DB 状态 |
| 提示词 | `GET/POST /prompts`、`GET/PATCH/DELETE /prompts/:id`、`GET /prompts/:id/versions`、`POST /prompts/:id/versions/:no/restore`、`POST /prompts/import`、`GET /prompts/export` | 分页 `?page&size&tag&folder&platform&status&q` |
| Skill | `GET/POST /skills`、`PATCH/DELETE /skills/:id`、`GET /skills/:id/versions`、`POST /skills/scan` | |
| 术语 | `GET/POST /terms`、`PATCH/DELETE /terms/:id`、`GET /terms/search`、`POST /terms/render-terms-md` | |
| 流程模板 | `GET/POST /flow-templates`、`PATCH/DELETE /flow-templates/:id`、`POST /flow-templates/:id/duplicate` | builtin PATCH/DELETE → 403 |
| 项目 | `GET/POST /projects`、`GET/PATCH/DELETE /projects/:id`、`POST /projects/:id/stages/current`、`GET /projects/:id/injection-status`、`GET /injection-status?dir=` | injection-status 读 lock 文件（只读）；`?dir=` 变体供开箱步③轮询未入库目录，`dir` 须绝对路径且已存在（404/422），响应同 `InjectionStatusOut`，不做目录列举 |
| 任务 | `GET/POST /projects/:id/tasks`、`PATCH/DELETE /tasks/:id` | 拖拽 = PATCH status/order |
| 日志 | `GET/POST /projects/:id/devlog`、`GET /projects/:id/devlog/export` | |
| 标准包 | `GET/POST /packs`、`GET/PATCH/DELETE /packs/:id`、`POST /packs/:id/preview`、`POST /packs/:id/export`、`GET /packs/:id/exports`、`POST /injections` | export body `{version, channel}`；409 见 m6a FR-4 |
| 全局搜索 | `GET /search?type=prompt\|term&q=` | |
| 设置 | `GET /settings`、`POST /settings/onboarding`、`POST /settings/reseed`、`GET/POST /settings/telemetry`（C-3，2026-09-20：D13 遥测开关/询问状态读写，实现级见 dev-plan §3.10/§4.6。T8，2026-09-22 补 C-56 两行：`GET /settings` 响应含 `onboardingDone`；`onboarding` 写 `app_meta` 完成标记，`done=false` 即「重新显示向导」；`reseed` 重播种子并按 onboarding FR-1 口径重建 default 包，返回 `{seed, defaultPack, settings}`） | |
| 飞轮统计 | `GET /stats`、`POST /telemetry/events` | T8（onboarding FR-3 + C-50 出队出口）：`/stats` 五数全本地 SQL 聚合（`assets/packs/injections/reflows/loops`），`loops` 按项目去重且要求同一项目「登记的包有导出 ∧ 该路径有注入记录 ∧ 有带资产引用的日志」三者同链；`/telemetry/events` 单事件入队，开关关闭时返回 `{queued:false, reason:'disabled'}` 且连队列都不写 |

分页默认 size=50；列表响应统一 `{items, total, page}`。鉴权规则见 §11。

## 7. ★ 标准包文件契约（P0 冻结对象 v1；**v1.3** = 2026-09-21 D17 更名 OpenVibe：契约字符串更新——`openvibe.pack.json` / `.openvibe/` / marker `openvibe:pack` / bundle `openvibe-pack-*`，**结构不变**）

> 本节是全产品最核心的接口。冻结后任何变更必须升 `schemaVersion` 并保持旧版可读。CLI 与生成器（packages/core/pack）共同实现，**规范以本节为唯一权威**。

### 7.1 两种交付形态

| 形态 | 用途 | 结构 |
|------|------|------|
| 目录导出 `~/.openvibe/packs/<name>@<version>/` | git 共享 / 离线 `sync --dir` | `openvibe.pack.json` + `files/`（按真实相对路径展开） |
| 单文件 bundle `openvibe-pack-<name>-<version>.json` | HTTP 下载 / `sync --file` | `{ "bundleSchemaVersion": 1, "manifest": <7.2 全文>, "files": [{"path", "content"}] }` |

### 7.2 `openvibe.pack.json`（manifest）schema

```jsonc
{
  "schemaVersion": 1,
  "pack": { "id": "pk_x", "name": "default", "version": "1.0.0",
             "description": "", "exportedAt": "2026-09-20T02:00:00Z",
             "generator": "openvibe/0.1.0" },
  "targets": ["claude-code", "generic-agents"],        // ⊂ adapter 注册表（§8）
  "flow": {                                             // 未选流程则 null
    "templateName": "个人轻量流", "kind": "light",
    "stages": [ { "name": "启动", "checklist": ["需求一句话写清"],
                  "artifacts": ["需求便签"] } ]
  },
  "prompts": [ { "title": "代码审查请求", "useAs": "rule",
                 "platformMarks": ["generic"], "contentHash": "…", "content": "…" } ],
  "terms":   [ { "zh": "规则漂移", "en": "rule drift", "aliases": [],
                 "definition": "…", "example": "" } ],
  "skills":  [ { "name": "pdf", "description": "…", "skillDir": "~/.claude/skills/pdf",
                 "versionLabel": "v3" } ],
  "files":   [ { "path": "CLAUDE.md", "sha256": "…" } ],   // 渲染产物登记（7.4 的全集）
  "fingerprint": "…"                                       // 7.6
}
```

manifest 内嵌资产**内容快照**（prompts 含全文、terms 全字段）——已导出包不依赖库存活（m6a §6.5 验收的机制保证）。

### 7.3 组合规则（渲染顺序，确定性来源）

主文件正文（CLAUDE.md / AGENTS.md / CODEBUDDY.md / .mdc / .trae rules 共用同一正文模板）按**固定节序**组装，空节整体省略：

```markdown
<!-- openvibe:pack=<name>@<version> begin (regenerate: npx openvibe-cli sync) -->
# OpenVibe 标准包：<name>@<version>

> 本文件由 OpenVibe 生成。要修改标准，请回资产库改后重新注入；
> 本地手改会被 `openvibe diff` 漂移检测发现。

## 工作流程            ← flow.stages 逐阶段：### 阶段名 + 清单 + 产物行
## 行为规则            ← prompts[useAs=rule]：#### 标题 + 正文
## 术语表              ← 恒一行：「见 TERMS.md（N 条）」；未生成 TERMS.md 时内联同 7.4 表格
## 任务提示词参考      ← prompts[useAs=reference]：#### 标题 + 正文（保留 {{变量}} 占位）
<!-- openvibe:end -->
```

- 排序键：prompts 按标题码点序（`toLowerCase` 后 code-unit 比较，全文一致）；terms 按 `(en||zh).toLowerCase()` 码点序；stages 保模板原序。
- 首尾 HTML 注释 = **受管块标记**。MVP 按整文件管理（用户不得改此文件，改了算漂移）；标记为 P1「块级合并/双向同步」预留，现在就写入。

### 7.4 各产物文件格式

**TERMS.md**（固定表头，`|` 转义规则见 m3 §6.5）：

```markdown
# 术语表 · <packName>@<version>

> AI 与团队共用的词汇标准；新词请先入库再使用。

| 术语 | English | 别名 | 定义 |
|------|---------|------|------|
```

**CHECKLIST.md**：`# 项目检查清单 · <pack>@<ver>` + 每阶段 `## 阶段 N · <名>`，清单项 `- [ ] 文本`，产物行 `**产物**: a、b`。

**SKILLS.md**：`# Skill 清单 · <pack>@<ver>` + 表 `| Skill | 说明 | 本地路径 | 版本 |`（skillDir 原样展示，仅信息用途）。

**.cursor/rules/openvibe.mdc**：YAML frontmatter `{description: "OpenVibe 标准包 <name>@<ver>", globs: "", alwaysApply: true}` + 7.3 正文。

**CLAUDE.md / AGENTS.md / CODEBUDDY.md / MINI.md**：7.3 正文原样（四个根级规则文件仅文件名不同，内容一致——各工具自取所需，多文件生成防遗漏）；**.trae/rules/openvibe.md**：7.3 正文 + Trae frontmatter `{ description: "OpenVibe 标准包 <name>@<ver>", alwaysApply: true }`（T6 真机复核修正：Trae CN 二进制只解析 `globs`/`alwaysApply`/`description`/`scene` 四键，未知键静默丢弃 ⇒ 原设计的 `trigger: always` 等于没有声明、规则不会自动加载；见 `docs/devlog-evidence/DEV-0016/trae-frontmatter-probe.txt` 与 DEV-0016 C-26）。

### 7.5 `.openvibe/pack.lock.json`（CLI 写入目标项目）

```jsonc
{ "schemaVersion": 1,
  "pack": { "id": "pk_x", "name": "default", "version": "1.0.0", "fingerprint": "…" },
  "injectedAt": "2026-09-20T02:11:00Z",
  "files": [ { "path": "CLAUDE.md", "sha256": "<期望哈希>", "managed": true } ] }
```

`managed=true` 的文件参与 UPDATE/DRIFT 判定（m6b FR-2.2）；`--target` 过滤未写入的文件也登记期望哈希（`managed=false`），供后续补齐。

### 7.6 指纹算法（fingerprint）

```
fileSha256  = sha256(UTF-8 bytes of file content)
fingerprint = sha256( concat over files sorted by path(code-unit):
                      `${path}\t${fileSha256}\n` )
```

CLI 侧对 bundle/目录**重算校验**（防篡改/防传输损坏，m6b FR-2.1）；服务端导出时同算法生成。排序用码点序而非 localeCompare——后者随 ICU 环境漂移，会破坏确定性。

### 7.7 路径与规模安全（manifest 校验规则，packages/core/pack/validate.ts）

1. `files[].path` 必须：相对路径；按 `/` 切分后无空段、无 `..` 段、不含 `\`、不以 `/` 开头、单段 ≤ 128 字符、总长 ≤ 255、总文件数 ≤ 200。
2. 任一规则失败 → 整包拒绝（CLI 退出码 1；服务端导出前同样跑此校验）。
3. 写入时再验：`path.resolve(projectPath, relPath)` 必须落在 `projectPath` 内（双保险，防符号链接逃逸）。

### 7.8 版本与不可变规则

semver（`MAJOR.MINOR.PATCH`）；`(packId, version)` 唯一；同版本重导指纹必须一致否则 409（m6a FR-4.4）；CLI 对 lock 中版本只认指纹不认版本号大小（漂移以哈希为准）。

## 8. ★ 平台 adapter 清单（**v1.3**，2026-09-21 D17 更名：adapter 文件名 `.cursor/rules/openvibe.mdc`、`.trae/rules/openvibe.md`；v1.2 = 2026-09-20 +minicode、trae 文件名改自定义）

`packages/adapters` 每平台一个模块，实现统一接口：

```ts
interface Adapter {
  id: string;                        // manifest.targets 取值
  /** 给定包内容 → 本平台应生成的文件集（path + 是否复用主正文） */
  plan(pack: ResolvedPack): PlannedFile[];
}
```

**专用 adapter**（决定写入文件，MVP 六个）：

| adapter id | MVP | 写入文件 | 格式要点 | 契约依据（核验 2026-09-20） |
|------------|:---:|----------|----------|------------------------------|
| `claude-code` | ✅ | `CLAUDE.md` | 项目根单文件规则 | Claude Code 官方 memory 文件约定 |
| `cursor` | ✅ | `.cursor/rules/openvibe.mdc` | YAML frontmatter（description/globs/alwaysApply），新版规则目录 | Cursor rules（`.cursor/rules/*.mdc`） |
| `generic-agents` | ✅ | `AGENTS.md` | 项目根通用约定（Codex 等读 AGENTS.md 的代理） | agents.md 社区惯例 |
| `codebuddy` | ✅ | `CODEBUDDY.md` | 项目根单文件规则，正文复用主模板；CodeBuddy 无此文件时回退读 AGENTS.md | CodeBuddy 官网最佳实践 + 腾讯云文档 |
| `trae` | ✅ | `.trae/rules/openvibe.md` | **v1.2 改用自定义文件名**（裁定 D10）：社区与半官方来源确认 `.trae/rules/` 支持多规则文件共存，自定义名避免覆盖用户已有 `project_rules.md`；frontmatter 用 `{ description, alwaysApply: true }`（**T6 真机复核推翻原 `trigger: always`**：二进制仅认 `globs`/`alwaysApply`/`description`/`scene`，未知键丢弃 ⇒ `trigger` 不触发自动加载） | Trae CN 二进制一手证据（`alwaysApply===!0?AlwaysApply:…` 解析分支 + `.trae/rules/` 多文件判定）；见 `trae-frontmatter-probe.txt` / DEV-0016 C-26 |
| `minicode` | ✅ | `MINI.md` | 项目根单文件规则，正文复用主模板（MiniCode 的 `/init` 约定） | GitHub README 实证（`/init` scaffold `.mini-code/` + `MINI.md`；1.1k★ MIT） |
| `windsurf` | P1 | `.windsurf/rules/openvibe.md` | 随 M2 完整版 skill 分发一起交付 | Windsurf rules 目录 |
| `gemini` | P1 可选 | `GEMINI.md` | 一行接入（同主模板），需求出现即加 | Gemini CLI 约定 |
| `copilot` | P1 可选 | `.github/copilot-instructions.md` | 一行接入（同主模板）；竞品 rulesync 已验证该契约（competitive-analysis §8.5 借鉴②） | GitHub Copilot 约定 |

**兼容矩阵**（不新增 adapter——这些平台直接读上述产物文件，打包预览页据此展示「本包覆盖平台」）：

| 平台 | 读哪个产物 | 证据强度 |
|------|-----------|----------|
| Codex / OpenCode / Cline / Qwen Code | `AGENTS.md` | 强（社区惯例） |
| Trae CN | `AGENTS.md` | **一手证据**（二进制含「Include AGENTS.md in context」且默认开启 + T6 GUI 暗号实测：与 `.trae/rules/openvibe.md` 并存时 AGENTS.md 仍被自动读入，见 DEV-0016 C-39） |
| zcode | `AGENTS.md` | **一手证据**（zcode 自身按 AGENTS.md 约定加载用户/项目指令） |
| Kimi Code（Kimi for Coding） | `AGENTS.md`（感知链 AGENTS.md → .cursor/rules）；借鉴 CLAUDE.md 机制 | **较强**（官方 CLI 文档 + 借鉴机制报道；子 Agent 感知缺陷为 bug 非设计——T6 真机抽测一次） |
| Claude Code 之外的 CLAUDE.md 兼容代理 | `CLAUDE.md` | — |

辅助产物（TERMS/CHECKLIST/SKILLS.md、manifest）**不属 adapter**，由 composer 按 selection 直接生成——adapter 只回答「主规则文件写到哪、什么壳」。新增平台 = 新增一个 Adapter 模块 + 注册，其余零改动（风险表「平台契约变化」的隔离解法）；兼容平台 = 只改兼容矩阵一行文档，零代码。

## 9. CLI 设计（apps/cli）

- **薄客户端原则**：CLI 只做传输 + 交互 + 文件 IO；业务逻辑全部在 packages/core（离线可跑）或 server API（在线）。
- 命令/旗标/退出码/安全边界已在 [specs/m6-cli-injection.md](./specs/m6-cli-injection.md) §3–§6 锁定，此处不重复。
- 配置解析链：旗标 > 环境变量 > `~/.openvibe/config.json`（§4）；HTTP 走 `fetch`，超时 5s，401 详式提示。
- 交互确认用 @clack/prompts（sync 的 CONFLICT/DRIFT 逐文件/批量两种粒度）；`--json` 下禁用一切交互（m6b §5.2 的 TTY 防挂起规则）。
- 分发：`apps/cli` 的 `package.json` 声明 `bin: { openvibe }`（装后直呼 `openvibe sync`），**发布名 `openvibe-cli`**（D17，2026-09-21 registry 404 实测；`openvibe` 已被占）；`npx openvibe-cli` 即用（serve 首跑自动拉包）。

## 10. Web 信息架构（apps/web）

| 路由 | 页面 | 主要交互 |
|------|------|----------|
| `/library` | 提示词库 | 列表+侧栏文件夹树+过滤器（m1 FR-3）；编辑抽屉（编辑/预览/版本/diff/回滚）；导入导出 |
| `/terms` | 术语库 | 搜索+多选+TERMS.md 预览（m3 FR-3/4） |
| `/skills` | Skill 台账 | 列表+扫描按钮（m2 FR-1） |
| `/flows` | 流程模板 | 模板卡+复制自定义+阶段编辑器（m5 FR-2） |
| `/projects`、`/projects/:id` | 项目列表/工作台 | 健康摘要+阶段条+看板+日志 Tab+回流入口（m5 FR-1/3/4/5/7）+注入状态 |
| `/packs`、`/packs/new` | 标准包 | 5 步向导+预览+导出历史（m6a FR-1/2/3） |
| `/settings` | 设置 | 服务信息/数据目录/种子重播/备份说明 |

侧栏固定导航（库/术语/Skill/流程/项目/标准包/设置）；服务端状态用 TanStack Query（staleTime 默认 15s，写后失效精确 key）；中文 UI（A1）。

## 11. 安全设计

1. **只听本地**：server 绑定 `127.0.0.1`；`Host` 校验仅放行 `localhost/127.0.0.1`（防 DNS rebinding）。
2. **双通道鉴权**（Fastify preHandler）：
   - 带 `Origin` 的浏览器请求：Origin 必须 `http://localhost:*` 或 `http://127.0.0.1:*`，否则 403（防恶意网页打本地 API）；
   - 不带 `Origin` 的程序请求（CLI）：必须带 `Authorization: Bearer <token>`，token 首启生成、存 `config.json`（0600）；
   - `GET /api/health` 豁免。
3. **文件写入防线**：路径校验双层（manifest 校验 §7.7 + 写入时 resolve 校验）；永不删除 pack 外文件；覆盖前强制备份；dry-run 零写入；**并发 sync 互斥**（T8e，2026-09-23 补）——真写盘前用 `O_EXCL` 原子新建 `<projectPath>/.openvibe/sync.lock`（`{pid,startedAt,command}`，0600），抢不到即退出码 1 + `SYNC_BUSY` 且零写入，不排队；持有者 pid 判死或超 5 分钟视为崩溃残留可接管，`finally` 与 SIGINT/SIGTERM 释放且只删自己那一把（m6b §6.9 / §7.9）。
4. MVP 无其他外部网络调用、无遥测默认开启、无凭据收集（LLM Key 加密存储随 P3 引入，A6）。

### 11.5 可选匿名遥测（澄清 D3，2026-09-20；PRD v0.1.2 第 0 章第 6 行）

- **默认关闭**；设置页一键开关（specs/onboarding.md FR-4），关闭时**零外联**——全部上报收敛到单一出口函数 `reportEvent()`，单测断言关闭态无网络调用。
- **事件白名单仅三类**（PRD 4.4 承诺一致）：`pack_injected`（值 = 包名@版本）、`flow_template_used`（值 = 模板 kind）、`project_active`（值 = 去标识日聚合计数）。上报体固定形状 `{event, value, appVersion, os: "mac"|"linux"|"win", day}`——不含路径、文件内容、机器标识。
- 本地队列表（SQLite）暂存，后台批量上报；**端点已定案（D12，2026-09-20）：自写极简计数端点**——单文件 Cloudflare Worker（或 ~100 行 Fastify 路由）+ KV/SQLite 计数，owner 自部署，零月费零第三方依赖；事件仅三类无需分析面板，聚合结果按日导出即可。
- **首次注入一次性 opt-in 询问（D13，2026-09-20）**：CLI 首次 `sync` 成功后输出一行询问；Web 向导③（lock 检测通过）完成处展示一次性卡片。两入口共享本地标记（`telemetryAskState`: unset/accepted/declined，存 app meta）——declined 后永不再问，accepted 等价于设置页开关打开。默认态仍是关；询问本身零网络请求。
- README 与设置页公开上述白名单与「关闭即零外联」承诺——对一个会写用户文件的开源 CLI，遥测透明度即信任底线（PRD 第 9 章风险行）。

## 12. 搜索设计（FTS5 + 中文）

- 虚表：`fts_prompts(title, content, tags)` 与 `fts_terms(zh, en, aliases, definition)`，**trigram tokenizer**——中文按 3 字符滑窗建索引，任意 ≥3 字符子串可 MATCH，命中即 BM25 排序。
- 外部内容表 + 触发器同步（prompts/terms 的 INSERT/UPDATE/DELETE 三个触发器各一），避免双写漂移。
- **查询路由**：`len(q) >= 3` → FTS MATCH（q 原样作为 trigram 匹配串）；`len(q) < 3` → 降级 `LIKE '%q%'`（中文两字词如「漂移」靠此路径命中，结果按 updatedAt 排序）。
- 为什么不用 ICU/结巴分词：trigram 零词典、零 native 依赖外的构建步骤、子串能力对中英一致；代价是索引体积约 ×3（MVP 万级数据下 SQLite 完全承受，PRD 风险表「搜索退化」的当前答案）。

## 13. 测试策略

| 层 | 对象与重点 | 目标数（MVP 退出） |
|----|-----------|--------------------|
| 单元（vitest） | pack composer 确定性（golden 文件快照）、fingerprint、validate（§7.7 全规则）、变量提取正则、FTS 路由（≥3 / <3）、entryNo 分配、seed 幂等 | ≥ 120 用例 |
| 集成（vitest + app.inject + 临时 DB） | 全部 API 路由含 403/409/422 分支；skills 扫描（临时目录夹具）；导入导出往返 | ≥ 60 |
| CLI 集成（vitest + 临时项目目录 + `--json`） | sync 五状态机分支、dry-run 零写入（全树哈希对比）、备份恢复、diff 退出码、路径攻击样本 | ≥ 25 |
| E2E（Playwright） | **飞轮一条龙**：首启播种 → 建提示词 → 建项目 → 组包导出 → CLI sync 到临时目录 → 手改文件 → diff 报漂移 → 日志回流建术语草稿 | 1 条主链 + 3 条冒烟（导入→复制；术语搜索→TERMS.md；开箱向导三步） |
| 契约快照 | 对固定夹具 pack 的全部产物文件做字节级快照测试（防无意改动契约） | 3 夹具 |

## 14. 性能与容量（MVP 目标，非承诺 SLA）

- 启动（含播种）< 2s；提示词列表/搜索（1 万条库）P95 < 100ms（WAL + 索引 + 分页 50）。
- 组包预览（50 资产）< 500ms；sync（20 文件）< 1s（纯本地 IO）。
- SQLite 单文件预期 < 100MB@万级资产；附件/大二进制不在 MVP 范围。

## 15. 种子内容加载机制（packages/core/db/seed.ts）

```
首启/重播 → 逐 bundle（terms → flow-templates → prompts）：
  1. 算 contentHash，比对 seed_registry：相同 → skip
  2. 内容变了 → 逐条尝试并入：
     - 新条目（按 title / zh+en / name 不存在）→ 插入，写入 seed_hash
     - 既有条目 seed_hash 与 bundle 条目哈希一致 → 未被用户改过 → 更新
     - 既有条目 seed_hash 为 NULL（用户建/用户改）→ 跳过该文件并在结果中警告
  3. 全部处理完 → upsert seed_registry
```

单文件解析失败 → 跳过该文件继续（seed-content FR-1），启动永不因内容阻塞。

## 16. 决策记录（DEC 摘要，评审时可逐条挑战）

> 编号说明：本表 D1–D17 为**设计决策**（技术取舍）；PRD 附录 D 的 D1–D12 为 **owner 裁定**（产品决策）。两套独立编号，正文引用「D7/D9/D11/D12」等未加限定时，以所在文档语境判断。

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | Fastify 而非 Express/Hono | 内置 schema 校验 + inject 测试；Hono 生态尚薄 |
| D2 | better-sqlite3 + 手写 migration，不上 ORM | FTS 触发器/确定性 SQL 直控；Drizzle 对 FTS 无抽象收益 |
| D3 | FTS5 trigram + LIKE 降级 | 见 §12；ICU 分词引入 native 构建链 |
| D4 | CodeMirror 6 而非 Monaco | 包体积 1/10，Markdown 场景够用 |
| D5 | 不引入 turborepo | 9 包规模 `pnpm -r` 足够；少一层缓存黑盒 |
| D6 | bundle 用 JSON 而非 tar/zip | 零依赖、可读可 diff、内容内联天然防「漏文件」 |
| D7 | MVP 整文件管理，不做块级合并 | 块级合并状态机复杂度大；标记已预埋（§7.3），P1 升级路径清晰 |
| D8 | Origin 校验 + Bearer token 双通道 | 见 §11；session/cookie 对本地单用户过重 |
| D9 | 提示词删除为硬删（无回收站） | 版本表级联简单可靠；误删场景以导出备份兜底（P1 再评估软删） |
| D10 | 项目物化 stagesSnapshot | 模板再改不破坏存量项目（m5 FR-2.4）；代价是模板更新不回溯 |
| D11 | 产物确定性（文件内零时间戳） | git/diff/幂等三收益；时间集中在 manifest/lock |
| D12 | ID = 前缀 + nanoid | 日志可读性；不用自增 int 防跨库迁移冲突 |
| D13 | 遥测三类白名单 + 默认关 + 单出口函数 | §11.5；对写文件的 CLI，遥测透明度即信任底线（澄清 D3） |
| D14 | 首启向导每步必须真实副作用（真预览/真注入/真 diff） | specs/onboarding.md；演示动画式向导是社区产品的负资产（澄清 D4） |
| D15 | 国内平台走「专用 adapter ×3 + 兼容矩阵」而非每平台一 adapter | §8；codebuddy/trae/minicode 有专有文件契约故专用，zcode/Kimi/Codex 等读 AGENTS.md 走矩阵零代码覆盖（owner 裁定 D7，2026-09-20 核验；minicode 经 README 实证升为专用，D9） |
| D16 | 向导「我已注入」用 lock 文件自动检测替代诚实按钮 | specs/onboarding.md FR-2.4（D11）；本地服务有权限读测试目录，自动点亮消灭误报完成 |
| D17 | 遥测端点自写极简（单文件 Worker）而非自托管 Umami | §11.5（D12）；三类事件不需要分析面板，零运维零月费 |
| D18 | 遥测询问放在首次注入成功的「惊喜时刻」，一次性、双入口共享本地标记 | §11.5（裁定 D13）；设置页深处的开关几乎无人发现，转化率不可比；拒绝即终点，不追讨 |
