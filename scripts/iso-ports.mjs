/**
 * scripts/iso-ports.mjs —— 隔离实例的**端口分配与冲突重试**（2026-10-31）。
 *
 * ## 它解决什么
 *
 * 「先 listen(0) 拿一个空闲端口 → close → 用它」有**竞态窗口**：
 * 探到之后、真正 listen 之前，端口可能被别处占走（另一套实例、手工起的进程）。
 * 而 vite 的 `strictPort` 遇到端口被占会**直接报错退出** ⇒ 人只能读报错再手动重跑。
 *
 * ⇒ 把「端口被占」变成**可自动恢复**的事：
 *   分配器给出一组端口，起进程的调用方在**失败时**回报「这是端口冲突」，
 *   本模块换一组端口重试（最多 `PORT_RETRY_LIMIT` 次），并把重试过程打印出来。
 *
 * ## 为什么「探端口」与「重试」要分开
 *
 * 探端口只能把窗口**缩小**（探到的端口在探测那一刻确实空着），窗口本身消不掉。
 * ⇒ 真正的兜底是**失败后重试**：分配是「给一组」，恢复是「换一组再来」。
 * 两者职责不同，混在一个函数里会让「谁负责决定重试」说不清。
 *
 * ## 单源一份实现
 *
 * `scripts/dev-iso.mjs` 与判据测试共用这一份（测试走 `.d.mts` 类型声明）。
 */
import { createServer } from 'node:net'

/**
 * 端口被占时最多重试几次。
 *
 * ⇒ 首试 1 次 + 重试 2 次 = 最多试 3 组端口（够用：连撞三次说明不是偶发）。
 */
export const PORT_RETRY_LIMIT = 2

/**
 * 探一个当前空闲的端口。
 *
 * ⚠️ **竞态窗口**：探到之后端口**并未被占住**，只是「此刻还空着」——
 *   探到与真正 listen 之间，端口可能被别处占走。
 *   那个窗口消不掉 ⇒ 兜底是 `withPortRetry`（失败后换一组重试）。
 */
export function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('拿不到空闲端口（address 不是 TCP 端点）'))
        return
      }
      const { port } = address
      server.close(() => resolvePromise(port))
    })
  })
}

/**
 * 探一组互不相同的端口（API 一个、web 一个）。
 *
 * ⚠️ 两个端口必须不同：探端口可能连着两次拿到同一个（刚 close 的端口会被复用）。
 */
export async function pickPortPair() {
  const api = await findFreePort()
  let web = await findFreePort()
  for (let i = 0; i < 5 && web === api; i += 1) web = await findFreePort()
  if (web === api) throw new Error('探不到两个不同的空闲端口')
  return { api, web }
}

/**
 * 这段输出是不是在说「端口被占」。
 *
 * - vite（`strictPort`）：`Port 5144 is already in use`
 * - node/net（listen 失败）：`listen EADDRINUSE: address already in use 127.0.0.1:8787`
 *
 * ⚠️ **只认端口冲突**，不认别的失败（编译错、依赖缺失等）——
 *   那些重试也没用，重试只会让人多等几秒却看不到真因。
 */
export function detectPortConflict(text) {
  return /already in use|EADDRINUSE/.test(text)
}

/**
 * 起一次；端口被占就换一组端口重试。
 *
 * @param {object} options
 * @param {() => Promise<{api: number, web: number}>} options.allocate 分配一组端口
 * @param {(ports: {api: number, web: number}) => Promise<{conflict: boolean, code?: number}>} options.attempt 起一次
 * @param {number} [options.limit] 最多重试几次（默认 `PORT_RETRY_LIMIT`）
 * @param {(info: {attempt: number, limit: number, ports: object}) => void} [options.onRetry] 每次重试的回调（打印用）
 * @returns {Promise<{conflict: boolean, code?: number, ports: object, attempts: number, exhausted?: boolean}>}
 */
export async function withPortRetry({
  allocate,
  attempt,
  limit = PORT_RETRY_LIMIT,
  onRetry = () => {},
}) {
  for (let attemptIndex = 0; ; attemptIndex += 1) {
    const ports = await allocate()
    const result = await attempt(ports)
    if (!result.conflict) return { ...result, ports, attempts: attemptIndex + 1 }
    // 重试用尽 ⇒ 把最后一次的结果原样交回去（让人看到真因，不是「重试失败」）
    if (attemptIndex >= limit) {
      return { ...result, ports, attempts: attemptIndex + 1, exhausted: true }
    }
    onRetry({ attempt: attemptIndex + 1, limit, ports })
  }
}
