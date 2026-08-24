import type { KbChatModelConfig, KbChatProviderConfig } from "../../../../types/settings";
import { resolveOpenAICompatibleBaseUrlForProvider, resolveProviderFamily, type AgentProviderFamily } from "../../../agent-core/providers/provider-url-resolver";
import { normalizeAnthropicEndpoint, normalizeGeminiEndpoint } from "../../../agent-core/providers/provider-url-normalizer";
import type { AgentHttpResponse, AgentHttpTransport } from "../../../agent-core/providers/agent-http-transport";
import type { WebSearchHttpRequest, WebSearchHttpTransport, WebSearchOptions, WebSearchResult } from "./web-search-provider";

export interface NativeWebSearchCandidate {
  family: Extract<AgentProviderFamily, "openai-compatible" | "gemini" | "anthropic">;
  providerId: string;
  modelId: string;
  cacheKey: string;
  endpoint: string;
}

export class NativeWebSearchError extends Error {
  constructor(
    message: string,
    readonly category: "native_unsupported" | "native_permission_denied" | "native_rate_limited" | "native_timeout" | "native_network_error",
    readonly status?: number,
  ) {
    super(message);
    this.name = "NativeWebSearchError";
  }
}

const MAX_ANTHROPIC_WEB_SEARCH_USES = 3;
const MAX_ANTHROPIC_WEB_SEARCH_CONTINUATIONS = 3;

export function resolveNativeWebSearchCandidate(
  provider: KbChatProviderConfig,
  model: KbChatModelConfig,
): NativeWebSearchCandidate | undefined {
  let parsed: URL;
  try {
    parsed = new URL(provider.baseUrl);
  } catch {
    return undefined;
  }
  const hostname = parsed.hostname.toLowerCase();
  const family = resolveProviderFamily(provider);
  if (!provider.apiKey?.trim()) return undefined;
  const official = family === "openai-compatible"
    ? hostname === "api.openai.com"
    : family === "gemini"
      ? hostname === "generativelanguage.googleapis.com"
      : hostname === "api.anthropic.com";
  if (!official) return undefined;
  const endpoint = family === "openai-compatible"
    ? `${resolveOpenAICompatibleBaseUrlForProvider(provider)}/responses`
    : family === "gemini"
      ? `${normalizeGeminiEndpoint(provider.baseUrl)}/models/${encodeURIComponent(model.id)}:generateContent`
      : `${normalizeAnthropicEndpoint(provider.baseUrl)}/messages`;
  return {
    family,
    providerId: provider.id,
    modelId: model.id,
    endpoint,
    cacheKey: `${provider.id}|${family}|${parsed.origin}${parsed.pathname}|${model.id}`,
  };
}

export function createWebSearchHttpTransport(transport: AgentHttpTransport): WebSearchHttpTransport {
  return {
    async request(options: WebSearchHttpRequest): Promise<string | Record<string, unknown>> {
      const headers = Object.fromEntries(options.headers.flatMap((entry) => Object.entries(entry)));
      const response = await transport.post({
        url: options.url,
        headers,
        body: options.body ?? "",
        stream: false,
      });
      return parseTransportResponse(response);
    },
  };
}

export async function searchWithNativeWebSearch(
  candidate: NativeWebSearchCandidate,
  provider: KbChatProviderConfig,
  model: KbChatModelConfig,
  options: WebSearchOptions,
  transport: AgentHttpTransport,
): Promise<WebSearchResult[]> {
  const prompt = buildNativeSearchPrompt(options);
  if (candidate.family === "openai-compatible") {
    return searchOpenAI(candidate, provider, model, prompt, options, transport);
  }
  if (candidate.family === "gemini") {
    return searchGemini(candidate, provider, prompt, options, transport);
  }
  return searchAnthropic(candidate, provider, model, prompt, options, transport);
}

function buildNativeSearchPrompt(options: WebSearchOptions): string {
  const today = options.currentLocalDate ?? "unknown";
  const filters = [
    `freshness=${options.freshness ?? "any"}`,
    `topic=${options.topic ?? "general"}`,
    options.startDate ? `startDate=${options.startDate}` : "",
    options.endDate ? `endDate=${options.endDate}` : "",
    options.includeDomains?.length ? `includeDomains=${options.includeDomains.join(",")}` : "",
    options.excludeDomains?.length ? `excludeDomains=${options.excludeDomains.join(",")}` : "",
  ].filter(Boolean).join("; ");
  return `Current date: ${today}. Search the public web for the user's query. Return source citations/URLs only from actual search results; do not invent dates or URLs. Query: ${options.query.trim()} (${filters}).`;
}

async function searchOpenAI(
  candidate: NativeWebSearchCandidate,
  provider: KbChatProviderConfig,
  model: KbChatModelConfig,
  prompt: string,
  options: WebSearchOptions,
  transport: AgentHttpTransport,
): Promise<WebSearchResult[]> {
  const raw = await postJson(candidate.endpoint, {
    Authorization: `Bearer ${provider.apiKey ?? ""}`,
    "Content-Type": "application/json",
  }, {
    model: model.id,
    input: prompt,
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
  }, transport);
  const results: WebSearchResult[] = [];
  const output = raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).output)
    ? (raw as Record<string, unknown>).output as unknown[]
    : [];
  for (const item of output) collectOpenAISources(item, results);
  return results.slice(0, options.maxResults).map((result) => ({ ...result, provider: "openai", route: "native" as const }));
}

function collectOpenAISources(value: unknown, results: WebSearchResult[]): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const action = record.action && typeof record.action === "object" ? record.action as Record<string, unknown> : undefined;
  const sources = Array.isArray(action?.sources) ? action.sources : [];
  for (const source of sources) {
    const item = source && typeof source === "object" ? source as Record<string, unknown> : {};
    addNativeSource(results, item.url, item.title, item.snippet);
  }
  const content = Array.isArray(record.content) ? record.content : [];
  for (const block of content) {
    const item = block && typeof block === "object" ? block as Record<string, unknown> : {};
    const annotations = Array.isArray(item.annotations) ? item.annotations : [];
    for (const annotation of annotations) {
      const citation = annotation && typeof annotation === "object" ? annotation as Record<string, unknown> : {};
      addNativeSource(results, citation.url, citation.title, citation.cited_text);
    }
  }
}

async function searchGemini(
  candidate: NativeWebSearchCandidate,
  provider: KbChatProviderConfig,
  prompt: string,
  options: WebSearchOptions,
  transport: AgentHttpTransport,
): Promise<WebSearchResult[]> {
  const raw = await postJson(candidate.endpoint, {
    "Content-Type": "application/json",
    "x-goog-api-key": provider.apiKey ?? "",
  }, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  }, transport);
  const results: WebSearchResult[] = [];
  const candidates = raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).candidates)
    ? (raw as Record<string, unknown>).candidates as unknown[]
    : [];
  for (const candidateItem of candidates) {
    const root = candidateItem && typeof candidateItem === "object" ? candidateItem as Record<string, unknown> : {};
    const metadata = root.groundingMetadata && typeof root.groundingMetadata === "object"
      ? root.groundingMetadata as Record<string, unknown>
      : {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    for (const chunk of chunks) {
      const web = chunk && typeof chunk === "object" && (chunk as Record<string, unknown>).web && typeof (chunk as Record<string, unknown>).web === "object"
        ? (chunk as Record<string, unknown>).web as Record<string, unknown>
        : {};
      addNativeSource(results, web.uri ?? web.url, web.title);
    }
  }
  return results.slice(0, options.maxResults).map((result) => ({ ...result, provider: "gemini", route: "native" as const }));
}

async function searchAnthropic(
  candidate: NativeWebSearchCandidate,
  provider: KbChatProviderConfig,
  model: KbChatModelConfig,
  prompt: string,
  options: WebSearchOptions,
  transport: AgentHttpTransport,
): Promise<WebSearchResult[]> {
  const tool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: MAX_ANTHROPIC_WEB_SEARCH_USES,
    ...buildAnthropicDomainFilter(options),
  };
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: prompt }];
  const request = () => postJson(candidate.endpoint, {
    "Content-Type": "application/json",
    "x-api-key": provider.apiKey ?? "",
    "anthropic-version": "2023-06-01",
  }, {
    model: model.id,
    max_tokens: model.maxTokens ?? 1024,
    messages,
    tools: [tool],
  }, transport);
  let raw = await request();
  let continuationCount = 0;
  while (isPauseTurn(raw) && continuationCount < MAX_ANTHROPIC_WEB_SEARCH_CONTINUATIONS) {
    messages.push({ role: "assistant", content: (raw as Record<string, unknown>).content ?? [] });
    raw = await request();
    continuationCount += 1;
  }
  const toolError = findAnthropicWebSearchToolError(raw);
  if (toolError) throw classifyAnthropicToolError(toolError);
  const results: WebSearchResult[] = [];
  collectAnthropicSources(raw, results);
  return results.slice(0, options.maxResults).map((result) => ({ ...result, provider: "anthropic", route: "native" as const }));
}

function buildAnthropicDomainFilter(options: WebSearchOptions): Record<string, unknown> {
  const includeDomains = normalizeDomains(options.includeDomains);
  const excludeDomains = normalizeDomains(options.excludeDomains);
  if (includeDomains.length > 0) {
    const excluded = new Set(excludeDomains.map((domain) => domain.toLocaleLowerCase()));
    const allowedDomains = includeDomains.filter((domain) => !excluded.has(domain.toLocaleLowerCase()));
    return allowedDomains.length > 0 ? { allowed_domains: allowedDomains } : {};
  }
  return excludeDomains.length > 0 ? { blocked_domains: excludeDomains } : {};
}

function normalizeDomains(domains: string[] | undefined): string[] {
  return [...new Set((domains ?? []).map((domain) => domain.trim()).filter(Boolean))];
}

function findAnthropicWebSearchToolError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const errorCode = findAnthropicWebSearchToolError(item);
      if (errorCode) return errorCode;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "web_search_tool_result_error" && typeof record.error_code === "string") {
    return record.error_code;
  }
  for (const item of Object.values(record)) {
    const errorCode = findAnthropicWebSearchToolError(item);
    if (errorCode) return errorCode;
  }
  return undefined;
}

function classifyAnthropicToolError(errorCode: string): NativeWebSearchError {
  if (errorCode === "too_many_requests") {
    return new NativeWebSearchError("Anthropic 联网搜索达到频率限制。", "native_rate_limited");
  }
  return new NativeWebSearchError(`Anthropic 联网搜索工具失败：${errorCode}`, "native_network_error");
}

function collectAnthropicSources(value: unknown, results: WebSearchResult[]): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (["web_search_result", "web_search_result_location", "url_citation"].includes(type)) {
    addNativeSource(results, record.url, record.title, record.cited_text ?? record.snippet, record.page_age);
  }
  if (Array.isArray(record.citations)) {
    for (const citation of record.citations) {
      if (!citation || typeof citation !== "object" || Array.isArray(citation)) continue;
      collectAnthropicSources({ ...(citation as Record<string, unknown>), type: "url_citation" }, results);
    }
  }
  if (Array.isArray(record.content)) for (const item of record.content) collectAnthropicSources(item, results);
}

function addNativeSource(results: WebSearchResult[], url: unknown, title: unknown, snippet?: unknown, updatedAt?: unknown): void {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
  if (results.some((item) => item.url === url)) return;
  let sourceName: string | undefined;
  try { sourceName = new URL(url).hostname; } catch { /* keep undefined */ }
  results.push({
    title: typeof title === "string" && title.trim() ? title.trim() : sourceName ?? url,
    url,
    ...(typeof snippet === "string" && snippet.trim() ? { snippet: snippet.trim().slice(0, 800) } : {}),
    ...(typeof updatedAt === "string" && updatedAt.trim() ? { updatedAt: updatedAt.trim() } : {}),
    ...(sourceName ? { sourceName } : {}),
    provider: "openai",
  });
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  transport: AgentHttpTransport,
): Promise<Record<string, unknown>> {
  let response: AgentHttpResponse;
  try {
    response = await transport.post({ url, headers, body: JSON.stringify(body), stream: false });
  } catch (error) {
    throw classifyNativeError(error);
  }
  const payload = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text;
  });
  if (!response.ok) throw classifyNativeError(Object.assign(new Error(`HTTP ${response.status}`), { status: response.status, body: payload }));
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function classifyNativeError(error: unknown): NativeWebSearchError {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof source.status === "number" ? source.status : undefined;
  const code = typeof source.code === "string" ? source.code : "";
  const body = extractNativeErrorMessage(error);
  if (status === 401 || status === 403 || code === "http_401" || code === "http_403") return new NativeWebSearchError("原生联网搜索权限失败。", "native_permission_denied", status);
  if (status === 429 || code === "http_429") return new NativeWebSearchError("原生联网搜索达到频率限制。", "native_rate_limited", status);
  if (code.includes("timeout") || source.name === "AbortError") return new NativeWebSearchError("原生联网搜索超时。", "native_timeout", status);
  if ((status === 400 || status === 404 || status === 405 || status === 422) && /unsupported|not found|unknown tool|web_search.*(unsupported|not supported)|google_search.*(unsupported|not supported)/i.test(body)) {
    return new NativeWebSearchError("当前原生联网搜索能力不可用。", "native_unsupported", status);
  }
  return new NativeWebSearchError("原生联网搜索网络请求失败。", "native_network_error", status);
}

function extractNativeErrorMessage(error: unknown): string {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const body = source.body;
  const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : undefined;
  const nestedError = bodyRecord?.error && typeof bodyRecord.error === "object" && !Array.isArray(bodyRecord.error)
    ? bodyRecord.error as Record<string, unknown>
    : undefined;
  const values = [
    source.message,
    typeof body === "string" ? body : undefined,
    bodyRecord?.message,
    typeof bodyRecord?.error === "string" ? bodyRecord.error : undefined,
    nestedError?.message,
    nestedError?.type,
    nestedError?.code,
    bodyRecord?.type,
    bodyRecord?.code,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return values
    .join(" ")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 2000);
}

function isPauseTurn(value: Record<string, unknown>): boolean {
  return value.stop_reason === "pause_turn";
}

async function parseTransportResponse(response: AgentHttpResponse): Promise<string | Record<string, unknown>> {
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), { code: `http_${response.status}`, status: response.status });
  }
  const value = await response.json().catch(async () => response.text());
  return typeof value === "string" ? value : value as Record<string, unknown>;
}
