import { CONTROLLED_TAG_VOCAB } from './constants'

/**
 * 术语学习路线（DEV-0076）：按学习顺序把词条分站分组——
 * 第 1 站是 vibe coding 核心概念（受控词表即分组），后续各站对应 vibe-hub 的
 * 主题与子分类（组名=tag，顺序即子分类的学习顺序）。词条归属规则：按 tag 命中
 * 第一个站；都不命中进「未入路线」。展示与筛选逻辑在 Web，路线定义在此单源。
 *
 * 独立模块而非 constants.ts：constants 被入口侧引用，学习路线只有懒加载的
 * 术语路线视图用——分模块让这 ~1kB 的路线数据不进入口 chunk。
 */
export const TERM_ROADMAP: readonly {
  /** 稳定站 id（顺序自定义存储引用它，标题/组名可改） */
  readonly id: string
  readonly title: string
  readonly groups: readonly string[]
}[] = [
  { id: 'core', title: 'vibe coding 核心', groups: [...CONTROLLED_TAG_VOCAB] },
  {
    id: 'frontend',
    title: '前端',
    groups: [
      '网页基础',
      '按钮与链接',
      '表单',
      '内容展示',
      '弹窗与提示',
      '导航',
      '官网区块',
      '页面布局',
      'CSS 布局',
      '文字',
      '外观',
      '动画',
      '鼠标',
    ],
  },
  {
    id: 'backend',
    title: '后端',
    groups: ['网络与地址', '接口与数据', '数据库', '后端开发', '账号与权限', '上线与排错'],
  },
  { id: 'product', title: '产品', groups: ['用户与需求', '产品规划', '数据与验证'] },
  { id: 'testing', title: '测试', groups: ['测试'] },
  {
    id: 'stack',
    title: '技术栈',
    groups: ['开发工具', '技术栈', '编程语言', '前端框架', 'CSS 与组件'],
  },
  {
    id: 'ai',
    title: 'AI',
    groups: [
      'AI 基础',
      '上下文',
      '请求与输出',
      'Agent 与工具',
      '连接与配置',
      '规则与扩展',
      '权限与运行',
      '性能与成本',
    ],
  },
  { id: 'git', title: 'Git', groups: ['Git'] },
  { id: 'design', title: '设计风格', groups: ['设计风格'] },
]
