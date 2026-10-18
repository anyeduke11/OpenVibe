// 工程域三页 + 项目详情 + 组包向导的**本轮新增**文案。
//
// 为什么不写进 `zh.ts`：那份是跨页共享契约（i18n/core.ts 注释已记：壳层不得 import `zh`，
// 且它带着按 chunk 预算算过的分层口径）。本轮只重排工程域，既有 key 一律继续用
// （zh.projects / zh.packs / zh.flows / zh.common / zh.editor），这里只放**确实没有现成 key** 的：
// 页头一句话、四态补齐文案、破坏性动作的影响范围、干跑面板与五状态表。
//
// 五状态表是**数据**不是文案：`options` 直接镜像 `packages/core/src/inject/planner.ts` 的
// `RULES`（DRIFT 三档、CONFLICT 两档），渲染点只 map 这份数组——硬写三档会让 planner 改规则
// 而界面不跟着改，那就是当界面在说谎。

/** 处置段的口径标签（planner 的 InjectDecision） */
export const decisionLabels = {
  overwrite: '以包为准',
  'keep-local': '保留本地',
  skip: '跳过',
} as const

export type DecisionKey = keyof typeof decisionLabels

export interface InjectStatusRow {
  status: string
  /** 状态名（NEW / IN_SYNC / …，与 planner 的 InjectStatus 逐字一致，不本地化） */
  label: string
  /** 判据一句话：这行凭什么成立 */
  because: string
  /** 处置段数由数据给：DRIFT 三档、CONFLICT 两档、无决策点的三状态给空数组 */
  options: readonly DecisionKey[]
}

/** 注入五状态（planner.ts INJECT_STATUSES / RULES，零新增口径） */
export const injectStatusRows: readonly InjectStatusRow[] = [
  {
    status: 'NEW',
    label: '新增',
    because: '本地不存在这个文件——注入即新建，没有手改可丢。',
    options: [],
  },
  {
    status: 'IN_SYNC',
    label: '一致',
    because: '磁盘内容与包内容逐字节相同，无需写入也无需询问。',
    options: [],
  },
  {
    status: 'UPDATE',
    label: '待更新',
    because: '磁盘内容等于上次登记的哈希，但包里已经是新一版——覆盖前自动备份。',
    options: [],
  },
  {
    status: 'DRIFT',
    label: '漂移',
    because: '本包受管该文件，且磁盘内容既不等于登记哈希、也不等于包内容——多半是本地手改。',
    options: ['overwrite', 'keep-local', 'skip'],
  },
  {
    status: 'CONFLICT',
    label: '冲突',
    because: '本包从未拥有该文件（不受管），磁盘上的内容来源不明——「保留本地」无从成立。',
    options: ['overwrite', 'skip'],
  },
]

export const laneEngineering = {
  /** 页头：h1 下一句说明，说清这页解决什么、去向在哪 */
  view: {
    projects: '项目是标准包的落地现场：阶段清单、任务与 DEV/CHECK 日志都在这一页对齐。',
    project: '阶段清单、任务看板与开发日志同屏对读——标准包注入后在这里开工。',
    flows: '流程模板是项目的骨架：阶段、检查项与提示词一次定义，项目与标准包共用。',
    packs: '标准包是资产编译后的物理产物：一份选集生成六个平台各自认的主规则文件。',
    packNew: '五步把选集编译成包；每步都能回退，第 5 步所见即导出所得。',
  },

  /** 四态（DESIGN.md「四态与主态同批交付」） */
  state: {
    loading: '正在读…',
    retry: '重试',
    retryHint: '读本地库失败，通常是后台进程刚重启——重试即可。',
    noResult: '没有匹配的结果。',
    clearFilter: '清除筛选',
    filterKept: '筛选已清除。',
  },

  projects: {
    // 状态标签继续用 zh.projects.statusAll（'all' + PROJECT_STATUS），不另建第二份口径
    filterLabel: '按状态筛',
    openDetail: '打开',
    /** 列表与详情共用的健康摘要键（项目详情页的「未完检查项」等） */
    health: {
      stage: '所处阶段',
      unchecked: '未完检查项',
      lastLog: '最近日志',
      never: '还没写过日志',
    },
  },

  /** 破坏性动作：删除项目（标题 / 主体 / 按钮文案沿用 zh.projects.deleteDialog，这里只补影响范围里
   *  原文没覆盖的一句：已注入的标准包文件不受这次删除影响） */
  projectDelete: {
    impactTitle: '影响范围',
    impactOk: '项目目录里的文件一律不动——删的是灵典库里的这条立项记录。',
    impactExported: '已注入项目的标准包文件（CLAUDE.md / AGENTS.md 等）仍在项目目录里，不受这次删除影响。',
    /** 行内二次确认的按钮态文案（列表里的 × 第一次点只是武装，不提交） */
    confirmRow: '确认删除',
  },

  /** 标准包列表与详情的增量文案（既有 key 继续走 zh.packs） */
  packs: {
    allExports: '全部导出历史',
    searchLabel: '按包名或描述搜…',
    listTitle: '包列表',
    selectHint: '选一个包，右边一屏读完全部信息',
    filterAll: '全部',
    filterExported: '已导出',
    filterNotExported: '未导出',
    noSelection: '选一个包开始读',
    noSelectionHint: '左边点包名，右边给出选集、产物字节与注入前干跑——不用来回切页。',
    fingerprint: '指纹',
    lastExport: '最近导出',
    impactTitle: '影响范围',
    impactKept: '已经导出的文件与已注入项目的产物不受影响——内容在导出那一刻已物化。',
    impactGone: '包定义与它的导出历史一并硬删，无法恢复。',
  },

  /** 破坏性动作：删除标准包 */
  packDelete: {
    impactTitle: '影响范围',
    impactKept: '已经导出的文件与已注入项目的产物不受影响——内容在导出那一刻已物化。',
  },

  /** 破坏性动作：删除流程模板 */
  flowDelete: {
    impactTitle: '影响范围',
    impactKept: '已立项项目的阶段快照不受影响——立项时已复制进项目，改模板不回改历史项目。',
    impactGone: '之后新建的项目将用不到这个模板；已有项目仍按各自快照走。',
    confirm: '确认删除',
    done: '已删除模板',
    count: (n: number) => `共 ${String(n)} 套模板`,
  },

  /** 任务删除（看板卡上的 ×）：行内二次确认，不弹窗 */
  taskDelete: {
    /** 武装态按钮上的短文案——要能塞进 120px 的卡片尾 */
    armed: '确认',
    confirm: '再点一次确认删除这条任务',
    done: '已删除任务',
  },

  /** 干跑面板（m6-standard-pack FR-7：只输出「会怎样」，不写盘） */
  dryRun: {
    title: '注入前干跑',
    hint: '干跑只回答「如果现在注入会怎样」，本面板不写盘、不备份、不抢 lock。',
    pickProject: '选目标项目',
    noProject: '还没有项目可注入——先去项目页立项，才能对着真实目录干跑。',
    tableTitle: 'CLI 干跑计划表的五状态',
    tableHint: '状态判据取自 core 规划器，与终端 `openvibe sync --dry-run` 打印的是同一份口径。',
    tableScope:
      '逐文件的计划表只在终端打印——Web 读不到项目目录，也就没有磁盘快照可比；这里给的是状态口径与判据，落盘与逐文件结论都留给 CLI。',
    statusCol: '状态',
    becauseCol: '成立条件',
    optionsCol: '处置段（段数由数据给）',
    noOptions: '无决策点，按默认动作执行',
    pendingCol: '待决项',
    pendingNone: '没有待决项：跑 sync 不会问你任何问题。',
    exitTitle: '唯一出口',
    exitHint: '写盘只由 CLI 干这一步；本页不代劳，也不代你决定处置方式。',
    command: (path: string, pack: string) => `openvibe sync '${path}' --pack ${pack}`,
    copy: '复制命令',
    copied: '命令已复制',
    copyFailed: '复制失败，请手动选中',
    undecided: {
      title: '界面预选与 CLI 默认不一致（尚未裁定）',
      body: '界面预选「保留本地」对齐「手改不被无声覆盖」的承诺；已发布的 CLI 默认是 overwrite。本页两处并列显示，不替产品做决定。',
      uiPick: '界面预选',
      cliDefault: 'CLI 已发布默认',
      verdict: '尚未裁定',
    },
    baselineHint:
      '干跑基线取自最近一次导出实例（不是包定义的现渲），所以看到的哈希与第 5 步预览不同是正常的。',
  },
}
