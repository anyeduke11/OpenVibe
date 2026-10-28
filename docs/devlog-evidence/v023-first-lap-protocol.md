# v0.2.3 首圈飞轮协议（批次 B FR-1/2 执行文档）

> 状态：**就绪待执行**。执行窗口 = 批次 A 的 `npm publish` 完成之后（spec `v023-b-first-lap.md` §8.1）。
> 本文档是 spec FR-1/2 的操作面：协议步骤、数据采集命令、报告模板。执行产出《飞轮首圈报告》
> 落本目录（`v023-first-lap-report.md`），作为下一版 PRD 的唯一证据源。

## 1. 启动前置（三项，缺一不启动）

1. 批次 A 出口达成：`npm view openvibe-cli version` 非 404（发布 + D15 计时开始）。
2. 项目②由 owner 指定（spec §8.2 裁定②：使用事实非设计裁定，启动时填入）：`项目② = ______`。
   项目① 固定为本仓自己（已按 Spec 驱动流吃狗粮）。
3. 两个项目各完成一次 `npx openvibe-cli sync <dir> --pack default`（或既有包重注入）。

## 2. 协议步骤（每项目，观察窗 ≥7 个自然日）

| #   | 步骤                                                               | 机器留痕                                                            |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | 注入并确认                                                         | `local_events.kind='injection_confirmed'`                           |
| 2   | 日常开发 ≥1 周，正常使用项目工作台（阶段条/清单/看板/日志）        | `stage_view_switched` / `checklist_item_checked` / `stage_advanced` |
| 3   | 至少 1 次改资产 → 组新版本 → 导出                                  | `pack_composed` / `pack_exported`                                   |
| 4   | `openvibe diff` 处置漂移 ≥1 次（三选一照实选）                     | `injection_conflict_resolved` / 台账                                |
| 5   | 从开发日志**回流 ≥3 条资产**（术语/提示词/技巧草稿，人工确认入库） | `asset_reflowed`                                                    |
| 6   | 协议期间**禁用**设置页「清空台账」（报告须声明本条被遵守）         | —                                                                   |

## 3. 数据采集命令（报告的每一节都从这里现算，零人工计数）

```bash
# 台账分布（注入/冲突/回流/使用）
curl -s -H "Authorization: Bearer $(jq -r .token ~/.openvibe/config.json)" \
  http://127.0.0.1:8787/api/local-events/summary

# 输出侧度量（OM1 密度 + OM2 首次见效时间）
curl -s -H "Authorization: Bearer $(jq -r .token ~/.openvibe/config.json)" \
  http://127.0.0.1:8787/api/om

# 飞轮五项（资产/包/注入/回流/圈数）
curl -s -H "Authorization: Bearer $(jq -r .token ~/.openvibe/config.json)" \
  http://127.0.0.1:8787/api/stats

# D15 两腿：① 工作台使用（stage_view_switched + flow_template_run 计数）
curl -s -H "Authorization: Bearer $(jq -r .token ~/.openvibe/config.json)" \
  'http://127.0.0.1:8787/api/local-events/summary' | jq '.byKind["stage_view_switched"]'
# ② 窗内 DEV 日志条数（起点 = npm publish 当日）
sqlite3 ~/.openvibe/data/openvibe.db \
  "SELECT COUNT(*) FROM dev_log_entries WHERE created_at >= '<publish日>'"
```

## 4. 《飞轮首圈报告》模板（落 `docs/devlog-evidence/v023-first-lap-report.md`）

| 节  | 内容                                                            | 判据                                   |
| --- | --------------------------------------------------------------- | -------------------------------------- |
| 1   | 起止日期、两项目标识、协议步骤 1–6 逐项完成情况                 | 全部留痕命令输出贴附                   |
| 2   | 注入次数、冲突处置三选一分布、`diff` 退出码分布                 | /api/local-events/summary + /api/stats |
| 3   | 回流条数与资产 id 清单（带来源反链）                            | ≥3 条                                  |
| 4   | **D15 判定**：两腿实测值 + 触发/不触发 M5-lite 的明确结论       | 触发不是失败，是证伪线按设计生效       |
| 5   | **首圈摩擦清单**：**≥5 条且每条带复现步骤**（空洞即报告不通过） | 硬判据                                 |
| 6   | OM1/OM2 快照（密度、首次见效时间）                              | /api/om 现算                           |

## 5. 报告的用途（写成 here 就不会被人情改掉）

- 报告**可能证伪本产品**：回流入口无人自发使用、或 D15 两腿同时不达 ⇒ 按 tasks.md §5 既有裁定触发
  M5-lite 预案——这是本协议的价值，不是它的失败。
- 下一版 PRD 以本报告为唯一证据源；报告中登记的摩擦清单是下一版需求的唯一合法来源。
