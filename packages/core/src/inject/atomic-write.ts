// packages/core/src/inject/atomic-write —— 落盘时的「只动这一个目录项」保证（m6b §6.11）。
// 为什么需要它：`checkWritePath` 抓符号链接靠 realpath 归一与 `lstat.isSymbolicLink()`，而**硬链接不是
// 链接文件**——realpath 原样返回、lstat 看着就是普通文件，三道闸一律放行。此时 `writeFileSync` 打开的是
// 那个 inode 本身，写进去的内容会出现在项目外的另一个文件里（注入声称「只动项目内」，实际动了外面）。
// NTFS 建硬链接（`mklink /H`）不需要任何特权，所以这条正是三平台硬要求下最现实的穿透形状。
import { chmodSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs'

export interface ReplaceLinkWrite {
  /** 目标原本挂着额外链接；本次按「解链后新建」写，链接另一侧的文件一字未动 */
  brokeLink: boolean
}

/**
 * 写文件，且保证副作用只落在 `absPath` 这一个目录项上。
 *
 * 目标原本挂着额外链接（硬链接，或调用方绕过了逃逸闸的符号链接）时先 `unlink` 再新建——
 * 与 `cp --remove-destination` 同义。**不拒绝、不报错**：项目是 `cp -al` / 物化快照来的
 * （pnpm store 本身就是硬链接）属正常场景，那种用户不该被挡在注入之外。
 * 代价是目标的 inode 换了：持有旧句柄的进程看不到新内容，git 与常规编辑器都不受影响。
 */
export function writeReplacingLinks(
  absPath: string,
  content: string,
  mode = 0o644,
): ReplaceLinkWrite {
  let brokeLink = false
  try {
    const st = lstatSync(absPath)
    if (st.isSymbolicLink() || (st.isFile() && st.nlink > 1)) {
      unlinkSync(absPath)
      brokeLink = true
    }
  } catch {
    // 目标不存在（NEW 文件）：没有链可解，也没有可穿透的东西
  }
  // mode 只在创建时生效，已存在的目标要补一次 chmod——与替换写之前的行为一致
  writeFileSync(absPath, content, { mode })
  chmodSync(absPath, mode)
  return { brokeLink }
}
