# OpenVibe · 灵典

[![CI](https://github.com/anyeduke11/OpenVibe/actions/workflows/ci.yml/badge.svg)](https://github.com/anyeduke11/OpenVibe/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)](./package.json)

> **Vibe coding 的标准化工作台** —— 把提示词、术语、流程和项目经验变成可管理、可复用、可分发的工程标准，
> 一条命令注入 Claude Code / Cursor / CodeBuddy / Trae / MiniCode 的项目目录。

你大概遇到过这种情况：同一个坑，你给 AI 讲过三遍，每个项目讲一遍，同事还得再讲一遍。
OpenVibe 把这些「讲过一遍又一遍的话」收进一个本地库，攒成**标准包**，再写进各个项目的规则文件里 ——
并且知道哪些是你手改过的。

## 30 秒上手

```bash
npx openvibe-cli serve --open                                  # ① 起本地服务，自动开浏览器
npx openvibe-cli sync ~/your-project --pack default             # ② 把预置标准包注入你的项目
npx openvibe-cli diff ~/your-project                            # ③ 看有没有漂移（0=一致，2=有改动）
```

> 全局装过一次（`npm i -g openvibe-cli`）之后就不必每行都带 `npx`。
> `openvibe-cli` 尚未在 npm 上线（v0.1.0 发布的最后一步）。上线前改用源码构建产物：
> `pnpm install && pnpm pkg:cli` → `cd apps/cli/pkg && npm pack` → `npm i -g apps/cli/pkg/openvibe-cli-0.1.0.tgz`，之后命令同上。

第 ① 步首启就会把 **109 条术语 / 3 套流程模板 / 20 条精选提示词** 播进本地库，并自动组装出一个 `default` 标准包
—— 不用先建库再对着空界面发呆。第 ② 步默认先给预览表、要你确认，覆盖任何已有文件前会先备份。
跑完你会得到（实测于干净沙箱）：

| 写入的文件 | 谁读它 |
|---|---|
| `CLAUDE.md` | Claude Code |
| `.cursor/rules/openvibe.mdc` | Cursor（新版规则目录，带 YAML frontmatter） |
| `AGENTS.md` | 通用约定（Codex / Zcode / Kimi 等按此加载） |
| `CODEBUDDY.md` | CodeBuddy |
| `.trae/rules/openvibe.md` | Trae |
| `MINI.md` | MiniCode |
| `TERMS.md` | 术语表全文，人和 AI 都能读 |
| `CHECKLIST.md` | 流程模板对应的检查清单 |
| `.openvibe/pack.lock.json` | OpenVibe 自己的台账（哪个包哪个版本、内容指纹） |

浏览器里 `http://127.0.0.1:8787` 就是全部 UI；关掉进程就什么都不再动。

## 它解决什么

| 现状 | OpenVibe 的答案 |
|---|---|
| 提示词躺在聊天记录里，规则散落各个项目 | 五类资产统一入库：提示词 / 术语 / Skill 台账 / 流程模板 / 标准包 |
| 每人喂给 AI 的规则质量天差地别 | 标准包一键注入，同一套标准跨助手、跨项目 |
| 踩过的坑、发明的词没有沉淀载体 | 术语库 + 技巧库，带来源反链 |
| AI 编码项目流程随意、质量靠运气 | 可裁剪的流程模板 + 检查清单 + 开发/检查日志 |
| 手改的规则会被工具无声覆盖 | `diff` 报漂移，冲突三选一（以包为准 / 保留本地 / 跳过），覆盖前必定备份 |

**核心闭环（标准化飞轮）**：沉淀资产 → 组装标准包 → 注入项目 → 项目里长出的新经验回流成资产。
回流不是口号：在项目工作台写一条开发日志，可以直接从日志生成术语/提示词草稿并挂上来源反链，
下次组包就能用。

## 功能一览

**Web（`openvibe serve` 后打开）**

| 路由 | 干什么 |
|---|---|
| `/library` | 提示词库：文件夹树 + 过滤器 + 双栏编辑器，版本历史/diff/回滚，四形态导入导出 |
| `/terms` | 术语库：拼音与英文双序搜索、多选、`TERMS.md` 实时预览 |
| `/skills` | Skill 台账：扫描本机 skill 目录与项目规则文件并登记 |
| `/flows` | 流程模板：三套内置模板只读，复制成自己的再裁剪阶段 |
| `/projects` | 项目工作台：阶段条 + 看板拖拽（键盘/按钮同效）+ 开发日志 + 回流入口 + 注入状态 |
| `/packs` | 标准包：五步向导组包、预览即产物（与导出字节一致）、导出历史与 bundle 下载 |
| `/settings` | 设置：数据目录、种子重播、备份说明、遥测开关、向导重播 |

**CLI**

```
openvibe serve [--port 8787] [--open]     本地 API + Web UI，首启生成配置与令牌
openvibe sync <dir> [--pack <n[@v]>]      注入：--dry-run 零写入 / --file|--dir 离线注入 / --target 只写指定平台
openvibe scan  [--skills | --project <d>] 扫描 skill 目录或项目规则文件并登记
openvibe diff  <dir>                      产物 vs lock 比对 + 是否有更新版本；退出码 0 一致 / 2 漂移
openvibe clean <dir> [--yes]              退场：删当前 lock 登记且未改动的受管文件（删前一律备份）；--dry-run 只出计划零写入 / --force 连改过的一起删；退出码 0 全清 / 2 有保留或已取消（未删任何文件） / 1 出错
```

三条全局旗标 `--server` / `--token` / `--json`；`--json` 下 stdout 只有一个 JSON 对象且禁用一切交互，
适合挂在 CI 或别的工具里。

## 架构一图

```
        你的浏览器 ── http://127.0.0.1:8787（只听本地）
                     │
  ┌──────────────────┴───────────────────┐
  │  openvibe serve = 一个进程            │
  │  apps/web  React SPA  ──HTTP──┐      │
  │  apps/server Fastify API ─────┴──┐   │        packages/adapters  平台契约（写哪儿、套什么壳）
  │                                  └─►│─── packages/core  组包/指纹/注入规划/FTS 搜索/播种
  └──────────────────┬─────────────────┘   │        packages/shared  zod 契约（Web/CLI/包格式共用）
                     │                     ▼
                 ~/.openvibe/          你的项目目录
                 ├── data/openvibe.db   .openvibe/pack.lock.json + 八个规则/清单文件
                 ├── config.json (0600) .openvibe/backup/<UTC 时间戳>/（覆盖前的原件）
                 └── packs/<name>@<v>/  （目录导出通道）
                     ▲
        apps/cli  薄客户端：只做传输 + 交互 + 文件 IO，业务逻辑不在它身上
```

- 只有一个运行时依赖：`better-sqlite3`（原生模块不能打包），其余全部内联进单文件 `cli.js`。
- 数据是**一个 SQLite 文件**，没有服务、没有账号、没有后台常驻。
- CLI 断网可用：`sync --file bundle.json` / `--dir` 走离线注入，不需要起 serve。

## 支持的 AI 助手

| adapter | 写入位置 | 说明 |
|---|---|---|
| `claude-code` | `CLAUDE.md` | 项目根 |
| `cursor` | `.cursor/rules/openvibe.mdc` | 新版规则目录，`alwaysApply: true` |
| `generic-agents` | `AGENTS.md` | 通用约定，多数新工具直接读 |
| `codebuddy` | `CODEBUDDY.md` | 无此文件时回退读 `AGENTS.md` |
| `trae` | `.trae/rules/openvibe.md` | frontmatter 壳（经二进制复核确认） |
| `minicode` | `MINI.md` | 项目根 |

兼容矩阵另列了只读 `AGENTS.md` 的工具（Zcode、Kimi 等），见 `packages/adapters/src/compat.ts`。
组包时选了某平台就会产出该平台的产物，`sync --target cursor` 可以只写其中一部分。

## 数据落在哪里

```
~/.openvibe/
├── config.json          serverUrl / token（0600）/ 可选 telemetryEndpoint
├── data/openvibe.db     全部资产、项目、日志、导出记录（SQLite，WAL）
├── logs/                预留
└── packs/<name>@<v>/    目录导出的产物
```

**备份 = 停服务后整目录复制。** 迁移机器同理。项目侧只有 `.openvibe/`（lock + 覆盖前备份），可以随项目提交 git。

## 隐私与网络行为

对一个会写你文件的工具，这一节是信任底线（设计依据 design §11.5）。

- **只听本地**：服务绑 `127.0.0.1`，`Host` 校验只放行 `localhost` / `127.0.0.1`（防 DNS rebinding）。
  除你自己配置的 `serverUrl` 外，**唯一可能的出网是可选匿名统计，默认关闭**。
- 白名单只有三类事件：`pack_injected` / `flow_template_used` / `project_active`；
  上报体固定五段 `{event, value, day, os, appVersion}`，**不含路径、文件名、资产内容与任何机器标识**。
- **关闭即零外联**：开关关着连入队都不发生；`config.json` 里没有 `telemetryEndpoint` 时，
  serve 连上报定时器都不创建。`openvibe serve` 的启动信息会如实打出当前是否 armed、间隔多久、发到哪个端点。
- 询问只在首次注入成功那一刻出现一次，拒绝即终点；随时可在设置页打开或关闭。
- 接收端是 owner 自部署的单文件计数端点（`deploy/telemetry/`），零第三方分析依赖 —— 你也可以完全不部署。

写文件侧的防线（`sync` 的每一跳）：路径双层校验 → 整包注入前检查 → 每次写盘前 `resolve` 复核（悬空符号链接
一律拒绝，不会顺着链接在项目外凭空建文件）→ 覆盖前强制备份 → `--dry-run` 零写入 → 同一项目并发 `sync`
用文件锁互斥（抢不到就 `SYNC_BUSY`，零写入）。

## 常见问题

**要联网吗？** 装包和 `npx` 首次下载要网，运行完全本地。断网可以 `sync --file bundle.json` 离线注入。

**我手改过 `CLAUDE.md`，会被无声覆盖吗？** 不会。`diff` 会报 `DRIFT`；再 `sync` 时对冲突文件三选一
（以包为准 / 保留本地 / 跳过），选前两者也会先备份原件。默认策略是「以包为准」，所以脚本化请显式 `--strategy`。

**想让团队/多个项目用同一套标准？** 导出 bundle JSON（或目录导出），提交进你们的仓库或发群里，
别人 `sync --file` 即可 —— 注入产物的指纹一致，`diff` 判得出来。v0.1 没有云同步和账号体系。

**怎么卸载？** `Ctrl-C` 停 serve，删 `~/.openvibe/`，项目里的 `.openvibe/` 与规则文件是普通文本，留着不影响任何工具。

**为什么包名叫 `openvibe-cli` 而不是 `openvibe`？** npm 上 `openvibe` 已被占用（registry 实测），
装好后命令仍是 `openvibe`。

**pnpm 装包报 `ERR_PNPM_IGNORED_BUILDS`？** pnpm 10 默认不跑依赖的安装脚本，
`pnpm approve-builds` 里勾上 `better-sqlite3` 即可 —— 这是 pnpm 的安装器语义，不是打包缺陷。
npm / npx 用户走 `prebuild-install` 按平台与 Node ABI 取预编译包，不会遇到这条
（实测：装 tarball 时命中 `node-v147-darwin-arm64` 预编译产物，装出来的 `openvibe` 直接起得来 serve）。

**Node 版本？** ≥ 22。macOS / Linux / Windows 三平台 CI 常跑。

## 已知局限（v0.1.0）

- **一项目一包**：`pack.lock.json` 是单包结构，一个目录同时只由一个标准包托管，换包即整包替换，不做多包叠加。
- **整文件管理，无块级合并**：受管单位是整个产物文件；注入后你改过的段落（DRIFT）不会被自动重写。
  退场用 `clean`（默认只删未改动的受管文件，删除前一律先备份），回滚同理靠 `.openvibe/backup/`；
  没有 `update` 子命令（标记已预埋，块级合并是下一档要做的事）。
- **真实点击与中文输入已有自动化证据，拖拽没有**：浏览器走查里「navigate 后读 DOM」那一类驱动器测不到真实用户动作
  （合成点击拿不到 transient user activation）。2026-09-24 起另有一条裸 CDP **真输入**驱动器覆盖复制按钮与
  中文输入搜索两条场景（真鼠标点击 + 真中文注入 + 系统剪贴板逐字节反查，需有头浏览器）；
  **看板拖拽仍无自动化证据**，如需验证请手工做一次。
- 中文 UI 优先，暂无英文版；种子内容以中文技术术语为主，欢迎补其他语言与领域。
- 团队权限、审批流、LLM 密钥托管均在 P2/P3 计划内，本期没有。

## 与同类项目的差异

- vs **PromptHub**（1.7k★，AGPL-3.0）：它是本地优先的个人资产管家；OpenVibe 做**流程 + 知识标准化 + 团队闭环**（术语库/技巧库/标准包治理均为空白地带）
- vs **BMAD / spec-kit**：它们是不可视化管理的方法论模板；OpenVibe 把流程做成**可裁剪组合的工作台**并与资产联动
- vs **skills.sh / rulesync / rulebook-ai**：它们是安装渠道或规则同步器；OpenVibe 管分发后的版本、冲突、指纹与项目级编排

## 从源码开始

```bash
git clone https://github.com/anyeduke11/OpenVibe && cd OpenVibe
pnpm install                # pnpm ≥ 10，corepack enable 即可
pnpm lint && pnpm typecheck && pnpm test        # 449 用例（unit / integration / cli / web-jsdom 四层；win32 会门控跳过 8 支 POSIX 语义用例）
pnpm seed:check && pnpm bundle:check            # 另两道门禁：种子数量与构成配额、Web 体积闸门
pnpm pkg:cli                                    # 产出发布暂存目录 apps/cli/pkg/
cd apps/cli/pkg && npm pack                     # → openvibe-cli-<版本>.tgz，可 npm i -g 它
```

开发环境请读 [CONTRIBUTING.md](./CONTRIBUTING.md)（含跨平台纪律清单与依赖边界规则）。
每完成一个任务组在 [DEV_LOG.md](./DEV_LOG.md) 追加一条 `DEV-NNNN`（问题/思路/变更/验证/风险）。

## 文档地图

```
docs/
├── PRD.md / proposal.md            为什么做、做什么、验收线
├── design.md                       选型 / 数据模型 / API / ★标准包契约 / ★adapter 清单
├── tasks.md / dev-plan.md          T1–T9 任务分解与日级排期、验收-测试映射
├── release-notes/                  发布说明（v0.1.0 起；含「本版未验证」清单）
├── competitive-*.md                竞品调研与深度对比
├── DEV-00NN 证据                   docs/devlog-evidence/：真机走查驱动器 + 日志，可对 HEAD 复跑
└── specs/                          逐模块规格（输入输出、边界、验收标准）
    ├── m1-prompt-library.md   m2-skill-registry.md   m3-glossary.md
    ├── m5-project-flow.md     m6-standard-pack.md    m6-cli-injection.md
    └── seed-content.md        onboarding.md
```

里程碑：P0 文档定稿 → T1 脚手架 → T2 存储核心 → T3 提示词库 → T4 术语库 → T5 项目流程 →
T6 组包导出 → T7 CLI 注入 → T8 种子全量 + 开箱体验 → **T9 飞轮 E2E + 发布（当前）**。
细节见 [DEV_LOG.md](./DEV_LOG.md)。

## 许可

Apache-2.0。代码与种子内容同协议。
