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
import {
  buildAgentResumeProgress,
  hasAgentResumeProgress,
  inspectAgentRunResume,
  markAgentRunCheckpointNoProgress,
  type AgentRunCheckpoint,
  type AgentSuccessfulWriteGuard,
} from "../../agent-core/session/agent-run-checkpoint";
import type { AgentContextManifest } from "./agent-context-ledger";
import type { NativeTool } from "../../agent-core/tools/native-tool";
import {
  resolveNativeToolReadOnly,
  ProviderToolsetController,
  sanitizeProviderToolsetState,
  type NativeToolRegistry,
} from "../../agent-core/tools/native-tool-registry";
import type { AgentMessage, AgentToolCall } from "../../agent-core/messages/agent-message";
import { compactAgentSessionMessagesForStorage } from "../../agent-core/messages/message-compactor";
import { sanitizeMessageForStorage } from "../../agent-core/session/session-store";
import type { ToolResultEntry } from "./tool-result-log";
import { estimateAgentMessagesTokens } from "../../../types/context-usage";
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
  /** Uncovered completed turns as real provider user/assistant messages. */
  historicalMessages?: AgentMessage[];
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
  conversationKind?: "current" | "legacy";
  panelInstanceId?: string;
  turnId?: string;
  onCheckpoint?: (checkpoint: AgentRunCheckpoint) => void;
  resumeCheckpoint?: AgentRunCheckpoint;
  maxToolCalls?: number;
  /** 已由用户保存任务预授权的无人值守写入；高风险操作仍拒绝。 */
  unattendedWritePolicy?: "deny" | "safe";
  /** 本轮模型的上下文窗口；用于实际 provider prompt 预算。 */
  contextWindowTokens?: number;
  /** 在真实工具注册表和系统提示组装后执行统一上下文预检。 */
  onContextPrepared?: (context: {
    systemPrompt: string;
    contextInstructions: string;
    globalMemory?: string;
    toolDefinitions: NativeTool[];
    registeredToolCount: number;
    toolsetReduced: boolean;
    historicalMessages: AgentMessage[];
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    rebuildProviderContext: (
      conversationContext: ConversationContextSnapshot | undefined,
      historicalMessages: AgentMessage[],
    ) => {
      conversationContext?: ConversationContextSnapshot;
      contextInstructions: string;
      historicalMessages: AgentMessage[];
      manifest: AgentContextManifest;
    };
  }) => Promise<{
    conversationContext?: ConversationContextSnapshot;
    contextInstructions: string;
    historicalMessages: AgentMessage[];
    manifest: AgentContextManifest;
    toolDefinitions: NativeTool[];
  } | undefined> | {
    conversationContext?: ConversationContextSnapshot;
    contextInstructions: string;
    historicalMessages: AgentMessage[];
    manifest: AgentContextManifest;
    toolDefinitions: NativeTool[];
  } | undefined;
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

function compactAndSanitizeAgentMessages(
  messages: readonly AgentMessage[],
  toolRegistry: NativeToolRegistry,
): AgentMessage[] {
  const compacted = compactAgentSessionMessagesForStorage(messages, {
    resolveCallReadOnly: (toolName, args) => resolveNativeToolReadOnly(toolRegistry, toolName, args),
  });
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

function sanitizeSuccessfulWriteGuards(
  guards: readonly AgentSuccessfulWriteGuard[] | undefined,
): AgentSuccessfulWriteGuard[] | undefined {
  const sanitized = (guards ?? [])
    .filter((guard) => (
      typeof guard?.toolName === "string"
      && guard.toolName.trim().length > 0
      && typeof guard.keyDigest === "string"
      && /^[0-9a-f]{8}$/i.test(guard.keyDigest)
    ))
    .map((guard) => ({
      toolName: guard.toolName.trim(),
      keyDigest: guard.keyDigest.toLowerCase(),
      ...(Number.isInteger(guard.firstStepIndex) && guard.firstStepIndex >= 0
        ? { firstStepIndex: guard.firstStepIndex }
        : {}),
    }));
  return sanitized.length > 0 ? sanitized : undefined;
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
  if (params.conversationKind !== undefined && params.conversationKind !== "current") {
    return buildFailureOutcome({
      code: "LEGACY_CONVERSATION_READ_ONLY",
      message: "旧版会话只能作为归档查看，不能启动 Agent Runtime。",
      events: [],
      identity,
    });
  }
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
    // 组件子工具禁用：旧 homepage_quick_note 等工具名映射到 homepage_components 前缀，
    // 与 kb-settings-service 的迁移保持一致（新写入统一使用 disabledSubtools）。
    const disabledComponentSubtools = new Set(settings.toolSettings?.disabledSubtools?.["homepage_components"] ?? []);
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
      homepageComponents: !disabledGlobalTools.has("homepage_components"),
      temporaryWorkbench: !disabledGlobalTools.has("temporary_workbench"),
      homepageQuickNote: !disabledComponentSubtools.has("quick_note"),
      homepageFocus: !disabledComponentSubtools.has("focus"),
      homepageAccounting: !disabledComponentSubtools.has("accounting"),
      homepageFixedAssets: !disabledComponentSubtools.has("fixed_assets"),
      homepageAnniversary: !disabledComponentSubtools.has("anniversary"),
      homepageFavorites: !disabledComponentSubtools.has("favorites"),
      homepageReview: !disabledComponentSubtools.has("review"),
      homepageMusic: !disabledComponentSubtools.has("music"),
      disabledComponentSubtools: [...disabledComponentSubtools],
    };

    const providerToolsetController = new ProviderToolsetController({
      profileSeedToolNames: agentProfile.providerToolSeeds,
      restoredState: params.resumeCheckpoint?.providerToolsetState,
    });
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
      providerToolsetController,
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
    const buildContext = (conversationContext: ConversationContextSnapshot | undefined) => buildAgentContextInstructions({
      toolRegistry: wb.toolRegistry,
      skillRegistry: wb.skillRegistry,
      observationLog: wb.observationLog,
      question: params.question,
      abortSignal: params.abortSignal,
      conversationContext,
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
    let context = buildContext(profileConversationContext);
    let historicalMessages = agentProfileAllowsContext(agentProfile, "conversation")
      ? [...(params.historicalMessages ?? [])]
      : [];
    const providerTools = nativeToolRegistry.listProviderVisible();
    const buildCurrentSystemPrompt = (activeToolNames: ReadonlySet<string>): string => buildAgentSystemPrompt({
      isToolAvailable: (toolName) => activeToolNames.has(toolName)
        && nativeToolRegistry.get(toolName)?.providerVisible === true,
      isActionAvailable: (toolName, action) =>
        wb.toolRegistry.getTool(toolName)?.aggregateActionHelp?.[action] !== undefined,
    });
    const resolveProviderToolset = (nextHistoricalMessages: readonly AgentMessage[] = historicalMessages) => {
      const resolve = (prompt: string) => providerToolsetController.resolve({
        tools: providerTools,
        question: params.question,
        contextWindowTokens: params.contextWindowTokens ?? selected.model.contextWindowTokens,
        maxOutputTokens: selected.model.maxTokens,
        providerMessageTokens: estimateAgentMessagesTokens([
          { role: "system", content: prompt },
          ...(context.contextInstructions ? [{ role: "system", content: context.contextInstructions }] : []),
          ...nextHistoricalMessages,
          { role: "user", content: params.question },
        ]),
      });
      const provisionalPrompt = buildCurrentSystemPrompt(providerToolsetController.getActiveProviderToolNames());
      let selection = resolve(provisionalPrompt);
      let systemPrompt = buildCurrentSystemPrompt(selection.activeProviderToolNames);
      selection = resolve(systemPrompt);
      systemPrompt = buildCurrentSystemPrompt(selection.activeProviderToolNames);
      return { selection, systemPrompt };
    };
    let { selection: providerToolSelection, systemPrompt } = resolveProviderToolset();
    pushAgentDebugEvent("PROVIDER_TOOLSET_SELECTED", {
      contextWindowTokens: params.contextWindowTokens ?? selected.model.contextWindowTokens,
      registeredToolCount: providerToolSelection.registeredToolCount,
      activeToolCount: providerToolSelection.tools.length,
      activeToolNames: providerToolSelection.tools.map((tool) => tool.name),
      toolsetBudgetTokens: providerToolSelection.budgetTokens,
      toolsetReduced: providerToolSelection.toolsetReduced,
    }, "info");
    const preparedContext = await params.onContextPrepared?.({
      systemPrompt,
      contextInstructions: context.contextInstructions,
      globalMemory: globalMemoryText,
      toolDefinitions: providerToolSelection.tools,
      registeredToolCount: providerToolSelection.registeredToolCount,
      toolsetReduced: providerToolSelection.toolsetReduced,
      historicalMessages,
      contextWindowTokens: params.contextWindowTokens ?? selected.model.contextWindowTokens,
      maxOutputTokens: selected.model.maxTokens,
      rebuildProviderContext: (conversationContext, nextHistoricalMessages) => {
        const rebuilt = buildContext(conversationContext);
        return {
          conversationContext,
          contextInstructions: rebuilt.contextInstructions,
          historicalMessages: [...nextHistoricalMessages],
          manifest: rebuilt.manifest,
        };
      },
    });
    if (preparedContext) {
      context = {
        ...context,
        contextInstructions: preparedContext.contextInstructions,
        manifest: preparedContext.manifest,
      };
      historicalMessages = [...preparedContext.historicalMessages];
      ({ selection: providerToolSelection, systemPrompt } = resolveProviderToolset(historicalMessages));
    }
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
    const resumeAttempt = params.resumeCheckpoint
      ? (params.resumeCheckpoint.resumeAttempt ?? 0) + 1
      : undefined;
    if (params.resumeCheckpoint) {
      pushAgentDebugEvent("AGENT_RESUME_STARTED_SAFE", {
        checkpointPhase: params.resumeCheckpoint.phase,
        stepIndex: params.resumeCheckpoint.stepIndex,
        resumeAttempt,
        sideEffectState: params.resumeCheckpoint.sideEffectState,
      }, "info");
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

    let latestCheckpoint: AgentRunCheckpoint | undefined = params.resumeCheckpoint;
    const handleCheckpoint = (checkpoint: AgentRunCheckpoint): void => {
      if (!params.onCheckpoint) {
        latestCheckpoint = checkpoint;
        return;
      }
      const providerToolsetState = sanitizeProviderToolsetState(checkpoint.providerToolsetState);
      const safeCheckpoint: AgentRunCheckpoint = {
        ...checkpoint,
        messages: compactAndSanitizeAgentMessages(checkpoint.messages, nativeToolRegistry),
        pendingToolCalls: sanitizePendingToolCalls(checkpoint.pendingToolCalls),
        successfulWriteGuards: sanitizeSuccessfulWriteGuards(checkpoint.successfulWriteGuards),
        ...(providerToolsetState ? { providerToolsetState } : {}),
      };
      latestCheckpoint = safeCheckpoint;
      params.onCheckpoint?.(safeCheckpoint);
    };
    const loop = new NativeToolAgentLoop({
      provider,
      toolRegistry: nativeToolRegistry,
      providerToolsetController,
      session,
      systemPrompt,
      buildSystemPrompt: (activeToolNames) => buildCurrentSystemPrompt(activeToolNames),
      contextInstructions: context.contextInstructions,
      historicalMessages,
      contextWindowTokens: params.contextWindowTokens ?? selected.model.contextWindowTokens,
      maxOutputTokens: selected.model.maxTokens,
      conversationId,
      identity,
      bridge: new RegisteredConfirmationBridge(
        params.panelInstanceId && params.turnId
          ? { panelInstanceId: params.panelInstanceId, conversationId, turnId: params.turnId }
          : undefined,
      ),
      autoAllowedToolNames,
      unattendedWritePolicy: params.unattendedWritePolicy,
      abortSignal: params.abortSignal,
      maxToolCalls: params.maxToolCalls ?? settings.agentMaxToolCallsPerTurn ?? agentProfile.execution.defaultMaxToolCalls,
      resumeAttempt,
      resumeStepIndex: params.resumeCheckpoint?.stepIndex,
      resumeContext: params.resumeCheckpoint?.recoveryContext,
      successfulWriteGuards: params.resumeCheckpoint?.successfulWriteGuards,
      validateFinalAnswer: params.validateFinalAnswer
        ? (answer) => params.validateFinalAnswer?.(answer, wb.observationLog.all())
        : undefined,
      onCheckpoint: handleCheckpoint,
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
    if (params.resumeCheckpoint) {
      const resumeToolResults = localEvents.filter((event) => event.type === "tool_result");
      const resumeProgress = buildAgentResumeProgress({
        producedToolCall: localEvents.some((event) => event.type === "tool_start"),
        addedToolResult: resumeToolResults.length > 0,
        producedSuccessfulToolResult: resumeToolResults.some((event) => event.result.ok),
        producedFinal: loopResult.answer.trim().length > 0,
        stepAdvanced: loopResult.steps > (params.resumeCheckpoint.stepIndex ?? 0),
        toolResultCodes: resumeToolResults
          .map((event) => event.result.errorCode ?? event.result.code)
          .filter((code): code is string => typeof code === "string"),
        previousRecoveryContext: params.resumeCheckpoint.recoveryContext,
        latestRecoveryContext: latestCheckpoint?.recoveryContext,
      });
      const exhaustedCheckpoint = markAgentRunCheckpointNoProgress(
        latestCheckpoint,
        resumeProgress,
        loopResult.errorCode,
      );
      if (exhaustedCheckpoint) handleCheckpoint(exhaustedCheckpoint);
      pushAgentDebugEvent("AGENT_RESUME_PROGRESS_SAFE", {
        resumeAttempt,
        ...resumeProgress,
      }, "info");
      if (!hasAgentResumeProgress(resumeProgress)) {
        pushAgentDebugEvent("AGENT_RESUME_NO_PROGRESS", {
          resumeAttempt,
          checkpointPhase: latestCheckpoint?.phase,
          stepIndex: latestCheckpoint?.stepIndex,
          failureCode: loopResult.errorCode,
        }, "warn");
      }
    }
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
    if (!localEvents.some((event) => event.type === "done")) {
      emitNativeEvent({
        type: "done",
        status: providerError.category === "cancelled" ? "cancelled" : "failed",
      });
    }
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
