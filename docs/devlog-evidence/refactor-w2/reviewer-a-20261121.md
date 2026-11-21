# Reviewer A 独立复核报告 · D32 契约一致性视角（2026-11-21）

> ㊾ ③-b 要求的两名无上下文 reviewer 之一（视角：标记契约自洽 / 实现与契约一致 / golden 与契约一致）。全文由会话原样照录（仅还原传输层的 HTML 实体）；复核当时代码状态 = 本笔修复（吞空行 / 模板空行）之前，两处修复均已按其结论执行并复测。

---

# D32 段级受管标记（A 级契约变更）无上下文独立复核报告

复核基线：working tree（未提交），HEAD = `54f0811`。复核起点 golden 三主文件 diff 的 blob 指纹已留存，全程未修改任何文件（仅 `pnpm golden:update` 按 ㊾ 清单授权执行了两次，事后证明内容零漂移，见主张 5）。

---

## 主张 1：标记契约自洽 —— **成立（有一处文本级瑕疵，见保留点）**

**复算过程**：并排读 `docs/design.md` §7.3（204-238 行）与 `/Users/duke/Documents/OpenVibe/packages/shared/src/pack-contract.ts`。

原文摘录（design.md:236-237）：

> - 首尾 HTML 注释 = **受管块标记**（begin/end，v1 起）；**节标题上方的 HTML 注释 = 段级受管标记**（v1.5 / D32 · 4-c）：`<!-- openvibe:section=<节名> -->`，节名即该节标题去井号（`PACK_SECTION_MARKER`，`pack-contract.ts`）。
> - **区域模型（v1.5）**：`壳头`（begin 标记 → 首个段标记，含标题与引用块——契约字节）｜`受管段·<节名>`（段标记 → 下一标记/壳尾）｜`块外自由区`（begin 之前 / end 之后——用户的自由区）。空节连标记一起省略（与「空节整体省略」同口径）。

五项逐项复算：

- **标记格式**：`pack-contract.ts:81-82` `PACK_SECTION_MARKER = (heading) => \`<!-- openvibe:section=${heading.replace(/^#+\s*/, '')} -->\``，输出与 §7.3 模板标记行（216/220/224/228 行）逐字同构。一致。
- **段名推导（去井号）**：`^#+\s*` 剥离；`PACK_SECTION_ORDER`（96-107 行）四项全带 `## ` 前缀（`'## 工作流程'` 等），喂入 `PACK_SECTION_MARKER` 即得模板中的四条标记，与「节名即该节标题去井号」一致。
- **空节省略口径**：design.md:206「空节整体省略」与 :237「空节连标记一起省略（与「空节整体省略」同口径）」互相引用、无矛盾；`composer.ts:176` `if (blocks.length === 0) return` 同口径实现。
- **区域模型**：design.md:237、pack-contract.ts:74-80 注释（「壳内标记之前的『壳头』…壳外（begin 之前 / end 之后）依旧是用户的自由区」）、`section-diff.ts:12-27` docstring 与 :122-146 `sliceSections` 实现，三处文本对「壳头/受管段/块外自由区」的边界定义逐字一致。
- **保留点（发现的问题）**：§7.3 模板（docs/design.md:216-218）在每个段标记与节标题之间画了**一个空行**：
  ```
  216	<!-- openvibe:section=工作流程 -->
  217
  218	## 工作流程 ← …
  ```
  而实现与 golden 的实际字节是**标记与标题紧邻**（见主张 2/3）。§7 开头声明「规范以本节为唯一权威」，且本笔主题就是「标记进契约」，模板空行与产物字节不符属契约文本缺陷。缓解性事实：`git show HEAD:tests/golden/G1/files/CLAUDE.md` 证实 begin 标记与标题紧邻，而模板 209-211 行同样画了空行——即「模板标记行后画空行、实现从不画」是同一类既有模板宽松，非本笔新造的分类学问题。不影响段界判定（空行无论落在壳头侧还是受管段侧，都在同一 region 内）。

## 主张 2：实现与契约一致 —— **有保留的成立**

**复算过程**：读 `/Users/duke/Documents/OpenVibe/packages/core/src/pack/composer.ts:175-181`，并取 git diff：

```ts
const section = (heading: string, blocks: string[]): void => {
  if (blocks.length === 0) return
  ;-lines.push('', heading) + // D32（decisions ㊾）：段级受管标记置于节标题上方——空节连标记一起省略，
    +(
      // 与「空节整体省略」的确定性口径一致（§7.3）。
      (+lines.push('', PACK_SECTION_MARKER(heading), heading))
    )
  for (const block of blocks) lines.push('', block)
}
```

- 标记行格式：`PACK_SECTION_MARKER('## 工作流程')` = `<!-- openvibe:section=工作流程 -->`，与 §7.3 模板标记行**逐字一致**。
- 位置：置于节标题**上方**（紧邻上一行）。§7 正文（design.md:150、:236）的规范表述「节标题上方」满足；但按模板 fence 的字面空行排版则不一致（主张 1 保留点）。
- 空节：`if (blocks.length === 0) return` 连标记一起省略——golden 证实：`tests/golden/G2/files/CODEBUDDY.md` 仅含 begin + `<!-- openvibe:section=行为规则 -->` + end 三条标记，其余三节（空）连标记带标题全无。
- 壳标记：diff 中 `PACK_MARKER_BEGIN`/`PACK_MARKER_END` 用法未动，`renderBody` 其余结构（title/quote/end 拼装）未动。

**问题**：无行为问题；保留点同主张 1（标记与标题间空行的文实不符）。

## 主张 3：golden 与契约一致 —— **成立**

**复算过程**：node 脚本对 G1/G2/G3 全部 12 个主文件（AGENTS.md、CLAUDE.md、CODEBUDDY.md、MINI.md、`.trae/rules/openvibe.md`、`.cursor/rules/openvibe.mdc`）逐行机判「四节标题的上一行是否恰为对应标记」。关键输出（全部 ok=true）：

```
=== tests/golden/G1/files/CLAUDE.md
markers-in-file: ["1:<!-- openvibe:pack=overseas@1.0.0 begin (regenerate: npx openvibe-cli sync) -->","7:<!-- openvibe:section=行为规则 -->","17:<!-- openvibe:section=术语表 -->","22:<!-- openvibe:section=任务提示词参考 -->","29:<!-- openvibe:end -->"]
  L8 ok=true prev="<!-- openvibe:section=行为规则 -->" heading="## 行为规则"
  L18 ok=true prev="<!-- openvibe:section=术语表 -->" heading="## 术语表"
  L23 ok=true prev="<!-- openvibe:section=任务提示词参考 -->" heading="## 任务提示词参考"
=== tests/golden/G2/files/CODEBUDDY.md
markers-in-file: ["1:…begin (regenerate: npx openvibe-cli sync) -->","7:<!-- openvibe:section=行为规则 -->","14:<!-- openvibe:end -->"]
  L8 ok=true …
=== tests/golden/G3/files/CLAUDE.md
markers-in-file: [begin, 工作流程, 行为规则, 术语表, 任务提示词参考, end]（6 条，四节全有，逐条 ok=true）
```

- 标记数量：G1 恰 5 条（工作流程空节无标记）、G2 恰 3 条、G3 恰 6 条；无多余、无缺失。
- 二级文件：G1/G3 的 TERMS.md、G3 的 CHECKLIST.md/SKILLS.md 均为 0 条标记——与 §7.3 尾注「**二级文件**（TERMS.md 等 §7.4）本版不加段标记」一致。
- 壳标记未变：begin 行仍为 `<!-- openvibe:pack=overseas@1.0.0 begin (regenerate: npx openvibe-cli sync) -->`，regenerate 串仍 `npx openvibe-cli sync`（与 ㊾「D25 不落地」一致）；end 仍 `<!-- openvibe:end -->`。
- golden 主文件 diff 的 D32 成分恰为「每节标题上方 +1 行标记」；G1/G3 中 `- 见 TERMS.md（6 条）` → ``- `@TERMS.md`：…`` 为同合并窗口 N4 L1 成分（㊽ 口径），非 D32。

**问题**：无。

## 主张 4：兼容性 —— **成立**

- **a)** `/Users/duke/Documents/OpenVibe/packages/shared/src/schemas/pack.ts:295`：`schemaVersion: z.union([z.literal(1), z.literal(SCHEMA_VERSION)])`（SCHEMA_VERSION=2，`constants.ts:10`）。注释（:290-294）说明 v1 语义：「⚠️ 1 与 2 并收（decisions ㊾ / D33 兼容读 · docs/specs/n3-hooks.md FR-5.2）…1 的语义 = 旧包：hooks/l1 两字段缺省（两字段本就 .optional()，其余形状在 1→2 间零分叉），读侧无需归一。」成立。
- **b)** `pack.ts:353`（PackLockSchema）：`schemaVersion: z.literal(1)` —— lock 形状未变。成立。
- **c)** `git status --porcelain -- packages/core/src/inject/planner.ts packages/core/src/inject/verify.ts` 输出为空；`git diff --name-only | grep -E "inject/(planner|verify)\.ts$"` → `NOT IN DIFF`。（status 中含 "verify" 的 `apps/cli/src/commands/verify.ts`、`apps/cli/test/verify.test.ts`、`scripts/verify-matrix.ts` 均非这两个文件。）成立。
- **d)** `/Users/duke/Documents/OpenVibe/packages/core/src/inject/section-diff.ts:127-129`：`sliceSections` 无段标记时 `if (firstIdx < 0) return [{ name: '受管块', lines }]`；`diffSections:106-114` 段数不等或 ≤1 时 `regions.push(regionOf('受管块', e.managed, a.managed))` —— v1 无段标记文件退回「块外自由区 + 受管块」两分法。测试腿：`section-diff.test.ts:17-28`（两侧皆无段标记 → `regions` 两分法）与 :67-78（段数不一致异常态 → 退回整块，不硬切错位）。成立。
- **附带佐证**：`apps/cli/src/pack-source.ts:127-145` 版本闸只拒 `value > supported`（「以 `>` 判超前——`<` 兼容」），配 a) 的 union 后 v1 旧包闸与 schema 均放行——㊾ 所述 GAP-1（闸声称兼容但 schema 拒 v1）确已随本笔闭合。

## 主张 5：测试与确定性 —— **成立**

- 测试（只读运行）：
  ```
  ✓ |unit| packages/core/src/pack/pack.test.ts (20 tests) 74ms
  ✓ |unit| packages/core/src/inject/section-diff.test.ts (6 tests) 2ms
  ✓ |cli| apps/cli/test/diff-sections.test.ts (2 tests) 13ms
  Test Files  3 passed (3)   Tests  28 passed (28)
  ```
- 确定性：`pnpm golden:update` 两次，`git diff tests/golden/G1 tests/golden/G2 tests/golden/G3 | shasum` 两次均为：
  ```
  f9f6a44ed593be8571af8a19b3904691d4894501  -
  ```
- 附加验证：两次运行后三主文件 diff 的 index blob 哈希（`82d9147..c478eef` 等）与复核起点逐字节相同——working tree 的 golden 本就是当前代码的确定性产物，我的两次运行零内容漂移。
- golden manifest 同步核对：G1/G3 `openvibe.pack.json` `schemaVersion` 1→2、逐文件 sha256 与 fingerprint 随内容更新、`l1` 字段出现——manifest 形状变化属 N3/N4（㊽ 窗口），D32 只动文件内容（哈希随动），与「manifest/lock 结构零变化（lock 仍 1）」口径一致。

---

## Reviewer 独立结论

**判定：需修复后收口——且所需修复仅是一处文档文本对齐，不涉及实现、golden、schema 或兼容性行为的任何改动。**

五条主张中 3、4、5 完全复算成立；1、2 成立但共享同一个保留点：**docs/design.md §7.3 模板在每个段标记与节标题之间画了一个空行，而实现（composer.ts:179 `lines.push('', PACK_SECTION_MARKER(heading), heading)`）与全部 12 个 golden 主文件的实际字节是标记与标题紧邻**。§7 自declare「规范以本节为唯一权威」，本笔的交付物恰恰包含契约文本本身，文本与产物字节应一一对应；修法是删去模板中四个段标记后的空行（或反向在实现与 golden 中加空行，代价大不推荐）。该瑕疵不影响段界划分与 section-diff 行为，属一行级文档修复，修复后即可收口。

清单之外的发现（均不阻塞）：

1. 该文实不符没有机判闸：`tests/spec-claims.test.ts` 与 docs-check 均未校验 §7.3 模板与产物字节的一致性（grep 无命中），此类空行瑕疵 CI 拦不住；建议后续把「§7.3 模板标记行 == PACK_SECTION_MARKER 输出」纳入机判。
2. golden 主文件 diff 是混合窗口产物（D32 标记 + N4 的 `@TERMS.md` 引用形态 + manifest 的 schemaVersion 2/l1 字段），与 ㊽「五件一次 golden 重基、归因事后不可分」的已知代价登记一致，复核层面未见越窗口的意外字节。
3. 理论边界仅登记：`PACK_SECTION_MARKER` 内插任意去井号标题、`sectionName` 取首个 `-->` 前文本——在四节节名固定且不含 `-->` 的现状下无歧义；若未来节名可配置需回头收紧。

关键文件：`/Users/duke/Documents/OpenVibe/docs/design.md`（§7.3，150/204-238 行）、`/Users/duke/Documents/OpenVibe/packages/shared/src/pack-contract.ts`（64-107 行）、`/Users/duke/Documents/OpenVibe/packages/core/src/pack/composer.ts`（169-199 行）、`/Users/duke/Documents/OpenVibe/packages/shared/src/schemas/pack.ts`（288-335、351-353 行）、`/Users/duke/Documents/OpenVibe/packages/core/src/inject/section-diff.ts`（100-154 行）、`/Users/duke/Documents/OpenVibe/tests/golden/G{1,2,3}/`。

**处置记录（当值会话补）**：保留点已修复——§7.3 模板四条空行删除（begin/标题间的同类既有分歧一并删除），围栏改 ```text（prettier 会对 markdown 围栏强插 HTML 注释后空行，text 围栏才能让契约模板逐字节稳定，原因已写入 §7.3 尾注）；「§7.3 模板 == PACK_SECTION_MARKER 输出」机判建议已登记为后续项（清单外发现 1）。
