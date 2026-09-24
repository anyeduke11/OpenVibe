# OpenVibe MVP 任务清单（tasks）

| 项 | 值 |
|------|------|
| 文档定位 | 按什么顺序做：P0 门禁 → T1–T9 任务组（P1/MVP，已冻结）→ **§2b P1.1 任务组 T10–T11** → 周计划 → 完成定义 |
| 上游 | [proposal.md](./proposal.md)、[specs/](./specs/)（验收出处）、[design.md](./design.md)（实现蓝图） |
| 版本 | v0.1（2026-09-20）→ **v0.2（2026-09-23，P1.1 开档 D19：新增 §2b 任务组 T10/T11、§3 变体①④判作废 + ②改判 P2 并做「飞轮面板」同名异物消歧、§4·T9 组加冻结注（D21）、§5 风险表两处口径更新；`clean` 验收按自审补闸扩到 a–j / `CLI-CLEAN-01..10`。范围裁定正文在 [dev-plan.md §15](./dev-plan.md)；同日 DEV-0024 另做**一次状态回填**（S-2 探针结论 → §2b·T11 两条 + §4·T9 冻结注与 Playwright 历史行 + T9 验收①，C 级，任务编号与人日不变）；**2026-09-24 DEV-0025 再做一次状态回填**（§2b·T11 三条冒烟收口 + 其验收行 + §4·T9 验收① 指向该收口，同为 C 级，任务编号与人日不变）；**同日 DEV-0026 第三次状态回填**（§2b·T10 新增一行「计划落库 + 三处规格/代码冲突定稿」，规格侧因此推进为 **m6b v1.3 / m6a v1.2**，仍属 C 级登记，T10 人日 1.8 不变）；**同日 DEV-0027 第四次状态回填**（§2b·T10 **收口**：三条 `- [ ]` 转 `- [x]`——`clean` 现测 29 支、预览体量现测 CORE-SIZE 6 + SRV-EST 6、一项目一包按 §6.10 修正收口；验收行补上五闸本机实测与 `tests/golden/` **空输出**凭据，并明写三平台 CI 未跑 ⇒ dev-plan §15.6 DoD ①③ 仍开放。规格侧本轮**一字未动**（m6b 停在 v1.5 / m6a 停在 v1.3），任务编号与人日不变，仍属 C 级登记）** |
| 姊妹文档 | [dev-plan.md](./dev-plan.md)（P1 执行版：架构/DDL/API/组件清单/T1–T9 文件级分解/验收-测试映射/日级排期/内容生产 SOP/SPEC 流程规范）——本文保留里程碑概览，两者人日与任务编号零偏差 |

**执行规约**（继承全局 AGENTS 规范，随本仓库生效）：

1. 每完成一个任务组（或组内一个完整功能）→ 在 `DEV_LOG.md` 追加 `DEV-NNNN` 记录（编号递增，含测试验证与输出）。
2. 每 40 轮对话 → 生成 `CHECK-NNNN` 报告（维度：重复性/达成度/变更追踪/合规性/引用可靠性）。
3. **Dogfooding**：OpenVibe 自身开发即按「Spec 驱动流」模板走（本套文档就是第 1–4 阶段的产物），复盘产出回流术语库——MVP 完成时自身就是飞轮案例（PRD 附录 C）。
4. 任务组内的验收以对应 spec 的「验收标准」小节为准，本文只列补充项，避免两处维护。

---

## 0. P0 门禁（owner 决策，T1 开始前/并行裁定）

| # | 决策项 | 材料 | 状态（2026-09-20 裁定收口） |
|---|--------|------|---------------------------|
| G1 | PRD 假设 A1–A8 逐条确认 | PRD v0.1.2 第 0 章 | ✅ **已完成**（澄清+裁定两轮）；遗留 A8 npm 名核验 → T1 第一件事 |
| G2 | **标准包契约 §7 冻结** | design.md §7 | ✅ **已冻结 v1**（2026-09-20 owner 裁定，golden 快照即锁定基线） |
| G3 | **adapter 清单 §8 冻结** | design.md §8 | ✅ **已冻结 v1.1**（扩充国内平台 D7：+codebuddy +trae；MiniCode 契约核验入 T1，结果只影响兼容矩阵一行，不动契约） |
| G4 | 开源协议选择 | PRD 第 0 章第 10 行 | ✅ **定案 Apache-2.0**（D6）；T1 落 LICENSE |
| G5 | npm 包名核验 | proposal A8 | ✅ **已关闭（2026-09-20 P0 期实测）**：`vibecanon`（旧名）registry 404 = 可用——**D17 更名后包名定为 `openvibe-cli`（2026-09-21 实测 404）**；T1 直接用本名 |
| G6 | P1 工期口径 | 本文 §3 | ✅ **定案 6.5 周（D8 修订）**：任务 31.5 人日 + 显式缓冲 1 人日（含向导自动确认与 minicode adapter 增量） |

## 1. 依赖图

```
T1 脚手架 ──► T2 存储核心 ──┬──► T3 提示词库(M1) ──┐
                            │                      ├──► T6 组包导出(M6a) ──► T7 CLI(M6b) ──► T9 飞轮E2E+发布
                            ├──► T4 术语库(M3+词条) ─┤            ▲                    │
                            └──► T5 项目流程(M5)+Skill台账(M2) ────┘                    ▼
                                     ▲                                          T8 种子全量+开箱体验(依赖T6/T7)
                                     └──(FR-6 注入状态：读 T6 定义的 lock 格式，夹具驱动)
```

关键路径：T1 → T2 → T3 → T6 → T7 → T9。T4/T5/T8 可与关键路径并行排布；T6 最早可在 T3 完成后启动（composer 只需 M1 素材即可跑通，M3/M5 素材后补）。

## 2. 任务组明细

### T1 · 工程脚手架（W1，预估 1.5 人日）

- [ ] ~~核验 npm 包名~~（✅ P0 期已关闭：旧名 `vibecanon` 可用；D17 更名后 `openvibe-cli` 2026-09-21 实测可用，直接定名）
- [ ] ~~平台契约核验收口（G3 尾巴）~~（✅ P0 期已关闭：MiniCode = 专用 adapter `MINI.md`（README 实证）；Trae 多文件由 T6 真机复核确认，但 frontmatter 从 `trigger` 修正为 `alwaysApply`（二进制一手证据，见 DEV-0016 C-26）；Kimi 证据升级「较强」，AGENTS.md 感知由 Codex 二进制 `agents_md.rs` 佐证）
- [x] pnpm workspace + 根 tsconfig（strict、`moduleResolution: bundler`）+ ESLint/Prettier
- [x] 建 `apps/{web,server,cli}`、`packages/{core,adapters,shared}`、`content/seed` 空骨架（design §3 目录逐一对齐）
- [x] `packages/shared`：zod 实体 schema（specs 各 §3 字段）、错误码枚举、`schemaVersion` 常量
- [x] vitest 三层配置（unit / integration / cli-project 夹具 helper）+ GitHub Actions（lint + test，**三平台矩阵 macOS/Linux/Windows（D5）**，预留 `seed:check` 挂点）
- [x] 落 LICENSE（Apache-2.0，G4 默认）+ README 徽章；CLI 路径/换行符跨平台纪律清单入 CONTRIBUTING 起点
- [x] 仓库落地（D16/D17，2026-09-21 变体执行）：`git init` 零历史新仓库于 `Documents/OpenVibe`（dev-plan 原文的家目录 orphan 分支会波及 hotspot 未提交改动，改用等效落地）→ 提交本套 docs/README/DEV_LOG + LICENSE + .gitignore → 推送 GitHub `anyeduke11/OpenVibe`（远端存 owner 手建 init 提交，本地提交 rebase 其上，不强推）→ home 存档仓库解除跟踪（历史保留）

**验收**：`pnpm i && pnpm lint && pnpm test` 全绿（含 1 个示例用例/层）；CI 首跑通过。—— ✅ **T1 完成（2026-09-21，DEV-0011）**：本地 lint/typecheck/test 全绿（10 用例，含 UT-LINT-01 R3 边界夹具）；CI run 35558098022 三平台（macos/ubuntu/windows）全部 success。

### T2 · 存储核心（W1，预估 2.5 人日）

- [x] better-sqlite3 封装：打开/建目录/`~/.openvibe/` 布局（design §4）、WAL、migration runner（只前进）
- [x] migrations v1：design §5 全表 + 外键 + 索引
- [x] FTS：两张 trigram 虚表 + 六触发器 + 查询路由（≥3 MATCH / <3 LIKE，design §12）
- [x] 仓储层：prompts（含版本快照/回滚）、terms、skills、flows、projects（stagesSnapshot 物化）、packs；entryNo 事务分配
- [x] seed 加载器骨架（幂等规则按 design §15，数据 T4/T8 到位）
- [x] 单测：版本快照触发/不触发、级联删除计数、FTS 中英命中、seed 幂等（夹具 bundle 跑两遍）

**验收**：m3 验收 1/4、m1 验收 2/3 的存储层前置在单测层通过。—— ✅ **T2 完成（2026-09-21，DEV-0012）**：37/37 用例全绿，六条验收映射（UT-MIGRATION/VERSION/CASCADE/FTS/SEED/ENTRYNO）逐条通过。

### T3 · M1 提示词库垂直切片（W1末–W2，预估 4 人日）

- [x] API：design §6 提示词六端点（含 import/export、versions/restore）——实落 **九端点**（list/create/get/patch/delete/versions/restore/import/export），`X-Referenced-Packs` 走 C-6，md 导出单文件拼接（C-5）
- [x] 规则文件解析器（`packages/core/importers`）：`.cursorrules`/`.mdc`(frontmatter 剥离)/`CLAUDE.md`/`AGENTS.md`——四解析器 + 未知扩展名报错，UT ×7
- [x] Web `/library`：列表+文件夹树+过滤器+编辑抽屉（CodeMirror 双栏）+复制变量弹窗——design §5.2 十组件全落，中文文案集中 `i18n/zh.ts`
- [x] 版本历史 UI + jsdiff 渲染 + 回滚——两版勾选 → 行级 diff（新增/删除双向已取证），回滚以旧版建 v4 且草稿内容同步
- [x] JSON/Markdown 导入导出 + 去重报告——FileReader→解析器→`title+contentHash` 去重，报告「新建 3 跳过 0 / 新建 0 跳过 1」，导出真实落盘
- [x] 集成测试覆盖 m1 §7 全部 8 条验收对应的 API 行为——IT ×9（含 IT-AUTH-01 与「空 body + JSON header → 400」契约断言）

**验收**：m1 §7 逐条通过（UI 项人工过一遍并录屏存档 DEV_LOG）。—— ✅ **T3 完成（2026-09-21，DEV-0013）**：53/53 用例全绿；m1 §7 八条逐条映射通过；浏览器实测走查 16 张截图 + 走查日志 + 两份真实导出落 `docs/devlog-evidence/DEV-0013/`（走查中修复 4 处测试未覆盖的缺陷：restore 400 / toast 串位 / 回滚后 diff 口径 / `@lezer/javascript` 白屏）。

### T4 · M3 术语库 + 首批词条（W2，预估 2.5 人日；词条初稿 AI 起草、owner 审校，D14）

- [x] API 四端点 + render-terms-md（确定性排序与 `|` 转义）——实落 **五端点**（list/create/patch/delete + `GET /terms/:id`）+ `POST /terms/render-md`；`X-Referenced-Packs` 走 C-6；排序键禁用 `localeCompare`、拼音序取 `pinyin-pro` 词典键（C-14，三平台字节一致）；契约下沉 `packages/shared/src/terms-md.ts`（C-11）
- [x] Web `/terms`：搜索+多选+TERMS.md 预览——搜索 <3 字走 LIKE + 降级提示（m3 FR-3.3），多选生成/复制/下载三通道，关联词条双向并集展示，删除确认框显示引用包
- [x] 种子机制激活：`content/seed/terms.json` 首批 **60 条**（附录 B 10 条必须含；质量门槛按 seed-content §3.2）——实落 **63 条**（附录 B 10/10 在库），`source=seed` + `seed_hash` 全量落库；复启幂等与「用户已改词条跳过升级并告警」已实测
- [x] `pnpm seed:check` 脚本（schema+数量+受控词表）——TS 化 + 进 CI 作为独立闸（C-16），阈值 60/3/0（T8 切 100/3/20）；负向用例实测：削至 58 条 → `✗ 数量 — 58 条 < 门槛 60 条` 退出码 1

**验收**：m3 §7 全过；`seed:check` 以 60 条门槛先行（全量 100 在 T8 补齐后阈值切换为 100）。—— ✅ **T4 完成（2026-09-21，DEV-0014）**：67/67 用例全绿（较 T3 净增 14：UT +9 / IT +5）；m3 §7 五条与 seed-content §7 四条逐条映射通过；浏览器实测 15 步走查 15 张截图 + TERMS.md 样本（sha256 复算一致）+ 走查日志落 `docs/devlog-evidence/DEV-0014/`；走查中修复 3 处测试未覆盖缺陷（空 body + JSON header、`{items,total}` 未分页口径、渲染层告警被吞）。**词条审校为 owner 步骤（D14 / dev-plan §11.3），尚未执行。**

### T5 · M5 项目流程 + M2 Skill 台账（W3，预估 4 人日）

- [x] 项目/模板/看板/日志/勾选状态全套 API（含 builtin 403、导出 DEV_LOG.md）——29 端点：projects 9 / tasks 4 / devlog+回流 5 / flow-templates 5 / skills 6；内置模板 PATCH+DELETE → **403 `BUILTIN_IMMUTABLE`**；导出走附件流（`- 测试命令:` / `- 结果:` 证据段在位）
- [x] 回流快捷入口两端点动作（→术语/提示词草稿，source=project、linkedAssetIds 回写）——`POST /api/projects/:id/devlog/:logId/assets` 幂等并入 `linked_asset_ids` + `GET /api/reflow-origin/:assetId` 反查「来源：项目 X 的 DEV-00NN」
- [x] injection-status 只读端点（lock 解析器按 design §7.5，用夹具文件驱动，不等 T7）——`packages/core/src/local/lock.ts` 只读 `.openvibe/pack.lock.json`（name/version/fingerprint/injectedAt + CLI 建议命令）；夹具 lock 走查，读写分离由 T7 交付
- [x] Web `/projects`、`/projects/:id`（健康摘要+阶段条+看板+日志 Tab）——四页 14 组件 5 hooks；看板与模板编辑均为 @dnd-kit 指针+键盘双模，且同一 PATCH 由 ↑↓←→ 按钮等价兜底（T5 裁定）
- [x] M2：skills 扫描端点（dirHash 算法按 m2 FR-1.3）+ `/skills` 页 + 手动登记——`computeDirHash`/`parseSkillFrontmatter`/`defaultScanRoots` + 手动条目与同名目录合并为 v2（`source` 保持 manual）
- [x] 3 套流程模板数据随本任务入库（阶段定义照抄 seed-content §3.3，先随代码常量，T8 移入 seed 文件）——**提前于 T4 以 seed 文件形式落盘**（C-15，§11.4 门槛要求 `templates=3`），阶段名与 §3.3 逐字一致（3/7/4 阶段），故本项无代码常量环节

**验收**：m5 §7 全部 8 条 + m2 §7 全部 5 条通过。—— ✅ **T5 完成（2026-09-21，DEV-0015）**：103/103 用例全绿（较 T4 净增 36：core/tasks 14 + lock 5 + server flow.api 10 + skills.api 5 + repos 补 2）；m5 §7 ×8 与 m2 §7 ×5 逐条映射，另覆盖 design D10 与 m5 §6.1/§6.5；浏览器实测四段 **75 项断言全 PASS / 0 FAIL、34 张截图**落 `docs/devlog-evidence/DEV-0015/`；走查中发现并修复 4 处（toast 吞点击、`Runtime.exceptionThrown` 事件名致永真断言、SQL 双引号字面量、我方错误期望 ×3）。**契约级变更 C-18…C-25 已在 DEV-0015 登记**（其中 C-18 `check-states` 双端点为文档未列的新增通道）。

### T6 · M6a 组包导出 + 契约快照（W3，预估 5.5 人日）★ 关键路径

- [x] `packages/core/pack/`：composer（design §7.3 组合规则）、fingerprint（§7.6）、validate（§7.7 全规则）
- [x] `packages/adapters/`：**六 adapter**（claude-code / cursor / generic-agents / **codebuddy / trae / minicode**，D7+D9）+ registry + 兼容矩阵常量（design §8 v1.2）
- [x] **真机复核**（半天内）：Trae CN 二进制一手证据推翻原 `trigger: always`——改 `{ description, alwaysApply: true }`，`.trae/rules/openvibe.md` 自定义名保留（`project_rules.md` 回退预案未触发）；Codex 二进制 `core/src/agents_md.rs` 证实读 `AGENTS.md`（根+嵌套，`AGENTS.override.md`）；证据落 `docs/devlog-evidence/DEV-0016/{trae-frontmatter,codex-agents}-probe.txt`；owner 的 GUI 暗号实测（2026-09-22，不引用文件发问）两枚暗号全对 ⇒ `alwaysApply: true` 自动加载与 `Trae CN → AGENTS.md` 通道升为一级证据，`project_rules.md` 回退正式关闭（C-39，`trae-gui-manual-check.txt`）
- [x] API：preview/export/exports/injections（含 409 VERSION_IMMUTABLE、STALE_SELECTION）——实落 **11 端点**（§3.8 标题「6 端点」为早期估算，见 DEV-0016 C-35）
- [x] bundle 下载 + 目录导出双通道（幂等/409 规则）
- [x] Web `/packs/new` 5 步向导 + 预览（文件树+内容+**覆盖平台提示**，读兼容矩阵）+ 导出历史
- [x] **golden 快照测试**：3 个固定夹具包（其中一个 targets=codebuddy+trae+minicode）的全部产物文件字节级断言（契约防漂移，此后任何改动 §7/§8 需先改快照=显式升版）

**验收**：m6a §7 全部 7 条通过（#6 bundle 被 `sync --file` 消费为 T7 联测项）；golden 快照进 CI。—— ✅ **T6 完成（2026-09-22，DEV-0016）**：152/152 用例全绿；浏览器走查两段 **82 项断言全 PASS / 0 FAIL**（第 1 段向导+双通道+版本治理 66、第 2 段列表/详情/编辑/删除+STALE 标红+C-25 包关联 16）落 `docs/devlog-evidence/DEV-0016/`；走查中发现并修复 `.gitignore` 未锚定 `packs/` 吞掉 5 个 Web 组件（C-38）。

### T7 · CLI：serve/scan/sync/diff（W3末–W4，预估 4.5 人日）★ 关键路径

- [x] config 发现链 + token 生成（0600）+ `--json` 输出契约 —— `config.ts` 五级发现链（`OPENVIBE_TOKEN/SERVER` → 项目 `.openvibe/config.json` → `~/.openvibe/config.json` → 默认），令牌文件 **0600** 落盘且已有令牌优先复用（不轮换）；`--json` 单出口 `{command, plan?, report?, summary}` + 退出码 0/1/2 由 `output.ts` 一处渲染（CLI-CFG-01…08、CLI-JSON-01…07）
- [x] `serve`（首启初始化+播种+托管 Web+`--open`）—— bootstrap 八步（DB→迁移→播种→路由→静态托管 SPA 回退→监听→config 落盘→回调），监听成功才落 config（失败不留指向不存在端点的配置），`--port 0` 随机端口 + `--open` 平台分流（CLI-SERVE-01…04）
- [x] `scan --skills/--project`（调 T4/T5 端点，报告渲染）—— `--skills` 调 `POST /api/skills/scan`（解析与指纹全在服务端，CLI 零业务规则）；`--project` 本地探测顶层 `.cursorrules`/`claude.md`/`agents.md`（大小写不敏感匹配、按磁盘原名回报）+ 一层 `.cursor/rules/*.mdc`，走 `POST /api/prompts/import`，逐文件新增/跳过判定由探测集反推（CLI-SCAN-01 + 13 例）
- [x] `sync` 五状态机 + 交互确认（@clack）+ `--dry-run/--yes/--strategy/--target` + 备份 + lock 写入 + 上报 —— 四通道取包（`--pack` 在线 / `--file` / `--dir` / 位置参数）→ 指纹与逐文件哈希双校验 → core 规划器出 NEW/UPDATE/IN_SYNC/DRIFT/CONFLICT → 交互或 `--strategy` 批量 → 备份到 `.openvibe/backup/<UTC戳>/`（同戳撞车追加 `-1/-2`）→ 写 `pack.lock.json` → 上报注入历史（离线仅警告）；写失败即中止并报「已完成 N/M 项 + 备份路径」（CLI-SYNC-02…07 全家族 ×29）
- [x] `diff`（lock 比对 + 在线新版本探测 + 退出码 0/1/2）—— 只读 `pack.lock.json`（**故意不做 realpath 归一**：lock 记的就是用户给的路径）逐文件比对磁盘哈希，报 drifted/missing；在线时另探「有新版」（`pack-outdated(1.0.0 → 1.0.1)`），探测失败降级为警告不改判定；退出码 clean=0 / 有漂移或落后=2（CLI-DIFF-01/01b + 11 例）
- [x] 遥测埋点接入：sync 成功/模板选用事件走单出口 `reportEvent()`（默认关、关闭态零外联断言，design §11.5）；首次注入成功后触发一次性 opt-in 询问（D13：CLI 一行提示 + 本地标记，拒绝永不再问）—— `telemetry.ts` 单一出口，读服务端开关后**关闭态恰好一次 GET、零事件 POST**（UT-TELEMETRY-01）；`askTelemetryOnce` 仅在 `askState=unset` + TTY + 非 `--json` 三条件下开口，答「不开启」落 `declined` 永不再问；任何遥测失败都收敛成 `error` 不打断注入
- [x] 安全用例集：路径攻击样本、512KB/2MB 防线、非 TTY 防挂起、fingerprint 篡改 —— 三层防线（bundle 解析 `packPathSchema` → 整包 `checkPackInjectable` → 每次写前 `resolveWriteTarget`）逐层给例；本轮走查新堵一个洞：**悬空符号链接**目标此前返回合法路径、`writeFile` 会在项目外凭空建文件，现一律判 ESCAPE（修复 + A/B 一手证据 `docs/devlog-evidence/DEV-0018/symlink-escape-ab-proof.txt`）
- [x] CLI 集成测试：临时目录全树哈希断言 dry-run 零写入（m6b §7.1a 的机械化验证）—— `tests/helpers/tree.ts` 的 `treeSnapshot()` 对全树逐文件记 sha256+mtime+size+mode 后取总结哈希，「零写入」一律断前后相等（比 `existsSync` 硬）；apps/cli **10 文件 / 106 个 it / 57 个唯一 CLI-* 用例 ID**（清单 `docs/devlog-evidence/DEV-0018/cli-case-inventory.txt`）

**验收**：m6b §7 全部 8 条通过（联调 m6a 验收 6 一并闭环）。—— ✅ **T7 完成（2026-09-22，DEV-0018）**：m6b §7 八条在真 CLI 子进程 + 真服务端上**逐条走查通过**（14 步日志 `docs/devlog-evidence/DEV-0018/accept-walk-log.txt`，驱动器同目录入库），另补 §6.1/§6.3/§6.5/§6.6 安全样本；两套独立 DB 跑同一选集包指纹一致（`determinism-two-runs.txt`）；m6a 验收 6「bundle 被 `sync --file` 消费」由 CLI-SYNC-06 + 走查 step 4/5 闭环；全仓 307/307 用例绿。

### T8 · 种子内容全量 + 开箱体验（W5，预估 4 人日；内容由 AI 起草 + owner 审校 ≈ 2-3 人日，D14）

- [x] terms.json 补齐至 **≥100**——实际 **104 条**（T9c 复盘回流后 **109 条**，见 DEV-0022；批次 C/D 新增 41 / 移除 0；附录 B 十条基线齐备、aliases 全条非空、example 覆盖 100%、受控词表零越界）
- [x] prompts.json **20 条**按 seed-content §3.4 主题清单逐条产出（`rule=7 / 含变量=13 / claude-code=11 cursor=12 generic=15`，全部 `/精选` + 「精选」标签，20 条 title 唯一）
- [x] 模板从代码常量迁入 `flow-templates.json`——**提前于 T4 已完成**（C-15：阶段定义照抄 §3.3 直接以 seed 文件落盘，无代码常量环节）；老库幂等升级由 UT-SEED-02 在真实 seed 上验证
- [x] `seed:check` 阈值切至正式门槛（100/3/20）并进 CI，且 prompts 侧补 §3.4 **构成配额**（数量达标不再蕴含构成达标，C-57）；负向探针落成命名用例 `tests/seed-check.test.ts`：词条数压到门槛之下（截到 95 条）→ `95 条 < 门槛 100 条` 退出码 1（SCRIPT-SEED-01；按绝对量截，种子增长不会让负向样本重新达标，DEV-0022 C-85）、阶段名改一字与删一个阶段各自报错（SCRIPT-SEED-02）
- [x] **预置演示包**：首启自动组装 `default` 包（specs/onboarding.md FR-1，复用 m6a 正常导出通道 + 一次目录导出登记；D-3「在位但选集/目标不同 = 用户已修改」跳过并报 reason）
- [x] **首启向导**：≤3 步、可跳过、每步真实副作用（FR-2，红线见验收 3）；步骤③含 **lock 文件自动确认**（D11：`GET /api/injection-status?dir=` 轮询，2s×60，自动点亮，手动按钮降级保留）
- [x] **飞轮统计面板** + 遥测设置开关（FR-3/FR-4，遥测默认关 + 单出口断言）；Web 侧首次注入后一次性 opt-in 卡片（FR-4.2，D13，与 CLI 共享本地标记）
- [x] 设置页：种子重播按钮 + 数据目录展示 + 备份说明 + 向导重置（六区，含 `GET /api/settings` 与 `POST /api/settings/reseed`，结清 C-56）
- [x] （owner 追加 D-6）遥测外发闭环：`lib/telemetry-flush.ts` serve 进程内 60s 批量出队（无端点则连 `setInterval` 都不建）+ `deploy/telemetry/worker.js` 接收端 fail-closed + `config.json` 的 `telemetryEndpoint?`，结清 C-50
- [x] （owner 追加 D-7）并发 sync 文件锁：`O_EXCL` 抢占 `.openvibe/sync.lock`，非阻塞、只在真写盘前抢，崩溃残留按 pid/5 min 判死接管
- [x] （owner 追加 D-7）Web 主包拆包：九页 `React.lazy` + `pnpm bundle:check` 成 CI 第五闸，入口 **1,155.62 kB → 291.01 kB**（gzip 95.27），`manualChunks` 方案实测否决

**验收**：seed-content §7 全部 4 条 + **onboarding §7 全部 7 条**通过（含 ≤3 条命令/≤5 分钟口径）。—— ✅ **T8 完成（2026-09-23，DEV-0019）**：seed §7 四条中 seed-1/2/3 由命名用例（SCRIPT-SEED-01/02 + UT-SEED-02）覆盖，**seed-4 人工审校未收**（`docs/devlog-evidence/DEV-0019/seed-review.md` 摊开 41 词条 + 20 提示词全文，裁决表待 owner 填）；onboarding §5 七条由入库驱动器 `onboarding-walk.mjs` **29 项断言全 PASS** 逐条给日志证据（含九项产物逐条 `statSync`、第三条命令 `diff` 判 clean、用户侧 4.0 s）；另两段真机走查 `telemetry-egress.mjs` 17/17（关闭态第二个 60s 窗口计数 `3→3`）与 `lazy-chunk-walk.mjs` 29 项（首屏 JS 361.16 kB / 总分包 29.1%）；三次独立建库 `default@1.0.0` 指纹逐字节一致 `ce8182c903e2…`；全仓 **369/369 用例绿（41 文件）**，五道本地门禁全绿，**三平台 CI 全绿**（run 35827189050 @ `9f09d8d`：windows-latest / ubuntu-latest / macos-latest 三个 verify job 全 success，`seed:check` 的 100/3/20 + §3.4 构成配额与 `bundle:check` 的入口 ≤300kB 两道新闸首次上 CI，本轮预期差集为零）。

### T9 · 飞轮 E2E + 发布（W4末，预估 3 人日）

> **P1.1 起本组冻结。** 本组唯一未收的「冒烟 ×3」已改由 §2b·T11 承接（D21 裁定：不引入 Playwright，改裸 CDP 真输入，前置 S-2 探针——**该探针已于 2026-09-23 跑完，结论在 `dev-plan §15.4-S2`，本组不再自判可行性**）；下方那条 Playwright 待办读作历史记录，不再作为待办入口。

- [ ] Playwright 飞轮主链（design §13 E2E 行定义）+ 3 条冒烟（导入→复制；术语搜索→TERMS.md；开箱向导三步）—— **主链已收，形态改了**（2026-09-23，DEV-0020）：`E2E-FLOW-01` 八腿在 vitest `cli` 项目跑通（真 serve 子进程 + 真 HTTP + 真 CLI 退出码，1.57 s，连跑三遍稳定）；**Playwright 经 owner 裁定 T9 不引入、延至 P1.1**（dev-plan §14-6），三条冒烟因此改由**人工录屏/截图**承担——自动化证据不含真实点击/复制/拖拽（合成 `b.click()` 无 transient user activation），这是**明写的事实**不是遗漏（后续：S-2 探针已证真输入可达，承担方式改由 §2b·T11 的驱动器承接，见 `dev-plan §15.4-S2`；本条按裁定仍读作 T9 历史）
- [x] 干净环境演练（含向导场景）：清空 `HOME` 沙箱 → `npx openvibe-cli serve --open` → 向导三步 → sync/diff/回流全流程手测（onboarding §7 验收 1 的「≤3 条命令 / ≤5 分钟」计时口径）—— **发布形态半边已收**（2026-09-23，DEV-0020）：`apps/cli` 从「private + TS bin + 无构建 + 仓库相对资源根」变成可安装产物，驱动器 `docs/devlog-evidence/DEV-0020/publish-walk.mjs` 真 `npm pack` → 装进空目录 → 只跑装出来的 bin，**41 项断言全 PASS / 0 FAIL**（T9c 补两支 npm 装包探针后 → **45 项**）（`publish-walk.txt` 入库）：tarball 1.14 MB、装包 767–829 ms、`webServed=true`、入口 chunk 291,012 B 由 `<pkg>/dist/web` 托管、`dist/seed` 真播种出 104 词条、九项产物逐条 `statSync`、`diff` 判 clean、`telemetry.endpoint=""` 零外联在发布形态下同样成立；计时按 C-74 双数字口径——**用户侧 0.5 s**（serve→sync→diff 三连），构建+pack+装包 **3.9 s** 另列；T9c 复跑为 4.3 s / 27.6 s（新增装包探针全在第二段），`dist/seed` 播种实测 `terms=109`。向导场景的浏览器手测属上面那条的录屏半边
- [x] README 重写为用户视角（快速上手/架构一图/FAQ），`docs/` 保留规划文档 —— **2026-09-23 收（DEV-0022）**：按「30 秒上手 → 拿到什么（九文件表）→ 它解决什么 → 功能一览 → 架构一图 → 数据落在哪里 → 隐私与网络行为 → FAQ → 已知局限」重写；`npx` 三步与产物清单均取干净沙箱实测值，未经证实的事不写（本机 C++ 编译回退、非 147 ABI 装包路径均按未验证处理）
- [x] `pnpm publish --dry-run` 校验 bundle 完整性；打 tag `v0.1.0`；发布说明（含已知局限）—— **2026-09-23 三路 dry-run 收（DEV-0022）**：`npm publish --dry-run` / `npm publish --dry-run --registry=https://registry.npmjs.org` / `pnpm publish --dry-run --no-git-checks` 均 rc=0，36 文件、1.1 MB、解包 4.9 MB、`dist/{cli.js,web,seed,migrations}` 齐；**两路默认打到 `registry.npmmirror.com`**（镜像不接发布却能让演练全绿），故 `--registry` 必须显式覆盖（C-88）。发布说明 `docs/release-notes/v0.1.0.md`（含已知局限 + 「本版未验证」段）；tag `v0.1.0` 本地打在 T9c commit 上，**未 push**；真实 `npm publish` 是外部不可逆动作，等 owner 放行
- [x] 复盘会（retro 模板走一遍）→ 产出第一批回流词条/提示词草稿入库（飞轮 dogfooding 第⑤步实证）—— **2026-09-23 收（DEV-0022）**：用自家 `复盘流` 模板（`retro-1-1…retro-4-1` 逐条对账）复盘 T1–T9，产物 `docs/devlog-evidence/DEV-0022/retro.md`；**第一批回流 5 条词条入 `content/seed/terms.json`（104 → 109）**：发布形态走查 / 预编译包回退 / 清单归一化 / 镜像注册表 / 瞬时用户激活，每条的 example 即复盘里的一条实测决议。提示词侧不动（`seed:check` 锁恰好 20 条，第 21 条起走 DB 草稿端点）

**验收**：CI 全绿（含 golden/seed:check/E2E）；干净环境演练录屏归档 DEV_LOG。—— 🟡 **T9 工程侧完成（2026-09-23，DEV-0020 + DEV-0022）**：三平台 run `35844980582` @ `3e852c2` 三个 `verify` job 全 success，但用例数按平台分开读——macOS/ubuntu **381 passed**，windows **378 passed + 3 skipped**（`CLI-SEC-01b` 符号链接逃逸、`CLI-SEC-04` 悬空符号链接、`CLI-CFG-03` 0600 权限位在 win32 语义不适用而主动门控，属**未验证面**不是通过）；`seed:check`（109/3/20）与 `bundle:check`（入口 291.02 kB / 最大 347.45 kB）两道新闸在 win32 上同值通过，`E2E-FLOW-01` 八腿主链三平台 4.40 / 6.11 / 9.34 s 跑通；干净环境演练改以**入库驱动器 + 45 项断言日志**留证（`docs/devlog-evidence/DEV-0020/publish-walk.{mjs,txt}`），不是录屏。**未收的两半**：① 冒烟 ×3（Playwright 经 owner 裁定 T9 不引入、延至 P1.1，dev-plan §14-6 / 任务 #59；**承担方式已从「人工录屏/截图」改判为裸 CDP 真输入驱动器**，S-2 前置已解除，见 §2b·T11——本组冻结，此处只留状态不复述结论；**2026-09-24 该半已在 §2b·T11 收口（DEV-0025 驱动器有头 FAIL=0 SKIP=0），本组随之一并结清**）；② owner 侧两步——种子审校（`DEV-0019/seed-review.md` 裁决列仍 `（待填）`，本轮新增批次 E 的 5 条）与真发 `npm publish --registry=https://registry.npmjs.org`（C-88：默认注册表是镜像，必须显式覆盖；tag `v0.1.0` 已本地打在 `3e852c2`，未推）。

## 2b. P1.1 任务组（2026-09-23 开档 · 范围裁定正文在 [dev-plan.md §15](./dev-plan.md)，此处只排顺序）

**开工门槛**：本节各项以 `docs/specs/` 内已写好的规格为准，**未写规格不得开工**（dev-plan §0.4 第 4 条）。下列「规格」列 ✅ = 本轮（P1.1 开档轮）已写入 spec。

### T10 · 退场与信任（预估 1.8 人日）

- [x] 八份 spec 补写 `| 版本 |` 痕迹基线 + 实量数字单源化 + `m6a §6.4` 交叉引用修正 —— 2026-09-23 本轮完成（起因：dev-plan DoD⑥ 假绿，见 §15.5）
- [x] **`openvibe clean` 实现**（2026-09-24 收口，T2–T5）—— 规格 `specs/m6-cli-injection.md` **v1.5** FR-6 + §6.10 + 验收 10a–10j（含 f2 / e2 / e3）✅已写并已随实况改道；落地面：core 分类器 `planRetirement`（T2）→ `cleanAction` 备份 / 锁 / 前置净化 / 交互 / 并发 / 退出码（T3–T4）→ 命令注册与 `--json` 信封（T5）。**测试段支数以现测为准**（采样 sha `986689e`）：`grep -c "^\s*it[\.(]" apps/cli/test/clean.test.ts` = **29**（哪些支对得上 §7.10 的 a–j / e2 / e3 / f2 与 FR-6.10 契约、哪些是实施/审查补的 sub-branch，**归属清单单源在 `DEV_LOG [DEV-0027]`**——本处不再自己推一遍口径，只挂指针；口径要求不变：**不得写成「规格十支全绿」**），另有 core 侧 `packages/core/src/inject/retirement.test.ts` **8 支**（同 `grep -c` 现测，RT-01..08）托判定。**三平台口径**：darwin / linux **29 支实跑**，win32 **28 支实跑 + 1 支跳过**（`06e` 符号链接逃逸是 `it.skipIf(IS_WINDOWS)`，**跳过 ≠ 通过**）；本机只验到 darwin。提交（feat 主干 + fix 修复轮**全列**，与下一行的列法同式）：`c11430f`(T2) / `e80e5fd`+`eb8e2f9`+`acfb24f`(T3 主干 + 两轮修复) / `656292c`+`44705c7`(T4 主干 + 修复) / `776f020`+`c84f5d5`(T5 主干 + 修复) + 收口码笔 `fb277b1`；≈1 人日
- [x] **预览体量与 token 估算**（2026-09-24 收口，T6–T8）—— 规格 `specs/m6-standard-pack.md` **v1.3** FR-6 + §5 + 验收 8–12 ✅已写；落地面：`estimateTokens` / `estimateBundle` / `SIZE_WARN_THRESHOLD=12_000` 进 core（T6）→ `sizeEstimate` 进 preview 的 perTarget + footprint 两视图、`.optional()`、**只提示不阻断**（T7）→ Web 步骤 5 展示：成本条 / warn 黄条 / 文件树体量列，**缺 `sizeEstimate` 时整段不渲染**而不是印假零（T8）。测试段现测**两个口径分开写**（§13 DoD 第 8 条：文件支数 ≠ 具名 id 数，禁止把两个相反口径写成一对同名数字）：**`CORE-SIZE` 段 6 支** = `packages/core/src/pack/size.test.ts` 的**文件支数**，其中具名只有 `CORE-SIZE-01..05` 五支、第 6 支是**无名**负向腿「口径不是 chars/4」；**`SRV-EST-*` 具名 6 支** = `apps/server/test/packs.api.test.ts` 那 **17** 支里的六个 `SRV-EST-` id（其余 11 支不属本族）。另 `SRV-EST-04` 是 FR-6.4「首启预置包自己就亮黄条」的仓库内驱动器，权威数从此处而非 `SRV-EST-02`；**Web 侧无 DOM 断言**（owner 裁定不引入组件测试基建，四处新渲染只有静态闸 + 读代码推演，已登记为未验证面）。提交 `d057051`(T6) / `91bb1dc`+`93477a7`(T7) / `f2ce4ab`+`274bebd`(T8)；≈0.5 人日
- [x] 一项目一包边界声明 —— `specs/m6-cli-injection.md` §6.10 ✅已写（正文即规格，无实现项）；**2026-09-24 以 Task 1 的 §6.10 修正收口（实现未动，规格随实况）**：换包是**合并保留**而非整体重写，旧包独有文件仍在 lock 里备查、由 `clean` 一并退场
- [x] **T10 开工前置：实现计划落库 + 三处「规格 vs 代码」冲突定稿**（2026-09-24）—— 计划 `docs/superpowers/plans/2026-09-24-p1.1-t10-clean-and-size-estimate.md`（9 任务）；冲突裁定与实测证据在计划「先读」节 + `DEV_LOG [DEV-0026]`，规格侧落为 **m6b v1.3 / m6a v1.2**（`clean` 验收 j 构造改法、`coveredPlatforms`→`manifest.targets`、§6.10 合并语义、另补验收 **f2** `LOCK_INVALID` 与三处同源涟漪）。**待 owner 复核后开 Task 2**

**验收**：`CLI-CLEAN-*`（现测 **29 支** = `clean.test.ts` 的文件支数，具名 id 同为 29 个，两口径此处相等）、`CORE-SIZE`（**6 支** = `size.test.ts` 的文件支数：具名 `01..05` + 一支**无名**负向腿）、`SRV-EST-*`（**具名 6 支**，住在 `packs.api.test.ts` 的 **17** 支里）全绿；**`git diff --name-only tests/golden/` 为空**（计划 Step 1/3 的原句，保留；但**不带 ref 的形态按 §13 DoD 第 7 条是空转凭据**——它比的是工作树 vs 索引，一提交就必然为空，真正的凭据是句末带 ref 锚的那一条）。—— ✅ **T10 收口（2026-09-24，DEV-0027）**：五闸本机（darwin / node v26.4.0，**采样 sha `986689e`**）全过——`pnpm lint` rc=0、`pnpm typecheck` rc=0、`pnpm test` **433 支 / 47 文件全绿**（cli 145 / unit 191 / integration 97）、`pnpm seed:check` rc=0、`pnpm bundle:check` 入口 **293.07 kB ≤ 300 kB** / 23 chunk 最大 347.45 kB；`git diff --name-only tests/golden/` 与 `content/seed/` **均 0 行**；带 ref 锚的那一条同测 **0 行**：**`git diff --name-only 99690bc..HEAD -- tests/golden/ content/seed/`** → 空输出（`99690bc` = 分支分叉点；`HEAD` = 采样 sha，见 `DEV_LOG [DEV-0027]`「测试验证」首行）——**这条才是「整支 T10 未触 A 级冻结契约」的凭据**，不带 ref 的那两条只作工作树补充。**仍未收**：三平台 CI 没跑过（分支 `feat/p1.1-t10-clean-size` 未推），故 dev-plan §15.6 DoD ①「五闸三平台 CI 全绿且跑到 tip sha」与 ③「验收 10a–10j 在 CI 里跑」是**开放项**——本机绿不冒充 CI 绿；逐条未验证面清单见 `DEV_LOG [DEV-0027]`。

### T11 · 发布运营与证据（预估 1.5–2 人日）

- [x] **S-2 探针**（2026-09-23 跑完）：CDP 真输入三判据——**有头 Chrome 三条全过**（① pbpaste 逐字节 == 正文 195 字符；② 中文 `insertText` → 第 300 ms 发出带中文 q 的请求 → 列表收窄到 1 行；③ Tab 4 跳落到确认按钮、Enter 关窗且剪贴板 == 替换后预览 280 字符），**无头下判据①不成立**（writeText resolve、页内 readText 读得到、toast 出现，而系统 pasteboard 一字未动）。驱动器已入库 `docs/devlog-evidence/DEV-0024/s2-cdp-real-input.mjs`（含负向对照与自清理断言）。判据、四条方法级副产品与限制的单源都在 `dev-plan §15.4-S2`
- [x] 三条冒烟（导入→复制 / 术语搜索→TERMS.md / 向导三步）—— **2026-09-24 收口：三条场景已全部接到 DEV-0024 的真输入骨架上并各自跑通**。新驱动器 `docs/devlog-evidence/DEV-0025/three-smokes.mjs`（自包含，不抽公共模块），**有头 FAIL=0 SKIP=0 / 无头 FAIL=0 SKIP=2**（两支日志各 26 条断言；两条 SKIP 都是系统剪贴板腿，按设计不可判即记 SKIP，绝不记 PASS）。三条各自独立判定：SM-1 真点击「选择文件…」真触发 `Page.fileChooserOpened` 后从磁盘注入 `.md`，`pbpaste` 与该文件**逐字节相等**；SM-2 预览 `<pre>` 与服务端 `render-terms-md` **同一字节**且 `pbpaste` == 它；SM-3 三步全真点击、`sync` 后 lock 探测**自动点亮**、「暂不」后刷新不再询问。**探针 ≠ 冒烟**这条区分仍然成立，只是冒烟一侧已收；人工录屏退路未启用。数字、三条方法级副产品（toast 的「关闭」按钮与弹窗同名并抢占 DOM 序 / 「按钮出现」不等于「内容就绪」 / 负向对照的可见证据）与构建归属判定单源在 `dev-plan §15.4b`
- [ ] 发布传播执行清单：渠道帖（V2EX / 掘金 / 知乎）、demo GIF / asciinema、社群入口、awesome 清单 PR —— 非产品功能，不占八段式闸；**执行前置条件是 v0.1.0 真发布**（在 owner 手上）
- [ ] `@import` 受管子文件：S-1 探针**已跑完**，结论=可行但属 A 级契约变更，落地归 P2；本组无实现项，只保证结论入档

**验收**：三条冒烟各有一份可复查证据 —— **2026-09-24 已满足**（`docs/devlog-evidence/DEV-0025/three-smokes{,-headed}.txt` + 3 张有头 PNG，均为自动化日志而非录屏）；传播清单逐项打勾并留外链 —— **未做，且执行前置是 v0.1.0 真发布**（在 owner 手上）。

---

## 3. 周计划与工期口径（2026-09-20 澄清后更新）

| 周 | 关键路径 | 并行轨 |
|----|----------|--------|
| W1 | T1 → T2 → T3 启动 | 词条批量撰写启动（内容编辑） |
| W2 | T3 完成 → composer 骨架可提前动工 | T4 完成（60 词条） |
| W3 | T5 + T6 | T7 骨架启动；模板与提示词撰写 |
| W4 | T6 完成 → T7 推进 | 内容复核 |
| W5 | T7 完成 → T8 全量种子 + 开箱体验（预置包/向导/面板/遥测开关） | dogfooding 准备 |
| W6 | T9 飞轮 E2E + 干净环境演练 + 发布 | 复盘回流第一批资产 |

**工期口径（2026-09-20 裁定 D8 定案：6.5 周）**：单人全栈任务 ≈ **31.5 人日 + 显式缓冲 1 人日 = 32.5 人日（6.5 周窗口）**（T1 1.5 + T2 2.5 + T3 4 + T4 2.5 + T5 4 + T6 5.5（六 adapter+真机复核）+ T7 4.5 + T8 4（含向导 lock 自动确认 D11）+ T9 3；核验工作已在 P0 期完成不再占用）。W6 之后多出的半周即显式缓冲。内容产能（D14，2026-09-20 修订）：原「0.5 内容编辑 ≈ 6.5 人日全程并行」并行轨取消，改为 **AI 起草全部词条/提示词初稿 + owner 审校 ≈ 2-3 人日**，含于 6.5 周窗口；审校不达标即启用变体③（60 条首发 + seed 幂等热补——热补本身即种子升级机制的公开演示）。

**保 4 周变体（备案，默认不启用；启用需 owner 明示并记 DEV_LOG）**：
① 首启向导后移至发布后首个小版本 P1.1（预置包保留）——**判作废（2026-09-23 D19 核查）**：向导已随 T8 交付（`docs/specs/onboarding.md` + `onboarding-walk.mjs` 29 断言），无后移可言；② 遥测仅埋点（含开关）不做飞轮面板（面板随 P1.1）——**改判 P2（D19）**，P1.1 不做面板；**此处的「飞轮面板」= 基于埋点计数的对外看板，不是 MVP 已交付的本地飞轮五项卡片**（后者在 `apps/web/src/components/onboarding/FlywheelCard.tsx`，`specs/onboarding.md` FR-3，明确不参与遥测），见 `dev-plan §15.5-6`；③ v0.1 原三级砍单序仍可叠加（T3 Markdown 导入降级 → T5 拖拽降级 → 词条 60 条首发追补，D14 后为首选内容兜底）；④ 国内三 adapter（codebuddy/trae/minicode）可后移 P1.1（兼容矩阵覆盖的 zcode/Kimi/Codex 不受影响）——**判作废（2026-09-23 D19 核查）**：三个 adapter 已在 MVP 实装（`packages/core` adapter 表含三者；DEV-0020 走查实测 `CODEBUDDY.md`/`MINI.md`/`.trae/rules/openvibe.md` 各约 14.5 kB 落盘）。

## 4. 完成定义（MVP DoD）

1. specs **八份**（m1/m2/m3/m5/m6a/m6b/seed/onboarding）的「验收标准」**逐条**通过（人工项录屏/截图归档）。
2. CI 五闸全绿：lint / unit / integration / cli / e2e / seed:check / bundle:check / golden 快照。
3. 干净环境 ≤3 条命令冷启动演练通过。
4. 标准包契约与 adapter 清单与 design.md §7/§8 零偏差（golden 快照背书）。
5. `v0.1.0` 发布 + dogfooding 复盘回流至少 3 条资产入库。

## 5. 风险触发点（做的时候回看哪里）

| 触发信号 | 回看 | 预案 |
|----------|------|------|
| Cursor/Claude 规则格式又变 | design §8 | 只改对应 adapter + 升注册表；golden 快照锁定其余产物不变 |
| FTS 中文搜索召回差评 | design §12 | LIKE 全表兜底已在线；P2 评估分词器替换（改 §12 一处） |
| sync 状态机分支漏测 | m6b §4/§7 | 以 §7 验收为回归集，任何新分支先补夹具再改码 |
| 词条产出慢于开发 | §3 变体③ | 60 条发布 + 追补（种子机制幂等支持热补） |
| 4 周硬顶逼近（若切回保 4 周变体） | §3 变体备案 | 按备案①②③顺序后移/砍，逐项记 DEV_LOG |
| dogfooding 两周证伪线触发（D15：工作台真实使用 <10 次或 DEV 日志 <5 条） | m5 / PRD 3.2-M5 | 启动 M5-lite：工作台 UI（看板/日志/阶段条）后移 P1.1，流程模板与检查清单仅经 CHECKLIST.md 注入；记 DEV_LOG 并排入 P1.1 |
