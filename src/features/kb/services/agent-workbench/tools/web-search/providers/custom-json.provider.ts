/**
 * Custom JSON provider — accepts a user-defined search endpoint.
 * Expects { results: [{ title, url, snippet, sourceName }] } format.
 * Pure factory function. No side effects at module level.
 */

import type { WebSearchProvider, WebSearchResult, WebSearchOptions } from "../web-search-provider";
import { requestViaSiyuanProxy } from "../impl/siyuan-proxy-request";

interface CustomJsonSettings {
  searchEndpoint?: string;
  timeoutMs: number;
}

interface CustomJsonResponse {
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
    sourceName?: string;
  }>;
  data?: {
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      content?: string;
      sourceName?: string;
    }>;
  };
}

const MAX_CONTENT_PREVIEW_CHARS = 800;

export function createCustomJsonProvider(settings: CustomJsonSettings): WebSearchProvider {
  return {
    async search(opts: WebSearchOptions): Promise<WebSearchResult[]> {
      const endpoint = settings.searchEndpoint;
      if (!endpoint) {
        throw Object.assign(new Error("自定义搜索端点未配置"), { code: "config_missing" });
      }

      const body = JSON.stringify({
        query: opts.query,
        max_results: opts.maxResults,
        limit: opts.maxResults,
      });

      const response = await requestViaSiyuanProxy(endpoint, {
        method: "POST",
        headers: [],
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      });

      const data: CustomJsonResponse = typeof response === "string"
        ? JSON.parse(response)
        : response;

      const results = data?.results ?? data?.data?.results ?? [];
      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results.map((r) => {
        const content = r.content?.trim();
        const hasContent = !!content;
        return {
          title: (r.title ?? "").trim(),
          url: (r.url ?? "").trim(),
          snippet: r.snippet,
          sourceName: r.sourceName,
          provider: "custom_json" as const,
          contentPreview: hasContent ? content.slice(0, MAX_CONTENT_PREVIEW_CHARS) : undefined,
          contentChars: hasContent ? content.length : undefined,
          contentTruncated: hasContent ? content.length > MAX_CONTENT_PREVIEW_CHARS : undefined,
        };
      }).filter((r) => r.title.length > 0 && r.url.length > 0 && /^https?:\/\//i.test(r.url));
    },
  };
}
