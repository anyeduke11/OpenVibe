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
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
})
