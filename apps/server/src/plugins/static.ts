import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/**
 * design §4 步骤 7：托管 apps/web 构建产物（m6b D-1：产物缺失时降级为「仅 API + 提示」，不报错退出）。
 * wildcard:false 让插件在注册期按文件枚举路由（/、/assets/*），未命中的前端路由才落到 404，
 * 由 plugins/errors.ts 的唯一 notFoundHandler 决定回退 index.html 还是 JSON 404。
 */

export const SPA_INDEX = 'index.html'

export function hasWebBuild(root: string): boolean {
  return existsSync(join(root, SPA_INDEX))
}

export interface WebStatus {
  served: boolean
  root: string | null
  warnings: string[]
}

export const NO_WEB: WebStatus = { served: false, root: null, warnings: [] }

export async function setupStatic(app: FastifyInstance, root: string): Promise<WebStatus> {
  if (!hasWebBuild(root)) {
    return {
      served: false,
      root,
      warnings: [
        `未找到 Web 产物（${root}），本次仅提供 API；请先执行 pnpm --filter @openvibe/web build`,
      ],
    }
  }
  await app.register(fastifyStatic, { root, wildcard: false })
  return { served: true, root, warnings: [] }
}
