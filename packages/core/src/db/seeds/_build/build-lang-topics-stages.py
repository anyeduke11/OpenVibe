#!/usr/bin/env python3
"""
生成 M9 P1.7 的站分配与前置边：
  - 改写 `lang_topics_python3.json` / `lang_topics_go.json` 的 `stage_id`
  - 生成 `lang_topic_edges.json`（前置边）

═══════════════════════════════════════════════════════════════════════════
为什么是这一份脚本（P1.7 = 补上 M9-P1 期范围里漏掉的前置边子任务）
═══════════════════════════════════════════════════════════════════════════
`m9-dev-plan-2026-10.md` §9 的 M9-P1 期范围写着「**建前置边并过无环守卫**」，
但 §6.2 的子任务列表只到 P1.6 —— 这一项**没有子任务**。
连带 DL-04（前置边无环）、DL-12（库级不进学习路线）、DL-26（§3.1 表数可复算）
三条判据都挂在 P1.1 名下，实质内容却无人产出。
⇒ 本脚本补的就是这一段。

═══════════════════════════════════════════════════════════════════════════
分站口径（§3.6）
═══════════════════════════════════════════════════════════════════════════
- 8 站的切法**不用源的切法**，用「**学完这站能独立做成什么**」：
  语法基础 → 数据结构 → 函数与模块 → 面向对象 → 异常与文件 →
  并发 → Web 框架 → 数据与部署
- ⚠️ 8 站是**Python 视角**的知识点分层（§3.6 原话）⇒ Go 侧站 6/7 允许为空
  （runoob Go 34 条里没有 Web 框架与部署条目 —— 这是**事实**，不是缺口）。
- ⚠️ **库级条目（kind='library'）不进站列表**（DL-12）：它们的 stage_id 恒为 0
  （无语义占位），站列表的查询恒带 `kind='language'` 过滤。
  ⇒ 站列表的语义是「**kind='language' 的条目按 stage_id 分组**」。

═══════════════════════════════════════════════════════════════════════════
前置边口径（§2.3 第 ① 条）
═══════════════════════════════════════════════════════════════════════════
「runoob 的目录看起来像线性列表，但『异常处理』在列表第 25 位、在『面向对象』之前，
  而在 Python 里先学函数才学得出异常。线性序会误导。
  ⇒ 本地维护 `prerequisite` 边，**不用源的顺序当真相**。」

⇒ 下面的边**全部自撰**（按语言知识），不是把源侧栏位次抄一遍。
⇒ **允许同站边**（模块 ↔ 作用域这类真实依赖）—— 所以「边必然跨站」**不能**当作
  无环的理由 ⇒ DL-04 的守卫必须做**真正的环检测**（Kahn / DFS 三色），
  不能靠 stage_id 单调性蒙混过关。

⚠️ 边只挂 `kind='language'` 的条目（DL-12 的推论）：库级条目的前置是
  「任意语言 ＋ 按需用到」，几乎无序（§1.4），把它接进 DAG 就是制造永久阻塞点。
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1]  # _build/ → seeds/

# §3.6 的 8 站（stage_id 0..7）
STAGE_NAMES = (
    '语法基础', '数据结构', '函数与模块', '面向对象',
    '异常与文件', '并发', 'Web 框架', '数据与部署',
)

# ============================================================================
# Python 站分配（42/44 条 language 类条目）
# ============================================================================
PY_STAGES: dict[str, int] = {
    # ── 站 0 · 语法基础 ──
    'python3-comment': 0,
    'python3-interpreter': 0,
    'python3-basic-syntax': 0,
    'python3-step1': 0,
    'python3-basic-operators': 0,
    'python3-number': 0,
    'python3-conditional-statements': 0,
    'python3-loop': 0,
    'python3-for': 0,
    'python3-while': 0,
    # ── 站 1 · 数据结构 ──
    'python3-data-type': 1,
    'python3-string': 1,
    'python3-list': 1,
    'python3-tuple': 1,
    'python3-dictionary': 1,
    'python3-set': 1,
    'python3-data-structure': 1,
    'python-comprehensions': 1,
    'python3-type-conversion': 1,
    'python3-built-in-functions': 1,
    # ── 站 2 · 函数与模块 ──
    'python3-function': 2,
    'python-lambda': 2,
    'python-decorators': 2,
    'python3-module': 2,
    'python3-name-main': 2,
    'python3-namespace-scope': 2,
    'python3-iterator-generator': 2,
    'python3-with-keyword': 2,
    'python-type-hints': 2,    # 「Python 类型注解」
    # ── 站 3 · 面向对象 ──
    'python3-class': 3,
    'python3-examples': 3,   # 「Python3 实例」
    # ── 站 4 · 异常与文件 ──
    'python3-errors-execptions': 4,
    'python3-inputoutput': 4,
    'python3-file-methods': 4,
    'python3-os-file-methods': 4,
    'python3-reg-expressions': 4,
    'python3-date-time': 4,
    # ── 站 5 · 并发 ──
    'python3-multithreading': 5,
    # ── 站 6 · Web 框架 ──
    'python3-cgi-programming': 6,
    'python3-socket': 6,
    'python3-smtp': 6,
    'python-uwsgi': 6,
    # ── 站 7 · 数据与部署 ──
    'python3-pip': 7,
    'python-qt': 7,
    'python-ai-draw': 7,
}

# ============================================================================
# Go 站分配（27 条 language 类条目）
# ============================================================================
GO_STAGES: dict[str, int] = {
    # ── 站 0 · 语法基础 ──
    'go-basic-syntax': 0,
    'go-program-structure': 0,
    'go-variables': 0,
    'go-constants': 0,
    'go-operators': 0,
    'go-decision-making': 0,
    'go-loops': 0,
    # ── 站 1 · 数据结构 ──
    'go-data-types': 1,
    'go-arrays': 1,
    'go-pointers': 1,
    'go-structures': 1,
    'go-slice': 1,
    'go-range': 1,
    'go-map': 1,
    'go-type-casting': 1,
    'go-type-assertion': 1,
    'go-scope-rules': 1,
    # ── 站 2 · 函数与模块 ──
    'go-functions': 2,
    'go-recursion': 2,
    'go-generics': 2,
    'go-modules': 2,
    # ── 站 3 · 面向对象 ──
    'go-interfaces': 3,
    'go-inheritance': 3,
    # ── 站 4 · 异常与文件 ──
    'go-error-handling': 4,
    'go-file-handle': 4,
    'go-regex': 4,
    # ── 站 5 · 并发 ──
    'go-concurrent': 5,
}

# ============================================================================
# 前置边（自撰 · 不用源的顺序当真相 · §2.3）
# 方向：(topic_slug, prereq_slug) —— topic 依赖 prereq
# ============================================================================
PY_EDGES: list[tuple[str, str]] = [
    # ── 站 1 · 数据结构 ──
    ('python3-data-type', 'python3-basic-syntax'),
    ('python3-data-type', 'python3-number'),
    ('python3-data-type', 'python3-basic-operators'),
    ('python3-string', 'python3-data-type'),
    ('python3-string', 'python3-basic-syntax'),
    ('python3-list', 'python3-data-type'),
    ('python3-list', 'python3-loop'),
    ('python3-tuple', 'python3-data-type'),
    ('python3-dictionary', 'python3-data-type'),
    ('python3-set', 'python3-data-type'),
    ('python3-data-structure', 'python3-list'),
    ('python3-data-structure', 'python3-dictionary'),
    ('python3-data-structure', 'python3-set'),
    ('python-comprehensions', 'python3-list'),
    ('python-comprehensions', 'python3-loop'),
    ('python-comprehensions', 'python3-conditional-statements'),
    ('python3-type-conversion', 'python3-data-type'),
    ('python3-type-conversion', 'python3-basic-operators'),
    ('python3-built-in-functions', 'python3-data-type'),
    ('python3-built-in-functions', 'python3-loop'),
    # ── 站 2 · 函数与模块 ──
    ('python3-function', 'python3-basic-syntax'),
    ('python3-function', 'python3-loop'),
    ('python3-function', 'python3-conditional-statements'),
    ('python-lambda', 'python3-function'),
    ('python-lambda', 'python3-conditional-statements'),
    ('python-decorators', 'python3-function'),
    ('python-decorators', 'python3-namespace-scope'),
    ('python3-module', 'python3-function'),
    ('python3-module', 'python3-namespace-scope'),
    ('python3-name-main', 'python3-module'),
    ('python3-namespace-scope', 'python3-function'),
    ('python3-iterator-generator', 'python3-function'),
    ('python3-iterator-generator', 'python3-loop'),
    ('python3-with-keyword', 'python3-function'),
    ('python3-with-keyword', 'python3-namespace-scope'),
    ('python-type-hints', 'python3-data-type'),
    ('python-type-hints', 'python3-function'),
    # ── 站 3 · 面向对象 ──
    ('python3-class', 'python3-function'),
    ('python3-class', 'python3-namespace-scope'),
    ('python3-class', 'python3-data-structure'),
    ('python3-examples', 'python3-class'),
    # ── 站 4 · 异常与文件 ──
    ('python3-errors-execptions', 'python3-function'),
    ('python3-errors-execptions', 'python3-conditional-statements'),
    ('python3-inputoutput', 'python3-data-type'),
    ('python3-inputoutput', 'python3-basic-syntax'),
    ('python3-file-methods', 'python3-data-type'),
    ('python3-file-methods', 'python3-inputoutput'),
    ('python3-os-file-methods', 'python3-file-methods'),
    ('python3-os-file-methods', 'python3-module'),
    ('python3-reg-expressions', 'python3-string'),
    ('python3-reg-expressions', 'python3-data-type'),
    ('python3-date-time', 'python3-data-type'),
    ('python3-date-time', 'python3-module'),
    # ── 站 5 · 并发 ──
    ('python3-multithreading', 'python3-function'),
    ('python3-multithreading', 'python3-loop'),
    ('python3-multithreading', 'python3-os-file-methods'),
    # ── 站 6 · Web 框架 ──
    ('python3-cgi-programming', 'python3-errors-execptions'),
    ('python3-cgi-programming', 'python3-inputoutput'),
    ('python3-socket', 'python3-os-file-methods'),
    ('python3-socket', 'python3-errors-execptions'),
    ('python3-smtp', 'python3-socket'),
    ('python3-smtp', 'python3-errors-execptions'),
    ('python-uwsgi', 'python3-module'),
    ('python-uwsgi', 'python3-cgi-programming'),
    # ── 站 7 · 数据与部署 ──
    ('python3-pip', 'python3-module'),
    ('python-qt', 'python3-data-structure'),
    ('python-qt', 'python3-module'),
    ('python-ai-draw', 'python3-module'),
    ('python-ai-draw', 'python3-data-type'),
]

GO_EDGES: list[tuple[str, str]] = [
    # ── 站 1 · 数据结构 ──
    ('go-data-types', 'go-basic-syntax'),
    ('go-data-types', 'go-operators'),
    # ⚠️ 方向：**数据类型依赖变量**，不是反过来。
    #   「变量」= 给值起个名字（站 0 语法基础）；「数据类型」= 这个名字能装哪几种值
    #   （站 1 数据结构）—— runoob 的 Go 数据类型页开头就是「变量可以是数字、字符串…」
    #   ⇒ 它预设了读者已懂「变量」⇒ 变量是前置。
    #   反过来写成「变量依赖数据类型」会让前置站（1）晚于后继站（0），
    #   路线自上而下走时出现「要学后面的才能学前面的」。
    ('go-data-types', 'go-variables'),
    ('go-variables', 'go-basic-syntax'),
    ('go-constants', 'go-variables'),
    ('go-constants', 'go-basic-syntax'),
    ('go-arrays', 'go-data-types'),
    ('go-pointers', 'go-variables'),
    ('go-pointers', 'go-arrays'),
    ('go-structures', 'go-data-types'),
    ('go-structures', 'go-variables'),
    ('go-slice', 'go-arrays'),
    ('go-slice', 'go-pointers'),
    ('go-range', 'go-arrays'),
    ('go-range', 'go-slice'),
    ('go-range', 'go-loops'),
    ('go-map', 'go-data-types'),
    ('go-map', 'go-variables'),
    ('go-type-casting', 'go-data-types'),
    ('go-type-casting', 'go-operators'),
    ('go-type-assertion', 'go-data-types'),
    ('go-type-assertion', 'go-basic-syntax'),
    ('go-scope-rules', 'go-variables'),
    # ── 站 2 · 函数与模块 ──
    ('go-functions', 'go-basic-syntax'),
    ('go-functions', 'go-variables'),
    ('go-recursion', 'go-functions'),
    ('go-generics', 'go-functions'),
    ('go-generics', 'go-data-types'),
    ('go-modules', 'go-functions'),
    ('go-modules', 'go-variables'),
    # ── 站 3 · 面向对象 ──
    ('go-interfaces', 'go-data-types'),
    ('go-interfaces', 'go-functions'),
    ('go-inheritance', 'go-structures'),
    ('go-inheritance', 'go-interfaces'),
    # ── 站 4 · 异常与文件 ──
    ('go-error-handling', 'go-functions'),
    ('go-error-handling', 'go-data-types'),
    ('go-file-handle', 'go-data-types'),
    ('go-file-handle', 'go-functions'),
    ('go-regex', 'go-data-types'),
    ('go-regex', 'go-functions'),
    # ── 站 5 · 并发 ──
    ('go-concurrent', 'go-functions'),
    ('go-concurrent', 'go-loops'),
    ('go-concurrent', 'go-data-types'),
]


def _assert_known(stages: dict[str, int], known: set[str], lang: str) -> None:
    unknown = set(stages) - known
    assert not unknown, f"{lang} 站分配里有未知 slug: {sorted(unknown)}"
    missing = known - set(stages)
    assert not missing, f"{lang} 有条目没分站: {sorted(missing)}"


def _assert_no_cycle(nodes: list[str], edges: list[tuple[str, str]]) -> None:
    """构建期自检：Kahn 拓扑排序，检出环。"""
    adj: dict[str, list[str]] = {n: [] for n in nodes}
    indeg: dict[str, int] = {n: 0 for n in nodes}
    for topic, prereq in edges:
        assert topic in adj, f"边的 topic 不存在: {topic}"
        assert prereq in adj, f"边的 prereq 不存在: {prereq}"
        adj[prereq].append(topic)
        indeg[topic] += 1
    queue = [n for n in nodes if indeg[n] == 0]
    visited = 0
    while queue:
        n = queue.pop()
        visited += 1
        for m in adj[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
    assert visited == len(nodes), (
        f"前置边成环（拓扑排序只处理了 {visited}/{len(nodes)} 个节点）"
    )


def apply_stages(seed_file: str, stages: dict[str, int], lang: str) -> dict:
    path = OUT / seed_file
    seed = json.loads(path.read_text(encoding='utf-8'))
    lang_items = [it for it in seed['items'] if it['kind'] == 'language']
    _assert_known(stages, {it['slug'] for it in lang_items}, lang)

    for it in seed['items']:
        if it['kind'] == 'library':
            # 库级条目不进站列表（DL-12）⇒ stage_id 无语义，恒为 0
            it['stage_id'] = 0
        else:
            it['stage_id'] = stages[it['slug']]

    seed['_notes']['stage_id'] = (
        f'P1.7 分站（§3.6 的 8 站，Python 视角）：{lang} 侧 {len(stages)} 条 language 类条目已分站；'
        f"库级条目（kind='library'）stage_id 恒为 0（不进站列表，DL-12）。"
        f"站名：{' / '.join(STAGE_NAMES)}"
    )
    path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return seed


def build_edges(py_stages: dict[str, int], go_stages: dict[str, int]) -> dict:
    items = []
    for lang, stages, edges in (
        ('python', py_stages, PY_EDGES),
        ('go', go_stages, GO_EDGES),
    ):
        for topic, prereq in edges:
            items.append({'lang': lang, 'topic_slug': topic, 'prereq_slug': prereq})

    # ── 自检 ①：边只挂 language 类条目（DL-12 的推论） ──
    py = json.loads((OUT / 'lang_topics_python3.json').read_text(encoding='utf-8'))
    go = json.loads((OUT / 'lang_topics_go.json').read_text(encoding='utf-8'))
    language_slugs = {
        'python': {it['slug'] for it in py['items'] if it['kind'] == 'language'},
        'go': {it['slug'] for it in go['items'] if it['kind'] == 'language'},
    }
    library_slugs = {
        'python': {it['slug'] for it in py['items'] if it['kind'] == 'library'},
        'go': {it['slug'] for it in go['items'] if it['kind'] == 'library'},
    }
    for it in items:
        lang = it['lang']
        for role in ('topic_slug', 'prereq_slug'):
            slug = it[role]
            assert slug not in library_slugs[lang], \
                f"边接到了库级条目（DL-12）: {lang}/{slug}"
            assert slug in language_slugs[lang], f"边的 {role} 不存在: {lang}/{slug}"
        assert it['topic_slug'] != it['prereq_slug'], f"自环: {it}"

    # ── 自检 ②：无自环 + 无环（构建期 Kahn） ──
    for lang, stages, edges in (
        ('python', py_stages, PY_EDGES),
        ('go', go_stages, GO_EDGES),
    ):
        _assert_no_cycle(sorted(language_slugs[lang]), edges)

    # ── 自检 ③：每个非站 0 的条目至少一条前置边 ──
    for lang, stages, edges in (
        ('python', py_stages, PY_EDGES),
        ('go', go_stages, GO_EDGES),
    ):
        with_prereq = {topic for topic, _ in edges}
        for slug, stage in stages.items():
            if stage == 0:
                continue
            assert slug in with_prereq, f"{lang}/{slug}（站 {stage}）没有前置边"

    # ── 自检 ④：站号连续无空洞（每门语言 0..max） ──
    for lang, stages in (('python', py_stages), ('go', go_stages)):
        used = sorted(set(stages.values()))
        assert used == list(range(len(used))), f"{lang} 站号有空洞: {used}"

    # ── 自检 ⑤：前置站不得晚于后继站 ──
    #   路线是「自上而下按站走」的 ⇒ 前置出现在更晚的站 = 用户撞上
    #   「要学后面的才能学前面的」。这不是无环的充分条件（同站边允许存在），
    #   但它是路线可走通的**必要条件**。
    #   ⚠️ 这条自检是补上的 —— 首版漏了它，于是一条方向写反的边
    #   （「go-variables ← go-data-types」）直到运行期守卫才暴露。
    for lang, stages, edges in (
        ('python', py_stages, PY_EDGES),
        ('go', go_stages, GO_EDGES),
    ):
        for topic, prereq in edges:
            assert stages[prereq] <= stages[topic], (
                f"{lang}: 前置站晚于后继站 —— {topic}(站 {stages[topic]}) "
                f"依赖 {prereq}(站 {stages[prereq]})"
            )

    return {
        'schemaVersion': 1,
        'collected_at': '2026-10-20',
        '_notes': {
            'source_discipline': (
                '⚠️ §2.3 第 ① 条：前置边**自撰**，**不用源的侧栏顺序当真相**。'
                '反例见 §1.4：「Python3 模块」在源里是 #28，「Python logging 模块」是 #76 —— '
                '相隔 48 位，而 logging 明显依赖模块与函数。'
            ),
            'same_stage_edges_allowed': (
                '⚠️ **允许同站边**（模块 ↔ 作用域这类真实依赖）—— '
                '所以「边必然跨站」**不能**当作无环的理由，'
                'DL-04 的守卫必须做**真正的环检测**。'
            ),
            'library_excluded': (
                "⚠️ 边只挂 kind='language' 的条目（DL-12 的推论）："
                '库级条目的前置是「任意语言 ＋ 按需用到」，几乎无序（§1.4），'
                '接进 DAG 就是制造永久阻塞点。'
            ),
            'direction': '方向：(topic_slug, prereq_slug) —— topic 依赖 prereq（与表的 topic_id → prereq_topic_id 一致）',
            'stage_order': (
                '⚠️ 前置站不得晚于后继站（构建期自检 ⑤）：路线自上而下按站走，'
                '前置出现在更晚的站 = 「要学后面的才能学前面的」。'
                '同站边允许存在（模块 ↔ 作用域这类真实依赖），'
                '所以「边必然跨站」不能当作无环的理由 —— DL-04 靠真正的环检测。'
            ),
            'stage_names': ' / '.join(STAGE_NAMES),
        },
        'items': items,
    }


def main() -> int:
    py_seed = apply_stages('lang_topics_python3.json', PY_STAGES, 'python')
    go_seed = apply_stages('lang_topics_go.json', GO_STAGES, 'go')
    edges = build_edges(PY_STAGES, GO_STAGES)
    (OUT / 'lang_topic_edges.json').write_text(
        json.dumps(edges, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )

    for lang, seed, stages in (('python', py_seed, PY_STAGES), ('go', go_seed, GO_STAGES)):
        per_stage: dict[int, int] = {}
        for slug, st in stages.items():
            per_stage[st] = per_stage.get(st, 0) + 1
        print(f"{lang}: {len(stages)} 条 language 类分站 · 边 {sum(1 for e in edges['items'] if e['lang'] == lang)} 条")
        for st in sorted(per_stage):
            print(f"   站 {st} · {STAGE_NAMES[st]:<10} {per_stage[st]:>2} 条")
    print(f"lang_topic_edges.json: {len(edges['items'])} 条前置边 ✓")
    return 0


if __name__ == '__main__':
    sys.exit(main())
