import { createHash } from 'node:crypto'
import { pinyin } from 'pinyin-pro'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** 确定性 JSON 序列化（键排序，seed itemHash 口径） */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
}

/** JSON 列读取（容错：非法 JSON 回退默认值） */
export function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 码点序比较（design §7.3 排序键，禁 localeCompare） */
export function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 拼音排序键（m3 FR-4.2 的 orderBy=pinyin）：pinyin-pro 词典按词组消歧多音字
 * （重要 zhongyao / 重复 chongfu），去声调与空格后取小写码点序。
 * 表随包分发，不依赖运行环境 ICU——三平台产物字节一致（localeCompare 做不到这点）。
 */
export function pinyinKey(text: string): string {
  if (text === '') return ''
  return pinyin(text, { toneType: 'none' })
    .toLowerCase()
    .replaceAll(' ', '')
}
