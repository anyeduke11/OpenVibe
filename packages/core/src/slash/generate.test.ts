import { describe, expect, it } from 'vitest'
import { CLI_COMMANDS, slashCommandName, slashFilePath } from '@openvibe/shared'
import { fileSha256 } from '../pack/fingerprint'
import { generateSlashCommands } from './generate'

/**
 * N2 · Track N：slash 命令文件生成器测试。
 * 验收：确定性 / 覆盖 / 元数据一致性（不另写快照，从 CLI_COMMANDS 反查产物）。
 */

describe('generateSlashCommands（N2 slash 命令文件）', () => {
  it('覆盖完整集：产物数 = CLI_COMMANDS 长度，每条命令一个文件', () => {
    const files = generateSlashCommands()
    expect(files).toHaveLength(CLI_COMMANDS.length)

    const paths = files.map((f) => f.path)
    for (const cmd of CLI_COMMANDS) {
      expect(paths).toContain(slashFilePath(cmd.name))
    }
    // 无多余文件
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('确定性：同输入两次调用，产物字节级相同且按路径码点序', () => {
    const a = generateSlashCommands()
    const b = generateSlashCommands()
    expect(a.map((f) => f.path)).toEqual(b.map((f) => f.path))
    expect(a.map((f) => f.content)).toEqual(b.map((f) => f.content))
    expect(a.map((f) => f.sha256)).toEqual(b.map((f) => f.sha256))

    // 码点序（与 fingerprintOf 的排序口径一致）
    const paths = a.map((f) => f.path)
    expect(paths).toEqual([...paths].sort())
  })

  it('sha256 与内容自洽：fileSha256(content) === f.sha256', () => {
    for (const f of generateSlashCommands()) {
      expect(f.sha256).toBe(fileSha256(f.content))
    }
  })

  it('元数据一致性：每个命令文件的 cli/risk/writesDisk/标题/摘要/旗标与 CLI_COMMANDS 逐字段一致', () => {
    const files = generateSlashCommands()
    for (const cmd of CLI_COMMANDS) {
      const f = files.find((x) => x.path === slashFilePath(cmd.name))
      expect(f, `缺 ${cmd.name} 的 slash 命令文件`).toBeDefined()
      const content = f!.content

      // frontmatter
      expect(content).toContain(`cli: openvibe ${cmd.name}`)
      expect(content).toContain(`risk: ${cmd.risk}`)
      expect(content).toContain(`writesDisk: ${cmd.writesDisk}`)

      // 标题：slash 名 + CLI usage
      expect(content).toContain(`# ${slashCommandName(cmd.name)} · ${cmd.usage}`)

      // 摘要
      expect(content).toContain(cmd.summary)

      // 旗标：无旗标则无「## 参数」节；有旗标则逐条落盘
      if (cmd.flags.length > 0) {
        expect(content).toContain('## 参数')
        for (const flag of cmd.flags) {
          expect(content).toContain(`\`${flag.name}\``)
          expect(content).toContain(`\`${flag.value}\``)
        }
      } else {
        expect(content).not.toContain('## 参数')
      }

      // 示例与风险
      expect(content).toContain(`## 示例`)
      expect(content).toContain(`\`${slashCommandName(cmd.name)}\``)
      expect(content).toContain('## 风险')
    }
  })
})
