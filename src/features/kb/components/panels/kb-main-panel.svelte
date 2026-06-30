<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { kbSessionStore, getNewAbortController } from "../../stores/kb-session-store";
  import ChatMessageList from "../common/chat-message-list.svelte";
  import ChatInputBar from "../common/chat-input-bar.svelte";
  import ConversationSidebar from "../common/conversation-sidebar.svelte";
  import KbSettingsPanel from "./kb-settings-panel.svelte";
  import type { ExtendedKbSessionState } from "../../types/session";
  import type { ChatMode } from "../../constants/chat-modes";
  import { CHAT_MODES, DEFAULT_CHAT_MODE, getChatModeLabel } from "../../constants/chat-modes";
  import { askByMode } from "../../services/orchestration/ask-by-mode";
  import { pushAgentDebugEvent } from "../../services/agent-workbench/debug/workbench-debug";
  import { getCurrentDocumentId, resolveDocMetaForAttachment } from "../../services/siyuan/current-doc-service";
  import { showMessage } from "siyuan";
  import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "../../services/settings/kb-settings-service";
  import { DEFAULT_CHAT_APPEARANCE_SETTINGS } from "../../constants/default-settings";
  import {
    buildChatModelOptions,
    findDefaultChatModelOption,
  } from "../../services/settings/chat-model-options";
  import {
    buildChatModelKey,
    type ChatModelOption,
    type ChatModelSelection,
  } from "../../types/chat-model-selection";
  import type { KbAssistantActionAlignment, KbChatAppearanceSettings } from "../../types/settings";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import DocContentEditConfirmationModal from "../common/doc-content-edit-confirmation-modal.svelte";
  import AgentToolPermissionModal from "../common/agent-tool-permission-modal.svelte";
  import { openEditDiffPreviewDialog } from "../common/edit-diff-dialog";
  import type { DocContentEditArrowFlow, EditDiffPreview } from "../../services/doc-content-edit/doc-content-edit-types";
  import { setDocContentEditConfirmationHandler } from "../../services/doc-content-edit/doc-content-edit-confirmation-bridge";
  import { removeDocContentEditConfirmation } from "../../services/doc-content-edit/doc-content-edit-confirmation-store";
  import { RegisteredConfirmationBridge } from "../../services/agent-core/permissions/confirmation-bridge";
  import {
    buildAskDraftFromPayload,
    setSelectionAskPayloadHandler,
    type SelectionAskPayload,
  } from "../../services/selection-ai/selection-ai-chat-bridge";
  import type { AttachedKbDoc } from "../../types/chat";

  export let placement: "dock" | "tab" | "mobile" = "dock";
  export let onOpenSettings: (() => void) | undefined = undefined;

  // Web search state
  let webSearchEnabled = false;
  // 输入区"联网搜索"按钮状态由 store 驱动（会话级持久化）。
  // webSearchEnabled=false 时 UI 临时显示 off，但不覆盖 store 中保存的会话偏好。
  $: storedWebAccessMode = $kbSessionStore.webAccessMode ?? "off";
  $: effectiveWebAccessMode = webSearchEnabled ? storedWebAccessMode : "off";

  // Quick prompts state
  let quickPromptsEnabled = false;
  let quickPromptsDocId = "";
  let workbenchDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";
  let reasoningDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";
  let chatAppearance: KbChatAppearanceSettings = DEFAULT_CHAT_APPEARANCE_SETTINGS;

  const TAB_CHAT_MODES: ChatMode[] = ["whole_kb"];
  const CURRENT_DOCUMENT_REQUIRED_MODES: ChatMode[] = [
    "current_notebook",
    "current_doc_with_children",
    "current_doc_neighborhood",
  ];

  // 使用 $ 前缀自动订阅 store 状态
  $: asking = $kbSessionStore.asking;
  $: messages = $kbSessionStore.messages;
  $: storedSelectedMode = $kbSessionStore.selectedMode;
  $: draftQuestion = $kbSessionStore.draftQuestion;
  $: selectedChatModelSelection = $kbSessionStore.selectedChatModelSelection;

  // 聊天模型选择相关状态
  let chatModelOptions: ChatModelOption[] = [];
  let selectedChatModelKey = "";
  let assistantActionAlignment: KbAssistantActionAlignment = "left";
  let chatInputBarRef: ChatInputBar;

  let composerAttachedDocIds: string[] = [];

  // 文档内容编辑确认弹窗状态
  let docContentEditModalOpen = false;
  let activeDocContentEditConfirmationId: string | null = null;
  let docContentEditConfirmationResolve:
    | ((value: { status: "confirmed" | "rejected"; message: string }) => void)
    | null = null;

  // Native Agent 权限确认弹窗状态
  let nativePermissionModalOpen = false;
  let nativePermissionPreview: {
    toolName: string;
    title: string;
    risk: "low" | "medium" | "high";
    summary?: string;
    operationLabel?: string;
    targetSummary?: string;
    impactSummary?: string;
    riskReason?: string;
    warnings?: string[];
    missingPreviewReason?: string;
    argsPreview: Record<string, unknown>;
    displayMode?: "summary" | "block_diff" | "arrow_flow";
    confirmationId?: string;
    editDiffPreview?: EditDiffPreview;
    arrowFlow?: DocContentEditArrowFlow;
    /** 结构化详情段落（如 URL/Headers/Body），来源于 ToolPermissionPreview.sections */
    sections?: Array<{ label: string; value: string }>;
  } | null = null;
  let nativePermissionResolve:
    | ((decision: { type: "allow" | "deny"; reason?: string }) => void)
    | null = null;

  function getSelectedContextWindowTokens(): number | undefined {
    const opt = chatModelOptions.find((o) => o.key === selectedChatModelKey);
    return opt?.contextWindowTokens;
  }

  function refreshContextUsageSafe(reason?: string) {
    void kbSessionStore.refreshContextUsage({
      composerAttachedDocIds,
      contextWindowTokens: getSelectedContextWindowTokens(),
      reason,
    });
  }

  /**
   * 判断消息是否可复制（有实质内容）
   * 排除空 assistant pending 气泡（content 为空 + agentStatus 存在）
   */
  function isCopyableMessage(msg: typeof messages[number]): boolean {
    if (msg.role === "user" || msg.role === "error") return !!msg.content.trim();
    if (msg.role === "assistant") return !!msg.content.trim();
    return false;
  }

  // 是否有消息可复制
  $: hasMessagesToCopy = messages.some(isCopyableMessage);

  // 复制对话按钮状态
  let isCopiedAll = false;
  let copyAllTimeout: ReturnType<typeof setTimeout> | null = null;

  // 会话侧边栏状态
  let conversationSidebarOpen = false;
  let mobileSettingsOpen = false;

  // 从 store 获取会话列表和当前活跃会话 ID（使用 ExtendedKbSessionState 类型）
  $: conversations = ($kbSessionStore as ExtendedKbSessionState).conversations ?? [];
  $: activeConversationId = ($kbSessionStore as ExtendedKbSessionState).activeConversationId ?? "";

  $: availableModes = placement === "tab" ? TAB_CHAT_MODES : undefined;

  /**
   * 解析当前有效的 selectedMode
   * - allowedModes 为 undefined 时表示不限制模式，尊重 storedMode
   * - allowedModes 有值时，必须在列表内才有效
   * - 无效时回退到 allowedModes[0] 或 DEFAULT_CHAT_MODE
   */
  function resolveEffectiveSelectedMode(
    storedMode: ChatMode | undefined,
    allowedModes: ChatMode[] | undefined
  ): ChatMode {
    const fallback = allowedModes?.[0] ?? DEFAULT_CHAT_MODE;
    const candidate = storedMode ?? fallback;
    if (allowedModes?.length) {
      return allowedModes.includes(candidate) ? candidate : fallback;
    }
    return CHAT_MODES.some((m) => m.id === candidate) ? candidate : fallback;
  }

  $: selectedMode = resolveEffectiveSelectedMode(storedSelectedMode, availableModes);

  // 空状态快捷建议问题
  $: suggestedQuestions = placement === "tab"
    ? ["查找相关资料", "梳理相关概念", "总结知识库主题", "基于资料生成大纲"]
    : ["总结当前文档", "提炼核心观点", "查找相关资料", "基于资料生成大纲"];

  /**
   * 规范化 send payload，兼容旧版 string 和新版对象格式
   * 使用和 selectedMode 一致的校验逻辑
   */
  function normalizeSendPayload(
    detail: string | { question: string; mode?: ChatMode; thinkingMode?: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[]; webAccessMode?: "off" | "smart" | "required" }
  ): { question: string; mode: ChatMode; thinkingMode: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[]; webAccessMode?: "off" | "smart" | "required" } {
    const storeThinkingMode = $kbSessionStore.thinkingMode ?? "off";
    if (typeof detail === "string") {
      return { question: detail, mode: selectedMode, thinkingMode: storeThinkingMode, webAccessMode: effectiveWebAccessMode };
    }
    const question = detail.question;
    const payloadMode = detail.mode;
    const payloadThinkingMode = detail.thinkingMode ?? storeThinkingMode;
    const attachedDocIds = detail.attachedDocIds;
    const attachedDocs = detail.attachedDocs;
    const submittedWebAccessMode = detail.webAccessMode;
    if (payloadMode && CHAT_MODES.some((m) => m.id === payloadMode)) {
      if (!availableModes || availableModes.includes(payloadMode)) {
        return { question, mode: payloadMode, thinkingMode: payloadThinkingMode, attachedDocIds, attachedDocs, webAccessMode: submittedWebAccessMode };
      }
    }
    return { question, mode: selectedMode, thinkingMode: payloadThinkingMode, attachedDocIds, attachedDocs, webAccessMode: submittedWebAccessMode };
  }

  async function handleSend(e: CustomEvent<string | { question: string; mode?: ChatMode; thinkingMode?: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[]; webAccessMode?: "off" | "smart" | "required" }>) {
    if (asking) return;
    const payload = normalizeSendPayload(e.detail);
    const { question, mode: effectiveMode, thinkingMode: submittedThinkingMode, attachedDocIds, attachedDocs, webAccessMode: submittedWebAccessMode } = payload;

    const actualWebAccessMode = webSearchEnabled
      ? (submittedWebAccessMode ?? storedWebAccessMode)
      : "off";

    if (!question.trim()) return;

    if (effectiveMode !== storedSelectedMode) {
      kbSessionStore.setSelectedMode(effectiveMode);
    }

    if (submittedThinkingMode !== ($kbSessionStore.thinkingMode ?? "off")) {
      kbSessionStore.setThinkingMode(submittedThinkingMode);
    }

    // 联网搜索按钮状态由 store 持久化：仅全局 webSearchEnabled=true 时，用户选择的 submittedWebAccessMode 才写回 store
    if (
      webSearchEnabled &&
      submittedWebAccessMode &&
      submittedWebAccessMode !== storedWebAccessMode
    ) {
      kbSessionStore.setWebAccessMode(submittedWebAccessMode);
    }

    if (import.meta.env.DEV) {
      console.debug("[KbMainPanel] send payload mode resolved", {
        storedSelectedMode,
        selectedMode,
        payloadMode: typeof e.detail === "object" ? e.detail.mode : "string",
        effectiveMode,
        placement,
        availableModes,
        attachedDocCount: attachedDocIds?.length ?? 0,
        webAccessMode: actualWebAccessMode,
      });
    }

    kbSessionStore.setDraftQuestion("");
    await handleAskByMode(effectiveMode, question, submittedThinkingMode, attachedDocIds, attachedDocs, actualWebAccessMode);
  }

  /**
   * 处理快捷建议问题点击
   */
  async function handleSuggestedQuestion(e: CustomEvent<string>) {
    if (asking) return;
    const question = e.detail;
    await handleAskByMode(selectedMode, question, $kbSessionStore.thinkingMode ?? "off", undefined, undefined, effectiveWebAccessMode);
  }

  /**
   * 处理输入框内容变化，同步更新草稿
   */
  function handleInputChange(e: CustomEvent<string>) {
    const value = e.detail;
    kbSessionStore.setDraftQuestion(value);
  }

  function handleComposerAttachedDocsChange(e: CustomEvent<{ docIds: string[] }>) {
    composerAttachedDocIds = e.detail.docIds;
    refreshContextUsageSafe("attached_docs_change");
  }

  async function handleCompressionRequest() {
    if (asking) return;
    const result = await kbSessionStore.executeCompression();
    if (!result.success && result.error) {
      console.warn("[KbMainPanel] Compression skipped:", result.error);
      showMessage(result.error, 4000);
      const isNoStageSummary = result.error.includes("当前还没有历史摘要");
      pushAgentDebugEvent(
        isNoStageSummary
          ? "CONTEXT_COMPRESSION_MANUAL_SKIPPED_NO_STAGE_SUMMARY_COVERAGE"
          : "CONTEXT_COMPRESSION_MANUAL_SKIPPED",
        { reason: result.error },
        "info",
      );
    }
    refreshContextUsageSafe("compression_applied");
  }

  function handleCompressionClear() {
    if (asking) return;
    kbSessionStore.clearCompression();
    refreshContextUsageSafe("compression_cleared");
  }

  async function cancelPendingDocContentEditConfirmation(message = "用户已取消操作。"): Promise<void> {
    const confirmationId = activeDocContentEditConfirmationId;

    if (docContentEditConfirmationResolve) {
      docContentEditConfirmationResolve({ status: "rejected", message });
      docContentEditConfirmationResolve = null;
    }

    if (confirmationId) {
      try {
        await removeDocContentEditConfirmation(confirmationId);
      } catch {
        // best effort
      }
    }

    docContentEditModalOpen = false;
    activeDocContentEditConfirmationId = null;
  }

  async function cleanupNativePermissionConfirmation(confirmationId?: string): Promise<void> {
    if (!confirmationId) return;
    try {
      await removeDocContentEditConfirmation(confirmationId);
    } catch {
      pushAgentDebugEvent(
        "NATIVE_PERMISSION_CONFIRMATION_CLEANUP_FAILED",
        { hasConfirmationId: true },
        "warn",
      );
    }
  }

  function handleStop() {
    kbSessionStore.stop();
    void cancelPendingDocContentEditConfirmation("用户已取消操作。");
    void cancelPendingNativePermission("用户已取消操作。");
    kbSessionStore.markLatestAssistantManuallyStopped();
    kbSessionStore.syncActiveConversationSnapshot();
    refreshContextUsageSafe("stop");
  }

  function handleNativePermissionConfirm() {
    if (nativePermissionResolve) {
      nativePermissionResolve({ type: "allow" });
      nativePermissionResolve = null;
    }
    nativePermissionModalOpen = false;
    nativePermissionPreview = null;
  }

  function handleNativePermissionCancel() {
    const confirmationId = nativePermissionPreview?.confirmationId;
    if (nativePermissionResolve) {
      nativePermissionResolve({ type: "deny", reason: "用户取消了操作。" });
      nativePermissionResolve = null;
    }
    nativePermissionModalOpen = false;
    nativePermissionPreview = null;
    void cleanupNativePermissionConfirmation(confirmationId);
  }

  function cancelPendingNativePermission(reason = "用户已取消操作。") {
    const confirmationId = nativePermissionPreview?.confirmationId;
    if (nativePermissionResolve) {
      nativePermissionResolve({ type: "deny", reason });
      nativePermissionResolve = null;
    }
    nativePermissionModalOpen = false;
    nativePermissionPreview = null;
    void cleanupNativePermissionConfirmation(confirmationId);
  }

  function handleQuoteSelection(e: CustomEvent<{ text: string }>) {
    if (asking) return;
    const text = e.detail.text.slice(0, 2000);
    const draft = `> ${text}\n\n继续追问：`;
    kbSessionStore.setDraftQuestion(draft);
    chatInputBarRef?.focusTextarea();
  }

  function handleEditUserMessage(e: CustomEvent<{ text: string }>) {
    if (asking) return;
    kbSessionStore.setDraftQuestion(e.detail.text);
    chatInputBarRef?.focusTextarea();
  }

  function handleDeleteTurn(e: CustomEvent<{ assistantMessageId: string }>) {
    if (asking) return;
    const deleted = kbSessionStore.deleteTurnByAssistantId(e.detail.assistantMessageId);
    if (deleted) {
      refreshContextUsageSafe("delete_turn");
    }
  }

  async function handleSelectionAskPayload(payload: SelectionAskPayload) {
    if (asking) {
      showMessage("当前 AI 回答生成中，请稍后再使用选区问答", 3000);
      return;
    }

    kbSessionStore.createConversation();
    kbSessionStore.setSelectedMode("whole_kb");

    let docs: AttachedKbDoc[] = [];
    if (payload.docId) {
      try {
        const meta = await resolveDocMetaForAttachment(payload.docId);
        docs = [{
          docId: meta.docId,
          title: meta.title,
          box: meta.box,
          path: meta.path,
          source: "current_doc",
          createdAt: Date.now(),
        }];
      } catch {
        docs = [{
          docId: payload.docId,
          title: "当前文档",
          source: "current_doc",
          createdAt: Date.now(),
        }];
      }
    }

    composerAttachedDocIds = docs.map((doc) => doc.docId);
    chatInputBarRef?.setAttachedDocs(docs);
    kbSessionStore.setDraftQuestion(buildAskDraftFromPayload(payload));
    refreshContextUsageSafe("selection_ai_ask");

    setTimeout(() => {
      chatInputBarRef?.focusTextarea();
    }, 0);
  }

  function handleDocContentEditConfirmed(e: CustomEvent<{ status: "success"; message: string }>) {
    if (docContentEditConfirmationResolve) {
      docContentEditConfirmationResolve({ status: "confirmed", message: e.detail.message });
      docContentEditConfirmationResolve = null;
    }
    docContentEditModalOpen = false;
    activeDocContentEditConfirmationId = null;
  }

  function handleDocContentEditCancelled(e: CustomEvent<{ status: "rejected"; message: string }>) {
    if (docContentEditConfirmationResolve) {
      docContentEditConfirmationResolve({ status: "rejected", message: e.detail.message });
      docContentEditConfirmationResolve = null;
    }
    docContentEditModalOpen = false;
    activeDocContentEditConfirmationId = null;
  }

  function handleDocContentEditModalClose() {
    void cancelPendingDocContentEditConfirmation("用户已取消操作。");
  }

  /**
   * 重新生成最后一条 assistant 回答
   * 删除最后一条 assistant，复用其前一条 user message，避免重复追加 user
   */
  async function handleRegenerate() {
    if (asking) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "assistant") {
      return;
    }

    let precedingUserMessage = null;
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].role === "user") {
        precedingUserMessage = messages[i];
        break;
      }
    }

    if (!precedingUserMessage) {
      return;
    }

    const chatModelSelection = await ensureValidChatModelSelection();
    if (!chatModelSelection) {
      appendChatModelUnavailableError();
      return;
    }

    kbSessionStore.update((state) => {
      const removedAssistantId = lastMessage.id;
      const removedStageSummary = (state.stageSummaries ?? [])
        .find((summary) => summary.endAssistantMessageId === removedAssistantId);
      const stageSummaries = removedStageSummary
        ? (state.stageSummaries ?? []).filter((summary) => summary.index < removedStageSummary.index)
        : state.stageSummaries;

      // If a stage summary was removed, compression state may be stale —
      // clear it and un-compacted remaining messages to avoid stale compressedContextSummary
      if (removedStageSummary) {
        const unCompactedMessages = state.messages.map((m) => {
          if ((m.role === "user" || m.role === "assistant") && (m as { compacted?: boolean }).compacted) {
            const { compacted, ...rest } = m as typeof m & { compacted?: boolean };
            return rest as typeof m;
          }
          return m;
        });

        return {
          ...state,
          messages: unCompactedMessages.slice(0, -1),
          stageSummaries,
          compressedContextSummary: undefined,
          compressionState: undefined,
          contextUsage: undefined,
        };
      }

      return {
        ...state,
        messages: state.messages.slice(0, -1),
        stageSummaries,
      };
    });

    const requestContext = precedingUserMessage.requestContext;
    const rawMode = requestContext?.originalMode as ChatMode | undefined;
    const effectiveMode = rawMode && CHAT_MODES.some((m) => m.id === rawMode) ? rawMode : selectedMode;

    const reusedThinkingMode = requestContext?.thinkingMode as import("../../types/session").ThinkingMode | undefined;
    const hasThinkingMode = !!reusedThinkingMode;
    // 当前 UI 状态优先，旧 requestContext 仅作 fallback
    const effectiveThinkingMode = $kbSessionStore.thinkingMode ?? reusedThinkingMode ?? "off";
    const thinkingModeSource = $kbSessionStore.thinkingMode ? "store" : hasThinkingMode ? "requestContext" : "default_off";

    const reusedWebAccessMode = webSearchEnabled
      ? (requestContext?.webAccessMode ?? storedWebAccessMode)
      : "off";

    if (requestContext) {
      pushAgentDebugEvent("REGENERATE_REQUEST_CONTEXT_REUSED_SAFE", {
        originalMode: requestContext.originalMode,
        effectiveScopeMode: requestContext.effectiveScopeMode,
        hasCustomDocs: Array.isArray(requestContext.customDocIds) && requestContext.customDocIds.length > 0,
        docCount: requestContext.customDocIds?.length ?? 0,
        requestContextWebAccessMode: requestContext?.webAccessMode,
        storedWebAccessMode,
        webSearchEnabled,
        effectiveTurnWebAccessMode: reusedWebAccessMode,
        hasExplicitWebAccessMode: !!requestContext?.webAccessMode,
      }, "info");
    } else {
      pushAgentDebugEvent("REGENERATE_REQUEST_CONTEXT_REUSED_SAFE", {
        originalMode: selectedMode,
        effectiveScopeMode: selectedMode,
        hasCustomDocs: false,
        docCount: 0,
        missingRequestContext: true,
      }, "warn");
    }

    pushAgentDebugEvent("REGENERATE_THINKING_CONTEXT_REUSED_SAFE", {
      hasThinkingMode,
      thinkingModeSource,
      rawValue: reusedThinkingMode,
      normalizedValue: effectiveThinkingMode,
      hasExplicitUserValue: !!$kbSessionStore.thinkingMode,
    }, "info");

    await handleAskByModeWithExistingUser(
      effectiveMode,
      precedingUserMessage.content,
      precedingUserMessage.id,
      chatModelSelection,
      requestContext?.customDocIds,
      requestContext?.attachedDocs,
      effectiveThinkingMode,
      reusedWebAccessMode,
    );
  }

  async function handleRetry() {
    if (asking) {
      return;
    }

    const recentUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (!recentUserMessage) {
      return;
    }

    const chatModelSelection = await ensureValidChatModelSelection();
    if (!chatModelSelection) {
      appendChatModelUnavailableError();
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "error") {
      kbSessionStore.update((state) => ({
        ...state,
        messages: state.messages.slice(0, -1),
      }));
    }

    const requestContext = recentUserMessage.requestContext;
    const hasRequestContext = !!requestContext;
    const rawMode = requestContext?.originalMode as ChatMode | undefined;
    const effectiveMode = hasRequestContext && rawMode && CHAT_MODES.some((m) => m.id === rawMode)
      ? rawMode
      : selectedMode;
    const customDocIds = requestContext?.customDocIds;
    const attachedDocs = requestContext?.attachedDocs;

    const reusedThinkingMode = requestContext?.thinkingMode as import("../../types/session").ThinkingMode | undefined;
    const hasThinkingMode = !!reusedThinkingMode;
    // 当前 UI 状态优先，旧 requestContext 仅作 fallback
    const effectiveThinkingMode = $kbSessionStore.thinkingMode ?? reusedThinkingMode ?? "off";
    const thinkingModeSource = $kbSessionStore.thinkingMode ? "store" : hasThinkingMode ? "requestContext" : "default_off";
    const reusedWebAccessMode = webSearchEnabled
      ? (requestContext?.webAccessMode ?? storedWebAccessMode)
      : "off";

    pushAgentDebugEvent("RETRY_REQUEST_CONTEXT_REUSED_SAFE", {
      hasRequestContext,
      originalMode: requestContext?.originalMode ?? "unknown",
      effectiveScopeMode: requestContext?.effectiveScopeMode ?? effectiveMode,
      customDocCount: customDocIds?.length ?? attachedDocs?.length ?? 0,
      missingRequestContext: !hasRequestContext,
      requestContextWebAccessMode: requestContext?.webAccessMode,
      storedWebAccessMode,
      webSearchEnabled,
      effectiveTurnWebAccessMode: reusedWebAccessMode,
      hasExplicitWebAccessMode: !!requestContext?.webAccessMode,
    }, "info");

    pushAgentDebugEvent("RETRY_THINKING_CONTEXT_REUSED_SAFE", {
      hasThinkingMode,
      thinkingModeSource,
      rawValue: reusedThinkingMode,
      normalizedValue: effectiveThinkingMode,
      hasExplicitUserValue: !!$kbSessionStore.thinkingMode,
    }, "info");

    await handleAskByModeWithExistingUser(
      effectiveMode,
      recentUserMessage.content,
      recentUserMessage.id,
      chatModelSelection,
      customDocIds,
      attachedDocs,
      effectiveThinkingMode,
      reusedWebAccessMode,
    );
  }

  // 切换会话侧边栏显示
  function toggleConversationSidebar() {
    conversationSidebarOpen = !conversationSidebarOpen;
  }

  function handleOpenSettings() {
    if (placement === "mobile") {
      mobileSettingsOpen = true;
      conversationSidebarOpen = false;
      return;
    }
    onOpenSettings?.();
  }

  function handleCloseMobileSettings() {
    mobileSettingsOpen = false;
  }

  // 创建新会话（增加 asking 保护）
  function handleCreateConversation() {
    // 回答生成中禁止切换会话
    if (asking) return;
    kbSessionStore.createConversation();
  }

  // 切换会话（增加 asking 保护）
  function handleSwitchConversation(e: CustomEvent<string>) {
    if (asking) return;
    const id = e.detail;
    kbSessionStore.switchConversation(id);
  }

  // 重命名会话（增加 asking 保护）
  function handleRenameConversation(e: CustomEvent<{ id: string; title: string }>) {
    if (asking) return;
    const { id, title } = e.detail;
    kbSessionStore.renameConversation(id, title);
  }

  // 删除会话（增加 asking 保护）
  function handleDeleteConversation(e: CustomEvent<string>) {
    if (asking) return;
    const id = e.detail;
    kbSessionStore.deleteConversation(id);
  }

  // 关闭会话侧边栏
  function handleCloseConversationSidebar() {
    conversationSidebarOpen = false;
  }

  /**
   * 将消息列表格式化为纯文本对话记录
   */
  function formatConversationToText(msgs: typeof $kbSessionStore.messages): string {
    const lines: string[] = [];

    for (const msg of msgs) {
      switch (msg.role) {
        case "user":
          if (msg.content.trim()) {
            lines.push(`用户：${msg.content}`);
          }
          break;
        case "assistant":
          if (msg.content.trim()) {
            lines.push(`AI：${msg.content}`);
            if (msg.citedReferences?.length) {
              const refNames = msg.citedReferences
                .map((item) => item.displayTitle || item.docTitle || "参考文档")
                .join("、");
              lines.push(`参考：${refNames}`);
            }
          }
          break;
        case "error":
          if (msg.content.trim()) {
            lines.push(`错误：${msg.content}`);
          }
          break;
        case "loading":
          // 忽略 loading 消息
          break;
      }
    }

    return lines.join("\n");
  }

  /**
   * 复制整段对话到剪贴板
   */
  async function handleCopyConversation() {
    if (asking) return;
    if (messages.length === 0) {
      return;
    }

    try {
      const text = formatConversationToText(messages);
      await navigator.clipboard.writeText(text);

      // 显示成功反馈
      isCopiedAll = true;
      if (copyAllTimeout) {
        clearTimeout(copyAllTimeout);
      }
      copyAllTimeout = setTimeout(() => {
        isCopiedAll = false;
      }, 2000);

    } catch (err) {
      console.error("[KbMainPanel] Failed to copy conversation:", err);
    }
  }

  function handleModeChange(e: CustomEvent<ChatMode>) {
    if (asking) return;
    const newMode = e.detail;
    if (availableModes && !availableModes.includes(newMode)) return;
    kbSessionStore.setSelectedMode(newMode);
  }

  function handleThinkingModeChange(e: CustomEvent<import("../../types/session").ThinkingMode>) {
    if (asking) return;
    kbSessionStore.setThinkingMode(e.detail);
  }

  /**
   * 刷新聊天模型选项列表
   * 从 settings 加载可用模型列表，并设置默认选择
   */
  async function refreshChatModelOptions() {
    try {
      const settings = await getKbSettings();
      assistantActionAlignment = settings.assistantActionAlignment;
      chatAppearance = settings.chatAppearance ?? DEFAULT_CHAT_APPEARANCE_SETTINGS;
      const options = buildChatModelOptions(settings);
      chatModelOptions = options;

      // 检查当前选择是否仍然有效（统一使用 buildChatModelKey）
      const currentKey = selectedChatModelSelection
        ? buildChatModelKey(selectedChatModelSelection.providerId, selectedChatModelSelection.modelId)
        : "";

      if (currentKey) {
        const stillValid = options.find((opt) => opt.key === currentKey);
        if (stillValid) {
          selectedChatModelKey = stillValid.key;
          // 当前选择仍然有效，不重写 store
          return;
        }
      }

      // 当前选择无效或不存在，使用默认模型
      const defaultOption = findDefaultChatModelOption(settings, options);
      if (defaultOption) {
        selectedChatModelKey = defaultOption.key;
        kbSessionStore.setSelectedChatModelSelection({
          providerId: defaultOption.providerId,
          modelId: defaultOption.modelId,
        });
      } else {
        // 没有可用模型
        selectedChatModelKey = "";
        kbSessionStore.setSelectedChatModelSelection(undefined);
      }
    } catch (err) {
      console.warn("[KbMainPanel] 刷新聊天模型选项失败:", err);
      // 失败时保持当前 chatModelOptions 不变
      // 如果当前 chatModelOptions 为空，则清空选择
      if (chatModelOptions.length === 0) {
        selectedChatModelKey = "";
        kbSessionStore.setSelectedChatModelSelection(undefined);
      }
    }
  }

  /**
   * 处理模型选择变化
   */
  function handleModelChange(e: CustomEvent<ChatModelSelection>) {
    if (asking) return;
    const selection = e.detail;
    const key = buildChatModelKey(selection.providerId, selection.modelId);
    const option = chatModelOptions.find((opt) => opt.key === key);
    if (option) {
      selectedChatModelKey = option.key;
      kbSessionStore.setSelectedChatModelSelection(selection);
      refreshContextUsageSafe("model_change");
    } else {
      // 不在选项中的 key，忽略，不写入无效选择
      console.warn("[KbMainPanel] handleModelChange: 模型不在可用列表中，已忽略", key);
    }
  }

  /**
   * 确保当前聊天模型选择有效
   * 在发送前校验，如果失效则回退到默认模型
   * @returns 有效的 ChatModelSelection 或 undefined
   */
  async function ensureValidChatModelSelection(): Promise<ChatModelSelection | undefined> {
    try {
      const settings = await getKbSettings();
      const options = buildChatModelOptions(settings);
      chatModelOptions = options;

      const selection = $kbSessionStore.selectedChatModelSelection;

      // 如果当前 selection 存在，检查是否仍然有效
      if (selection) {
        const currentKey = buildChatModelKey(selection.providerId, selection.modelId);
        const found = options.find((opt) => opt.key === currentKey);
        if (found) {
          selectedChatModelKey = found.key;
          return { providerId: found.providerId, modelId: found.modelId };
        }
      }

      // 当前 selection 不存在或失效，回退到默认模型
      const defaultOption = findDefaultChatModelOption(settings, options);
      if (defaultOption) {
        selectedChatModelKey = defaultOption.key;
        const fallbackSelection = {
          providerId: defaultOption.providerId,
          modelId: defaultOption.modelId,
        };
        kbSessionStore.setSelectedChatModelSelection(fallbackSelection);
        return fallbackSelection;
      }

      // 没有任何可用模型
      selectedChatModelKey = "";
      kbSessionStore.setSelectedChatModelSelection(undefined);
      return undefined;
    } catch (err) {
      console.warn("[KbMainPanel] 校验聊天模型选择失败:", err);
      // 返回当前 store 中的 selection，不让发送流程崩溃
      return $kbSessionStore.selectedChatModelSelection;
    }
  }

  /**
   * 追加错误消息
   */
  function appendKbErrorMessage(content: string) {
    kbSessionStore.update((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: "error" as const,
          content,
          createdAt: Date.now(),
        },
      ],
    }));
    kbSessionStore.syncActiveConversationSnapshot();
  }

  function appendChatModelUnavailableError() {
    appendKbErrorMessage("暂无可用大模型，请先在设置中添加并启用模型。");
  }

  function isCurrentDocumentRequiredMode(mode: ChatMode): boolean {
    return CURRENT_DOCUMENT_REQUIRED_MODES.includes(mode);
  }

  function ensureCurrentDocumentModeAvailable(mode: ChatMode): boolean {
    if (placement === "tab" || !isCurrentDocumentRequiredMode(mode)) {
      return true;
    }

    if (getCurrentDocumentId()) {
      return true;
    }

    appendKbErrorMessage(
      `「${getChatModeLabel(mode)}」需要当前标签页打开一个笔记文档。当前标签页不是笔记文档（如主页或工作台），请先切换到具体文档，或改用「全库问答」。`
    );
    return false;
  }

  /**
   * 统一提问入口：调用 orchestration 层
   */
  async function handleAskByMode(mode: ChatMode, question: string, submittedThinkingMode?: import("../../types/session").ThinkingMode, customDocIds?: string[], attachedDocs?: import("../../types/chat").AttachedKbDoc[], submittedWebAccessMode?: "off" | "smart" | "required") {
    if (import.meta.env.DEV) {
      console.debug("[KbMainPanel] askByMode called", {
        mode,
        questionPrefix: question.slice(0, 20),
        placement,
        hasCurrentDoc: !!getCurrentDocumentId(),
      });
    }

    if (!ensureCurrentDocumentModeAvailable(mode)) {
      return;
    }

    const chatModelSelection = await ensureValidChatModelSelection();
    if (!chatModelSelection) {
      appendChatModelUnavailableError();
      return;
    }

    kbSessionStore.maybeAutoGenerateTitle(question);

    const requestConversationId = activeConversationId;

    const abortController = getNewAbortController();

    const effectiveThinkingMode = submittedThinkingMode ?? $kbSessionStore.thinkingMode ?? "off";

    pushAgentDebugEvent("THINKING_MODE_SOURCE_SAFE", {
      sourceName: "handleAskByMode",
      rawValue: submittedThinkingMode,
      normalizedValue: effectiveThinkingMode,
      hasExplicitUserValue: submittedThinkingMode !== undefined && submittedThinkingMode !== null,
      mode,
    });

    pushAgentDebugEvent("WEB_ACCESS_MODE_SOURCE_SAFE", {
      sourceName: "handleAskByMode",
      rawValue: submittedWebAccessMode,
      normalizedValue: submittedWebAccessMode ?? effectiveWebAccessMode,
      hasExplicitUserValue: submittedWebAccessMode !== undefined && submittedWebAccessMode !== null,
    }, "info");

    const result = await askByMode({
      mode,
      question,
      conversationId: activeConversationId,
      getState: () => $kbSessionStore,
      updateState: (updater) => {
        // 防御性保护 - 如果会话已切换，不写入当前会话
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] updateState skipped: conversation switched during request");
            return state;
          }
          return { ...state, ...updater(state) };
        });
      },
      addMessage: (message) => {
        // 防御性保护 - 如果会话已切换，不写入当前会话
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] addMessage skipped: conversation switched during request");
            return state;
          }
          return {
            ...state,
            messages: [...state.messages, message],
          };
        });
      },
      setMessages: (updater) => {
        // 防御性保护 - 如果会话已切换，不写入当前会话
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] setMessages skipped: conversation switched during request");
            return state;
          }
          return {
            ...state,
            messages: updater(state.messages),
          };
        });
      },
      abortSignal: abortController.signal,
      chatModelSelection,
      thinkingMode: effectiveThinkingMode,
      customDocIds,
      attachedDocs,
      contextWindowTokens: getSelectedContextWindowTokens(),
      webAccessMode: submittedWebAccessMode ?? effectiveWebAccessMode,
    });

    // 只有当前会话仍等于请求归属会话时，才同步状态
    if (activeConversationId === requestConversationId) {
      // 问答完成后同步活跃会话状态到 conversations（更新消息数和 updatedAt）
      kbSessionStore.syncActiveConversationSnapshot();
      refreshContextUsageSafe("ask_complete");
    } else {
      console.warn("[KbMainPanel] syncActiveConversationSnapshot skipped: conversation switched during request");
    }

    if (!result.success && result.error) {
      console.error(`[KbMainPanel] Ask failed: ${result.error}`);
    }
  }

  /**
   * 重新生成专用提问入口：复用已有 user message，不追加重复 user
   */
  async function handleAskByModeWithExistingUser(
    mode: ChatMode,
    question: string,
    existingUserMessageId: string,
    prevalidatedChatModelSelection?: ChatModelSelection,
    customDocIds?: string[],
    attachedDocs?: import("../../types/chat").AttachedKbDoc[],
    submittedThinkingMode?: import("../../types/session").ThinkingMode,
    submittedWebAccessMode?: "off" | "smart" | "required",
  ) {
    if (!ensureCurrentDocumentModeAvailable(mode)) {
      return;
    }

    const chatModelSelection = prevalidatedChatModelSelection || await ensureValidChatModelSelection();
    if (!chatModelSelection) {
      appendChatModelUnavailableError();
      return;
    }

    const requestConversationId = activeConversationId;

    const abortController = getNewAbortController();

    const effectiveThinkingMode = submittedThinkingMode ?? $kbSessionStore.thinkingMode ?? "off";

    pushAgentDebugEvent("THINKING_MODE_SOURCE_SAFE", {
      sourceName: "handleAskByModeWithExistingUser",
      rawValue: submittedThinkingMode,
      normalizedValue: effectiveThinkingMode,
      hasExplicitUserValue: submittedThinkingMode !== undefined && submittedThinkingMode !== null,
    }, "info");

    const effectiveWebAccessModeForTurn = submittedWebAccessMode ?? effectiveWebAccessMode;

    pushAgentDebugEvent("WEB_ACCESS_MODE_SOURCE_SAFE", {
      sourceName: "handleAskByModeWithExistingUser",
      rawValue: submittedWebAccessMode,
      normalizedValue: effectiveWebAccessModeForTurn,
      hasExplicitUserValue: submittedWebAccessMode !== undefined && submittedWebAccessMode !== null,
    }, "info");

    const result = await askByMode({
      mode,
      question,
      conversationId: activeConversationId,
      existingUserMessageId,
      thinkingMode: effectiveThinkingMode,
      customDocIds,
      attachedDocs,
      getState: () => $kbSessionStore,
      updateState: (updater) => {
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] updateState skipped: conversation switched during request");
            return state;
          }
          return { ...state, ...updater(state) };
        });
      },
      addMessage: (message) => {
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] addMessage skipped: conversation switched during request");
            return state;
          }
          return {
            ...state,
            messages: [...state.messages, message],
          };
        });
      },
      setMessages: (updater) => {
        kbSessionStore.update((state) => {
          if (state.activeConversationId !== requestConversationId) {
            console.warn("[KbMainPanel] setMessages skipped: conversation switched during request");
            return state;
          }
          return {
            ...state,
            messages: updater(state.messages),
          };
        });
      },
      abortSignal: abortController.signal,
      chatModelSelection,
      contextWindowTokens: getSelectedContextWindowTokens(),
      webAccessMode: effectiveWebAccessModeForTurn,
    });

    if (activeConversationId === requestConversationId) {
      kbSessionStore.syncActiveConversationSnapshot();
      refreshContextUsageSafe("regenerate_complete");
    }

    if (!result.success && result.error) {
      console.error(`[KbMainPanel] Regenerate failed: ${result.error}`);
    }
  }

  /**
   * 处理设置变更事件
   * 只刷新模型选项列表，不中断当前回答
   */
  function handleKbSettingsChanged(event: Event) {
    const detail = (event as CustomEvent).detail;
    const nextSettings = detail?.settings ?? detail;
    if (nextSettings?.assistantActionAlignment) {
      assistantActionAlignment = nextSettings.assistantActionAlignment;
    }
    if (nextSettings?.chatAppearance) {
      chatAppearance = nextSettings.chatAppearance;
    }
    if (nextSettings?.webSearch?.enabled !== undefined) {
      webSearchEnabled = nextSettings.webSearch.enabled;
      // 全局联网搜索开关关闭时，effectiveWebAccessMode 会自动经 reactive 显示为 "off"
      // 不调用 setWebAccessMode("off") 覆盖会话保存的偏好，避免用户重新开启全局设置后丢失会话偏好
    }
    if (nextSettings?.quickPrompts) {
      quickPromptsEnabled = nextSettings.quickPrompts.enabled ?? false;
      quickPromptsDocId = nextSettings.quickPrompts.docId ?? "";
    }
    if (nextSettings?.workbenchProcessDisplayMode) {
      workbenchDisplayMode = nextSettings.workbenchProcessDisplayMode;
    }
    if (nextSettings?.reasoningProcessDisplayMode) {
      reasoningDisplayMode = nextSettings.reasoningProcessDisplayMode;
    }
    void refreshChatModelOptions();
  }

  function handleBeforeUnload() {
    // 同步 flush：清除 debounce 定时器，立即持久化当前会话
    // sendBeacon 不可用（需要 JSON body），改为同步触发
    void kbSessionStore.persistConversationsNow();
  }

  onMount(() => {
    void (async () => {
      await kbSessionStore.hydrateConversations();
      await refreshChatModelOptions();
      try {
        const settings = await getKbSettings();
        webSearchEnabled = settings.webSearch?.enabled ?? false;
        quickPromptsEnabled = settings.quickPrompts?.enabled ?? false;
        quickPromptsDocId = settings.quickPrompts?.docId ?? "";
        workbenchDisplayMode = settings.workbenchProcessDisplayMode ?? "collapsed";
        reasoningDisplayMode = settings.reasoningProcessDisplayMode ?? "collapsed";
        chatAppearance = settings.chatAppearance ?? DEFAULT_CHAT_APPEARANCE_SETTINGS;
      } catch { /* ignore */ }
      refreshContextUsageSafe("hydrate");
    })();
    window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged as EventListener);

    // 页面卸载前立即 flush 当前会话持久化
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 注册文档内容编辑确认桥 handler
    const unregisterConfirmationHandler = setDocContentEditConfirmationHandler(async (request) => {
      return new Promise((resolve) => {
        activeDocContentEditConfirmationId = request.confirmationId;
        docContentEditModalOpen = true;
        docContentEditConfirmationResolve = resolve;
      });
    });

    // 注册 Native Agent 权限确认桥 handler（根据 displayMode 路由弹窗）
    const unregisterNativeBridge = RegisteredConfirmationBridge.setHandler(async (preview) => {
      return new Promise((resolve) => {
        const displayMode = preview.displayMode ?? "summary";

        if (displayMode === "block_diff" && preview.editDiffPreview) {
          // Open block diff dialog via svelteDialog
          nativePermissionPreview = {
            toolName: preview.toolName,
            title: preview.title,
            risk: preview.risk,
            summary: preview.summary,
            operationLabel: preview.operationLabel,
            targetSummary: preview.targetSummary,
            impactSummary: preview.impactSummary,
            riskReason: preview.riskReason,
            warnings: preview.warnings,
            missingPreviewReason: preview.missingPreviewReason,
            argsPreview: preview.argsPreview,
            displayMode,
            confirmationId: preview.confirmationId,
            editDiffPreview: preview.editDiffPreview,
            arrowFlow: preview.arrowFlow,
            sections: preview.sections,
          };
          nativePermissionResolve = resolve;
          openEditDiffPreviewDialog(preview.editDiffPreview).then((result) => {
            if (nativePermissionResolve === resolve) {
              nativePermissionResolve = null;
            }
            if (result.type === "deny") {
              void cleanupNativePermissionConfirmation(preview.confirmationId);
            }
            nativePermissionPreview = null;
            resolve(result);
          });
        } else {
          // Summary and arrow flow share the lightweight native permission modal.
          nativePermissionPreview = {
            toolName: preview.toolName,
            title: preview.title,
            risk: preview.risk,
            summary: preview.summary,
            operationLabel: preview.operationLabel,
            targetSummary: preview.targetSummary,
            impactSummary: preview.impactSummary,
            riskReason: preview.riskReason,
            warnings: preview.warnings,
            missingPreviewReason: preview.missingPreviewReason,
            argsPreview: preview.argsPreview,
            displayMode,
            confirmationId: preview.confirmationId,
            editDiffPreview: preview.editDiffPreview,
            arrowFlow: preview.arrowFlow,
            sections: preview.sections,
          };
          nativePermissionModalOpen = true;
          nativePermissionResolve = resolve;
        }
      });
    });

    const unregisterSelectionAskHandler = setSelectionAskPayloadHandler(placement, handleSelectionAskPayload);

    return () => {
      unregisterConfirmationHandler();
      unregisterNativeBridge();
      unregisterSelectionAskHandler();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  });

  let lastActiveConversationId = "";
  $: if (activeConversationId && activeConversationId !== lastActiveConversationId) {
    lastActiveConversationId = activeConversationId;
    refreshContextUsageSafe("conversation_switch");
  }

  let messagesDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (messages) {
    if (messagesDebounceTimer) clearTimeout(messagesDebounceTimer);
    messagesDebounceTimer = setTimeout(() => {
      refreshContextUsageSafe("messages_change");
    }, 500);
  }

  onDestroy(() => {
    if (messagesDebounceTimer) clearTimeout(messagesDebounceTimer);
    cancelPendingNativePermission("组件已销毁。");
    void kbSessionStore.persistConversationsNow();
    window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged as EventListener);
  });
</script>

<div class={`kb-main-panel style-${chatAppearance.style}`} class:empty-chat={messages.length === 0} class:has-sidebar={conversationSidebarOpen} class:mobile={placement === "mobile"}>
  <!-- 会话侧边栏 -->
  {#if conversationSidebarOpen}
    <ConversationSidebar
      {conversations}
      {activeConversationId}
      open={conversationSidebarOpen}
      disabled={asking}
      on:create={handleCreateConversation}
      on:switch={handleSwitchConversation}
      on:rename={handleRenameConversation}
      on:delete={handleDeleteConversation}
      on:close={handleCloseConversationSidebar}
    />
  {/if}

  <!-- 主内容区 -->
  <div class="main-content">
    <!-- 顶部工具栏 -->
    <div class="top-toolbar">
      <div class="toolbar-left">
        <button
          type="button"
          class="toolbar-btn"
          on:click={toggleConversationSidebar}
          class:active={conversationSidebarOpen}
          title={conversationSidebarOpen ? "关闭会话列表" : "打开会话列表"}
        >
          <span class="btn-icon"><SiyuanIcon name="iconMenu" size={13} /></span>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          on:click={handleCreateConversation}
          disabled={asking}
          title="新对话"
        >
          <span class="btn-icon"><SiyuanIcon name="iconAdd" size={13} /></span>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          on:click={handleOpenSettings}
          title="打开 AI 知识库设置"
        >
          <span class="btn-icon"><SiyuanIcon name="iconSettings" size={13} /></span>
        </button>
      </div>
      <div class="toolbar-right">
        <button
          type="button"
          class="toolbar-btn"
          on:click={handleCopyConversation}
          disabled={!hasMessagesToCopy || asking}
          title={asking ? "回答生成中，完成后可复制对话" : isCopiedAll ? "已复制" : "复制整段对话"}
        >
          <span class="btn-icon">
            <SiyuanIcon name={isCopiedAll ? "iconCheck" : "iconCopy"} size={13} />
          </span>
          <span class="btn-label">{isCopiedAll ? "已复制" : "复制对话"}</span>
        </button>
      </div>
    </div>

    <!-- 聊天区（消息列表 + 输入框） -->
    <div class="chat-wrapper">
      <!-- 聊天消息区域 -->
      <div class="chat-area">
        <ChatMessageList
          {messages}
          on:regenerate={handleRegenerate}
          on:retry={handleRetry}
          on:quoteSelection={handleQuoteSelection}
          on:editUserMessage={handleEditUserMessage}
          on:deleteTurn={handleDeleteTurn}
          on:sendSuggestedQuestion={handleSuggestedQuestion}
          {assistantActionAlignment}
          chatAppearanceStyle={chatAppearance.style}
          userAvatar={chatAppearance.userAvatar}
          assistantAvatar={chatAppearance.assistantAvatar}
          {suggestedQuestions}
          {workbenchDisplayMode}
          {reasoningDisplayMode}
          emptyTitle="开始提问"
          emptyDescription={placement === "tab"
            ? "标签页聊天不绑定当前文档，可使用全库问答检索知识库内容"
            : "选择提问范围，在下方输入框输入问题开始对话"}
        />

        <!-- 输入区 -->
        <ChatInputBar
          bind:this={chatInputBarRef}
          selectedMode={selectedMode}
          value={draftQuestion ?? ""}
          disabled={asking}
          placeholder="输入问题，按 Enter 发送"
          asking={asking}
          modelOptions={chatModelOptions}
          selectedModelKey={selectedChatModelKey}
          thinkingMode={$kbSessionStore.thinkingMode ?? "off"}
          contextUsage={$kbSessionStore.contextUsage}
          compressionState={$kbSessionStore.compressionState}
          compressedContextSummary={$kbSessionStore.compressedContextSummary}
          stageSummaryCount={($kbSessionStore.stageSummaries ?? []).length}
          {availableModes}
          webSearchEnabled={webSearchEnabled}
          webAccessMode={effectiveWebAccessMode}
          {quickPromptsEnabled}
          {quickPromptsDocId}
          chatAppearanceStyle={chatAppearance.style}
          mobile={placement === "mobile"}
          on:webAccessModeChange={(e) => { kbSessionStore.setWebAccessMode(e.detail); }}
          on:send={handleSend}
          on:stop={handleStop}
          on:modeChange={handleModeChange}
          on:input={handleInputChange}
          on:modelChange={handleModelChange}
          on:refreshModels={refreshChatModelOptions}
          on:thinkingModeChange={handleThinkingModeChange}
          on:attachedDocsChange={handleComposerAttachedDocsChange}
          on:compressionRequest={handleCompressionRequest}
          on:compressionClear={handleCompressionClear}
        />
      </div>
    </div>
  </div>

  {#if placement === "mobile" && mobileSettingsOpen}
    <div class="mobile-settings-overlay">
      <KbSettingsPanel mobile={true} close={handleCloseMobileSettings} />
    </div>
  {/if}
</div>

<DocContentEditConfirmationModal
  open={docContentEditModalOpen}
  confirmationId={activeDocContentEditConfirmationId}
  on:close={handleDocContentEditModalClose}
  on:cancel={handleDocContentEditCancelled}
  on:confirmed={handleDocContentEditConfirmed}
/>

<AgentToolPermissionModal
  open={nativePermissionModalOpen}
  toolName={nativePermissionPreview?.toolName ?? ""}
  title={nativePermissionPreview?.title ?? ""}
  risk={nativePermissionPreview?.risk ?? "medium"}
  summary={nativePermissionPreview?.summary ?? ""}
  operationLabel={nativePermissionPreview?.operationLabel ?? ""}
  targetSummary={nativePermissionPreview?.targetSummary ?? ""}
  impactSummary={nativePermissionPreview?.impactSummary ?? ""}
  riskReason={nativePermissionPreview?.riskReason ?? ""}
  warnings={nativePermissionPreview?.warnings ?? []}
  missingPreviewReason={nativePermissionPreview?.missingPreviewReason ?? ""}
  argsPreview={nativePermissionPreview?.argsPreview ?? {}}
  sections={nativePermissionPreview?.sections ?? []}
  arrowFlow={nativePermissionPreview?.arrowFlow}
  on:confirmed={handleNativePermissionConfirm}
  on:cancel={handleNativePermissionCancel}
/>

<style lang="scss">
  @use './_kb-tokens' as *;

  .kb-main-panel {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--b3-theme-background);
    position: relative;

    &.style-minimal {
      background: var(--b3-theme-background, #fff);
    }

    &.style-prose {
      background: var(--b3-theme-background, #fff);
    }

    &.style-card {
      background: var(--b3-theme-background, #fff);
    }

    &.style-minimal .main-content,
    &.style-prose .main-content,
    &.style-card .main-content {
      background: transparent;
    }

    // Sidebar open/close transition
    &.has-sidebar {
      :global(.conversation-sidebar) {
        // Sidebar slides in from left with spring-like easing
        animation: sidebar-slide-in 250ms $kb-ease-out both;
      }
    }
  }

  // ---- Non-default chat shell ----
  .kb-main-panel.style-minimal,
  .kb-main-panel.style-prose,
  .kb-main-panel.style-card {
    .top-toolbar {
      background: transparent;
      border-bottom: none;
      box-shadow: none;
      padding: 8px 12px;
      min-height: 32px;
    }

    .toolbar-btn {
      border: none;
      background: transparent;
      color: var(--b3-theme-on-surface-light, #6b7280);

      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 8%, transparent);
        border-color: transparent;
        box-shadow: none;
        transform: none;
      }

      &:active:not(:disabled) {
        transform: scale(0.97);
      }

      &.active {
        background: color-mix(in srgb, var(--b3-theme-primary, #3577f0) 12%, transparent);
        color: var(--b3-theme-primary, #3577f0);
        box-shadow: none;
      }
    }

    .btn-label {
      display: none;
    }

    .chat-wrapper {
      justify-content: center;
    }

    .chat-area {
      max-width: min(100%, 900px);
      margin: 0 auto;
      width: 100%;
      padding: 0;

      :global(.chat-input-wrapper) {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
      }
    }
  }

  .kb-main-panel.style-minimal.empty-chat,
  .kb-main-panel.style-prose.empty-chat,
  .kb-main-panel.style-card.empty-chat {
    .chat-area {
      justify-content: center;
    }

    :global(.chat-message-list) {
      flex: 0 0 auto;
      min-height: 0;
    }

    :global(.chat-scroll-viewport) {
      height: auto;
    }

    :global(.empty-state) {
      height: auto;
      padding: 24px 0;
    }
  }

  @keyframes sidebar-slide-in {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .main-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  // ---- Top Toolbar ----
  .top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $kb-space-xs $kb-space-md;
    background: var(--b3-theme-background);
    border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 60%, transparent);
    gap: $kb-space-sm;
    flex-shrink: 0;
    min-height: 38px;
    flex-wrap: wrap;
    box-shadow: $kb-shadow-card;
    z-index: 1;
    position: relative;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    flex-wrap: wrap;
  }

  // ---- Toolbar Button ----
  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    padding: $kb-space-xs $kb-space-sm;
    background: transparent;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface);
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
      box-shadow: $kb-shadow-raised;
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.97);
      box-shadow: $kb-shadow-card;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.active {
      background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
      border-color: color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
      color: var(--b3-theme-primary);
      box-shadow: $kb-shadow-card;

      // Liquid glass inner highlight
      box-shadow:
        $kb-shadow-card,
        inset 0 1px 0 rgba(255, 255, 255, 0.4);
    }
  }

  .btn-icon {
    display: flex;
    align-items: center;
    font-size: $kb-fs-sm;
  }

  .btn-label {
    font-size: $kb-fs-sm;
    line-height: 1;
  }

  // ---- Chat Area Layout ----
  .chat-wrapper {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;

    .chat-area {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      // Subtle breathing space
      padding: 0 $kb-space-sm;

      // Input bar as bottom: fixed height, not compressed
      :global(.chat-input-wrapper) {
        flex-shrink: 0;
        width: 100%;
        // Subtle top separator to separate messages from input
        border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 50%, transparent);
        padding-top: $kb-space-xs;
        margin-top: $kb-space-xs;
      }
    }
  }

  // ---- Custom Scrollbar ----
  .chat-area {
    // Webkit scrollbar styling
    &::-webkit-scrollbar {
      width: 5px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--b3-theme-on-surface) 18%, transparent);
      border-radius: 3px;

      &:hover {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 30%, transparent);
      }
    }
  }

  :global(.mobile-kb-chat-dialog .dialog-content) {
    padding: 0;
    overflow: hidden;
  }

  :global(.mobile-kb-chat-dialog .b3-dialog__container) {
    max-width: 100vw;
    max-height: 100dvh;
  }

  .kb-main-panel.mobile {
    flex-direction: column;
    height: 100%;
    background: var(--b3-theme-background);

    &.has-sidebar :global(.conversation-sidebar) {
      position: absolute;
      inset: 0 auto 0 0;
      width: min(86vw, 320px);
      max-width: 320px;
      z-index: 30;
      box-shadow: 12px 0 28px rgba(15, 23, 42, 0.18);
    }

    .top-toolbar {
      min-height: 44px;
      padding: 6px 10px;
      gap: 6px;
      flex-wrap: nowrap;
      box-shadow: none;
    }

    .toolbar-left,
    .toolbar-right {
      gap: 6px;
      flex-wrap: nowrap;
    }

    .toolbar-btn {
      min-width: 38px;
      min-height: 38px;
      justify-content: center;
      padding: 0 10px;
      border-radius: 12px;
      transform: none;

      &:hover:not(:disabled) {
        transform: none;
      }
    }

    .btn-label {
      display: none;
    }

    .chat-wrapper .chat-area {
      padding: 0;

      :global(.chat-input-wrapper) {
        margin-top: 0;
        padding-top: 0;
      }
    }

    .mobile-settings-overlay {
      position: absolute;
      inset: 0;
      z-index: 60;
      display: flex;
      min-width: 0;
      min-height: 0;
      background: var(--b3-theme-background);
    }
  }

  // ---- Dark Mode ----
  @media (prefers-color-scheme: dark) {
    .kb-main-panel .top-toolbar {
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.20),
        0 1px 2px rgba(0, 0, 0, 0.12);
      border-bottom-color: color-mix(in srgb, var(--b3-border-color) 40%, transparent);
    }

    .kb-main-panel .toolbar-btn {
      &.active {
        box-shadow:
          0 1px 3px rgba(0, 0, 0, 0.20),
          0 1px 2px rgba(0, 0, 0, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      &:hover:not(:disabled) {
        box-shadow:
          0 4px 12px rgba(0, 0, 0, 0.24),
          0 1px 3px rgba(0, 0, 0, 0.12);
      }
    }
  }

  // ---- Reduced Motion ----
  @media (prefers-reduced-motion: reduce) {
    .kb-main-panel.has-sidebar :global(.conversation-sidebar) {
      animation: none;
    }

    .kb-main-panel .toolbar-btn {
      transition: none;
    }
  }
</style>
