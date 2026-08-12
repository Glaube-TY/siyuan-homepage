import { createAgentWorkbenchRuntime } from "./create-agent-workbench";
import { buildAgentContextInstructions } from "./agent-context-instruction-builder";
import { NativeToolAgentLoop } from "../../agent-core/loop/native-tool-agent-loop";
import { RegisteredConfirmationBridge } from "../../agent-core/permissions/confirmation-bridge";
import { SiyuanToolRuntimeState } from "../tools/siyuan/siyuan-tool-runtime";
import { getKbSettings } from "../../settings/kb-settings-service";
import { loadData as loadPluginData, saveData as savePluginData } from "../storage/notebrain-plugin-storage";
import { resolveAgentScope } from "../scope/resolve-scope";
import type { AgentScopeMode } from "../scope/types";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { ChatModelSelection } from "../../../types/chat-model-selection";
import type { ThinkingMode } from "../../../types/session";
import { saveTurnTrace } from "./turn-trace-store";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import { getNotebrainRuntimeEnvironment } from "../workspace/notebrain-runtime-env";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import type { AgentWorkbenchRuntimeOptions } from "./create-agent-workbench";
import { resolveSelectedChatConfig } from "../../settings/chat-provider-config";
import { getLastSecretDiagnostics } from "../../settings/kb-settings-service";
import {
  mapAgentErrorToUserFacing,
  buildCompletedStepsSummary,
  type AgentTurnDisplayError,
} from "./user-facing-agent-error";
import { hydrateAttachedDocsForTurn } from "../adapters/siyuan/attached-doc-hydration";
import { buildGlobalMemoryContext, getGlobalMemoryProfile } from "../memory/global-memory-store";
import { setMcpRuntimeSettings } from "../mcp/mcp-client-manager";
import { buildAgentSystemPrompt } from "../../agent-core/prompts/system-prefix";
import { createProviderAdapterForKbModel } from "../../agent-core/providers/agent-provider-factory";
import { normalizeProviderError } from "../../agent-core/providers/provider-error";
import { createNativeToolRegistryFromWorkbench } from "../../agent-core/tools/workbench-tool-adapter";
import {
  listAllExternalSkillEntries,
  renderExternalSkillIndexPrompt,
} from "../skills/external/external-skill-index";
import type { AgentStreamEvent } from "../../agent-core/loop/stream-event";
import { AgentSession } from "../../agent-core/session/agent-session";
import { inspectAgentRunResume, type AgentRunCheckpoint } from "../../agent-core/session/agent-run-checkpoint";
import type { AgentContextManifest } from "./agent-context-ledger";
import type { AgentMessage, AgentToolCall } from "../../agent-core/messages/agent-message";
import { compactAgentSessionMessagesForStorage } from "../../agent-core/messages/message-compactor";
import { sanitizeMessageForStorage } from "../../agent-core/session/session-store";
import type { ToolResultEntry } from "./tool-result-log";
import {
  agentProfileAllowsContext,
  agentProfileAllowsMemory,
  agentProfileHasCapability,
  agentProfileResourceAllowList,
  type AgentProfile,
} from "../../../../agent-platform/agent-profile";
import {
  createAgentEventId,
  createAgentRunIdentity,
  type AgentRunIdentity,
  type AgentTokenUsage,
} from "../../../../agent-platform/agent-run-protocol";

export interface RunAgentProfileParams<TResult> {
  profile: AgentProfile;
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
  conversationId?: string;
  panelInstanceId?: string;
  turnId?: string;
  onCheckpoint?: (checkpoint: AgentRunCheckpoint) => void;
  resumeCheckpoint?: AgentRunCheckpoint;
  kbSettings?: Awaited<ReturnType<typeof getKbSettings>>;
  validateFinalAnswer?: (answer: string, observations: readonly ToolResultEntry[]) => string | undefined;
  finalize: (context: AgentProfileFinalizeContext) => Promise<{
    result: TResult;
    footerReferencesCount?: number;
  }> | {
    result: TResult;
    footerReferencesCount?: number;
  };
}

export interface AgentProfileFinalizeContext {
  answer: string;
  events: AgentWorkbenchEvent[];
  observations: readonly ToolResultEntry[];
  resolvedScope: Awaited<ReturnType<typeof resolveAgentScope>>;
}

export interface AgentProfileRunOutcome<TResult> {
  ok: boolean;
  result?: TResult;
  agentErrorCode?: string;
  steps?: number;
  footerReferencesCount?: number;
  stopReasonCode?: string;
  displayError?: AgentTurnDisplayError;
  identity: AgentRunIdentity;
  usage?: AgentTokenUsage;
}

function toWorkbenchEvent(
  event: AgentStreamEvent,
  identity: AgentRunIdentity,
  ordinal: number,
): AgentWorkbenchEvent {
  const payload = event.type === "run_started"
    ? (({ identity: _identity, ...rest }) => rest)(event)
    : event;
  return {
    ...payload,
    at: Date.now(),
    eventId: createAgentEventId(identity.runId, ordinal),
    sessionId: identity.sessionId,
    runId: identity.runId,
    correlationId: identity.correlationId,
  } as AgentWorkbenchEvent;
}

function shouldStoreWorkbenchEvent(event: AgentStreamEvent): boolean {
  return event.type !== "assistant_text_delta" && event.type !== "assistant_reasoning_delta";
}

function toTraceEvents(events: AgentWorkbenchEvent[]) {
  return events.map((event) => ({
    type: event.type,
    eventId: event.eventId,
    stepIndex: event.stepIndex,
    modelStepIndex: event.type === "model_started" || event.type === "usage" ? event.modelStepIndex : undefined,
    toolName: "toolName" in event ? event.toolName : undefined,
    ok: event.type === "tool_result" ? event.result.ok : undefined,
    durationMs: event.type === "tool_result" ? event.durationMs : undefined,
    argsPreview: event.type === "tool_start" || event.type === "tool_result" ? event.argsPreview : undefined,
    outputSummary: event.type === "tool_result" ? event.result.summary : undefined,
    message: "message" in event ? event.message : event.type === "assistant_final" ? event.answer : undefined,
    status: event.type === "done" ? event.status : undefined,
    providerFinishReason: event.type === "done" ? event.providerFinishReason : undefined,
    outputChars: event.type === "done" ? event.outputChars : undefined,
    usage: event.type === "usage" ? event.cumulativeUsage : undefined,
    errorCategory: event.type === "error" ? event.category : undefined,
    retryable: event.type === "error" ? event.retryable : undefined,
    retryAfterMs: event.type === "error" ? event.retryAfterMs : undefined,
    safeToReplay: event.type === "error" ? event.safeToReplay : undefined,
    sideEffectState: event.type === "error" ? event.sideEffectState : undefined,
    errorCode: event.type === "tool_result"
      ? event.result.errorCode ?? event.result.code
      : event.type === "error"
        ? event.code
        : undefined,
  }));
}

function compactAndSanitizeAgentMessages(messages: readonly AgentMessage[]): AgentMessage[] {
  const compacted = compactAgentSessionMessagesForStorage(messages);
  pushAgentDebugEvent("AGENT_SESSION_STORAGE_COMPACTED", {
    beforeMessageCount: messages.length,
    afterMessageCount: compacted.length,
  }, "info");
  return compacted.map(sanitizeMessageForStorage);
}

function buildFailureOutcome<TResult>(params: {
  code: string;
  message?: string;
  steps?: number;
  events: AgentWorkbenchEvent[];
  identity: AgentRunIdentity;
  usage?: AgentTokenUsage;
}): AgentProfileRunOutcome<TResult> {
  const userFacing = mapAgentErrorToUserFacing({
    agentErrorCode: params.code,
    message: params.message,
  });
  const summary = buildCompletedStepsSummary(params.events);
  return {
    ok: false,
    agentErrorCode: params.code,
    stopReasonCode: params.code,
    steps: params.steps,
    displayError: {
      ...userFacing,
      completedStepsSummary: summary?.text,
    },
    identity: params.identity,
    usage: params.usage,
  };
}

function sanitizePendingToolCalls(calls: readonly AgentToolCall[] | undefined): AgentToolCall[] | undefined {
  if (!calls?.length) return undefined;
  const message = sanitizeMessageForStorage({ role: "assistant", content: "", toolCalls: [...calls] });
  return message.role === "assistant" ? message.toolCalls : undefined;
}

export async function runAgentProfile<TResult>(
  params: RunAgentProfileParams<TResult>,
): Promise<AgentProfileRunOutcome<TResult>> {
  const agentProfile = params.profile;
  const localEvents: AgentWorkbenchEvent[] = [];
  const conversationId = params.conversationId ?? `conv-${Date.now()}`;
  const identity = params.resumeCheckpoint?.identity ?? createAgentRunIdentity({
    sessionId: conversationId,
    runId: params.turnId,
  });
  let eventOrdinal = 0;
  let activeProviderId: string | undefined;
  let activeContextManifest: AgentContextManifest | undefined;

  const emitNativeEvent = (event: AgentStreamEvent): AgentWorkbenchEvent => {
    const workbenchEvent = toWorkbenchEvent(event, identity, ++eventOrdinal);
    localEvents.push(workbenchEvent);
    params.onWorkbenchEvent?.(workbenchEvent);
    return workbenchEvent;
  };

  const saveCurrentTrace = (trace: {
    status: string;
    steps: number;
    providerRequestCount?: number;
    usage?: AgentTokenUsage;
  }): void => {
    const finishedAt = Date.now();
    saveTurnTrace({
      sessionId: identity.sessionId,
      runId: identity.runId,
      correlationId: identity.correlationId,
      turnId: params.turnId ?? identity.runId,
      providerId: activeProviderId,
      startedAt: identity.startedAt,
      finishedAt,
      durationMs: finishedAt - identity.startedAt,
      status: trace.status,
      steps: trace.steps,
      providerRequestCount: trace.providerRequestCount,
      usage: trace.usage,
      contextManifest: activeContextManifest ?? params.conversationContext?.manifest,
      events: toTraceEvents(localEvents),
    });
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
    const externalSkillSettings = {
      ...settings.externalSkills,
      allowedSkillIds: agentProfileResourceAllowList(agentProfile.permissions.externalSkillIds),
    };
    const mcpSettings = {
      ...settings.mcp,
      allowedServerIds: agentProfileResourceAllowList(agentProfile.permissions.mcpServerIds),
      allowedToolNames: agentProfileResourceAllowList(agentProfile.permissions.mcpToolNames),
    };

    // Inject runtime tools settings for MCP command resolution
    if (agentProfileHasCapability(agentProfile, "mcp") && settings.runtimeTools) {
      setMcpRuntimeSettings(settings.runtimeTools);
    }

    // ── Per-turn capability computation ──
    const runtimeEnv = getNotebrainRuntimeEnvironment();
    const sandboxEnabled = settings.notebrainWorkspace.enabled === true && runtimeEnv.isPcElectron;
    const localCommandToolEnabled = sandboxEnabled && settings.notebrainWorkspace.commandExecutionEnabled === true;
    const mcpClientEnabled = agentProfileHasCapability(agentProfile, "mcp") && mcpSettings.enabled === true;

    let webReadPageToolDeps: AgentWorkbenchRuntimeOptions["webReadPageToolDeps"] | undefined;

    const disabledGlobalTools = new Set(settings.toolSettings?.disabledGlobalToolNames ?? []);
    const globalToolAccess = {
      // agent_tool_help 是系统必需工具，不受用户 disabledGlobalToolNames 影响，始终启用。
      agentToolHelp: true,
      webFetch: !disabledGlobalTools.has("web_fetch"),
    };

    const webReadAccess = params.conversationContext?.currentTurn?.webReadAccess;
    if (webReadAccess?.enabled && globalToolAccess.webFetch) {
      webReadPageToolDeps = {
        readProxyEndpoint: ws.readProxyEndpoint || undefined,
        readPageMaxChars: ws.readPageMaxChars,
        timeoutMs: ws.timeoutMs,
      };
    }

    const canReadGlobalMemory = agentProfileAllowsMemory(agentProfile, "read")
      && agentProfileAllowsContext(agentProfile, "global-memory");
    const memoryProfile = await getGlobalMemoryProfile();
    const globalMemoryText = canReadGlobalMemory && memoryProfile.enabled
      ? await buildGlobalMemoryContext(params.question)
      : undefined;

    const builtinCapabilityAccess = {
      knowledgeBase: !disabledGlobalTools.has("siyuan_kb"),
      scheduleTaskDiary: !disabledGlobalTools.has("diary_task"),
      databaseAssistant: !disabledGlobalTools.has("siyuan_database"),
      docContentEditing: !disabledGlobalTools.has("siyuan_doc_edit"),
      notebookDocTree: !disabledGlobalTools.has("siyuan_tree"),
      tagBookmarkOutline: !disabledGlobalTools.has("siyuan_meta"),
      assetManagement: !disabledGlobalTools.has("siyuan_asset"),
      riffReview: !disabledGlobalTools.has("siyuan_riff"),
      homepageManagement: !disabledGlobalTools.has("homepage_manage"),
      homepageWorkbench: !disabledGlobalTools.has("homepage_workbench"),
      homepageQuickNote: !disabledGlobalTools.has("homepage_quick_note"),
      homepageFocus: !disabledGlobalTools.has("homepage_focus"),
      homepageAccounting: !disabledGlobalTools.has("homepage_accounting"),
      homepageFixedAssets: !disabledGlobalTools.has("homepage_fixed_assets"),
      homepageAnniversary: !disabledGlobalTools.has("homepage_anniversary"),
      homepageFavorites: !disabledGlobalTools.has("homepage_favorites"),
      homepageReview: !disabledGlobalTools.has("homepage_review"),
      homepageMusic: !disabledGlobalTools.has("homepage_music"),
    };

    const wb = createAgentWorkbenchRuntime({
      profile: agentProfile,
      kbRetrievalToolDeps: deps,
      webReadPageToolDeps,
      builtinCapabilityAccess,
      globalToolAccess,
      conversationId,
      turnId: params.turnId,
      memoryProfile,
      confirmationRoute: params.panelInstanceId && params.turnId
        ? { panelInstanceId: params.panelInstanceId, conversationId, turnId: params.turnId }
        : undefined,
      externalSkillSettings,
      mcpSettings,
      notebrainWorkspaceSettings: settings.notebrainWorkspace,
      runtimeToolsSettings: settings.runtimeTools,
    });

    pushAgentDebugEvent("AGENT_PROFILE_RESOLVED", {
      profileId: agentProfile.id,
      schemaVersion: agentProfile.schemaVersion,
      capabilities: agentProfile.capabilities,
    }, "info");

    pushAgentDebugEvent("WEB_TOOL_REGISTRATION_SAFE", {
      webReadPageRegistered: !!webReadPageToolDeps,
      settingsEnabled: ws.enabled,
      webFetchRegistered: globalToolAccess.webFetch,
      webFetchDisabledReason: !globalToolAccess.webFetch ? "web_fetch_disabled"
        : !webReadPageToolDeps ? "web_read_access_off"
        : undefined,
    }, "info");

    // Runtime environment debug (already computed above)
    pushAgentDebugEvent("RUNTIME_ENVIRONMENT", {
      isPcElectron: runtimeEnv.isPcElectron,
      platformLabel: runtimeEnv.platformLabel,
      hasNodeRequire: runtimeEnv.hasNodeRequire,
      unsupportedCapabilities: runtimeEnv.unsupportedCapabilities,
    }, "info");

    let externalSkillIndexPrompt = "";
    if (agentProfileAllowsContext(agentProfile, "external-skills") && externalSkillSettings.enabled !== false) {
      try {
        const entries = await listAllExternalSkillEntries({
          disabledSkillIds: externalSkillSettings.disabledSkillIds,
          allowedSkillIds: externalSkillSettings.allowedSkillIds,
        });
        externalSkillIndexPrompt = renderExternalSkillIndexPrompt(entries);
      } catch (err) {
        pushAgentDebugEvent("EXTERNAL_SKILL_INDEX_PROMPT_FAILED", {
          error: err instanceof Error ? err.message.slice(0, 80) : String(err),
        }, "warn");
      }
    }

    const attachedDocIds = params.attachedDocs?.map((doc) => doc.docId).filter(Boolean) ?? [];
    if (agentProfileAllowsContext(agentProfile, "attached-documents") && attachedDocIds.length > 0) {
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
      saveCurrentTrace({ status: "failed", steps: 0 });
      return buildFailureOutcome({ code, message: "当前没有可用于 Agent 的模型配置。", events: localEvents, identity });
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
        saveCurrentTrace({ status: "failed", steps: 0 });
        return buildFailureOutcome({ code, message, events: localEvents, identity });
      }
    }

    const provider = createProviderAdapterForKbModel({
      provider: selected.provider,
      model: selected.model,
      thinkingMode: params.thinkingMode ?? "off",
      agentThinkingEnabled: settings.agentThinkingEnabled,
    });
    activeProviderId = provider.id;

    if (!provider.capabilities.nativeToolCalls) {
      const code = "provider_tool_call_not_supported";
      emitNativeEvent({ type: "error", code, message: "当前模型不支持原生工具调用，不能进入 Agent 模式。" });
      saveCurrentTrace({ status: "failed", steps: 0 });
      return buildFailureOutcome({
        code,
        message: "当前模型不支持原生工具调用，不能进入 Agent 模式。",
        events: localEvents,
        identity,
      });
    }

    const nativeToolRegistry = createNativeToolRegistryFromWorkbench({
      toolRegistry: wb.toolRegistry,
      observationLog: wb.observationLog,
      question: params.question,
      abortSignal: params.abortSignal,
      notebrainWorkspaceSettings: settings.notebrainWorkspace,
      mcpSettings,
    });

    const profileConversationContext = agentProfileAllowsContext(agentProfile, "conversation")
      ? params.conversationContext
      : undefined;
    const context = buildAgentContextInstructions({
      toolRegistry: wb.toolRegistry,
      skillRegistry: wb.skillRegistry,
      observationLog: wb.observationLog,
      question: params.question,
      abortSignal: params.abortSignal,
      conversationContext: profileConversationContext,
      globalMemory: globalMemoryText,
      attachedDocs: agentProfileAllowsContext(agentProfile, "attached-documents")
        ? params.attachedDocs
        : undefined,
      externalSkillIndexPrompt,
      runtimeToolsSettings: agentProfileAllowsContext(agentProfile, "runtime-tools")
        ? settings.runtimeTools
        : undefined,
      includeKnowledgeGuidance: agentProfileAllowsContext(agentProfile, "knowledge"),
      includeSkillInstructions: agentProfileAllowsContext(agentProfile, "skills"),
      runtimeToolCapabilities: {
        sandboxEnabled,
        localCommandToolEnabled,
        mcpClientEnabled,
      },
    });
    activeContextManifest = context.manifest;

    if (params.resumeCheckpoint && params.resumeCheckpoint.identity.sessionId !== conversationId) {
      return buildFailureOutcome({
        code: "resume_session_mismatch",
        message: "恢复检查点不属于当前会话，已阻止续跑。",
        events: localEvents,
        identity,
      });
    }
    const resumeDecision = params.resumeCheckpoint
      ? inspectAgentRunResume(params.resumeCheckpoint)
      : undefined;
    if (params.resumeCheckpoint && !resumeDecision?.resumable) {
      const code = `resume_${resumeDecision?.reason ?? "checkpoint_invalid"}`;
      return buildFailureOutcome({
        code,
        message: "当前检查点不在可安全恢复的边界，已阻止续跑。",
        events: localEvents,
        identity,
      });
    }
    const session = new AgentSession(conversationId, params.resumeCheckpoint?.messages ?? []);
    let reasoningStarted = false;
    let answerFinished = false;

    const autoAllowedToolNames = [
      ...(settings.toolSettings?.disabledWriteToolConfirmationNames ?? []),
      ...(settings.mcp?.trustedToolNames ?? []),
    ];
    // Append action-level trusted entries (encoded as "toolName:actionName")
    // from toolActionConfirmOverrides. Only false values mean trusted.
    const actionOverrides = settings.toolSettings?.toolActionConfirmOverrides;
    if (actionOverrides && typeof actionOverrides === "object") {
      for (const [toolName, actionMap] of Object.entries(actionOverrides)) {
        if (!actionMap || typeof actionMap !== "object") continue;
        for (const [actionName, flag] of Object.entries(actionMap)) {
          if (flag === false) {
            autoAllowedToolNames.push(`${toolName}:${actionName}`);
          }
        }
      }
    }

    const loop = new NativeToolAgentLoop({
      provider,
      toolRegistry: nativeToolRegistry,
      session,
      systemPrompt: buildAgentSystemPrompt({
        isToolAvailable: (toolName) => nativeToolRegistry.get(toolName)?.providerVisible === true,
        isActionAvailable: (toolName, action) =>
          wb.toolRegistry.getTool(toolName)?.aggregateActionHelp?.[action] !== undefined,
      }),
      contextInstructions: context.contextInstructions,
      conversationId,
      identity,
      bridge: new RegisteredConfirmationBridge(
        params.panelInstanceId && params.turnId
          ? { panelInstanceId: params.panelInstanceId, conversationId, turnId: params.turnId }
          : undefined,
      ),
      autoAllowedToolNames,
      abortSignal: params.abortSignal,
      maxToolCalls: settings.agentMaxToolCallsPerTurn ?? agentProfile.execution.defaultMaxToolCalls,
      validateFinalAnswer: params.validateFinalAnswer
        ? (answer) => params.validateFinalAnswer?.(answer, wb.observationLog.all())
        : undefined,
      onCheckpoint: params.onCheckpoint
        ? (checkpoint) => params.onCheckpoint?.({
            ...checkpoint,
            messages: compactAndSanitizeAgentMessages(checkpoint.messages),
            pendingToolCalls: sanitizePendingToolCalls(checkpoint.pendingToolCalls),
          })
        : undefined,
      onEvent: (event) => {
        if (shouldStoreWorkbenchEvent(event)) {
          emitNativeEvent(event);
        }
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
    const loopResult = params.resumeCheckpoint ? await loop.resume() : await loop.run(params.question);
    const loopOk = loopResult.status === "answer_ready";

    if (loopOk && !answerFinished) {
      params.onAnswerFinish?.(loopResult.answer);
    }

    saveCurrentTrace({
      status: loopResult.status,
      steps: loopResult.steps,
      providerRequestCount: loopResult.providerRequestCount,
      usage: loopResult.usage,
    });
    if (!loopOk) {
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
        identity,
        usage: loopResult.usage,
      });
    }

    const finalized = await params.finalize({
      answer: loopResult.answer,
      events: localEvents,
      observations: wb.observationLog.all(),
      resolvedScope,
    });

    return {
      ok: true,
      steps: loopResult.steps,
      footerReferencesCount: finalized.footerReferencesCount,
      result: finalized.result,
      identity,
      usage: loopResult.usage,
    };
  } catch (err) {
    const providerError = normalizeProviderError(err);
    const code = providerError.code || "agent_workbench_unexpected_error";
    const message = providerError.message;
    pushAgentDebugEvent("RUN_AGENT_TURN_EXCEPTION", {
      errorName: err instanceof Error ? err.name : "unknown",
      code,
      sanitizedMessage: message.slice(0, 200),
      category: providerError.category,
      retryable: providerError.retryable,
      safeToReplay: providerError.safeToReplay,
      correlationId: identity.correlationId,
    }, "error");

    emitNativeEvent({
      type: "error",
      code,
      message,
      category: providerError.category,
      retryable: providerError.retryable,
      retryAfterMs: providerError.retryAfterMs,
      safeToReplay: providerError.safeToReplay,
      sideEffectState: providerError.sideEffectState,
      userAction: providerError.userAction,
    });
    saveCurrentTrace({
      status: "exception",
      steps: localEvents.length > 0
        ? Math.max(...localEvents.map((event) => event.stepIndex ?? 0)) : 0,
    });

    return buildFailureOutcome({
      code,
      message,
      events: localEvents,
      identity,
    });
  }
}
