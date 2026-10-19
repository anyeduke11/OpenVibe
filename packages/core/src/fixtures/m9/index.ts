/**
 * M9 夹具（`m9-dev-language-roadmap.md` §3.13 + §7 DL-25）。
 *
 * 每一支夹具都是**真实**的源码文件（不是字面量字符串）—— P4 的 `ast` / `go/parser`
 * 要真的能跑通它们。**两份一行都别动**：
 *
 *   - `py_repeat.py` / `go_repeat.go`：20 次同一段（`import logging` / `go func()`）——
 *     验证「重复命中只算 1 次」与「20 次不构成掌握」。
 *   - `py_solo.py` / `go_solo.go`：**只有**一处特征（一个装饰器 / 一个 goroutine）——
 *     验证「源码证据被封顶在 `active`，不推上掌握」。
 *
 * 若要给 fixture 加任何"看起来更扎实"的东西，**先想**：这会不会让 DL-25 的变异腿
 * 失去唯一证据假设？会的话就别加。
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `@openvibe/core/test-support` 与运行时都会用；`dirname(import.meta.url)` 让单测 / prod 同源 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** 解析到磁盘路径。返回的是**绝对路径**，调用方不要再 `resolve` 一遍。 */
function fixture(name: string): string {
  return resolve(HERE, name)
}

export const M9_FIXTURES = {
  pyRepeat: fixture('py_repeat.py'),
  pySolo: fixture('py_solo.py'),
  goRepeat: fixture('go_repeat.go'),
  goSolo: fixture('go_solo.go'),
} as const

export type M9FixtureName = keyof typeof M9_FIXTURES

/** 全部夹具名（用于批量跑断言） */
export const M9_FIXTURE_NAMES: readonly M9FixtureName[] = [
  'pyRepeat',
  'pySolo',
  'goRepeat',
  'goSolo',
] as const
