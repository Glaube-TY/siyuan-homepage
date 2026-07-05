/**
 * Siyuan proxy request wrapper — routes external HTTP through forwardProxy.
 * All external network calls MUST use this module (never direct browser fetch).
 * Pure function. No side effects at module level.
 */

import { forwardProxyChecked } from "../../../../../../../api";
import { pushWebApiDebugEvent } from "../../../debug/workbench-debug";

export interface ProxyRequestOptions {
  method: "GET" | "POST";
  headers: Array<Record<string, string>>;
  body?: string;
  contentType?: string;
  timeout: number;
}

/** Header keys whose values must be redacted in logs/debug/error messages. */
const SENSITIVE_HEADER_KEYS = new Set([
  "authorization", "cookie", "x-api-key", "x-auth-token", "x-token",
  "api-key", "apikey", "token", "secret", "x-secret",
]);

/**
 * Redact sensitive header values for safe display in logs/errors.
 */
export function redactSensitiveHeaders(
  headers: Array<Record<string, string>>,
): Array<Record<string, string>> {
  return headers.map((h) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      out[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v;
    }
    return out;
  });
}

/**
 * Make an external HTTP request via the Siyuan forwardProxy.
 * Returns parsed response body: JSON object if content-type is JSON,
 * otherwise returns the string body.
 * Throws on network / proxy failure or HTTP status >= 400.
 */
export async function requestViaSiyuanProxy(
  url: string,
  opts: ProxyRequestOptions,
): Promise<string | Record<string, unknown>> {
  const isJson = opts.contentType === "application/json";
  let payload: any;

  if (opts.body && isJson) {
    try {
      payload = JSON.parse(opts.body);
    } catch {
      throw Object.assign(new Error("请求 body 不是有效的 JSON。"), {
        code: "invalid_json_body",
      });
    }
  } else if (opts.body) {
    // Non-JSON body: pass the raw string with text encoding
    payload = opts.body;
  } else {
    payload = {};
  }

  let urlHost = "";
  let urlPath = "";
  try {
    const parsed = new URL(url);
    urlHost = parsed.hostname;
    urlPath = parsed.pathname + parsed.search;
  } catch { /* best-effort */ }

  const startedAt = Date.now();
  let proxyResult;
  try {
    proxyResult = await forwardProxyChecked(
      url,
      opts.method,
      payload,
      opts.headers,
      opts.timeout,
      opts.contentType ?? "text/html",
      opts.body && !isJson ? "text" : undefined,
      "text",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code ?? "proxy_network_error";
    pushWebApiDebugEvent({
      method: opts.method,
      urlHost,
      path: urlPath,
      status: 0,
      durationMs: Date.now() - startedAt,
      errorCode: code,
      bodyPreview: message.slice(0, 200),
    });
    throw err;
  }

  const durationMs = proxyResult?.elapsed ?? (Date.now() - startedAt);
  const status = proxyResult?.status ?? 0;

  if (!proxyResult?.body) {
    pushWebApiDebugEvent({
      method: opts.method,
      urlHost,
      path: urlPath,
      status,
      durationMs,
      errorCode: "proxy_empty_response",
      responseMode: proxyResult?.contentType?.includes("json") ? "json" : "text",
    });
    throw Object.assign(new Error(`Proxy request to ${url} returned empty response.`), {
      code: "proxy_empty_response",
    });
  }

  if (proxyResult.status === 401) {
    let bodyPreview = "";
    try { bodyPreview = String(proxyResult.body ?? "").slice(0, 200); } catch { /* ignore */ }
    pushWebApiDebugEvent({
      method: opts.method,
      urlHost,
      path: urlPath,
      status: 401,
      durationMs,
      errorCode: "http_401",
      bodyPreview,
      responseMode: proxyResult.contentType?.includes("json") ? "json" : "text",
    });
    throw Object.assign(
      new Error(`HTTP 401 认证失败：${url}。请检查 API Key 或认证 header 是否正确。`),
      { code: "http_401", status: 401, bodyPreview, contentType: proxyResult.contentType },
    );
  }

  if (proxyResult.status >= 400) {
    let detail = `HTTP ${proxyResult.status}`;
    let bodyPreview = "";
    try {
      const parsed = JSON.parse(proxyResult.body);
      if (parsed.message) detail += `: ${parsed.message}`;
      else if (parsed.msg) detail += `: ${parsed.msg}`;
      else if (parsed.error) detail += `: ${typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error)}`;
      bodyPreview = JSON.stringify(parsed).slice(0, 200);
    } catch {
      bodyPreview = proxyResult.body.slice(0, 200);
    }
    pushWebApiDebugEvent({
      method: opts.method,
      urlHost,
      path: urlPath,
      status: proxyResult.status,
      durationMs,
      errorCode: `http_${proxyResult.status}`,
      bodyPreview,
      responseMode: proxyResult.contentType?.includes("json") ? "json" : "text",
    });
    const err = Object.assign(new Error(detail), {
      code: `http_${proxyResult.status}`,
      status: proxyResult.status,
      bodyPreview,
      contentType: proxyResult.contentType,
    });
    throw err;
  }

  // Success
  pushWebApiDebugEvent({
    method: opts.method,
    urlHost,
    path: urlPath,
    status: proxyResult.status,
    durationMs,
    responseMode: proxyResult.contentType?.includes("json") ? "json" : "text",
    bodyPreview: String(proxyResult.body ?? "").slice(0, 200),
  });

  const body = proxyResult.body;
  // Try JSON parse first; fallback to raw string
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
