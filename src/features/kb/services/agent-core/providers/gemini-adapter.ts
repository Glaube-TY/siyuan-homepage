import type { AgentMessage } from "../messages/agent-message";
import { nativeToolsToGeminiFunctionDeclarations } from "../tools/tool-schema-converter";
import { GEMINI_CAPABILITIES } from "./provider-capabilities";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "./provider-adapter";
import { AgentProviderError } from "./provider-error";
import { normalizeGeminiEndpoint } from "./provider-url-normalizer";

export interface GeminiAdapterOptions {
  id: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

function toGeminiContent(message: AgentMessage): Record<string, unknown> | null {
  if (message.role === "system") return null;
  if (message.role === "tool") {
    return {
      role: "user",
      parts: [{
        functionResponse: {
          name: message.name,
          response: { content: message.content },
        },
      }],
    };
  }
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    // Convert assistant tool_calls to Gemini functionCall parts
    const parts: Record<string, unknown>[] = [];
    for (const call of message.toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try { parsedArgs = JSON.parse(call.arguments || "{}"); } catch { /* keep empty */ }
      parts.push({
        functionCall: {
          name: call.name,
          args: parsedArgs,
        },
      });
    }
    if (message.content.trim()) {
      parts.unshift({ text: message.content });
    }
    return {
      role: "model",
      parts,
    };
  }
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  };
}

export class GeminiAdapter implements ProviderAdapter {
  readonly capabilities = GEMINI_CAPABILITIES;
  readonly id: string;
  private readonly endpoint: string;

  constructor(private readonly options: GeminiAdapterOptions) {
    this.id = options.id;
    this.endpoint = normalizeGeminiEndpoint(options.baseUrl ?? "");
  }

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    const systemInstruction = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = request.messages
      .map(toGeminiContent)
      .filter((message): message is Record<string, unknown> => message !== null);
    const tools = request.tools.length > 0
      ? [{ functionDeclarations: nativeToolsToGeminiFunctionDeclarations(request.tools) }]
      : undefined;

    try {
      const response = await fetch(`${this.endpoint}/models/${encodeURIComponent(this.options.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.options.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: request.abortSignal,
        body: JSON.stringify({
          contents,
          ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
          ...(tools ? { tools } : {}),
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
      throw new AgentProviderError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`, {
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
      error: new AgentProviderError(`Gemini request failed: HTTP ${status}`, {
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
    let buffer = "";
    let callIndex = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const event of this.parseFrame(frame, callIndex)) {
            if (event.type === "tool_call_done") callIndex++;
            yield event;
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }
    yield { type: "done" };
  }

  private parseFrame(frame: string, callIndex: number): AgentProviderEvent[] {
    const out: AgentProviderEvent[] = [];
    const lines = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    for (const line of lines) {
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
        const first = candidates[0] && typeof candidates[0] === "object" ? candidates[0] as Record<string, unknown> : {};
        const content = first.content && typeof first.content === "object" ? first.content as Record<string, unknown> : {};
        const parts = Array.isArray(content.parts) ? content.parts : [];

        for (const part of parts) {
          if (!part || typeof part !== "object") continue;
          const record = part as Record<string, unknown>;
          if (typeof record.text === "string") {
            out.push({ type: "text_delta", delta: record.text });
          }
          if (record.thought && typeof record.thought === "string") {
            out.push({ type: "reasoning_delta", delta: record.thought });
          }
          const functionCall = record.functionCall && typeof record.functionCall === "object"
            ? record.functionCall as Record<string, unknown>
            : undefined;
          const name = typeof functionCall?.name === "string" ? functionCall.name : "";
          if (name) {
            out.push({
              type: "tool_call_done",
              toolCall: {
                id: `gemini_call_${callIndex}`,
                name,
                arguments: JSON.stringify(functionCall?.args ?? {}),
                index: callIndex,
              },
            });
          }
        }
      } catch {
        // Skip unparseable frames
      }
    }
    return out;
  }
}
