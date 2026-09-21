import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderGolden } from '../tests/golden/compose'
import { GOLDEN_FIXTURES } from '../tests/golden/fixtures'
import { GOLDEN_ROOT, goldenArtifacts } from '../tests/golden/artifacts'

for (const fixture of GOLDEN_FIXTURES) {
  const artifacts = goldenArtifacts(renderGolden(fixture.pack))
  const dir = join(GOLDEN_ROOT, fixture.id)
  rmSync(dir, { recursive: true, force: true })
  for (const [rel, content] of Object.entries(artifacts)) {
    const target = join(dir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  console.log(`golden:${fixture.id} → ${Object.keys(artifacts).length} 个产物`)
}
