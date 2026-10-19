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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 显式绑 IPv4 回环：vite 默认 host='localhost' 在 macOS 解析到 ::1（仅 IPv6），
    // 会导致 127.0.0.1:5144 拒连（DEV-0071 实测）。绑 127.0.0.1 后 localhost 走浏览器
    // fallback 仍可达；与 server 侧的回环绑定纪律（design §11.1）一致。
    host: '127.0.0.1',
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      // ⚠️ 目标端口与上面 WEB_PORT 同源（都取自 shared 的常量，由 tests/dev-ports.test.ts 钉住）。
      // 原先这里直接硬写了服务端那个端口字面量 —— 改 shared 的 DEFAULT_PORT 时它不跟着动，
      // 代理会静默指向一个没人监听的端口，而 vite 本身完全不报错。
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: WEB_PORT,
    strictPort: true,
  },
})
