/**
 * M9 · 三种学习模式的全局枚举（`m9-dev-language-roadmap.md` §3.17）。
 *
 * ## 为什么住在 shared（不在 core）
 *
 * ⚠️ **枚举的唯一定义必须能被 web 与 core 同时拿到**：
 *   - web 的模式切换器要它（§3.19 的一次性提问、§3.21 的深链落点）；
 *   - core 的模式层要它（§3.17 的必学集 / 深度 / 顺序）。
 *   而 `packages/core` 带 `better-sqlite3` 原生依赖、`apps/web` 又没有指向 core 的
 *   workspace 链接 ⇒ **枚举放 core 就等于让 web 抄一份** ⇒ 两处口径必然漂移。
 *   ⇒ 放 shared：它是 R1/R2 规则里唯一的底层包，web 与 core 都已依赖它。
 *
 * ⚠️ **本文件是 `LangProfile` 的唯一定义处** —— core 侧的
 *   `packages/core/src/db/m9-p1b-necessity.ts` 从这里**转出**，
 *   既有 import 路径不变，但枚举本身只此一份。
 */

/** 三种学习模式（§3.17 的全局枚举，不逐条存表）。 */
export type LangProfile = 'master' | 'familiar' | 'vibe'

/** 三个取值的固定顺序（精通 / 熟悉 / 速成）。 */
export const LANG_PROFILES: readonly LangProfile[] = ['master', 'familiar', 'vibe']

/**
 * 三种模式的中文名（**界面口径的唯一出处**）。
 *
 * ⚠️ 别处不许另写一份 —— 模式名出现在转档弹层、阶段卡片、onboarding、资源标记
 *   四处，各写各的必然漂移（「速成」与「了解 · 速成」混用是典型）。
 */
export const PROFILE_LABELS: Record<LangProfile, string> = {
  master: '精通',
  familiar: '熟悉',
  vibe: '速成',
}
