/**
 * `packages/core/src/source-scan/go-scanner.ts` —— **P4.2 · Go 双路径扫描器**
 * （`m9-dev-language-roadmap.md` §3.8.2 · dev-plan §6.10 P4.2 · **DL-19 / DL-20**）
 *
 * ## 两条路径（§3.8.2 的三条处置）
 *
 * | | 怎么走 | 命中的档 |
 * |---|---|---|
 * | **parser** | `go/parser`（起一个 Go 助手进程） | `confirmed`「已确认」 |
 * | **heuristic** | TS 正则（**先抹掉注释与字符串**） | `possible`「**可能**」 |
 *
 * ### 处置①：路径必须**显式可见** —— 不许静默回退
 *
 * `detectGoToolchain()` 说没有 Go ⇒ 走 heuristic ⇒ **必须**返回一条 notice：
 * 「未检测到 Go 工具链，识别可能不全」。界面上必须显示它（DL-20）。
 *
 * ### 处置②：两档**不混** —— `confidence` 字段承担这件事
 *
 * parser 认出的标 `confirmed`，启发式认出的标 `possible`。
 *
 * ### 处置③：回退**只降精度、不减结果** —— DL-19
 *
 * parser 认出的集合必须 ⊇ 正则认出的集合。
 * ⇒ ① 模式表里每个正则都写成解析器判定的**子情形**；
 * ⇒ ② 启发式路径**先抹掉注释与字符串**（否则注释里的字面量会被正则多认出来）。
 * ⇒ 这条由 `m9-source-scan.test.ts` 在**夹具与真实样本**上实测。
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { stripGoComments } from './go-comments'
import { resolvePatternText } from './pattern-text'
import { runWithStdin } from './run-with-stdin'

const execFileAsync = promisify(execFile)

/** Go 助手源码所在目录（**仓库内**，随代码走）。 */
const HELPER_DIR = fileURLToPath(new URL('./goparse', import.meta.url))

/** 一条命中（helper 与启发式两条路径共用同一形状）。 */
export interface GoHit {
  spec_id: string
  /** 相对项目根的路径 */
  file: string
  line: number
  col: number
  text: string
  line_text: string
}

/** Go 侧的扫描结果。 */
export interface GoScanOutput {
  hits: GoHit[]
  file_count: number
  /** 工具链版本（`go1.24.5`）；启发式路径为 '' */
  version: string
}

/** Go 工具链探测结果。 */
export interface GoToolchain {
  available: boolean
  /** 版本串（`go version go1.24.5 darwin/arm64` → `go1.24.5`） */
  version: string | null
  /** 可执行文件路径 */
  bin: string
}

/** 探测 Go 工具链（**不装任何东西**，只问「有没有」）。 */
export async function detectGoToolchain(bin: string = 'go'): Promise<GoToolchain> {
  try {
    const res = await execFileAsync(bin, ['version'], { encoding: 'utf8', timeout: 15_000 })
    const m = /go(\d+\.\d+(\.\d+)?)/.exec(res.stdout)
    return { available: true, version: m ? `go${m[1]}` : 'go?', bin }
  } catch {
    return { available: false, version: null, bin }
  }
}

/**
 * 编译 Go 助手（**按内容哈希缓存** ⇒ 只在源码变了时重编）。
 *
 * ⚠️ 产物放在**系统临时目录**，不进仓库（编译产物不是源码）。
 * ⚠️ 只用标准库 ⇒ `go.mod` 零 require ⇒ 离线可编。
 */
export async function ensureGoHelper(bin: string = 'go'): Promise<string> {
  const mainSrc = readFileSync(join(HELPER_DIR, 'main.go'), 'utf8')
  const modSrc = readFileSync(join(HELPER_DIR, 'go.mod'), 'utf8')
  const key = createHash('sha256').update(mainSrc).update(modSrc).digest('hex').slice(0, 16)
  const outDir = join(tmpdir(), 'openvibe-m9-goparse')
  const outBin = join(outDir, `scan-${key}`)
  if (existsSync(outBin)) return outBin
  mkdirSync(outDir, { recursive: true })
  await execFileAsync(bin, ['build', '-o', outBin, '.'], {
    cwd: HELPER_DIR,
    encoding: 'utf8',
    timeout: 180_000,
  })
  return outBin
}

/**
 * **parser 路径**：起 Go 助手扫一批文件。
 *
 * @param root 项目根（绝对路径）
 * @param files **相对**项目根的 `.go` 文件清单（**调用方枚举并限流**）
 * @param specs 模式（`kind` = Go AST 节点类型名）
 */
export async function scanGoParser(
  root: string,
  files: readonly string[],
  specs: readonly { id: string; kind: string }[],
  goBin: string = 'go',
): Promise<GoScanOutput> {
  const helper = await ensureGoHelper(goBin)
  const payload = JSON.stringify({
    root,
    files,
    specs: specs.map((s) => ({ id: s.id, kind: s.kind })),
  })
  const res = await runWithStdin(helper, [], payload, { timeoutMs: 180_000 })
  if (res.timedOut) throw new Error('Go 扫描超时')
  if (res.code !== 0) throw new Error(`Go 扫描失败：${res.stderr.slice(0, 800)}`)
  const parsed = JSON.parse(res.stdout) as Partial<GoScanOutput>
  return {
    hits: Array.isArray(parsed.hits) ? parsed.hits : [],
    file_count: typeof parsed.file_count === 'number' ? parsed.file_count : 0,
    version: typeof parsed.version === 'string' ? parsed.version : '',
  }
}

/**
 * **启发式路径**：TS 正则匹配（**先抹掉注释与字符串**）。
 *
 * ⚠️ 抹掉之后**长度与换行不变** ⇒ 行号与原文件一致 ⇒ 导出清单指得准。
 */
export function scanGoHeuristic(
  root: string,
  files: readonly string[],
  specs: readonly { id: string; heuristic_src: string }[],
): GoScanOutput {
  const hits: GoHit[] = []
  for (const rel of files) {
    const abs = join(root, rel)
    let src = ''
    try {
      src = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const stripped = stripGoComments(src)
    const srcLines = src.split('\n')
    const lines = stripped.split('\n')
    for (const spec of specs) {
      let re: RegExp
      try {
        re = new RegExp(spec.heuristic_src, 'g')
      } catch {
        continue
      }
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] as string
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(line)) !== null) {
          const original = srcLines[i] ?? line
          hits.push({
            spec_id: spec.id,
            file: rel,
            line: i + 1,
            col: m.index + 1,
            text: resolvePatternText(m[0], original, m[0]),
            line_text: original,
          })
          if (m[0] === '') re.lastIndex += 1
        }
      }
    }
  }
  hits.sort((a, b) =>
    a.file === b.file
      ? a.line === b.line
        ? a.spec_id.localeCompare(b.spec_id)
        : a.line - b.line
      : a.file.localeCompare(b.file),
  )
  return { hits, file_count: files.length, version: '' }
}

/** 助手源码目录（测试用：断言助手确实用 `go/parser`）。 */
export function goHelperDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'goparse')
}
