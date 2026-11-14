# N1 探针结论表 · 六平台「是否真读二级文件」（U10）

批次 N1（Track N 第一站，纯证据）· 2026-11-14 · 状态 v0.1（首版：文档证据腿全量，真机腿待 owner 环境）

## 背景

Track N（新手单轨，decisions ㊻ / [DEV-0272]）需要把注入产物从「全内联单文件」升级为「主文件 + 二级文件（TERMS.md 等）」的分层加载（m11 L0/L1）。本探针回答 U10：**六个 adapter 平台在主文件引用二级文件时，是否真的会加载后者**。

⚠️ 关键前提事实：当前 composer 生成的主文件对 TERMS.md 的引用是**纯文本指针**（「见 TERMS.md（N 条）」），不构成任何平台的加载指令——**现状下所有平台都不读二级文件**。本表评的是「若升级引用形态，各平台能否真读」。

## 结论表

| 平台                               | 主文件                       | 二级文件加载机制                                                                     | 证据强度                                  | L1 可行性                                                                                                         |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| claude-code                        | `CLAUDE.md`                  | **`@path` import 语法**（官方特性）：会话启动时把被引文件展开进上下文                | **强／一手**（官方 memory 文档）          | **✓** 主文件写 `@TERMS.md` 即生效；已知限制：`@~/.claude/` 家目录形态偶发失效（GitHub #8765），项目级路径不受影响 |
| cursor                             | `.cursor/rules/openvibe.mdc` | 无 import 语法。机制 = frontmatter `globs` 触发加载 + agent 按需读文件（rule 指示）  | 较强（官方 rules 文档＋论坛实测）         | **部分**——L1 形态须是「rule 指示 agent 按需读 TERMS.md」，非启动时自动                                            |
| generic-agents（codex/zcode/kimi） | `AGENTS.md`                  | **标准无 import**；Codex 自动枚举的是 AGENTS.md 本体（嵌套目录各层），无二级文件机制 | 较强（OpenAI Codex 指南＋标准）           | **✗** 分层不可行——AGENTS.md 平台维持单文件全量（L0）                                                              |
| codebuddy                          | `CODEBUDDY.md`               | 本体自动加载；另有 `.codebuddy/rules/*.md` 模块化规则（各文件独立加载，无 import）   | 较强（腾讯 guidelines＋腾讯云文档）       | **部分**——可把术语拆进 `.codebuddy/rules/` 模块文件（形态不同于主文件引用）                                       |
| trae                               | `.trae/rules/openvibe.md`    | 规则目录机制（类 cursor）                                                            | 较弱（官方 rules 文档，加载细节未逐条核） | **部分（待核）**——同 cursor 方向，逐条核验排后                                                                    |
| minicode                           | `MINI.md`                    | 类 CLAUDE.md/AGENTS.md 单文件上下文                                                  | 弱（GitHub README，无加载细节文档）       | **✗（待证）**——维持单文件全量                                                                                     |

## 对 N4（m11 L0/L1）的三个直接推论

1. **adapter 能力位不是布尔**——六平台落在三个档：✓ 自动 import（claude-code）/ ✓ 条件可行（cursor、codebuddy、trae：按需读或模块拆分）/ ✗ 不可行（generic-agents、minicode）⇒ m11 的「二级文件能力位」按平台枚举三档，默认全部 L0（单文件全量），逐平台开 L1。
2. **claude-code 是唯一「引用即生效」的平台**——L1 的第一个实现腿 = claude-code adapter 把「见 TERMS.md」升级为 `@TERMS.md`（一行改动 + golden），其余平台维持 L0。
3. **12k token 灌顶问题的真实缓解面**只有 claude-code 一家——AGENTS.md/minicode 平台的全内联在可见未来不变 ⇒ 注入内容的**瘦身**（J1 判据：只注入增量，不注入常识）比**分层**更普适。

## 真机腿（待 owner 环境）

本机 claude CLI 鉴权 401（provider 凭据）⇒ 对照实验未跑。夹具已备（`/tmp/n1-probe/`，驱动器见同目录 `probe.sh`）：with-import（CLAUDE.md 含 `@TERMS.md` + TERMS.md 含虚构术语「晶格回声协议」）vs without-import 对照——问「什么是晶格回声协议」，回答含定义细节 ⇒ import 生效。**文档证据已强（一手），真机腿是补充确认非阻塞项。**

## 引用源

- Claude Code memory（@import）：https://code.claude.com/docs/en/memory ；家目录形态已知问题 https://github.com/anthropics/claude-code/issues/8765
- Cursor rules（globs/嵌套/按需读）：https://cursor.com/docs/rules ；https://forum.cursor.com/t/cursor-loads-all-rules-from-all-folders-in-monorepo-and-blows-past-context-limits/165337
- AGENTS.md 标准（无 import；Codex 枚举本体）：https://agents.md ；Codex 指南 https://designmd.app/guides/codex
- CodeBuddy（本体自动加载 + .codebuddy/rules 模块化）：https://github.com/Tencent/awesome-devbuddy/blob/main/CODEBUDDY_MD_%20guidelines.md ；https://cloud.tencent.com
- Trae rules：https://docs.trae.ai/ide/rules
- MiniCode：https://github.com/LiuMengxuan04/MiniCode
