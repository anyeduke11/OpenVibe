#!/usr/bin/env bash
# 固化「测试失败」的可回放证据 —— 2026-10-24 补。
#
# ## 为什么需要它
#
# 报障时最常见的对话是「我这边红了 / 我这边绿了」，两边都没有可复现的现场。
# 一次失败至少有三个可疑变量：跑的是哪份代码（工作树 / 某个 commit）、
# vitest 全量输出（被截断的话会漏掉真正失败的那条）、类型检查（vitest 不查类型，
# 夹具缺字段这类问题只会在 tsc 报红）。本脚本把三样一次性固化下来：
#
#   1. git 现场：HEAD 提交、分支、未提交变更清单（git status --short）；
#   2. vitest 全量输出：不截断，原样落盘；
#   3. typecheck 输出：tsconfig.json 与 apps/web/tsconfig.json 两套。
#
# 拿到这份现场后，「复现同一结论」不再依赖口头描述 —— 任何人跑同一命令、
# 看同一份 log 都应得到同一个结论。
#
# ## 用法
#
#   scripts/failure-evidence.sh                       # 全量 vitest + typecheck
#   scripts/failure-evidence.sh tests/section-ref-audit.test.ts   # 只跑指定测试文件
#   scripts/failure-evidence.sh -o /tmp/evidence      # 指定证据目录
#   scripts/failure-evidence.sh --dev DEV-0115 tests/…  # 归档到 DEV-NNNN/evidence/
#
# 证据目录默认落在 ${TMPDIR:-/tmp} 下的临时目录，命名含时间戳
# （`openvibe-evidence-<YYYYmmdd-HHMMSS>-<随机>`）。**全绿则自清**（同
# `head-typecheck.sh` 约定）；有失败则**保留现场**，并把证据目录**自动归档到仓内
# `docs/devlog-evidence/`**（进仓即随版本化，不依赖临时目录存活）。归档位置：
#   - 未指定 `--dev`：`docs/devlog-evidence/failure-evidence-<YYYYmmdd-HHMMSS>/`
#   - 指定 `--dev DEV-NNNN`：`docs/devlog-evidence/DEV-NNNN/evidence/`（与项目
#     DEV 归档惯例一致，便于对账到具体登记项；`DEV-NNNN` 须为 DEV- 前缀 + 四位数字）
#   - `DEV-NNNN/evidence/` 已存在时（同一 DEV 多次失败）：归档到
#     `DEV-NNNN/evidence-<YYYYmmdd-HHMMSS>/`，**不覆盖**上一轮证据
# ⚠️ 若用 `-o` 显式指定证据目录，则**不再自动归档**——位置已由你指定，脚本不重复复制。
#    同时传 `-o` 与 `--dev` 时，`--dev` 不生效，脚本会打印冲突提示，并把该提示
#    一并写入 summary.txt（随证据目录走，报障贴目录即见）。
#
# ## 报障约定
#
# 跑出失败后，**报障方把打印出的证据目录路径（临时目录或仓内归档）原样贴出**，
# 连同失败命令与退出码一起；接收方凭该目录的三份文件即可回放同一结论，
# 不必依赖「我这边红了」的口头描述。目录路径由脚本打印，不需要手工去猜。
#
# 退出码：0 = vitest 与 typecheck 全绿；1 = 任一有失败；2 = 环境错误（找不到
# 二进制 / git 现场采集失败）。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── 参数：-o 指定证据目录、--dev 指定归档的 DEV 编号，其余透传给 vitest run
OUT_DIR=""
OUT_DIR_FLAG=0
DEV_ID=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      [ -n "${2:-}" ] || { echo "用法：-o 需要一个目录参数"; exit 2; }
      OUT_DIR="$2"
      OUT_DIR_FLAG=1
      shift 2
      ;;
    --dev)
      [ -n "${2:-}" ] || { echo "用法：--dev 需要一个 DEV 编号（如 DEV-0115）"; exit 2; }
      # 校验 DEV 编号形态：`DEV-NNNN`（DEV- 前缀 + 四位数字）。防误传任意字符串
      # 在 devlog-evidence/ 下建出无关目录、污染归档区。
      if ! [[ "$2" =~ ^DEV-[0-9]{4}$ ]]; then
        echo "用法：--dev 的取值必须是 DEV-NNNN 形态（DEV- 前缀 + 四位数字），收到「$2」"
        exit 2
      fi
      DEV_ID="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
# `-o` 与 `--dev` 冲突提示：两者语义互斥（-o 指定目录时不归档，--dev 指定的是归档
# 位置），同时出现时 --dev 不生效，但必须明说，否则调用方会误以为归档到了 DEV 目录。
# 提示除打 stdout 外还写入 summary.txt —— 报障方贴出证据目录时，接收方要能在这份
# 现场里读到「--dev 被忽略」这个事实，而不是只靠对话里的口头提及。
CONFLICT_NOTE=""
if [ "$OUT_DIR_FLAG" -eq 1 ] && [ -n "$DEV_ID" ]; then
  CONFLICT_NOTE="⚠️ -o 已显式指定证据目录（不自动归档），--dev $DEV_ID 不生效"
  echo "$CONFLICT_NOTE"
fi
VITEST_ARGS=("$@")

[ -z "$OUT_DIR" ] && OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/openvibe-evidence-$(date '+%Y%m%d-%H%M%S')-XXXXXX")"
mkdir -p "$OUT_DIR"

# ── ① git 现场
SUMMARY="$OUT_DIR/summary.txt"
{
  echo "── git 现场（$(date '+%Y-%m-%d %H:%M:%S')）──"
  echo "HEAD：$(git rev-parse HEAD 2>&1)"
  echo "分支：$(git branch --show-current 2>&1)"
  [ -n "$CONFLICT_NOTE" ] && echo "$CONFLICT_NOTE"
  echo ""
  echo "── 未提交变更（git status --short）──"
  git status --short 2>&1
} > "$SUMMARY" || { echo "git 现场采集失败"; exit 2; }

# ── ② ③ 测试与类型检查：即使 vitest 失败也继续跑 typecheck，
#    否则「vitest 红了所以没跑 tsc」会把类型问题藏掉。
rc=0

echo "── vitest run ${VITEST_ARGS[*]:-（全量）}"
if [ "${#VITEST_ARGS[@]}" -eq 0 ]; then
  "$REPO_ROOT/node_modules/.bin/vitest" run 2>&1 | tee "$OUT_DIR/vitest.log"
else
  "$REPO_ROOT/node_modules/.bin/vitest" run "${VITEST_ARGS[@]}" 2>&1 | tee "$OUT_DIR/vitest.log"
fi
vt="$?"
echo "   vitest rc=$vt"
[ "$vt" -ne 0 ] && rc=$vt

TSC_LOG="$OUT_DIR/typecheck.log"
: > "$TSC_LOG"
for p in tsconfig.json apps/web/tsconfig.json; do
  if [ ! -f "$p" ]; then echo "── 跳过 $p（不存在）" >> "$TSC_LOG"; continue; fi
  echo "── tsc --noEmit -p $p" >> "$TSC_LOG"
  "$REPO_ROOT/node_modules/.bin/tsc" --noEmit -p "$p" >> "$TSC_LOG" 2>&1
  s=$?
  echo "   rc=$s" >> "$TSC_LOG"
  echo "   rc=$s"
  [ "$s" -ne 0 ] && rc=$s
done

echo ""
echo "── 证据目录：$OUT_DIR"
echo "   summary.txt —— git 现场"
echo "   vitest.log  —— 测试全量输出"
echo "   typecheck.log —— 两套 tsconfig 的输出"

if [ "$rc" -eq 0 ]; then
  echo "── 全绿 ✅"
  # 全绿不留现场：与 head-typecheck.sh 同约定，避免每次运行都留一个临时目录。
  rm -rf "$OUT_DIR"
  echo "   证据目录已自清（无失败可留）。"
else
  echo "── 有失败 ❌ —— 现场已保留：$OUT_DIR"
  # 归档到仓内 `docs/devlog-evidence/`，随版本化；仅当用户**未**用 -o 显式指定目录时做
  # （显式指定 = 用户已决定位置，脚本不重复复制）。docs-check 会把 devlog-evidence/
  # 排除出扫描面（ARCHIVE_PREFIX），故归档不会引入新的 docs 判定。
  # `--dev DEV-NNNN` 指定时归档到 DEV-NNNN/evidence/（项目 DEV 归档惯例），否则
  # 用时间戳目录名。
  if [ "$OUT_DIR_FLAG" -eq 0 ]; then
    if [ -n "$DEV_ID" ]; then
      # 同一 DEV 多次失败：`evidence/` 已存在时改归档到 `evidence-<时间戳>/`，
      # 不覆盖上一轮证据（多轮失败必须能区分，否则对账时无法知道哪份是哪次跑的）。
      BASE="$REPO_ROOT/docs/devlog-evidence/$DEV_ID/evidence"
      if [ -e "$BASE" ]; then
        # `-e` 而非 `-d`：`evidence` 若被误建成**文件**也要拦下 —— 走「不存在」
        # 分支会进 `mkdir -p` 报错，先把原因讲清楚再退出。
        if [ ! -d "$BASE" ]; then
          echo "   ⚠️ 归档目标 $BASE 已存在但不是目录 —— 请先清理该文件再重跑"
          exit 2
        fi
        ARCHIVE_DIR="${BASE}-$(date '+%Y%m%d-%H%M%S')"
      else
        ARCHIVE_DIR="$BASE"
      fi
    else
      ARCHIVE_DIR="$REPO_ROOT/docs/devlog-evidence/failure-evidence-$(date '+%Y%m%d-%H%M%S')"
    fi
    mkdir -p "$ARCHIVE_DIR" && cp -R "$OUT_DIR"/. "$ARCHIVE_DIR"/ && echo "   已归档到仓内：$ARCHIVE_DIR"
  fi
fi
exit "$rc"
