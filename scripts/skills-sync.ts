/**
 * scripts/skills-sync.ts —— 技能真源 ↔ 部署位自动同步（owner 增强项）。
 *
 * 仓内真源 `docs/skills/<name>/SKILL.md` → 部署位 `~/.agents/skills/<name>/SKILL.md`：
 * 逐文件 diff，不一致即复制（真源为准），输出同步清单；`--check` 只报差异不改盘。
 * 同步后提示跑 `openvibe scan --skills` 刷新台账登记。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'docs', 'skills')
const DST = join(homedir(), '.agents', 'skills')
const checkOnly = process.argv.includes('--check')

if (!existsSync(SRC)) {
  console.error('仓内真源 docs/skills/ 不存在')
  process.exit(1)
}

const skills = readdirSync(SRC).filter((d) => statSync(join(SRC, d)).isDirectory())
let inSync = 0
const updated: string[] = []
for (const name of skills) {
  const srcFile = join(SRC, name, 'SKILL.md')
  const dstFile = join(DST, name, 'SKILL.md')
  if (!existsSync(srcFile)) continue
  const same = existsSync(dstFile) && readFileSync(srcFile, 'utf8') === readFileSync(dstFile, 'utf8')
  if (same) {
    inSync += 1
    continue
  }
  if (checkOnly) {
    updated.push(name)
    continue
  }
  mkdirSync(join(DST, name), { recursive: true })
  copyFileSync(srcFile, dstFile)
  updated.push(name)
}

console.log(`技能真源 ${String(skills.length)} 个：一致 ${String(inSync)}，${checkOnly ? '漂移' : '已同步'} ${String(updated.length)}${updated.length > 0 ? `（${updated.join('、')}）` : ''}`)
if (updated.length > 0 && !checkOnly) {
  console.log('刷新台账登记：openvibe scan --skills（serve 运行中时）')
}
process.exit(updated.length > 0 && checkOnly ? 1 : 0)
