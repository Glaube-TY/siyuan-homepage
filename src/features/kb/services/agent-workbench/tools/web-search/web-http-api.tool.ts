/**
 * web_fetch.http_get / web_fetch.http_post 内部 action 契约。
 * 供外部 Skills 和 Agent 调用第三方 HTTP API。
 * Pure factory functions. No side effects at module level.
 */

import type { ToolContract, ToolResult, ToolRuntimeContext } from "../../contracts/tool-contract";
import {
  webHttpGetInputSchema,
  webHttpPostInputSchema,
  webHttpGetInputJsonSchema,
  webHttpPostInputJsonSchema,
} from "./contracts/web-http-api.contract";
import type { WebHttpGetInput, WebHttpPostInput } from "./contracts/web-http-api.contract";
import {
  requestViaSiyuanProxy,
  redactSensitiveHeaders,
} from "./impl/siyuan-proxy-request";
import { validatePublicHttpUrl } from "./impl/url-safety";

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_MAX_CHARS = 30000;

/** Build URL with query parameters appended. */
function buildUrlWithQuery(url: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

/** Convert headers record to array-of-records format for forwardProxy. */
function headersToArray(headers?: Record<string, string>): Array<Record<string, string>> {
  if (!headers || Object.keys(headers).length === 0) return [];
  return [headers];
}

// ── http_get_action ──

export function createHttpGetActionTool(deps: { timeoutMs: number }): ToolContract {
  return {
    name: "http_get_action",
    title: "HTTP GET 请求（action）",
    description: "web_fetch.http_get 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: webHttpGetInputSchema,
    readOnly: true,
    safety: { readOnly: true },
    source: "builtin",
    providerVisible: false,
    inputJsonSchemaOverride: webHttpGetInputJsonSchema,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: WebHttpGetInput): Promise<ToolResult> {
      const safety = validatePublicHttpUrl(args.url);
      if (safety.ok === false) {
        return {
          ok: false,
          data: null,
          error: {
            code: "unsafe_url",
            message: `该 URL 不允许请求：${safety.reason}`,
            recoverable: true,
          },
        };
      }

      const targetUrl = buildUrlWithQuery(safety.normalizedUrl, args.query);
      const timeout = args.timeoutMs ?? deps.timeoutMs ?? DEFAULT_TIMEOUT;
      const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS;
      const responseMode = args.responseMode ?? "json";
      const headerArr = headersToArray(args.headers);

      try {
        const result = await requestViaSiyuanProxy(targetUrl, {
          method: "GET",
          headers: headerArr,
          contentType: responseMode === "json" ? "application/json" : "text/plain",
          timeout,
        });

        const raw = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        const truncated = raw.length > maxChars;
        const text = truncated ? raw.slice(0, maxChars) : raw;

        return {
          ok: true,
          data: {
            url: targetUrl,
            status: "ok",
            responseMode,
            text,
            truncated,
            charCount: text.length,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string }).code ?? "http_request_failed";
        const status = (err as { status?: number }).status;
        const bodyPreview = (err as { bodyPreview?: string }).bodyPreview;
        const errContentType = (err as { contentType?: string }).contentType;
        // Redact sensitive headers in error context
        const safeHeaders = args.headers ? redactSensitiveHeaders(headersToArray(args.headers)) : undefined;
        return {
          ok: false,
          data: {
            url: targetUrl,
            status: status ?? null,
            bodyPreview: bodyPreview ?? null,
            contentType: errContentType ?? null,
            ...(safeHeaders ? { headers: safeHeaders } : {}),
          },
          error: {
            code,
            message: msg,
            recoverable: true,
            hint: code === "http_401" ? "认证失败，请检查 API Key。" : "请检查 URL 和参数。",
          },
        };
      }
    },
  };
}

// ── http_post_action ──

export function createHttpPostActionTool(deps: { timeoutMs: number }): ToolContract {
  return {
    name: "http_post_action",
    title: "HTTP POST 请求（action）",
    description: "web_fetch.http_post 聚合 action 的内部执行契约。不单独对 provider 暴露。",
    inputSchema: webHttpPostInputSchema,
    readOnly: false,
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true, permissionScope: "web.http_post" },
    source: "builtin",
    providerVisible: false,
    inputJsonSchemaOverride: webHttpPostInputJsonSchema,

    availability() {
      return { available: true };
    },

    async execute(_ctx: ToolRuntimeContext, args: WebHttpPostInput): Promise<ToolResult> {
      const safety = validatePublicHttpUrl(args.url);
      if (safety.ok === false) {
        return {
          ok: false,
          data: null,
          error: {
            code: "unsafe_url",
            message: `该 URL 不允许请求：${safety.reason}`,
            recoverable: true,
          },
        };
      }

      const targetUrl = safety.normalizedUrl;
      const timeout = args.timeoutMs ?? deps.timeoutMs ?? DEFAULT_TIMEOUT;
      const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS;
      const responseMode = args.responseMode ?? "json";

      // Determine body and content-type
      let body: string | undefined;
      let contentType: string;
      if (args.jsonBody !== undefined) {
        body = typeof args.jsonBody === "string" ? args.jsonBody : JSON.stringify(args.jsonBody);
        contentType = "application/json";
      } else if (args.textBody !== undefined) {
        body = args.textBody;
        contentType = args.contentType ?? "text/plain";
      } else {
        return {
          ok: false,
          data: null,
          error: { code: "missing_body", message: "jsonBody 或 textBody 至少提供一个。", recoverable: true },
        };
      }

      // Merge headers, redact sensitive ones for logging
      const headerArr = headersToArray(args.headers);

      try {
        const result = await requestViaSiyuanProxy(targetUrl, {
          method: "POST",
          headers: headerArr,
          body,
          contentType,
          timeout,
        });

        const raw = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        const truncated = raw.length > maxChars;
        const text = truncated ? raw.slice(0, maxChars) : raw;

        return {
          ok: true,
          data: {
            url: targetUrl,
            status: "ok",
            responseMode,
            text,
            truncated,
            charCount: text.length,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string }).code ?? "http_request_failed";
        const status = (err as { status?: number }).status;
        const bodyPreview = (err as { bodyPreview?: string }).bodyPreview;
        const errContentType = (err as { contentType?: string }).contentType;
        // Redact sensitive headers in error context
        const safeHeaders = args.headers ? redactSensitiveHeaders(headersToArray(args.headers)) : undefined;
        return {
          ok: false,
          data: {
            url: targetUrl,
            status: status ?? null,
            bodyPreview: bodyPreview ?? null,
            contentType: errContentType ?? null,
            ...(safeHeaders ? { headers: safeHeaders } : {}),
          },
          error: {
            code,
            message: msg,
            recoverable: true,
            hint: code === "http_401" ? "认证失败，请检查 API Key。" : "请检查 URL、body 和参数。",
          },
        };
      }
    },
  };
}
