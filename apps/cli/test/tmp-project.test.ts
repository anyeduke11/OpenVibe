import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanupTempProject, makeTempProject, writeProjectFile } from './helpers/tmp-project'

// CLI-EXAMPLE-01 · CLI 层示例：临时项目目录夹具（dev-plan T1 三层配置之 cli-project helper）。
it('CLI-EXAMPLE-01: 临时项目夹具可创建/写入/清理', async () => {
  const dir = await makeTempProject()
  const abs = await writeProjectFile(dir, '.openvibe/pack.lock.json', '{}')

  expect(await readFile(abs, 'utf8')).toBe('{}')
  expect(join(dir, '.openvibe')).toBeTruthy()

  await cleanupTempProject(dir)
  // 二次清理幂等（force: true）
  await cleanupTempProject(dir)
})
