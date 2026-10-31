import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DISK_STATE_REPORT_ENDPOINTS } from '@openvibe/shared'

/**
 * 报告类端点的缓存口径判据（2026-10-30）。
 *
 * ## 它断什么
 *
 * **磁盘态报告端点（结论含「某个磁盘路径现在还在不在」）不得走 query 缓存。**
 *
 * 事故形态（真机实测）：`GET /api/skills/cleanup` 走 15 秒 query 缓存，
 * 而它的结论是「哪些 skill 目录已经没了」⇒ 用户删掉目录后再打开对话框，
 * 看到的是删除之前的快照（服务端已返回 2 条，界面显示 0 条，刷新才对）。
 *
 * ## 怎么判
 *
 * 扫 `apps/web/src/**` 里所有 `useQuery(...)` 调用块，
 * 块内若出现清单里的端点路径 ⇒ 判红。
 *
 * ⚠️ **为什么扫源码而不是测运行时行为**：运行时行为要「先造出磁盘差异、
 *   再断言界面没吃到旧缓存」——那要求整套 UI 在 jsdom 里跑起来，成本高且脆。
 *   而本闸要防的是**写法**（用错了取数方式），写法在源码里是静态可见的。
 *   真正的运行时验证由 `apps/web/src/components/skills/SkillCleanupBrokenDialog.test.tsx` 承担。
 *
 * ## 为什么清单在 shared 而不在这个文件里
 *
 * 清单是**契约**：前端按它选取数方式，后端按它判「这个结论依不依赖磁盘」。
 * 放在测试文件里 ⇒ 只有测试看得见，契约不成立。
 * ⇒ 单源在 `packages/shared/src/report-endpoints.ts`。
 */

const ROOT = resolve(__dirname, '..')
const WEB_SRC = join(ROOT, 'apps', 'web', 'src')

/** 收 web 源码文件（只收 ts/tsx —— 判据针对 hooks 与组件两类调用点） */
function webSources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) webSources(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out.sort()
}

/**
 * 抽出文件里所有 `useQuery(...)` / `useApiMutation(...)` 调用的**大括号块**文本。
 *
 * ⚠️ 用括号配对而不是正则：正则要处理嵌套对象、字符串里的括号、注释里的括号 ——
 *   那些组合会让「看起来在 useQuery 里」的判据变得不可靠。
 *   括号配对虽然朴素，但它对**语法正确**的源码是可靠的（本仓的源码就是语法正确的）。
 */
function callBlocks(src: string, callee: string): string[] {
  const blocks: string[] = []
  const re = new RegExp(`\\b${callee}\\s*\\(`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    // 从调用的左括号开始配对
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < src.length; i++) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    blocks.push(src.slice(m.index, i + 1))
    re.lastIndex = i + 1
  }
  return blocks
}

const useQueryBlocks = (src: string): string[] => callBlocks(src, 'useQuery')
const useApiMutationBlocks = (src: string): string[] => callBlocks(src, 'useApiMutation')

describe('报告类端点 · 缓存口径判据', () => {
  it('清单非空（判据得先有内容才谈得上）', () => {
    expect(DISK_STATE_REPORT_ENDPOINTS.length).toBeGreaterThan(0)
  })

  it('磁盘态报告端点不走 query 缓存', () => {
    const offenders: string[] = []
    for (const file of webSources(WEB_SRC)) {
      const src = readFileSync(file, 'utf8')
      for (const block of useQueryBlocks(src)) {
        for (const endpoint of DISK_STATE_REPORT_ENDPOINTS) {
          if (block.includes(endpoint)) {
            offenders.push(`${file.replace(ROOT + '/', '')} → ${endpoint}`)
          }
        }
      }
    }
    expect(
      offenders,
      `磁盘态报告端点必须现算（mutation），不得走 useQuery 缓存：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('判据能红：把磁盘态端点塞进 useQuery 就会被逮到', () => {
    const fake = `
      import { useQuery } from '@tanstack/react-query'
      export function bad() {
        return useQuery({
          queryKey: ['cleanup'],
          queryFn: () => apiJson('/api/skills/cleanup'),
        })
      }
    `
    const blocks = useQueryBlocks(fake)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('/api/skills/cleanup')
  })

  it('⚠️ 清单不许腐化：登记的端点必须真的被前端取数（不许登记完就没人用）', () => {
    // 反向检查：清单是契约，但契约会被「登记了却没人用」慢慢腐化 ——
    // 而腐化的清单比没有清单更坏（闸在保护一个没人用的端点，真正的磁盘态报告漏网）。
    // ⇒ 每个登记项都必须在前端源码里出现。
    const allSrc = webSources(WEB_SRC)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    for (const endpoint of DISK_STATE_REPORT_ENDPOINTS) {
      expect(allSrc, `清单登记了但前端没人用：${endpoint}`).toContain(endpoint)
    }
  })

  it('⚠️ 登记的磁盘态端点必须走 mutation（不许只是「在源码里出现过」）', () => {
    // 「出现过」还不够 —— 它必须出现在 **mutationFn** 里。
    // ⚠️ 判定是**跨文件**的：某个端点可能由 A 文件的 hook 取数、
    //   在 B 文件的组件里被调用 ⇒ 逐文件判定会误报「没出现」。
    const sources = webSources(WEB_SRC).map((f) => ({
      file: f.replace(ROOT + '/', ''),
      src: readFileSync(f, 'utf8'),
    }))
    const offenders: string[] = []
    for (const endpoint of DISK_STATE_REPORT_ENDPOINTS) {
      const inMutation = sources.some((f) =>
        useApiMutationBlocks(f.src).some((b) => b.includes(endpoint)),
      )
      if (!inMutation) offenders.push(endpoint)
    }
    expect(offenders, `这些磁盘态端点没有被任何 mutation 取数：\n${offenders.join('\n')}`).toEqual(
      [],
    )
  })

  it('清单里的端点在服务端确实存在（清单不许登记不存在的路径）', () => {
    const routes = readFileSync(join(ROOT, 'apps', 'server', 'src', 'routes', 'skills.ts'), 'utf8')
    for (const endpoint of DISK_STATE_REPORT_ENDPOINTS) {
      expect(routes, `服务端没有这个端点：${endpoint}`).toContain(endpoint)
    }
  })
})
