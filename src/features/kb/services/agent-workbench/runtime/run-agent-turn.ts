/**
 * Agent turn entry point for the thin Agent Workbench runtime.
 *
 * Uses AgentLoop (thin harness) + ToolRegistry + SkillRegistry.
 * No loop-owned step cap and no business logic in the loop.
 */

import { createAgentWorkbenchRuntime, refreshUserSkills } from "./create-agent-workbench";
import { SiyuanToolRuntimeState } from "../tools/siyuan/siyuan-tool-runtime";
import { AgentLoop } from "./agent-loop";
import { ToolExecutor } from "./tool-executor";
import { PromptJsonPlannerProvider } from "./planner-provider";
import { callModelJson } from "../../qa/kb-model-call";
import { getKbSettings } from "../../settings/kb-settings-service";
import { loadData as loadPluginData } from "../storage/notebrain-plugin-storage";
import { resolveAgentScope } from "../scope/resolve-scope";
import type { AgentScopeMode } from "../scope/types";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { AgentTurnResult } from "../contracts/turn-result";
import type { ChatModelSelection } from "../../../types/chat-model-selection";
import type { ThinkingMode } from "../../../types/session";
import { saveTurnTrace } from "./turn-trace-store";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import { plannerDecisionZodSchema } from "../contracts/planner-decision";
import {
  buildReferenceGroundingSet,
  collectObservationReferences,
  mergeAnswerReferences,
  normalizeAnswerReferences,
  toFooterReferenceItems,
} from "./reference-collector";
import type { AgentWorkbenchRuntimeOptions } from "./create-agent-workbench";
import { streamFinalAnswerFromDraft } from "./final-answer-composer";
import { hydrateAttachedDocsForTurn } from "./attached-doc-hydration";
import { readGlobalMemory, validateGlobalMemoryDocId } from "../memory/global-memory-doc";
import { BUILTIN_KB_SKILL_NAME } from "../skills/builtin/knowledge-base-qa.skill";
import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "../skills/builtin/schedule-task-diary.skill";

// Web search provider factory (imports only factories, no side effects)
import { createAnySearchProvider } from "../tools/web-search/providers/anysearch.provider";
import { createCustomJsonProvider } from "../tools/web-search/providers/custom-json.provider";
import { createTavilyProvider } from "../tools/web-search/providers/tavily.provider";
import type { WebSearchProvider } from "../tools/web-search/web-search-provider";

function createWebSearchProvider(ws: {
  provider: string;
  apiKey?: string;
  searchEndpoint?: string;
  anySearchZone?: "cn" | "intl";
  anySearchLanguage?: string;
  timeoutMs: number;
}): WebSearchProvider | null {
  try {
    switch (ws.provider) {
      case "anysearch":
        return createAnySearchProvider({ apiKey: ws.apiKey, anySearchZone: ws.anySearchZone, anySearchLanguage: ws.anySearchLanguage, timeoutMs: ws.timeoutMs });
      case "custom_json":
        return createCustomJsonProvider({ searchEndpoint: ws.searchEndpoint, timeoutMs: ws.timeoutMs });
      case "tavily":
        return createTavilyProvider({ apiKey: ws.apiKey, timeoutMs: ws.timeoutMs });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

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
  /** Reasoning stream callback: only called when thinkingMode=on and model returns reasoning */
  onReasoningDelta?: (event: { type: "reasoning-start" | "reasoning-delta" | "reasoning-end"; delta?: string }) => void;
  /** 全局记忆内容（已截断处理）。若传入则优先使用，不再自行读取设置。 */
  globalMemory?: string;
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
    const userThinkingMode = options.thinkingMode ?? "off";

    const first = await callModelJson(
      prompt,
      plannerDecisionZodSchema,
      userThinkingMode,
      {
        abortSignal: opts.abortSignal ?? options.abortSignal,
        purpose: "planner",
        chatModelSelection: options.chatModelSelection,
      },
    );
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

  const deps = new SiyuanToolRuntimeState({ scope, loadPluginData });

  // Build web search deps from conversation context + settings
  let webSearchToolDeps: AgentWorkbenchRuntimeOptions["webSearchToolDeps"] | undefined;
  let webReadPageToolDeps: AgentWorkbenchRuntimeOptions["webReadPageToolDeps"] | undefined;
  const settings = await getKbSettings();
  const ws = settings.webSearch;

  const webSearchAccess = params.conversationContext?.currentTurn?.webAccess;
  if (webSearchAccess?.enabled && ws.enabled) {
    const provider = createWebSearchProvider(ws);
    if (provider) {
      webSearchToolDeps = {
        getProvider: () => provider,
        maxResults: webSearchAccess.maxResults,
        timeoutMs: ws.timeoutMs,
      };
    }
  }

  const disabledGlobalTools = new Set(settings.toolSettings?.disabledGlobalToolNames ?? []);
  const globalToolAccess = {
    readDocs: !disabledGlobalTools.has("read_docs"),
    webReadPage: !disabledGlobalTools.has("web_read_page"),
    editGlobalMemory: !disabledGlobalTools.has("edit_global_memory"),
  };

  const webReadAccess = params.conversationContext?.currentTurn?.webReadAccess;
  if (webReadAccess?.enabled && globalToolAccess.webReadPage) {
    webReadPageToolDeps = {
      readProxyEndpoint: ws.readProxyEndpoint || undefined,
      readPageMaxChars: ws.readPageMaxChars,
      timeoutMs: ws.timeoutMs,
    };
  }

  // 验证全局记忆文档 ID（一次验证，用于读取和工具注册）
  const memoryDocId = settings.globalMemory?.docId?.trim() ?? "";
  let memoryDocIdValid = false;
  if (memoryDocId) {
    const validation = await validateGlobalMemoryDocId(memoryDocId);
    memoryDocIdValid = validation.valid;
  }

  // 读取全局记忆（优先使用外部传入）
  let globalMemoryText: string | undefined = params.globalMemory;
  if (globalMemoryText === undefined && settings.globalMemory?.enabled && memoryDocIdValid) {
    const mem = await readGlobalMemory(memoryDocId, settings.globalMemory.maxChars);
    globalMemoryText = mem.content;
    if (mem.truncated) {
      globalMemoryText += "\n（记忆内容已截断）";
    }
  }

  // 注册 edit_global_memory 工具（只依赖工具未禁用；docId 有效性在 execute 阶段再验证）
  let globalMemoryToolDeps: AgentWorkbenchRuntimeOptions["globalMemoryToolDeps"] | undefined;
  if (globalToolAccess.editGlobalMemory !== false) {
    globalMemoryToolDeps = {
      docId: memoryDocId,
      maxEntryChars: 1000,
    };
  }

  const disabledBuiltinSkills = new Set(settings.skillSettings?.disabledBuiltinSkillNames ?? []);
  const builtinCapabilityAccess = {
    knowledgeBase: !disabledBuiltinSkills.has(BUILTIN_KB_SKILL_NAME),
    scheduleTaskDiary: !disabledBuiltinSkills.has(BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME),
  };

  const wb = createAgentWorkbenchRuntime({
    kbRetrievalToolDeps: deps,
    webSearchToolDeps,
    webReadPageToolDeps,
    builtinCapabilityAccess,
    globalToolAccess,
    globalMemoryToolDeps,
  });

  pushAgentDebugEvent("WEB_TOOL_REGISTRATION_SAFE", {
    mode: webSearchAccess?.mode ?? "off",
    webSearchRegistered: !!webSearchToolDeps,
    webReadPageRegistered: !!webReadPageToolDeps,
    settingsEnabled: ws.enabled,
  }, "info");

  // Load user skills (non-blocking, failures are logged not thrown)
  try {
    await refreshUserSkills(wb.skillRegistry);
  } catch (err) {
    pushAgentDebugEvent("USER_SKILL_LOAD_FAILED", { error: err instanceof Error ? err.message.slice(0, 80) : String(err) }, "warn");
  }

  const toolExecutor = new ToolExecutor(wb.toolRegistry, wb.observationLog);
  const localEvents: AgentWorkbenchEvent[] = [];

  // ── Hydrate attached docs before loop starts ──
  // User-explicitly-selected docs are treated as current-turn input material,
  // not as a Planner tool decision. Load them into observationLog so both
  // Planner and Composer can see the content without waiting for read_docs.
  const attachedDocIds = params.attachedDocs?.map((d) => d.docId).filter(Boolean) ?? [];
  if (attachedDocIds.length > 0) {
    params.onWorkbenchEvent?.({
      type: "Notice",
      message: "加载已选文档...",
      at: Date.now(),
    });

    const hydration = await hydrateAttachedDocsForTurn(attachedDocIds);

    for (const item of hydration.items) {
      wb.observationLog.push({
        kind: "skill_observation",
        summary: `用户附加文档已加载: ${item.title}`,
        content: {
          items: [{
            docId: item.docId,
            title: item.title,
            content: item.content,
            contentChars: item.contentChars,
            truncated: item.truncated,
            chunkIndex: item.chunkIndex,
            chunkCount: item.chunkCount,
          }],
          source: "attached_doc_hydration",
        },
      });
    }

    for (const err of hydration.errors) {
      wb.observationLog.push({
        kind: "skill_observation",
        summary: `用户附加文档加载失败: ${err.message}`,
        reasonCode: err.code,
        content: {
          error: { docId: err.docId, code: err.code, message: err.message },
          source: "attached_doc_hydration",
        },
      });
    }

    params.onWorkbenchEvent?.({
      type: "Notice",
      message: `已加载 ${hydration.loadedCount} 个已选文档`,
      at: Date.now(),
    });
  }

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
      userDisabledSkillNames: settings.skillSettings?.disabledBuiltinSkillNames ?? [],
      globalMemory: globalMemoryText,
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

      // Always run Composer so evidence constraints are never bypassed,
      // even when the caller only provided onAnswerFinish (non-streaming).
      params.onWorkbenchEvent?.({
        type: "Notice",
        message: "正在生成回答...",
        at: Date.now(),
      });

      const composedBody = await streamFinalAnswerFromDraft({
        question: params.question,
        observations: wb.observationLog.all(),
        draftBody: draft.body,
        onChunk: params.onAnswerChunk,
        onFinish: params.onAnswerFinish,
        onWorkbenchEvent: params.onWorkbenchEvent,
        onReasoningDelta: params.thinkingMode === "on" ? params.onReasoningDelta : undefined,
        abortSignal: params.abortSignal,
        chatModelSelection: params.chatModelSelection,
        thinkingMode: params.thinkingMode,
        globalMemory: globalMemoryText,
      });

      draft.body = composedBody;

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
