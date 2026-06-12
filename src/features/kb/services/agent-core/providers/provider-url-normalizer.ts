function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function hasKnownChatPath(value: string): boolean {
  return value.endsWith("/chat/completions");
}

export function normalizeOpenAICompatibleEndpoint(baseUrl: string): {
  baseUrl: string;
  chatCompletionsUrl: string;
} {
  let normalized = stripTrailingSlash(String(baseUrl || "").trim());
  // If URL already ends with a known chat path, don't modify
  if (hasKnownChatPath(normalized)) {
    return { baseUrl: normalized, chatCompletionsUrl: normalized };
  }
  // If URL already contains /v1 but not at end, don't append /v1 again
  if (normalized.includes("/v1") && !normalized.endsWith("/v1")) {
    return { baseUrl: normalized, chatCompletionsUrl: `${normalized}/chat/completions` };
  }
  if (!normalized.endsWith("/v1")) {
    normalized = `${normalized}/v1`;
  }
  return {
    baseUrl: normalized,
    chatCompletionsUrl: `${normalized}/chat/completions`,
  };
}

export function normalizeGeminiEndpoint(baseUrl: string): string {
  const normalized = stripTrailingSlash(String(baseUrl || "https://generativelanguage.googleapis.com/v1beta").trim());
  return normalized || "https://generativelanguage.googleapis.com/v1beta";
}

export function normalizeAnthropicEndpoint(baseUrl: string): string {
  const normalized = stripTrailingSlash(String(baseUrl || "https://api.anthropic.com/v1").trim());
  return normalized || "https://api.anthropic.com/v1";
}

