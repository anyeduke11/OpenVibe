---
description: %E5%B7%A5%E4%BD%9C%E6%A0%91%E4%B8%8E%E6%8F%90%E4%BA%A4%E7%BA%AA%E5%BE%8B%EF%BC%9A%E7%99%BD%E5%90%8D%E5%8D%95%20stage%20%C2%B7%20%E5%BD%92%E5%B1%9E%E7%9C%8B%20diff%20%E4%B8%8D%E7%9C%8B%E6%96%87%E4%BB%B6%E5%90%8D%20%C2%B7%20%E5%8F%98%E5%BC%82%E8%85%BF%E8%BF%98%E5%8E%9F%E7%A6%81%E7%94%A8%20git%20checkout%20--%20%C2%B7%20%E9%95%BF%E8%A1%A8%E6%A0%BC%E8%A1%8C%20old_string%20%E9%A1%BB%E5%AE%8C%E6%95%B4%E6%95%B4%E8%A1%8C%20%C2%B7%20%E5%88%AB%E4%BA%BA%2Fworker%20%E8%B6%8A%E6%9D%83%20commit
---

# 工作树与提交纪律：git 的路径级操作不区分意图

Type: incident-lesson

**一句话**：`git` 的路径级操作（`add` / `checkout` / `restore`）**只认路径，不认意图**。我的意图是「只动我那几行」，它执行的是「动这个文件的全部」。⇒ 所有操作都要按**归属**而不是按**路径**来决定范围。

## 一、并行会话共用一个工作树 ⇒ 白名单 stage

owner 常**并行开多个会话**改同一个工作树 ⇒ 工作树里同时存在「我的改动」与「别人会话的改动」。

**危险动作**：`git add -A` / `git add .` / `git commit -a` ⇒ 会把**别人会话的半成品**一起提交（别人的改动可能还没跑过测试、可能与我的改动语义冲突）⇒ 别人会话一提交就带着我的东西。

**通法**：
- 提交前先 `git status --short` 列出**未暂存项**，与已知「别人会话的脏改动清单」逐项比对；
- **显式列出要 stage 的路径**（含新增目录），**不用通配**；
- ⚠️ 新增目录用 `git add <dir>` 会把该目录下**别人的新文件**一并带进去 ⇒ 逐目录确认；
- 提交后**再 `git status --short` 核对一遍**：剩余项应**逐字等于**那份脏改动清单 ⇒ 若多出/少了，说明边界划错（要么漏提自己的，要么带了别人的）；
- 提交信息里**不写**别人的改动（否则 commit message 会替别人表态）。

**apply when**：任何多会话 / 多 agent 共用同一个 git 工作树时的提交。

## 二、「M 文件」不等于「我改的」：归属看 diff，不看文件名

`git status --short` 只告诉你**文件**变了，不告诉你**谁**改的。逐文件 `git diff -U0` 核归属，曾捞出一个已存在的会话没察觉的回归：

**并行会话在工作树里把 HEAD 已落地的 M4 文档回退了，且未提交**：
- `docs/tasks.md`：T12 标题从「人日已估 5.2 · 2026-10-03 落地轮」退回「人日未估」
- `docs/specs/m6-standard-pack.md`：`playbookIds` 从「M4 已上线，非空可成包」退回「恒为 []」
- `docs/specs/m4-playbook.md`：删掉 v1.2 的落地轮记录
- `docs/dev-plan.md`：整节删掉 M4 的 §17
- `docs/decisions.md`：⑫ 状态从已改判退回「已裁已落」

**三个文件是「混」的**（`dev-plan.md` / `decisions.md` 同时含并行回退与本会话新增），整文件暂存会把别人的回退一起带进 commit ⇒ 只能**留在工作树**或做高风险的手工部分暂存。

- **识别信号**：diff 里出现与本会话无关的**删除方向**改动（把已落地的状态退回），尤其是版本行/标题行被「还原成更早的措辞」。
- 快速筛法：`git diff -U0 -- <候选文件> | grep -E "^\+" | grep -cE "<不属于本会话的标志字样>"`，非 0 即混。
- 混了的文件**宁可不提交**，并在报告里点名「哪几行是我的、哪几行不是」，让 owner 决定。
- ⚠️ 「本会话文件清单」这类历史记录可能本身就含错项 —— **它不是证据**，要以 diff 为准。

## 三、变异腿还原禁用 `git checkout --`

跑「变异腿」时把变异改回原状，**必须用备份文件**（`cp x /tmp/x.bak` → 变异 → `cp /tmp/x.bak x`），**绝不能用 `git checkout -- <file>`**。

实例：给 `routes/prompts.ts` 加完台账写入点（未 commit），跑完变异腿后顺手 `git checkout -- apps/server/src/routes/prompts.ts`，结果**把本会话在该文件的 4 处改动全部丢弃**，且因随后只看 `git status --porcelain` 没列出 prompts.ts，一度以为是并行会话回退。发现方式是还原后跑基线：**5 failed**（变异腿本该 11 绿）。

三个放大因素：① 只备份了 projects/app/ledger 三个文件，**漏了刚改的 prompts.ts**；② `git checkout --` 是「恢复到 HEAD」，语义上就包含「丢弃一切未提交改动」，不管谁的；③ 变异腿脚本末尾的「还原后基线」本该立刻暴露问题，但它输出的是 `5 failed` 而我正在读上一行结果。

- 任何变异腿脚本：还原体一律走备份文件，脚本开头对**每个**将要变异的文件 `cp` 备份（含此前几轮改过的）；
- 「基线必须回到 N 绿」不是可选项，是**该腿的退出条件** —— 非 N 绿就不算跑完；
- 需要丢弃工作树改动时用 `git stash push -- <file>`（可 `stash pop` 找回），不用 `checkout --`；真要永久丢弃先 `git diff -- <file> > /tmp/x.patch` 存档。

## 四、编辑长表格行时 old_string 必须是「完整整行含行尾竖线」

`edit` 工具做**精确字符串替换**：新串若不含旧串的全部内容，被替换的尾部就会**被静默吃掉**，且工具返回「Successfully replaced」——**不报错**。

本轮连中两次，都是改 M9 spec 里的长 Markdown 表格行：① `old_string` 取了某行的**前缀**，新串只写回前半截 ⇒ 该行尾部（含行尾 `|`）消失，表格从 4 列变 3 列且**没有报错**；② 用某行当锚点做插入，把**整行锚点删掉了**。

- 改长表格行时，`old_string` 取**完整整行（含行尾 `|`）**，新串把这一行**原样写回**再改；
- 插入操作用「锚点整行 → 锚点整行 + 新行」的形式，**不要**拿锚点行当 `old_string` 却省掉它；
- 改完立刻跑**结构体检**（逐行数竖线 / 比对表头列数），这类损坏**纯靠肉眼看不出来**；
- 若必须用中段子串作 `old_string`，新串**必须把该子串之后的内容原样带上**。

**关联**：与「变异腿还原禁用 `git checkout --`」同源 —— 都是**路径/字符串级的操作不区分意图**，而我的意图是行级的。

## 五、别人可能在我看不到的时候 commit；worker 可能越权自 commit

**症状**：commit 工作期间，working tree 出现**未知 commit**（不是我的 worker 做的，author 是 owner 自己或别的工具）。曾导致 2 次打脸：worker 漏报改动；owner 在 00:36:37 commit 覆盖了我准备做的 commit。

**另一个形态**：worker 在 brief 明确说「完成后给我报告」的前提下，**自己 git commit 了**（不是 amend，是新 commit）。内容干净，但流程上越权。

- commit 之前**必须**先跑 `git log --oneline -5` 看是否有新 commit；
- worker 报告**不能 100% 信任** —— 报「改了 N 个文件」实际可能多改/少改，每次 commit 前用 `git status --short` 全量看；
- `?? untracked` 和 ` M modified` 都要 stage 前确认归属；
- 用 `git log -1 --format="%h %an <%ae>"` 看 author 确认来源；
- **worker brief 末尾必须显式加一行** `❌ 不要 commit（由 parent agent 决定 commit 时机）` —— 只说「完成后给我报告」，worker 默认理解是「做完一切包括 commit」；
- 越权自 commit 的风险：commit message 不规范 / 改了不该改的文件 / 写到 master 而应该是分支 / 没等 verifier 就提交。

**apply when**：任何 commit 之前（不止首次，连续 commit / amend / push 之前）；任何 worker brief 末尾。
