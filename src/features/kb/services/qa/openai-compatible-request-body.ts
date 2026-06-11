/**
 * OpenAI-compatible raw JSON 请求体构造器（纯模块）
 *
 * Planner raw JSON fallback 和自动操作测试共用此 builder。
 * 本模块只构造 body object，不导入 AI SDK、settings、provider factory、UI 或 Agent 代码。
 */

export function buildOpenAICompatibleRawJsonRequestBody(params: {
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature?: number;
  jsonOutputStrategy?: "raw_prompt" | "response_format_json_object";
  thinkingParams?: {
    thinking?: { type: "enabled" | "disabled" };
    enableThinking?: boolean;
  };
  tokenParamStrategy?: "max_tokens" | "max_completion_tokens";
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.modelId,
    messages: params.messages,
  };

  // token 参数只能二选一
  const tokenStrategy = params.tokenParamStrategy ?? "max_tokens";
  if (tokenStrategy === "max_completion_tokens") {
    body.max_completion_tokens = params.maxTokens;
  } else {
    body.max_tokens = params.maxTokens;
  }

  // temperature 可选
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }

  // response_format 只由 jsonOutputStrategy 决定
  if (params.jsonOutputStrategy === "response_format_json_object") {
    body.response_format = { type: "json_object" };
  }

  // thinking / enable_thinking 只由 providerOptions 或 strategy 转换决定
  const tp = params.thinkingParams;
  if (tp?.thinking) {
    body.thinking = tp.thinking;
  }
  if (typeof tp?.enableThinking === "boolean") {
    body.enable_thinking = tp.enableThinking;
  }

  return body;
}
