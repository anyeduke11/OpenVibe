# 匿名遥测计数端点（owner 自部署）

对应 design §11.5 的 D12 定案：**自写极简计数端点**，零第三方依赖、零月费。事件白名单只有三类
（`pack_injected` / `flow_template_used` / `project_active`），上报体固定五段
`{event, value, day, os, appVersion}`——不含路径、文件内容与机器标识，因此这里**只累计数，
没有原始事件可泄露**。产品侧的默认态是关：`telemetryEndpoint` 未配置时 serve 连上报定时器都不建。

## 部署（Cloudflare Workers）

```bash
# 1) 建一个 KV namespace 并把 binding 名字填进 wrangler
wrangler kv namespace create TELEMETRY_KV
# 2) 部署（worker.js 是单文件，无构建步骤、无 npm 依赖）
npx wrangler deploy --compatibility-date 2026-01-01 \
  --name openvibe-telemetry --main worker.js \
  --kv-bindings TELEMETRY_KV
```

## 本地跑（node）

```bash
node deploy/telemetry/adapter-node.mjs 8799
curl -sS -X POST http://127.0.0.1:8799/collect/demo \
  -H 'content-type: application/json' \
  -d '{"events":[{"event":"pack_injected","value":"default@1.0.0","day":"2026-09-23","os":"mac","appVersion":"0.1.0"}]}'
curl -sS 'http://127.0.0.1:8799/summary?day=2026-09-23'
```

内存计数，重启清零——真计数请走 CF Workers + KV。

## 让产品往你的端点发

编辑 `~/.openvibe/config.json`，加一行（**公网必须 https**，回环 http 只为本机自测放行）：

```json
{ "telemetryEndpoint": "https://openvibe-telemetry.<你的子域>.workers.dev/collect/<一段随机串>" }
```

`serve` 会把它原样写回 config.json（不会被下次启动抹掉），之后每 60s 取本地队列里
未发送的 ≤100 条 POST 过去，端点回 2xx 才在 `telemetry_events.sent_at` 盖章。

只有 `serve` 上报；一次性 CLI 命令只入队、不发网（避免每条命令都挂一个出网请求）。
端点长期不可达时 pending 行不会被清理，只会让 `telemetry_events` 变长——开关关掉即止血
（关闭时连入队都不会发生）。MVP 不做配额淘汰，量化影响见 DEV-0019。

端点地址即凭据：挂一段随机路径就够——上报体没有可泄露的东西，被刷最多是计数被污染。
想更严可以在前面套一层 CDN 访问规则。

## 聚合导出

`GET /summary?day=YYYY-MM-DD` 返回 `{day, listed, counts:[{event,value,os,count}], total}`。
按日拉一次即可，不需要分析面板。
