#!/usr/bin/env bash
# N1 真机探针 · claude-code 腿（U10）：CLAUDE.md 的 @TERMS.md 是否真被加载
# 用法：bash docs/devlog-evidence/N1-probe/probe.sh
# 前提：claude CLI 可用（owner 环境；2026-11-14 本机跑因 provider 凭据 401 未跑成）
# 判据：实验腿回答含「整点回声」或「jitter」⇒ import 生效；对照腿应答「不知道/编造」
#       ⇒ 排除模型先验。两腿同答细节 ⇒ 术语不独特，换标记重跑。

set -u
BASE="$(mktemp -d /tmp/n1-probe-run-XXXX)"
trap 'rm -rf "$BASE"' EXIT
mkdir -p "$BASE/with-import" "$BASE/without-import"

QUESTION='请解释什么是「晶格回声协议」（Echo Lattice Protocol）？它是真实存在的技术概念吗？请如实回答，不知道就说不知道。'

for leg in with-import without-import; do
  mkdir -p "$BASE/$leg"
  if [ "$leg" = with-import ]; then
    cat > "$BASE/$leg/CLAUDE.md" <<'EOF'
# N1 探针项目

本项目的规则文件通过 import 语法引入术语表：

@TERMS.md

请始终遵守 TERMS.md 中的术语定义回答问题。
EOF
  else
    printf '# N1 探针对照项目\n\n（本文件不含任何 import 语法。）\n' > "$BASE/$leg/CLAUDE.md"
  fi
  cat > "$BASE/$leg/TERMS.md" <<'EOF'
# 术语表

## 晶格回声协议（Echo Lattice Protocol）

分布式系统中的一种失效模式：当三个以上的缓存节点各自持有同一键的过期副本、且它们的过期时间恰好构成等差数列时，读放大会在整点时刻出现周期性尖峰。业界俗称「整点回声」。治理手段是给过期时间加随机抖动（jitter），使等差关系瓦解。
EOF

  echo "── $leg 腿 ──"
  ANSWER="$(cd "$BASE/$leg" && claude -p "$QUESTION" 2>&1)"
  if printf '%s' "$ANSWER" | grep -qE '整点回声|jitter|等差数列'; then
    echo "  ⇒ 回答含定义细节（import 生效）"
  elif printf '%s' "$ANSWER" | grep -qE '不知道|不存?在|没有这个|编造|虚构'; then
    echo "  ⇒ 回答否认存在（未读到二级文件）"
  else
    echo "  ⇒ 形态未定，人工看回答："
    printf '%s\n' "$ANSWER" | head -8
  fi
done
echo "── 判读：with-import 含细节且 without-import 否认 ⇒ U10 claude-code 腿 = ✓ 真读。"
