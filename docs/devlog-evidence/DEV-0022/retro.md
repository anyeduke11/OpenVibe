# DEV-0022 · 复盘流走查（飞轮第⑤步 dogfooding 实证）

- **时间**: 2026-09-23 16:55–17:20 (+0800)，HEAD 采样点 `fcf04e1`（会话内并行提交使 HEAD 漂移，见 DEV-0021①）
- **模板**: `content/seed/flow-templates.json` 的 **复盘流**（`kind=retro`，4 阶段：收集 / 分析 / 决议 / 回流）
  —— 用我们自己发布的模板复盘我们自己，检查项逐条按 `retro-1-1 … retro-4-1` 的 id 对账
- **对象**: T1–T9（2026-09-21 首 commit `5653ec6` → 2026-09-23），DEV_LOG `[DEV-0011]`–`[DEV-0021]` 十一条

## 阶段 1 收集（retro-1-1 · 日志/指标/会话摘录齐备）

素材清单，全部可在仓库内复查，不含记忆里的数字：

| 类别 | 素材 | 位置 |
|---|---|---|
| 开发日志 | DEV-0011…DEV-0021（11 条，含 1 条独立审计） | `DEV_LOG.md` |
| 门禁实测 | 五闸 rc=0：**381 用例 / 44 文件**、`seed:check` 100/3/20、`bundle:check` 入口 291 kB | `pnpm lint && pnpm typecheck && pnpm test && pnpm seed:check && pnpm bundle:check` |
| 真机走查 | DEV-0018 T7f（14 step）、DEV-0019 三段（开箱 29 断言 / 遥测外发 / 懒加载网络）、DEV-0020 发布形态 **45 断言 0 FAIL** | `docs/devlog-evidence/DEV-001{8,9}/*.{mjs,sh,txt}`、`docs/devlog-evidence/DEV-0020/publish-walk.txt` |
| CI | run `35827922105 @ bbf5fc2` 三平台 success；**`fcf04e1` 及其后无 CI** | `gh run list --json headSha,conclusion` |
| 计时 | 用户侧 **4.3 s**（serve→sync→diff）；构建+pack+装包 **27.6 s**（其中装包 4.1 s，含两次真装包探针）—— 同路径上一轮为 1.0 s / 52.0 s，秒数是瞬时量 | `publish-walk.txt` §4 与装包段 |
| 会话摘录 | 本轮三次改口 / 两处「未验证 ≠ 通过」，见下方分析 | 本文件 |

**达成度**：`docs/tasks.md` 九组任务全部收口，DoD 五条里 ①代码 ②测试 ③文档 ✅，④演练 = 自动化半边 ✅ / 人工录屏 ⏳，⑤发布+回流 = 本轮收（回流见阶段 4，发布为 `npm publish` 一步待 owner）。

## 阶段 2 分析（retro-2-1 · 按重复性 / 达成度 / 合规性 / 引用可靠性归类）

**重复性（同一类缺陷反复出现，说明缺的是机制不是补丁）**

- **P-1 证据里写死字面量**。本轮亲自撞上：`content/seed/terms.json` 从 104 → 109 条之后，
  `docs/devlog-evidence/DEV-0019/onboarding-walk.mjs:270-273` 的 `step1.includes('术语 104 条')` 立刻假 FAIL。
  同类历史：DEV-0019 记的「vite 构建行取输出末行」把 347.45 kB 的 CodeMirror 分包误当入口；
  README 里写死过未发布包的 npm 徽标。**根因**：驱动器把「某一刻的真值」当成了断言，而不是把真值算出来再比。
- **P-2 手工验证留下无人清理的产物**。DEV-0021⑥ 实测 `/tmp/ov-pkg-*` 36 MB 残渣，出处是一次**没入库**的手工
  发布形态验证；DEV-0019 记的 27 个孤儿 serve 同源（`$!` 拿到子 shell）。**根因**：验证脚本没进仓库，就没人继承它的清理责任。
- **P-3 环境差异冒充结论**。本轮 npm 装包先 `ETIMEDOUT` 再 `climits file not found`，两次表象不同、
  根因不同（网络抖动 / 本机 CLT 的 C++ 头不全）。若不做独立探针就会把网络问题记成打包缺陷。

**达成度**

- 主链八腿在 vitest `cli` 项目收口（真 serve 子进程 + 真 HTTP + 真退出码），发布形态半边由
  `publish-walk.mjs` 的真 tarball 装包收口；**缺口只剩人工半边**：三处交互（复制 / 中文输入搜索 / 看板拖拽）与冒烟 ×3。
- 干净环境证据的**覆盖面被 ABI 限死**：45 项断言只证到 macOS + node-v147；三平台 CI 跑的是源码形态 + Node 22，
  两者不能互证（DEV-0021④ 已就同一件事提出警告）。

**合规性（按 `docs/dev-plan.md` §0.3 变更分级）**

- `PUBLISH_BIN_PATH` 由 `./dist/cli.js` 改 `dist/cli.js`：**C 级实现细节**，无契约影响。
- 种子新增 5 条词条：**B 级行为规格**——它改变 `TERMS.md` 渲染（104 → 109 行）与 default 包（`1.0.0`）内容指纹。
  对 v0.1.0 无害（无人持有旧 lock），但**发布后**再动种子就必须同步升 `DEFAULT_PACK_VERSION`
  （`apps/server/src/lib/default-pack.ts:27`），否则已注入项目下次 `diff` 集体报 DRIFT。这正是词条「规则文件契约」讲的那件事。
- 未动 `prompts.json`：`seed:check` 把精选提示词锁成 **恰好 20 条**（seed-content §2），回流条目落术语侧，
  提示词侧回流走 DB 草稿端点（`m5 §FR-7`，已被 E2E-FLOW-01 第八腿测到）。

**引用可靠性**

- 本轮两处**改口**：① 「`bin[openvibe] was invalid and removed` 是发布阻塞」→ 读 `@npmcli/package-json/lib/normalize.js:50-72`
  + 实装探针证伪，它只是归一化后的伪警告；② 「npm 装包跑不通」→ 复跑命中预编译包并真下载（`~/.npm/_prebuilds/` 新文件为证），
  前一轮的 `ETIMEDOUT` 是网络瞬时量。
- 本轮三处**按未验证处理**（不写成通过）：源码编译回退（本机 CLT 坏）、非 147 ABI 的装包路径、真实 `npm publish`。

## 阶段 3 决议（retro-3-1 每问题有处理方式 / retro-3-2 定级）

| # | 问题 | 处理 | 级别 | 落点 |
|---|---|---|---|---|
| 1 | 驱动器写死种子计数（P-1） | **修**：改为从 `content/seed/*.json` 现算三个数字 | P1 | `onboarding-walk.mjs` 本轮 |
| 2 | 装包探针污染计时口径 | **修**：计时分段，用户侧与「构建+pack+装包」两栏分开报（C-74 口径已覆盖） | P2 | `publish-walk.txt` §4 |
| 3 | 手工验证残渣（P-2） | **缓**：36 MB 属并行会话产物，等 owner 放行；机制侧已由「驱动器入库 + 自清断言」收敛 | P1 | DEV-0021⑥ |
| 4 | 非 147 ABI / 非 macOS 的装包路径无本机证据 | **记录**：写进发布说明「未验证」段，不用 CI 绿抵销 | P0（对外口径） | `docs/release-notes/v0.1.0.md` |
| 5 | 真实 registry 是镜像，dry-run 打到 npmmirror | **修**：发布命令写死 `--registry=https://registry.npmjs.org`，并进 README/发布说明 | P0 | 维护者段 |
| 6 | 三处交互证据仍缺 | **缓**：P1.1 待办 #59（Playwright 按 owner 裁定暂不引入，先人工录屏/截图） | P1 | `docs/dev-plan.md` §14-6 |
| 7 | `fcf04e1` 起无 CI 证据 | **修**：本轮提交后立刻 push + `gh run watch`（三平台） | P0 | 下一步 |
| 8 | 种子变更后 default 包指纹漂移 | **记录**：发布前种子定稿；发布后改种子须升 `DEFAULT_PACK_VERSION` | P1 | 本文件阶段 2 合规性 |

## 阶段 4 回流（retro-4-1 · 术语/提示词/模板改进已入库或建草稿）

第一批回流资产 **5 条词条**，已入 `content/seed/terms.json`（104 → **109**），
每条的 `example` 就是上面某条决议的实测，可回查：

| 词条 | 来源实证 |
|---|---|
| 发布形态走查 published-shape walk | `publish-walk.txt`：45 断言全跑在 `npm pack` 产物上 |
| 预编译包回退 prebuilt binary fallback | 同日志 §2b/§2c 两支：命中 `node-v147-darwin-arm64` 预编译包 / 编译回退未证 |
| 清单归一化 manifest normalization | `@npmcli/package-json/lib/normalize.js:50-72` + `scripts/build-cli.ts` 的 `PUBLISH_BIN_PATH` |
| 镜像注册表 registry mirror | `npm publish --dry-run` 与 `pnpm publish --dry-run` 均打 `Publishing to …npmmirror.com` |
| 瞬时用户激活 transient user activation | DEV-0019/0020 走查的复制按钮拒绝与 §14-6 的 owner 裁定 |

**术语侧之外**：
- 提示词侧：本轮**不入库**（门槛锁 20 条，见阶段 2 合规性），第 21 条起走 DB 草稿。
- 模板侧建议（P2，未执行）：`retro-4-1` 只要求「已入库或建草稿」，建议下版加一条
  「每条回流资产须附来源反链」——本次复盘即按此写；阶段名与检查项受
  `scripts/seed-check.ts` 的逐字校验冻结，改动属 B 级，需先改 spec。

**机器侧复核**：`pnpm seed:check` → `TERMS.md 渲染 109 行，表头/列数一致`、example 覆盖 100%、
受控词表零越界、自然键无重复；`pnpm test` 的 `UT-SEED-02` 在真种子上跑真 SQLite 计数（≥100 且逐条无 warning）。
**人工侧**：这 5 条与 DEV-0019 的 41+20 条同属 owner 审校队列（`docs/devlog-evidence/DEV-0019/seed-review.md:82` 裁决列仍 `（待填）`）。
