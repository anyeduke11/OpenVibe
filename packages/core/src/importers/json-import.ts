import { AppError, PromptExportFile } from '@openvibe/shared'
import type { PromptImportItem } from '@openvibe/shared'

/** FR-7.1 导出文件回导（schemaVersion=1 + items）；非法 JSON / 形状错误 → 整批拒绝（m1 §6.5） */
export function parsePromptJsonExport(text: string): PromptImportItem[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new AppError(
      'VALIDATION_ERROR',
      `JSON 解析失败：${(error as Error).message}（m1 §6.5 整批拒绝）`,
    )
  }
  const parsed = PromptExportFile.safeParse(data)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new AppError(
      'VALIDATION_ERROR',
      `导出文件非法：${first ? `${first.path.join('.')} ${first.message}` : 'schemaVersion/items 校验失败'}`,
      {
        fieldErrors: parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`),
      },
    )
  }
  return parsed.data.items
}
