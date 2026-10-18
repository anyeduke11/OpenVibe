/**
 * 图标集（零依赖 · 24 条 inline path）。
 *
 * 为什么不引图标库：`theme.md §6.5` 记着入口 JS 的余量只有 0.08kB——一整个图标包
 * （lucide-react 之类）会把入口顶破 `bundle:check` 的 300kB 闸。这里把 path 写成一张表，
 * 用到的图标才进产物，且未用到的会被 tree-shake 掉。
 *
 * 形制（DESIGN.md Components）：16px 视框、1.7 描边、currentColor，跟字号一起缩放。
 * 图标**永远不能单独自义**——状态一律「图标 + 文字 + 颜色」三通道（见 chip 纪律）。
 */
import type { SVGProps } from 'react'

const P = {
  home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z',
  doc: 'M5 3h6l4 4v10H5zM11 3v4h4M8 11h6M8 14h4',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H10a2 2 0 0 1 2 2v11a1.6 1.6 0 0 0-1.6-1.6H4zM16 4.5A1.5 1.5 0 0 0 14.5 3H11a2 2 0 0 0-2 2v11a1.6 1.6 0 0 1 1.6-1.6H16z',
  box: 'M10 3 17 6.5v7L10 17 3 13.5v-7zM3 6.5 10 10l7-3.5M10 10v7',
  flow: 'M3 3.5h6v4H3zM11 12.5h6v4h-6zM6 7.5v3a2 2 0 0 0 2 2h3',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 2h6A1.5 1.5 0 0 1 16.5 8.5v6A1.5 1.5 0 0 1 15 16H5a2 2 0 0 1-2-2z',
  pack: 'M4 6.5 10 4l6 2.5v7L10 16l-6-2.5zM4 6.5 10 9l6-2.5M10 9v7',
  cog: 'M10 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4',
  search: 'M9 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM12.4 12.4 16.5 16.5',
  plus: 'M10 4.5v11M4.5 10h11',
  x: 'm5.5 5.5 9 9M14.5 5.5l-9 9',
  check: 'm4 10.5 4 4 8-9',
  warn: 'M10 3.5 18 16.5H2zM10 8.2v3.6M10 13.8v.2',
  info: 'M10 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zM10 9.2v4.4M10 6.6v.2',
  alert: 'M10 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zM10 6.4v4.4M10 13.4v.2',
  copy: 'M7.5 7.5h8v8h-8zM13 7.5V5.5a1 1 0 0 0-1-1H5.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h2',
  term: 'M3.5 5h13v10h-13zM6.5 8.5h4M6.5 11.5h7',
  sun: 'M10 6.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4',
  moon: 'M16 12.5A7 7 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z',
  pulse: 'M2.5 10h3l2-5 3 10 2.5-6 1.5 3h2.5',
  clock: 'M10 3.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zM10 6.2v4l2.6 1.6',
  git: 'M6 5.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM6 5.6v9M6 16.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM14.4 10.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM7.8 5h3.6a3 3 0 0 1 3 3v0.6',
  dl: 'M10 3.5v8M6.5 8.5 10 12l3.5-3.5M4 14.5h12',
  refresh: 'M15.5 8A6 6 0 0 0 5 6.2M4.5 12A6 6 0 0 0 15 13.8M15.5 4v4h-4M4.5 16v-4h4',
  back: 'M12.5 4 6.5 10l6 6',
  fwd: 'M7.5 4l6 6-6 6',
  lock: 'M4.5 8.5h11v8h-11zM7 8.5V6.8a3 3 0 0 1 6 0v1.7',
  layers: 'M10 3 17 6.5 10 10 3 6.5zM3 11l7 3.5 7-3.5',
  trash: 'M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6',
  history: 'M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 4.5V9H8M10 7v3.2l2.2 1.4',
  list: 'M6.5 5.5h9M6.5 10h9M6.5 14.5h9M4 5.5h.1M4 10h.1M4 14.5h.1',
  chart: 'M3.5 16.5h13M6 14V9M10 14V5M14 14v-7',
  target: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 7.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z',
  filter: 'M3 4.5h14l-5.5 6.5v5l-3 1.5v-6.5z',
  sparkle: 'M10 3l1.5 4.2L16 8.5l-4.5 1.3L10 14l-1.5-4.2L4 8.5l4.5-1.3z',
} as const

export type IconName = keyof typeof P

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

/**
 * 单个图标。`size` 默认 16（与 13.5/15px 正文同量级），状态 chip 内用 12。
 * `aria-hidden` 恒为真——图标不承担语义，语义由同行文字给出。
 */
export function Icon({ name, size = 16, className = '', ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  )
}