#!/usr/bin/env bash
# 在**干净的 HEAD 检出**上跑 typecheck —— 2026-10-17 补（dev-plan §4.2 DEV-0133 遗留）。
#
# ## 为什么需要它
#
# 本仓四道闸里的 typecheck 跑的是**工作树**，不是 HEAD。工作树里躺着并行会话的
# 70 个未提交文件（含 apps/web 约 59 个），所以「四闸全绿」**证明不了 HEAD 编译得过**。
#
# 实测过的危险场景：`LocalLedgerSection.tsx` 缺 5 处依赖，其中 4 处是工作树里
# 未入库的并行会话文件。typecheck 看见它们在 ⇒ 绿；而任何**只提交这个文件**
# 的动作都会让 HEAD 当场编译不过，且工作树的绿灯给不出任何提示。
#
# ## 为什么用 git archive 而不是 git worktree
#
# `git worktree add` 会写 `.git/worktrees/` —— 在并行会话活跃的仓库里改版本库元数据
# 是我们这轮明令不做的事。`git archive` **只读**，不碰 `.git`。
#
# ## node_modules 怎么办
#
# `git archive` 不含 node_modules（被 gitignore）。做法是把真实仓库里**每一个**
# node_modules 目录**软链**过去 —— 只链根目录会漏掉 workspace 包的（如 apps/cli），
# 症状是满屏 `Cannot find module '@clack/prompts'`，那不是 HEAD 的问题而是链漏了。
#
# 退出码：typecheck 任一段失败即非 0。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/openvibe-head-XXXXXX")"
# ⚠️ 清理前必须先离开 $TMP —— 否则 trap 触发时 cwd 就在待删目录里，
# 删除会被「不能删当前工作目录」拒掉，于是**每次运行都留下一个临时目录**。
# 这是本脚本第一版真跑出来的缺陷，不是预防性写法。
cleanup() { cd "$REPO_ROOT" || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "── 抽取 HEAD 到临时检出：$TMP"
git archive HEAD | tar -x -C "$TMP" || { echo "抽取失败"; exit 2; }

echo "── 链接 node_modules（逐个包，漏一个就会报 Cannot find module）"
link_count=0
while IFS= read -r d; do
  rel="${d#"$REPO_ROOT"/}"
  mkdir -p "$(dirname "$TMP/$rel")"
  ln -s "$d" "$TMP/$rel" && link_count=$((link_count + 1))
done < <(find "$REPO_ROOT" -maxdepth 3 -type d -name node_modules -not -path '*/node_modules/*')
echo "   已链接 $link_count 个"
[ "$link_count" -eq 0 ] && { echo "⚠️ 一个 node_modules 都没链上，tsc 必然全量报缺失模块"; exit 2; }

rc=0
cd "$TMP"
for p in tsconfig.json apps/web/tsconfig.json; do
  if [ ! -f "$p" ]; then echo "── 跳过 $p（HEAD 里不存在）"; continue; fi
  echo "── tsc --noEmit -p $p"
  # 用真实仓库的 tsc 二进制；配置与文件树来自 HEAD
  "$REPO_ROOT/node_modules/.bin/tsc" --noEmit -p "$p"
  s=$?
  echo "   rc=$s"
  [ $s -ne 0 ] && rc=$s
done

if [ $rc -eq 0 ]; then
  echo "── HEAD 可独立编译 ✅（工作树的绿灯不再是最强证据，两者都成立）"
else
  echo "── HEAD 编译不过 ❌ —— 工作树里有尚未入库的依赖。查：$TMP"
  trap - EXIT   # 失败时保留现场
fi
exit $rc
