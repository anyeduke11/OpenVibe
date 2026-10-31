import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { ReportDataSource, ReportEndpointDeclaration } from '@openvibe/shared'

/**
 * **端点的数据来源声明**（2026-10-31）。
 *
 * ## 它解决什么
 *
 * 「哪些只读端点的结论取决于磁盘」这件事，此前只有两处人工书写：
 * shared 里的清单，与前端 hook 里的取数方式。两处独立书写 ⇒ 必然漂移，
 * 而漂移的方向必然是「闸越来越松」（新增磁盘态端点而忘了登记 ⇒ 闸完全看不见）。
 *
 * ⇒ 改为**在路由注册处声明**：每个只读端点用 `reportRoute(...)` 登记自己的来源，
 *   路由注册处成为**唯一**的书写处；清单由快照脚本从这里导出。
 *
 * ## 为什么用 Fastify 的 `config` 而不是自建注册表
 *
 * Fastify 的 route `config` 本来就是给调用方放自定义元数据的地方，
 * 且 `onRoute` 钩子能拿到它 ⇒ 采集是**框架原生**的，不需要另建一张表，
 * 也不会与实际注册的路由脱节（脱节的可能只有「声明了但没注册」，
 * 而那正是快照比对要抓的）。
 *
 * ## 为什么只读端点（GET）才要声明
 *
 * 写端点的结论不依赖「读到的旧快照」⇒ 没有缓存问题。
 * 只给 GET 加声明 ⇒ 声明量与需要声明的量相等，不多不少。
 */

/** 挂在 Fastify route config 上的键（框架不解释它，由本仓自己读） */
export const ROUTE_SOURCE_CONFIG_KEY = 'openvibeReportSource'

/** 挂在 Fastify route config 上的「理由」键 */
export const ROUTE_REASON_CONFIG_KEY = 'openvibeReportReason'

/** 采集到的端点自述（`onRoute` 钩子的产物） */
export interface CollectedRouteSource extends ReportEndpointDeclaration {
  method: string
}

/** `reportRoute` 的返回类型（Fastify 的 route config 子集） */
export interface ReportRouteConfig {
  config: {
    [ROUTE_SOURCE_CONFIG_KEY]: ReportDataSource
    /** 声明时写的路径（用于采集；Fastify 自己的 url 也带，但参数占位写法可能不同） */
    reportPath: string
    [ROUTE_REASON_CONFIG_KEY]?: string
  }
}

/**
 * 声明一个只读端点的数据来源。
 *
 * ## 重载的作用：**编译期**强制磁盘态必须给理由
 *
 * 磁盘态（`filesystem` / `mixed`）的声明**必须**带第三参 `reason`，
 * 少了它 TypeScript 直接编译不过；`db` 可以省略。
 *
 * ⚠️ **为什么放在类型层而不是只靠测试**：判据测试是**提交时**才跑的，
 *   而编译错误是**写代码那一刻**就摆在眼前的 ⇒ 开发者写 `reportRoute(p, 'filesystem')`
 *   时立刻看到「缺 reason」，而不是等提交被拒。
 *
 * @param path 端点路径（必须与注册的路径**逐字相同**，含参数占位）
 * @param source 数据来源
 * @param reason 「这个结论为什么会随磁盘变化」的一句话说明（磁盘态必填）
 *
 * ⚠️ **路径必须逐字相同**：本函数不校验（校验要等到快照比对那一步），
 *   写错时的表现是「快照比对判红」而不是运行时炸掉 —— 后者会让人以为
 *   服务端坏了，而真相只是少了一处声明。
 */
export function reportRoute(path: string, source: 'db', reason?: string): ReportRouteConfig
export function reportRoute(
  path: string,
  source: 'filesystem' | 'mixed',
  reason: string,
): ReportRouteConfig
export function reportRoute(
  path: string,
  source: ReportDataSource,
  reason?: string,
): ReportRouteConfig {
  return {
    config: {
      [ROUTE_SOURCE_CONFIG_KEY]: source,
      reportPath: path,
      ...(reason === undefined ? {} : { [ROUTE_REASON_CONFIG_KEY]: reason }),
    },
  }
}

/**
 * 在 app 上装采集钩子：**必须早于任何路由注册**。
 *
 * ⚠️ Fastify 的 `onRoute` 是**同步**钩子且在路由注册时触发 ⇒
 *   装得太晚（路由已注册）就采集不到 ⇒ 快照会缺条目 ⇒ 判红。
 *   故 `buildApp` 必须在注册任何路由**之前**调用它。
 */
export function collectRouteSources(app: FastifyInstance): CollectedRouteSource[] {
  const collected: CollectedRouteSource[] = []
  app.addHook('onRoute', (routeOptions) => {
    const config = routeOptions.config as
      | {
          [ROUTE_SOURCE_CONFIG_KEY]?: ReportDataSource
          [ROUTE_REASON_CONFIG_KEY]?: string
          reportPath?: string
        }
      | undefined
    const source = config?.[ROUTE_SOURCE_CONFIG_KEY]
    if (source === undefined) return
    // ⚠️ **Fastify 给每个 GET 自动注册一条 HEAD 路由** ⇒ 同一个端点会触发两次
    //   `onRoute`（method 分别是 GET 与 HEAD）⇒ 只取 GET，否则清单里每个端点重复一遍。
    const method = Array.isArray(routeOptions.method)
      ? routeOptions.method.join(',')
      : routeOptions.method
    if (method !== 'GET') return
    const reason = config?.[ROUTE_REASON_CONFIG_KEY]
    collected.push({
      method,
      path: config?.reportPath ?? routeOptions.url,
      source,
      // ⚠️ **空理由当作没有理由**（`''` / 纯空格都不算数）⇒ 判据测试能抓到
      ...(reason !== undefined && reason.trim() !== '' ? { reason } : {}),
    })
  })
  return collected
}

/** Fastify 插件选项（用于把来源声明透传给子插件） */
export type RouteSourcePluginOptions = FastifyPluginOptions & {
  /** 该插件内端点的默认数据来源 */
  reportSource?: ReportDataSource
}
