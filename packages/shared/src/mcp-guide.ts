// `packages/shared/src/mcp-guide.ts` —— 各平台 MCP 接入配置口径（Web「一键接入」的数据源）
//
// ## 它解决什么
//
// 「让 agent 接入」此前只生成 `openvibe pack export --targets <id>` —— **那不是真实命令**
// （CLI 无 `pack` 子命令，见 `apps/cli/src/index.ts` 的命令注册表）。真实接入动作是
// `openvibe sync <项目路径> --target <id>`（写标准包）+ 让 agent 能查上下文（MCP）。
//
// ## ⚠️ 口径从哪来（诚实标注，别把参考当实测）
//
// | 平台 | 配置路径 | 来源 | 实测 |
// | ---- | -------- | ---- | ---- |
// | claude-code | `.mcp.json`（项目根） | Claude Code 官方文档 | 否 |
// | cursor | `.cursor/mcp.json` | Cursor 官方文档 | 否 |
// | trae | `.trae/mcp.json` | Trae 官方文档 | 否 |
// | codebuddy | `~/.codebuddy/mcp.json` | CodeBuddy 官方文档 | 否 |
// | minicode | `mcp.json`（项目根） | 第三方参考（LobeHub） | 否 |
// | generic-agents | 随具体 agent | 第三方参考（MindOS） | 否 |
//
// ⚠️ **全部未经本机实测** —— `DEV_LOG.md` 早已登记「真机 AI IDE 的握手差异未实测」。
//   本模块只**如实标注来源**，不假装已验证；`verified: false` 是该事实的机器可读形态。
// ⚠️ `generic-agents` **不进表**：它覆盖 Codex / Kimi Code / zcode 等，各家配置路径与
//   格式都不同（Codex 是 TOML `~/.codex/config.toml`，Kimi Code 是 `~/.kimi/mcp.json`）
//   ⇒ 无统一口径，硬给一个即编造。调用方对「不在表内」的平台显示「随具体 agent」。
import type { AdapterId } from './constants'

/** 写进各 IDE 配置的 MCP server 名 */
export const MCP_SERVER_NAME = 'openvibe'

/** stdio 启动命令（`openvibe mcp` 是真实命令，见 `apps/cli/src/commands/mcp.ts`） */
export const MCP_COMMAND = 'openvibe'
export const MCP_ARGS = ['mcp']

export interface McpPlatformGuide {
  /** 配置文件路径（相对项目根；`~` 开头 = 全局配置） */
  configPath: string
  /** 顶层键名（各家几乎都是 `mcpServers`） */
  key: string
  /** 口径来源（写进生成的配置里，供人核对） */
  source: string
  /** 是否本机实测过 —— **当前全部为 false**（见文件头） */
  verified: boolean
}

/**
 * 有统一口径的平台。
 *
 * ⚠️ 用 `Partial<Record>` 而不是 `Record`：**不在表内 = 无统一口径**，
 *   这是一个**有意义的空值**（generic-agents），不是「漏填」。
 */
export const MCP_GUIDE: Partial<Record<AdapterId, McpPlatformGuide>> = {
  'claude-code': {
    configPath: '.mcp.json',
    key: 'mcpServers',
    source: 'Claude Code 官方文档',
    verified: false,
  },
  cursor: {
    configPath: '.cursor/mcp.json',
    key: 'mcpServers',
    source: 'Cursor 官方文档',
    verified: false,
  },
  trae: {
    configPath: '.trae/mcp.json',
    key: 'mcpServers',
    source: 'Trae 官方文档',
    verified: false,
  },
  codebuddy: {
    configPath: '~/.codebuddy/mcp.json',
    key: 'mcpServers',
    source: 'CodeBuddy 官方文档',
    verified: false,
  },
  minicode: {
    configPath: 'mcp.json',
    key: 'mcpServers',
    source: '第三方参考（LobeHub，未实测）',
    verified: false,
  },
}

/**
 * 给路径加 shell 单引号。
 *
 * ⚠️ 项目路径**常含空格**（`/Users/x/my proj`）—— 不加引号会让 `openvibe sync` 把
 *   一个路径拆成两个参数，报的是「路径不存在」这类**误导性错误**。
 * ⚠️ 单引号内的单引号按 `'\''` 转义（POSIX 标准写法），不省略。
 */
function shellQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`
}

/** 单个平台的 MCP 配置片段（JSON）；无统一口径返回 `null` */
export function mcpSnippet(adapter: AdapterId): string | null {
  const g = MCP_GUIDE[adapter]
  if (!g) return null
  return JSON.stringify(
    {
      [g.key]: {
        [MCP_SERVER_NAME]: { type: 'stdio', command: MCP_COMMAND, args: [...MCP_ARGS] },
      },
    },
    null,
    2,
  )
}

/**
 * 生成完整接入脚本（可整段复制）。
 *
 * ## 它包含什么
 *
 * 1. **写标准包**：一条 `openvibe sync <项目路径> --target …`（`--target` 可重复）。
 * 2. **MCP 配置**：逐平台给出配置片段与落点；**全局配置只打印不自动写**
 *    （避免覆盖用户既有配置），项目级配置带「已存在则改为打印」的守卫。
 *
 * ⚠️ 本函数**只生成文本**，不执行、不写盘（守 FR-5.1.4 / B21）。
 * ⚠️ `projectPath` 为空串时**不生成 sync 命令** —— 缺少路径的命令是错的命令，
 *   给一句中文说明代替（同「宁可不给也不给错」的纪律）。
 */
export function buildSetupScript(projectPath: string, targets: readonly AdapterId[]): string {
  const lines: string[] = [
    '# ══════════════════════════════════════════════════',
    '# OpenVibe 接入脚本 · 由 OpenVibe 生成',
    '# ⚠️ 只生成不执行 —— 请确认后自行运行（守 FR-5.1.4 / B21）',
    '# ══════════════════════════════════════════════════',
    'set -e',
    '',
  ]

  lines.push(`# ── 1. 把标准包写进项目（所选平台：${targets.join('、')}）──`)
  if (projectPath === '') {
    lines.push('# ⚠️ 项目未登记本地路径，无法生成 sync 命令 —— 请先在项目设置里补上路径。')
  } else {
    lines.push(
      `openvibe sync ${shellQuote(projectPath)} ${targets.map((t) => `--target ${t}`).join(' ')}`,
    )
  }
  lines.push('')
  lines.push('# ── 2. MCP 配置（让 agent 能查项目上下文）──')

  for (const t of targets) {
    const g = MCP_GUIDE[t]
    if (!g) {
      lines.push(`# ${t}：MCP 配置随具体 agent，无统一口径（agent 经 AGENTS.md 读项目标准）`)
      lines.push('')
      continue
    }
    const snippet = mcpSnippet(t) ?? ''
    lines.push(`# ${t} → ${g.configPath}（来源：${g.source}）`)
    if (g.configPath.startsWith('~')) {
      // 全局配置：**只打印**，不自动写 —— 覆盖用户既有配置的风险太大
      lines.push(`echo '请把下面内容合并进 ${g.configPath}（勿直接覆盖既有配置）：'`)
      lines.push(`cat <<'OV_MCP_EOF'`)
      lines.push(snippet)
      lines.push('OV_MCP_EOF')
    } else {
      lines.push(`mkdir -p $(dirname ${g.configPath})`)
      lines.push(`if [ ! -f ${g.configPath} ]; then`)
      lines.push(`cat > ${g.configPath} <<'OV_MCP_EOF'`)
      lines.push(snippet)
      lines.push('OV_MCP_EOF')
      lines.push('else')
      lines.push(`echo '已存在 ${g.configPath}，请手动合并：'`)
      lines.push(`cat <<'OV_MCP_EOF'`)
      lines.push(snippet)
      lines.push('OV_MCP_EOF')
      lines.push('fi')
    }
    lines.push('')
  }
  return lines.join('\n')
}
