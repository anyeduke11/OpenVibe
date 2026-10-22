---
description: %E5%B7%A5%E5%85%B7%E4%B8%8E%E7%8E%AF%E5%A2%83%E8%BE%B9%E7%95%8C%EF%BC%9AURL%2F%E9%9A%8F%E6%9C%BA%20ID%20%E5%8E%9F%E6%A0%B7%20copy%20%C2%B7%20bash%20sandbox%20EBADF%20%E5%8F%AA%E8%83%BD%E5%85%A8%E5%AE%A2%E6%88%B7%E7%AB%AF%E9%87%8D%E5%90%AF%20%C2%B7%20%E5%86%85%E7%BD%AE%20Browser%20%E8%BE%93%E5%85%A5%E6%B4%BE%E5%8F%91%E4%B8%8D%E5%8F%AF%E9%9D%A0%E6%94%B9%E8%B5%B0%E8%A3%B8%20CDP%20%C2%B7%20%E6%88%AA%E5%9B%BE%E8%90%BD%E7%9B%98%20%C2%B7%20%E8%B7%A8%E5%B9%B3%E5%8F%B0%E5%AE%9E%E6%B5%8B%E9%87%8F%E9%94%99%E5%AF%B9%E8%B1%A1%20%C2%B7%20%E7%8A%B6%E6%80%81%E6%9C%BA%E5%81%9A%E6%88%90%E5%8F%AF%E7%82%B9%E7%9A%84%E6%B4%BB%E4%BB%A3%E7%A0%81
---

# 工具与环境边界：哪些事工具做不了、哪些证据它给不了

Type: incident-lesson

**一句话**：工具的失败形态与它的成功形态常常长得一样。**先问「这一步是不是被测对象自己做的」「这个证据是不是落盘的」**，再决定采信与否。

## 一、URL / 随机 ID 必须原样 copy

部署/生成 URL 类的工具调用（`website_deploy`、生成 `node_id`、任何返回随机 ID / URL 的工具），回复用户时必须把工具返回的原始字符串**原样 copy**，不能凭记忆重打。哪怕只错一位数字，用户点进去就是 404。

**理由**：已在 Duke 部署作品集时犯过一次，URL 中间一位数字打错（51147 → 71147），用户访问得到 404。

**apply when**：任何返回随机字符串 ID / URL / token 的工具调用后；报告部署、生成、注册类操作的结果时。

## 二、bash sandbox `spawn EBADF` ⇒ 全客户端重启，别试别的

**症状**：整个 session 的 `bash` / `glob` / `grep` 工具持续返回 `spawn EBADF`（Bad file descriptor）；`read` / `edit` / `write` / `memory` / `mavis` 仍可用。

**触发**：推测为桌面客户端 shell sandbox fd 泄露或资源耗尽（并发跑 vitest + tsc + vite build 之后出现）。

**自愈尝试均失败**：多次 `echo` / `date` / `pwd` 重试 ＋ 派 `task` worker subagent ＋ 派 codex ＋ session 重启 —— **全部仍 EBADF**。

**结论**：bash sandbox 状态在**客户端进程级**，session 重启无法触及；需要**全客户端重启**（Activity Monitor 杀客户端进程 ＋ 重开）。

- **apply when**：任何 `bash` 工具持续 `spawn EBADF` 报错。
- **不要**浪费时间反复试 echo / 派 subagent / 派 codex —— 直接 report blocker 给用户，让其全客户端重启。

## 三、内置 Browser 的输入派发不可靠 ⇒ 改走裸 CDP

**症状**：`mcp_browser` 的 `click` 返回 `effect.dispatched: true`、目标 `resolved: true`、剪贴截图也正常，但页面上的事件监听器**完全没触发**（加 `console.log` 诊断也收不到，console 无异常）。`inspect` 随后持续 `STALE_ELEMENT_REF`，`press_key` 撞 `BROWSER_OPERATION_TIMEOUT`；`query` / `screenshot` / `reload` 始终正常 ⇒ **只有输入派发坏了，读取是好的**。

**别做**：不要因为「点击没反应」就去改自己的页面代码反复重载 —— 先加一行 `console.log` 到事件处理器：**有日志 = 派发层问题（换工具）；无日志且无异常 = 再查代码**。

**可行替代（零依赖，已实测）**：系统 Chrome ＋ Node 原生 WebSocket（Node ≥ 22 自带）写裸 CDP 驱动器：`--headless=new --remote-debugging-port=NNNN` → `fetch /json/list` 取 page target → WebSocket 连 `webSocketDebuggerUrl` → `Page.navigate` / `Runtime.evaluate` / `Input.dispatchMouseEvent` / `Page.captureScreenshot` / `Emulation.setDeviceMetricsOverride`。这套能真点击、真输入中文、真测对比度、真截全页图。

**顺带**：`file://` 离线打开时，`<link rel=stylesheet>` 指向 Google Fonts 会**阻塞整页渲染**（DOM 有内容但整页不合成、截图全空白）。改 `media="print" onload="this.media='all'"` 即可。

## 四、截图要「落盘进仓」⇒ 内置 Browser 给不了文件

判据常写「屏摄归档」，而 `mcp_browser` 的 `screenshot` **只把图回给模型看，不落盘** —— 它的返回是「model-visible inspection evidence」，不是文件。⇒ 凡是「截图要进版本库当凭据」的任务，内置浏览器这条路走不通，得换裸 CDP。

**可行做法（零依赖，已实测）**：headless Chrome ＋ Node 自带 WebSocket，`Page.captureScreenshot({ format:'png', captureBeyondViewport:true, clip:{x,y,width,height,scale} })` 拿 base64 后 `writeFileSync` 落盘，整条链路约 40 行。

**两个具体的坑**：
① **按标题截某一节**时，别用 `nextElementSibling` 逐级走找下界 —— GitHub 把 README 的标题包在 wrapper `div` 里，同级遍历撞到 wrapper 就永不返回 ⇒ 截出的是**整页文末**（实测 5120×14108）。改成**文档序**遍历：`querySelectorAll('h1..h6')` 取下标 i，取其后第一个 `level <= 起始 level` 的标题作下界。
② **体积**：2× DPR 截文本页动辄 4 MB。`sips --resampleWidth 1100` 压到 0.5 MB；**转 JPEG 反而更大**（同宽 1.3–1.5 MB）—— 文本截图别无脑转 JPEG。

**截图对象要选「用户实际读的那一版」**：仓库公开时截 GitHub 渲染视图，不是 raw Markdown；先 `gh repo view --json visibility` 确认公开。

## 五、跨平台实测「全绿」多半是量错了对象

一次真机探针跑完，三份报告 Q1/Q3/Q4 **全部答「支持」**，但那份结论**不能采信** —— 它们量的根本不是被测对象。

取证动作是 `cat ~/.trae/skills/x/…`、`cat ~/.codebuddy/skills/x/…`、直接执行 `~/.agents/skills/x/scripts/probe.sh`。**这三条每一条都会成功，且与平台无关**：前两条走**操作系统的**软链解析（测的是内核 readlink，不是平台的 skill 扫描器），第三条直接打真源路径、**根本没经过平台那一层**。⇒ **绕过被测对象的测量，结构上就回答不了关于被测对象的问题**。

**最隐蔽的一点**：脚本 stdout 里的 `path=` 显示真源路径这件事，**既可能是**「agent 自己 bash 调的」（无效），**也可能是**「平台跟随软链后执行」（**正面证据**）。两者在输出里长得一模一样 ⇒ **`path=` 字段不能单独用来判成败**。真正的判别式是「有没有平台自证」＋「有没有绕过平台的 shell 取证」。

- 任何「某平台/某运行时能不能 X」的实测：先问「我的取证动作里，哪一步是**被测对象自己**做的？」若全部由 agent 用 shell 代劳，测的是 shell；
- 跨客户端探针尤其危险 —— **凡是从命令行都能做的动作，都测不出客户端差异**；
- 判据设计：**「见某命令就红」会把合规用法一起判红**。正确形态是二元：**有该动作 ＋ 无「这是登记事实、非结论依据」的声明 ⇒ 才判无效**；
- **闸必须双向可判**：只会红的闸等于没有闸。给校验器留 `--dir` 让夹具落在临时目录验证，**不要往真实证据目录塞人造文件** —— 那里放的东西会被将来的读者当成实测。

**同轮的另外两个独立 bug**：
① **嵌套代码围栏**（外 ``` 内又 ```）内部那个把外层**提前闭合** ⇒ owner 只复制到前半段。**含代码块的提示词，外层一律用四反引号**；写完必须复算围栏行号。
② **参数解析**：`argv.indexOf(flag)` 找不到返回 **-1**，而 `argv[-1+1]` 就是 `argv[0]`（node 自身路径），它是真值 ⇒ 「flag 缺席」会悄悄变成「目录 = node 二进制」。**必须先判 `i >= 0`**。

## 六、把状态机做成「可点的活代码」，才能抓住注释与静态判据都抓不到的缺陷

在 demo / 原型里实现**状态机**（失效巡检、配额扣减、重试退避、状态流转）时，真正的缺陷往往不在「算错了」，而在「**改了没人读的对象**」与「**统计了却没执行动作**」这两类。它们在屏幕上的表现**完全一样**：都是「结果恒为 0」，都不报错，都能让界面看着正常。

本轮一次撞见三个（都是裸 CDP 真跑才暴露）：
1. `livenessOf(r)` 未命中缓存时 `return { … }` 返回**临时对象**，调用方 `st.fails++` 改的是一个谁也读不到的副本 ⇒ 界面永远显示「未巡检」。**惰性初始化必须 `LIVE[k] = {...}; return LIVE[k]`**。
2. 失效分支里只写了 `if (st.fails >= 2 && st.alive) out.justDied++`，**唯独没写 `st.alive = false`** ⇒ 计数涨到 4 而界面显示「已失效 0 条」。**每个「应该改变状态」的分支，先问「状态变量本身在哪一行被赋值」；只统计不赋值是最容易漏的一处**。
3. 关闭态抽屉只靠 `transform: translateX(102%)` 移出屏幕 ⇒ 文本仍在 DOM 里，被「全站文本不得出现某字样」这类判据数到。**不在场的元素必须 `aria-hidden="true"` ＋ `inert`**（这同时是真 a11y 修复）。

**因此：状态机的验收判据不能只断「最终值」，要断中间状态。** 本轮验证脚本一开始只输出两个聚合计数，于是「单次失败不判死」与「连续两次才判死」两种实现会给出**同一个 0** ⇒ 改完 bug 后复跑仍是 0，一度以为没修好。⇒ **判据输出里只有聚合计数时，它区分不了「没发生」和「发生了但没被记录」。**

- 任何用「界面不应出现某字样」当判据的检查：必须先排除**不在场但仍在 DOM 里**的区域，否则这个数会被看不见的文本污染，而且**排除项要逐条写出来**。
