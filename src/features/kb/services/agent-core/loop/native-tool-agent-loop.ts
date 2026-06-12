import { createAssistantMessage, createSystemMessage, createUserMessage, type AgentMessage, type AgentToolCall } from "../messages/agent-message";
import { compactAgentMessages } from "../messages/message-compactor";
import type { ProviderAdapter } from "../providers/provider-adapter";
import type { NativeToolRegistry } from "../tools/native-tool-registry";
import { AgentSession } from "../session/agent-session";
import { RegisteredConfirmationBridge, type ToolConfirmationBridge } from "../permissions/confirmation-bridge";
import { dispatchToolCalls } from "./dispatch-tool-calls";
import { DEFAULT_AGENT_MAX_ITERATIONS, DEFAULT_AGENT_MAX_TOOL_CALLS_PER_TURN } from "./loop-limits";
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
  maxIterations?: number;
  maxToolCalls?: number;
  /** Confirmation bridge — defaults to RegisteredConfirmationBridge (singleton). */
  bridge?: ToolConfirmationBridge;
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
    const maxIterations = this.options.maxIterations ?? DEFAULT_AGENT_MAX_ITERATIONS;
    const maxToolCalls = this.options.maxToolCalls ?? DEFAULT_AGENT_MAX_TOOL_CALLS_PER_TURN;
    let steps = 0;
    let totalToolCalls = 0;

    this.session.append(createUserMessage(question));

    for (let iteration = 0; iteration < maxIterations; iteration++) {
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
      const hasExecutedTools = totalToolCalls > 0;
      const emittedToolCallDeltas = new Set<string>();

      for await (const event of this.options.provider.streamChat({
        messages,
        tools,
        abortSignal: this.options.abortSignal,
      })) {
        if (event.type === "text_delta") {
          answer += event.delta;
          if (hasExecutedTools) {
            this.options.onEvent?.({ type: "assistant_text_delta", delta: event.delta, fullContent: answer });
          }
        } else if (event.type === "reasoning_delta") {
          reasoning += event.delta;
          if (hasExecutedTools) {
            this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: event.delta, fullReasoning: reasoning });
          }
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
        // Tool-planning iteration: if we streamed reasoning/text live, reset both.
        if (hasExecutedTools) {
          this.options.onEvent?.({ type: "assistant_reasoning_reset" });
          this.options.onEvent?.({ type: "assistant_text_reset" });
        }
        this.session.append(createAssistantMessage({
          content: answer,
          toolCalls,
        }));
      } else {
        // Final answer: if first iteration (never executed tools), replay buffered content.
        if (!hasExecutedTools) {
          if (reasoning) {
            this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: reasoning, fullReasoning: reasoning });
          }
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
      if (totalToolCalls > maxToolCalls) {
        this.options.onEvent?.({
          type: "error",
          code: "tool_call_limit_exceeded",
          message: "The agent exceeded the tool call limit.",
        });
        return {
          status: "failed",
          answer,
          steps,
          messages: this.session.snapshot(),
          errorCode: "tool_call_limit_exceeded",
          errorMessage: "The agent exceeded the tool call limit.",
        };
      }

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
        stormBreaker: this.stormBreaker,
        onEvent: this.options.onEvent,
      });
      steps += dispatch.stepCount;
      this.session.appendMany(dispatch.toolMessages);
    }

    this.options.onEvent?.({
      type: "error",
      code: "iteration_limit_exceeded",
      message: "The agent reached the iteration limit before producing a final answer.",
    });
    return {
      status: "failed",
      answer: "",
      steps,
      messages: this.session.snapshot(),
      errorCode: "iteration_limit_exceeded",
      errorMessage: "The agent reached the iteration limit before producing a final answer.",
    };
  }

  private buildProviderMessages(): AgentMessage[] {
    const prefix = [
      createSystemMessage(this.options.systemPrompt),
      ...(this.options.contextInstructions ? [createSystemMessage(this.options.contextInstructions)] : []),
    ];
    return compactAgentMessages([...prefix, ...this.session.snapshot()]);
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
