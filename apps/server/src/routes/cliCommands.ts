import type { FastifyInstance } from 'fastify'
import { CLI_COMMANDS, type CliCommandsOut } from '@openvibe/shared'

/**
 * CLI 命令参考（V2 批 · `GET /api/cli/commands`）：设置页的「CLI 命令参考」表与
 * 未来 CLI 实验室的命令目录读同一份元数据。
 *
 * 元数据落 shared（packages/shared/src/cli-commands.ts）而不是 apps/cli：
 * server 侧由 eslint R4 禁止 import apps/cli（eslint.config.js:127），而 shared 是 CLI 与
 * server 共同的下游，两边都够得着。apps/cli 侧本轮不改注册表，命令名漂移由
 * apps/server/test/cli-commands.api.test.ts 从 apps/cli/src/index.ts 解析比对。
 *
 * 纯静态常量 ⇒ 无依赖注入点、无 DB 访问。
 */
export function registerCliCommandRoutes(app: FastifyInstance): void {
  app.get('/api/cli/commands', async (): Promise<CliCommandsOut> => ({ items: [...CLI_COMMANDS] }))
}
