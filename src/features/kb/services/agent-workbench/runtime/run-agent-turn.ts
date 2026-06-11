/**
 * Agent turn entry point for the thin Agent Workbench runtime.
 *
 * Uses AgentLoop (thin harness) + ToolRegistry + SkillRegistry.
 * No business-specific step flow; AgentLoop only keeps a generic anti-storm safety valve.
 */

import { createAgentWorkbenchRuntime, refreshUserSkills } from "./create-agent-workbench";
import { SiyuanToolRuntimeState } from "../tools/siyuan/siyuan-tool-runtime";
import { AgentLoop } from "./agent-loop";
import { ToolExecutor } from "./tool-executor";
import { PromptJsonPlannerProvider } from "./planner-provider";
import { callModelJson } from "../../qa/kb-model-call";
import { getKbSettings } from "../../settings/kb-settings-service";
import { loadData as loadPluginData, saveData as savePluginData } from "../storage/notebrain-plugin-storage";
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
import { resolveSelectedChatConfig } from "../../settings/chat-provider-config";
import {
  mapAgentErrorToUserFacing,
  buildCompletedStepsSummary,
  type AgentTurnDisplayError,
} from "./user-facing-agent-error";
import { hydrateAttachedDocsForTurn } from "../adapters/siyuan/attached-doc-hydration";
import { readGlobalMemory, validateGlobalMemoryDocId } from "../memory/global-memory-doc";
import { BUILTIN_KB_SKILL_NAME } from "../skills/builtin/knowledge-base-qa.skill";
import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "../skills/builtin/schedule-task-diary.skill";
import { BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME } from "../skills/builtin/doc-content-editing.skill";

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
  /** 当前对话标识，用于 confirmation store 等需要关联 conversation 的场景。 */
  conversationId?: string;
  /** 已读取的 kbSettings，避免内部重复读取 getKbSettings() */
  kbSettings?: Awaited<ReturnType<typeof getKbSettings>>;
}

export interface AgentTurnOutcome {
  ok: boolean;
  result?: AgentTurnResult;
  agentErrorCode?: string;
  steps?: number;
  footerReferencesCount?: number;
  stopReasonCode?: string;
  /** 用户可读错误提示，由 UI 层展示。agentErrorCode 仍保留给 debug。 */
  displayError?: AgentTurnDisplayError;
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
    message: "message" in e ? (e as { message: string }).message : undefined,
    status: "status" in e ? (e as { status: string }).status : undefined,
    errorCode: "errorCode" in e ? (e as { errorCode: string }).errorCode : undefined,
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

  const deps = new SiyuanToolRuntimeState({ scope, loadPluginData, savePluginData });

  // Build web search deps from conversation context + settings
  let webSearchToolDeps: AgentWorkbenchRuntimeOptions["webSearchToolDeps"] | undefined;
  let webReadPageToolDeps: AgentWorkbenchRuntimeOptions["webReadPageToolDeps"] | undefined;
  const settings = params.kbSettings ?? await getKbSettings();
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
    getDocInfo: !disabledGlobalTools.has("get_doc_info"),
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
    docContentEditing: !disabledBuiltinSkills.has(BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME),
  };

  const wb = createAgentWorkbenchRuntime({
    kbRetrievalToolDeps: deps,
    webSearchToolDeps,
    webReadPageToolDeps,
    builtinCapabilityAccess,
    globalToolAccess,
    globalMemoryToolDeps,
    conversationId: params.conversationId,
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

      // ── 最终回答交付模式 ──
      // 只决定如何呈现已到达 answer 阶段的文本，不影响 Planner 决策。
      // draft_replay: 将已完整生成的 Planner draft 逐段推给 UI（不是模型真流式）
      // composer_stream: 调用 streamModelText 生成最终回答（真实模型流式输出）
      // draft_direct: 不调用模型、不 UI 回放，直接返回完整 draft.body
      type FinalAnswerDeliveryMode = "draft_direct" | "draft_replay" | "composer_stream";

      // 从模型配置读取 finalComposeMode（已正式定义在 KbChatModelConfig 中）
      // 优先使用 params.chatModelSelection，缺失时回退到 settings 选中的模型
      const { model: selectedModel } = resolveSelectedChatConfig(
        settings.chatProviders,
        params.chatModelSelection?.providerId ?? settings.selectedChatProviderId,
        params.chatModelSelection?.modelId ?? settings.selectedChatModelId,
      );
      const composeMode: "auto" | "stream" | "non_stream" = selectedModel?.finalComposeMode ?? "auto";

      let deliveryMode: FinalAnswerDeliveryMode;
      if (composeMode === "stream") {
        deliveryMode = "composer_stream";
      } else if (composeMode === "non_stream") {
        deliveryMode = "draft_direct";
      } else {
        // "auto": 默认真实模型流式输出（composer_stream），不再走 UI 回放
        deliveryMode = "composer_stream";
      }

      if (deliveryMode === "composer_stream") {
        // 真实模型流式输出 — 调用 streamModelText（不是 UI replay）
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
      } else if ((deliveryMode as FinalAnswerDeliveryMode) === "draft_replay") {
        // UI 回放（不是模型真流式）：将已完整生成的 Planner draft.body 逐段推给 UI
        params.onWorkbenchEvent?.({
          type: "Notice",
          message: "正在显示回答...",
          at: Date.now(),
        });

        const replayResult = await replayAnswerDraftToUi({
          body: draft.body,
          abortSignal: params.abortSignal,
          onChunk: params.onAnswerChunk,
          onFinish: params.onAnswerFinish,
        });

        if (!replayResult.completed && replayResult.content.length > 0) {
          draft.body = replayResult.content;
        }
      } else {
        // draft_direct: 不调用模型、不 UI 回放
        params.onAnswerFinish?.(draft.body);
      }

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
    const allEvents = eventsForTrace;

    // 从 eventsForTrace 中倒序找到最后一个 TurnFailed 事件，提取其 errorCode 和 message
    let lastFailedErrorCode: string | undefined;
    let lastFailedMessage: string | undefined;
    for (let i = allEvents.length - 1; i >= 0; i--) {
      const ev = allEvents[i];
      if (ev.type === "TurnFailed") {
        const evRecord = ev as unknown as Record<string, unknown>;
        lastFailedErrorCode = (evRecord.errorCode as string | undefined) ?? (evRecord.status as string | undefined);
        lastFailedMessage = evRecord.message as string | undefined;
        break;
      }
    }

    const effectiveAgentErrorCode = lastFailedErrorCode ?? loopResult.status;
    const userFacing = mapAgentErrorToUserFacing({
      agentErrorCode: effectiveAgentErrorCode,
      message: lastFailedMessage ?? loopResult.status,
    });
    const summary = buildCompletedStepsSummary(allEvents);
    pushAgentDebugEvent("TURN_FAILED", {
      agentErrorCode: effectiveAgentErrorCode,
      loopStatus: loopResult.status,
      steps: loopResult.steps,
    }, "warn");
    return {
      ok: false,
      agentErrorCode: effectiveAgentErrorCode,
      steps: loopResult.steps,
      displayError: {
        ...userFacing,
        completedStepsSummary: summary?.text,
      },
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    pushAgentDebugEvent("RUN_AGENT_TURN_EXCEPTION", {
      errorName: err instanceof Error ? err.name : "unknown",
      sanitizedMessage: rawMsg.slice(0, 200),
    }, "error");

    const userFacing = mapAgentErrorToUserFacing({
      agentErrorCode: "agent_workbench_unexpected_error",
    });
    const summary = buildCompletedStepsSummary(localEvents);
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
      agentErrorCode: "agent_workbench_unexpected_error",
      stopReasonCode: "exception",
      displayError: {
        ...userFacing,
        completedStepsSummary: summary?.text,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Draft body replay helper (no model call — UI rendering only)
// ═══════════════════════════════════════════════════════════════════

interface DraftReplayResult {
  content: string;
  completed: boolean;
}

function waitForDraftReplayFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

/**
 * Split text into lines preserving trailing newline on each line.
 * splitLinesPreserveEol(text).join("") === text always.
 */
function splitLinesPreserveEol(text: string): string[] {
  const matches = text.match(/[^\n]*(?:\n|$)/g) ?? [];
  if (text.endsWith("\n") && matches.length > 0) {
    matches.pop();
  }
  return matches;
}

/**
 * Find best cut point within [min, max) that preserves punctuation.
 * Returns the index *after* the separator (i.e., separator is included in the left chunk).
 * Returns -1 if no good cut found.
 */
function findBestMarkdownCut(text: string, min: number, max: number): number {
  const candidates = ["\n", "。", "！", "？", "；", "，", ",", ".", " "];
  let best = -1;
  for (const ch of candidates) {
    const idx = text.lastIndexOf(ch, max);
    if (idx >= min && idx > best) {
      best = idx;
      if (ch === "\n") return idx + 1;
    }
  }
  if (best > 0) return best + 1;
  return -1;
}

/**
 * Push a paragraph block, splitting long blocks at punctuation boundaries.
 * All splits use block.slice(start, end) — no trim, no rewrite.
 */
function pushMarkdownBlockChunks(block: string, out: string[]): void {
  if (block.length <= 180) {
    out.push(block);
    return;
  }
  let start = 0;
  while (start < block.length) {
    let end = Math.min(start + 180, block.length);
    if (end < block.length) {
      const windowStart = Math.max(start + 80, start);
      const candidate = findBestMarkdownCut(block, windowStart, end);
      if (candidate > start) end = candidate;
    }
    out.push(block.slice(start, end));
    start = end;
  }
}

/**
 * 保真 Markdown 切片 — 不 trim、不丢弃分隔符、chunks.join("") === original.
 *
 * 策略：
 * - 使用 splitLinesPreserveEol 保留行尾换行符
 * - 代码围栏 ```…``` 作为一个完整块
 * - 表格行（连续以 | 开头的行）作为完整块
 * - 空行保留（原始换行符）
 * - 段落按行收集后用 pushMarkdownBlockChunks 切分长块
 * - 所有切分使用 slice，不 trim
 */
function buildMarkdownPreservingChunks(markdown: string): string[] {
  if (!markdown) return [];

  const lines = splitLinesPreserveEol(markdown);
  const chunks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineText = line.replace(/\r?\n$/, "");

    // Fenced code block — keep entire block as one chunk
    if (lineText.trimStart().startsWith("```")) {
      const start = i;
      i++;
      while (i < lines.length) {
        const currentText = lines[i].replace(/\r?\n$/, "");
        i++;
        if (currentText.trimStart().startsWith("```")) break;
      }
      chunks.push(lines.slice(start, i).join(""));
      continue;
    }

    // Table block — consecutive | lines as one chunk
    if (/^\s*\|/.test(lineText)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const currentText = lines[i].replace(/\r?\n$/, "");
        if (!/^\s*\|/.test(currentText)) break;
        i++;
      }
      chunks.push(lines.slice(start, i).join(""));
      continue;
    }

    // Empty line — preserve as-is (it's "\n" or "\r\n")
    if (lineText.trim().length === 0) {
      chunks.push(line);
      i++;
      continue;
    }

    // Regular paragraph — collect until empty line / fence / table
    const start = i;
    i++;
    while (i < lines.length) {
      const currentText = lines[i].replace(/\r?\n$/, "");
      if (currentText.trim().length === 0) break;
      if (currentText.trimStart().startsWith("```")) break;
      if (/^\s*\|/.test(currentText)) break;
      i++;
    }

    const block = lines.slice(start, i).join("");
    pushMarkdownBlockChunks(block, chunks);
  }

  // Fidelity assertion
  const joined = chunks.join("");
  if (joined !== markdown) {
    pushAgentDebugEvent("DRAFT_REPLAY_CHUNK_MISMATCH", {
      expectedLen: markdown.length,
      actualLen: joined.length,
      chunkCount: chunks.length,
    }, "warn");
    return [markdown];
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * 将已完整生成的 Planner draft.body 回放到 UI（UI replay，不是模型真实流式输出）。
 * 不调用大模型。只用于 draft_replay 交付模式。
 *
 * 保真要求：正常完成时 body 原文不被改写。
 */
async function replayAnswerDraftToUi(params: {
  body: string;
  abortSignal?: AbortSignal;
  onChunk?: (event: { chunk: string; fullContent: string }) => void;
  onFinish?: (fullContent: string) => void;
}): Promise<DraftReplayResult> {
  const body = typeof params.body === "string" ? params.body : "";
  if (!body) {
    params.onFinish?.("");
    return { content: "", completed: true };
  }

  if (!params.onChunk) {
    params.onFinish?.(body);
    return { content: body, completed: true };
  }

  let chunks = buildMarkdownPreservingChunks(body);

  // Debug warn: if chunker returned a single large chunk with newlines, it may still be broken
  if (chunks.length === 1 && body.length > 220 && body.includes("\n")) {
    pushAgentDebugEvent("DRAFT_REPLAY_SINGLE_CHUNK_WARN", {
      bodyLen: body.length,
    }, "warn");
  }

  // Merge adjacent small chunks if there are too many, preserving roundtrip fidelity
  const MAX_CHUNKS = 120;
  if (chunks.length > MAX_CHUNKS) {
    const merged: string[] = [];
    let pending = "";
    for (const c of chunks) {
      if (pending && pending.length + c.length > 200) {
        merged.push(pending);
        pending = c;
      } else {
        pending += c;
      }
    }
    if (pending) merged.push(pending);
    const mergedJoined = merged.join("");
    // Only swap if roundtrip is preserved
    if (mergedJoined === body) chunks = merged;
  }

  let fullContent = "";
  for (const chunk of chunks) {
    if (params.abortSignal?.aborted) {
      return { content: fullContent, completed: false };
    }
    fullContent += chunk;
    params.onChunk({ chunk, fullContent });
    await waitForDraftReplayFrame();
  }

  params.onFinish?.(body);
  return { content: body, completed: true };
}
