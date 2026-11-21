import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLocalPath, readInjectionStatus, scanInjectionFiles } from './lock'
import { fileSha256 } from '../pack/fingerprint'
import { tempDir } from '../test-support/temp-dir'

const HASH = 'a'.repeat(64)

function workspace(): { dir: string; close(): void } {
  const dir = tempDir('ov-lock-test-')
  return {
    dir,
    close() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function writeLock(dir: string, content: string): string {
  mkdirSync(join(dir, '.openvibe'), { recursive: true })
  writeFileSync(join(dir, '.openvibe', 'pack.lock.json'), content, 'utf8')
  return join(dir, '.openvibe', 'pack.lock.json')
}

const lockJson = (version = '1.0.0') =>
  JSON.stringify({
    schemaVersion: 1,
    pack: { id: 'pk_x', name: 'default', version, fingerprint: HASH },
    injectedAt: '2026-09-20T02:11:00Z',
    files: [{ path: 'CLAUDE.md', sha256: HASH, managed: true }],
  })

describe('UT-LOCK-01 · 正常 lock 解析（design §7.5 / m5 FR-6.1）', () => {
  it('版本一致 → upToDate true；登记版本落后 → 可更新 + sync 命令', () => {
    const w = workspace()
    writeLock(w.dir, lockJson('1.0.0'))

    const stale = readInjectionStatus({
      localPath: w.dir,
      registered: { packId: 'pk_x', version: '1.2.0' },
    })
    expect(stale).toMatchObject({
      lockPresent: true,
      pack: { name: 'default', version: '1.0.0', fingerprint: HASH },
      injectedAt: '2026-09-20T02:11:00Z',
      registered: { packId: 'pk_x', version: '1.2.0' },
      upToDate: false,
    })
    expect(stale.suggestedCommand).toBe(`npx openvibe-cli sync ${w.dir} --pack default`)

    expect(
      readInjectionStatus({ localPath: w.dir, registered: { packId: 'pk_x', version: '1.0.0' } })
        .upToDate,
    ).toBe(true)
    w.close()
  })

  it('未登记标准包 → 无 registered/upToDate，读取结果本身不受影响', () => {
    const w = workspace()
    writeLock(w.dir, lockJson('2.1.0'))
    const out = readInjectionStatus({ localPath: w.dir, registered: null })
    expect(out.lockPresent).toBe(true)
    expect(out.pack?.version).toBe('2.1.0')
    expect(out.registered).toBeUndefined()
    expect(out.upToDate).toBeUndefined()
    w.close()
  })
})

describe('UT-LOCK-02 · 异常口径不得波及他字段（m5 §6.1/§6.4）', () => {
  it('无 localPath / 目录不存在 / 缺 lock → lockPresent false 且带中文说明', () => {
    const w = workspace()
    expect(readInjectionStatus({ localPath: null, registered: null })).toEqual({
      lockPresent: false,
      error: '未登记本地路径',
    })
    expect(
      readInjectionStatus({ localPath: join(w.dir, 'nope'), registered: null }).lockPresent,
    ).toBe(false)
    expect(readInjectionStatus({ localPath: w.dir, registered: null }).lockPresent).toBe(false)
    w.close()
  })

  it('JSON 损坏 / schemaVersion 非 1 / 路径是文件 → 「lock 文件异常」，不抛错', () => {
    const w = workspace()
    writeLock(w.dir, '{ this is not json')
    expect(readInjectionStatus({ localPath: w.dir, registered: null })).toMatchObject({
      lockPresent: false,
      error: 'lock 文件异常',
    })

    const bad = JSON.parse(lockJson()) as { schemaVersion: number }
    bad.schemaVersion = 99
    writeLock(w.dir, JSON.stringify(bad))
    expect(readInjectionStatus({ localPath: w.dir, registered: null }).error).toBe('lock 文件异常')

    const filePath = writeLock(w.dir, lockJson())
    expect(readInjectionStatus({ localPath: filePath, registered: null }).error).toBe(
      'lock 文件异常',
    )
    w.close()
  })
})

describe('UT-LOCK-03 · 注入产物扫描（原型「产物台账」）', () => {
  const lockWith = (files: Array<{ path: string; sha256: string; managed: boolean }>) =>
    JSON.stringify({
      schemaVersion: 1,
      pack: { id: 'pk_x', name: 'default', version: '1.0.0', fingerprint: HASH },
      injectedAt: '2026-09-20T02:11:00Z',
      files,
    })

  it('无 localPath / 缺 lock → lockPresent false 且 files 为空（不抛错）', () => {
    expect(scanInjectionFiles(null)).toEqual({
      lockPresent: false,
      files: [],
      error: '未登记本地路径',
    })
    const w = workspace()
    expect(scanInjectionFiles(w.dir)).toMatchObject({ lockPresent: false, files: [] })
    w.close()
  })

  it('内容与 lock 一致 ⇒ IN_SYNC；lock 自身作为合成行 LOCK 附在末尾', () => {
    const w = workspace()
    const content = '# CLAUDE\n一致\n'
    writeFileSync(join(w.dir, 'CLAUDE.md'), content, 'utf8')
    writeLock(w.dir, lockWith([{ path: 'CLAUDE.md', sha256: fileSha256(content), managed: true }]))

    const out = scanInjectionFiles(w.dir)
    expect(out.lockPresent).toBe(true)
    expect(out.pack).toMatchObject({ name: 'default', version: '1.0.0' })
    expect(out.files).toHaveLength(2)
    expect(out.files[0]).toMatchObject({ path: 'CLAUDE.md', state: 'IN_SYNC', managed: true })
    expect(out.files[1]).toMatchObject({
      path: join('.openvibe', 'pack.lock.json'),
      state: 'LOCK',
      managed: false,
    })
    w.close()
  })

  it('磁盘内容变了 ⇒ DRIFT（受管）/ FOREIGN（未受管），删文件 ⇒ ABSENT', () => {
    const w = workspace()
    const managed = '# 受管\n'
    const unmanaged = '# 未受管\n'
    writeFileSync(join(w.dir, 'CLAUDE.md'), `${managed}手改`, 'utf8')
    writeFileSync(join(w.dir, 'NOTES.md'), `${unmanaged}也改了`, 'utf8')
    writeFileSync(join(w.dir, 'GONE.md'), 'x', 'utf8')
    writeLock(
      w.dir,
      lockWith([
        { path: 'CLAUDE.md', sha256: fileSha256(managed), managed: true },
        { path: 'NOTES.md', sha256: fileSha256(unmanaged), managed: false },
        { path: 'GONE.md', sha256: fileSha256('x'), managed: true },
      ]),
    )
    rmSync(join(w.dir, 'GONE.md'))

    const rows = scanInjectionFiles(w.dir).files
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r.state]))
    expect(byPath['CLAUDE.md']).toBe('DRIFT')
    expect(byPath['NOTES.md']).toBe('FOREIGN')
    expect(byPath['GONE.md']).toBe('ABSENT')
    w.close()
  })

  it('⚠️ 与 CLI 同口径：未受管且内容一致仍是 FOREIGN，不是 IN_SYNC（FR-2 判据在哈希之前）', () => {
    const w = workspace()
    const content = '# 未受管但一致\n'
    writeFileSync(join(w.dir, 'NOTES.md'), content, 'utf8')
    writeLock(w.dir, lockWith([{ path: 'NOTES.md', sha256: fileSha256(content), managed: false }]))
    const row = scanInjectionFiles(w.dir).files.find((r) => r.path === 'NOTES.md')
    expect(row?.state).toBe('FOREIGN')
    w.close()
  })
})

describe('UT-LOCALPATH-01 · 保存时路径校验（m5 FR-1.3）', () => {
  it('目录存在且含 lock → 无告警；不存在/是文件 → warning 但允许保存', () => {
    const w = workspace()
    expect(checkLocalPath(w.dir)).toMatchObject({ exists: true, isDir: true, lockExists: false })
    writeLock(w.dir, lockJson())
    expect(checkLocalPath(w.dir).lockExists).toBe(true)

    const missing = checkLocalPath(join(w.dir, 'later'))
    expect(missing.exists).toBe(false)
    expect(missing.warning).toContain('不存在')

    const filePath = join(w.dir, 'afile.txt')
    writeFileSync(filePath, 'x', 'utf8')
    const asFile = checkLocalPath(filePath)
    expect(asFile).toMatchObject({ exists: true, isDir: false })
    expect(asFile.warning).toContain('不是目录')
    expect(checkLocalPath(null)).toEqual({ exists: false, isDir: false, lockExists: false })
    w.close()
  })
})
