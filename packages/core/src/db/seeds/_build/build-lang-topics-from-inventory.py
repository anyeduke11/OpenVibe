#!/usr/bin/env python3
"""
把 `docs/devlog-evidence/M9-probe/runoob-{python3,go}-inventory.json`
（采集脚本跑出来的标题 / URL / 段名）转成 `lang_topics` 种子 JSON。

不做的事（与 P1.2/P1.3 边界一致）：
- **正文一个字不入仓**（DL-02）；inventory 只有 ordinal / section / title / url 四件，正文一律未取
- **stage_id 全部 0**（§3.6 写死「站数与每站知识点数本轮不定死」—— P1d 实测归类）
- **kind 全部 'language'**（DL-13 要求 ~36% 应为 'library' —— P1.4 实测归类）
- **summary 为空**（P1.5 概念层三段内容会从某条带过来）

slug 推导规则：
- 剥 `https://www.runoob.com/` 前缀（含双斜杠归一为单斜杠）
- 剥 `.html` 后缀
- 取最后一段路径
- 同 lang 内重名时加 `-<n>` 区分（典型：Go item 4 与 34 同 URL `go-vscode`）

为什么这条 builder 脚本**必须**留：
- inventory 是采集的原始证据；seed 是入库的整理后产物；两者都该入库。
- 下一轮（P1d / P1.4 / 任何重抽 inventory 的人）能照着这份脚本 1:1 重做。
"""
from __future__ import annotations
import json
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
            'kind': 'language',
        })
    return {
        'schemaVersion': 1,
        'source_url': src['source'],
        'collected_at': src.get('collected_at', '2026-10-18'),
        '_notes': {
            'stage_id': '全部 0 —— §3.6 「站数与每站知识点数本轮不定死」，P1d 实测归类',
            'kind': "全部 'language' —— DL-13 要求 ~36% 应为 'library'，P1.4 实测归类",
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
    print(f"python: {len(py_seed['items'])} 行 · slug 唯一 ✓")
    print(f"go:     {len(go_seed['items'])} 行 · slug 唯一 ✓")
    return 0


if __name__ == '__main__':
    sys.exit(main())