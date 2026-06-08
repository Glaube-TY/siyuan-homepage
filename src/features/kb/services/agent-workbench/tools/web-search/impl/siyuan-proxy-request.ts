/**
 * Siyuan proxy request wrapper — routes external HTTP through forwardProxy.
 * All external network calls MUST use this module (never direct browser fetch).
 * Pure function. No side effects at module level.
 */

import { forwardProxy } from "../../../../../../../api";

export interface ProxyRequestOptions {
  method: "GET" | "POST";
  headers: Array<Record<string, string>>;
  body?: string;
  contentType?: string;
  timeout: number;
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
  const payload = opts.body && isJson
    ? JSON.parse(opts.body)
    : {};

  const proxyResult = await forwardProxy(
    url,
    opts.method,
    payload,
    opts.headers,
    opts.timeout,
    opts.contentType ?? "text/html",
    isJson ? undefined : "text",
    "text",
  );

  if (!proxyResult || !proxyResult.body) {
    throw Object.assign(new Error(`Proxy request to ${url} returned empty response.`), {
      code: "proxy_empty_response",
    });
  }

  if (proxyResult.status >= 400) {
    let detail = `HTTP ${proxyResult.status}`;
    try {
      const parsed = JSON.parse(proxyResult.body);
      if (parsed.message) detail += `: ${parsed.message}`;
      else if (parsed.msg) detail += `: ${parsed.msg}`;
      else if (parsed.error) detail += `: ${typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error)}`;
    } catch {
      // ignore parse errors, keep status-only detail
    }
    throw Object.assign(new Error(detail), {
      code: `http_${proxyResult.status}`,
    });
  }

  const body = proxyResult.body;
  // Try JSON parse first; fallback to raw string
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
