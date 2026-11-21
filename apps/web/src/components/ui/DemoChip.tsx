import { demoTone, demoChipText, demoSurface } from '../../data/demo-surfaces'
import { chipTone } from './styles'

/**
 * 演示面标记（唯一出处 `apps/web/src/data/demo-surfaces.ts`）。
 *
 * ## 调用形态**必须**是单行、且 id 直接写成字符串字面量
 *
 * ⚠️ 这不是风格洁癖 —— `tests/demo-surfaces.test.ts` 的**双向一致闸**按这个形态扫源码：
 *   ① 清单里的每个 id 必须在源码里被引用；
 *   ② 源码里引用的每个 id 必须在清单里。
 *   写成多行、或把 id 包一层变量，闸就扫不到 ⇒ 报「清单条目无引用」或「引用无出处」。
 *   **要包就改闸，别绕过。**
 *
 * ⚠️ **注释里也别写这个调用形态的示例** —— 闸是纯文本扫描，注释里的示例会被当成真调用
 *   （首版就踩了：注释里写了个占位 id，闸报「源码引用了未登记的演示面 id」）。
 *
 * ## 找不到 id 即抛
 *
 * 界面上写了未登记的 id 是** bug**（标记与清单脱节），不是可以静默降级的情形。
 * ⇒ `demoSurface()` 找不到就抛，让它在开发期响亮。
 */
export function DemoChip({ id }: { id: string }) {
  const surface = demoSurface(id)
  return <span className={chipTone(demoTone(surface))}>{demoChipText(surface)}</span>
}
