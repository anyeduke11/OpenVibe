import { defineConfig } from 'vitest/config'

// 四层测试（design.md §13 / dev-plan T1）：
// unit        纯单元（packages + tests）
// integration server API（fastify app.inject + 临时 DB，T2 起接入）
// cli         CLI 集成（临时项目目录夹具，T7 起扩展）
// web         组件渲染与交互（owner 裁定 ⑪，2026-09-26：建 jsdom project 而非把 CDP 驱动器接进 CI）
export default defineConfig({
  test: {
    // 2026-10-16：四个 project 各自起自己的 worker，默认上限是「核数−1」（本机 10 核 ⇒ 9），
    // 叠起来远超机器真实并发 ⇒ CLI 层「真起子进程 ＋ 真监听端口」的用例在**全量跑**时越过 30s 闸，
    // 而**单跑 `--project cli` 只要 9s 且 214 支全绿**。这是**超订**，不是功能回归。
    // 压到核数的一半留足余量：既能避免争抢，也不会把全量拖成串行（实测全量 150s → 回到 30s 量级）。
    // 用数字而非百分比是为了跨机器可复算——CI runner 核数与本机不同，百分比会漂。
    maxWorkers: 5,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
          // 同 integration / cli 那条理由：默认 5s 是**闸口，不是功能红线**。
          // 本机常驻 Lark / usernoted 等进程，负载高峰（实测 load average 84）时
          // 「真播种 ＋ 真聚合」的用例会跑到 3.8–6.6s ⇒ 越过默认 5s 判超时，
          // 而**单跑同一支全绿** ⇒ 那是**环境型红**，不是功能回归。
          // 抬到 20s（对实测最慢仍有 3x 余量，真卡死仍会红）。
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['apps/server/test/**/*.test.ts'],
          // 同 cli project 那条理由，win32 runner 上复现过一次：真实 SQLite 播种 + 导出落盘
          // 在 windows-latest 比本机慢 10–50 倍，run 36796390998 实测单支最高 7845ms（越过默认 5s 判超时），
          // 另有 3821 / 3690 / 3559 / 3128 四支贴着闸口 ⇒ 抬到 20s（对实测最慢仍有 2.5x 余量，真卡死仍会红）
          testTimeout: 20_000,
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
          // 本层再单独压一档：子进程与端口是**全局稀缺资源**，与别的层并发时最先崩的是这里。
          // 单跑本层 214 支 9.4s 全绿 ⇒ 压到 2 仍有充分余量（实测约 12s）。
          maxWorkers: 2,
        },
      },
      {
        test: {
          name: 'web',
          // jsdom 与 @testing-library/* 装在根 devDeps 而不是 apps/web：环境包由这份根配置解析，
          // 放进 app 下 vitest 找不到（owner 裁定 ⑪，2026-09-26）
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          // 同 unit / integration / cli 那条理由：组件用例靠 `waitFor` 等渲染与取数，
          // 机器负载高峰时它们会越过默认 5s 判**超时**（实测 4 支越界，单跑全绿 ⇒ 环境型红）。
          // 抬到 20s：真卡死仍会红，而负载波动不再让整层变成红海。
          testTimeout: 20_000,
        },
      },
    ],
  },
})
