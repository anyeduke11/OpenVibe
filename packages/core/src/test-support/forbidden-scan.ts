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
  { label: 'Unix 绝对路径', re: /(^|[\s"'(=:,[])\/(?:Users|home|tmp|var|etc|opt|private|Applications)\// },
  { label: '任意根目录绝对路径', re: /(^|[\s"'(=:,[])\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/ },
  { label: 'Windows 绝对路径', re: /[A-Za-z]:\\|\\\\/ },
  { label: '本机用户名', re: new RegExp(`\\b${USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') },
  { label: 'home 目录片段', re: new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
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
