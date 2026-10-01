# SPEC · M2 Skill 分发（多平台落盘：copy / symlink）

| 项 | 值 |
|------|------|
| 模块 | M2 Skill 中心 —— 分发半边（登记半边见 `m2-skill-registry.md`） |
| 优先级 | **口径矛盾，待 owner 裁**：`PRD §3.2-M2` 功能表与 `PRD §4 依赖表`（「Skill 分发(M2, **P1**) 经 adapter 写各平台目录」）标 P1，而 `PRD 第 8 章` 的 P2 行把「M2 完整（源导入+**多平台分发**）」排进 P2 —— 与 D22 修掉的 M4 三处冲突同形（见 dev-plan §15.1-9 的教训），本文件不替 owner 选边 |
| 上游 | `PRD §3.2-M2`「多平台分发」、`PRD §4` 依赖表 Skill 分布行 |
| 下游设计 | `design.md §8`（adapter 清单与 `COMPAT_MATRIX`）、`design.md` 的 windsurf 行（该 adapter「随 M2 完整版 skill 分发一起交付」⇒ **windsurf adapter 至今不存在**，实测 `ls packages/adapters/src/` 无 windsurf 文件） |
| 关联任务 | 无（尚未申请任务号；按 §0.4，本文件 §8.2 六处待裁闭合前不得进迭代版） |
| 版本 | **v0.9 草案（2026-10-01，DEV-0075 新建）**。非 v1.0：§8.2 六处「待裁」未闭合，按 dev-plan §0.4 第 1/3/4 条**不构成开工依据**。本文件此刻的用途是「把这条被标了三次不同优先级的功能，钉成一份能判 pass/fail 的边界」，不是任务卡 |

---

## 1. 目标与用户价值

台账（`m2-skill-registry.md` FR-1~FR-7）解决的是「我机器上有哪些 skill、远端变了没」；本文件解决下一步：**把一条台账条目真正放到某个编码工具会读它的目录里**。今天这一步只能人工 `cp -r`，且做完之后没有任何地方记着「谁在什么时候把哪个指纹放到了哪」——于是重扫时它变成一条**新条目**（同一个 skill 因为多了一个副本被记两次，正是 FR-6 整理报告里 `sameContent[]` 那一类的生产者）。

价值判据只有一条：**分发一次之后，用户不必再手动搬目录，且随时能撤销**。做不到撤销的分发不算交付。

## 2. 范围

| In（本文件） | Out（明确不做，去处写明） |
|---|---|
| 把**本机已有内容**的 skill（`skillDir` 非空）复制进目标平台的 skill 根 | 远程条目（`skillDir=null`）的分发 ⇒ 要先下载，属 §8.2-⑥ 待裁，未裁前**接口拒绝** |
| copy 双模式之一：**整目录复制**（默认，跨平台无特权依赖） | 块级合并、单文件挑选（一个 skill 是最小分发单位） |
| symlink 模式：作为**可选**且带 win32 降级（见 §6.2） | 跨机器分发（无网络协议；多机 = 每台各装一个 OpenVibe，与 M7 团队共享撞面，见 `m7-team-collab.md` §3 P-1） |
| 分发台账：目标路径 + 内容指纹 + 模式 + 时间，落库 | 自动定时同步远端更新到已分发副本（`m2-skill-registry.md` §2 Out 已把「订阅式提醒」排除，同源） |
| 撤销分发（按台账删自己放下的目录，三条件闸，见 FR-5） | 删除「不是我放的」同名目录（那是 FR-6 整理报告的只读判读域） |
| 冲突判定：目标已有同名不同内容 → **只报不覆盖** | 冲突变体 UI 与 `name (2)` 变体管理（`m2-skill-registry.md` §6.1.5 已判为 P2 余下能力） |

## 3. 数据与核心概念

**读写同根**是本文件全部安全性的支点：扫描侧 FR-1.1 的自动发现集（home 下 `~/.<tool>/skills` 形态目录、`.Trash` 排除、ZCode 插件 `installPath`、`$CWD/.claude/skills`）**同时充当写入白名单**。不是「先定一份平台清单再各自映射」，而是「凡本机被识别为 skill 根的目录，才是合法落点」——因此：

- 新工具零代码即可覆盖（与 `COMPAT_MATRIX` 的「新增平台只加一行」同思路，`packages/adapters/src/compat.ts:1-13`）；
- 落点集合由磁盘实况决定，用户删了某工具则该工具自动不可分发，不会写出孤儿目录；
- 分发后重扫必然命中同一条目（同一 name 同一 `dirHash` → FR-1.4 的 skipped 分支），这是 FR-8 幂等闸成立的原因。

```
SkillInstall {                      // 新表，迁移号续 0006 之后取空号
  id, skillId,                      // 挂 skills 主档
  platform: string,                 // 稳定 slug：claude-code / qoder / trae / codebuddy / minicode / …
  targetDir: string,                // 绝对路径，必须是「已识别的 skill 根」之下的一级 <root>/<name>
  mode: "copy" | "symlink",
  dirHash: string,                  // 落盘时**实际读到磁盘**的内容指纹（FR-1.3 同公式），不是台账里的期望值
  status: "live" | "stale" | "removed",   // stale = 目录消失或指纹已变（被用户改过），不主动删
  installedAt, updatedAt
}
```

`installedTargets`（`packages/shared/src/schemas/skill.ts:9`，当前是 `z.array(z.string())` 的自由文本标记，且 `SkillsRepo.update` 只开放 `description` 与 `installedTargets` 两个可改字段，`packages/core/src/repos/skills.ts:456`）**不动、不迁移、不升版**：它是人写的备注，本文件另起一张表当机器事实源。两者混用是 §15.5-6「同名异物」的老坑——UI 上若同屏出现，必须以「备注（人工）/ 已装位置（本机实测）」分列，不得互相回写（这条是 FR-4 的全部内容，见 §8.2-③ 为何不合并）。

## 4. 功能需求（FR）

### FR-1 落点选择
1. 目标平台集合 = 扫描侧同一自动发现集推出的「skill 根」列表（含每个根的 `platform` slug 与是否存在）。**无根即无平台可选**，空列表是正常态不是错误。
2. 一次操作可多选平台；每个平台落到该平台的 `<root>/<skill-name>` 一级子目录。名字取 `skill.name`，按 FR-1.3 的目录名安全化（只允许小写字母/数字/连字符，与 `m2-skill-registry.md` FR-6.2 的 `nameAnomalies` 判据同一套正则）；不安全 → **拒绝并提示改名**，不做静默转写。
3. 解析出的 `targetDir` 必须仍落在所选 root 之内（`resolve` 后前缀校验）；任一 `..` 段、绝对化逃逸、或解析到 `~/.openvibe` 内部路径 → 422 拒绝，整批不写。

### FR-2 copy 落盘
1. 逐文件写，目录内文件集合与源一致；忽略项沿用 FR-1.3 的 `.DS_Store` / `node_modules/`，防止把噪声复制过去再被判成不同指纹。
2. **写完回读**：对 `targetDir` 现算一次 `dirHash` 存进 `SkillInstall.dirHash`。落账的永远是「磁盘上实际是什么」，不是「我以为写了什么」。这是 §6.1 全部判读的前提。
3. 写失败（权限、磁盘满、根变成文件）→ 该目标记 `failed` + `note`，**其余目标继续**（与 `remote/check-updates` 的逐条失败语义一致，不拖垮整批）。
4. 部分写入不得留下半套：先写临时目录再原子改名（复用 `packages/core/src/inject/atomic-write.ts` 的既有原子写语义，不新发明一套）。

### FR-3 symlink 模式（可选）
1. 语义：`<root>/<name>` 是指向 `skill.skillDir` 的符号链接，源改即所有平台同时生效，`dirHash` 回读时跟随链接算（与扫描侧同值）。
2. win32 降级：创建符号链接需要额外特权，失败时**不静默退回 copy**，而是记 `failed` + `note` 说明「需要开发者模式或改用 copy」。静默降级会让用户以为自己在用联动模式——那是一致性假象，比失败更难查。
3. 环与既有链接：`targetDir` 已存在且是符号链接 → 走 FR-6 冲突判定（内容不等就不动），**绝不顺着链接往它的目标里写**。

### FR-4 台账回填
1. 每次分发/撤销写 `SkillInstall` 行，`GET /api/skills/:id` 与列表页返回 `installs[]`（只回显，不参与任何判定）。
2. `installedTargets` 自由文本**保持只由人写**。分发不写它、撤销不删它。
3. 扫描（FR-1）遇到某目录恰是某条 live `SkillInstall.targetDir` 且 `dirHash` 相等 → 扫描报告里注明「本目录来自分发」，但归并逻辑不变（仍按 name + 指纹走 skipped）。

### FR-5 撤销（本文件唯一的删除分支）
1. 候选 = `status=live` 且 `targetDir` 存在。判据三条件**全满足才删**，缺一即 `stale` 并保留：① 该行是我方台账登记；② `targetDir` 仍在所选 root 之内（同 FR-1.3）；③ 磁盘现算 `dirHash` 与该行登记值相等。
2. ③ 不可省：`m6-cli-injection.md` §6.2 的 DEV-0059 教训是「lock 登记 且 磁盘 == 期望」两条都要在，少一条就会把用户自己的目录当我方产物删掉；符号链接模式下磁盘 == 期望更是「用户没换过目标」的唯一证据。
3. 默认 dry-run 给清单，带 `--yes`/显式确认才落删除；符号链接只删链接本身，不递归目标（与 `inject/security.ts` 的符号链接逃逸防线同一意图）。

### FR-6 冲突
1. `targetDir` 已存在：目录内 `dirHash` 与待分发内容**相等** → 视为已分发，幂等记 live（不重复写盘）；**不等** → 报 `conflict`，什么都不写。
2. 不做「以谁为准」的选择，也不生成变体（分别属 M6 双向同步与 `name (2)` 变体管理两块地盘，见 §2 Out）。

### FR-7 入口
1. Web：`/skills` 详情页「分发到…」对话框（选平台 + 模式 + 结果清单 + 撤销入口），与既有四个对话框同构。
2. CLI：`openvibe skill install <name> --platform <slug>[,<slug>…] [--mode copy|symlink] [--dry-run]` 与 `openvibe skill uninstall <name> [--platform …] [--yes]`。远程取数类动作在 spec 里被判为 Web-only（`m2-skill-registry.md` §5），**分发不是**：它的对象是项目/家目录文件系统，与 `sync` 同侧，故给 CLI。

### FR-8 幂等闭环（本功能的自检）
1. 分发 → 立即重扫 → `created=0` 且 `discovered` 含该目录。做不到就是读写指纹公式不同一，属回归红线。
2. 分发 → 撤销 → 重扫 → 该目录不再被 `discovered`，台账条目仍在（撤销只删盘，不删账）。

## 5. 输入 / 输出

- **API**：`GET /api/skills/install-targets`（可选平台与根）、`POST /api/skills/:id/install`（body `{platforms[], mode}`）、`POST /api/skills/:id/uninstall`（body `{platforms?, dryRun?}`）。静态段先于 `:id` 匹配的既有规矩沿用（find-my-way 优先级，见 `m2-skill-registry.md` §5）。
- **CLI**：FR-7.2 两条子命令。
- **库**：新表一张（`SkillInstall`）+ 迁移一支；`skills` 主档零改动 ⇒ 无 A 级契约变更（判据见 §8）。
- **对下游**：`m2-skill-registry.md` FR-6 的 `sameContent[]` 应能把「同源多平台副本」判为一组并说明来源，这是分发做得对的旁证。

## 6. 边界与异常

### 6.1 一致性
1. 分发后用户手改某平台副本内容 → 该副本 `dirHash` 与台账不等 ⇒ 下次撤销判 `stale` **保留不删**，重扫则按 FR-1.4 追加一条新版本（同名不同指纹）。两条都不报错，但方向不同：撤销保守、扫描记账。**不新增「检测到你改过」的提示**属已知欠账，登记在 §8.2-⑤ 名下（要它就得存期望哈希并每次回读，代价与 §6.1.4 同源）。
2. 删除台账里的 skill 主档 → `SkillInstall` 级联删行，但**磁盘副本一律不动**（删账不等于删盘，避免用户在 UI 里点删除就毁掉真实工作目录）。
3. root 本身被删（工具卸载了）→ 该行 `status=stale`，列表给「目录已消失」，不尝试重建父目录。
4. symlink 模式下源 `skillDir` 被移走 → 链接悬空：重扫时该目录无 `SKILL.md` 可读 → 走扫描侧既有 warning，撤销时按 FR-5 的③ 判不相等 → 保留。悬空链接的**主动清理**未做（判据不足：无法证明它是我方留下的）。

### 6.2 平台与特权
1. win32：`copy` 为默认且唯一无特权路径；`symlink` 失败按 FR-3.2 显式报。三平台矩阵下 win32 的符号链接相关分支**必须有具名 skip 腿并被计进未验证面**（先例：`clean` 族的 `06e`，`it.skipIf(IS_WINDOWS)` ⇒ 跳过 ≠ 通过，见 dev-plan §15.6 DoD ③）。
2. 路径分隔符、大小写不敏感文件系统（macOS 默认卷 + NTFS）：`<root>/<name>` 在同一 root 内**大小写同名视为冲突**，不做大小写敏感假设。
3. 只写 skill 根之下的一级目录；不写项目仓库（那是 M6 `sync` 的地盘）；不写 `~/.openvibe`。

## 7. 验收标准（pass/fail）

> 支数不入正文（dev-plan §13-8/§13-9）。每条给测试文件 + 具名族；取数命令：`grep -oE "IT-DIST-[0-9]+" <文件> | sort -u`。跑法 `pnpm vitest --project <unit|integration> --run <文件>`，本机与并行会话共存时**必须**串行复跑取数（`--no-file-parallelism`；凭据：DEV-0074 记录的「并行负载下全量 test 假红」）。

1. 新夹具 skill 分发到 2 个假根 → 两目录内容齐、`SkillInstall` 两行 live、`dirHash` 与源同值。—— `IT-DIST-01`（integration，`apps/server/test/skill-install.api.test.ts`）
2. **幂等（FR-8.1）**：分发 → 重扫 → `created=0`；断言写的是「同指纹必走 skipped」而非「目录数不变」。—— `IT-DIST-02`
3. 冲突（FR-6）：目标已有同名不同内容 → `conflict`、磁盘前后字节序列相等、台账不新增 live 行。—— `IT-DIST-03`
4. 撤销三闸（FR-5.1）：分别造「无台账行」「targetDir 逃出 root」「磁盘指纹已变」三种负例，各自**不删**且状态 `stale`；正例（三条件全满足）才删。—— `CORE-DIST-01..03` + `UT-DIST-GATE-01`
5. 撤销只删链接不删目标（FR-3.3/FR-5.3）：symlink 模式下撤销后源目录仍在且指纹未变。—— `IT-DIST-04`
6. dry-run 默认（FR-5.3）：不带 `--yes` 时零删除、返回清单。—— `IT-DIST-05`
7. 名字安全化拒绝（FR-1.2）：`"My Skill"` / `a/b` / `..x` 三种形态各 422 且不产生任何目录。—— `UT-DIST-NAME-01`
8. 远程条目拒绝（§2 Out）：`skillDir=null` 的条目请求分发 → 422 并说明需先落地内容。—— `IT-DIST-06`
9. 部分失败隔离（FR-2.3）：注入一个 root 不可写 → 该目标 `failed`、另一目标成功、整批不抛。—— `IT-DIST-07`
10. win32 符号链接降级（FR-3.2）：mock `symlinkSync` 抛 EPERM → `failed` + note 含「copy」建议，**且断言未静默退化成 copy**（断目标录里那一行不存在）。—— `UT-DIST-SYM-01`（win32 真机腿另计，跳过须进未验证面）
11. 删主档不删盘（§6.1.2）：DELETE skill 后磁盘副本仍在、`SkillInstall` 行已清。—— `IT-DIST-08`
12. **未验证面（明写）**：`/skills` 分发对话框无 DOM 断言、无浏览器走查归档（与 `m2-skill-registry.md` §7.14 同一形态的欠账）；win32 符号链接真机路径、macOS 大小写不敏感卷上的冲突判定，均需标注为未验证而非通过。

## 8. 依赖

- 依赖：`m2-skill-registry.md` FR-1.3 的 `dirHash` 公式（唯一指纹源，别写第二套）、FR-1.1 的根发现集（唯一落点源）、`packages/core/src/inject/atomic-write.ts`、扫描与归并核心 `recordVersion`。
- 被依赖：无。M6 组包只消费台账，不消费 `SkillInstall`。
- **级别判定**：本文件落地是**新表 + 新端点 + 新 CLI 子命令**，不触 `design §7`（包/lock 契约）与 `design §8`（adapter 产物路径）⇒ 按 dev-plan §0.3 属 **B 级**（规格新建）。**例外**：若 owner 选择「合并 `installedTargets` 与 `SkillInstall`」（§8.2-③），那是既有 `skills` 表字段形状改变 ⇒ 需 `schemaVersion +1` 走 A 级流程。

### 8.2 待裁（六处，未闭合前 v0.9 不得升 v1.0）

| # | 待裁 | 为什么不替 owner 定 |
|---|---|---|
| ① | 平台清单与**路径证据** | PRD:145 点名 7 家（Claude Code / Cursor / Windsurf / Codex / CodeBuddy / Trae / MiniCode），但 `~/.<tool>/skills` 只是扫描侧的**约定发现**，不等于该工具真去那儿读 skill。design §8 的规矩是「必须有证据才加行」（windsurf 那行至今是 P1 待交付、`packages/adapters/src/` 无对应文件）。逐家取证前不写清单 |
| ② | symlink 是否进 MVP 首轮 | PRD 的风险表明写「MVP 不引入 symlink 依赖」，而 PRD:145 又把「symlink / copy 双模式」标 P1 —— 两处互斥。本文件把 symlink 写成可选+显式失败，是**中性处理**，不是裁定 |
| ③ | `installedTargets` 与 `SkillInstall` 的关系 | 本文件默认「备注归人、位置归机器，互不回写」。若 owner 要合并成一个字段，即 §8 的 A 级例外 |
| ④ | 远程条目（`skillDir=null`）要不要能分发 | 需先按 `remoteRef` 下载内容再落盘 = 把 FR-4 的取数与 FR-2 的写盘串起来，会引入「分发即下载」的隐式网络动作。当前 Out |
| ⑤ | 是否给「目标副本已被用户改动」的提示 | 要给就得每次回读全部副本算指纹，与扫描成本同量级；不做则 §6.1.1 的行为对用户不可见 |
| ⑥ | 撤销归本模块还是并入 `openvibe clean` | `clean` 现在是「项目目录内、按 pack lock 退场」（`m6-cli-injection.md` §6.2 明写其边界），本文件是「家目录内、按 SkillInstall 台账撤销」。同闸不同域，合并会让 clean 的删除面跨越项目边界——DEV-0059 那类误删风险的直接放大，故默认分立 |
