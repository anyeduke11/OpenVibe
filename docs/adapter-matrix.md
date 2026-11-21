<!-- GENERATED FROM packages/adapters/src/compat.ts — DO NOT EDIT
     手改会被 `pnpm adapters:matrix:check` 判红；重生成：`pnpm adapters:matrix:update`。
     生成范围 = COMPAT_MATRIX 的兼容平台行（adapter-fixtures.md FR-3.1）；
     design §8 的六行专用 adapter 表是手写单源，不在此复制（队列 ㊺ 待裁③ = 不做）。 -->

# 兼容矩阵 · COMPAT_MATRIX 生成视图

| platform | reads | note |
| --- | --- | --- |
| Cline | AGENTS.md | 社区惯例（design §8 契约依据：强） |
| Codex | AGENTS.md | 社区惯例（design §8 契约依据：强） |
| Kimi Code | AGENTS.md | 官方 CLI 文档，感知链 AGENTS.md → .cursor/rules；子 Agent 感知缺陷属上游 bug |
| OpenCode | AGENTS.md | 社区惯例（design §8 契约依据：强） |
| Qwen Code | AGENTS.md | 社区惯例（design §8 契约依据：强） |
| Trae CN | AGENTS.md | 一手证据：T6 真机核验——二进制含「Include AGENTS.md in context」设置且默认开启，GUI 暗号实测确认与 .trae 规则并存时 AGENTS.md 仍被读入 |
| zcode | AGENTS.md | 一手证据：zcode 自身按 AGENTS.md 约定加载用户/项目指令 |
