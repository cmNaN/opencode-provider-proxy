// node_modules/netbun/dist/index.js
import * as e from "dns";
import * as JJ from "net";
import * as QJ from "tls";
import * as g from "zlib";
var U = /[^A-Za-z0-9._~-]/;
var FJ = /^\d+$/;
function l(Q, J = false) {
  if (Array.isArray(Q)) {
    let V = [];
    for (let W of Q) try {
      V.push(r(W));
    } catch (F) {
      if (!J) throw F;
    }
    return V;
  }
  return r(Q);
}
function r(Q) {
  if (!Q) throw Error("Proxy URL cannot be empty");
  let J = "socks5", V = Q, W = Q.indexOf("://");
  if (W !== -1) {
    let Y = Q.charCodeAt(0);
    if (Y !== 115 && Y !== 104) throw J = Q.substring(0, W), Error(`Unsupported proxy protocol: ${J}. Supported protocols: socks5, socks4, http, https.`);
    if (J = Q.substring(0, W), V = Q.substring(W + 3), !(Y === 115 && (J.charCodeAt(5) === 53 || J.charCodeAt(5) === 52) || Y === 104)) throw Error(`Unsupported proxy protocol: ${J}. Supported protocols: socks5, socks4, http, https.`);
  }
  let F = 0, K = false;
  for (let Y = 0; Y < V.length; Y++) {
    let $ = V.charCodeAt(Y);
    if ($ === 91) K = true;
    else if ($ === 93) K = false;
    else if ($ === 58 && !K) F++;
  }
  if (W !== -1 && F !== 3) {
    let Y = V.indexOf("@");
    if (Y !== -1) {
      let $ = V.substring(0, Y), z = V.substring(Y + 1), A = z.split(":"), G = A[A.length - 1];
      if (FJ.test(G)) return Q;
      else {
        let q = $, Z = z, D = Z.indexOf(":");
        if (D === -1) {
          let C = U.test(Z) ? encodeURIComponent(Z) : Z;
          return `${J}://${C}@${q}`;
        }
        let N = Z.substring(0, D), _ = Z.substring(D + 1), w = U.test(N), O = U.test(_), X = w ? encodeURIComponent(N) : N, R = O ? encodeURIComponent(_) : _;
        return `${J}://${X}:${R}@${q}`;
      }
    } else if (F === 1) return Q;
  }
  if (F < 1) throw Error(`Invalid proxy format: ${Q}. Expected format: host:port or host:port:username:password`);
  if (F === 1) {
    let Y, $, z;
    if (V.charCodeAt(0) === 91) {
      let G = V.indexOf("]");
      if (G === -1) throw Error("Invalid IPv6 format: missing closing bracket");
      $ = V.substring(0, G + 1), Y = G + 1, z = V.substring(Y + 1);
    } else Y = V.indexOf(":"), $ = V.substring(0, Y), z = V.substring(Y + 1);
    let A = parseInt(z, 10);
    if (Number.isNaN(A) || A < 1 || A > 65535) throw Error(`Invalid port: ${z}`);
    return `${J}://${$}:${z}`;
  }
  if (F === 3) {
    let Y, $, z, A;
    if (V.charCodeAt(0) === 91) {
      let N = V.indexOf("]");
      if (N === -1) throw Error("Invalid IPv6 format: missing closing bracket");
      Y = V.substring(0, N + 1);
      let w = V.substring(N + 2).split(":");
      $ = w[0], z = w[1], A = w[2];
    } else {
      let N = V.split(":");
      Y = N[0], $ = N[1], z = N[2], A = N[3];
    }
    let G = parseInt($, 10);
    if (Number.isNaN(G) || G < 1 || G > 65535) throw Error(`Invalid port: ${$}`);
    if (!z) throw Error("Username cannot be empty when password is provided");
    let M = U.test(z), q = U.test(A), Z = M ? encodeURIComponent(z) : z, D = q ? encodeURIComponent(A) : A;
    return `${J}://${Z}:${D}@${Y}:${$}`;
  }
  throw Error(`Invalid proxy format: ${Q}. Expected 1 or 3 colons (host:port or host:port:username:password)`);
}
var o = class {
  pool = /* @__PURE__ */ new Map();
  maxConnectionsPerKey = 50;
  connectionTtl = 6e4;
  constructor(Q) {
    if (Q?.maxConnectionsPerKey) this.maxConnectionsPerKey = Q.maxConnectionsPerKey;
    if (Q?.connectionTtl) this.connectionTtl = Q.connectionTtl;
    setInterval(() => this.cleanupStale(), 3e4).unref();
  }
  getConnection(Q) {
    let J = this.pool.get(Q);
    if (!J || J.length === 0) return null;
    for (let V = 0; V < J.length; V++) {
      let W = J[V];
      if (this.isConnectionHealthy(W)) return J.splice(V, 1), W.lastUsed = Date.now(), W;
    }
    return null;
  }
  async releaseConnection(Q, J) {
    if (!this.isConnectionHealthy(J)) {
      J.socket.destroy();
      return;
    }
    let V = this.pool.get(Q) || [];
    if (V.length >= this.maxConnectionsPerKey) {
      J.socket.destroy();
      return;
    }
    J.lastUsed = Date.now(), V.push(J), this.pool.set(Q, V);
  }
  cleanupStale() {
    let Q = Date.now();
    for (let [J, V] of this.pool.entries()) {
      let W = V.filter((F) => {
        if (Q - F.lastUsed > this.connectionTtl) return F.socket.destroy(), false;
        return true;
      });
      if (W.length === 0) this.pool.delete(J);
      else this.pool.set(J, W);
    }
  }
  isConnectionHealthy(Q) {
    let J = Q.socket;
    if (J.destroyed || !J.writable || !J.readable) return false;
    if (Q.useTLS && "authorized" in J) {
      let V = J;
      if (!V.authorized && !V.authorizationError) return false;
    }
    return true;
  }
  getStats() {
    let Q = {};
    for (let [J, V] of this.pool.entries()) Q[J] = V.length;
    return Q;
  }
  clear() {
    for (let Q of this.pool.values()) for (let J of Q) J.socket.destroy();
    this.pool.clear();
  }
};
var n = new o();
var E = globalThis.fetch;
var KJ = Buffer.from(`\r
\r
`);
function VJ(Q) {
  try {
    let J = new URL(Q), V = J.protocol;
    if (!["socks5:", "socks4:", "http:", "https:"].includes(V)) throw Error(`Unsupported proxy protocol: ${V}. Supported protocols: socks5, socks4, http, https.`);
    let F = J.username ? decodeURIComponent(J.username) : "", K = J.password ? decodeURIComponent(J.password) : "", Y = J.hostname;
    if (Y.startsWith("[") && Y.endsWith("]")) Y = Y.slice(1, -1);
    let $ = 1080;
    if (V === "http:" || V === "https:") $ = 8080;
    let z = J.port ? parseInt(J.port, 10) : $;
    return { host: Y, port: z, user: F, password: K, protocol: V.slice(0, -1) };
  } catch (J) {
    throw Error(`Invalid proxy URL: ${Q}. Error: ${J.message}`);
  }
}
async function WJ(Q, J, V, W = false, F = false, K, Y) {
  let $ = VJ(Q), z = J;
  if (z.charCodeAt(0) === 91 && z.charCodeAt(z.length - 1) === 93) z = z.slice(1, -1);
  let A = (G) => new Promise((M, q) => {
    let Z = JJ.connect($.port, $.host), D = () => {
      Z.destroy(), q(K?.reason || Error("Request aborted"));
    };
    if (K) {
      if (K.aborted) {
        Z.destroy(), q(K.reason || Error("Request aborted"));
        return;
      }
      K.addEventListener("abort", D);
    }
    let N = () => {
      if (K) K.removeEventListener("abort", D);
    };
    Z.on("error", (O) => {
      if (N(), O.code === "ENOTFOUND") q(Error(`SOCKS5 proxy host not found: ${$.host}`));
      else q(O);
    }), Z.setTimeout(3e4, () => {
      N(), Z.destroy(), q(Error("Proxy connection timed out"));
    }), Z.on("connect", () => {
      Z.setTimeout(0);
      let O = $.user && $.password ? [0, 2] : [0];
      Z.write(Buffer.from([5, O.length, ...O]));
    });
    let _ = "handshake";
    Z.on("data", (O) => {
      try {
        if (_ === "handshake") {
          if (O[0] !== 5) throw Error("Invalid SOCKS version");
          let X = O[1];
          if (X === 2) {
            if (!$.user) throw Error("Proxy requested auth, but no credentials provided in URL");
            let R = Buffer.from($.user), P = Buffer.from($.password);
            Z.write(Buffer.from([1, R.length, ...R, P.length, ...P])), _ = "auth";
          } else if (X === 0) w();
          else throw Error("Proxy rejected supported authentication methods");
        } else if (_ === "auth") {
          if (O[1] !== 0) throw Error("SOCKS5 Authentication failed");
          w();
        } else if (_ === "connect") {
          if (O[1] !== 0) throw Error(`SOCKS5 Connect failed: ${O[1]}`);
          if (N(), Z.removeAllListeners("data"), Z.removeAllListeners("error"), Z.removeAllListeners("timeout"), W) {
            let X = QJ.connect({ socket: Z, servername: J, ...Y });
            X.once("secureConnect", () => M(X)), X.once("error", q);
          } else M(Z);
        }
      } catch (X) {
        N(), Z.destroy(), q(X);
      }
    });
    function w() {
      let O;
      if (F) {
        let X = G.split(".").map(Number);
        O = Buffer.concat([Buffer.from([5, 1, 0, 1]), Buffer.from(X), Buffer.from([V >> 8 & 255, V & 255])]);
      } else {
        let X = Buffer.from(G);
        O = Buffer.concat([Buffer.from([5, 1, 0, 3, X.length]), X, Buffer.from([V >> 8 & 255, V & 255])]);
      }
      Z.write(O), _ = "connect";
    }
  });
  if (F) return new Promise((G, M) => {
    e.lookup(z, { family: 4 }, (q, Z) => {
      if (q) return M(q);
      A(Z).then(G).catch(M);
    });
  });
  else return A(z);
}
function t(Q) {
  let J = [], V = 0;
  while (V < Q.length) {
    let Y = V;
    while (Y < Q.length && Q[Y] !== 13) Y++;
    if (Y >= Q.length || Q[Y + 1] !== 10) break;
    let z = new TextDecoder().decode(Q.subarray(V, Y)), A = parseInt(z, 16);
    if (Number.isNaN(A)) {
      V = Y + 2;
      continue;
    }
    if (A === 0) break;
    let G = Y + 2, M = G + A;
    if (M > Q.length) break;
    J.push(Q.subarray(G, M)), V = M + 2;
  }
  let W = J.reduce((Y, $) => Y + $.length, 0), F = new Uint8Array(W), K = 0;
  for (let Y of J) F.set(Y, K), K += Y.length;
  return F;
}
async function YJ(Q, J, V = 20, W = 0, F) {
  let K;
  try {
    K = await a(Q, J || {}, F);
  } catch (O) {
    let X = O;
    if (X.name === "AbortError" || "code" in X && X.code === 20) throw Error(`Request aborted${W > 0 ? ` after ${W} redirect(s)` : ""}: ${X.message || "The operation was aborted"}`);
    throw O;
  }
  let Y = K.status, $ = K.headers.get("location");
  if (W >= V) throw Error(`Maximum redirects exceeded: ${V}`);
  if (!Y || !$ || Y < 300 || Y >= 400) return K;
  if (![301, 302, 303, 307, 308].includes(Y)) return K;
  let A = J?.method || "GET", G, M = false;
  if (Y === 303 || (Y === 301 || Y === 302) && A !== "GET" && A !== "HEAD") G = "GET", M = true;
  else G = A;
  let q = new URL(Q instanceof Request ? Q.url : Q.toString()), Z;
  if ($.startsWith("http://") || $.startsWith("https://")) Z = $;
  else Z = new URL($, q).toString();
  let D = new URL(Z), N = q.origin !== D.origin, _ = new Headers(J?.headers);
  if (N) _.delete("authorization"), _.delete("cookie"), _.delete("proxy-authorization");
  if (!_.has("referer")) _.set("referer", q.href);
  let w = { ...J, method: G, body: M ? void 0 : J?.body, headers: _, proxy: J?.proxy };
  return YJ(Z, w, V, W + 1);
}
async function y(Q, J) {
  let V = J?.redirect || "follow";
  if (V === "manual") return a(Q, J || {});
  else if (V === "error") {
    let W = await a(Q, J || {}), F = W.status, K = W.headers.get("location");
    if (F && F >= 300 && F < 400 && K) throw Error(`Redirect to ${K} requested but redirect mode is 'error'`);
    return W;
  } else return YJ(Q, J || {});
}
async function a(Q, J, V) {
  let W;
  if (J?.proxy === void 0) {
    let Z = process.env.SOCKS5_PROXY || process.env.SOCKS_PROXY || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (Z) {
      if (W = Z, Z.charCodeAt(0) !== 115) {
        let D = { ...J, proxy: Z };
        return E(Q, D);
      }
    } else return E(Q, J);
  } else if (J?.proxy === null) {
    let { proxy: Z, ...D } = J || {};
    return E(Q, D);
  } else W = typeof J.proxy === "string" ? J.proxy : J.proxy.url;
  let F = W;
  try {
    F = l(F);
  } catch (Z) {
    console.error(`Error converting proxy URL ${W}`);
  }
  if (!F || F.charCodeAt(0) !== 115) return E(Q, J);
  try {
    let Z = VJ(F);
    if (Z.protocol === "http" || Z.protocol === "https") return E(Q, J);
  } catch (Z) {
    return console.warn(`Invalid proxy configuration: "${F}". Falling back to native fetch.`), E(Q, J);
  }
  let K = Q instanceof Request ? new Request(Q, J) : new Request(Q.toString(), J), Y = new URL(K.url), $ = Y.protocol.charCodeAt(4) === 115, z = Y.port ? parseInt(Y.port, 10) : $ ? 443 : 80, A = null;
  try {
    let Z = await K.arrayBuffer();
    if (Z.byteLength > 0) A = new Uint8Array(Z);
  } catch (Z) {
  }
  let G = J?.proxy?.resolveDnsLocally ?? false, M, q;
  if (V) M = V.socket, q = V;
  else {
    let Z = `${F}:${Y.hostname}:${z}:${$}`, D = n.getConnection(Z);
    if (D) M = D.socket, q = D;
    else M = await WJ(F, Y.hostname, z, $, G, J?.signal || void 0, J?.tls), q = { socket: M, proxyUrl: F, targetHost: Y.hostname, targetPort: z, useTLS: $, lastUsed: Date.now(), created: Date.now() };
  }
  return new Promise((Z, D) => {
    let N = () => {
      M.destroy(), D(J?.signal?.reason || Error("Request aborted"));
    };
    if (J?.signal) {
      if (J.signal.aborted) {
        M.destroy(), D(J.signal.reason || Error("Request aborted"));
        return;
      }
      J.signal.addEventListener("abort", N);
    }
    let _ = () => {
      if (J?.signal) J.signal.removeEventListener("abort", N);
    }, w = Y.pathname + Y.search, O = Y.hostname + (Y.port ? `:${Y.port}` : ""), X = `${K.method} ${w} HTTP/1.1\r
`;
    if (X += `Host: ${O}\r
`, X += `Connection: close\r
`, !K.headers.has("accept")) X += `Accept: */*\r
`;
    if (!K.headers.has("accept-encoding")) X += `Accept-Encoding: gzip, deflate, br, zstd\r
`;
    if (A && !K.headers.has("content-length")) K.headers.set("Content-Length", A.byteLength.toString());
    if (K.headers.forEach((v, j) => {
      let H = j.toLowerCase();
      if (H !== "host" && H !== "connection") X += `${j}: ${v}\r
`;
    }), X += `\r
`, M.write(X), A) M.write(A);
    let R = [], P = 0, C = false, h = null, T = null, c = 200, s = "", f = 0;
    M.on("data", (v) => {
      if (R.push(v), P += v.length, !C) {
        let H = Buffer.concat(R), L = H.indexOf(KJ);
        if (L === -1) return;
        let S = H.subarray(0, L).toString().split(`\r
`), [I, b, ...m] = S[0].split(" ");
        c = parseInt(b, 10) || 200, s = m.join(" "), T = new Headers();
        for (let u = 1; u < S.length; u++) {
          let k = S[u];
          if (!k) continue;
          let d = k.indexOf(":");
          if (d > 0) {
            let ZJ = k.substring(0, d).trim(), $J = k.substring(d + 1).trim();
            T.append(ZJ, $J);
          }
        }
        let x = T.get("content-length");
        h = x ? parseInt(x, 10) : null, f = L + 4, C = true, j(H);
      } else {
        let H = Buffer.concat(R);
        j(H);
      }
      function j(H) {
        if (!T || !C) return;
        let L = T.get("transfer-encoding"), B = H.subarray(f);
        if (L?.includes("chunked")) try {
          let p = t(B);
        } catch {
          return;
        }
        else if (h !== null) {
          if (B.length >= h) {
            i(H);
            return;
          }
        } else return;
      }
    }), M.on("end", () => {
      if (_(), !C) {
        D(Error("Invalid HTTP response: No header separator found"));
        return;
      }
      let v = Buffer.concat(R);
      i(v);
    });
    function i(v) {
      if (!T) return;
      let j = new Uint8Array(v.subarray(f));
      if (T.get("transfer-encoding")?.includes("chunked")) j = t(j);
      let L = new Uint8Array(j), B = T.get("content-encoding");
      if (B) {
        let p = B.split(",").map((S) => S.trim());
        for (let S of p) if (S === "gzip") L = Bun.gunzipSync(L), T.delete("content-encoding"), T.set("content-length", L.byteLength.toString());
        else if (S === "deflate") {
          try {
            let I = Bun.inflateSync(Buffer.from(L));
            L = new Uint8Array(I);
          } catch (I) {
            try {
              let b = Buffer.from(L), m = g.inflateSync(b);
              L = new Uint8Array(m);
            } catch (b) {
              let m = Buffer.from(L), x = Bun.gunzipSync(m);
              L = new Uint8Array(x);
            }
          }
          T.delete("content-encoding"), T.set("content-length", L.byteLength.toString());
        } else if (S === "br") {
          try {
            let I = g.brotliDecompressSync(Buffer.from(L));
            L = new Uint8Array(I);
          } catch (I) {
            throw Error(`Brotli decompression failed: ${I.message}`);
          }
          T.delete("content-encoding"), T.set("content-length", L.byteLength.toString());
        } else if (S === "zstd") {
          try {
            let I = Bun.zstdDecompressSync(L);
            L = new Uint8Array(I);
          } catch (I) {
            throw Error(`Zstd decompression failed: ${I.message}`);
          }
          T.delete("content-encoding"), T.set("content-length", L.byteLength.toString());
        }
      }
      Z(new Response(L, { status: c, statusText: s, headers: T }));
    }
    M.on("error", (v) => {
      _(), D(v);
    });
  });
}
y.preconnect = function(J) {
};

// src/index.ts
import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "fs";
import * as path from "path";
var CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "/root", ".config"),
  "opencode",
  "provider-proxy.json"
);
var DEBUG_LOG_PATH = (() => {
  const dir = process.env.OPENCODE_PROVIDER_PROXY_LOG_DIR?.trim();
  if (!dir) return void 0;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
  }
  return path.join(dir, "opencode-provider-proxy-debug.log");
})();
function debugLog(line) {
  if (!DEBUG_LOG_PATH) return;
  try {
    fs.appendFileSync(
      DEBUG_LOG_PATH,
      `[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}
`
    );
  } catch {
  }
}
function maskAuth(value) {
  if (!value) return "<none>";
  if (value.length <= 24) return `present len=${value.length} (short,masked)`;
  return `present len=${value.length} prefix="${value.slice(0, 16)}\u2026${value.slice(-4)}"`;
}
function readProxyConfig() {
  const validate = (cfg) => {
    for (const [key, value] of Object.entries(cfg)) {
      if (typeof value !== "string") {
        console.warn(
          `[opencode-provider-proxy] Invalid config: "${key}" must be a proxy URL string, got ${typeof value}`
        );
        delete cfg[key];
      }
    }
    return cfg;
  };
  const envRaw = process.env.OPENCODE_PROVIDER_PROXY;
  if (envRaw) {
    try {
      return validate(JSON.parse(envRaw));
    } catch {
      console.error(
        "[opencode-provider-proxy] OPENCODE_PROVIDER_PROXY is not valid JSON"
      );
    }
  }
  try {
    return validate(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")));
  } catch (e2) {
    if (e2.code !== "ENOENT") {
      console.error("[opencode-provider-proxy] Failed to read", CONFIG_PATH, e2);
    }
  }
  return {};
}
var _reqSeq = 0;
var proxyContext = new AsyncLocalStorage();
var proxyByHost = /* @__PURE__ */ new Map();
var originalFetch;
var installedFetch;
function normalizeHost(host) {
  return host.toLowerCase();
}
function urlOf(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return void 0;
}
function lookupProxyForInput(input) {
  const raw = urlOf(input);
  if (!raw) return void 0;
  try {
    const url = new URL(raw);
    return proxyByHost.get(normalizeHost(url.host)) ?? proxyByHost.get(normalizeHost(url.hostname));
  } catch {
    return void 0;
  }
}
async function sendThroughProxy(proxyUrl, input, init) {
  const seq = ++_reqSeq;
  const headers = new Headers(init?.headers);
  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
  }
  debugLog(
    `req#${seq} proxy=${proxyUrl} url=${urlOf(input) ?? String(input)} authorization=${maskAuth(headers.get("authorization"))}`
  );
  const proxiedInit = {
    ...init,
    headers,
    proxy: proxyUrl
  };
  try {
    const response = await proxyContext.run(
      true,
      () => y(input, proxiedInit)
    );
    debugLog(`req#${seq} \u2192 status=${response.status} ok=${response.ok}`);
    if (!response.ok) {
      try {
        const bodyText = await response.clone().text();
        debugLog(`req#${seq} \u2192 body(<=800)=${bodyText.slice(0, 800)}`);
      } catch (be) {
        debugLog(`req#${seq} \u2192 body-read-error: ${be?.message}`);
      }
    }
    return response;
  } catch (e2) {
    debugLog(`req#${seq} \u2192 THREW: ${e2?.message}`);
    throw e2;
  }
}
function installGlobalFetchInterceptor() {
  if (installedFetch) return;
  originalFetch = globalThis.fetch.bind(globalThis);
  installedFetch = (async (input, init) => {
    if (proxyContext.getStore()) return originalFetch(input, init);
    const proxyUrl = lookupProxyForInput(input);
    if (!proxyUrl) return originalFetch(input, init);
    return sendThroughProxy(proxyUrl, input, init);
  });
  globalThis.fetch = installedFetch;
  debugLog("global fetch interceptor installed");
}
var plugin = async () => {
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
    hosts.map((h) => `${h} \u2192 ${cfg[h]}`).join(", ")
  );
  console.log(
    "[opencode-provider-proxy] DEBUG log \u2192",
    DEBUG_LOG_PATH ?? "disabled (set OPENCODE_PROVIDER_PROXY_LOG_DIR to enable)"
  );
  return {};
};
var index_default = plugin;
export {
  index_default as default
};
