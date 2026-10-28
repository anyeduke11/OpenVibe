// M8-E（`docs/specs/m8-agent-panel.md`）的文案。**新建独立 lane**，不写进 `zh.ts`。
//
// 为什么不写进 `zh.ts`（沿用 `lane-engineering.ts` 已有的理由，不重开论证）：
// 那份是跨页共享契约，且带着按 chunk 预算算过的分层口径；M8-E 的字符串只被
// `components/agent/` 与新 hook 消费，单独成文件更贴切，也避免在共享契约上叠改动。
//
// ⚠️ **平台清单不在这里**：`adapter` 的六项清单单源在 `packages/shared` 的 `ADAPTER_IDS`
// （spec FR-5.1.4.1 明写「不在前端硬编码平台清单」——前端复制一份即第二真源）。
// 这里只给**显示名**，且由 adapter id 派生，缺项在类型上就会红。

/** adapter id → 面板上显示的名字。键必须与 `ADAPTER_IDS` 逐项对齐（无索引签名 ⇒ 漏一个就编译红）。 */
export const AGENT_ADAPTER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  'generic-agents': '通用 AGENTS.md',
  codebuddy: 'CodeBuddy',
  trae: 'Trae',
  minicode: 'MiniCode',
}

/** 单个回流摘要的最大字符数（spec FR-5.1.2 写死 80 ＋ 省略号） */
export const AGENT_SUMMARY_MAX = 80

export const agentZh = {
  panel: {
    title: '助手桥接',
    hint: 'agent 通过本区读写本项目；它拿到什么、能写什么、怎么接上，下面三块分别讲。',
    /** 子块顺序是 spec FR-5.1.1.1 写死的：上下文 → 回流 → 指引。顺序即使用顺序。 */
    contextTitle: 'agent 能拿到什么',
    ingestTitle: 'agent 回传了什么',
    installTitle: '怎么让 agent 接上',
  },

  /** 三态空态（spec FR-5.4.1）。三态语义不同，**不许合并成两句文案**。 */
  emptyState: {
    emptyTitle: '还没有任何回流记录',
    emptyHint: '这个项目从未有 agent 回传过东西。接上 agent 之后，它推的条目会先落这里等你确认。',
    emptyCta: '让 agent 接入',
    noResultTitle: '当前筛选没有匹配项',
    noResultHint: '数据是有的，只是被当前筛选挡住了。',
    noResultCta: '清除筛选',
    errorTitle: '取数失败',
  },

  context: {
    fieldsLabel: '字段',
    fieldsAll: '全部',
    previewTitle: '上下文预览',
    empty: '这一段当前没有内容。',
    budgetLabel: '字符预算',
    loading: '正在读上下文…',
    readFailed: '上下文暂时读不出来。',
    /** truncated=true 时的说明条。**不得静默截断**（FR-5.1.3.1）。 */
    truncatedBanner:
      '上下文超出预算，已按 logs → assets → checklist 的顺序裁剪 —— 被裁掉的部分 agent 看不到。',
    charCount: (shown: number, fields: number) => `${shown} 字符 · ${fields} 个字段段`,
  },

  ingest: {
    colTime: '时间',
    colKind: '类型',
    colSource: '来源平台',
    colSummary: '摘要',
    colStatus: '状态',
    statusPending: '待确认',
    statusConflict: '键冲突',
    /** conflict 行的处理提示（FR-5.6：只给入口不给策略） */
    conflictHint: '同一幂等键上出现了两笔不同载荷。先到的那条不会被自动改动，请你来定留哪一条。',
    conflictDetail: '冲突详情',
    hashLabel: '载荷指纹',
    /** 只显示短 hash，**不请求也不显示完整载荷**（FR-6.3） */
    hashShortHint: '只显示指纹前 8 位；完整载荷不展示，也不请求。',
    keepFirst: '保留先到的那条',
    acceptThis: '接受本条并改幂等键重试',
    reviewedToast: '已提交你的裁决。',
    /** 回流正文是不可信输入，一律纯文本渲染（FR-5.1.2.1） */
    untrustedNote: '内容由 agent 自报，按纯文本显示。',
    emptyFilterHint: '当前筛选无结果。',
    showAll: '显示全部',
  },

  install: {
    title: '让 agent 接入',
    hint: '下面只是指令文本，复制到你的终端执行即可 —— 注入是你的决定，面板不代执行。',
    pickAdapter: '选择平台',
    commandLabel: '安装指令',
    copy: '复制',
    copied: '已复制。',
    /** FR-5.4.3：error 态复用工程域既有文案，不新造 */
    retry: '重试',
  },

  /** 设置页第 7 区**同级**的新一区（FR-5.5） */
  settings: {
    title: '助手桥接',
    hint: '控制 agent 能不能往本机写东西。读取（上下文预览）不受这个开关影响。',
    writeLabel: '允许 agent 写入（回流）',
    defaultOffNote: '默认关闭 —— 与「只读默认」一致。关着的时候，agent 推来的条目会被整批拒绝。',
  },
  discuss: {
    title: '问一问本项目（AI · 逐段标注来源）',
    placeholder: '例如：这个项目现在到哪个阶段了？下一步该做什么？',
    ask: '提问',
    thinking: '思考中…',
    remember: '记住本项目的出网同意（下次免确认）',
    truncated: '上下文超预算已裁剪——回答可能缺段。',
  },
} as const
