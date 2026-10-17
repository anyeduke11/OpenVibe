# M8 探针操作指南（0-d 运行半边 · 手把手版）

> **你在这份文档里要做的事**：在本机的 Trae / CodeBuddy 里按步骤点几下、说几句话，把五问的答案填进 §4 的表格。**不需要写代码，不需要改脚本。**
>
> **预计耗时**：装探针已跑完（`openvibe-probe` 已装）＋ GUI 测试 **5–8 分钟**（只测 4 问）。
>
> **为什么必须你亲自做**：这五问问的是「Trae / CodeBuddy 在真机上到底怎么发现和加载 skill」，我在命令行里**没有任何办法观测到 GUI 里的加载行为**。已实测的结构半边（目录分布、symlink 农场、子目录惯例）见 `docs/dev-plan-v0.2.1.md` §6.1。

---

## §1 先装探针（一条命令）

在仓库根目录执行：

```bash
bash docs/devlog-evidence/M8-probe/setup-probe-skill.sh setup
```

它会做四件事，**全部是新增，不动你现有的任何一个 skill**：

| # | 做什么 | 落在哪 |
|---|---|---|
| 1 | 造一个真源 skill `openvibe-probe`，含 `SKILL.md` ＋ `scripts/probe.sh` ＋ `references/answers.md` | `~/.agents/skills/openvibe-probe/` |
| 2 | 把它 symlink 进两个平台的用户级目录 | `~/.trae/skills/openvibe-probe` · `~/.codebuddy/skills/openvibe-probe` |
| 3 | 打印当前状态 ＋ 下面的测试步骤 | — |

> **⚠️ 2026-10-14 简化（owner 裁「只测试一个真实 skill 即可」）**：初稿还有第 4 步「造项目级副本」，**已去掉**。只装一个 skill ⇒ **测不了项目级/用户级优先级**（那需要两处同名），故 Q2 本轮作废。

**探针的特征**：它被设计成「能区分各种失败原因」——
- 用户级版的脚本吐出 `marker=V1-USER`，项目级版吐 `marker=V2-PROJECT` ⇒ **看到哪个 marker 就知道它加载的是哪一层**；
- 脚本用了一个 `<<<M8-PROBE-SCRIPT-RAN|...>>>` 这种**不像人话的格式** ⇒ 如果它给你的是一段通顺的中文总结，**说明它没真跑脚本、是自己编的**，这本身就是重要发现，请照实记；
- `SKILL.md` 里故意要求它**先不加 `bash` 前缀直接执行** ⇒ 用来分辨「需要可执行位」和「需要显式解释器」两种失败。

> **测完清理**：`bash docs/devlog-evidence/M8-probe/setup-probe-skill.sh clean`（只拆探针，不碰别的 skill）。

---

## §2 测什么（五个问题，一句话一个）

| 问 | 一句话 | 你要观察的 |
|---|---|---|
| ~~**Q2**~~ | ~~优先级~~ | **本轮作废**——只装一个 skill，项目级/用户级抢不到 |
| **Q1** | **加载时机** | 装完 skill 后，**要不要重启 Trae 才认得**？ |
| **Q3** | **脚本可执行性** | skill 里的 `scripts/*.sh` **能不能真被执行**？ |
| **Q4** | **symlink 限制** | Trae / CodeBuddy **跟不跟随 symlink**？ |
| **Q5** | **`minicode` 归属** | `minicode` 这个 adapter 指的是**哪个产品**？（见 §3.5） |

---

## §3 一步步操作

> ⚠️ **不想手工逐步走的话：用现成提示词。** `prompt-run-once.md` 里有一段可直接粘贴的
> 「一键执行」提示词，粘进 Trae／CodeBuddy 即可，它会自动做前置自检、跑探针、
> 回答四问并把原文落到 `raw/<平台>-r<轮次>.md`。**总 4 轮**（两个平台 × 重启前后），
> 轮次 2／4 必须先 `Cmd+Q` 完全退出再重开 —— 不重启就没有对比，Q1 答不了。
> 本节保留为该提示词的**依据与出处**，两边内容一致时以本节为准。

### 3.1 Q1 · 加载时机（先测 Trae）

1. 先确保上面 §1 的命令跑过了。
2. 打开 **Trae**。
3. **不要重启**，随便打开一个普通项目（**别用探针测试项目**，那是 Q2 用的）。
4. 新建一个会话，**原样说出这句**：

   ```
   灵典探针·用户级
   ```

5. **记下三件事**：
   - 它认不认得这个 skill？（认得 = 会提到「探针」或 `openvibe-probe`）
   - 脚本有没有跑出来？跑出来的话，那行 `<<<M8-PROBE-SCRIPT-RAN|...>>>` **原文**是什么？
   - 它报的 SKILL.md 路径是哪个？

6. **完全退出 Trae**（`Cmd+Q`，不是关窗口），**重新启动**，开个新会话，**再说一遍同一句**。

7. **对比第 5 步和第 7 步**：
   - 两边一样 ⇒ **不用重启就能加载**（热加载）；
   - 只有重启后才行 ⇒ **需要重启**，那 M8 的安装指引就必须写「装完请重启 Trae」。

> **记哪一格**：§4 表格的 Q1 行填「热加载」或「需重启」，并把两次的原文都贴上。

---

### 3.2 Q3 · 脚本可执行性（已在 3.1 顺带测到）

`SKILL.md` 里已经写死了要求：**先不加 `bash` 前缀直接跑，失败再加**。所以你只要看它最终**有没有把 `<<<M8-PROBE-SCRIPT-RAN` 这行字吐出来**，并留意它**中途有没有报错**：

| 你看到的 | 结论 |
|---|---|
| 直接跑成功，没报错 | **需要可执行位**（脚本 mode 755 就够） |
| 报了 `Permission denied`，加 `bash` 后成功 | **需要显式解释器**；M8 的 SKILL.md 必须写 `bash scripts/x.sh` |
| 报了 `No such file or directory` | **路径解析有问题**——记下它说的工作目录与 SKILL.md 绝对路径 |
| 完全没跑，给了一段中文总结 | **脚本没被执行**，它自己编了内容 ⇒ 这是最坏的一种，M8 绝对不能依赖 |

> **记哪一格**：Q3 行填上表其中一格，**并把它的报错原文贴进去**（报错比结论更有用）。

---

### 3.3 Q4 · symlink 限制（CodeBuddy 重点）

Trae 的 `~/.trae/skills/` 29 条**全是 symlink**，CodeBuddy 69 条**也是全 symlink**——这个生态形态已经在用了，但**两个平台都还没证明它们跟随 symlink**。

1. 在 **CodeBuddy** 里重复 §3.1 的全部步骤（同样先问「灵典探针·用户级」）。
2. 对比 Trae 与 CodeBuddy 的结果：
   - 两边都认得 ⇒ **都跟随 symlink**，M8 可以直接跟生态走 symlink；
   - Trae 认得、CodeBuddy 不认得 ⇒ **CodeBuddy 需复制不能 symlink**，那 M8 的 `sync` 要按平台分流；
   - 两边都不认得 ⇒ M8 **必须走复制**。

> **记哪一格**：Q4 行分别填 Trae 与 CodeBuddy 的结果。

---

### 3.4 Q4 补测 · 真实目录对照（可选）

如果 §3.4 的结果是「某个平台不认 symlink」，需要再排除一种可能：**是它不认 symlink，还是它压根没在那个位置找**。

把探针**复制**（不是 symlink）一份到那个平台：

```bash
cp -R ~/.agents/skills/openvibe-probe ~/.codebuddy/skills/openvibe-probe-copy
```

（把 `codebuddy` 换成不认 symlink 的那个平台；`-copy` 后缀是防止和 symlink 那份撞名。）

重启该平台，再问一次。**认得 ⇒ 是 symlink 的问题；仍不认得 ⇒ 是位置或加载机制的问题。**

---

### 3.5 Q5 · `minicode` 指的是哪个产品（一句话就能答）

这问**不需要跑任何东西**，只需要你确认一个事实：

- OpenVibe 代码里的 adapter id 叫 **`minicode`**，产出 **`MINI.md`**（`packages/shared/src/constants.ts:15` · `packages/core/src/pack/pack.test.ts:38`）。
- `docs/design.md:281` 把它描述成「**MiniCode** 的 `/init` 约定」，依据是 GitHub 上一个 1.1k★ 的 MIT 项目。
- 而**你现在正在用的这个客户端叫 MiniMax Code**，它的 skill 目录是 `~/.minimax/skills`。

**请回答**：

1. **MiniMax Code 就是 design.md 说的那个「MiniCode」吗？**（是 / 不是 / 不确定）
2. 如果不是，`MINI.md` 该投给哪个产品？
3. 如果是，那 `docs/design.md` 里的「MiniCode」这个写法需不需要改名为「MiniMax Code」？（这会动 `design.md` §8，属**冻结面**改动，需要 owner 单独裁）

> **记哪一格**：Q5 行直接写 1 的答案 ＋ 2 ＋ 3。

---

## §4 结论表（**测完填这里，填完直接发给 agent**）

| 问 | 结论 | 证据 / 报错原文 |
|---|---|---|
| **Q1** 加载时机 | ☐ 热加载　☐ 需重启　☐ 其他：______ | （两次的原文） |
| **Q3** 脚本可执行性 | ☐ 需可执行位　☐ 需 `bash` 前缀　☐ 路径错　☐ 根本没跑 | （报错原文） |
| **Q4** symlink | Trae：☐ 跟随　☐ 不跟随　☐ 未加载<br>CodeBuddy：☐ 跟随　☐ 不跟随　☐ 未加载 | （原文） |
| **Q5** minicode | ☐ 是 MiniMax Code　☐ 不是，指 ______　☐ 不确定 | （依据） |

---

## §5 测完之后

这五问的答案**直接决定两件事**：

1. **`docs/specs/m8-skill-bridge.md`（闸 0-i）能不能写** —— 写它需要「复制还是 symlink」这个答案，缺了就是在把猜测固化成 FR。
2. **`m8-agent-bridge.md` 的 §6 与 PRD-M8 的 B3.1 / B3.2 能不能收口** —— `~/.agents/.skill-lock.json` 这把**第二把锁**的 `clean` 删除边界是否可逆，取决于 Q4 走哪条路。

**测到一半卡住了**：把你卡住的那一步和看到的现象直接发给 agent，不用自己判断该怎么办。