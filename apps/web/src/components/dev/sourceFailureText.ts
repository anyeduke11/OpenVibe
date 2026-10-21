import type { SnippetFailureReason } from '@openvibe/shared'

/**
 * `apps/web/src/components/dev/sourceFailureText.ts` —— **片段读不到时的提示文案**
 * （M9 增强 2）。
 *
 * ## ⚠️ 为什么单独一个文件
 *
 * ① **口径只留一处**：这段映射是「失败原因 ⇒ 人话」的唯一出处，
 *    抽屉与它的变异腿都从这里取（复制一份就会出现「一个地方改了、另一个地方没改」）。
 * ② **可被变异腿打中**：判据是「不同原因必须显示**不同**文案」——
 *    若这段逻辑藏在组件内部，变异腿就得改组件源码；独立成文件后，
 *    变异腿只需 `vi.mock` 这一个模块，**且能断言变异真的生效了**
 *    （「把四种原因塌成一个文案 ⇒ 生产断言当场红」）。
 *
 * ## ⚠️ 文案必须**说清下一步该做什么**
 *
 * 「读不到」是**症状**，「文件被删了」与「行号越界」对用户的动作完全不同
 * （前者：重新扫描；后者：代码改了，扫描结果过时了）⇒
 * 每种原因都要带上用户该做的动作。
 */
const TEXT: Record<SnippetFailureReason, string> = {
  file_missing: '文件已经不在了（删除或移动）—— 重新扫描一次。',
  out_of_project: '这个路径不在当前项目里（项目目录可能变了）—— 重新扫描一次。',
  line_out_of_range: '文件比扫描时短了，这一行已经不存在 —— 重新扫描一次。',
  too_large: '文件超过读取上限，没有读取 —— 缩小范围后再扫。',
  unreadable: '读不到这个文件（权限或编码问题）。',
  not_loaded: '这次没有加载（命中条数超过单次上限）—— 缩小范围后再扫。',
}

/**
 * 片段读不到时的提示（`reason` 为 `null` = 原因未知 ⇒ 兜底一句）。
 *
 * ⚠️ **兜底只是兜底**：每个已知原因都有**自己的**文案，
 *   不许四种原因都落进同一个兜底分支（有变异腿守着）。
 */
export function snippetFailureText(reason: SnippetFailureReason | null | undefined): string {
  if (reason === null || reason === undefined) return '读不到这个片段。'
  return TEXT[reason] ?? '读不到这个片段。'
}
