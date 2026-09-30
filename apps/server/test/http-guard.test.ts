import { describe, expect, it } from 'vitest'
import { AppError } from '@openvibe/shared'
import {
  assertRemoteUrl,
  guardedFetch,
  isPublicIp,
  type DnsLookupAll,
} from '../src/lib/http-guard'

/**
 * 出站守卫单测（DEV-0067）。DNS 相关分支用 lookupImpl 注入固定结果——
 * 测试不碰真实网络；协议/主机检查发生在 DNS 之前，直接用真实现。
 */

describe('isPublicIp · 环回/私有/保留地址判定', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.0.0.5', false],
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['172.32.0.1', true],
    ['192.168.1.1', false],
    ['169.254.1.1', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['224.0.0.1', false],
    ['8.8.8.8', true],
    ['::1', false],
    ['fe80::1', false],
    ['fc00::1', false],
    ['ff02::1', false],
    ['::ffff:10.0.0.1', false],
    ['2606:4700::1111', true],
  ])('%s → %s', (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected)
  })
})

describe('assertRemoteUrl · 协议与主机白名单（DNS 之前）', () => {
  it('拒绝 http、IP 字面量主机与白名单外主机', async () => {
    await expect(assertRemoteUrl('http://api.github.com/x')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    await expect(assertRemoteUrl('https://127.0.0.1/x')).rejects.toMatchObject({
      code: 'FORBIDDEN_ORIGIN',
    })
    await expect(assertRemoteUrl('https://192.168.1.1/x')).rejects.toMatchObject({
      code: 'FORBIDDEN_ORIGIN',
    })
    await expect(assertRemoteUrl('https://evil.example.com/x')).rejects.toMatchObject({
      code: 'FORBIDDEN_ORIGIN',
    })
  })

  it('DNS 解析到私有地址 → 拦截（注入解析结果，不碰真实网络）', async () => {
    const fakeLookup = (async () => [
      { address: '10.0.0.5', family: 4 },
      { address: '93.184.216.34', family: 4 },
    ]) as unknown as DnsLookupAll
    await expect(
      assertRemoteUrl('https://api.github.com/x', [], fakeLookup),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ORIGIN' })

    const failLookup = (async () => {
      throw new Error('NXDOMAIN')
    }) as unknown as DnsLookupAll
    await expect(
      assertRemoteUrl('https://api.github.com/x', [], failLookup),
    ).rejects.toMatchObject({ code: 'REMOTE_UNREACHABLE' })
  })
})

describe('guardedFetch · 重定向逐跳复检', () => {
  it('白名单内直连返回；重定向目标无后缀放行 → 拦截，有后缀放行 → 跟随', async () => {
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === 'https://api.skillhub.cn/file') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://bucket.cos.accelerate.myqcloud.com/a.md' },
        })
      }
      if (url === 'https://bucket.cos.accelerate.myqcloud.com/a.md') return new Response('内容')
      return new Response(null, { status: 404 })
    }) as typeof fetch

    // 未放行 COS 后缀：重定向目标被拦
    await expect(
      guardedFetch('https://api.skillhub.cn/file', {}, fetchImpl),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ORIGIN' })
    // 放行后跟随，带回终点内容
    const text = await (
      await guardedFetch('https://api.skillhub.cn/file', { extraSuffixes: ['myqcloud.com'] }, fetchImpl)
    ).text()
    expect(text).toBe('内容')
  })

  it('重定向到白名单外主机 → 拦截；缺 Location → 拦截', async () => {
    const toEvil = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x' } })) as typeof fetch
    await expect(
      guardedFetch('https://api.skillhub.cn/file', { extraSuffixes: ['myqcloud.com'] }, toEvil),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_ORIGIN' })

    const noLocation = (async () => new Response(null, { status: 302 })) as typeof fetch
    await expect(
      guardedFetch('https://api.skillhub.cn/file', {}, noLocation),
    ).rejects.toMatchObject({ code: 'REMOTE_UNREACHABLE' })
  })

  it('非 https 上游直接拒绝（AppError 语义可被路由层转成统一错误体）', async () => {
    await expect(guardedFetch('ftp://api.skillhub.cn/x')).rejects.toBeInstanceOf(AppError)
  })
})
