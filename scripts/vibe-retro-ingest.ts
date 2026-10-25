/**
 * scripts/vibe-retro-ingest.ts —— Vibecoding 复盘回流入口（docs/vibe-retro.md §5）。
 *
 * 薄编排：读复盘报告 md → 按「## 二级标题」拆条 → 逐条 POST /api/agent/ingest
 * （kind=dev_log，幂等键 = 报告 sha 前 16 + 节序）⇒ 全部 pending，Web 人工确认才入库。
 * 业务全在服务端（M8 桥幂等三态）；本脚本不含业务判断。
 *
 * 用法：pnpm vibe:retro --file <报告.md> [--project <id|dir>] [--type DEV|CHECK]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { RETRO_SCHEMA_VERSION } from '../packages/shared/src/extract-prompt'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? '') : undefined
}

const file = flag('file')
const project = flag('project')
const type = flag('type') === 'CHECK' ? 'CHECK' : 'DEV'

if (file === undefined || file === '' || project === undefined || project === '') {
  console.error('用法：pnpm vibe:retro --file <复盘报告.md> --project <项目id|目录>')
  process.exit(1)
}

const raw = readFileSync(resolve(file), 'utf8')
const fileHash = createHash('sha256').update(raw).digest('hex').slice(0, 16)

// ── 结构化校验（docs/vibe-retro.md §5：固定复盘思考模型的六节骨架，缺则拒绝）──
const REQUIRED_SECTIONS = ['总评', '逐批判定', '声称对照', '遗留清单', '数字复算', '复盘自评'] as const
const wantVer = String(RETRO_SCHEMA_VERSION)
if (!new RegExp(`^retro-schema: *${wantVer}$`, 'm').test(raw)) {
  console.error(`⛔ 报告头缺 \`retro-schema: ${wantVer}\` 声明（docs/vibe-retro.md §5 骨架 v${wantVer}；版本常量单源在 shared/extract-prompt.ts）`)
  process.exit(1)
}
const missingSections = REQUIRED_SECTIONS.filter((t) => !new RegExp(`^## ${t}\\s*$`, 'm').test(raw))
if (missingSections.length > 0) {
  console.error(`⛔ 复盘骨架缺 ${String(missingSections.length)} 节：${missingSections.join('、')}（固定思考模型六节，见 docs/vibe-retro.md §5）`)
  process.exit(1)
}

// 与 CLI 同源的配置发现（serve 须在本机运行；token 走 config.json）
import { resolveConfig } from '../apps/cli/src/config'
import { clientFromConfig } from '../apps/cli/src/client'
import { resolveProjectByPath } from '../apps/cli/src/commands/status'

const config = resolveConfig({})
if (config.token === null) {
  console.error('未发现 serve 配置（config.json 缺 serverUrl/token）：先运行 openvibe serve')
  process.exit(1)
}
const client = clientFromConfig(config)

// 项目解析：prj_ 直用；否则按目录反查（与 ask/discuss 同源逻辑的轻量版）
const projectId = /^prj_/.test(project)
  ? project
  : (await resolveProjectByPath(client, resolve(project))).project.id

// 按「## 」二级标题拆节（标题前的一级前言并入首条）
const sections: { title: string; body: string }[] = []
let current: { title: string; body: string } | null = null
for (const line of raw.split('\n')) {
  if (line.startsWith('## ')) {
    if (current !== null) sections.push(current)
    current = { title: line.slice(3).trim(), body: '' }
  } else if (current !== null) {
    current.body += `${line}\n`
  }
}
if (current !== null) sections.push(current)
if (sections.length === 0) {
  console.error('报告里没有「## 」二级标题可拆条')
  process.exit(1)
}

console.log(`报告：${String(sections.length)} 节 → 项目 ${projectId}（全部落 pending，Web 确认后入库）`)
const results = await client.postJson<{ accepted: number; duplicate: number; conflict: number; rejected: number; items: { status: string }[] }>(
  '/api/agent/ingest',
  {
    projectId,
    items: sections.map((sec, i) => ({
      kind: 'dev_log',
      idempotencyKey: `vibe-retro:${fileHash}:${String(i)}`,
      payload: {
        type,
        title: `复盘 · ${sec.title}`,
        body: sec.body.trim().slice(0, 60_000),
        relatedFiles: [],
      },
      sourcePlatform: 'vibe-retro',
    })),
  },
)

console.log(
  `回流完成：accepted ${String(results.accepted)} / duplicate ${String(results.duplicate)} / conflict ${String(results.conflict)} / rejected ${String(results.rejected)}`,
)
if (results.rejected > 0) {
  console.error('有 rejected 条目——去 Web 待确认列表看 reject_reason')
  process.exit(1)
}
