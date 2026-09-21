# 贡献指南（CONTRIBUTING）

感谢关注 OpenVibe（灵典）——vibe coding 的标准化工作台。

## 开发环境

- Node.js ≥ 22，pnpm ≥ 10（仓库以 `packageManager` 字段锁定版本，`corepack enable` 即可）
- 克隆后：`pnpm install && pnpm lint && pnpm typecheck && pnpm test` 应全绿

## 仓库结构

```
apps/{web,server,cli}        应用层（SPA / Fastify API / openvibe CLI）
packages/{core,adapters,shared}   领域核心 / 平台 adapter / 共享 schema
content/seed/                种子内容（术语 / 流程模板 / 提示词）
docs/                        PRD、SPEC、设计文档（P0 产物）
```

依赖规则（ESLint 强制，见 `eslint.config.js`）：

- R1 `apps/*` 可依赖 `packages/{core,adapters,shared}`
- R2 `packages/core`、`packages/adapters` 只依赖 `packages/shared`
- R3 `packages/core` **禁止**依赖任何 app/server（CLI 离线模式的前提）
- R4 web 与 server 只经 HTTP API 交互，禁止相互 import

## 跨平台纪律清单（macOS / Linux / Windows 三平台 CI）

1. **换行符一律 `\n`**：仓库根 `.gitattributes` 已强制 `eol=lf`；不要提交 CRLF 文件；生成注入产物时（packages/core/pack）也一律写 `\n`。
2. **路径一律用 `/`**：业务代码中拼接路径用 `path.posix` 或模板字符串 `/`；仅在 `fs` 调用边界用 `path.join`/`path.resolve`。
3. **权限与符号链接**：不假设 symlink 可用（Windows 需管理员权限）；MVP 不引入 symlink 依赖。
4. **文件名大小写敏感**：macOS 默认不敏感、Linux 敏感——import 路径大小写必须与磁盘一致。
5. **shell 命令**：npm scripts 不得使用 sh 专属语法（`&&` 以外的管道/重定向/变量展开）。

## 提交与开发记录

- 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `test:` / `refactor:`）。
- 每完成一个任务组或完整功能，在 `DEV_LOG.md` 追加 `DEV-NNNN` 记录（编号递增，含问题描述/实现思路/核心变更/测试验证/潜在风险）。
- 规格与实现的冲突处理遵循 `docs/dev-plan.md` §0.3 变更分级（A 冻结契约 / B 行为规格 / C 实现细节）。

## 许可

- 代码与种子内容均以 Apache-2.0 发布；提交即表示同意以该协议授权。
