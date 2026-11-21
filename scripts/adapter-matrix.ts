/**
 * 兼容矩阵生成/校验（adapter-fixtures.md FR-3；生成物住 docs/ 非 specs/——队列 ㊺ 待裁② 结论 (a)）。
 * 生成范围只有 COMPAT_MATRIX 的 7 行兼容平台；design §8 六行专用表**不生成**（待裁③ = 不做）。
 * FR-3.3 校验形态 = 生成 → 与磁盘 cmp → 不则红并打印 diff，**绝不自动写文件**（校验不修复，
 * 与 bundle:check / seed:check 同形制）。
 * 运行：pnpm adapters:matrix:update（生成）｜ pnpm adapters:matrix:check（校验）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPAT_MATRIX } from '@openvibe/adapters'

const TARGET = join(process.cwd(), 'docs', 'adapter-matrix.md')

export function renderAdapterMatrix(): string {
  const lines = [
    '<!-- GENERATED FROM packages/adapters/src/compat.ts — DO NOT EDIT',
    '     手改会被 `pnpm adapters:matrix:check` 判红；重生成：`pnpm adapters:matrix:update`。',
    '     生成范围 = COMPAT_MATRIX 的兼容平台行（adapter-fixtures.md FR-3.1）；',
    '     design §8 的六行专用 adapter 表是手写单源，不在此复制（队列 ㊺ 待裁③ = 不做）。 -->',
    '',
    '# 兼容矩阵 · COMPAT_MATRIX 生成视图',
    '',
    '| platform | reads | note |',
    '| --- | --- | --- |',
    ...COMPAT_MATRIX.map((row) => `| ${row.platform} | ${row.reads} | ${row.note ?? ''} |`),
    '',
  ]
  return lines.join('\n')
}

const mode = process.argv[2] ?? 'check'
const rendered = renderAdapterMatrix()

if (mode === 'update') {
  writeFileSync(TARGET, rendered, 'utf8')
  console.log(`adapter-matrix → ${TARGET}（${COMPAT_MATRIX.length} 行兼容平台）`)
} else if (mode === 'check') {
  let onDisk: string
  try {
    onDisk = readFileSync(TARGET, 'utf8')
  } catch {
    console.error(`⛔ ${TARGET} 不存在——先跑 pnpm adapters:matrix:update 生成`)
    process.exit(1)
  }
  if (onDisk !== rendered) {
    console.error(
      '⛔ adapter-matrix.md 与 COMPAT_MATRIX 漂移（校验不修复）。重生成：pnpm adapters:matrix:update',
    )
    console.error('--- 磁盘 ---')
    console.error(onDisk)
    console.error('--- 现产 ---')
    console.error(rendered)
    process.exit(1)
  }
  console.log(`adapter-matrix:check ✓ 与 COMPAT_MATRIX 同源（${COMPAT_MATRIX.length} 行）`)
} else {
  console.error(`未知模式 ${mode}（可用：update | check）`)
  process.exit(1)
}
