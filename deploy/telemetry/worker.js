/**
 * OpenVibe 匿名遥测计数端点（design §11.5 的 D12 定案：自写极简端点，零第三方依赖、零月费）。
 *
 * 形态：单文件 Worker，Cloudflare Workers 与 Node（见 adapter-node.mjs）共用同一份处理逻辑。
 * 只计数，不存原始事件、不建面板；聚合结果按日由 GET /summary 导出。
 *
 * 路由：
 *   POST <任意路径>              收一批事件 `{events:[{event,value,day,os,appVersion}]}`，逐条累加
 *   GET  /summary?day=YYYY-MM-DD 当日聚合（明细 + total）
 *   GET  其他                    服务自述（回显白名单，便于人肉确认部署对不对）
 *
 * 端点地址本身就是访问凭据：owner 部署时挂一段随机路径（如 /collect/7f3a…）写进
 * `~/.openvibe/config.json` 的 `telemetryEndpoint`。上报体只有三类白名单计数，
 * 被外人刷最多也只是污染计数，不会泄露本机任何信息。
 */

const EVENTS = new Set(['pack_injected', 'flow_template_used', 'project_active'])
const OSES = new Set(['mac', 'linux', 'win'])
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BATCH = 100
const MAX_VALUE = 200
const MAX_APP_VERSION = 50

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** 一条上报体的形状检查——不合规格整批拒收（fail closed：宁可不计数，也不计错） */
function eventOf(raw) {
  if (typeof raw !== 'object' || raw === null) return null
  const { event, value, day, os, appVersion } = raw
  if (!EVENTS.has(event)) return null
  if (typeof value !== 'string' || value.length > MAX_VALUE) return null
  if (typeof day !== 'string' || !DAY_RE.test(day)) return null
  if (!OSES.has(os)) return null
  if (typeof appVersion !== 'string' || appVersion.length > MAX_APP_VERSION) return null
  return { event, value, day, os, appVersion }
}

const countKey = ({ event, value, day, os }) => `count:${day}:${event}:${value}:${os}`

/**
 * 列出某前缀下的键。CF KV 的 list({prefix}) 返回 `{keys:[{name}], cursor}` 且分页，
 * 内存实现返回字符串数组——两种形状在此归一，调用方只管拿到一组键名。
 * 没有 list 能力（纯 CF KV 未授权）时返回 null，由调用方降级。
 */
async function listKeys(kv, prefix) {
  if (typeof kv.list !== 'function') return null
  const out = []
  let cursor
  for (;;) {
    const page = await kv.list({ prefix, ...(cursor ? { cursor } : {}) })
    if (Array.isArray(page)) return page
    for (const k of page.keys ?? []) out.push(typeof k === 'string' ? k : k.name)
    if (!page.cursor) return out
    cursor = page.cursor
  }
}

/**
 * @param {object} kv 需具备 get(key)→string|null 与 put(key, value)；
 *                    list({prefix}) 可选，缺省时 /summary 只回 total
 */
export function createTelemetryWorker(kv) {
  const read = async (key) => {
    const raw = await kv.get(key)
    return typeof raw === 'string' ? Number(raw) || 0 : 0
  }

  return {
    async fetch(request) {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/summary') {
        const day = url.searchParams.get('day')
        if (typeof day !== 'string' || !DAY_RE.test(day)) {
          return json(422, { error: 'day-must-be-YYYY-MM-DD' })
        }
        const total = await read(`total:${day}`)
        const prefix = `count:${day}:`
        const keys = await listKeys(kv, prefix)
        if (keys === null) return json(200, { day, listed: false, total })
        const counts = []
        for (const key of keys) {
          // 键形如 count:<day>:<event>:<value>:<os>；event 不含冒号，value 可能含，故按位取
          const parts = key.slice(prefix.length).split(':')
          const os = parts.pop()
          const event = parts.shift()
          counts.push({ event, value: parts.join(':'), os, count: await read(key) })
        }
        counts.sort((a, b) =>
          `${a.event}\u0000${a.value}\u0000${a.os}` < `${b.event}\u0000${b.value}\u0000${b.os}`
            ? -1
            : 1,
        )
        return json(200, { day, listed: true, counts, total })
      }

      if (request.method !== 'POST') {
        return json(200, { service: 'openvibe-telemetry', events: [...EVENTS], batchMax: MAX_BATCH })
      }

      let body
      try {
        body = await request.json()
      } catch {
        return json(400, { error: 'body-must-be-json' })
      }
      const raw = body?.events
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH) {
        return json(400, { error: `events-must-be-1-to-${String(MAX_BATCH)}-array` })
      }
      const events = raw.map(eventOf)
      if (events.some((e) => e === null)) {
        return json(400, { error: 'event-not-in-whitelist-or-malformed' })
      }

      for (const e of events) await kv.put(countKey(e), String((await read(countKey(e))) + 1))
      const days = [...new Set(events.map((e) => e.day))]
      for (const day of days) {
        const key = `total:${day}`
        const n = events.filter((e) => e.day === day).length
        await kv.put(key, String((await read(key)) + n))
      }
      return json(200, { ok: true, counted: events.length })
    },
  }
}

/** 无 KV 绑定时的内存实现（本地开发与单测）；CF 上由 env.TELEMETRY_KV 注入 */
export function memoryKv() {
  const store = new Map()
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null
    },
    async put(key, value) {
      store.set(key, String(value))
    },
    async list({ prefix }) {
      return [...store.keys()].filter((k) => k.startsWith(prefix)).sort()
    },
  }
}

export default {
  fetch(request, env) {
    return createTelemetryWorker(env?.TELEMETRY_KV ?? memoryKv()).fetch(request, env)
  },
}
