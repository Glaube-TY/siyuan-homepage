import { DEFAULT_WEB_SEARCH_SETTINGS } from "../../../../constants/default-settings";
import type { KbChatModelConfig, KbChatProviderConfig, WebSearchSettings } from "../../../../types/settings";
import { SiyuanProxyAgentHttpTransport } from "./impl/siyuan-proxy-agent-transport";
import { createAnySearchProvider } from "./providers/anysearch.provider";
import { createCustomJsonProvider } from "./providers/custom-json.provider";
import { createTavilyProvider } from "./providers/tavily.provider";
import { normalizeWebSearchResults } from "./web-search-normalize";
import {
  resolveNativeWebSearchCandidate,
  searchWithNativeWebSearch,
  type NativeWebSearchCandidate,
  NativeWebSearchError,
} from "./native-web-search";
import type {
  WebSearchErrorCategory,
  WebSearchHttpRequest,
  WebSearchHttpTransport,
  WebSearchOptions,
  WebSearchProviderId,
  WebSearchResponse,
  WebSearchTurnTracker,
} from "./web-search-provider";
import type { AgentHttpTransport } from "../../../agent-core/providers/agent-http-transport";

export interface WebSearchActiveModel {
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
}

export interface ExecuteWebSearchParams {
  settings: WebSearchSettings;
  options: WebSearchOptions;
  activeModel?: WebSearchActiveModel;
  transport?: AgentHttpTransport;
  tracker?: WebSearchTurnTracker;
  now?: Date;
}

export interface WebSearchSettingsBinding {
  get(): WebSearchSettings;
  set(raw: unknown): void;
}

export function createWebSearchSettingsBinding(initial?: unknown): WebSearchSettingsBinding {
  let settings = normalizeWebSearchSettings(initial);
  return {
    get: () => ({ ...settings }),
    set: (raw) => { settings = normalizeWebSearchSettings(raw); },
  };
}

const unsupportedNativeCache = new Set<string>();

export function clearNativeWebSearchCapabilityCache(): void {
  unsupportedNativeCache.clear();
}

export function isNativeWebSearchUnsupported(cacheKey: string): boolean {
  return unsupportedNativeCache.has(cacheKey);
}

export async function executeWebSearch(params: ExecuteWebSearchParams): Promise<WebSearchResponse> {
  const originalQuery = params.options.query.trim();
  const now = params.now ?? new Date();
  const currentLocalDate = formatWebSearchLocalDate(now);
  const freshness = params.options.freshness ?? "any";
  const topic = params.options.topic ?? "general";
  const maxResults = clampMaxResults(params.options.maxResults, params.settings.maxResults);
  const baseOptions: WebSearchOptions = {
    ...params.options,
    query: originalQuery,
    maxResults,
    freshness,
    topic,
    currentLocalDate,
  };
  const searchedAt = now.toISOString();
  const nativeCandidate = params.settings.nativeSearchEnabled !== false && params.activeModel
    ? resolveNativeWebSearchCandidate(params.activeModel.provider, params.activeModel.model)
    : undefined;
  const nativeTransport = params.transport ?? new SiyuanProxyAgentHttpTransport(params.options.timeoutMs ?? params.settings.timeoutMs);
  let nativeFallbackReason: WebSearchErrorCategory | undefined;

  if (params.settings.nativeSearchEnabled !== false && params.activeModel && !nativeCandidate) {
    nativeFallbackReason = "native_unsupported";
  }

  if (nativeCandidate && !unsupportedNativeCache.has(nativeCandidate.cacheKey)) {
    try {
      const nativeResults = normalizeWebSearchResults(
        await searchWithNativeWebSearch(
          nativeCandidate,
          params.activeModel!.provider,
          params.activeModel!.model,
          baseOptions,
          nativeTransport,
        ),
        { freshness, now },
      ).slice(0, maxResults).map((result) => ({
        ...result,
        provider: nativeProviderId(nativeCandidate),
        route: "native" as const,
      }));
      if (nativeResults.length > 0) {
        const response = createResponse({
          query: originalQuery,
          searchedAt,
          freshness,
          topic,
          route: "native",
          provider: nativeProviderId(nativeCandidate),
          results: nativeResults,
          warnings: [],
        });
        markTracker(params.tracker, response);
        return response;
      }
      nativeFallbackReason = "search_no_results";
    } catch (error) {
      const nativeError = normalizeNativeError(error);
      nativeFallbackReason = nativeError.category;
      if (nativeError.category === "native_unsupported") unsupportedNativeCache.add(nativeCandidate.cacheKey);
      // Temporary native errors intentionally fall through to the same-call fallback.
    }
  }

  const fallbackOptions = baseOptions;
  const fallbackProviderId = params.settings.provider;
  const fallback = createFallbackProvider(params.settings, params.transport);
  if (!fallback) {
    const response = createResponse({
      query: originalQuery,
      searchedAt,
      freshness,
      topic,
      route: "fallback",
      provider: fallbackProviderId,
      results: [],
      warnings: [
        ...(nativeFallbackReason ? [nativeFallbackReason] : []),
        "fallback_not_configured",
      ],
      fallbackReason: "fallback_not_configured",
    });
    markTracker(params.tracker, response, "fallback_not_configured");
    return response;
  }

  try {
    const fallbackResults = normalizeWebSearchResults(await fallback.search(fallbackOptions), {
      freshness,
      now,
    }).slice(0, maxResults).map((result) => ({
      ...result,
      provider: fallbackProviderId,
      route: "fallback" as const,
    }));
    const response = createResponse({
      query: originalQuery,
      searchedAt,
      freshness,
      topic,
      route: "fallback",
      provider: fallbackProviderId,
      results: fallbackResults,
      warnings: [
        ...(nativeFallbackReason ? [nativeFallbackReason] : []),
        ...(fallbackResults.length ? [] : ["search_no_results"]),
      ],
      ...(nativeFallbackReason || fallbackResults.length === 0
        ? { fallbackReason: nativeFallbackReason ?? "search_no_results" }
        : {}),
    });
    markTracker(params.tracker, response, fallbackResults.length ? undefined : "search_no_results");
    return response;
  } catch (error) {
    const category = classifyFallbackError(error, fallbackProviderId);
    const response = createResponse({
      query: originalQuery,
      searchedAt,
      freshness,
      topic,
      route: "fallback",
      provider: fallbackProviderId,
      results: [],
      warnings: [
        ...(nativeFallbackReason ? [nativeFallbackReason] : []),
        category,
      ],
      fallbackReason: category,
    });
    markTracker(params.tracker, response, category);
    return response;
  }
}

function createFallbackProvider(settings: WebSearchSettings, transport?: AgentHttpTransport) {
  const fallbackTransport = transport ? createFallbackHttpTransport(transport) : undefined;
  if (settings.provider === "custom_json") {
    if (!settings.searchEndpoint?.trim()) return undefined;
    return createCustomJsonProvider({ searchEndpoint: settings.searchEndpoint, timeoutMs: settings.timeoutMs, transport: fallbackTransport });
  }
  if (settings.provider === "tavily") {
    if (!settings.apiKey?.trim()) return undefined;
    return createTavilyProvider({ apiKey: settings.apiKey, timeoutMs: settings.timeoutMs, transport: fallbackTransport });
  }
  return createAnySearchProvider({
    apiKey: settings.apiKey,
    anySearchZone: settings.anySearchZone,
    anySearchLanguage: settings.anySearchLanguage,
    searchEndpoint: settings.searchEndpoint,
    timeoutMs: settings.timeoutMs,
    transport: fallbackTransport,
  });
}

function createFallbackHttpTransport(transport: AgentHttpTransport): WebSearchHttpTransport {
  return {
    async request(options: WebSearchHttpRequest): Promise<string | Record<string, unknown>> {
      const headers = Object.fromEntries(options.headers.flatMap((entry) => Object.entries(entry)));
      const response = await transport.post({
        url: options.url,
        headers,
        body: options.body ?? "",
        stream: false,
      });
      const raw = await response.text().catch(() => "");
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { code: `http_${response.status}`, status: response.status });
      try { return JSON.parse(raw) as Record<string, unknown>; } catch { return raw; }
    },
  };
}

function clampMaxResults(value: number | undefined, setting: number): number {
  const requested = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : setting;
  return Math.max(1, Math.min(10, Math.min(Math.round(setting), requested)));
}

function formatWebSearchLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function nativeProviderId(candidate: NativeWebSearchCandidate): "openai" | "gemini" | "anthropic" {
  return candidate.family === "openai-compatible" ? "openai" : candidate.family;
}

function createResponse(input: WebSearchResponse): WebSearchResponse {
  return {
    ...input,
    warnings: [...new Set(input.warnings)],
  };
}

function markTracker(tracker: WebSearchTurnTracker | undefined, response: WebSearchResponse, error?: string): void {
  if (!tracker) return;
  tracker.attempted = true;
  tracker.succeeded = tracker.succeeded || response.results.length > 0;
  tracker.route = response.route;
  tracker.provider = response.provider;
  if (error) tracker.lastError = error;
}

function normalizeNativeError(error: unknown): NativeWebSearchError {
  if (error instanceof NativeWebSearchError) return error;
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof source.status === "number" ? source.status : undefined;
  const code = typeof source.code === "string" ? source.code : "";
  if (status === 401 || status === 403 || code === "http_401" || code === "http_403") return new NativeWebSearchError("原生联网搜索权限失败。", "native_permission_denied", status);
  if (status === 429 || code === "http_429") return new NativeWebSearchError("原生联网搜索达到频率限制。", "native_rate_limited", status);
  if (code.includes("timeout") || source.name === "AbortError") return new NativeWebSearchError("原生联网搜索超时。", "native_timeout", status);
  return new NativeWebSearchError("原生联网搜索网络请求失败。", "native_network_error", status);
}

function classifyFallbackError(error: unknown, provider: WebSearchProviderId): WebSearchErrorCategory {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof source.code === "string" ? source.code : "";
  if (code === "http_401" || code === "http_403" || (provider === "tavily" && code === "invalid_api_key")) return "fallback_auth_failed";
  return "fallback_failed";
}

function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const provider = source.provider === "custom_json" || source.provider === "tavily" || source.provider === "anysearch"
    ? source.provider
    : DEFAULT_WEB_SEARCH_SETTINGS.provider;
  const numberSetting = (key: keyof WebSearchSettings, min: number, max: number): number => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value)))
      : DEFAULT_WEB_SEARCH_SETTINGS[key] as number;
  };
  const stringSetting = (key: keyof WebSearchSettings): string | undefined => {
    const value = source[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const anySearchLanguage = typeof source.anySearchLanguage === "string"
    ? source.anySearchLanguage.trim()
    : DEFAULT_WEB_SEARCH_SETTINGS.anySearchLanguage;
  return {
    enabled: source.enabled === true,
    nativeSearchEnabled: source.nativeSearchEnabled !== false,
    provider,
    ...(stringSetting("searchEndpoint") ? { searchEndpoint: stringSetting("searchEndpoint") } : {}),
    ...(stringSetting("readProxyEndpoint") ? { readProxyEndpoint: stringSetting("readProxyEndpoint") } : {}),
    ...(stringSetting("apiKey") ? { apiKey: stringSetting("apiKey") } : {}),
    maxResults: numberSetting("maxResults", 1, 10),
    readPageMaxChars: numberSetting("readPageMaxChars", 2000, 30000),
    timeoutMs: numberSetting("timeoutMs", 5000, 60000),
    anySearchZone: source.anySearchZone === "auto" || source.anySearchZone === "cn" || source.anySearchZone === "intl"
      ? source.anySearchZone
      : DEFAULT_WEB_SEARCH_SETTINGS.anySearchZone,
    anySearchLanguage,
  };
}
