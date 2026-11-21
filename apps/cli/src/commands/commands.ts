import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { generateSlashCommands } from '@openvibe/core'
import { SLASH_DIR } from '@openvibe/shared'

/**
 * `openvibe commands export [dir]`（N2 · Track N 第二站）：
 * 把 slash 命令文件集导出到指定目录（独立产物线，纯本地，不经服务端）。
 *
 * 产物落点为 `<dir>/commands/ov-<command>.md`，与标准包 manifest / adapter 无耦合，
 * 不触发 design §7/§8 A 级链。用户可把导出的 `commands/ov-*.md` 按需放入
 * 所用助手的 commands 目录（如 `.claude/commands/`、`.codebuddy/commands/`）。
 */

export class CommandsError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'CommandsError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface CommandsExportOptions {
  /** 输出根目录（缺省为当前目录下的 commands/） */
  dir?: string
}

export interface CommandsExportOutcome {
  /** 实际输出根目录（绝对路径） */
  dir: string
  /** 已写入的文件相对路径清单（码点序） */
  files: string[]
}

/**
 * 导出 slash 命令文件集。
 *
 * @param opts.dir 输出根目录；缺省解析为当前工作目录下的 `commands/`。
 * @returns 落盘的文件相对路径清单（码点序，确定性）。
 */
export async function commandsExportAction(
  opts: CommandsExportOptions = {},
): Promise<CommandsExportOutcome> {
  const outDir = resolve(opts.dir ?? SLASH_DIR)

  const files = generateSlashCommands()

  try {
    mkdirSync(outDir, { recursive: true })
    for (const f of files) {
      // f.path 为 `commands/ov-<command>.md`，落点为 `<outDir>/commands/ov-<command>.md`
      const abs = join(outDir, f.path)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, f.content, 'utf8')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CommandsError('export_failed', `slash 命令文件导出失败：${message}`, {
      outDir,
    })
  }

  return { dir: outDir, files: files.map((f) => f.path) }
}
