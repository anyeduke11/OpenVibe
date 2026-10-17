import { useRef } from 'react'
import { agentZh } from '../../i18n/lane-agent'
import { ContextPreview } from './ContextPreview'
import { PendingIngestList } from './PendingIngestList'
import { InstallGuide } from './InstallGuide'

/**
 * 助手桥接面板（`m8-agent-panel.md` FR-5.1）。
 *
 * **FR-5.1.1 落点唯一**：项目详情页内的**一**个区，**不新开页面、不进侧边栏**
 * —— M8 的使用场景是「干活时顺手看」，跳页会打断 agent–人协作的上下文。
 *
 * **FR-5.1.1.1 三子块顺序写死**：② 上下文预览 → ① 待确认回流 → ③ 接入指引。
 * 顺序即使用顺序：先看 agent 能拿到什么，再看它回传了什么，最后才是怎么接上。
 *
 * **`empty` 态的 CTA 要滚到第三子块**（FR-5.4.1）：所以本组件持一个 ref 指向
 * 安装指引块，空态按钮直接 `scrollIntoView`。这是「可点的 CTA」（FR-5.4.2）而不是纯文案。
 */
export function AgentPanel(props: { projectId: string | null }) {
  const installRef = useRef<HTMLDivElement>(null)

  const goToInstall = (): void => {
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <section aria-label={agentZh.panel.title} className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">{agentZh.panel.title}</h2>
        <p className="text-xs text-ink-muted">{agentZh.panel.hint}</p>
      </header>

      {/* ② 上下文预览 */}
      <Block title={agentZh.panel.contextTitle}>
        <ContextPreview projectId={props.projectId} />
      </Block>

      {/* ① 待确认回流 */}
      <Block title={agentZh.panel.ingestTitle}>
        <PendingIngestList projectId={props.projectId} onGoToInstall={goToInstall} />
      </Block>

      {/* ③ 接入指引 */}
      <div ref={installRef}>
        <Block title={agentZh.panel.installTitle}>
          <InstallGuide />
        </Block>
      </div>
    </section>
  )
}

function Block(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <h3 className="mb-1 text-xs font-bold text-ink">{props.title}</h3>
      {props.children}
    </div>
  )
}
