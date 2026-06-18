# Bun SOCKS5 代理支持调研

> 日期: 2026-06-18

## 问题

Bun 的 `http.request()` 忽略自定义 Agent（`SocksProxyAgent`、`HttpsProxyAgent`），导致 `opencode-provider-proxy` 插件的 SOCKS5 代理功能失效。

## 根因

Bun 的 `node:http` 实现是基于 fetch 的，不是 Node.js 原生的 `net.Socket` + `llhttp` 实现。因此第三方 Agent（如 `socks-proxy-agent`）的 `createConnection` 方法被完全跳过，请求直接走 Bun 原生 fetch（直连）。

## 关键 PR

### PR #31587 — node:http rewrite (Merged 2026-06-17)

- **状态**: ✅ **MERGED** — 昨天刚合入 main 分支
- **变更**: 将 `node:http` 客户端重写为基于 `net/tls` + `llhttp`，替换了原先的 fetch-based 实现
- **影响**:
  - `http.request()` 现在走 `Agent.addRequest`/`createConnection` 路径
  - 修复了第三方 Agent（`https-proxy-agent`、`socks-proxy-agent`）的兼容性
  - Node http 测试通过率从 ~55% 提升到 82.3%
- **发布**: 尚未进入正式版（当前 Bun 1.3.13 不包含此改动）

### PR #23220 — SOCKS5 native support (Closed)

- **状态**: ❌ **CLOSED** — 未合入
- **原因**: 有 critical bug（stall after handshake），请求卡死；CI 全平台 timeout
- **结论**: Bun 的 native SOCKS5 支持尚未 ready

### PR #30406 — SOCKS5 by human contributor (Open)

- **状态**: ⏳ OPEN — 目前最有希望的 SOCKS5 PR
- 由人类贡献者提交（非 bot），可能在 #31587 基础上实现

### Issue #15499 — agents not working (Open)

- **状态**: ⏳ OPEN — 20 👍
- 将被 #31587 修复

## 当前插件策略

### main 分支（当前）
- 使用 `netbun` 库（基于 Bun 原生 connect API）
- 绕过 `http.request()` + Agent，直接使用 `tls.connect({ socket })` + 原始 HTTP 解析
- **优点**: 立即生效，不依赖 Bun 版本
- **缺点**: 需要 bundle（esbuild），额外依赖

### next 分支
- 使用 `socks-proxy-agent`（恢复最初方案）
- **条件**: 需要 Bun 版本 >= 包含 #31587 的正式版
- **优点**: 代码更简洁，利用标准 Node.js API

## 测试结果

| 场景 | 结果 |
|------|------|
| SOCKS5 关闭 + Agent 方案 | ❌ 请求成功（直连，Bun 忽略 Agent） |
| SOCKS5 关闭 + netbun 方案 | ✅ ECONNREFUSED in 1-4ms |
| SOCKS5 运行 + netbun 方案 | ✅ ✓ 200 in ~7000ms |
| curl --socks5-hostname 验证 | ✅ 正确拒绝连接 |


## 相关链接

- [#31587 node:http rewrite](https://github.com/oven-sh/bun/pull/31587)
- [#23220 SOCKS5 proxy support](https://github.com/oven-sh/bun/pull/23220)
- [#15499 agents not working](https://github.com/oven-sh/bun/issues/15499)
- [#30406 SOCKS5 by jarred](https://github.com/oven-sh/bun/pull/30406)
- [#28396 node:http broken for proxies](https://github.com/oven-sh/bun/issues/28396)
