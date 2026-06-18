import type { Config, Hooks } from "@opencode-ai/plugin";
import { fetch as socksFetch } from "netbun";
import * as fs from "fs";
import * as path from "path";

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
    try {
      const response = await (socksFetch as any)(input, {
        ...init,
        proxy: proxyUrl,
      });
      return response;
    } catch (err) {
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
      for (const [providerId, p] of Object.entries(input.provider ?? {})) {
        const proxyUrl = cfg[providerId] ?? wildcardUrl;
        if (!proxyUrl) continue;

        const opts = (p as any).options ?? {};
        (p as any).options = { ...opts, fetch: createProxiedFetch(proxyUrl) };
      }
    },
  };
};

export default plugin;
