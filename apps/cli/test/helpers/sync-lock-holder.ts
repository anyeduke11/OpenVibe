// apps/cli/test/helpers/sync-lock-holder.ts —— T8e 并发夹具：另一个进程占住 sync 锁。
//
// 为什么必须是独立进程：锁的两个成立条件都归内核管（O_EXCL 由文件系统保证原子、
// 崩溃后 pid 判死），在同一进程里伪造 pid 或注入 isAlive 只能证明我们自己写的分支，
// 证明不了「真有两个进程在抢」。
//
// 用法：node --import tsx sync-lock-holder.ts <projectPath> [holdMs]
// stdout 首行：`HELD <pid> <lockPath>` 或 `BUSY <reason> <holderPid|-1>`（退出码 3）
// 存活：给了 holdMs 就到点释放退出；没给则挂住 stdin，由父进程 end() 决定何时收工。
import { tryAcquireSyncLock } from '@openvibe/core'

const [projectPath, holdArg] = process.argv.slice(2)
if (projectPath === undefined || projectPath === '') {
  process.stderr.write('usage: sync-lock-holder.ts <projectPath> [holdMs]\n')
  process.exit(2)
}
const holdMs = holdArg === undefined ? null : Number(holdArg)
if (holdMs !== null && !Number.isFinite(holdMs)) {
  process.stderr.write(`holdMs 不是数字：${holdArg}\n`)
  process.exit(2)
}

const acq = tryAcquireSyncLock(projectPath, 'sync-holder')
if (!acq.acquired) {
  process.stdout.write(`BUSY ${acq.reason} ${String(acq.holder?.pid ?? -1)}\n`)
  process.exit(3)
}
process.stdout.write(`HELD ${String(process.pid)} ${acq.path}\n`)

const done = (): void => {
  acq.release()
  process.exit(0)
}
process.on('SIGTERM', done)
process.on('SIGINT', done)

// stdin 是父进程握着的绳子：它 end() 我们就收工，不 end 就一直占着锁。
// 60s 兜底是给 CI 的——用例中途失败漏下的孤儿进程，不该把锁带进下一次运行。
process.stdin.resume()
process.stdin.on('end', done)
if (holdMs !== null) setTimeout(done, holdMs)
setTimeout(done, 60_000)
