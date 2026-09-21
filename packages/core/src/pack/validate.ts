import {
  AppError,
  LIMITS,
  compareCodeUnit,
  isValidPackRelativePath,
  utf8ByteLength,
} from '@openvibe/shared'

/**
 * 契约校验（design §7.7）：路径违规 → 整包拒绝；规模超限 → 警告不阻断（m6a §6.4，
 * 注入侧另有同类防线，m6b §6.3/§6.7）。
 */
export function validatePackFiles(files: readonly { path: string; content: string }[]): string[] {
  if (files.length > LIMITS.packFileCountMax) {
    throw new AppError(
      'VALIDATION_ERROR',
      `文件数 ${files.length} 超过上限 ${LIMITS.packFileCountMax}（design §7.7）`,
      { fileCount: files.length },
    )
  }
  const invalidPaths = files
    .filter((f) => !isValidPackRelativePath(f.path))
    .map((f) => f.path)
    .sort(compareCodeUnit)
  if (invalidPaths.length > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${invalidPaths.length} 个文件路径非法，整包拒绝（design §7.7）`,
      { invalidPaths },
    )
  }

  const warnings: string[] = []
  let total = 0
  for (const file of files) {
    const size = utf8ByteLength(file.content)
    total += size
    if (size > LIMITS.singleFileMaxBytes) {
      warnings.push(`文件 ${file.path} 为 ${size}B，超过单文件上限 ${LIMITS.singleFileMaxBytes}B`)
    }
  }
  if (total > LIMITS.packTotalMaxBytes) {
    warnings.push(`包内容合计 ${total}B，超过总量上限 ${LIMITS.packTotalMaxBytes}B`)
  }
  return warnings
}
