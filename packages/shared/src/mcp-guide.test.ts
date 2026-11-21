// `packages/shared/src/mcp-guide.test.ts` —— 「一键接入」配置口径的判据。
//
// ## 它断什么
//
// ① **不编造**：无统一口径的平台（generic-agents）必须返回 `null`，而不是硬给一个；
// ② **不骗人**：所有平台的 `verified` 必须为 `false`（本机未实测，来源见文件头）；
// ③ **不代执行**：生成物里只有文本，没有任何会写盘的调用；
// ④ **不给错命令**：项目路径为空时不生成 `openvibe sync`（缺路径的命令是错的命令）。
import { describe, expect, it } from 'vitest'
import { ADAPTER_IDS } from './constants'
import { MCP_GUIDE, MCP_SERVER_NAME, buildSetupScript, mcpSnippet } from './mcp-guide'

describe('MCP 接入口径 · 来源诚实', () => {
  it('⚠️ 全部平台 verified=false —— 未经本机实测（DEV_LOG 已登记握手差异未实测）', () => {
    for (const g of Object.values(MCP_GUIDE)) {
      expect(g.verified, '有平台被标成已实测').toBe(false)
    }
  })

  it('⚠️ generic-agents 不进表（各家路径/格式不同，硬给即编造）', () => {
    expect(MCP_GUIDE['generic-agents']).toBeUndefined()
    expect(mcpSnippet('generic-agents')).toBeNull()
  })

  it('每个已登记平台都有非空来源与配置路径（否则生成物会说不出出处）', () => {
    for (const [id, g] of Object.entries(MCP_GUIDE)) {
      expect(g, `${id} 缺来源`).toBeTruthy()
      expect(g.source.length, `${id} 来源为空`).toBeGreaterThan(0)
      expect(g.configPath.length, `${id} 配置路径为空`).toBeGreaterThan(0)
      expect(g.key, `${id} 顶层键为空`).toBe('mcpServers')
    }
  })
})

describe('MCP 片段 · 形状', () => {
  it('是合法 JSON，顶层键与 server 名都对', () => {
    const snippet = mcpSnippet('claude-code')
    expect(snippet).not.toBeNull()
    const parsed = JSON.parse(snippet ?? '{}') as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['mcpServers'])
    const server = (parsed.mcpServers as Record<string, unknown>)[MCP_SERVER_NAME]
    expect(server).toMatchObject({ type: 'stdio', command: 'openvibe', args: ['mcp'] })
  })

  it('变异腿：不同平台拿到的是同一份 server 定义（口径一致，不是各写各的）', () => {
    const a = JSON.parse(mcpSnippet('claude-code') ?? '{}')
    const b = JSON.parse(mcpSnippet('cursor') ?? '{}')
    expect(a.mcpServers).toEqual(b.mcpServers)
  })
})

describe('接入脚本 · 生成', () => {
  it('含一条 sync 命令，且 --target 逐个列出所选平台', () => {
    const script = buildSetupScript('/Users/x/proj', ['claude-code', 'cursor'])
    expect(script).toContain(`openvibe sync '/Users/x/proj' --target claude-code --target cursor`)
  })

  it('⚠️ 项目路径含空格 ⇒ 加引号（否则 sync 会把一个路径拆成两个参数）', () => {
    const script = buildSetupScript('/Users/x/my proj', ['claude-code'])
    expect(script).toContain(`openvibe sync '/Users/x/my proj' --target claude-code`)
    // 未加引号的裸路径不该出现
    expect(script).not.toContain('openvibe sync /Users/x/my proj')
  })

  it('路径含单引号 ⇒ 按 POSIX 转义（不省略）', () => {
    const script = buildSetupScript(`/Users/x/it's`, ['claude-code'])
    expect(script).toContain(`openvibe sync '/Users/x/it'\\''s' --target claude-code`)
  })

  it('⚠️ 项目路径为空 ⇒ 不生成 sync 命令（缺路径的命令是错的命令），改为中文说明', () => {
    const script = buildSetupScript('', ['claude-code'])
    expect(script).not.toContain('openvibe sync')
    expect(script).toContain('未登记本地路径')
  })

  it('全局配置只打印不自动写（避免覆盖用户既有配置）', () => {
    const script = buildSetupScript('/p', ['codebuddy'])
    expect(script).toContain('~/.codebuddy/mcp.json')
    // 只应出现 cat 打印，不应出现 `cat > ~/...`
    expect(script).not.toContain('cat > ~/.codebuddy/mcp.json')
    expect(script).toContain("echo '请把下面内容合并进 ~/.codebuddy/mcp.json")
  })

  it('项目级配置带「已存在则改为打印」的守卫', () => {
    const script = buildSetupScript('/p', ['cursor'])
    expect(script).toContain('cat > .cursor/mcp.json')
    expect(script).toContain('if [ ! -f .cursor/mcp.json ]')
  })

  it('⚠️ 无统一口径的平台不给配置片段，只说明原因（不编造）', () => {
    const script = buildSetupScript('/p', ['generic-agents'])
    expect(script).toContain('无统一口径')
    expect(script).not.toContain('"mcpServers"')
  })

  it('未选任何平台 ⇒ 只有 sync 的靶标为空，不产生半截命令', () => {
    const script = buildSetupScript('/p', [])
    expect(script).toContain(`openvibe sync '/p' `)
    // 不应出现 `--target ` 后面空着的情形
    expect(script).not.toContain('--target  ')
  })

  it('全部六个平台都能进脚本（不因某个平台缺口径而整段崩掉）', () => {
    const script = buildSetupScript('/p', [...ADAPTER_IDS])
    expect(script.length).toBeGreaterThan(0)
    for (const id of ADAPTER_IDS) expect(script).toContain(id)
  })
})
