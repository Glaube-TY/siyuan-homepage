/**
 * Compose Answer Node
 *
 * 调用 LLM 生成最终回答文本。
 *
 * 职责：
 * - 生成 evidencePack
 * - 生成 footerReferences
 * - 生成 prompt
 * - 调用 callLlm 生成回答
 * - 成功后写入 state.composedAnswer、state.finalEvidencePack、state.footerReferences
 * - 失败时写 warnings，并生成保守回答
 * - 不写 UI/store
 * - 不流式
 * - 不保存完整 prompt 到 state
 */

import type { AgenticRagState } from "../state";
import { buildAgenticEvidencePackFromWorkspace } from "../../workspace/workspace-to-evidence-pack";
import { buildComposeEvidencePack } from "../../workspace/compose-evidence-pack";
import { buildFooterReferencesFromAgenticEvidencePack } from "../../evidence/footer-references";
import { buildFinalAnswerPrompt, MultiTurnContextForPrompt, ConversationTurnForPrompt } from "../../prompts/final-answer-prompt";
import { buildStructureContextBrief } from "../../workspace/structure-context-summary";
import { callLlm, streamLlm, AiProviderUnavailableError, isProviderRejectedError, getProviderRejectionInfo } from "../../../qa/llm-client";
import { resolveReasoningEffortForCompose, resolveEffectiveCapability, isReasoningUnsupportedCached, cacheReasoningUnsupported, isReasoningParameterRejection, resolveModelCapabilityProfile, resolveComposeStrategyFromProfile } from "../../../qa/model-capabilities";
import { getKbSettings } from "../../../settings/kb-settings-service";
import { createSelectedChatModel } from "../../../qa/model-provider-factory";
import { resolveProviderProfile, buildThinkingTypeProviderOptions } from "../../../qa/provider-profile";
import { summarizeEvidenceWorkspace } from "../../workspace/workspace-summary";
import type { WorkspaceSummaryForPrompt } from "../../prompts/final-answer-prompt";
import { debugEvidencePack, debugEvidencePackFilteredSafe, debugFooterReferencesSafe, debugFooterReferencesFilteredSafe, pushAgentDebugEvent } from "../../debug/agentic-rag-debug";
import {
  buildComposeContextPack,
  summarizeComposeContextPack,
} from "../../harness/context/compose-context";
import { finalizeNoEvidenceKbAnswerState, buildEmptyInsufficientEvidencePack } from "../final-answer-guards";
import { checkEvidencePackNoRawQueryFields, finalizeFirstPrinciplesGuardFailureState, finalizeSystemFailureState } from "../../harness/guards/first-principles-guard";

const PROVIDER_REJECTED_ANSWER = "已读取到相关证据，但模型服务拒绝生成本次回答。请减少一次性读取的资料量，或换用其他模型后重试。";
const DEFAULT_FINAL_ANSWER_MAX_OUTPUT_TOKENS = 1200;
const STREAM_IDLE_TIMEOUT_MS = 60000;
const STREAM_HARD_TIMEOUT_MS = 120000;

function buildProviderRejectedComposeResult(
  state: AgenticRagState,
  traceLog: typeof state.traceLog,
  warnings: string[],
  evidencePack: ReturnType<typeof buildAgenticEvidencePackFromWorkspace>,
  rejectionInfo: ReturnType<typeof getProviderRejectionInfo>,
  streamError: Error | null,
  streamedContentChars: number
): ComposeAnswerNodeOutput {
  const totalContentChars = evidencePack.items.reduce((sum, item) => sum + (item.content?.length ?? 0), 0);
  const errorObj = streamError ? (streamError as unknown) as Record<string, unknown> : undefined;
  const errorName = errorObj?.name ? String(errorObj.name) : undefined;
  const errorOriginalName = errorObj?.originalName ? String(errorObj.originalName) : undefined;

  pushAgentDebugEvent("COMPOSE_PROVIDER_REJECTED_SAFE", {
    providerType: rejectionInfo.providerType ?? "unknown",
    providerLabel: rejectionInfo.providerLabel,
    modelLabel: rejectionInfo.modelLabel,
    statusCode: rejectionInfo.statusCode,
    evidenceItemCount: evidencePack.items.length,
    totalContentChars,
    streamedContentChars,
    errorName,
    errorMessage: rejectionInfo.message.substring(0, 200),
  }, "warn");

  traceLog.push({
    name: "COMPOSE_PROVIDER_REJECTED_SAFE",
    status: "failed",
    detail: JSON.stringify({
      providerType: rejectionInfo.providerType ?? "unknown",
      providerLabel: rejectionInfo.providerLabel,
      modelLabel: rejectionInfo.modelLabel,
      statusCode: rejectionInfo.statusCode,
      evidenceItemCount: evidencePack.items.length,
      totalContentChars,
      streamedContentChars,
      errorName,
      originalName: errorOriginalName,
      errorMessage: rejectionInfo.message.substring(0, 200),
    }),
  });

  warnings.push("模型服务拒绝生成回答");

  return {
    state: {
      ...state,
      currentAction: undefined,
      finalAnswerAction: undefined,
      composedAnswer: PROVIDER_REJECTED_ANSWER,
      finalEvidencePack: buildEmptyInsufficientEvidencePack(),
      footerReferences: [],
      finalEvidenceDocIds: [],
      droppedReferenceDocIds: [],
      warnings,
      composedAnswerSource: "provider_rejected",
      traceLog,
    },
  };
}

export interface ComposeAnswerNodeInput {
  state: AgenticRagState;
}

export interface ComposeAnswerNodeOutput {
  state: AgenticRagState;
}

function buildWorkspaceSummaryForPrompt(state: AgenticRagState): WorkspaceSummaryForPrompt {
  const wsSummary = summarizeEvidenceWorkspace(state.workspace);
  return {
    readDocCount: wsSummary.readDocCount,
    readBlockContextCount: wsSummary.readBlockContextCount,
    outlineCount: wsSummary.outlineCount,
    recentEvidenceCount: wsSummary.recentEvidenceCount,
    searchCallCount: wsSummary.coverage.searchCallCount,
    warningsSummary: wsSummary.warnings.slice(0, 3),
    sourceCoverage: wsSummary.sourceCoverage ? {
      discoveredSourceCount: wsSummary.sourceCoverage.discoveredSourceCount,
      readSourceCount: wsSummary.sourceCoverage.readSourceCount,
      unreadSourceCount: wsSummary.sourceCoverage.unreadSourceCount,
      sourceCoverageRatio: wsSummary.sourceCoverage.sourceCoverageRatio,
      coverageWarnings: wsSummary.sourceCoverage.unreadSourceCount > 0
        ? [`仍有未读来源，回答覆盖有限 (${wsSummary.sourceCoverage.unreadSourceCount} 个未读来源)`]
        : undefined,
    } : undefined,
  };
}

function buildComposeContextInstruction(state: AgenticRagState): string {
  const composeContextPack = buildComposeContextPack({ state });
  const summary = summarizeComposeContextPack(composeContextPack);
  const requestedEvidenceMode = state.finalAnswerAction?.args?.evidenceMode;
  const answerKind = state.finalAnswerAction?.args?.answerKind;
  const lines: string[] = [];

  if (answerKind === "needs_clarification") {
    lines.push("Planner 判断当前信息不足以确定检索或回答范围，需要用户补充。");
    lines.push("请简短说明需要用户补充什么信息，不要给出不确定的结论。");
    lines.push("不要引用知识库文档内容，不要假装有证据。");
  } else if (requestedEvidenceMode === "with_evidence") {
    lines.push("以下是已读取资料。最终回答必须基于这些资料。");
    lines.push("资料结构说明只解释这些资料为何相关，不能替代正文证据。");
    if (composeContextPack.evidencePack.itemCount === 0) {
      lines.push("Planner 请求基于证据回答，但证据包为空；请说明证据不足，不要给确定结论。");
    }
  } else if (requestedEvidenceMode === "insufficient_evidence") {
    lines.push("以下是已读取资料（如有）。Planner 请求证据不足回答模式。");
    lines.push("如提及已读资料，只能说明证据不足或覆盖有限，不能伪装充分证据。");
    lines.push("资料结构说明只解释这些资料为何相关，不能替代正文证据。");
  } else if (requestedEvidenceMode === "without_kb_evidence") {
    lines.push("Planner 请求不使用知识库证据回答。不要引用知识库文档内容。");
  }

  if (composeContextPack.structureSummary) {
    lines.push(`结构说明: ${composeContextPack.structureSummary}`);
  }
  traceComposeContextSummary(state, summary);
  return lines.join("\n");
}

function traceComposeContextSummary(state: AgenticRagState, summary: Record<string, unknown>): void {
  if (state.trace) {
    console.info("[KB-AGENT | COMPOSE_CONTEXT_PROMPT_POLICY_SAFE]", summary);
  }
}

export async function composeAnswerNode(input: ComposeAnswerNodeInput): Promise<ComposeAnswerNodeOutput> {
  const { state } = input;

  const traceLog = [...state.traceLog];
  const warnings = [...state.warnings];

  const gateV2 = state.evidenceGateV2;
  if (gateV2?.status === "insufficient_with_options") {
    return {
      state: finalizeNoEvidenceKbAnswerState(state, {
        reason: "composeAnswerNode called with evidence gate with_options",
        traceName: "COMPOSE_DEFENSE_FIXED_NO_EVIDENCE_SAFE",
        detail: {
          gateV2Status: gateV2.status,
        },
      }),
    };
  }

  // 1. 生成 evidencePack
  let finalEvidenceDocIds = state.finalEvidenceDocIds;
  let droppedReferenceDocIds = state.droppedReferenceDocIds;

  // 白名单一致性检查
  const evidenceMode = state.finalAnswerAction?.args?.evidenceMode;

  // evidenceMode 缺失时 fail closed，不进入最终回答 LLM
  if (!evidenceMode) {
    traceLog.push({
      name: "COMPOSE_EVIDENCE_MODE_MISSING_FAIL_CLOSED",
      status: "failed",
      detail: JSON.stringify({
        reason: "finalAnswerAction.args.evidenceMode 缺失，fail closed 不进入 LLM compose",
      }),
    });
    return {
      state: finalizeSystemFailureState(
        { ...state, traceLog, warnings },
        "answer 缺少 evidenceMode，无法安全 compose。",
        "COMPOSE_EVIDENCE_MODE_MISSING_FAIL_CLOSED",
        "evidenceMode missing on finalAnswerAction, fail closed",
      ),
    };
  }

  if (evidenceMode === "without_kb_evidence") {
    const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb !== false;
    const hasReadEvidence = state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;

    if (needsKnowledgeBase && hasReadEvidence) {
      traceLog.push({
        name: "COMPOSE_WITHOUT_KB_EVIDENCE_CONFLICT_FAIL_CLOSED",
        status: "failed",
        detail: JSON.stringify({
          evidenceMode,
          readDocCount: state.workspace.readDocuments.length,
          readBlockContextCount: state.workspace.readBlockContexts.length,
          needsKnowledgeBase,
          reason: "evidenceMode=without_kb_evidence 但当前有已读证据且需要知识库，fail closed",
        }),
      });
      return {
        state: finalizeSystemFailureState(
          { ...state, traceLog, warnings },
          "evidenceMode 与证据状态冲突，无法安全 compose。",
          "COMPOSE_WITHOUT_KB_EVIDENCE_CONFLICT_FAIL_CLOSED",
          "without_kb_evidence but has read evidence and modeRequiresKb, fail closed",
        ),
      };
    }

    const allAvailableDocIds = [
      ...state.workspace.candidateDocs.map((d) => d.docId),
      ...state.workspace.readDocuments.map((d) => d.docId),
      ...state.workspace.readBlockContexts.map((b) => b.docId),
      ...state.workspace.recentEvidence.map((e) => e.docId),
    ];
    const uniqueAllDocIds = [...new Set(allAvailableDocIds)];

    finalEvidenceDocIds = [];
    droppedReferenceDocIds = uniqueAllDocIds;
    state.finalEvidenceDocIds = [];
    state.droppedReferenceDocIds = uniqueAllDocIds;

    traceLog.push({
      name: "COMPOSE_FINAL_LOCK_PRESERVED",
      status: "success",
      detail: JSON.stringify({
        finalEvidenceDocCount: 0,
        droppedReferenceDocCount: uniqueAllDocIds.length,
        evidenceMode,
        reason: "Planner 请求不使用知识库证据，已清空 finalEvidenceDocIds",
      }),
    });
  } else {
    const hasReadContent = state.workspace.readDocuments.length > 0 || state.workspace.readBlockContexts.length > 0;
    if (evidenceMode === "insufficient_evidence" && hasReadContent) {
      warnings.push("Planner 请求 insufficient_evidence，但当前已有已读证据；保持 Planner 请求模式，不自动切换为 with_evidence");
      traceLog.push({
        name: "COMPOSE_EVIDENCE_MODE_CONFLICT_WARNING",
        status: "skipped",
        detail: JSON.stringify({
          evidenceMode,
          readDocCount: state.workspace.readDocuments.length,
          readBlockContextCount: state.workspace.readBlockContexts.length,
          reason: "Planner 请求模式与当前证据状态不一致，保持 Planner 请求模式",
        }),
      });
    }
    traceLog.push({
      name: "COMPOSE_FINAL_LOCK_PRESERVED",
      status: "success",
      detail: JSON.stringify({
        finalEvidenceDocCount: finalEvidenceDocIds?.length ?? 0,
        droppedReferenceDocCount: droppedReferenceDocIds?.length ?? 0,
        evidenceMode,
        reason: "保留 graph.ts 已锁定的 finalEvidenceDocIds，不重新自动补齐",
      }),
    });
  }

  const evidencePack = buildAgenticEvidencePackFromWorkspace({
    workspace: state.workspace,
    finalAnswerAction: state.finalAnswerAction,
    finalEvidenceDocIds,
    droppedReferenceDocIds,
  });

  // Evidence pack raw query guard: fail closed if raw query fields detected
  const evidencePackRawQueryGuard = checkEvidencePackNoRawQueryFields(evidencePack);
  if (!evidencePackRawQueryGuard.ok) {
    return {
      state: finalizeFirstPrinciplesGuardFailureState(state, evidencePackRawQueryGuard, "compose_answer_evidence_pack_guard"),
    };
  }

  const needsKnowledgeBase = state.runtimeTurnFacts?.modeRequiresKb !== false;

  if (evidenceMode === "with_evidence" && evidencePack.items.length === 0) {
    traceLog.push({
      name: "COMPOSE_WITH_EVIDENCE_EMPTY_PACK_BLOCKED",
      status: "failed",
      detail: JSON.stringify({
        evidenceMode,
        evidenceItemCount: 0,
        reason: "with_evidence requested but evidence pack empty, compose blocked",
      }),
    });
    return {
      state: finalizeNoEvidenceKbAnswerState(
        {
          ...state,
          traceLog,
          warnings: [...warnings, "Planner 请求 with_evidence 但证据包为空，阻止 compose"],
        },
        {
          reason: "with_evidence requested but evidence pack empty, compose blocked",
          traceName: "COMPOSE_WITH_EVIDENCE_EMPTY_PACK_BLOCKED",
          detail: { evidenceMode, evidenceItemCount: 0 },
        },
      ),
    };
  }

  if (
    needsKnowledgeBase &&
    gateV2?.status === "insufficient_final" &&
    evidencePack.items.length === 0
  ) {
    return {
      state: finalizeNoEvidenceKbAnswerState(
        {
          ...state,
          traceLog,
          warnings,
        },
        {
          reason: "composeAnswerNode received insufficient_final with empty evidence pack",
          traceName: "COMPOSE_EMPTY_EVIDENCE_FIXED_NO_LLM_SAFE",
          detail: {
            evidenceItemCount: 0,
            evidenceGateV2Status: gateV2.status,
          },
        },
      ),
    };
  }

  debugEvidencePack(state.trace, state.counters.stepCount, {
    itemCount: evidencePack.items.length,
    items: evidencePack.items.map((item) => ({
      docTitle: item.docTitle,
      readLevel: item.readLevel,
      contentChars: item.content?.length ?? 0,
    })),
    evidenceMode: evidencePack.evidenceMode,
  });

  // evidence pack filtered debug
  if (state.finalEvidenceDocIds && state.finalEvidenceDocIds.length > 0) {
    debugEvidencePackFilteredSafe(state.trace, state.counters.stepCount, {
      totalItems: state.workspace.readDocuments.length,
      filteredItems: evidencePack.items.length,
      usedEvidenceDocCount: evidencePack.items.length,
      droppedReferenceDocCount: state.droppedReferenceDocIds?.length ?? 0,
      candidateButUnusedDocCount: 0,
    });
  }

  // 如果 evidenceMode 被降为 insufficient_evidence，合并 warning
  if (evidencePack.coverage.warnings) {
    for (const w of evidencePack.coverage.warnings) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }
  }

  // 2. 构建最终回答专用压缩证据包（控制 prompt 大小，避免 provider high risk）
  const rawMaxTotalChars = state.budget?.maxContextChars ?? 6000;
  const composeResult = buildComposeEvidencePack({
    evidencePack,
    question: state.question,
    maxTotalChars: rawMaxTotalChars,
    trace: state.trace,
  });

  const promptEvidencePack = composeResult.promptEvidencePack;

  if (composeResult.compacted) {
    for (const w of composeResult.warnings) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }
  }

  const composeEvidencePayload = {
    originalEvidenceItemCount: evidencePack.items.length,
    promptVisibleEvidenceItemCount: composeResult.promptVisibleEvidenceCount,
    droppedEvidenceItemCount: composeResult.droppedEvidenceItemCount,
    truncatedItemCount: composeResult.truncatedItemCount,
    rawMaxTotalChars: composeResult.rawMaxTotalChars,
    effectiveMaxTotalChars: composeResult.effectiveMaxTotalChars,
    effectiveMaxCharsPerItem: composeResult.effectiveMaxCharsPerItem,
    maxTotalChars: composeResult.effectiveMaxTotalChars,
    strategy: "equal_budget_order_preserving",
  };
  traceLog.push({
    name: "COMPOSE_EVIDENCE_PROMPT_ALIGNMENT_SAFE",
    status: "success",
    detail: JSON.stringify(composeEvidencePayload),
  });
  pushAgentDebugEvent("COMPOSE_EVIDENCE_PROMPT_ALIGNMENT_SAFE", composeEvidencePayload, "info");

  if (state.trace) {
    console.info("[KB-AGENT | PROMPT_EVIDENCE_PACK]", {
      itemCount: promptEvidencePack.items.length,
      promptContentChars: composeResult.promptContentChars,
      compacted: composeResult.compacted,
      originalContentChars: composeResult.originalContentChars,
    });
  }

  // 3. 生成 prompt
  const wsSummaryForPrompt = buildWorkspaceSummaryForPrompt(state);

  const coverageBoundaryRequired = !!wsSummaryForPrompt.sourceCoverage
    && (wsSummaryForPrompt.sourceCoverage.unreadSourceCount > 0
      || wsSummaryForPrompt.sourceCoverage.readSourceCount < wsSummaryForPrompt.sourceCoverage.discoveredSourceCount);

  const coverageBoundaryPayload = {
    evidenceItemCount: evidencePack.items.length,
    readSourceCount: wsSummaryForPrompt.sourceCoverage?.readSourceCount ?? 0,
    discoveredSourceCount: wsSummaryForPrompt.sourceCoverage?.discoveredSourceCount ?? 0,
    unreadSourceCount: wsSummaryForPrompt.sourceCoverage?.unreadSourceCount ?? 0,
    sourceCoverageRatio: wsSummaryForPrompt.sourceCoverage?.sourceCoverageRatio ?? 1,
    coverageBoundaryRequired,
  };
  traceLog.push({
    name: "FINAL_ANSWER_COVERAGE_BOUNDARY_SAFE",
    status: "success",
    detail: JSON.stringify(coverageBoundaryPayload),
  });
  pushAgentDebugEvent("FINAL_ANSWER_COVERAGE_BOUNDARY_SAFE", coverageBoundaryPayload, "info");

  const multiTurnContext: MultiTurnContextForPrompt | undefined = state.followUpContext || state.turnContextFact
    ? {
      previousQuestionExists: !!state.followUpContext?.previousUserQuestion,
      previousAssistantSummary: state.followUpContext?.previousAssistantSummary,
      previousDisplayedReferenceTitleCount: state.followUpContext?.previousReferenceTitles?.length ?? 0,
    }
    : undefined;

  const conversationTurns: ConversationTurnForPrompt[] | undefined = state.runtime?.recentContext?.conversationTurns?.map(t => ({
    turnId: t.turnId,
    userQuestion: t.userQuestion,
    assistantSummary: t.assistantSummary,
    answerItems: t.answerItems,
    displayedReferenceCount: t.footerRefs?.length ?? 0,
    displayedReferenceTitles: t.footerRefs?.map(r => r.docTitle).filter(Boolean) ?? [],
  }));

  const prompt = buildFinalAnswerPrompt({
    question: state.question,
    scopeSummary: state.scopeSummary?.title,
    recentContextSummary: state.recentContextSummary,
    evidencePack: promptEvidencePack,
    workspaceSummary: wsSummaryForPrompt,
    instruction: buildComposeContextInstruction(state),
    multiTurnContext,
    conversationTurns,
    structureContextBrief: buildStructureContextBrief(state.workspace.activeFocusScope),
    thinkingModeOff: (state.thinkingMode ?? "off") === "off",
  });

  // 3. 调用 LLM
  const thinkingMode = state.thinkingMode ?? "off";
  let resolvedReasoningEffort: "low" | "medium" | "none" | undefined;
  let resolvedProviderOptions: Record<string, Record<string, unknown>> | undefined;
  let reasoningApplied = false;
  let skippedReason: string | undefined;
  let providerType = "unknown";
  let modelLabel = "unknown";
  let modelId = "unknown";
  let effectiveCapability: import("../../../qa/model-capabilities").ReasoningCapabilityType = "unknown";

  let selected: ReturnType<typeof createSelectedChatModel> | undefined;

  try {
    const settings = await getKbSettings();
    selected = createSelectedChatModel(settings);
    providerType = selected.providerConfig.type;
    modelLabel = selected.modelLabel;
    modelId = selected.modelConfig.id;

    if (isReasoningUnsupportedCached(providerType, modelId)) {
      skippedReason = "cached_unsupported";
    } else {
      effectiveCapability = resolveEffectiveCapability(providerType, selected.modelConfig.reasoningCapability);
      const resolution = resolveReasoningEffortForCompose(thinkingMode, effectiveCapability);
      resolvedReasoningEffort = resolution.effort;
      resolvedProviderOptions = resolution.providerOptions;
      reasoningApplied = resolution.applied;
      skippedReason = resolution.skippedReason;
    }
  } catch {
    skippedReason = "settings_resolve_failed";
  }

  let providerProfileForTrace: import("../../../qa/provider-profile").ProviderProfile | undefined;
  try {
    const providerProfile = resolveProviderProfile(providerType, {
      reasoningCapability: selected?.modelConfig?.reasoningCapability,
      finalComposeMode: selected?.modelConfig?.finalComposeMode,
    });
    providerProfileForTrace = providerProfile;

    const thinkingTypeOptions = buildThinkingTypeProviderOptions(providerProfile, thinkingMode === "on");
    if (thinkingTypeOptions) {
      resolvedProviderOptions = {
        ...resolvedProviderOptions,
        ...thinkingTypeOptions,
      };
      reasoningApplied = true;
      skippedReason = undefined;
    }
  } catch {
    // profile 解析失败不影响主流程
  }

  pushAgentDebugEvent("FINAL_ANSWER_THINKING_MODE_SAFE", {
    thinkingMode,
    providerType,
    modelLabel,
    reasoningCapability: effectiveCapability,
    reasoningControlApplied: reasoningApplied,
    reasoningControlSkippedReason: skippedReason ?? null,
    evidenceItemCount: evidencePack.items.length,
    note: "applied=false does NOT mean reasoning is disabled; provider may still generate hidden reasoning server-side",
  }, "info");

  pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_PROFILE_SAFE", {
    providerType: providerProfileForTrace?.providerType ?? providerType,
    endpointKind: providerProfileForTrace?.endpointKind ?? "unknown",
    supportsReasoningControl: providerProfileForTrace?.supportsReasoningControl ?? false,
    reasoningControlParamStyle: providerProfileForTrace?.reasoningControlParamStyle ?? "unknown",
    reasoningControlApplied: reasoningApplied,
    skippedReason: skippedReason ?? null,
  }, "info");

  const capabilityProfile = resolveModelCapabilityProfile(providerType, {
    reasoningCapability: selected?.modelConfig?.reasoningCapability,
    finalComposeMode: selected?.modelConfig?.finalComposeMode,
  });
  const composeStrategy = resolveComposeStrategyFromProfile(capabilityProfile, thinkingMode, { providerType, modelLabel });
  const requestedComposeMode = capabilityProfile.preferredComposeMode;
  let composeMode: "stream" | "non_stream" | "stream_then_retry" = composeStrategy.strategy;

  pushAgentDebugEvent("COMPOSE_PROVIDER_STRATEGY_SAFE", {
    providerType,
    providerFamily: capabilityProfile.providerFamily,
    modelLabel,
    composeMode: composeStrategy.strategy,
    requestedComposeMode,
    thinkingMode,
    reason: composeStrategy.reason,
    hasUserOverride: capabilityProfile.hasUserOverride,
    thinkingModeCapabilityNote: composeStrategy.thinkingModeCapabilityNote ?? null,
    evidenceItemCount: evidencePack.items.length,
  }, "info");

  let composedAnswer: string;
  let streamedContent = "";
  const useStream = composeStrategy.strategy === "stream" && !!state.runtime?.onAnswerChunk;
  const streamingCallbacks = useStream
    ? {
      onChunk: ({ chunk, fullContent }: { chunk: string; fullContent: string }) => {
        streamedContent = fullContent;
        state.runtime?.onAnswerChunk?.({ chunk, fullContent });
      },
      onFinish: async (fullContent: string) => {
        streamedContent = fullContent;
        state.runtime?.onAnswerFinish?.(fullContent);
      },
      onError: (error: Error) => {
        const errorMessage = error.message || String(error);
        warnings.push(`最终回答流式调用失败：${errorMessage}`);
      },
    }
    : null;

  if (streamingCallbacks) {
    let answerStartCalled = false;
    const streamStartTime = Date.now();
    let chunkCount = 0;
    let streamError: Error | null = null;
    let streamFinished = false;
    let textDeltaReceived = false;
    let firstTextTimeMs = 0;
    let reasoningContent = "";
    let reasoningActive = false;
    let reasoningPartCount = 0;
    let reasoningDeltaPartCount = 0;
    let hiddenReasoningPartCount = 0;
    let hiddenReasoningChars = 0;
    let reasoningDeltaPartCountBeforeText = 0;
    let hiddenReasoningCharsBeforeText = 0;

    const composeLocalAbortController = new AbortController();
    const userAbortSignal = state.runtime?.abortSignal;
    if (userAbortSignal?.aborted) {
      composeLocalAbortController.abort(userAbortSignal.reason);
    } else if (userAbortSignal) {
      userAbortSignal.addEventListener("abort", () => composeLocalAbortController.abort(userAbortSignal.reason), { once: true });
    }
    const combinedAbortSignal = composeLocalAbortController.signal;

    const slowStartHintId = setTimeout(() => {
      if (!textDeltaReceived && !streamFinished) {
        emitProgressIfAvailable("composing_answer", "正在等待模型正文输出");
      }
    }, 5000);

    let earlyFallbackTriggered = false;
    let lastPartTime = Date.now();

    const streamIdleCheckId = setInterval(() => {
      if (earlyFallbackTriggered || streamFinished) return;
      const now = Date.now();
      const idleMs = now - lastPartTime;
      const totalMs = now - streamStartTime;

      pushAgentDebugEvent("ANSWER_STREAM_WAITING_FOR_TEXT_SAFE", {
        elapsedMs: totalMs,
        reasoningStartCount: reasoningPartCount,
        reasoningDeltaPartCountBeforeText,
        hiddenReasoningCharsBeforeText,
        noEventIdleMs: idleMs,
        willAbort: false,
      }, "debug");

      if (totalMs > STREAM_HARD_TIMEOUT_MS) {
        earlyFallbackTriggered = true;
        composeMode = "stream_then_retry";
        pushAgentDebugEvent("COMPOSE_LOCAL_STREAM_ABORT_SAFE", {
          reason: "hard_timeout",
          providerType,
          modelLabel,
          elapsedMs: totalMs,
        }, "warn");
        pushAgentDebugEvent("ANSWER_STREAM_FALLBACK_SAFE", {
          fallbackReason: "hard_timeout",
          fromMode: "stream",
          toMode: "non_stream",
          streamedChars: streamedContent.length,
          reasoningPartCount,
          textDeltaPartCount: textDeltaReceived ? 1 : 0,
        }, "warn");
        composeLocalAbortController.abort("compose hard timeout");
      } else if (idleMs > STREAM_IDLE_TIMEOUT_MS && !textDeltaReceived) {
        earlyFallbackTriggered = true;
        composeMode = "stream_then_retry";
        pushAgentDebugEvent("COMPOSE_LOCAL_STREAM_ABORT_SAFE", {
          reason: "idle_timeout",
          providerType,
          modelLabel,
          elapsedMs: totalMs,
          idleMs,
        }, "warn");
        pushAgentDebugEvent("ANSWER_STREAM_FALLBACK_SAFE", {
          fallbackReason: "idle_timeout",
          fromMode: "stream",
          toMode: "non_stream",
          streamedChars: streamedContent.length,
          reasoningPartCount,
          textDeltaPartCount: textDeltaReceived ? 1 : 0,
        }, "warn");
        composeLocalAbortController.abort("compose idle timeout");
      }
    }, 5000);

    if (state.trace) {
      console.info("[KB-AGENT | ANSWER_STREAM_START]", {
        mode: state.mode,
        evidenceItemCount: evidencePack.items.length,
      });
    }

    pushAgentDebugEvent("ANSWER_STREAM_START_SAFE", {
      providerType,
      modelLabel,
      thinkingMode,
      reasoningCapability: effectiveCapability,
      reasoningControlApplied: reasoningApplied,
      reasoningControlSkippedReason: skippedReason ?? null,
      composeMode: composeStrategy.strategy,
      requestedComposeMode,
      hasOnAnswerChunk: !!state.runtime?.onAnswerChunk,
      evidenceItemCount: evidencePack.items.length,
    }, "info");

    const emitProgressIfAvailable = (phase: string, detail?: string) => {
      if (state.runtime?.onProgress) {
        state.runtime.onProgress({ phase, detail } as any);
      }
    };

    try {
      await streamLlm(
        prompt,
        {
          onChunk: ({ chunk, fullContent }: { chunk: string; fullContent: string }) => {
            lastPartTime = Date.now();
            streamedContent = fullContent;
            chunkCount++;
            if (!textDeltaReceived) {
              textDeltaReceived = true;
              firstTextTimeMs = Date.now() - streamStartTime;
              pushAgentDebugEvent("ANSWER_FIRST_TEXT_DELTA_SAFE", {
                timeToFirstTextMs: firstTextTimeMs,
                deltaChars: chunk.length,
                providerType,
                modelLabel,
                thinkingMode,
                reasoningCapability: effectiveCapability,
                reasoningControlApplied: reasoningApplied,
                reasoningPartCountBeforeText: reasoningDeltaPartCountBeforeText,
                hiddenReasoningCharsBeforeText,
                composeMode,
              }, "info");
              if (!answerStartCalled) {
                answerStartCalled = true;
                state.runtime?.onAnswerStart?.();
              }
              emitProgressIfAvailable("streaming_answer", "正在生成回答");
            }
            if (chunkCount % 10 === 0 || fullContent.length < 100) {
              pushAgentDebugEvent("ANSWER_STREAM_CHUNK_SAFE", {
                chunkIndex: chunkCount,
                deltaChars: chunk.length,
                totalStreamedChars: fullContent.length,
              }, "debug");
            }
            state.runtime?.onAnswerChunk?.({ chunk, fullContent });
          },
          onFinish: async (fullContent: string) => {
            clearInterval(streamIdleCheckId);
            clearTimeout(slowStartHintId);
            streamedContent = fullContent;
            streamFinished = true;
            const durationMs = Date.now() - streamStartTime;
            console.info("[KB-AGENT | FINAL_ANSWER_LATENCY_SAFE]", {
              composeMode,
              requestedComposeMode,
              resolvedComposeMode: composeMode,
              visibleThinkingEnabled: thinkingMode === "on",
              timeToFirstTextMs: firstTextTimeMs,
              timeToFallbackMs: earlyFallbackTriggered ? STREAM_IDLE_TIMEOUT_MS : undefined,
              reasoningPartCount,
              reasoningDeltaPartCountBeforeText,
              hiddenReasoningPartCount,
              hiddenReasoningChars,
              hiddenReasoningCharsBeforeText,
              hasVisibleThinking: thinkingMode === "on",
              providerReasoningControlApplied: reasoningApplied,
              providerReasoningControlSkippedReason: skippedReason ?? null,
              answerChars: fullContent.length,
              promptChars: prompt.length,
              evidencePromptChars: composeResult.promptContentChars,
              maxOutputTokens: DEFAULT_FINAL_ANSWER_MAX_OUTPUT_TOKENS,
              evidenceItemCount: evidencePack.items.length,
              providerType,
              providerFamily: capabilityProfile.providerFamily,
              modelLabel,
              durationMs,
            });
            pushAgentDebugEvent("ANSWER_STREAM_PART_STATS_SAFE", {
              streamPartCount: chunkCount + reasoningDeltaPartCount,
              reasoningStartCount: reasoningPartCount,
              reasoningDeltaPartCount,
              textDeltaPartCount: chunkCount,
              elapsedMs: durationMs,
              hasAnyPart: chunkCount > 0 || reasoningDeltaPartCount > 0,
              providerType,
              composeMode,
            }, "info");
            if (state.trace) {
              if (fullContent.trim().length > 0) {
                console.info("[KB-AGENT | ANSWER_STREAM_FINISH]", {
                  answerChars: fullContent.length,
                  chunkCount,
                  durationMs,
                  evidenceItemCount: evidencePack.items.length,
                });
              } else {
                console.info("[KB-AGENT | ANSWER_STREAM_EMPTY_FINISH_SUPPRESSED_SAFE]", {
                  answerChars: fullContent.length,
                  chunkCount,
                  durationMs,
                  evidenceItemCount: evidencePack.items.length,
                  reason: "empty_fullContent",
                });
              }
            }
            pushAgentDebugEvent("ANSWER_STREAM_FINISH_SAFE", {
              totalStreamedChars: fullContent.length,
              finishReason: fullContent.trim().length > 0 ? "completed" : "empty",
              fallbackUsed: earlyFallbackTriggered || composeMode === "stream_then_retry",
              providerType,
              composeMode,
              durationMs,
              chunkCount,
            }, "info");
            if (fullContent.trim().length > 0) {
              state.runtime?.onAnswerFinish?.(fullContent);
            }
          },
          onError: (error: Error) => {
            clearInterval(streamIdleCheckId);
            clearTimeout(slowStartHintId);
            if ((error as any).errorType === "LOCAL_ABORT_EMPTY_CONTENT") {
              console.info("[KB-AGENT | COMPOSE_STREAM_LOCAL_ABORT_EMPTY_CONTENT_SAFE]", {
                providerType,
                modelLabel,
                earlyFallbackTriggered,
              });
              streamError = error;
              return;
            }
            const errorMessage = error.message || String(error);
            warnings.push(`最终回答流式调用失败：${errorMessage}`);
            streamError = error;
          },
          onStreamStatus: (event) => {
            lastPartTime = Date.now();
            if (event.type === "reasoning-start") {
              reasoningPartCount++;
              if (thinkingMode === "on") {
                if (!textDeltaReceived) {
                  emitProgressIfAvailable("composing_answer", "正在组织回答");
                }
                if (state.runtime?.onReasoningStart) {
                  reasoningActive = true;
                  state.runtime.onReasoningStart();
                }
              } else {
                hiddenReasoningPartCount++;
              }
            } else if (event.type === "reasoning-delta") {
              reasoningDeltaPartCount++;
              if (thinkingMode === "on" && event.delta && reasoningActive) {
                reasoningContent += event.delta;
                state.runtime?.onReasoningChunk?.({ chunk: event.delta, fullContent: reasoningContent });
              } else if (thinkingMode !== "on" && event.delta) {
                const deltaLen = typeof event.delta === "string" ? event.delta.length : 0;
                hiddenReasoningChars += deltaLen;
                if (!textDeltaReceived) {
                  hiddenReasoningCharsBeforeText += deltaLen;
                  reasoningDeltaPartCountBeforeText++;
                }
              }
            } else if (event.type === "reasoning-end") {
              if (thinkingMode === "on" && reasoningActive) {
                reasoningActive = false;
                state.runtime?.onReasoningFinish?.(reasoningContent);
              }
            }
          },
        },
        { temperature: 0.2, maxOutputTokens: DEFAULT_FINAL_ANSWER_MAX_OUTPUT_TOKENS, abortSignal: combinedAbortSignal, reasoningEffort: resolvedReasoningEffort, providerOptions: resolvedProviderOptions, __evidenceItemCount: evidencePack.items.length } as any,
        combinedAbortSignal
      );
    } catch (thrownErr) {
      clearInterval(streamIdleCheckId);
      clearTimeout(slowStartHintId);
      if (!streamError) {
        streamError = thrownErr instanceof Error ? thrownErr : new Error(String(thrownErr));
        if ((streamError as any).errorType !== "LOCAL_ABORT_EMPTY_CONTENT") {
          const errorMessage = streamError.message || String(streamError);
          warnings.push(`最终回答流式调用失败：${errorMessage}`);
        }
      }
    }

    if (streamError && reasoningApplied && isReasoningParameterRejection(streamError)) {
      cacheReasoningUnsupported(providerType, modelId);
      pushAgentDebugEvent("FINAL_ANSWER_REASONING_RETRY_WITHOUT_CONTROL_SAFE", {
        providerType,
        modelLabel,
        modelId,
        thinkingMode,
        reasoningCapability: effectiveCapability,
        originalError: streamError.message?.substring(0, 100),
      }, "warn");

      streamError = null;
      streamedContent = "";
      warnings.length = 0;

      try {
        await streamLlm(
          prompt,
          {
            onChunk: ({ chunk, fullContent }) => {
              streamedContent = fullContent;
              chunkCount++;
              if (!textDeltaReceived) {
                textDeltaReceived = true;
                emitProgressIfAvailable("streaming_answer", "正在生成回答");
              }
              state.runtime?.onAnswerChunk?.({ chunk, fullContent });
            },
            onFinish: async (fullContent) => {
              clearTimeout(slowStartHintId);
              streamedContent = fullContent;
              streamFinished = true;
              state.runtime?.onAnswerFinish?.(fullContent);
            },
            onError: (error) => {
              clearTimeout(slowStartHintId);
              const errorMessage = error.message || String(error);
              warnings.push(`最终回答流式调用失败：${errorMessage}`);
              streamError = error;
            },
          },
          { temperature: 0.2, abortSignal: combinedAbortSignal, __evidenceItemCount: evidencePack.items.length } as any,
          combinedAbortSignal
        );
      } catch (retryErr) {
        clearTimeout(slowStartHintId);
        if (!streamError) {
          streamError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          warnings.push(`重试调用失败：${streamError.message}`);
        }
      }
    }

    if (streamError) {
      const rejectionInfo = getProviderRejectionInfo(streamError);
      const explicitProviderRejected = (streamError as any).providerRejected === true
        || (streamError as any).providerRejectionInfo?.rejected === true;
      const isEmptyStreamContent = (streamError as any).errorType === "EMPTY_STREAM_CONTENT"
        || (streamError as any).errorType === "LOCAL_ABORT_EMPTY_CONTENT";

      if (rejectionInfo.rejected || explicitProviderRejected) {
        if (!streamFinished) {
          state.runtime?.onAnswerFinish?.(PROVIDER_REJECTED_ANSWER);
          streamFinished = true;
        }
        return buildProviderRejectedComposeResult(
          state,
          traceLog,
          warnings,
          evidencePack,
          rejectionInfo,
          streamError,
          streamedContent.length
        );
      }

      if (isEmptyStreamContent) {
        pushAgentDebugEvent("COMPOSE_STREAM_EMPTY_RETRY_NON_STREAM_SAFE", {
          evidenceItemCount: evidencePack.items.length,
          promptChars: prompt.length,
        }, "warn");

        composeMode = "stream_then_retry";
        const fallbackLocalAbortController2 = new AbortController();
        if (userAbortSignal?.aborted) {
          fallbackLocalAbortController2.abort(userAbortSignal.reason);
        } else if (userAbortSignal) {
          userAbortSignal.addEventListener("abort", () => fallbackLocalAbortController2.abort(userAbortSignal.reason), { once: true });
        }
        const fallbackAbortSignal2 = fallbackLocalAbortController2.signal;
        const fallbackStartTime2 = Date.now();

        console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_START_SAFE]", {
          providerType,
          modelLabel,
          evidenceItemCount: evidencePack.items.length,
        });

        try {
          const nonStreamResponse = await callLlm(prompt, { temperature: 0.2, abortSignal: fallbackAbortSignal2 });
          const fallbackContent = nonStreamResponse.content?.trim() ?? "";
          const fallbackDurationMs = Date.now() - fallbackStartTime2;

          if (fallbackContent.length > 0) {
            composedAnswer = fallbackContent;
            streamedContent = composedAnswer;
            console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_SUCCESS_SAFE]", {
              providerType,
              modelLabel,
              evidenceItemCount: evidencePack.items.length,
              answerChars: composedAnswer.length,
              durationMs: fallbackDurationMs,
            });
            console.info("[KB-AGENT | ANSWER_FALLBACK_FINISH_SAFE]", {
              answerChars: composedAnswer.length,
              providerType,
              modelLabel,
              fallbackKind: "empty_stream_content",
            });
            if (!answerStartCalled) {
              answerStartCalled = true;
              state.runtime?.onAnswerStart?.();
            }
            if (!textDeltaReceived) {
              state.runtime?.onAnswerChunk?.({ chunk: composedAnswer, fullContent: composedAnswer });
            }
            state.runtime?.onAnswerFinish?.(composedAnswer);
          } else {
            console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_FAILED_SAFE]", {
              providerType,
              modelLabel,
              evidenceItemCount: evidencePack.items.length,
              answerChars: 0,
              durationMs: fallbackDurationMs,
              errorKind: "empty_non_stream_response",
            });
          }
        } catch (retryErr) {
          const fallbackDurationMs = Date.now() - fallbackStartTime2;
          const retryErrMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_FAILED_SAFE]", {
            providerType,
            modelLabel,
            evidenceItemCount: evidencePack.items.length,
            answerChars: 0,
            durationMs: fallbackDurationMs,
            errorKind: "fallback_exception",
          });
          warnings.push(`非流式重试失败：${retryErrMsg}`);
        }
      }

      if (!composedAnswer) {
        if (evidencePack.items.length > 0) {
          composedAnswer = `已找到 ${evidencePack.items.length} 条相关证据，但回答生成失败。请稍后重试。`;
        } else {
          composedAnswer = `当前没有足够证据回答这个问题。`;
        }
      }

      if (thinkingMode === "on" && reasoningContent.length === 0) {
        pushAgentDebugEvent("FINAL_ANSWER_NO_REASONING_STREAM_SAFE", {
          thinkingMode,
          providerType,
          modelLabel,
          reasoningPartCount: 0,
        }, "info");
      }

      return {
        state: {
          ...state,
          currentAction: undefined,
          finalAnswerAction: undefined,
          composedAnswer,
          finalEvidencePack: buildEmptyInsufficientEvidencePack(),
          footerReferences: [],
          finalEvidenceDocIds: [],
          droppedReferenceDocIds: [],
          warnings,
          traceLog,
        },
      };
    }

    composedAnswer = streamedContent.trim() || "";

    const emptyStreamContentDetected = composedAnswer.length === 0 || (earlyFallbackTriggered && !textDeltaReceived);
    const fallbackRequired = earlyFallbackTriggered || (streamedContent.trim().length === 0 && reasoningPartCount > 0);

    if (fallbackRequired || emptyStreamContentDetected) {
      console.info("[KB-AGENT | COMPOSE_STREAM_EMPTY_CONTENT_DETECTED_SAFE]", {
        providerType,
        modelLabel,
        reasoningPartCount,
        textDeltaReceived,
        streamedChars: streamedContent.length,
        fallbackRequired,
        earlyFallbackTriggered,
      });

      composeMode = "stream_then_retry";

      const fallbackLocalAbortController = new AbortController();
      if (userAbortSignal?.aborted) {
        fallbackLocalAbortController.abort(userAbortSignal.reason);
      } else if (userAbortSignal) {
        userAbortSignal.addEventListener("abort", () => fallbackLocalAbortController.abort(userAbortSignal.reason), { once: true });
      }
      const fallbackAbortSignal = fallbackLocalAbortController.signal;

      const fallbackStartTime = Date.now();
      console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_START_SAFE]", {
        providerType,
        modelLabel,
        evidenceItemCount: evidencePack.items.length,
      });

      try {
        const nonStreamResponse = await callLlm(prompt, { temperature: 0.2, abortSignal: fallbackAbortSignal });
        const fallbackContent = nonStreamResponse.content?.trim() ?? "";
        const fallbackDurationMs = Date.now() - fallbackStartTime;

        if (fallbackContent.length > 0) {
          composedAnswer = fallbackContent;
          streamedContent = composedAnswer;

          console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_SUCCESS_SAFE]", {
            providerType,
            modelLabel,
            evidenceItemCount: evidencePack.items.length,
            answerChars: composedAnswer.length,
            durationMs: fallbackDurationMs,
          });
          console.info("[KB-AGENT | ANSWER_FALLBACK_FINISH_SAFE]", {
            answerChars: composedAnswer.length,
            providerType,
            modelLabel,
            fallbackKind: "reasoning_only_or_early_fallback",
          });

          if (!answerStartCalled) {
            answerStartCalled = true;
            state.runtime?.onAnswerStart?.();
          }
          if (!textDeltaReceived) {
            state.runtime?.onAnswerChunk?.({ chunk: composedAnswer, fullContent: composedAnswer });
          }
          state.runtime?.onAnswerFinish?.(composedAnswer);
        } else {
          console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_FAILED_SAFE]", {
            providerType,
            modelLabel,
            evidenceItemCount: evidencePack.items.length,
            answerChars: 0,
            durationMs: fallbackDurationMs,
            errorKind: "empty_non_stream_response",
          });

          if (evidencePack.items.length > 0) {
            composedAnswer = `已读取到 ${evidencePack.items.length} 条证据，但最终回答生成失败，请重试或更换模型。`;
          } else {
            composedAnswer = `当前没有足够证据回答这个问题。`;
          }
          if (!answerStartCalled) {
            answerStartCalled = true;
            state.runtime?.onAnswerStart?.();
          }
          if (!textDeltaReceived) {
            state.runtime?.onAnswerChunk?.({ chunk: composedAnswer, fullContent: composedAnswer });
          }
          state.runtime?.onAnswerFinish?.(composedAnswer);
        }
      } catch (fallbackErr) {
        const fallbackDurationMs = Date.now() - fallbackStartTime;
        const fallbackErrMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);

        console.info("[KB-AGENT | COMPOSE_NON_STREAM_FALLBACK_FAILED_SAFE]", {
          providerType,
          modelLabel,
          evidenceItemCount: evidencePack.items.length,
          answerChars: 0,
          durationMs: fallbackDurationMs,
          errorKind: "fallback_exception",
        });

        warnings.push(`非流式 fallback 失败：${fallbackErrMsg}`);

        if (evidencePack.items.length > 0) {
          composedAnswer = `已读取到 ${evidencePack.items.length} 条证据，但最终回答生成失败，请重试或更换模型。`;
        } else {
          composedAnswer = `当前没有足够证据回答这个问题。`;
        }
        if (!answerStartCalled) {
          answerStartCalled = true;
          state.runtime?.onAnswerStart?.();
        }
        if (!textDeltaReceived) {
          state.runtime?.onAnswerChunk?.({ chunk: composedAnswer, fullContent: composedAnswer });
        }
        state.runtime?.onAnswerFinish?.(composedAnswer);
      }
    }

    console.info("[KB-AGENT | FINAL_ANSWER_LATENCY_SAFE]", {
      composeMode,
      requestedComposeMode,
      resolvedComposeMode: composeMode,
      visibleThinkingEnabled: thinkingMode === "on",
      timeToFirstTextMs: firstTextTimeMs,
      timeToFallbackMs: earlyFallbackTriggered ? STREAM_IDLE_TIMEOUT_MS : undefined,
      reasoningPartCount,
      reasoningDeltaPartCountBeforeText,
      hiddenReasoningPartCount,
      hiddenReasoningChars,
      hiddenReasoningCharsBeforeText,
      hasVisibleThinking: thinkingMode === "on",
      providerReasoningControlApplied: reasoningApplied,
      providerReasoningControlSkippedReason: skippedReason ?? null,
      answerChars: composedAnswer.length,
      promptChars: prompt.length,
      evidencePromptChars: composeResult.promptContentChars,
      maxOutputTokens: DEFAULT_FINAL_ANSWER_MAX_OUTPUT_TOKENS,
      evidenceItemCount: evidencePack.items.length,
      providerType,
      providerFamily: capabilityProfile.providerFamily,
      modelLabel,
      fallbackRequired,
      emptyStreamContentDetected,
      fallbackSucceeded: fallbackRequired && composedAnswer.length > 0,
      finalAnswerChars: composedAnswer.length,
    });

    if (reasoningApplied && reasoningPartCount > 0) {
      pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
        providerType,
        modelLabel,
        reasoningControlApplied: reasoningApplied,
        reasoningPartCount,
        reasoningChars: hiddenReasoningChars,
        effective: false,
        reasonCode: "provider_still_returned_reasoning",
      }, "info");
    } else if (reasoningApplied && reasoningPartCount === 0) {
      pushAgentDebugEvent("PROVIDER_REASONING_CONTROL_EFFECT_SAFE", {
        providerType,
        modelLabel,
        reasoningControlApplied: reasoningApplied,
        reasoningPartCount: 0,
        reasoningChars: 0,
        effective: true,
      }, "info");
    }
  } else {
    try {
      let response = await callLlm(prompt, { temperature: 0.2, abortSignal: state.runtime?.abortSignal });
      composedAnswer = response.content;

      // 工具调用泄露检测：如果输出包含工具调用格式，追加 repair instruction 重新生成一次
      const toolCallLeakRegex = /<function_calls>|<\/function_calls>|<function_call>|<\/function_call>|tool_call|arguments.*:.*\{/i;
      if (toolCallLeakRegex.test(composedAnswer)) {
        pushAgentDebugEvent("ANSWER_TOOL_CALL_LEAK_BLOCKED_SAFE", {
          detectedPatterns: composedAnswer.match(toolCallLeakRegex)?.[0] ?? "unknown",
          retryAttempt: 1,
        }, "warn");

        const repairInstruction = "\n\n=== 系统修复指令 ===\n你正在写最终答案，不能调用工具，不能输出工具调用格式。请直接输出回答正文，不要包含任何工具调用标记。";
        const retryPrompt = prompt + repairInstruction;

        response = await callLlm(retryPrompt, { temperature: 0.2, abortSignal: state.runtime?.abortSignal });
        composedAnswer = response.content;

        if (toolCallLeakRegex.test(composedAnswer)) {
          pushAgentDebugEvent("ANSWER_TOOL_CALL_LEAK_BLOCKED_SAFE", {
            detectedPatterns: composedAnswer.match(toolCallLeakRegex)?.[0] ?? "unknown",
            retryAttempt: 2,
            finalDecision: "blocked",
          }, "warn");

          composedAnswer = "模型在最终回答阶段输出了工具调用格式，本轮未能生成有效回答，请重试。";
          streamedContent = composedAnswer;

          return {
            state: {
              ...state,
              currentAction: undefined,
              finalAnswerAction: undefined,
              composedAnswer,
              finalEvidencePack: buildEmptyInsufficientEvidencePack(),
              footerReferences: [],
              finalEvidenceDocIds: [],
              droppedReferenceDocIds: [],
              warnings: [...warnings, "工具调用格式泄露，已拦截并重试，但仍失败"],
              traceLog,
            },
          };
        }
      }

      console.info("[KB-AGENT | FINAL_ANSWER_LATENCY_SAFE]", {
        composeMode,
        timeToFirstTextMs: null,
        timeToFallbackMs: null,
        reasoningPartCount: 0,
        reasoningDeltaPartCountBeforeText: 0,
        hiddenReasoningPartCount: 0,
        hiddenReasoningChars: 0,
        hiddenReasoningCharsBeforeText: 0,
        hasVisibleThinking: false,
        providerReasoningControlApplied: false,
        providerReasoningControlSkippedReason: null,
        answerChars: composedAnswer.length,
        promptChars: prompt.length,
        evidencePromptChars: composeResult.promptContentChars,
        maxOutputTokens: DEFAULT_FINAL_ANSWER_MAX_OUTPUT_TOKENS,
        evidenceItemCount: evidencePack.items.length,
        providerType,
        providerFamily: capabilityProfile.providerFamily,
        modelLabel,
      });

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        traceLog.push({
          name: "compose_answer",
          status: "skipped",
          detail: "模型调用被中断信号取消",
        });
        return {
          state: {
            ...state,
            warnings: [...warnings, "回答生成已中断"],
            traceLog,
          },
        };
      }

      if (err instanceof AiProviderUnavailableError) {
        if (state.trace) {
          console.info("[KB-AGENT | AI_PROVIDER_UNAVAILABLE]", {
            providerType: err.providerType,
            providerLabel: err.providerLabel,
            modelLabel: err.modelId,
            status: err.status,
            errorType: err.errorType,
          });
        }
        throw err;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      
      if (isProviderRejectedError(err)) {
        const rejectionInfo = getProviderRejectionInfo(err);
        return buildProviderRejectedComposeResult(
          state,
          traceLog,
          warnings,
          evidencePack,
          rejectionInfo,
          err instanceof Error ? err : new Error(String(err)),
          streamedContent.length
        );
      }

      warnings.push(`最终回答模型调用失败：${errorMessage}`);

      traceLog.push({
        name: "compose_answer",
        status: "failed",
        detail: `模型调用失败：${errorMessage}`,
      });

      // 保守回答
      if (evidencePack.items.length > 0) {
        composedAnswer = `已找到 ${evidencePack.items.length} 条相关证据，但回答生成失败。请稍后重试。`;
      } else {
        composedAnswer = `当前没有足够证据回答这个问题。`;
      }

      return {
        state: {
          ...state,
          currentAction: undefined,
          finalAnswerAction: undefined,
          composedAnswer,
          finalEvidencePack: buildEmptyInsufficientEvidencePack(),
          footerReferences: [],
          finalEvidenceDocIds: [],
          droppedReferenceDocIds: [],
          warnings,
          traceLog,
        },
      };
    }
  }

  // 4. 生成 footerReferences（回答生成后按使用度排序）
  // 必须使用 promptEvidencePack（模型实际看到的证据），而不是原始 evidencePack
  const droppedNonPromptReferenceCount = evidencePack.items.length - promptEvidencePack.items.length;
  const footerReferences = buildFooterReferencesFromAgenticEvidencePack(promptEvidencePack, {
    answerText: composedAnswer,
    finalEvidenceDocIds: state.finalEvidenceDocIds,
    droppedReferenceDocIds: state.droppedReferenceDocIds,
  });

  const footerPromptLockPayload = {
    promptEvidenceItemCount: promptEvidencePack.items.length,
    usedHandleCount: footerReferences.length,
    displayedReferenceCount: footerReferences.length,
    droppedNonPromptReferenceCount,
    selectedBy: composedAnswer.includes("EVIDENCE_USED") ? "explicit_handles" : "evidence_order",
  };
  traceLog.push({
    name: "FOOTER_REFERENCE_PROMPT_LOCK_SAFE",
    status: "success",
    detail: JSON.stringify(footerPromptLockPayload),
  });
  pushAgentDebugEvent("FOOTER_REFERENCE_PROMPT_LOCK_SAFE", footerPromptLockPayload, "info");

  debugFooterReferencesSafe(state.trace, state.counters.stepCount, footerReferences.map((ref, idx) => ({
    index: idx + 1,
    docTitle: ref.docTitle,
  })));

  // Fast path debug: footer references filtered
  if (state.finalEvidenceDocIds && state.finalEvidenceDocIds.length > 0) {
    debugEvidencePackFilteredSafe(state.trace, state.counters.stepCount, {
      totalItems: state.workspace.readDocuments.length,
      filteredItems: evidencePack.items.length,
      usedEvidenceDocCount: evidencePack.items.length,
      droppedReferenceDocCount: state.droppedReferenceDocIds?.length ?? 0,
      candidateButUnusedDocCount: 0,
    });
    debugFooterReferencesFilteredSafe(state.trace, state.counters.stepCount, {
      totalRefs: footerReferences.length,
      filteredRefs: footerReferences.length,
      usedEvidenceDocCount: evidencePack.items.length,
      droppedReferenceDocCount: state.droppedReferenceDocIds?.length ?? 0,
    });
  }

  traceLog.push({
    name: "compose_answer",
    status: "success",
    detail: `回答已生成：${composedAnswer.length} 字符，${evidencePack.items.length} 条证据`,
  });

  return {
    state: {
      ...state,
      composedAnswer,
      finalEvidencePack: evidencePack,
      footerReferences,
      warnings,
      traceLog,
    },
  };
}
