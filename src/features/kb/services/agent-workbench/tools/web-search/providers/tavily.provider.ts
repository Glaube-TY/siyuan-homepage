/**
 * Tavily provider — alternative search backend via REST API.
 * API key required. Uses forwardProxy (no @tavily/core dependency).
 * Pure factory function. No side effects at module level.
 */

import type { WebSearchProvider, WebSearchResult, WebSearchOptions } from "../web-search-provider";
import { requestViaSiyuanProxy } from "../impl/siyuan-proxy-request";

interface TavilySettings {
  apiKey?: string;
  timeoutMs: number;
}

const DEFAULT_ENDPOINT = "https://api.tavily.com/search";
const MAX_CONTENT_PREVIEW_CHARS = 800;

export function createTavilyProvider(settings: TavilySettings): WebSearchProvider {
  return {
    async search(opts: WebSearchOptions): Promise<WebSearchResult[]> {
      if (!settings.apiKey) {
        throw Object.assign(new Error("Tavily API Key 未配置"), { code: "config_missing" });
      }

      const body = JSON.stringify({
        query: opts.query,
        max_results: opts.maxResults,
        include_answer: false,
        include_raw_content: false,
      });

      const response = await requestViaSiyuanProxy(DEFAULT_ENDPOINT, {
        method: "POST",
        headers: [
          { Authorization: `Bearer ${settings.apiKey}` },
        ],
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      });

      const data = typeof response === "string"
        ? JSON.parse(response)
        : response;

      const results = data?.results ?? [];
      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results.map((r: Record<string, unknown>) => {
        const content = typeof r.content === "string" ? r.content.trim() : "";
        const hasContent = !!content;
        return {
          title: ((r.title as string) ?? "").trim(),
          url: ((r.url as string) ?? "").trim(),
          snippet: typeof r.snippet === "string" ? r.snippet as string : undefined,
          sourceName: typeof r.sourceName === "string" ? r.sourceName as string : undefined,
          provider: "tavily" as const,
          contentPreview: hasContent ? content.slice(0, MAX_CONTENT_PREVIEW_CHARS) : undefined,
          contentChars: hasContent ? content.length : undefined,
          contentTruncated: hasContent ? content.length > MAX_CONTENT_PREVIEW_CHARS : undefined,
        };
      }).filter((r) => r.title.length > 0 && r.url.length > 0 && /^https?:\/\//i.test(r.url));
    },
  };
}
