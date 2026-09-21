# SPEC · M2 Skill 中心（瘦身版：扫描 + 登记）

| 项 | 值 |
|------|------|
| 模块 | M2 Skill 中心 |
| 优先级 | P0（瘦身）→ P1 完整版（生态导入/多平台分发/冲突 UI） |
| 上游 | PRD 3.2-M2、proposal §3.1 |
| 下游设计 | design.md §5、§8（adapter 清单） |
| 关联任务 | tasks.md T5（随 M5 周期实现，量小） |

---

## 1. 目标与用户价值

让用户**先把自己机器上已有的 skill 看清楚**：扫出散落在 `~/.claude/skills` 等目录的 SKILL.md，登记成带版本和指纹的清单，供标准包引用（生成 SKILLS.md 素材）。分发与安装能力 P1 再上——MVP 只做「台账」。

## 2. 范围

| In（MVP） | Out（→P1 完整版） |
|-----------|-------------------|
| 扫描本地 skill 目录自动发现（Web 按钮 + CLI 两条入口） | GitHub / skills.sh 生态源浏览与安装 |
| 手动登记（名字/描述/来源/路径） | symlink/copy 多平台分发 |
| 重扫比对 SHA-256，同名新指纹 → 记为新版本 | 冲突变体 UI、源更新订阅提醒 |
| CRUD、进入标准包 manifest（skills 清单素材） | 安全扫描 |

## 3. 数据与核心概念

```
Skill {
  id: "sk_<nanoid>",
  name: string,               // 必填；扫描时取 SKILL.md frontmatter.name，缺省用目录名
  description: string,        // frontmatter.description，可编辑
  source: "local" | "manual",
  skillDir: string,           // 本地绝对路径（local 源必填）
  latestVersionId: id,
  installedTargets: string[], // 手工维护的文本标记（如 "claude-code@macbook"），MVP 不自动检测
  createdAt / updatedAt
}
SkillVersion { id, skillId, versionLabel(扫描取目录名/mtime 无则 "v1"),
               dirHash(目录指纹，算法见 FR-1.3), fileCount, scannedAt }
```

## 4. 功能需求（FR）

### FR-1 扫描发现
1. 扫描根目录集合（默认：`~/.claude/skills`、`$CWD/.claude/skills`；设置页可增删），仅第一层子目录内含 `SKILL.md` 者为 skill。
2. 解析 SKILL.md YAML frontmatter 的 `name`/`description`（容错：frontmatter 缺失/非法 → name=目录名，description=空，标记 `parseWarning`）。
3. 目录指纹 `dirHash`：对目录内全部文件按相对路径排序，逐文件 sha256，拼接 `${relPath}:${fileHash}\n` 后整体 sha256。忽略 `.DS_Store`、`node_modules/`。
4. 同 `name` 且 `dirHash` 未变 → 跳过；`name` 已存在但指纹变化 → 追加 SkillVersion 并更新 latestVersionId；新 name → 新建 Skill + 首版本。
5. 扫描结果返回报告：`{ discovered, created, updated, skipped, warnings[] }`，UI 以摘要条呈现。

### FR-2 手动登记
1. 表单：name*、description、source=manual、installedTargets（逗号分隔）。
2. 手动条目无指纹；后续若扫描到同名目录 → 视为该 skill 的 local 版本并入（追加 SkillVersion，source 保持 manual 主档）。

### FR-3 维护
1. 列表：按 name 排序，显示来源、版本数、最近扫描时间；搜索框按 name/description 过滤（LIKE 即可，量小）。
2. 编辑 description/installedTargets；删除需确认（级联版本）。

## 5. 输入 / 输出

- **API**：`POST /api/skills/scan`（body 可带 roots 覆盖默认）、`GET/POST /api/skills`、`PATCH/DELETE /api/skills/:id`、`GET /api/skills/:id/versions`。
- **CLI 入口**：`openvibe scan --skills`（specs/m6b FR-3），与 Web 按钮打同一 API。
- **对下游输出**：M6 组包候选（skills 清单 → SKILLS.md）。

## 6. 边界与异常

1. 扫描根目录不存在 → 该根跳过并记 warning，不报错。
2. SKILL.md > 256KB → 只取前 256KB 解析 frontmatter。
3. 目录无读权限 → warning + 跳过。
4. 符号链接目录 → 只扫描链接目标一层，不递归追踪嵌套链接（防环）。
5. `name` 与既有 skill 冲突但目录不同（同名不同实现）→ 以 `name (2)` 形式新建独立条目并在报告标注，**MVP 不做冲突变体管理**（P1 能力，此处明确降级）。

## 7. 验收标准（pass/fail）

1. 造 3 个测试 skill 目录（1 个无 frontmatter）→ 扫描报告 discovered=3、created=3；无 frontmatter 者 name=目录名且 warnings 含 parseWarning。
2. 修改其中一个 skill 的 SKILL.md 后重扫 → 该 skill versions=2、latestVersionId 指向新版本，其余 skipped。
3. 未变更再扫 → 全部 skipped，无新增版本。
4. 手动登记 `my-skill` → 在扫描根放置同名目录再扫 → 该手动条目 versions=2。
5. 删除 skill → 版本级联删除（SQLite 计数验证）。

## 8. 依赖

- 依赖：T2 存储层；CLI 扫描入口（T7）。
- 被依赖：M6 组包（skills 清单素材）。
