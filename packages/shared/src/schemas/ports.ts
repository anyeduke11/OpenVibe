import { z } from 'zod'

/**
 * 端口与服务扫描契约（m7 · 项目工作台「端口与服务」卡）：
 * 服务端只读两类事实——项目目录里「声明的」端口（package.json / .env / vite 配置 /
 * compose / Dockerfile / 约定库）与本机「实际监听」的端口（lsof / netstat 只读查询），
 * 在路由层按端口号合并成一张台账。无持久化：端口是易变态，每次现扫现报。
 */

/** 端口号 1-65535 */
export const PortNumber = z.number().int().min(1).max(65_535)

/** 声明来源（sourceFile 是仓库相对路径，供台账「从哪认出来的」列展示） */
export const PORT_SERVICE_SOURCES = [
  'dotenv',
  'package-script',
  'config-file',
  'compose',
  'dockerfile',
  'convention',
] as const
export type PortServiceSource = (typeof PORT_SERVICE_SOURCES)[number]

export const DeclaredService = z.object({
  port: PortNumber,
  /** 服务名：取脚本名/键名/进程推断（如 vite / next / POSTGRES） */
  service: z.string().min(1),
  source: z.enum(PORT_SERVICE_SOURCES),
  sourceFile: z.string().min(1),
})
export type DeclaredService = z.infer<typeof DeclaredService>

/** 本机监听器：lsof / netstat 的只读查询结果（addr 已归一为 * 与具体地址两类） */
export const PortListener = z.object({
  port: PortNumber,
  /** 监听地址：*:5173（全接口）或 127.0.0.1:8787（只听本地），冒号前半段 */
  addr: z.string().min(1),
  process: z.string().min(1),
  pid: z.number().int().min(0),
})
export type PortListener = z.infer<typeof PortListener>

/** 合并状态：idle = 声明了但没在跑；listening = 端口有监听者（带进程信息） */
export const PORT_STATES = ['idle', 'listening'] as const
export const PortStatus = z.object({
  port: PortNumber,
  service: z.string().min(1),
  source: z.enum(PORT_SERVICE_SOURCES),
  sourceFile: z.string().min(1),
  state: z.enum(PORT_STATES),
  process: z.string().optional(),
  pid: z.number().int().min(0).optional(),
  /** 监听且端口是 http 语义时给的可点地址（全部 localhost，服务端不猜测域名） */
  url: z.string().optional(),
})
export type PortStatus = z.infer<typeof PortStatus>

export const ProjectPortsOut = z.object({
  projectPath: z.string().min(1),
  /** 本次认读过的文件（仓库相对路径，空目录/无声明为空数组） */
  scannedFiles: z.array(z.string()),
  services: z.array(PortStatus),
  /** 本机全部 TCP LISTEN 监听器（供「未声明的本机监听」参考区） */
  listeners: z.array(PortListener),
  /** 监听扫描器不可用/失败时的降级说明（lsof 缺失、权限不足等），正常为空 */
  listenersWarning: z.string().optional(),
})
export type ProjectPortsOut = z.infer<typeof ProjectPortsOut>
