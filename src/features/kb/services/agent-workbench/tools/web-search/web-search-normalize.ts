import type { WebSearchFreshness, WebSearchResult } from "./web-search-provider";

export function canonicalizeWebSearchUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function normalizeWebSearchResults(
  results: readonly WebSearchResult[],
  options: { freshness?: WebSearchFreshness; now?: Date } = {},
): WebSearchResult[] {
  const byUrl = new Map<string, { result: WebSearchResult; index: number }>();
  results.forEach((raw, index) => {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!url || !title || !/^https?:\/\//i.test(url)) return;
    const result = sanitizeResult({ ...raw, title, url });
    const key = canonicalizeWebSearchUrl(url);
    const existing = byUrl.get(key);
    if (!existing || resultCompleteness(result) > resultCompleteness(existing.result)) {
      byUrl.set(key, { result, index: existing?.index ?? index });
    }
  });

  const now = options.now ?? new Date();
  return [...byUrl.values()]
    .sort((a, b) => rankResult(b.result, b.index, options.freshness, now) - rankResult(a.result, a.index, options.freshness, now))
    .map(({ result }) => result);
}

function sanitizeResult(result: WebSearchResult): WebSearchResult {
  const out: WebSearchResult = {
    ...result,
    sourceType: result.sourceType ?? "search_candidate",
  };
  for (const key of ["publishedAt", "updatedAt"] as const) {
    const value = out[key];
    if (value !== undefined && (!value.trim() || Number.isNaN(Date.parse(value)))) delete out[key];
  }
  if (typeof out.score !== "number" || !Number.isFinite(out.score)) delete out.score;
  return out;
}

function resultCompleteness(result: WebSearchResult): number {
  return result.title.length
    + (result.snippet?.length ?? 0)
    + (result.contentPreview?.length ?? 0)
    + (result.sourceName?.length ?? 0)
    + (result.publishedAt ? 20 : 0)
    + (result.updatedAt ? 20 : 0);
}

function rankResult(
  result: WebSearchResult,
  originalIndex: number,
  freshness: WebSearchFreshness | undefined,
  now: Date,
): number {
  const providerScore = typeof result.score === "number" ? result.score : 0;
  let freshnessScore = 0;
  const dateText = result.publishedAt ?? result.updatedAt;
  if (freshness && freshness !== "any" && dateText) {
    const ageMs = now.getTime() - Date.parse(dateText);
    const ranges: Record<Exclude<WebSearchFreshness, "any">, number> = {
      realtime: 1,
      day: 1,
      week: 7,
      month: 31,
      year: 366,
    };
    const days = ageMs / 86_400_000;
    const window = ranges[freshness];
    freshnessScore = days >= 0 && days <= window ? 0.25 : days > window ? -0.15 : 0;
  }
  return providerScore + freshnessScore - originalIndex * 0.0001;
}
