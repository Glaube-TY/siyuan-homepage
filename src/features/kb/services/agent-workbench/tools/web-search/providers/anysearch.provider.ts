/**
 * AnySearch provider — recommended web search backend.
 * Uses REST API via forwardProxy. Supports optional API key.
 * Pure factory function. No side effects at module level.
 */

import type { WebSearchProvider, WebSearchResult, WebSearchOptions, WebSearchHttpTransport } from "../web-search-provider";
import { requestViaSiyuanProxy } from "../impl/siyuan-proxy-request";

interface AnySearchSettings {
  apiKey?: string;
  anySearchZone?: "auto" | "cn" | "intl";
  anySearchLanguage?: string;
  searchEndpoint?: string;
  transport?: WebSearchHttpTransport;
  timeoutMs: number;
}

interface AnySearchResponse {
  code?: number;
  message?: string;
  msg?: string;
  request_id?: string;
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
    sourceName?: string;
    publishedAt?: string;
    updatedAt?: string;
  }>;
  data?: {
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      content?: string;
      sourceName?: string;
      publishedAt?: string;
      updatedAt?: string;
    }>;
  };
}

const DEFAULT_ENDPOINT = "https://api.anysearch.com/v1/search";
const MAX_CONTENT_PREVIEW_CHARS = 800;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  let num: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    num = value;
  } else if (typeof value === "string") {
    num = parseInt(value, 10);
    if (!Number.isFinite(num)) num = fallback;
  } else {
    num = fallback;
  }
  return Math.max(min, Math.min(max, num));
}

export function createAnySearchProvider(settings: AnySearchSettings): WebSearchProvider {
  return {
    async search(opts: WebSearchOptions): Promise<WebSearchResult[]> {
      const query = opts.query.trim();
      if (!query) {
        throw Object.assign(new Error("搜索查询不能为空"), { code: "invalid_query" });
      }

      const maxResults = Math.min(clampInt(opts.maxResults, 5, 1, 100), 10);
      const language = settings.anySearchLanguage?.trim();

      const headers: Array<Record<string, string>> = [];
      const apiKey = settings.apiKey?.trim();
      if (apiKey) {
        headers.push({ Authorization: `Bearer ${apiKey}` });
      }

      const route = resolveAnySearchRoute(opts);
      const body = JSON.stringify({
        query,
        max_results: maxResults,
        ...(settings.anySearchZone === "cn" || settings.anySearchZone === "intl"
          ? { zone: settings.anySearchZone }
          : {}),
        ...(language ? { language } : {}),
        ...(route ? { tag: route.tag, ...(route.params ? { params: route.params } : {}) } : {}),
      });

      const endpoint = settings.searchEndpoint?.trim() || DEFAULT_ENDPOINT;
      const response = await (settings.transport?.request({
        url: endpoint,
        method: "POST",
        headers,
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      }) ?? requestViaSiyuanProxy(endpoint, {
        method: "POST",
        headers,
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      }));

      const data: AnySearchResponse = typeof response === "string"
        ? JSON.parse(response)
        : response;

      if (data?.code !== undefined && data.code !== 0) {
        const parts: string[] = [`code=${data.code}`];
        const msg = data.message ?? data.msg;
        if (msg) parts.push(msg);
        if (data.request_id) parts.push(`request_id=${data.request_id}`);
        throw new Error(`AnySearch error: ${parts.join(", ")}`);
      }

      const results = data?.data?.results ?? data?.results ?? [];
      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results.map((r) => {
        const content = r.content?.trim();
        const hasContent = !!content;
        const contentPreview = hasContent
          ? content.slice(0, MAX_CONTENT_PREVIEW_CHARS)
          : undefined;

        return {
          title: (r.title ?? "").trim(),
          url: (r.url ?? "").trim(),
          snippet: r.snippet,
          sourceName: r.sourceName,
          provider: "anysearch" as const,
          publishedAt: r.publishedAt,
          updatedAt: r.updatedAt,
          contentPreview,
          contentChars: hasContent ? content.length : undefined,
          contentTruncated: hasContent ? content.length > MAX_CONTENT_PREVIEW_CHARS : undefined,
        };
      }).filter((r) => r.title.length > 0 && r.url.length > 0 && /^https?:\/\//i.test(r.url));
    },
  };
}

function resolveAnySearchRoute(opts: WebSearchOptions): { tag: string; params?: Record<string, string> } | undefined {
  if (opts.topic === "academic") return { tag: "academic.search" };
  return opts.topic === "general" || opts.topic === "news" || opts.topic === "software"
    ? { tag: "general.general" }
    : undefined;
}
