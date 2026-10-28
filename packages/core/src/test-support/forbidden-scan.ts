/**
 * 台账 `payload_json` 的禁列扫描器（`local-event-ledger.md` FR-6.3 ＋ `m8-agent-bridge.md` FR-5.1.2）。
 *
 * ## 为什么要抽成单一实现（2026-10-17）
 *
 * 实测这两份 FR 的守卫**各自复制了一份**扫描器：一份在
 * `apps/server/test/local-events.writepoints.test.ts`，一份在
 * `apps/server/test/commandRun.api.test.ts`。两份都是**否定式判据**（没写错就永远绿），
 * 所以一旦漂移，**没有任何一侧会红** —— 而「FR-6.3 的禁列比 FR-5.1.2 严」
 * 这件事永远不会有人知道。故收成一份，两侧共用。
 *
 * ## 这是否定式判据，必须自证
 *
 * 扫描器写错了永远绿。故 `selfProof` 提供一条「故意造脏行 ⇒ 必须报」的腿，
 * 让**扫描器本身**进入被测范围，而不是只拿它去测别人。
 *
 * ## 递归展开，而不是只扫顶层
 *
 * `payload` 嵌一层对象就漏，是这类检查最常见的失效方式。
 */
import { homedir, userInfo } from 'node:os'

/**
 * 扫一条台账行所需的**最小形状** —— 扫描器只读这三列，多余的列它一概不看。
 *
 * ⚠️ 刻意不给索引签名：加了它之后，反过来要求所有赋值类型（测试里的完整行 `Row`）
 *   也带索引签名，于是「造一条脏行」反而更难写。宁可调用点多写两行裁字段 ——
 *   那顺带让「我到底给扫描器喂了什么」变得一眼可见。
 */
export interface ForbiddenRow {
  payload_json: string
  subject_type?: string | null
  subject_id?: string | null
}

/** 递归展开所有字符串值 */
export function stringValues(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) stringValues(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringValues(x, out)
  return out
}

const USER = userInfo().username

export const FORBIDDEN: { label: string; re: RegExp }[] = [
  {
    label: 'Unix 绝对路径',
    re: /(^|[\s"'(=:,[])\/(?:Users|home|tmp|var|etc|opt|private|Applications)\//,
  },
  { label: '任意根目录绝对路径', re: /(^|[\s"'(=:,[])\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/ },
  { label: 'Windows 绝对路径', re: /[A-Za-z]:\\|\\\\/ },
  {
    label: '本机用户名',
    re: new RegExp(`\\b${USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  },
  { label: 'home 目录片段', re: new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
]

/**
 * 规格禁列清单 → 守卫机制的对照表。
 *
 * ## 为什么要它（2026-10-17 实测）
 *
 * 规格禁列的是**四类内容**，而 `FORBIDDEN` 只有五条路径/身份规则 ⇒
 * **「项目名」与「资产正文 / 会话正文」扫描器根本没有规则**。它们靠的是
 * 写入点**按白名单构造 payload**，而不是事后过滤。
 *
 * 这个事实此前只存在于我的判断里，**没有任何机器能核**。于是：
 * - 有人删掉某处白名单构造、把入参 spread 进 payload ⇒ 只要那处的键闭集断言
 *   也恰好一起被删了，就**不会有任何东西变红**；
 * - 「扫描器漏了哪几项」永远要靠人记得。
 *
 * 故登记成表，并配测试：每个禁列项必须能指认机制，且机制为 `scanner` 的项
 * 必须真的在 `FORBIDDEN` 里有一条对应规则。**表里不许出现「只靠人记得」。**
 */
export type ForbiddenMechanism = 'scanner' | 'writepoint'

export interface ForbiddenCoverage {
  item: string
  /** 规格原文出处，便于人工回查 */
  specRef: string
  mechanism: ForbiddenMechanism
  /** mechanism 为 scanner 时，对应 `FORBIDDEN` 里的标签；writepoint 时说明由谁保证 */
  guard: string
  /**
   * mechanism 为 writepoint 时：**为什么正则兜不住**。
   * 「项目名」「资产正文」都是**任意自由文本** —— 正则无法可靠识别「这段文字算不算项目名」，
   * 硬写一条正则只会制造误报与漏报并存。故只能靠写入点不把自由文本放进 payload。
   */
  whyNotRegex?: string
}

export const FORBIDDEN_COVERAGE: ForbiddenCoverage[] = [
  {
    item: '绝对路径',
    specRef: 'local-event-ledger.md FR-6.3 ＋ m8-agent-bridge.md FR-5.1.2',
    mechanism: 'scanner',
    guard: 'Unix 绝对路径',
  },
  {
    item: 'Windows 绝对路径',
    specRef: 'local-event-ledger.md FR-6.3（跨机种同项）',
    mechanism: 'scanner',
    guard: 'Windows 绝对路径',
  },
  {
    item: '用户名',
    specRef: 'local-event-ledger.md FR-6.3 ＋ m8-agent-bridge.md FR-5.1.2',
    mechanism: 'scanner',
    guard: '本机用户名',
  },
  {
    item: '本机 home 目录片段',
    specRef: 'm8-agent-bridge.md FR-5.1.2 的 `cwd`',
    mechanism: 'scanner',
    guard: 'home 目录片段',
  },
  {
    item: '项目名',
    specRef: 'local-event-ledger.md FR-6.3 ＋ m8-agent-bridge.md FR-5.1.2',
    mechanism: 'writepoint',
    guard: '写入点按白名单构造 payload（各 kind 的 AGENT_PAYLOAD_KEYS / PAYLOAD_KEYS）',
    whyNotRegex: '项目名是任意自由文本，正则无法可靠判断「这串字是不是某个项目的名字」',
  },
  {
    item: '资产正文 / 会话正文 / body 片段',
    specRef:
      'local-event-ledger.md FR-6.3「资产正文」＋ m8-agent-bridge.md FR-5.1.2「会话正文／body」',
    mechanism: 'writepoint',
    guard: '同上：白名单构造，业务正文根本不会进入台账 payload',
    whyNotRegex: '正文是任意长自由文本；正则只能覆盖「恰好长得像路径」的子集，其余静默漏过',
  },
  {
    /**
     * M9（m9-dev-language-roadmap.md v1.6 P0.3）：
     * `lang_*` 命名空间的全部 kind 必须在「同一道禁列扫描器下」走。
     *
     * 为什么不单写一个 `LangEventsRepo` 写点 + 一份新扫描器：那次「FR-6.3 守卫被
     * 复制两份、漂移没人知道」的教训（2026-10-17）正是这条 —— 写新扫描器时不会
     * 把它与旧扫描器做对账，而禁列规则会**真的不一样**。这里直接复用 `scanForbidden`，
     * 配 P1b 的 `LangEventsRepo` 单一写入点。
     */
    item: 'lang_* 命名空间（lang_topic_findings / lang_source_consent / lang_source_shares / lang_resource_probe）',
    specRef: 'm9-dev-language-roadmap.md v1.6 §3.14–§3.16 / §3.17.1 / §3.21',
    mechanism: 'scanner',
    guard: 'Unix 绝对路径', // 与本地台账共用同一道禁列规则
  },
]

/** 返回命中的禁列标签列表（空数组 = 干净） */
export function scanForbidden(row: ForbiddenRow): string[] {
  let payload: unknown
  try {
    payload = JSON.parse(row.payload_json)
  } catch {
    // 解析不了就不是「干净」，按禁列报 —— 宁可误报也不放过
    return ['payload_json 不可解析']
  }
  const haystack = [...stringValues(payload), row.subject_type ?? '', row.subject_id ?? '']
  return FORBIDDEN.filter((f) => haystack.some((s) => f.re.test(s))).map((f) => f.label)
}

/** payload 的键，**已排序**。⚠️ 与闭集表比时两侧都要排序，别指望声明顺序碰运气 */
export function payloadKeys(row: ForbiddenRow): string[] {
  return Object.keys(JSON.parse(row.payload_json) as Record<string, unknown>).sort()
}

/**
 * 扫描器自证：拿一条**已知含禁列**的脏行去扫，必须报出。
 *
 * 用嵌套两层的结构 —— 只扫顶层会漏，而那正是本扫描器存在的理由
 * （`stringValues` 递归）。故这一条同时钉死「递归」与「规则命中」两件事。
 */
export function selfProofRows(): { dirty: ForbiddenRow; expectLabel: string } {
  return {
    dirty: {
      payload_json: JSON.stringify({
        note: '嵌套两层的路径',
        meta: { deeper: { cwd: `${homedir()}/secret` } },
      }),
    },
    expectLabel: 'home 目录片段',
  }
}
