---
title: "CLAUDE.md"
description: ""
useAs: "rule"
status: "draft"
folderPath: "/"
tags: []
platformMarks: ["claude-code"]
variables: ["convention"]
---

# CLAUDE.md

## 项目约定

遵循 {{convention}}。


<!-- openvibe:prompt-item -->

---
title: "中文提交规范"
description: ""
useAs: "reference"
status: "draft"
folderPath: "/"
tags: []
platformMarks: []
variables: []
---

# 中文提交规范

- 提交信息使用现在时
- 关联 issue 编号


<!-- openvibe:prompt-item -->

---
title: ".cursorrules"
description: ""
useAs: "rule"
status: "draft"
folderPath: "/"
tags: []
platformMarks: ["cursor"]
variables: ["language"]
---

Always answer in {{language}}.
When the diff drifts（规则漂移）, re-run the checklist before committing.


<!-- openvibe:prompt-item -->

---
title: "代码审查清单（含变量）"
description: "审查 PR 时逐条对照；变量：language / task"
useAs: "reference"
status: "draft"
folderPath: "/review/规则"
tags: ["重构","质量工程"]
platformMarks: []
variables: ["language","task"]
---

请以 {{language}} 为背景，对以下改动做代码审查（任务：{{task}}）。

## 检查项

- 边界条件与错误处理
- **规则漂移**：与既有约定不一致时先复述再改
- 测试覆盖

