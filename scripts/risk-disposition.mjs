#!/usr/bin/env node
/**
 * scripts/risk-disposition.mjs —— 把 DEV_LOG 的「潜在风险」段归置为单一去向（DEV-0227 方案第 3 步）。
 *
 * ## 它解决什么
 *
 * `DEV_LOG.md` 里 186 条「潜在风险」此前**只有登记、没有去向** —— 每条都是一个未闭合的灰色态：
 * 不知道它该由谁处理、按什么标准关闭。DEV-0227 方案 A 把落点收敛为三处（既有验收 / 决策台账 / 观察池），
 * 本脚本按该规则给每条风险**机械分类**并产出归置表。
 *
 * ## 分类口径（按优先级依次匹配，首中即定）
 *
 * | 优先级 | 判据 | 去向 | 理由 |
 * |---|---|---|---|
 * | 1 | 含 `未做`/`待填`/`未完成`/`欠账`/`未闭合` | **决策台账** | 已是显式欠账，须 owner 裁定是否排期 |
 * | 2 | 含 `未触`/`无新增`/`纯文档`/`不适用` | **关闭** | 明确声明本轮无风险，直接关闭 |
 * | 3 | 含 `漂移`/`失配`/`失效`/`过期`/`腐烂` | **既有验收** | 属「判据覆盖不足」，补进既有闸的验收标准 |
 * | 4 | 含 `噪音`/`难排查`/`成本高`/`性能`/`慢` | **观察池** | 是成本/体验问题，无证据前不排期 |
 * | 5 | 含 `假设`/`未核验`/`待核验`/`待裁` | **决策台账** | 属待裁定项 |
 * | 6 | 其余 | **观察池** | 无机械判据可判，登记不排期 |
 *
 * ⚠️ **分类是机械的，不是判断**：脚本只做关键词匹配，**不做语义理解**。
 *   产出表必须人工复核 —— 分类结果供复核起点，不作为最终裁定。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/risk-disposition.mjs            # 打印归置表（Markdown）
 * node scripts/risk-disposition.mjs --json     # 输出 JSON（供人工复核/再加工）
 * node scripts/risk-disposition.mjs --stat     # 只打印分布统计
 * ```
 *
 * 退出码：`0` 正常；`1` DEV_LOG 读不到或无风险段。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DEV_LOG = resolve(REPO, 'DEV_LOG.md')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const asStat = argv.includes('--stat')

/** 分类规则（顺序即优先级） */
const RULES = [
  {
    id: 'debt',
    to: '决策台账',
    why: '显式欠账，须 owner 裁定是否排期',
    re: /未做|待填|未完成|欠账|未闭合|未跑|未验证/,
  },
  { id: 'closed', to: '关闭', why: '明确声明本轮无风险', re: /无新增|纯文档|不适用|无风险|未触/ },
  {
    id: 'coverage',
    to: '既有验收',
    why: '判据覆盖不足，补进既有闸的验收标准',
    re: /漂移|失配|失效|过期|腐烂|漏掉|覆盖不到|拦不住/,
  },
  {
    id: 'cost',
    to: '观察池',
    why: '成本/体验问题，无证据前不排期',
    re: /噪音|难排查|排查成本|成本高|性能|变慢|体积/,
  },
  { id: 'pending', to: '决策台账', why: '属待裁定项', re: /假设|未核验|待核验|待裁|待定/ },
  { id: 'pool', to: '观察池', why: '无机械判据可判，登记不排期', re: /.*/ },
]

function classify(risk) {
  for (const r of RULES) if (r.re.test(risk)) return r
  return RULES[RULES.length - 1]
}

/**
 * 人工复核结论（DEV-0229 补做；DEV-0231 补节点证据回查）。
 *
 * ⚠️ **这是人工判定，不是机器分类** —— 每条都由读者读过 DEV_LOG 原文后给出，
 *   与上面的机械分类（`rule` 字段）是两回事。机械分类供起点，人工判定供结论。
 *
 * 判定三类：
 * - `关闭`：**前提已消失** —— 时序性风险（项目已越过该节点：T8 已做、v0.1.0 已发布、批次已收官、裁定已落）
 * - `转修`：**前提仍在，判据覆盖不足** —— 应补进既有闸的验收标准
 * - `保留`：**前提仍在但影响小/无证据** —— 留在观察池，不排期
 *
 * 未列出的 DEV 号 = 复核时未单独判定，维持机械分类结果。
 */
const REVIEW = {
  // ── 关闭：前提已消失（时序性风险） ───────────────────────────────
  'DEV-0002':
    '关闭| 门禁 G2/G3 由 DEV-0004 落定（正文「G2 契约冻结 v1；G3 adapter 冻结 v1.1」「门禁 G2/G3/G4/G6 全部 ✅」）；npm 名核验由 DEV-0005 完成（实测 registry 404）',
  'DEV-0003': '关闭| D6/G6 已裁定（DEV-0004）',
  'DEV-0004': '关闭| MiniCode/Trae/Kimi 三项核验已由 DEV-0005 完成',
  'DEV-0005': '关闭| Trae 真机复核与 6.5 周缓冲均已是历史（P1 已交付）',
  'DEV-0007': '关闭| 竞品快照为 2026-03/04 采样，README 未引用具体 star 数',
  'DEV-0008': '关闭| 60 条首发与 M5 证伪线均属发布前事项，v0.1.0 已发布',
  'DEV-0009': '关闭| dev-plan 推导与 PRD 重编号均已是历史',
  'DEV-0010': '关闭| 命名已定为 OpenVibe，撞车披露已在 README',
  'DEV-0012': '关闭| T2 存储核心已交付，migrations/FTS 风险已消解',
  'DEV-0013': '关闭| T3 提示词库已交付；懒加载分包已由后续拆包处理',
  'DEV-0014': '关闭| 词条已补至 100+（DEV-0019 种子全量）',
  'DEV-0015': '关闭| T5 已交付，主包体积已由后续拆包闸接管',
  'DEV-0016':
    '保留| **回查发现证据不足**：DEV-0014 只是风险本身（「63 条 AI 起草、owner 审校尚未发生」），非闭合点；DEV-0019 把词条补到 104 并切正式阈值，但**未提及 owner 审校是否真发生** —— 词条语义质量仍可能无独立复核',
  'DEV-0017': '关闭| v0.1.0 已发布，字典序缺陷已收口',
  'DEV-0025': '关闭| T11 三条冒烟已收口（本条即收口记录）',
  'DEV-0029': '关闭| 待决策项 ③ 已落地（本条即落地记录）',
  'DEV-0030': '转修| 「两处共同承载的对称关系」是判据结构问题，应在 schema 处加注释与成对修改提示',
  'DEV-0032': '关闭| 队列 ⑬ 已收口，win32 记账问题已由后续 CI 覆盖',
  'DEV-0033': '关闭| web DOM 断言层已建立（本条即首例）',
  'DEV-0036': '保留| 超时文案 ms/s 属可读性偏好，影响极小',
  'DEV-0039': '关闭| 队列 ③ 已落地，tag 已推',
  'DEV-0040': '关闭| 余量与 DEFAULT_PACK_VERSION 均属发布前事项',
  'DEV-0041': '关闭| tag 已推，语义变更已如实登记',
  'DEV-0042': '关闭| 退场腿与「8 项」断言均属一次性演练',
  'DEV-0043': '关闭| 队列 ⑥ 复核已完成并落改（DEV-0044）',
  'DEV-0044': '关闭| 本条即 ⑥ 的落改记录',
  'DEV-0047': '关闭| D15 观察窗已裁定并落地',
  'DEV-0048':
    '转修| 「同一断言的落点集合」是反复出现的结构问题，应加「新增断言须先扫同述语」的硬纪律',
  'DEV-0049': '转修| 第 9 条硬纪律「不会自动红」—— 应加 CI 闸检查正文数字可复算',
  'DEV-0050': '关闭| D15 两半已裁定，代价已接受',
  'DEV-0051': '关闭| 队列 ⑧ 三条冒烟已接 CI',
  'DEV-0052': '关闭| 队列 ⑨ 已落地，约定已写进 design.md',
  'DEV-0053': '关闭| 队列 ⑤ 已落地',
  'DEV-0054':
    '转修| lint 视野盲区（build/ 与 .zwork/）无防回归断言 —— 应加「git ls-files build/ 必 0 命中」',
  'DEV-0055': '关闭| 整合已完成，`git branch -vv` 纪律已写进流程',
  'DEV-0056': '转修| codemod 不入库 ⇒ 映射表只活在注释里 —— 应把映射表落仓或写进 DESIGN.md',
  'DEV-0057': '保留| keepalive 与轮询上限属运行时容错，影响小',
  'DEV-0058': '关闭| 第 8 次推送已完成，远端绿',
  'DEV-0059': '关闭| 种子冻结争议已由 owner 裁定',
  'DEV-0074': '关闭| M4/M7 规格由 DEV-0085 的 M4 七裁闭合（同批次收官）',
  'DEV-0075': '关闭| M4 七裁已闭合',
  'DEV-0076':
    '关闭| ㉘ 的解释性风险已由 DEV-0085 的 M4 七裁闭合（㉘ 七裁落定，未按「注入侧回传」重开）',
  'DEV-0077': '保留| 仿真 ≠ 真机 win32，属环境限制，如实登记即可',
  'DEV-0078': '关闭| §2c 前置与 T12 洞已由 M4 七裁闭合',
  'DEV-0079':
    '保留| **回查发现前提仍在**：`SM-2c` 的 6 s 上界是「借来的数」（同 `SM-2d`）而非量出来的，更慢的 runner 上仍可能红 —— 属未消除的判据脆弱性',
  'DEV-0084': '关闭| ㉘ 七裁已由 DEV-0085 闭合（该条正文 2 处提及㉘；本条是㉘ 的前置风险）',
  'DEV-0085': '关闭| ㉘ 七裁已闭合（本条即闭合记录）',
  'DEV-0087': '关闭| 前置 ① 已闭合（T12 已补）',
  'DEV-0090': '关闭| V2 换肤已完成（本条即完成记录）',
  'DEV-0093':
    '关闭| **owner 裁 ㊴（2026-11-10）**：前提不成立 —— 两份计划文件是**两条轨道**（v0.2.0 RF 线 vs v0.2.1 M8，D34 授权），非双源；维持现状不降格，指针在位性由 `dev-plan.md` §18.4 清单覆盖（`docs/decisions.md` ㊴）',
  'DEV-0094': '关闭| Phase 1 切片已落地',
  'DEV-0095': '转修| 变异腿没红暴露实现缺陷 —— 已在后续修正，但「变异腿必须红」应上升为纪律',
  'DEV-0096':
    '转修| **规格数字与传输层现实对不上**（2 MB 上限经 HTTP 触达不到）—— 属规格缺陷，应订正 spec',
  'DEV-0097': '关闭| 服务层已落地',
  'DEV-0098': '关闭| 服务层 zone 方向已订正',
  'DEV-0099':
    '关闭| 脏工作树基线是一次性采样问题，边界已写进 `service-layer.md §3-9b`（「只能当当前工作树的对照数，合流前不能当 CI 门禁数」）',
  'DEV-0107': '关闭| M9 增强已落地，端点改名破坏性已在发布说明披露',
  'DEV-0109': '关闭| 工作树残留回退已由后续提交处理',
  'DEV-0110': '关闭| §17 断链已由 DEV-0116 恢复',
  'DEV-0111': '转修| 别名表「只报数不判红」—— 应升为判红或明确登记为「只报数面」',
  'DEV-0112': '关闭| 降级存储已明确为 Out',
  'DEV-0116': '关闭| DEV 编号撞车已登记映射表',
  'DEV-0117': '关闭| 发布说明已定稿，v0.2.3 已发布',
  'DEV-0118': '保留| 物理归位属 v2 重构事项，当前出口口径正确',
  'DEV-0138': '保留| 护栏的部分提交必报是刻意设计，已有豁免开关',
  'DEV-0139': '转修| **覆盖类播种仍会覆盖用户手改** —— 原文自陈「真隐患，优先级最高」，应补判据',
  'DEV-0140': '保留| 主出口快照是强闸，成本是设计意图',
  'DEV-0141': '保留| 0020 去重保留 MAX(rowid) 风险低（该表无用户可见面）',
  'DEV-0143': '保留| 快照无自动触发器，属使用频率问题',
  'DEV-0144': '保留| 0023 迁移未入 drill 清单，风险低',
  'DEV-0145': '保留| 手写协议是最小子集，未知能力如实拒绝（-32601），非假装支持',
  'DEV-0146': '保留| `<ref:n>` 依赖 LLM 服从，来源真实性不受影响',
  'DEV-0147': '关闭| 未提交风险已由 owner 提交消解',
  'DEV-0149': '关闭| 远端 CI 存量债已清偿',
  'DEV-0150': '保留| 技能部署靠手工 cp，属工具链改进项',
  'DEV-0152': '保留| 规则 D 依赖日期约定，已有缓解',
  'DEV-0153': '保留| 隔离化缺口已如实登记，本轮已逐项还原',
  'DEV-0154': '保留| 磁盘态报告端点清单人工登记，靠 review 纪律兜底',
  'DEV-0158': '保留| 60 个文件直写 mkdtempSync —— 可由清扫器兜底，属渐进迁移',
  'DEV-0159': '保留| lsof 非 POSIX，已如实报「无法判定」而非静默 0',
  'DEV-0161': '保留| pid 复用后果仅为多留一行登记',
  'DEV-0163': '保留| orphans.json 暂无消费方，属「先有事实、后有读者」',
  'DEV-0165': '保留| 旧布局残留文件无害，由系统清理',
  'DEV-0168': '保留| 锚点机器契约的维护成本已写进规范',
  'DEV-0177': '保留| 行号绝对化属定位价值问题，不造成误判',
  'DEV-0179': '保留| CI 首次接历史文件的过渡期已越过',
  'DEV-0180': '保留| C-5 上界人工下调是设计意图',
  'DEV-0181': '保留| 建议值随轮重算是设计意图',
  'DEV-0182': '保留| 钩子必须安装才生效，安装命令已写明',
  'DEV-0183': '保留| 跨机器合并是人工动作，已写明',
  'DEV-0184': '保留| 合并清单上限 50 条已写明',
  'DEV-0185': '保留| 折叠区默认收起是刻意设计',
  'DEV-0186': '保留| 聚合只覆盖最近 10 条，标题已标注窗口',
  'DEV-0188': '保留| react-router 版本依赖已写明',
  'DEV-0189': '保留| 全量计数口径已写明',
  'DEV-0191': '保留| 提示是防御性的，当前不触发',
  'DEV-0192': '保留| mergesOmitted 只对文件负责，口径已写明',
  'DEV-0193': '保留| mergesTotal 只对文件负责，口径已写明',
  'DEV-0205':
    '转修| ownership:check 误报 —— 原文已自陈「护栏的已知口径局限」，应订正豁免逻辑或文档化',
  'DEV-0206': '保留| C-7 基线上界 0 是有意的严格，成本已写明',
  'DEV-0216': '关闭| 块注释剥离已由 DEV-0217 收口（原文明确标注）',
  'DEV-0223': '关闭| 哈希清单已扩到 4 份（DEV-0224）',
  'DEV-0225': '关闭| 新增文件覆盖判据已由 DEV-0226 落地',
  'DEV-0228': '转修| 「进观察池/不成立」判据过宽 —— 应细化关键词判据或明确登记为「只区分去重信号」',
  // ── DEV-0229 补做：剩余 81 条复核（第二批） ──────────────────────
  // 关闭：前提已消失
  'DEV-0001': '关闭| PRD 7 项假设已由 DEV-0003 澄清对话逐条裁定；竞品快照未被 README 引用',
  'DEV-0006': '关闭| 原文自陈「无新增」',
  'DEV-0019': '关闭| T9 已交付，seed 裁决与 CI 均已完成',
  'DEV-0020': '关闭| v0.1.0 已发布（DEV-0022/0060）',
  'DEV-0021': '关闭| 该 commit 的 CI 证据已由后续推送兑现',
  'DEV-0022': '关闭| 真发布已完成',
  'DEV-0023': '关闭| S-2 探针已跑（DEV-0024/0025）',
  'DEV-0024': '关闭| 三条冒烟已收口（DEV-0025）',
  'DEV-0026':
    '关闭| 队列 ⑥ 复核与落改已由 DEV-0044 完成（m6b v1.8 / m6a v1.4 段 ④，Q1–Q3 与 R1–R4 逐条落地）',
  'DEV-0027': '关闭| T10 已交付，CI 已跑到 tip',
  'DEV-0038': '转修| 三处播种表 reseed 仍会覆盖用户手改 —— 原文自陈「真隐患，优先级最高」',
  'DEV-0045': '转修| 「数字入正文」复发动 —— 应加「新抄一次就当场拒绝」的 CI 检查点',
  'DEV-0046': '转修| §13-8 只覆盖数字，漏状态句 —— 主语应扩到「可被一条命令复算的状态断言」',
  'DEV-0060': '关闭| tag 已推，v0.1.0 已发布',
  'DEV-0061': '关闭| tag 移动已完成，代价已如实登记',
  'DEV-0065': '关闭| 并行会话改动已入库，入口预算问题已由后续 bundle 闸接管',
  'DEV-0081': '关闭| 本条即该组件测试的建立记录',
  'DEV-0082': '关闭| 该 spec 未验证面清单已按 B 级处理',
  'DEV-0088': '关闭| D25 已落定，受管块串已同步',
  'DEV-0100': '关闭| `foreign` 列已进 diff 输出；0-f 未过项已由后续批次处理',
  'DEV-0108': '关闭| 治理基线表已改现跑，历史对照留在 FR-1.4',
  'DEV-0113': '关闭| v0.2.3 已发布，矩阵为点时值已注明',
  'DEV-0114': '关闭| publish 已执行（v0.2.3 已发布）',
  'DEV-0115': '关闭| FR-12.9 已进 CI',
  'DEV-0142': '关闭| 0021→0022 升级已演练；runner 复用链已处理',
  'DEV-0148': '关闭| push 已由 owner 逐次放行完成；演示库已清理',
  'DEV-0155': '保留| 来源声明是人工判定 —— 判错靠人复核，属流程成本',
  'DEV-0156': '保留| `reason` 人工写、端口重试依赖输出文本 —— 已有兜底',
  'DEV-0157': '关闭| `UNVERIFIED` 枚举已按 D-b 裁定落地',
  'DEV-0160': '保留| CI 实测数字待取，属数据缺口而非缺陷',
  'DEV-0162': '保留| `ps` 扫描毫秒级、体检不改退出码为刻意设计',
  'DEV-0164': '关闭| 原文自陈「此风险已由 DEV-0165 根除」',
  'DEV-0166': '关闭| C-6 判据已由 DEV-0167 落地',
  'DEV-0167': '关闭| 标题文字定位已由 DEV-0168 改为锚点',
  'DEV-0169': '保留| 锚点语义贴切性靠人读，规范已写明',
  'DEV-0170': '保留| 条款序号语义漂移靠人复审，规范已写明「粒度一致」',
  'DEV-0171': '关闭| 子串匹配已由 DEV-0172 收紧为首行等值',
  'DEV-0172': '保留| 改规格措辞需同步名锚 —— 维护成本已写进规范',
  'DEV-0173': '关闭| 多行共锚可观测面已由 DEV-0174 补上',
  'DEV-0174': '关闭| 分级与趋势已由 DEV-0175 补上',
  'DEV-0175': '关闭| 跨轮可比已由 DEV-0176 补上',
  'DEV-0176': '保留| 三平台各存一份 JSON 是形态统一取舍；比对仍是人工动作',
  'DEV-0178': '保留| CI 差分 artifact 依赖与 unzip 差异属环境限制',
  'DEV-0187': '保留| 筛选态为会话态是刻意设计',
  'DEV-0190': '保留| 单来源上限 50 条与脚本侧同值；字段类型变更未发布',
  'DEV-0194': '保留| D-v25 已裁定，实施在 S1 轮 —— 届时重走 A 级流程即可',
  'DEV-0195': '保留| 核准是静态阅读；P-B 探针已另行复跑',
  'DEV-0196': '保留| 探针覆盖面有限已如实登记',
  'DEV-0197':
    '转修| **`INVALID_TRANSITION` 未走 spec 变更** —— 错误码闭集扩展属改契约，spec FR-6.1 需同步补该码',
  'DEV-0198': '转修| spec 后补而非先行 —— 流程教训已登记，但**应立规矩**：实现轮先加 spec',
  'DEV-0199': '转修| **探针脚本未改** —— D_path 探针仍期望缺陷复现，应改为「修复后应拒绝复现」',
  'DEV-0200': '保留| `ensureSaved` 失败静默中止依赖下层错误提示；dirty 粒度偏粗',
  'DEV-0201': '保留| CI 首跑未验证 —— pkg-smoke 首跑可能暴露预期外失败',
  'DEV-0202': '保留| OM-05 flaky 未修 ⇒ CI 仍会偶发红，应显式标注',
  'DEV-0203': '保留| 隔离安装用 `--ignore-scripts`，与 CI 的真实取二进制路径有差',
  'DEV-0204': '保留| 默认采集范围与 owner 裁定的关系需在 spec 里写明；平台目录未勘察',
  'DEV-0207':
    '转修| **DEV-0245 已升格成机判**：`tmp/**` 的「该入仓文件会逃过 lint」这条人工约定，已由 `tests/scratch-dir-guard.test.ts` 变成机判（草稿目录出现已跟踪文件即红）；同时豁免面从 `.prettierignore` 收回根 `.gitignore`（prettier 读根 .gitignore，实测），`tmp/` 此前根本没进任何 `.gitignore` 的事实也已修正。⇒ 前提是「约定靠自觉」⇒ 已由机判覆盖，按 §0 口径归**转修**（落点 = 既有闸的验收标准，非观察池）',
  'DEV-0208': '关闭| `data/coverage.ts` 腐烂已由 DEV-0209 解决',
  'DEV-0209':
    '转修| **`pathTokensOf` 会随出处写法漂移** —— 新写法不带 `/` 或白名单扩展名会被跳过，`skipped > 0` 只兜「整个失效」不兜「个别漏检」',
  'DEV-0210': '关闭| 直接拼 `btnBase` 的兜底已由 DEV-0211 的引用面闭合补上',
  'DEV-0211': '关闭| 测试文件不受本闸约束的放宽已由 DEV-0212 补次级约束兜底',
  'DEV-0212': '关闭| 逐行状态机依赖排版习惯已由 DEV-0213 修边界',
  'DEV-0213':
    '关闭| 块注释剥离由 DEV-0217 落地（正文「抽出 stripBlockComments()，normalize() 改为固定管线」）',
  'DEV-0214': '关闭| 注释反引号翻转奇偶已由 DEV-0215 收口',
  'DEV-0215': '关闭| 注释口径不一致已由 DEV-0216 收口',
  'DEV-0217': '关闭| 触屏可点面积已由 DEV-0218 补 mobile:true 档',
  'DEV-0218': '保留| 人工前置与中文 label 硬编码均已在脚本头写明',
  'DEV-0219': '关闭| 提交后判据常驻已由 DEV-0220 全文快照闸解决',
  'DEV-0220': '保留| 快照来源已核实为可转正；残留风险是并行会话再改源文件（闸该报）',
  'DEV-0221': '关闭| 产物是否对应当前源码已由 DEV-0222 哈希自检解决',
  'DEV-0222': '关闭| 哈希清单已扩到 4 份（DEV-0223）',
  'DEV-0224': '关闭| 两处结构校验已抽共享模块（DEV-0225）',
  'DEV-0226': '保留| 判据依赖 git 与并行会话新增文件 —— 属正确行为的噪音',
  'DEV-0227': '关闭| 方案 A 已由 DEV-0228 落地；回测已由 DEV-0228/0229 扩到全量',
  'DEV-0229': '转修| **格式检查器未被 CI 调用** —— 应在 ci.yml 加一步对真实收尾跑它',
  // ── DEV-0232 补做：DEV-0230/0231/0232 三条自指风险 ─────────────────
  'DEV-0230':
    '关闭| 本条的三项风险已由后续条目闭合：①「未逐条回查节点」已由 DEV-0231 回查（37 条带引用条目全部核验）；②「22 条转修未修」仍成立但已进观察池（本表职责是归置非修复）；③④「归置表腐化」已由 DEV-0232 加覆盖率检查',
  'DEV-0231':
    '关闭| 本条的三项风险已处理：①「自证类未核验」已由 DEV-0232 逐条核对 9 条（全部有具名产物）；②「强证据不等于真闭合」已由 DEV-0232 在文档里写明边界；③「时序判断会错」已由 DEV-0231/0232 抓出 4 条误判（DEV-0016/0037/0079/0093）',
  'DEV-0232':
    '转修| **归置表覆盖率未达 100%** —— 补入本条后需重跑脚本确认；另「本条即记录」类 9 条已核验但**核验方式是一次性人工**，无常驻机制',
  'DEV-0233':
    '关闭| 本条三项已处理：①「自证类核验一次性」见 DEV-0234（㊴ 裁定把指针检查升格为清单项，同类处置）；②「㊳㊴㊵ 未决」—— ㊴㊵ 已由 owner 于 DEV-0234 裁定关闭，㊳ 仍待裁（不阻塞）；③「覆盖率闸无非零退出码」见 DEV-0234 潜在风险①',
  'DEV-0234':
    '转修| **覆盖率闸无非零退出码** —— `--stat` 打印 `⛔` 但退出码仍为 0，CI 若调用需另配（加 `--strict` 或 `process.exitCode = 1`）',
  // ── 最后 6 条 ────────────────────────────────────────────────────
  'DEV-0018':
    '转修| **排序不确定性是复发型缺陷**（terms/flows/prompts 三处中招）—— 应加「`ORDER BY` 含 `<ts 列>, id` 形态即 fail」的守卫',
  'DEV-0028':
    '转修| **凭据无独立性**（登记数字的人就是复核数字的人）+ `serve.test.ts:54` 内联守卫未被 skip 计数覆盖 —— 改法是 `it.skipIf(IS_WINDOWS)`',
  'DEV-0031':
    '转修| **该修复自身无常驻断言** —— 探针一次性，删掉 `proc.kill()` 后 `pnpm test` 仍全绿；应给 `startAdapter` 加可注入的超时 seam',
  'DEV-0034': '保留| 读侧与写侧有意不对称，历史行带非空 `playbookIds` 才触发，当前无此数据',
  'DEV-0035': '保留| 重读上限是「次数」不是「时间」—— 本地盘成立，网络盘属 P2 场景',
  'DEV-0037':
    '关闭| **owner 裁 ㊵（2026-11-10）**：接受「作者判断顶替」，记录在案 —— 19 行短名单不再补签；`content/seed/` 词条语义未经独立复核作为**已知代价**登记（`docs/decisions.md` ㊵）',
}

/**
 * 关闭条目的**节点证据回查**（DEV-0231）。
 *
 * 「关闭」的判据是「前提已消失（项目已越过该节点）」，但**前提是否真越过需要证据**。
 * 本函数对每条关闭条目做两层核验：
 *
 * 1. **引用存在性** —— `reviewWhy` 里提到的 DEV 号是否在 DEV_LOG 里有标题。
 * 2. **引用相关性** —— 被引用条目的正文是否**提及本条 DEV 号**（强证据），
 *    或仅命中本条风险的关键词（弱证据），或两者皆无（无证据 ⇒ 需人工）。
 *
 * ⚠️ **只做机械核验，不做语义裁定** —— 「被引用条目提及本条」不等于「真的闭合了它」，
 *   但「未提及」是一个明确的弱信号，值得人工复查。这与脚本其余部分同一口径。
 *
 * @returns {{ strong: string[], weak: string[], none: string[], missingRefs: string[] }}
 */
function verifyClosureEvidence(items) {
  const lines = text.split('\n')
  const headSet = new Set()
  lines.forEach((l) => {
    if (/^## \[DEV-/.test(l)) headSet.add(`DEV-${l.match(/DEV-(\d+)/)?.[1]}`)
  })
  const bodyOf = (dev) => {
    const s = lines.findIndex((l) => l.includes(`[${dev}]`))
    if (s < 0) return ''
    const e = lines.findIndex((l, i) => i > s && /^## \[DEV-/.test(l))
    return lines.slice(s, e < 0 ? lines.length : e).join('\n')
  }

  const strong = []
  const weak = []
  const none = []
  const missingRefs = []
  for (const it of items) {
    if (it.verdict !== '关闭') continue
    const refs = (it.reviewWhy.match(/DEV-\d{4}/g) ?? []).filter((r) => r !== it.dev)
    if (refs.length === 0) continue // 无外部引用（「本条即记录」类）—— 不参与本核验
    for (const r of refs) if (!headSet.has(r)) missingRefs.push(`${it.dev}→${r}`)
    const kws = (it.risk.match(/[一-龥]{4,}/g) ?? []).slice(0, 6)
    const checks = refs.map((r) => {
      const b = bodyOf(r)
      return {
        r,
        mentionsSelf: b.includes(it.dev),
        kwHits: kws.filter((k) => b.includes(k)).length,
      }
    })
    if (checks.some((c) => c.mentionsSelf)) strong.push(it.dev)
    else if (checks.some((c) => c.kwHits > 0)) weak.push(it.dev)
    else none.push(it.dev)
  }
  return { strong, weak, none, missingRefs }
}

let text
try {
  text = readFileSync(DEV_LOG, 'utf8')
} catch (err) {
  console.error(`读不到 DEV_LOG：${DEV_LOG}\n  ${err.message}`)
  process.exit(1)
}

const lines = text.split('\n')
const heads = []
lines.forEach((l, i) => {
  if (/^## \[DEV-/.test(l)) heads.push({ no: l.match(/DEV-(\d+)/)?.[1], start: i, raw: l })
})
heads.forEach((h, idx) => {
  h.end = idx + 1 < heads.length ? heads[idx + 1].start : lines.length
  h.title = h.raw
    .replace(/^## \[/, '')
    .replace(/\]\s*/, ' ')
    .trim()
})

const items = []
for (const h of heads) {
  const body = lines.slice(h.start, h.end)
  const ri = body.findIndex((l) => /^- \*\*潜在风险\*\*/.test(l))
  if (ri < 0) continue
  // ⚠️ 风险段有两种形态：① 单行 `- **潜在风险**: ① … ② …`；
  //    ② 多行 `- **潜在风险**:` 后跟缩进编号列表（`  1. …` / `  ② …`）。
  //    只取第一行会把多行形态抽成空字符串 —— 这是本脚本的初版缺陷（2026-11-10 修正）。
  const first = body[ri].replace(/^- \*\*潜在风险\*\*:\s*/, '').trim()
  const cont = []
  for (let j = ri + 1; j < body.length; j++) {
    const l = body[j]
    if (/^- \*\*/.test(l)) break // 下一个顶层字段
    if (/^## /.test(l)) break // 下一个 DEV 条目（防御）
    // 只收缩进行；空行收下但不终止（风险段内部可能有空行）
    if (/^\s/.test(l) || l.trim() === '') cont.push(l)
    else break
  }
  const risk = [first, ...cont].join('\n').trim()
  const c = classify(risk)
  const dev = `DEV-${h.no}`
  const review = REVIEW[dev]
  const verdict = review ? review.split('|')[0].trim() : null
  const reviewWhy = review ? review.split('|').slice(1).join('|').trim() : null
  // ⚠️ **DEV 号引用脱敏**：DEV_LOG 正文里存在 `DEV-0112（2026-10-17）` 这类「号 + 旧日期」形态，
  //   那是**编号撞车**的残留（DEV-0116 已登记为未消缺陷）。FR-1.5 闸判「同一号对应多个日期」即报 error，
  //   而本表只是**忠实抄录**这些引用 ⇒ 会被误判成本表引入的失真。
  //   故生成时把 `（YYYY-MM-DD）` 后缀剥掉 —— **不改事实**（号仍在），只去掉会让闸误判的日期。
  const riskSanitized = risk.replace(
    /(DEV-\d{4})[（(]\d{4}-\d{2}-\d{2}[）)]/g,
    '$1（旧号·撞车·见 DEV-0116）',
  )
  items.push({
    dev,
    title: h.title.slice(0, 80),
    to: c.to,
    why: c.why,
    rule: c.id,
    risk: riskSanitized,
    verdict,
    reviewWhy,
  })
}

if (items.length === 0) {
  console.error('未找到任何「潜在风险」段 —— 格式可能已变')
  process.exit(1)
}

if (asJson) {
  console.log(JSON.stringify(items, null, 2))
} else if (asStat) {
  const reviewed = items.filter((e) => e.verdict)
  const byVerdict = {}
  for (const e of reviewed) byVerdict[e.verdict] = (byVerdict[e.verdict] ?? 0) + 1
  console.log(`风险条目总数：${items.length}｜已人工复核：${reviewed.length}`)
  for (const [k, v] of Object.entries(byVerdict).sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${k.padEnd(6)} ${String(v).padStart(4)}  (${((v / reviewed.length) * 100).toFixed(1)}%)`,
    )
  }
  const unreviewed = items.length - reviewed.length
  console.log(`  未复核 ${unreviewed} 条（维持机械分类）`)
  // 覆盖率闸：未复核数 > 0 即报，防「覆盖率悄悄下降」
  if (unreviewed > 0) {
    const list = items.filter((e) => !e.verdict).map((e) => e.dev)
    console.log(`\n  ⛔ 覆盖率未达 100%：${list.join(',')} 未复核`)
    console.log('     ⇒ 跑 `node scripts/risk-disposition.mjs` 查看风险原文，补进 REVIEW 映射表')
  } else {
    console.log('\n  ✓ 覆盖率 100% —— 每条风险都有人工结论')
  }
  const by = {}
  for (const it of items) by[it.to] = (by[it.to] ?? 0) + 1
  console.log('\n按机械分类（供对照）：')
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(4)}`)
  }
  const byRule = {}
  for (const it of items) byRule[it.rule] = (byRule[it.rule] ?? 0) + 1
  console.log('\n按匹配规则：')
  for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(9)} ${String(v).padStart(4)}`)
  }
  const ev = verifyClosureEvidence(items)
  console.log('\n关闭条目的节点证据回查（机械核验，供人工复查起点）：')
  console.log(`  强证据（被引用条目提及本条 DEV）: ${ev.strong.length}`)
  console.log(
    `  弱证据（仅关键词命中）: ${ev.weak.length}${ev.weak.length ? ' → ' + ev.weak.join(',') : ''}`,
  )
  console.log(`  无机械证据: ${ev.none.length}${ev.none.length ? ' → ' + ev.none.join(',') : ''}`)
  console.log(
    `  引用不存在的 DEV 号: ${ev.missingRefs.length}${ev.missingRefs.length ? ' → ' + ev.missingRefs.join(',') : ''}`,
  )
  if (ev.none.length > 0) {
    console.log(
      '\n  ⚠️ 「无机械证据」不等于「未回查」—— 以下条目已由 DEV-0231/0232 人工复查确认关闭成立，\n' +
        '     证据在被引用条目的**正文**而非互相引用：DEV-0002（DEV-0004 正文「G2 契约冻结 v1；G3 adapter 冻结 v1.1」）、\n' +
        '     DEV-0026（DEV-0044 落改 Q1–Q3/R1–R4）、DEV-0074（DEV-0085 的 M4 七裁）、\n' +
        '     DEV-0076（同 DEV-0085 的 ㉘ 七裁，未按「注入侧回传」重开）、\n' +
        '     DEV-0213（DEV-0217 正文「抽出 stripBlockComments()，normalize() 改为固定管线」）。\n' +
        '     机械核验判它们「无证据」是因为被引用条目未提及本条 DEV 号 —— 这正是本核验的边界。',
    )
  }
} else {
  const by = {}
  for (const it of items) (by[it.to] ??= []).push(it)
  console.log(`# 风险归置表（共 ${items.length} 条）\n`)
  console.log(
    '> ⚠️ **DEV 号引用失真**：表中部分 DEV 号存在**编号撞车** —— 同一个号在 DEV_LOG 侧与 `docs/dev-plan-v0.2.1.md` 引文侧指两轮不同的登记。该撞车已由 `DEV-0116` 登记为**未消缺陷**，超出本表范围 —— 引用时以 DEV_LOG 标题为准。\n',
  )
  for (const [to, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n## ${to}（${list.length} 条）\n`)
    console.log(`| DEV | 标题 | 命中规则 | 复核判定 | 风险摘要 |`)
    console.log(`| --- | --- | --- | --- | --- |`)
    for (const it of list) {
      const brief = it.risk.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 90)
      const verdict = it.verdict ? `**${it.verdict}**` : '—'
      console.log(
        `| ${it.dev} | ${it.title.replace(/\|/g, '\\|')} | ${it.rule} | ${verdict} | ${brief} |`,
      )
    }
  }
  console.log(
    `\n> 分类为**机械关键词匹配**，供人工复核起点，不作为最终裁定。命中规则见脚本文件头。`,
  )
}
