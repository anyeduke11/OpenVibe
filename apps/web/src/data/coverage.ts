/**
 * 产品能力地图（原型顶栏「覆盖地图」的数据源）。
 *
 * ## 它回答什么
 *
 * 「这个产品承诺了什么、做到哪一步了、凭据在哪」。三列缺一不可：
 * - **状态**：`ok` 已上线 / `partial` 部分就绪 / `design` 仅设计稿 / `no` 裁定不做
 * - **出处**：指向**代码或规格**的具体位置 —— 没有出处的能力位等于没有
 *
 * ## 口径（2026-11-08 从原型迁移）
 *
 * 原型 `docs/prototypes/灵典-全功能Demo-成长视角-20261107.html` 的 `MAP` 是**演示样例**，
 * 但它的每一行都指向真实文件（`routes/prompts.ts:119,129` 之类）⇒ 直接迁移，不重编。
 *
 * ⚠️ **这份表会腐烂**：代码改了行号会漂、功能上了状态该改。
 *   刻意不做「自动从代码推断」—— 那会产出一份**永远看起来对**的表，
 *   而它的价值恰恰在于「人写下的一句状态判断」。改判就改这里，并在 DEV_LOG 留痕。
 *
 * ## 腐烂的反向检查（2026-11-08 加）
 *
 * 「状态该改未改」靠人留痕；**「出处指向的文件已不存在」可以机判** ——
 * `pathTokensOf()` 从出处里抽出路径 token，由测试解析并核对存在性。
 * ⚠️ 只判**能解析出路径**的条目：描述性出处（`PRD M5 · P1`、`P2`、`=FR-1` 等）
 *   天生没有路径，强行判会造出假红 —— 假红比不红更坏。
 */

export type CapabilityStatus = 'ok' | 'partial' | 'design' | 'no'

export interface Capability {
  /** 能力位编号（如 `M1-1` / `CM-A1`） */
  id: string
  /** 能力名（一句话说清「能做什么」） */
  name: string
  status: CapabilityStatus
  /** 出处：代码位置或规格条款 */
  source: string
}

export interface CapabilityGroup {
  /** 组名（含路由提示，如 `M1 提示词库 · /library`） */
  group: string
  items: Capability[]
}

export const STATUS_META: Record<
  CapabilityStatus,
  { label: string; tone: 'ok' | 'info' | 'warn' | 'danger' }
> = {
  ok: { label: '已上线', tone: 'ok' },
  partial: { label: '部分就绪', tone: 'info' },
  design: { label: '设计稿', tone: 'warn' },
  no: { label: '裁定不做', tone: 'danger' },
}

export const COVERAGE: CapabilityGroup[] = [
  {
    group: 'M1 提示词库 · /library',
    items: [
      {
        id: 'M1-1',
        name: '提示词 CRUD 与双栏编辑器（版本快照 / diff / 回滚）',
        status: 'ok',
        source: 'routes/prompts.ts:119,129',
      },
      {
        id: 'M1-2',
        name: '模板变量 {{var}}：复制时弹表单填值',
        status: 'ok',
        source: 'components/library/VariableFillModal.tsx',
      },
      {
        id: 'M1-3',
        name: '标签 / 文件夹 / FTS 全文搜索',
        status: 'ok',
        source: 'packages/core（SQLite FTS5）',
      },
      {
        id: 'M1-4',
        name: '平台适配标记与筛选（六 adapter）',
        status: 'ok',
        source: 'LibraryPage.tsx:137',
      },
      {
        id: 'M1-5',
        name: '导入导出：JSON / Markdown / 规则文件反向导入',
        status: 'ok',
        source: 'routes/prompts.ts:66,140',
      },
      {
        id: 'M1-6',
        name: 'AI 测试场：多模型并行对比试跑',
        status: 'design',
        source: 'PRD M1 · P3（Phase 3）',
      },
    ],
  },
  {
    group: 'M2 Skill 台账 · /skills',
    items: [
      {
        id: 'M2-1',
        name: '本机 skill 目录扫描与登记',
        status: 'ok',
        source: 'routes/skills.ts:75,83',
      },
      { id: 'M2-2', name: '更新检测（树指纹比对）', status: 'ok', source: 'routes/skills.ts:126' },
      {
        id: 'M2-3',
        name: '生态源导入（GitHub / SkillHub 检索与导入）',
        status: 'ok',
        source: 'routes/skills.ts:95,103',
      },
      {
        id: 'M2-4',
        name: '多平台分发（symlink / copy、冲突变体）',
        status: 'design',
        source: 'repos/skillLibrary.ts:36 明文「不做」',
      },
    ],
  },
  {
    group: 'M3 术语库 · /terms',
    items: [
      {
        id: 'M3-1',
        name: '词条 CRUD（中英名 / 别名 / 定义 / 示例 / 相关 / 来源）',
        status: 'ok',
        source: 'routes/terms.ts',
      },
      { id: 'M3-2', name: '拼音与英文双序搜索', status: 'ok', source: 'routes/terms.ts:38' },
      {
        id: 'M3-3',
        name: '多选生成 TERMS.md（alpha / 拼音 / 手动三种排序）',
        status: 'ok',
        source: 'routes/terms.ts:47',
      },
    ],
  },
  {
    group: 'M4 技巧库 · /playbooks',
    items: [
      {
        id: 'M4-1',
        name: '技巧 CRUD 与 PLAYBOOKS.md 导出',
        status: 'ok',
        source: 'routes/playbooks.ts:24-61',
      },
      {
        id: 'M4-2',
        name: '复盘回流草稿（带来源反链）',
        status: 'ok',
        source: 'components/projects/ReflowActions.tsx:16',
      },
    ],
  },
  {
    group: 'M5 项目与流程 · /projects',
    items: [
      { id: 'M5-1', name: '阶段与检查清单', status: 'ok', source: 'routes/projects.ts:124,175' },
      {
        id: 'M5-2',
        name: '任务看板（拖拽 / 键盘 / 按钮同效）',
        status: 'ok',
        source: 'components/projects/KanbanBoard.tsx:282',
      },
      {
        id: 'M5-3',
        name: '开发日志（DEV / CHECK，编号递增 + 验证记录）',
        status: 'ok',
        source: 'routes/devlog.ts:20-44',
      },
      {
        id: 'M5-4',
        name: '会话记录挂接（粘贴 AI 会话摘录为日志附件）',
        status: 'design',
        source: 'PRD M5 · P1',
      },
      {
        id: 'M5-5',
        name: '复盘回流入口（日志 → 术语 / 提示词 / 技巧草稿）',
        status: 'ok',
        source: 'ReflowActions.tsx:16',
      },
      {
        id: 'M5-6',
        name: '注入状态只读桥接（端口 / lock）',
        status: 'ok',
        source: 'routes/ports.ts:26',
      },
      {
        id: 'M5-7',
        name: '注入产物台账（逐文件扫描：IN_SYNC / DRIFT / ABSENT / FOREIGN / LOCK）',
        status: 'ok',
        source: 'routes/projects.ts:239',
      },
    ],
  },
  {
    group: 'M6 标准包与注入 · /packs + CLI',
    items: [
      {
        id: 'M6-1',
        name: '五步组包向导（新建与编辑同源）',
        status: 'ok',
        source: 'components/packs/PackWizard.tsx:35',
      },
      {
        id: 'M6-2',
        name: '预览即产物（与导出字节同源生成器）',
        status: 'ok',
        source: 'routes/packs.ts:84,91',
      },
      {
        id: 'M6-3',
        name: '内容指纹（sha256 前 12 位）与漂移检测',
        status: 'ok',
        source: 'PackWizard.tsx:447',
      },
      {
        id: 'M6-4',
        name: '体量与 token 估算（中文感知，超阈黄条不阻断）',
        status: 'ok',
        source: 'packages/core/src/pack/size.ts:28',
      },
      {
        id: 'M6-5',
        name: '导出两通道（bundle JSON / 目录）与导出 / 注入历史',
        status: 'ok',
        source: 'routes/packs.ts:97-136',
      },
      {
        id: 'M6-6',
        name: '冲突保护（diff 预览 + 强制备份 + 三选一）',
        status: 'ok',
        source: 'specs/m6-standard-pack.md FR-7.5',
      },
      {
        id: 'M6-7',
        name: 'CLI sync / diff / verify / clean（写盘唯一通道）',
        status: 'ok',
        source: 'apps/cli/src/commands/*',
      },
      {
        id: 'M6-8',
        name: '包生命周期 update / rollback（D31 三层）',
        status: 'design',
        source: 'CLI 无 update 子命令（标记已预埋）',
      },
      {
        id: 'M6-9',
        name: '块级合并（DRIFT 段级重写）',
        status: 'design',
        source: 'README 已知局限：整文件管理',
      },
      { id: 'M6-10', name: '一项目多包叠加', status: 'design', source: 'P2（lock 为单包结构）' },
      {
        id: 'M6-11',
        name: '双向同步（项目内改动回读比对）',
        status: 'design',
        source: 'PRD M6 · P1',
      },
    ],
  },
  {
    group: 'M7 团队协作',
    items: [
      {
        id: 'M7-1',
        name: '多用户与角色（owner / member / reviewer）',
        status: 'design',
        source: 'P2；代码无实现（stage.ts:63 仅文案）',
      },
      {
        id: 'M7-2',
        name: '变更评审流（PR 式先审后入团队标准）',
        status: 'design',
        source: 'P2',
      },
      { id: 'M7-3', name: '团队共享库与成员使用统计', status: 'design', source: 'P2' },
    ],
  },
  {
    group: 'M8 Agent 接入（bridge + panel）',
    items: [
      {
        id: 'M8-1',
        name: '项目上下文端点（fields 裁段 / budget 预算 / truncated 不静默截断）',
        status: 'ok',
        source: 'routes/agent.ts:101-108',
      },
      {
        id: 'M8-2',
        name: 'agent ingest 五类 kind 一律先落 pending、人工确认',
        status: 'ok',
        source: 'routes/agent.ts:78',
      },
      {
        id: 'M8-3',
        name: '幂等冲突裁决（先到不改一字，裁决在 Web）',
        status: 'ok',
        source: 'PendingIngestList.tsx:114-158',
      },
      {
        id: 'M8-4',
        name: '闭集外值整条 rejected（不自动扩闭集）',
        status: 'ok',
        source: 'specs/m8-agent-bridge.md',
      },
      {
        id: 'M8-5',
        name: 'MCP 只读工具面（project_context / search_assets / pack_diff）',
        status: 'ok',
        source: 'apps/cli/src/commands/mcp.ts（CLI 载体）',
      },
      { id: 'M8-6', name: 'command-run 本机台账', status: 'ok', source: 'routes/agent.ts:134' },
      {
        id: 'M8-7',
        name: '一键接入（多选平台 + 生成 sync/MCP 脚本，只生成不代执行）',
        status: 'ok',
        source: 'components/agent/InstallGuide.tsx:31',
      },
      {
        id: 'M8-8',
        name: '各平台 MCP 配置口径表（来源诚实标注，全部未实测）',
        status: 'partial',
        source: 'mcp-guide.ts:44',
      },
    ],
  },
  {
    group: 'M9 开发能力 · /dev /resources',
    items: [
      { id: 'M9-1', name: '语言知识点站位图', status: 'ok', source: 'routes/langRoadmap.ts:165' },
      { id: 'M9-2', name: '两门语言对照', status: 'ok', source: 'DevAbilityPage.tsx:53' },
      {
        id: 'M9-3',
        name: '源码解读抽屉（AI 解读服务）',
        status: 'ok',
        source: 'components/dev/SourceDrawer.tsx:26',
      },
      {
        id: 'M9-4',
        name: '学习资源清单（四维筛选 + 速成 / 精通标记）',
        status: 'ok',
        source: 'ResourcePage.tsx:22-55',
      },
      {
        id: 'M9-5',
        name: '语言站位图页签（掌握度三态汇总 · 全库，口径 shared/languageMastery）',
        status: 'ok',
        source: 'components/dev/StationMap.tsx:31',
      },
    ],
  },
  {
    group: '成长 · /growth',
    items: [
      { id: 'G-1', name: '阶段向量 F0–F3 与一键越级', status: 'ok', source: 'GrowthPage.tsx:59' },
      {
        id: 'G-2',
        name: '阶段自动判定（事件台账读端点 RF1-5）',
        status: 'design',
        source: 'GrowthPage.tsx:60「尚未开工」',
      },
      {
        id: 'G-3',
        name: '毕业信号采集',
        status: 'design',
        source: 'GrowthPage.tsx:61 恒标「待采集」',
      },
      {
        id: 'G-4',
        name: '遥测增长看板（对外公开页）',
        status: 'design',
        source: 'P2（现仅有本地飞轮卡片）',
      },
      {
        id: 'G-5',
        name: '圈数台账（逐项目列圈，与 loops 同源的五条判定 + 达成日）',
        status: 'ok',
        source: 'routes/settings.ts:308',
      },
    ],
  },
  {
    group: 'AI 能力（M10 + v0.2.3-d/e）',
    items: [
      {
        id: 'AI-1',
        name: 'discuss 项目问答（逐段标注来源，只读）',
        status: 'ok',
        source: 'routes/extract.ts:49',
      },
      {
        id: 'AI-2',
        name: 'ask 确定性问答（七个闭集关键词，不接 LLM）',
        status: 'partial',
        source: '仅 CLI（commands/ask.ts），Web 无入口',
      },
      {
        id: 'AI-3',
        name: '日志提取候选（总闸 + 逐项目同意 + 成本台账 + 预算熔断）',
        status: 'ok',
        source: 'routes/extract.ts:68 · specs/v023-d-ai-extract.md',
      },
      { id: 'AI-4', name: 'AI 测试场（多模型并行试跑）', status: 'design', source: 'P3' },
    ],
  },
  {
    group: 'v0.9 · 分层加载与规格面（S 批次）',
    items: [
      {
        id: 'S0',
        name: 'm11 规格先行（spec v0.1 入库 + 探针固化）',
        status: 'ok',
        source: 'DEV-0157 · specs/m11-context-loading.md',
      },
      {
        id: 'S1',
        name: 'LoadPlan + L2 文件（RULES.md / REFS.md）+ adapter 能力位',
        status: 'design',
        source: 'D-v25-1 已裁：做、默认关、等 U10',
      },
      {
        id: 'S2',
        name: 'StageGate 阶段闸（硬拒 + 强制推进入口留痕）',
        status: 'design',
        source: 'D-v25-2 已裁：仅 spec_driven',
      },
      {
        id: 'S3',
        name: 'SpecRecord + requirement_links + 需求三面接通',
        status: 'design',
        source: 'D-v25-3 已裁可做',
      },
      {
        id: 'S4',
        name: 'FreshnessProbe + 资产↔代码锚点（三态不折叠）',
        status: 'design',
        source: '依赖 S2 / R0 / R3',
      },
      {
        id: 'S5',
        name: '反例来源接通（antiPractice + 主文档反例指针）',
        status: 'design',
        source: 'D-v25-4：与 S1 同批',
      },
      {
        id: 'U10-U14',
        name: '五项验证实验（六平台读 L2 / 行为退化 / 闸拦截率 / 锚点命中 / 需求三面）',
        status: 'design',
        source: 'PRD v0.2.5 §7.2 · 全部未运行',
      },
    ],
  },
  {
    group: '上下文管理（CM，2026-11-03）',
    items: [
      {
        id: 'CM-A1',
        name: '平台「实际读入」文件清单单一出处',
        status: 'ok',
        source: 'context-management-requirements §CM-A1',
      },
      {
        id: 'CM-A2',
        name: '注入作用域与估算清单逐文件一致',
        status: 'design',
        source: '=FR-1 / A-1 待 owner 签收',
      },
      {
        id: 'CM-A3',
        name: '字节 / token / 密度三读数口径',
        status: 'partial',
        source: '=FR-2；密度分母待裁',
      },
      {
        id: 'CM-A4',
        name: '单文件越阈指名告警（提示不阻断）',
        status: 'design',
        source: '=R-1；m11 FR-4 已定义未实现',
      },
      {
        id: 'CM-A5',
        name: '落盘可恢复（dry-run / 备份 / 原子写 / 并发锁）',
        status: 'ok',
        source: 'sync 用例族',
      },
      {
        id: 'CM-A6',
        name: '四套文件状态词表语义映射表',
        status: 'design',
        source: '=FR-3 / R-3',
      },
      {
        id: 'CM-A7',
        name: '契约变更 A 级红线流程',
        status: 'ok',
        source: '流程条款（人工执行）',
      },
      {
        id: 'CM-B1',
        name: 'LoadPlan = {required, referenced}',
        status: 'design',
        source: '=m11 FR-2，同 S1',
      },
      {
        id: 'CM-B2',
        name: 'adapter 能力位三态（true / false / 未声明）',
        status: 'design',
        source: '=m11 FR-3.1，同 S1',
      },
      {
        id: 'CM-B3',
        name: '能力关闭时产物与今天逐字节相同（E-6）',
        status: 'design',
        source: '=m11 FR-5.1 硬约束',
      },
      {
        id: 'CM-B4',
        name: 'L0 索引三要素 + L0↔L2 单向引用',
        status: 'design',
        source: '=m11 FR-1.1/1.4/1.5',
      },
      {
        id: 'CM-B5',
        name: '能力位真伪验证（U10 / U11 前不得置 true）',
        status: 'design',
        source: 'U10 阻塞',
      },
      {
        id: 'CM-C1',
        name: '标记 / 清单 / 路径常量唯一出处，消费方零字面量',
        status: 'ok',
        source: 'context:check C-1/C-2',
      },
      {
        id: 'CM-C2',
        name: '分层纪律机判（core / adapters / shared）',
        status: 'ok',
        source: 'context:check C-3',
      },
      {
        id: 'CM-C3',
        name: '规格上下游闭合棘轮（只降不升）',
        status: 'ok',
        source: 'FR-4 已落地（v1.1）',
      },
      {
        id: 'CM-C4',
        name: '漂移数字一律「复算命令 + 采样日期」',
        status: 'ok',
        source: 'docs:check FR-11',
      },
      {
        id: 'CM-C5',
        name: '退役动作表与基线反向登记',
        status: 'design',
        source: '=FR-5 登记态',
      },
      {
        id: 'CM-C6',
        name: '本地与 CI 同源校验',
        status: 'ok',
        source: 'FR-6 已落地（钩子需安装 .git/hooks）',
      },
      {
        id: 'CM-D1',
        name: '体量密度口径（归因 / 上脸 / 判级）',
        status: 'design',
        source: 'specs/context-density FR-1–6 全部未实现',
      },
    ],
  },
  {
    group: '治理与台账',
    items: [
      {
        id: 'T-1',
        name: '本机事件台账（23 类 kind，不出网，一次性清空）',
        status: 'ok',
        source: 'routes/localEvents.ts:44,78',
      },
      {
        id: 'T-2',
        name: '匿名遥测（默认关、三类白名单、关闭零外联）',
        status: 'ok',
        source: 'routes/settings.ts:142,168',
      },
      {
        id: 'T-3',
        name: '上下文治理面板（趋势 / 棘轮 / 合并清单）',
        status: 'ok',
        source: 'ContextGovernanceSection.tsx:203',
      },
      {
        id: 'T-4',
        name: 'docs:check / context:check / bundle:check 三道闸',
        status: 'ok',
        source: 'package.json scripts',
      },
      {
        id: 'T-5',
        name: 'CLI 体量展示（--dry-run 输出 ≈token）',
        status: 'design',
        source: 'R-2 产品决策待裁',
      },
      {
        id: 'T-6',
        name: '整包足迹 footprint.bytes 展示',
        status: 'design',
        source: 'R-4 产品决策待裁',
      },
    ],
  },
  {
    group: '裁定不做（owner 裁定保留）',
    items: [
      {
        id: 'S6',
        name: '效能度量面（工时 / 缺陷 / 返工）',
        status: 'no',
        source: 'D-v25-5：单用户本机无分母',
      },
      {
        id: 'S8',
        name: '团队级知识库、多项目复用与版本管理',
        status: 'no',
        source: 'D-v25-7：不改写单用户信任模型',
      },
    ],
  },
  {
    group: '设置与开箱 · /settings',
    items: [
      {
        id: 'S-1',
        name: '首启向导 ≤3 步可跳过（每步真实副作用）',
        status: 'ok',
        source: 'specs/onboarding.md',
      },
      {
        id: 'S-2',
        name: '种子内容与重播幂等（术语 109 / 模板 7 / 提示词 21）',
        status: 'ok',
        source: 'routes/settings reseed',
      },
      {
        id: 'S-3',
        name: '预置演示包 default@1.0.0 自动组装',
        status: 'ok',
        source: '首启播种',
      },
      {
        id: 'S-4',
        name: '解读服务多份配置',
        status: 'ok',
        source: 'routes/langSourceAi.ts:294,312',
      },
      {
        id: 'S-5',
        name: '备份说明与数据目录展示',
        status: 'ok',
        source: 'SettingsSections',
      },
    ],
  },
]

/** 汇总：各状态的能力位数（顶栏按钮的角标与弹层头部用） */
export function coverageTotals(): Record<CapabilityStatus, number> {
  const out: Record<CapabilityStatus, number> = { ok: 0, partial: 0, design: 0, no: 0 }
  for (const g of COVERAGE) for (const it of g.items) out[it.status]++
  return out
}

/* ════════════════════════════════════════════════════════ 出处可复算 ════════════════════════════════════════════════════════ */

/** 文件型 token 的扩展名白名单（`routes/settings` 这类无扩展名的走「补扩展名」分支） */
const FILE_EXT = /\.(?:ts|tsx|md|json|sql|mjs|cjs|js)$/

/**
 * 从出处文本里抽出**像仓内路径**的 token。
 *
 * 三条纪律（每条都是被假红教育出来的）：
 * ① **含中文即弃** —— 中文与路径之间没有词边界，`（stage.ts:63 仅文案）` 这类
 *    括号里的提及会被误当出处。故按「非中文字符类」切，抽出的 token 必是纯 ASCII 串。
 * ② **行号必剥** —— `routes/prompts.ts:119,129` 的行号部分（`:119,129`）不进 token；
 *    行号会漂，把它写进检查等于让闸天天红。
 * ③ **`.git/` 前缀即弃** —— `.git/hooks` 是 git 内部目录，不是「产品出处」。
 *
 * @param source 出处原文
 * @returns 抽出的 token 列表（按出现顺序，去重）
 */
export function pathTokensOf(source: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // 路径字符集：字母数字 `_ - . /`；**不含中文、不含 `:` `（` `）` `「` `」`**
  const re = /[A-Za-z0-9_./-]+/g
  for (const m of source.matchAll(re)) {
    let token = m[0] ?? ''
    // 剥尾部标点（`.` `-` `_` 可能因正则贪心带进来）
    while (token.length > 1 && /[.\-_/]$/.test(token)) token = token.slice(0, -1)
    // 剥前导 `./` 与 `/`
    while (token.startsWith('./') || token.startsWith('/'))
      token = token.slice(token.startsWith('./') ? 2 : 1)
    if (token === '' || token === '.') continue
    if (token.startsWith('.git/')) continue
    // 必须「像路径」：含 `/`，或以白名单扩展名结尾
    const looksPath = token.includes('/') || FILE_EXT.test(token)
    if (!looksPath) continue
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

/** 出处里的前缀 → 仓内目录（**单处维护**；新前缀只在这里加） */
const SOURCE_PREFIX_DIRS: [RegExp, string][] = [
  [/^routes\//, 'apps/server/src/routes/'],
  [/^components\//, 'apps/web/src/components/'],
  [/^pages\//, 'apps/web/src/pages/'],
  [/^hooks\//, 'apps/web/src/hooks/'],
  [/^i18n\//, 'apps/web/src/i18n/'],
  [/^growth\//, 'apps/web/src/growth/'],
  [/^api\//, 'apps/web/src/api/'],
  [/^lib\//, 'apps/web/src/lib/'],
  [/^data\//, 'apps/web/src/data/'],
  [/^repos\//, 'packages/core/src/repos/'],
  [/^commands\//, 'apps/cli/src/commands/'],
  [/^db\//, 'packages/core/src/db/'],
  [/^services\//, 'packages/core/src/services/'],
  [/^inject\//, 'packages/core/src/inject/'],
]

/** 本身已是仓内相对路径的前缀（`specs/` 在仓里是 `docs/specs/`） */
const SOURCE_DIRECT_DIRS: [RegExp, string][] = [
  // ⚠️ token 自带 `specs/`，故前缀写成 `docs/`（拼出 `docs/specs/…`），不是 `docs/specs/` + token
  [/^specs\//, 'docs/'],
  [/^(apps|packages|docs|scripts|tests|deploy)\//, ''],
]

/**
 * 把一个 token 解析成**候选仓内路径**（不含扩展名补全；补全由调用方按需做）。
 *
 * 解析不出即 `null`（描述性出处走这条，**不判红**）。
 * ⚠️ 裸 basename（如 `PackWizard.tsx`）需要全仓索引才能解析 —— 调用方传 `basenameIndex`。
 */
export function resolveSourceToken(
  token: string,
  basenameIndex: Map<string, string[]> = new Map(),
): string[] {
  for (const [re, dir] of SOURCE_PREFIX_DIRS) {
    if (re.test(token)) return [dir + token.slice(token.indexOf('/') + 1)]
  }
  for (const [re, dir] of SOURCE_DIRECT_DIRS) {
    if (re.test(token)) return [dir + token]
  }
  // 裸 basename：靠全仓索引反查（唯一命中才解析；重名即不可判 ⇒ 返回空，不猜）
  const hits = basenameIndex.get(token)
  if (hits !== undefined && hits.length === 1) return [hits[0]!]
  return []
}

/** 无扩展名的 token 的补全候选（按仓内实际存在的优先级） */
export const EXT_SUFFIXES = ['', '.ts', '.tsx', '.md', '.json'] as const
