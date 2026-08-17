import { createAssistantMessage, createSystemMessage, createToolMessage, createUserMessage, type AgentMessage, type AgentToolCall } from "../messages/agent-message";
import { compactAgentMessages } from "../messages/message-compactor";
import { filterStaleToolCalls } from "../messages/message-normalizer";
import { parseToolResultContentEnvelope } from "../tools/tool-execution-result";
import type { ProviderAdapter } from "../providers/provider-adapter";
import { classifyProviderFinishReason } from "../providers/provider-finish-reason";
import type { NativeToolRegistry } from "../tools/native-tool-registry";
import { AgentSession } from "../session/agent-session";
import type { AgentRecoveryContext, AgentRunCheckpoint, AgentRunCheckpointPhase, AgentSuccessfulWriteGuard } from "../session/agent-run-checkpoint";
import { RegisteredConfirmationBridge, type ToolConfirmationBridge } from "../permissions/confirmation-bridge";
import { dispatchToolCalls } from "./dispatch-tool-calls";
import type { AgentStreamEvent } from "./stream-event";
import { StormBreaker } from "./storm-breaker";
import {
  buildUnfinishedAgentOutputRetryInstruction,
  inspectUnfinishedAgentOutput,
  type UnfinishedAgentOutputDiagnostic,
} from "./unfinished-agent-output";
import {
  createAgentRunIdentity,
  type AgentRunIdentity,
  type AgentTokenUsage,
} from "../../../../agent-platform/agent-run-protocol";
import { addAgentTokenUsage, mergeLatestAgentTokenUsage } from "../providers/provider-usage";

export interface NativeToolAgentLoopResult {
  status: "answer_ready" | "failed" | "cancelled";
  answer: string;
  steps: number;
  messages: AgentMessage[];
  errorCode?: string;
  errorMessage?: string;
  identity: AgentRunIdentity;
  usage?: AgentTokenUsage;
  providerRequestCount: number;
}

export interface NativeToolAgentLoopOptions {
  provider: ProviderAdapter;
  toolRegistry: NativeToolRegistry;
  session?: AgentSession;
  conversationId?: string;
  identity?: AgentRunIdentity;
  systemPrompt: string;
  contextInstructions?: string;
  /** Maximum tool calls per turn; 0 disables this count-based limit. */
  maxToolCalls?: number;
  /** Confirmation bridge — defaults to RegisteredConfirmationBridge (singleton). */
  bridge?: ToolConfirmationBridge;
  /** Tool names that skip confirmation dialog (still go through preview & safety guards). */
  autoAllowedToolNames?: string[];
  unattendedWritePolicy?: "deny" | "safe";
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
  /** 返回重写指令时丢弃当前草稿并重新生成一次最终回答。 */
  validateFinalAnswer?: (answer: string) => string | undefined;
  /** 当前 run 的安全恢复边界；调用方负责最小化后持久化。 */
  onCheckpoint?: (checkpoint: AgentRunCheckpoint) => void;
  /** 当前恢复请求的序号；旧检查点没有该字段时由调用方按 1 开始。 */
  resumeAttempt?: number;
  /** 恢复时沿用检查点的累计步数，避免恢复检查点出现步数倒退。 */
  resumeStepIndex?: number;
  /** 上一次失败的安全结构化上下文，仅用于构造本次 transient recovery instruction。 */
  resumeContext?: AgentRecoveryContext;
  /** 从安全 Checkpoint 恢复的成功写入 Guard，不包含原始 args。 */
  successfulWriteGuards?: AgentSuccessfulWriteGuard[];
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

const PROVIDER_EMPTY_RESPONSE_RETRY_INSTRUCTION = [
  "内部恢复指令：上一请求没有返回任何可执行的原生工具调用或非空正文。",
  "请根据当前已有的 user message 和 tool_result 继续任务。",
  "下一次响应必须二选一：发出合法的 provider native tool_call，或返回非空的最终正文。",
  "不能只描述计划，也不能返回空响应。",
].join("\n");

const SAFE_RECOVERY_ARG_KEYS = new Set([
  "action", "operation", "id", "ids", "docId", "docIds", "blockId", "blockIds",
  "notebook", "notebookId", "recordId", "accountId", "widgetId", "type", "expectedUpdatedAt",
]);

const RECOVERY_TARGET_ID_KEYS = new Set([
  "id", "ids", "docId", "docIds", "blockId", "blockIds", "notebookId", "recordId", "accountId", "widgetId",
]);

function sanitizeRecoveryText(value: unknown, maxChars = 240): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const sanitized = value
    .trim()
    .replace(/\b(token|api[_-]?key|secret|password|authorization|cookie)\s*[:=]\s*[^\s&,"']+/gi, "$1=[redacted]")
    .replace(/[A-Za-z]:[\\/][^\s,;]+/g, "[path]");
  return sanitized.length > maxChars ? `${sanitized.slice(0, maxChars - 3)}...` : sanitized;
}

function safeRecoveryValue(value: unknown): string | number | boolean | string[] | undefined {
  if (typeof value === "string") return sanitizeRecoveryText(value, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const values = value
      .map((item) => sanitizeRecoveryText(item, 120))
      .filter((item): item is string => !!item);
    return values.length > 0 ? values.slice(0, 8) : undefined;
  }
  return undefined;
}

function buildAgentRecoveryContext(messages: readonly AgentMessage[]): AgentRecoveryContext | undefined {
  const toolResultsByCallId = new Map<string, {
    message: AgentMessage;
    parsed: NonNullable<ReturnType<typeof parseToolResultContentEnvelope>>;
    index: number;
  }>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "tool") continue;
    const parsed = parseToolResultContentEnvelope(message.content);
    if (parsed) toolResultsByCallId.set(message.toolCallId, { message, parsed, index });
  }

  let latestToolBatch: { message: Extract<AgentMessage, { role: "assistant" }>; index: number } | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.toolCalls?.length) {
      latestToolBatch = { message, index };
      break;
    }
  }
  if (!latestToolBatch) return undefined;

  const failures = latestToolBatch.message.toolCalls
    .map((call) => {
      const result = toolResultsByCallId.get(call.id);
      if (!result || result.parsed.ok !== false || result.index <= latestToolBatch!.index) return undefined;
      return { call, result };
    })
    .filter((item): item is {
      call: AgentToolCall;
      result: {
        message: AgentMessage;
        parsed: NonNullable<ReturnType<typeof parseToolResultContentEnvelope>> & { ok: false };
        index: number;
      };
    } => !!item)
    .sort((a, b) => a.result.index - b.result.index);
  const failure = failures[failures.length - 1];
  if (!failure || failure.result.message.role !== "tool") return undefined;

  let rawArgs: Record<string, unknown> = {};
  try {
    const value = JSON.parse(failure.call.arguments);
    if (value && typeof value === "object" && !Array.isArray(value)) rawArgs = value as Record<string, unknown>;
  } catch { /* 参数损坏时只保留失败结果的安全字段。 */ }
  const nestedArgs = rawArgs.args && typeof rawArgs.args === "object" && !Array.isArray(rawArgs.args)
    ? rawArgs.args as Record<string, unknown>
    : rawArgs;
  const parsed = failure.result.parsed;
  const details = parsed.details && typeof parsed.details === "object" && !Array.isArray(parsed.details)
    ? parsed.details as Record<string, unknown>
    : {};
  const action = typeof rawArgs.action === "string"
    ? rawArgs.action
    : typeof nestedArgs.action === "string" ? nestedArgs.action : undefined;
  const errorCode = parsed.code ?? parsed.errorCode ?? parsed.previousErrorCode;
  const errorMessage = parsed.message ?? parsed.previousErrorMessage ?? parsed.summary;
  const field = parsed.field ?? details.field;
  const hint = parsed.hint ?? details.hint;
  const safeArgs: Record<string, string | number | boolean | string[]> = {};
  const targetIds: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(nestedArgs)) {
    if (!SAFE_RECOVERY_ARG_KEYS.has(key)) continue;
    const safeValue = safeRecoveryValue(value);
    if (safeValue !== undefined) safeArgs[key] = safeValue;
    if (RECOVERY_TARGET_ID_KEYS.has(key) && (typeof safeValue === "string" || Array.isArray(safeValue))) {
      targetIds[key] = safeValue;
    }
  }

  return {
    toolName: failure.result.message.name,
    ...(action ? { action } : {}),
    ...(typeof errorCode === "string" ? { errorCode: sanitizeRecoveryText(errorCode, 80) } : {}),
    ...(sanitizeRecoveryText(errorMessage, 240) ? { message: sanitizeRecoveryText(errorMessage, 240) } : {}),
    ...(sanitizeRecoveryText(field, 80) ? { field: sanitizeRecoveryText(field, 80) } : {}),
    ...(sanitizeRecoveryText(hint, 240) ? { hint: sanitizeRecoveryText(hint, 240) } : {}),
    ...(sanitizeRecoveryText(parsed.nextStep, 240) ? { nextStep: sanitizeRecoveryText(parsed.nextStep, 240) } : {}),
    ...(Object.keys(safeArgs).length > 0 ? { safeArgs } : {}),
    ...(Object.keys(targetIds).length > 0 ? { targetIds } : {}),
  };
}

function buildResumeInstruction(context: AgentRecoveryContext | undefined): string {
  const parameterRepairInstruction = context?.errorCode === "invalid_action_args"
    ? "当前失败上下文标记为 invalid_action_args，应依据已有 errorCode、field、message、hint 修正参数。"
    : "如果失败涉及参数 Contract，应依据当前安全结构化上下文修正参数。";
  return [
    "Runtime Recovery Instruction（仅本次从已确认安全的 Agent Checkpoint 恢复请求生效，不是新的用户消息，也不要修改原 user message）：",
    "已成功完成的写操作绝对不得重复执行，即使恢复后模型再次提出完全相同的调用；duplicate_write_call_blocked、duplicate_failed_call_blocked 对应的调用不得用原参数再次执行。",
    "已有完整结果的只读调用应优先复用；如果 Checkpoint 只保留了摘要、正文已被安全压缩，或继续任务确实需要当前状态，可以重新执行安全只读调用。当前恢复 Loop 内仍不得无意义重复相同只读调用。",
    `必须检查最近的失败 tool_result；${parameterRepairInstruction}`,
    "如果参数 Contract 不明确，可以先调用 agent_tool_help。",
    "如果任务已经无法继续，应输出明确、非空的最终说明。",
    "下一步必须二选一：发出合法的 provider native tool_call，或返回非空的最终正文。不得只描述‘接下来要做什么’而不实际调用工具，也不得返回空响应。",
    ...(context ? [`最近失败的安全结构化上下文：${JSON.stringify(context)}`] : []),
  ].join("\n");
}

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
  private readonly identity: AgentRunIdentity;
  private currentResumeAttempt = 0;
  private totalUsage: AgentTokenUsage | undefined;
  private providerRequestCount = 0;

  constructor(private readonly options: NativeToolAgentLoopOptions) {
    const id = options.conversationId ?? `conv_${Date.now()}`;
    this.session = options.session ?? new AgentSession(id);
    this.bridge = options.bridge ?? new RegisteredConfirmationBridge();
    this.identity = options.identity ?? createAgentRunIdentity({ sessionId: id });
    this.stormBreaker.hydrateSuccessfulWriteGuards(options.successfulWriteGuards);
  }

  async run(question: string): Promise<NativeToolAgentLoopResult> {
    return this.start(question, true, undefined, 0);
  }

  async resume(): Promise<NativeToolAgentLoopResult> {
    const question = [...this.session.snapshot()].reverse().find((message) => message.role === "user")?.content;
    if (!question) {
      return {
        status: "failed",
        answer: "",
        steps: 0,
        messages: this.session.snapshot(),
        errorCode: "resume_checkpoint_invalid",
        errorMessage: "恢复检查点中没有用户问题。",
        identity: this.identity,
        providerRequestCount: 0,
      };
    }
    const resumeAttempt = Math.max(1, this.options.resumeAttempt ?? 1);
    return this.start(question, false, buildResumeInstruction(this.options.resumeContext), resumeAttempt);
  }

  private async start(
    question: string,
    appendUser: boolean,
    initialTransientInstruction: string | undefined,
    resumeAttempt: number,
  ): Promise<NativeToolAgentLoopResult> {
    this.currentResumeAttempt = resumeAttempt;
    this.options.onEvent?.({
      type: "run_started",
      identity: this.identity,
      providerId: this.options.provider.id,
      requestTimeoutMs: this.options.provider.requestTimeoutMs,
    });
    const result = await this.runInternal(question, appendUser, initialTransientInstruction);
    return {
      ...result,
      identity: this.identity,
      usage: this.totalUsage,
      providerRequestCount: this.providerRequestCount,
    };
  }

  private async runInternal(
    question: string,
    appendUser: boolean,
    initialTransientInstruction?: string,
  ): Promise<Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount">> {
    const configuredMaxToolCalls = this.options.maxToolCalls ?? 20;
    const maxToolCalls = Number.isFinite(configuredMaxToolCalls) && configuredMaxToolCalls >= 0
      ? configuredMaxToolCalls
      : 20;
    const hasToolCallLimit = maxToolCalls > 0;
    let steps = this.options.resumeStepIndex ?? 0;
    let totalToolCalls = 0;
    let pseudoToolMarkupRetryCount = 0;
    let finalAnswerValidationRetryCount = 0;
    let unfinishedOutputRetryCount = 0;
    let emptyResponseRetryCount = 0;
    let requireToolCallForNextTurn = false;
    let nextTransientInstruction = initialTransientInstruction;
    if (appendUser) this.session.append(createUserMessage(question));

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

      this.emitCheckpoint("before_model", steps);
      const messages = this.buildProviderMessages(nextTransientInstruction);
      nextTransientInstruction = undefined;
      const tools = this.options.toolRegistry.listProviderVisible();
      const toolChoice = requireToolCallForNextTurn && this.options.provider.capabilities.requiredToolChoice
        ? "required" as const
        : "auto" as const;
      if (tools.length > 0 && !this.options.provider.capabilities.nativeToolCalls) {
        return this.finishWithUnsupportedProviderCapability("provider_native_tools_unsupported", steps);
      }
      requireToolCallForNextTurn = false;
      let answer = "";
      let reasoning = "";
      const toolCalls: AgentToolCall[] = [];
      const emittedToolCallDeltas = new Set<string>();
      let emittedTextLive = false;
      let emittedReasoningLive = false;
      let pseudoToolMarkupDetected = false;
      let streamedOutputDefect: UnfinishedAgentOutputDiagnostic | undefined;
      let lastOutputInspectionAt = 0;
      let finishReason: string | undefined;
      let stepUsage: AgentTokenUsage | undefined;
      const modelStepIndex = ++this.providerRequestCount;
      this.options.onEvent?.({ type: "model_started", modelStepIndex, providerId: this.options.provider.id });

      for await (const event of this.options.provider.streamChat({
        messages,
        tools,
        toolChoice,
        abortSignal: this.options.abortSignal,
      })) {
        if (event.type === "usage") {
          stepUsage = mergeLatestAgentTokenUsage(stepUsage, event.usage);
        } else if (event.type === "text_delta") {
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
          if (
            !pseudoToolMarkupDetected
            && answer.length - lastOutputInspectionAt >= 512
          ) {
            lastOutputInspectionAt = answer.length;
            const diagnostic = inspectUnfinishedAgentOutput(answer, { toolsAvailable: tools.length > 0 });
            if (diagnostic?.reason === "repetitive_output") {
              streamedOutputDefect = diagnostic;
              break;
            }
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
        } else if (event.type === "done" && event.finishReason) {
          finishReason = event.finishReason;
        }
      }
      this.recordStepUsage(modelStepIndex, stepUsage);

      const finishKind = classifyProviderFinishReason(finishReason);
      if (finishKind === "aborted") {
        this.options.onEvent?.({ type: "done", status: "cancelled" });
        return {
          status: "cancelled",
          answer,
          steps,
          messages: this.session.snapshot(),
          errorCode: "user_aborted",
          errorMessage: "User aborted the turn.",
        };
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
        const unfinishedOutput = streamedOutputDefect
          ?? inspectUnfinishedAgentOutput(answer, { toolsAvailable: tools.length > 0 });
        if (unfinishedOutput) {
          if (emittedTextLive) {
            this.options.onEvent?.({ type: "assistant_text_reset" });
          }
          if (emittedReasoningLive) {
            this.options.onEvent?.({ type: "assistant_reasoning_reset" });
          }
          if (unfinishedOutputRetryCount < 1) {
            unfinishedOutputRetryCount += 1;
            requireToolCallForNextTurn = tools.length > 0 && unfinishedOutput.forceToolCall;
            this.options.onEvent?.({
              type: "notice",
              message: unfinishedOutput.reason === "repetitive_output"
                ? "检测到模型输出重复退化内容，已清除草稿并自动重试。"
                : "检测到模型只描述了下一步但没有实际调用工具，已清除草稿并强制重试工具调用。",
            });
            this.session.append(createSystemMessage(
              buildUnfinishedAgentOutputRetryInstruction(unfinishedOutput),
            ));
            continue;
          }
          return this.finishWithUnfinishedAgentOutput({
            diagnostic: unfinishedOutput,
            finishReason,
            steps,
          });
        }
        if (!answer.trim()) {
          if (emittedReasoningLive) {
            this.options.onEvent?.({ type: "assistant_reasoning_reset" });
          }
          if (emptyResponseRetryCount < 1) {
            emptyResponseRetryCount += 1;
            this.options.onEvent?.({ type: "notice", message: "模型没有返回有效内容，正在基于已有上下文自动恢复一次。" });
            nextTransientInstruction = PROVIDER_EMPTY_RESPONSE_RETRY_INSTRUCTION;
            continue;
          }
          const message = "模型没有返回可继续执行的工具调用或有效回答，本轮已停止。";
          this.options.onEvent?.({ type: "error", code: "provider_empty_response", message });
          this.options.onEvent?.({
            type: "done",
            status: "failed",
            providerFinishReason: finishReason,
            outputChars: 0,
          });
          return {
            status: "failed",
            answer: "",
            steps,
            messages: this.session.snapshot(),
            errorCode: "provider_empty_response",
            errorMessage: message,
          };
        }
        const finalAnswerRetryInstruction = this.options.validateFinalAnswer?.(answer);
        if (finalAnswerRetryInstruction && finalAnswerValidationRetryCount < 1) {
          finalAnswerValidationRetryCount += 1;
          if (emittedTextLive) {
            this.options.onEvent?.({ type: "assistant_text_reset" });
          }
          if (emittedReasoningLive) {
            this.options.onEvent?.({ type: "assistant_reasoning_reset" });
          }
          this.options.onEvent?.({ type: "notice", message: "回答校验未通过，正在修正。" });
          this.session.append(createSystemMessage(finalAnswerRetryInstruction));
          continue;
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
        this.emitCheckpoint("final", steps);
        if (finishKind === "truncated") {
          const message = "模型达到单次输出上限，回答正文可能未结束；本轮已经完成的工具操作不受影响。";
          this.options.onEvent?.({ type: "assistant_final", answer });
          this.options.onEvent?.({
            type: "error",
            code: "provider_output_truncated",
            message,
          });
          this.options.onEvent?.({
            type: "done",
            status: "failed",
            providerFinishReason: finishReason,
            outputChars: answer.length,
          });
          return {
            status: "failed",
            answer,
            steps,
            messages: this.session.snapshot(),
            errorCode: "provider_output_truncated",
            errorMessage: message,
          };
        }
        this.options.onEvent?.({ type: "assistant_final", answer });
        this.options.onEvent?.({
          type: "done",
          status: "answer_ready",
          providerFinishReason: finishReason,
          outputChars: answer.length,
        });
        return {
          status: "answer_ready",
          answer,
          steps,
          messages: this.session.snapshot(),
        };
      }

      totalToolCalls += toolCalls.length;

      this.emitCheckpoint("before_tool", steps, toolCalls);
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
        unattendedWritePolicy: this.options.unattendedWritePolicy,
        stormBreaker: this.stormBreaker,
        onEvent: (event) => {
          if (event.type === "permission_required") {
            this.emitCheckpoint("waiting_confirmation", event.stepIndex, toolCalls);
          }
          this.options.onEvent?.(event);
        },
      });
      steps += dispatch.stepCount;
      this.session.appendMany(dispatch.toolMessages);
      this.emitCheckpoint("after_tool", steps, undefined, dispatch.sideEffectState ?? "committed");

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
          safeToReplay: dispatch.sideEffectState !== "unknown",
          sideEffectState: dispatch.sideEffectState,
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

  private finishWithUnfinishedAgentOutput(params: {
    diagnostic: UnfinishedAgentOutputDiagnostic;
    finishReason?: string;
    steps: number;
  }): Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount"> {
    const reason = params.diagnostic.reason === "repetitive_output"
      ? "repetitive_output"
      : "dangling_tool_intent";
    const message = [
      "模型连续输出了未完成的 Agent 草稿，且没有产生可执行的原生工具调用。",
      `diagnostic=${reason}`,
      `finish_reason=${params.finishReason?.trim() || "missing"}`,
      `answer_chars=${params.diagnostic.answerChars}`,
    ].join("; ");
    this.options.onEvent?.({
      type: "error",
      code: "agent_continuation_missing",
      message,
    });
    this.options.onEvent?.({
      type: "done",
      status: "failed",
      providerFinishReason: params.finishReason,
      outputChars: params.diagnostic.answerChars,
    });
    return {
      status: "failed",
      answer: "",
      steps: params.steps,
      messages: this.session.snapshot(),
      errorCode: "agent_continuation_missing",
      errorMessage: message,
    };
  }

  private async softFinalizeAfterToolStop(params: {
    code: string;
    message?: string;
    steps: number;
  }): Promise<Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount">> {
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
    let finishReason: string | undefined;
    let stepUsage: AgentTokenUsage | undefined;
    const modelStepIndex = ++this.providerRequestCount;
    this.options.onEvent?.({ type: "model_started", modelStepIndex, providerId: this.options.provider.id });

    for await (const event of this.options.provider.streamChat({
      messages,
      tools: [],
      abortSignal: this.options.abortSignal,
    })) {
      if (event.type === "usage") {
        stepUsage = mergeLatestAgentTokenUsage(stepUsage, event.usage);
      } else if (event.type === "text_delta") {
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
      } else if (event.type === "done" && event.finishReason) {
        finishReason = event.finishReason;
      }
    }
    this.recordStepUsage(modelStepIndex, stepUsage);

    const softFinishKind = classifyProviderFinishReason(finishReason);
    if (softFinishKind === "aborted") {
      this.options.onEvent?.({ type: "done", status: "cancelled" });
      return {
        status: "cancelled",
        answer,
        steps: params.steps,
        messages: this.session.snapshot(),
        errorCode: "user_aborted",
        errorMessage: "User aborted the turn.",
      };
    }
    if (softFinishKind === "truncated") {
      return this.finishSoftToolStopFallback({
        code: params.code,
        message: params.message,
        steps: params.steps,
        reasoning,
      });
    }

    if (pseudoToolMarkupDetected || isPseudoToolMarkup(answer)) {
      if (emittedTextLive || !pseudoToolMarkupDetected) {
        this.options.onEvent?.({ type: "assistant_text_reset" });
      }
      return this.finishSoftToolStopFallback({
        code: params.code,
        message: params.message,
        steps: params.steps,
        reasoning,
      });
    }

    if (!answer.trim()) {
      if (emittedReasoningLive) {
        this.options.onEvent?.({ type: "assistant_reasoning_reset" });
      }
      return this.finishSoftToolStopFallback({
        code: params.code,
        message: params.message,
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

  private finishSoftToolStopFallback(params: {
    code: string;
    message?: string;
    steps: number;
    reasoning?: string;
  }): Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount"> {
    const answer = [
      "工具调用已安全停止，没有继续执行重复请求。",
      params.message ? `原因：${params.message}` : `停止原因：${params.code}。`,
      "本轮已经成功完成的操作仍然有效；失败或被拦截的操作没有再次执行。请查看上方首次失败卡片中的原因和下一步提示，再重试未完成部分。",
    ].join("\n\n");

    this.options.onEvent?.({ type: "assistant_text_delta", delta: answer, fullContent: answer });
    this.session.append(createAssistantMessage({
      content: answer,
      ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    }));
    this.options.onEvent?.({ type: "assistant_final", answer });
    this.options.onEvent?.({
      type: "error",
      code: params.code,
      message: params.message ?? params.code,
    });
    this.options.onEvent?.({ type: "done", status: "failed" });
    return {
      status: "failed",
      answer,
      steps: params.steps,
      messages: this.session.snapshot(),
      errorCode: params.code,
      errorMessage: params.message ?? params.code,
    };
  }

  private finishWithPseudoToolMarkupBlocked(params: {
    steps: number;
    reasoning?: string;
  }): Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount"> {
    const answer = PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE;
    this.options.onEvent?.({ type: "assistant_text_delta", delta: answer, fullContent: answer });
    this.session.append(createAssistantMessage({
      content: answer,
      ...(params.reasoning ? { reasoning: params.reasoning } : {}),
    }));
    this.options.onEvent?.({ type: "assistant_final", answer });
    this.options.onEvent?.({
      type: "error",
      code: "pseudo_tool_markup_blocked",
      message: PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE,
    });
    this.options.onEvent?.({ type: "done", status: "failed" });
    return {
      status: "failed",
      answer,
      steps: params.steps,
      messages: this.session.snapshot(),
      errorCode: "pseudo_tool_markup_blocked",
      errorMessage: PSEUDO_TOOL_MARKUP_BLOCKED_MESSAGE,
    };
  }

  private finishWithUnsupportedProviderCapability(
    code: string,
    steps: number,
  ): Omit<NativeToolAgentLoopResult, "identity" | "usage" | "providerRequestCount"> {
    const message = code === "provider_native_tools_unsupported"
      ? "当前模型 Provider 不支持原生工具调用，无法运行 Agent。"
      : "当前模型 Provider 不支持强制原生工具调用，无法安全继续本轮 Agent。";
    this.options.onEvent?.({ type: "error", code, message });
    this.options.onEvent?.({ type: "done", status: "failed" });
    return {
      status: "failed",
      answer: "",
      steps,
      messages: this.session.snapshot(),
      errorCode: code,
      errorMessage: message,
    };
  }

  private recordStepUsage(modelStepIndex: number, stepUsage: AgentTokenUsage | undefined): void {
    if (!stepUsage) return;
    this.totalUsage = addAgentTokenUsage(this.totalUsage, stepUsage);
    this.options.onEvent?.({
      type: "usage",
      modelStepIndex,
      stepUsage,
      cumulativeUsage: this.totalUsage,
    });
  }

  private emitCheckpoint(
    phase: AgentRunCheckpointPhase,
    stepIndex: number,
    pendingToolCalls?: AgentToolCall[],
      sideEffectState: AgentRunCheckpoint["sideEffectState"] = phase === "after_tool" ? "committed" : "not_started",
    recoveryState?: Pick<AgentRunCheckpoint, "recoveryExhausted" | "recoveryFailureCode" | "recoveryFingerprint">,
  ): void {
    const recoveryContext = buildAgentRecoveryContext(this.session.snapshot());
    const successfulWriteGuards = this.stormBreaker.getSuccessfulWriteGuards();
    this.options.onCheckpoint?.({
      schemaVersion: 1,
      identity: this.identity,
      phase,
      stepIndex,
      messages: this.session.snapshot(),
      ...(pendingToolCalls?.length ? { pendingToolCalls } : {}),
      sideEffectState,
      ...(this.currentResumeAttempt > 0 ? { resumeAttempt: this.currentResumeAttempt } : {}),
      ...(recoveryState?.recoveryExhausted ? recoveryState : {}),
      ...(recoveryContext ? { recoveryContext } : {}),
      ...(successfulWriteGuards.length > 0 ? { successfulWriteGuards } : {}),
      createdAt: Date.now(),
    });
  }

  private buildProviderMessages(transientInstruction?: string): AgentMessage[] {
    const prefix = [
      createSystemMessage(this.options.systemPrompt),
      ...(this.options.contextInstructions ? [createSystemMessage(this.options.contextInstructions)] : []),
    ];
    const compacted = compactAgentMessages([
      ...prefix,
      ...this.session.snapshot(),
      ...(transientInstruction ? [createSystemMessage(transientInstruction)] : []),
    ]);
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
