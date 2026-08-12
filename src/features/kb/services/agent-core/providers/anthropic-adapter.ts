import type { AgentMessage } from "../messages/agent-message";
import { nativeToolsToAnthropicTools } from "../tools/tool-schema-converter";
import { ANTHROPIC_CAPABILITIES } from "./provider-capabilities";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "./provider-adapter";
import { AgentProviderError } from "./provider-error";
import { normalizeAnthropicEndpoint } from "./provider-url-normalizer";
import { BrowserAgentHttpTransport, type AgentHttpTransport } from "./agent-http-transport";
import { normalizeProviderUsage } from "./provider-usage";

export interface AnthropicAdapterOptions {
  id: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  /** 可注入 HTTP 传输（默认浏览器 fetch）。 */
  transport?: AgentHttpTransport;
  /** 是否流式（浏览器默认 true；Kernel 传 false 走非流式 JSON）。 */
  stream?: boolean;
  requestTimeoutMs?: number;
}

interface AnthropicToolUseState {
  id: string;
  name: string;
  input: string;
  index: number;
}

function toAnthropicMessage(message: AgentMessage): Record<string, unknown> | null {
  if (message.role === "system") return null;
  if (message.role === "tool") {
    return {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      }],
    };
  }
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    // Convert assistant tool_calls to Anthropic tool_use content blocks
    const content: Record<string, unknown>[] = [];
    if (message.content.trim()) {
      content.push({ type: "text", text: message.content });
    }
    for (const call of message.toolCalls) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(call.arguments || "{}"); } catch { /* keep empty */ }
      content.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: parsedInput,
      });
    }
    return {
      role: "assistant",
      content,
    };
  }
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly capabilities;
  readonly id: string;
  readonly requestTimeoutMs?: number;
  private readonly endpoint: string;
  private readonly transport: AgentHttpTransport;
  private readonly stream: boolean;

  constructor(private readonly options: AnthropicAdapterOptions) {
    this.id = options.id;
    this.endpoint = normalizeAnthropicEndpoint(options.baseUrl ?? "");
    this.transport = options.transport ?? new BrowserAgentHttpTransport();
    this.stream = options.stream !== false;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.capabilities = { ...ANTHROPIC_CAPABILITIES, streaming: this.stream };
  }

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const messages = request.messages
      .map(toAnthropicMessage)
      .filter((message): message is Record<string, unknown> => message !== null);

    try {
      const response = await this.transport.post({
        url: `${this.endpoint}/messages`,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.options.maxTokens ?? 4096,
          stream: this.stream,
          messages,
          ...(system ? { system } : {}),
          ...(request.tools.length ? { tools: nativeToolsToAnthropicTools(request.tools) } : {}),
          ...(request.tools.length && request.toolChoice === "required"
            ? { tool_choice: { type: "any" } }
            : {}),
        }),
        stream: this.stream,
        signal: request.abortSignal,
      });

      if (!response.ok) {
        const status = response.status;
        yield* this.handleHttpError(status);
        return;
      }

      if (!this.stream) {
        yield* this.parseJsonResponse(await response.json());
        return;
      }

      yield* this.parseSse(response.body);
    } catch (err) {
      if (err instanceof AgentProviderError) throw err;
      if ((err as any)?.name === "AbortError") {
        yield { type: "done", finishReason: "aborted" };
        return;
      }
      throw new AgentProviderError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`, {
        code: "provider_network_error",
        retryable: true,
      });
    }
  }

  private async *parseJsonResponse(raw: unknown): AsyncGenerator<AgentProviderEvent> {
    const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const usage = normalizeProviderUsage(root.usage);
    if (usage) yield { type: "usage", usage };
    const content = Array.isArray(root.content) ? root.content : [];
    let callIndex = 0;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const record = block as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "";
      if (type === "text" && typeof record.text === "string" && record.text) {
        yield { type: "text_delta", delta: record.text };
      } else if (type === "tool_use" && typeof record.name === "string") {
        yield {
          type: "tool_call_done",
          toolCall: {
            id: typeof record.id === "string" ? record.id : `anthropic_call_${callIndex}`,
            name: record.name,
            arguments: JSON.stringify(record.input ?? {}),
            index: callIndex,
          },
        };
        callIndex += 1;
      }
    }

    const stopReason = typeof root.stop_reason === "string" ? root.stop_reason : undefined;
    yield { type: "done", finishReason: stopReason };
  }

  private async *handleHttpError(status: number): AsyncGenerator<AgentProviderEvent> {
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
    yield {
      type: "error",
      error: new AgentProviderError(`Anthropic request failed: HTTP ${status}`, {
        code,
        status,
        retryable: status === 429 || status >= 500,
        userAction: status === 401 || status === 403
          ? "check_credentials"
          : status === 429 || status >= 500 ? "retry" : "inspect_provider",
      }),
    };
    yield { type: "done" };
  }

  private async *parseSse(body: ReadableStream<Uint8Array> | null): AsyncGenerator<AgentProviderEvent> {
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const toolState = new Map<number, AnthropicToolUseState>();
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
          for (const event of this.parseFrame(frame, toolState)) {
            if (event.type === "done") {
              finishReason = event.finishReason ?? finishReason;
            } else {
              yield event;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }

    // Emit remaining tool calls at end of stream
    for (const tool of Array.from(toolState.values()).sort((a, b) => a.index - b.index)) {
      yield {
        type: "tool_call_done",
        toolCall: {
          id: tool.id,
          name: tool.name,
          arguments: tool.input || "{}",
          index: tool.index,
        },
      };
    }
    yield { type: "done", finishReason };
  }

  private parseFrame(frame: string, toolState: Map<number, AnthropicToolUseState>): AgentProviderEvent[] {
    const out: AgentProviderEvent[] = [];
    const lines = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const type = typeof parsed.type === "string" ? parsed.type : "";
        if (type === "message_start") {
          const message = parsed.message && typeof parsed.message === "object"
            ? parsed.message as Record<string, unknown>
            : {};
          const usage = normalizeProviderUsage(message.usage);
          if (usage) out.push({ type: "usage", usage });
        } else if (type === "content_block_start") {
          const index = typeof parsed.index === "number" ? parsed.index : toolState.size;
          const block = parsed.content_block && typeof parsed.content_block === "object"
            ? parsed.content_block as Record<string, unknown>
            : {};
          if (block.type === "tool_use" && typeof block.name === "string") {
            toolState.set(index, {
              id: typeof block.id === "string" ? block.id : `anthropic_call_${index}`,
              name: block.name,
              input: "",
              index,
            });
          }
        } else if (type === "content_block_delta") {
          const index = typeof parsed.index === "number" ? parsed.index : 0;
          const delta = parsed.delta && typeof parsed.delta === "object"
            ? parsed.delta as Record<string, unknown>
            : {};
          if (typeof delta.text === "string") {
            out.push({ type: "text_delta", delta: delta.text });
          }
          if (typeof delta.partial_json === "string") {
            const existing = toolState.get(index);
            if (existing) {
              existing.input += delta.partial_json;
            }
          }
        } else if (type === "message_delta") {
          const usage = normalizeProviderUsage(parsed.usage);
          if (usage) out.push({ type: "usage", usage });
          const delta = parsed.delta && typeof parsed.delta === "object"
            ? parsed.delta as Record<string, unknown>
            : {};
          if (typeof delta.stop_reason === "string") {
            out.push({ type: "done", finishReason: delta.stop_reason });
          }
        } else if (type === "message_stop") {
          // done signal will be emitted after the loop
        }
      } catch {
        // Skip unparseable frames
      }
    }
    return out;
  }
}
