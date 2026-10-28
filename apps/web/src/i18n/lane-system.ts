/**
 * 系统域文案（工作台 / 成长与统计 / 设置 / 命令面板 + 首启三件套）。
 *
 * 为什么不并进 `zh.ts`：域文案已经拆成「壳层 `core.ts` / 页级 `zh.ts`」两层，
 * 本轮系统域四页做的是**重排**——统一 view-head、补齐四态、设置分节，
 * 每一句都是新口径。混进 30kB 的 `zh.ts` 会让「哪句是本轮定的」查不出来。
 *
 * 边界：`zh.ts` 一字未动，既有句子仍从 `zh` 取；这里只放本轮新增或改写的句子，
 * 以及四态 / view-head 这类跨页复用的口径。
 *
 * 领域硬事实不在这层改口径，只在这里复述：北极星 = 标准化飞轮**完整走完**的圈数；
 * 本机自证层（MT 层）与遥测层**正交**、不是替代；遥测默认关闭、关闭时零外联、
 * 白名单只有三类事件且不含路径 / 内容 / 用户标识。
 */

export const sys = {
  /** 四态（全站同口径）：加载骨架 / 空带 CTA / 无结果 / 错误可重试 */
  state: {
    loading: '加载中…',
    retry: '重试',
    /** 错误一句话 + 一支重试按钮；端点未上线另行说明，不让「还没实现」看起来像「坏了」 */
    error: (msg: string) => (msg === '' ? '这一块没取到数据。' : `这一块没取到数据：${msg}`),
    notOnline: '读端点尚未上线，需要 server 侧只读端点；不是出错。',
  },

  workbench: {
    /** 右侧主动作（view-head 右半） */
    action: {
      wizard: '首启向导',
      newPack: '组装标准包',
    },
    /** 统计条：北极星一格强调，其余三格平级，一行放得下 */
    stats: {
      heroKey: '标准化飞轮 · 完整圈数',
      heroNote: '沉淀 → 组包 → 注入 → 回流，四步齐了才算一圈',
      assetsKey: '资产总数',
      assetsNote: '提示词 + 术语 + Skill 条目之和',
      packKey: '标准包 / 注入次数',
      packNote: '组一个包、注入一个项目各记一次',
      reflowKey: '回流条数',
      reflowNote: '复盘产出的新资产',
      zeroNote: '四项都还是 0：先沉淀一条资产，或直接组装预置包',
    },
    projects: {
      emptyTitle: '还没有项目',
      emptyHint: '建一个项目、选流程模板，再把标准包注入进去——飞轮从这一步开始转。',
      emptyCta: '新建项目',
      checkNote: (done: number, total: number) => `清单 ${String(done)} / ${String(total)} 已勾`,
      noPath: '未登记本地路径',
    },
    today: {
      note: '每天 5–10 分钟的入口就在这三处',
    },
    /** 本机自证层（MT 层）在本页的落点 */
    ledger: {
      note: 'append-only · 可清空 · 本机可复算 · 不出网',
      orthogonal: '与匿名遥测正交：本层永远在，关掉遥测它照样记账。',
    },
  },

  growth: {
    action: {
      reset: '重置我的阶段',
      openSettings: '去设置',
    },
    vector: {
      pending: '毕业信号待采集',
      pendingHint:
        '阶段自动判定依赖 D29 本机事件台账的读端点，尚未上线。在那之前阶段由你手选并记在本机——宁可自己认领，也不拿假信号算一个假的「已毕业」。',
      focusLabel: '展开看这条解释',
      mindLabel: '你此刻想要的',
      authorityLabel: '系统该替你行使的',
      graduateLabel: '毕业信号（待采集）',
    },
    redlines: {
      note: '硬约束，不是建议：改这五条里的任何一条都是改产品承诺，不是改界面。',
    },
    ledger: {
      /** 无结果（筛完为空）与空（本机零事件）是两件事，分开说 */
      noResult: '这个类目下没有事件。',
      clearFilter: '清除类目筛选',
    },
  },

  settings: {
    title: '设置',
    subtitle:
      '本地优先意味着没有云端设置页。这里放的都是只在本机生效的开关，外加一把随时可查的量具。',
    action: {
      showWizard: '重新显示向导',
    },
    appearance: {
      title: '外观',
      body: '双主题同构：29 支颜色 token 各一份，只换光照不换层级。暗态不反相、不转冷，保留同一暖相只调明度与饱和。',
      switchHint: '主题切换入口全站只有顶栏一处（暖纸 ↔ 暖夜），这里不提供第二个开关。',
      current: (name: string) => `当前主题：${name}`,
      paper: '暖纸',
      night: '暖夜',
    },
    telemetry: {
      title: '匿名遥测',
      defaultOff: '默认关闭',
      on: '已开启',
      off: '已关闭（零外联）',
      offNote: '关闭时不建上报队列，零外联；下面的事件清单公开，只有三类。',
      eventsTitle: '事件白名单（三类，只有这三类）',
      cols: { event: '事件', trigger: '触发时机', excludes: '不带出去' },
      events: [
        { id: 'pack_injected', trigger: '一次注入成功', excludes: '项目路径与包内容' },
        { id: 'flow_template_used', trigger: '流程模板被选用', excludes: '用户标识' },
        { id: 'project_active', trigger: '活跃项目去标识计数', excludes: '项目名与路径' },
      ],
      askHint: (asked: boolean) =>
        asked ? '已询问过：拒绝后本机标记，永不再问' : '首次注入成功后才询问一次',
      toggleOn: '开启匿名遥测',
      toggleOff: '关闭匿名遥测',
    },
    /**
     * 真·本机事件台账节（local-event-ledger.md FR-3.2 / FR-7）。
     *
     * ⚠️ 与上面那个 `ledger` 是两节两表：`telemetry_events` 受遥测开关控制、会被发出；
     * `local_events` 无条件本机写、永不出网。这里单独成节就是为了不把两件事讲成一件事。
     */
    localLedger: {
      title: '本机事件台账',
      offlineChip: '不出网',
      body: '只写在这台机器的 SQLite 里，没有上传通道，也无法被外部读取。它与上面「匿名遥测」是正交的两层：关掉遥测，这一层照样记；反过来它也永远不会替你发任何东西。',
      scope: '窗内与累计',
      windowLabel: '所选窗内',
      cumulativeLabel: '本机累计',
      activeDays: (n: number) => `窗内有事件的天数：${String(n)} 天`,
      colKind: '事件类型',
      colWindow: '窗内',
      colCumulative: '累计',
      utcNote: '窗口按 UTC 日戳切分；跨时区时与本机「今天」可能差一天，属预期。',
      empty: '本机还没有任何事件',
      emptyHint: '新建或修改资产、勾选清单项之后会开始留痕。',
      clear: '清空',
      cancel: '取消',
      cleared: (n: string) => `已清空本机台账，共删除 ${n} 条。`,
      clearDialog: {
        title: '清空本机事件台账',
        body: '台账里现有的每一条事件都会被删除，随后重新从零开始记。资产、标准包、项目本身都不受影响——它们存在各自的表里，不在台账里。',
        irreversible: '这一步不可撤销，也没有回收站。',
        confirm: '确认清空',
      },
    },
    ledger: {
      title: '本机自证层 · 事件台账',
      note: '本机 · append-only · 可清空 · 不出网',
      body: '这是「本机可复算的自证层」，不是遥测的替代品：两者正交，遥测关掉它照样记账，飞轮圈数也从这里算。',
      clearHint:
        '可清空 = 停服务后删除数据目录里的 data/openvibe.db（台账与资产同库，清台账会连资产一起没）；本轮没有单独的清空端点，因此这里只读。',
      empty: '本机还没有事件',
      emptyHint: '组包、注入、回流发生后会在这里留痕。',
      openGrowth: '在成长与统计里筛',
      manage: '在设置里看台账',
    },
    paths: {
      title: '数据与路径',
      body: '全部状态就在数据目录：data/openvibe.db（SQLite）+ config.json + packs/ 导出目录。备份 = 停服务后整目录复制。注入目标项目里的 .openvibe/ 只放 lock 与覆盖前备份，可随项目提交 git。',
      serviceHint: '仅监听 127.0.0.1；token 在 <数据目录>/config.json（0600），CLI 自动发现。',
    },
    cli: {
      title: 'CLI 命令参考',
      hint: 'CLI 是唯一能写你磁盘的通道；这里只读元数据，不代你执行。',
    },
    readability: {
      title: '可读性与设计系统',
      hint: '运行时用 CSS 变量真算，不是写死的数字',
      passAll: '全部 ≥ 4.5',
      failCount: (n: number) => `${String(n)} 处红牌`,
      undeclared: '未声明',
      verdict: { aaa: 'AAA', aa: 'AA', fail: '红牌' },
      forbiddenTag: '禁区',
      contract:
        '硬约束：任何承载文字的配对在两套主题都要 ≥4.5；3.0 只对 ≥24px 或 ≥18.66px bold 生效。ink-faint 只允许落在 canvas / panel / panel-2 / panel-sunk 四种纸底上。',
      pairCols: { pair: '配对', sample: '样例', ratio: '对比度', verdict: '判定' },
    },
    aiExtract: {
      title: 'AI 提取（M10）',
      aside: '默认关 · 出网需逐项目同意',
      gateLabel: '允许从开发日志提取候选资产（LLM）',
      gateHint: '总闸关闭时入口不渲染、调用一律拒绝。出网前展示确切内容；候选一律进待确认队列。',
      adoptionTitle: '采纳率（影子门槛 25%）',
      adoptionEmpty: '待采集：候选经人工确认后出现。',
      adoptionLowBanner: (rounds: number) =>
        `连续 ${String(rounds)} 轮采纳率低于门槛（25%）——建议关闭提取；新项目将默认不开。`,
      providerHint: '推理服务与「解读服务」区共用同一份配置（两线同源）；端点/密钥在那边改。',
      usageTitle: '出网成本台账（按服务分组）',
      usageEmpty: '还没有出网记录。',
      consentTitle: '已记住同意的项目',
      consentEmpty: '没有记住任何项目的同意。',
      clear: '清除',
    },
    om: {
      title: '输出侧度量（OM）',
      aside: '本机 · 不出网 · 估算',
      densityTitle: 'OM1 · 有效上下文密度',
      densityEmpty: '待采集：组一个标准包后出现。',
      densityLine: (pack: string, tokens: number, assets: number, per: string) =>
        `包 ${pack}：受管 ${tokens} token ÷ ${assets} 项资产 ≈ ${per} token/条`,
      top5Title: '最占上下文的产物 Top5',
      timeTitle: 'OM2 · 首次见效时间',
      timeEmpty: '待采集：完成一次注入后出现。',
      timeLine: (seconds: number) =>
        seconds < 90
          ? `首次注入距首次使用 ${seconds} 秒`
          : seconds < 5400
            ? `首次注入距首次使用 ${Math.round(seconds / 60)} 分钟`
            : `首次注入距首次使用 ${Math.round(seconds / 3600)} 小时`,
      timeRange: '台账口径：首次本机事件 → 首次注入记录（injections 表）。',
    },
  },

  palette: {
    /** 面板内搜索的三个非导航态：搜索中 / 无结果 / 搜索失败可重试 */
    searching: '正在搜…',
    searchingHint: '提示词 / 术语 / Skill 三路并发',
    noResult: '没有匹配项',
    noResultHint: '换个词，或先看「页面」那一组——所有路由都在那儿。',
    failed: '搜索没成功，面板本身还能用。',
    navHint: '⌘K 唤起 · esc 关闭',
  },

  onboarding: {
    title: '首启向导',
    subtitle: '三步，每步都产生真实副作用：读真实库存、渲染真实预置包、探真实 lock 文件。',
    steps: ['认识资产库', '预览预置包', '注入并跑一次 diff'],
  },
} as const

export type Sys = typeof sys
