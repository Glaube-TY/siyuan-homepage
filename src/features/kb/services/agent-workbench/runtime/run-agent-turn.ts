import { createAgentWorkbenchRuntime, refreshUserSkills } from "./create-agent-workbench";
import { buildAgentContextInstructions } from "./agent-context-instruction-builder";
import { runNativeAgentLoop } from "./native-agent-runner";
import { SiyuanToolRuntimeState } from "../tools/siyuan/siyuan-tool-runtime";
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
import { getNotebrainRuntimeEnvironment } from "../workspace/notebrain-runtime-env";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import {
  buildReferenceGroundingSet,
  collectObservationReferences,
  toFooterReferenceItems,
} from "./reference-collector";
import type { AgentWorkbenchRuntimeOptions } from "./create-agent-workbench";
import { resolveSelectedChatConfig } from "../../settings/chat-provider-config";
import { getLastSecretDiagnostics } from "../../settings/kb-settings-service";
import {
  mapAgentErrorToUserFacing,
  buildCompletedStepsSummary,
  type AgentTurnDisplayError,
} from "./user-facing-agent-error";
import { hydrateAttachedDocsForTurn } from "../adapters/siyuan/attached-doc-hydration";
import { readGlobalMemory, validateGlobalMemoryDocId } from "../memory/global-memory-doc";
import { BUILTIN_KB_SKILL_NAME } from "../skills/builtin/knowledge-base-qa.skill";
import { setMcpRuntimeSettings } from "../mcp/mcp-client-manager";
import { BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "../skills/builtin/schedule-task-diary.skill";
import { BUILTIN_DATABASE_ASSISTANT_SKILL_NAME } from "../skills/builtin/database-assistant.skill";
import { BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME } from "../skills/builtin/doc-content-editing.skill";
import { BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME } from "../skills/builtin/notebook-doc-tree.skill";
import { BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME } from "../skills/builtin/tag-bookmark-outline.skill";
import { BUILTIN_ASSET_MANAGEMENT_SKILL_NAME } from "../skills/builtin/asset-management.skill";
import { BUILTIN_RIFF_REVIEW_SKILL_NAME } from "../skills/builtin/riff-review.skill";
import { createAnySearchProvider } from "../tools/web-search/providers/anysearch.provider";
import { createCustomJsonProvider } from "../tools/web-search/providers/custom-json.provider";
import { createTavilyProvider } from "../tools/web-search/providers/tavily.provider";
import type { WebSearchProvider } from "../tools/web-search/web-search-provider";
import { buildAgentSystemPrompt } from "../../agent-core/prompts/system-prefix";
import { createProviderAdapterForKbModel } from "../../agent-core/providers/agent-provider-factory";
import { normalizeProviderError } from "../../agent-core/providers/provider-error";
import { buildNativeToolRegistryForTurn } from "../../agent-core/tools/native-tool-registry-builder";
import {
  listAllExternalSkillEntries,
  renderExternalSkillIndexPrompt,
} from "../skills/external/external-skill-index";
import type { AgentStreamEvent } from "../../agent-core/loop/stream-event";
import { AgentSession } from "../../agent-core/session/agent-session";
import type { AgentMessage } from "../../agent-core/messages/agent-message";
import { sanitizeMessageForStorage } from "../../agent-core/session/session-store";

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
        return createAnySearchProvider({
          apiKey: ws.apiKey,
          anySearchZone: ws.anySearchZone,
          anySearchLanguage: ws.anySearchLanguage,
          timeoutMs: ws.timeoutMs,
        });
      case "custom_json":
        return createCustomJsonProvider({
          searchEndpoint: ws.searchEndpoint,
          timeoutMs: ws.timeoutMs,
        });
      case "tavily":
        return createTavilyProvider({ apiKey: ws.apiKey, timeoutMs: ws.timeoutMs });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface RunAgentTurnParams {
  question: string;
  conversationContext?: ConversationContextSnapshot;
  mode: AgentScopeMode;
  customDocIds?: string[];
  attachedDocs?: readonly { docId: string; title?: string }[];
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  onWorkbenchEvent?: (event: AgentWorkbenchEvent) => void;
  onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  onAnswerFinish?: (fullContent: string) => void;
  onReasoningDelta?: (event: { type: "reasoning-start" | "reasoning-delta" | "reasoning-end" | "reasoning-reset"; delta?: string }) => void;
  globalMemory?: string;
  conversationId?: string;
  agentSessionMessages?: readonly AgentMessage[];
  kbSettings?: Awaited<ReturnType<typeof getKbSettings>>;
}

export interface AgentTurnOutcome {
  ok: boolean;
  result?: AgentTurnResult;
  agentErrorCode?: string;
  steps?: number;
  footerReferencesCount?: number;
  stopReasonCode?: string;
  displayError?: AgentTurnDisplayError;
  agentSessionMessages?: AgentMessage[];
}

function toWorkbenchEvent(event: AgentStreamEvent): AgentWorkbenchEvent {
  return { ...event, at: Date.now() } as AgentWorkbenchEvent;
}

function toTraceEvents(events: AgentWorkbenchEvent[]) {
  return events.map((event) => ({
    type: event.type,
    stepIndex: event.stepIndex,
    toolName: "toolName" in event ? event.toolName : undefined,
    ok: event.type === "tool_result" ? event.result.ok : undefined,
    durationMs: event.type === "tool_result" ? event.durationMs : undefined,
    argsPreview: event.type === "tool_start" ? event.argsPreview : undefined,
    outputSummary: event.type === "tool_result" ? event.result.summary : undefined,
    message: "message" in event ? event.message : event.type === "assistant_final" ? event.answer : undefined,
    status: event.type === "done" ? event.status : undefined,
    errorCode: event.type === "tool_result"
      ? event.result.errorCode ?? event.result.code
      : event.type === "error"
        ? event.code
        : undefined,
  }));
}

function sanitizeAgentMessages(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.map(sanitizeMessageForStorage);
}

function buildFailureOutcome(params: {
  code: string;
  message?: string;
  steps?: number;
  events: AgentWorkbenchEvent[];
  agentSessionMessages?: AgentMessage[];
}): AgentTurnOutcome {
  const userFacing = mapAgentErrorToUserFacing({
    agentErrorCode: params.code,
    message: params.message,
  });
  const summary = buildCompletedStepsSummary(params.events);
  return {
    ok: false,
    agentErrorCode: params.code,
    steps: params.steps,
    displayError: {
      ...userFacing,
      completedStepsSummary: summary?.text,
    },
    agentSessionMessages: params.agentSessionMessages,
  };
}

export async function runAgentTurn(
  params: RunAgentTurnParams,
): Promise<AgentTurnOutcome> {
  const localEvents: AgentWorkbenchEvent[] = [];
  const conversationId = params.conversationId ?? `conv-${Date.now()}`;

  const emitNativeEvent = (event: AgentStreamEvent): AgentWorkbenchEvent => {
    const workbenchEvent = toWorkbenchEvent(event);
    localEvents.push(workbenchEvent);
    params.onWorkbenchEvent?.(workbenchEvent);
    return workbenchEvent;
  };

  try {
    const resolvedScope = await resolveAgentScope({
      mode: params.mode,
      customDocIds: params.customDocIds,
    });
    const scope = resolvedScope.scope;
    const deps = new SiyuanToolRuntimeState({ scope, loadPluginData, savePluginData });
    const settings = params.kbSettings ?? await getKbSettings();
    const ws = settings.webSearch;

    // Inject runtime tools settings for MCP command resolution
    if (settings.runtimeTools) {
      setMcpRuntimeSettings(settings.runtimeTools);
    }

    // ── Per-turn capability computation ──
    const runtimeEnv = getNotebrainRuntimeEnvironment();
    const sandboxEnabled = settings.notebrainWorkspace.enabled === true && runtimeEnv.isPcElectron;
    const localCommandToolEnabled = sandboxEnabled && settings.notebrainWorkspace.commandExecutionEnabled === true;
    const mcpClientEnabled = settings.mcp.enabled === true;

    let webSearchToolDeps: AgentWorkbenchRuntimeOptions["webSearchToolDeps"] | undefined;
    let webReadPageToolDeps: AgentWorkbenchRuntimeOptions["webReadPageToolDeps"] | undefined;

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
      webHttpGet: !disabledGlobalTools.has("web_http_get"),
      webHttpPost: !disabledGlobalTools.has("web_http_post"),
    };

    const webReadAccess = params.conversationContext?.currentTurn?.webReadAccess;
    if (webReadAccess?.enabled && globalToolAccess.webReadPage) {
      webReadPageToolDeps = {
        readProxyEndpoint: ws.readProxyEndpoint || undefined,
        readPageMaxChars: ws.readPageMaxChars,
        timeoutMs: ws.timeoutMs,
      };
    }

    const memoryDocId = settings.globalMemory?.docId?.trim() ?? "";
    let memoryDocIdValid = false;
    if (memoryDocId) {
      const validation = await validateGlobalMemoryDocId(memoryDocId);
      memoryDocIdValid = validation.valid;
    }

    let globalMemoryText: string | undefined = params.globalMemory;
    if (globalMemoryText === undefined && settings.globalMemory?.enabled && memoryDocIdValid) {
      const mem = await readGlobalMemory(memoryDocId, settings.globalMemory.maxChars);
      if (!mem.readOk) {
        globalMemoryText = "全局记忆读取失败，本轮不使用全局记忆。";
      } else if (mem.truncated) {
        globalMemoryText = `${mem.content}\n（记忆内容已截断）`;
      } else {
        globalMemoryText = mem.content;
      }
    }

    const globalMemoryToolDeps: AgentWorkbenchRuntimeOptions["globalMemoryToolDeps"] | undefined =
      settings.globalMemory?.enabled === true && memoryDocIdValid && globalToolAccess.editGlobalMemory
        ? { docId: memoryDocId, maxMemoryChars: settings.globalMemory?.maxChars ?? 8000 }
        : undefined;

    const disabledBuiltinSkills = new Set(settings.skillSettings?.disabledBuiltinSkillNames ?? []);
    const builtinCapabilityAccess = {
      knowledgeBase: !disabledBuiltinSkills.has(BUILTIN_KB_SKILL_NAME),
      scheduleTaskDiary: !disabledBuiltinSkills.has(BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME),
      databaseAssistant: !disabledBuiltinSkills.has(BUILTIN_DATABASE_ASSISTANT_SKILL_NAME),
      docContentEditing: !disabledBuiltinSkills.has(BUILTIN_DOC_CONTENT_EDITING_SKILL_NAME),
      notebookDocTree: !disabledBuiltinSkills.has(BUILTIN_NOTEBOOK_DOC_TREE_SKILL_NAME),
      tagBookmarkOutline: !disabledBuiltinSkills.has(BUILTIN_TAG_BOOKMARK_OUTLINE_SKILL_NAME),
      assetManagement: !disabledBuiltinSkills.has(BUILTIN_ASSET_MANAGEMENT_SKILL_NAME),
      riffReview: !disabledBuiltinSkills.has(BUILTIN_RIFF_REVIEW_SKILL_NAME),
    };

    const wb = createAgentWorkbenchRuntime({
      kbRetrievalToolDeps: deps,
      webSearchToolDeps,
      webReadPageToolDeps,
      builtinCapabilityAccess,
      globalToolAccess,
      globalMemoryToolDeps,
      conversationId,
      externalSkillSettings: settings.externalSkills,
      mcpSettings: settings.mcp,
      notebrainWorkspaceSettings: settings.notebrainWorkspace,
      runtimeToolsSettings: settings.runtimeTools,
    });

    pushAgentDebugEvent("WEB_TOOL_REGISTRATION_SAFE", {
      mode: webSearchAccess?.mode ?? "off",
      webSearchRegistered: !!webSearchToolDeps,
      webReadPageRegistered: !!webReadPageToolDeps,
      settingsEnabled: ws.enabled,
      webHttpGetRegistered: !disabledGlobalTools.has("web_http_get"),
      webHttpPostRegistered: !disabledGlobalTools.has("web_http_post"),
      webSearchDisabledReason: !ws.enabled ? "web_search_disabled"
        : !webSearchAccess?.enabled ? "web_access_off"
        : undefined,
    }, "info");

    // Runtime environment debug (already computed above)
    pushAgentDebugEvent("RUNTIME_ENVIRONMENT", {
      isPcElectron: runtimeEnv.isPcElectron,
      platformLabel: runtimeEnv.platformLabel,
      hasNodeRequire: runtimeEnv.hasNodeRequire,
      unsupportedCapabilities: runtimeEnv.unsupportedCapabilities,
    }, "info");

    if (settings.externalSkills?.legacyUserSkillDirectInject === true) {
      try {
        await refreshUserSkills(wb.skillRegistry);
      } catch (err) {
        pushAgentDebugEvent("USER_SKILL_LOAD_FAILED", {
          error: err instanceof Error ? err.message.slice(0, 80) : String(err),
        }, "warn");
      }
    }

    let externalSkillIndexPrompt = "";
    if (settings.externalSkills?.enabled !== false) {
      try {
        const entries = await listAllExternalSkillEntries({
          disabledSkillIds: settings.externalSkills?.disabledSkillIds ?? [],
        });
        externalSkillIndexPrompt = renderExternalSkillIndexPrompt(entries);
      } catch (err) {
        pushAgentDebugEvent("EXTERNAL_SKILL_INDEX_PROMPT_FAILED", {
          error: err instanceof Error ? err.message.slice(0, 80) : String(err),
        }, "warn");
      }
    }

    const attachedDocIds = params.attachedDocs?.map((doc) => doc.docId).filter(Boolean) ?? [];
    if (attachedDocIds.length > 0) {
      emitNativeEvent({ type: "notice", message: "加载已选文档..." });
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

      emitNativeEvent({ type: "notice", message: `已加载 ${hydration.loadedCount} 个已选文档` });
    }

    const selected = resolveSelectedChatConfig(
      settings.chatProviders,
      params.chatModelSelection?.providerId ?? settings.selectedChatProviderId,
      params.chatModelSelection?.modelId ?? settings.selectedChatModelId,
    );

    if (!selected.provider || !selected.model) {
      const code = "provider_tool_call_not_supported";
      emitNativeEvent({ type: "error", code, message: "当前没有可用于 Agent 的模型配置。" });
      saveTurnTrace({
        turnId: `${Date.now()}`,
        finishedAt: Date.now(),
        status: "failed",
        steps: 0,
        events: toTraceEvents(localEvents),
      });
      return buildFailureOutcome({ code, message: "当前没有可用于 Agent 的模型配置。", events: localEvents });
    }

    // Pre-flight: if provider needs an API key but it's empty due to decrypt failure,
    // return a clear user-facing error instead of sending empty key → 401.
    if (!selected.provider.apiKey) {
      const secretDiag = getLastSecretDiagnostics();
      const providerNeedsKey = selected.provider.type !== "openai-compatible"
        || (selected.provider.baseUrl && !selected.provider.baseUrl.includes("127.0.0.1") && !selected.provider.baseUrl.includes("localhost"));
      if (providerNeedsKey && secretDiag.hasDecryptFailure
        && secretDiag.failedChatProviderIds.includes(selected.provider.id)) {
        const code = "api_key_decrypt_failed";
        const message = "模型 API Key 解密失败，请到大模型配置重新填写。";
        emitNativeEvent({ type: "error", code, message });
        pushAgentDebugEvent("AGENT_PREFLIGHT_API_KEY_DECRYPT_FAILED", {
          providerId: selected.provider.id,
          providerType: selected.provider.type,
        }, "error");
        saveTurnTrace({
          turnId: `${Date.now()}`,
          finishedAt: Date.now(),
          status: "failed",
          steps: 0,
          events: toTraceEvents(localEvents),
        });
        return buildFailureOutcome({ code, message, events: localEvents });
      }
    }

    const provider = createProviderAdapterForKbModel({
      provider: selected.provider,
      model: selected.model,
      thinkingMode: params.thinkingMode ?? "off",
      agentThinkingEnabled: settings.agentThinkingEnabled,
    });

    if (!provider.capabilities.nativeToolCalls) {
      const code = "provider_tool_call_not_supported";
      emitNativeEvent({ type: "error", code, message: "当前模型不支持原生工具调用，不能进入 Agent 模式。" });
      saveTurnTrace({
        turnId: `${Date.now()}`,
        finishedAt: Date.now(),
        status: "failed",
        steps: 0,
        events: toTraceEvents(localEvents),
      });
      return buildFailureOutcome({
        code,
        message: "当前模型不支持原生工具调用，不能进入 Agent 模式。",
        events: localEvents,
      });
    }

    const nativeToolRegistry = await buildNativeToolRegistryForTurn({
      toolRegistry: wb.toolRegistry,
      observationLog: wb.observationLog,
      question: params.question,
      conversationId,
      abortSignal: params.abortSignal,
      docContentEditingEnabled: builtinCapabilityAccess.docContentEditing,
      notebrainWorkspaceSettings: settings.notebrainWorkspace,
      mcpSettings: settings.mcp,
      runtimeToolsSettings: settings.runtimeTools,
    });

    const context = buildAgentContextInstructions({
      toolRegistry: wb.toolRegistry,
      skillRegistry: wb.skillRegistry,
      observationLog: wb.observationLog,
      question: params.question,
      abortSignal: params.abortSignal,
      userDisabledSkillNames: settings.skillSettings?.disabledBuiltinSkillNames ?? [],
      conversationContext: params.conversationContext,
      globalMemory: globalMemoryText,
      attachedDocs: params.attachedDocs,
      externalSkillIndexPrompt,
      runtimeToolsSettings: settings.runtimeTools,
      runtimeToolCapabilities: {
        sandboxEnabled,
        localCommandToolEnabled,
        mcpClientEnabled,
      },
    });

    // Record skill routing info for debug
    const skillRoute = wb.skillRegistry.getLastRoute();
    if (skillRoute) {
      pushAgentDebugEvent("SKILL_ROUTE", {
        primarySkillId: skillRoute.primarySkillName,
        primarySkillTitle: skillRoute.primarySkillTitle,
        matchedSkillIds: skillRoute.matchedSkillIds,
        reason: skillRoute.reason,
        isTestSkillMode: skillRoute.isTestSkillMode,
        injectedSkillCount: context.skillSections.length,
      }, "info");

      // Strict skill test mode: restrict provider-visible tools to primary + helper
      if (skillRoute.isTestSkillMode && skillRoute.primarySkillName) {
        const primarySkill = wb.skillRegistry.getRegisteredSkill(skillRoute.primarySkillName);

        if (primarySkill) {
          const allowedNames = [
            ...(primarySkill.primaryToolNames ?? []),
            ...(primarySkill.helperToolNames ?? []),
          ];
          const allVisibleTools = nativeToolRegistry.listProviderVisible().map((t) => t.name);
          const filteredOut = allVisibleTools.filter((n) => !allowedNames.includes(n));
          nativeToolRegistry.setProviderVisibleAllowList(new Set(allowedNames));

          pushAgentDebugEvent("SKILL_ROUTE_FILTER_APPLIED", {
            primarySkillId: skillRoute.primarySkillName,
            allowedToolNames: allowedNames,
            filteredOutToolNames: filteredOut,
          }, "info");
        }
      }
    }

    const session = new AgentSession(conversationId, params.agentSessionMessages ?? []);
    let reasoningStarted = false;
    let answerFinished = false;

    const autoAllowedToolNames = [
      ...(settings.toolSettings?.disabledWriteToolConfirmationNames ?? []),
      ...(settings.mcp?.trustedToolNames ?? []),
    ];

    const loopResult = await runNativeAgentLoop({
      provider,
      toolRegistry: nativeToolRegistry,
      session,
      systemPrompt: buildAgentSystemPrompt(),
      contextInstructions: context.contextInstructions,
      conversationId,
      autoAllowedToolNames,
      abortSignal: params.abortSignal,
      question: params.question,
      maxToolCalls: settings.agentMaxToolCallsPerTurn ?? 10,
      onEvent: (event) => {
        emitNativeEvent(event);
        if (event.type === "assistant_text_delta") {
          params.onAnswerChunk?.({ chunk: event.delta, fullContent: event.fullContent });
        } else if (event.type === "assistant_reasoning_delta") {
          if (!reasoningStarted) {
            reasoningStarted = true;
            params.onReasoningDelta?.({ type: "reasoning-start" });
          }
          params.onReasoningDelta?.({ type: "reasoning-delta", delta: event.delta });
        } else if (event.type === "assistant_reasoning_reset") {
          if (reasoningStarted) {
            params.onReasoningDelta?.({ type: "reasoning-reset" });
            reasoningStarted = false;
          }
        } else if (event.type === "assistant_final") {
          answerFinished = true;
          if (reasoningStarted) {
            params.onReasoningDelta?.({ type: "reasoning-end" });
            reasoningStarted = false;
          }
          params.onAnswerFinish?.(event.answer);
        } else if (event.type === "done" && reasoningStarted) {
          params.onReasoningDelta?.({ type: "reasoning-end" });
          reasoningStarted = false;
        }
      },
    });

    if (loopResult.ok && !answerFinished) {
      params.onAnswerFinish?.(loopResult.answer);
    }

    const sanitizedMessages = sanitizeAgentMessages(loopResult.messages);

    saveTurnTrace({
      turnId: `${Date.now()}`,
      finishedAt: Date.now(),
      status: loopResult.status,
      steps: loopResult.steps,
      events: toTraceEvents(localEvents),
    });

    if (!loopResult.ok) {
      const code = loopResult.errorCode ?? loopResult.status;
      pushAgentDebugEvent("TURN_FAILED", {
        agentErrorCode: code,
        loopStatus: loopResult.status,
        steps: loopResult.steps,
      }, "warn");
      return buildFailureOutcome({
        code,
        message: loopResult.errorMessage,
        steps: loopResult.steps,
        events: localEvents,
        agentSessionMessages: sanitizedMessages,
      });
    }

    const observationRefs = collectObservationReferences(wb.observationLog.all());
    buildReferenceGroundingSet({
      observationRefs,
      conversationContext: params.conversationContext,
      scope,
      attachedDocs: params.attachedDocs,
    });
    const footerReferences = toFooterReferenceItems(observationRefs);

    const result: AgentTurnResult = {
      scope,
      scopeSummary: resolvedScope.summary,
      answer: loopResult.answer,
      footerReferences,
      warnings: [],
      events: localEvents,
    };

    return {
      ok: true,
      steps: loopResult.steps,
      footerReferencesCount: footerReferences.length,
      result,
      agentSessionMessages: sanitizedMessages,
    };
  } catch (err) {
    const providerError = normalizeProviderError(err);
    const code = providerError.code || "agent_workbench_unexpected_error";
    const message = providerError.message;
    pushAgentDebugEvent("RUN_AGENT_TURN_EXCEPTION", {
      errorName: err instanceof Error ? err.name : "unknown",
      code,
      sanitizedMessage: message.slice(0, 200),
    }, "error");

    emitNativeEvent({ type: "error", code, message });
    saveTurnTrace({
      turnId: `${Date.now()}`,
      finishedAt: Date.now(),
      status: "exception",
      steps: localEvents.length > 0
        ? Math.max(...localEvents.map((event) => event.stepIndex ?? 0))
        : 0,
      events: toTraceEvents(localEvents),
    });

    return buildFailureOutcome({
      code,
      message,
      events: localEvents,
    });
  }
}
