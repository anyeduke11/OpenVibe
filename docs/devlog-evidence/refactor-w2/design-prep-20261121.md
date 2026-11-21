# W-2 设计准备 · N3／N4／D33 的落地现状与剩余缺口（2026-11-21）

> **定位**: A 级合并窗口（裁定 ㊽ ①）开工前的设计盘点。**本笔不改一行产品代码**——它把「窗口还剩什么」从印象变成逐文件核实的事实，并给 D33 兼容读的补丁设计。
> **证据口径**: 2026-11-21 本机工作树实读（全部带复算锚点）；引用行号随提交会漂，以锚点串为准。

---

## 0. 状态修正（本笔最重要的产出）

**合并窗口的五件里，两件（N3／N4）已经被并行会话按 ㊼ 自己的链走完了**（工作树未提交）。开工前按印象排的窗口内容需要重算：

| ㊽ 窗口五件             | 现状                                    | 证据锚点                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N3 hooks 进 manifest    | ✅ **契约层＋实现层均已落地**（未提交） | `SCHEMA_VERSION = 2`（`packages/shared/src/constants.ts:14`）；`HookDefSchema`/`HooksSchema`（`schemas/pack.ts:16-96`）；`LIMITS.hooks.maxTimeoutMs=300000`（`constants.ts:506`）；`runHooks('pre'/'post')`（`apps/cli/src/commands/sync.ts:408/486`）；Web `HookEditor.tsx` ＋ `PackWizard.test.tsx` |
| N4 三档产物             | ✅ **契约层＋渲染层已落地**（未提交）   | golden manifest 已带 `l1: {'claude-code': true}` 且 `schemaVersion: 2`（`tests/golden/G1/openvibe.pack.json` 实测）；`PackAdapter.l1Capability`（`pack-contract.ts:59`）；六 adapter 消费 `l1Capability`；`termsRef` 按能力位分形态渲染（`composer.ts:134`）                                          |
| 4-2 `schemaVersion` 1→2 | ✅ **已被 N3/N4 消耗**（同上）          | `z.literal(SCHEMA_VERSION)`（`schemas/pack.ts:290`）＝literal(2)；bundle 容器版本**刻意保持 1**（`constants.ts:20` 头注有理由）                                                                                                                                                                       |
| D25 落地笔              | ⛔ **未发生**（③-a 待裁）               | `pack-contract.ts:70` 仍 `npx openvibe-cli sync`；`PUBLISH_NAME='openvibe-cli'`（`build-cli.ts:47`）；golden 命中 11 文件                                                                                                                                                                             |
| D32 段级受管标记        | ⛔ **未签未实现**                       | `PACK_SECTION_FLOW` 等节标记已有，段级 `openvibe:section` 标记无                                                                                                                                                                                                                                      |

**连带修正一（RG2 判据「golden 重基恰一次」）**: ㊽ 的「一次重基」已被 ㊼ 的先行落地实质分解为 **DEV-0276 一次（N3/N4 的 manifest v2 重基）＋ 窗口后半一次（D25＋D32）**。RG2 出口判据在 W-5 对账时应按此现实改写（或 owner 追认「合并窗口＝每半次内恰一次」）。这是归因混流代价的**提前兑现**，不是违约——分次提交各自的 golden 基线快照正是 ㊽ 登记的缓解手段。

**连带修正二（登记债）**: decisions ㊼ 行引用 `[DEV-0276]`，但 `DEV_LOG.md` **没有 DEV-0276 条目**（`grep -c '^## \[DEV-0276\]' DEV_LOG.md` → 0）。该号已被占（本会话 W-0 按纪律跳号至 0277），条目应由并行会话补笔。

---

## 1. N3 hooks · 落地清单（对照 spec FR 逐条核实）

| FR             | 内容                                              | 状态                 | 锚点                                                                                                                                     |
| -------------- | ------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1.1         | HookDef 契约落 shared，manifest 与 selection 共用 | ✅                   | `schemas/pack.ts` `HookDefSchema`（name 控制字符拒 / timeoutMs 上限引用 LIMITS）                                                         |
| FR-1.2         | 默认 `timeoutMs=30000`、`failPolicy='continue'`   | ✅                   | `constants.ts` `HOOK_DEFAULT_TIMEOUT_MS` ＋ LIMITS.hooks.maxTimeoutMs=300000                                                             |
| FR-1.3         | 包内 name 唯一，pre/post 独立命名空间             | ✅                   | `HooksSchema.superRefine`（pre/post 各自查重，`schemas/pack.ts:66-73`）                                                                  |
| FR-2.1         | manifest 增 `hooks?`，缺省空集                    | ✅                   | `composer.ts:325-326` **空集不写字段**（注释明说「兼容旧包与既有指纹」）                                                                 |
| FR-2.2/2.3     | ResolvedPack / PackSelection 透传                 | ✅                   | `pack/resolve.ts`（hooks 字段已在 canonical 链）                                                                                         |
| FR-3.1/3.2/3.3 | Web 配置步骤、进 selection、CLI 执行              | ✅                   | `HookEditor.tsx`、`PackWizard.test.tsx`                                                                                                  |
| FR-4.1/4.2     | pre 落盘前 / post 锁写后，按数组序                | ✅                   | `sync.ts:408`（pre）、`:486`（post）                                                                                                     |
| FR-4.4         | 超时杀进程                                        | ✅（实现面待真机腿） | LIMITS.hooks.maxTimeoutMs                                                                                                                |
| FR-4.6         | `.openvibe/hooks-run.jsonl` 留痕                  | ✅                   | `HOOKS_RUN_REL`（`local/lock.ts:17`，注释引 FR-4.6）                                                                                     |
| FR-5.1         | 无钩子包行为逐字节不变                            | ✅                   | 空集不写 manifest ＋ **fingerprint 只覆盖 files**（`fingerprint.ts:13-19`，manifest 的 l1/hooks 键不在指纹内 ⇒ 旧包重导不破 409 不可变） |
| FR-5.2         | 旧包按缺省空集                                    | ✅                   | 两字段均 `.optional()`                                                                                                                   |

**剩余欠腿**: FR-4 的执行语义（block 中止 / 超时 / 留痕）尚无真机验证腿记录在 spec §6——属 U-8 同款「真机探针」欠账，W-5 对账时并入。

---

## 2. N4 三档 · 落地清单

| 面                                                         | 状态                        | 锚点                                                                             |
| ---------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `manifest.l1` 稀疏 Record（只声明非 false 平台）           | ✅                          | `composer.ts:328-332`（filter `capability !== false` 后 `Object.fromEntries`）   |
| 默认值（claude-code=true，其余 false）                     | ✅                          | `L1_DEFAULT`（composer 导入）＋ golden G1 `l1: {'claude-code': true}` 实测       |
| adapter 能力位（auto-import / on-demand / module / false） | ✅                          | `PackAdapter.l1Capability` ＋ cursor/trae/codebuddy/generic-agents 各自声明      |
| 生效规则 `l1[platform]=true 且 capability≠false`           | ✅                          | `composer.ts:248`（`canonical.l1?.[id] ?? L1_DEFAULT[id]`）＋ `termsRef:134-139` |
| L1 引用形态（`@TERMS.md` / 按需读指示）                    | ✅                          | `termsRef` 分形态渲染                                                            |
| golden 重基                                                | ✅                          | G1-G3 manifest 已 v2 ＋ `l1` 键                                                  |
| L2（RULES.md/REFS.md）                                     | 不在本批（spec 明写留后续） | —                                                                                |

**剩余欠腿**: 六平台 L1 形态的真机读测（U10 已给三档结论，落地后的真机复测归 U-8/FR-5/FR-6 探针欠账，同上并入 W-5）。

---

## 3. D33 用户盘迁移路径 · 一个真实缺口 ＋ 补丁设计

### 3.1 已安全的面（核实过，无需动作）

| 面            | 结论                                                                                                                                                                                  | 依据                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| lock 形状     | **未变**——`PackLockSchema` 仍 `z.literal(1)`（`schemas/pack.ts:348`）。N3/N4 都不触 lock；D25 改 marker 串也不改 lock 形状（lock 存哈希不存串）；D32 段级标记若加 lock 字段才需要再议 | 实测                   |
| 旧项目 verify | D25/D32 落地后，旧项目 disk↔lock 仍逐字节一致 ⇒ verify 判 **CONSISTENT**（STALE_LOCK 只在服务端有更新导出时出现且为纯信息态，`verify.ts:123`）——**不误报**                            | `verify.ts:100-133` 读 |
| 升级路径      | 用户 `sync` 升级时走既有 DRIFT/备份流程，无需 `migrate` 命令——分析文 4-3 的「`openvibe migrate` **或** verify 兼容读」取后者，本仓现状已满足 lock 侧                                  | 设计判断               |

### 3.2 GAP-1（真实 bug，并行会话未提交面）：v1 manifest 过闸后被 schema 拒

**复算链**: `apps/cli/src/pack-source.ts:130-144` 的版本闸以 `value > supported` 判超前——注释明写「`<` 兼容（design §7：旧版可读）」；但紧接着 `verifyPack`（`:156-159`）跑 `PackManifestSchema.safeParse`，而 `schemaVersion: z.literal(SCHEMA_VERSION)`＝literal(2) ⇒ **schemaVersion=1 的旧导出包在闸上通过、在 schema 上被拒**。「旧版可读」目前是**注释意图，不是实现事实**。这正是 D33/4-3 在 **manifest 侧**的兼容读缺口：窗口前导出的 bundle/目录包（v1）新 CLI 装不进。

**补丁设计**（最小面，不触 golden——golden 的 manifest 全是 v2）:

```
PackManifestSchema.schemaVersion: z.literal(SCHEMA_VERSION)
  → z.union([z.literal(1), z.literal(2)])
```

- v1 的语义＝「hooks/l1 两字段缺省」——两字段本就 `.optional()`，union 后**其余形状零分叉**（constants 头注「旧包按可选字段兼容」正是这个语义）。
- 需同批一支「v1 旧包可读」测试（v1 manifest → verifyPack 通过 → hooks 视为空集 / l1 按 L1_DEFAULT）。
- `pack-source.ts` 的闸注释从「`<` 兼容」保持不变（union 后才真正成立）。

**处置纪律**: 该缺口在并行会话的未提交面内（schemas/pack.ts 与 pack-source.ts 均为其在编文件），本笔**只登记不代改**——由其 DEV-0276 补笔同批修，或 owner 指派。

### 3.3 GAP-2（登记债）：DEV-0276 条目缺失

见 §0 连带修正二。补笔责任在并行会话；本笔 DEV-0281 跳过 0276 号不变。

---

## 4. 重算后的 W-2 剩余面（给 owner 的更新清单）

1. **③-a**: D25 落地笔范围（只改冻结串 / 连发布名一起改）——未裁。
2. **③-b**: 签字方式（逐条签＋两名无上下文 reviewer）——未裁。
3. **D25 落地笔**（改串 ＋ 11 golden 重基 ＋ 四支逐字测试）→ ③-a 后可开工。
4. **D32 段级标记**（签字 ＋ 实现 ＋ golden 后半重基）→ owner 签字后开工；签字时 4-2 项记「已由 ㊼ 兑现」。
5. **GAP-1 补丁**（v1 manifest 兼容读）——不触 golden，可与 D25/D32 同笔或独立先行。
6. **双 reviewer 独立复核**——窗口后半的 A 级链第三环。
