<!-- openvibe:agent-memory-export -->
# agent 记忆（导出件）

> 这是 **agent 的工作记忆**（跨项目教训，不只属于本仓）的**导出件**。
> 源在 agent 的本机数据目录（`~/.minimax/agents/<profile>/memory/`）——
> 导出进仓是为了**可移植**：换机器、换 profile、清理 profile 之后，仓里这一份仍在。

| 项 | 值 |
|---|---|
| 来源 profile | **mavis** |
| 导出日 | **2026-10-22** |
| 索引条目数 | **38** |
| 导出文件数 | **8 + 1**（本 README） |

## 文件清单

| 文件 | 条目数 |
|---|---|
| `topics/gate-design.md` | **6** |
| `topics/spec-doc-discipline.md` | **9** |
| `topics/git-worktree-discipline.md` | **6** |
| `topics/tooling-boundaries.md` | **6** |
| `topics/fake-red-triage.md` | **6** |
| `topics/sql-table-semantics.md` | **2** |
| `topics/ui-craft.md` | **3** |

## 复算命令

```bash
# 条目数复算：数索引表的数据行（表头与分隔行不算）
npx tsx scripts/export-agent-memory.ts --from ~/.minimax/agents/mavis/memory --date 2026-10-22
```

## 这份导出件的三条自证（导出脚本自跑，失败即报错）

1. **索引点名的每个 topic 都存在** —— 少一个就报错，不产出半份导出件；
2. **每个 topic 非空且带 `Type:` 标记**；
3. **导出件与源逐字节相同**（sha256 比对）——
   以及本 README **零绝对路径**（用户目录形态、home 目录形态、Windows 盘符形态三者全零命中；
   ⚠️ **这条规则不能在本文件里写出它自己的字面量** —— 写出来就会被自己的检查抓到，
   所以上面只描述形态、不复写样例）。

⚠️ **源改了要重导**：这份是**点时导出件**（见上方「导出日」），
不是实时镜像；改动请在源目录里做，再重跑上面的命令。
