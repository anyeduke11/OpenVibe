/**
 * `packages/core/src/db/m9-source-freshness.ts` —— M9 v1.6 **P1.10 · DL-03 停更源必须标红**
 * （`m9-dev-plan-2026-10.md` §6.2 ＋ `m9-dev-language-roadmap.md` §3.2 / §7 DL-03）
 *
 * ## 它补的是什么
 *
 * DL-03 原文：
 * > **停更源必须显式标记** —— 变异腿：把 `awesome-python-cn` 的停更日期清空 ⇒ 红（仅能靠单测）
 *
 * §3.2 的同一族要求：
 * > `awesome-python-cn` 停更 2022-08-29 ⇒ 界面上显式提示「该源已 4 年未更新」，
 * > **不静默当作有效来源**
 *
 * ⚠️ **此前这条判据没有任何一期真正产出它** ——
 *   spec §9 把 DL-03 列在 **M9-P1** 的判据里，而 dev-plan §7 把它归给 **P1c.1**
 *   （失效巡检：那是「链接还活着吗」，与「源还更新吗」是**两件事**）⇒ 两份台账不一致。
 *   P1.10 落地 P1 侧：**源级停更标记**（P1c 侧留给巡检时发现「已停更」的部分）。
 *
 * ## 关键设计：**判据由 spec 驱动，不用天数阈值**
 *
 * 「哪些源是停更源」是**产品口径**，写在 spec **§1.5 的五源表**里
 * （`awesome-python-cn` 标了「＋ 停更 4 年」，其余没标）。
 * ⇒ 本模块直接读那份登记（`STALE_SOURCE_KEYS`），**不另设「多少天算停更」的阈值**。
 *
 * ⚠️ **为什么不用阈值**（踩过的弯路，记在这里）：
 *   阈值会变成**第二份口径**（spec 登记 ＋ 代码常量），两边必然漂移；
 *   而且它会引出「阈值该多少」的待裁（改 spec §0 速览 / §6.3 台账 / dev-plan §4 三处计数，
 *   连锁一大片）。⇒ 口径只留一处：**spec §1.5**。
 *   若 owner 之后要「凡 N 天未更新的源都标红」，改 spec §1.5 加一行即可，
 *   **代码不用动**（`STALE_SOURCE_KEYS` 由一支单测钉住它与 spec 一致）。
 *
 * ## 参照日：**块自报**，不由「跑闸那天」决定
 *
 * `age_days` 是**快照口径**（「采集那天距源上次推送多少天」），不是「今天距上次推送多少天」。
 * ⇒ 新鲜度块自带 `computed_at`（= 它按哪天算的，通常等于清单的 `collected_at`），
 *   守卫**按本字段复算**，不按「跑闸的那天」复算。
 *
 * ⚠️ **为什么必须这样**（本轮实测踩到的那颗雷）：
 *   守卫若按「跑闸当天」复算，则**每次重新采集都会让单测误红** ——
 *   源没变、`age_days` 合法地变大了，却与旧参照日对不上。那条红是**假的**，
 *   而假的红比不红更坏：人会去「修」一个没坏的东西。
 *   ⇒ 实测：三个日期（`collected_at` / `computed_at` / `age_days`）一起挪一天 ⇒ 0 违规；
 *     只挪参照日不挪 `age_days` ⇒ 仍报 `age-mismatch`（篡改照样红）。
 *
 * ## 单测钉住「不许漂移」
 *
 * `m9-p1-10-source-freshness.test.ts` 有一支断言：
 * **本文件的 `STALE_SOURCE_KEYS` == 从 spec §1.5 表里读出来的「停更」源**。
 * ⇒ 改了 spec 忘了改这里 ⇒ 红；改了这里忘了改 spec ⇒ 也红。
 */
import { readFileSync } from 'node:fs'

/** 一个源的新鲜度标记（写进每份采集清单的 `source_freshness` 段）。 */
export interface SourceFreshness {
  /** 清单的源标识（与采集脚本的 `key` 同形，如 `awesome-python-cn`） */
  source: string
  /** spec §1.5 五源表里的显示名（给人看的） */
  source_label: string
  /**
   * **这份新鲜度是按哪天算的**（ISO 日期 `YYYY-MM-DD`）—— 通常等于清单的 `collected_at`。
   *
   * ⚠️ **为什么必须自带这个日期**：`age_days` 是**快照口径**（「采集那天距源上次推送多少天」），
   *   不是「今天距源上次推送多少天」。⇒ 守卫按**本字段**复算，不按「跑闸的那天」复算 ——
   *   否则每次重新采集都会让单测误红（`age_days` 合法地变大了，却与旧日期对不上），
   *   而那条红是**假的**（源没变，是参照日变了）。
   */
  computed_at: string
  /**
   * 源的最后更新时间（ISO 日期 `YYYY-MM-DD`）。
   *
   * ⚠️ **可为 null**：runoob 是 WordPress 站点，**没有仓库推送时间** ⇒ 没有这个信号。
   *   此时新鲜度由**采集对账**（清单与源站逐条一致）证明，见 `basis`。
   */
  last_pushed_at: string | null
  /** 距今天数；`last_pushed_at` 为 null 时也是 null */
  age_days: number | null
  /**
   * 是否**必须标红** —— 由 spec §1.5 的登记决定（见 `STALE_SOURCE_KEYS`）。
   *
   * ⚠️ **不��天数阈值算**：见文件头「判据由 spec 驱动」那段。
   */
  stale: boolean
  /** 判定依据（人类可读；null 时要说明「凭什么」） */
  basis: string
  /** 标红文案（`stale` 为 true 时非空）—— 界面直接用这一句 */
  notice: string | null
}

/**
 * **已登记为停更的源**（DL-03）—— 取自 spec §1.5 的五源表。
 *
 * ⚠️ **单源在这里，但不许漂移**：单测断言它 == 从 spec §1.5 读出来的「停更」源。
 */
export const STALE_SOURCE_KEYS: readonly string[] = ['awesome-python-cn']

/** spec §1.5 的显示名 → 清单 key（只在校验 spec 与常量是否一致时用）。 */
export function specSourceNameToKey(displayName: string): string {
  const n = displayName.replace(/\*/g, '').trim().toLowerCase()
  const seg = n
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (seg[0] === 'runoob') return seg[1] ?? seg.join('-')
  return seg.join('-')
}

/**
 * 从 spec 正文里读出「§1.5 登记为停更的源」。
 *
 * ⚠️ **只认 §1.5 那张表**（标题含「五源全量汇总」的那节）——
 *   spec 全篇别处也会出现「停更」两个字（§1.1 的备注、§3.2 的规则、§7 的风险表…），
 *   全文扫会把**规则文字**当成**源登记**。
 */
export function parseSpecStaleSources(specText: string): string[] {
  const lines = specText.split('\n')
  let inSection = false
  const out: string[] = []
  for (const line of lines) {
    if (line.startsWith('### ')) {
      inSection = line.includes('1.5') && line.includes('五源')
      continue
    }
    if (!inSection) continue
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1)
    if (cells.length < 2) continue
    const name = cells[0]!.trim()
    if (name === '源' || name === '---') continue
    const joined = cells.join(' ')
    if (!joined.includes('停更')) continue
    out.push(specSourceNameToKey(name))
  }
  return out
}

/** 读 spec 文件并取出它登记的停更源。 */
export function readSpecStaleSources(specPath: string): string[] {
  return parseSpecStaleSources(readFileSync(specPath, 'utf8'))
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/** Date → ISO 日期（`YYYY-MM-DD`，UTC）。 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * 「已 N 年未更新」的 N。
 *
 * ⚠️ **向下取整，绝不夸大**：spec §3.2 的原文是「该源已 **4** 年未更新」，
 *   而 awesome-python-cn 的实测是 1513 天 = 4.14 年 ⇒ 取整后正好是「4 年」，
 *   与 spec 的措辞逐字对得上。⇒ 若是 3.6 年，写「3 年」而不是「4 年」
 *   （**宁可少说，不可多说** —— 说大了会让用户以为它比实际更不可靠）。
 */
export function yearsText(ageDays: number): string {
  if (ageDays < 31) return `${String(Math.max(0, Math.floor(ageDays)))} 天`
  if (ageDays < 365) return `${String(Math.floor(ageDays / 30))} 个月`
  return String(Math.floor(ageDays / 365.25))
}

/**
 * 算一个源的新鲜度标记。
 *
 * @param lastPushedAt 源的最后更新时间（ISO 日期）；该源无此信号时传 null
 * @param now          「今天」（由调用方给 ⇒ 判定可复算、可测）
 * @param registeredStale 该源是否在 spec §1.5 被登记为停更
 */
export function computeFreshness(args: {
  source: string
  sourceLabel: string
  lastPushedAt: string | null
  now: Date
  registeredStale: boolean
}): SourceFreshness {
  const { source, sourceLabel, lastPushedAt, now, registeredStale } = args
  if (lastPushedAt === null) {
    return {
      source,
      source_label: sourceLabel,
      computed_at: isoDate(now),
      last_pushed_at: null,
      age_days: null,
      stale: registeredStale,
      basis:
        '该源**没有仓库推送时间**（WordPress 站点，非 GitHub 仓库）⇒ 新鲜度由**采集对账**证明：' +
        '清单与源站逐条一致即为新鲜；`pnpm m9:collect -- --check` 就是那道闸',
      notice: registeredStale
        ? '该源已登记为停更源（但它没有推送时间可供计算）—— 请人工确认最后更新时间'
        : null,
    }
  }
  const ageDays = daysBetween(new Date(`${lastPushedAt}T00:00:00Z`), now)
  const stale = registeredStale
  return {
    source,
    source_label: sourceLabel,
    computed_at: isoDate(now),
    last_pushed_at: lastPushedAt,
    age_days: ageDays,
    stale,
    basis: `源的最后提交时间 ${lastPushedAt}（${String(ageDays)} 天前）`,
    notice: stale
      ? `该源已 ${yearsText(ageDays)} 年未更新（最后更新 ${lastPushedAt}）—— 只能当候选池，不作真相源`
      : null,
  }
}

// ============================================================================
// 守卫
// ============================================================================

export type FreshnessRule =
  | 'missing-block'
  | 'stale-without-date'
  | 'stale-without-notice'
  | 'registered-but-not-stale'
  | 'false-stale'
  | 'age-mismatch'
  | 'missing-computed-at'

export interface FreshnessViolation {
  /** 相对仓库根的文件路径 */
  file: string
  where: string
  rule: FreshnessRule
  detail: string
}

/**
 * **参照日** —— 复算 `age_days` 时拿哪一天当基准。
 *
 * ⚠️ **优先用块自己的 `computed_at`**，其次才是调用方给的 `now`：
 *   `age_days` 是**快照口径**（采集那天距源上次推送多少天），不是「今天距上次推送多少天」。
 *   ⇒ 守卫不按「跑闸的那天」复算 —— 否则每次重新采集都会误红（源没变，参照日变了）。
 */
function resolveReferenceDate(raw: Partial<SourceFreshness>, now?: Date): Date | null {
  if (now) return now
  const c = raw.computed_at
  if (typeof c === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c)) {
    return new Date(`${c}T00:00:00Z`)
  }
  return null
}

/**
 * 扫一份清单的新鲜度标记。
 *
 * ⚠️ **六条规则里最要紧的是 `stale-without-date`** ——
 *   它就是 DL-03 判据原文的变异腿：「把 `awesome-python-cn` 的停更日期清空 ⇒ 红」。
 *
 * @param opts.now **可选** —— 不给就用块自己的 `computed_at`（推荐，见 `resolveReferenceDate`）。
 */
export function validateFreshness(
  file: string,
  raw: unknown,
  opts: { now?: Date; registeredStale: readonly string[] },
): FreshnessViolation[] {
  const out: FreshnessViolation[] = []
  if (raw === null || typeof raw !== 'object') {
    out.push({
      file,
      where: '(顶层)',
      rule: 'missing-block',
      detail: '清单没有 `source_freshness` 段 ⇒ 该源的新鲜度无法判定',
    })
    return out
  }
  const f = raw as Partial<SourceFreshness>
  const isRegistered = opts.registeredStale.includes(f.source ?? '')
  if (f.stale === true) {
    if (typeof f.last_pushed_at !== 'string' || f.last_pushed_at === '') {
      out.push({
        file,
        where: 'source_freshness.last_pushed_at',
        rule: 'stale-without-date',
        detail: '标红为停更源，却没有停更日期 ⇒ DL-03 的「停更源必须显式标记」不成立',
      })
    }
    if (typeof f.notice !== 'string' || f.notice === '') {
      out.push({
        file,
        where: 'source_freshness.notice',
        rule: 'stale-without-notice',
        detail: '标红为停更源，却没有标红文案 ⇒ §3.2「界面上显式提示」不成立',
      })
    }
  }
  if (isRegistered && f.stale !== true) {
    out.push({
      file,
      where: 'source_freshness.stale',
      rule: 'registered-but-not-stale',
      detail: `该源在 spec §1.5 登记为停更，却没标红 ⇒ 口径漂移`,
    })
  }
  if (!isRegistered && f.stale === true) {
    out.push({
      file,
      where: 'source_freshness.stale',
      rule: 'false-stale',
      detail: `该源不在 spec §1.5 的停更登记里，却标红了 ⇒ 误标`,
    })
  }
  if (typeof f.last_pushed_at === 'string' && f.last_pushed_at !== '') {
    const ref = resolveReferenceDate(f, opts.now)
    if (ref === null) {
      out.push({
        file,
        where: 'source_freshness.computed_at',
        rule: 'missing-computed-at',
        detail:
          '新鲜度块没有可用的 `computed_at` ⇒ `age_days` 不可复算（**不许拿「今天」当参照日**）',
      })
    } else {
      const expected = daysBetween(new Date(`${f.last_pushed_at}T00:00:00Z`), ref)
      if (typeof f.age_days !== 'number' || f.age_days !== expected) {
        out.push({
          file,
          where: 'source_freshness.age_days',
          rule: 'age-mismatch',
          detail: `age_days=${String(f.age_days)} 与 last_pushed_at 算出的 ${String(expected)} 不一致 ⇒ 不可复算`,
        })
      }
    }
  }
  return out
}

/**
 * 扫一批清单文件（内容为 JSON 文本）。
 *
 * ⚠️ **不给 `now` 就用每份清单自己的 `computed_at`** ⇒ 重新采集后闸照样绿
 *   （`age_days` 合法地变大了，但参照日也跟着变了 ⇒ 仍然自洽）。
 */
export function scanSourceFreshness(
  files: Array<{ path: string; content: string }>,
  opts: { now?: Date; registeredStale: readonly string[] },
): FreshnessViolation[] {
  const out: FreshnessViolation[] = []
  for (const f of files) {
    let parsed: unknown
    try {
      parsed = JSON.parse(f.content)
    } catch (err) {
      out.push({
        file: f.path,
        where: '(顶层)',
        rule: 'missing-block',
        detail: `清单不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    const obj = parsed as Record<string, unknown>
    out.push(...validateFreshness(f.path, obj['source_freshness'], opts))
  }
  return out
}
