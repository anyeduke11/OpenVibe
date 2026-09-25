import { defineConfig } from 'vitest/config'

// 四层测试（design.md §13 / dev-plan T1）：
// unit        纯单元（packages + tests）
// integration server API（fastify app.inject + 临时 DB，T2 起接入）
// cli         CLI 集成（临时项目目录夹具，T7 起扩展）
// web         组件渲染与交互（owner 裁定 ⑪，2026-09-26：建 jsdom project 而非把 CDP 驱动器接进 CI）
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['apps/server/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'cli',
          environment: 'node',
          include: ['apps/cli/test/**/*.test.ts'],
          // CLI 用例要真起子进程（node --import tsx 冷启动）并真监听端口，
          // 与 unit/integration 并行抢占 CPU 时会越过 5s 默认值（默认值会掩盖成超时失败）
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'web',
          // jsdom 与 @testing-library/* 装在根 devDeps 而不是 apps/web：环境包由这份根配置解析，
          // 放进 app 下 vitest 找不到（owner 裁定 ⑪，2026-09-26）
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
