# SPEC · M3 术语库（瘦身版：预置 + CRUD + TERMS.md）

| 项 | 值 |
|------|------|
| 模块 | M3 术语库（差异化模块） |
| 优先级 | P0（瘦身）→ P1 提案-审核流（团队版） |
| 上游 | PRD 3.2-M3、附录 B、proposal §3.1 |
| 下游设计 | design.md §5、§7.4（TERMS.md 契约）、§12（中文搜索）；注音头词的**视觉形制**归横切 spec `theme.md` FR-5.5（本文只定数据语义） |
| 关联任务 | tasks.md T4 |
| 版本 | v1.0（2026-09-20 定稿）· 未修订；本行为 2026-09-23 按 §0.3 补写的痕迹基线。注：TERMS.md 渲染行数随种子增长（104→109）不属本 spec 修订——§7.4 契约未变，登记的是数量而非格式 → v1.1（2026-09-30，**新增 FR-5「注音派生字段」**：`TermOut.pinyin` 是只读派生字段（非库列、非入参），头词 ruby 注音的数据源；随实现（commit `453a535`，DEV_LOG「ruby 注音头词落地」那笔）补写规格，属 §0.3 **B 级**——它是 `GET/POST/PATCH /api/terms` 与搜索响应的**形状变化**（additive）。§3/§4/§5/§6/§7 各补，既有 FR 一字未改。**两处刻意的不升版**：① `orderBy: pinyin`（FR-4.2 原文已有）实现早已落地，本次未改其语义；② 注音**设置开关**（DESIGN.md term-card 承诺「可在设置关闭」）**未实现**，不在本文写成 FR——它是待裁项，登记在 `theme.md` §7.5-3，补实现时才走 B 级新增） |

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
  createdAt / updatedAt,
  pinyin: string           // 【派生只读，非库列、非入参】zh 的带声调词级注音；zh 缺省 → 空串。见 FR-5
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

### FR-5 注音派生字段（v1.1 新增，2026-09-30）
1. `TermOut.pinyin` 是**只读派生字段**：不是 SQLite 列、不在 `TermCreateInput`/`TermUpdateInput` 里、写了也不生效（zod 入参不认）。派生点**唯一**在 `packages/core/src/repos/terms.ts` 的 `rowToTerm`——所有出口（列表/详情/搜索/渲染选集）都过它，因此不存在"某个端点漏了注音"。
2. 算法：`pinyinDisplay(zh)`（`packages/core/src/repos/util.ts`，`pinyin-pro` 的 `toneType: 'symbol'`）——**带声调、保留词组分隔**（如「规则漂移」→ `guī zé piāo yí`）。
3. **词组级多音字消歧**：`pinyin-pro` 按整词查词典，故「重复」→ `chóng fù`、「重要」→ `zhòng yào`，不会逐字切成 `chóng/zhòng` 误音。这与排序键 `pinyinKey`（`toneType: 'none'`、去空格、小写）是**同一词典的两种投影**——展示串与排序串允许不同形，但消歧结果必须一致（改任一侧都要核对另一侧）。
4. 边界取值：`zh` 缺省或为空串 → `pinyin` 为 `''`（英文词条无注音，不是 `undefined`、不是 `null`）；`zh` 内的非汉字字符原样透传。
5. 用途**只有前端头词 ruby 注音**（形制归 `theme.md` FR-5.5）。**不进 TERMS.md 产物**（design §7.4 表格四列「术语 | English | 别名 | 定义」未增列，§7.4 是冻结口径的产物格式）；**不参与检索命中域**（FR-3.1 的四域不含拼音，搜 `guize` 不期望命中「规则漂移」）；**不参与排序**（FR-4.2 用的是 `pinyinKey` 不是本字段）。
6. 兼容性：additive 字段。旧消费方（CLI 不读 terms，故无 CLI 侧影响；外部脚本按 `--json` 取键者）多一个键不破坏既有读取；TS 侧 `TermOut` 必填 ⇒ 服务端恒产出。

## 5. 输入 / 输出

- **API**：`GET/POST /api/terms`、`PATCH/DELETE /api/terms/:id`、`GET /api/terms/search?q=`、`POST /api/terms/render-terms-md`（body: termIds[] + orderBy）。**端点数不变**（v1.1 只加响应字段，见 FR-5）；`TermOut` 出现的地方一律含 `pinyin`。
- **UI**：`/terms` 页（搜索框 + 列表 + 多选条 + 编辑抽屉）。头词以 `<ruby><rt>` 消费 `pinyin`（形制与降级规则归 `theme.md` FR-5.5 / §7.5-3）。
- **对下游输出**：TERMS.md 文本（M6 打包）——**不含注音**（FR-5.5）。

## 6. 边界与异常

1. zh/en 全空 → 422。
2. aliases 去重（忽略首尾空白与大小写差异的英文别名）。
3. 选集为空调 render → 422 `EMPTY_SELECTION`。
4. 循环关联（A→B→A）→ 允许（展示去重即可），不做环检测。
5. TERMS.md 内 definition 中的 Markdown 表格语法（`|`）→ 转义为 `\|`，保证产物表格不破碎。
6. `zh` 缺省的词条（纯英文词条）→ `pinyin` 为**空串**；前端据 falsy 判定降级为"无 ruby 的普通头词"，不得渲染空 `<rt>`。（v1.1）
7. 入参里塞 `pinyin` 被 zod 丢弃/拒绝——它是派生字段，写路径不接受。（FR-5.1）（v1.1）
8. 注音串长度大于头词时的排版（如「瞬时用户激活」六字 → 六段拼音）由 `theme.md` 的 `rt` 10px + 字距规则承载，**本 spec 不约束视觉不破行**；极窄屏未测，见 `theme.md` §7.6。（v1.1）

## 7. 验收标准（pass/fail）

1. 首次启动后 `SELECT count(*) FROM terms WHERE source='openvibe-seed'` ≥ 100；二次启动计数不变。
2. 搜「漂移」命中「规则漂移」；搜 "RAG" 命中「检索增强生成」（英文主名）；给词条加别名「大模型幻觉」后搜该别名命中「幻觉」。
3. 任选 5 词条生成 TERMS.md 两次 → 两次输出 sha256 相同；表格渲染无错位（`|` 已转义）。
4. 删除被 2 个词条关联的词条 → 那 2 个词条的 relatedTermIds 不再含该 id。
5. zh/en 全空的保存请求返回 422 且不入库。
6. **注音派生字段**（FR-5，v1.1）：`packages/core/src/repos/terms.test.ts` 的 `UT-TERM-OUT · pinyin 派生字段（头词 ruby 注音，DESIGN.md term-card）` 那条 `it` 三条断言全绿——「规则漂移」→ `guī zé piāo yí`（带声调 + 词组分隔）、「重复」→ `chóng fù`（词组消歧，非 `zhòng`）、纯英文词条 → `''`。命令 `pnpm vitest run --project unit packages/core/src/repos/terms.test.ts`；具名取数 `grep -oE "UT-TERM-OUT" packages/core/src/repos/terms.test.ts | sort -u`。
7. **展示串与排序串同源**（FR-5.3）：`UT-COMPOSE-01 · 排序口径` 里「pinyin 走词典键（多音字按词组消歧），与码点序不同」那条 `it` 全绿，且 `apps/server/test/terms.api.test.ts` 的 `IT-TERM-RENDER-01（§7.3）` 断言 `orderBy: 'pinyin'` 得 `规则漂移 < 幻觉 < 术语表`（键 `guizepiaoyi < huanjue < shuyubiao`）。**判据**：同一批词条的 `pinyinKey` 序与 `pinyinDisplay` 的多音字选择不得互相矛盾（改任一侧词典参数都要重跑这两支）。
8. **注音不进产物 / 不进检索**（FR-5.5）：`IT-TERM-RENDER-01` 断言产物表头恒为 `| 术语 | English | 别名 | 定义 |`（四列，无注音列）；检索命中域四域（`zh/en/aliases/definition`）不含拼音——**这条目前只有代码级证据，没有"搜 `guize` 不命中"的反向用例**，属未验证面，补用例时才声称已验。
9. **§7.1「≥100」的验证主体要说清**（v1.1 纠偏）：`IT-SEED-REAL-01（§7.1）` 名义上映射本条，但它断言的是 `created >= 60`（`toBeGreaterThanOrEqual(60)`）——**低于本文门槛**，因此「≥100」在 IT 层并未被证明。真正压住门槛的是 `seed:check` 闸（`SCRIPT-SEED-01` 负向：截到 95 条即退出码 1）与 `UT-SEED-02`（真实种子全量入 SQLite，`terms ≥ 100`，实量单源见 dev-plan §9 映射表 seed-2 行）。本条判据以此为准，不随 `IT-SEED-REAL-01` 的 60 放宽。
10. **人工凭据**（头词注音的真机渲染）：`docs/devlog-evidence/DEV-0046/03-terms-dark-ruby.png`（暗色 `/terms` 页）。该笔 DEV_LOG 记录自述首例 `rt` 为 `jìng xiàng zhù cè biǎo`——对应词条是种子里的 **「镜像注册表」**（本笔 2026-09-30 复算坐实，命令见下），**串按"记录所载 + 本地复算"双口径引用**。复算路径：`npx tsx -e 'import("./packages/core/src/repos/util.ts").then(m=>console.log(m.pinyinDisplay("镜像注册表")))'`（2026-09-30 实测输出 `jìng xiàng zhù cè biǎo`），或直接起 dev server 打开 `/terms` 读头词上方 `rt` 文本。**未验证面**：注音设置开关未实现（DESIGN.md 承诺，见 `theme.md` §7.5-3）、极窄屏下 rt 宽度、Windows/Linux 的系统字重映射。

## 8. 依赖

- 依赖：T2 存储层、seed-content.md（词条数据）。
- 被依赖：M6 组包（TERMS.md 素材）、M5 复盘回流（「存为术语候选」落本模块，status=draft）。
