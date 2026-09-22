import { defineConfig } from 'vitest/config'

// 三层测试（design.md §13 / dev-plan T1）：
// unit        纯单元（packages + tests）
// integration server API（fastify app.inject + 临时 DB，T2 起接入）
// cli         CLI 集成（临时项目目录夹具，T7 起扩展）
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
    ],
  },
})
