import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AgentEmptyStateBox } from './EmptyState'
import { summarizePayload, shortHash } from './PendingIngestList'
import { installCommand } from './InstallGuide'
import { ADAPTER_IDS } from '@openvibe/shared'
import { agentZh, AGENT_ADAPTER_LABELS } from '../../i18n/lane-agent'

/**
 * M8-E（`docs/specs/m8-agent-panel.md` §7）验收用例。
 *
 * 这里挑的都是**能红的**判据。凡是「写对了就绿、写错了也绿」的（否定式）
 * 一律不写进本文件 —— 那是 `docs-check` 那边的事。
 */

const WEB_SRC = join(process.cwd(), 'apps/web/src')

describe('WEB-M8E-01 · 三态渲染三个**互不相同**的 CTA', () => {
  afterEach(cleanup)

  it('empty / no-result / error 三态的按钮文案两两不同', () => {
    const names: string[] = []
    for (const v of [
      { state: 'empty', onGoToInstall: () => {} },
      { state: 'no-result', onClearFilter: () => {} },
      { state: 'error', onRetry: () => {} },
    ] as const) {
      const { unmount } = render(<AgentEmptyStateBox value={v} />)
      names.push(screen.getByRole('button').textContent ?? '')
      unmount()
    }
    expect(new Set(names).size).toBe(3)
  })

  it('三态的标题与说明也各自不同（不许合并成两句文案）', () => {
    const t = agentZh.emptyState
    const titles = [t.emptyTitle, t.noResultTitle, t.errorTitle]
    expect(new Set(titles).size).toBe(3)
    expect(new Set([t.emptyHint, t.noResultHint]).size).toBe(2)
  })
})

describe('WEB-M8E-02 · `empty` 态的 CTA 是**可点的动作**不是文案', () => {
  afterEach(cleanup)

  it('点了会真的触发回调', () => {
    const onGoToInstall = vi.fn()
    render(<AgentEmptyStateBox value={{ state: 'empty', onGoToInstall }} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onGoToInstall).toHaveBeenCalledTimes(1)
  })

  it('`no-result` 点的是清除筛选，不是同一个回调（判别联合不许退化成一个 onAction）', () => {
    const onClearFilter = vi.fn()
    render(<AgentEmptyStateBox value={{ state: 'no-result', onClearFilter }} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClearFilter).toHaveBeenCalledTimes(1)
  })

  it('`error` 复用工程域既有文案 `retryHint` ＋ `retry`，不新造（FR-5.4.3）', () => {
    render(<AgentEmptyStateBox value={{ state: 'error', onRetry: () => {} }} />)
    expect(screen.getByText(/通常是后台进程刚重启/)).toBeTruthy()
    expect(screen.getByRole('button').textContent).toBe('重试')
  })
})

describe('WEB-M8E-06 · 摘要 80 字符截断且有省略号', () => {
  it('正好 80 字符：不截断、无省略号', () => {
    const s = 'a'.repeat(80)
    expect(summarizePayload({ title: s })).toBe(s)
  })

  it('81 字符：截成 80 ＋ 省略号', () => {
    const out = summarizePayload({ title: 'a'.repeat(81) })
    expect(out.endsWith('…')).toBe(true)
    expect(Array.from(out)).toHaveLength(81) // 80 + 省略号本身
  })

  it('⚠️ 嵌套里的字符串也要取到（只扫顶层会让最易被塞东西的形状恒空）', () => {
    expect(summarizePayload({ meta: { title: '你好' } })).toBe('你好')
  })

  it('数组里第一个字符串也算（深度优先，不只是对象路径）', () => {
    expect(summarizePayload({ list: [1, '第一条', '第二条'] })).toBe('第一条')
  })

  it('没有任何字符串时返回空串（不返 `undefined` 之类会被 React 忽略的值）', () => {
    expect(summarizePayload({ n: 1, b: true, o: {} })).toBe('')
  })

  it('⚠️ 按码点切，不切出半个字符（emoji 后面紧跟中文时最易暴露）', () => {
    const s = '🙂'.repeat(81)
    const out = summarizePayload({ t: s })
    // ⚠️ 判别式本身别写错：孤立代理项 = 后面不跟配对者。
    // 「高代理后面没有低代理」**或**「低代理前面没有高代理」。
    // 首版只判前者 —— 那样每个正常 emoji 对里的**低代理**都会误判成孤立，
    // 于是这条用例会因为**判据写错**而红，而截断实现其实是对的。
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(lone.test(out)).toBe(false)
  })

  it('⚠️ 上面那条判别式**能红**（喂它真正的孤立代理项）', () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(lone.test('a\uD83Db')).toBe(true)
  })
})

describe('WEB-M8E-05 · 摘要按**纯文本**渲染（FR-5.1.2.1 不可信输入红线）', () => {
  afterEach(cleanup)

  it('payload 里的 HTML 字面量以文本出现，不变成元素', () => {
    const evil = '<img src=x onerror="alert(1)">'
    // 直接验纯函数侧：摘要里原样带着尖括号，交给 React 时只会当文本
    expect(summarizePayload({ body: evil })).toBe(evil)
    // 组件层由「无 dangerouslySetInnerHTML」的结构性判据兜（见 WEB-M8E-04 同一处）
  })
})

describe('WEB-M8E-08 · 冲突详情只给短 hash（FR-6.3：不回显完整载荷）', () => {
  it('shortHash 恒为 8 位十六进制', () => {
    const h = shortHash(JSON.stringify({ anything: 'x'.repeat(999) }))
    expect(h).toMatch(/^[0-9a-f]{8}$/)
  })

  it('不同载荷得到不同 hash', () => {
    expect(shortHash('{"a":1}')).not.toBe(shortHash('{"a":2}'))
  })
})

/**
 * 扫「**使用**」而不是「提及」。
 *
 * ⚠️ **两条都踩过**：首版直接对源码正则匹配，于是
 * ① 判据自身（测试文件里写着要搜的字面量）被判成违规 —— **结构性自指**；
 * ② 组件注释里那句「不得 `dangerouslySetInnerHTML`」—— 一句**禁令** —— 也被判成违规。
 * 那两条都是**提及**不是**使用**：禁令写成注释反而触发禁令，这是判据把自己写死了。
 * ⇒ 先剥掉行注释与块注释再匹配，并对**本文件**登记显式豁免（豁免理由随代码走，不靠记性）。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 本文件必然含有被禁的字面量（判据要搜它们），故**结构性豁免**，不是「测不出来」 */
const SELF = join(WEB_SRC, 'components/agent/agentPanel.test.tsx')

function walkSources(cb: (relPath: string, code: string) => void): void {
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name) && p !== SELF) {
        cb(p.slice(WEB_SRC.length + 1), stripComments(readFileSync(p, 'utf8')))
      }
    }
  }
  walk(WEB_SRC)
}

describe('WEB-M8E-04 · FR-5.3 零子进程：Web 侧不经 `child_process`／`spawn`', () => {
  it('剥注释后全树零命中（spec FR-5.3.1 的判据形态）', () => {
    const hits: string[] = []
    walkSources((rel, code) => {
      if (/child_process|execFile|\bspawn\b/.test(code)) hits.push(rel)
    })
    expect(hits).toEqual([])
  })

  it('⚠️ 剥注释后全树零 `dangerouslySetInnerHTML`（不可信输入红线 FR-5.1.2.1）', () => {
    const hits: string[] = []
    walkSources((rel, code) => {
      if (code.includes('dangerouslySetInnerHTML')) hits.push(rel)
    })
    expect(hits).toEqual([])
  })

  it('⚠️ 剥注释**确实剥掉了注释**（否则上面两条会恒红，失去意义）', () => {
    // 自证：这条判据必须能证明它在剥注释。若实现退化成不剥，上面两条会因注释里的字面量而红。
    const rel = 'components/agent/PendingIngestList.tsx'
    let stripped = ''
    walkSources((r, code) => {
      if (r === rel) stripped = code
    })
    expect(stripped).not.toContain('dangerouslySetInnerHTML')
    expect(stripped).not.toContain('FR-5.1.2.1')
  })
})

describe('WEB-M8E-13 · 平台清单不在前端硬编码（FR-5.1.4.1）', () => {
  it('安装指令按 `ADAPTER_IDS` 逐项生成，六个都在', () => {
    for (const id of ADAPTER_IDS) {
      expect(installCommand(id)).toContain(id)
    }
    expect(ADAPTER_IDS).toHaveLength(6)
  })

  it('⚠️ 每个 adapter 都有显示名（新增 adapter 而漏标签 ⇒ 本支红）', () => {
    // 已知缺口：`AGENT_ADAPTER_LABELS` 键类型是 `Record<string, string>`，
    // 编译期不会因增项而红 ⇒ 由本支在**测试期**兜住。
    // ⚠️ 这里**导入映射表**逐键断言，不对源文件做文本 grep ——
    // 首版用 `labels.toContain("'cursor'")`，而合法的 JS 键写法是 `cursor:`（无引号），
    // 于是这条判据把「写法差异」报成「缺标签」，红的原因与它要守的东西无关。
    for (const id of ADAPTER_IDS) {
      expect(AGENT_ADAPTER_LABELS[id], `adapter ${id} 缺显示名`).toBeTypeOf('string')
      expect(AGENT_ADAPTER_LABELS[id]).not.toBe('')
    }
    // 反向：标签表不得有已不在清单里的陈旧项（那会让删 adapter 后仍显示旧标签）
    for (const k of Object.keys(AGENT_ADAPTER_LABELS)) {
      expect((ADAPTER_IDS as readonly string[]).includes(k), `陈旧标签 ${k}`).toBe(true)
    }
  })
})
