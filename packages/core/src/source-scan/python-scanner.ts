/**
 * `packages/core/src/source-scan/python-scanner.ts` —— **P4.1 · Python `ast` 扫描器**
 * （`m9-dev-language-roadmap.md` §3.8「实现口径」表 · dev-plan §6.10 P4.1）
 *
 * ## 它是什么
 *
 * 用 **Python 标准库 `ast`** 走一遍语法树，找出「知识点对应的代码模式」。
 *
 * ## ⚠️ 为什么是「起一个 `python3` 子进程」而不是在 TS 里写 Python 解析器
 *
 * §3.8 的实现口径表写死：「Python = 标准库 `ast` 模块 · **零**依赖（stdlib）」。
 * 本仓是 Node/TS ⇒ **没有**零依赖的 Python 解析器可用（自己写一个 Python 语法分析器
 * 远超一期的工作量，且必然不如 `ast` 准）。
 * ⇒ 唯一既满足「用 `ast`」又满足「零新增依赖」的做法是：**起一个 `python3` 子进程**，
 *   让**标准库**做解析，TS 侧只负责编排与落库。
 *
 * ⚠️ **零新增 npm 依赖**（owner 长期立场：零依赖优先）。
 *
 * ## ⚠️ 没有 `python3` 怎么办：**显式失败**，不静默回退
 *
 * §3.8 只给 **Go** 定义了回退路径（parser → 正则）⇒ Python 侧**没有**合法的回退。
 * ⚠️ 若 `python3` 不在，**不许**悄悄少扫一半 Python 文件（那会让用户以为「项目里没用」）
 *   ⇒ 抛 `SourceScanError`，由上层把「Python 侧未扫描」**显式告知**。
 *
 * ## ⚠️ 命中的是**哪个节点**，由登记表说了算
 *
 * 模式表（`m9-source-patterns.ts`）里的 `node_spec` 决定「匹配哪个节点、报哪个节点的位置」。
 * 例：`FunctionDef:decorator` 匹配的是「**带装饰器**的函数」，但**报的位置**是**装饰器**
 * （不是 `def` 那一行）⇒ 导出的 `file:line` 指向用户真正写的那行。
 */
import { runWithStdin } from './run-with-stdin'

/** 扫描失败的原因（**显式告知**，不静默）。 */
export type SourceScanErrorReason =
  | 'python-not-found'
  | 'python-failed'
  | 'python-timeout'
  | 'bad-python-output'

export class SourceScanError extends Error {
  constructor(
    public readonly reason: SourceScanErrorReason,
    message: string,
    public readonly detail: string = '',
  ) {
    super(message)
    this.name = 'SourceScanError'
  }
}

/** 传给 Python 侧的一条模式。 */
export interface PythonSpec {
  id: string
  /** 节点类型名（`Import` / `ClassDef` / …） */
  kind: string
  /** 条件（`module=logging` / `decorator`）；缺省 = 无条件 */
  cond?: string
}

/** Python 侧返回的一条命中。 */
export interface PythonHit {
  spec_id: string
  /** 相对项目根的路径（**helper 侧就算相对路径** ⇒ 绝对路径根本没有机会出现） */
  file: string
  line: number
  col: number
  /** 命中的源码片段（可能跨行） */
  text: string
  /** 命中所在行的整行文本（兜底拼模式串用） */
  line_text: string
}

/**
 * Python 侧的扫描脚本（**内嵌** ⇒ 零外部文件依赖）。
 *
 * ⚠️ **只用标准库**（`ast` / `json` / `os` / `sys`）—— §3.8 的硬要求。
 * ⚠️ 注释一律英文：本脚本未来有可能被登记进外部源扫描范围，
 *   那里的「成段散文」规则对 ≥40 连续汉字判红 ⇒ 中文注释会平白触发。
 */
const PY_SCAN = `
import ast, json, os, sys

def target_for(node, kind, cond):
    # Returns the node to report (position + text), or None.
    if kind == "Import":
        if cond is None:
            return node if isinstance(node, ast.Import) else None
        if cond.startswith("module="):
            want = cond[len("module="):]
            if isinstance(node, ast.Import):
                return node if any(a.name == want for a in node.names) else None
            if isinstance(node, ast.ImportFrom):
                return node if (node.module or "") == want else None
        return None
    if kind == "ImportFrom":
        return node if isinstance(node, ast.ImportFrom) else None
    if kind == "FunctionDef":
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return None
        if cond == "decorator":
            return node.decorator_list[0] if node.decorator_list else None
        return node
    if kind == "ClassDef":
        return node if isinstance(node, ast.ClassDef) else None
    if kind == "Try":
        return node if isinstance(node, ast.Try) else None
    if kind == "With":
        return node if isinstance(node, (ast.With, ast.AsyncWith)) else None
    if kind == "Lambda":
        return node if isinstance(node, ast.Lambda) else None
    if kind == "Comprehension":
        return node if isinstance(node, (ast.ListComp, ast.SetComp,
                                        ast.DictComp, ast.GeneratorExp)) else None
    if kind == "Global":
        return node if isinstance(node, (ast.Global, ast.Nonlocal)) else None
    if kind == "Yield":
        return node if isinstance(node, (ast.Yield, ast.YieldFrom)) else None
    if kind == "AnnAssign":
        return node if isinstance(node, ast.AnnAssign) else None
    if kind == "JoinedStr":
        return node if isinstance(node, ast.JoinedStr) else None
    return None

def main():
    payload = json.load(sys.stdin)
    root = payload["root"]
    specs = payload["specs"]
    hits = []
    parsed_files = 0
    for rel in payload["files"]:
        path = os.path.join(root, rel)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                src = fh.read()
            tree = ast.parse(src)
        except (SyntaxError, OSError, ValueError):
            continue
        parsed_files += 1
        lines = src.splitlines()
        for node in ast.walk(tree):
            for spec in specs:
                tgt = target_for(node, spec["kind"], spec.get("cond"))
                if tgt is None:
                    continue
                text = ""
                try:
                    text = ast.get_source_segment(src, tgt) or ""
                except Exception:
                    text = ""
                line = getattr(tgt, "lineno", 0)
                col = getattr(tgt, "col_offset", 0) + 1
                if spec.get("cond") == "decorator":
                    text = "@" + text
                line_text = lines[line - 1] if 0 < line <= len(lines) else ""
                hits.append({"spec_id": spec["id"], "file": rel, "line": line,
                             "col": col, "text": text, "line_text": line_text})
    json.dump({"hits": hits, "file_count": parsed_files,
               "version": sys.version.split()[0]}, sys.stdout)

main()
`

/** Python 侧的扫描结果。 */
export interface PythonScanOutput {
  hits: PythonHit[]
  file_count: number
  version: string
}

/** 把 `node_spec` 拆成 `kind` 与 `cond`（**登记表 → helper 的唯一转换点**）。 */
export function parseNodeSpec(nodeSpec: string): { kind: string; cond?: string } {
  const idx = nodeSpec.indexOf(':')
  if (idx < 0) return { kind: nodeSpec }
  return { kind: nodeSpec.slice(0, idx), cond: nodeSpec.slice(idx + 1) }
}

/**
 * 扫一批 Python 文件。
 *
 * @param root 项目根（**绝对路径**）
 * @param files **相对**项目根的 `.py` 文件清单（**调用方枚举并限流**）
 * @param specs 要匹配的模式
 * @param pythonBin Python 可执行文件（默认 `python3`）
 */
export async function scanPython(
  root: string,
  files: readonly string[],
  specs: readonly PythonSpec[],
  pythonBin: string = 'python3',
): Promise<PythonScanOutput> {
  const payload = JSON.stringify({
    root,
    files,
    specs: specs.map((s) => ({ id: s.id, kind: s.kind, cond: s.cond })),
  })

  let stdout = ''
  try {
    const res = await runWithStdin(pythonBin, ['-c', PY_SCAN], payload, { timeoutMs: 180_000 })
    if (res.timedOut) {
      throw new SourceScanError('python-timeout', 'python3 扫描超时', pythonBin)
    }
    if (res.code !== 0) {
      throw new SourceScanError('python-failed', 'python3 扫描失败', res.stderr.slice(0, 800))
    }
    stdout = res.stdout
  } catch (err) {
    if (err instanceof SourceScanError) throw err
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      throw new SourceScanError('python-not-found', '未找到 python3', pythonBin)
    }
    throw new SourceScanError('python-failed', 'python3 扫描失败', e.message ?? String(err))
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (err) {
    throw new SourceScanError('bad-python-output', 'python3 输出不是合法 JSON', String(err))
  }
  const out = parsed as Partial<PythonScanOutput>
  if (!Array.isArray(out.hits)) {
    throw new SourceScanError('bad-python-output', 'python3 输出缺少 hits 字段', stdout.slice(0, 400))
  }
  return {
    hits: out.hits,
    file_count: typeof out.file_count === 'number' ? out.file_count : 0,
    version: typeof out.version === 'string' ? out.version : '',
  }
}
