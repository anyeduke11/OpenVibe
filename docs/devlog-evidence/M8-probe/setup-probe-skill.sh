#!/usr/bin/env bash
# M8 探针 harness · 技能发现约定运行半边（0-d）
#
# 简化版（owner 2026-10-14 裁「只测试一个真实 skill 即可」）：
#   只装一个 skill，symlink 进 Trae 与 CodeBuddy 两个平台的用户级目录。
#   **不建项目级副本** ⇒ 原来的 Q2（项目级/用户级优先级）本轮不测。
#   仍在测：加载时机 / 脚本可执行性 / symlink 限制 / minicode 归属。
#
# 安全性：只在下列三处新增一个名为 openvibe-probe 的条目，不触碰任何既有 skill。
#   ~/.agents/skills/openvibe-probe/     （真源）
#   ~/.trae/skills/openvibe-probe        （symlink）
#   ~/.codebuddy/skills/openvibe-probe   （symlink）
#
# 用法：
#   bash docs/devlog-evidence/M8-probe/setup-probe-skill.sh setup
#   bash docs/devlog-evidence/M8-probe/setup-probe-skill.sh status
#   bash docs/devlog-evidence/M8-probe/setup-probe-skill.sh clean
set -euo pipefail

NAME="openvibe-probe"
SRC="$HOME/.agents/skills/$NAME"
TRAE="$HOME/.trae/skills/$NAME"
CBDY="$HOME/.codebuddy/skills/$NAME"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }

write_skill() {
  mkdir -p "$SRC/scripts" "$SRC/references"
  cat > "$SRC/SKILL.md" <<'MD'
---
name: openvibe-probe
description: M8 技能发现约定探针。当用户说出触发口令「灵典探针」时，必须使用本 skill 并执行 scripts/probe.sh。
---

# M8 探针（v1）

这是一个**只用于探针**的 skill，不提供任何真实能力。

## 执行要求

看到触发口令「灵典探针」时：

1. **先直接运行** `scripts/probe.sh`（不要加 `bash` 前缀）。
2. 若报 `Permission denied`，再运行 `bash scripts/probe.sh`。
3. 若报 `No such file or directory`，请把你实际执行时的工作目录与 SKILL.md 绝对路径一并报告。
4. 把脚本 stdout 的**原文**贴回给用户，一个字都不要改写或总结。

## 你必须报告的三件事

- 本 SKILL.md 的**绝对路径**；
- `references/answers.md` 里写着什么（证明子目录可读）；
- 脚本是**直接执行成功**、**加了 `bash` 才成功**、还是**根本跑不了**。
MD

  cat > "$SRC/scripts/probe.sh" <<'SH'
#!/usr/bin/env bash
# 故意用不像人话的分隔符，防止被模型改写或总结
echo "<<<M8-PROBE-SCRIPT-RAN|marker=V1-USER|pwd=$(pwd)|path=$0>>>"
SH
  chmod +x "$SRC/scripts/probe.sh"

  printf '# 探针参考（子目录可读性测试）\n\n- 你读到的层级标记：**V1-USER**\n' > "$SRC/references/answers.md"
}

cmd_setup() {
  say "0/4 同名保护（不覆盖任何既有 skill）"
  if [ -e "$SRC" ] || [ -L "$SRC" ]; then
    warn "$SRC 已存在 —— 中止，不覆盖。"
    warn "若是上次探针残留，跑 '$0 clean' 先拆；若属于别的 skill，改脚本顶部 NAME 变量。"
    return 1
  fi

  say "1/4 造真源 skill：$SRC"
  write_skill
  find "$SRC" -type f | sed "s|$HOME|~|"

  say "2/4 symlink 进两个平台的用户级目录"
  mkdir -p "$HOME/.trae/skills" "$HOME/.codebuddy/skills"
  for d in "$TRAE" "$CBDY"; do
    if [ -e "$d" ] || [ -L "$d" ]; then
      warn "$d 已存在，跳过（不覆盖）"
    else
      ln -s "../../.agents/skills/$NAME" "$d"
      echo "  ✓ $d -> ../../.agents/skills/$NAME"
    fi
  done

  say "3/4 状态"
  cmd_status

  say "4/4 装好了 —— 下一步在你手上"
  cat <<EOF

请到 Trae 里做三件事（详细步骤见 docs/devlog-evidence/M8-probe/README.md §3）：

  【A 加载时机】不重启 Trae，新开会话说「灵典探针」→ 记结果
               再完全退出 Trae 重启，说同一句 → 对比
  【B 脚本可执行】看它有没有吐出这一行原文：
                     <<<M8-PROBE-SCRIPT-RAN|marker=V1-USER|...>>>
                   直接跑成功 / 加 bash 才成功 / 根本跑不了
  【C symlink】把同样一句在 CodeBuddy 里问一遍
               （两个平台对 symlink 的处理可能不同，这正是要测的）

Q2（项目级 vs 用户级优先级）本轮**不测** —— 只装一个 skill，测不了优先级。

测完把 README.md §4 的表格填了发回。清理：$0 clean
EOF
}

cmd_status() {
  say "当前状态"
  for d in "$SRC" "$TRAE" "$CBDY"; do
    if   [ -L "$d" ]; then echo "  symlink  $d -> $(readlink "$d")"
    elif [ -d "$d" ]; then echo "  目录     $d"
    else                    echo "  缺失     $d"; fi
  done
  [ -f "$SRC/scripts/probe.sh" ] && { printf '  probe.sh 权限: '; ls -l "$SRC/scripts/probe.sh" | awk '{print $1}'; }
  return 0
}

cmd_clean() {
  say "拆探针（只拆本探针，不碰别的 skill）"
  for d in "$TRAE" "$CBDY"; do
    if [ -L "$d" ]; then rm "$d"; echo "  ✓ 移除 symlink $d"
    elif [ -d "$d" ]; then warn "$d 是真实目录（非本脚本创建），不自动删，请人工确认"; fi
  done
  # 真源侧只删「带本探针标记」的，不做无条件 rm -rf
  if [ -f "$SRC/scripts/probe.sh" ] && grep -q 'M8-PROBE-SCRIPT-RAN' "$SRC/scripts/probe.sh" 2>/dev/null; then
    rm -rf "$SRC"; echo "  ✓ 移除真源 $SRC（已确认含本探针标记）"
  elif [ -d "$SRC" ] || [ -L "$SRC" ]; then
    warn "$SRC 存在但不含本探针标记 —— 不删，请人工确认"
  fi
}

case "${1:-setup}" in
  setup)  cmd_setup ;;
  status) cmd_status ;;
  clean)  cmd_clean ;;
  *) echo "用法: $0 {setup|status|clean}"; exit 1 ;;
esac