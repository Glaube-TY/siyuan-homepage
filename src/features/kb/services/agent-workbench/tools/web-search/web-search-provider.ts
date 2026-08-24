/** Common web-search contracts. No network side effects. */

export type WebSearchFreshness = "realtime" | "day" | "week" | "month" | "year" | "any";
export type WebSearchTopic = "general" | "news" | "software" | "academic" | "finance";
export type WebSearchRoute = "native" | "fallback";
export type WebSearchProviderId =
  | "anysearch"
  | "custom_json"
  | "tavily"
  | "openai"
  | "gemini"
  | "anthropic";

export type WebSearchErrorCategory =
  | "native_unsupported"
  | "native_permission_denied"
  | "native_rate_limited"
  | "native_timeout"
  | "native_network_error"
  | "fallback_not_configured"
  | "fallback_auth_failed"
  | "fallback_failed"
  | "search_no_results";

export interface WebSearchHttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Array<Record<string, string>>;
  body?: string;
  contentType?: string;
  timeout: number;
}

export interface WebSearchHttpTransport {
  request(options: WebSearchHttpRequest): Promise<string | Record<string, unknown>>;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  sourceName?: string;
  provider: WebSearchProviderId;
  route?: WebSearchRoute;
  publishedAt?: string;
  updatedAt?: string;
  score?: number;
  sourceType?: "search_candidate" | "web_page";
  contentPreview?: string;
  contentChars?: number;
  contentTruncated?: boolean;
}

export interface WebSearchOptions {
  query: string;
  maxResults: number;
  /** 本轮由 Router 计算的用户本地日期，不由 Provider 自行取 UTC 日期。 */
  currentLocalDate?: string;
  timeoutMs?: number;
  freshness?: WebSearchFreshness;
  topic?: WebSearchTopic;
  includeDomains?: string[];
  excludeDomains?: string[];
  startDate?: string;
  endDate?: string;
}

export interface WebSearchProvider {
  search(opts: WebSearchOptions): Promise<WebSearchResult[]>;
}

export interface WebSearchResponse {
  query: string;
  searchedAt: string;
  freshness: WebSearchFreshness;
  topic: WebSearchTopic;
  route: WebSearchRoute;
  provider: WebSearchProviderId;
  results: WebSearchResult[];
  warnings: string[];
  fallbackReason?: WebSearchErrorCategory;
  originalQuery?: string;
  executedQuery?: string;
}

export interface WebSearchTurnTracker {
  /** 本轮累计状态：succeeded 一旦为 true 不因后续失败回退。 */
  attempted: boolean;
  succeeded: boolean;
  lastError?: string;
  route?: WebSearchRoute;
  provider?: WebSearchProviderId;
}
