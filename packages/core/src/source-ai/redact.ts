/**
 * `packages/core/src/source-ai/redact.ts` —— **出网前的路径脱敏**（P5.2 · DL-18）
 * （`m9-dev-language-roadmap.md` §3.8 三条线第 2 条 / §7 DL-18）
 *
 * ## 它解决什么
 *
 * DL-18 的判据形态：「捕获发往 AI 的入参，断言**只含勾选过的片段**且**不含本机绝对路径**」。
 *
 * ⚠️ **只改路径字段是不够的** —— 片段正文里**也可能有绝对路径**：
 *   `log_path = "/Users/duke/proj/app.log"`、`open("/var/log/x")`、
 *   甚至注释里写的 `cd ~/proj`。
 * ⇒ 脱敏必须作用在**正文**上，否则「不含绝对路径」这条只挡住了路径字段，
 *   正文里的路径照样出网。
 *
 * ## ⚠️ 脱敏的两种结果
 *
 * | 形态 | 变成 | 为什么 |
 * |---|---|---|
 * | **项目内**的绝对路径 | **相对路径**（`src/app.py`） | 它本来就是项目内的文件 ⇒ 相对路径**不丢信息**、也不泄露本机结构 |
 * | **项目外**的绝对路径 | `<外部路径>` | 项目外的路径**没有任何用处** ⇒ 只留一个占位，不泄露目录结构 |
 *
 * ## ⚠️ 为什么不用「正则一刀切」
 *
 * 一刀切会把 `https://example.com/x` 里的 `/example.com` 也当成路径 ⇒ URL 被改坏。
 * ⇒ 本文件**分两步**：先把**项目根**整段替换掉（⇒ 项目内路径变成相对路径），
 *   再把**剩下的**绝对路径换成占位（⇒ 项目外路径不泄露）。
 *   第一步走完之后，剩下的绝对路径**不可能**是项目内的。
 */
import { homedir } from 'node:os'
import { sep } from 'node:path'

/** 项目外路径的占位（**不含任何本机信息**）。 */
export const EXTERNAL_PATH_PLACEHOLDER = '<外部路径>'

/** 项目根本身的占位（内容里出现项目根 ⇒ 换成它，不泄露目录结构）。 */
export const PROJECT_ROOT_PLACEHOLDER = '<项目根>'

/** POSIX 绝对路径（**不吞 URL**）：前面不能是词字符、`/`、`:`）。 */
const POSIX_ABS = /(?<![\w:/])\/(?:[A-Za-z0-9_.@~-]+\/)+[A-Za-z0-9_.@~-]*/gu

/** Windows 绝对路径（`C:\…` ＋ UNC `\\server\share`）。 */
const WINDOWS_ABS = /[A-Za-z]:\\[^\s'"<>|]+/gu

/** 转义正则元字符（项目根里可能有 `.` `-` 等）。 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * 把片段正文里的**本机绝对路径**脱敏掉。
 *
 * @param content 片段正文
 * @param projectRoot 项目根（**绝对路径**）
 * @returns 脱敏后的正文（项目内路径变相对、项目外路径变占位）
 */
export function redactAbsolutePaths(content: string, projectRoot: string): string {
  let out = content

  // ① 项目根 ⇒ 相对化（带斜杠的先替换，否则会剩下一个前导斜杠）
  const root = projectRoot.endsWith(sep) ? projectRoot.slice(0, -1) : projectRoot
  if (root !== '') {
    out = out.replace(new RegExp(`${escapeRe(root + sep)}`, 'gu'), '')
    out = out.replace(new RegExp(escapeRe(root), 'gu'), PROJECT_ROOT_PLACEHOLDER)
  }

  // ② 家目录 ⇒ 占位（⚠️ 家目录是绝对路径的一种，但它是**最常泄露**的那一种 ⇒ 单独点名）
  const home = homedir()
  if (home !== '' && home !== sep) {
    out = out.replace(new RegExp(`${escapeRe(home + sep)}`, 'gu'), `${EXTERNAL_PATH_PLACEHOLDER}/`)
    out = out.replace(new RegExp(escapeRe(home), 'gu'), EXTERNAL_PATH_PLACEHOLDER)
  }

  // ③ 剩下的绝对路径 ⇒ 占位（此时它们**不可能**是项目内的 —— ① 已经把项目内的清干净了）
  out = out.replace(POSIX_ABS, EXTERNAL_PATH_PLACEHOLDER)
  out = out.replace(WINDOWS_ABS, EXTERNAL_PATH_PLACEHOLDER)

  return out
}

/**
 * 文本里**还有没有**绝对路径（DL-18 的断言用）。
 *
 * ⚠️ 这是**给测试与自检用**的判定式 —— 界面不靠它（界面靠「送出去之前已经脱敏」这件事本身）。
 *
 * @param text 待查文本
 */
export function hasAbsolutePath(text: string): boolean {
  if (new RegExp(POSIX_ABS.source, 'u').test(text)) return true
  if (new RegExp(WINDOWS_ABS.source, 'u').test(text)) return true
  const home = homedir()
  if (home !== '' && text.includes(home)) return true
  return false
}
