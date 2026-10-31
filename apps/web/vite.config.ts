import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 刻意不写 build.rollupOptions.output.manualChunks（T8f 实测后否决）：
 * 按包名强行分组会把懒加载 chunk 变成入口的静态依赖——vite 于是往 index.html 里
 * 塞 `<link rel="modulepreload">`（dndkit / codemirror-view / codemirror 各一条），
 * 入口是瘦到 146.97kB 了，首屏实际字节反而约 962kB，比默认的 291kB 更差。
 * 分包只靠 App.tsx 的 React.lazy 动态 import 边界，交给 rollup 自己切。
 */

// 开发态：/api 代理到本地 server（Origin/Host 保持 localhost，通过 design §11 鉴权白名单）

/** 前端唯一约定端口（owner 2026-09-30 定）：dev 与 preview 都锁 5144。
 *  strictPort=true → 端口被占时 vite 直接报错退出，绝不静默漂移到 5174 等备用端口；
 *  「禁止使用其他端口」由此机制保证，而不是靠约定。
 *
 *  ⚠️ **这里刻意不 import `@openvibe/shared` 的同名常量**（2026-10-19 实测）：
 *   vite.config.ts 由 esbuild 打包后交给 **Node 原生 ESM** 加载，而
 *   `packages/shared/src/index.ts` 里全是 `./constants` 这种**无扩展名**相对导入 ——
 *   那只在打包器/tsx 下成立，Node 直接抛 `ERR_MODULE_NOT_FOUND: Cannot find module
 *   '.../packages/shared/src/constants'`，且 vite 会报成「failed to load config」，
 *   看不出是端口那行引起的。
 *
 *   ⇒ 端口的**权威出处**仍是 `packages/shared/src/constants.ts` 的 `WEB_PORT` /
 *   `DEFAULT_PORT`（server 的启动横幅与 `scripts/dev-all.mjs` 都从那里取）；
 *   本文件这两处字面量由 `tests/dev-ports.test.ts` 钉住，改一边不改另一边即红。
 *   **不是「两份各自对」，是「一份为准 ＋ 一份被守卫锁死」。** */
export const WEB_PORT = 5144

/** ⚠️ 同上：与 shared 的 `DEFAULT_PORT` 同源，由 tests/dev-ports.test.ts 钉住。 */
const API_PORT = 8787

/**
 * dev 隔离实例的端口覆盖（2026-10-30）。
 *
 * ## 为什么 vite 侧也要读这两个变量
 *
 * 起第二套实例时，三处必须指向同一个 API 端口，否则「隔离」只是幻觉：
 *  ① server 的监听端口；② vite 的 `/api` 代理目标；③ 浏览器实际打开的 web 端口。
 * 前两处都在本文件与 server 进程里 ⇒ **读同一个环境变量名**是唯一能保证一致的做法
 * （各写各的默认值 + 各自的覆盖逻辑，迟早有一处漏改）。
 *
 * ⚠️ **变量名与 shared 的 `API_PORT_ENV` / `WEB_PORT_ENV` 同源但各自留一份字面量**：
 *   理由同上（本文件不能 import shared）⇒ 由 `tests/dev-ports.test.ts` 钉死一致。
 *
 * ⚠️ **非法值大声失败**：静默回落会让用户以为自己在隔离端口上跑，
 *   实际连的是默认端口那个真实实例 ⇒ 写库写进了真实数据而他毫不知情。
 */
const API_PORT_ENV = 'OPENVIBE_API_PORT'
const WEB_PORT_ENV = 'OPENVIBE_WEB_PORT'

/** 端口覆盖值解析（与 shared 的 `resolvePort` 同口径；本文件不能 import shared） */
function resolvePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(
      `端口覆盖值非法：${raw}（必须是 0–65535 的整数；未设置时用 ${String(fallback)}）`,
    )
  }
  return n
}

/** 实际生效的 web 端口（缺省即上面那个常量，可被 `OPENVIBE_WEB_PORT` 覆盖） */
const effectiveWebPort = resolvePort(process.env[WEB_PORT_ENV], WEB_PORT)

/** 实际生效的 API 端口（缺省即上面那个常量，可被 `OPENVIBE_API_PORT` 覆盖） */
const effectiveApiPort = resolvePort(process.env[API_PORT_ENV], API_PORT)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 显式绑 IPv4 回环：vite 默认 host='localhost' 在 macOS 解析到 ::1（仅 IPv6），
    // 会导致 127.0.0.1:5144 拒连（DEV-0071 实测）。绑 127.0.0.1 后 localhost 走浏览器
    // fallback 仍可达；与 server 侧的回环绑定纪律（design §11.1）一致。
    host: '127.0.0.1',
    port: effectiveWebPort,
    strictPort: true,
    proxy: {
      // ⚠️ 目标端口与上面 WEB_PORT 同源（都取自 shared 的常量，由 tests/dev-ports.test.ts 钉住）。
      // 原先这里直接硬写了服务端那个端口字面量 —— 改 shared 的 DEFAULT_PORT 时它不跟着动，
      // 代理会静默指向一个没人监听的端口，而 vite 本身完全不报错。
      // ⚠️ 覆盖时与 server 的监听端口读**同一个** `OPENVIBE_API_PORT` ⇒ 两边必然一致。
      '/api': { target: `http://127.0.0.1:${String(effectiveApiPort)}`, changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: effectiveWebPort,
    strictPort: true,
  },
})
