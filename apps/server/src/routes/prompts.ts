import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  PromptCreateInput,
  PromptImportItem,
  PromptQuery,
  PromptUpdateInput,
  SCHEMA_VERSION,
  type PromptOut,
} from '@openvibe/shared'
import { parseImportFiles, PromptsRepo, type ImportFile, type SqliteDatabase } from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'

export interface PromptRouteDeps {
  db: SqliteDatabase
}

/** m1 §6.3 / DEV-0013 C-6：引用包名 = standard_packs.selection.promptIds 扫描（包已物化内容快照，删除仅提示） */
function referencedPackNames(db: SqliteDatabase, promptId: string): string[] {
  const rows = db.prepare('SELECT name, selection FROM standard_packs').all() as {
    name: string
    selection: string
  }[]
  const names: string[] = []
  for (const row of rows) {
    try {
      const sel = JSON.parse(row.selection) as { promptIds?: unknown }
      if (Array.isArray(sel.promptIds) && sel.promptIds.includes(promptId)) names.push(row.name)
    } catch {
      // selection 损坏的包不参与引用判定
    }
  }
  return names.sort()
}

const importFileSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
})

/** DEV-0013 C-5：md 导出为单文件拼接（浏览器无法流式收多文件），条目间以受管注释分隔；文件内零时间戳 */
export function renderPromptsMarkdown(items: PromptOut[]): string {
  const blocks = items.map((p) =>
    [
      '---',
      `title: ${JSON.stringify(p.title)}`,
      `description: ${JSON.stringify(p.description)}`,
      `useAs: ${JSON.stringify(p.useAs)}`,
      `status: ${JSON.stringify(p.status)}`,
      `folderPath: ${JSON.stringify(p.folderPath)}`,
      `tags: ${JSON.stringify(p.tags)}`,
      `platformMarks: ${JSON.stringify(p.platformMarks)}`,
      `variables: ${JSON.stringify(p.variables)}`,
      '---',
      '',
      p.content,
    ].join('\n'),
  )
  return blocks.join('\n\n<!-- openvibe:prompt-item -->\n\n') + '\n'
}

/** dev-plan §3.1 八端点（import/export 计入第九、十条通道） */
export function registerPromptRoutes(app: FastifyInstance, deps: PromptRouteDeps): void {
  const prompts = new PromptsRepo(deps.db)

  app.get('/api/prompts', async (req) => {
    const query = parseOrThrow(PromptQuery, req.query)
    return prompts.list(query)
  })

  app.post('/api/prompts', async (req, reply) => {
    const input = parseOrThrow(PromptCreateInput, req.body)
    const { prompt, warnings } = prompts.create(input)
    return reply.code(201).send({ ...prompt, warnings })
  })

  // 静态段先于 :id 匹配（find-my-way 优先级），导出通道独立
  app.get('/api/prompts/export', async (req, reply) => {
    const raw = req.query as Record<string, unknown>
    const format = typeof raw['format'] === 'string' ? (raw['format'] as string) : 'json'
    if (format !== 'json' && format !== 'md') {
      throw new AppError('VALIDATION_ERROR', `format 仅支持 json|md，收到 ${format}`)
    }
    const query = parseOrThrow(PromptQuery, req.query)
    const items = prompts.exportAll({
      tag: query.tag,
      folder: query.folder,
      platform: query.platform,
      status: query.status,
      q: query.q,
    })
    if (format === 'md') {
      reply
        .header('content-type', 'text/markdown; charset=utf-8')
        .header('content-disposition', 'attachment; filename="prompts-export.md"')
      return renderPromptsMarkdown(items)
    }
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', 'attachment; filename="prompts-export.json"')
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      items,
    })
  })

  app.get('/api/prompts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const prompt = prompts.get(id)
    if (!prompt) throw new AppError('NOT_FOUND', `提示词不存在: ${id}`)
    return prompt
  })

  app.patch('/api/prompts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(PromptUpdateInput, req.body)
    return prompts.update(id, patch)
  })

  app.delete('/api/prompts/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const names = referencedPackNames(deps.db, id)
    if (names.length > 0) reply.header('x-referenced-packs', names.join(','))
    prompts.delete(id)
    return reply.code(204).send()
  })

  app.get('/api/prompts/:id/versions', async (req) => {
    const { id } = req.params as { id: string }
    if (!prompts.get(id)) throw new AppError('NOT_FOUND', `提示词不存在: ${id}`)
    return prompts.versions(id)
  })

  app.post('/api/prompts/:id/versions/:no/restore', async (req) => {
    const { id, no: noRaw } = req.params as { id: string; no: string }
    if (!prompts.get(id)) throw new AppError('NOT_FOUND', `提示词不存在: ${id}`)
    const versionNo = Number(noRaw)
    if (!Number.isInteger(versionNo) || versionNo < 1) {
      throw new AppError('VALIDATION_ERROR', `版本号需为正整数，收到 ${noRaw}`)
    }
    return prompts.restore(id, versionNo)
  })

  // DEV-0013 C-9：JSON body 双形态（files 经 importers 归一 / items 直给），不引入 multipart
  app.post('/api/prompts/import', async (req) => {
    const body = req.body as { items?: unknown; files?: unknown } | null
    if (Array.isArray(body?.files)) {
      const files = parseOrThrow(z.array(importFileSchema).min(1), body.files)
      const items = parseImportFiles(files as ImportFile[])
      return prompts.importBatch(items)
    }
    if (Array.isArray(body?.items)) {
      const items = parseOrThrow(z.array(PromptImportItem).min(1), body.items)
      return prompts.importBatch(items)
    }
    throw new AppError(
      'VALIDATION_ERROR',
      'body 需为 {files:[{filename,content}]} 或 {items:[...]}',
    )
  })
}
