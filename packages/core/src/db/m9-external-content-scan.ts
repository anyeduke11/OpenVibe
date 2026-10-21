// `packages/core/src/db/m9-external-content-scan.ts` —— M9 v1.6 P1.8（`m9-dev-plan-2026-10.md` §6.2）
//
// **DL-02：正文一个字都没进仓。**
//
//   spec §7 原文：「**正文一个字都没进仓**」
//   怎么证明它能红：全仓搜教程正文片段 ⇒ 0；且守卫自证：注入一条正文样本必被报出
//   背景（§3.2）：「只存链接不存正文 —— runoob 正文有版权；
//     GitHub README 会被上游改写（awesome-python-cn 停更 4 年即证）。**正文一律不入仓**」
//
// ⚠️ **「全仓」在本仓的可执行形态 = 「外部源派生层」**（口径必须写死，否则这条判据不可执行）：
//   仓内 spec / 设计文档 / 代码注释本来就满是中文散文 —— 按字面「全仓扫散文」会让整仓
//   立刻变红，且红的东西没有信息量。真正该守的是**外部源派生物**：
//   ① 采集证据（`docs/devlog-evidence/M9-probe/`）② 派生清单（`seeds/lang_topics_*.json`）
//   ③ 采集/构建脚本（`seeds/_build/build-lang-topics-from-inventory.py`）。
//   这一层之外的中文都是**自撰**的（§3.7 要求把三段内容写满），自撰 ≠ 搬运。
//   ⚠️ **自撰内容层（`lang_topic_content` / `lang_concept_deltas` / `lang_concepts`）
//      刻意不在扫描范围内** —— 把它们算进来等于把 §3.7 明确要求的产出判成违规。
//      它们的合规性靠内容人工复核（机器判不了「自撰 vs 搬运」），不靠机器。
//
// ⚠️ **否定式判据必须自证**（与 `test-support/forbidden-scan.ts` 同源纪律）：
//   本扫描器写错了永远绿 —— 它只在「真有正文」时说话，而「没写错」时它是沉默的。
//   ⇒ 必须配一条「注入一条正文形状的样本 ⇒ 必须报出」的腿，
//     否则「扫描器漏了」与「仓里干净」在结果上长得一模一样。
//   ⚠️ 该样本在测试里**合成**，不由教程抄来 —— 抄正文进仓本身就是 DL-02 违规。
//
// ⚠️ **阈值是量出来的，不是猜的**（2026-10-20 实测，样本 = 本仓 5 个外部源派生文件）：
//   - 数据区（`items` 数组）最长字符串 **66 字符**（全是 URL）⇒ 长度上限取 **80**
//   - 数据区最长连续汉字 **7**、说明区 **16**、构建脚本 **17** ⇒ 散文阈值取 **40**
//   - HTML 标签在**说明区**有 5 处命中（`collect_method` 里写着
//     「按 `<div class="design">` 切侧栏」—— 那是**采集方法说明**，不是正文）
//     ⇒ HTML 规则**只对数据区生效**，说明区豁免。
//   - 说明区最长字符串 189 字符（我们自己写的分站说明）⇒ 长度规则**只对数据区生效**。
//
// ⚠️ **光看「值」守不住 —— 首版扫描器的两个真实漏洞（P1.8 开工自查发现）**：
//   ① **自造键名能藏正文**：新键不叫 body/content 时，长度与散文规则都可能放过它
//     ⇒ 键名本身必须**闭集**（`EXTERNAL_FILE_SCHEMAS`：多一个少一个都报）。
//   ② **多出来的文件能藏正文**：字段闭集只管「文件里有什么字段」，
//     管不了「目录里多了一个文件」—— 有人把抓下来的正文丢进 `M9-probe/` 它完全看不见
//     ⇒ 目录也必须**闭集**（`EXTERNAL_DIR_CLOSURE`）。
//   ⚠️ 散文规则（≥40 连续汉字）**抓不住带标点的正文段落**（真教程正文有句读 ⇒ 连续汉字
//     只有 15~25，与我们自己的说明同形）⇒ 真正兜住它的是**长度规则 + 字段闭集 + 目录闭集**，
//     不是散文规则。这一点写在这里，别让人以为散文规则是主力。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 外部源派生层的文件清单（相对仓库根）—— **单源**，加文件只改这里。
 *
 * ⚠️ **采集链的三个环节都在名单里**：采集脚本（P1.9 落的 `scripts/collect-m9-sources.ts`）
 *   ＋ 采集证据 ＋ 派生清单 —— 入口不扫，产物形态的守卫就漏了「有人把正文抓进来」这条路。
 */
export const EXTERNAL_LAYER_FILES = [
  'scripts/collect-m9-sources.ts',
  'scripts/collect-m9-github-sources.ts',
  'scripts/m9-write-guard.ts',
  'scripts/m9-content-fingerprint.ts',
  'docs/devlog-evidence/M9-probe/runoob-python3-inventory.json',
  'docs/devlog-evidence/M9-probe/runoob-go-inventory.json',
  'docs/devlog-evidence/M9-probe/xinliangnote-go-inventory.json',
  'docs/devlog-evidence/M9-probe/walter201230-python-inventory.json',
  'docs/devlog-evidence/M9-probe/awesome-python-cn-inventory.json',
  'docs/devlog-evidence/M9-probe/awesome-go-inventory.json',
  'docs/devlog-evidence/M9-probe/aux-sources-structure.json',
  'docs/devlog-evidence/M9-probe/runoob-content-fingerprints.json',
  'packages/core/src/db/seeds/lang_topics_python3.json',
  'packages/core/src/db/seeds/lang_topics_go.json',
  'packages/core/src/db/seeds/lang_topics_advanced.json',
  'packages/core/src/db/seeds/lang_profile_phases.json',
  'packages/core/src/db/seeds/lang_resources.json',
  'packages/core/src/db/seeds/lang_vibe_resources.json',
  'packages/core/src/db/seeds/lang_topic_resources.json',
  'scripts/extract-m9-guide-resources.ts',
  // ⚠️ **P1d 的附件分期抽取脚本** —— 采集链的一环（附件 HTML → 21 段种子）
  //   ⇒ 按同款纪律进扫描范围（正文抽取器痕迹 / 键访问取正文 / 成段散文）。
  'scripts/extract-m9-guide-phases.ts',
  // ⚠️ **P1f 的配套方案阶段轨道抽取脚本** —— 采集链的一环（配套方案 HTML → 6 行种子）
  //   ⇒ 按同款纪律进扫描范围（正文抽取器痕迹 / 键访问取正文 / 成段散文）。
  'scripts/extract-m9-stage-tracks.ts',
  'packages/core/src/db/seeds/lang_stage_tracks.json',
  'packages/core/src/db/seeds/_build/build-lang-topics-from-inventory.py',
] as const

/**
 * ⚠️ **刻意不在扫描范围内**的自撰内容层 —— 登记成常量是为了让这个决定**可被检查**，
 * 而不是靠「谁记得」。§3.7 要求把「步骤 / 样例 / 原理解析」写满，那必然是长篇中文。
 */
export const SELF_AUTHORED_CONTENT_FILES = [
  'packages/core/src/db/seeds/lang_topic_content.json',
  'packages/core/src/db/seeds/lang_concept_deltas.json',
  'packages/core/src/db/seeds/lang_concepts.json',
] as const

/** 数据区**非 URL** 字符串的长度上限。 */
export const METADATA_MAX_LEN = 80

/**
 * 数据区 **URL** 的长度上限。
 *
 * ⚠️ **为什么把 URL 从 `METADATA_MAX_LEN` 里分出来**：
 *   原来的规则是「数据区任何字符串 ≤ 80」，它的理由是「实测最长 66 字符且**全是 URL**
 *   ⇒ 再长就不是 URL 是正文」。**这个理由在另三源入列后就不成立了**：
 *   实测 awesome-go 的最长 URL **113 字符**、xinliangnote 的 GitHub 文件页 URL
 *   **243 字符**（中文路径百分号编码后）⇒ 「80」会把这 4 份清单**全判红**。
 *
 *   ⇒ 但**不能简单把上限调大**：那等于给「正文」开后门。
 *   ⇒ 正确的做法是**按形状分**：
 *     - 非 URL 字符串（正文、描述、标题）仍受 `METADATA_MAX_LEN`（80）约束；
 *     - URL 字符串受**另一个**上限 `URL_MAX_LEN`（300）约束。
 *   **URL 再长也不会是教程正文**（正文的形状是连续汉字，仍由散文规则兜住），
 *   而 300 足够容下真实的长 URL，同时挡住「把整段正文塞进一个假 URL」的形态。
 */
export const URL_MAX_LEN = 300

/** 是不是一个「像 URL 的东西」（用于长度规则的形状分流）。 */
export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** 连续汉字达到该长度即判「成段散文」（实测基线最高 17）。 */
export const PROSE_MIN_RUN = 40

/** 正文字段名（JSON 的 key 名命中即红）—— 外部源只该有元数据字段。 */
export const BODY_FIELD_NAMES: readonly string[] = [
  'body',
  'body_md',
  'body_text',
  'content',
  'content_html',
  'content_md',
  'text',
  'html',
  'paragraph',
  'paragraphs',
  'prose',
  'raw_text',
  'raw_html',
  '正文',
  '全文',
] as const

/** 采集脚本里出现即红的「正文抽取器」痕迹 —— 采集只该取结构，不该取正文。 */
export const BODY_SCRAPER_TOKENS: readonly string[] = [
  'BeautifulSoup',
  'cheerio',
  'innerText',
  'textContent',
  'get_text',
  'getText',
  '<p>',
  '<article',
  '<body',
] as const

/**
 * 采集脚本里**不得以「键访问」形式**取用的正文字段名。
 *
 * ⚠️ **为什么脚本侧要与 JSON 侧分开**：脚本里出现「html」「正文」这两个**词**是正常的 ——
 *   「剥 `.html` 后缀」是 URL 处理，「正文一个字不入仓」是**规则说明本身**。
 *   按「词出现即红」去判，会把这两类都判红（实测首版就是 6 处误报）。
 *   ⇒ 脚本侧只认**引号键访问**（`it['body']` / `page.get("content")` / `'body':`），
 *     那才是「真的去取了这个字段」的形状。
 */
export const SCRIPT_BODY_ACCESS_NAMES: readonly string[] = [
  'body',
  'body_md',
  'body_text',
  'content',
  'content_html',
  'content_md',
  'text',
  'html',
  'paragraph',
  'paragraphs',
  'prose',
  'raw_text',
  'raw_html',
] as const

/**
 * ⚠️ **只算指纹的脚本** —— 允许抽正文，但产物里**只有 hash**。
 *
 * ## 为什么需要这一类（这是 §3.2 灰区的显式登记，不是偷偷绕开）
 *
 * DL-02 的脚本规则禁「正文抽取器」，理由是：采集脚本的产物是**清单**，
 * 一旦脚本能抽正文，正文就可能顺着产物进仓。
 *
 * 但「**内容指纹**」这件事**必须**读正文 —— 不读就算不出指纹。
 * ⇒ 单独开一类：允许抽正文，换来的是**产物只能是 hash**。
 *
 * ## 补偿控制（三条，缺一条就不该放行）
 *
 * 1. 产物**仍在外部源派生层**里 ⇒ 受全部 JSON 规则约束
 *    （数据区长度 / 散文 / HTML / 正文字段名 / 字段闭集 / 目录闭集）。
 * 2. 产物的**字段闭集是白名单**（`url` / `sha256` / `bytes`）⇒ **正文没有字段可放**。
 * 3. `sha256` 字段**必须是 64 位十六进制**（`hash-not-hex` 规则）⇒
 *    就算有人把正文塞进那个字段，也不是 hex ⇒ 报红。
 *
 * ⇒ 名单是**单源常量**，加脚本只改这一处 ⇒ 评审时一眼看得见「谁被放行了、为什么」。
 */
export const HASH_ONLY_SCRIPTS: readonly string[] = ['scripts/m9-content-fingerprint.ts']

/** hash-only 脚本的产物：哪些字段必须是十六进制摘要。 */
export const HASH_ONLY_PRODUCTS: Record<string, { hexFields: readonly string[] }> = {
  'docs/devlog-evidence/M9-probe/runoob-content-fingerprints.json': { hexFields: ['sha256'] },
}

export type ContentRule =
  | 'metadata-too-long'
  | 'url-too-long'
  | 'hash-not-hex'
  | 'prose-run'
  | 'html-in-data'
  | 'body-field'
  | 'body-scraper'
  | 'unknown-field'
  | 'missing-field'
  | 'unregistered-file'

/**
 * 外部源派生文件的**闭集字段口径** —— 键名必须逐字命中，多一个少一个都报。
 *
 * ⚠️ **为什么要有闭集**（这是 P1.8 首版扫描器的真实漏洞）：
 *   首版只判「值像不像正文」，于是**自造键**能藏正文 ——
 *   只要新键不叫 body/content，长度规则与散文规则都可能放过它。
 *   ⇒ 键名本身也必须是闭集：外部源派生文件**只准有登记过的字段**。
 *   依据是本仓通用纪律：「§3.1 字段逐字取自规格。规格没列出的字段**不主动加**」。
 *
 * ⚠️ **顶层与 `_notes` 用「集合相等」**（多一个少一个都报）；
 *   `items` 元素用「并集口径」（每个元素的键 ⊆ 登记集合，且登记集合里的键都真实出现过）——
 *   因为 `aux-sources-structure.json` 的 `sources[]` 元素键集随源类型而异
 *   （教程型有 `md_count` + `structure`，资源清单型有 `sections` + `list_items`）。
 */
export interface ExternalFileSchema {
  topLevel: string[]
  itemKeys?: string[]
  notesKeys?: string[]
  /**
   * **逐字段**的长度上限覆写（字段名 → 字符数）—— 只给「合法超长」的那个字段开。
   *
   * ⚠️ **为什么不是「把全局上限调大」**：那是给「正文」开后门。
   *   ⇒ 覆写是**按文件 + 按字段**的：只有那一个字段放宽，同文件的其他字段照旧受 80 约束。
   *
   * ⚠️ **本轮实测的一处必要覆写**（M9 P1b 资源种子）：
   *   附件的 `d`（资源描述）最长 **115** 字符（主清单）／**121** 字符（速成专区），
   *   是**一句元数据**，不是教程正文 ⇒ 撞默认的 80 会把两份种子**判红**。
   *   而把全局上限调大，会连带放过 `name`/`url` 等本该短的字段。
   */
  metadataMaxLen?: Record<string, number>
}

export const EXTERNAL_FILE_SCHEMAS: Record<string, ExternalFileSchema> = {
  'docs/devlog-evidence/M9-probe/runoob-python3-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'link_probe', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  'docs/devlog-evidence/M9-probe/runoob-go-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'link_probe', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  'docs/devlog-evidence/M9-probe/aux-sources-structure.json': {
    topLevel: ['_readme', 'aggregate', 'collected_at', 'method', 'sources'],
    itemKeys: ['name', 'kind', 'md_count', 'sections', 'list_items', 'structure', 'note', 'last_pushed'],
  },
  // ⚠️ **GitHub 家族四份**（目录树 2 ＋ README 清单 2）。
  //   前两份做了 HEAD 验链 ⇒ 有 `link_probe`；后两份**刻意没做**（4047 条第三方外链
  //   的存活调查不是本模块的责任）⇒ 无 `link_probe`。**闭集是逐文件的**，不是一刀切。
  'docs/devlog-evidence/M9-probe/xinliangnote-go-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'link_probe', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  'docs/devlog-evidence/M9-probe/walter201230-python-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'link_probe', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  'docs/devlog-evidence/M9-probe/awesome-python-cn-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  'docs/devlog-evidence/M9-probe/awesome-go-inventory.json': {
    topLevel: ['_readme', 'caveats', 'collect_method', 'collected_at', 'counts', 'items', 'source', 'source_freshness'],
    itemKeys: ['ordinal', 'section', 'title', 'url'],
  },
  // ⚠️ **内容指纹产物** —— 字段闭集只有 `url` / `sha256` / `bytes`：
  //   **正文没有字段可放**（这是 hash-only 豁免的补偿控制之一）。
  'docs/devlog-evidence/M9-probe/runoob-content-fingerprints.json': {
    topLevel: ['_readme', 'collect_method', 'collected_at', 'counts', 'items'],
    itemKeys: ['bytes', 'sha256', 'url'],
  },
  'packages/core/src/db/seeds/lang_topics_python3.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion', 'source_url'],
    itemKeys: [
      'kind',
      'lang',
      'ref_title',
      'ref_url',
      'slug',
      'source_checked_at',
      'source_kind',
      'stage_id',
      'summary',
      'title',
    ],
    notesKeys: ['kind', 'stage_id', 'summary'],
  },
  // ⚠️ **M9 P1b 资源层三份种子** —— 字段闭集 = 表的列闭集。
  //   `tier` 是**必要性矩阵的轴**（§1.6.1），`category` 是筛选器用的展示分类 —— 两套维度不许混。
  'packages/core/src/db/seeds/lang_resources.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: [
      'category',
      'freshness',
      'is_fav',
      'lang',
      'lang_label',
      'level_label',
      'name',
      'phase_id',
      'price',
      'source_checked_at',
      'star',
      'summary',
      'tier',
      'url',
      'verified_by',
    ],
    notesKeys: [
      'demo_copy_diff',
      'necessary_rule',
      'old_marked',
      'old_note',
      'provenance',
      'tier_axis',
      'tier_lookup',
      'verified_by',
    ],
    // ⚠️ 附件的 `d`（资源描述）最长 115 字符 ⇒ 只有这一个字段放宽，其余照旧受 80
    metadataMaxLen: { summary: 130 },
  },
  'packages/core/src/db/seeds/lang_vibe_resources.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: ['freshness', 'group', 'name', 'source_checked_at', 'summary', 'url', 'verified_by'],
    notesKeys: ['no_dimensions', 'provenance', 'tier_axis', 'verified_by'],
    // ⚠️ 速成专区的描述最长 121 字符 ⇒ 同款覆写
    metadataMaxLen: { summary: 130 },
  },
  'packages/core/src/db/seeds/lang_topic_resources.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: ['lang', 'resource_name', 'role', 'topic_slug'],
    notesKeys: ['coverage', 'direction', 'lang_match', 'no_reverse', 'roles', 'self_authored'],
  },
  'packages/core/src/db/seeds/lang_topics_go.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion', 'source_url'],
    itemKeys: [
      'kind',
      'lang',
      'ref_title',
      'ref_url',
      'slug',
      'source_checked_at',
      'source_kind',
      'stage_id',
      'summary',
      'title',
    ],
    notesKeys: ['kind', 'stage_id', 'summary'],
  },
  // ⚠️ **P1d 的冷门底层六条** —— 字段闭集 = `lang_topics` 的列闭集 ＋ `content_level`。
  //   摘要与三段内容**全部自撰**（§3.7），三段内容本体在 `lang_topic_content.json`
  //   （自撰内容层，刻意不在扫描范围内）⇒ **这份文件本身没有正文可藏**，
  //   所以按普通派生清单扫，不进 SELF_AUTHORED_CONTENT_FILES。
  'packages/core/src/db/seeds/lang_topics_advanced.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: [
      'content_level',
      'kind',
      'lang',
      'ref_title',
      'ref_url',
      'slug',
      'source_checked_at',
      'source_kind',
      'stage_id',
      'summary',
      'title',
    ],
    // ⚠️ `_notes` 的键名也受正文字段名约束 ⇒ 这里**刻意不叫 `content`**
    //   （`content` 是 BODY_FIELD_NAMES 的一员 ⇒ 会被判成「用键名藏正文」）。
    notesKeys: ['content_layer', 'kind', 'source_discipline', 'why'],
  },
  // ⚠️ **P1d 的分期路线 21 段** —— 段标签/阶段名/耗时/要点/产出栏**逐字取自附件**
  //   （§3.17.1）⇒ 这份是**外部源派生**的，不是自撰 ⇒ 照常扫。
  //   §3.2 版权纪律允许「要点可入库，长文正文不入库」⇒ `points[]` 是合法字段。
  'packages/core/src/db/seeds/lang_profile_phases.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: [
      'duration_label',
      'label',
      'lang',
      'ord',
      'outcome',
      'points',
      'profile',
      'title',
    ],
    notesKeys: ['collect_method', 'empty_outcome', 'outcome_prefixes', 'points_note', 'source'],
    // ⚠️ **只放宽 `points` 一个字段**：附件里最长的那条要点 81 字符
    //   （Go 精通第 4 段的 goroutine/channel/select 那串）⇒ 比通用上限 80 多 1。
    //   其余字段（`outcome` 最长 67 · `title` 最长 27）照旧受 80 约束。
    metadataMaxLen: { points: 100 },
  },
  // ⚠️ **P1f 的成长阶段 × 轨道 6 行** —— 阶段名/周期/源 mode/源 modeName/要点**逐字取自配套方案**
  //   （§1.7 第 ② 条）⇒ 外部源派生 ⇒ 照常扫。
  //   ⚠️ `mode_name` 最长 28 字符、`goals` 最长 49、`period` 最长 24 ⇒ **不必放宽上限**。
  'packages/core/src/db/seeds/lang_stage_tracks.json': {
    topLevel: ['_notes', 'collected_at', 'items', 'schemaVersion'],
    itemKeys: [
      'goals',
      'lang',
      'mode_name',
      'period',
      'source_mode',
      'stage_id',
      'stage_name',
    ],
    notesKeys: [
      'collect_method',
      'eight_cells_six_rows',
      'profile_derivation',
      'source',
      'stage2_contradiction',
    ],
  },
}

/**
 * 外部源派生**目录**的闭集 —— 目录里出现未登记的文件即报。
 *
 * ⚠️ **这是另一个真实漏洞**：字段闭集只管「文件里有什么字段」，
 *   管不了「目录里多了一个文件」—— 有人把抓下来的正文丢进
 *   `docs/devlog-evidence/M9-probe/` 或 `seeds/`，字段闭集完全看不见。
 *   ⇒ 目录也必须闭集。
 *   隐藏文件（`.DS_Store` 之类）忽略；`_build/` 作为已登记子目录放行。
 */
export const EXTERNAL_DIR_CLOSURE: Record<string, string[]> = {
  'docs/devlog-evidence/M9-probe': [
    'aux-sources-structure.json',
    'awesome-go-inventory.json',
    'awesome-python-cn-inventory.json',
    'runoob-go-inventory.json',
    'runoob-content-fingerprints.json',
    'runoob-python3-inventory.json',
    'walter201230-python-inventory.json',
    'xinliangnote-go-inventory.json',
  ],
  'packages/core/src/db/seeds': [
    'lang_concept_deltas.json',
    'lang_concepts.json',
    'lang_profile_phases.json',
    'lang_resources.json',
    'lang_stage_tracks.json',
    'lang_topic_content.json',
    'lang_topic_edges.json',
    'lang_topic_resources.json',
    'lang_topics_advanced.json',
    'lang_topics_go.json',
    'lang_topics_python3.json',
    'lang_vibe_resources.json',
  ],
}

/**
 * 目录闭集里放行的子目录。
 *
 * - `_build/` —— 构建脚本目录（内容自检在别处做）
 * - `_backup/` —— **写回备份与差异快照**（`scripts/m9-write-guard.ts` 的产物）。
 *   ⚠️ 它**不落仓**（已 gitignore）⇒ 里面是**过程**不是证据；
 *   落仓的事实是清单本身 + git 历史。
 */
export const EXTERNAL_DIR_ALLOWED_SUBDIRS: readonly string[] = ['_backup', '_build']

export interface ContentViolation {
  /** 相对仓库根的文件路径 */
  file: string
  /** 文件内的位置（JSON 路径 / 脚本行号） */
  where: string
  rule: ContentRule
  detail: string
}

/** 连续汉字的最长游程 */
export function longestChineseRun(s: string): number {
  let best = 0
  let cur = 0
  for (const ch of s) {
    if (/[一-鿿]/.test(ch)) {
      cur += 1
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  }
  return best
}

/** 是否含 HTML 标签 */
export function hasHtmlTag(s: string): boolean {
  return /<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/.test(s)
}

interface StringHit {
  path: string
  value: string
  /** 是否在 `items` 数据区内 */
  inDataZone: boolean
}

function collectStrings(v: unknown, path: string, inDataZone: boolean, out: StringHit[]): void {
  if (typeof v === 'string') {
    out.push({ path, value: v, inDataZone })
    return
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i += 1) {
      collectStrings(v[i], `${path}[${i}]`, inDataZone, out)
    }
    return
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      // `items` 数组 = 数据区；其余（`_notes` / `caveats` / `counts` …）= 说明区
      const childInData = path === '' ? k === 'items' : inDataZone
      collectStrings(x, path === '' ? k : `${path}.${k}`, childInData, out)
    }
  }
}

/**
 * 扫一个 JSON 文件（外部源派生清单 / 采集证据）。
 *
 * 规则分区：
 * - **数据区**（`items` 数组内）：长度上限 ＋ 无散文 ＋ 无 HTML ＋ 无正文字段名
 * - **说明区**（其余）：无散文 ＋ 无正文字段名（长度与 HTML 豁免，见文件头口径）
 */
export function scanExternalJson(file: string, content: string): ContentViolation[] {
  const out: ContentViolation[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    return [{ file, where: '(整份文件)', rule: 'body-field', detail: `JSON 不可解析: ${String(err)}` }]
  }

  const hits: StringHit[] = []
  collectStrings(parsed, '', false, hits)

  // 键名检查：外部源只该有元数据字段
  const checkKeys = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i += 1) checkKeys(v[i], `${path}[${i}]`)
      return
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (BODY_FIELD_NAMES.includes(k.toLowerCase())) {
          out.push({ file, where: path === '' ? k : `${path}.${k}`, rule: 'body-field', detail: `正文字段名「${k}」` })
        }
        checkKeys(x, path === '' ? k : `${path}.${k}`)
      }
    }
  }
  checkKeys(parsed, '')

  // 闭集字段口径（多一个少一个都报）
  const schema = EXTERNAL_FILE_SCHEMAS[file]
  if (schema) {
    const obj = parsed as Record<string, unknown>
    const topKeys = Object.keys(obj).sort()
    const wantTop = [...schema.topLevel].sort()
    for (const k of topKeys) {
      if (!schema.topLevel.includes(k)) {
        out.push({ file, where: k, rule: 'unknown-field', detail: `顶层出现未登记字段「${k}」` })
      }
    }
    for (const k of wantTop) {
      if (!topKeys.includes(k)) {
        out.push({ file, where: k, rule: 'missing-field', detail: `顶层缺登记字段「${k}」` })
      }
    }
    if (schema.notesKeys) {
      const notes = (obj['_notes'] ?? {}) as Record<string, unknown>
      const notesKeys = Object.keys(notes).sort()
      for (const k of notesKeys) {
        if (!schema.notesKeys.includes(k)) {
          out.push({ file, where: `_notes.${k}`, rule: 'unknown-field', detail: `_notes 出现未登记字段「${k}」` })
        }
      }
      for (const k of schema.notesKeys) {
        if (!notesKeys.includes(k)) {
          out.push({ file, where: `_notes.${k}`, rule: 'missing-field', detail: `_notes 缺登记字段「${k}」` })
        }
      }
    }
    if (schema.itemKeys) {
      const items = (obj['items'] ?? obj['sources'] ?? []) as unknown[]
      const union = new Set<string>()
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i]
        if (!it || typeof it !== 'object') continue
        for (const k of Object.keys(it as Record<string, unknown>)) {
          union.add(k)
          if (!schema.itemKeys.includes(k)) {
            out.push({
              file,
              where: `items[${i}].${k}`,
              rule: 'unknown-field',
              detail: `条目出现未登记字段「${k}」`,
            })
          }
        }
      }
      for (const k of schema.itemKeys) {
        if (!union.has(k)) {
          out.push({ file, where: `items.${k}`, rule: 'missing-field', detail: `条目里登记字段「${k}」从未出现` })
        }
      }
    }
  }

  // ⚠️ **摘要字段的 hex 校验** —— hash-only 产物的补偿控制之一：
  //   字段闭集已经挡住了「多一个字段塞正文」，这条再挡住「把正文塞进摘要字段」。
  const hexSpec = HASH_ONLY_PRODUCTS[file]
  if (hexSpec) {
    for (const hit of hits) {
      if (!hit.inDataZone) continue
      const field = hit.path.slice(hit.path.lastIndexOf('.') + 1)
      if (!hexSpec.hexFields.includes(field)) continue
      if (!/^[0-9a-f]{64}$/.test(hit.value)) {
        out.push({
          file,
          where: hit.path,
          rule: 'hash-not-hex',
          detail: `摘要字段「${field}」必须是 64 位十六进制，实际 ${hit.value.length} 字符`,
        })
      }
    }
  }

  for (const hit of hits) {
    if (hit.inDataZone) {
      // ⚠️ **按形状分流**（理由见 `URL_MAX_LEN` 的 doc）：URL 走自己的上限，
      //   其余字符串仍受 80 的约束 ⇒ 正文仍然进不来。
      if (looksLikeUrl(hit.value)) {
        if (hit.value.length > URL_MAX_LEN) {
          out.push({
            file,
            where: hit.path,
            rule: 'url-too-long',
            detail: `数据区 URL ${hit.value.length} 字符 > 上限 ${URL_MAX_LEN}`,
          })
        }
      } else {
        // ⚠️ **逐字段覆写**（见 `ExternalFileSchema.metadataMaxLen` 的 doc）：
        //   只有登记过的那个字段放宽，同文件其他字段照旧受 `METADATA_MAX_LEN` 约束。
        const field = hit.path.slice(hit.path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '')
        const limit = schema?.metadataMaxLen?.[field] ?? METADATA_MAX_LEN
        if (hit.value.length > limit) {
          out.push({
            file,
            where: hit.path,
            rule: 'metadata-too-long',
            detail: `数据区字段 ${hit.value.length} 字符 > 上限 ${limit}`,
          })
        }
      }
      if (hasHtmlTag(hit.value)) {
        out.push({ file, where: hit.path, rule: 'html-in-data', detail: '数据区出现 HTML 标签' })
      }
    }
    const run = longestChineseRun(hit.value)
    if (run >= PROSE_MIN_RUN) {
      out.push({
        file,
        where: hit.path,
        rule: 'prose-run',
        detail: `连续汉字 ${run} 字 ≥ ${PROSE_MIN_RUN}（成段散文形状）`,
      })
    }
  }
  return out
}

/**
 * 扫一个采集/构建脚本源码。
 *
 * 规则：
 * - 不得出现「正文抽取器」痕迹（BeautifulSoup / innerText / `<p>` …）
 * - 不得**以键访问形式**取正文字段（`it['body']` / `'content':` …）——
 *   裸词（`.html` 后缀、注释里的「正文」）不算，见 `SCRIPT_BODY_ACCESS_NAMES` 的注释
 * - 不得出现成段散文（注释里的中文说明应当是短句）
 */
export function scanExternalScript(file: string, content: string): ContentViolation[] {
  const out: ContentViolation[] = []
  // ⚠️ **hash-only 脚本豁免「正文抽取器痕迹」这一条** —— 理由与补偿控制见
  //   `HASH_ONLY_SCRIPTS` 的 doc。其余规则（散文 / 键访问 / 目录闭集）**照常**。
  const isHashOnly = HASH_ONLY_SCRIPTS.includes(file)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (!isHashOnly) {
      for (const tok of BODY_SCRAPER_TOKENS) {
        if (line.includes(tok)) {
          out.push({ file, where: `第 ${i + 1} 行`, rule: 'body-scraper', detail: `出现正文抽取器痕迹「${tok}」` })
        }
      }
    }
    for (const name of SCRIPT_BODY_ACCESS_NAMES) {
      // 只认「引号键访问」：`['body']` / `["body"]` / `'body':`
      const re = new RegExp(`(['"])${name}\\1|['"]${name}['"]\\s*:`)
      if (re.test(line)) {
        out.push({ file, where: `第 ${i + 1} 行`, rule: 'body-field', detail: `以键访问形式取用正文字段「${name}」` })
      }
    }
    const run = longestChineseRun(line)
    if (run >= PROSE_MIN_RUN) {
      out.push({
        file,
        where: `第 ${i + 1} 行`,
        rule: 'prose-run',
        detail: `连续汉字 ${run} 字 ≥ ${PROSE_MIN_RUN}（成段散文形状）`,
      })
    }
  }
  return out
}

/** 按扩展名分派到 JSON / 脚本两种扫描器。 */
export function scanExternalFile(file: string, content: string): ContentViolation[] {
  return file.endsWith('.json') ? scanExternalJson(file, content) : scanExternalScript(file, content)
}

/** 扫整个外部源派生层（相对仓库根）。 */
export function scanExternalLayer(repoRoot: string): ContentViolation[] {
  const out: ContentViolation[] = []
  for (const rel of EXTERNAL_LAYER_FILES) {
    let content: string
    try {
      content = readFileSync(join(repoRoot, rel), 'utf8')
    } catch (err) {
      out.push({ file: rel, where: '(整份文件)', rule: 'body-field', detail: `读不到：${String(err)}` })
      continue
    }
    out.push(...scanExternalFile(rel, content))
  }
  out.push(...scanDirectoryClosure(repoRoot))
  return out
}

/**
 * 目录闭集检查：外部源派生目录里**不得出现未登记的文件**。
 *
 * ⚠️ 隐藏文件（`.DS_Store` 之类）与已登记的子目录（`_build/`）放行 ——
 *   它们不是「有人把正文塞进来」的形态。
 *
 * @param closure 目录闭集口径；**测试传临时目录的版本** ——
 *   往真实证据目录塞人造文件来验证这条规则是**错的**：那里放的东西会被将来的读者当成实测。
 */
export function scanDirectoryClosure(
  repoRoot: string,
  closure: Record<string, string[]> = EXTERNAL_DIR_CLOSURE,
): ContentViolation[] {
  const out: ContentViolation[] = []
  for (const [dir, registered] of Object.entries(closure)) {
    let entries: string[]
    try {
      entries = readdirSync(join(repoRoot, dir))
    } catch (err) {
      out.push({ file: dir, where: '(目录)', rule: 'unregistered-file', detail: `读不到目录：${String(err)}` })
      continue
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      if (EXTERNAL_DIR_ALLOWED_SUBDIRS.includes(name)) continue
      if (!registered.includes(name)) {
        out.push({
          file: `${dir}/${name}`,
          where: '(目录)',
          rule: 'unregistered-file',
          detail: `外部源派生目录里出现未登记文件「${name}」`,
        })
      }
    }
  }
  return out
}

/**
 * 合成一条**成段散文形状**的样本 —— 给扫描器的「散文」规则自证用。
 *
 * ⚠️ **不由教程抄来**（抄进来本身就是 DL-02 违规）⇒ 用重复拼装生成：
 *   形状与真正文一致（连续汉字、无句读分隔），但一个字都不是外部源的。
 *   长度刻意压在 `METADATA_MAX_LEN` 之内 ⇒ **只**触发散文规则，
 *   不被长度规则顺带命中 —— 否则「散文检测器在做事」这件事就没被证明。
 */
export function syntheticProseSample(): string {
  return '合成中文正文样本用于验证扫描器能否识别成段散文形状'.repeat(3)
}

/**
 * 合成一条**超长但无汉字**的元数据样本 —— 给扫描器的「长度上限」规则自证用。
 *
 * 形态取 URL（外部源派生层里最长的就是 URL，实测 66 字符）⇒ 只触发长度规则。
 */
export function syntheticPaddedMetadataSample(): string {
  return 'x'.repeat(METADATA_MAX_LEN + 20)
}

/**
 * 合成一条**超长的 URL** —— 给「URL 那一档」自证用。
 *
 * ⚠️ **长度规则分两档**（见 `URL_MAX_LEN` 的 doc）：URL 有自己的上限，
 *   非 URL 才受 `METADATA_MAX_LEN` 约束 ⇒ 这条样本必须是 URL 形状，
 *   否则测的就不是「URL 那一档」而是「非 URL 那一档」了。
 */
export function syntheticLongUrlSample(extra = 20): string {
  return `https://example.invalid/${'a'.repeat(URL_MAX_LEN + extra - 22)}`
}

/**
 * 合成一条「**真实存在的长 URL**」样本 —— 实测 awesome-go 的最长 URL 是 113 字符、
 * xinliangnote 的 GitHub 文件页 URL 到 243 字符（中文路径百分号编码后）。
 *
 * ⇒ 这条样本必须**不被**长度规则报出 —— 它证明「放宽是按形状的，不是 blanket」。
 */
export function syntheticRealisticUrlSample(): string {
  return `https://github.com/${'a'.repeat(200)}/blob/main/${'b'.repeat(30)}.md`
}
