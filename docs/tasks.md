# OpenVibe MVP 任务清单（tasks）

| 项 | 值 |
|------|------|
| 文档定位 | 按什么顺序做：P0 门禁 → T1–T9 任务组 → 周计划 → 完成定义 |
| 上游 | [proposal.md](./proposal.md)、[specs/](./specs/)（验收出处）、[design.md](./design.md)（实现蓝图） |
| 版本 | v0.1（2026-09-20） |
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
- [ ] ~~平台契约核验收口（G3 尾巴）~~（✅ P0 期已关闭：MiniCode = 专用 adapter `MINI.md`（README 实证）；Trae 多文件 + trigger frontmatter 由社区/半官方来源确认，T6 真机复核文件名行为；Kimi 证据升级「较强」，真机抽测挂 T6）
- [x] pnpm workspace + 根 tsconfig（strict、`moduleResolution: bundler`）+ ESLint/Prettier
- [x] 建 `apps/{web,server,cli}`、`packages/{core,adapters,shared}`、`content/seed` 空骨架（design §3 目录逐一对齐）
- [x] `packages/shared`：zod 实体 schema（specs 各 §3 字段）、错误码枚举、`schemaVersion` 常量
- [x] vitest 三层配置（unit / integration / cli-project 夹具 helper）+ GitHub Actions（lint + test，**三平台矩阵 macOS/Linux/Windows（D5）**，预留 `seed:check` 挂点）
- [x] 落 LICENSE（Apache-2.0，G4 默认）+ README 徽章；CLI 路径/换行符跨平台纪律清单入 CONTRIBUTING 起点
- [x] 仓库落地（D16/D17，2026-09-21 变体执行）：`git init` 零历史新仓库于 `Documents/OpenVibe`（dev-plan 原文的家目录 orphan 分支会波及 hotspot 未提交改动，改用等效落地）→ 提交本套 docs/README/DEV_LOG + LICENSE + .gitignore → 推送 GitHub `anyeduke11/OpenVibe`（远端存 owner 手建 init 提交，本地提交 rebase 其上，不强推）→ home 存档仓库解除跟踪（历史保留）

**验收**：`pnpm i && pnpm lint && pnpm test` 全绿（含 1 个示例用例/层）；CI 首跑通过。—— ✅ **T1 完成（2026-09-21，DEV-0011）**：本地 lint/typecheck/test 全绿（10 用例，含 UT-LINT-01 R3 边界夹具）；CI run 35558098022 三平台（macos/ubuntu/windows）全部 success。

### T2 · 存储核心（W1，预估 2.5 人日）

- [ ] better-sqlite3 封装：打开/建目录/`~/.openvibe/` 布局（design §4）、WAL、migration runner（只前进）
- [ ] migrations v1：design §5 全表 + 外键 + 索引
- [ ] FTS：两张 trigram 虚表 + 六触发器 + 查询路由（≥3 MATCH / <3 LIKE，design §12）
- [ ] 仓储层：prompts（含版本快照/回滚）、terms、skills、flows、projects（stagesSnapshot 物化）、packs；entryNo 事务分配
- [ ] seed 加载器骨架（幂等规则按 design §15，数据 T4/T8 到位）
- [ ] 单测：版本快照触发/不触发、级联删除计数、FTS 中英命中、seed 幂等（夹具 bundle 跑两遍）

**验收**：m3 验收 1/4、m1 验收 2/3 的存储层前置在单测层通过。

### T3 · M1 提示词库垂直切片（W1末–W2，预估 4 人日）

- [ ] API：design §6 提示词六端点（含 import/export、versions/restore）
- [ ] 规则文件解析器（`packages/core/importers`）：`.cursorrules`/`.mdc`(frontmatter 剥离)/`CLAUDE.md`/`AGENTS.md`
- [ ] Web `/library`：列表+文件夹树+过滤器+编辑抽屉（CodeMirror 双栏）+复制变量弹窗
- [ ] 版本历史 UI + jsdiff 渲染 + 回滚
- [ ] JSON/Markdown 导入导出 + 去重报告
- [ ] 集成测试覆盖 m1 §7 全部 8 条验收对应的 API 行为

**验收**：m1 §7 逐条通过（UI 项人工过一遍并录屏存档 DEV_LOG）。

### T4 · M3 术语库 + 首批词条（W2，预估 2.5 人日；词条初稿 AI 起草、owner 审校，D14）

- [ ] API 四端点 + render-terms-md（确定性排序与 `|` 转义）
- [ ] Web `/terms`：搜索+多选+TERMS.md 预览
- [ ] 种子机制激活：`content/seed/terms.json` 首批 **60 条**（附录 B 10 条必须含；质量门槛按 seed-content §3.2）
- [ ] `pnpm seed:check` 脚本（schema+数量+受控词表）

**验收**：m3 §7 全过；`seed:check` 以 60 条门槛先行（全量 100 在 T8 补齐后阈值切换为 100）。

### T5 · M5 项目流程 + M2 Skill 台账（W3，预估 4 人日）

- [ ] 项目/模板/看板/日志/勾选状态全套 API（含 builtin 403、导出 DEV_LOG.md）
- [ ] 回流快捷入口两端点动作（→术语/提示词草稿，source=project、linkedAssetIds 回写）
- [ ] injection-status 只读端点（lock 解析器按 design §7.5，用夹具文件驱动，不等 T7）
- [ ] Web `/projects`、`/projects/:id`（健康摘要+阶段条+看板+日志 Tab）
- [ ] M2：skills 扫描端点（dirHash 算法按 m2 FR-1.3）+ `/skills` 页 + 手动登记
- [ ] 3 套流程模板数据随本任务入库（阶段定义照抄 seed-content §3.3，先随代码常量，T8 移入 seed 文件）

**验收**：m5 §7 全部 8 条 + m2 §7 全部 5 条通过。

### T6 · M6a 组包导出 + 契约快照（W3，预估 5.5 人日）★ 关键路径

- [ ] `packages/core/pack/`：composer（design §7.3 组合规则）、fingerprint（§7.6）、validate（§7.7 全规则）
- [ ] `packages/adapters/`：**六 adapter**（claude-code / cursor / generic-agents / **codebuddy / trae / minicode**，D7+D9）+ registry + 兼容矩阵常量（design §8 v1.2）
- [ ] **真机复核**（半天内）：Trae 实装验证 `.trae/rules/openvibe.md` + `trigger: always` 生效（不符则回退 project_rules.md 并记 DEV_LOG）；Kimi Code 抽测一次 AGENTS.md 感知
- [ ] API：preview/export/exports/injections（含 409 VERSION_IMMUTABLE、STALE_SELECTION）
- [ ] bundle 下载 + 目录导出双通道（幂等/409 规则）
- [ ] Web `/packs/new` 5 步向导 + 预览（文件树+内容+**覆盖平台提示**，读兼容矩阵）+ 导出历史
- [ ] **golden 快照测试**：3 个固定夹具包（其中一个 targets=codebuddy+trae+minicode）的全部产物文件字节级断言（契约防漂移，此后任何改动 §7/§8 需先改快照=显式升版）

**验收**：m6a §7 全部 7 条通过；golden 快照进 CI。

### T7 · CLI：serve/scan/sync/diff（W3末–W4，预估 4.5 人日）★ 关键路径

- [ ] config 发现链 + token 生成（0600）+ `--json` 输出契约
- [ ] `serve`（首启初始化+播种+托管 Web+`--open`）
- [ ] `scan --skills/--project`（调 T4/T5 端点，报告渲染）
- [ ] `sync` 五状态机 + 交互确认（@clack）+ `--dry-run/--yes/--strategy/--target` + 备份 + lock 写入 + 上报
- [ ] `diff`（lock 比对 + 在线新版本探测 + 退出码 0/1/2）
- [ ] 遥测埋点接入：sync 成功/模板选用事件走单出口 `reportEvent()`（默认关、关闭态零外联断言，design §11.5）；首次注入成功后触发一次性 opt-in 询问（D13：CLI 一行提示 + 本地标记，拒绝永不再问）
- [ ] 安全用例集：路径攻击样本、512KB/2MB 防线、非 TTY 防挂起、fingerprint 篡改
- [ ] CLI 集成测试：临时目录全树哈希断言 dry-run 零写入（m6b §7.1a 的机械化验证）

**验收**：m6b §7 全部 8 条通过（联调 m6a 验收 6 一并闭环）。

### T8 · 种子内容全量 + 开箱体验（W5，预估 4 人日；内容由 AI 起草 + owner 审校 ≈ 2-3 人日，D14）

- [ ] terms.json 补齐至 **≥100**（60 → 100+，含 aliases 密度复核）
- [ ] prompts.json **20 条**按 seed-content §3.4 主题清单逐条产出
- [ ] 模板从代码常量迁入 `flow-templates.json`（幂等升级路径验证：老库不重复建）
- [ ] `seed:check` 阈值切至正式门槛（100/3/20）并进 CI
- [ ] **预置演示包**：首启自动组装 `default` 包（specs/onboarding.md FR-1，复用 m6a 通道）
- [ ] **首启向导**：≤3 步、可跳过、每步真实副作用（FR-2，红线见验收 3）；步骤③含 **lock 文件自动确认**（D11：检测测试目录 `.openvibe/pack.lock.json` 自动点亮，手动按钮降级保留）
- [ ] **飞轮统计面板** + 遥测设置开关（FR-3/FR-4，遥测默认关 + 单出口断言）；Web 侧首次注入后一次性 opt-in 卡片（FR-4.2，D13，与 CLI 共享本地标记）
- [ ] 设置页：种子重播按钮 + 数据目录展示 + 备份说明 + 向导重置

**验收**：seed-content §7 全部 4 条 + **onboarding §7 全部 5 条**通过（含 ≤3 条命令/≤5 分钟口径）。

### T9 · 飞轮 E2E + 发布（W4末，预估 3 人日）

- [ ] Playwright 飞轮主链（design §13 E2E 行定义）+ 3 条冒烟（导入→复制；术语搜索→TERMS.md；开箱向导三步）
- [ ] 干净环境演练（含向导场景）：清空 `HOME` 沙箱 → `npx openvibe-cli serve --open` → 向导三步 → sync/diff/回流全流程手测（onboarding §7 验收 1 的「≤3 条命令 / ≤5 分钟」计时口径）
- [ ] README 重写为用户视角（快速上手/架构一图/FAQ），`docs/` 保留规划文档
- [ ] `pnpm publish --dry-run` 校验 bundle 完整性；打 tag `v0.1.0`；发布说明（含已知局限）
- [ ] 复盘会（retro 模板走一遍）→ 产出第一批回流词条/提示词草稿入库（飞轮 dogfooding 第⑤步实证）

**验收**：CI 全绿（含 golden/seed:check/E2E）；干净环境演练录屏归档 DEV_LOG。

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
① 首启向导后移至发布后首个小版本 P1.1（预置包保留）；② 遥测仅埋点（含开关）不做飞轮面板（面板随 P1.1）；③ v0.1 原三级砍单序仍可叠加（T3 Markdown 导入降级 → T5 拖拽降级 → 词条 60 条首发追补，D14 后为首选内容兜底）；④ 国内三 adapter（codebuddy/trae/minicode）可后移 P1.1（兼容矩阵覆盖的 zcode/Kimi/Codex 不受影响）。

## 4. 完成定义（MVP DoD）

1. specs **八份**（m1/m2/m3/m5/m6a/m6b/seed/onboarding）的「验收标准」**逐条**通过（人工项录屏/截图归档）。
2. CI 五闸全绿：lint / unit / integration / cli / e2e / seed:check / golden 快照。
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
