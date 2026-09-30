import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, type ProjectPortsOut, type PortStatus } from '@openvibe/shared'
import { ProjectsRepo, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { assertScannableDir, listListeners, scanDeclaredServices } from '../lib/port-scan'

/**
 * 端口与服务（m7「端口与服务」卡）：GET /api/projects/:id/ports。
 * 只读事实层（仓库声明扫描 + 本机监听查询）在 lib/port-scan.ts；这里做合并与出参整形。
 * localPath 未登记/目录不存在时返回空台账不报错：端口卡对「没填路径」的项目也要能渲染。
 */

export interface PortRouteDeps {
  db: SqliteDatabase
  /** 监听查询注入点（测试挡掉真机命令）；生产缺省走 lsof/netstat */
  listListenersImpl?: typeof listListeners
}

const zPortParams = z.object({ id: z.string().min(1) })

export function registerPortRoutes(deps: PortRouteDeps): (app: FastifyInstance) => void {
  const queryListeners = deps.listListenersImpl ?? listListeners
  return (app) => {
    app.get('/api/projects/:id/ports', async (req) => {
      const { id } = parseOrThrow(zPortParams, (req as { params?: unknown }).params)
      const projects = new ProjectsRepo(deps.db)
      const project = projects.get(id)
      if (!project) throw new AppError('NOT_FOUND', `项目不存在: ${id}`)

      const out: ProjectPortsOut = {
        projectPath: project.localPath ?? '',
        scannedFiles: [],
        services: [],
        listeners: [],
      }

      const live = await queryListeners()
      out.listeners = live.listeners
      if (live.warning !== undefined) out.listenersWarning = live.warning

      if (typeof project.localPath !== 'string' || project.localPath === '') return out
      let root: string
      try {
        root = assertScannableDir(project.localPath)
      } catch (e) {
        // 目录没了/不可达：本机监听照报，声明侧置空并说明原因
        out.listenersWarning = (e as Error).message
        return out
      }

      const { declared, scannedFiles } = scanDeclaredServices(root)
      const byPort = new Map(live.listeners.map((l) => [l.port, l]))
      const services: PortStatus[] = declared.map((d) => {
        const listener = byPort.get(d.port)
        if (listener === undefined) return { ...d, state: 'idle' as const }
        return {
          ...d,
          state: 'listening' as const,
          process: listener.process,
          pid: listener.pid,
          url: `http://localhost:${String(d.port)}`,
        }
      })
      out.scannedFiles = scannedFiles
      out.services = services
      return out
    })
  }
}
