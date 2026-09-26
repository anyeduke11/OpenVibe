# Reviewer A 原文照录 · 只读复核 `docs/dev-plan.md`

- 派单：2026-09-26 23:2x，`general-purpose` 子 agent，**无本仓上下文**；硬约束＝只读 / 不跑任何门禁 / ≤35 次工具调用 / ≤10 条 / 「没有跑过命令的条目不要报」。
- 任务书要点：在 `docs/dev-plan.md` 里找所有关于 `clean`、`pack.lock.json`/注入锁、`hints`、预览体量与 token 估算、P1.1/T10 状态的断言，与**当前规格文本**（必要时与代码/测试）对照，报不一致。
- **本文件是 reviewer 返回值的逐字照录，未编辑、未排序、未补注。我的逐条复算裁定在同目录 `third-layer-semantic-review.md` 第 2 节。**
- 注意：reviewer 读的是 `7590af2` **之前**的树（并行会话 `[DEV-0045]` 在 23:34 收了数字半），其中若干条的落点已不是我落改时的原文。

---

共查 12 条断言，报 8 条不一致，2 条存疑。

1. **:763-769 §6.1 命令矩阵无 `clean` 行**（`| openvibe diff <projectPath> | — | 漂移…`，同 :182 目录树 `commands/{serve,scan,sync,diff}.ts`）。判据：`sed -n '30,42p' docs/specs/m6-cli-injection.md` → `| \`openvibe clean <projectPath> [--dry-run] [--yes] [--force]\` | 退场…FR-6`；`grep -n command( apps/cli/src/index.ts` → `505: .command('clean')`；`ls apps/cli/src/commands/` → 含 `clean.ts`。应：矩阵补 clean 行、树补 clean.ts。
2. **:1373/:1486/:1488「`CLI-CLEAN-*` 现测 29 支」「win32 28 实跑+1 skip」**。判据：`grep -c "^[[:space:]]*it[\.(]" apps/cli/test/clean.test.ts` → **30**（该 grep 形式即 :1486 自称的单源）。新增那支 = `git show --stat 5444450`「CLI-CLEAN-13」。skip 仅 1（`grep -n skipIf` → :595 `CLI-CLEAN-06e`），故应为 darwin/linux 30、win32 29+1。
3. **:1486「文件支数，与具名 id 数相等」**。判据：`grep -oE 'CLI-CLEAN-[0-9]+[a-z]*' … | sort -u | wc -l` → **31** ≠ 30。两口径不等。
4. **:1373/:1400/:1488 验收腿「10a–10j」「§7.10 a–j」「clean-a…j」**。判据：spec §7.10 现存 `k. 换包的后果侧（v1.8 补…owner 裁「留，并补测试」）`。应为 a–k（含 e2/e3/f2）。
5. **:1374/:1486「CORE-SIZE 6 支 = 文件支数（具名 01..05 五支 + 一支无名）」**。判据：同一 grep → `size.test.ts:7`；`grep -o "CORE-SIZE-0[0-9]" | sort -u` → **01..06**。应：文件 7 支、具名 6 支（spec §7 验收 8 仍写 `01..05`，属同源第二处腐烂）。
6. **:1374「`packs.api.test.ts` 的 17 支」/:1402「`SRV-EST-01..03`」**。判据：`grep -c …` → **18**；`grep -rn SRV-EST apps` → 01/01b/02/02b/03/04 六支具名。上界失效（spec §7.10 头部已明写「此处不抄具名上界与支数」）。
7. **:1481「FR-6.4 标注『折算非实测』，权威数交 `SRV-EST-01` 的真 preview」**。判据：spec FR-6.4 现文「自 v1.3 起为真 preview 实测（驱动器 = `SRV-EST-04`…）：claude-code… 各 15,213，cursor 15,235，trae 15,232；footprint 67,621 tok / 186,365 B」。指针应为 SRV-EST-04（:1374 自己写的即 04，同文件互斥）。
8. **:799「sync 永不删除 pack 外文件；包升级后消失的旧文件 MVP 不清理（P1 `update` 向导，m6b §6.2）」**。判据：spec §6.2 现行尾句「『不清理』只约束 sync——这些旧文件仍是 `managed` 登记项，`clean` 会把它们一并退场」。应补 clean 半边。
9. **存疑 :811-815 退出码表 / `--json` 契约只覆盖 sync**（`| 2 | diff 检出 drifted 或 pack-outdated；sync --yes --strategy skip 遇 CONFLICT |`），而 FR-6.9 有「交互取消 ⇒ 2」「全清 ⇒ 0」、FR-6.5「`driftKept === 0` 即删 lock（全 FOREIGN 也删）」、FR-6.10 `hints` 为**必带键**（v1.5/v1.8 均判 B 级）。判据：`grep -n "hints\|12,000\|SIZE_WARN" docs/dev-plan.md` → **零命中**。没把握处：dev-plan §6.4 标题未承诺「全命令」，omission 与断言的边界判定权在读者。
10. **存疑 :1479「写盘 API 分布现测：sync 10 / clean 6 / serve 2 / config.ts 3」**。判据：`grep -nE "(writeFileSync|copyFileSync|unlinkSync|mkdirSync…)" <file>` → 真实调用点 sync **7**（394/397/398/401/402/429/430）、clean **5**（366/370/371/372/395）、config **2**。10/6/3 只在「命中行数、且把 import 行算作一处」口径下复现——未标口径，违反本文件 §13-8 自己立的规矩，但结论方向不变。

## 我没覆盖到的面

- 未跑任何门禁/测试，故 :1486「433 支 / 47 文件（cli 145/unit 191/integration 97）」「入口 293.07 kB ≤ 300 kB」「✅ 本条现勾」只对照 DEV_LOG 单方陈述（`48 files / 449 tests`；最后覆盖 run @ `a6d47a8`，tip 已到 `596b51f`），未独立验证；该行自注「降级为历史证据」，我没判定这算不算腐烂。
- `retirement.test.ts 8 支`（:1373）实测一致，未报；但 clean 的 win32 实跑数我只能从 skipIf 静态推，未跑 CI。
- 未查 tasks.md / PRD / design 里同批抄写的数字（任务范围外）。
- 判据本身不可靠处：`grep -c "^[[:space:]]*it[\.(]"` 不计 `describe.each` 展开与 `.skip` 语义，也不等于 vitest 汇总行；具名 id 抽取用 `[0-9]+[a-z]*`，若新增 id 形如 `-10a` 会与 sub-腿混计。FR-6.4 的 kB/token 数我没重跑 preview 复算，仅做文档对读。
