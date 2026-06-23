import type { Hooks } from "@opencode-ai/plugin";
import { fetch as socksFetch } from "netbun";
import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "fs";
import * as path from "path";

const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ||
    path.join(process.env.HOME || "/root", ".config"),
  "opencode",
  "provider-proxy.json",
);

// Opt-in file log (opencode TUI swallows console); unset/empty env var disables it.
const DEBUG_LOG_PATH: string | undefined = (() => {
  const dir = process.env.OPENCODE_PROVIDER_PROXY_LOG_DIR?.trim();
  if (!dir) return undefined;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Unusable dir: debugLog's own guard then drops writes.
  }
  return path.join(dir, "opencode-provider-proxy-debug.log");
})();

function debugLog(line: string): void {
  if (!DEBUG_LOG_PATH) return;
  try {
    fs.appendFileSync(
      DEBUG_LOG_PATH,
      `[${new Date().toISOString()}] ${line}\n`,
    );
  } catch {
    // Never let logging break the actual request.
  }
}

// Mask an Authorization value so logs prove presence without leaking the token.
function maskAuth(value: string | null): string {
  if (!value) return "<none>";
  if (value.length <= 24) return `present len=${value.length} (short,masked)`;
  return `present len=${value.length} prefix="${value.slice(0, 16)}…${value.slice(-4)}"`;
}

type ProxyConfig = Record<string, string>;

function readProxyConfig(): ProxyConfig {
  const validate = (cfg: Record<string, unknown>): ProxyConfig => {
    for (const [key, value] of Object.entries(cfg)) {
      if (typeof value !== "string") {
        console.warn(
          `[opencode-provider-proxy] Invalid config: "${key}" must be a proxy URL string, got ${typeof value}`,
        );
        delete cfg[key];
      }
    }
    return cfg as ProxyConfig;
  };

  const envRaw = process.env.OPENCODE_PROVIDER_PROXY;
  if (envRaw) {
    try {
      return validate(JSON.parse(envRaw));
    } catch {
      console.error(
        "[opencode-provider-proxy] OPENCODE_PROVIDER_PROXY is not valid JSON",
      );
    }
  }

  try {
    return validate(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[opencode-provider-proxy] Failed to read", CONFIG_PATH, e);
    }
  }

  return {};
}

let _reqSeq = 0;

// Recursion guard: our own socksFetch send runs inside this context so the global interceptor
// skips it (otherwise it would re-proxy our outbound request and loop forever).
const proxyContext = new AsyncLocalStorage<boolean>();

// host -> proxyUrl. One mechanism covers BOTH token scenarios because globalThis.fetch is
// late-bound (read at call time): static-apiKey providers (key already in headers) and Copilot
// (whose Bearer-injecting options.fetch wrapper, installed by OpenCode, calls the bare global
// fetch) both land here and are routed by host.
const proxyByHost = new Map<string, string>();

let originalFetch: typeof globalThis.fetch | undefined;
let installedFetch: typeof globalThis.fetch | undefined;

function normalizeHost(host: string): string {
  return host.toLowerCase();
}

function urlOf(input: RequestInfo | URL): string | undefined {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return undefined;
}

function lookupProxyForInput(input: RequestInfo | URL): string | undefined {
  const raw = urlOf(input);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return (
      proxyByHost.get(normalizeHost(url.host)) ??
      proxyByHost.get(normalizeHost(url.hostname))
    );
  } catch {
    return undefined;
  }
}

async function sendThroughProxy(
  proxyUrl: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const seq = ++_reqSeq;

  // Fetch spec gotcha: when `input` is a Request AND `init.headers` is given, init.headers
  // REPLACES the Request's headers wholesale, silently dropping any Authorization carried on the
  // Request. Re-merge so it survives: init wins; the Request backfills only what init omitted.
  const headers = new Headers(init?.headers);
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
  }

  debugLog(
    `req#${seq} proxy=${proxyUrl} url=${urlOf(input) ?? String(input)} authorization=${maskAuth(headers.get("authorization"))}`,
  );

  const proxiedInit: RequestInit & { proxy: string } = {
    ...init,
    headers,
    proxy: proxyUrl,
  };

  try {
    const response = await proxyContext.run(true, () =>
      socksFetch(input, proxiedInit),
    );
    debugLog(`req#${seq} → status=${response.status} ok=${response.ok}`);
    if (!response.ok) {
      try {
        const bodyText = await response.clone().text();
        debugLog(`req#${seq} → body(<=800)=${bodyText.slice(0, 800)}`);
      } catch (be) {
        debugLog(`req#${seq} → body-read-error: ${(be as Error)?.message}`);
      }
    }
    return response;
  } catch (e) {
    debugLog(`req#${seq} → THREW: ${(e as Error)?.message}`);
    throw e;
  }
}

// Idempotent. Proxies only exact host matches; everything else falls through to the original
// fetch, so OpenCode's own plugin/auth/update/telemetry traffic is never routed through a proxy.
function installGlobalFetchInterceptor(): void {
  if (installedFetch) return;

  originalFetch = globalThis.fetch.bind(globalThis);

  installedFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Re-entry (our own socksFetch send runs inside proxyContext) → never intercept it.
    if (proxyContext.getStore()) return originalFetch!(input, init);
    const proxyUrl = lookupProxyForInput(input);
    if (!proxyUrl) return originalFetch!(input, init);
    return sendThroughProxy(proxyUrl, input, init);
  }) as typeof globalThis.fetch;

  globalThis.fetch = installedFetch;
  debugLog("global fetch interceptor installed");
}

const plugin = async (): Promise<Hooks> => {
  const cfg = readProxyConfig();
  const hosts = Object.keys(cfg);

  if (hosts.length === 0) {
    return {};
  }

  proxyByHost.clear();
  for (const [host, proxyUrl] of Object.entries(cfg)) {
    proxyByHost.set(normalizeHost(host), proxyUrl);
  }

  installGlobalFetchInterceptor();

  console.log(
    "[opencode-provider-proxy] Active host mappings:",
    hosts.map((h) => `${h} → ${cfg[h]}`).join(", "),
  );
  console.log(
    "[opencode-provider-proxy] DEBUG log →",
    DEBUG_LOG_PATH ?? "disabled (set OPENCODE_PROVIDER_PROXY_LOG_DIR to enable)",
  );

  return {};
};

export default plugin;
