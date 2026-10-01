// 0 字节空窗下两种等待策略的对照探针（DEV-0081 计划外抓到的一笔间歇红的凭据）
//
// 背景：`apps/cli/test/clean.test.ts` 的 `waitLocked` 原写法是「轮询 existsSync → 读一次 → JSON.parse」。
// 全量并发跑时 CLI-CLEAN-08 红过一次（SyntaxError: Unexpected end of JSON input，单跑 30/30 绿）。
// 产品侧 acquire 用 `writeFileSync(path, json, { flag: 'wx' })`，O_EXCL 的 open 与写内容之间锁文件以
// 0 字节可见（`packages/core/src/inject/sync-lock.ts` 的 `SYNC_LOCK_REREAD_LIMIT` 段已实测过同一窗口）。
//
// 本探针把那个微秒级窗口撑到 250ms（与 [DEV-0034] 的 emptywindow 探针同法），让两条策略的差别变成
// 确定性可观察，而不是「重跑 25 次碰运气」：
//   旧策略 = 必红（读到 '' 后 JSON.parse 抛）
//   新策略 = 必绿（轮询到读得出内容为止，再 parse）
//
// 跑法：node docs/devlog-evidence/DEV-0081/empty-window-wait.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WINDOW_MS = 250

/** 起一个持锁进程：open('wx') 后故意拖 WINDOW_MS 才写内容（复刻 O_EXCL 空窗） */
function holder(lockPath) {
  const child = spawn(
    process.execPath,
    [
      '-e',
      `const fs=require('fs');const p=process.argv[1];const fd=fs.openSync(p,'wx');` +
        `setTimeout(()=>{fs.writeSync(fd,JSON.stringify({pid:4242,command:'sync-holder'})+'\\n');fs.closeSync(fd)}, ${String(WINDOW_MS)})`,
      lockPath,
    ],
    { stdio: 'ignore' }
  )
  return child
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 旧策略：只等文件存在，然后读一次并 parse */
async function oldStrategy(lockAbs) {
  for (let i = 0; i < 100 && !existsSync(lockAbs); i += 1) await sleep(50)
  const content = readFileSync(lockAbs, 'utf8')
  return JSON.parse(content) // '' 时抛 SyntaxError —— 这就是那笔间歇红的形状
}

/** 新策略：等「读得出内容」，再 parse */
async function newStrategy(lockAbs) {
  let content = ''
  for (let i = 0; i < 100; i += 1) {
    if (existsSync(lockAbs)) content = readFileSync(lockAbs, 'utf8')
    if (content !== '') break
    await sleep(50)
  }
  if (content === '') throw new Error('夹具未在 5s 内写出锁内容')
  return JSON.parse(content)
}

async function trial(name, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ov-emptywindow-'))
  const lockAbs = join(dir, 'sync.lock')
  const child = holder(lockAbs)
  let outcome
  try {
    const held = await fn(lockAbs)
    outcome = `绿（拿到归属 pid=${String(held.pid)} command=${held.command}）`
  } catch (e) {
    outcome = `红（${e instanceof Error ? e.constructor.name : '未知'}: ${String(e).slice(0, 60)}）`
  } finally {
    child.kill()
  }
  console.log(`${name}: ${outcome}`)
  return outcome
}

console.log(`# 空窗 ${String(WINDOW_MS)}ms · 两种等待策略各跑 3 次`)
for (let i = 1; i <= 3; i += 1) {
  const o = await trial(`旧策略 run${String(i)}`, oldStrategy)
  const n = await trial(`新策略 run${String(i)}`, newStrategy)
  if (i === 3) {
    console.log(`\n判定：旧策略应三次全红、新策略应三次全绿；实测 旧=${o} 新=${n}`)
  }
}
