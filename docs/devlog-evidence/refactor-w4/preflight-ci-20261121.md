# §19.3 第 1 条 · CI 三平台 preflight 实测数据（2026-11-21 收口）

> **定位**: dev-plan §19.3-1（「maxWorkers: 2 未在 CI 上验证过」）的取数腿关闭记录。取数机制（collect/upload 步）随分笔收口⑧入库（af8eace），本笔取 run `44880812996` 的三平台 artifact。
> **复算**: `gh api repos/anyeduke11/OpenVibe/actions/runs/44880812996/artifacts` → 下载 `preflight-{ubuntu,macos,windows}-latest` zip → `preflight.json`。三份原文见下。

## 三平台实测（2026-11-21T07:34–07:35Z）

| 平台             | tier     | workers               | 可用/总内存            | 判定原文（节选）                                                |
| ---------------- | -------- | --------------------- | ---------------------- | --------------------------------------------------------------- |
| ubuntu-latest    | 充裕     | **2**（维持）         | 14.55 / 15.6 GB        | 可养 14 个 ⇒ 扛得住 ⇒ 并发维持 2（swap 取不到，跳过该条判定）   |
| **macos-latest** | **吃紧** | **1**（**自动降级**） | 0.64 / 7.00 GB（9.1%） | < 吃紧阈值 0.88 GB（总内存 × 12.5%） ⇒ 降到 1，`degraded: true` |
| windows-latest   | 充裕     | **2**（维持）         | 13.06 / 16 GB          | 可养 13 个 ⇒ 扛得住 ⇒ 并发维持 2                                |

## 评估（§19.3-1 的「再评估是否调高」半）

- **结论：维持 `maxWorkers: 2`，不放宽**。依据：ubuntu/windows 虽有 13–14 个 worker 的余量，但 **macOS 腿实测 7 GB 总内存、9.1% 可用 ⇒ 吃紧**——三平台取短板，放宽对 macos 是负收益；本 run 里预检机制已按设计自动把它降到 1。
- **可选优化（须 owner 明确同意，本笔不实施）**：per-OS workers（ubuntu/windows 4、macos 1）可在 CI workflow 的 matrix 上按平台传参——收益是 ubuntu/windows 腿提速，代价是三腿结果不再同构（preflight.json 会如实记录各自档位）。
- **机制价值实证**：macos 腿的降级是「假红分辨」设计的直接兑现——同 run 里 macos 的 Test 步失败（并行会话未加固的测试面）与「环境吃紧」被分开归因。

## 与本 run 其余红的关系（归属登记）

本 run 的 CI 红全部落在**并行会话工作线的未加固测试面**：windows 腿 clean/sync 等套件的路径分隔符类失败（26+17 处）＋ ubuntu/macos 的 `POST /api/lang/scan` 20s 超时（扫描子进程在 CI 冷环境超时）＋ docs-check/error-text-scan 的 windows 文案差。**这些不是重构线（RG1–RG3）的判据面**，归该工作线补 CI 加固（dev-plan 队列外的新债，DEV-0284 登记）。
