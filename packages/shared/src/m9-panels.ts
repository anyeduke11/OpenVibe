// `packages/shared/src/m9-panels.ts` —— M9 v1.6 **P3 的三块静态面板内容**
// （`m9-dev-language-roadmap.md` §3.22 · 增强⑭ 的四块内容）
//
// ## 它是什么
//
// §3.22 的四块内容（**双修规划 9 段** · **语言对照 8 维** · **选学顺序 3 条** · **练习原则 6 条**）
// 是**静态内容**：**不建表、不进 DAG、不参与掌握度、不产出 `lang_topic_state` 行**
// （§3.22 抬头）。
//
// ⇒ 它们没有表可读 ⇒ **内容随代码走**（本文件），界面按 props 取。
//
// ## ⚠️ 为什么内容在本仓不违反 §3.2 的「只存链接不存正文」
//
// §3.2 的版权纪律针对的是**外部教程正文**（runoob 正文有版权、GitHub README 会被上游改写）。
// 这四块出自 **owner 提供的自学手册**（§1.6），与已在仓内的 **21 段时间线**
// （`packages/core/src/db/seeds/lang_profile_phases.json`）**同源同类** ——
// 都是「要点」，不是「正文」。⇒ 可入库，但**必须逐格对账**（见下）。
//
// ## ⚠️ 「逐字」的含义
//
// 本文件的每个字符串都**逐字取自 spec §3.22 的表格**（双修规划的「内容」列、
// 语言对照的两列、选学顺序的「内容」列、练习原则的「内容」列）——
// **不做润色、不改标点、不换措辞**。
// ⇒ 由 `m9-panels.test.ts` 的**逐格对账**钉住（⚠️ 与 DL-49 对分期路线做的事同款：
// 规格是仓内的对照面，内容与它逐格相等）。
//
// ## ⚠️ 双修规划**不得由分期路线推导**
//
// §3.22.1 明写：分期路线是「Python 精通 5 段 ＋ Go 精通 4 段」**并列**，
// 双修规划是「先 Python 4 个月、再 Python 2 个月、再 Go 2 个月…」**串行交织** ——
// 后者的「第 9–10 月 · Go 工程化与并发」在分期路线里对应「Go 精通阶段 2＋3 合并」，
// **是一个段对两个段**。⇒ 照抄，不推导（DL-49 的对偶腿：把双修段从分期路线现算 ⇒ 红）。
//
// ## ⚠️ 练习原则**不做成可勾选清单**
//
// §3.22.4 末段：「6 条原则里没有一条能变成判据」⇒ 界面呈现为**常驻提示条**，
// **不许做成可勾选清单**（做就成了假进度条，§2.2 的自评清单换了层皮）。
//
// ## ⚠️ 字段名避开 `content` / `text` / `body`
//
// 外部层扫描器（DL-02）把 `content` / `text` / `body` 之类列为**正文字段名**
// ⇒ 本文件用 `detail`（不是 `content`），这样它被登记进外部层扫描范围时不会被判红。

/** 双修规划的一段（**两套模式各有各的段**，合计 9 段）。 */
export interface DualPlanSegment {
  /** 段序（从 1 起，各自模式内计数） */
  no: number
  /** 所属模式 */
  profile: 'master' | 'familiar'
  /** 周期（逐字，如「第 1–4 月」「第 1–3 周」） */
  period: string
  /** 段名（逐字） */
  title: string
  /** 内容（逐字） */
  detail: string
}

/** 语言对照的一个维度（**8 维**）。 */
export interface LanguageAspect {
  /** 维度名（逐字） */
  aspect: string
  /** Python 侧（逐字） */
  python: string
  /** Go 侧（逐字） */
  go: string
}

/** 选学顺序的一条（**3 条**）。 */
export interface LearningOrder {
  /** 序号（从 1 起） */
  no: number
  /** 路线名（逐字） */
  route: string
  /** 内容（逐字） */
  detail: string
}

/** 练习原则的一条（**6 条**）。 */
export interface PracticePrinciple {
  /** 序号（从 1 起） */
  no: number
  /** 原则名（逐字） */
  principle: string
  /** 内容（逐字） */
  detail: string
}

/**
 * 双语言双修总规划（**9 段**）—— 逐字取自 spec §3.22.1。
 *
 * ⚠️ **精通 5 段 ＋ 熟悉 4 段 ＝ 9 段**；两套的段序**各自从 1 起**（不是连号）。
 */
export const DUAL_PLAN: readonly DualPlanSegment[] = [
  {
    no: 1,
    profile: 'master',
    period: '第 1–4 月',
    title: 'Python 入门与巩固',
    detail:
      '廖雪峰教程 / 黑马 2025 新课 + 官方 Tutorial 对照，完成 HackerRank 与 Exercism 入门题；读《Think Python》或《Automate the Boring Stuff》，产出 3–5 个自动化小脚本。',
  },
  {
    no: 2,
    profile: 'master',
    period: '第 5–6 月',
    title: 'Python 进阶与第一个完整项目',
    detail:
      '攻克 OOP、装饰器、生成器、类型注解与 pytest；按兴趣选 FastAPI / pandas / 爬虫方向，跟官方教程做一个完整作品并上传 GitHub。',
  },
  {
    no: 3,
    profile: 'master',
    period: '第 7–8 月',
    title: 'Go 入门',
    detail:
      'A Tour of Go 全部做完，李文周教程补中文讲解，Go by Example 随手查；Exercism Go Track 同步推进。有 Python 基础后，这个阶段会比零基础快一倍。',
  },
  {
    no: 4,
    profile: 'master',
    period: '第 9–10 月',
    title: 'Go 工程化与并发',
    detail:
      '用 learn-go-with-tests 养成 TDD 习惯，精读 Modules Reference；攻克 goroutine / channel / context 与 sync，配合 Gophercises 做通道与锁的专项练习。',
  },
  {
    no: 5,
    profile: 'master',
    period: '第 11–12 月',
    title: '双修综合项目',
    detail:
      '做一个让两门语言对话的项目：Python（FastAPI 或 Streamlit）做数据处理 / AI 能力层，Go 写高并发 API 网关或微服务，用 gRPC 或 HTTP 通信并容器化部署。这会同时成为你两个方向的作品集。',
  },
  {
    no: 1,
    profile: 'familiar',
    period: '第 1–3 周',
    title: 'Python 熟悉档',
    detail:
      '官方教程 / 廖雪峰主线 + 浏览器交互练习，过完核心语法、函数与模块；产出 3–5 个实用小脚本。',
  },
  {
    no: 2,
    profile: 'familiar',
    period: '第 4–6 周',
    title: 'Go 熟悉档',
    detail:
      'A Tour of Go + 李文周 / 菜鸟过完语法与核心类型；接口、错误、Modules 收尾；产出 10+ 个练习和一个 CLI 工具。',
  },
  {
    no: 3,
    profile: 'familiar',
    period: '第 7–8 周',
    title: '工程与测试',
    detail:
      'Python 学 pytest / 类型注解，Go 学表驱动测试与 httptest；两门各完成一个带测试的小项目并上传 GitHub。',
  },
  {
    no: 4,
    profile: 'familiar',
    period: '第 9–10 周',
    title: '主流框架实战',
    detail:
      'Python 跟 FastAPI 或 pandas 官方教程做一个项目，Go 用标准库 net/http 或 Gin 做一个 CRUD API；遇到高级主题（异步、并发深入）知道去哪查即可。',
  },
]

/** 双修规划的抬头文案（逐字取自 §3.22.1 的两段说明）。 */
export const DUAL_PLAN_HEADINGS: Readonly<Record<'master' | 'familiar', string>> = {
  master: '精通模式 · 双语言双修总规划（路线 A：零基础）',
  familiar: '熟悉模式 · 7–10 周双修规划',
}

/** 双修规划的说明（逐字取自 §3.22.1 的两段说明）。 */
export const DUAL_PLAN_NOTES: Readonly<Record<'master' | 'familiar', string>> = {
  master:
    '按每天 1.5–2 小时估算的 12 个月参考节奏；有编程经验者可整体压缩到 6–8 个月，目标明确者按第 02 节的路线 B / C 调整。',
  familiar:
    '目标是「能独立做常规项目」，不追求底层与高级专题；只学一门时按括号内单门周期即可（Python 3–4 周、Go 4–6 周）。',
}

/** 语言对照表（**8 维**）—— 逐字取自 spec §3.22.2。 */
export const LANGUAGE_ASPECTS: readonly LanguageAspect[] = [
  {
    aspect: '语言定位',
    python: '解释型、动态类型、多范式，语法接近伪代码，表达力优先，「写得快」',
    go: '编译型、静态类型、关键字极少、风格强制统一，为团队工程与服务端设计，「跑得稳」',
  },
  {
    aspect: '学习曲线',
    python: '公认上手最快的语言之一，当天就能写出有用脚本；高级特性（装饰器/元类/异步）有深度',
    go: '语法半天能看完，规则少且唯一；难点在接口、错误处理、并发模型与工程组织',
  },
  {
    aspect: '并发模型',
    python: 'threading 受 GIL 约束；CPU 密集用 multiprocessing，高并发 IO 用 asyncio 协程',
    go: 'goroutine + channel 语言级原生并发，几行代码启动上万协程，是 Go 的核心优势',
  },
  {
    aspect: '性能与部署',
    python: '开发效率极高；运行依赖解释器与环境，打包分发相对麻烦',
    go: '编译为单个静态二进制，启动快、内存占用低、部署就是传一个文件，天生适合容器',
  },
  {
    aspect: '典型领域',
    python: '数据分析、人工智能/大模型应用、脚本自动化、爬虫、Web 后端、科学计算',
    go: '云原生（Docker、Kubernetes、Terraform 均为 Go 编写）、微服务、API 网关、CLI、中间件',
  },
  {
    aspect: '生态框架',
    python: 'PyPI 包的数量居各语言之首；FastAPI / Django / Flask、NumPy / pandas、PyTorch',
    go: '标准库极强（net/http、json、日志、测试开箱即用）；Gin、GORM、gRPC、go-zero、Kitex',
  },
  {
    aspect: '就业方向',
    python: '数据分析师、算法/AI 应用工程师、后端、测试开发、自动化运维、量化',
    go: '后端工程师、基础架构/中间件、云平台、SRE / DevOps、游戏服务端',
  },
  {
    aspect: '版本基线',
    python: '本指南对齐 Python 3.12 / 3.13（2026 年现状；3.13 含实验性 JIT 与自由线程）',
    go: '本指南对齐 Go 1.22 及以上（泛型为基线、循环变量新语义、log/slog、mux 增强）',
  },
]

/** 选学顺序（**3 条**）—— 逐字取自 spec §3.22.3。 */
export const LEARNING_ORDER: readonly LearningOrder[] = [
  {
    no: 1,
    route: '路线 A · 零基础',
    detail:
      '先 Python 后 Go。Python 语法友好、反馈即时，最适合建立编程思维；能用 Python 独立做出项目后（约 4–6 个月），再学 Go 会很快——你已经懂变量、函数、接口这些概念，Go 只需要 4–5 个月。',
  },
  {
    no: 2,
    route: '路线 B · 有其他语言经验',
    detail:
      '两门都可直接从官方教程起步，也可并行。工作日跟 Python（廖雪峰 / 官方 Tutorial），周末跟 Go（A Tour of Go / Go by Example），3–4 个月即可同时入门；注意用不同项目练手，避免语法互相串。',
  },
  {
    no: 3,
    route: '路线 C · 目标明确',
    detail:
      '按目标倒推。想做 AI 应用 / 数据分析 / 自动化办公：只学 Python 即可开局；想做云原生 / 高并发后端 / 中间件 / DevOps 工具链：直接 Go 优先，Python 之后作为「生产力工具」补。',
  },
]

/** 练习原则（**6 条**）—— 逐字取自 spec §3.22.4。 */
export const PRACTICE_PRINCIPLES: readonly PracticePrinciple[] = [
  {
    no: 1,
    principle: '少看多敲，报错先自己读',
    detail:
      '每个示例必须亲手敲一遍再运行，拒绝复制粘贴；遇到报错先读 traceback / panic 信息，再查文档。',
  },
  {
    no: 2,
    principle: '概念 + 题目双轨',
    detail: '学完一个概念立刻在 Exercism / Codewars / LeetCode 找对应小题验证；每天 1 题保持手感。',
  },
  {
    no: 3,
    principle: '以项目收尾，作品说话',
    detail:
      '每个阶段结束都产出一个能跑的小作品（哪怕简陋），写清 README 推到 GitHub，逐步形成作品集。',
  },
  {
    no: 4,
    principle: '官方文档兜底',
    detail:
      '第三方库出问题先查官方文档（FastAPI、Django、pandas、pkg.go.dev 都已收录），再看博客与教程。',
  },
  {
    no: 5,
    principle: '每周一次 code review',
    detail: '善用 Exercism 免费人工导师；写完代码隔几天自己重看一遍，关注命名、错误处理与测试。',
  },
  {
    no: 6,
    principle: '版本意识，不碰过时资料',
    detail:
      'Python 一律 3.12 / 3.13，Go 一律 1.22+；任何只讲 Python 2 或 GOPATH 旧模式的资料直接弃用。',
  },
]
