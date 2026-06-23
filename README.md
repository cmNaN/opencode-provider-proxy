# opencode-provider-proxy

[中文文档](./README_ZH.md)

An [OpenCode](https://opencode.ai) plugin that routes AI provider API requests through a proxy, matched **by hostname**. Useful when some provider endpoints (e.g. `api.githubcopilot.com`) are only reachable through a corporate / regional proxy, while everything else should go direct.

It works for both **static-apiKey** providers (deepseek, openai, …) and **dynamic-token** providers like **GitHub Copilot** (whose OAuth `Bearer` token is injected by OpenCode at request time) — see [How it works](#how-it-works).

## Install

Add the plugin to your OpenCode config at `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["git+https://github.com/cmNaN/opencode-provider-proxy.git"]
}
```

OpenCode installs it straight from GitHub on the next start — it clones the repo over HTTPS (no SSH key required) and uses the prebuilt `dist/index.js` committed in the repo, so there is no build step at install time and no npm publish is required. `plugin` is a string array — append to it if you already have other plugins.

To pin a version, append a git ref to the same HTTPS URL: `git+https://github.com/cmNaN/opencode-provider-proxy.git#v1.0.0` (tag) or `git+https://github.com/cmNaN/opencode-provider-proxy.git#semver:^1.0.0`.

Then create the proxy config (see [Configuration](#configuration)) and restart OpenCode.

### Local development

```bash
git clone https://github.com/cmNaN/opencode-provider-proxy.git
cd opencode-provider-proxy
npm install
npm run build
```

Drop (or symlink) the built file into the auto-scanned global plugins directory:

```bash
cp dist/index.js ~/.config/opencode/plugins/opencode-provider-proxy.js
# or, to track rebuilds automatically:
ln -s "$PWD/dist/index.js" ~/.config/opencode/plugins/opencode-provider-proxy.js
```

OpenCode auto-loads any `*.js` / `*.ts` under `~/.config/opencode/plugins/`, so a local file does **not** need to be listed in the `plugin` array.

## Configuration

The plugin reads its host → proxy map from (in order of precedence):

1. The `OPENCODE_PROVIDER_PROXY` environment variable (a JSON string), or
2. `~/.config/opencode/provider-proxy.json` (XDG-aware: honors `$XDG_CONFIG_HOME`).

The schema is a flat `{ "hostname": "proxyUrl" }` object. **Keys are hostnames**, values are proxy URLs:

```json
{
  "api.githubcopilot.com": "http://user:pass@proxy.example.com:63128",
  "api.deepseek.com": "socks5://127.0.0.1:1080"
}
```

A request is proxied when its **host** matches a configured key (exact host match). Every other request goes out directly, untouched. The config is read once at startup, so **restart OpenCode after changing it**.

Equivalent environment-variable form:

```bash
export OPENCODE_PROVIDER_PROXY='{"api.githubcopilot.com":"http://user:pass@proxy.example.com:63128"}'
```

### Authentication

Embed proxy credentials directly in the proxy URL:

```
http://username:password@proxy.example.com:63128
socks5://username:password@127.0.0.1:1080
```

URL-encode special characters in the username/password (e.g. `@` → `%40`, `:` → `%3A`).

### Supported proxy types

| Scheme | Description |
| --- | --- |
| `http` / `https` | HTTP `CONNECT` tunneling proxy |
| `socks5` / `socks5h` | SOCKS5 (with `socks5h` resolving DNS at the proxy) |
| `socks4` / `socks4a` | SOCKS4 / SOCKS4a |
| `socks` | Alias for SOCKS5 |

### Optional debug logging

Logging is **off by default**. To enable it, set `OPENCODE_PROVIDER_PROXY_LOG_DIR` to a directory; the plugin creates it (recursively) and writes `<dir>/opencode-provider-proxy-debug.log`. Unset or empty → no log file is written. The `Authorization` token is masked in the log.

```bash
export OPENCODE_PROVIDER_PROXY_LOG_DIR="$HOME/.cache/opencode-provider-proxy"
```

## How it works

At load time the plugin:

1. Reads the host → proxy map and installs **one** idempotent interceptor over the global `fetch`.
2. For each request, it extracts the host and looks it up in the map.
   - **Match** → the request is sent through the proxy using raw TCP sockets ([netbun](https://github.com/phederal/netbun)), preserving method, headers, and body.
   - **No match** → it falls through to the original `fetch`, completely untouched (so OpenCode's own plugin / auth / update / telemetry traffic is never proxied).

Routing on the **global `fetch`** is what makes a single mechanism cover both token scenarios, because OpenCode's provider SDKs read `globalThis.fetch` at call time:

- **Static-apiKey providers** already carry their key in the request headers and call the global `fetch` → intercepted and proxied.
- **GitHub Copilot** uses a dynamic OAuth `Bearer` token that OpenCode injects via its own `options.fetch` wrapper, which then calls the **bare** global `fetch`. This plugin **never touches `options.fetch`**, so Copilot's wrapper keeps adding the fresh `Bearer` token and its outbound call still lands in our interceptor and gets proxied. (Overwriting `options.fetch` is exactly what previously caused the `400 missing required Authorization header` error — this design avoids it.)

A request whose `input` is a `Request` object has its headers re-merged so a caller-supplied `init.headers` cannot accidentally drop the `Authorization` header. A recursion guard (`AsyncLocalStorage`) ensures the proxied send does not re-enter the interceptor.

## Bun / runtime compatibility

Proxying is implemented with raw TCP sockets (via netbun's HTTP-`CONNECT` / SOCKS implementation) rather than a Node `http`/`https` agent. This sidesteps Bun's historical issue of ignoring custom agents ([oven-sh/bun#15499](https://github.com/oven-sh/bun/issues/15499)) and works consistently across runtimes. netbun is bundled into the published file, so the package has **zero runtime dependencies**.

Common proxy software that works out of the box: Squid, tinyproxy, 3proxy, Dante (SOCKS), shadowsocks (`socks5`), and most corporate HTTP proxies.

## Branches

| Branch | Proxy mechanism |
| --- | --- |
| `master` (this) | netbun raw TCP sockets (HTTP CONNECT / SOCKS), works on all runtimes |

## License

MIT
