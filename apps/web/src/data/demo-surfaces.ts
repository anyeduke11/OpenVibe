/**
 * 站点演示面清单（owner 增强项：为演示功能加统一标记，实现真实功能后去掉）。
 *
 * ## 它解决什么
 *
 * 站点里有若干「演示功能」—— 设计稿、假数据、未接 API 的展示、只改本地 state 的交互。
 * 它们**不是 bug**，是**待实现的真实功能**。此前标记口径不统一（三种 `designBadge` 文案、
 * 无机判），导致两件事说不清：
 *
 * ① **哪些是演示**（读者要逐个文件读注释才知道）；
 * ② **实现了没有**（真实功能接上后，标记可能忘了删 —— 而没人守）。
 *
 * ⇒ 本文件是**唯一出处**：一条 = 一个演示面。界面上不写字面量，只放 DemoChip 组件、
 *   并把本表某条的 id 作为它的 prop；文案与类别由本表给出；
 *   `tests/demo-surfaces.test.ts` 做**双向一致**机判。
 *
 * ⚠️ **注释里别写调用形态的示例**（连占位 id 也不行）—— 闸是纯文本扫描，
 *   注释里的示例会被当成真调用（首版踩过这个坑）。
 *
 * ## ⚠️ 四条使用纪律
 *
 * 1. **加标记 = 加一条**：新演示面上放一个 DemoChip（id 取本表新增条目的 id），
 *    同时在 `DEMO_SURFACES` 加一条。少了任一边，双向闸都会红。
 * 2. **实现真实功能 = 删一条**：把界面上的 DemoChip 与清单条目一并删掉，闸自然仍绿
 *    （双向一致不要求「必须有演示面」）。**别把标记留在已实现的功能上** —— 那正是本表要防的。
 * 3. **类别可多选**：一块演示面可以同时是「设计稿 + 假数据」，如实标。
 * 4. **`where` 必须指向真实文件**：闸会核对；标记挪了位置就改这一行。
 *
 * ## 与覆盖地图的分工
 *
 * `data/coverage.ts` 是**能力位粒度**（M1-1、G-2…），回答「这个能力做到哪一步」；
 * 本表是**页面/块粒度**，回答「这上面有东西是演示」。两者不重复：
 * 覆盖地图标 `design` 的能力位，实现后改状态；本表的条目，实现后**整条删除**。
 */

/** 演示面的类别闭集（四类，逐条对应「为什么它是演示」） */
export const DEMO_KINDS = ['design', 'fake-data', 'no-api', 'local-state'] as const
export type DemoKind = (typeof DEMO_KINDS)[number]

/** 类别元数据：标签 + chip 语气（**口径只留一处**） */
export const DEMO_KIND_META: Record<DemoKind, { label: string; tone: 'warn' | 'info' }> = {
  /** 设计稿：整块是先行设计，代码零实现 */
  design: { label: '设计稿', tone: 'warn' },
  /** 假数据：展示用的是写死的样例，不是真实取数 */
  'fake-data': { label: '假数据', tone: 'warn' },
  /** 未接 API：展示真实，但背后没有端点（或端点未实现） */
  'no-api': { label: '未接 API', tone: 'info' },
  /** 仅本地 state：交互只改内存，不落库 */
  'local-state': { label: '仅本地 state', tone: 'warn' },
}

export interface DemoSurface {
  /** 机判锚点：界面上的 DemoChip 用它当 id prop（**调用形态固定，供闸扫描**） */
  id: string
  /** 人可读名（页面或块） */
  label: string
  /** 落点：仓内相对路径（闸会核对文件真实存在，且该文件里确实引用了本 id） */
  where: string
  /** 类别（可多选，如实标） */
  kinds: DemoKind[]
  /** 实现前置：要把这块变成真实功能，需要先有什么（供「逐步实现」时参考） */
  prerequisite?: string
}

/**
 * 演示面清单。
 *
 * ⚠️ **顺序即展示序**：按「整页 → 块级」排，同页的块挨在一起。
 */
export const DEMO_SURFACES: DemoSurface[] = [
  {
    id: 'team-page',
    label: '团队协作页（整页）',
    where: 'apps/web/src/pages/TeamPage.tsx',
    kinds: ['design', 'fake-data', 'local-state'],
    prerequisite:
      'M7 多用户与角色（P2）。⚠️ 不越过 D-v25-7：S8「团队级知识库、多项目复用与版本管理」已裁定永久不做。',
  },
  {
    id: 'loading-page',
    label: '加载协议页（整页）',
    where: 'apps/web/src/pages/LoadingPage.tsx',
    kinds: ['design', 'fake-data'],
    prerequisite: 'U10 验证（S1 分层加载，D-v25-1 已裁「做、默认关、等 U10」）。',
  },
  {
    id: 'inject-conflict',
    label: '注入页 · 冲突处置卡',
    where: 'apps/web/src/pages/InjectPage.tsx',
    kinds: ['design', 'local-state'],
    prerequisite:
      '写盘唯一通道是 CLI（Web 只读）。⇒ 这块大概率不该在 Web 实现，而应改为「跳转 CLI」或只读展示处置结果。',
  },
  {
    id: 'inject-consistency',
    label: '注入页 · 一致性核验六态卡',
    where: 'apps/web/src/pages/InjectPage.tsx',
    kinds: ['design', 'no-api'],
    prerequisite:
      'CLI `verify` 已有六态口径，Web 侧需补一个只读端点（或复用 injection-status 扩展）。',
  },
  {
    id: 'growth-auto-stage',
    label: '成长页 · 阶段自动判定说明',
    where: 'apps/web/src/pages/GrowthPage.tsx',
    kinds: ['no-api'],
    prerequisite: 'D29 本机事件台账的读端点（RF1-5，尚未开工）。',
  },
]

/** 按 id 取一条；**找不到即抛**（界面上写了不存在的 id 是 bug，不是静默降级） */
export function demoSurface(id: string): DemoSurface {
  const hit = DEMO_SURFACES.find((s) => s.id === id)
  if (hit === undefined) {
    throw new Error(
      `未知演示面 id：${id} —— 请先在 apps/web/src/data/demo-surfaces.ts 登记，或删掉这个标记。`,
    )
  }
  return hit
}

/** chip 文案：`演示 · 设计稿·假数据`（多类别用 `·` 连） */
export function demoChipText(surface: DemoSurface): string {
  return `演示 · ${surface.kinds.map((k) => DEMO_KIND_META[k].label).join('·')}`
}

/**
 * chip 语气：含 `design` / `fake-data` / `local-state` 任一 ⇒ `warn`（这不是真实的）；
 * 只有 `no-api` ⇒ `info`（展示是真的，只是背后没端点）。
 */
export function demoTone(surface: DemoSurface): 'warn' | 'info' {
  const serious = surface.kinds.some((k) => k !== 'no-api')
  return serious ? 'warn' : 'info'
}
