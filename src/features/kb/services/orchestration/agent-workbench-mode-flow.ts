/**
 * Agent Workbench Mode Flow
 *
 * Agent Workbench 的 orchestration 适配层。
 *
 * 职责：
 * - 添加/复用 user message、创建 assistant pending
 * - 调用 runAgentTurn、把 composed answer 写回 assistant message
 * - 支持流式输出：onAnswerChunk 逐 chunk 更新 assistant message content
 * - 写入 agentMemory 和 citedReferences
 *
 * 重要（runtime cutover to Agent Workbench）：
 * - 真实聊天只走 Agent Workbench；不允许 switch 到其他运行时。
 * - Agent Workbench 失败时直接把安全错误呈现到当前 assistant message。
 * - 本路径只调用 Agent Workbench。
 *
 * 流程：
 *   1. trim question
 *   2. map mode
 *   3. 添加 user message
 *   4. updateState asking=true
 *   5. 创建 assistant pending
 *   6. 调用 runAgentTurn（含流式回调）
 *   7. 处理结果（abort/正常/错误）
 *   8. 等待检查点并持久化终态
 *   9. updateState asking=false
 */

import type { AskByModeParams, AskByModeResult } from "./ask-by-mode-types";
import type { ChatMode } from "../../constants/chat-modes";
import type { AssistantChatMessage, UserChatMessage } from "../../types/chat";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { AgentScopeMode } from "../agent-workbench/scope/types";
import { runAgentTurn, type AgentTurnOutcome } from "../agent-workbench/runtime/run-agent-turn";
import type { AgentTurnResult, AgentWorkbenchEvent } from "../agent-workbench";
import { buildAgentTurnMemory } from "../agent-workbench/memory/agent-turn-memory";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { runContextCompaction, selectCompactionTurns } from "../context-compression";
import { buildPromptBudget, type PromptBudget } from "../../types/context-usage";
import { getKbSettings } from "../settings/kb-settings-service";
import {
  estimateContextUsage,
  PROMPT_PRESSURE_SOURCE_LABELS,
  resolvePromptPressureSource,
  type PromptPressureSource,
} from "../../types/context-usage";
import {
  buildConversationContext,
  buildUncoveredVerbatimAgentMessages,
} from "../agent-workbench/runtime/conversation-context-builder";
import type { BuildConversationContextParams } from "../agent-workbench/runtime/conversation-context-builder";
import type { AgentMessage } from "../agent-core/messages/agent-message";
import { mapAgentErrorToUserFacing } from "../agent-workbench/runtime/user-facing-agent-error";
import type { KbSessionState } from "../../types/session";
import {
  createTurnJournal,
  checkpointTurnJournal,
  clearTurnJournalAfterPersistence,
  failTurnJournal,
  markTurnCompletedPendingPersistence,
} from "../agent-workbench/runtime/in-flight-turn-journal";
import { shouldEnqueueWorkbenchCheckpoint } from "./workbench-persistence-checkpoint-policy";
import {
  hasSettledWorkbenchTerminal,
  PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE,
} from "../agent-workbench/runtime/workbench-terminal-state";
import { stripInlineCitationMarkersForDisplay } from "../agent-workbench/runtime/inline-citation";
import {
  inspectAgentRunResume,
  type AgentRunCheckpoint,
} from "../agent-core/session/agent-run-checkpoint";
import { AgentProviderError } from "../agent-core/providers/provider-error";
import { CORE_PROVIDER_TOOL_NAMES } from "../agent-core/tools/native-tool-registry";

/**
 * Agent Workbench Mode Flow 参数
 */
export interface RunAgentWorkbenchModeFlowParams extends AskByModeParams {
  userMessageAlreadyAdded?: boolean;
  userMessageId?: string;
}

const MANUAL_STOP_MESSAGE = "已手动停止回答。";

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface FinalPreparedProviderPromptState {
  conversationContext?: ReturnType<typeof buildConversationContext>;
  contextInstructions: string;
  historicalMessages: AgentMessage[];
  manifest: import("../agent-workbench/runtime/agent-context-ledger").AgentContextManifest;
  systemPrompt: string;
  providerToolSelection?: import("../agent-core/tools/native-tool-registry").ProviderToolsetSelection;
  toolDefinitions: import("../agent-core/tools/native-tool").NativeTool[];
  registeredToolCount: number;
  toolsetReduced: boolean;
  budget: PromptBudget;
  snapshotGeneration?: number;
}

export interface PreflightCompressionResult {
  ok: boolean;
  reason?: string;
  failureCode?: "context_budget_exceeded" | "provider_toolset_budget_exceeded" | "irreducible_context_overflow";
  pressureSource?: PromptPressureSource;
  budget?: PromptBudget;
  inputTokens?: number;
  effectiveInputBudget?: number;
  breakdown?: PromptBudget["breakdown"];
  compactableCompletedTurnCount?: number;
  compactionAttempted: boolean;
  toolsetReduced: boolean;
  finalPromptState?: FinalPreparedProviderPromptState;
}

export interface RebuiltProviderPromptState {
  conversationContext?: ReturnType<typeof buildConversationContext>;
  contextInstructions: string;
  historicalMessages: AgentMessage[];
  manifest: import("../agent-workbench/runtime/agent-context-ledger").AgentContextManifest;
  systemPrompt: string;
  providerToolSelection?: import("../agent-core/tools/native-tool-registry").ProviderToolsetSelection;
  toolDefinitions: import("../agent-core/tools/native-tool").NativeTool[];
  registeredToolCount: number;
  toolsetReduced: boolean;
}

export interface ActualPromptContext {
  systemPrompt: string;
  contextInstructions: string;
  activeToolDefinitions: unknown;
  registeredToolCount?: number;
  toolsetReduced?: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  currentQuestion?: string;
  historicalMessages: AgentMessage[];
  manifest?: import("../agent-workbench/runtime/agent-context-ledger").AgentContextManifest;
  conversationContext?: ReturnType<typeof buildConversationContext>;
  providerToolSelection?: import("../agent-core/tools/native-tool-registry").ProviderToolsetSelection;
  rebuildProviderPromptState?: (
    conversationContext: ReturnType<typeof buildConversationContext>,
    historicalMessages: AgentMessage[],
    options?: { toolsetMode?: "active" | "core" },
  ) => RebuiltProviderPromptState;
  rebuildProviderContext?: (
    conversationContext: ReturnType<typeof buildConversationContext>,
    historicalMessages: AgentMessage[],
    options?: { toolsetMode?: "active" | "core" },
  ) => {
    conversationContext?: ReturnType<typeof buildConversationContext>;
    contextInstructions: string;
    historicalMessages: AgentMessage[];
    manifest: import("../agent-workbench/runtime/agent-context-ledger").AgentContextManifest;
    systemPrompt?: string;
    toolDefinitions?: import("../agent-core/tools/native-tool").NativeTool[];
    registeredToolCount?: number;
    toolsetReduced?: boolean;
    providerToolSelection?: import("../agent-core/tools/native-tool-registry").ProviderToolsetSelection;
  };
}

export async function resolvePreflightCompression(
  params: {
    getState: () => KbSessionState;
    updateState: (updater: (state: KbSessionState) => Partial<KbSessionState>) => void;
    actualPromptContext: ActualPromptContext;
    currentUserMessageId?: string;
    chatModelSelection: ChatModelSelection | null | undefined;
    abortSignal: AbortSignal | undefined;
    persistConversationNow: (() => Promise<{ success: boolean; error?: string }>) | undefined;
    runCompaction?: typeof runContextCompaction;
    buildConversationContextForState?: (state: KbSessionState, usageRatio?: number) => {
      conversationContext: ReturnType<typeof buildConversationContext>;
      historicalMessages: AgentMessage[];
    };
  }
): Promise<PreflightCompressionResult> {
  const { getState, updateState, actualPromptContext, currentUserMessageId, chatModelSelection, abortSignal, persistConversationNow } = params;
  const buildBudget = () => buildPromptBudget({
    contextWindowTokens: actualPromptContext.contextWindowTokens,
    maxOutputTokens: actualPromptContext.maxOutputTokens,
    systemPrompt: actualPromptContext.systemPrompt,
    contextInstructions: actualPromptContext.contextInstructions,
    currentQuestion: actualPromptContext.currentQuestion,
    activeToolDefinitions: actualPromptContext.activeToolDefinitions,
    providerMessages: [
      { role: "system", content: actualPromptContext.systemPrompt },
      ...(actualPromptContext.contextInstructions ? [{ role: "system", content: actualPromptContext.contextInstructions }] : []),
      ...actualPromptContext.historicalMessages,
      ...(actualPromptContext.currentQuestion
        ? [{ role: "user", content: actualPromptContext.currentQuestion }]
        : []),
    ],
    historicalMessages: actualPromptContext.historicalMessages,
    currentRunMessages: actualPromptContext.currentQuestion
      ? [{ role: "user", content: actualPromptContext.currentQuestion }]
      : [],
    providerTools: actualPromptContext.activeToolDefinitions,
  });

  let compactionAttempted = false;
  const compactConversation = params.runCompaction ?? runContextCompaction;
  let state = getState();
  let latestConversationContext = actualPromptContext.conversationContext;
  let latestManifest = actualPromptContext.manifest;
  let latestProviderToolSelection = actualPromptContext.providerToolSelection;

  const applyRebuiltContext = (rebuiltContext: {
    conversationContext: ReturnType<typeof buildConversationContext>;
    historicalMessages: AgentMessage[];
  }, options?: { toolsetMode?: "active" | "core" }) => {
    latestConversationContext = rebuiltContext.conversationContext;
    if (actualPromptContext.rebuildProviderPromptState) {
      const prepared = actualPromptContext.rebuildProviderPromptState(
        rebuiltContext.conversationContext,
        rebuiltContext.historicalMessages,
        options,
      );
      actualPromptContext.systemPrompt = prepared.systemPrompt;
      actualPromptContext.contextInstructions = prepared.contextInstructions;
      actualPromptContext.historicalMessages = prepared.historicalMessages;
      actualPromptContext.activeToolDefinitions = prepared.toolDefinitions;
      actualPromptContext.registeredToolCount = prepared.registeredToolCount;
      actualPromptContext.toolsetReduced = prepared.toolsetReduced;
      latestManifest = prepared.manifest;
      latestProviderToolSelection = prepared.providerToolSelection;
    } else if (actualPromptContext.rebuildProviderContext) {
      const prepared = actualPromptContext.rebuildProviderContext(
        rebuiltContext.conversationContext,
        rebuiltContext.historicalMessages,
        options,
      );
      actualPromptContext.contextInstructions = prepared.contextInstructions;
      actualPromptContext.historicalMessages = prepared.historicalMessages;
      latestManifest = prepared.manifest;
      if (typeof prepared.systemPrompt === "string") {
        actualPromptContext.systemPrompt = prepared.systemPrompt;
      }
      if (Array.isArray(prepared.toolDefinitions)) {
        actualPromptContext.activeToolDefinitions = prepared.toolDefinitions;
      }
      if (typeof prepared.registeredToolCount === "number") {
        actualPromptContext.registeredToolCount = prepared.registeredToolCount;
      }
      if (typeof prepared.toolsetReduced === "boolean") {
        actualPromptContext.toolsetReduced = prepared.toolsetReduced;
      }
      if (prepared.providerToolSelection) {
        latestProviderToolSelection = prepared.providerToolSelection;
      }
    }
  };

  let budget = buildBudget();
  const triggers = budget.inputTokens >= budget.hardThresholdTokens ? ["hard"] : budget.inputTokens >= budget.softThresholdTokens ? ["auto", "hard"] : [];
  for (const trigger of triggers as Array<"auto" | "hard">) {
    if (budget.inputTokens < budget.softThresholdTokens) break;
    const selection = selectCompactionTurns({
      messages: state.messages,
      previousSnapshot: state.latestCompactionSnapshot,
      currentUserMessageId,
      promptBudget: budget,
      trigger,
    });
    // Conversation compaction only handles completed history. A blank first
    // turn has no reducible input and must never invoke the compactor.
    if (selection.compactableTurns.length === 0) break;
    compactionAttempted = true;
    const result = await compactConversation({
      messages: state.messages,
      previousSnapshot: state.latestCompactionSnapshot,
      currentUserMessageId,
      promptBudget: budget,
      trigger,
      chatModelSelection,
      abortSignal,
    });
    if (result.success && result.snapshot) {
      updateState((current) => ({
        ...current,
        latestCompactionSnapshot: result.snapshot,
      }));
      state = getState();
      const rebuiltContext = params.buildConversationContextForState?.(state, budget.usageRatio);
      if (rebuiltContext) {
        applyRebuiltContext(rebuiltContext);
      }
      budget = buildBudget();
      try {
        const persisted = await persistConversationNow?.();
        if (persisted && !persisted.success) {
          pushAgentDebugEvent("CONTEXT_COMPACTION_PERSIST_FAILED", { error: persisted.error }, "warn");
        }
      } catch (error) {
        pushAgentDebugEvent("CONTEXT_COMPACTION_PERSIST_FAILED", {
          error: error instanceof Error ? error.message.slice(0, 120) : String(error),
        }, "warn");
      }
    } else {
      break;
    }
  }

  const stabilizeBudget = (
    initialBudget: PromptBudget,
    toolsetMode: "active" | "core" = "active",
  ): PromptBudget => {
    let stabilizedBudget = initialBudget;
    state = getState();
    // Fixed-point stabilization for usageRatio (max 3 iterations).
    for (let iter = 0; iter < 3; iter += 1) {
      const ratioBefore = stabilizedBudget.usageRatio;
      const stabilizedContext = params.buildConversationContextForState?.(state, ratioBefore);
      if (!stabilizedContext) break;
      applyRebuiltContext(stabilizedContext, { toolsetMode });
      const newBudget = buildBudget();
      if (newBudget.inputTokens === stabilizedBudget.inputTokens && Math.abs(newBudget.usageRatio - ratioBefore) < 0.001) {
        stabilizedBudget = newBudget;
        break;
      }
      stabilizedBudget = newBudget;
    }
    return stabilizedBudget;
  };

  state = getState();
  budget = stabilizeBudget(buildBudget());

  const getCompactableCompletedTurnCount = (): number => selectCompactionTurns({
    messages: state.messages,
    previousSnapshot: state.latestCompactionSnapshot,
    currentUserMessageId,
    promptBudget: budget,
    trigger: "hard",
  }).compactableTurns.length;
  let compactableCompletedTurnCount = getCompactableCompletedTurnCount();
  let pressureSource: PromptPressureSource = resolvePromptPressureSource(budget.breakdown);
  const coreToolNames = new Set<string>(CORE_PROVIDER_TOOL_NAMES);
  const hasNonCoreToolDefinitions = Array.isArray(actualPromptContext.activeToolDefinitions)
    && actualPromptContext.activeToolDefinitions.some((tool) => (
      tool && typeof tool === "object"
      && typeof (tool as { name?: unknown }).name === "string"
      && !coreToolNames.has((tool as { name: string }).name)
    ));
  const canRebuildProviderPrompt = !!(
    params.buildConversationContextForState
    && (actualPromptContext.rebuildProviderPromptState || actualPromptContext.rebuildProviderContext)
  );
  if (
    budget.inputTokens >= budget.hardThresholdTokens
    && pressureSource === "tool_definitions"
    && compactableCompletedTurnCount === 0
    && hasNonCoreToolDefinitions
    && canRebuildProviderPrompt
  ) {
    const coreContext = params.buildConversationContextForState(state, budget.usageRatio);
    if (coreContext) {
      applyRebuiltContext(coreContext, { toolsetMode: "core" });
      budget = stabilizeBudget(buildBudget(), "core");
      compactableCompletedTurnCount = getCompactableCompletedTurnCount();
      pressureSource = resolvePromptPressureSource(budget.breakdown);
    }
  }
  budget = { ...budget, pressureSource };
  const breakdown = budget.breakdown;

  pushAgentDebugEvent("CONTEXT_PROMPT_BUDGET_READY", {
    inputTokens: budget.inputTokens,
    effectiveInputBudget: budget.effectiveInputBudget,
    usageRatioPct: Math.round(budget.usageRatio * 100),
    softThresholdTokens: budget.softThresholdTokens,
    hardThresholdTokens: budget.hardThresholdTokens,
    pressureSource,
    breakdown,
    snapshotGeneration: state.latestCompactionSnapshot?.generation,
    compactableCompletedTurnCount,
  }, budget.inputTokens >= budget.hardThresholdTokens ? "warn" : "info");
  pushAgentDebugEvent("PROVIDER_PROMPT_BUDGET_FINAL", {
    contextWindow: budget.contextWindowTokens,
    effectiveInput: budget.effectiveInputBudget,
    inputTokens: budget.inputTokens,
    pressureSource,
    providerMessagesTokens: breakdown.providerMessages,
    providerToolsTokens: breakdown.providerTools,
    providerStaticReserveTokens: breakdown.providerStaticReserve,
    fixedPromptTokens: breakdown.fixedPromptTokens,
    systemPromptTokens: breakdown.systemPrompt,
    contextInstructionTokens: breakdown.contextInstructions,
    conversationTokens: breakdown.conversationTokens,
    historicalTokens: breakdown.conversationTokens,
    currentUserTokens: breakdown.currentUserTokens,
    toolDefinitionTokens: breakdown.toolDefinitionTokens,
    runtimeObservationTokens: breakdown.runtimeObservationTokens,
    activeToolCount: Array.isArray(actualPromptContext.activeToolDefinitions)
      ? actualPromptContext.activeToolDefinitions.length
      : undefined,
    registeredToolCount: actualPromptContext.registeredToolCount,
    activeToolNames: Array.isArray(actualPromptContext.activeToolDefinitions)
      ? actualPromptContext.activeToolDefinitions
        .map((tool) => tool && typeof tool === "object" && typeof (tool as { name?: unknown }).name === "string"
          ? (tool as { name: string }).name
          : undefined)
        .filter((name): name is string => !!name)
      : [],
    snapshotGeneration: state.latestCompactionSnapshot?.generation,
    usageRatioPct: Math.round(budget.usageRatio * 100),
    exactInputBreakdownTotal: breakdown.providerMessages + breakdown.providerTools + breakdown.providerStaticReserve,
  }, budget.inputTokens >= budget.hardThresholdTokens ? "warn" : "info");

  const finalPromptState: FinalPreparedProviderPromptState = {
    conversationContext: latestConversationContext,
    contextInstructions: actualPromptContext.contextInstructions,
    historicalMessages: actualPromptContext.historicalMessages,
    manifest: latestManifest ?? {
      version: 1,
      includedChars: 0,
      estimatedTokens: 0,
      entries: [],
    },
    systemPrompt: actualPromptContext.systemPrompt,
    providerToolSelection: latestProviderToolSelection,
    toolDefinitions: (Array.isArray(actualPromptContext.activeToolDefinitions)
      ? actualPromptContext.activeToolDefinitions
      : []) as import("../agent-core/tools/native-tool").NativeTool[],
    registeredToolCount: actualPromptContext.registeredToolCount ?? 0,
    toolsetReduced: actualPromptContext.toolsetReduced === true,
    budget,
    snapshotGeneration: state.latestCompactionSnapshot?.generation,
  };

  if (budget.inputTokens >= budget.hardThresholdTokens) {
    const failureCode = pressureSource === "tool_definitions"
      ? "provider_toolset_budget_exceeded"
      : pressureSource === "conversation" || pressureSource === "runtime_observations"
        ? "context_budget_exceeded"
        : "irreducible_context_overflow";
    const failureReason = failureCode === "provider_toolset_budget_exceeded"
      ? "当前 provider 工具定义仍超过动态工具预算，无法安全发送。"
      : failureCode === "irreducible_context_overflow"
        ? "上下文窗口不足以容纳 Agent 基础运行上下文。"
        : "会话历史超过当前模型预算，无法安全压缩。";
    const budgetDiagnostic = `【预算诊断】主要来源：${PROMPT_PRESSURE_SOURCE_LABELS[pressureSource]}；实际 ${budget.inputTokens.toLocaleString()} / ${budget.effectiveInputBudget.toLocaleString()} token；System ${breakdown.systemPrompt.toLocaleString()}、Context ${breakdown.contextInstructions.toLocaleString()}、历史 ${breakdown.conversationTokens.toLocaleString()}、当前问题 ${breakdown.currentUserTokens.toLocaleString()}、工具 ${breakdown.toolDefinitionTokens.toLocaleString()}、运行时观察 ${breakdown.runtimeObservationTokens.toLocaleString()}。`;
    return {
      ok: false,
      failureCode,
      pressureSource,
      budget,
      inputTokens: budget.inputTokens,
      effectiveInputBudget: budget.effectiveInputBudget,
      breakdown,
      compactableCompletedTurnCount,
      compactionAttempted,
      toolsetReduced: actualPromptContext.toolsetReduced === true,
      finalPromptState,
      reason: `${failureReason} ${budgetDiagnostic}`,
    };
  }
  return {
    ok: true,
    pressureSource,
    budget,
    inputTokens: budget.inputTokens,
    effectiveInputBudget: budget.effectiveInputBudget,
    breakdown,
    compactableCompletedTurnCount,
    compactionAttempted,
    toolsetReduced: actualPromptContext.toolsetReduced === true,
    finalPromptState,
  };
}

function mapChatModeToAgentScopeMode(mode: ChatMode): AgentScopeMode | null {
  switch (mode) {
    case "current_doc_with_children":
      return "current_doc_with_children";
    case "current_doc_neighborhood":
      return "current_doc_neighborhood";
    case "current_notebook":
      return "current_notebook";
    case "whole_kb":
      return "whole_kb";
    default:
      return null;
  }
}

function formatAgentWorkbenchUserError(input: { errorCode?: string; message?: string }): string {
  const userFacing = mapAgentErrorToUserFacing({ agentErrorCode: input.errorCode, message: input.message });
  let result = `${userFacing.title}：${userFacing.message}`;
  if (userFacing.suggestion) {
    result += ` ${userFacing.suggestion}`;
  }
  return result;
}

function isAbortLikeError(err: unknown, abortSignal?: AbortSignal): boolean {
  if (abortSignal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function isAgentWorkbenchDebugLogEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env;
  return env?.DEV === true || env?.MODE === "development";
}

const AGENT_STREAM_PRESENTATION_INTERVAL_MS = 80;
const JOURNAL_CHECKPOINT_EVENT_TYPES = new Set([
  "tool_start",
  "permission_required",
  "permission_resolved",
  "tool_result",
  "assistant_final",
  "done",
  "error",
  "notice",
]);

/**
 * dev-only Agent Workbench strict runtime test 开关。
 * - 仅在开发环境生效。
 * - 通过 localStorage "kbAgent.workbenchStrictRuntimeTest" === "1" 开启。
 * - 默认不开启，不影响普通用户。
 * - 仅用于诊断 Agent Workbench 失败路径，不参与 Agent 工具选择，不改变 Tool/Skill 决策。
 */
function isWorkbenchStrictRuntimeTestEnabled(): boolean {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return false;
  }
  try {
    if (window.localStorage.getItem("kbAgent.workbenchStrictRuntimeTest") !== "1") {
      return false;
    }
  } catch {
    return false;
  }
  return isAgentWorkbenchDebugLogEnabled();
}

function sanitizeAgentTurnErrorCode(raw: string | undefined): string {
  if (!raw) return "agent_workbench_runtime_error";
  // 仅保留可见的 safe code；不含 docId / path / 内部 mapping。
  // Agent Workbench 自身的 safe code 形如 "stopped_by_agent" / "exception"，已经安全。
  return String(raw).slice(0, 64);
}

/** 恢复事件与续跑事件的去重合并；导出供验收脚本复用同一合并语义。 */
export function mergeWorkbenchEvents(a: AgentWorkbenchEvent[], b: AgentWorkbenchEvent[]): AgentWorkbenchEvent[] {
  const seen = new Set<string>();
  const out: AgentWorkbenchEvent[] = [];
  for (const event of a) {
    const key =
      (event.type === "tool_start" || event.type === "tool_result") && "toolCallId" in event
        ? `${event.type}:${event.toolCallId}`
        : `${event.type}:${event.stepIndex ?? -1}:${event.at}:${(event as { message?: string }).message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  for (const event of b) {
    const key =
      (event.type === "tool_start" || event.type === "tool_result") && "toolCallId" in event
        ? `${event.type}:${event.toolCallId}`
        : `${event.type}:${event.stepIndex ?? -1}:${event.at}:${(event as { message?: string }).message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

/**
 * 运行 Agent Workbench Mode Flow
 * 适配层：将 runAgentTurn 结果转换为现有聊天消息和状态
 * @param params 参数
 * @returns AskByModeResult
 */
export async function runAgentWorkbenchModeFlow(
  params: RunAgentWorkbenchModeFlowParams
): Promise<AskByModeResult> {
  if (params.conversationKind !== undefined && params.conversationKind !== "current") {
    return { success: false, error: "LEGACY_CONVERSATION_READ_ONLY" };
  }
  const {
    mode,
    question,
    getState,
    updateState,
    addMessage,
    setMessages,
    userMessageAlreadyAdded,
    userMessageId,
    abortSignal,
    chatModelSelection,
    thinkingMode,
    customDocIds,
    contextWindowTokens,
    persistConversationNow,
  } = params;

  const assistantMessageId = params.turnId ?? createMessageId();
  const isResume = !!params.resumeCheckpoint;
  let flushPendingAgentStreams: (() => void) | undefined;
  let cancelPendingAgentStreams: (() => void) | undefined;
  let persistenceCheckpointTail: Promise<void> = Promise.resolve();

  const runPersistenceCheckpoint = async (reason: string) => {
    if (!persistConversationNow) {
      return { success: false, error: `缺少会话持久化回调（${reason}）。` };
    }
    try {
      return await persistConversationNow();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  try {
    const trimmed = question.trim();
    if (!trimmed) {
      return { success: false, error: "问题不能为空" };
    }

    let scopeMode = mapChatModeToAgentScopeMode(mode);
    if (scopeMode === null) {
      return { success: false, error: `未知或暂不支持的模式: ${mode}` };
    }

    const hasCustomDocs = Array.isArray(customDocIds) && customDocIds.length > 0;
    if (hasCustomDocs) {
      scopeMode = "custom_docs";
      pushAgentDebugEvent("MANUAL_DOC_SCOPE_SELECTED_SAFE", {
        selectedDocCount: customDocIds!.length,
        originalMode: mode,
        effectiveScopeMode: "custom_docs",
      }, "info");
      pushAgentDebugEvent("MANUAL_DOC_ATTACHED_SAFE", {
        selectedDocCount: customDocIds!.length,
        source: "user_input_bar",
      }, "info");
    }

    if (scopeMode === "custom_docs") {
      pushAgentDebugEvent("FIXED_SCOPE_SELECTED_SAFE", {
        source: "custom_docs",
        docCount: customDocIds!.length,
        mode: scopeMode,
      }, "info");
    }

    let actualUserMessageId = userMessageId;
    if (userMessageAlreadyAdded !== true) {
      const newUserMessageId = userMessageId || createMessageId();
      actualUserMessageId = newUserMessageId;
      addMessage({
        id: newUserMessageId,
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      });
    }

    const stateForConversationContext = getState();
    const recoveredAssistant = stateForConversationContext.messages.find(
      (message): message is AssistantChatMessage =>
        message.id === assistantMessageId && message.role === "assistant",
    );
    const recoveredWorkbenchEvents = isResume
      ? (recoveredAssistant?.workbenchEvents ?? []).filter((event) => event.type !== "done" && event.type !== "error")
      : [];

    if (!isResume) {
      addMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        isComplete: false,
        agentStatus: "正在分析问题...",
      });
    }

    createTurnJournal({
      conversationId: params.conversationId ?? actualUserMessageId,
      userMessageId: actualUserMessageId,
      assistantMessageId,
      questionPreview: trimmed,
    });
    if (params.resumeCheckpoint) {
      checkpointTurnJournal({
        eventType: `agent_checkpoint_${params.resumeCheckpoint.phase}`,
        stepIndex: params.resumeCheckpoint.stepIndex,
        agentRunCheckpoint: params.resumeCheckpoint,
      });
    }

    updateState((state) => ({
      ...state,
      asking: true,
      qaError: "",
      error: "",
      agentStatus: "正在分析问题...",
    }));

    const initialPersistence = await runPersistenceCheckpoint("发送前");
    if (!initialPersistence.success) {
      if (!isResume) {
        setMessages((messages) => messages.filter((message) =>
          !(message.id === assistantMessageId && message.role === "assistant" && !message.content.trim())
        ));
      }
      const message = `会话保存失败，本轮未开始生成：${initialPersistence.error || "请稍后重试。"}`;
      updateState((state) => ({
        ...state,
        asking: false,
        qaError: message,
        error: message,
        agentStatus: undefined,
      }));
      failTurnJournal({ reason: "initial_persistence_failed" });
      return { success: false, error: message };
    }

    if (isResume) {
      setMessages((messages) => messages.map((message) =>
        message.id === assistantMessageId && message.role === "assistant"
          ? {
              ...message,
              content: "",
              isComplete: false,
              agentStatus: "正在从安全检查点继续...",
              agentRecovery: undefined,
              workbenchEvents: recoveredWorkbenchEvents,
              reasoning: undefined,
            }
          : message
      ));
    }

    // Build the first context from the full transcript. The actual preflight
    // runs after the provider registry and real prompt are assembled below.
    const usageSnapshot = estimateContextUsage({
      messages: stateForConversationContext.messages,
      attachedDocCount: 0,
      historicalMessages: buildUncoveredVerbatimAgentMessages({
        messages: stateForConversationContext.messages,
        currentUserMessageId: actualUserMessageId,
        compactionSnapshot: stateForConversationContext.latestCompactionSnapshot,
      }),
      currentRunMessages: [{ role: "user", content: trimmed }],
      compactionSnapshot: stateForConversationContext.latestCompactionSnapshot,
      contextWindowTokens,
    });
    const stateAfterCompression = getState();
    const usageSnapshotForContext = usageSnapshot;

    // Fetch one settings snapshot for both conversation context and Agent runtime.
    const kbSettings = await getKbSettings();
    const webSearchSettings: BuildConversationContextParams["webSearchSettings"] = {
      enabled: kbSettings.webSearch.enabled,
      provider: kbSettings.webSearch.provider,
      maxResults: kbSettings.webSearch.maxResults,
      readPageMaxChars: kbSettings.webSearch.readPageMaxChars,
    };

    // Determine effective webAccessMode for this turn.
    // Priority: params.webAccessMode (from UI) > user message requestContext > "off"
    // kb-main-panel already resolves requestContext > inputBar > "off" before passing here,
    // so params.webAccessMode is usually the correct effective value.
    // This fallback to requestContext is a safety net for internal callers that may not pass it.
    const currentUserMsg = stateAfterCompression.messages.find(
      (m): m is UserChatMessage =>
        m.role === "user" && m.id === actualUserMessageId,
    );
    const effectiveWebAccessMode = params.webAccessMode
      ?? currentUserMsg?.requestContext?.webAccessMode
      ?? "off";

    pushAgentDebugEvent("WEB_ACCESS_MODE_SOURCE_SAFE", {
      sourceName: "agent-workbench-mode-flow",
      rawValue: params.webAccessMode,
      normalizedValue: effectiveWebAccessMode,
      hasExplicitUserValue: params.webAccessMode !== undefined && params.webAccessMode !== null,
      requestContextFallback: !params.webAccessMode && !!currentUserMsg?.requestContext?.webAccessMode,
    }, "info");

    const conversationContext = buildConversationContext({
      messages: stateAfterCompression.messages,
      currentUserMessageId: actualUserMessageId,
      currentQuestion: trimmed,
      compactionSnapshot: stateAfterCompression.latestCompactionSnapshot,
      usageRatio: usageSnapshotForContext.usageRatio,
      webSearchSettings,
      webAccessModeOverride: effectiveWebAccessMode,
    });
    const historicalMessages = buildUncoveredVerbatimAgentMessages({
      messages: stateAfterCompression.messages,
      currentUserMessageId: actualUserMessageId,
      compactionSnapshot: stateAfterCompression.latestCompactionSnapshot,
    });

    // Extract attachedDocs from current user message for reference grounding
    const currentUserMessage = stateAfterCompression.messages.find(
      (m): m is UserChatMessage =>
        m.role === "user" && m.id === actualUserMessageId,
    );
    const attachedDocs = currentUserMessage?.attachedDocs?.map((d) => ({
      docId: d.docId,
      title: d.title,
    }));

    pushAgentDebugEvent("ASSISTANT_RUN_MESSAGE_CREATED", {
      contentChars: 0,
      isComplete: false,
    }, "debug");

    if (isAgentWorkbenchDebugLogEnabled()) {
      pushAgentDebugEvent("WORKBENCH_START", {
        scopeMode,
        traceEnabled: true,
      }, "debug");
    }

    let latestRawAnswerContent = "";
    let latestDisplayedAnswerContent = "";
    let lastCitationScanRawContent: string | undefined;
    let presentationFlushTimer: ReturnType<typeof setTimeout> | undefined;
    let liveWorkbenchEvents: AgentWorkbenchEvent[] = [...recoveredWorkbenchEvents];
    let presentationWorkbenchEvents: AgentWorkbenchEvent[] = [...recoveredWorkbenchEvents];
    let committedPresentationWorkbenchEventCount = recoveredWorkbenchEvents.length;
    let latestRunCheckpoint: AgentRunCheckpoint | undefined = params.resumeCheckpoint;
    let reasoningContent = "";
    let reasoningPartCount = 0;
    let reasoningStatus: "streaming" | "done" | undefined;
    let latestAgentStatus: string | undefined = isResume ? "正在从安全检查点继续..." : "正在分析问题...";
    let lastCommittedAnswerContent = "";
    let lastCommittedReasoningContent = "";
    let lastCommittedReasoningStatus: "streaming" | "done" | undefined;
    let lastCommittedReasoningPartCount = 0;
    let lastCommittedAgentStatus = latestAgentStatus;
    let lastCheckpointAt = Date.now();
    let lastCheckpointChars = 0;
    const userThinkingMode = thinkingMode ?? "off";

    const cancelPresentationFlush = (): void => {
      if (presentationFlushTimer !== undefined) {
        clearTimeout(presentationFlushTimer);
        presentationFlushTimer = undefined;
      }
    };

    const getDisplayedAnswerContent = (): string => {
      if (lastCitationScanRawContent === latestRawAnswerContent) {
        return latestDisplayedAnswerContent;
      }
      lastCitationScanRawContent = latestRawAnswerContent;
      latestDisplayedAnswerContent = stripInlineCitationMarkersForDisplay(latestRawAnswerContent);
      return latestDisplayedAnswerContent;
    };

    const flushPresentation = (): void => {
      cancelPresentationFlush();
      if (!setMessages) return;

      const nextContent = getDisplayedAnswerContent();
      const nextReasoning = reasoningStatus === undefined
        ? undefined
        : reasoningStatus === "done" && reasoningContent.trim().length === 0
          ? undefined
          : {
              content: reasoningContent,
              status: reasoningStatus,
              partCount: reasoningPartCount,
              chars: reasoningContent.length,
            };
      const nextWorkbenchEvents = presentationWorkbenchEvents.length === committedPresentationWorkbenchEventCount
        ? undefined
        : presentationWorkbenchEvents.slice();
      const answerChanged = nextContent !== lastCommittedAnswerContent;
      const reasoningChanged = nextReasoning?.content !== lastCommittedReasoningContent
        || nextReasoning?.status !== lastCommittedReasoningStatus
        || (nextReasoning?.partCount ?? 0) !== lastCommittedReasoningPartCount;
      const statusChanged = latestAgentStatus !== lastCommittedAgentStatus;
      const workbenchChanged = nextWorkbenchEvents !== undefined;
      if (!answerChanged && !reasoningChanged && !statusChanged && !workbenchChanged) return;

      if (nextWorkbenchEvents) {
        committedPresentationWorkbenchEventCount = presentationWorkbenchEvents.length;
      }
      setMessages((messages) =>
        messages.map((m) => {
          if (m.id !== assistantMessageId || m.role !== "assistant") return m;
          return {
            ...m,
            content: answerChanged ? nextContent : m.content,
            reasoning: reasoningChanged ? nextReasoning : m.reasoning,
            agentStatus: statusChanged ? latestAgentStatus : m.agentStatus,
            workbenchEvents: nextWorkbenchEvents ?? m.workbenchEvents,
            isComplete: false,
          };
        })
      );
      lastCommittedAnswerContent = nextContent;
      lastCommittedReasoningContent = nextReasoning?.content ?? "";
      lastCommittedReasoningStatus = nextReasoning?.status;
      lastCommittedReasoningPartCount = nextReasoning?.partCount ?? 0;
      lastCommittedAgentStatus = latestAgentStatus;
    };

    const schedulePresentationFlush = (): void => {
      if (!setMessages || presentationFlushTimer !== undefined) return;
      presentationFlushTimer = setTimeout(() => {
        presentationFlushTimer = undefined;
        flushPresentation();
      }, AGENT_STREAM_PRESENTATION_INTERVAL_MS);
    };

    flushPendingAgentStreams = () => {
      flushPresentation();
    };
    cancelPendingAgentStreams = () => {
      cancelPresentationFlush();
    };

    const enqueuePersistenceCheckpoint = (reason: string, contentChars: number): void => {
      lastCheckpointAt = Date.now();
      lastCheckpointChars = contentChars;
      persistenceCheckpointTail = persistenceCheckpointTail.then(async () => {
        flushPendingAgentStreams?.();
        const checkpoint = await runPersistenceCheckpoint(reason);
        if (!checkpoint.success) {
          updateState((state) => ({
            ...state,
            error: `回答生成中，但会话检查点保存失败：${checkpoint.error || "请稍后重试。"}`,
          }));
        }
      });
    };

    // Agent Workbench runtime path.
    // 真实聊天只走 Agent Workbench。
    // Agent Workbench 失败时直接把安全错误呈现到当前 assistant message。
    let result: AgentTurnResult | null = null;
    const agentTurnOutcome: AgentTurnOutcome = await runAgentTurn({
      question: trimmed,
      conversationContext,
      mode: scopeMode,
      customDocIds: hasCustomDocs ? customDocIds : undefined,
      attachedDocs,
      historicalMessages,
      abortSignal,
      chatModelSelection,
      thinkingMode: userThinkingMode,
      conversationId: params.conversationId ?? actualUserMessageId,
      panelInstanceId: params.panelInstanceId,
      turnId: assistantMessageId,
      kbSettings,
      contextWindowTokens,
      onContextPrepared: async (actualPrompt) => {
        const initialConversationContext = buildConversationContext({
          messages: getState().messages,
          currentUserMessageId: actualUserMessageId,
          currentQuestion: trimmed,
          compactionSnapshot: getState().latestCompactionSnapshot,
          usageRatio: getState().contextUsage?.usageRatio ?? 0,
          webSearchSettings,
          webAccessModeOverride: effectiveWebAccessMode,
        });
        const actualPromptContextState: ActualPromptContext = {
          systemPrompt: actualPrompt.systemPrompt,
          contextInstructions: actualPrompt.contextInstructions,
          activeToolDefinitions: actualPrompt.toolDefinitions,
          registeredToolCount: actualPrompt.registeredToolCount,
          toolsetReduced: actualPrompt.toolsetReduced,
          contextWindowTokens: actualPrompt.contextWindowTokens ?? contextWindowTokens,
          maxOutputTokens: actualPrompt.maxOutputTokens,
          currentQuestion: trimmed,
          historicalMessages: actualPrompt.historicalMessages,
          manifest: initialConversationContext.manifest,
          conversationContext: initialConversationContext,
          rebuildProviderPromptState: actualPrompt.rebuildProviderPromptState,
          rebuildProviderContext: actualPrompt.rebuildProviderContext,
        };
        const preflightResult = await resolvePreflightCompression({
          getState,
          updateState,
          actualPromptContext: actualPromptContextState,
          currentUserMessageId: actualUserMessageId,
          chatModelSelection: params.chatModelSelection,
          abortSignal: params.abortSignal,
          persistConversationNow: params.persistConversationNow,
          buildConversationContextForState: (state, usageRatio) => {
            const nextContext = buildConversationContext({
              messages: state.messages,
              currentUserMessageId: actualUserMessageId,
              currentQuestion: trimmed,
              compactionSnapshot: state.latestCompactionSnapshot,
              usageRatio: usageRatio ?? state.contextUsage?.usageRatio ?? 0,
              webSearchSettings,
              webAccessModeOverride: effectiveWebAccessMode,
            });
            return {
              conversationContext: nextContext,
              historicalMessages: buildUncoveredVerbatimAgentMessages({
                messages: state.messages,
                currentUserMessageId: actualUserMessageId,
                compactionSnapshot: state.latestCompactionSnapshot,
              }),
            };
          },
        });
        if (!preflightResult.ok) {
          const failedState = getState();
          const failedUsage = estimateContextUsage({
            messages: failedState.messages,
            attachedDocCount: 0,
            systemPrompt: actualPromptContextState.systemPrompt,
            contextInstructions: actualPromptContextState.contextInstructions,
            currentQuestion: trimmed,
            activeToolDefinitions: actualPromptContextState.activeToolDefinitions,
            contextWindowTokens: actualPromptContextState.contextWindowTokens ?? contextWindowTokens,
            providerMessages: [
              { role: "system", content: actualPromptContextState.systemPrompt },
              ...(actualPromptContextState.contextInstructions ? [{ role: "system", content: actualPromptContextState.contextInstructions }] : []),
              ...actualPromptContextState.historicalMessages,
              { role: "user", content: trimmed },
            ],
            historicalMessages: actualPromptContextState.historicalMessages,
            currentRunMessages: [{ role: "user", content: trimmed }],
            providerTools: actualPromptContextState.activeToolDefinitions,
            estimateKind: "full_provider_prompt",
          });
          updateState((state) => ({ ...state, contextUsage: failedUsage }));
          throw new AgentProviderError(preflightResult.reason ?? "上下文预算不足。", {
            code: preflightResult.failureCode ?? "context_budget_exceeded",
            retryable: false,
            safeToReplay: true,
            userAction: "switch_model",
          });
        }
        const finalState = preflightResult.finalPromptState!;
        const preparedState = getState();
        const preparedUsage = estimateContextUsage({
          messages: preparedState.messages,
          attachedDocCount: 0,
          systemPrompt: finalState.systemPrompt,
          contextInstructions: finalState.contextInstructions,
          currentQuestion: trimmed,
          activeToolDefinitions: finalState.toolDefinitions,
          contextWindowTokens: actualPrompt.contextWindowTokens ?? contextWindowTokens,
          providerMessages: [
            { role: "system", content: finalState.systemPrompt },
            ...(finalState.contextInstructions ? [{ role: "system", content: finalState.contextInstructions }] : []),
            ...finalState.historicalMessages,
            { role: "user", content: trimmed },
          ],
          historicalMessages: finalState.historicalMessages,
          currentRunMessages: [{ role: "user", content: trimmed }],
          providerTools: finalState.toolDefinitions,
          estimateKind: "full_provider_prompt",
        });
        updateState((state) => ({ ...state, contextUsage: preparedUsage }));
        return {
          conversationContext: finalState.conversationContext,
          contextInstructions: finalState.contextInstructions,
          historicalMessages: finalState.historicalMessages,
          manifest: finalState.manifest,
          systemPrompt: finalState.systemPrompt,
          toolDefinitions: finalState.toolDefinitions,
          registeredToolCount: finalState.registeredToolCount,
          toolsetReduced: finalState.toolsetReduced,
          providerToolSelection: finalState.providerToolSelection,
          preflightPromptSummary: {
            snapshotGeneration: finalState.snapshotGeneration,
            inputTokens: finalState.budget.inputTokens,
            activeToolNames: Array.isArray(finalState.toolDefinitions) ? finalState.toolDefinitions.map((tool) => tool.name) : [],
            systemPromptTokenCount: finalState.budget.breakdown.systemPrompt,
            contextInstructionTokenCount: finalState.budget.breakdown.contextInstructions,
            historicalTokenCount: finalState.budget.breakdown.conversationTokens,
            toolDefinitionTokenCount: finalState.budget.breakdown.toolDefinitionTokens,
          },
          initialPreparedPayload: {
            messages: [
              { role: "system" as const, content: finalState.systemPrompt },
              ...(finalState.contextInstructions ? [{ role: "system" as const, content: finalState.contextInstructions }] : []),
              ...finalState.historicalMessages,
              { role: "user" as const, content: trimmed },
            ],
            tools: finalState.toolDefinitions,
            systemPrompt: finalState.systemPrompt,
            budget: finalState.budget,
            selection: finalState.providerToolSelection,
          },
        };
      },
      resumeCheckpoint: params.resumeCheckpoint,
      onCheckpoint: (checkpoint) => {
        latestRunCheckpoint = checkpoint;
        checkpointTurnJournal({
          eventType: `agent_checkpoint_${checkpoint.phase}`,
          stepIndex: checkpoint.stepIndex,
          agentRunCheckpoint: checkpoint,
        });
      },
      onReasoningDelta: (event) => {
        // Only process reasoning when thinkingMode=on
        if (userThinkingMode !== "on") {
          return;
        }
        if (event.type === "reasoning-start") {
          if (reasoningContent.length === 0) {
            reasoningPartCount = 0;
          }
          reasoningStatus = "streaming";
          flushPresentation();
        } else if (event.type === "reasoning-delta" && event.delta) {
          reasoningContent += event.delta;
          reasoningPartCount++;
          reasoningStatus = "streaming";
          schedulePresentationFlush();
        } else if (event.type === "reasoning-end") {
          reasoningStatus = "done";
          flushPresentation();
        } else if (event.type === "reasoning-reset") {
          reasoningContent = "";
          reasoningPartCount = 0;
          reasoningStatus = undefined;
          flushPresentation();
        }
      },
      onAnswerChunk: ({ fullContent }) => {
        latestRawAnswerContent = fullContent;
        latestAgentStatus = undefined;
        schedulePresentationFlush();
        const now = Date.now();
        if (now - lastCheckpointAt >= 2500 || fullContent.length - lastCheckpointChars >= 1500) {
          flushPresentation();
          enqueuePersistenceCheckpoint("流式回答", fullContent.length);
        }
      },
      onWorkbenchEvent: (event) => {
        // ── Journal checkpoint for crash survival ──
        {
          if (JOURNAL_CHECKPOINT_EVENT_TYPES.has(event.type) || event.type === "assistant_text_delta") {
            let safeEvent: import("../agent-workbench/runtime/in-flight-turn-journal").SafeWorkbenchEvent | undefined;
            if (event.type === "tool_start" || event.type === "tool_result") {
              safeEvent = {
                type: event.type,
                stepIndex: event.stepIndex,
                toolName: "toolName" in event ? event.toolName : undefined,
                ok: event.type === "tool_result" ? event.result.ok : undefined,
                errorCode: event.type === "tool_result" ? (event.result.errorCode ?? event.result.code) : undefined,
                outputSummary: event.type === "tool_result" ? event.result.summary : undefined,
                argsPreview: "argsPreview" in event ? event.argsPreview : undefined,
              };
            } else if (event.type === "error") {
              safeEvent = { type: "error", errorCode: event.code, message: event.message };
            } else if (event.type === "done") {
              safeEvent = { type: "done", stepIndex: event.stepIndex, status: event.status };
            } else if (event.type === "permission_required") {
              safeEvent = { type: "permission_required", stepIndex: event.stepIndex, toolName: event.preview.toolName };
            } else if (event.type === "permission_resolved") {
              safeEvent = { type: "permission_resolved", stepIndex: event.stepIndex, ok: event.approved };
            } else if (event.type === "notice" || event.type === "assistant_final") {
              safeEvent = {
                type: event.type,
                stepIndex: event.stepIndex,
                message: event.type === "notice" ? event.message : undefined,
              };
            }
            checkpointTurnJournal({
              eventType: event.type,
              stepIndex: event.stepIndex,
              toolName: "toolName" in event ? event.toolName : undefined,
              errorCode: event.type === "error" ? event.code : event.type === "tool_result" ? (event.result.errorCode ?? event.result.code) : undefined,
              permissionState: event.type === "permission_required" ? "required" : event.type === "permission_resolved" ? (event.approved ? "allowed" : "denied") : undefined,
              answerPreview: event.type === "assistant_final" ? event.answer.slice(0, 4000) : undefined,
              safeWorkbenchEvent: safeEvent,
            });
          }
        }

        const isDeferredPresentationEvent =
          event.type === "assistant_text_delta"
          || event.type === "assistant_reasoning_delta";
        liveWorkbenchEvents.push(event);
        if (!isDeferredPresentationEvent && event.type !== "usage") {
          presentationWorkbenchEvents = [...presentationWorkbenchEvents, event];
        }

        if (event.type === "assistant_text_reset") {
          latestRawAnswerContent = "";
          flushPresentation();
        } else if (event.type === "tool_start") {
          latestAgentStatus = undefined;
          flushPresentation();
        } else if (event.type === "notice") {
          latestAgentStatus = event.message;
          flushPresentation();
        } else if (event.type === "assistant_final" || event.type === "done") {
          latestAgentStatus = undefined;
          flushPresentation();
        } else if (isDeferredPresentationEvent) {
          schedulePresentationFlush();
        } else if (event.type !== "usage") {
          flushPresentation();
        }
        if (
          (event.type === "tool_result"
            || event.type === "permission_resolved"
            || event.type === "assistant_final")
          && shouldEnqueueWorkbenchCheckpoint({
            eventType: event.type,
            lastCheckpointAt,
            now: Date.now(),
          })
        ) {
          enqueuePersistenceCheckpoint(`工作台事件：${event.type}`, latestRawAnswerContent.length);
        }
      },
      onAnswerFinish: (fullContent) => {
        latestRawAnswerContent = fullContent;
        latestAgentStatus = undefined;
        flushPresentation();
      },
    });

    const resumableFailureCheckpoint = !agentTurnOutcome.ok
      && latestRunCheckpoint
      && inspectAgentRunResume(latestRunCheckpoint).resumable
      ? latestRunCheckpoint
      : undefined;
    const noProgressFailureCheckpoint = !agentTurnOutcome.ok
      && latestRunCheckpoint?.recoveryExhausted === true
      ? latestRunCheckpoint
      : undefined;
    const failureCheckpointForDisplay = resumableFailureCheckpoint ?? noProgressFailureCheckpoint;
    if (resumableFailureCheckpoint) {
      failTurnJournal({ reason: "recoverable_failure" });
    }

    if (agentTurnOutcome.ok && agentTurnOutcome.result) {
      result = agentTurnOutcome.result;
    } else {
      // Agent Workbench 失败：直接呈现安全错误到 assistant message，不 switch 到其他运行时。
      const displayError = agentTurnOutcome.displayError;
      const safeCode = sanitizeAgentTurnErrorCode(agentTurnOutcome.agentErrorCode);
      pushAgentDebugEvent("WORKBENCH_NO_FALLBACK", {
        agentErrorCode: safeCode,
        stopReasonCode: agentTurnOutcome.stopReasonCode,
        scopeMode,
        displayErrorTitle: displayError?.title,
      }, "warn");

      if (isWorkbenchStrictRuntimeTestEnabled()) {
        throw new Error(`Agent Workbench runtime failed: ${safeCode}`);
      }

      // 用户可读错误消息：优先使用结构化 displayError，缺失时使用稳定通用提示。
      const errMsg = displayError
        ? `${displayError.title}：${displayError.message}${displayError.completedStepsSummary ? `\n${displayError.completedStepsSummary}` : ""}`
        : "本轮未完成：模型没有给出可继续执行的有效内容，本轮已停止。";

      result = {
        scope: { type: "whole_kb" },
        scopeSummary: { type: "whole_kb", title: "知识库" },
        answer: errMsg,
        footerReferences: [],
        warnings: [],
        events: liveWorkbenchEvents,
      };
    }

    if (isAgentWorkbenchDebugLogEnabled() && result) {
      pushAgentDebugEvent("AGENT_TURN_OUTCOME", {
        scopeMode,
        agentOk: agentTurnOutcome.ok,
        steps: agentTurnOutcome.steps,
        footerReferencesCount: agentTurnOutcome.footerReferencesCount ?? result.footerReferences.length,
      }, "debug");
    }

    if (abortSignal?.aborted && !hasSettledWorkbenchTerminal(liveWorkbenchEvents)) {
      flushPendingAgentStreams?.();
      if (setMessages) {
        setMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantMessageId || m.role !== "assistant") return m;
            if (m.content.trim()) {
              return {
                ...m,
                agentStatus: undefined,
                isComplete: false,
                reasoning: m.reasoning?.status === "streaming"
                  ? { ...m.reasoning, status: "done" as const }
                  : m.reasoning,
              };
            }
            return {
              ...m,
              content: MANUAL_STOP_MESSAGE,
              agentStatus: undefined,
              isComplete: true,
              reasoning: m.reasoning?.status === "streaming" ? undefined : m.reasoning,
            };
          })
        );
      }

      failTurnJournal({ reason: "user_aborted" });

      await persistenceCheckpointTail;
      const abortedPersistence = await runPersistenceCheckpoint("手动停止");
      updateState((state) => ({
        ...state,
        asking: false,
        qaError: "",
        error: abortedPersistence.success
          ? ""
          : `已停止回答，但会话尚未保存：${abortedPersistence.error || "请稍后重试。"}`,
        agentStatus: undefined,
      }));
      if (abortedPersistence.success) {
        await clearTurnJournalAfterPersistence();
      }

      return { success: true };
    }

    if (setMessages) {
      flushPendingAgentStreams?.();
      // action trace 必须与最终 workbenchEvents 一致：基于“恢复事件 + 当前续跑事件”的去重合并结果构建。
      const finalWorkbenchEvents = mergeWorkbenchEvents(liveWorkbenchEvents, result.events);
      const agentMemory = buildAgentTurnMemory({
        turnId: assistantMessageId,
        userQuestion: trimmed,
        result: { ...result, events: finalWorkbenchEvents },
      });

      const isPartialProviderAnswer =
        agentTurnOutcome.stopReasonCode === PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE;
      setMessages((messages) =>
        messages.map((m) =>
          m.id === assistantMessageId && m.role === "assistant"
            ? {
                ...m,
                content: result.answer,
                citedReferences: result.footerReferences,
                citationSegments: result.citationSegments,
                agentMemory,
                workbenchEvents: finalWorkbenchEvents,
                temporaryWorkbenches: result.temporaryWorkbenches,
                isComplete: !isPartialProviderAnswer,
                agentStatus: undefined,
                agentRecovery: failureCheckpointForDisplay && actualUserMessageId
                  ? { checkpoint: failureCheckpointForDisplay, userMessageId: actualUserMessageId }
                  : undefined,
                // Ensure reasoning status is "done" at finalize
                reasoning: m.reasoning && m.reasoning.status === "streaming"
                  ? { ...m.reasoning, status: "done" as const }
                  : m.reasoning,
              }
            : m
        )
      );

      const finalContent = result.answer;
      pushAgentDebugEvent("ASSISTANT_RUN_FINALIZED", {
        answerChars: finalContent.length,
        hasReferences: (result.footerReferences?.length ?? 0) > 0,
        isComplete: !isPartialProviderAnswer,
      }, "debug");

    }

    await persistenceCheckpointTail;
    const finalContent = result.answer;
    if (!resumableFailureCheckpoint) {
      await markTurnCompletedPendingPersistence({ answerPreview: finalContent });
    }
    const finalPersistence = await runPersistenceCheckpoint("最终回答");
    updateState((state) => ({
      ...state,
      asking: false,
      qaError: "",
      error: finalPersistence.success
        ? ""
        : `回答已生成，但会话尚未保存：${finalPersistence.error || "请稍后重试。"}`,
      agentStatus: undefined,
    }));
    if (!finalPersistence.success) {
      const persistenceError = `回答已生成，但会话尚未保存：${finalPersistence.error || "请稍后重试。"}`;
      return { success: false, error: persistenceError };
    }
    if (!resumableFailureCheckpoint) {
      await clearTurnJournalAfterPersistence();
    }

    return { success: true };
  } catch (err) {
    failTurnJournal({ reason: "exception" });

    flushPendingAgentStreams?.();
    cancelPendingAgentStreams?.();
    if (isAbortLikeError(err, abortSignal)) {
      if (setMessages) {
        setMessages((messages) =>
          messages.map((m) => {
            if (m.id !== assistantMessageId || m.role !== "assistant") return m;
            if (m.content.trim()) {
              return {
                ...m,
                agentStatus: undefined,
                isComplete: false,
                reasoning: m.reasoning?.status === "streaming"
                  ? { ...m.reasoning, status: "done" as const }
                  : m.reasoning,
              };
            }
            return {
              ...m,
              content: MANUAL_STOP_MESSAGE,
              agentStatus: undefined,
              isComplete: true,
              reasoning: m.reasoning?.status === "streaming" ? undefined : m.reasoning,
            };
          })
        );
      }

      await persistenceCheckpointTail;
      const abortedPersistence = await runPersistenceCheckpoint("异常中止");
      updateState((state) => ({
        ...state,
        asking: false,
        qaError: "",
        error: abortedPersistence.success
          ? ""
          : `回答已中止，但会话尚未保存：${abortedPersistence.error || "请稍后重试。"}`,
        agentStatus: undefined,
      }));
      if (abortedPersistence.success) {
        await clearTurnJournalAfterPersistence();
      }

      return { success: true };
    }

    const rawErrorMsg = err instanceof Error ? err.message : String(err);
    pushAgentDebugEvent("MODE_FLOW_FAILED", { error: rawErrorMsg.slice(0, 200) }, "error");

    if (setMessages) {
      setMessages((messages) =>
        messages.filter((m) => m.id !== assistantMessageId)
      );
    }

    const userErrorMsg = formatAgentWorkbenchUserError({
      errorCode: "agent_workbench_unexpected_error",
    });

    addMessage({
      id: createMessageId(),
      role: "error",
      content: userErrorMsg,
      createdAt: Date.now(),
    });

    await persistenceCheckpointTail;
    const failurePersistence = await runPersistenceCheckpoint("异常回答");
    updateState((state) => ({
      ...state,
      asking: false,
      qaError: userErrorMsg,
      error: failurePersistence.success
        ? userErrorMsg
        : `${userErrorMsg}\n会话尚未保存：${failurePersistence.error || "请稍后重试。"}`,
      agentStatus: undefined,
    }));
    if (failurePersistence.success) {
      await clearTurnJournalAfterPersistence();
    }

    return { success: false, error: rawErrorMsg };
  }
}
