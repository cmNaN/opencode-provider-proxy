# opencode-provider-proxy

[OpenCode](https://github.com/opencode-ai/opencode) 的按 Provider 级别配置代理的插件。

每个 provider（如 deepseek、openai）可使用不同的代理地址。对该 provider 的请求通过 `https-proxy-agent`/`http-proxy-agent` 转发到对应的代理。

## 安装

```bash
# 在插件目录下构建
npm run build

# 链接或复制到 OpenCode 插件目录
# ~/.config/opencode/plugins/
```

在 OpenCode 配置中添加该插件：

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": [
    {
      "name": "opencode-provider-proxy",
      "path": "/path/to/opencode-provider-proxy"
    }
  ]
}
```

## 配置

### 配置文件

`~/.config/opencode/provider-proxy.json`（或 `$XDG_CONFIG_HOME/opencode/provider-proxy.json`）：

```json
{
  "deepseek": "http://127.0.0.1:7890",
  "openai": "http://127.0.0.1:7891"
}
```

### 环境变量

`OPENCODE_PROVIDER_PROXY` — JSON 对象，结构与配置文件相同：

```bash
export OPENCODE_PROVIDER_PROXY='{"deepseek":"http://127.0.0.1:7890"}'
```

环境变量优先级高于配置文件。

### 认证

如果代理需要用户名密码认证，直接在代理地址中嵌入凭据：

```json
{
  "deepseek": "http://username:password@127.0.0.1:7890"
}
```

插件会自动解析 `username:password`，发送 `Proxy-Authorization: Basic` 头。密码中的特殊字符需要 URL 编码（例如 `@` → `%40`，`:` → `%3A`）。

### 支持的代理类型

代理地址必须是 **HTTP CONNECT 代理**（标准隧道代理协议）：

| 代理地址 | 说明 |
|----------|------|
| `http://proxy:port` | 明文 HTTP CONNECT 代理 |
| `https://proxy:port` | 基于 TLS 的 HTTP CONNECT 代理 |
| `socks5://proxy:port` | SOCKS5 代理（本地解析 DNS） |
| `socks5h://proxy:port` | SOCKS5 代理（代理端解析 DNS） |
| `socks4://proxy:port` | SOCKS4 代理 |
| `socks4a://proxy:port` | SOCKS4a 代理（代理端解析 DNS） |
| `socks://proxy:port` | 等同 `socks5://` |

常见的代理软件：
- [Clash](https://github.com/Dreamacro/clash) / [Clash Meta](https://github.com/MetaCubeX/Clash.Meta) — HTTP / SOCKS5 端口
- [v2ray](https://www.v2fly.org/) / [Xray](https://xtls.github.io/) — HTTP / SOCKS outbound
- [Squid](http://www.squid-cache.org/)
- [mitmproxy](https://mitmproxy.org/)

## 工作原理

1. 插件加载时，`readProxyConfig()` 从环境变量或配置文件读取代理映射。
2. 在 `config` hook 中，为每个配置了代理的 provider 注入一个自定义 `fetch`，该 fetch 将所有请求通过配置的 proxy agent 转发。
3. 请求被重写为原始的 Node.js `http`/`https` 请求，带有 proxy agent，保留 method、headers 和 body。

### 支持的 body 类型

插件处理所有标准的 `RequestInit.body` 类型：

- `string` / `Buffer`
- Web API `ReadableStream`（例如 `response.body`）
- Node.js `Readable` 流（`.pipe()`）
- `ArrayBuffer` / `TypedArray` / `DataView`
- `Blob` / `File`
- `URLSearchParams`

`FormData` 被明确拒绝——provider proxy 无法可靠地代理 multipart 表单数据。

### 超时

请求在 30 秒后超时。超时通过 `req.setTimeout()` 在底层 socket 上生效。

## 构建

```bash
npm run build    # tsc
```

依赖：
- Node.js >= 18
- TypeScript 5.7+

## 许可证

MIT
