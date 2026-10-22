import { useState } from 'react'
import { Icon } from '../components/ui/icons'
import {
  btnGhost,
  emptyHintCls,
  filterChipActiveCls,
  filterChipCls,
  h1Cls,
  h1SubCls,
  inputCls,
  labelCls,
  proseCls,
  rowCls,
  skelCls,
  tagCls,
} from '../components/ui/styles'
import { ResourceModeChip } from '../components/dev/ResourceModeChip'
import { useLangResources } from '../hooks/useLangResources'
import { RESOURCE_CATEGORY_VALUES, RESOURCE_MODE_LABELS } from '@openvibe/shared'

/**
 * **学习资源页**（`/resources`）—— owner 2026-10-22 裁定「新建独立的资源页，并支持筛选」。
 *
 * ## 它是什么
 *
 * 一份**可筛选**的学习资源清单，每条带**模式标记**（§3.20 的两档）。
 *
 * ## ⚠️ 为什么「资源页」要独立于「开发能力页」
 *
 * 开发能力页是**知识点**视角（站位、模式、阶段）；资源页是**去哪儿学**的视角。
 * 规格 §3.20 明写：「学完速成想加深的人，**第一反应是打开自己收藏的那份教程**，
 * 不是打开知识点列表 —— 入口缺失会让资源层在速成之后闲置。」
 * ⇒ 资源页必须是**独立入口**（侧栏一项 ＋ 一个路由）。
 *
 * ## ⚠️ 筛选的**四个维度**（不多不少）
 *
 * 关键字 · 分类 · 语言 · 模式标记。
 *
 * ⚠️ **没有 `tier`** —— `tier` 是「它在路线里排第几」（必要性矩阵的轴），
 *   `category` 才是「资源是什么形态」（规格 §3.1：两套维度不能混）。
 *
 * ## ⚠️ 模式**不在这里选**
 *
 * 模式选择有**固定入口**（首屏提问 ＋ 设置页重选，§3.19）⇒
 * 这里**只显示当前按哪个模式算**，不另开第二个切换器（两处能改 ⇒ 两处可能不一致）。
 * ⇒ 切换在设置页改完回来，标记会重算（§3.20「随模式切换实时重算」）。
 *
 * ## ⚠️ 模式标记的判定**不在本页**
 *
 * 判定走 shared 的 `resourceModeLabel`（§3.20：不新建反向索引）⇒
 * 服务端算好 `mode_label` 传下来，本页**只显示**（口径只留一处）。
 */
const L = {
  title: '学习资源',
  subtitle: '按形态、语言和当前学习模式筛选学习资源。每条都标了「本模式必学」还是「仅扩展阅读」。',
  q: '关键字',
  qPlaceholder: '名称、摘要或网址',
  category: '分类',
  categoryAll: '全部分类',
  lang: '语言',
  langAll: '全部语言',
  mode: '模式标记',
  modeAll: '全部',
  empty: '没有符合条件的资源。',
  emptyHint: '换个关键字或放宽筛选条件试试。',
  currentMode: '当前按',
  modeLabels: { master: '精通', familiar: '熟悉', vibe: '速成' } as const,
  count: (n: number) => `${String(n)} 条`,
  total: (n: number) => `共 ${String(n)} 条`,
  categoryLabels: {
    official: '官方',
    github: 'GitHub',
    course: '课程',
    book: '书籍',
    video: '视频',
    practice: '练习',
  } as Record<string, string>,
  langLabels: { python: 'Python', go: 'Go' } as Record<string, string>,
  priceLabels: { free: '免费', paid: '付费', mix: '部分付费' } as Record<string, string>,
  langLabelLabels: { zh: '中文', en: '英文', bi: '中英' } as Record<string, string>,
} as const

export function ResourcePage() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [lang, setLang] = useState('')
  const [mode, setMode] = useState<'all' | '本模式必学' | '仅扩展阅读'>('all')

  const { data, isPending, isError } = useLangResources({ q, category, lang, mode })
  const resources = data?.resources ?? []
  const profile = data?.profile ?? 'master'

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className={h1Cls}>{L.title}</h1>
          <p className={h1SubCls}>{L.subtitle}</p>
        </div>
        {data !== undefined && (
          <span className={tagCls}>
            {`${L.currentMode}「${L.modeLabels[profile]}」· ${L.total(data.total)}`}
          </span>
        )}
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls} htmlFor="m9-res-q">
            {L.q}
          </label>
          <input
            id="m9-res-q"
            className={inputCls}
            value={q}
            placeholder={L.qPlaceholder}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="m9-res-category">
            {L.category}
          </label>
          <select
            id="m9-res-category"
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{L.categoryAll}</option>
            {RESOURCE_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {L.categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="m9-res-lang">
            {L.lang}
          </label>
          <select
            id="m9-res-lang"
            className={inputCls}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="">{L.langAll}</option>
            <option value="python">{L.langLabels.python}</option>
            <option value="go">{L.langLabels.go}</option>
          </select>
        </div>
        <div>
          <span className={labelCls}>{L.mode}</span>
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...RESOURCE_MODE_LABELS] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={mode === value ? filterChipActiveCls : filterChipCls}
                onClick={() => setMode(value)}
              >
                {value === 'all' ? L.modeAll : value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isPending ? (
        <div className={`${skelCls} h-[220px]`} aria-busy />
      ) : isError ? (
        <p className="text-[13.5px] text-ink-muted">{L.empty}</p>
      ) : resources.length === 0 ? (
        <div className={emptyHintCls}>
          <p className="text-[13.5px] text-ink-faint">{L.empty}</p>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setQ('')
              setCategory('')
              setLang('')
              setMode('all')
            }}
          >
            <Icon name="refresh" size={13} />
            {L.emptyHint}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col">
          {resources.map((r) => (
            <li
              key={r.id}
              className={`${rowCls} flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5 last:border-b-0`}
            >
              <div className="min-w-0 flex-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] font-medium text-accent hover:underline"
                >
                  {r.name}
                </a>
                {r.summary !== '' && (
                  <p className={`${proseCls} mt-0.5 text-[12.5px] leading-relaxed text-ink-muted`}>
                    {r.summary}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={tagCls}>{L.categoryLabels[r.category] ?? r.category}</span>
                  <span className={tagCls}>{L.langLabels[r.lang] ?? r.lang}</span>
                  <span className={tagCls}>{L.priceLabels[r.price] ?? r.price}</span>
                  <span className={tagCls}>{L.langLabelLabels[r.lang_label] ?? r.lang_label}</span>
                  {!r.alive && <span className={tagCls}>已失效</span>}
                </div>
              </div>
              <div className="shrink-0">
                <ResourceModeChip
                  profile={profile}
                  topicIds={r.topic_ids}
                  profiles={data?.profiles ?? []}
                  topicTitles={r.topic_titles}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
