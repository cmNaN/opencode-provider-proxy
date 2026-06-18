# opencode-provider-proxy (next branch)

Per-provider proxy configuration plugin for [OpenCode](https://github.com/opencode-ai/opencode).

Each provider (e.g. deepseek, openai) can use a different proxy URL. Requests to that provider are routed through the configured proxy via `socks-proxy-agent`/`https-proxy-agent`.

> **💡 Bun compatibility**: This branch (`next`) uses `socks-proxy-agent` / `https-proxy-agent` via `node:http`'s `Agent`.  
> **Requires Bun ≥ (future release containing [PR #31587](https://github.com/oven-sh/bun/pull/31587))**.  
> If you're on the current Bun release (1.3.x), use the `master` branch instead — it uses raw TCP sockets and works on all versions.

## Install

```bash
# Clone the plugin
git clone git@github.com:cmNaN/opencode-provider-proxy.git
cd opencode-provider-proxy

# Build
npm run build

# Copy to your OpenCode plugins directory
mkdir -p ~/.config/opencode/plugins
cp dist/index.js ~/.config/opencode/plugins/opencode-provider-proxy.js
```

Add to your OpenCode configuration:

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

## Configuration

### Via config file

`~/.config/opencode/provider-proxy.json` (or `$XDG_CONFIG_HOME/opencode/provider-proxy.json`):

```json
{
  "deepseek": "http://127.0.0.1:7890",
  "openai": "http://127.0.0.1:7891"
}
```

### Via environment variable

`OPENCODE_PROVIDER_PROXY` — JSON object with the same schema:

```bash
export OPENCODE_PROVIDER_PROXY='{"deepseek":"http://127.0.0.1:7890"}'
```

Environment variable takes precedence over the config file.

### Wildcard proxy

A `"*"` key matches all providers that don't have a specific proxy configured:

```json
{
  "*": "socks5://127.0.0.1:1080",
  "openai": "http://127.0.0.1:7890"
}
```

### Authentication

If your proxy requires authentication, embed credentials in the proxy URL:

```json
{
  "deepseek": "http://username:password@127.0.0.1:7890"
}
```

The plugin automatically extracts `username:password` and sends a `Proxy-Authorization: Basic` header. Special characters in the password must be URL-encoded (e.g., `@` → `%40`, `:` → `%3A`).

### Supported proxy types

| Proxy address | Description |
|---------------|-------------|
| `http://proxy:port` | Plain HTTP CONNECT proxy |
| `https://proxy:port` | HTTP CONNECT proxy over TLS |
| `socks5://proxy:port` | SOCKS5 proxy (DNS resolved locally) |
| `socks5h://proxy:port` | SOCKS5 proxy (DNS resolved by proxy) |
| `socks4://proxy:port` | SOCKS4 proxy |
| `socks4a://proxy:port` | SOCKS4a proxy (DNS resolved by proxy) |
| `socks://proxy:port` | Alias for `socks5://` |

Common proxy software:
- [Clash](https://github.com/Dreamacro/clash) / [Clash Meta](https://github.com/MetaCubeX/Clash.Meta) — HTTP / SOCKS5 port
- [v2ray](https://www.v2fly.org/) / [Xray](https://xtls.github.io/) — HTTP / SOCKS outbound
- [Squid](http://www.squid-cache.org/)
- [mitmproxy](https://mitmproxy.org/)

## How it works

1. On plugin load, `readProxyConfig()` reads the proxy mapping from env var or config file.
2. During the `config` hook, for each configured provider, it injects a custom `fetch` that uses `socks-proxy-agent` / `https-proxy-agent` via Node.js `http.request()`.
3. The proxy agent handles DNS resolution, SOCKS handshake, or HTTP CONNECT tunnel.

### Background

Bun's `node:http` module before [PR #31587](https://github.com/oven-sh/bun/pull/31587) did not properly support custom `Agent.createConnection()`, causing third-party proxy agents like `socks-proxy-agent` to be silently bypassed. PR #31587 rewrites the node:http client on net/tls + llhttp, restoring Agent compatibility. See [oven-sh/bun#15499](https://github.com/oven-sh/bun/issues/15499) for details.

### Supported body types

The plugin handles all standard `RequestInit.body` types:

- `string` / `Buffer`
- Web API `ReadableStream` (e.g., `response.body`)
- Node.js `Readable` stream (`.pipe()`)
- `ArrayBuffer` / `TypedArray` / `DataView`
- `Blob` / `File`
- `URLSearchParams`

`FormData` is explicitly rejected — provider proxy cannot reliably proxy multipart form data.

### Timeout

Requests time out after 30 seconds.

## Build

```bash
npm run build    # tsc
```

Requires:
- Node.js >= 18
- TypeScript 5.7+

## Branches

| Branch | Approach | Bun compatibility |
|--------|----------|-------------------|
| `master` | Raw TCP sockets via `netbun` | **All Bun versions** (1.3.x+) |
| `next` | `socks-proxy-agent` / `https-proxy-agent` | Bun ≥ (future release with #31587) or Node.js |

## License

MIT
