---
description: %E7%95%8C%E9%9D%A2%E5%BD%A2%E6%80%81%E4%B8%8E%E4%BA%A4%E4%BA%92%E4%B8%89%E6%80%81%EF%BC%9AEmptyState%20%E5%BF%85%E6%9C%89%203%20%E6%80%81%EF%BC%88empty%2Fno-result%2Ferror%EF%BC%89%C2%B7%20%E5%85%A8%E9%80%89%E7%8A%B6%E6%80%81%E6%9C%BA%E7%94%A8%20discriminated%20union%20%C2%B7%20alert%2Fconfirm%20%E6%B3%9B%E6%BB%A5%E5%8F%8D%E6%A8%A1%E5%BC%8F
---

# 界面形态与交互三态（列表页与批量操作的通用形态）

Type: pattern

**一句话**：列表页与批量操作的高频缺陷不是「功能没做」，而是**语义被压成一个布尔量**、**空态被压成一句话**、**确认被压成浏览器原生弹窗**。

## 一、EmptyState 必有 3 态

任何带列表/数据展示的页面，EmptyState 必须区分三种语义状态，否则用户分不清「没数据」和「加载失败」：

- `empty`：首次使用，无数据 → CTA「去导入/新建」（引导首步）
- `no-result`：当前过滤无结果 → CTA「清除筛选/调整条件」（帮用户脱困）
- `error`：网络/API 失败 → CTA「重试/查看日志」（必须可重试）

**实现要点**：
- `EmptyState` 组件接 `variant` ＋ `primaryAction` ＋ `secondaryAction` ＋ `error: { message, onRetry }` props
- 配合 `useFetchWithRetry(url, { retries: 2, retryDelay: 1000 })` hook 自动重试 ＋ 暴露 retry 函数
- 加全局 `app/error.tsx` 边界兜住任何 throw

**理由**：bid-news-kanban 的 9 个页面中 4 个只有「暂无数据」一种文案 ＋ 没有重试入口，网络抖动直接 0 信息。

## 二、selectAllMode 状态机反模式

「全选当前页」与「跨页全选」混在一个 boolean ＋ Set 里是反模式。bid-news-kanban 的实际写法：`selectAllMode=true` 但 `selectedIds=空` 代表「全选过滤全集」—— UI 写「已选择全部 N 条」checkbox 却没勾选，用户会懵；切页/筛选项变化时 `selectAllMode` 不自动失效。

**正确做法**：用 discriminated union 表达

```ts
type SelectionState =
  | { kind: "none" }
  | { kind: "page"; ids: Set<string> }
  | { kind: "all"; filters: FilterSnapshot; excludedIds: Set<string> };
```

- 任何过滤条件变化强制 `setSelection({ kind: "none" })`
- 跨页全选 banner 醒目 ＋ indeterminate checkbox
- 批量删除前强弹 Dialog 显示「实际影响数量 ＋ 不可撤销警告」＋ 50+ 条 requireText "DELETE" 二次输入

**理由**：误操作批量删除/审批 500 条是真事故，不可逆。

## 三、alert / confirm 全仓泛滥是反模式

在 bid-news-kanban 审计中发现 38+ 处 `alert()` / `window.confirm()`，包括删除/批量/不可逆操作。原因往往是「先跑通再优化」遗留。

**现代化路径**：
1. 引入 `sonner` Toast（1.5KB，Promise/loading API 完整）→ 替换所有 `alert(msg)` / `alert("失败:" + e.message)`
2. 不可逆操作走项目自有 Dialog（`shadcn` / `@base-ui` 都已具备）→ 替换所有 `confirm()`，支持 destructive 危险色 ＋ requireText 二次输入
3. 配合 `toast.promise(promise, { loading, success, error })` 让异步流程有完整进度反馈

**理由**：alert/confirm 是浏览器原生 dialog，破坏品牌一致性 ＋ 不能堆叠 ＋ 不能自定义内容（如失败明细列表）。

**apply when**：任何列表页 / 数据看板 / 搜索结果页；任何带「批量操作 ＋ 全选 ＋ 分页」的列表页；任何 React 项目代码审查发现 alert/confirm 超过 5 处。
