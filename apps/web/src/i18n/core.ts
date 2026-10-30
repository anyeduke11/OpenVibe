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
  // M9「开发能力」（§3.5：assets 组里紧随「术语」之后）
  devAbility: '开发能力',
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
  /**
   * 链路层失败（fetch 直接抛错 / 错误体不是约定的 JSON）。
   *
   * 为什么不直接透传浏览器原文：那些是英文机器串（"Failed to fetch" /
   * "500 Internal Server Error"），是运行时实现细节。中文界面里出现它们等于把
   * 内部实现漏给用户，且措辞随浏览器/代理版本漂移。
   *
   * 为什么归到「链路层」而不是「应用层」：错误说明的**唯一权威来源**是 server 的
   * `{code, message}` JSON 体；拿不到它，说明出问题的是链路本身（后端没起、
   * 代理打不通），不是某个接口的业务逻辑。给这一类一句可行动的中文，
   * 比让用户读英文机器串有用。
   */
  unreachable: '无法连接到本地服务',
  /** 兜底：拿到了错误但没有可读说明（错误体形状不对 / 不是 Error 实例） */
  unknownError: '未知错误',
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
