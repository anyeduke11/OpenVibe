import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * CLI 集成测试夹具：创建一次性临时「目标项目」目录（dev-plan T1 cli-project helper）。
 * T7 的 sync/diff/scan 测试在此基础上注入文件并做全树哈希断言。
 */
export async function makeTempProject(prefix = 'openvibe-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

/** 在临时项目内写入相对路径文件（自动建父目录），返回绝对路径 */
export async function writeProjectFile(
  projectDir: string,
  relPath: string,
  content: string,
): Promise<string> {
  const abs = join(projectDir, relPath)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, content, 'utf8')
  return abs
}

/** 测试收尾清理（幂等） */
export async function cleanupTempProject(projectDir: string): Promise<void> {
  await rm(projectDir, { recursive: true, force: true })
}
