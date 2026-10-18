// 资产域四页（提示词库 / 术语库 / 技巧库 / Skill）**新增**文案。
//
// 为什么不写进 `zh.ts`：那份是壳层之外的域文案单一出处，但它是**共享契约**——
// i18n/core.ts 明确壳层不得 import `zh`，而 `zh.ts` 里已有一条按 chunk 预算算过的
// 分层口径；本轮只重排资产域四页，不该把「本轮新增的几句话」塞进那份契约里让别的
// 页面跟着走懒加载边界。已有的 key 一律继续用（library / terms / playbooks / skills /
// common / editor / copyModal / deleteDialog / folderTree / versions / importDialog）。
//
// 这一份只放**确实没有现成 key** 的四类文案：页头一句话说明、筛选条标签、
// 四态（加载 / 空 / 无结果 / 错误）的补齐文案、行内次操作的收起与展开。

/** 术语库学习路线视图的文案（原先内联在 TermRoadmapView 里，随组件一起搬过来） */
export const laneRoadmap = {
  view: '学习路线',
  station: (n: number) => `第 ${n} 站`,
  count: (n: number) => `${String(n)} 条`,
  loose: '未入路线',
  looseHint: '这些词条的标签不在学习路线里。用行尾下拉「归组」写入路线标签（一次归位、永久生效），或点编辑手动处理。',
  emptyGroup: '（暂无）',
  related: (n: number) => `关联 ${n}`,
  empty: '库为空——先导入或新建词条。',
  reorder: '调整顺序',
  reordering: '完成调整',
  resetOrder: '恢复默认顺序',
  orderReset: '已恢复默认顺序',
  moveUp: '上移一站',
  moveDown: '下移一站',
  regroupPlaceholder: '归组到…',
  regrouped: (name: string) => `「${name}」已归组`,
}

export const lane = {
  /**
   * 页头一句话：说清**这页解决什么问题**，不是复述标题。
   * 验收口径是「读完这句就知道该不该留在这里」，所以每句都带落点与去向。
   */
  view: {
    library: '把可复制的提示词沉淀成资产：按文件夹与标签归档，注入项目时按需引用。',
    terms: '统一产品与技术术语——一个词一个定义，导出 TERMS.md 随标准包注入项目。',
    playbooks: '记录真实场景的做法与反例，导出 PLAYBOOKS.md，让同类问题不再重踩。',
    skills: '本机 Skill 台账：来源、版本与安装目标一眼可查，可整理重复、检查更新。',
  },

  /** 筛选条（单行横向滚动）上的标签与计数 */
  filter: {
    tags: '标签',
    active: (n: number) => `已筛 ${String(n)} 项`,
    clearAll: '清除筛选',
    more: '更多标签',
  },

  /** 四态补齐：加载 / 空 / 无结果 / 错误 */
  state: {
    refreshing: '刷新中…',
    noResults: (what: string) => `当前筛选没有命中任何${what}`,
    clearFilters: '清除筛选',
    retry: '重试',
    readFailed: (msg: string) => `读取失败：${msg}`,
    searchPlaceholder: '搜索…',
  },

  /** 行内次操作：默认只露主操作，其余收进「更多」 */
  row: { more: '更多', fewer: '收起' },

  /** Skill 页的工具区（次要动作从页头收进这里） */
  skills: {
    tools: '工具',
    toolsHint: '导入 / 更新 / 整理 / 审查等低频动作',
    scanRootsTitle: '扫描指定目录',
    scanRootsHint: '非约定路径的 skill 可在此手动指定；留空则回落到默认扫描。',
  },
} as const
