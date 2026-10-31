import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DISK_STATE_REPORT_ENDPOINTS,
  REPORT_ENDPOINT_SOURCES,
  isDiskDependentSource,
} from '@openvibe/shared'
import { buildApp } from '../apps/server/src/app'

/**
 * 报告类端点的缓存口径判据（2026-10-30；2026-10-31 改为服务端自述）。
 *
 * ## 它断什么
 *
 * **磁盘态报告端点（结论含「某个磁盘路径现在还在不在」）不得走 query 缓存。**
 *
 * 事故形态（真机实测）：`GET /api/skills/cleanup` 走 15 秒 query 缓存，
 * 而它的结论是「哪些 skill 目录已经没了」⇒ 用户删掉目录后再打开对话框，
 * 看到的是删除之前的快照（服务端已返回 2 条，界面显示 0 条，刷新才对）。
 *
 * ## 三道闸，各管一段
 *
 * 1. **快照一致性**：`packages/shared/src/report-endpoints.ts` 的清单必须与
 *    **服务端路由注册处**的自述逐条一致（`buildApp` 采集 ⇒ 运行时真值）。
 *    ⇒ 新增端点而忘了登记 ⇒ 判红（清单是投影，不一致就是漂移）。
 * 2. **取数方式**：磁盘态端点不得出现在任何 `useQuery(...)` 块里。
 * 3. **端点存在性**：清单里的路径必须在服务端真的注册了（不许登记幽灵路径）。
 *
 * ## 为什么扫源码而不是测运行时行为
 *
 * 运行时行为要「先造出磁盘差异、再断言界面没吃到旧缓存」——那要求整套 UI 在
 * jsdom 里跑起来，成本高且脆。而本闸要防的是**写法**（用错了取数方式），
 * 写法在源码里是静态可见的。真正的运行时验证由
 * `apps/web/src/components/skills/SkillCleanupBrokenDialog.test.tsx` 承担。
 *
 * ## 清单的唯一书写处
 *
 * **服务端路由注册处**（每个 GET 端点用 `reportRoute(path, source)` 声明），
 * 清单由 `pnpm report:snapshot` 从运行时路由表导出。
 * 早先的形态是「清单手写在 shared 里」——那与服务端是两处独立书写，必然漂移，
 * 而漂移的方向必然是「闸越来越松」。
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

/** 服务端路由注册处的自述（运行时真值） */
async function serverDeclarations(): Promise<{ path: string; source: string }[]> {
  const { routeSources } = await buildApp({})
  return routeSources.map((r) => ({ path: r.path, source: r.source }))
}

describe('报告类端点 · 服务端自述与缓存口径判据', () => {
  it('清单非空（判据得先有内容才谈得上）', () => {
    expect(REPORT_ENDPOINT_SOURCES.length).toBeGreaterThan(0)
    expect(DISK_STATE_REPORT_ENDPOINTS.length).toBeGreaterThan(0)
  })

  it('⚠️ 快照与路由注册处一致（新增端点而忘了登记 ⇒ 判红）', async () => {
    // 这是整套机制的核心闸：清单是**服务端自述的投影**，两者必须逐条相同。
    // 少一条 ⇒ 服务端有端点没登记（闸看不见它）；多一条 ⇒ 登记了不存在的端点。
    const declared = await serverDeclarations()
    const snapshot = REPORT_ENDPOINT_SOURCES.map((e) => `${e.path}=${e.source}`).sort()
    const actual = declared.map((e) => `${e.path}=${e.source}`).sort()
    expect(
      snapshot,
      '清单与服务端路由注册处的自述不一致 ⇒ 跑 `pnpm report:snapshot` 重新生成',
    ).toEqual(actual)
  })

  it('⚠️ 每个 GET 端点都必须声明来源（不许有没声明的端点混过去）', async () => {
    // 上面的「一致性」闸只保证「声明过的那些对得上」——
    // 若某个端点**根本没声明**，它就不在清单里，一致性照样通过 ⇒ 闸看不见它。
    // ⇒ 这条单独断「所有 GET 端点都声明了来源」。
    const declared = await serverDeclarations()
    const routesDir = join(ROOT, 'apps', 'server', 'src', 'routes')
    const getPaths = new Set<string>()
    for (const f of readdirSync(routesDir)) {
      const src = readFileSync(join(routesDir, f), 'utf8')
      for (const m of src.matchAll(/app\.get\(\s*'([^']+)'/g)) getPaths.add(m[1]!)
    }
    const declaredPaths = new Set(declared.map((d) => d.path))
    const missing = [...getPaths].filter((p) => !declaredPaths.has(p))
    expect(
      missing,
      `这些 GET 端点没声明数据来源（请加 reportRoute(path, 'db' | 'filesystem' | 'mixed')）：\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('磁盘态报告端点不走 query 缓存（除非该 query 显式 staleTime: 0）', () => {
    // ⚠️ **口径的精确化**：磁盘态端点走 useQuery 并非一律违法 ——
    //   判据真正要防的是「**展示的是缓存里的旧值**」。
    //   `staleTime: 0` 的 query 每次挂载都重取（react-query 的 refetchOnMount 默认开）
    //   ⇒ 不会展示过期快照 ⇒ 合规（例如注入探针：staleTime 0 + refetchInterval 一直在探）。
    //   而默认 staleTime（15s）或显式大 staleTime ⇒ 挂载后不再重取 ⇒ 会展示旧快照 ⇒ 判红。
    const offenders: string[] = []
    for (const file of webSources(WEB_SRC)) {
      const src = readFileSync(file, 'utf8')
      for (const block of useQueryBlocks(src)) {
        const hit = DISK_STATE_REPORT_ENDPOINTS.find((e) => block.includes(e))
        if (hit === undefined) continue
        if (!/staleTime:\s*0\b/.test(block)) {
          offenders.push(
            `${file.replace(ROOT + '/', '')} → ${hit}（该 query 未声明 staleTime: 0 ⇒ 挂载后会展示缓存旧值）`,
          )
        }
      }
    }
    expect(
      offenders,
      `磁盘态报告端点必须现算（mutation），或走 staleTime: 0 的 query：\n${offenders.join('\n')}`,
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

  it('清单里的端点在服务端确实注册了（不许登记幽灵路径）', async () => {
    const declared = await serverDeclarations()
    const declaredPaths = new Set(declared.map((d) => d.path))
    for (const endpoint of DISK_STATE_REPORT_ENDPOINTS) {
      expect(declaredPaths, `服务端没有注册这个端点：${endpoint}`).toContain(endpoint)
    }
  })

  it('磁盘态清单与来源标记一致（派生量不许与源脱节）', () => {
    const expected = REPORT_ENDPOINT_SOURCES.filter((e) => isDiskDependentSource(e.source)).map(
      (e) => e.path,
    )
    expect([...DISK_STATE_REPORT_ENDPOINTS].sort()).toEqual([...expected].sort())
  })
})
