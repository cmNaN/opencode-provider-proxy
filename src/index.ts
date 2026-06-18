import type { Config, Hooks } from "@opencode-ai/plugin";
import { fetch as socksFetch } from "netbun";
import * as fs from "fs";
import * as path from "path";

const LOG_FILE = "/tmp/opencode-provider-proxy.log";
function log(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}

const CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ||
    path.join(process.env.HOME || "/root", ".config"),
  "opencode",
  "provider-proxy.json"
);

type ProxyConfig = Record<string, string>;

function readProxyConfig(): ProxyConfig {
  const envRaw = process.env.OPENCODE_PROVIDER_PROXY;
  if (envRaw) {
    try {
      const cfg = JSON.parse(envRaw);
      for (const [key, value] of Object.entries(cfg)) {
        if (typeof value !== "string") {
          console.warn(`[opencode-provider-proxy] Invalid config: "${key}" must be a string, got ${typeof value}`);
          delete cfg[key];
        }
      }
      return cfg;
    } catch {
      console.error("[opencode-provider-proxy] OPENCODE_PROVIDER_PROXY is not valid JSON");
    }
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    for (const [key, value] of Object.entries(cfg)) {
      if (typeof value !== "string") {
        console.warn(`[opencode-provider-proxy] Invalid config: "${key}" must be a string, got ${typeof value}`);
        delete cfg[key];
      }
    }
    return cfg;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[opencode-provider-proxy] Failed to read", CONFIG_PATH, e);
    }
  }

  return {};
}

let _reqId = 0;

function createProxiedFetch(proxyUrl: string) {
  return async function proxiedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const id = ++_reqId;
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const parsed = new URL(urlStr);
    const t0 = Date.now();

    log(`[#${id}] → ${init?.method || "GET"} ${parsed.hostname}${parsed.pathname} via ${proxyUrl}`);

    try {
      const response = await (socksFetch as any)(input, {
        ...init,
        proxy: proxyUrl,
      });
      const ms = Date.now() - t0;
      log(`[#${id}] ✓ ${response.status} in ${ms}ms`);
      return response;
    } catch (err) {
      const ms = Date.now() - t0;
      log(`[#${id}] ✗ FAIL after ${ms}ms: ${(err as Error).message}`);
      throw err;
    }
  };
}

const plugin = async (): Promise<Hooks> => {
  const cfg = readProxyConfig();
  const providers = Object.keys(cfg);

  if (providers.length === 0) {
    return {};
  }

  const wildcardUrl = cfg["*"];

  console.log(
    "[opencode-provider-proxy] Active mappings:",
    providers.map((id) => `${id} → ${cfg[id]}`).join(", ")
  );

  return {
    config: async (input: Config) => {
      const providerIds = Object.keys(input.provider ?? {});
      log(`=== config hook fired (providers: ${JSON.stringify(providerIds)}) ===`);

      for (const [providerId, p] of Object.entries(input.provider ?? {})) {
        const proxyUrl = cfg[providerId] ?? wildcardUrl;
        if (!proxyUrl) {
          log(`  provider "${providerId}": no proxy configured → SKIP`);
          continue;
        }

        const opts = (p as any).options ?? {};
        const hasExistingFetch = typeof opts.fetch === "function";
        log(`  provider "${providerId}": proxy=${proxyUrl}, hasExistingFetch=${hasExistingFetch}, optionsKeys=${Object.keys(opts)}`);

        if (hasExistingFetch) {
          log(`  ⚠  provider "${providerId}" already has a custom fetch — will OVERRIDE it`);
        }

        (p as any).options = { ...opts, fetch: createProxiedFetch(proxyUrl) };
        const after = typeof (p as any).options?.fetch === "function";
        log(`  provider "${providerId}": fetch injected=${after}`);
      }
    },
  };
};

export default plugin;
