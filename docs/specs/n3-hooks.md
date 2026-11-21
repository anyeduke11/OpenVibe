# N3 规格：hooks 集成（注入前/后钩子）

| 项   | 值                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本 | **v1.0（2026-11-16，N3 落地开工）**。本行原为引述块形态（并行会话写法），2026-11-21 收口时改为全仓统一的表行形态（FR-4.1 的判据）。                                    |
| 单源 | `docs/decisions.md` ㊻（DEV-0272，2026-11-14 owner 裁 Track N 全做）；PRD v0.2.6 R-8 / FR-2.6-7（hooks 需求定义）、RQ-5（钩子由谁执行，已裁：**CLI 执行 + Web 配置**） |
| 级别 | **A 级**（hooks 配置进 pack manifest ⇒ 触发 `docs/design.md` §7/§8 冻结契约，走 A 级链）                                                                               |
| 前置 | U10（N1 探针）已跑；D-v25-1（A 级裁定模板）已裁                                                                                                                        |

## 1. 目标与用户价值

OpenVibe 的标准包今天只能「注入规则」，无法在注入流程的**前/后**挂接用户自定义动作（备份、通知、校验等）。N3 补齐这一能力：**用户在 Web 面板配置钩子 → 钩子随包分发（进 manifest）→ CLI sync 注入时按序执行**，执行留痕、失败可控、超时可控。

- **注入前（pre）**：任何落盘动作发生之前执行——典型场景是「注入前备份工作区」。
- **注入后（post）**：落盘与锁写入完成之后执行——典型场景是「注入完成通知/校验」。

## 2. 范围

**在范围内**：

- HookDef 契约（字段、默认值、校验）
- hooks 配置进 pack manifest（`openvibe.pack.json` 的 `hooks` 字段）
- Web 组包链路：`PackSelection` 加 hooks 配置 → `resolvePack` → `composePack` 写进 manifest
- CLI 注入链路：`sync` 读 manifest.hooks，pre 在落盘前执行、post 在落盘后执行
- 执行语义：失败不阻断（默认）或按配置阻断、超时、执行留痕
- A 级链：schemaVersion+1、先改 golden

**不在范围内**：

- Web 面板**执行**钩子（执行者是 CLI，与「CLI 唯一写通道」定位一致）
- 平台侧 hooks（如 Claude Code 的 PreToolUse 等平台钩子）——那是平台行为，OpenVibe 只提供「注入流程的钩子」
- 钩子内容的可视化编辑（只配命令与参数）

## 3. 核心概念与数据

### 3.1 HookDef

```ts
interface HookDef {
  name: string // 钩子名（包内唯一，用于留痕与报错定位）
  command: string // 执行的命令（本机 shell 执行，用户自定义）
  timeoutMs: number // 超时（毫秒），默认 30000
  failPolicy: 'continue' | 'block' // 失败处置：不阻断（默认）/ 阻断
}
```

**校验（写配置与 sync 时双重校验）**：

- `name`：非空、包内唯一、不含控制字符
- `command`：非空
- `timeoutMs`：正数，上限 LIMITS.hooks.maxTimeoutMs（默认 300000）
- `failPolicy`：枚举

### 3.2 manifest 字段

`openvibe.pack.json` 新增 `hooks` 字段（`schemaVersion` 升位后生效）：

```jsonc
{
  "schemaVersion": 2,
  // ...
  "hooks": {
    "pre": [
      {
        "name": "backup",
        "command": "tar czf ~/ov-backup-$(date +%F).tgz .openvibe",
        "timeoutMs": 30000,
        "failPolicy": "continue",
      },
    ],
    "post": [
      { "name": "notify", "command": "echo synced", "timeoutMs": 10000, "failPolicy": "continue" },
    ],
  },
}
```

- `hooks` 缺省 = `{ pre: [], post: [] }`（空集，与「未配置」字节等价，兼容旧包）
- **无钩子包 ⇒ 产物与今天逐字节相同**（降级保证，与 E-6 同纪律）

### 3.3 配置通道

```
Web（PackWizard 新增钩子配置步骤）
  → PackSelection.hooks（组包时配置）
  → resolvePack → ResolvedPack.hooks
  → composePack → manifest.hooks（随包导出、随 sync 落盘）

CLI（sync）
  → 读 manifest.hooks
  → pre：锁内、落盘循环前执行
  → 落盘循环（备份→写文件→写锁）
  → post：锁写完后执行
```

## 4. 功能需求

### FR-1 HookDef 契约

- FR-1.1 `HookDef` 类型与校验器落 `packages/shared`（schema 面），manifest 与 selection 共用同一 schema
- FR-1.2 默认值：`timeoutMs=30000`、`failPolicy='continue'`；配置缺省字段按默认补齐
- FR-1.3 包内 `name` 唯一；pre/post 各自独立命名空间（pre 与 post 可重名）

### FR-2 manifest 承载

- FR-2.1 `PackManifestSchema` 新增 `hooks` 字段（`hooks?: { pre: HookDef[]; post: HookDef[] }`），缺省空集
- FR-2.2 `ResolvedPack` 新增 `hooks` 字段，`composePack` 将其写入 manifest
- FR-2.3 `PackSelection` 新增 `hooks` 字段，`resolvePack` 将其透传至 `ResolvedPack`

### FR-3 Web 配置

- FR-3.1 `PackWizard` 新增钩子配置步骤：pre/post 两组，每组可增删 HookDef（name/command/timeoutMs/failPolicy）
- FR-3.2 配置即写进 `PackSelection.hooks`，随组包进入包产物（导出时 hooks 随 manifest 分发）
- FR-3.3 **口径**：Web 是**配置入口**，**执行**只发生在 CLI——与「CLI 唯一写通道」不冲突（配置是写包，执行是 sync 动作）

### FR-4 CLI 执行

- FR-4.1 **pre 挂点**：锁内、落盘循环（备份→写文件）**之前**执行；顺序 = manifest.hooks.pre 数组顺序
- FR-4.2 **post 挂点**：锁（`.openvibe/sync-lock.json`）写完**之后**执行；顺序 = manifest.hooks.post 数组顺序
- FR-4.3 **失败语义**：
  - `failPolicy='continue'`（默认）：失败（非零退出/超时）记 warning，**不阻断**主流程，sync 继续
  - `failPolicy='block'`：pre 失败 ⇒ **中止 sync**（不落盘、不写锁，返回错误）；post 失败 ⇒ sync **返回非零退出码**（落盘已完成、锁已写，不回滚）
- FR-4.4 **超时**：超过 `timeoutMs` 杀掉进程，按失败处置；超时上限 LIMITS.hooks.maxTimeoutMs
- FR-4.5 **执行方式**：本机 shell 执行用户命令（命令来自用户自己的包配置）
- FR-4.6 **留痕**：每次执行追加一条记录到 `.openvibe/hooks-run.jsonl`（JSONL 追加，每行：`ts、phase(pre/post)、name、command、exitCode、durationMs、timedOut、ok`）；**含失败与超时**

### FR-5 降级与兼容

- FR-5.1 无钩子包（hooks 缺省/空集）：sync 行为与今天逐字节相同（不产生 hooks-run 记录之外的任何产物变化）
- FR-5.2 旧包（无 hooks 字段）：schema 校验按缺省空集处理，正常注入

## 5. 边界与异常

| 场景                               | 处置                                            |
| ---------------------------------- | ----------------------------------------------- |
| pre 钩子失败 + block               | 中止 sync，不落盘、不写锁；返回错误；留痕       |
| pre 钩子失败 + continue            | warning，继续落盘；留痕                         |
| post 钩子失败 + block              | 落盘与锁已完，sync 返回非零退出码；不回滚；留痕 |
| post 钩子失败 + continue           | warning，sync 正常完成；留痕                    |
| 钩子超时                           | 杀进程，按失败处置（continue/block 同上）；留痕 |
| 钩子命令不存在/无权限              | 按失败处置；留痕                                |
| 钩子配置校验失败（manifest 层面）  | sync 前置校验报错，不进入执行                   |
| `.openvibe/hooks-run.jsonl` 不可写 | warning（不阻断），留痕失败不阻断主流程         |

**安全口径**：钩子命令由用户在自己的包里配置、在本机执行；OpenVibe 不提供远程钩子、不执行包外来源的命令。

## 6. 验收标准

| 编号        | 标准                                                                         | 级别 |
| ----------- | ---------------------------------------------------------------------------- | ---- |
| UT-HOOK-01  | HookDef 校验：合法/非法（空名、重名、非法 failPolicy、超时上限）全通过       | 单测 |
| UT-HOOK-02  | manifest 序列化：hooks 字段正确落盘；缺省 = 空集且与无钩子包字节等价         | 单测 |
| UT-HOOK-03  | composePack：ResolvedPack.hooks → manifest.hooks 正确透传                    | 单测 |
| IT-HOOK-04  | sync 端到端：pre 在落盘前执行（留痕时间戳早于文件写入）、post 在锁写完后执行 | IT   |
| IT-HOOK-05  | 失败语义：continue 不阻断 / block 中止（pre）/ block 非零退出（post）        | IT   |
| IT-HOOK-06  | 超时：超时被杀、按失败处置、留痕 timedOut=true                               | IT   |
| IT-HOOK-07  | 留痕：hooks-run.jsonl 追加记录完整（含失败/超时）                            | IT   |
| IT-HOOK-08  | 降级：无钩子包产物与今天逐字节相同（golden 三夹具）                          | IT   |
| BND-HOOK-09 | 旧包（无 hooks 字段）注入正常                                                | 边界 |
| REG-HOOK-10 | schemaVersion=2 后 manifest 校验对旧/新包双向兼容                            | 回归 |

## 7. 依赖

- `packages/shared`：HookDef 契约、`PackManifestSchema`/`PackSelection` 扩展、LIMITS.hooks
- `packages/core`：`composePack` manifest 组装、`resolvePack` 透传
- `apps/server`：pack-assemble 链路透传
- `apps/web`：PackWizard 钩子配置步骤（UI）
- `apps/cli`：sync pre/post 执行、留痕

## 8. A 级链处置

本项为 **A 级**（manifest 契约面变化），按 `docs/design.md` §7/§8 与 m11 FR-6 的纪律执行：

1. **裁定登记**：本规格 + owner 裁定（2026-11-16：CLI 执行 + Web 配置；hooks 进 pack manifest）登记入 `docs/decisions.md`（D 编号）
2. **PRD 附录编号**：PRD v0.2.6 R-8 / FR-2.6-7 的实现落点补注
3. **schemaVersion+1**：`SCHEMA_VERSION` 1 → 2（`packages/shared/src/constants.ts`），`PackManifestSchema` 的 `schemaVersion` 字面量同步
4. **先改 golden**：`tests/golden` 三夹具（G1/G2/G3）的 manifest 快照先更新（hooks 缺省空集），再改实现
5. **后改实现**：按本规格 FR 逐项实装，验证全绿后合入
