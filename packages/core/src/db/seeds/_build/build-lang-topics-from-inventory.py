#!/usr/bin/env python3
"""
把 `docs/devlog-evidence/M9-probe/runoob-{python3,go}-inventory.json`
（采集脚本跑出来的标题 / URL / 段名）转成 `lang_topics` 种子 JSON。

不做的事（与 P1.2/P1.3/P1.4 边界一致）：
- **正文一个字不入仓**（DL-02）；inventory 只有 ordinal / section / title / url 四件，正文一律未取
- **stage_id 全部 0**（§3.6 写死「站数与每站知识点数本轮不定死」—— P1d 实测归类）
- **kind 由 §1.4 分类规则计算**（DL-13）—— 不是写死 'language'；详见 `classify_kind` 函数
- **summary 为空**（P1.5 概念层三段内容会从某条带过来）

slug 推导规则：
- 剥 `https://www.runoob.com/` 前缀（含双斜杠归一为单斜杠）
- 剥 `.html` 后缀
- 取最后一段路径
- 同 lang 内重名时加 `-<n>` 区分（典型：Go item 4 与 34 同 URL `go-vscode`）

为什么这条 builder 脚本**必须**留：
- inventory 是采集的原始证据；seed 是入库的整理后产物；两者都该入库。
- 下一轮（P1d / 任何重抽 inventory 的人）能照着这份脚本 1:1 重做。

⚠️ **分类规则两份源（双轨风险）**：
- 运行时：`packages/core/src/db/m9-classify-lang-topics.ts`
- builder：本文件的 `classify_kind` 函数
- 任何一边改都改另一边。
- DL-13 单测有「两份结果必须一致」硬闸 —— 不一致会红。
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]  # _build → seeds → db → src → core → packages → repo
INVENTORY = REPO / 'docs' / 'devlog-evidence' / 'M9-probe'
OUT = Path(__file__).resolve().parents[1]  # _build/ → seeds/

# ⚠️ 已知碰撞：runoob 源侧 Go 列表第 4 与第 34 同 URL（`go-vscode.html`），
# 标题不同（"Go 开发工具" vs "使用 VSCode 开发 Go"）—— inventory 自己备注「本轮未做抽样验链」。
# 这里手写一份 slug 映射，覆盖默认推导。
GO_SLUG_OVERRIDE: dict[int, str] = {
    4: 'go-vscode-tools',    # 「Go 开发工具」
    34: 'go-vscode-dev',     # 「使用 VSCode 开发 Go」
}


# ============================================================================
# §1.4 分类规则（P1.4 · DL-13）
# ⚠️ 与 `packages/core/src/db/m9-classify-lang-topics.ts` 同步 —— 改一处必改另一处
# ============================================================================
#
# spec §1.4 第 95、100 行：标题含「模块/库/驱动」或落在第三方名清单 ⇒ 库级
# spec §1.4 第 101 行：环境与杂项（教程/简介/环境搭建/Pycharm/VScode/测验/资源）
# spec §1.4 第 113 行：「library 进按需查阅区」—— 环境与杂项也归 library
# spec §3.1 schema：kind ∈ {language, library} 二值

THIRD_PARTY_NAMES = frozenset([
    # §1.4 第 100 行 Python stdlib 举例（8 个）
    'logging', 'pickle', 'subprocess', 'queue', 're', 'csv', 'threading', 'asyncio',
    # 同源扩展：runoob 单列的 Python stdlib
    'urllib', 'sys', 'stringio', 'datetime', 'json', 'xml', 'smtplib',
    # §1.4 第 100 行 Python 第三方举例（5 个）
    'mysql', 'mongodb', 'scrapy', 'selenium', 'pyqt',
    # 同源扩展：连接器与同族第三方库
    'mysql-connector', 'pymysql', 'requests', 'openai', 'statistics', 'hashlib',
    'pyecharts', 'beautifulsoup', 'markdown',
])

KW_LIBRARY = ('模块', '驱动')
KW_ENV = (
    '教程', '简介', '环境搭建', '环境安装', 'PYCHARM', 'VSCODE', '测验',
    '有用的资源', '虚拟环境', '开发工具', '概览',
    # ⚠️ **刻意不含「实例」「类型注解」**（P1.7 开工时发现，P1.4 规则缺陷）：
    #   「Python3 实例」与「Python 类型注解」都是**语言知识点**
    #   （§3.7 第 534 行明确把「类型注解」列为 Python 语言专有条目），
    #   却被环境与杂项关键词误伤成 library ⇒ 同样进不了 DAG。
)


def _has_third_party(title: str) -> bool:
    lt = title.lower()
    return any(name in lt for name in THIRD_PARTY_NAMES)


# 「<语言> 模块」形态 —— 讲的是模块这个概念本身，不是某个库。
# ⚠️ 这条例外是 P1.7 开工时才发现的（P1.4 的规则缺陷，跨期传导）：
#   「Python3 模块」标题含「模块」⇒ 被原规则判成库级 ⇒ 它进不了 DAG。
#   但它恰恰是 spec §1.4 第 109–111 行点名的「源顺序 ≠ 依赖」反例主角，
#   也是 §3.6 站 2「函数与模块」的核心节点。
#   ⇒ 关键词命中 ≠ 语义命中。
LANGUAGE_MODULE_EXCEPTIONS = (
    re.compile(r'^Python\s*3?\s*模块$'),
    re.compile(r'^Go\s*模块$'),
    re.compile(r'^Go\s*Modules$'),
)


def _has_library_keyword(title: str) -> bool:
    if any(re_ .match(title) for re_ in LANGUAGE_MODULE_EXCEPTIONS):
        return False
    if any(kw in title for kw in KW_LIBRARY):
        return True
    # 含「库」字但**不在「标准库」语境** → library
    if '库' in title and '标准库' not in title:
        return True
    return False


def _has_env_keyword(title: str) -> bool:
    upper = title.upper()
    return any(kw.upper() in upper for kw in KW_ENV)


def classify_kind(title: str) -> str:
    """
    spec §1.4 → §3.1 schema kind 映射：
      - 语言知识点 → 'language'
      - 库级        → 'library'
      - 环境与杂项  → 'library'（按 §1.4 第 113 行，不进学习路线）
    """
    if _has_library_keyword(title) or _has_third_party(title):
        return 'library'
    if _has_env_keyword(title):
        return 'library'
    return 'language'


def to_slug(lang: str, ordinal: int, url: str) -> str:
    if lang == 'go' and ordinal in GO_SLUG_OVERRIDE:
        return GO_SLUG_OVERRIDE[ordinal]
    # 默认推导
    path = url.replace('https://www.runoob.com/', '')
    # Go 源 URL 双斜杠归一
    path = path.replace('//', '/').strip('/')
    # 剥 .html
    if path.endswith('.html'):
        path = path[:-len('.html')]
    # 取最后一段
    return path.split('/')[-1]


def transform(lang: str, src: dict) -> dict:
    items = []
    for it in src['items']:
        slug = to_slug(lang, it['ordinal'], it['url'])
        items.append({
            'lang': lang,
            'slug': slug,
            'title': it['title'],
            'summary': '',
            'stage_id': 0,
            'ref_url': it['url'],
            'ref_title': it['title'],
            'source_kind': 'runoob',
            'source_checked_at': src.get('collected_at', '2026-10-18'),
            'kind': classify_kind(it['title']),
        })
    return {
        'schemaVersion': 1,
        'source_url': src['source'],
        'collected_at': src.get('collected_at', '2026-10-18'),
        '_notes': {
            'stage_id': '全部 0 —— §3.6 「站数与每站知识点数本轮不定死」，P1d 实测归类',
            # ⚠️ **按语言分别写** —— 同一句话套到两门语言上会变成假事实：
            #   Python 的严格库级口径是 §1.4 第 100 行那一档；Go 侧 §1.4 从未做过
            #   三档拆分，runoob Go 34 条里的「教程首页 / 简介 / 环境安装 / 开发工具 /
            #   测验 / VSCode」是**环境与杂项**（按 §1.4 第 113 行归 library，不进学习路线），
            #   但**不是**严格库级。
            'kind': (
                'P1.4 重打 · 严格库级 30 条 = 35.7%（spec §1.4 第 100 行已于 2026-10-20 订正为 '
                '30 条 = 35.7%；P1.7 修「<语言> 模块」误判后差 1，现已闭合，仍在 DL-13 的 [34%, 38%] 区间内）'
                ' · 分类器见 packages/core/src/db/m9-classify-lang-topics.ts'
                if lang == 'python' else
                'P1.4 重打 · 库级 7 条（runoob Go 34 条里的教程首页 / 简介 / 环境安装 / '
                '开发工具 / 测验 / VSCode 类，按 §1.4 第 113 行归 library，不进学习路线；'
                '§1.4 从未对 Go 做三档拆分 ⇒ 无「严格库级」口径）'
                ' · 分类器见 packages/core/src/db/m9-classify-lang-topics.ts'
            ),
            'summary': '空 —— P1.5 概念层三段内容填入',
        },
        'items': items,
    }


def main() -> int:
    py = json.loads((INVENTORY / 'runoob-python3-inventory.json').read_text(encoding='utf-8'))
    go = json.loads((INVENTORY / 'runoob-go-inventory.json').read_text(encoding='utf-8'))
    py_seed = transform('python', py)
    go_seed = transform('go', go)
    # 写仓
    (OUT / 'lang_topics_python3.json').write_text(
        json.dumps(py_seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )
    (OUT / 'lang_topics_go.json').write_text(
        json.dumps(go_seed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )
    # 自检：数量与 inventory 一致
    assert len(py_seed['items']) == py['counts']['total'], (
        f"python seed 数量不匹配: {len(py_seed['items'])} != {py['counts']['total']}"
    )
    assert len(go_seed['items']) == go['counts']['total'], (
        f"go seed 数量不匹配: {len(go_seed['items'])} != {go['counts']['total']}"
    )
    # slug 在同 lang 内唯一
    py_slugs = [it['slug'] for it in py_seed['items']]
    go_slugs = [it['slug'] for it in go_seed['items']]
    assert len(set(py_slugs)) == len(py_slugs), f"python slug 重复: {[s for s in py_slugs if py_slugs.count(s) > 1]}"
    assert len(set(go_slugs)) == len(go_slugs), f"go slug 重复: {[s for s in go_slugs if go_slugs.count(s) > 1]}"
    # 严格库级自检：Python 84 条里必须有 30 条 = 35.7%（spec §1.4 第 100 行，2026-10-20 订正后）
    py_strict = sum(
        1 for it in py_seed['items']
        if _has_library_keyword(it['title']) or _has_third_party(it['title'])
    )
    # ⚠️ 30 与 spec §1.4 第 100 行同值（2026-10-20 订正后）：差的那 1 条是「Python3 模块」——
    #    它含「模块」关键词但语义是**语言知识点**（§1.4 第 109–111 行的 DAG 反例主角）。
    #    30/84 = 35.7%，仍在 DL-13 的 ±2 个百分点区间 [34%, 38%] 内。
    assert py_strict == 30, f"python 严格库级 ≠ 30: 实测 {py_strict}（DL-13 复算 36% ± 抽样误差）"
    py_lang = sum(1 for it in py_seed['items'] if it['kind'] == 'language')
    py_lib = sum(1 for it in py_seed['items'] if it['kind'] == 'library')
    print(f"python: {len(py_seed['items'])} 行 · lang={py_lang} lib={py_lib} · 严格库级 {py_strict} = {py_strict/len(py_seed['items'])*100:.1f}% ✓")
    go_lang = sum(1 for it in go_seed['items'] if it['kind'] == 'language')
    go_lib = sum(1 for it in go_seed['items'] if it['kind'] == 'library')
    print(f"go:     {len(go_seed['items'])} 行 · lang={go_lang} lib={go_lib}")
    return 0


if __name__ == '__main__':
    sys.exit(main())