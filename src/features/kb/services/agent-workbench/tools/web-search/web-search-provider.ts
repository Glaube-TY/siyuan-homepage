/**
 * Web search provider interface — common types for all providers.
 * Pure types. No side effects.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  sourceName?: string;
  provider: "anysearch" | "custom_json" | "tavily";
  contentPreview?: string;
  contentChars?: number;
  contentTruncated?: boolean;
}

export interface WebSearchOptions {
  query: string;
  maxResults: number;
  timeoutMs: number;
}

export interface WebSearchProvider {
  search(opts: WebSearchOptions): Promise<WebSearchResult[]>;
}
