# SPEC · M2 Skill 中心（瘦身版：扫描 + 登记）

| 项 | 值 |
|------|------|
| 模块 | M2 Skill 中心 |
| 优先级 | P0（瘦身，2026-09-21 已交付）→ P2 完整版：**生态导入 / 检查更新 / 重复整理 / 内置审查已落地（2026-09-30）**；多平台分发（symlink/copy）与冲突变体 UI 仍未做 |
| 上游 | PRD 3.2-M2、proposal §3.1 |
| 下游设计 | design.md §5、§8（adapter 清单） |
| 关联任务 | tasks.md T5（随 M5 周期实现，量小）；P2 完整版纳 dev-plan §15 的 P2 队列，实现登记 `DEV-0063/0066/0067/0068/0069` |
| 版本 | v1.0（2026-09-20 定稿，adapter 清单随 G3 冻结）· 未修订；本行为 2026-09-23 按 §0.3 补写的痕迹基线 → v1.1（2026-09-30，P2 完整版进场：**新增 FR-4 生态源导入 / FR-5 检查更新与补档 / FR-6 重复整理 / FR-7 内置审查**；FR-1.1 默认扫描根按实况改判、FR-1.5 报告增两键、FR-3.1 的「LIKE 即可」改判为服务端内存过滤；§6 拆为 6.1（本地，逐条按实况校正：256 KB 截断**未实现**、符号链接环实测抛 `ELOOP`、子文件不可读会整批抛出）与 6.2（出站，v1.1 新写），并修一处自相矛盾（原 §6.5「`name (2)` 新建独立条目」与原 §7.4「同名并入版本线」互斥，实况为后者）；§7.1 的判据由 `parseWarning` 标记改为警告文案子串，并新增 6–14 条（含「未验证面」一条）。落地面见 DEV-0063/0066/0067/0068/0069，**本段是补齐 §0.3 B 级 ②③ 的文档笔，不含产品代码改动**。**编号现取实况**：ZCode 插件根那波的记录是 `DEV-0066`，而 `packages/core/src/repos/skills.ts` / `skills.test.ts` 的注释写作 `DEV-0064`——该号在 `DEV_LOG.md` 全仓 grep 不存在（现测 `grep -c '^## \[DEV-0064\]' DEV_LOG.md` → 0），注释已随本笔改正） |

---

## 1. 目标与用户价值

让用户**先把自己机器上已有的 skill 看清楚**：扫出散落在 `~/.claude/skills` 等目录的 SKILL.md，登记成带版本和指纹的清单，供标准包引用（生成 SKILLS.md 素材）。分发与安装能力 P1 再上——MVP 只做「台账」。

P2 完整版把台账从「本机」扩到「生态 + 本机」：GitHub 仓库 / SkillHub 两个源可直接建档，远程条目能廉价地判「远端变了没」，台账里积攒的重复与失效条目有一键体检，SKILL.md 的规范问题与泄漏面（凭据串、家目录绝对路径）在导入时就被查一遍。**仍然不做分发**——本模块写的永远是「登记与判读」，落盘到多个平台的 symlink/copy 不在范围内（PRD 第 8 章 P2 行的另一半）。

## 2. 范围

| In（MVP，2026-09-21 交付） | In（P2 完整版，2026-09-30 落地） | Out（仍未做 → P2 余下半 / P3） |
|-----------|-------------------|-------------------|
| 扫描本地 skill 目录自动发现（Web 按钮 + CLI 两条入口） | GitHub 仓库 / SkillHub 生态源浏览与建档（**只建档，不装到平台**） | symlink/copy 多平台分发 |
| 手动登记（名字/描述/来源/路径） | 检查更新（树指纹对比，零内容下载）+ 存量条目补档 | 冲突变体 UI、自动定时检查更新（订阅式提醒） |
| 重扫比对 SHA-256，同名新指纹 → 记为新版本 | 重复整理报告（同内容不同名 / 失效目录 / 名称异常） | 跨源自动合并同名以外的近义条目（属冲突变体管理） |
| CRUD、进入标准包 manifest（skills 清单素材） | 内置审查（SKILL.md 规范 + 泄漏面：凭据串、家目录路径） | **安全扫描**（执行语义、恶意行为分析）——FR-7 只做静态字符串与元数据判读，**不要把它读作安全扫描已交付** |

## 3. 数据与核心概念

```
Skill {
  id: "sk_<nanoid>",
  name: string,               // 必填；扫描时取 SKILL.md frontmatter.name（剥 YAML 引号），缺省用目录名
                              // name 是台账的唯一归并键（同名恒并版本线，不新建条目，见 §6.5）
  description: string,        // frontmatter.description，可编辑
  source: "local" | "manual" | "github" | "skillhub",   // 四值，0004 迁移放宽 CHECK
  skillDir: string | null,    // 本地绝对路径；local 源必填；远程条目无本地目录 → null
  latestVersionId: id,
  installedTargets: string[], // 手工维护的文本标记（如 "claude-code@macbook"），不自动检测
  remoteRef: string | null,   // 溯源 key：`github:owner/repo@branch[:path]` / `skillhub:slug`
                              // 本地/手动条目为 null；DEV-0067 时代存量远程条目也为 null（走 FR-5.4 补档）
  remoteTreeHash: string | null, // 树级指纹（内容无关，见 FR-5.1），检查更新的对比基线
  createdAt / updatedAt
}
SkillVersion { id, skillId, versionLabel(扫描取目录名；远程取溯源串 `owner/repo@branch`、
                              `slug@version`；手动无则 "v1"),
               dirHash(文件内容指纹，算法见 FR-1.3；手动首版本无指纹=空串),
               fileCount, scannedAt }
```

两类指纹**不是同一个东西**，这是 FR-5 能做「零内容下载对比」的前提：

- `dirHash` = 文件**内容**的指纹（逐文件 sha256），本地扫描与远程导入用**同一公式**（远程侧由 `hashSkillEntries` 复用），故同名条目跨源可判重。
- `remoteTreeHash` = 远端**树**的指纹（相对路径 + git blob sha / 清单 sha256），不必下载内容即可算，只挂在 `skills` 主档上（不随版本线走）。

## 4. 功能需求（FR）

### FR-1 扫描发现
1. 扫描根集合（**FR-1.1 于 v1.1 按实况改判**，DEV-0063/0066）：显式传入 `roots` 时只用传入集合（**空数组即不扫，不回落默认**）；缺省时取「存在即扫」的自动发现集 = home 下**一切** `~/.<tool>/skills` 形态目录（claude / qoder / trae / codebuddy / workbuddy / openclaw 系等，按约定发现而非硬编码工具清单，故新工具无需改代码即覆盖；`.Trash` 排除）+ ZCode 已装插件的 skill 根（`~/.zcode/cli/plugins/installed_plugins.json` 逐插件 `installPath`，兼容 `skills/` 与 `payload/skills/` 两种布局；清单未钉版本的缓存插件**只取最高版本**，防陈旧内容污染版本线）+ `$CWD/.claude/skills`。仅根的第一层子目录内含 `SKILL.md` 者为 skill。UI 入口在 `/skills` 页的自定义目录输入（v1.0 原文写「设置页可增删」，位置是错的）。
2. 解析 SKILL.md YAML frontmatter 的 `name`/`description`（容错：frontmatter 缺失/非法 → name=目录名，description=空，并往 `warnings` 追加一条 `SKILL.md frontmatter 缺失/非法，name 回退目录名: <name>`；**v1.1 改判**：判据是这条警告文案，v1.0 写的 `parseWarning` 标记位从未存在）。frontmatter 的 name 剥 YAML 引号（`"my skill"` → `my skill`，DEV-0067）。
3. 目录指纹 `dirHash`：对目录内全部文件按相对路径排序，逐文件 sha256，拼接 `${relPath}:${fileHash}\n` 后整体 sha256。忽略 `.DS_Store`、`node_modules/`。**同一公式由 `hashSkillEntries` 复用到远程侧**（FR-4），跨源可比。
4. 同 `name` 且 `dirHash` 未变 → 跳过（并刷新描述/目录/远程追踪等信息字段，空值不回写已有值）；`name` 已存在但指纹变化 → 追加 SkillVersion 并更新 latestVersionId；新 name → 新建 Skill + 首版本。
5. 扫描结果返回报告：`{ discovered, created, updated, skipped, warnings[], scannedRoots[], missingRoots[] }`（后两键 v1.1 加入，DEV-0063：实际枚举到的根 / 显式传入但缺失的根），UI 以摘要条呈现，报告弹层给可折叠的「本次扫描目录 N 个」清单，缺失根以警示色同列。

### FR-2 手动登记
1. 表单：name*、description、source=manual、installedTargets（逗号分隔）。
2. 手动条目无指纹；后续若扫描到同名目录 → 视为该 skill 的 local 版本并入（追加 SkillVersion，source 保持 manual 主档）。

### FR-3 维护
1. 列表：按 name 排序，显示来源、版本数、最近扫描时间；搜索框按 name/description 过滤（**FR-3.1 于 v1.1 按实况改判**：量小，过滤在服务端**内存**做、大小写不敏感，v1.0 写的「LIKE 即可」从未落 SQL）。
2. 编辑 description/installedTargets；删除需确认（级联版本）。

### FR-4 生态源导入（v1.1 新增，DEV-0067/0068）
1. 两个源，均为**建档**语义（写台账，不往任何平台落盘）：
   - **GitHub**：入参 `repo`（`owner/repo`，也接受完整仓库 URL，服务端归一；`.git` 后缀剥除）+ 可选 `ref`（缺省=仓库默认分支，即最新）+ 可选 `path`（只导该子目录）。git trees 一次拿全路径，**任意层级**下含 `SKILL.md` 的目录都算一个 skill；内容逐文件走 `raw.githubusercontent.com`。
   - **SkillHub**（skillhub.cn）：入参 `slug`；`/api/v1/skills/{slug}` 给详情与最新版本号，`/files` 给文件清单且**自带每个文件的 sha256**，`/file?path=` 302 到对象存储。
2. 搜索：`POST /api/skills/remote/search` **仅 skillhub 源**（其他 source 值 → 422 `VALIDATION_ERROR`），返回 `{ items[{slug,name,description,version,downloads,stars,updatedAt}], total }`，一次最多 10 条。
3. 指纹与本地同公式（FR-1.3）：GitHub 用逐文件内容 sha256 聚合，SkillHub 直接用清单里的 sha256——**同一套文件在两个源得到同一个 `dirHash`**，这是跨源去重的前提。
4. 落账复用 name-keyed 的 `recordVersion`（与扫描同一核心）：新 name 建账、同指纹跳过、指纹变化追加版本；远程条目 `skillDir=null`，溯源串进 `versionLabel`，并写 `remoteRef`/`remoteTreeHash`（DEV-0068 起）。同名本地条目已在台账 → 并入其版本线，**不覆盖已有 `skillDir`**（`COALESCE` 语义）。
5. 导入报告：`{ source, origin, discovered, created, updated, skipped, warnings[] }`，`origin` 是本次溯源串（`owner/repo@ref` 或 `skillhub.cn/skills/{slug}@{version}`）。
6. 防失控上限（超出即截断并记 warning，不整批失败）：单仓库 ≤50 个 skill、单 skill ≤40 个文件、单文件 ≤400 KB、搜索 ≤10 条、单请求超时 15 s。

### FR-5 检查更新与补档（v1.1 新增，DEV-0068/0069）
1. **树指纹**（内容无关，`remoteTreeHash`）：相对路径排序后拼 `${rel}:${树内对象哈希}\n` 取整体 sha256。GitHub 侧的哈希是 **git blob sha**（内容寻址，同内容恒同值），故**整仓一次 trees 调用**就能对比 N 个 skill，零内容下载；SkillHub 侧用清单 `sha256`，与本地公式同值。
2. `POST /api/skills/remote/check-updates`（body `{ids?}`，缺省 = 全部 `source∈{github,skillhub}` 条目）→ 逐项四态：
   - `upToDate`：树指纹一致；
   - `remoteChanged`：不一致。UI 给「一键重导」——用 `remoteRef` 自带的 `owner/repo@branch[:path]` / `slug` 回到 FR-4 的导入端点，落账后指纹刷新；
   - `notTracked`：DEV-0067 时代的存量条目没有 `remoteRef`，无法廉价对比，走 FR-5.4 补档；
   - `checkFailed`：远端不可达/响应异常，带 `note` 说明原因（单条失败不影响其余条目判定）。
3. 汇总 `{ items[], summary{upToDate, remoteChanged, notTracked, checkFailed} }`。**不做自动定时检查**（属 §2 Out 的订阅式提醒）。
4. 补档 `POST /api/skills/remote/retrack`（body `{ids?}`）：对 `remoteRef` 为 null 的远程条目，从其版本线 `versionLabel` 里的溯源串反推重导一次并写两列；报告 `{ items[{skillId,name,status:retracked|failed,note?}], summary }`，**溯源串不可解析或远端失败都逐条报，不中断整批**。

### FR-6 重复整理（v1.1 新增，DEV-0067）
1. `GET /api/skills/duplicates` 是**只报告不删**的体检：删除动作仍由客户端按 id 走 FR-3.2 的既有 DELETE（逐条人工确认，避免批量误删）。
2. 三类判据：
   - `sameContent[]`：最新版本 `dirHash` **相同且非空**的多个条目归一组（带 `dirHash`/`fileCount`/成员列表）——同名已被扫描去重消化掉，剩下的正是「同内容不同名」与跨源副本；手动条目无指纹（空串）**不参与归组**；
   - `stale[]`：`source=local` 且 `skillDir` 在磁盘上已消失（目录被删/移动）；
   - `nameAnomalies[]`：名称带引号残留或不符合小写字母/数字/连字符 ≤64 的约定（带 `issue` 说明），删除后重扫即归一。

### FR-7 内置审查（v1.1 新增，DEV-0067）
1. `POST /api/skills/review`（body `{ids?}`，缺省=全量）→ 逐条 `{ skillId, name, level, issues[] }` + `summary{ok,info,warn,fail}`；`level` 取该条最重 issue 档位，无问题为 `ok`。
2. 判据分三面，每条 issue 带 `severity`（info/warn/fail）与稳定 `code`：
   - 规范面：`name-quoted`(fail) / `name-convention`(warn) / `description-empty`(fail) / `description-long`(warn，>1024 字符) / `frontmatter-missing`(warn)；
   - 质量面：`description-no-trigger`(info，无「当用户…/Use when…」类触发条件) / `body-empty`(warn，正文 <30 字符) / `body-huge`(warn，正文 >65536 字符)；
   - 泄漏面：`possible-secret`(fail，命中 `sk-`/`ghp_`/`AKIA`/`xox[baprs]-` 样串) / `leaks-user-path`(warn，正文含 `/Users/<用户>/` 家目录路径) / `private-ip-literal`(info，内网/环回 IP 字面量)。
3. **围栏代码块（```` ``` ````）内的路径与 IP 不算**——那多是示例高发误报区，判读只看围栏外的正文；凭据样串则全文匹配（真凭据也常写在示例里）。
4. 无本地目录的条目（远程导入或目录已失效）只做元数据审查，并给一条 `review-metadata-only`(info) 说明覆盖面。
5. 与 §2 Out 的「安全扫描」界限：FR-7 是**纯静态字符串与元数据判读**（无 IO、不执行、不解压、不追踪行为），命中 `possible-secret` 只是提示泄漏面，不构成任何恶意性判定。

## 5. 输入 / 输出

- **API（本地台账，v1.0）**：`POST /api/skills/scan`（body 可带 `roots` 覆盖默认，空数组即不扫）、`GET/POST /api/skills`、`PATCH/DELETE /api/skills/:id`、`GET /api/skills/:id/versions`。
- **API（P2 完整版，v1.1 新增）**：`POST /api/skills/remote/search`、`POST /api/skills/remote/import`、`POST /api/skills/remote/check-updates`、`POST /api/skills/remote/retrack`、`GET /api/skills/duplicates`、`POST /api/skills/review`。静态段（`scan`/`remote/*`/`duplicates`/`review`）先于 `:id` 匹配（find-my-way 优先级），故 `GET /api/skills/duplicates` 不会被 `:id` 吞掉。
- **CLI 入口**：`openvibe scan --skills`（specs/m6b FR-3），与 Web 按钮打同一 API；DEV-0063 起报告 hint 另起两条「扫描根 N 个 / 缺失根 M 个」。**远程导入、检查更新、整理、审查为 Web-only**（CLI 无对应子命令，属明确取舍不是遗漏：这四件事的动作对象是台账本身，不在项目目录里发生）。
- **UI**：`/skills` 页五个入口——远程获取 / 检查更新 / 重复整理 / 内置审查 / 手动登记，各对应 `SkillRemoteDialog`、`SkillUpdateDialog`、`SkillCleanupDialog`、`SkillReviewDialog`；扫描报告弹层含可折叠根清单。
- **对下游输出**：M6 组包候选（skills 清单 → SKILLS.md）。

## 6. 边界与异常

### 6.1 本地扫描（v1.0 五条的实况校正）

1. 扫描根不存在/不可读 → **显式传入**的根跳过并记 warning、同时进 `missingRoots`；**默认模式**下自动发现本就要求目录存在，缺根静默不产生噪声。
2. ~~SKILL.md > 256KB → 只取前 256KB 解析 frontmatter~~。**未实现**（v1.1 校正）：现实现整文件 `readFileSync` 后解析，无体积截断。远程侧另有单文件 400 KB 上限（FR-4.6）；本地侧的截断是欠账，登记在 §7 之外的已知局限。
3. 目录无读权限 → 根级不可读走第 1 条；**子目录内单文件不可读目前会让整次扫描抛出**（`computeDirHash` 的 `readFileSync` 未包 try），不是「warning + 跳过」。
4. ~~符号链接目录 → 只扫描链接目标一层，不递归追踪嵌套链接（防环）~~。**未实现**（v1.1 校正，附实测证据）：`computeDirHash` 用 `statSync`（跟随链接）递归下钻，**环状链接会一路走到系统报错**——`2026-09-30` 在本机以「skill 目录内指向自身的符号链接」为夹具实测，`computeDirHash` 抛 `ELOOP: too many symbolic links encountered`，且该异常不在 `scan()` 的捕获范围内 ⇒ 一条环链接可让整个 `POST /api/skills/scan` 失败。这是补齐本条时发现的真缺陷，修法（`lstatSync` + 只跟一层 / 或 visited 集）待排期，不在本轮文档笔内。
5. `name` 与既有 skill 冲突但目录不同（同名不同实现）→ **并入同一条目的版本线**（`recordVersion` 以 name 为唯一归并键），**不会**新建 `name (2)` 独立条目。v1.0 原文写「以 `name (2)` 形式新建独立条目」，与同 spec §7.4「同名目录再扫 → 该手动条目 versions=2」互斥，实况站在 §7.4 一边，故本节改判。**同名不同实现因此表现为两条版本记录，不做变体管理**（P2 余下能力）。

### 6.2 远程与出站（v1.1 新增）

1. 出站一律经 `http-guard` 的 `guarded*`，**不许裸 fetch**：仅 https → 主机白名单（`api.github.com` / `raw.githubusercontent.com` / `api.skillhub.cn`）→ 主机名不得是 IP 字面量 → DNS 解析出的**全部**地址须为公网（v4 段含 CGNAT 100.64/10、link-local、组播；v6 含 `::ffff:` 映射与常见保留段）。
2. 重定向逐跳复检，最多 3 跳；`*.myqcloud.com` 是**唯一**被放行的重定向额外后缀（SkillHub 的 `/file` 302 到对象存储），后缀匹配按「全等或 `.suffix` 结尾」判定，故 `myqcloud.com.evil.com` 与 `evil-myqcloud.com` 都被拦。缺 `Location` 或超 3 跳 → `REMOTE_UNREACHABLE`(502)。
3. 解析到私有/保留地址 → `FORBIDDEN_ORIGIN`(403)，与「远端不可达」区分开：前者是**拦截**，后者是**取不到**。
4. 远端非 2xx / JSON 形状不合 → `REMOTE_UNREACHABLE`(502)，错误体带状态码与 URL。仓库或树级别失败使整次导入失败；检查更新与补档是**逐条**失败（`checkFailed` / `failed` + `note`），不拖垮整批。
5. 仓库子路径（FR-4.1 的 `path`）只接受仓库内相对形态：剥首尾 `/`，含 `..` 段或归一后为空 → 422 `VALIDATION_ERROR`。它是仓库路径，不是文件系统路径，不参与任何磁盘解析。
6. GitHub 目录树 `truncated=true`（超大仓库）→ 记 warning「只导入能看到的部分」，不静默当完整结果。
7. 超出 FR-4.6 上限（>50 skill / >40 文件 / >400 KB）→ 截断 + warning，保留已取到的部分。
8. 单请求 15 s 超时。代理可用：`OPENVIBE_PROXY` / `HTTPS_PROXY` 经 undici `EnvHttpProxyAgent` 生效，出站仍过上述校验。
9. 存量兼容：0004 迁移把 `source` CHECK 放宽为四值时按 SQLite 文档的 12 步重建表（CHECK 不可 ALTER）；0005 加 `remote_ref` / `remote_tree_hash` 两列。迁移期临时关外键，旧库升级后本地条目两列为 null。

## 7. 验收标准（pass/fail）

> 用例定位法（dev-plan §13-8/§13-9）：**本节不写支数**。每条给「测试文件 + describe/it 标题」，跑法 = `pnpm vitest --project <unit|integration> --run <文件>`；具名 id 族用 `grep -oE "IT-SKILL-[0-9]+[a-z]?" <文件> | sort -u` 现取。

1. 造 3 个测试 skill 目录（1 个无 frontmatter）→ 扫描报告 `discovered=3`、`created=3`；无 frontmatter 者 `name`=目录名，且 `warnings` 含一条「SKILL.md frontmatter 缺失/非法，name 回退目录名」（**判据于 v1.1 校正**：不是 `parseWarning` 标记位）。—— `IT-SKILL-01`（`apps/server/test/skills.api.test.ts`）+ `packages/core/src/repos/skills.test.ts`「SkillsRepo.scan」段。
2. 修改其中一个 skill 的 SKILL.md 后重扫 → 该 skill `versions=2`、`latestVersionId` 指向新版本，其余 skipped。—— `IT-SKILL-02`。
3. 未变更再扫 → 全部 skipped，无新增版本。—— `IT-SKILL-02`（同支两段）。
4. 手动登记 `my-skill` → 在扫描根放置同名目录再扫 → 该手动条目 `versions=2` 且 `source` 仍为 `manual`、安装标记不被覆盖。—— `IT-SKILL-03` + core「手动登记与扫描并入」段。
5. 删除 skill → 版本级联删除（SQLite 计数验证）；缺失扫描根与空根都不报错。—— `IT-SKILL-04`。
6. **（v1.1）** 默认扫描根 = home 下全部 `~/.<tool>/skills`（`.Trash` 排除、非目录点项与无 `skills` 的点项忽略）+ ZCode 清单插件 `installPath`（含 `payload/skills` 布局）+ cwd `.claude/skills`；清单钉版插件的缓存历史版本不参与、未钉版缓存只取最高版本；报告 `scannedRoots` 记已扫根、显式缺根记 `missingRoots` 并告警。—— core「默认扫描根发现」「ZCode 插件 skill 根」「已扫根记入 scannedRoots」三段。
7. **（v1.1 FR-4）** GitHub 整仓导入建账带溯源版本串（`owner/repo@branch`）、重导同内容判 skipped、仓库 URL 归一；指定 `path` 时只导入该子目录且溯源串带 `:path`。—— `apps/server/test/skills.api.test.ts`「GitHub 整仓导入…」「GitHub 指定子目录导入（DEV-0068）…」+ core「远程导入落账 upsertRemote」段（含「与本地同名条目合并：追加远程版本且不覆盖已有 `skill_dir`」）。
8. **（v1.1 FR-4）** SkillHub 按 slug 导入：用文件清单自带的 sha256 直接算指纹，与 `computeDirHash` 同公式（同一套文件两边同值）；搜索映射 slug/名称/下载量；非 skillhub 源的搜索请求与非法仓库格式各 422。—— 「SkillHub 按 slug 导入…」「SkillHub 搜索映射…422」+ core「hashSkillEntries 与 computeDirHash 同公式」。
9. **（v1.1 FR-5）** 检查更新给出 `upToDate` / `remoteChanged` / `notTracked` / `checkFailed` 四态：树指纹一致为 `upToDate`，远端 blob 变化后为 `remoteChanged`，无 `remoteRef` 的存量为 `notTracked`，单条远端失败为 `checkFailed` 且其余条目判定不受影响；GitHub 路径**只调 trees API、零内容下载**（mock 断言请求 URL 集合）。—— 「GitHub 指定子目录导入…检查更新三态」「SkillHub 检查更新：清单 sha256 指纹对比 upToDate」。
10. **（v1.1 FR-5.4）** retrack 补档：对 `remoteRef=null` 的存量远程条目按版本线溯源串重导建档（写入 `remoteRef` + `remoteTreeHash`）；不可解析的串逐条报 `failed` 并给 `note`，整批不中断。—— 「retrack 补档（DEV-0069）…」。
11. **（v1.1 FR-6）** `GET /api/skills/duplicates` 三类各给例：同内容不同名归为一组、`source=local` 且目录已消失记 `stale`、引号名记 `nameAnomalies`、手动条目（空指纹）不参与归组；端点**不删任何行**（前后计数相等）。—— core「duplicates：同内容不同名归组…」+ api「重复整理与审查端点…」。
12. **（v1.1 FR-7）** 审查判据逐条给例并核档位：引号名 `fail`、空描述 `fail`、无触发词 `info`、凭据样串 `fail`、家目录路径 `warn`、围栏代码块内的路径**不**命中、干净技能零问题；无本地目录条目只出 `review-metadata-only`(info)。—— core「reviewSkill：引号名 fail、空描述 fail…」+ api「…+ 审查分级」。
13. **（v1.1 出站边界）** `http-guard` 独立成族：拒 http、拒 IP 字面量主机、拒白名单外主机、DNS 解析到私有地址拦截、重定向逐跳复检（`.myqcloud.com` 放行 / 其余拦、缺 Location 拦、超 3 跳放弃）、非 https 上游直接拒。—— `apps/server/test/http-guard.test.ts` 三段 describe。
14. **未验证面（明写，不是遗漏）**：`/skills` 页四个新对话框（远程获取 / 检查更新 / 重复整理 / 内置审查）**没有**自动化 DOM 断言，也**没有**浏览器走查截图归档（`docs/devlog-evidence/` 无 DEV-0067/0068/0069 目录）——其 API 侧行为由第 7–13 条覆盖，**渲染与点击路径属未验证**。§6.1.4 的环链接与 §6.1.2 的 256 KB 截断两条边界**无实现、无用例**。

## 8. 依赖

- 依赖：T2 存储层；CLI 扫描入口（T7）；`apps/server/src/lib/http-guard.ts`（远程取数的唯一出站通道，`skill-remote.ts` 不许裸 fetch）；undici（`EnvHttpProxyAgent`，代理经 `OPENVIBE_PROXY`/`HTTPS_PROXY` 生效）；迁移 0004（`source` 四值）+ 0005（`remote_ref`/`remote_tree_hash`）。
- 外部依赖：GitHub REST（`api.github.com` trees/repos）与 `raw.githubusercontent.com`、SkillHub（`api.skillhub.cn` + 其对象存储 `*.myqcloud.com`）。**上游改接口即本模块远程侧失效**，且属 §6.2.4 的 502 而非静默错判——用例以注入的 `fetchImpl` 罐头响应跑，不依赖真实网络。
- 被依赖：M6 组包（skills 清单素材）。
