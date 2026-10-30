import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppError } from '@openvibe/shared'
import { skillLibraryDir } from '@openvibe/core'
import { downloadSkillFiles, isSafeRelPath, type FetchLike } from './skill-remote'

/**
 * 把远程 skill 的文件**真正写到磁盘**（2026-10-30）。
 *
 * ⚠️ 与「远程导入」的分工：
 *  - 导入：**只建档**（算指纹、记溯源串），内容用完就丢 ⇒ 台账里 `skillDir` 恒空。
 *  - 下载：**落盘**，内容成为本机可用的目录 ⇒ 台账 `skillDir` 指向它。
 *
 * 落点缺省是 OpenVibe 的 skill 库目录（`~/.openvibe/skills/<name>/`）——
 * 与任何 agent 的目录无关，符合「skill 库独立于其他 agent」的裁定。
 */

export interface DownloadToDiskInput {
  /** 远程溯源串（`github:owner/repo@branch[:path]` / `skillhub:slug`） */
  remoteRef: string
  /** 落盘目录（绝对路径） */
  targetDir: string
  fetchImpl?: FetchLike
}

export interface DownloadToDiskResult {
  targetDir: string
  fileCount: number
  dirHash: string
  origin: string
  warnings: string[]
}

/**
 * 下载并落盘。
 *
 * ⚠️ **先写临时目录再改名**：直接往目标目录写，中途失败会留下半份内容 ——
 * 而半份 skill 比没有更坏（能扫到、但 SKILL.md 可能是残的）。
 * 写完后整体改名 ⇒ 目标目录要么是完整的旧版本，要么是完整的新版本。
 */
export async function downloadSkillToDisk(
  input: DownloadToDiskInput,
): Promise<DownloadToDiskResult> {
  const fetched = await downloadSkillFiles(input.remoteRef, input.fetchImpl)
  const staging = `${input.targetDir}.partial`
  rmIfExists(staging)
  mkdirSync(staging, { recursive: true })
  try {
    for (const f of fetched.files) {
      // 双保险：取数侧已拒过非法路径，这里再拒一次（落盘是最后一道闸）
      if (!isSafeRelPath(f.rel)) {
        throw new AppError('VALIDATION_ERROR', `远端文件路径非法: ${f.rel}`)
      }
      const dest = join(staging, f.rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, f.content, 'utf8')
    }
    rmIfExists(input.targetDir)
    mkdirSync(dirname(input.targetDir), { recursive: true })
    renameSync(staging, input.targetDir)
  } catch (e) {
    rmIfExists(staging)
    throw e
  }
  return {
    targetDir: input.targetDir,
    fileCount: fetched.fileCount,
    dirHash: fetched.dirHash,
    origin: fetched.origin,
    warnings: fetched.warnings,
  }
}

/** 库的默认落点：`~/.openvibe/skills/<name>/` */
export function defaultLibraryTarget(name: string): string {
  return skillLibraryDir(name)
}

function rmIfExists(path: string): void {
  rmSync(path, { recursive: true, force: true })
}
