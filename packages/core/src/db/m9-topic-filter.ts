// `packages/core/src/db/m9-topic-filter.ts` —— M9 v1.6 P1.8（`m9-dev-plan-2026-10.md` §6.2）
//
// **DL-14：Python/Go 可筛选，且两门的数据都在。**
//
//   spec §7 原文：「**Python/Go 可筛选**，且两门的数据都在」
//   怎么证明它能红：筛选器只给一门 ⇒ 红（§1.5 实测 84 ＋ 34 两条清单都得在）
//   §0 速览行：「| **Python/Go 可筛选** | 两条源清单都入库 ＋ 筛选器给一门以上 | §1.5 · DL-14 |」
//
// ⚠️ **筛选器的语言选项必须来自库里，不能硬编码** —— 这是本模块存在的理由：
//   硬编码 `{python, go}` 的话，两门数据被删光时选项还在，闸永远绿；
//   而 DL-14 的「怎么证明它能红」恰恰是「筛选器只给一门」。
//   ⇒ 选项来自 `SELECT DISTINCT lang FROM lang_topics` ⇒ Go 数据没了，选项里就没 Go。
//
// ⚠️ **两门的数据都在**是**独立的第二条**：
//   即使选项还在（硬编码或从别处来），库里少了一门的行数也必须报出来。
//   ⇒ 覆盖量按 §1.5 的**实测值**（Python 84 ＋ Go 34 = 118）钉住。
//
// ⚠️ **与 §3.21 的边界**：v1.6 裁定「界面两门不再等权并排，Go 默认收起」，
//   但**DL-14 本身不变**（两门数据都在、可筛选）—— 收起的只是**默认落点**。
//   ⇒ 本模块不表达「默认选哪门」，那属于界面层。
import type { SqliteDatabase } from './index'

export type TopicKind = 'language' | 'library'

export interface TopicRow {
  id: number
  lang: string
  slug: string
  title: string
  summary: string
  stage_id: number
  kind: TopicKind
  ref_url: string | null
}

export interface TopicFilter {
  lang?: string
  stage?: number
  kind?: TopicKind | string
}

export interface TopicFilterOptions {
  /** 库里实际存在的语言（**不是硬编码**） */
  langs: string[]
  /** 库里实际出现的站号 */
  stages: number[]
  /** 库里实际出现的 kind */
  kinds: string[]
}

export interface LangCoverage {
  lang: string
  /** 该门全部行数（含库级） */
  total: number
  /** 该门的语言知识点数（进学习路线的那部分） */
  language: number
  /** 该门的库级条目数 */
  library: number
}

/**
 * 筛选器的**可选值集合** —— 全部从库里现算。
 *
 * ⚠️ 这是 DL-14 的关键：语言选项来自 `DISTINCT lang`，不是常量。
 *   两门数据被删光 ⇒ 选项少一门 ⇒ 闸红。
 */
export function topicFilterOptions(db: SqliteDatabase): TopicFilterOptions {
  // ⚠️ **用 GROUP BY 不用 DISTINCT** ——
  //   仓内静态守卫「tests/order-determinism.test.ts」要求 ORDER BY 的末键是唯一键
  //   （id / rowid / entry_no / version_no）；DISTINCT + ORDER BY lang 的末键是 lang，
  //   会被判红。GROUP BY + ORDER BY lang 走守卫自带的聚合豁免
  //   （分组键覆盖排序键 ⇒ 排序结果确定），语义与 DISTINCT 等价。
  //   ⚠️ **注释里别用反引号包 SQL 片段** —— 守卫是纯文本抽 SQL 字面量，
  //      它会把注释里的片段也当 SQL 抽出来判（首版就这么踩了：
  //      注释里写的片段被判「无兜底排序键」）。
  const langs = (
    db.prepare(`SELECT lang FROM lang_topics GROUP BY lang ORDER BY lang`).all() as Array<{
      lang: string
    }>
  ).map((r) => r.lang)
  const stages = (
    db.prepare(`SELECT stage_id FROM lang_topics GROUP BY stage_id ORDER BY stage_id`).all() as Array<{
      stage_id: number
    }>
  ).map((r) => r.stage_id)
  const kinds = (
    db.prepare(`SELECT kind FROM lang_topics GROUP BY kind ORDER BY kind`).all() as Array<{
      kind: string
    }>
  ).map((r) => r.kind)
  return { langs, stages, kinds }
}

/**
 * 按筛选条件取知识点。空条件 = 全量。
 *
 * ⚠️ **`stage` 条件蕴含 `kind='language'`**（与 P1.7 的站列表同一条纪律）：
 *   站是**学习路线**的概念（§3.6），库级条目不进站（DL-12）——
 *   库级条目的 `stage_id` 恒为 0（无语义占位），若站过滤不带 kind 过滤，
 *   「站 0」会混进 46 条库级条目（Python 39 ＋ Go 7）⇒ 站列表被污染。
 *   ⇒ 给了 `stage` 没给 `kind` 时，补上 `kind='language'`；
 *     显式给了 `kind` 就按显式值来（`kind='library'` 查的是「按需查阅区」，与站无关）。
 */
export function filterTopics(db: SqliteDatabase, filter: TopicFilter = {}): TopicRow[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (filter.lang !== undefined) {
    where.push('lang = ?')
    params.push(filter.lang)
  }
  if (filter.stage !== undefined) {
    where.push('stage_id = ?')
    params.push(filter.stage)
  }
  if (filter.kind !== undefined) {
    where.push('kind = ?')
    params.push(filter.kind)
  } else if (filter.stage !== undefined) {
    where.push(`kind = 'language'`)
  }
  // ⚠️ **WHERE 子句单独拼，不要把模板字符串嵌进 SQL 模板里** ——
  //   仓内静态守卫「tests/order-determinism.test.ts」用纯文本匹配抽 SQL 字面量，
  //   嵌套反引号会让它把 ORDER BY 子句截错（首版就踩了：守卫报「无兜底排序键」，
  //   而实际 ORDER BY 末键就是 id）。
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const sql = `SELECT id, lang, slug, title, summary, stage_id, kind, ref_url
                 FROM lang_topics
                 ${whereSql}
                 ORDER BY lang, stage_id, id`
  return db.prepare(sql).all(...params) as TopicRow[]
}

/**
 * 每门的覆盖量（行数明细）。
 *
 * ⚠️ **含库级条目** —— DL-14 断的是「两条源清单都入库」（84 ＋ 34），
 *   不是「学习路线上有多少」（那是 DL-12 的口径）。
 */
export function langCoverage(db: SqliteDatabase): LangCoverage[] {
  const rows = db
    .prepare(
      `SELECT lang,
              COUNT(*) AS total,
              SUM(CASE WHEN kind = 'language' THEN 1 ELSE 0 END) AS language,
              SUM(CASE WHEN kind = 'library'  THEN 1 ELSE 0 END) AS library
         FROM lang_topics
        GROUP BY lang
        ORDER BY lang`,
    )
    .all() as Array<{ lang: string; total: number; language: number; library: number }>
  return rows.map((r) => ({
    lang: r.lang,
    total: r.total,
    language: r.language,
    library: r.library,
  }))
}
