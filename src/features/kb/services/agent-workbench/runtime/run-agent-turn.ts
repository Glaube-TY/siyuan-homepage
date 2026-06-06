/**
 * Agent turn entry point for the thin Agent Workbench runtime.
 *
 * Uses AgentLoop (thin harness) + ToolRegistry + SkillRegistry.
 * No loop-owned step cap and no business logic in the loop.
 */

import { z } from "zod";
import { createAgentWorkbenchRuntime, refreshUserSkills } from "./create-agent-workbench";
import { SiyuanToolRuntimeState } from "../tools/siyuan/siyuan-tool-runtime";
import { AgentLoop } from "./agent-loop";
import { ToolExecutor } from "./tool-executor";
import { PromptJsonPlannerProvider } from "./planner-provider";
import { callLlmObject, type LlmCallOptions } from "../../qa/llm-client";
import { resolveReasoningEffortForCompose, resolveEffectiveCapability } from "../../qa/model-capabilities";
import { getKbSettings } from "../../settings/kb-settings-service";
import { resolveAgentScope } from "../scope/resolve-scope";
import type { AgentScopeMode } from "../scope/types";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { AgentTurnResult } from "../contracts/turn-result";
import type { ChatModelSelection } from "../../../types/chat-model-selection";
import type { ThinkingMode } from "../../qa/model-capabilities";
import { saveTurnTrace } from "./turn-trace-store";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import {
  buildReferenceGroundingSet,
  collectObservationReferences,
  mergeAnswerReferences,
  normalizeAnswerReferences,
  toFooterReferenceItems,
} from "./reference-collector";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface RunAgentTurnParams {
  question: string;
  conversationContext?: ConversationContextSnapshot;
  mode: AgentScopeMode;
  customDocIds?: string[];
  /** User-attached docs from current request (for reference grounding) */
  attachedDocs?: readonly { docId: string; title?: string }[];
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  onWorkbenchEvent?: (event: AgentWorkbenchEvent) => void;
  onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  onAnswerFinish?: (fullContent: string) => void;
}

export interface AgentTurnOutcome {
  ok: boolean;
  result?: AgentTurnResult;
  agentErrorCode?: string;
  steps?: number;
  footerReferencesCount?: number;
  stopReasonCode?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Planner provider factory
// ═══════════════════════════════════════════════════════════════════

function createPlannerProvider(options: {
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  abortSignal?: AbortSignal;
}): PromptJsonPlannerProvider {
  return new PromptJsonPlannerProvider(async (prompt, opts) => {
    let reasoningEffort: "low" | "medium" | "none" | undefined;
    let providerOptions: Record<string, Record<string, unknown>> | undefined;
    try {
      const settings = await getKbSettings();
      const providerId = options.chatModelSelection?.providerId ?? settings.selectedChatProviderId;
      const provider = (settings.chatProviders ?? []).find((p) => p.id === providerId);
      const providerType = provider?.type ?? "";
      const modelId = options.chatModelSelection?.modelId ?? settings.selectedChatModelId;
      const modelConfig = (provider?.models ?? []).find((m) => m.id === modelId);
      const userDeclaredCapability = modelConfig?.reasoningCapability;
      const capability = resolveEffectiveCapability(providerType, userDeclaredCapability);
      const resolved = resolveReasoningEffortForCompose(
        options.thinkingMode ?? "off",
        capability,
      );
      reasoningEffort = resolved.effort;
      providerOptions = resolved.providerOptions;
    } catch {
      // If settings resolution fails, proceed without reasoning effort.
    }

    const llmOptions: LlmCallOptions = {
      abortSignal: opts.abortSignal ?? options.abortSignal,
      purpose: "planner",
      maxOutputTokens: 2048,
      temperature: 0.1,
      chatModelSelection: options.chatModelSelection,
      reasoningEffort,
      providerOptions,
    };

    const looseSchema = z.object({}).passthrough();
    const first = await callLlmObject(prompt, looseSchema, llmOptions);
    if (first && typeof first === "object" && (first as { errorKind?: unknown }).errorKind === "schema_validation_failed") {
      return await callLlmObject(prompt, looseSchema, llmOptions);
    }
    return first;
  });
}

function toTraceEvents(events: AgentWorkbenchEvent[]) {
  return events.map((e) => ({
    type: e.type,
    stepIndex: e.stepIndex,
    toolName: "toolName" in e ? (e as { toolName: string }).toolName : undefined,
    ok: "ok" in e ? (e as { ok: boolean }).ok : undefined,
    durationMs: "durationMs" in e ? (e as { durationMs: number }).durationMs : undefined,
    argsPreview: "argsPreview" in e ? (e as { argsPreview: Record<string, unknown> }).argsPreview : undefined,
    outputSummary: "outputSummary" in e ? (e as { outputSummary: string }).outputSummary : undefined,
  }));
}

function delayDisplayChunk(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (abortSignal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

function findDisplayChunkEnd(text: string, start: number): number {
  const minEnd = Math.min(text.length, start + 16);
  const maxEnd = Math.min(text.length, start + 32);
  if (maxEnd >= text.length) return text.length;

  const windowText = text.slice(minEnd, maxEnd);
  const punctuationMatch = /[。！？；，、\n]/.exec(windowText);
  if (punctuationMatch?.index !== undefined) {
    return minEnd + punctuationMatch.index + 1;
  }
  return maxEnd;
}

async function emitDisplayAnswerChunks(
  fullContent: string,
  options: {
    abortSignal?: AbortSignal;
    onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
    onAnswerFinish?: (fullContent: string) => void;
  },
): Promise<string> {
  if (!options.onAnswerChunk) {
    if (!options.abortSignal?.aborted) options.onAnswerFinish?.(fullContent);
    return options.abortSignal?.aborted ? "" : fullContent;
  }

  let emitted = "";
  while (emitted.length < fullContent.length) {
    if (options.abortSignal?.aborted) return emitted;
    const start = emitted.length;
    const end = findDisplayChunkEnd(fullContent, start);
    const chunk = fullContent.slice(start, end);
    emitted = fullContent.slice(0, end);
    options.onAnswerChunk({ chunk, fullContent: emitted });
    if (end < fullContent.length) {
      await delayDisplayChunk(14, options.abortSignal);
    }
  }

  if (!options.abortSignal?.aborted) {
    options.onAnswerFinish?.(fullContent);
  }
  return emitted;
}

// ═══════════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════════

export async function runAgentTurn(
  params: RunAgentTurnParams,
): Promise<AgentTurnOutcome> {
  const resolvedScope = await resolveAgentScope({
    mode: params.mode,
    customDocIds: params.customDocIds,
  });
  const scope = resolvedScope.scope;

  const deps = new SiyuanToolRuntimeState({ scope });

  const wb = createAgentWorkbenchRuntime({
    kbRetrievalToolDeps: deps,
  });

  // Load user skills (non-blocking, failures are logged not thrown)
  try {
    await refreshUserSkills(wb.skillRegistry);
  } catch (err) {
    pushAgentDebugEvent("USER_SKILL_LOAD_FAILED", { error: err instanceof Error ? err.message.slice(0, 80) : String(err) }, "warn");
  }

  const toolExecutor = new ToolExecutor(wb.toolRegistry, wb.observationLog);
  const localEvents: AgentWorkbenchEvent[] = [];

  const loop = new AgentLoop({
    skillRegistry: wb.skillRegistry,
    toolRegistry: wb.toolRegistry,
    observationLog: wb.observationLog,
    toolExecutor,
    plannerProvider: createPlannerProvider({
      chatModelSelection: params.chatModelSelection,
      thinkingMode: params.thinkingMode,
      abortSignal: params.abortSignal,
    }),
    onEvent: (event) => {
      localEvents.push(event);
      params.onWorkbenchEvent?.(event);
    },
    abortSignal: params.abortSignal,
  });

  try {
    const loopResult = await loop.run({
      question: params.question,
      conversationContext: params.conversationContext,
      userEnabledSkillNames: [],
    });

    const eventsForTrace = localEvents.length > 0 ? localEvents : loopResult.events;

    // Save trace on all returned outcomes.
    saveTurnTrace({
      turnId: `${Date.now()}`,
      finishedAt: Date.now(),
      status: loopResult.status,
      steps: loopResult.steps,
      events: toTraceEvents(eventsForTrace),
    });

    if (loopResult.status === "answer_ready" && loopResult.answerDraft) {
      const draft = loopResult.answerDraft;

      await emitDisplayAnswerChunks(draft.body, {
        abortSignal: params.abortSignal,
        onAnswerChunk: params.onAnswerChunk,
        onAnswerFinish: params.onAnswerFinish,
      });

      // Grounding flow:
      // 1. fallbackRefs from observation log → used ONLY for groundingSet evidence.
      // 2. explicitRefs from Planner's final answer → grounded against the set.
      // 3. footerReferences come ONLY from grounded explicitRefs.
      //    If Planner writes no references, footerReferences is empty.
      const fallbackRefs = collectObservationReferences(wb.observationLog.all());
      const groundingSet = buildReferenceGroundingSet({
        observationRefs: fallbackRefs,
        conversationContext: params.conversationContext,
        scope,
        attachedDocs: params.attachedDocs,
      });
      const explicitRefs = normalizeAnswerReferences(draft.references, groundingSet);
      const mergedRefs = mergeAnswerReferences(explicitRefs, fallbackRefs);
      const footerReferences = toFooterReferenceItems(mergedRefs);

      const agentTurnResult: AgentTurnResult = {
        scope,
        scopeSummary: resolvedScope.summary,
        answer: draft.body,
        footerReferences,
        warnings: [],
        events: eventsForTrace,
        stageSummary: draft.stageSummary,
      };

      return {
        ok: true,
        steps: loopResult.steps,
        footerReferencesCount: footerReferences.length,
        result: agentTurnResult,
      };
    }

    // stopped_by_planner / fail_closed_no_planner_decision
    pushAgentDebugEvent("TURN_FAILED", { agentErrorCode: loopResult.status, steps: loopResult.steps }, "warn");
    return {
      ok: false,
      agentErrorCode: loopResult.status,
      steps: loopResult.steps,
    };
  } catch (err) {
    const agentErrorCode = err instanceof Error ? err.message.slice(0, 80) : "agent_workbench_unexpected_error";
    // Save trace even on exception
    saveTurnTrace({
      turnId: `${Date.now()}`,
      finishedAt: Date.now(),
      status: "exception",
      steps: localEvents.length > 0
        ? Math.max(...localEvents.map((event) => event.stepIndex ?? 0))
        : 0,
      events: toTraceEvents(localEvents),
    });
    return {
      ok: false,
      agentErrorCode,
      stopReasonCode: "exception",
    };
  }
}
