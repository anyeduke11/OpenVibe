// `packages/core/src/db/m9-p1b-readme.ts` —— M9 v1.6 **P1b.6 · 资源清单导出为 README.md**
// （`m9-dev-plan-2026-10.md` §6.3 的 P1b.6 ＋ `m9-dev-language-roadmap.md` §3.16 · **DL-32**）
//
// ## 它做什么
//
// 把 `lang_resources` 的 89 条资源导成一份 Markdown 清单：**只导链接与元数据，不导正文**。
//
// ⚠️ **为什么这份导出物比仓内任何东西都敏感**：它**会被推到公开仓库**（§3.16 的原话）。
//   ⇒ 三条纪律由 `verifyReadmeExport` 兜住：
//   ① **零本机路径**（FR-7.2 同款）—— 导出物里出现 `/Users/xxx` 就等于把 owner 的家目录公开。
//   ② **条数一致** —— 导出行数必须等于库里的行数（漏行与多行都要抓）。
//   ③ **每行可溯源** —— 每行带 `lang_resources.id`，半年后说得清「这份地图是哪一版导的」。
//
// ⚠️ **本文件的注释里不许出现 ASCII 撇号**（如 `owner\'s`）：仓级的排序守卫是**按文本抽 SQL 字面量**的，
//   注释里一个落单的撇号会被当成字符串开头 ⇒ 后面的配对整体错位 ⇒ 守卫会误报一条不存在的长 ORDER BY。
//
// ⚠️ **「零正文」不由本守卫判**：正文根本不在仓内（DL-02），拿教程正文片段当条件
//   本身就是违规（§3.2）。⇒ 这里只查**结构与链接**，不查内容（DL-32 第 ④ 点）。
import { writeFileSync } from 'node:fs'
import type { SqliteDatabase } from './index'

/** 导出所需的一行资源（**只取导出用到的列**，不整行读出来）。 */
export interface ResourceReadmeRow {
  id: number
  lang: string
  name: string
  url: string
  category: string
  level_label: string
  price: string
  lang_label: string
  is_fav: number
  star: string | null
  freshness: string
}

/** 分类 → 中文标签（导出物给人看，库里的值域不变）。 */
const CATEGORY_LABEL: Record<string, string> = {
  official: '官方文档',
  github: 'GitHub 仓库',
  course: '在线课程',
  book: '书籍',
  video: '视频课',
  practice: '实战练习',
}

/** Markdown 表格里的一格 —— **必须转义竖线与换行**，否则表格会散架。 */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * 导出 README 正文。
 *
 * ⚠️ **行序固定** —— 按 `id` 升序（`lang_resources.id` 是插入顺序）⇒ 两次导出逐字相同，
 *   便于 diff 与复核。
 */
export function exportResourcesReadme(rows: readonly ResourceReadmeRow[]): string {
  const lines: string[] = []
  lines.push('# M9 学习资源清单')
  lines.push('')
  lines.push(
    `> 导出自 owner 提供的《Python 与 Go 系统学习指南》资源清单，共 **${String(rows.length)}** 条。`,
  )
  lines.push('> **只导链接与元数据，不导正文**（§3.2 版权纪律）。')
  lines.push('> 每行开头的「编号」可回查本机 `lang_resources.id`。')
  lines.push('')
  lines.push('| 编号 | 语言 | 分类 | 名称 | 费用 | 阶段 | 语言标签 | 精选 | 星数 | 时效 | 链接 |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    lines.push(
      [
        '',
        String(r.id),
        cell(r.lang),
        cell(CATEGORY_LABEL[r.category] ?? r.category),
        cell(r.name),
        cell(r.price),
        cell(r.level_label),
        cell(r.lang_label),
        r.is_fav === 1 ? '★' : '',
        cell(r.star ?? ''),
        cell(r.freshness),
        cell(r.url),
        '',
      ].join('|'),
    )
  }
  lines.push('')
  return lines.join('\n')
}

/** 从库里读出导出行（**按 id 升序**）。 */
export function listReadmeRows(db: SqliteDatabase): ResourceReadmeRow[] {
  return db
    .prepare(
      `SELECT id, lang, name, url, category, level_label, price, lang_label, is_fav, star, freshness
       FROM lang_resources ORDER BY id ASC`,
    )
    .all() as ResourceReadmeRow[]
}

export type ReadmeViolationKind = 'absolute-path' | 'row-count-mismatch' | 'untraceable-row'

export interface ReadmeViolation {
  rule: ReadmeViolationKind
  detail: string
}

/** 必须出现的「本机路径」形状。 */
const ABSOLUTE_PATH_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: 'macOS/Linux 家目录', re: /\/Users\/[^\s|)】"'，,；;]+/ },
  { label: 'Linux 家目录', re: /\/home\/[^\s|)】"'，,；;]+/ },
  { label: 'Windows 家目录', re: /[A-Za-z]:\\Users\\[^\s|)】"'，,；;]+/ },
  { label: 'OpenVibe 数据目录', re: /\/[^\s|)】"'，,；;]*\.(?:openvibe|minimax)\/[^\s|)】"'，,；;]+/ },
]

/** 导出的数据行 —— 首格是数字编号（`lang_resources.id`）。 */
const DATA_ROW_RE = /^\|\s*(\d+)\s*\|/

/**
 * 守卫：导出物必须满足 DL-32 的三条纪律。
 *
 * ⚠️ **否定式判据必须自证** —— 这个守卫只在「导坏了」时说话，没坏时它是沉默的
 *   ⇒ 单测必须注入一条绝对路径证明它**真的会红**。
 *
 * @param expectedRowCount 库里 `lang_resources` 的行数（漏行与多行都要抓）。
 * @param homeDir 本机家目录（可选）—— 命中它也算本机路径。
 */
export function verifyReadmeExport(
  text: string,
  expected: { rowCount: number; homeDir?: string },
): ReadmeViolation[] {
  const out: ReadmeViolation[] = []
  for (const p of ABSOLUTE_PATH_PATTERNS) {
    const m = p.re.exec(text)
    if (m) {
      out.push({
        rule: 'absolute-path',
        detail: `导出物里出现本机路径（${p.label}）：${m[0]}`,
      })
    }
  }
  if (expected.homeDir && expected.homeDir.length > 1 && text.includes(expected.homeDir)) {
    out.push({
      rule: 'absolute-path',
      detail: `导出物里出现本机家目录：${expected.homeDir}`,
    })
  }

  const ids: number[] = []
  for (const line of text.split('\n')) {
    const m = DATA_ROW_RE.exec(line)
    if (m) ids.push(Number(m[1]))
  }
  if (ids.length !== expected.rowCount) {
    out.push({
      rule: 'row-count-mismatch',
      detail: `导出 ${String(ids.length)} 行，库里 ${String(expected.rowCount)} 行`,
    })
  }
  if (new Set(ids).size !== ids.length) {
    out.push({
      rule: 'untraceable-row',
      detail: '导出里有重复的编号 ⇒ 「编号可回查」失效',
    })
  }
  return out
}

/**
 * 导出并落盘。
 *
 * ⚠️ **守卫不过就不写** —— 一份带本机路径的清单落到磁盘上再被发现，与从未生成是同一种伤害。
 *
 * @param targetPath 目标文件路径（**调用方给**，本模块不猜目录）。
 */
export function writeResourcesReadme(
  db: SqliteDatabase,
  targetPath: string,
  opts: { homeDir?: string } = {},
): { path: string; rowCount: number; violations: ReadmeViolation[] } {
  const rows = listReadmeRows(db)
  const text = exportResourcesReadme(rows)
  const violations = verifyReadmeExport(text, { rowCount: rows.length, homeDir: opts.homeDir })
  if (violations.length > 0) {
    return { path: targetPath, rowCount: rows.length, violations }
  }
  writeFileSync(targetPath, text, 'utf8')
  return { path: targetPath, rowCount: rows.length, violations }
}
