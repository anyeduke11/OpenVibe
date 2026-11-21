import { useState } from 'react'
import { PACK_FILE_CHECKLIST, PACK_FILE_TERMS } from '@openvibe/shared'
import { zh } from '../i18n/zh'
import { Card, PageHead } from '../components/ui/layout'
import { DemoChip } from '../components/ui/DemoChip'
import { Icon } from '../components/ui/icons'

/**
 * 加载协议（侧栏「定标 · F3」组，路由 `/loading`）—— **设计稿**。
 *
 * 分层加载：把「必读什么、引用什么」变成可回答的问题（LoadPlan = {required, referenced}）。
 * 已裁定要做（D-v25-1），等 U10 验证后默认关闭生效；本页全部为**前端先行设计**，
 * 不接真实数据、不含可执行动作。
 *
 * ⚠️ 页头带「设计稿」标记，覆盖地图口径里本页是 ○（未上线）。
 */
const L2_TABS = [
  { value: 'l0', label: '主文档 L0 索引' },
  { value: 'rules', label: 'L2 · RULES.md' },
  { value: 'refs', label: 'L2 · REFS.md' },
] as const

const ADAPTERS: { name: string; file: string; cap: 't' | 'u' | 'f'; note: string }[] = [
  { name: 'claude-code', file: 'CLAUDE.md', cap: 't', note: '会读主文档指向的二级文件' },
  {
    name: 'cursor',
    file: '.cursor/rules/openvibe.mdc',
    cap: 'u',
    note: '未声明（与 false 同义，保守处理）',
  },
  { name: 'generic-agents', file: 'AGENTS.md', cap: 'f', note: '不读，保持全内联' },
  { name: 'codebuddy', file: 'CODEBUDDY.md', cap: 'u', note: '未声明（与 false 同义，保守处理）' },
  { name: 'trae', file: '.trae/rules/openvibe.md', cap: 'f', note: '不读，保持全内联' },
  { name: 'minicode', file: 'MINI.md', cap: 'f', note: '不读，保持全内联' },
]

const L0_INDEX = `# 项目规则（L0 索引）

## 必读
- 术语见 TERMS.md（随包分发）
- 检查清单见 CHECKLIST.md

## 按需加载（L2 索引行）
- [RULES.md#sql] SQL 生成约束——写数据库语句前必读
- [RULES.md#safety] 写文件与不可逆操作——执行删除/覆盖前必读
- [REFS.md#csv] CSV 导出格式——实现导出功能时读
- [REFS.md#i18n] 多语言键名约定——新增文案时读

（索引行 = 指针 + 摘要 + 触发条件；同一内容只出现一处）`

const L2_RULES = `# RULES.md（L2 · 按需加载）

## sql
- 只生成对已知表的语句；未知表先问，不猜列名。
- 禁止无 WHERE 的 UPDATE / DELETE。

## safety
- 不可逆操作先展示影响范围，获得显式确认。
- 覆盖前先备份到 .openvibe/backup/<UTC 时间戳>/。`

const L2_REFS = `# REFS.md（L2 · 参考资料按需加载）

## csv
CSV 导出：UTF-8 + BOM；表头与列序见 CHECKLIST；
数值列 tabular-nums；空值写空串不写 NULL 字面量。

## i18n
键名小写中划线；同义键合并；上线前跑文案扫描。`

export function LoadingPage() {
  const [tab, setTab] = useState<(typeof L2_TABS)[number]['value']>('l0')
  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead
        title={zh.loading.title}
        hint={zh.loading.subtitle}
        actions={<DemoChip id="loading-page" />}
      />

      <Card
        title={zh.loading.loadPlanTitle}
        icon={<Icon name="layers" size={15} className="text-ink-faint" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <b className="text-[13px] text-ink">{zh.loading.requiredTitle}</b>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['CLAUDE.md', PACK_FILE_TERMS, PACK_FILE_CHECKLIST].map((f) => (
                <span
                  key={f}
                  className="mono rounded-sm border border-line-hair bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink-muted"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div>
            <b className="text-[13px] text-ink">{zh.loading.referencedTitle}</b>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['RULES.md · 规则段 ×4', 'REFS.md · CSV 导出 ×2'].map((f) => (
                <span
                  key={f}
                  className="mono rounded-sm border border-line-hair bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink-muted"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 rounded-md border border-info-line bg-info-soft px-3 py-2 text-[12.5px] text-ink-body">
          {zh.loading.l0Note}
        </p>
      </Card>

      <Card
        title={zh.loading.adapterTitle}
        icon={<Icon name="box" size={15} className="text-ink-faint" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['adapter', '主文档', '能力位', '含义'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2.5 py-1.5 text-left text-[11.5px] font-normal text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADAPTERS.map((a) => (
                <tr key={a.name}>
                  <td className="mono border-b border-line-hair px-2.5 py-1.5 text-[12px]">
                    {a.name}
                  </td>
                  <td className="mono hidden border-b border-line-hair px-2.5 py-1.5 text-[12px] sm:table-cell">
                    {a.file}
                  </td>
                  <td className="border-b border-line-hair px-2.5 py-1.5">
                    <span
                      className={`mono rounded-sm px-1.5 py-0.5 text-[11px] ${
                        a.cap === 't'
                          ? 'bg-ok-soft text-ok'
                          : a.cap === 'u'
                            ? 'bg-warn-soft text-warn'
                            : 'bg-panel-2 text-ink-faint'
                      }`}
                    >
                      {a.cap === 't' ? 'true' : a.cap === 'u' ? '未声明' : 'false'}
                    </span>
                  </td>
                  <td className="hidden border-b border-line-hair px-2.5 py-1.5 text-[12.5px] text-ink-muted sm:table-cell">
                    {a.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] text-ink-body">
          {zh.loading.adapterNote}
        </p>
      </Card>

      <Card
        title={zh.loading.l2Title}
        icon={<Icon name="doc" size={15} className="text-ink-faint" />}
        headRight={
          <div className="inline-flex flex-wrap gap-0.5 rounded-sm border border-line bg-panel-2 p-0.5">
            {L2_TABS.map((t) => {
              const on = t.value === tab
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTab(t.value)}
                  className={`rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                    on ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        }
      >
        <pre className="mono overflow-x-auto rounded-sm border border-line-hair bg-panel-2 p-3 text-[12px] leading-relaxed text-ink-body">
          {tab === 'l0' ? L0_INDEX : tab === 'rules' ? L2_RULES : L2_REFS}
        </pre>
      </Card>

      <Card
        title={zh.loading.sizeTitle}
        icon={<Icon name="chart" size={15} className="text-ink-faint" />}
      >
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          {[
            { k: '字节', v: '38,604', m: zh.loading.sizeBytes },
            { k: '≈ token', v: '9,860', m: zh.loading.sizeTok },
            { k: '密度', v: '0.31 tok/字符', m: zh.loading.sizeDensity },
          ].map((s) => (
            <div key={s.k} className="rounded-md border border-line bg-panel px-3 py-2.5">
              <div className="text-[11.5px] text-ink-faint">{s.k}</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{s.v}</div>
              <div className="mt-1 text-[11.5px] text-ink-muted">{s.m}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-ink-muted">{zh.loading.sizeNote}</p>
      </Card>

      <div className="rounded-md border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px]">
        <b className="mb-1 block text-xs font-bold text-warn">{zh.loading.thresholdTitle}</b>
        <p className="text-ink-body">{zh.loading.thresholdBody}</p>
      </div>
      <div className="rounded-md border border-info-line bg-info-soft px-3.5 py-3 text-[13px]">
        <b className="mb-1 block text-xs font-bold text-info">{zh.loading.antiTitle}</b>
        <p className="text-ink-body">{zh.loading.antiBody}</p>
      </div>
    </div>
  )
}
