import { z } from 'zod'
import { CLI_COMMAND_RISKS } from '../cli-commands'

/**
 * V2 侧栏/设置页的两个只读聚合契约（DB-1 批）。
 * 都是「一次性取全」的读端点：前端不再为每个角标发一次请求。
 */

/**
 * 侧栏 API total（七项，M4 上线后加了 playbooks）。口径逐项登记，别让某一格与对应列表端点分叉：
 * - prompts / terms / playbooks / skills / flows / packs：对应表全量 COUNT(*)，与列表默认返回一致
 * - projects：只数非归档（`status != 'archived'`）。理由：`GET /api/projects` 默认就不返回归档
 *   （ProjectsRepo.list 的 includeArchived 默认 false，packages/core/src/repos/projects.ts:135-141），
 *   侧栏报一个列表里点不进去的数字比报错更糟。status 取值域见 migrations/0001_init.sql:92。
 */
export const NavCountsOut = z.object({
  prompts: z.number().int(),
  terms: z.number().int(),
  playbooks: z.number().int(),
  skills: z.number().int(),
  flows: z.number().int(),
  projects: z.number().int(),
  packs: z.number().int(),
})
export type NavCountsOut = z.infer<typeof NavCountsOut>

/** 命令旗标：布尔旗标 value 固定 CLI_FLAG_NO_VALUE，故此处不设 min 约束以外的形状要求 */
export const CliCommandFlagOut = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  summary: z.string(),
})
export type CliCommandFlagOut = z.infer<typeof CliCommandFlagOut>

export const CliCommandOut = z.object({
  name: z.string().min(1),
  usage: z.string().min(1),
  summary: z.string(),
  flags: z.array(CliCommandFlagOut),
  risk: z.enum(CLI_COMMAND_RISKS),
  writesDisk: z.boolean(),
})
export type CliCommandOut = z.infer<typeof CliCommandOut>

/** GET /api/cli/commands：整表一次给全（设置页「CLI 命令参考」表直接渲染，无分页） */
export const CliCommandsOut = z.object({
  items: z.array(CliCommandOut),
})
export type CliCommandsOut = z.infer<typeof CliCommandsOut>
