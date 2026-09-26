// docs/devlog-evidence/DEV-0035/empty-window-probe.mjs —— ⑯ 的根因机理实证：`wx` 的 open 与写内容之间，
// 0 字节的锁文件对**并发读者可见**（真实窗口只有微秒级；这里把它撑到 250ms，只为把「能读到空文件」
// 从推断变成观测——撑开窗口不改变「谁能在什么时候读到什么」这一条语义，改的只是可观测性）。
//
// 用法：node docs/devlog-evidence/DEV-0035/empty-window-probe.mjs
// 判读：seen.empty 必须 > 0 才算「窗口对读者可见」被证到；实测 2026-09-26 两次跑分别 19,962 / 18,363 次，
// 同期 full 计数 3 万余次，partial 恒为 0（一次 write 落完整内容，所以不存在半截 JSON 那种中间态）。
// 只读仓库：沙箱在 /tmp/ov-emptywin-*，不写仓库任何文件。
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, openSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'ov-emptywin-'))
const lock = join(dir, 'sync.lock')

const reader = spawn(
  process.execPath,
  [
    '-e',
    `const{readFileSync,statSync}=require('fs');const p=process.argv[1];const t0=Date.now();
const seen={empty:0,partial:0,full:0,missing:0,err:0};
while(Date.now()-t0<600){
  try{statSync(p);const t=readFileSync(p,'utf8');
    if(t==='')seen.empty++;else if(!t.endsWith('\\n'))seen.partial++;else seen.full++;
  }catch(e){ if(e.code==='ENOENT')seen.missing++;else seen.err++; }
}
process.stdout.write(JSON.stringify(seen));`,
    lock,
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)
let out = ''
reader.stdout.on('data', (c) => {
  out += c.toString()
})

const fd = openSync(lock, 'wx')
await new Promise((r) => setTimeout(r, 250))
writeSync(fd, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), command: 'probe' })}\n`)
closeSync(fd)
await new Promise((r) => reader.once('close', r))
console.log(`读者 600ms 轮询结果：${out}`)
rmSync(dir, { recursive: true, force: true })
