# Reviewer B 原文照录 · 只读复核 `docs/tasks.md` + `docs/PRD.md` + `docs/design.md`

- 派单：2026-09-26 23:2x，`general-purpose` 子 agent，**无本仓上下文**；硬约束＝只读 / 不跑任何门禁 / ≤35 次工具调用 / ≤10 条 / 「没有跑过命令的条目不要报」。
- 任务书要点：找所有关于 `clean`、注入锁、`hints`、删除边界、预览体量估算、P1.1 T10/T11 完成状态、v0.1.0 发布状态（tag / npm publish / CI）的断言，与当前规格、代码、测试、git 实况对照。
- **本文件逐字照录 reviewer 返回值，未编辑、未补注。我的逐条复算裁定见同目录 `third-layer-semantic-review.md` 第 2 节。**

---

共查 26 条断言（tasks.md 14 / PRD.md 8 / design.md 4），报 8 条不一致，2 条存疑。

**1｜tag `v0.1.0` 的推送状态三处失实（最危险：不可逆动作的判据）**
`docs/tasks.md:148`「tag `v0.1.0` 本地打在 T9c commit 上，**未 push**」、`:151`「已本地打在 `3e852c2`，未推」、`docs/PRD.md:520`「tag 仅本地」、`:433`「发布四步……推 tag……仍在 owner 手上」。
命令：`git ls-remote --tags origin` → `cd8102af… refs/tags/v0.1.0` / `5f7fd3c… refs/tags/v0.1.0^{}`；`git rev-list -n1 v0.1.0` → `5f7fd3c`。
正确：tag **已推远端**且指向 `5f7fd3c`（不是 `3e852c2`/T9c）。同查：`curl https://registry.npmjs.org/openvibe-cli` → HTTP 404、`api.github.com/repos/anyeduke11/OpenVibe` 显示 `private:false` 而 releases/tags/v0.1.0 → 404 ⇒「未发布、无 release」仍成立，只有"推 tag"这一步已完成。

**2｜tasks.md:165 T10 验收行的 CI 状态失实**
原文：「仍未收：三平台 CI **没跑过**（分支 `feat/p1.1-t10-clean-size` **未推**）」。
命令：`git status -sb` → `## feat/p1.1-t10-clean-size...origin/feat/p1.1-t10-clean-size [ahead 30]`；`git branch -r --contains a6d47a8` → `origin/main`；`git merge-base --is-ancestor a6d47a8 HEAD` → 真。
正确：分支已推、CI 已在 `a6d47a8`（DEV-0039 run 36223936268）三平台跑过并被 `origin/main` 包含；仍开放的只是「CI 未覆盖 tip `6e1aa90`（ahead 30）」。

**3｜`clean` 支数 29 已变 30，且该数被 PRD 声明为单源**
`docs/tasks.md:160`「`grep -c "^\s*it[\.(]" apps/cli/test/clean.test.ts` = **29**」、`:165`「现测 **29 支** …… 具名 id 同为 29 个，两口径此处相等」、`:7`「`clean` 现测 29 支」；`docs/PRD.md:427` 明写「具名族与支数**单源在 tasks.md §2b 验收行**」。
命令（照文档原式）：`grep -cE "^[[:space:]]*it[\.(]" apps/cli/test/clean.test.ts` → **30**；`grep -oE 'CLI-CLEAN-[0-9]+[a-z]?' … | sort -u | wc -l` → **30**（多出 `CLI-CLEAN-13`，`5444450`）。
正确：现测 30 / 具名 30；同行「win32 28 支实跑 + 1 支跳过」应为 29 + 1（唯一 `it.skipIf(IS_WINDOWS)` 仍是 `06e`，:595）。规格 §7.10 头部正是为此停止抄数（v1.8 ④）。

**4｜验收腿区间 a–j 已扩到 a–k**
`docs/tasks.md:160`「验收 10a–10j（含 f2 / e2 / e3）」、`:165`「③『验收 10a–10j 在 CI 里跑』」、`docs/PRD.md:521` D20 行「§7.10 验收 a–j」。
判定：`docs/specs/m6-cli-injection.md:153` 现文有「**k. 换包的后果侧（v1.8 补，B 级，队列 ⑥ R1）**……测试 `CLI-CLEAN-13`」。
正确：a–**k**；且 D20 引用 a–j 时漏掉的 k 恰是"换包后旧包独有文件一并退场"这条用户可见删盘口径。

**5｜规格版本指针 v1.5 落后，且 v1.6 含新的读侧拒绝**
`docs/tasks.md:160`「规格 `specs/m6-cli-injection.md` **v1.5** FR-6 + §6.10 + 验收 10a–10j」。同文件 `:161` 给 m6a 的 v1.3 指针配了"其后升 v1.4"的免责说明，这一行没有。
判定：规格表现文版本链末段为 **v1.8**（:11）；v1.6 的重复登记冲突闸已落代码：`grep -n "重复登记" packages/shared/src/schemas/pack.ts` → :269-280 报「files[].path 重复登记且期望哈希或 managed 不一致」。
正确：应指 v1.8，或改成不带版号的指针；按 v1.5 读的读者会漏掉「重复登记凭据不一致 ⇒ `LOCK_INVALID` 零删除」与 v1.8 的 `hints` 降契约。

**6｜「Web 侧无 DOM 断言」已被推翻**
`docs/tasks.md:161`「**Web 侧无 DOM 断言**（owner 裁定不引入组件测试基建，四处新渲染只有静态闸 + 读代码推演，已登记为未验证面）」。
命令：`grep -cE "^[[:space:]]*it[\.(]" apps/web/src/components/packs/PackPreviewPane.test.tsx` → **6**（01 文件树体量列 / 02 perTarget 成本条 / 03 warn 黄条 / 04 口径后缀 / 05 假零禁止 / 06 真 click），正覆盖那四处；`vitest.config.ts:37` `name: 'web'` + :7 注「owner 裁定 ⑪，2026-09-26：建 jsdom project」（commit `7a7c2e5`）。
正确：DOM 断言已入库，该"未验证面"登记作废，需改行并撤 owner 裁定的旧归属。

**7｜CORE-SIZE 两个口径同时腐烂**
`docs/tasks.md:161`「**`CORE-SIZE` 段 6 支** …… 其中具名只有 `CORE-SIZE-01..05` 五支、第 6 支是**无名**负向腿」。
命令：`grep -cE "^[[:space:]]*it[\.(]" packages/core/src/pack/size.test.ts` → **7**；具名 → `CORE-SIZE-01..06`（:43「CORE-SIZE-06: 兼容表意区 U+F900–U+FAFF 计入 CJK」，由 `bb7d671` 加）。
正确：现测 7 支、具名 01..06；「无名第 6 支」的说法不再成立。（同命令在采样 sha `986689e` 上复核过：当时确为 6 支 / 01..05，属抄写后未回填。）

**8｜`3e852c2..HEAD 无任何非文档改动` 为假，牵连发布说明三条"未验证"的勾销凭据**
`docs/PRD.md:535`（v0.1.7 行）「勾销依据是构建同源判定（`3e852c2..HEAD` 无任何非文档改动）」，`docs/PRD.md:522` D21 现文仍写「v0.1.0 发布说明的三条未验证项据此勾销」。
命令：`git diff --name-only 3e852c2..HEAD -- . ':!docs' ':!DEV_LOG.md' ':!README.md' | wc -l` → **30**（含 `apps/cli/src/commands/clean.ts`、`sync.ts`、`apps/server/src/lib/pack-assemble.ts`、`apps/web/src/components/packs/PackPreviewPane.tsx`）；`git rev-list --count 3e852c2..HEAD` → **71**。
正确：勾销凭据在 HEAD 已不成立——冒烟跑的是 T9 期构建，其后有行为面改动；应改述为"曾成立、现需重砸"。

**存疑 9｜design.md:326 只述 sync 抢锁与「不排队」**
摘录：「**并发 sync 互斥**……抢不到即退出码 1 + `SYNC_BUSY` 且零写入，不排队」。判定：`grep -n "pack.lock\|sync.lock\|退场\|clean" docs/design.md` → 该行未含 clean；规格 FR-6.8 要 clean 抢同一把锁，§6.9 v1.7 又加了 `SYNC_LOCK_REREAD_LIMIT` 有界重读并明写「这一重读不算『绝不排队等待』的违例」。没把握的原因：design 该行带「（T8e，2026-09-23 补）」日期标注，可读作历史快照而非现行口径；属"不完整"还是"失实"需 owner 判。

**存疑 10｜design.md:16「只是命令从 1 个变 2 个」**
判定：规格 §3 命令总览列 serve/scan/sync/diff/clean 五条。若该句指"本地写盘通道"则成立、指"CLI 命令数"则失实——原文无「写路径」限定词紧跟其后，读者可能据此认为 CLI 只有两命令。故标存疑。

## 我没覆盖到的面

- 未跑任何门禁：`tasks.md:165` 的「433 支 / 47 文件全绿（cli 145 / unit 191 / integration 97）」与入口 kB 数无法离线核实；且该枚举只列三层，第 4 个 project（web，6 支）不在其中。
- `tasks.md:7` 版本行的「m6b 停在 v1.5 / m6a 停在 v1.3」「扩到 a–j / `CLI-CLEAN-01..10`」、`:52`「vitest 三层配置」都带日期，我按"历史快照"放过，但台账读者未必这么读。
- 规格侧同源腐烂未报（不在三文档范围内）：`m6-standard-pack.md` §7.8 仍写「`CORE-SIZE-01..05`」，与实况 01..06 不等。
- 判据可靠性自陈：支数用 `it` 行首匹配，若同一 `it` 名被拆在多行或存在 `test(` 写法会漏计；我用 `grep -oE …|sort -u` 双口径交叉过才敢报 30。PRD:433 的「推 tag 仍在 owner 手上」我据 ls-remote 判假，但若远端 tag 是他人/后续轮次推的，文档可能是刻意只述"owner 动作清单"。`gh release list` 我改用公开 API 的 404 判定，repo `private:false` 已同查，故该判据有效。npm 404 只证"未发布"，不证"未尝试"。
