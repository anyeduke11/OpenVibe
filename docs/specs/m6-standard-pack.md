# SPEC · M6a 标准包与注入 —— Web 侧（组装 / 预览 / 导出 / 版本治理）

| 项 | 值 |
|------|------|
| 模块 | M6 标准包与注入（Web 侧） |
| 优先级 | P0 · MVP 核心（全产品价值出口） |
| 上游 | PRD 3.2-M6、4.2（关键决策）、5.1/5.2（业务流） |
| 下游设计 | **design.md §7（标准包文件契约，权威）**、§8（adapter）、§5、§6 |
| 关联任务 | tasks.md T6 |
| 姊妹规格 | [m6-cli-injection.md](./m6-cli-injection.md)（CLI 侧） |

---

## 1. 目标与用户价值

「标准化」的物理载体：用户在 Web 向导里挑资产（提示词/术语/skill）+ 选流程模板 + 选目标平台 → 得到一个**纯 Markdown/YAML、git 友好、带版本和指纹的标准包**，供 CLI 注入或直接拷贝进项目。它同时是 P0 阶段的契约冻结对象——格式一旦定稿即承诺向后兼容。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| 标准包定义 CRUD + 组装向导（5 步） | 双向同步（项目改动回读比对，P1） |
| 文件生成与预览（所见即所得字节级一致） | 团队包共享与评审（P2/M7） |
| 导出：单文件 bundle（HTTP 下载）+ 目录导出（离线/git 共享） | 包市场 / 订阅 |
| 版本治理：semver、指纹、不可变重导校验 | |
| 注入历史登记（供 M5 显示与 CLI 溯源） | |

## 3. 数据与核心概念

```
StandardPack（定义，可迭代）{
  id: "pk_<nanoid>", name,            // name 全局唯一，slug 规则 [a-z0-9-]
  description,
  selection: {
    promptIds: id[],                  // 引用当前版本内容；导出时物化快照
    termIds: id[],
    skillIds: id[],
    playbookIds: id[],                // MVP 恒为 []（M4 未上）
    flowTemplateId: id                // 导出时物化 stages 快照
  },
  targets: ("claude-code"|"cursor"|"generic-agents"|"codebuddy"|"trae"|"minicode")[],  // MVP 六个（D7+D9/D10 扩充，2026-09-20），见 design §8 v1.2
  version: semver,                    // 手动设定，导出时校验
  createdAt / updatedAt
}
PackExport（导出实例，不可变）{
  id, packId, version, fingerprint,   // 算法见 design §7.6
  manifestJson（完整快照，含各资产内容）,
  exportedAt, channel: "download" | "directory"
}
```

**关键语义**：定义可编辑，导出不可变。每次导出把 selection 引用的资产内容**物化**进导出记录——之后资产被改/删，不影响已导出包的可复现性。

## 4. 功能需求（FR）

### FR-1 组装向导（5 步）
1. **步骤1 基本信息**：name（唯一性即时校验）、描述。
2. **步骤2 流程模板**：单选（内置/自定义任一）；选中后展示阶段预览。
3. **步骤3 资产挑选**：三栏多选（提示词按 active + useAs/platformMarks 过滤；术语支持「选集/全部」；skill 全列）；默认按「最近更新」排序。
4. **步骤4 目标平台**：多选 claude-code / cursor / generic-agents / codebuddy / trae / minicode（决定生成哪些文件，见 FR-2）；页面同步展示**兼容矩阵**提示（本包额外覆盖 zcode / Kimi Code / Codex 等读 AGENTS.md 的平台，见 design §8）。
5. **步骤5 预览与版本**：左侧文件树 + 右侧内容查看（等宽渲染）；设定 version；显示校验结果与警告。
6. 向导任意步可回退；定义保存后可再次编辑重新导出。

### FR-2 文件生成
1. 生成文件集合由 targets 决定（**完整字节级格式规范 = design.md §7，本 spec 只锁行为**）：
   - `claude-code` → `CLAUDE.md`；
   - `cursor` → `.cursor/rules/openvibe.mdc`；
   - `generic-agents` → `AGENTS.md`；
   - `codebuddy` → `CODEBUDDY.md`（正文复用主模板）；
   - `trae` → `.trae/rules/openvibe.md`（v1.2 自定义文件名 + frontmatter `trigger: always`，正文复用主模板）；
   - `minicode` → `MINI.md`（MiniCode `/init` 约定，正文复用主模板）；
   - 任一 target + 含术语 → `TERMS.md`；含流程 → `CHECKLIST.md`；含 skill → `SKILLS.md`；恒生成 `openvibe.pack.json`。
2. 规则段（useAs=rule）进主文件「行为规则」节；参考类（useAs=reference）进「任务提示词参考」附录节——由生成器统一编排，用户不逐文件排版。
3. **预览即产物**：预览接口与导出接口调用同一生成器函数；预览展示的字节 = 导出写入的字节。
4. rule 类提示词含 `{{变量}}` → 警告列出（不阻断）；selection 为空（无任何资产且无流程）→ 阻断 422。

### FR-3 导出
1. **bundle 下载**：单 JSON 文件 `openvibe-pack-<name>-<version>.json`，内含 manifest + 全部生成文件内容（CLI `sync --file` 直接消费）。
2. **目录导出**：写 `~/.openvibe/packs/<name>@<version>/`（`openvibe.pack.json` + `files/` 按真实路径展开），git 友好（纯文本、无时间戳抖动：文件内不含生成时间，时间只在 manifest）。
3. 导出成功 → 创建不可变 PackExport 记录 + 更新导出历史。
4. 同 `(packId, version)` 重复导出：指纹一致 → 幂等成功（不新建记录）；指纹不一致 → **409 `VERSION_IMMUTABLE`**，提示升版本号。

### FR-4 版本与指纹
1. version 必须合法 semver；新导出版本必须 > 最近导出版本（允许 patch 级）。
2. fingerprint 计算遵循 design.md §7.6（对排序后 (path, fileSha256) 对做 sha256）；预览页实时展示指纹。
3. 资产变更不影响已导出实例；再次导出前向导提示「以下资产相对上次导出有变化」。

### FR-5 注入历史
1. CLI sync 成功后上报（或 sync 前领取任务时登记，见 m6b FR-2.5）：记录 packId@version、项目路径、时间。
2. Web 端包详情页展示注入历史；M5 项目工作台读取同一数据（配合 lock 文件，见 m5 FR-6）。

## 5. 输入 / 输出

- **API**：`/api/packs` CRUD、`POST /api/packs/:id/preview`（返回 files[] + fingerprint + warnings）、`POST /api/packs/:id/export`（body: `{version, channel}`）、`GET /api/packs/:id/exports`、`POST /api/injections`（CLI 上报）。
- **UI**：`/packs`（列表 + 详情 + 导出历史）、`/packs/new`（5 步向导）。
- **对下游输出**：bundle JSON / 导出目录 → CLI sync；注入历史 → M5。

## 6. 边界与异常

1. name 冲突 → 创建时 422；name 含大写/下划线 → 422（slug 规则）。
2. selection 引用的资产在导出时已被删除 → 导出 422 `STALE_SELECTION`，向导标红失效项让用户重选（**快照语义只保护已导出实例，不保护未导出的定义**）。
3. targets 为空 → 阻断（至少一个平台）。
4. 生成文件总量 > 2MB 或单文件 > 512KB → 警告不阻断（注入侧有同类防线，m6b §6.7）。
5. 目录导出目标已存在（同版本重导且指纹一致）→ 幂等覆盖前先比对，不一致则 409（与 FR-3.4 同源）。
6. 生成器对资产内容做**路径安全净化**：文件内容中出现的本地绝对路径（skillDir 等）在 SKILLS.md 中原样保留（信息用途），但不生成任何包含 `..` 或绝对路径的**文件路径**（契约校验，design §7.7）。

## 7. 验收标准（pass/fail）

1. 同一 pack 定义连续两次 preview → 文件集合与全部 sha256 完全一致。
2. preview 返回的某文件内容与目录导出后磁盘同名文件字节一致。
3. 导出 v1.0.0 → 修改包内一条提示词再导 v1.0.0 → 409 VERSION_IMMUTABLE；改 v1.1.0 → 成功且两条导出记录指纹不同。
4. 含 6 条术语 + claude-code + generic-agents targets 的包 → 生成文件恰为 `CLAUDE.md`、`AGENTS.md`、`TERMS.md`、`openvibe.pack.json`（无流程无 skill 时不出现 CHECKLIST/SKILLS）。
4b. targets 仅 codebuddy + trae + minicode 的包 → 生成文件恰为 `CODEBUDDY.md`、`.trae/rules/openvibe.md`、`MINI.md`、`openvibe.pack.json`（三个文件正文与 CLAUDE.md 主模板一致，仅文件名/壳不同；trae 含 `trigger: always` frontmatter）。
5. 删除已被某导出引用的提示词 → 该导出记录的 manifest 与再下载 bundle 不受影响（物化验证）。
6. bundle JSON 被 `openvibe sync --file` 成功消费（联测归 m6b 验收 1）。
7. `STALE_SELECTION` / `VERSION_IMMUTABLE` / 空 targets 三种 4xx 均有结构化错误码。

## 8. 依赖

- 依赖：M1/M2/M3 素材、M5 流程模板、design.md §7 契约（生成器实现于 packages/core，Web/CLI 共用）。
- 被依赖：m6b CLI sync（唯一消费方）；M5 注入状态展示。
