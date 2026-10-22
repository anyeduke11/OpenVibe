#!/usr/bin/env tsx
/**
 * `scripts/scan-m9-source.ts` —— **M9 v1.6 P4 的扫描命令行入口**
 * （`m9-dev-language-roadmap.md` §3.8 / §3.10 · dev-plan §6.10 P4.1）
 *
 * ## 它做什么
 *
 * 扫一个目录，按「知识点 ↔ 代码模式」登记表找出命中，**打印结果**。
 *
 * ```bash
 * npx tsx scripts/scan-m9-source.ts <目录> [--json] [--project=<id>]
 * ```
 *
 * ## ⚠️ 它**只读**，不写库
 *
 * 落库由服务端做（`POST /api/lang/scan`）⇒ 这个脚本是**自查工具**：
 * 「我的项目里到底命中了哪些模式」随时可以自己跑一遍。
 * ⚠️ 因此它**不碰数据库**，也**不发起任何网络请求**。
 *
 * ## ⚠️ 输出里的路径**一律相对**扫描根（FR-7.2 / DL-23）
 *
 * 即使用户把绝对路径当参数传进来，输出里也**不会**出现它。
 */
import { resolve } from 'node:path'
import { scanProjectSource } from '../packages/core/src/source-scan/scan'

const args = process.argv.slice(2)
const json = args.includes('--json')
const projectArg = args.find((a) => a.startsWith('--project='))
const dirArg = args.find((a) => !a.startsWith('--'))

if (dirArg === undefined) {
  process.stderr.write('用法：npx tsx scripts/scan-m9-source.ts <目录> [--json] [--project=<id>]\n')
  process.exit(2)
}

const root = resolve(dirArg)
const result = await scanProjectSource({
  projectId: projectArg?.slice('--project='.length) ?? 'cli',
  root,
})

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  const lines: string[] = []
  lines.push(`扫描目录：${root}`)
  for (const info of result.languages) {
    const mode = info.mode ?? '未扫描'
    const tool = info.toolchain ?? '—'
    lines.push(
      `  · ${info.lang}：模式=${mode} · 工具链=${tool} · 文件 ${String(info.file_count)} 个 · 命中 ${String(info.hit_count)} 条`,
    )
    if (info.notice !== null) lines.push(`    ⚠️ ${info.notice}`)
  }
  for (const w of result.warnings) lines.push(`  ⚠️ ${w}`)
  lines.push(`命中合计：${String(result.findings.length)} 条`)
  for (const f of result.findings) {
    lines.push(
      `  ${f.confidence === 'confirmed' ? '已确认' : '可能  '}  ${f.file_rel_path}:${String(f.line)}:${String(f.col)}  ${f.topic_slug}  «${f.matched_pattern}»`,
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
