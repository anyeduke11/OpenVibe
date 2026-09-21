import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLocalPath, readInjectionStatus } from './lock'

const HASH = 'a'.repeat(64)

function workspace(): { dir: string; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'ov-lock-test-'))
  return { dir, close() { rmSync(dir, { recursive: true, force: true }) } }
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
    expect(
      readInjectionStatus({ localPath: w.dir, registered: null }).lockPresent,
    ).toBe(false)
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
    expect(
      readInjectionStatus({ localPath: filePath, registered: null }).error,
    ).toBe('lock 文件异常')
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
