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
  /** Maximum tool calls per turn; 0 disables this count-based limit. */
  maxToolCalls?: number;
  /** Confirmation bridge — defaults to RegisteredConfirmationBridge (singleton). */
  bridge?: ToolConfirmationBridge;
  /** Tool names that skip confirmation dialog (still go through preview & safety guards). */
  autoAllowedToolNames?: string[];
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
}

const SOFT_FINALIZATION_FATAL_CODES = new Set<string>([
  "duplicate_read_call_blocked",
  "duplicate_write_call_blocked",
  "duplicate_failed_call_blocked",
  "repeated_invalid_action_args",
  "trajectory_repetition_detected",
]);

function shouldSoftFinalizeFatalCode(code: string | undefined): code is string {
  return !!code && SOFT_FINALIZATION_FATAL_CODES.has(code);
}

const PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE = "模型输出了伪工具调用格式，已拦截，请重试或更换模型。";

const PSEUDO_TOOL_MARKUP_PATTERNS = [
  /<\s*(?:｜｜DSML｜｜|\|\|DSML\|\|)tool_calls\b[^>]*>/i,
  /<\s*(?:｜｜DSML｜｜|\|\|DSML\|\|)invoke\b/i,
  /<\s*\/\s*(?:｜｜DSML｜｜|\|\|DSML\|\|)tool_calls\s*>/i,
  /<\s*tool_calls\b[^>]*>/i,
  /<\s*\/\s*tool_calls\s*>/i,
  /<\s*invoke\s+name\s*=/i,
  /<\s*function_call\b/i,
  /<\s*\/\s*function_call\s*>/i,
  /<\s*tool_call\b/i,
  /\b(?:function_call|tool_calls)\b[\s\S]{0,240}<\s*\/?\s*(?:invoke|tool_calls|tool_call|function_call)\b/i,
];

function isPseudoToolMarkup(text: string): boolean {
  if (!text) return false;
  return PSEUDO_TOOL_MARKUP_PATTERNS.some((pattern) => pattern.test(text));
}

function buildPseudoToolMarkupRetryInstruction(): string {
  return [
    "内部重试指令：上一轮 assistant 正文包含 DSML/XML/HTML 风格的伪工具调用标记，已被运行时拦截且不会展示给用户。",
    "不得输出任何 <tool_calls>、<invoke name=...>、function_call、DSML、XML 或 HTML 风格伪工具标签。",
    "如果需要工具，必须使用 provider 原生 tool_calls 协议，由运行时调度真实工具。",
    "如果当前没有工具可调用或工具调度已停止，只能基于已有 tool_result 输出最终总结。",
    "不得把想调用的工具、参数或伪工具 XML 写成正文。",
  ].join("\n");
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
    const configuredMaxToolCalls = this.options.maxToolCalls ?? 20;
    const maxToolCalls = Number.isFinite(configuredMaxToolCalls) && configuredMaxToolCalls >= 0
      ? configuredMaxToolCalls
      : 20;
    const hasToolCallLimit = maxToolCalls > 0;
    let steps = 0;
    let totalToolCalls = 0;
    let pseudoToolMarkupRetryCount = 0;

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
      let pseudoToolMarkupDetected = false;

      for await (const event of this.options.provider.streamChat({
        messages,
        tools,
        abortSignal: this.options.abortSignal,
      })) {
        if (event.type === "text_delta") {
          answer += event.delta;
          if (!pseudoToolMarkupDetected && isPseudoToolMarkup(answer)) {
            pseudoToolMarkupDetected = true;
            if (emittedTextLive) {
              this.options.onEvent?.({ type: "assistant_text_reset" });
            }
          }
          if (!pseudoToolMarkupDetected) {
            emittedTextLive = true;
            this.options.onEvent?.({ type: "assistant_text_delta", delta: event.delta, fullContent: answer });
          }
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
        const wouldExceed = hasToolCallLimit && totalToolCalls + toolCalls.length > maxToolCalls;

        // Tool-planning iteration: if we streamed reasoning/text live, reset both.
        if (emittedTextLive || pseudoToolMarkupDetected) {
          this.options.onEvent?.({ type: "assistant_text_reset" });
        }
        if (emittedReasoningLive) {
          this.options.onEvent?.({ type: "assistant_reasoning_reset" });
        }

        if (wouldExceed) {
          this.session.append(createAssistantMessage({
            content: pseudoToolMarkupDetected ? "" : answer,
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
                message: `工具调用次数达到本轮安全上限（当前 ${maxToolCalls} 次），本轮已停止。`,
              }),
            }));
          }

          this.options.onEvent?.({
            type: "error",
            code: "tool_call_limit_reached",
            message: `The agent exceeded the tool call limit (${maxToolCalls}).`,
          });
          return {
            status: "failed",
            answer,
            steps,
            messages: this.session.snapshot(),
            errorCode: "tool_call_limit_reached",
            errorMessage: `The agent exceeded the tool call limit (${maxToolCalls}).`,
          };
        }

        this.session.append(createAssistantMessage({
          content: pseudoToolMarkupDetected ? "" : answer,
          toolCalls,
        }));
      } else {
        if (pseudoToolMarkupDetected || isPseudoToolMarkup(answer)) {
          if (emittedTextLive || !pseudoToolMarkupDetected) {
            this.options.onEvent?.({ type: "assistant_text_reset" });
          }
          if (pseudoToolMarkupRetryCount < 1) {
            pseudoToolMarkupRetryCount += 1;
            this.session.append(createSystemMessage(buildPseudoToolMarkupRetryInstruction()));
            continue;
          }
          return this.finishWithPseudoToolMarkupBlocked({
            steps,
            reasoning,
          });
        }
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

      // Check for fatal errors that should stop the turn immediately
      // while preserving valid tool-call pairing.
      if (dispatch.fatalErrorCode) {
        if (shouldSoftFinalizeFatalCode(dispatch.fatalErrorCode)) {
          return this.softFinalizeAfterToolStop({
            code: dispatch.fatalErrorCode,
            message: dispatch.fatalErrorMessage,
            steps,
          });
        }
        this.options.onEvent?.({
          type: "error",
          code: dispatch.fatalErrorCode,
          message: dispatch.fatalErrorMessage ?? "",
        });
        return {
          status: "failed",
          answer,
          steps,
          messages: this.session.snapshot(),
          errorCode: dispatch.fatalErrorCode,
          errorMessage: dispatch.fatalErrorMessage ?? "Unknown fatal error.",
        };
      }

    }
  }

  private async softFinalizeAfterToolStop(params: {
    code: string;
    message?: string;
    steps: number;
  }): Promise<NativeToolAgentLoopResult> {
    if (this.options.abortSignal?.aborted) {
      this.options.onEvent?.({ type: "done", status: "cancelled" });
      return {
        status: "cancelled",
        answer: "",
        steps: params.steps,
        messages: this.session.snapshot(),
        errorCode: "user_aborted",
        errorMessage: "User aborted the turn.",
      };
    }

    this.session.append(createSystemMessage([
      "内部停止指令：工具调度已触发重复或无效调用保护。",
      `停止原因：${params.code}${params.message ? `；${params.message}` : ""}`,
      "不得再调用任何工具。只能基于上方已有 tool_result 输出最终总结。",
      "不得输出任何 <tool_calls>、<invoke name=...>、function_call、DSML、XML 或 HTML 风格伪工具标签。",
      "不得把想调用的工具、参数或伪工具 XML 写成正文。",
      "当前没有工具可调用时，只能基于已有 tool_result 总结。",
      "如果这是测试报告，必须区分：当前轮真实通过、当前轮失败、用户拒绝、历史结果、未本轮测试/未验证。",
      "只调用 agent_tool_help.list_actions 或 describe_action 只能说明已查看工具说明，不能说明 action 已测试或通过。",
    ].join("\n")));

    const messages = this.buildProviderMessages();
    let answer = "";
    let reasoning = "";
    let emittedTextLive = false;
    let emittedReasoningLive = false;
    let pseudoToolMarkupDetected = false;

    for await (const event of this.options.provider.streamChat({
      messages,
      tools: [],
      abortSignal: this.options.abortSignal,
    })) {
      if (event.type === "text_delta") {
        answer += event.delta;
        if (!pseudoToolMarkupDetected && isPseudoToolMarkup(answer)) {
          pseudoToolMarkupDetected = true;
          if (emittedTextLive) {
            this.options.onEvent?.({ type: "assistant_text_reset" });
          }
        }
        if (!pseudoToolMarkupDetected) {
          emittedTextLive = true;
          this.options.onEvent?.({ type: "assistant_text_delta", delta: event.delta, fullContent: answer });
        }
      } else if (event.type === "reasoning_delta") {
        reasoning += event.delta;
        emittedReasoningLive = true;
        this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: event.delta, fullReasoning: reasoning });
      } else if (event.type === "error") {
        throw event.error;
      }
    }

    if (pseudoToolMarkupDetected || isPseudoToolMarkup(answer)) {
      if (emittedTextLive || !pseudoToolMarkupDetected) {
        this.options.onEvent?.({ type: "assistant_text_reset" });
      }
      return this.finishWithPseudoToolMarkupBlocked({
        steps: params.steps,
        reasoning,
      });
    }

    if (!emittedReasoningLive && reasoning) {
      this.options.onEvent?.({ type: "assistant_reasoning_delta", delta: reasoning, fullReasoning: reasoning });
    }
    if (!emittedTextLive && answer) {
      this.options.onEvent?.({ type: "assistant_text_delta", delta: answer, fullContent: answer });
    }

    this.session.append(createAssistantMessage({
      content: answer,
      ...(reasoning ? { reasoning } : {}),
    }));
    this.options.onEvent?.({ type: "assistant_final", answer });
    this.options.onEvent?.({ type: "done", status: "answer_ready" });
    return {
      status: "answer_ready",
      answer,
      steps: params.steps,
      messages: this.session.snapshot(),
    };
  }

  private finishWithPseudoToolMarkupBlocked(params: {
    steps: number;
    reasoning?: string;
  }): NativeToolAgentLoopResult {
    const answer = PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE;
    this.options.onEvent?.({ type: "assistant_text_delta", delta: answer, fullContent: answer });
    this.session.append(createAssistantMessage({
      content: answer,
      ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    }));
    this.options.onEvent?.({ type: "assistant_final", answer });
    this.options.onEvent?.({ type: "done", status: "answer_ready" });
    return {
      status: "answer_ready",
      answer,
      steps: params.steps,
      messages: this.session.snapshot(),
      errorCode: "pseudo_tool_markup_blocked",
      errorMessage: PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE,
    };
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
