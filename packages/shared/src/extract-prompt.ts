/**
 * 提取提示词单源（v0.2.3 批次 D AN1，spec FR-2；与 m9-source-prompt 同族：
 * 只输出 JSON、schema_version 写进 prompt、解析侧 stripJsonFence + 版本比对）。
 * HTTP runner 与未来的命令适配器共用这一份——提示词漂移在这里挡住。
 */

export const EXTRACT_SCHEMA_VERSION = 1

export interface ExtractPromptLog {
  index: number
  title: string
  body: string
}

/**
 * 组装提取提示词。**只要求三类候选，且每条必须带逐字原文引用**——
 * 锚定校验（core/extract/anchor.ts）是确定性的第二道闸，prompt 里先讲清规则
 * 是为了减少浪费，不是頼它保证质量。
 */
export function buildExtractPrompt(logs: ExtractPromptLog[]): string {
  const logsText = logs
    .map((l) => `--- 日志 #${String(l.index)}：${l.title}\n${l.body}`)
    .join('\n\n')
  return [
    '你是开发日志的资产整理助手。从下面的开发日志中提取值得沉淀的「候选资产」，只输出 JSON，不要输出任何其他文字。',
    '',
    '可提取的类别（kind）只有三种：',
    '- term：团队发明的词、踩坑后命名的问题模式（title=词，body=一句话定义）',
    '- prompt：可复用的提示词写法（title=场景，body=提示词正文）',
    '- playbook：真实做法或反例（title=做法名，body=做法/反例说明）',
    '',
    '硬性规则：',
    '1. 每条候选必须给出 quote——从其来源日志中**逐字复制**的一句原文（作为证据）。',
    '2. 宁缺毋滥：日志里没有值得沉淀的内容就输出空数组。',
    '3. log_index 填该候选来源日志的编号。',
    `4. 输出形状：{"schema_version": ${String(EXTRACT_SCHEMA_VERSION)}, "candidates": [{"kind": "term|prompt|playbook", "title": "...", "body": "...", "quote": "...", "log_index": 0}]}`,
    '',
    '开发日志：',
    logsText,
  ].join('\n')
}
