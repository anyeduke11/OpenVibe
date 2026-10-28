import { useState } from 'react'
import type { TermOut } from '@openvibe/shared'
import { btnGhost, cardCls, chipCls, chipPressed, tagCls } from '../ui/styles'

/**
 * 术语卡片（m3-terms-learning FR-4.2 的三段式，对着 owner「看不懂」这条直接设计）。
 *
 * | 段 | 内容 | 为什么 |
 * |---|---|---|
 * | ① 大白话场景句 | 一句「你什么时候会用到它」，**不含术语本身** | 定义里全是行话，先给个能懂的场景再给定义 |
 * | ② 术语定义 | **折叠、默认收起** | 卡片高度可控；想深究再展开。默认展开会让一屏只剩三张卡 |
 * | ③ 相关词 ＋ 入库动作 | 双向关联 chip ＋ 「加入选集」 | 复用既有选集 → TERMS.md 链路，不新建通道 |
 *
 * ⚠️ **场景句为空时走「定义直出」**（spec §6.2 定的形态）：没有场景句的词条不是残次品 ——
 * 用户自建词条与 AI 生成待确认的词条都属此类。此时把定义提到第一位，否则卡片只剩一个标题，
 * 读者会觉得「这条是空的」。
 */

const L = {
  starter: '入门必看',
  expand: '看定义',
  collapse: '收起定义',
  pick: '加入选集',
  picked: '已选',
  related: '相关',
  noScenario: '（暂无场景句，以下为原始定义）',
} as const

/** 命中场景句时把命中片段标出来（FR-5.2「命中后高亮场景句」） */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (q === '') return <>{text}</>
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  // 只标第一处：场景句只有一句，标满反而读不出句子
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent-soft text-accent-deep">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  )
}

export function TermCard(props: {
  term: TermOut
  /** 由调用方从全量词条里按 relatedTermIds 解析好的词条；解析不到的不渲染（不改数据） */
  relatedTerms: TermOut[]
  selected: boolean
  onToggleSelect: (id: string) => void
  /** 当前搜索词；非空时用于高亮场景句里的命中片段 */
  query?: string
}) {
  const { term, relatedTerms, selected, onToggleSelect, query = '' } = props
  const [open, setOpen] = useState(false)
  const hasScenario = term.scenario.trim() !== ''

  return (
    <article className={`${cardCls} flex flex-col gap-2 p-3.5`}>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-[15px] leading-tight font-semibold text-ink">{term.zh ?? term.en}</h3>
        {term.en ? <span className="text-[12.5px] text-ink-muted">{term.en}</span> : null}
        <span className={`${chipCls} border-line bg-panel-2 text-ink-muted`}>{term.level}</span>
        {term.starter ? <span className={`${chipCls} ${chipPressed}`}>{L.starter}</span> : null}
      </header>

      {hasScenario ? (
        <p className="text-[13px] leading-[1.65] text-ink-body">
          <Highlight text={term.scenario} query={query} />
        </p>
      ) : (
        <p className="text-[13px] leading-[1.65] text-ink-body">{term.definition}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={
            selected ? `${btnGhost} border-accent-line bg-accent-soft text-accent-deep` : btnGhost
          }
          aria-pressed={selected}
          onClick={() => onToggleSelect(term.id)}
        >
          {selected ? L.picked : L.pick}
        </button>
        {/* 无场景句时定义已经直出，再给一个展开按钮等于同一句话显示两遍 */}
        {hasScenario ? (
          <button
            type="button"
            className="btn-ghost"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? L.collapse : L.expand}
          </button>
        ) : null}{' '}
        {relatedTerms.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-[11.5px] text-ink-faint">{L.related}</span>
            {relatedTerms.map((r) => (
              <span key={r.id} className={tagCls}>
                {r.zh ?? r.en}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {open && hasScenario ? (
        <p className="border-t border-line pt-2 text-[13px] leading-[1.65] text-ink-muted">
          {term.definition}
        </p>
      ) : null}
    </article>
  )
}
