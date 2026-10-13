/**
 * 两段式提示词的第 1 段——问参提示词（DEV-0084）：把它发给 AI（或当检查清单用），
 * 逐项取回参数值，再回 OpenVibe 填进第 2 段生成正式正文。从变量清单自动生成，
 * 无需作者手写；vars 为空返回空串（无参数的提示词没有第 1 段）。
 *
 * 独立模块而非 utils.ts：只被懒加载组件引用，保证 tree-shaking 后不进入口 chunk。
 */
export function interviewPrompt(vars: readonly string[]): string {
  if (vars.length === 0) return ''
  const lines = vars.map((v) => `- ${v} =（请填写实际值）`).join('\n')
  return [
    '我接下来要执行一段包含参数的提示词，需要你先帮我确认以下参数的实际值：',
    '',
    lines,
    '',
    '请逐项回答（格式：参数名 = 值；能从当前项目/环境里查到的直接查，查不到的明确说「无法确定」），',
    '只回答参数清单，不要执行任何后续操作。',
  ].join('\n')
}
