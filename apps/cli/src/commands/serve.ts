import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openvibeHome } from '@openvibe/core'
import { DEFAULT_PORT } from '@openvibe/shared'
import { bootstrap, defaultSeedDir, type BootstrapResult } from '@openvibe/server/bootstrap'
import { configFilePath, readConfigFile, writeConfigFile } from '../config'

/**
 * serve —— dev-plan §1.2 启动序列的 CLI 半边：步骤 1（配置发现链复用）/2（~/.openvibe 初始化 +
 * 令牌 0600 落盘）/8（--open 调系统浏览器）；步骤 3/4/6/7 在 @openvibe/server/bootstrap。
 * 这里是全仓唯一被允许直接 import server 的 CLI 模块（组合根，见 eslint.config.js 白名单与 DEV-0018）。
 */

/** design §4 的 ~/.openvibe 布局，首启一次性建齐 */
const HOME_DIRS = ['data', 'packs', 'logs'] as const

export interface ServeOptions {
  /** ~/.openvibe 根；缺省走 OPENVIBE_HOME / homedir（与 core 同源） */
  home?: string
  port?: number
  seedDir?: string
  webRoot?: string
  open?: boolean
  /** 注入点：测试与非桌面环境可替换真实浏览器调用 */
  opener?: (url: string) => void
  /** 非致命提示出口（--json 下折叠进 summary.warnings） */
  warn?: (message: string) => void
  appVersion?: string
}

export interface ServeResult extends Pick<
  BootstrapResult,
  'url' | 'token' | 'seed' | 'web' | 'close' | 'telemetry'
> {
  configPath: string
  /** 首启 = 此前没有 config.json（m6b FR-1.2） */
  firstRun: boolean
  warnings: string[]
}

/** 各平台的“打开默认浏览器”命令；win32 用 cmd start 以空标题占位避开 URL 被当作窗口标题 */
export function openerArgs(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] }
  if (platform === 'darwin') return { command: 'open', args: [url] }
  return { command: 'xdg-open', args: [url] }
}

function defaultOpener(url: string, warn: (message: string) => void): void {
  const { command, args } = openerArgs(process.platform, url)
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  // 无图形环境/命令缺失时 serve 不该跟着退出——只提示手工访问地址
  child.on('error', (e) =>
    warn(`无法自动打开浏览器（${command}）：${e.message}，请手动访问 ${url}`),
  )
  child.unref()
}

export async function serveAction(options: ServeOptions = {}): Promise<ServeResult> {
  const home = options.home ?? openvibeHome()
  // core 的导出目录（packExportDir）认 OPENVIBE_HOME，不桥接的话 --home 只挪走了 db 与
  // config.json，预置包导出仍会落到真实的 ~/.openvibe
  process.env.OPENVIBE_HOME = home
  const configPath = configFilePath(home)
  const firstRun = !existsSync(configPath)
  const warnings: string[] = []
  const emit = (message: string): void => {
    warnings.push(message)
    options.warn?.(message)
  }

  // 坏配置不阻断启动（m6b §3）：令牌不合法就重新生成并覆盖，绝不带着空令牌起服务。
  // 但只有整份配置都不可用时才走这条——可选字段手打错时令牌照用，别把用户的登录态换掉（T9a-4）
  const { config, error } = readConfigFile(home)
  if (error)
    emit(
      config
        ? `${configPath}：${error}`
        : `${configPath} 不可用（${error}），令牌已重新生成并覆盖`,
    )
  const token = config?.token ?? randomBytes(32).toString('hex')
  // 遥测端点是用户手写在 config.json 里的（design §11.5）；缺省即结构性零外联
  const telemetryEndpoint = config?.telemetryEndpoint ?? ''

  for (const dir of HOME_DIRS) mkdirSync(join(home, dir), { recursive: true })

  const boot = await bootstrap({
    dbPath: join(home, 'data', 'openvibe.db'),
    dataDir: home,
    seedDir: options.seedDir ?? defaultSeedDir(),
    port: options.port ?? DEFAULT_PORT,
    token,
    telemetryEndpoint,
    ...(options.webRoot ? { webRoot: options.webRoot } : {}),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
  })
  for (const w of boot.warnings) emit(w)

  // 监听成功后才落盘：失败时不留一个指向不存在端点的 config.json。
  // 重写必须带上 telemetryEndpoint，否则 serve 一次就把用户手配的端点抹掉了。
  const saved = writeConfigFile(
    {
      serverUrl: boot.url,
      token: boot.token,
      port: Number(new URL(boot.url).port),
      ...(telemetryEndpoint === '' ? {} : { telemetryEndpoint }),
    },
    home,
  )

  if (options.open === true)
    (options.opener ?? ((url: string) => defaultOpener(url, emit)))(boot.url)

  return {
    url: boot.url,
    token: boot.token,
    seed: boot.seed,
    web: boot.web,
    telemetry: boot.telemetry,
    close: boot.close,
    configPath: saved,
    firstRun,
    warnings,
  }
}
