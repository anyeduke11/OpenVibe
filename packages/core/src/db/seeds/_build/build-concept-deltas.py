#!/usr/bin/env python3
"""
生成 M9 P1.6 的种子 JSON：`lang_concept_deltas.json`
（语言差异层：8 个共通概念 × Python/Go 的差异条目，spec §3.12）

为什么内容写在 Python 脚本里而不是直接写 JSON：
- 与 P1.5 的 `build-concept-content.py` 同款理由 —— 少一层转义地狱，**内容所见即所得**。
- 本文件额外要处理 **`supersedes` 链**：新条目指向它取代的旧条目。
  库里 `supersedes` 是 `REFERENCES id`（自增主键），**seed 阶段还不知道 id**。
  ⇒ seed 里用 `supersedes_ref`（结构化引用：concept_slug + lang + aspect + since_version）
  表达"我取代谁"，由本脚本在生成时解析成 `supersedes_index`（整数序号），
  再由 loader 按序号建 id 链。**这样 seed 自身没有悬空引用**。

⚠️ §3.7 纪律：差异内容**全部由本仓自撰**，一个字都不从教程搬。
⚠️ §3.12 纪律：**不删旧条目** —— 语言加了新特性时，老差异被打上 `until_version`
   而不是删除，删掉就丢了「以前为什么没有」这段历史。
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1]  # _build/ → seeds/
COLLECTED_AT = '2026-10-19'

# §3.12 的 aspect 词表（差异面）—— 与 `m9-concept-deltas.ts` 的 DELTA_ASPECTS 同源
ASPECTS = ('语法', '错误模型', '并发模型', '类型系统', '包管理')

# 8 个共通概念（与 P1.5 的 lang_concepts.json 同一组，见该文件 _notes.why_eight）
CONCEPT_SLUGS = (
    'function', 'conditional', 'loop', 'data-type',
    'operator', 'type-conversion', 'error-handling', 'regular-expression',
)

# ============================================================================
# 29 条差异条目
# ----------------------------------------------------------------------------
# 字段：concept_slug / lang / aspect / summary / since_version / until_version
#       / supersedes_ref（取代谁；None = 无）
# ============================================================================
DELTAS: list[dict] = [
    # ── 1. 函数 ────────────────────────────────────────────────────────────
    {
        'concept_slug': 'function', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 的函数是一等对象：可以赋值、传参、当返回值。'
            'lambda 只能写**单个表达式**，写多步逻辑必须转成 def。'
            '函数支持默认参数、关键字参数与 *args/**kwargs，'
            '嵌套函数可直接捕获外层变量（闭包，捕获的是变量本身而非当时的值）。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'function', 'lang': 'python', 'aspect': '类型系统',
        'summary': (
            'Python **不在函数边界做类型检查** —— 传错类型不会报错，要到用错的地方才炸。'
            '类型注解（`def f(x: int) -> str`）是给人和类型检查器（mypy/pyright）看的提示，'
            '**运行期不强制**。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'function', 'lang': 'go', 'aspect': '语法',
        'summary': (
            'Go 的函数值同样是一等对象（可赋值、可传递），但有三条硬差异：'
            '**没有默认参数**（要靠零值 + 变参，或写多个函数）；'
            '**多返回值是签名的一部分**（`func f() (int, error)`，调用方漏接一个编译不过）；'
            '函数体内**不能定义具名嵌套函数**，只能用 `func(...)` 字面量。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'function', 'lang': 'go', 'aspect': '类型系统',
        'summary': (
            'Go 1.18 之前**没有类型参数**，写泛型只能靠代码生成，'
            '或者用 `interface{}` + 类型断言/反射硬扛 —— 后者把类型错误从编译期推到了运行期。'
        ),
        'since_version': '1.0', 'until_version': '1.18',
        'supersedes_ref': None,
    },
    {
        'concept_slug': 'function', 'lang': 'go', 'aspect': '类型系统',
        'summary': (
            'Go 1.18 起**支持类型参数**：`func Map[T, U any](s []T, f func(T) U) []U` '
            '这类泛型函数可以直接写，类型在编译期确定。'
            '⚠️ 老的「无泛型」差异没有删掉，而是打了 `until_version=1.18` —— '
            '那一条记的是「以前为什么没有」这段历史。'
        ),
        'since_version': '1.18', 'until_version': None,
        'supersedes_ref': {
            'concept_slug': 'function', 'lang': 'go', 'aspect': '类型系统',
            'since_version': '1.0',
        },
    },

    # ── 2. 条件语句 ────────────────────────────────────────────────────────
    {
        'concept_slug': 'conditional', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 3.10 之前**没有结构化匹配**，多分派只能靠 if/elif 链，'
            '且链长到第三层以后可读性明显下降。'
        ),
        'since_version': '3.0', 'until_version': '3.10', 'supersedes_ref': None,
    },
    {
        'concept_slug': 'conditional', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 3.10 起有 `match`/`case` **结构化匹配**：'
            '按形状而非按值分派（可解构序列、映射、类实例），'
            '多分支可读性比 if/elif 链好一档。'
        ),
        'since_version': '3.10', 'until_version': None,
        'supersedes_ref': {
            'concept_slug': 'conditional', 'lang': 'python', 'aspect': '语法',
            'since_version': '3.0',
        },
    },
    {
        'concept_slug': 'conditional', 'lang': 'python', 'aspect': '类型系统',
        'summary': (
            'Python 走**真值协议**：`0`、`0.0`、`""`、`[]`、`{}`、`()`、`None` 全都判假，'
            '不只是 `False`。写 `if items:` 是常态，但也意味着「空集合」与「没有值」在条件里**分不开**。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'conditional', 'lang': 'go', 'aspect': '语法',
        'summary': (
            'Go 的 `switch` **不像 C 那样穿透**：每个 case 独立，命中即退出，不需要写 break。'
            'Go 还允许**无表达式**的 switch（`switch { case cond: ... }`），'
            '写法上比 if/else if 链整齐。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'conditional', 'lang': 'go', 'aspect': '类型系统',
        'summary': (
            'Go 走**严格布尔**：条件表达式必须是 `bool`，没有隐式真值。'
            '零长度切片是**真值**（`len(x) == 0` 要显式写）—— '
            '从 Python 迁过来时 `if not items:` 必须改成 `if len(items) == 0:`。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },

    # ── 3. 循环语句 ────────────────────────────────────────────────────────
    {
        'concept_slug': 'loop', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 的 `for/else` 与 `while/else`：**else 块在循环未被 break 打断时执行**。'
            '这个语法常被误读成「循环正常结束后做的事」——它其实是「没有 break 才执行」，'
            '写循环搜索时是顺手的「找到就 break，没找到走 else」。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'loop', 'lang': 'python', 'aspect': '并发模型',
        'summary': (
            'Python 3.7 起 `async`/`await` 成为标准协程语法。'
            'asyncio 任务在 **await 点让出执行权**，所以循环里如果直接引用循环变量，'
            'await 返回时那个变量可能已经被下一轮改掉了 —— 协程里要先把要用的值取出来。'
        ),
        'since_version': '3.7', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'loop', 'lang': 'go', 'aspect': '语法',
        'summary': (
            'Go **只有 `for` 一个循环关键字**（没有 while、没有 do-while），'
            '`for i, v := range xs` 是它的语法糖。Go 没有 for/else —— '
            '「正常结束 vs 提前跳出」的区分在 Go 里靠返回值表达。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'loop', 'lang': 'go', 'aspect': '并发模型',
        'summary': (
            'Go 1.22 之前，`for` 的循环变量在**所有迭代间共享同一个变量**。'
            '于是「循环里 `go func(){...}()` 捕获循环变量」会看到**最后一次**的值 —— '
            '这是 Go 最经典的并发陷阱之一。'
        ),
        'since_version': '1.0', 'until_version': '1.22', 'supersedes_ref': None,
    },
    {
        'concept_slug': 'loop', 'lang': 'go', 'aspect': '并发模型',
        'summary': (
            'Go 1.22 起，**每轮迭代使用新的循环变量**，闭包捕获不再共享，'
            '上面那个陷阱被语言本身修掉了。'
            '⚠️ 老差异没有删 —— 它带 `until_version=1.22`，记的是「1.22 以前为什么会踩坑」。'
        ),
        'since_version': '1.22', 'until_version': None,
        'supersedes_ref': {
            'concept_slug': 'loop', 'lang': 'go', 'aspect': '并发模型',
            'since_version': '1.0',
        },
    },

    # ── 4. 数据类型 ────────────────────────────────────────────────────────
    {
        'concept_slug': 'data-type', 'lang': 'python', 'aspect': '类型系统',
        'summary': (
            'Python 在**运行期**才检查类型；`int` 是**任意精度**（不会溢出，大整数运算会变慢）；'
            '`bool` 是 `int` 的**子类**（`True + 1 == 2`），这种「意外的兼容」是跨语言迁移最容易漏的一处。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'data-type', 'lang': 'python', 'aspect': '类型系统',
        'summary': (
            'Python 3.9 起 `dict` 支持**合并运算符** `|` 与原地合并 `|=`；'
            '3.9 之前合并两个字典只能用 `{**a, **b}` 或 `a.update(b)`。'
        ),
        'since_version': '3.9', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'data-type', 'lang': 'go', 'aspect': '类型系统',
        'summary': (
            'Go 在**编译期**检查类型；`int` 是机器字长（64 位平台上是 64 位），'
            '要更大的数必须显式选 `int64`/`big.Int`。'
            '结构体有**零值**但零值不一定语义正确（`Amount int64` 的 0 与「未设置」无法区分）；'
            '`nil` 在指针/切片/映射/接口/函数/channel 上**语义各不相同，却长得一模一样**。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },

    # ── 5. 运算符 ──────────────────────────────────────────────────────────
    {
        'concept_slug': 'operator', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 的 `/` **永远是真除**（`5 / 2 == 2.5`），整除要用 `//`；'
            '`and`/`or` **返回操作数本身而不是布尔**（`0 or "默认值"` → `"默认值"`）；'
            '支持 `0 < x < 10` 这种**链式比较**（且是短路求值）。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'operator', 'lang': 'go', 'aspect': '语法',
        'summary': (
            'Go 的整数 `/` 是**整除**（`5 / 2 == 2`），要真除必须显式 `float64(5) / 2` —— '
            '这一条**不报错、只是数值变了**，是跨语言迁移最容易静默出错的地方。'
            '`&&`/`||` 返回 **bool** 而非操作数；**不支持链式比较**（必须拆成两个条件）；'
            '`++` 是**语句不是表达式**（`y := x++` 编译不过）。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },

    # ── 6. 类型转换 ────────────────────────────────────────────────────────
    {
        'concept_slug': 'type-conversion', 'lang': 'python', 'aspect': '类型系统',
        'summary': (
            'Python 的转换**一律显式**（`int(x)`、`float(x)`、`str(x)`），'
            '不匹配就抛异常。`int("12")` 会成功 —— 但业务上那个 `"12"` 可能是订单号而不是数量，'
            '**类型系统管不了语义，只有约定管**。'
            '`bool` 与 `int` 可以直接互转（`int(True) == 1`）。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'type-conversion', 'lang': 'go', 'aspect': '类型系统',
        'summary': (
            'Go 只提供**安全的隐式转换**（`int` → `int64` 可以，因为不丢信息），'
            '反向必须显式（`int64` → `int` 编译不过）。'
            '显式的有损转换**不报错**：`int(3.99)` 静默截断、`int32(1<<40)` 静默溢出。'
            '⇒ 转换点要么显式检查失败，要么写一行注释说明「这里的截断是有意的」。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },

    # ── 7. 错误处理 ────────────────────────────────────────────────────────
    {
        'concept_slug': 'error-handling', 'lang': 'python', 'aspect': '错误模型',
        'summary': (
            'Python 用**异常**：`try/except/else/finally` ＋ `raise` ＋ 自定义异常类。'
            '异常层次以 `BaseException` 为根，其中 `KeyboardInterrupt`/`SystemExit` '
            '**不属于 `Exception`**（写 `except Exception` 不会误捕它们，这是好事）。'
            '`raise X from err` 保留原始错误链（`__cause__`）。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'error-handling', 'lang': 'go', 'aspect': '错误模型',
        'summary': (
            'Go 1.13 之前，判断错误只有两条路：与哨兵值比较（`err == io.EOF`）'
            '或做类型断言。**包装过的错误认不出来** —— '
            '一旦某层用 `fmt.Errorf` 加了上下文，上层就再也判不了原始错误。'
        ),
        'since_version': '1.0', 'until_version': '1.13', 'supersedes_ref': None,
    },
    {
        'concept_slug': 'error-handling', 'lang': 'go', 'aspect': '错误模型',
        'summary': (
            'Go 1.13 起有 `errors.Is` / `errors.As` 与 `%w` 包装，'
            '**能穿透包装链判定原始错误**（`errors.Is(err, io.EOF)`）。'
            '这让「低层原样返回、上层加上下文」的惯例真正成立。'
        ),
        'since_version': '1.13', 'until_version': None,
        'supersedes_ref': {
            'concept_slug': 'error-handling', 'lang': 'go', 'aspect': '错误模型',
            'since_version': '1.0',
        },
    },
    {
        'concept_slug': 'error-handling', 'lang': 'go', 'aspect': '错误模型',
        'summary': (
            'Go 1.20 起有 `errors.Join`，可以把多个错误聚合成一个返回，'
            '适合「并发收集多个子任务的结果」这类场景。'
        ),
        'since_version': '1.20', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'error-handling', 'lang': 'go', 'aspect': '错误模型',
        'summary': (
            'Go 1.21 起有**内置** `min`/`max`（可作用于任意有序类型），'
            '以及 `slices` / `maps` 标准包（排序、查找、二分、克隆等通用操作）。'
        ),
        'since_version': '1.21', 'until_version': None, 'supersedes_ref': None,
    },

    # ── 8. 正则表达式 ──────────────────────────────────────────────────────
    {
        'concept_slug': 'regular-expression', 'lang': 'python', 'aspect': '语法',
        'summary': (
            'Python 的 `re` 是**回溯引擎**（NFA 模拟），支持**反向引用**（`\\1`）与'
            '**环视**（前后查找），功能最全；代价是病态模式可能**指数级回溯**（灾难性回溯），'
            '拿用户输入直接去匹配就是拒绝服务面。'
            '命名捕获用 `(?P<name>...)`（`(?<name>...)` 是 PCRE 写法，`re` 模块不支持）。'
        ),
        'since_version': '3.0', 'until_version': None, 'supersedes_ref': None,
    },
    {
        'concept_slug': 'regular-expression', 'lang': 'go', 'aspect': '语法',
        'summary': (
            'Go 的 `regexp` 基于 **RE2**，**保证线性时间** —— '
            '「一个正则不会让服务卡死」在服务端是压倒性的价值。'
            '代价是**不支持反向引用与环视**（支持它们就无法保证线性时间），'
            '所以有些 Python 能写的正则 Go 写不了。命名捕获同样是 `(?P<name>...)`。'
        ),
        'since_version': '1.0', 'until_version': None, 'supersedes_ref': None,
    },
]


def build() -> dict:
    # ---- 自检 ①：aspect 词表闭集 ----
    for d in DELTAS:
        assert d['aspect'] in ASPECTS, f"aspect 越界: {d['aspect']}"
    # ---- 自检 ②：concept_slug 必在 P1.5 的 8 个概念里 ----
    for d in DELTAS:
        assert d['concept_slug'] in CONCEPT_SLUGS, f"concept_slug 未知: {d['concept_slug']}"
    # ---- 自检 ③：版本格式 ----
    for d in DELTAS:
        for key in ('since_version', 'until_version'):
            v = d[key]
            if v is None:
                continue
            parts = v.split('.')
            assert len(parts) == 2 and all(p.isdigit() for p in parts), \
                f"版本格式非法: {d['concept_slug']}/{d['lang']}/{key}={v}"

    # ---- 解析 supersedes_ref → supersedes_index ----
    def key_of(d: dict) -> tuple:
        return (d['concept_slug'], d['lang'], d['aspect'], d['since_version'])

    index_of = {key_of(d): i for i, d in enumerate(DELTAS)}
    assert len(index_of) == len(DELTAS), '有重复的 (concept, lang, aspect, since_version)'

    items = []
    for i, d in enumerate(DELTAS):
        supersedes_index = -1
        ref = d['supersedes_ref']
        if ref is not None:
            ref_key = (ref['concept_slug'], ref['lang'], ref['aspect'], ref['since_version'])
            assert ref_key in index_of, f"supersedes_ref 指向不存在的条目: {ref_key}"
            supersedes_index = index_of[ref_key]
            # 被取代者必须排在前面（supersedes 是一条时间线，前者更早）
            assert supersedes_index < i, f"supersedes 指向了后面的条目: {d['concept_slug']}"
            # 被取代者必须有 until_version（否则两条会同时生效）
            target = DELTAS[supersedes_index]
            assert target['until_version'] is not None, \
                f"被取代的条目缺 until_version: {target['concept_slug']}/{target['lang']}"
        items.append({
            'concept_slug': d['concept_slug'],
            'lang': d['lang'],
            'aspect': d['aspect'],
            'summary': d['summary'],
            'since_version': d['since_version'],
            'until_version': d['until_version'],
            'supersedes_index': supersedes_index,
        })

    return {
        'schemaVersion': 1,
        'collected_at': COLLECTED_AT,
        '_notes': {
            'source_discipline': (
                '⚠️ §3.7 纪律：差异内容**全部由本仓自撰**，一个字都不从教程搬。'
            ),
            'no_delete_rule': (
                '⚠️ §3.12 纪律：**不删旧条目** —— 语言加新特性时，'
                '老差异被打上 `until_version` 而不是删除，'
                '删掉就丢了「以前为什么没有」这段历史。'
            ),
            'supersedes_encoding': (
                '⚠️ `supersedes_index` 指向**同文件内**的另一条（-1 = 无）。'
                '库里的 `supersedes` 是 `REFERENCES id`（自增主键），'
                'seed 阶段还不知道 id ⇒ 用序号表达，由 loader 按序号建 id 链。'
                '**这样 seed 自身没有悬空引用。**'
            ),
            'version_lines': (
                '⚠️ §3.12：两门语言**各自版本线**（Python 一年一版、Go 半年一版），'
                '**绝不合并成一条时间线** —— 判定函数一律先按 lang 过滤。'
            ),
            'aspect_vocab': f"§3.12 的 aspect 词表：{' / '.join(ASPECTS)}",
        },
        'items': items,
    }


def main() -> int:
    seed = build()
    (OUT / 'lang_concept_deltas.json').write_text(
        json.dumps(seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )
    print(f"lang_concept_deltas.json: {len(seed['items'])} 条差异 ✓")
    # 逐概念统计
    per_concept: dict[str, int] = {}
    per_lang: dict[str, int] = {}
    chains = 0
    for it in seed['items']:
        per_concept[it['concept_slug']] = per_concept.get(it['concept_slug'], 0) + 1
        per_lang[it['lang']] = per_lang.get(it['lang'], 0) + 1
        if it['supersedes_index'] >= 0:
            chains += 1
    for slug in CONCEPT_SLUGS:
        print(f"  · {slug:<20} {per_concept.get(slug, 0)} 条")
    print(f"  python={per_lang.get('python', 0)} · go={per_lang.get('go', 0)} · supersedes 链={chains} 条")
    return 0


if __name__ == '__main__':
    sys.exit(main())
