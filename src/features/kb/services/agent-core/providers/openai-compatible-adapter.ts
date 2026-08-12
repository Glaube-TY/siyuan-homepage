import type { AgentMessage, AgentToolCall } from "../messages/agent-message";
import { normalizeToolCallMessages } from "../messages/message-normalizer";
import { nativeToolsToOpenAITools } from "../tools/tool-schema-converter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "./provider-capabilities";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "./provider-adapter";
import { AgentProviderError } from "./provider-error";
import { BrowserAgentHttpTransport, type AgentHttpTransport } from "./agent-http-transport";
import { normalizeProviderUsage } from "./provider-usage";

interface OpenAICompatibleAdapterOptions {
  id: string;
  model: string;
  apiKey?: string;
  chatCompletionsUrl: string;
  temperature?: number;
  maxTokens?: number;
  tokenParamStrategy?: "max_tokens" | "max_completion_tokens";
  providerOptions?: Record<string, Record<string, unknown>>;
  /** 可注入 HTTP 传输（默认浏览器 fetch）。 */
  transport?: AgentHttpTransport;
  /** 是否流式（浏览器默认 true；Kernel 传 false 走非流式 JSON）。 */
  stream?: boolean;
  requestTimeoutMs?: number;
}

interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  index: number;
}

function toOpenAIMessage(message: AgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content,
    };
  }

  if (message.role === "assistant") {
    const out: Record<string, unknown> = {
      role: "assistant",
      content: message.content || null,
    };
    if (message.toolCalls?.length) {
      out.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments || "{}",
        },
      }));
    }
    return out;
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function mergeProviderOptions(body: Record<string, unknown>, providerOptions: Record<string, Record<string, unknown>> | undefined): void {
  const openaiOptions = providerOptions?.openai;
  if (!openaiOptions) return;
  for (const [key, value] of Object.entries(openaiOptions)) {
    body[key] = value;
  }
}

function readChoiceDelta(chunk: Record<string, unknown>): Record<string, unknown> | undefined {
  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return undefined;
  const delta = (first as Record<string, unknown>).delta;
  return delta && typeof delta === "object" ? delta as Record<string, unknown> : undefined;
}

function readFinishReason(chunk: Record<string, unknown>): string | undefined {
  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return undefined;
  const reason = (first as Record<string, unknown>).finish_reason;
  return typeof reason === "string" ? reason : undefined;
}

function appendToolCallDelta(
  state: Map<number, ToolCallState>,
  delta: Record<string, unknown>,
): AgentProviderEvent[] {
  const rawToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
  const events: AgentProviderEvent[] = [];

  for (const raw of rawToolCalls) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const index = typeof item.index === "number" ? item.index : 0;
    const fn = item.function && typeof item.function === "object"
      ? item.function as Record<string, unknown>
      : undefined;

    const existing = state.get(index) ?? {
      id: typeof item.id === "string" && item.id ? item.id : `call_${index}`,
      name: "",
      arguments: "",
      index,
    };

    const id = typeof item.id === "string" && item.id ? item.id : existing.id;
    const name = typeof fn?.name === "string" && fn.name ? fn.name : existing.name;
    const argumentsDelta = typeof fn?.arguments === "string" ? fn.arguments : "";
    const next = {
      id,
      name,
      arguments: existing.arguments + argumentsDelta,
      index,
    };
    state.set(index, next);

    events.push({
      type: "tool_call_delta",
      index,
      id,
      ...(name ? { name } : {}),
      ...(argumentsDelta ? { argumentsDelta } : {}),
    });
  }

  return events;
}

function buildDoneToolCalls(state: Map<number, ToolCallState>): AgentToolCall[] {
  return Array.from(state.values())
    .filter((call) => call.name)
    .sort((a, b) => a.index - b.index)
    .map((call) => ({
      id: call.id || `call_${call.index}`,
      name: call.name,
      arguments: call.arguments || "{}",
      index: call.index,
    }));
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly capabilities;
  readonly id: string;
  readonly requestTimeoutMs?: number;
  private readonly transport: AgentHttpTransport;
  private readonly stream: boolean;

  constructor(private readonly options: OpenAICompatibleAdapterOptions) {
    this.id = options.id;
    this.transport = options.transport ?? new BrowserAgentHttpTransport();
    this.stream = options.stream !== false;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.capabilities = { ...OPENAI_COMPATIBLE_CAPABILITIES, streaming: this.stream };
  }

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    let body = this.buildRequestBody(request);

    let response;
    let responseErrorText: string | undefined;
    try {
      response = await this.transport.post({
        url: this.options.chatCompletionsUrl,
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        stream: this.stream,
        signal: request.abortSignal,
      });
      if (response.status === 400 && request.toolChoice === "required") {
        const text = await response.text().catch(() => "");
        if (/tool_choice/i.test(text) && /(?:not support|unsupported|invalid)/i.test(text)) {
          body = this.buildRequestBody({ ...request, toolChoice: "auto" });
          response = await this.transport.post({
            url: this.options.chatCompletionsUrl,
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            stream: this.stream,
            signal: request.abortSignal,
          });
        } else {
          responseErrorText = text;
        }
      }
    } catch (err) {
      if (err instanceof AgentProviderError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        yield { type: "done", finishReason: "aborted" };
        return;
      }
      if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network"))) {
        throw new AgentProviderError(
          `Provider network error: ${err.message}`,
          { code: "provider_network_error", retryable: true },
        );
      }
      throw new AgentProviderError(
        `Provider request failed: ${err instanceof Error ? err.message : String(err)}`,
        { code: "provider_network_error", retryable: true },
      );
    }

    if (!response.ok) {
      const status = response.status;
      let code: string;
      if (status === 401 || status === 403) {
        code = "provider_auth_failed";
      } else if (status === 429) {
        code = "provider_rate_limited";
      } else if (status >= 500) {
        code = "provider_network_error";
      } else {
        code = "provider_http_error";
      }
      const text = responseErrorText ?? await response.text().catch(() => "");
      throw new AgentProviderError(
        `Provider request failed: HTTP ${status}${text ? ` ${text.slice(0, 500)}` : ""}`,
        {
          code,
          status,
          retryable: status === 429 || status >= 500,
          userAction: status === 401 || status === 403
            ? "check_credentials"
            : status === 429 || status >= 500 ? "retry" : "inspect_provider",
        },
      );
    }

    if (!this.stream) {
      // Kernel 非流式：服务器返回完整 JSON，直接解析。
      yield* this.parseJsonResponse(await response.json());
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      yield* this.parseJsonResponse(await response.json());
      return;
    }

    if (!response.body) {
      throw new AgentProviderError("Provider returned an empty response body.", { code: "empty_stream" });
    }

    yield* this.parseSseStream(response.body);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  private buildRequestBody(request: AgentChatRequest): Record<string, unknown> {
    const { messages, tools } = request;
    const streaming = this.stream;
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: normalizeToolCallMessages(messages).map(toOpenAIMessage),
      stream: streaming,
    };
    if (streaming) {
      // stream_options 仅在流式请求时有效。
      body.stream_options = { include_usage: true };
    }

    if (tools.length > 0) {
      body.tools = nativeToolsToOpenAITools(tools);
      body.tool_choice = request.toolChoice ?? "auto";
      body.parallel_tool_calls = true;
    }

    if (this.options.temperature !== undefined) {
      body.temperature = this.options.temperature;
    }

    if (this.options.maxTokens !== undefined) {
      body[this.options.tokenParamStrategy ?? "max_tokens"] = this.options.maxTokens;
    }

    mergeProviderOptions(body, this.options.providerOptions);
    // A runtime recovery requirement must not be weakened by providerOptions.
    if (tools.length > 0 && request.toolChoice === "required") {
      body.tool_choice = "required";
    }
    return body;
  }

  private async *parseJsonResponse(raw: unknown): AsyncGenerator<AgentProviderEvent> {
    const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
    const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
    const usage = normalizeProviderUsage(root.usage);
    if (usage) yield { type: "usage", usage };
    const content = typeof message.content === "string" ? message.content : "";
    if (content) {
      yield { type: "text_delta", delta: content };
    }
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (let index = 0; index < toolCalls.length; index++) {
      const item = toolCalls[index] && typeof toolCalls[index] === "object" ? toolCalls[index] as Record<string, unknown> : {};
      const fn = item.function && typeof item.function === "object" ? item.function as Record<string, unknown> : {};
      const name = typeof fn.name === "string" ? fn.name : "";
      if (!name) continue;
      yield {
        type: "tool_call_done",
        toolCall: {
          id: typeof item.id === "string" && item.id ? item.id : `call_${index}`,
          name,
          arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
          index,
        },
      };
    }
    yield { type: "done", finishReason: typeof first.finish_reason === "string" ? first.finish_reason : undefined };
  }

  private async *parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentProviderEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const toolCallState = new Map<number, ToolCallState>();
    let buffer = "";
    let finishReason: string | undefined;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const events = this.parseSseFrame(frame, toolCallState);
          for (const event of events) {
            if (event.type === "done") {
              // OpenAI-compatible streams usually send a finish_reason chunk and
              // then a bare [DONE]. Keep the last concrete reason instead of
              // overwriting it with undefined from the terminal sentinel.
              finishReason = event.finishReason ?? finishReason;
            } else {
              yield event;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      try { await reader.cancel(); } catch { /* ignore cancellation failures */ }
    }

    for (const call of buildDoneToolCalls(toolCallState)) {
      yield { type: "tool_call_done", toolCall: call };
    }
    yield { type: "done", finishReason };
  }

  private parseSseFrame(frame: string, toolCallState: Map<number, ToolCallState>): AgentProviderEvent[] {
    const out: AgentProviderEvent[] = [];
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    for (const data of dataLines) {
      if (!data || data === "[DONE]") {
        out.push({ type: "done" });
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (parsed.usage && typeof parsed.usage === "object") {
        const usage = normalizeProviderUsage(parsed.usage);
        if (usage) out.push({ type: "usage", usage });
      }

      const delta = readChoiceDelta(parsed);
      if (delta) {
        const content = typeof delta.content === "string" ? delta.content : "";
        const reasoning = typeof delta.reasoning_content === "string"
          ? delta.reasoning_content
          : typeof delta.reasoning === "string"
            ? delta.reasoning
            : "";
        if (reasoning) out.push({ type: "reasoning_delta", delta: reasoning });
        if (content) out.push({ type: "text_delta", delta: content });
        out.push(...appendToolCallDelta(toolCallState, delta));
      }

      const reason = readFinishReason(parsed);
      if (reason) {
        out.push({ type: "done", finishReason: reason });
      }
    }

    return out;
  }
}
