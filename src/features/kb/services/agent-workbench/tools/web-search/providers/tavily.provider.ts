/**
 * Tavily provider — alternative search backend via REST API.
 * API key required. Uses forwardProxy (no @tavily/core dependency).
 * Pure factory function. No side effects at module level.
 */

import type { WebSearchProvider, WebSearchResult, WebSearchOptions, WebSearchHttpTransport } from "../web-search-provider";
import { requestViaSiyuanProxy } from "../impl/siyuan-proxy-request";

interface TavilySettings {
  apiKey?: string;
  transport?: WebSearchHttpTransport;
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
        topic: opts.topic === "news" || opts.topic === "finance" ? opts.topic : "general",
        search_depth: opts.topic === "software" || opts.topic === "academic" ? "advanced" : "basic",
        ...(opts.freshness && opts.freshness !== "realtime" && opts.freshness !== "any" ? { time_range: opts.freshness } : {}),
        ...(opts.freshness === "realtime" ? { time_range: "day" } : {}),
        ...(opts.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
        ...(opts.excludeDomains?.length ? { exclude_domains: opts.excludeDomains } : {}),
        ...(opts.startDate ? { start_date: opts.startDate } : {}),
        ...(opts.endDate ? { end_date: opts.endDate } : {}),
      });

      const response = await (settings.transport?.request({
        url: DEFAULT_ENDPOINT,
        method: "POST",
        headers: [
          { Authorization: `Bearer ${settings.apiKey}` },
        ],
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      }) ?? requestViaSiyuanProxy(DEFAULT_ENDPOINT, {
        method: "POST",
        headers: [
          { Authorization: `Bearer ${settings.apiKey}` },
        ],
        body,
        contentType: "application/json",
        timeout: settings.timeoutMs,
      }));

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
          snippet: typeof r.snippet === "string" && r.snippet.trim()
            ? r.snippet.trim()
            : hasContent ? content.slice(0, 400) : undefined,
          sourceName: typeof r.sourceName === "string" ? r.sourceName as string : undefined,
          provider: "tavily" as const,
          score: typeof r.score === "number" ? r.score : undefined,
          publishedAt: typeof r.published_date === "string" ? r.published_date : undefined,
          contentPreview: hasContent ? content.slice(0, MAX_CONTENT_PREVIEW_CHARS) : undefined,
          contentChars: hasContent ? content.length : undefined,
          contentTruncated: hasContent ? content.length > MAX_CONTENT_PREVIEW_CHARS : undefined,
        };
      }).filter((r) => r.title.length > 0 && r.url.length > 0 && /^https?:\/\//i.test(r.url));
    },
  };
}
