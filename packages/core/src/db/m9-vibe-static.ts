// `packages/core/src/db/m9-vibe-static.ts` —— M9 v1.6 **P1d.5 · 速成专区的四块静态内容**
// （`m9-dev-language-roadmap.md` §3.17 / §3.17.2 · **DL-35**）
//
// ## 它是什么
//
// 附件 CHAPTER 06 的四块内容，**逐字**转成机器可读常量，供速成专区的界面直接渲染：
//   ① 速成后应该具备的 **6 项能力**
//   ② 每门语言的 **7 项最小必要知识**（Python 7 + Go 7）
//   ③ **Vibe Coding 4 步工作流**
//   ④ 新手最常见的 **6 个翻车点**
//
// ## ⚠️ 为什么它们是「静态内容」而不是数据
//
// §3.17 的裁定：**不建表、不进 DAG、不参与掌握度、不产出 `lang_topic_state` 行**。
// 理由：它们**没有一项有代码证据可查** ——「会读报错」「会小步迭代」既不是代码模式
// 也不是项目活动；硬要纳入掌握度就是 §2.2 拒绝的自评清单。
//
// ⚠️ **但 6 段时间线照常进 `lang_profile_phases`**（§3.17.1 的 21 段里有 6 段是速成段）——
//   时间线是**时间**，其余四块是**叙述**，两者不混。
//
// ## ⚠️ 为什么内容是「逐字」而不是自撰
//
// §3.2 的版权纪律：**链接与要点可入库，长文正文不入库**。
// 这四块是附件里的**要点条目**（一行一条），不是长文正文 ⇒ 逐字转录是允许的，
// 且**必须逐字**：润色一次，附件与本模块就再也对不上。
// ⚠️ **对照面在 spec §3.17.2** —— 单测逐格比对「本模块 ↔ spec §3.17.2」。
//
// ## ⚠️ 为什么这里是「唯一出处」
//
// 四块内容各写一遍就多一处可能分叉的地方（spec 一份、代码一份、界面一份）。
// ⇒ **代码是机器可读的那一份**（界面直接 import），spec §3.17.2 是**给人看的那一份**，
// 单测逐格比对两者 ⇒ 分叉会被立刻抓住。

/** 一项最小必要知识。 */
export interface MinimalKnowledgeItem {
  /** 项名（如「变量与类型」） */
  name: string
  /** 一句话说明（逐字） */
  detail: string
}

/** 一项能力。 */
export interface VibeAbility {
  /** 能力名（逐字，如「看得懂」） */
  name: string
  /** 一句话说明（逐字） */
  detail: string
}

/** 工作流的一步。 */
export interface VibeWorkflowStep {
  /** 步骤号（1–4） */
  step: number
  /** 步骤名（逐字） */
  title: string
  /** 说明（逐字） */
  detail: string
}

/** 一个翻车点。 */
export interface VibePitfall {
  /** 翻车点名（逐字，如「幻觉 API」） */
  name: string
  /** 说明与对策（逐字） */
  detail: string
}

/**
 * ① **6 项能力** —— 速成后你应该具备的（附件 CHAPTER 06 的原文顺序）。
 *
 * ⚠️ **「会反馈 / 小步迭代 / 会兜底」是工作流能力** ——
 *   它们映射不到知识点（`VIBE_ABILITY_MAP` 里那三项是空数组），
 *   属静态内容，不进 DAG、不参与掌握度。
 */
export const VIBE_ABILITIES: readonly VibeAbility[] = [
  {
    name: '看得懂',
    detail:
      '能看懂 AI 生成的代码大概在做什么：变量、条件、循环、函数分别在干什么、调用了哪些库。',
  },
  {
    name: '会运行',
    detail:
      '能在本地或 AI 工具里运行项目，认识目录结构，会安装依赖、执行启动命令、打开运行结果。',
  },
  {
    name: '读报错',
    detail:
      '报错时能定位到哪一行、属于哪类问题（找不到包 / 语法 / 网络 / 权限），并完整复制报错信息。',
  },
  {
    name: '会反馈',
    detail:
      '能向 AI 描述「我要什么、现在怎样、期望什么」，并附上报错、相关文件和复现步骤。',
  },
  {
    name: '小步迭代',
    detail:
      '让 AI 一次只改一个功能，每步立刻运行验证，而不是一次生成整个项目然后无从下手。',
  },
  {
    name: '会兜底',
    detail: '会用 Git 提交与回退，知道这次改了什么，翻车时能回到上一个能跑的版本。',
  },
]

/**
 * ② **7 项最小必要知识**（每门语言 7 项）。
 *
 * ⚠️ **与知识点不是一一对应**（§3.17 的登记）：其中「控制流」「运行与调试」
 *   在仓内没有独立条目 ⇒ 这七项**单独成面板**，不硬映射成 DAG 节点
 *   （造出没有前置边、没有代码证据的节点，比不映射更糟）。
 */
export const VIBE_MINIMAL_KNOWLEDGE: Record<'python' | 'go', readonly MinimalKnowledgeItem[]> = {
  python: [
    { name: '变量与类型', detail: '数字、字符串、布尔、列表、字典是什么，AI 写出来能认。' },
    { name: '控制流', detail: 'if 条件、for 循环、while 大概长什么样。' },
    { name: '函数', detail: 'def 定义、参数与返回值；知道 Python 代码块靠缩进区分。' },
    {
      name: '组织代码',
      detail: '一个文件即一个模块，import 怎么读；认识 main 文件、文件夹、配置文件的作用。',
    },
    { name: '错误处理', detail: 'try / except 长什么样；看到 Traceback 先读最后一行。' },
    { name: '安装依赖', detail: 'pip install、虚拟环境 venv、requirements.txt 各是什么。' },
    {
      name: '运行与调试',
      detail: 'python main.py 怎么跑，用 print 或调试器查看变量值。',
    },
  ],
  go: [
    { name: '变量与类型', detail: 'var 与 := 短声明、基本类型、切片 slice、映射 map。' },
    { name: '控制流', detail: 'if / for（Go 没有 while）、range 遍历集合。' },
    { name: '函数', detail: 'func、多返回值、函数也是值。' },
    { name: '组织代码', detail: 'package 与 import、go.mod 与 go mod tidy，目录约定。' },
    { name: '错误处理', detail: 'error 是返回值，常见 if err != nil 判空；panic 是什么。' },
    { name: '安装依赖', detail: 'go get、go mod tidy；标准库随 Go 自带、不用额外安装。' },
    {
      name: '运行与调试',
      detail: 'go run . 运行、go build 编译成单个二进制、go fmt 格式化。',
    },
  ],
}

/**
 * ③ **Vibe Coding 标准工作流（4 步循环）**。
 *
 * ⚠️ 这一块是**方法论**，不是知识 ⇒ 不进 DAG、不参与掌握度。
 */
export const VIBE_WORKFLOW: readonly VibeWorkflowStep[] = [
  {
    step: 1,
    title: '说清需求与上下文',
    detail:
      '先用一句话说清「做什么、给谁用、最核心的 3 个功能」；主动告诉 AI 技术栈、目录结构和已有文件；让它先给出实现计划与文件清单，确认后再写代码。',
  },
  {
    step: 2,
    title: '小步生成，拒绝一次成型',
    detail:
      '一个功能一个回合，每回合只改一个文件或一个函数；每完成一步立刻运行；大功能让 AI 先写骨架、再逐块填实现，不要让它一次吐出整个项目。',
  },
  {
    step: 3,
    title: 'Review 与验证',
    detail:
      '不盲信：对照最小知识清单读一遍代码，不懂就问「这段为什么这样写」；手动点一遍功能或跑测试；检查 AI 是否用了不存在的 API、库或参数。',
  },
  {
    step: 4,
    title: '报错闭环',
    detail:
      '把完整报错（最后几行 + 堆栈）原样贴回，附上你做了什么、期望结果；让 AI 先解释原因、再给修改；改完再验证；同一问题反复出现就换问法或回退版本。',
  },
]

/**
 * ④ **新手最常见的 6 个翻车点**。
 *
 * ⚠️ 最后一条是**安全红线**（不要把密钥贴进对话框）⇒ 界面渲染时不应折叠掉。
 */
export const VIBE_PITFALLS: readonly VibePitfall[] = [
  {
    name: '幻觉 API',
    detail:
      'AI 编造不存在的库、函数或参数——让它给出官方文档链接，或坚持用最主流的包。',
  },
  {
    name: '依赖装不上',
    detail:
      '先让 AI 解释 requirements.txt / go.mod 是什么；安装失败时把完整终端报错贴回去。',
  },
  {
    name: '一次生成太多',
    detail: '跑不起来且无法定位——让 AI 回退到上一个能跑的版本，拆成小步重做。',
  },
  {
    name: '环境问题',
    detail:
      '把你的操作系统、Python / Go 版本、项目目录结构告诉 AI，一半「玄学问题」因此消失。',
  },
  {
    name: '悄悄改坏',
    detail: 'AI 顺手改了无关文件——每完成一步用 Git 提交，review 改动后再继续。',
  },
  {
    name: '安全红线',
    detail:
      '不要把密钥、真实用户数据贴进对话框；不运行看不懂的危险命令（rm -rf、curl 管道执行、sudo 等）。',
  },
]

/**
 * ⚠️ **速成专区「不得空白」的兜底文案**（DL-35 的反证那一半）。
 *
 * 判据 DL-35 说：切到某模式得到空列表时**必须显示文案**，不许空白
 * （空白会被读成「功能坏了」）。
 * ⇒ 速成专区**恒有内容**：四块静态内容 + 6 段时间线（后者在 `lang_profile_phases`）。
 */
export const VIBE_EMPTY_STATE_TEXT = '速成专区暂无内容 —— 这不正常，请反馈。'

/** 四块静态内容的块数（自检用）。 */
export const VIBE_STATIC_BLOCK_SIZES = {
  能力: VIBE_ABILITIES.length,
  最小知识: VIBE_MINIMAL_KNOWLEDGE.python.length + VIBE_MINIMAL_KNOWLEDGE.go.length,
  工作流: VIBE_WORKFLOW.length,
  翻车点: VIBE_PITFALLS.length,
} as const
