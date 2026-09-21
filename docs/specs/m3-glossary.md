# SPEC · M3 术语库（瘦身版：预置 + CRUD + TERMS.md）

| 项 | 值 |
|------|------|
| 模块 | M3 术语库（差异化模块） |
| 优先级 | P0（瘦身）→ P1 提案-审核流（团队版） |
| 上游 | PRD 3.2-M3、附录 B、proposal §3.1 |
| 下游设计 | design.md §5、§7.4（TERMS.md 契约）、§12（中文搜索） |
| 关联任务 | tasks.md T4 |

---

## 1. 目标与用户价值

让中文开发者社区**说同一种语言**：vibe coding 高频术语开箱即查（≥100 条预置），自建词条 30 秒入库；选一组词条一键生成 `TERMS.md`，随标准包注入项目后，AI 与人都用一致的词汇表。

> 边界提醒（PRD 审查一 P0 修正）：M3 自身**只产出 Markdown 素材**，不直接写任何项目文件——注入统一走 M6 + CLI。

## 2. 范围

| In（MVP） | Out（→P1/P2） |
|-----------|---------------|
| 词条 CRUD（中英/别名/定义/示例/相关词/来源/标签） | 社区提案-审核流（P2/M7） |
| 预置 ≥100 种子词条，首次启动自动载入 | 术语使用统计 |
| 全文搜索（中文子串 / 英文 / 别名命中） | 术语变更历史 |
| 选集生成 TERMS.md（预览 + 组包素材） | |

## 3. 数据与核心概念

```
Term {
  id: "trm_<nanoid>",
  zh: string,            // 中文名，必填，≤100
  en: string,            // 英文名，≤100（zh/en 至少一项非空）
  aliases: string[],     // 别名（含缩写、常见误写）
  definition: string,    // 必填，Markdown，≤4KB
  example: string,       // 可选用法示例，≤2KB
  relatedTermIds: id[],  // 相关术语（双向展示，单向存储）
  source: string,        // "openvibe-seed" | "manual" | "project:<name>"
  tags: string[],
  status: "draft" | "active",
  createdAt / updatedAt
}
```

## 4. 功能需求（FR）

### FR-1 词条 CRUD
1. 表单校验：zh/en 至少一项；definition 非空；relatedTermIds 只能引用存在且非自指的词条。
2. 相关词展示为双向（A 关联 B，则 B 详情页的「相关」也出现 A，取并集）。
3. 删除词条 → 其他词条的 relatedTermIds 自动剔除该 id（引用清理，非级联删除）。

### FR-2 预置种子
1. 首次启动（DB 空且 seed 表无 terms 标记）自动导入 `content/seed/terms.json`（≥100 条，schema 见 seed-content.md）。
2. 导入幂等：seed 登记表记录 bundle contentHash，重复启动不重复导入。
3. 种子词条可编辑（source 保持 `openvibe-seed`），删除即用户决定，不自动恢复。

### FR-3 全文搜索
1. 命中域：zh + en + aliases + definition；中文子串、英文前缀（design.md §12）。
2. 结果高亮命中片段；别名命中与主名命中同级排序。

### FR-4 生成 TERMS.md
1. 词条列表多选（或「全选当前过滤结果」）→「生成 TERMS.md」→ 服务端渲染预览（只读 diff 友好文本）。
2. 产物为**确定性输出**：同一选集 + 同一排序规则 → 字节级相同（不含生成时间戳；时间戳只出现在标准包 manifest）。排序默认英文alpha，可选拼音/手动。
3. TERMS.md 格式遵循 design.md §7.4 契约（标题、说明段、表格列序固定）。
4. 该产物同时作为 M6 组包素材入口（组包界面选「术语集」即此处选集）。

## 5. 输入 / 输出

- **API**：`GET/POST /api/terms`、`PATCH/DELETE /api/terms/:id`、`GET /api/terms/search?q=`、`POST /api/terms/render-terms-md`（body: termIds[] + orderBy）。
- **UI**：`/terms` 页（搜索框 + 列表 + 多选条 + 编辑抽屉）。
- **对下游输出**：TERMS.md 文本（M6 打包）。

## 6. 边界与异常

1. zh/en 全空 → 422。
2. aliases 去重（忽略首尾空白与大小写差异的英文别名）。
3. 选集为空调 render → 422 `EMPTY_SELECTION`。
4. 循环关联（A→B→A）→ 允许（展示去重即可），不做环检测。
5. TERMS.md 内 definition 中的 Markdown 表格语法（`|`）→ 转义为 `\|`，保证产物表格不破碎。

## 7. 验收标准（pass/fail）

1. 首次启动后 `SELECT count(*) FROM terms WHERE source='openvibe-seed'` ≥ 100；二次启动计数不变。
2. 搜「漂移」命中「规则漂移」；搜 "RAG" 命中「检索增强生成」（英文主名）；给词条加别名「大模型幻觉」后搜该别名命中「幻觉」。
3. 任选 5 词条生成 TERMS.md 两次 → 两次输出 sha256 相同；表格渲染无错位（`|` 已转义）。
4. 删除被 2 个词条关联的词条 → 那 2 个词条的 relatedTermIds 不再含该 id。
5. zh/en 全空的保存请求返回 422 且不入库。

## 8. 依赖

- 依赖：T2 存储层、seed-content.md（词条数据）。
- 被依赖：M6 组包（TERMS.md 素材）、M5 复盘回流（「存为术语候选」落本模块，status=draft）。
