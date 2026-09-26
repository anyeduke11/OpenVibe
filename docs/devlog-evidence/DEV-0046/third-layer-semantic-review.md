# 队列 ⑥ 第三层复核面 · 语义半（承 `[DEV-0045]` 风险③）

- **采样**：2026-09-26 23:20–23:50 +0800。起点 HEAD `a9691ca`（会话开始时）→ 复核中依次见 `9651801` / `6e1aa90` / `7590af2`(DEV-0045) / `5fe191d`(owner 追认 v1.4②)。落改时 HEAD `5fe191d`，本地领先 `origin/main` **9 笔**。
- **工作树归属**：全程 `README.md` 与 `docs/release-notes/v0.1.0.md` 在**并行会话**手上未提交 ⇒ 本轮刻意不碰；`docs/specs/m6-cli-injection.md` 在 `5fe191d` 提交后转干净，本轮才动它一行。
- **本轮净发现的前提**：`[DEV-0045]` 关的是第三层的**数字半**（支数抄进正文）。它自己在「潜在风险③」写明：「第三层复核面只覆盖了 ⑥ 面内那几笔与四份文档的交集……那 134 行里的**语义类**（非数字）断言本轮未逐句复核，留给下次有人读 §15 时按同一纪律做」。**本轮就是那个「下次」，且只做语义类**。

## 1. 复核面怎么来的

- 面积取数（我实测）：碰过两份 m6 规格的 commit 自 `211a345`（八份 spec 随 P0 导入 = 各份「v1.0 定稿」）起共 **12 笔**，其中 **6 笔**同时动了四份口径文档；逐笔之和 `dev-plan +139 −6`、`tasks +39 −9`、`PRD +20 −5`、`design +8 −5`；区间净值（`99690bc..HEAD`）`PRD 1/1`、`dev-plan 18/15`、`tasks 6/6`、`design 0`。
- 两名无上下文只读 reviewer 分头复核（A 读 `dev-plan.md`，B 读 `tasks.md`+`PRD.md`+`design.md`），硬约束只读、不跑门禁、≤35 次工具调用、≤10 条。**两份原文照录**见同目录 `raw-review-A-devplan.md` / `raw-review-B-tasks-prd-design.md`。
- 与 `[DEV-0043]` 那轮的差别：那轮 reviewer 未跑门禁、五闸数沿用我的值；**本轮五闸是我自己在 `9651801` 上重砸的**（23:20:56–23:23，rc 全 0，`48 files / 450 tests / 0 skipped`，Duration 20.50 s），且与并行会话 `[DEV-0045]` 报的那轮（同一 sha、Duration 33.11 s）**互相独立且同值** —— 这是本仓第一次有两次独立五闸可对照。

## 2. 逐条裁定（reviewer 报 20 条 → 成立并落改 8 / 成立但已由并行会话落地 4 / 否证 reviewer 3 / 按规矩不改 3 / 未复核 2）

### 2.1 成立，本轮已落改（8 类假断言）

> **口径**：两遍合计 **18 处行级落点 + 3 行新增**，以 `git diff --numstat` 为唯一权威（`dev-plan 13/10`、`tasks 5/5`、`PRD 2/2`、`spec 1/1`）。下表 8 类是首轮，§2.1b 另 4 处是第二遍 sweep 追出来的；**同一行可被两类各自命中**（如 `dev-plan:1491` 首轮改腿区间、第二遍改「分支未推」），故 14+4 是**断言落点数**不是行数。

| # | 落点 | 原句为假在哪 | 我用的判据（实测） |
|---|---|---|---|
| 1 | `docs/dev-plan.md:182` 目录树 | `commands/{serve,scan,sync,diff}.ts` 缺 `clean.ts` | `ls apps/cli/src/commands/` → 五支含 `clean.ts` |
| 2 | `docs/dev-plan.md` §6.1 命令矩阵（原 :768 之后） | 整张矩阵**没有 `clean` 行**——一个已发货、带 30 支测试的用户可见命令，在 CLI 章节的现行表里不存在 | 同上 + `apps/cli/src/index.ts:505 .command('clean')` |
| 3 | `docs/dev-plan.md:800`（原 :799） | 「包升级后消失的旧文件 **MVP 不清理**」少了 `clean` 半边 | 规格 §6.2 现行：「『不清理』**只约束 sync**……`clean` 会把它们一并退场」+ §7.10 **k** 腿（`docs/specs/m6-cli-injection.md:153`） |
| 4 | `docs/dev-plan.md` §6.4 退出码表 + `--json` | 三档全在讲 sync/diff，`clean` 的交互取消⇒2、全清⇒0、`LOCK_INVALID`⇒1、`hints` 必带键**一处没有** | 代码 `apps/cli/src/index.ts:420-425`（`catch` → `ExitCode.error`）+ 测试 `clean.test.ts:284`（`declined.exitCode` = 2）/ `:240`（dry-run 不改语义）/ `:417`（`LOCK_INVALID`） |
| 5 | `docs/dev-plan.md:1377` 与 `docs/tasks.md:161`（**同一断言两个落点**） | 「Web 展示四处只有静态闸，**无 DOM 断言**（owner 裁定不引入组件测试基建）」 | `npx vitest --project web --run` → **6 passed**（`apps/web/src/components/packs/PackPreviewPane.test.tsx`，打的正是那四处渲染）；`vitest.config.ts:37 name:'web'`；入库笔 `7a7c2e5`（队列 ⑪ `[DEV-0033]`） |
| 6 | `docs/tasks.md:165` 末句 | 「三平台 CI **没跑过**（分支未推）」 | `git merge-base --is-ancestor 787eb4c HEAD` = 真；`gh run view 36007700628` → `787eb4c success completed`，三个 `verify` job（windows/macos/ubuntu）齐全 ⇒ 分支已推且拿过三平台绿。**仍开放的只剩"跑到 tip"那一半**：`5444450` 的 k 腿与 `CLI-CLEAN-13` 从未进过任何 run |
| 7 | 腿区间 a–j → **a–k**，共 **5 个落点**：`dev-plan:1373`、`dev-plan:1491`（两处）、`tasks:160`、`PRD:521`、**`docs/specs/m6-cli-injection.md:142`** | 规格 §7.10 的索引行自己写「下面 a–j」，而它下面 143–153 行枚举到 **k** | 枚举实测：逐行首字母 `a b c d e f g h i j k`（143→153）；`git show HEAD:docs/specs/m6-cli-injection.md \| grep -c 'k\. \*\*换包的后果侧'` = 1 |
| 7b | 同族第三处：`docs/dev-plan.md:1405` 抄 `SRV-EST-01..03` | 具名上界落后 | `grep -roE 'SRV-EST-[0-9]+[a-z]?' apps/server/test \| sort -u` → **01/01b/02/02b/03/04** 六支，且 `SRV-EST-04` 正是同一文档 `:1377` 与 `tasks:161` 认的「FR-6.4 权威数」驱动器 ⇒ 同文件内两处口径互相打脸 |

### 2.1b **第二遍全仓搜又抓出 4 处**（这一节是本轮最该留的东西，因为它量出了「教训②」的真实成本）

上表第 5/6/7 条各自只修了 reviewer 点到的那一个落点。我随后按**断言的语义**（不是按文件名）在 `docs/**` + `README.md` 全仓搜同族旧串，又抓出四处**同一个假断言的其他落点**——四处都是 reviewer 没报的（他们各自只读一份/三份文件，跨文件的同一断言本就在他们的复核面之外）：

| # | 同一断言 | 我首轮的落点 | 第二遍抓到的落点 | 判据 |
|---|---|---|---|---|
| 8 | **tag `v0.1.0` 只打在本地 / 未推**（队列 ③ 已把它移到 `5f7fd3c` 并首推） | — 首轮只改了 `tasks.md:148`+`:151`（见下） | `docs/PRD.md:520`（D19 行：「v0.1.0 未发布：npm 404 / `gh release list` 空 / **tag 仅本地**」）、`docs/dev-plan.md:1481`（§15.1 表第 9 行：「v0.1.0 tag **已本地打在 `3e852c2`**」） | `git ls-remote --tags origin` → `cd8102af refs/tags/v0.1.0` / `5f7fd3c8 refs/tags/v0.1.0^{}`；`curl registry.npmjs.org/openvibe-cli` → **404**；`gh release list` → 空。⇒ 「未发布」仍真（指 npm），「tag 仅本地」为假 |
| 9 | **三平台 CI 没跑过 / 分支未推** | `docs/tasks.md:165`（首轮第 6 条） | `docs/dev-plan.md:1491`（§15.4 退出条件 3 的「未收」段：「但**分支未推 ⇒ CI 侧零证据**」）——**同一行内自相矛盾**：它的尾巴（`[DEV-0045]` 前一轮写的 ◐ 段）自己就记着 run `36007700628` @ `787eb4c` 三平台各跑一次 | `git ls-remote --heads origin` → `origin/feat/p1.1-t10-clean-size` 在；`git merge-base --is-ancestor 787eb4c origin/main` = 真。⇒ 已改成「假的那半截 + 成立的一截是没跑到 tip」 |
| 10 | 腿区间 a–j → a–k（首轮第 7 条的家族） | `dev-plan:1376`、`dev-plan:1491`、`tasks:160`（正文）、`PRD:521`、**规格 `:142`** | `docs/tasks.md:160` 同一行**还有第二处**：「哪些支对得上 §7.10 的 **a–j** / e2 / e3 / f2」——首轮只改了那行的 `10a–10j`，漏了后半句 | 同 §2.1 第 7 条 |
| 11 | tag 状态（=第 8 条的前两处，首轮已改但**没进上表**） | `docs/tasks.md:148`「本地打在 T9c commit 上，**未 push**」、`:151`「已本地打在 `3e852c2`，未推」 | — | 同第 8 条 |

**教训的写法**：首轮我把「同一断言多个落点」当成已知规矩在执行（第 5 条就一次改了两处），却仍然漏了第 8/9 条——因为我只在**reviewer 报过的那几份文件内部**做了同族搜索。第二遍的搜法才是可复用的：把假断言拆成**词面串**（`tag 仅本地` / `本地未 push` / `已本地打在` / `分支未推` / `CI 没跑过` / `无 DOM 断言` / `只有静态闸` / `a–j`），用**能工作的探针**（`grep -rn --include='*.md' -F` 扫 `docs` + `README.md`，排除 `devlog-evidence`）逐个扫全仓，命中数逐条归因。**复扫到零**才算这条断言收口：本轮结束时上述 8 个串里 6 个命中 0，剩下 2 处命中分别是①我自己的引文（`dev-plan:1491` 里带引号标注「为假」的那半句，保留）与②`dev-plan:1207`（见 §2.4）。

### 2.2 成立，但**已由并行会话 `[DEV-0045]` 落地**（我不重复改，只复算确认）

`tasks.md:160` 的 v1.5 版本指针（现 m6b v1.8）、`tasks.md:165`/`dev-plan:1377` 的支数抄写、`CORE-SIZE` 6→7 与 `SRV-EST` 17→18、`dev-plan:1403` 的 `clean-a…k`。逐条复算：`clean.test.ts` 文件支数 **30**、`size.test.ts` **7**（具名 `01..06`）、`packs.api.test.ts` **18**。全部与 `[DEV-0045]` 报的同值。

### 2.3 **否证 reviewer** 三条（本轮的价值一半在这里）

1. **A#3「具名 id = 31 ≠ 文件支数 30 ⇒ 两口径不等」不成立。** 我双写法各数一遍：`grep -oE 'CLI-CLEAN-[0-9]+[a-z]?'` 与 `grep -oE 'CLI-CLEAN-[0-9]+[a-z]*'` 均 **30**，两份清单 `diff` 为空。判据不成立，结论撤。
2. **A#7「`:1481` 写『FR-6.4 权威数交 `SRV-EST-01`』，与 `:1374` 的 04 同文件互斥」定位错。** `grep -n 'SRV-EST-0[14]'` 与 `grep -n '权威数'` 在 `dev-plan` 的命中只有 `:1377`（写 04）与 `:1405`（写 `01..03`）。**成立的是窄一截**：真正的缺陷是 `:1405` 抄了落后的具名上界（已按 §2.1 第 7b 条改），不是"权威数指针互斥"。
3. **A#10「写盘 API 分布 sync 10 / clean 6 只在把 import 算进去的口径下才复现」不成立。** 我用 `(writeFileSync|copyFileSync|unlinkSync|mkdirSync|appendFileSync|rmSync)` 复算：`sync.ts` 命中 **10 行 / 非 import 10 行**、`clean.ts` 命中 **6 行 / 非 import 5 行**。文档的「10 处 / 6 处」在**命中行数**口径下直接复现——reviewer 的 7/5 来自更窄的模式。**遗留问题只剩一个**：那行没写「处」的口径，按 §13-8 属"无口径的数字"，但它带 2026-09-24 的 ⚠️ 加注且方向未变，本轮不改。

### 2.4 按本仓已裁过的规矩**不改**（列出来是为了别让它被读成"没发现"）

- `docs/PRD.md:535`（v0.1.7 版本链行）「勾销依据是构建同源判定（`3e852c2..HEAD` 无任何非文档改动）」——**该断言现在为假**：`git diff --name-only 3e852c2..HEAD -- . ':!docs' ':!DEV_LOG.md' ':!README.md'` = **30 文件**，`git rev-list --count 3e852c2..HEAD` = **71**。但队列 ③ 行明文「历史登记（`dev-plan` 实测收口、`DEV-0022/retro.md`、**PRD 版本链**）按不回改保留」，且对外那一半（`docs/release-notes/v0.1.0.md`）已随 `7a4d551`/`5f7fd3c` 定点修订。**⇒ 保持不动，此处留取数命令。**
- `docs/tasks.md:7` 版本行、`docs/superpowers/plans/2026-09-24-*.md` 里的 `10a–10j`、**`docs/specs/m6-cli-injection.md:11` 版本链里的「验收 §7.10 a–j」** —— 同为带日期的历史/计划/链文本，不回改（链行是 v1.2 当时的事实，且队列 ⑥ 新立的「升版段可复核原则」正是要保护它）。
- **`docs/dev-plan.md:1207`**（T9 组的 ✅ 行）「tag `v0.1.0` **本地未 push**，真实 `npm publish` 待 owner」——第二遍 sweep 命中。该行**自带 `**2026-09-23 收（DEV-0022）**` 的日期锚**，读作当日快照而非现状，按 §13-8「带采样日期的登记不追改」保留。**代价写在这里**：它同时含一条无锚的现状句（「真实 `npm publish` 待 owner」），这句**到今天仍真**（registry 404 已复核），故不必开面。
- `docs/design.md:16`（「命令从 1 个变 2 个」）与 `:326`（并发锁只述 `sync`）—— 两条都是 reviewer 自标「存疑」，且 `design.md` 文档头的版本口径本身是**队列 ⑤ 待裁**（谁有权改「草案」→「已冻结」）。**未经 ⑤ 裁定不动 `design.md` 正文。**

## 3. 本轮被推翻的、是我自己的东西

- **我那条「全仓扫旧串」的 sweep 是假阴性判据。** 第一版写法 `FILES=$(git ls-files …); grep -rlE "$p" $FILES` 对 11 个模式**全部返回空**，包括 `449`、`四命令` 这类我明知存在的串。是我在报"零残留"之前跑了一次**正向对照**（`grep -l '预览体量'` 命中 5 份）才发现探针本身坏了。换 `grep -rn --include='*.md' … docs README.md` 后立刻抓到 `tasks.md:165`、`dev-plan:1405`、**规格 `:142` 自己**三处残留。**与 `[DEV-0044]` 的 `grep -c '^| 版本 |'` 同族**：恒零判据比恒真更危险，因为它长得像结论。
- **我第一轮就"收口"了，而它没收。** 上表 §2.1 的八类判据我改完便去写登记，此时 `tasks.md:148/151` 的 tag 状态还是假的、`dev-plan:1491` 的「分支未推 ⇒ CI 侧零证据」也还在（**且与同一行尾部我自己一轮前写的 run `36007700628` 直接矛盾**）。是第二次按词面串扫全仓才把它们摆出来（§2.1b）。**形状**：reviewer 报什么我改什么 ⇒ 复核面永远等于 reviewer 视野，而「教训②」要的是**复核面等于断言的落点集合**。以后收口前那遍词面 sweep（复扫到 0）是本步的固定尾工序，不是可选项。
- **我差点重复立项。** 会话开始我按 `[DEV-0044]` 挂账③ 建了「开第三层」的任务，实际并行会话已在 23:34 用 `7590af2` 把数字半收了。是「每步重记 HEAD」这条规矩（`a9691ca`→`9651801`→`6e1aa90`→`7590af2`）让我在动手前改成了只做语义半。

## 4. 未覆盖的面（如实写）

1. `dev-plan` §15 那 134 行的**通读**仍未做——本轮只复核了与 `clean`/lock/`hints`/估算/发布状态**有词面交集**的行；纯叙述段（D19–D22 裁定理由、风险表散文）未逐句对。
2. 两名 reviewer 未跑门禁（硬约束），本轮所有代码级判据（`index.ts` 退出码映射、`cleanAction` 行为、`PackPreviewPane` 覆盖面）**由我自己跑命令/读代码得出**，但 reviewer 各自的其余判据我只对我复算过的那条负责。
3. `--json` 信封是否对**每条命令**都附 `ok/exitCode/warnings` 仍只核到 `clean`（`index.ts:413` 的 `ok` 由退出码推导），未扩到 `scan`/`serve`。
4. `docs/competitive-*.md`、`docs/proposal.md`、`docs/release-notes/*`、`README.md` 不在本轮复核面内（后两份在并行会话手上）。
5. **五闸在改后的树上重砸过，rc 全 0**（2026-09-26 23:53–23:56 现测，工作树含并行会话的 `README.md` + `docs/release-notes/v0.1.0.md` 两份未提交改动 ⇒ 属**工作树证据**不是 HEAD 证据）：`lint` 0 错 / `typecheck` 双 tsconfig 各一遍 / `test` **48 files · 450 tests · 0 skipped**（Duration 23.89 s）/ `seed:check` terms 109、templates 3·7·4、prompts 20 / `bundle:check` 入口 293.07 kB ≤ 300、23 chunk 最大 347.45 kB ≤ 500。**这一条不再是继承**：本轮零代码、零用例、零 `content/seed`、零 `tests/golden`（`git status --porcelain` 对这四类实测命中 0 行），重砸的结果与 `9651801` 那轮同值 ⇒ 「文档改动没碰任何闸」由断言升为实测。**改后二次编辑（§2.1b 的四处 + 一次措辞修正）只复跑了 `lint` rc=0**，未再重砸全套——那四处同为 `docs/**` 行内改写。
6. 本机 **node v26.4.0** vs CI **node 22**（`engines.node >= 22`）⇒ 本机五闸绿仍不构成 CI 绿的证据；本轮未推任何东西。
