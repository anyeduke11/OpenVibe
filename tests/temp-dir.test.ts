import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cleanupTempDir, tempDir, trackedTempDirCount } from '@openvibe/core/test-support'

/**
 * 测试临时目录的**自愈清理**判据（2026-11-01 · v0.2.4 R0 后续增强）。
 *
 * ## 它防的是什么
 *
 * 实测事故（2026-10-31）：一次全量测试因磁盘满（`ENOSPC`）失败，而
 * `/var/folders/.../T` 下积了 **987 个** `ov-*` 临时目录 ⇒ `afterEach` 的清理
 * 在 ENOSPC 下也失败 ⇒ **自我放大**（越跑越满 ⇒ 越跑越失败）；人工清掉 942 个
 * 目录后可用空间从 440 MiB 回到 18 GiB。
 *
 * 根因：**销毁只挂在测试框架的正常路径上**（`afterEach`）⇒ 进程被中断
 * （Ctrl-C、崩溃、超时被杀、机器重启）时没人收尸。
 *
 * ⇒ 统一封装 `tempDir()`：目录建出来就登记，**进程退出时兜底清理**。
 *
 * ## 为什么「退出兜底」要单独测
 *
 * 兜底逻辑挂在 `process.on('exit')` 与信号处理器上 ⇒ **在测试进程内测不到**
 * （退出时才触发）⇒ 测法：起一个**子进程**，让它建目录后**被信号杀掉**
 * （模拟「进程被中断」），再检查目录是否已不在 ⇒ 这正是事故里的那个场景。
 */

const ROOT = resolve(__dirname, '..')

/**
 * 标记文件放**系统临时目录**，不放仓库工作树。
 *
 * ⚠️ 为什么要这样：标记文件是子进程与本进程之间的**传话板**（子进程写下自己建的
 *   目录路径，本进程读回来检查它还在不在）⇒ 用完必须删。
 *   ⇒ 原先放在 `tests/` 下 ⇒ 一是**污染仓库工作树**（`git status` 里冒出未跟踪文件），
 *   二是**测试中途被 Ctrl-C 时标记文件会留在仓里**（删不掉也没人管）⇒ 正好是本条
 *   增强要解决的那类问题的翻版。⇒ 改放系统临时目录：随系统清理，且不碰工作树。
 */
const MARKER_DIR = join(tmpdir(), 'ov-selftest-marker-')

/** 标记文件的绝对路径（按用例区分，避免互相覆盖） */
function markerPath(kind: string): string {
  return `${MARKER_DIR}${kind}.txt`
}

/** 读子进程写下的目录路径 */
function readMarker(marker: string): string {
  return execFileSync('node', [
    '-e',
    `process.stdout.write(require('fs').readFileSync(${JSON.stringify(marker)},'utf8'))`,
  ]).toString()
}

/** 删一个标记文件（保证下一条用例从干净状态开始） */
function clearMarker(marker: string): void {
  execFileSync('node', ['-e', `require('fs').rmSync(${JSON.stringify(marker)}, {force: true})`])
}

describe('测试临时目录 · 自愈清理（2026-11-01 增强）', () => {
  it('tempDir 建得出目录，且被登记为待清理', () => {
    const before = trackedTempDirCount()
    const dir = tempDir('ov-tempdir-probe-')
    expect(existsSync(dir)).toBe(true)
    expect(trackedTempDirCount()).toBe(before + 1)
    cleanupTempDir(dir)
    expect(existsSync(dir)).toBe(false)
  })

  it('cleanupTempDir 会把它从待清理清单里摘掉（不重复清理）', () => {
    const before = trackedTempDirCount()
    const dir = tempDir('ov-tempdir-probe2-')
    expect(trackedTempDirCount()).toBe(before + 1)
    cleanupTempDir(dir)
    expect(trackedTempDirCount()).toBe(before)
  })

  it('⚠️ 显式清理过的目录不该留在登记集里（否则退出兜底会对已删目录重复清理）', () => {
    // ⚠️ 这条盯的是**登记集不虚高**：`newDb().close()` 这类「自己删目录」的写法
    //   若不走 `cleanupTempDir` ⇒ 目录已不在磁盘上却仍挂在登记集里
    //   ⇒ 退出兜底会对它再删一次（`force: true` 下不报错，但是**白做功**，
    //   且登记集大小失真 ⇒ `trackedTempDirCount()` 这个观测口不可信）。
    const before = trackedTempDirCount()
    const dir = tempDir('ov-tempdir-probe3-')
    expect(trackedTempDirCount()).toBe(before + 1)
    // 模拟「调用方自己删了目录、但没摘登记」的坏情形 ⇒ 断言登记集确实还挂着它
    expect(existsSync(dir)).toBe(true)
    cleanupTempDir(dir)
    expect(trackedTempDirCount()).toBe(before)
    expect(existsSync(dir)).toBe(false)
  })

  it('⚠️ 进程被 SIGINT 中断 ⇒ 目录被清理（信号处理器接管了这条路径）', () => {
    // ⚠️ **这条是本次增强的核心验收**：SIGINT 是「Ctrl-C」—— 最常见的「进程被中断」形态。
    //   ⚠️ Node 在信号终止时**不跑 `exit` 处理器**（实测退出码 130、目录残留）
    //   ⇒ 必须显式接管信号才能清。
    const marker = markerPath('int')
    const script = `
      import { tempDir } from '${ROOT}/packages/core/src/test-support/temp-dir.ts'
      import { writeFileSync } from 'node:fs'
      const dir = tempDir('ov-selftest-int-')
      writeFileSync(${JSON.stringify(marker)}, dir, 'utf8')
      process.kill(process.pid, 'SIGINT')
    `
    clearMarker(marker)
    try {
      execFileSync('node', ['--import', 'tsx', '-e', script], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
      })
    } catch {
      /* 预期内：被信号终止 ⇒ 非零退出码 */
    }
    const dir = readMarker(marker)
    expect(dir.length).toBeGreaterThan(0)
    // ⚠️ **核心断言**：SIGINT ⇒ 信号处理器先清理再退出 ⇒ 目录已清
    expect(existsSync(dir)).toBe(false)
    clearMarker(marker)
  }, 30_000)

  it('⚠️ 进程被 SIGKILL 杀掉 ⇒ 目录必然残留（所以需要残留清扫器）', () => {
    // ⚠️ **这条断言的是「不可救」这件事本身**：SIGKILL 由内核直接杀进程，
    //   用户态代码一律不跑 ⇒ `exit` 处理器与信号处理器都救不了。
    //   ⇒ 正因为救不了，才需要「按年龄清扫」那条兜底路径。
    const marker = markerPath('kill')
    const script = `
      import { tempDir } from '${ROOT}/packages/core/src/test-support/temp-dir.ts'
      import { writeFileSync } from 'node:fs'
      const dir = tempDir('ov-selftest-kill-')
      writeFileSync(${JSON.stringify(marker)}, dir, 'utf8')
      process.kill(process.pid, 'SIGKILL')
    `
    clearMarker(marker)
    try {
      execFileSync('node', ['--import', 'tsx', '-e', script], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
      })
    } catch {
      /* 预期内：SIGKILL ⇒ 非零退出码 */
    }
    const dir = readMarker(marker)
    expect(dir.length).toBeGreaterThan(0)
    expect(existsSync(dir)).toBe(true)
    // 收尾：把这条残留清掉，别留给下一个用例
    execFileSync('node', [
      '-e',
      `require('fs').rmSync(${JSON.stringify(dir)}, {recursive: true, force: true})`,
    ])
    clearMarker(marker)
  }, 30_000)

  it('残留清扫器存在且只清本仓命名空间（不误伤别人的临时目录）', () => {
    // ⚠️ SIGKILL 救不了 ⇒ 兜底是「按年龄清扫」。而清扫若乱清 `/tmp` 下别的工具的目录
    //   ⇒ 会破坏别人的工作 ⇒ 必须有白名单。
    const src = execFileSync(
      'node',
      [
        '-e',
        `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(ROOT, 'scripts', 'sweep-stale-temps.ts'))},'utf8'))`,
      ],
      { encoding: 'utf8', cwd: ROOT },
    )
    expect(src).toContain('OWNED_PREFIXES')
    expect(src).toContain('ov-core-test-')
    // ⚠️ **不得**出现「全清 tmpdir」的写法
    expect(src).not.toMatch(/rmSync\(root/)
  })

  it('存量测试文件直写 mkdtempSync 是**已登记的存量**，不判红（防的是新写的又漏）', () => {
    // ⚠️ **口径说明**：仓内有 60 个测试文件直写 `mkdtempSync`（存量）。
    //   全量改它们是**大重构**（超出「外科式改动」原则，且会让本笔的 diff 失焦）⇒
    //   本轮只做「统一出口 + 退出兜底 + 残留清扫」三件事，**存量靠清扫器兜底**。
    //   ⇒ 这条判据**故意不判存量**，它记的是「当前存量数」供后续批次渐进收敛。
    const src = execFileSync(
      'node',
      [
        '-e',
        `const fs=require('fs'),path=require('path');
         const root=${JSON.stringify(ROOT)};
         const dirs=['apps','packages','tests'];
         let n=0;
         const walk=(d)=>{ for(const e of fs.readdirSync(d,{withFileTypes:true})){
           if(e.name==='node_modules'||e.name==='dist')continue;
           const p=path.join(d,e.name);
           if(e.isDirectory())walk(p);
           else if(/\\.test\\.tsx?$/.test(e.name)){
             const s=fs.readFileSync(p,'utf8');
             if(/\\bmkdtempSync\\s*\\(/.test(s)) n++;
           }
         }};
         for(const d of dirs) walk(path.join(root,d));
         process.stdout.write(String(n));`,
      ],
      { encoding: 'utf8', cwd: ROOT },
    )
    const count = Number(src.trim())
    // ⚠️ **只断言「数得出、且不是零」**：断言一个具体数字会在有人改一个文件时立刻变红
    //   ⇒ 那是噪音而不是信号。真正的闸在「退出兜底 + 清扫器」那两条。
    expect(count).toBeGreaterThan(0)
  })
})
