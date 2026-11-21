import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateSlashCommands } from '@openvibe/core'
import { CLI_COMMANDS, slashFilePath } from '@openvibe/shared'
import { commandsExportAction } from '../src/commands/commands'
import { cleanupTempDir, tempDir } from '@openvibe/core/test-support'

/**
 * N2 · Track N：`openvibe commands export` 端到端落盘测试。
 * 验收：导出目录内文件与生成器产物逐字节一致、落点路径正确、缺省目录解析正确。
 * 临时目录走统一出口 tempDir()（禁止直写 mkdtempSync，见 tests/temp-dir.test.ts）。
 */

describe('commands export（N2 slash 命令文件导出）', () => {
  it('导出到指定目录：落盘文件数与内容与生成器一致', async () => {
    const dir = tempDir('ov-cmd-')
    try {
      const outcome = await commandsExportAction({ dir })

      expect(outcome.dir).toBe(dir)
      expect(outcome.files).toHaveLength(CLI_COMMANDS.length)

      const expected = generateSlashCommands()
      for (const f of expected) {
        const abs = join(dir, f.path)
        expect(readFileSync(abs, 'utf8')).toBe(f.content)
      }
    } finally {
      cleanupTempDir(dir)
    }
  })

  it('缺省 dir 解析为当前工作目录下的 commands/', async () => {
    const raw = tempDir('ov-cmd-')
    const cwd = realpathSync(raw)
    const prev = process.cwd()
    try {
      process.chdir(cwd)
      const outcome = await commandsExportAction()

      expect(outcome.dir).toBe(join(cwd, 'commands'))
      // 任一命令文件已落盘且非空
      const first = CLI_COMMANDS[0]!
      const content = readFileSync(join(outcome.dir, slashFilePath(first.name)), 'utf8')
      expect(content.length).toBeGreaterThan(0)
    } finally {
      process.chdir(prev)
      cleanupTempDir(raw)
    }
  })
})
