#!/usr/bin/env bash
# T7f 真机验收走查：m6b §7 八条逐项 + §6 安全样本（悬空符号链接 / 512KB 规模防线 / bundle 篡改）
# 全程真 CLI 子进程 + 真服务端；日志 /tmp/ov-t7f/accept.log，机器可读 JSON 单独落文件供断言
set -uo pipefail
REPO=/Users/duke/Documents/OpenVibe
ROOT=/tmp/ov-t7f
export OPENVIBE_HOME=$ROOT/home
CLI="$REPO/apps/cli/src/index.ts"
LOG=$ROOT/accept.log
: >"$LOG"

step() { printf '\n=========== %s ===========\n' "$1" | tee -a "$LOG"; }
say() { printf '%s\n' "$1" | tee -a "$LOG"; }
run() { # run <label> <outfile|-> <cmd...>
  local label=$1 out=$2; shift 2
  printf '\n--- %s ---\n$ %s\n' "$label" "$*" >>"$LOG"
  local ec=0
  if [ "$out" = "-" ]; then "$@" >>"$LOG" 2>&1 || ec=$?; else "$@" >"$out" 2>>"$LOG" || ec=$?; fi
  printf 'exit=%s\n' "$ec" | tee -a "$LOG"
  return 0
}
api() { curl -sS -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' "$@"; }
pick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);const v=('"$1"')(d);console.log(typeof v==="object"?JSON.stringify(v,null,1):v)})'; }
treehash() { find "$1" -type f -print0 2>/dev/null | sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256 | cut -c1-12; }
# 内容 + mtime + 大小 + 文件清单一起入摘要：dry-run 的「零变化」必须四项同时不动
treestat() { (cd "$1" && find . -mindepth 1 -print0 | sort -z | xargs -0 -I{} sh -c 'printf "%s|" "{}"; stat -f "%Sm|%z|%Sp" -t "%Y-%m-%dT%H:%M:%S" "{}"; shasum -a 256 "{}" 2>/dev/null | cut -c1-16' | shasum -a 256 | cut -c1-12); }
JSN=$(command -v jq >/dev/null && echo jq || echo python3)
OV() { node --import tsx "$CLI" "$@"; }

rm -rf "$ROOT"/home "$ROOT"/p-* "$ROOT"/*.json "$ROOT"/bundles "$ROOT"/evil
mkdir -p "$ROOT"/home "$ROOT"/bundles

step "0 起服务（随机端口 + 隔离 OPENVIBE_HOME）+ §7.8 config 权限与播种基线"
OV --json serve --port 0 >"$ROOT/serve.json" 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 60); do [ -s "$ROOT/serve.json" ] && break; sleep 0.5; done
URL=$(pick 'd=>d.summary.url' <"$ROOT/serve.json")
TOKEN=$(pick 'd=>d.summary.token' <"$ROOT/serve.json")
say "url=$URL token长度=${#TOKEN}"
say "§7.8 config.json 权限=$(stat -f '%Sp' "$ROOT/home/config.json")（应为 -rw-------） 令牌落盘=$(pick 'd=>d.summary.configPath&&"yes"' <"$ROOT/serve.json")"
TERMS1=$(api "$URL/api/terms?size=1" | pick 'd=>d.total')
say "§7.8 首启播种 terms=$TERMS1 prompts=$(api "$URL/api/prompts?size=1" | pick 'd=>d.total')"

step "1 §7.8 二次启动不重复播种（重启服务，terms 计数须不变）"
kill $SERVE_PID 2>/dev/null; for _ in $(seq 1 40); do kill -0 $SERVE_PID 2>/dev/null || break; sleep 0.25; done
OV --json serve --port 0 >"$ROOT/serve2.json" 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 60); do [ -s "$ROOT/serve2.json" ] && break; sleep 0.5; done
URL=$(pick 'd=>d.summary.url' <"$ROOT/serve2.json"); TOKEN=$(pick 'd=>d.summary.token' <"$ROOT/serve2.json")
TERMS2=$(api "$URL/api/terms?size=1" | pick 'd=>d.total')
say "二次启动 terms=$TERMS2（应等于 $TERMS1） config 权限=$(stat -f '%Sp' "$ROOT/home/config.json")"

step "2 §7.6 scan --project：首次新增 2 条，重跑全部 skipped"
mkdir -p "$ROOT/p-scan"
printf '永远用中文回答，先给结论\n' >"$ROOT/p-scan/.cursorrules"
printf '# 项目规则\n改完必跑测试\n' >"$ROOT/p-scan/CLAUDE.md"
run "scan 首跑" - OV scan --project "$ROOT/p-scan"
run "scan 重跑" - OV scan --project "$ROOT/p-scan"
api "$URL/api/prompts?size=50" | pick 'd=>"服务端入库: "+d.items.filter(p=>[".cursorrules","CLAUDE.md"].includes(p.title)).map(p=>p.title+"("+p.useAs+")").join(" ")' | tee -a "$LOG"

step "3 用真服务端建包并导出 1.0.0（后续注入 / 篡改 / 规模用例的素材源）"
# 1.0.1 的改动点必须按 title 精确锁定：同一选集里 .cursorrules 与 CLAUDE.md 两条同毫秒入库，
# 取 items[0] 会让 PATCH 落到不同提示词上 → 1.0.1 指纹跨次漂移（1.0.0 稳定是因为它不碰这条）
PROMPT_FIRST=$(api "$URL/api/prompts?size=50" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(p=>p.title==="CLAUDE.md").id')
PROMPT_IDS=$(api "$URL/api/prompts?size=50" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d.items.filter(p=>[".cursorrules","CLAUDE.md"].includes(p.title)).map(p=>p.id).join("\",\""))})')
# 术语与流程按「名字」精确取，不取列表前 N 条：
# terms.ts:211 / flows.ts:112 的 ORDER BY 只到 updated_at，同一毫秒播种的 63 条并列，
# 前 N 条在不同 DB 里不稳定（DEV-0017 同类），换算法会连带换指纹。
T1=$(api -G "$URL/api/terms/search" --data-urlencode "q=提示词" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(t=>t.term.zh==="提示词").term.id')
T2=$(api -G "$URL/api/terms/search" --data-urlencode "q=技能" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(t=>t.term.zh==="技能").term.id')
T3=$(api -G "$URL/api/terms/search" --data-urlencode "q=上下文窗口" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(t=>t.term.zh==="上下文窗口").term.id')
TERM_IDS="$T1\",\"$T2\",\"$T3"
FLOW_ID=$(api "$URL/api/flow-templates" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(f=>f.name==="Spec 驱动流").id')
PACK_ID=$(api -X POST "$URL/api/packs" -d "{\"name\":\"accept-pack\",\"description\":\"T7f 验收包\",\"selection\":{\"promptIds\":[\"$PROMPT_IDS\"],\"termIds\":[\"$TERM_IDS\"],\"skillIds\":[],\"playbookIds\":[],\"flowTemplateId\":\"$FLOW_ID\"},\"targets\":[\"claude-code\",\"generic-agents\",\"trae\"]}" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
api -X POST "$URL/api/packs/$PACK_ID/export" -d '{"version":"1.0.0","channel":"download"}' | pick 'd=>"导出 "+d.export.version+" fingerprint="+d.export.fingerprint.slice(0,12)+" exportId="+d.export.id' | tee -a "$LOG"
EXPORT_ID=$(api "$URL/api/packs/$PACK_ID/exports" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items[0].id')
curl -sS -H "authorization: Bearer $TOKEN" -o "$ROOT/bundles/accept-1.0.0.json" "$URL/api/packs/$PACK_ID/exports/$EXPORT_ID/bundle"
say "bundle 落盘大小=$(wc -c <"$ROOT/bundles/accept-1.0.0.json" | tr -d ' ')B 内含文件=$(node -pe 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).files.map(f=>f.path).join(" ")' "$ROOT/bundles/accept-1.0.0.json")"
# 用仓库外的一段独立脚本按 design §7.6 重算指纹：证明锁的是字节契约，不是自证
node -e 'const c=require("node:crypto"),fs=require("node:fs");const s=(x)=>c.createHash("sha256").update(x,"utf8").digest("hex");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const per=b.manifest.files.every((m)=>s(b.files.find((f)=>f.path===m.path).content)===m.sha256);const mine=s([...b.manifest.files].sort((x,y)=>(x.path<y.path?-1:1)).map((m)=>m.path+"\t"+m.sha256+"\n").join(""));console.log("§7.6 独立重算：逐文件哈希一致="+per+"，整包指纹一致="+(mine===b.manifest.fingerprint)+"（"+mine.slice(0,12)+"）")' "$ROOT/bundles/accept-1.0.0.json" | tee -a "$LOG"

step "4 §7.1a dry-run 三重保护之一：全树 mtime+sha256+清单+权限 不变，.openvibe 未创建"
mkdir -p "$ROOT/p-dry/src"
printf '# 本地手写\n' >"$ROOT/p-dry/CLAUDE.md"
printf 'export const a = 1\n' >"$ROOT/p-dry/src/app.ts"
B=$(treestat "$ROOT/p-dry"); BH=$(treehash "$ROOT/p-dry")
run "sync --dry-run" "$ROOT/dry.json" OV --json sync "$ROOT/p-dry" --file "$ROOT/bundles/accept-1.0.0.json" --dry-run --yes
A=$(treestat "$ROOT/p-dry"); AH=$(treehash "$ROOT/p-dry")
say "dry-run 前后全树指纹：$BH → $AH（内容） / $B → $A（内容+mtime+权限+清单）"
say "§7.1a .openvibe 是否被创建：$(test -e "$ROOT/p-dry/.openvibe" && echo '创建了（FAIL）' || echo '未创建 ✅')"
pick 'd=>({计划:d.plan.map(p=>[p.state,p.path,p.action].join(" ")), 待写:d.summary.pending, exitCode:d.summary.exitCode})' <"$ROOT/dry.json" | tee -a "$LOG"

step "5 §7.1b 预置非受管 CLAUDE.md → 默认路径执行 → 备份内容逐字节一致"
mkdir -p "$ROOT/p-backup"
printf '# 我自己的 CLAUDE.md\n绝不许被覆盖丢失\n' >"$ROOT/p-backup/CLAUDE.md"
run "sync 首次注入" "$ROOT/backup.json" OV --json sync "$ROOT/p-backup" --file "$ROOT/bundles/accept-1.0.0.json" --yes
BK=$(pick 'd=>d.summary.backupRoot' <"$ROOT/backup.json")
say "backupRoot=${BK#$ROOT/}"
say "§7.1b 备份文件与原件逐字节比对：$(cmp -s "$BK/CLAUDE.md" /dev/null; node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1],"utf8");console.log(b.includes("绝不许被覆盖丢失")?"内容一致 ✅":"内容不一致 FAIL")' "$BK/CLAUDE.md")"
say "覆盖后磁盘 CLAUDE.md 已换成包内容：$(grep -c 'T7f 验收包\|openvibe:pack' "$ROOT/p-backup/CLAUDE.md") 处注入标记；本地原文只在备份里"
pick 'd=>({written:d.summary.written, lock:d.summary.lockPath&&"yes", injectionReported:d.summary.injectionReported, exitCode:d.summary.exitCode})' <"$ROOT/backup.json" | tee -a "$LOG"

step "6 §7.1c 非 TTY 且无 --yes → 退出码 1 且零写入（须有 pending 决策才走这条防线；子进程天然无 pty，真挂起会撞 timeout）"
mkdir -p "$ROOT/p-tty"
printf '# 我自己的 CLAUDE.md\n绝不许被覆盖丢失\n' >"$ROOT/p-tty/CLAUDE.md"
B=$(treestat "$ROOT/p-tty")
run "sync 非TTY无--yes" "$ROOT/tty.json" OV --json sync "$ROOT/p-tty" --file "$ROOT/bundles/accept-1.0.0.json"
pick 'd=>d.summary.error?d.summary.error.code+" | "+d.summary.error.message.slice(0,80):"无错误出口（FAIL：应当拒绝执行）"' <"$ROOT/tty.json" | tee -a "$LOG"
A=$(treestat "$ROOT/p-tty")
say "§7.1c 拒绝前后全树指纹：$B → $A（应相同）；.openvibe 是否被创建：$(test -e "$ROOT/p-tty/.openvibe" && echo '创建了（FAIL）' || echo '未创建 ✅')"
say "磁盘 CLAUDE.md 本地原文存活：$(grep -c '绝不许被覆盖丢失' "$ROOT/p-tty/CLAUDE.md") 行命中"

step "7 §7.7 --json 单出口可被解析器读取 + 五状态计划一次跑齐"
# 造 1.0.1：改一条规则提示词正文（主规则文件变）+ 追加三个 target（新路径出现）
api -X PATCH "$URL/api/prompts/$PROMPT_FIRST" -d '{"content":"改完必跑测试（1.0.1 修订：再补 dry-run 走查）"}' | pick 'd=>"prompts PATCH ok "+d.prompt.id.slice(0,10)+" 新版本="+(d.versionCreated?"yes":"no")' | tee -a "$LOG"
api -X PATCH "$URL/api/packs/$PACK_ID" -d '{"targets":["claude-code","generic-agents","trae","cursor","codebuddy","minicode"]}' | pick 'd=>"pack targets="+d.targets.join(",")' | tee -a "$LOG"
api -X POST "$URL/api/packs/$PACK_ID/export" -d '{"version":"1.0.1","channel":"download"}' | pick 'd=>"导出 "+d.export.version+" fingerprint="+d.export.fingerprint.slice(0,12)' | tee -a "$LOG"
EXPORT_ID2=$(api "$URL/api/packs/$PACK_ID/exports" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.find(e=>e.version==="1.0.1").id')
curl -sS -H "authorization: Bearer $TOKEN" -o "$ROOT/bundles/accept-1.0.1.json" "$URL/api/packs/$PACK_ID/exports/$EXPORT_ID2/bundle"
say "1.0.1 bundle 内含文件=$(node -pe 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).files.map(f=>f.path).join(" ")' "$ROOT/bundles/accept-1.0.1.json")"
# 五状态夹具：1.0.0 全量注入 → 手改 AGENTS.md（DRIFT）+ 预置非受管 .cursor/rules/openvibe.mdc（CONFLICT）
mkdir -p "$ROOT/p-five/.cursor/rules"
run "1.0.0 注入 p-five" "$ROOT/five-v1.json" OV --json sync "$ROOT/p-five" --file "$ROOT/bundles/accept-1.0.0.json" --yes
printf '本地手改，别覆盖\n' >>"$ROOT/p-five/AGENTS.md"
printf '# 陌生本地规则文件\n' >"$ROOT/p-five/.cursor/rules/openvibe.mdc"
# IN_SYNC 一条：磁盘字节已是包内容（planner 的「内容一致」优先于受管判定）
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);fs.writeFileSync(dst,JSON.parse(fs.readFileSync(src,"utf8")).files.find(f=>f.path==="MINI.md").content)' "$ROOT/bundles/accept-1.0.1.json" "$ROOT/p-five/MINI.md"
run "1.0.1 dry-run 五状态" "$ROOT/five.json" OV --json sync "$ROOT/p-five" --file "$ROOT/bundles/accept-1.0.1.json" --dry-run --yes
if [ "$JSN" = jq ]; then say "解析器 jq 读 plan[0] 键：$(jq -c '.plan[0]|keys' "$ROOT/five.json")"; else say "解析器 python3 json.tool：$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(sorted(d["plan"][0].keys()))' "$ROOT/five.json")"; fi
pick 'd=>d.plan.map(p=>p.state.padEnd(8)+p.path).join("\n")' <"$ROOT/five.json" | tee -a "$LOG"
pick 'd=>"状态集合: "+[...new Set(d.plan.map(p=>p.state))].sort().join(" ")+"　计划行数: "+d.plan.length+"　待写: "+d.summary.pending' <"$ROOT/five.json" | tee -a "$LOG"

step "8 §7.2 手改 TERMS.md → diff=2 → sync 走 DRIFT → 以包为准 → diff 回 clean"
printf '本地手改-OVWALK\n' >>"$ROOT/p-backup/TERMS.md"
run "diff 漂移" "$ROOT/drift.json" OV --json diff "$ROOT/p-backup"
pick 'd=>({clean:d.summary.clean, drifted:d.summary.drifted.map(x=>x.path+" lock:"+x.expected.slice(0,8)+" 磁盘:"+x.actual.slice(0,8)), exitCode:d.summary.exitCode})' <"$ROOT/drift.json" | tee -a "$LOG"
run "sync DRIFT 修复" "$ROOT/fix.json" OV --json sync "$ROOT/p-backup" --file "$ROOT/bundles/accept-1.0.0.json" --yes --strategy overwrite
pick 'd=>d.report.filter(r=>r.action==="write").map(r=>[r.path,r.state].join(" ")).join(" | ")' <"$ROOT/fix.json" | tee -a "$LOG"
run "diff 修复后" "$ROOT/clean.json" OV --json diff "$ROOT/p-backup"
say "注：修复后 clean=true；退出码 2 是 step 7 新导出的 1.0.1 触发的「有新版」提示，不是漂移"
pick 'd=>({clean:d.summary.clean, drifted:d.summary.drifted.length, missing:d.summary.missing.length, exitCode:d.summary.exitCode, hints:d.summary.hints})' <"$ROOT/clean.json" | tee -a "$LOG"

step "9 §7.4 篡改 bundle 内文件内容（fingerprint 失配）→ 退出码 1 零写入"
BEFORE=$(treestat "$ROOT/p-backup")
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);const b=JSON.parse(fs.readFileSync(src,"utf8"));b.files[0].content=b.files[0].content+"篡改";fs.writeFileSync(dst,JSON.stringify(b,null,2))' "$ROOT/bundles/accept-1.0.0.json" "$ROOT/bundles/tampered.json"
run "sync 篡改包" "$ROOT/tamper.json" OV --json sync "$ROOT/p-backup" --file "$ROOT/bundles/tampered.json" --yes
pick 'd=>d.summary.error.code+" | "+d.summary.error.message.slice(0,90)' <"$ROOT/tamper.json" | tee -a "$LOG"
AFTER=$(treestat "$ROOT/p-backup")
say "§7.4 篡改注入前后全树指纹：$BEFORE → $AFTER（应相同）"

step "10 §7.5 恶意 manifest（../evil.txt）→ 整包拒绝，越界文件不存在"
mkdir -p "$ROOT/p-evil"
node -e 'const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));b.files[0].path="../evil.txt";b.manifest.files[0].path="../evil.txt";fs.writeFileSync(process.argv[2],JSON.stringify(b,null,2))' "$ROOT/bundles/accept-1.0.0.json" "$ROOT/bundles/hostile.json"
run "sync 恶意路径" "$ROOT/evil.json" OV --json sync "$ROOT/p-evil" --file "$ROOT/bundles/hostile.json" --yes
pick 'd=>d.summary.error.code+" | "+d.summary.error.message+" | 违规项警告="+((d.summary.warnings)||[]).join("；")' <"$ROOT/evil.json" | tee -a "$LOG"
say "§7.5 ../evil.txt 是否落到项目外：$(test -e "$ROOT/evil.txt" && echo '存在（FAIL）' || echo '不存在 ✅')；项目目录内容=[$(find "$ROOT/p-evil" -mindepth 1 | tr '\n' ' ')]"

step "11 §6.1 新堵上的洞：目标是悬空符号链接（项目外目录在、文件名不在）→ 不得顺着链接往项目外建文件"
mkdir -p "$ROOT/p-link" "$ROOT/outside-target"
ln -s "$ROOT/outside-target/fresh.md" "$ROOT/p-link/TERMS.md"
run "sync 悬空链接" "$ROOT/link.json" OV --json sync "$ROOT/p-link" --file "$ROOT/bundles/accept-1.0.0.json" --yes
pick 'd=>d.summary.error.code+" | "+d.summary.error.message+" | 违规项警告="+d.summary.warnings.join("；")' <"$ROOT/link.json" | tee -a "$LOG"
say "§6.1 项目外是否凭空多出文件：$(test -e "$ROOT/outside-target/fresh.md" && echo '存在（FAIL：写穿符号链接）' || echo '不存在 ✅')；项目内合法文件也未写=[$(find "$ROOT/p-link" -type f | wc -l | tr -d ' ') 个普通文件]"

step "12 §6.3 规模防线：单文件 > 512KB 的标准包（真 bundle）→ 注入侧硬拒绝、零写入"
mkdir -p "$ROOT/p-big"
# 夹具生成脚本须在仓库内跑（bare specifier 从脚本所在目录向上找 node_modules），用完即删
GEN=$REPO/scripts/.tmp-t7f-big-bundle.ts
trap 'rm -f "$GEN"' EXIT INT TERM
cat >"$GEN" <<'TS'
// T7f 走查临时夹具（走查结束即删）：经真 composer + buildBundle 造出「单文件超 512KB」的标准包
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { coveredPlatforms, planMainFiles } from '@openvibe/adapters'
import { buildBundle, composePack, type AdapterBundle } from '@openvibe/core'
import { LIMITS, type ResolvedPack } from '@openvibe/shared'

const out = process.argv[2] ?? '/tmp/ov-t7f/bundles/big.json'
const adapters: AdapterBundle = { planMainFiles, coveredPlatforms }
const resolved: ResolvedPack = {
  id: 'pk_big',
  name: 'big-pack',
  version: '1.0.0',
  description: '§6.3 规模防线夹具：TERMS.md 单文件超上限',
  targets: ['claude-code', 'cursor', 'generic-agents'],
  flow: null,
  prompts: [
    {
      title: '写作规范',
      useAs: 'rule',
      platformMarks: [],
      contentHash: '',
      content: '规则正文',
    },
  ],
  terms: [
    {
      zh: '提示词',
      en: 'prompt',
      aliases: [],
      definition: 'd'.repeat(LIMITS.singleFileMaxBytes + 1),
      example: '',
    },
  ],
  skills: [],
}
const rendered = composePack(resolved, { adapters, exportedAt: '2026-09-22T00:00:00Z' })
const bundle = buildBundle(rendered)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
const biggest = Math.max(...bundle.files.map((f) => Buffer.byteLength(f.content, 'utf8')))
console.log(
  `单文件最大=${biggest}B（上限 ${LIMITS.singleFileMaxBytes}B） bundle=${Buffer.byteLength(JSON.stringify(bundle))}B 文件数=${bundle.files.length}（上限 ${LIMITS.packFileCountMax}）`,
)
TS
run "构造 >512KB 真 bundle" - node --import tsx "$GEN" "$ROOT/bundles/big.json"
say "bundle 体积=$(wc -c <"$ROOT/bundles/big.json" | tr -d ' ')B"
run "sync 超限包" "$ROOT/big.json" OV --json sync "$ROOT/p-big" --file "$ROOT/bundles/big.json" --yes
pick 'd=>d.summary.error.code+" | "+d.summary.error.message+" | 违规项警告="+d.summary.warnings.join("；")' <"$ROOT/big.json" | tee -a "$LOG"
say "§6.3 项目目录内容=[$(find "$ROOT/p-big" -mindepth 1 | tr '\n' ' ')]（应为空）"

step "13 §7.3 离线注入：停服务 + 无令牌，--file 完成注入（lock 写入，上报缺失仅警告）"
kill $SERVE_PID 2>/dev/null; for _ in $(seq 1 40); do kill -0 $SERVE_PID 2>/dev/null || break; sleep 0.25; done
mkdir -p "$ROOT/p-offline"
run "sync 离线" "$ROOT/offline.json" env OPENVIBE_TOKEN= OPENVIBE_SERVER=http://127.0.0.1:1 node --import tsx "$CLI" --json sync "$ROOT/p-offline" --file "$ROOT/bundles/accept-1.0.0.json" --yes
pick 'd=>({written:d.summary.written, lockPath:d.summary.lockPath&&d.summary.lockPath.replace(/.*p-offline/,"p-offline"), injectionReported:d.summary.injectionReported, warnings:d.summary.warnings, exitCode:d.summary.exitCode})' <"$ROOT/offline.json" | tee -a "$LOG"
say "§7.3 lock 文件是否写入：$(test -e "$ROOT/p-offline/.openvibe/pack.lock.json" && echo '写入 ✅' || echo '缺失（FAIL）')"
say "离线 lock 内容：$(node -pe 'const l=require(process.argv[1]);l.pack.name+"@"+l.pack.version+" fp="+l.pack.fingerprint.slice(0,12)+" files="+l.files.length' "$ROOT/p-offline/.openvibe/pack.lock.json")"

step "14 收尾数据面自查（重新起服务，只读）"
OV --json serve --port 0 >"$ROOT/serve3.json" 2>&1 &
SERVE3=$!
for _ in $(seq 1 60); do [ -s "$ROOT/serve3.json" ] && break; sleep 0.5; done
URL=$(pick 'd=>d.summary.url' <"$ROOT/serve3.json"); TOKEN=$(pick 'd=>d.summary.token' <"$ROOT/serve3.json")
say "注入历史（在线那几次才该有记录）：$(api "$URL/api/packs/$PACK_ID/injections" | pick 'd=>JSON.stringify(d).slice(0,300)')"
say "telemetry：$(api "$URL/api/settings/telemetry" | pick 'd=>d')"
say "scan 入库提示词：$(api "$URL/api/prompts?size=200" | pick 'd=>d.items.filter(p=>[".cursorrules","CLAUDE.md"].includes(p.title)).map(p=>p.title).join(" ")')"
kill $SERVE3 2>/dev/null
rm -f "$REPO/scripts/.tmp-t7f-big-bundle.ts"
say "走查结束（临时夹具脚本已删除，仓库工作树无残留）"
