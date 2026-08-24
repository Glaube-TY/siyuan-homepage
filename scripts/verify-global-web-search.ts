import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateWebSearchUsageRequirement } from "../src/features/kb/services/agent-workbench/tools/web-search/web-search-requirement";
import { canonicalizeWebSearchUrl, normalizeWebSearchResults } from "../src/features/kb/services/agent-workbench/tools/web-search/web-search-normalize";
import { resolveNativeWebSearchCandidate } from "../src/features/kb/services/agent-workbench/tools/web-search/native-web-search";
import { createAnySearchProvider } from "../src/features/kb/services/agent-workbench/tools/web-search/providers/anysearch.provider";
import { createTavilyProvider } from "../src/features/kb/services/agent-workbench/tools/web-search/providers/tavily.provider";
import { createWebSearchActionTool, createWebSearchNativeTool, webSearchInputSchema } from "../src/features/kb/services/agent-workbench/tools/web-search/web-search.tool";
import { clearNativeWebSearchCapabilityCache, createWebSearchSettingsBinding, executeWebSearch, isNativeWebSearchUnsupported } from "../src/features/kb/services/agent-workbench/tools/web-search/web-search-router";
import { buildConversationContext } from "../src/features/kb/services/agent-workbench/runtime/conversation-context-builder";
import { mapAgentErrorToUserFacing } from "../src/features/kb/services/agent-workbench/runtime/user-facing-agent-error";
import type { AgentHttpPostOptions, AgentHttpResponse, AgentHttpTransport } from "../src/features/kb/services/agent-core/providers/agent-http-transport";
import type { KbChatModelConfig, KbChatProviderConfig, WebSearchSettings } from "../src/features/kb/types/settings";
import type { WebSearchHttpRequest, WebSearchTurnTracker } from "../src/features/kb/services/agent-workbench/tools/web-search/web-search-provider";

const model: KbChatModelConfig = { id: "gpt-test", name: "test", temperature: 0.2 };
const openai: KbChatProviderConfig = {
  id: "openai",
  name: "OpenAI",
  type: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  enabled: true,
  models: [model],
};
const anthropic: KbChatProviderConfig = {
  id: "anthropic",
  name: "Anthropic",
  type: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "test-key",
  enabled: true,
  models: [model],
};

const defaultSettings: WebSearchSettings = {
  enabled: true,
  nativeSearchEnabled: true,
  provider: "anysearch",
  searchEndpoint: "https://search.example.test",
  maxResults: 5,
  readPageMaxChars: 12000,
  timeoutMs: 15000,
  anySearchZone: "auto",
  anySearchLanguage: "",
};

function settings(overrides: Partial<WebSearchSettings> = {}): WebSearchSettings {
  return { ...defaultSettings, ...overrides };
}

function httpResponse(payload: unknown, status = 200): AgentHttpResponse {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    headers: { get: () => "application/json" },
    json: async () => payload,
    text: async () => body,
    body: null,
  };
}

class CaptureAgentTransport implements AgentHttpTransport {
  readonly calls: Array<{ options: AgentHttpPostOptions; body: Record<string, unknown> }> = [];

  constructor(
    private readonly handler: (options: AgentHttpPostOptions, body: Record<string, unknown>) => AgentHttpResponse | Promise<AgentHttpResponse>,
  ) {}

  async post(options: AgentHttpPostOptions): Promise<AgentHttpResponse> {
    const body = JSON.parse(options.body || "{}") as Record<string, unknown>;
    this.calls.push({ options, body });
    return this.handler(options, body);
  }
}

function validSearchPayload(title = "Example"): Record<string, unknown> {
  return { results: [{ title, url: "https://example.com/source", snippet: "source" }] };
}

function sourceText(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

assert.equal(canonicalizeWebSearchUrl("https://Example.com/a/?utm_source=x#part"), "https://example.com/a");
assert.equal(normalizeWebSearchResults([
  { title: "short", url: "https://example.com/a?utm_source=x", provider: "anysearch" },
  { title: "complete", url: "https://example.com/a", snippet: "source", provider: "tavily", score: 0.9 },
]).length, 1);
assert.equal(resolveNativeWebSearchCandidate(openai, model)?.endpoint, "https://api.openai.com/v1/responses");
assert.equal(resolveNativeWebSearchCandidate({ ...openai, baseUrl: "https://openrouter.ai/api/v1" }, model), undefined);

const binding = createWebSearchSettingsBinding({ enabled: true, provider: "custom_json", searchEndpoint: "https://search.example.test" });
assert.equal(binding.get().enabled, true);
binding.set({ enabled: false, nativeSearchEnabled: false });
assert.equal(binding.get().enabled, false);
const autoBinding = createWebSearchSettingsBinding({ enabled: true, provider: "anysearch" });
assert.equal(autoBinding.get().anySearchZone, "auto");
assert.equal(autoBinding.get().anySearchLanguage, "");
const legacyCnBinding = createWebSearchSettingsBinding({
  enabled: true,
  provider: "anysearch",
  anySearchZone: "cn",
  anySearchLanguage: "zh-CN",
});
assert.equal(legacyCnBinding.get().anySearchZone, "cn");
assert.equal(legacyCnBinding.get().anySearchLanguage, "zh-CN");
const legacyIntlBinding = createWebSearchSettingsBinding({
  enabled: true,
  provider: "anysearch",
  anySearchZone: "intl",
  anySearchLanguage: "ja",
});
assert.equal(legacyIntlBinding.get().anySearchZone, "intl");
assert.equal(legacyIntlBinding.get().anySearchLanguage, "ja");

// OpenAI native search must request the explicit source list and parse it.
clearNativeWebSearchCapabilityCache();
const openaiTransport = new CaptureAgentTransport(async (options) =>
  options.url.endsWith("/responses")
    ? httpResponse({ output: [{ type: "web_search_call", action: { sources: [{ title: "Native source", url: "https://native.example/source" }] } }] })
    : httpResponse(validSearchPayload("Fallback source")),
);
const nativeResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "native search", maxResults: 5 },
  activeModel: { provider: openai, model },
  transport: openaiTransport,
});
assert.equal(nativeResponse.route, "native");
assert.equal(nativeResponse.results[0]?.url, "https://native.example/source");
assert.deepEqual(openaiTransport.calls[0]?.body.include, ["web_search_call.action.sources"]);
assert.deepEqual(openaiTransport.calls[0]?.body.tools, [{ type: "web_search" }]);

// Anthropic pause_turn continuations preserve assistant content and stop after a bounded loop.
clearNativeWebSearchCapabilityCache();
let anthropicPauseCallCount = 0;
const anthropicPauseTransport = new CaptureAgentTransport(async (options) => {
  if (!options.url.endsWith("/messages")) return httpResponse(validSearchPayload("Anthropic fallback"));
  const requestNumber = anthropicPauseCallCount;
  anthropicPauseCallCount += 1;
  if (requestNumber < 2) {
    return httpResponse({
      stop_reason: "pause_turn",
      content: [{ type: "server_tool_use", id: `tool-${requestNumber}`, name: "web_search", input: { query: "test" } }],
    });
  }
  return httpResponse({
    stop_reason: "end_turn",
    content: [{ type: "web_search_result", title: "Anthropic source", url: "https://anthropic.example/source", page_age: "2026-08-20" }],
  });
});
const anthropicPauseResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "Anthropic pause", maxResults: 5 },
  activeModel: { provider: anthropic, model },
  transport: anthropicPauseTransport,
});
assert.equal(anthropicPauseResponse.route, "native");
assert.equal(anthropicPauseResponse.results.length, 1);
assert.equal(anthropicPauseResponse.results[0]?.updatedAt, "2026-08-20");
assert.equal(anthropicPauseTransport.calls.length, 3);
assert.equal(((anthropicPauseTransport.calls[0]?.body.tools as Array<Record<string, unknown>>)[0]).max_uses, 3);
assert.equal((anthropicPauseTransport.calls[1]?.body.messages as unknown[]).length, 2);
assert.deepEqual(anthropicPauseTransport.calls[1]?.body.tools, anthropicPauseTransport.calls[2]?.body.tools);

clearNativeWebSearchCapabilityCache();
let anthropicCappedCallCount = 0;
const anthropicCappedTransport = new CaptureAgentTransport(async (options) => {
  if (!options.url.endsWith("/messages")) return httpResponse(validSearchPayload("After pause cap"));
  anthropicCappedCallCount += 1;
  return httpResponse({
    stop_reason: "pause_turn",
    content: [{ type: "server_tool_use", id: `pause-${anthropicCappedCallCount}`, name: "web_search", input: {} }],
  });
});
const anthropicCappedResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "Anthropic pause cap", maxResults: 5 },
  activeModel: { provider: anthropic, model },
  transport: anthropicCappedTransport,
});
assert.equal(anthropicCappedTransport.calls.filter((call) => call.options.url.endsWith("/messages")).length, 4);
assert.equal(anthropicCappedResponse.route, "fallback");
assert.equal(anthropicCappedResponse.results.length, 1);

// Anthropic domain filters are normalized to one mutually exclusive field.
clearNativeWebSearchCapabilityCache();
const anthropicDomainTransport = new CaptureAgentTransport(async (options) =>
  options.url.endsWith("/messages")
    ? httpResponse({ content: [{ type: "web_search_result", url: "https://a.example/source" }] })
    : httpResponse(validSearchPayload("Domain fallback")),
);
await executeWebSearch({
  settings: settings(),
  options: { query: "Anthropic domains", maxResults: 5, includeDomains: ["a.example", "b.example"], excludeDomains: ["b.example"] },
  activeModel: { provider: anthropic, model },
  transport: anthropicDomainTransport,
});
const anthropicTool = (anthropicDomainTransport.calls[0]?.body.tools as Array<Record<string, unknown>>)[0];
assert.deepEqual(anthropicTool.allowed_domains, ["a.example"]);
assert.equal("blocked_domains" in anthropicTool, false);

// HTTP 200 search-tool errors remain recoverable native failures and are never cached as unsupported.
clearNativeWebSearchCapabilityCache();
let anthropicToolErrorCalls = 0;
const anthropicToolErrorTransport = new CaptureAgentTransport(async (options) => {
  if (options.url.endsWith("/messages")) {
    anthropicToolErrorCalls += 1;
    return httpResponse({
      content: [{ type: "web_search_tool_result", content: [{ type: "web_search_tool_result_error", error_code: "too_many_requests" }] }],
    });
  }
  return httpResponse(validSearchPayload("Tool error fallback"));
});
const anthropicToolErrorResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "Anthropic tool error", maxResults: 5 },
  activeModel: { provider: anthropic, model },
  transport: anthropicToolErrorTransport,
});
assert.equal(anthropicToolErrorResponse.route, "fallback");
assert.equal(anthropicToolErrorResponse.fallbackReason, "native_rate_limited");
assert.equal(anthropicToolErrorResponse.results.length, 1);
assert.equal(isNativeWebSearchUnsupported(resolveNativeWebSearchCandidate(anthropic, model)!.cacheKey), false);
await executeWebSearch({
  settings: settings(),
  options: { query: "Anthropic tool error again", maxResults: 5 },
  activeModel: { provider: anthropic, model },
  transport: anthropicToolErrorTransport,
});
assert.equal(anthropicToolErrorCalls, 2);

// Native 0-result must continue to fallback, and the final tool result is successful.
clearNativeWebSearchCapabilityCache();
let zeroNativeCalls = 0;
let zeroFallbackCalls = 0;
const zeroResultTransport = new CaptureAgentTransport(async (options) => {
  if (options.url.endsWith("/responses")) {
    zeroNativeCalls += 1;
    return httpResponse({ output: [] });
  }
  zeroFallbackCalls += 1;
  return httpResponse(validSearchPayload("Fallback after native empty"));
});
const zeroFallbackResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "native empty", maxResults: 5 },
  activeModel: { provider: openai, model },
  transport: zeroResultTransport,
});
assert.equal(zeroFallbackResponse.route, "fallback");
assert.equal(zeroFallbackResponse.results.length, 1);
assert.equal(zeroFallbackResponse.fallbackReason, "search_no_results");
assert.equal(zeroNativeCalls, 1);
assert.equal(zeroFallbackCalls, 1);
const successfulToolResult = await createWebSearchActionTool({
  search: async () => zeroFallbackResponse,
}).execute({} as never, { query: "native empty", freshness: "any", topic: "general" });
assert.equal(successfulToolResult.ok, true);

const noResultToolResult = await createWebSearchActionTool({
  search: async () => ({
    ...zeroFallbackResponse,
    results: [],
    warnings: ["search_no_results"],
  }),
}).execute({} as never, { query: "no result", freshness: "any", topic: "general" });
assert.equal(noResultToolResult.ok, false);
assert.equal(noResultToolResult.error?.code, "search_no_results");
assert.equal(noResultToolResult.error?.recoverable, true);

// Unsupported native errors read nested server body text and cache only that capability failure.
clearNativeWebSearchCapabilityCache();
let unsupportedNativeCalls = 0;
let unsupportedFallbackCalls = 0;
const unsupportedTransport = new CaptureAgentTransport(async (options) => {
  if (options.url.endsWith("/responses")) {
    unsupportedNativeCalls += 1;
    return httpResponse({ error: { message: "Unsupported tool web_search" } }, 400);
  }
  unsupportedFallbackCalls += 1;
  return httpResponse(validSearchPayload("Unsupported fallback"));
});
const unsupportedSettings = settings();
await executeWebSearch({ settings: unsupportedSettings, options: { query: "unsupported", maxResults: 5 }, activeModel: { provider: openai, model }, transport: unsupportedTransport });
const unsupportedCandidate = resolveNativeWebSearchCandidate(openai, model)!;
assert.equal(isNativeWebSearchUnsupported(unsupportedCandidate.cacheKey), true);
await executeWebSearch({ settings: unsupportedSettings, options: { query: "unsupported again", maxResults: 5 }, activeModel: { provider: openai, model }, transport: unsupportedTransport });
assert.equal(unsupportedNativeCalls, 1);
assert.equal(unsupportedFallbackCalls, 2);

// Rate limits and timeouts fall back but are never capability-cached.
clearNativeWebSearchCapabilityCache();
let rateLimitedNativeCalls = 0;
const rateLimitedTransport = new CaptureAgentTransport(async (options) => {
  if (options.url.endsWith("/responses")) {
    rateLimitedNativeCalls += 1;
    return httpResponse({ error: { message: "rate limited" } }, 429);
  }
  return httpResponse(validSearchPayload("Rate limit fallback"));
});
await executeWebSearch({ settings: settings(), options: { query: "rate limit", maxResults: 5 }, activeModel: { provider: openai, model }, transport: rateLimitedTransport });
await executeWebSearch({ settings: settings(), options: { query: "rate limit again", maxResults: 5 }, activeModel: { provider: openai, model }, transport: rateLimitedTransport });
assert.equal(rateLimitedNativeCalls, 2);
assert.equal(isNativeWebSearchUnsupported(unsupportedCandidate.cacheKey), false);

clearNativeWebSearchCapabilityCache();
const timeoutTransport = new CaptureAgentTransport(async (options) => {
  if (options.url.endsWith("/responses")) throw Object.assign(new Error("request timeout"), { code: "timeout" });
  return httpResponse(validSearchPayload("Timeout fallback"));
});
await executeWebSearch({ settings: settings(), options: { query: "timeout", maxResults: 5 }, activeModel: { provider: openai, model }, transport: timeoutTransport });
assert.equal(isNativeWebSearchUnsupported(unsupportedCandidate.cacheKey), false);

// AnySearch routes only from the structured topic field.
const anyRequests: WebSearchHttpRequest[] = [];
const anyProvider = createAnySearchProvider({
  timeoutMs: 15000,
  anySearchZone: "auto",
  anySearchLanguage: "",
  transport: {
    request: async (request) => {
      anyRequests.push(request);
      return validSearchPayload();
    },
  },
});
await anyProvider.search({ query: "思源笔记最近几天有哪些版本更新？", maxResults: 5, topic: "software", freshness: "week" });
const softwarePayload = JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal("zone" in softwarePayload, false);
assert.equal("language" in softwarePayload, false);
assert.equal(softwarePayload.tag, "general.general");
assert.equal("params" in softwarePayload, false);
const explicitCnProvider = createAnySearchProvider({
  timeoutMs: 15000,
  anySearchZone: "cn",
  anySearchLanguage: "zh-CN",
  transport: {
    request: async (request) => {
      anyRequests.push(request);
      return validSearchPayload();
    },
  },
});
await explicitCnProvider.search({ query: "structured cn", maxResults: 5, topic: "general", freshness: "any" });
const explicitCnPayload = JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal(explicitCnPayload.zone, "cn");
assert.equal(explicitCnPayload.language, "zh-CN");
const explicitIntlProvider = createAnySearchProvider({
  timeoutMs: 15000,
  anySearchZone: "intl",
  anySearchLanguage: "ja",
  transport: {
    request: async (request) => {
      anyRequests.push(request);
      return validSearchPayload();
    },
  },
});
await explicitIntlProvider.search({ query: "structured intl", maxResults: 5, topic: "general", freshness: "any" });
const explicitIntlPayload = JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal(explicitIntlPayload.zone, "intl");
assert.equal(explicitIntlPayload.language, "ja");
await anyProvider.search({ query: "latest GitHub release of SiYuan", maxResults: 5, topic: "software", freshness: "month" });
const githubPayload = JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal(githubPayload.tag, "general.general");
await anyProvider.search({ query: "arxiv web agents", maxResults: 5, topic: "academic", freshness: "any" });
assert.equal((JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>).tag, "academic.search");
await anyProvider.search({ query: "AI finance news", maxResults: 5, topic: "finance", freshness: "day" });
assert.equal("tag" in (JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>), false);
const multilingualTags: unknown[] = [];
for (const query of ["中文查询", "日本語の検索", "بحث عربي"]) {
  await anyProvider.search({ query, maxResults: 5, topic: "news", freshness: "week" });
  multilingualTags.push((JSON.parse(anyRequests.at(-1)!.body!) as Record<string, unknown>).tag);
}
assert.deepEqual(multilingualTags, ["general.general", "general.general", "general.general"]);

// Tavily preserves freshness/topic filters and uses content as a readable snippet fallback.
const tavilyRequests: WebSearchHttpRequest[] = [];
const tavilyProvider = createTavilyProvider({
  apiKey: "test-tavily-key",
  timeoutMs: 15000,
  transport: {
    request: async (request) => {
      tavilyRequests.push(request);
      return { results: [{ title: "Tavily", url: "https://tavily.example/source", content: "content preview", score: 0.8 }] };
    },
  },
});
const tavilyNews = await tavilyProvider.search({ query: "today news", maxResults: 5, topic: "news", freshness: "day", includeDomains: ["example.com"], excludeDomains: ["blocked.example"] });
const tavilyNewsPayload = JSON.parse(tavilyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal(tavilyNewsPayload.topic, "news");
assert.equal(tavilyNewsPayload.time_range, "day");
assert.deepEqual(tavilyNewsPayload.include_domains, ["example.com"]);
assert.deepEqual(tavilyNewsPayload.exclude_domains, ["blocked.example"]);
assert.equal(tavilyNews[0]?.snippet, "content preview");
await tavilyProvider.search({ query: "software changes", maxResults: 5, topic: "software", freshness: "week" });
const tavilySoftwarePayload = JSON.parse(tavilyRequests.at(-1)!.body!) as Record<string, unknown>;
assert.equal(tavilySoftwarePayload.topic, "general");
assert.equal(tavilySoftwarePayload.time_range, "week");
assert.equal(tavilySoftwarePayload.search_depth, "advanced");
await tavilyProvider.search({ query: "finance", maxResults: 5, topic: "finance", freshness: "any" });
assert.equal((JSON.parse(tavilyRequests.at(-1)!.body!) as Record<string, unknown>).topic, "finance");

// Tracker success is cumulative across calls in one turn.
let trackerRequest = 0;
const tracker: WebSearchTurnTracker = { attempted: false, succeeded: false };
const trackerTransport = new CaptureAgentTransport(async () => {
  trackerRequest += 1;
  return trackerRequest === 2 ? httpResponse(validSearchPayload("Tracker success")) : httpResponse({ results: [] });
});
const trackerSettings = settings({ nativeSearchEnabled: false, provider: "custom_json" });
await executeWebSearch({ settings: trackerSettings, options: { query: "first", maxResults: 5 }, tracker, transport: trackerTransport });
assert.equal(tracker.attempted, true);
assert.equal(tracker.succeeded, false);
assert.equal(tracker.lastError, "search_no_results");
await executeWebSearch({ settings: trackerSettings, options: { query: "second", maxResults: 5 }, tracker, transport: trackerTransport });
assert.equal(tracker.succeeded, true);
await executeWebSearch({ settings: trackerSettings, options: { query: "third", maxResults: 5 }, tracker, transport: trackerTransport });
assert.equal(tracker.succeeded, true);

// Shared requirement helper states.
assert.equal(evaluateWebSearchUsageRequirement({ required: false, tracker: { attempted: false, succeeded: false } }), "not_required");
assert.equal(evaluateWebSearchUsageRequirement({ required: true, tracker: { attempted: false, succeeded: false } }), "not_attempted");
assert.equal(evaluateWebSearchUsageRequirement({ required: true, tracker: { attempted: true, succeeded: false } }), "failed");
assert.equal(evaluateWebSearchUsageRequirement({ required: true, tracker: { attempted: true, succeeded: true } }), "satisfied");
assert.equal(mapAgentErrorToUserFacing({ agentErrorCode: "required_web_search_failed" }).message, "联网搜索未获得可用结果，请稍后重试或调整查询。");

// Structured freshness/topic and the runtime date reach providers without query rewriting.
const localDate = new Date(2026, 0, 2, 3, 4, 5);
const dateTransport = new CaptureAgentTransport(async (options) =>
  options.url.endsWith("/responses") ? httpResponse({ output: [] }) : httpResponse(validSearchPayload("Date fallback")),
);
const dateResponse = await executeWebSearch({
  settings: settings(),
  options: { query: "SiYuan release", maxResults: 5, freshness: "week", topic: "software" },
  activeModel: { provider: openai, model },
  transport: dateTransport,
  now: localDate,
});
assert.match(String(dateTransport.calls[0]?.body.input), /Current date: 2026-01-02/);
assert.match(String(dateTransport.calls[0]?.body.input), /freshness=week/);
assert.match(String(dateTransport.calls[0]?.body.input), /topic=software/);
assert.equal(dateResponse.freshness, "week");
assert.equal(dateResponse.topic, "software");
assert.equal(dateTransport.calls[1]?.body.query, "SiYuan release");
assert.equal("executedQuery" in dateResponse, false);

const legacyTransport = new CaptureAgentTransport(async () => httpResponse(validSearchPayload("Legacy fallback")));
const legacyResponse = await executeWebSearch({
  settings: settings({ nativeSearchEnabled: false }),
  options: { query: "任意字符串" },
  transport: legacyTransport,
});
assert.equal(legacyResponse.freshness, "any");
assert.equal(legacyResponse.topic, "general");
assert.equal(legacyTransport.calls[0]?.body.query, "任意字符串");

assert.equal(webSearchInputSchema.safeParse({ query: "only query" }).success, false);
assert.equal(webSearchInputSchema.safeParse({ query: "query", freshness: "week", topic: "news" }).success, true);
const nativeTool = createWebSearchNativeTool({ search: async () => dateResponse });
assert.deepEqual((nativeTool.parameters as Record<string, unknown>).required, ["query", "freshness", "topic"]);

// Smart/required/off behavior is structural and independent of user language.
const robotRuntimeSource = sourceText("src/features/robot-assistant/agent/kernel-robot-agent-runtime.ts");
const robotRegistrySource = sourceText("src/features/robot-assistant/agent/build-robot-kernel-tool-registry.ts");
const conversationContextSource = sourceText("src/features/kb/services/agent-workbench/runtime/conversation-context-builder.ts");
const runAgentProfileSource = sourceText("src/features/kb/services/agent-workbench/runtime/run-agent-profile.ts");
const contextInstructionSource = sourceText("src/features/kb/services/agent-core/prompts/context-instruction-renderer.ts");
const robotPromptSource = sourceText("src/features/robot-assistant/agent/robot-prompt-builder.ts");
const anySearchSource = sourceText("src/features/kb/services/agent-workbench/tools/web-search/providers/anysearch.provider.ts");
const webSearchRouterSource = sourceText("src/features/kb/services/agent-workbench/tools/web-search/web-search-router.ts");
const webSearchToolSource = sourceText("src/features/kb/services/agent-workbench/tools/web-search/web-search.tool.ts");
const webSearchCenterSource = sourceText("src/homepage/homepageSetting/tabs/WebSearchCenterSettingsPanel.svelte");
const runtimeSources = [
  conversationContextSource,
  runAgentProfileSource,
  contextInstructionSource,
  robotRuntimeSource,
  robotPromptSource,
  anySearchSource,
  webSearchRouterSource,
  webSearchToolSource,
].join("\n");
const contextSettings = {
  enabled: true,
  provider: "anysearch",
  maxResults: 5,
  readPageMaxChars: 12000,
};
for (const [index, question] of ["中文问题", "English question", "日本語の質問", "بحث عربي"].entries()) {
  const smartContext = buildConversationContext({
    messages: [{ id: `smart-${index}`, role: "user", content: question, createdAt: 0 }],
    currentUserMessageId: `smart-${index}`,
    currentQuestion: question,
    webSearchSettings: contextSettings,
    webAccessModeOverride: "smart",
  });
  assert.deepEqual(smartContext.currentTurn.webAccess, {
    enabled: true,
    mode: "smart",
    provider: "anysearch",
    maxResults: 5,
    readPageMaxChars: 12000,
  });
  const requiredContext = buildConversationContext({
    messages: [{ id: `required-${index}`, role: "user", content: question, createdAt: 0 }],
    currentUserMessageId: `required-${index}`,
    currentQuestion: question,
    webSearchSettings: contextSettings,
    webAccessModeOverride: "required",
  });
  assert.equal(requiredContext.currentTurn.webAccess?.mode, "required");
  const offContext = buildConversationContext({
    messages: [{ id: `off-${index}`, role: "user", content: question, createdAt: 0 }],
    currentUserMessageId: `off-${index}`,
    currentQuestion: question,
    webSearchSettings: contextSettings,
    webAccessModeOverride: "off",
  });
  assert.equal(offContext.currentTurn.webAccess, undefined);
}
assert.match(runAgentProfileSource, /webAccess\?\.enabled === true && webAccess\.mode === "required"/);
assert.match(runAgentProfileSource, /webSearch: !disabledGlobalTools\.has\("web_search"\) && Boolean\(webAccess\?\.enabled\)/);
assert.match(contextInstructionSource, /webAccess\.mode === "required"/);
assert.match(robotPromptSource, /根据用户语义决定是否调用/);
assert.doesNotMatch(runtimeSources, /resolveWebSearchIntent|inferFreshness|inferTopic|isWebSearchRequiredForQuery|isLikelyLocalCurrentDataQuery|isExplicitWebSearchRequest|timeSensitiveWebRequired/);
assert.doesNotMatch(anySearchSource, /opts\.query.*(?:arxiv|preprint|news|新闻|热点)/i);
assert.doesNotMatch(webSearchRouterSource, /buildExecutedQuery|hasExplicitAbsoluteTimeReference/);
assert.match(webSearchToolSource, /required: \["query", "freshness", "topic"\]/);
assert.match(webSearchCenterSource, /function webSearchSignature\(value: WebSearchSettings\)/);
assert.match(webSearchCenterSource, /lastSavedSignature = webSearchSignature\(settings\.webSearch\)/);
assert.match(webSearchCenterSource, /saveKbSettings\(\{ webSearch: draft \}\)/);
assert.doesNotMatch(webSearchCenterSource, /saveKbSettings\(draft\)/);
assert.match(webSearchCenterSource, /queueAutoSave\(structuredClone\(settings\.webSearch\), webSearchSignature\(settings\.webSearch\)\)/);
assert.match(robotRuntimeSource, /createWebSearchNativeTool/);
assert.match(robotRuntimeSource, /activeModel/);
assert.doesNotMatch(robotRuntimeSource, /validateFinalAnswer|required_web_search_failed|webSearchRequired/);
assert.match(robotRegistrySource, /webFetchReadPageOnly:\s*true/);
assert.match(robotRegistrySource, /webSearch:\s*false/);

console.log("global web search verification passed");
