# opencode-provider-proxy

[English](./README.md)

一个 [OpenCode](https://opencode.ai) 插件，按**域名（host）**把 AI provider 的 API 请求路由到代理。适用于部分 provider 端点（如 `api.githubcopilot.com`）只能通过公司 / 区域代理访问，而其余流量需要直连的场景。

它对**静态 apiKey** 类 provider（deepseek、openai…）和 **GitHub Copilot** 这类**动态 token** provider（其 OAuth `Bearer` token 由 OpenCode 在请求时注入）都生效——原理见[工作原理](#工作原理)。

## 安装

在 `~/.config/opencode/opencode.json` 中加入插件：

```json
{
  "plugin": ["git+https://github.com/cmNaN/opencode-provider-proxy.git"]
}
```

OpenCode 会在下次启动时直接从 GitHub 拉取——通过 HTTPS 克隆仓库（无需 SSH key），直接使用仓库中已提交的 `dist/index.js`，安装时无需构建步骤，也无需发布到 npm。`plugin` 是字符串数组，已有其他插件时追加即可。

如需锁定版本，可在同一 HTTPS 地址末尾追加 git ref：`git+https://github.com/cmNaN/opencode-provider-proxy.git#v1.0.0`（tag）或 `git+https://github.com/cmNaN/opencode-provider-proxy.git#semver:^1.0.0`。

随后创建代理配置（见[配置](#配置)），重启 OpenCode。

### 本地开发

```bash
git clone https://github.com/cmNaN/opencode-provider-proxy.git
cd opencode-provider-proxy
npm install
npm run build
```

把产物放入（或软链到）会被自动扫描的全局插件目录：

```bash
cp dist/index.js ~/.config/opencode/plugins/opencode-provider-proxy.js
# 或软链，便于跟随重新构建：
ln -s "$PWD/dist/index.js" ~/.config/opencode/plugins/opencode-provider-proxy.js
```

OpenCode 会自动加载 `~/.config/opencode/plugins/` 下的任意 `*.js` / `*.ts` 文件，因此本地文件**无需**写入 `plugin` 数组。

## 配置

插件按以下优先级读取 host → 代理 的映射：

1. 环境变量 `OPENCODE_PROVIDER_PROXY`（JSON 字符串），或
2. `~/.config/opencode/provider-proxy.json`（遵循 XDG：会读取 `$XDG_CONFIG_HOME`）。

schema 是扁平的 `{ "域名": "代理URL" }` 对象，**key 为域名**，value 为代理 URL：

```json
{
  "api.githubcopilot.com": "http://user:pass@proxy.example.com:18080",
  "api.deepseek.com": "socks5://127.0.0.1:1080"
}
```

当请求的 **host** 命中某个配置 key（精确匹配）时走代理；其余请求一律直连、不做任何改动。配置仅在启动时读取一次，**修改后需重启 OpenCode**。

等价的环境变量写法：

```bash
export OPENCODE_PROVIDER_PROXY='{"api.githubcopilot.com":"http://user:pass@proxy.example.com:18080"}'
```

### 认证

直接把代理凭证写进代理 URL：

```
http://username:password@proxy.example.com:18080
socks5://username:password@127.0.0.1:1080
```

用户名 / 密码中的特殊字符需做 URL 编码（如 `@` → `%40`，`:` → `%3A`）。

### 支持的代理类型

| 协议 | 说明 |
| --- | --- |
| `http` / `https` | HTTP `CONNECT` 隧道代理 |
| `socks5` / `socks5h` | SOCKS5（`socks5h` 由代理端解析 DNS） |
| `socks4` / `socks4a` | SOCKS4 / SOCKS4a |
| `socks` | SOCKS5 别名 |

### 可选的调试日志

日志**默认关闭**。把 `OPENCODE_PROVIDER_PROXY_LOG_DIR` 设为某个目录即可开启：插件会（递归）创建该目录并写入 `<dir>/opencode-provider-proxy-debug.log`。未设置或为空 → 不写任何日志文件。日志中的 `Authorization` token 会被脱敏。

```bash
export OPENCODE_PROVIDER_PROXY_LOG_DIR="$HOME/.cache/opencode-provider-proxy"
```

## 工作原理

插件在加载时：

1. 读取 host → 代理 映射，并在全局 `fetch` 上安装**一个**幂等拦截器。
2. 对每个请求提取 host 并查表：
   - **命中** → 通过原始 TCP socket（[netbun](https://github.com/phederal/netbun)）经代理发送，保留 method、headers、body。
   - **未命中** → 原样交给原始 `fetch`，不做任何改动（因此 OpenCode 自身的插件 / 认证 / 更新 / 遥测流量永远不会被代理）。

在**全局 `fetch`** 上拦截，是单一机制同时覆盖两种 token 场景的关键，因为 OpenCode 的 provider SDK 在调用时才读取 `globalThis.fetch`：

- **静态 apiKey provider** 的 key 已在请求头里，并调用全局 `fetch` → 被拦截并代理。
- **GitHub Copilot** 使用动态 OAuth `Bearer` token，由 OpenCode 通过它自己的 `options.fetch` wrapper 注入，而该 wrapper 调用的是**裸的**全局 `fetch`。本插件**从不改动 `options.fetch`**，因此 Copilot 的 wrapper 仍会注入最新的 `Bearer`，其外发请求依然落入我们的拦截器并被代理。（覆盖 `options.fetch` 正是此前导致 `400 missing required Authorization header` 的原因——本设计避免了它。）

当 `input` 为 `Request` 对象时，会对 headers 做重新合并，避免调用方传入的 `init.headers` 误丢 `Authorization`。同时用 `AsyncLocalStorage` 做递归保护，确保经代理的发送不会再次进入拦截器。

## Bun / 运行时兼容性

代理通过原始 TCP socket 实现（netbun 的 HTTP-`CONNECT` / SOCKS），而非 Node 的 `http`/`https` agent。这绕开了 Bun 历史上忽略自定义 agent 的问题（[oven-sh/bun#15499](https://github.com/oven-sh/bun/issues/15499)），在各运行时表现一致。netbun 已打包进发布产物，因此本包**无任何运行时依赖**。

常见可直接使用的代理软件：Squid、tinyproxy、3proxy、Dante（SOCKS）、shadowsocks（`socks5`）以及大多数公司 HTTP 代理。

## 分支

| 分支 | 代理机制 |
| --- | --- |
| `master`（当前） | netbun 原始 TCP socket（HTTP CONNECT / SOCKS），全运行时可用 |

## 许可证

MIT
