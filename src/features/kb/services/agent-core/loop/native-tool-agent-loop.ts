import { createAssistantMessage, createSystemMessage, createToolMessage, createUserMessage, type AgentMessage, type AgentToolCall } from "../messages/agent-message";
import { compactAgentMessages } from "../messages/message-compactor";
import { filterStaleToolCalls } from "../messages/message-normalizer";
import type { ProviderAdapter } from "../providers/provider-adapter";
import type { NativeToolRegistry } from "../tools/native-tool-registry";
import { AgentSession } from "../session/agent-session";
import { RegisteredConfirmationBridge, type ToolConfirmationBridge } from "../permissions/confirmation-bridge";
import { dispatchToolCalls } from "./dispatch-tool-calls";
import type { AgentStreamEvent } from "./stream-event";
import { StormBreaker } from "./storm-breaker";

export interface NativeToolAgentLoopResult {
  status: "answer_ready" | "failed" | "cancelled";
  answer: string;
  steps: number;
  messages: AgentMessage[];
  errorCode?: string;
  errorMessage?: string;
}

export interface NativeToolAgentLoopOptions {
  provider: ProviderAdapter;
  toolRegistry: NativeToolRegistry;
  session?: AgentSession;
  conversationId?: string;
  systemPrompt: string;
  contextInstructions?: string;
  maxToolCalls?: number;
  /** Confirmation bridge — defaults to RegisteredConfirmationBridge (singleton). */
  bridge?: ToolConfirmationBridge;
  /** Tool names that skip confirmation dialog (still go through preview & safety guards). */
  autoAllowedToolNames?: string[];
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
}

export class NativeToolAgentLoop {
  private readonly session: AgentSession;
  private readonly bridge: ToolConfirmationBridge;
  private readonly stormBreaker = new StormBreaker();

  constructor(private readonly options: NativeToolAgentLoopOptions) {
    const id = options.conversationId ?? `conv_${Date.now()}`;
    this.session = options.session ?? new AgentSession(id);
    this.bridge = options.bridge ?? new RegisteredConfirmationBridge();
  }

  async run(question: string): Promise<NativeToolAgentLoopResult> {
    const maxToolCalls = this.options.maxToolCalls ?? 10;
    let steps = 0;
    let totalToolCalls = 0;
    let iteration = 0;

    this.session.append(createUserMessage(question));

    while (true) {
      if (this.options.abortSignal?.aborted) {
        this.options.onEvent?.({ type: "done", status: "cancelled" });
        return {
          status: "cancelled",
          answer: "",
          steps,
          messages: this.session.snapshot(),
          errorCode: "user_aborted",
          errorMessage: "User aborted the turn.",
        };
      }

      const messages = this.buildProviderMessages();
      const tools = this.options.toolRegistry.listProviderVisible();
      let answer = "";
      let reasoning = "";
      const toolCalls: AgentToolCall[] = [];
      const emittedToolCallDeltas = new Set<string>();
      let emittedTextLive = false;
      let emittedReasoningLive = false;

      for await (const event of this.options.provider.streamChat({
        messages,
        tools,
        abortSignal: this.options.abortSignal,
      })) {
        if (event.type === "text_delta") {
          answer += event.delta;
          emittedTextLive = true;
          this.options.onEvent?.({ type: "assistant_text_delta", delta: event.delta, fullContent: answer });
        } else if (event.type === "reasoning_delta") {
          reasoning += event.delta;
          emittedReasoningLive = true;
          this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: event.delta, fullReasoning: reasoning });
        } else if (event.type === "tool_call_delta") {
          const deltaKey = event.id || `idx-${event.index}`;
          if (!emittedToolCallDeltas.has(deltaKey)) {
            emittedToolCallDeltas.add(deltaKey);
            this.options.onEvent?.({
              type: "tool_call_delta",
              call: {
                index: event.index,
                id: event.id,
                name: event.name,
                arguments: event.argumentsDelta,
              },
            });
          }
        } else if (event.type === "tool_call_done") {
          toolCalls.push(event.toolCall);
        } else if (event.type === "error") {
          throw event.error;
        }
      }

      if (toolCalls.length > 0) {
        // Check limit BEFORE appending — if exceeded, append assistant + failure
        // tool results for every call to maintain valid tool-call pairing.
        const wouldExceed = totalToolCalls + toolCalls.length > maxToolCalls;

        // Tool-planning iteration: if we streamed reasoning/text live, reset both.
        if (emittedTextLive) {
          this.options.onEvent?.({ type: "assistant_text_reset" });
        }
        if (emittedReasoningLive) {
          this.options.onEvent?.({ type: "assistant_reasoning_reset" });
        }

        if (wouldExceed) {
          this.session.append(createAssistantMessage({
            content: answer,
            toolCalls,
          }));

          // Append a failure role=tool message for every tool call to maintain pairing
          for (const call of toolCalls) {
            this.session.append(createToolMessage({
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify({
                ok: false,
                errorCode: "tool_call_limit_reached",
                message: "工具调用次数达到本轮安全上限，本轮已停止。",
              }),
            }));
          }

          this.options.onEvent?.({
            type: "error",
            code: "tool_call_limit_reached",
            message: "The agent exceeded the tool call limit.",
          });
          return {
            status: "failed",
            answer,
            steps,
            messages: this.session.snapshot(),
            errorCode: "tool_call_limit_reached",
            errorMessage: "The agent exceeded the tool call limit.",
          };
        }

        this.session.append(createAssistantMessage({
          content: answer,
          toolCalls,
        }));
      } else {
        // Final answer: if content was not streamed live, do fallback send.
        if (!emittedReasoningLive && reasoning) {
          this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: reasoning, fullReasoning: reasoning });
        }
        if (!emittedTextLive && answer) {
          this.options.onEvent?.({ type: "assistant_text_delta", delta: answer, fullContent: answer });
        }
        this.session.append(createAssistantMessage({
          content: answer,
          toolCalls,
          ...(reasoning ? { reasoning } : {}),
        }));
        this.options.onEvent?.({ type: "assistant_final", answer });
        this.options.onEvent?.({ type: "done", status: "answer_ready" });
        return {
          status: "answer_ready",
          answer,
          steps,
          messages: this.session.snapshot(),
        };
      }

      totalToolCalls += toolCalls.length;

      const dispatch = await dispatchToolCalls({
        calls: toolCalls,
        registry: this.options.toolRegistry,
        ctx: {
          question,
          callCounts: this.buildCallCounts(),
          abortSignal: this.options.abortSignal,
        },
        stepOffset: steps,
        bridge: this.bridge,
        autoAllowedToolNames: this.options.autoAllowedToolNames,
        stormBreaker: this.stormBreaker,
        onEvent: this.options.onEvent,
      });
      steps += dispatch.stepCount;
      this.session.appendMany(dispatch.toolMessages);
      iteration += 1;
    }
  }

  private buildProviderMessages(): AgentMessage[] {
    const prefix = [
      createSystemMessage(this.options.systemPrompt),
      ...(this.options.contextInstructions ? [createSystemMessage(this.options.contextInstructions)] : []),
    ];
    const compacted = compactAgentMessages([...prefix, ...this.session.snapshot()]);
    // Filter historical tool_calls for tools no longer in the current registry.
    // Prevents the provider from re-attempting deprecated tools like
    // read_attribute_view_stats or batch_update_attribute_view_cells.
    const availableNames = new Set(
      this.options.toolRegistry.listProviderVisible().map((t) => t.name),
    );
    return filterStaleToolCalls(compacted, availableNames);
  }

  private buildCallCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const message of this.session.snapshot()) {
      if (message.role !== "tool") continue;
      counts[message.name] = (counts[message.name] ?? 0) + 1;
    }
    return counts;
  }
}
