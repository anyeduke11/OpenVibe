# 变异对照驱动器（DEV-0081 · 端口面板 7 支 DOM 腿 + 端口端点的 3 支新腿）
#
# 用途：证明 `apps/web/src/components/projects/PortsPanel.test.tsx`（WEB-PORTS 七支）与
# `apps/server/test/ports.api.test.ts`「GET /api/projects/:id/ports」段的新腿都杀得死——
# 把源码改坏，看是否恰好红在预期的那条腿上，然后还原并复核回到改前。
#
# 跑法（仓库根）：python3 docs/devlog-evidence/DEV-0081/mutation-check.py
# 判读：每条 rc=1 且 RED 行含预期腿名；结尾三行「与备份逐字节相同=True」。
# 前提：被变异的三个文件当前无未提交改动（脚本从磁盘备份、跑完回写）。
import shutil
import subprocess

WEB_SRC = "apps/web/src/components/projects/PortsPanel.tsx"
API_SRC = "apps/server/src/routes/ports.ts"
APP_SRC = "apps/server/src/app.ts"
WEB_TEST = "apps/web/src/components/projects/PortsPanel.test.tsx"
API_TEST = "apps/server/test/ports.api.test.ts"

# (标记, 源文件, vitest 项目, 测试文件, 说明, old 锚点, new 变异, 预期红的腿名子串)
MUTS = [
    (
        "M1",
        WEB_SRC,
        "web",
        WEB_TEST,
        "进程列无条件拼 process·pid（idle 不再降级）",
        "{s.state === 'listening'\n                      ? `${s.process ?? ''}·${String(s.pid ?? '')}`\n                      : zh.common.none}",
        "{`${s.process ?? ''}·${String(s.pid ?? '')}`}",
        "02",
    ),
    (
        "M2",
        WEB_SRC,
        "web",
        WEB_TEST,
        "warning 无条件渲染（去掉 !== undefined 闸）",
        '{data !== undefined && data.listenersWarning !== undefined && (\n        <p className="mt-2 text-[11px] text-warn-700">{data.listenersWarning}</p>',
        '{data !== undefined && (\n        <p className="mt-2 text-[11px] text-warn-700">{data.listenersWarning}</p>',
        "04",
    ),
    (
        "M3",
        WEB_SRC,
        "web",
        WEB_TEST,
        "未登记路径与无声明共用一条文案（noPath 退场）",
        "{data.projectPath === '' ? zh.projects.ports.noPath : zh.projects.ports.empty}",
        "{zh.projects.ports.empty}",
        "06",
    ),
    (
        "M4",
        WEB_SRC,
        "web",
        WEB_TEST,
        "打开链接丢掉 rel=noreferrer",
        'target="_blank"\n                        rel="noreferrer"',
        'target="_blank"',
        "01",
    ),
    (
        "M5",
        WEB_SRC,
        "web",
        WEB_TEST,
        "认读清单无条件渲染（去掉 scannedFiles.length>0 闸）",
        "{data !== undefined && data.scannedFiles.length > 0 && (",
        "{data !== undefined && (",
        "05",
    ),
    (
        "M6",
        WEB_SRC,
        "web",
        WEB_TEST,
        "来源列丢掉 i18n 标签（直接印 source 枚举）",
        "{zh.projects.ports.sourceLabel[s.source]}{' '}",
        "{s.source}{' '}",
        "03",
    ),
    (
        "M7",
        WEB_SRC,
        "web",
        WEB_TEST,
        "空卡判据换成按 listeners 判（本机监听悄悄变成 UI）",
        "data.services.length === 0 ?",
        "data.listeners.length === 0 ?",
        "07",
    ),
    (
        "MA1",
        API_SRC,
        "integration",
        API_TEST,
        "未登记路径改为抛错（真实产品行为是 200 空台账）",
        "      if (typeof project.localPath !== 'string' || project.localPath === '') return out",
        "      if (typeof project.localPath !== 'string' || project.localPath === '')\n        throw new AppError('VALIDATION', '项目未登记本地路径')",
        "未登记 localPath",
    ),
    (
        "MA2",
        API_SRC,
        "integration",
        API_TEST,
        "目录消失时不再给 listenersWarning（静默置空）",
        "        out.listenersWarning = (e as Error).message\n",
        "",
        "已消失的目录",
    ),
    (
        "MA3",
        API_SRC,
        "integration",
        API_TEST,
        "idle 行也补一个 pid:0（显示层发明事实）",
        "        if (listener === undefined) return { ...d, state: 'idle' as const }",
        "        if (listener === undefined) return { ...d, state: 'idle' as const, pid: 0 }",
        "路由级合并",
    ),
    (
        "MA4",
        APP_SRC,
        "integration",
        API_TEST,
        "不转发注入点（验证 DI 缝承重、不是死代码）",
        "  registerPortRoutes({ db, listListenersImpl: options.listListenersImpl })(app)",
        "  registerPortRoutes({ db })(app)",
        "路由级合并",
    ),
]

FILES = sorted({m[1] for m in MUTS})
BAKS = {f: "/tmp/ov-mut-" + f.replace("/", "_") + ".bak" for f in FILES}
for f in FILES:
    shutil.copy(f, BAKS[f])

print("=== 变异对照（改坏 → 跑该测试文件 → 还原）===")
for tag, src, project, testfile, desc, old, new, expect in MUTS:
    orig = open(BAKS[src], encoding="utf-8").read()
    hits = orig.count(old)
    if hits != 1:
        print(f"{tag} {desc}\n   锚点命中 {hits} ≠ 1 ⇒ 无效实验（跳过，不算通过）")
        continue
    open(src, "w", encoding="utf-8").write(orig.replace(old, new, 1))
    p = subprocess.run(
        ["npx", "vitest", "--project", project, "--run", testfile],
        capture_output=True,
        text=True,
    )
    tail = [ln.strip() for ln in p.stdout.split("\n") if "  Tests " in ln]
    reds = [ln.strip() for ln in p.stdout.split("\n") if ln.strip().startswith("× ")]
    hit = any(expect in r for r in reds)
    print(f"{tag} {desc}\n   rc={p.returncode}  {tail[-1] if tail else '(无 Tests 行，可能编译失败)'}")
    for r in reds:
        print("   RED:", r[:130])
    print(f"   预期腿「{expect}」 {'命中' if hit else '未命中 ⇒ 这条变异杀的不是它'}")
    open(src, "w", encoding="utf-8").write(orig)

print("=== 还原复核 ===")
for f in FILES:
    cur = open(f, encoding="utf-8").read()
    same = cur == open(BAKS[f], encoding="utf-8").read()
    d = subprocess.run(["git", "diff", "--numstat", "--", f], capture_output=True, text=True).stdout.strip()
    print(f"{f}: 与备份逐字节相同={same}  git-vs-HEAD numstat={d or '0 行'}")
