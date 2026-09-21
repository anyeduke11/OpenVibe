# SPEC · M1 提示词库（完整版）

| 项 | 值 |
|------|------|
| 模块 | M1 提示词库 |
| 优先级 | P0 · MVP 核心 |
| 上游 | PRD 3.2-M1、proposal §3.1 |
| 下游设计 | design.md §5（数据模型）、§6（API）、§12（搜索） |
| 关联任务 | tasks.md T3 |

---

## 1. 目标与用户价值

给独立开发者一个**带版本、可检索、能跨平台复用**的提示词资产库：任何一条提示词都能在 30 秒内被找到、填好变量、复制进 AI 会话，或被打进标准包注入项目。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| CRUD、`{{变量}}` 提取与填充复制、标签+文件夹+全文搜索 | AI 生成/改写提示词 |
| 保存即版本快照、版本 diff、回滚 | 关系树（父子提示词） |
| 平台适配标记（多选）、按平台过滤 | 团队评审流（P2/M7） |
| 导入导出：JSON 互导、Markdown 导入、`.cursorrules`/`CLAUDE.md`/`AGENTS.md` 反向导入 | 提示词批量定时任务 |
| 删除（确认后硬删，级联版本） | 回收站/软删除 |

## 3. 数据与核心概念

### 3.1 实体字段（详细 DDL 见 design.md §5）

```
Prompt {
  id: "prm_<nanoid>",          // 前缀式 ID，全库统一
  title: string,                // 必填，≤200 字符，库内不要求唯一（导 入去重靠内容哈希）
  description: string,          // 可选，≤500 字符
  content: string,              // 必填，Markdown，≤512KB
  variables: string[],          // 保存时从 content 自动提取（见 FR-2），只读派生
  tags: string[],               // 自由标签，空标签自动清除
  folderPath: string,           // 形如 "/工作/代码审查"，"/" 为根；文件夹是路径字符串非实体
  platformMarks: string[],      // ⊂ {claude-code, cursor, codebuddy, trae, minicode, windsurf, codex, generic}（与 adapter 清单对齐，D7/D9 扩充；zcode/Kimi 等兼容平台用 generic 覆盖，见 design §8）
  useAs: "rule" | "reference",  // rule=行为规则（可入标准包规则段）；reference=任务提示词（入附录段）
  status: "draft" | "active" | "deprecated",
  createdAt / updatedAt
}
PromptVersion { id, promptId, versionNo(从 1 递增), content, contentHash(sha256),
                changelog(可选), createdAt }
```

### 3.2 状态机

```
draft ──发布──► active ──弃用──► deprecated
  ▲                │                 │
  └────恢复◄───────┴────────恢复◄────┘
```

状态只影响默认过滤与组包候选（默认只列 active），不限制编辑。

## 4. 功能需求（FR）

### FR-1 CRUD
1. 创建/编辑/删除提示词；删除需二次确认，确认后连同全部版本硬删。
2. 编辑器：Markdown 文本编辑（等宽字体 + 行号）+ 实时预览双栏。
3. `variables`、`useAs`、`platformMarks` 在表单内可改（`variables` 显示为只读提示，来源自动提取）。

### FR-2 模板变量
1. 保存时以正则 `{{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*}}` 提取变量名去重存入 `variables`；变量名重复或非法（含中文/空格）只取合法项并在保存响应中返回 `warnings[]`。
2. 列表页每条提供「复制」：弹出变量填充表单（必填项校验），实时预览替换结果，确认后复制到剪贴板。
3. 无变量提示词：直接复制，无弹窗。
4. `useAs=rule` 且 content 含未填充变量 → 保存成功但返回警告「规则类提示词含变量，注入后不会自动填充」。

### FR-3 组织与检索
1. 标签：创建/合并/删除；删除标签即从所有提示词移除该标签。
2. 文件夹：路径字符串，侧栏树形导航（按 `/` 分层），可拖拽移动提示词。
3. 全文搜索：命中 title + content + tags；支持中文子串与英文前缀（实现见 design.md §12）；搜索框置于库顶栏，结果高亮命中片段。
4. 过滤器可组合：标签 ⊕ 文件夹 ⊕ 平台 ⊕ 状态，结果实时更新。

### FR-4 版本管理
1. 每次保存且 `contentHash` 变化 → 自动创建 `PromptVersion`（versionNo = 该提示词最大值 +1）；内容未变仅改元数据不产生版本。
2. 版本历史侧栏：列出全部版本（版本号、时间、changelog），任意两版 diff（并排高亮增删行），单版可查看全文。
3. 回滚 = 以旧版 content 创建新版本（versionNo 继续递增，changelog 默认「回滚自 vN」），**从不改写或删除既有版本**。

### FR-5 平台适配标记
1. `platformMarks` 多选；至少 0 项（无标记 = 通用）。
2. 列表按平台过滤；M6 组包时按目标平台匹配（见 specs/m6a FR-2）。

### FR-6 导入
1. **JSON 导入**：接受本库导出的 JSON（schema 见 FR-7）；按 `title + contentHash` 去重，重复项跳过并计入报告；导入的版本历史合并为「导入前单版本」。
2. **Markdown 导入**：单文件 → title 取一级标题（无则文件名），content 为全文；可多选批量。
3. **规则文件反向导入**：识别 `.cursorrules`、`.mdc`、`CLAUDE.md`、`AGENTS.md`；title 默认文件名，`useAs=rule`，platformMarks 按文件名推断（`.cursorrules`→cursor，`CLAUDE.md`→claude-code，`AGENTS.md`→generic，其余→空）。来源二：CLI `openvibe scan --project`（specs/m6b FR-4），落同一 API。
4. `.mdc` 导入时剥离 YAML frontmatter 存入 description，正文入 content。

### FR-7 导出
1. JSON 导出（全部或当前过滤结果）：`{ schemaVersion: 1, exportedAt, items: Prompt[] }`，可完整回导。
2. Markdown 导出：每条一个 `.md`（文件名 = title slug），frontmatter 携带元数据。

## 5. 输入 / 输出

- **API**（明细见 design.md §6）：`/api/prompts` CRUD、`/api/prompts/:id/versions`、`/api/prompts/:id/versions/:no/restore`、`/api/prompts/import`、`/api/prompts/export`、`/api/search?type=prompt`。
- **UI**：`/library` 页（列表 + 侧栏树 + 过滤器）、编辑抽屉（双栏编辑/预览/版本历史/导入导出入口）。
- **对下游输出**：M6 组包候选（按 useAs/platformMarks/status=active 过滤）。

## 6. 边界与异常

1. content > 512KB → 422 拒绝并提示。
2. title 空 / >200 字符 → 422。
3. 删除已被某标准包引用的提示词 → 允许（包在导出时已物化内容快照，见 m6a §6.3），但删除确认框列出引用它的包名。
4. 搜索词 < 3 字符（trigram 门槛）→ 自动降级 LIKE 匹配，结果不保证排序质量（design.md §12）。
5. 导入文件非法 JSON / 超 512KB 单条 → 整批 422，报告第一条错误；不部分入库。
6. 变量名提取与手写正文冲突（用户在正文写了教程性 `{{示例}}`）→ 以正则结果为准，不提供白名单转义（记入已知局限）。

## 7. 验收标准（pass/fail）

1. 创建含 `{{language}}` 与 `{{task}}` 的提示词，保存后 variables 恰为两项；复制弹窗出现两个必填项，填值后剪贴板文本无残留 `{{}}`。
2. 同一提示词连续保存 3 次不同内容 → 版本历史恰 3 条，versionNo 1/2/3；回滚到 v1 后出现 v4 且内容等于 v1。
3. 内容不变只改 tags 保存 → 不新增版本。
4. 搜索「规则漂移」能命中正文含该词的提示词（中文子串）；英文前缀 `memo*` 行为一致。
5. 导出 10 条 → 清库 → 回导，10 条全部恢复且再导一次字节级一致（除 exportedAt）。
6. 导入一份真实 `.cursorrules` → 得到 `useAs=rule`、platformMarks 含 cursor 的提示词。
7. 删除带 5 个版本的提示词 → 确认后列表与版本表均无残留（SQLite 计数验证）。
8. 422/404 场景（超长、空 title、错 id）均返回结构化错误 `{ code, message }`。

## 8. 依赖

- 依赖：T2 存储层（migrations、FTS）、design.md §12 搜索设计。
- 被依赖：M6 组包（FR-2 候选过滤）、M5 复盘回流（「存为提示词草稿」落本模块，status=draft）。
