/**
 * 入口只读的那部分文案（DESIGN.md 布局里「工具不像官网」的那层）。
 *
 * 为什么要拆出来：`zh` 是**一个对象**，只要入口（index → App → AppShell）碰一次，
 * 整份 30KB 的域文案就跟着进入口 chunk，页面级 `lazy()` 省不掉——Vite 把共享模块
 * 放在共同祖先里。实测（DEV-0093 复算）：入口里的 `zh` 值 33.5kB，掏空后
 * 308 → 274.5kB，而 `bundle:check` 的入口闸是 300kB。
 *
 * 所以拆成两层：**壳要用的**（这里，≈0.4kB）留在入口，**页要用的**留在 `zh.ts`，
 * 跟着懒加载页走。壳层任何时候都不得 import `zh`——这条靠 code review 与
 * 入口体积复查兜住，不靠自觉。
 */

export const appName = 'OpenVibe 灵典'

/** 侧栏四组八项（DESIGN.md Layout）：概览 / 资产 / 工程 / 系统，每项带 API total 计数 */
export const nav = {
  group: {
    overview: '概览',
    assets: '资产',
    engineering: '工程',
    system: '系统',
  },
  workbench: '工作台',
  growth: '成长与统计',
  library: '提示词库',
  terms: '术语库',
  playbooks: '技巧库',
  skills: 'Skill',
  flows: '流程模板',
  projects: '项目',
  packs: '标准包',
  settings: '设置',
  // 侧栏底部：本机优先的落点，不是版权信息
  footerPath: '~/.openvibe/',
  footerHost: '127.0.0.1:8787',
  footerStore: 'SQLite · 本地优先',
  countAria: (n: number) => `${String(n)} 项`,
}

export const common = {
  allTags: '标签过滤',
  clearFilter: '清除过滤',
  loading: '加载中…',
  failed: (msg: string) => `请求失败：${msg}`,
  none: '—',
  theme: {
    aria: '切换亮暗主题（暖纸 / 暖夜）',
    paper: '暖纸',
    night: '暖夜',
  },
  commandPalette: {
    aria: '打开命令面板（快捷键 ⌘K）',
    label: '搜索',
  },
}