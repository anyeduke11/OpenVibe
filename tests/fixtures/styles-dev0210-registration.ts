/**
 * `styles.ts` 在 DEV-0210 之后的登记改动面（fixture）。
 *
 * ## 为什么抽成 fixture
 *
 * 这份登记此前**只存在于 DEV_LOG 的散文里**，测试要断言它就得在测试文件里再抄一遍 ——
 * 两处登记是**两个漂移源**：DEV_LOG 改了登记而测试没改（或反之），闸就会与文档不一致，
 * 而这类不一致的表现是「闸报红但看起来是对的」或「闸通过但文档已过时」。
 *
 * 抽成 fixture 后：**登记面只有一处**（本文件），DEV_LOG 与测试都引用它。
 *
 * ## 口径
 *
 * 本文件由 `pnpm ui:snapshot` 的快照闸**间接**守护：`styles.ts` 的任何改动都会让
 * `tests/styles-ts.snapshot.txt` 失配 ⇒ 要么改这里是**刻意的**（同步更新快照），
 * 要么是误改（闸报红）。
 */

/**
 * DEV-0210 对 `styles.ts` 的新增行（14 行）。
 *
 * 三处改动：
 * ① 文件头补 9 行说明（`display` 类一律不进 `btnBase` 的口径与实测后果）
 * ② `btnBase` 去掉行首 `inline-flex`
 * ③ 四个变体各前置 `inline-flex`
 */
export const STYLES_DEV0210_ADDED = [
  '/**',
  ' * 按钮**基座**（只放非 display 类）。',
  ' *',
  ' * ⚠️ **`display` 类一律不进 `btnBase`**（2026-11-08 定的口径，由 `tests/btn-display.test.ts` 钉住）：',
  ' * `inline-flex` 与调用点的 `hidden` / `block` 同属性，而 Tailwind v4 的生成顺序里',
  ' * `inline-flex` 在 `hidden` **之后** ⇒ 调用点写 `hidden` 会被静默覆盖。',
  ' * 实测后果：375px 下顶栏三个按钮全部渲染并横向溢出（x 到 435 > 375）。',
  ' * 故 `inline-flex` 下沉到四个变体各自；需要 block 的调用点自己写 `block`。',
  ' */',
  "  'items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ' +",
  'export const btnPrimary = `${btnBase} inline-flex border-accent bg-accent text-on-accent shadow-1 hover:bg-accent-deep`',
  'export const btnSecondary = `${btnBase} inline-flex border-line-strong bg-panel text-ink-body hover:border-ink-muted hover:bg-panel-2`',
  'export const btnGhost = `${btnBase} inline-flex border-line bg-panel text-ink-body hover:border-line-strong hover:bg-panel-2`',
  'export const btnDanger = `${btnBase} inline-flex border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-panel`',
]

/** DEV-0210 对 `styles.ts` 的删除行（5 行）。 */
export const STYLES_DEV0210_REMOVED = [
  "  'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ' +",
  'export const btnPrimary = `${btnBase} border-accent bg-accent text-on-accent shadow-1 hover:bg-accent-deep`',
  'export const btnSecondary = `${btnBase} border-line-strong bg-panel text-ink-body hover:border-ink-muted hover:bg-panel-2`',
  'export const btnGhost = `${btnBase} border-line bg-panel text-ink-body hover:border-line-strong hover:bg-panel-2`',
  'export const btnDanger = `${btnBase} border-danger-line bg-danger-soft text-danger hover:bg-danger hover:text-panel`',
]
