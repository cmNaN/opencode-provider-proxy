import type { Config, Hooks } from "@opencode-ai/plugin";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import * as http from "http";
import * as https from "https";
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

function createProxiedFetch(proxyUrl: string) {
  const isSocks = proxyUrl.startsWith("socks");
  const httpsAgent = isSocks
    ? new SocksProxyAgent(proxyUrl, { keepAlive: true })
    : new HttpsProxyAgent(proxyUrl, { keepAlive: true });
  const httpAgent = isSocks
    ? httpsAgent
    : new HttpProxyAgent(proxyUrl, { keepAlive: true });

  return async function proxiedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const opts: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: init?.method || "GET",
        agent: isHttps ? httpsAgent : httpAgent,
        headers: {},
        protocol: parsed.protocol,
      };

      if (init?.headers) {
        const hdrs = init.headers;
        const h: Record<string, string> = {};
        if (hdrs instanceof Headers) {
          hdrs.forEach((value, key) => {
            const existing = h[key];
            h[key] = existing ? `${existing}, ${value}` : value;
          });
        } else if (Array.isArray(hdrs)) {
          for (const [k, v] of hdrs) {
            const existing = h[k];
            h[k] = existing ? `${existing}, ${v}` : v;
          }
        } else {
          Object.assign(h, hdrs as Record<string, string>);
        }
        Object.assign(opts.headers!, h);
      }

      const req = mod.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on("error", (err: Error) => {
          req.destroy();
          reject(err);
        });
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          if (res.headers) {
            for (const [k, v] of Object.entries(res.headers)) {
              if (v === undefined || v === null) continue;
              if (Array.isArray(v)) {
                for (const item of v) headers.append(k, item);
              } else {
                headers.set(k, v);
              }
            }
          }
          resolve(
            new Response(body, {
              status: res.statusCode ?? 200,
              statusText: res.statusMessage ?? "",
              headers,
            })
          );
        });
      });

      req.on("error", reject);

      const TIMEOUT = 30_000; // 30 seconds
      req.setTimeout(TIMEOUT, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${TIMEOUT}ms`));
      });

      if (init?.body != null) {
        const body = init.body;

        if (typeof body === "string" || body instanceof Buffer) {
          req.write(body);
        } else if (body instanceof ReadableStream) {
          // Web API ReadableStream (e.g., response.body)
          const reader = body.getReader();
          const pump = (): void => {
            reader.read().then(
              ({ done, value }) => {
                if (done) {
                  req.end();
                  return;
                }
                req.write(Buffer.from(value));
                pump();
              },
              (err) => {
                req.destroy();
                reject(err);
              }
            );
          };
          pump();
          return;
        } else if (typeof (body as any).pipe === "function") {
          // Node.js Readable stream
          (body as any).pipe(req);
          (body as any).on("error", (err: Error) => {
            req.destroy();
            reject(err);
          });
          return;
        } else if (body instanceof ArrayBuffer) {
          req.write(Buffer.from(body));
        } else if (ArrayBuffer.isView(body)) {
          // TypedArray or DataView
          req.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
        } else if (body instanceof Blob) {
          // Blob/File - use arrayBuffer() to preserve binary data
          body.arrayBuffer().then(
            (buf) => {
              req.write(Buffer.from(buf));
              req.end();
            },
            (err) => {
              req.destroy();
              reject(err);
            }
          );
          return;
        } else {
          // Fallback: URLSearchParams works with String(), others get a clear error
          if (body instanceof URLSearchParams) {
            req.write(String(body));
          } else if (body instanceof FormData) {
            reject(new TypeError("FormData body is not supported in provider proxy"));
            return;
          } else {
            req.write(String(body));
          }
        }
      }
      req.end();
    });
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

        console.log(
          `[opencode-provider-proxy] Injecting proxy for "${providerId}" → ${proxyUrl}`
        );
        p.options = { ...p.options, fetch: createProxiedFetch(proxyUrl) };
      }
    },
  };
};

export default plugin;
