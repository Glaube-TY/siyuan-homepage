import type { AgentMessage } from "../messages/agent-message";
import { nativeToolsToAnthropicTools } from "../tools/tool-schema-converter";
import { ANTHROPIC_CAPABILITIES } from "./provider-capabilities";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "./provider-adapter";
import { AgentProviderError } from "./provider-error";
import { normalizeAnthropicEndpoint } from "./provider-url-normalizer";

export interface AnthropicAdapterOptions {
  id: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
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
  readonly capabilities = ANTHROPIC_CAPABILITIES;
  readonly id: string;
  private readonly endpoint: string;

  constructor(private readonly options: AnthropicAdapterOptions) {
    this.id = options.id;
    this.endpoint = normalizeAnthropicEndpoint(options.baseUrl ?? "");
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
      const response = await fetch(`${this.endpoint}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: request.abortSignal,
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.options.maxTokens ?? 4096,
          stream: true,
          messages,
          ...(system ? { system } : {}),
          ...(request.tools.length ? { tools: nativeToolsToAnthropicTools(request.tools) } : {}),
        }),
      });

      if (!response.ok) {
        const status = response.status;
        yield* this.handleHttpError(status);
        return;
      }

      yield* this.parseSse(response.body);
    } catch (err) {
      if (err instanceof AgentProviderError) throw err;
      if ((err as any)?.name === "AbortError") {
        yield { type: "done" };
        return;
      }
      throw new AgentProviderError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`, {
        code: "provider_network_error",
        recoverable: true,
      });
    }
  }

  private async *handleHttpError(status: number): AsyncGenerator<AgentProviderEvent> {
    let code: string;
    if (status === 401 || status === 403) {
      code = "provider_auth_failed";
    } else if (status === 429) {
      code = "provider_rate_limited";
    } else {
      code = "provider_network_error";
    }
    yield {
      type: "error",
      error: new AgentProviderError(`Anthropic request failed: HTTP ${status}`, {
        code,
        status,
        recoverable: status >= 500,
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
            yield event;
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
    yield { type: "done" };
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
        if (type === "content_block_start") {
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
