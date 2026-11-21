/**
 * Slash 命令文件生成器（N2 · Track N 第二站）。
 *
 * 独立产物线：基于 CLI_COMMANDS（shared，CLI 真相源）渲染 slash 命令文件集，
 * 不进标准包 manifest、不经 adapter 产出，不触发 design §7/§8 A 级链。
 *
 * 渲染纯函数、确定性：同一 CLI_COMMANDS ⇒ 字节级相同产物，码点序输出。
 */

import {
  CLI_COMMANDS,
  type CliCommandMeta,
  renderFrontmatter,
  compareCodeUnit,
  slashCommandName,
  slashFilePath,
  type PlannedFileOut,
} from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'

/** 风险档的中文注解（闭集，勿扩；与 cli-commands.ts 的 risk 定义对应） */
const RISK_ANNOTATION: Record<CliCommandMeta['risk'], string> = {
  readonly: '只读：零磁盘写入',
  decision: '改状态需人拍板或显式启动',
  destructive: '删文件或不可逆覆盖本地树',
}

/** 渲染单个 slash 命令文件内容（确定性，空节整体省略） */
function renderSlashFile(cmd: CliCommandMeta): string {
  const slash = slashCommandName(cmd.name)
  const lines: string[] = []

  // frontmatter
  lines.push(
    renderFrontmatter({
      slash,
      cli: `openvibe ${cmd.name}`,
      risk: cmd.risk,
      writesDisk: String(cmd.writesDisk),
    }).trimEnd(),
  )
  lines.push('')

  // 标题：slash 名 + CLI usage
  lines.push(`# ${slash} · ${cmd.usage}`)
  lines.push('')

  // 摘要
  lines.push(cmd.summary)
  lines.push('')

  // 参数表（无旗标则整节省略）
  if (cmd.flags.length > 0) {
    lines.push('## 参数')
    lines.push('')
    lines.push('| 旗标 | 取值 | 说明 |')
    lines.push('| --- | --- | --- |')
    for (const f of cmd.flags) {
      lines.push(`| \`${f.name}\` | \`${f.value}\` | ${f.summary} |`)
    }
    lines.push('')
  }

  // 示例
  lines.push('## 示例')
  lines.push('')
  lines.push(`\`${slash}\``)
  lines.push('')

  // 风险
  lines.push('## 风险')
  lines.push('')
  lines.push(`- risk: **${cmd.risk}**（${RISK_ANNOTATION[cmd.risk]}）`)
  lines.push(`- writesDisk: **${cmd.writesDisk}**（写本机磁盘）`)
  lines.push('')

  return lines.join('\n')
}

/**
 * 生成全部 slash 命令文件（完整集，覆盖 CLI_COMMANDS 全部命令）。
 * 返回按路径码点序排序的 PlannedFileOut[]（确定性）。
 */
export function generateSlashCommands(): PlannedFileOut[] {
  return CLI_COMMANDS.map((cmd) => {
    const content = renderSlashFile(cmd)
    return {
      path: slashFilePath(cmd.name),
      content,
      sha256: fileSha256(content),
    }
  }).sort((a, b) => compareCodeUnit(a.path, b.path))
}
