<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { kbSessionStore, getNewAbortController } from "../../stores/kb-session-store";
  import ChatMessageList from "../common/chat-message-list.svelte";
  import ChatInputBar from "../common/chat-input-bar.svelte";
  import ConversationSidebar from "../common/conversation-sidebar.svelte";
  import type { ExtendedKbSessionState } from "../../types/session";
  import type { ChatMode } from "../../constants/chat-modes";
  import { CHAT_MODES, DEFAULT_CHAT_MODE, getChatModeLabel } from "../../constants/chat-modes";
  import { askByMode } from "../../services/orchestration/ask-by-mode";
  import { pushAgentDebugEvent } from "../../services/agentic-rag/debug/agentic-rag-debug";
  import { getCurrentDocumentId } from "../../services/siyuan/current-doc-service";
  import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "../../services/settings/kb-settings-service";
  import {
    buildChatModelOptions,
    findDefaultChatModelOption,
  } from "../../services/settings/chat-model-options";
  import {
    buildChatModelKey,
    type ChatModelOption,
    type ChatModelSelection,
  } from "../../types/chat-model-selection";
  import type { KbAssistantActionAlignment } from "../../types/settings";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let placement: "dock" | "tab" = "dock";
  export let onOpenSettings: (() => void) | undefined = undefined;

  const TAB_CHAT_MODES: ChatMode[] = ["whole_kb"];
  const CURRENT_DOCUMENT_REQUIRED_MODES: ChatMode[] = [
    "current_notebook",
    "current_doc_with_children",
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

  let composerAttachedDocIds: string[] = [];

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
    detail: string | { question: string; mode?: ChatMode; thinkingMode?: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[] }
  ): { question: string; mode: ChatMode; thinkingMode: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[] } {
    const storeThinkingMode = $kbSessionStore.thinkingMode ?? "off";
    if (typeof detail === "string") {
      return { question: detail, mode: selectedMode, thinkingMode: storeThinkingMode };
    }
    const question = detail.question;
    const payloadMode = detail.mode;
    const payloadThinkingMode = detail.thinkingMode ?? storeThinkingMode;
    const attachedDocIds = detail.attachedDocIds;
    const attachedDocs = detail.attachedDocs;
    if (payloadMode && CHAT_MODES.some((m) => m.id === payloadMode)) {
      if (!availableModes || availableModes.includes(payloadMode)) {
        return { question, mode: payloadMode, thinkingMode: payloadThinkingMode, attachedDocIds, attachedDocs };
      }
    }
    return { question, mode: selectedMode, thinkingMode: payloadThinkingMode, attachedDocIds, attachedDocs };
  }

  async function handleSend(e: CustomEvent<string | { question: string; mode?: ChatMode; thinkingMode?: import("../../types/session").ThinkingMode; attachedDocIds?: string[]; attachedDocs?: import("../../types/chat").AttachedKbDoc[] }>) {
    if (asking) return;
    const { question, mode: effectiveMode, thinkingMode: submittedThinkingMode, attachedDocIds, attachedDocs } = normalizeSendPayload(e.detail);
    if (!question.trim()) return;

    if (effectiveMode !== storedSelectedMode) {
      kbSessionStore.setSelectedMode(effectiveMode);
    }

    if (submittedThinkingMode !== ($kbSessionStore.thinkingMode ?? "off")) {
      kbSessionStore.setThinkingMode(submittedThinkingMode);
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
      });
    }

    kbSessionStore.setDraftQuestion("");
    await handleAskByMode(effectiveMode, question, submittedThinkingMode, attachedDocIds, attachedDocs);
  }

  /**
   * 处理快捷建议问题点击
   */
  async function handleSuggestedQuestion(e: CustomEvent<string>) {
    if (asking) return;
    const question = e.detail;
    await handleAskByMode(selectedMode, question, $kbSessionStore.thinkingMode ?? "off");
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
      console.warn("[KbMainPanel] Compression failed:", result.error);
    }
    refreshContextUsageSafe("compression_applied");
  }

  function handleCompressionClear() {
    if (asking) return;
    kbSessionStore.clearCompression();
    refreshContextUsageSafe("compression_cleared");
  }

  function handleStop() {
    kbSessionStore.stop();
    kbSessionStore.syncActiveConversationSnapshot();
    refreshContextUsageSafe("stop");
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

    kbSessionStore.update((state) => ({
      ...state,
      messages: state.messages.slice(0, -1),
    }));

    const requestContext = precedingUserMessage.requestContext;
    const rawMode = requestContext?.originalMode as ChatMode | undefined;
    const effectiveMode = rawMode && CHAT_MODES.some((m) => m.id === rawMode) ? rawMode : selectedMode;

    const reusedThinkingMode = requestContext?.thinkingMode as import("../../types/session").ThinkingMode | undefined;
    const hasThinkingMode = !!reusedThinkingMode;
    const thinkingModeSource = hasThinkingMode ? "requestContext" : "store";

    if (requestContext) {
      pushAgentDebugEvent("REGENERATE_REQUEST_CONTEXT_REUSED_SAFE", {
        originalMode: requestContext.originalMode,
        effectiveScopeMode: requestContext.effectiveScopeMode,
        hasCustomDocs: Array.isArray(requestContext.customDocIds) && requestContext.customDocIds.length > 0,
        docCount: requestContext.customDocIds?.length ?? 0,
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
    }, "info");

    await handleAskByModeWithExistingUser(
      effectiveMode,
      precedingUserMessage.content,
      precedingUserMessage.id,
      chatModelSelection,
      requestContext?.customDocIds,
      requestContext?.attachedDocs,
      reusedThinkingMode,
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
    const thinkingModeSource = hasThinkingMode ? "requestContext" : "store";

    pushAgentDebugEvent("RETRY_REQUEST_CONTEXT_REUSED_SAFE", {
      hasRequestContext,
      originalMode: requestContext?.originalMode ?? "unknown",
      effectiveScopeMode: requestContext?.effectiveScopeMode ?? effectiveMode,
      customDocCount: customDocIds?.length ?? attachedDocs?.length ?? 0,
      missingRequestContext: !hasRequestContext,
    }, "info");

    pushAgentDebugEvent("RETRY_THINKING_CONTEXT_REUSED_SAFE", {
      hasThinkingMode,
      thinkingModeSource,
    }, "info");

    await handleAskByModeWithExistingUser(
      effectiveMode,
      recentUserMessage.content,
      recentUserMessage.id,
      chatModelSelection,
      customDocIds,
      attachedDocs,
      reusedThinkingMode,
    );
  }

  // 切换会话侧边栏显示
  function toggleConversationSidebar() {
    conversationSidebarOpen = !conversationSidebarOpen;
  }

  function handleOpenSettings() {
    onOpenSettings?.();
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
  async function handleAskByMode(mode: ChatMode, question: string, submittedThinkingMode?: import("../../types/session").ThinkingMode, customDocIds?: string[], attachedDocs?: import("../../types/chat").AttachedKbDoc[]) {
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

    console.info("[KB-AGENT | THINKING_MODE_SOURCE_SAFE]", {
      sourceName: "handleAskByMode",
      rawValue: submittedThinkingMode,
      normalizedValue: effectiveThinkingMode,
      hasExplicitUserValue: submittedThinkingMode !== undefined && submittedThinkingMode !== null,
      mode,
    });

    const result = await askByMode({
      mode,
      question,
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

    const result = await askByMode({
      mode,
      question,
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
    if (detail?.assistantActionAlignment) {
      assistantActionAlignment = detail.assistantActionAlignment;
    }
    void refreshChatModelOptions();
  }

  onMount(() => {
    void (async () => {
      await kbSessionStore.hydrateConversations();
      await refreshChatModelOptions();
      refreshContextUsageSafe("hydrate");
    })();
    window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged as EventListener);
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
    void kbSessionStore.persistConversationsNow();
    window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged as EventListener);
  });
</script>

<div class="kb-main-panel" class:has-sidebar={conversationSidebarOpen}>
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
          <span class="btn-label">会话</span>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          on:click={handleCreateConversation}
          disabled={asking}
          title="新对话"
        >
          <span class="btn-icon"><SiyuanIcon name="iconAdd" size={13} /></span>
          <span class="btn-label">新对话</span>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          on:click={handleOpenSettings}
          title="打开 AI 知识库设置"
        >
          <span class="btn-icon"><SiyuanIcon name="iconSettings" size={13} /></span>
          <span class="btn-label">设置</span>
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
          on:sendSuggestedQuestion={handleSuggestedQuestion}
          {assistantActionAlignment}
          {suggestedQuestions}
          emptyTitle="开始提问"
          emptyDescription={placement === "tab"
            ? "标签页聊天不绑定当前文档，可使用全库问答检索知识库内容"
            : "选择提问范围，在下方输入框输入问题开始对话"}
        />

        <!-- 输入区 -->
        <ChatInputBar
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
          {availableModes}
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
</div>

<style lang="scss">
  .kb-main-panel {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--b3-theme-background);
    /* 确保主面板作为 flex 容器能正确约束子元素 */
    position: relative;
  }

  .main-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--b3-theme-surface-light);
    border-bottom: 1px solid var(--b3-border-color);
    gap: 8px;
    flex-shrink: 0;
    min-height: 36px;
    flex-wrap: wrap;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.active {
      background: var(--b3-theme-primary-lightest, rgba(66, 133, 244, 0.1));
      border-color: var(--b3-theme-primary-light, rgba(66, 133, 244, 0.5));
      color: var(--b3-theme-primary);
    }
  }

  // 聊天区布局
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
      /* 确保 chat-area 能正确传递约束给子元素 */
      position: relative;

      // 输入框作为底部区域，不能被压缩
      :global(.chat-input-wrapper) {
        flex-shrink: 0;
        width: 100%;
      }
    }
  }

  .btn-icon {
    font-size: 12px;
  }

  .btn-label {
    font-size: 12px;
  }
</style>
