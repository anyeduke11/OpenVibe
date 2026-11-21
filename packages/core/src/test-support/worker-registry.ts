/**
 * packages/core/src/test-support/worker-registry.ts
 * —— **跨平台**的「本仓 worker 登记处」（2026-11-02；2026-11-03 改存储布局）。
 *
 * ## 它解决什么
 *
 * `scripts/check-orphan-workers.ts` 要判断「这个孤儿 worker 是不是本仓的」，
 * 依据是**工作目录**（cwd）—— 命令行不行：`node (vitest 1)` 这个标题
 * 在**任何项目**里都一样（vitest 改过 `process.title`）。
 *
 * ⚠️ **原方案依赖 `lsof`**（macOS/Linux 通用，但**非 POSIX 标准**）⇒
 *   Windows 上没有 ⇒ 取不到 cwd ⇒ 只能报「无法判定」。
 *   ⇒ 本模块给出**跨平台**的第二条路：**worker 自己在启动时登记 cwd**。
 *
 * ## 原理
 *
 * vitest 的 `setupFiles` 在**每个 worker 启动时**执行 ⇒ 那里能拿到
 * `process.pid` 与 `process.cwd()` ⇒ 写进一个**登记目录**（每条登记一个文件）。
 * ⇒ 闸门侧只需读这个目录 ⇒ **不依赖任何系统工具** ⇒ Windows / macOS / Linux 同款。
 *
 * ## 为什么是「目录」而不是「一个文件」（2026-11-03 修并发竞态）
 *
 * ⚠️ **原先是一个 JSON Lines 文件**：登记**追加**（多进程并发）、回收**读-改-写**
 *   （读全量 → 过滤 → 写临时文件 → `rename` 覆盖）⇒ **两者撞上就会丢行**：
 *   回收读完 → 另一个 worker 追加了一行 → 回收 `rename` 覆盖 ⇒
 *   **刚追加的那一行消失** ⇒ 那个 worker 的 cwd 再也查不到
 *   ⇒ 体检只能报「无法判定」（Windows 上连 `lsof` 回落都没有）。
 *
 * ⇒ 现在**每条登记一个文件**：
 *   - **登记** = 新建一个**文件名唯一**的文件（`tmp` 写完再 `rename` ⇒ 原子发布）
 *     ⇒ 只动自己那个文件 ⇒ 与别人的写入**零交集**；
 *   - **回收** = **只删自己枚举到的那些文件** ⇒ 删不到「枚举之后才新建的」文件
 *     ⇒ 并发登记**不会被误删**。
 *   ⇒ 竞态**从结构上消失**，而不是靠锁去绕（锁本身还会带来「持有者被杀 ⇒ 锁卡死」
 *     这一类新问题）。
 *
 * ⚠️ **文件名的排序即时间序**：`<pid>-<毫秒时间戳>-<随机后缀>.json`
 *   ⇒ 同一 pid 的多条登记，**文件名最大者最新** ⇒ 「取最后一条」有了确定口径
 *   （旧口径是「文件里的最后一行」，现在没有「行」了）。
 *
 * ## 为什么登记目录要放在临时目录而不是仓里
 *
 * - 放仓里 ⇒ 每次跑测试都在工作树里留文件 ⇒ **污染 `git status`**（本轮踩过）；
 * - 放临时目录 ⇒ 随系统清理，不碰工作树。
 *
 * ## 登记目录的生命周期
 *
 * - **每次登记一个文件**（多 worker ⇒ 多文件）；
 * - worker 正常退出时**不删自己那个文件**（删它要跨进程写文件，代价高且易竞态）；
 * - ⇒ 登记目录**不会自己变小** ⇒ 由 `pruneRegistry()` 回收：
 *   **按 pid 去重（只留最新那条）+ 剔除已死的 pid + 剔除超龄行 + 清坏文件**；
 *   回收有**两处**触发：体检进程收尾（每次体检都做）＋ worker 启动时
 *   （`maybePruneRegistry()`，**24 小时限频**，让没装体检脚本的机器也能清）；
 * - 目录路径由 `OV_WORKER_REGISTRY` 环境变量指定 ⇒ 测试侧与闸门侧约定同一个位置。
 *
 * ⚠️ **登记不是「事实」而是「线索」**：worker 可能压根没加载 setup 文件
 * （比如 setupFiles 配错）⇒ 闸门读不到 ⇒ 那就回落到 `lsof` 通道。
 */
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** 登记目录的**默认路径**（环境变量未设时用这个）。 */
export const WORKER_REGISTRY_ENV = 'OV_WORKER_REGISTRY'

/** 登记目录的默认位置（系统临时目录 ⇒ 不碰工作树）。 */
export function defaultRegistryDir(): string {
  return join(tmpdir(), 'ov-worker-registry')
}

/** 登记目录在哪（环境变量优先）。 */
export function registryDir(): string {
  const fromEnv = process.env[WORKER_REGISTRY_ENV]
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : defaultRegistryDir()
}

/** 登记文件里的**一条记录**。 */
export interface WorkerRecord {
  /** 进程 pid */
  pid: number
  /** 工作目录 */
  cwd: string
  /** 登记时刻（ISO 字符串） */
  at: string
}

/** 回收完成后写在目录里的**限频标记**文件名。 */
const PRUNE_MARKER = '.pruned-at'

/** 写一半的登记文件（`tmp` 前缀 ⇒ 不会被当成正式登记）。 */
const TMP_PREFIX = '.tmp-'

/**
 * 写了一半的登记文件**多久算残留**（毫秒）。
 *
 * ⚠️ 取 60 秒的依据：写-发布（`tmp` → `rename`）只要几毫秒 ⇒ 超过 60 秒还在
 *   ⇒ 一定是持有它的进程被中途杀了 ⇒ 可以清。
 *   ⚠️ 不能「见到就清」：清掉别人**正在写**的 `tmp` 文件 ⇒ 它的 `rename` 会失败
 *   ⇒ 那条登记就丢了 ⇒ 正是本模块要消灭的那类丢行。
 */
const TMP_STALE_MS = 60_000

/**
 * 登记文件名的**时间戳部分**（毫秒）——文件名里带它 ⇒ 文件名排序即时间序。
 */
function epochOf(record: WorkerRecord): number {
  const at = Date.parse(record.at)
  return Number.isFinite(at) ? at : 0
}

/**
 * 登记文件名：`<pid>-<毫秒时间戳>-<随机后缀>.json`。
 *
 * ⚠️ **随机后缀是必需的**：同一 pid 在同一毫秒里可能登记两次
 *   （比如 worker 复用 pid）⇒ 文件名必须唯一，否则后一次会覆盖前一次
 *   ⇒ 「取最后一条」就变成了「取到其中一条」，口径失真。
 * ⚠️ **时间戳部分定长补零** ⇒ 字符串比较 == 数值比较（否则 `9` 会排在 `10` 后面）。
 */
export function recordFileName(record: WorkerRecord): string {
  const epoch = String(epochOf(record)).padStart(13, '0')
  return `${String(record.pid)}-${epoch}-${randomUUID().slice(0, 8)}.json`
}

/**
 * 写一条登记（**原子发布**）。
 *
 * ⚠️ **先写 `tmp` 再 `rename`**：直接写正式文件名 ⇒ 并发读者可能读到**半截 JSON**
 *   ⇒ 那条登记会被当成坏文件清掉 ⇒ 又是一次丢行。
 *   `rename` 是原子的 ⇒ 正式文件名出现时，内容必然是完整的。
 *
 * @param dir 登记目录
 * @param record 要登记的记录
 * @returns 登记文件的路径；写失败 ⇒ null（不抛错）
 */
export function writeRegistryRecord(dir: string, record: WorkerRecord): string | null {
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `${TMP_PREFIX}${randomUUID()}`)
    const target = join(dir, recordFileName(record))
    writeFileSync(tmp, `${JSON.stringify(record)}\n`, 'utf8')
    renameSync(tmp, target)
    return target
  } catch {
    return null
  }
}

/**
 * 把当前进程登记进登记目录。
 *
 * ⚠️ **不抛错**：登记是**辅助线索**，登记失败不该让测试失败
 *   （磁盘满、权限问题都可能发生 ⇒ 那时测试本身更重要）。
 *
 * @returns 登记是否成功
 */
export function registerSelf(): boolean {
  const record: WorkerRecord = {
    pid: process.pid,
    cwd: process.cwd(),
    at: new Date().toISOString(),
  }
  return writeRegistryRecord(registryDir(), record) !== null
}

/** 登记目录里的一个文件（内容可能解析不出来）。 */
interface RegistryEntry {
  /** 文件名（内含时间戳 ⇒ 排序即时间序） */
  name: string
  /** 解析出来的记录；解析不出来 ⇒ null（坏文件） */
  record: WorkerRecord | null
  /** 文件的修改时刻（毫秒）——`at` 不可解析时用它定序 */
  mtimeMs: number
}

/**
 * 读单个登记文件。
 *
 * ⚠️ **坏文件返回 null 而不是抛错**：登记是「只增不减」的目录，
 *   一个文件坏掉不该让整个读取失败。
 */
function readEntry(dir: string, name: string): RegistryEntry {
  const path = join(dir, name)
  let text: string
  let mtimeMs = 0
  try {
    text = readFileSync(path, 'utf8')
    mtimeMs = statSync(path).mtimeMs
  } catch {
    return { name, record: null, mtimeMs }
  }
  try {
    const parsed = JSON.parse(text) as Partial<WorkerRecord>
    if (typeof parsed.pid === 'number' && typeof parsed.cwd === 'string') {
      return {
        name,
        mtimeMs,
        record: {
          pid: parsed.pid,
          cwd: parsed.cwd,
          at: typeof parsed.at === 'string' ? parsed.at : '',
        },
      }
    }
    return { name, record: null, mtimeMs }
  } catch {
    return { name, record: null, mtimeMs }
  }
}

/**
 * 两条登记里哪条**更新**。
 *
 * ⚠️ **三段定序**：登记时刻（`at` 解析出来的毫秒）→ 文件修改时刻 → 文件名。
 *   ⚠️ 为什么要三段：文件名里已含登记时刻 ⇒ 正常情况下第一段就能定序；
 *     但 `at` 解析不出来时（坏数据）只能退回文件 mtime ⇒ 再退用文件名
 *     ⇒ **任何情况下定序都是确定的**（不会靠随机后缀掷骰子）。
 */
function isNewer(candidate: RegistryEntry, current: RegistryEntry): boolean {
  const a = candidate.record === null ? 0 : epochOf(candidate.record)
  const b = current.record === null ? 0 : epochOf(current.record)
  if (a !== b) return a > b
  if (candidate.mtimeMs !== current.mtimeMs) return candidate.mtimeMs > current.mtimeMs
  return candidate.name > current.name
}

/**
 * 列出登记目录里的**正式登记文件**（不含 `tmp` 中间文件）。
 *
 * ⚠️ **`tmp` 文件不在正式列表里**：它们是别的进程**正在写**的
 *   ⇒ 回收绝不能碰它们（碰了 ⇒ 那条登记就丢了）。
 */
function listEntries(dir: string): RegistryEntry[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const entries: RegistryEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith(TMP_PREFIX)) continue
    entries.push(readEntry(dir, name))
  }
  return entries
}

/**
 * 读登记目录里的**全部记录**（同一 pid 可能有多条）。
 *
 * ⚠️ **坏文件跳过、不整体失败**：与闸门侧同口径 —— 一个文件坏掉不该让整个目录作废。
 * ⚠️ **文件不存在 ⇒ 返回空数组**（不是抛错）：还没跑过测试时这是正常状态。
 */
export function readRegistryRecords(dir: string = registryDir()): WorkerRecord[] {
  const records: WorkerRecord[] = []
  for (const entry of listEntries(dir)) {
    if (entry.record !== null) records.push(entry.record)
  }
  return records
}

/**
 * 查某个 pid 的 cwd（**跨平台主通道**）。
 *
 * ⚠️ **同一 pid 取最新那条**（worker 会复用 pid ⇒ 最新的才对）：
 *   定序口径见 `isNewer()`（登记时刻 → 文件 mtime → 文件名）。
 * ⚠️ 目录不存在 ⇒ 返回 null（还没登记过）。
 */
export function readRegisteredCwd(pid: number, dir: string = registryDir()): string | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const prefix = `${String(pid)}-`
  let best: RegistryEntry | null = null
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.json') || name.startsWith(TMP_PREFIX)) continue
    const entry = readEntry(dir, name)
    if (entry.record === null || entry.record.pid !== pid) continue
    if (best === null || isNewer(entry, best)) best = entry
  }
  return best?.record?.cwd ?? null
}

/**
 * 这个 pid 还活着吗？
 *
 * ⚠️ **`pid <= 0` 必须先拦掉**：`process.kill(0, 0)` 在 POSIX 上是
 *   「**向进程组发信号**」⇒ 会被误判成「活着」甚至真的发信号。
 * ⚠️ **`EPERM` 视为存活**：说明进程存在、只是无权发信号 ⇒ 不能当成「已死」
 *   而把仍在跑的登记行删掉。
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** `pruneRegistry()` 的结果。 */
export interface PruneResult {
  /** 回收前的**登记条数**（含坏文件） */
  before: number
  /** 回收后的**登记条数**（只有有效且存活的记录） */
  after: number
  /** 减少的条数（死 pid + 重复 pid + 坏文件 + 超龄行） */
  removed: number
}

/**
 * 登记行的**最大年龄**（毫秒）：超过它就算过期，无论 pid 是否还活着。
 *
 * ⚠️ 取 7 天的依据：一轮全量测试 + 收尾体检在半天内跑完 ⇒ 7 天足够覆盖
 *   「跨周末还没跑测试」的正常间隔，又不会让目录无限长。
 * ⚠️ **为什么要按年龄再清一遍**：pid 会被**复用** ⇒ 一个还活着的 pid
 *   （早已不是当初那个 worker）会让那条登记永远留着 ⇒ 只按存活判定清不干净。
 */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 「限频回收」的最小间隔（毫秒）：同一台机器上，两次自动回收至少隔这么久。
 *
 * ⚠️ 取 24 小时的依据：回收要**枚举 + 逐个删** ⇒ 每轮测试都做一遍纯属浪费
 *   ⇒ 一天清一次足够。
 */
export const DEFAULT_PRUNE_THROTTLE_MS = 24 * 60 * 60 * 1000

/** 回收的可选项。 */
export interface PruneOptions {
  /** 超过这个年龄（毫秒）的登记行也清掉（默认 7 天） */
  maxAgeMs?: number
  /** 当前时刻（毫秒时间戳）；判据测试可注入固定值，避免「今天写、明天就过期」 */
  now?: number
}

/**
 * 这条登记是不是**过期**（登记时刻距今超过上限）。
 *
 * ⚠️ **`at` 解析不出来 ⇒ 不算过期**（保留，仍受存活判定约束）。
 *   理由同 preflight 的 swap 口径：「**查不到 ≠ 不合法**」
 *   （把「取不到时刻」当成「一定很旧」⇒ 会误删正在跑的 worker 的登记）。
 */
export function isExpiredRecord(
  record: WorkerRecord,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  now: number = Date.now(),
): boolean {
  const at = Date.parse(record.at)
  if (Number.isNaN(at)) return false
  return now - at > maxAgeMs
}

/**
 * 回收登记目录：**按 pid 去重（同一 pid 只留最新那条）+ 剔除已死 pid + 剔除超龄行
 * + 清掉坏文件与写了一半的残留**。
 *
 * ⚠️ **只删「自己枚举到」的文件** ⇒ 枚举之后才新建的登记**不会被误删**
 *   ⇒ 并发登记与回收**不再互相丢行**（这是 2026-11-03 修掉的竞态）。
 * ⚠️ **坏文件要清**：坏文件占着目录里的位置 ⇒ 只按「有效记录」算的话它永远留着。
 * ⚠️ **写了一半的 `tmp` 文件只在「超过 60 秒还���着」时才清**：
 *   正在写的那份不能碰（碰了 ⇒ 那条登记就丢了）。
 *
 * @param dir 登记目录（默认走 `registryDir()`）
 * @param isAlive 存活判定（默认 `isPidAlive`；判据测试可注入假实现）
 * @param options 年龄上限与「当前时刻」（判据测试可注入）
 */
export function pruneRegistry(
  dir: string = registryDir(),
  isAlive: (pid: number) => boolean = isPidAlive,
  options: PruneOptions = {},
): PruneResult {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options.now ?? Date.now()
  const entries = listEntries(dir)
  const before = entries.length

  // 写了一半的残留：超过 60 秒还留着 ⇒ 持有者被杀了 ⇒ 清掉
  // ⚠️ **必须在「没有正式登记」这个提前返回之前做**：
  //   目录里只剩 tmp 残留时（正式登记都被清了）照样要清它 ⇒ 否则残留会永远留着。
  for (const name of listTmpFiles(dir)) {
    try {
      if (now - statSync(join(dir, name)).mtimeMs > TMP_STALE_MS) unlinkSync(join(dir, name))
    } catch {
      // 取不到 mtime / 已被删 ⇒ 不动它
    }
  }

  if (before === 0) return { before: 0, after: 0, removed: 0 }

  // 同一 pid 只留**最新那条**（定序口径见 `isNewer()`）
  const newestByPid = new Map<number, RegistryEntry>()
  for (const entry of entries) {
    if (entry.record === null) continue
    const current = newestByPid.get(entry.record.pid)
    if (current === undefined || isNewer(entry, current)) {
      newestByPid.set(entry.record.pid, entry)
    }
  }

  const keep = new Set<string>()
  for (const entry of entries) {
    const record = entry.record
    if (record === null) continue // 坏文件 ⇒ 删
    if (newestByPid.get(record.pid)?.name !== entry.name) continue // 同 pid 的旧记录 ⇒ 删
    if (!isAlive(record.pid)) continue // 已死 ⇒ 删
    if (isExpiredRecord(record, maxAgeMs, now)) continue // 超龄 ⇒ 删
    keep.add(entry.name)
  }

  let removed = 0
  for (const entry of entries) {
    if (keep.has(entry.name)) continue
    try {
      unlinkSync(join(dir, entry.name))
      removed++
    } catch {
      // 已被别人删掉（另一个回收进程）⇒ 照样算「已清掉」
      removed++
    }
  }

  return { before, after: keep.size, removed }
}

/** 登记目录里「写了一半」的中间文件名单。 */
function listTmpFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.startsWith(TMP_PREFIX))
  } catch {
    return []
  }
}

/** `maybePruneRegistry()` 的结果。 */
export interface MaybePruneResult {
  /** 是否真的执行了回收（false = 被限频跳过） */
  ran: boolean
  /** 跳过的原因（`ran=true` 时为 null） */
  skipped: 'throttled' | 'error' | null
  /** 回收数字（`ran=false` 时全 0） */
  result: PruneResult
}

/**
 * **限频**回收：worker 启动时调用，让「没跑过体检的机器」也能把登记目录清一清。
 *
 * ## 为什么需要它
 *
 * 原先回收只发生在体检进程（`scripts/check-orphan-workers.ts` 的 `main()`）里
 * ⇒ **没跑体检的机器**（只跑 vitest、或体检脚本没装到那台机器）登记目录永远只增不减。
 * ⇒ 让 worker 启动时也回收一次，但**限频**（每轮测试都做一遍纯属浪费）。
 *
 * ⚠️ **不抛错**：回收是辅助动作，失败不该让测试失败（同 `registerSelf()` 的口径）。
 * ⚠️ **不需要锁**：回收只删「自己枚举到」的文件 ⇒ 两个回收进程同时跑也只是
 *   多删一次同一个文件（`unlink` 报错当已删）⇒ 不会互相破坏。
 *
 * @param dir 登记目录
 * @param options 限频间隔 / 年龄上限 / 当前时刻（判据测试可注入）
 */
export function maybePruneRegistry(
  dir: string = registryDir(),
  options: PruneOptions & { throttleMs?: number } = {},
): MaybePruneResult {
  const empty: PruneResult = { before: 0, after: 0, removed: 0 }
  const throttleMs = options.throttleMs ?? DEFAULT_PRUNE_THROTTLE_MS
  const now = options.now ?? Date.now()
  const marker = join(dir, PRUNE_MARKER)

  try {
    // ① 限频：距上次回收不足间隔 ⇒ 跳过
    const last = Number.parseInt(readFileSync(marker, 'utf8').trim(), 10)
    if (Number.isFinite(last) && now - last < throttleMs) {
      return { ran: false, skipped: 'throttled', result: empty }
    }
  } catch {
    // 标记文件不存在 ⇒ 从没回收过 ⇒ 继续往下（不是错误）
  }

  try {
    // ② 回收
    const result = pruneRegistry(dir, isPidAlive, options)
    // ③ 记限频标记（**原子发布**：先写 tmp 再 rename ⇒ 并发写不会写出半截内容）
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `${TMP_PREFIX}${randomUUID()}`)
    writeFileSync(tmp, String(now), 'utf8')
    renameSync(tmp, marker)
    return { ran: true, skipped: null, result }
  } catch {
    return { ran: false, skipped: 'error', result: empty }
  }
}
