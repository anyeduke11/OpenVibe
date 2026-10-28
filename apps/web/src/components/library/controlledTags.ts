import { CONTROLLED_TAG_VOCAB } from '@openvibe/shared'

/**
 * 页面筛选条的标签集合 —— 词条页与技巧页共用。
 *
 * 口径（**两页必须一致**，抄成两份时只要一处写反，同一标签在两页的下拉顺序就不同）：
 *
 *  1. 只收**已用到**的标签——受控词表里没出现过的不进下拉，否则每页都挂着
 *     一排筛不出任何东西的空选项；
 *  2. 受控词表（写死的规范标签）在前、按词表序；用户自造标签在后、按字典序。
 */
export function controlledTagsOf(items: ReadonlyArray<{ tags: readonly string[] }>): string[] {
  const used = new Set(items.flatMap((i) => i.tags))
  const known = CONTROLLED_TAG_VOCAB.filter((t) => used.has(t))
  const extra = [...used]
    .filter((t) => !(CONTROLLED_TAG_VOCAB as readonly string[]).includes(t))
    .sort()
  return [...known, ...extra]
}
