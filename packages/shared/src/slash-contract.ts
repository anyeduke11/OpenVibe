/**
 * Slash 命令文件契约（N2 · Track N 第二站）。
 *
 * 独立产物线：slash 命令文件不进标准包 manifest、不经 adapter 产出，
 * 与主规则文件（CLAUDE.md 等）并列但互不耦合，不触发 design §7/§8 A 级链。
 *
 * 本文件只放常量与纯命名函数（与 pack-contract.ts 同风格），
 * 渲染逻辑在 core/slash/generate.ts。
 */

/** slash 命令文件落点目录（独立产物根，非标准包内） */
export const SLASH_DIR = 'commands'

/** slash 命令名前缀（避免与平台原生命令冲突） */
export const SLASH_PREFIX = 'ov-'

/** slash 命令文件后缀 */
export const SLASH_FILE_SUFFIX = '.md'

/**
 * 生成 slash 命令名：`/ov-<command>`。
 * 例：`sync` ⇒ `/ov-sync`
 */
export function slashCommandName(command: string): string {
  return `/${SLASH_PREFIX}${command}`
}

/**
 * 生成 slash 命令文件相对路径：`commands/ov-<command>.md`。
 * 例：`sync` ⇒ `commands/ov-sync.md`
 */
export function slashFilePath(command: string): string {
  return `${SLASH_DIR}/${SLASH_PREFIX}${command}${SLASH_FILE_SUFFIX}`
}
