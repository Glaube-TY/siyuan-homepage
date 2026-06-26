<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { Button } from "siyuan-kit-svelte";
  import { showMessage } from "siyuan";
  import { CHAT_MODES, type ChatMode, isChatModeAvailable } from "../../constants/chat-modes";
  import type { ChatModelOption, ChatModelSelection } from "../../types/chat-model-selection";
  import type { ThinkingMode } from "../../types/session";
  import type { ContextUsageSnapshot } from "../../types/context-usage";
  import type { AttachedKbDoc } from "../../types/chat";
  import { searchDocsForChatAttachment, type ChatDocSearchResult } from "../../services/siyuan/search-docs-for-chat";
  import { getCurrentDocumentId, resolveDocMetaForAttachment } from "../../services/siyuan/current-doc-service";
  import { navigateToDocId } from "../../services/siyuan/reference-navigation";
  import { pushAgentDebugEvent } from "../../services/agent-workbench/debug/workbench-debug";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { floatingPopoverAction } from "@/components/utils/shared/floating-popover-action";
  import { listQuickPromptItems, createQuickPromptItem, updateQuickPromptItemInDoc, deleteQuickPromptItemInDoc } from "../../services/quick-prompts/quick-prompts-doc";
  import type { QuickPromptItem } from "../../services/quick-prompts/quick-prompts-doc";
  import { confirmDialogBoolean } from "@/libs/dialog";

  export let value: string = "";
  export let disabled: boolean = false;
  export let placeholder: string = "输入问题，按 Enter 发送";
  export let selectedMode: ChatMode = "whole_kb";
  export let asking: boolean = false;
  export let modelOptions: ChatModelOption[] = [];
  export let selectedModelKey: string = "";
  export let availableModes: ChatMode[] | undefined = undefined;
  export let thinkingMode: ThinkingMode = "off";
  export let contextUsage: ContextUsageSnapshot | undefined = undefined;
  export let compressionState: import("../../types/context-usage").ContextCompressionState | undefined = undefined;
  export let compressedContextSummary: string | undefined = undefined;
  export let stageSummaryCount: number = 0;
  export let webSearchEnabled: boolean = false;
  export let webAccessMode: "off" | "smart" | "required" = "off";
  export let quickPromptsEnabled: boolean = false;
  export let quickPromptsDocId: string = "";
  export let mobile: boolean = false;

  let inputValue = value;
  let textareaElement: HTMLTextAreaElement;
  let showModeMenu = false;
  let showModelMenu = false;
  let showContextPopover = false;
  let showWebAccessMenu = false;
  let showMobileActions = false;
  let contextRingEl: HTMLDivElement | undefined;

  // Quick prompts
  let showQuickPrompts = false;
  let quickPromptItems: QuickPromptItem[] = [];
  let quickPromptsLoading = false;
  let quickPromptManageMode = false;
  let editingQuickPromptId: string | null = null;
  let editingQuickPromptText = "";
  let newQuickPromptText = "";
  let quickPromptSaving = false;
  let quickPromptError = "";

  // Web access mode helpers
  $: if (!webSearchEnabled) webAccessMode = "off";

  function toggleWebAccessMode() {
    showWebAccessMenu = !showWebAccessMenu;
    if (showWebAccessMenu) {
      showModeMenu = false;
      showModelMenu = false;
      showDocSearch = false;
      closeContextPopover();
    }
  }

  function selectWebAccessMode(mode: "off" | "smart" | "required") {
    webAccessMode = mode;
    showWebAccessMenu = false;
    dispatch("webAccessModeChange", mode);
  }

  // Auto-close web access menu when disabled
  $: if (asking || !webSearchEnabled) {
    showWebAccessMenu = false;
  }
  let contextPopoverEl: HTMLElement | undefined;
  let contextPopoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let contextPopoverTrigger: "hover" | "focus" | "click" = "hover";

  $: canCompress = (() => {
    if (asking) return false;
    if (stageSummaryCount === 0) return false;
    const latestCompressedStageIndex = compressionState?.latestCompressedStageIndex ?? 0;
    if (compressionState?.enabled && latestCompressedStageIndex >= stageSummaryCount) return false;
    return true;
  })();

  $: compressDisabledReason = (() => {
    if (asking) return "正在问答中";
    if (stageSummaryCount === 0) return "当前还没有历史摘要，暂时无法压缩。";
    const latestCompressedStageIndex = compressionState?.latestCompressedStageIndex ?? 0;
    if (compressionState?.enabled && latestCompressedStageIndex >= stageSummaryCount) return "压缩已是最新";
    return "";
  })();

  function openContextPopover(trigger: "hover" | "focus" | "click") {
    if (contextPopoverCloseTimer) {
      clearTimeout(contextPopoverCloseTimer);
      contextPopoverCloseTimer = null;
    }
    const wasOpen = showContextPopover;
    showContextPopover = true;
    contextPopoverTrigger = trigger;
    if (!wasOpen) {
      pushAgentDebugEvent("CONTEXT_USAGE_POPOVER_OPEN_SAFE", {
        level: contextUsage?.level ?? "normal",
        hasCompression: !!compressionState?.enabled,
        canCompress,
        trigger,
      }, "info");
    }
  }

  function scheduleCloseContextPopover() {
    if (contextPopoverCloseTimer) clearTimeout(contextPopoverCloseTimer);
    contextPopoverCloseTimer = setTimeout(() => {
      showContextPopover = false;
      contextPopoverCloseTimer = null;
    }, 200);
  }

  function closeContextPopover() {
    if (contextPopoverCloseTimer) {
      clearTimeout(contextPopoverCloseTimer);
      contextPopoverCloseTimer = null;
    }
    showContextPopover = false;
  }

  function toggleContextPopoverByClick() {
    if (showContextPopover) {
      closeContextPopover();
    } else {
      openContextPopover("click");
    }
  }

  function onRingMouseEnter() {
    openContextPopover("hover");
  }

  function onRingMouseLeave() {
    if (contextPopoverTrigger === "hover") {
      scheduleCloseContextPopover();
    }
  }

  function onPopoverMouseEnter() {
    if (contextPopoverCloseTimer) {
      clearTimeout(contextPopoverCloseTimer);
      contextPopoverCloseTimer = null;
    }
  }

  function onPopoverMouseLeave() {
    if (contextPopoverTrigger === "hover" || contextPopoverTrigger === "focus") {
      scheduleCloseContextPopover();
    }
  }

  function onRingFocus() {
    openContextPopover("focus");
  }

  function onRingBlur(e: FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && contextPopoverEl?.contains(related)) return;
    if (contextPopoverTrigger === "focus") {
      scheduleCloseContextPopover();
    }
  }

  function handleContextPopoverKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeContextPopover();
    }
  }

  function handleCompressAction() {
    const action = compressionState?.enabled ? "update_compression" : "compress";
    pushAgentDebugEvent("CONTEXT_USAGE_POPOVER_ACTION_SAFE", {
      action,
      hasCompression: !!compressionState?.enabled,
      canCompress,
    }, "info");
    closeContextPopover();
    dispatch("compressionRequest");
  }

  function handleClearCompressionAction() {
    pushAgentDebugEvent("CONTEXT_USAGE_POPOVER_ACTION_SAFE", {
      action: "clear_compression",
      hasCompression: !!compressionState?.enabled,
      canCompress,
    }, "info");
    closeContextPopover();
    dispatch("compressionClear");
  }

  let attachedDocs: AttachedKbDoc[] = [];
  let showDocSearch = false;
  let docSearchQuery = "";
  let docSearchResults: ChatDocSearchResult[] = [];
  let docSearchLoading = false;
  let docSearchDebounceId: ReturnType<typeof setTimeout> | null = null;

  $: inputValue = value;
  $: visibleChatModes = availableModes?.length
    ? CHAT_MODES.filter((mode) => availableModes.includes(mode.id))
    : CHAT_MODES;
  $: modeSelectorLocked = attachedDocs.length > 0;
  $: attachedDocIdSet = new Set(attachedDocs.map((d) => d.docId));
  $: visibleDocSearchResults = docSearchResults.filter((r) => !attachedDocIdSet.has(r.docId));
  $: currentDocAlreadyAttached = (() => {
    const docId = getCurrentDocumentId();
    return docId ? attachedDocIdSet.has(docId) : false;
  })();

  let scopeLockTraceEmitted = false;
  $: {
    const effectiveScopeMode = modeSelectorLocked ? "custom_docs" : selectedMode;
    if (modeSelectorLocked && !scopeLockTraceEmitted) {
      scopeLockTraceEmitted = true;
      pushAgentDebugEvent("INPUT_SCOPE_LOCK_SAFE", {
        attachedDocCount: attachedDocs.length,
        selectedMode,
        effectiveScopeMode,
        modeSelectorLocked: true,
      }, "info");
    } else if (!modeSelectorLocked && scopeLockTraceEmitted) {
      scopeLockTraceEmitted = false;
      pushAgentDebugEvent("INPUT_SCOPE_LOCK_SAFE", {
        attachedDocCount: 0,
        selectedMode,
        effectiveScopeMode: selectedMode,
        modeSelectorLocked: false,
      }, "info");
    }
  }

  let lastRingTraceLevel: string | null = null;
  let lastRingUsageRatioPct: number = -1;
  let lastAttachedDocCount: number = -1;
  $: {
    const pct = contextUsage ? Math.round(contextUsage.usageRatio * 100) : 0;
    const docCount = attachedDocs.length;
    const pctDelta = Math.abs(pct - lastRingUsageRatioPct);
    if (pctDelta >= 5 || docCount !== lastAttachedDocCount || (contextUsage && contextUsage.level !== lastRingTraceLevel)) {
      lastRingTraceLevel = contextUsage?.level ?? null;
      lastRingUsageRatioPct = pct;
      lastAttachedDocCount = docCount;
      pushAgentDebugEvent("CONTEXT_USAGE_RING_RENDER_SAFE", {
        hasSnapshot: !!contextUsage,
        usageRatioPct: pct,
        level: contextUsage?.level ?? "normal",
        placement: "bottom-action-row",
      }, "info");
    }
  }

  let lastCompressionTraceKey: string | null = null;
  $: {
    const hasSummary = !!compressedContextSummary;
    const traceKey = `${hasSummary}_${compressionState?.compressedMessageCount ?? 0}`;
    if (traceKey !== lastCompressionTraceKey) {
      lastCompressionTraceKey = traceKey;
      pushAgentDebugEvent("CONTEXT_COMPRESSION_STATE_RENDER_SAFE", {
        hasSummary,
        compressedMessageCount: compressionState?.compressedMessageCount ?? 0,
        summaryTokenEstimate: compressionState?.summaryTokenEstimate ?? 0,
      }, "info");
    }
  }

  let lastDispatchedDocIdsKey = "";
  $: {
    const currentKey = attachedDocs.map((d) => d.docId).join(",");
    if (currentKey !== lastDispatchedDocIdsKey) {
      lastDispatchedDocIdsKey = currentKey;
      dispatch("attachedDocsChange", { docIds: attachedDocs.map((d) => d.docId) });
    }
  }

  $: currentModeLabel = modeSelectorLocked
    ? "特定文档上下文"
    : visibleChatModes.find((m) => m.id === selectedMode)?.label ||
      CHAT_MODES.find((m) => m.id === selectedMode)?.label ||
      selectedMode;
  $: matchedModelOption = modelOptions.find((m) => m.key === selectedModelKey);
  $: hasValidSelectedModel = modelOptions.length > 0 && !!matchedModelOption;
  $: currentModelLabel = (() => {
    if (matchedModelOption) return matchedModelOption.label;
    if (modelOptions.length > 0) return "请选择模型";
    return "暂无可用模型";
  })();
  $: modelButtonTitle = (() => {
    if (matchedModelOption) return `当前模型：${matchedModelOption.label}`;
    if (modelOptions.length > 0) return "请选择模型";
    return "暂无可用模型，请先在设置中添加并启用模型";
  })();
  $: mobileWebAccessLabel = webAccessMode === "required"
    ? "必须联网"
    : webAccessMode === "smart"
      ? "智能搜索"
      : "关闭搜索";
  $: if (asking) {
    showModeMenu = false;
    showModelMenu = false;
    showMobileActions = false;
  }

  const dispatch = createEventDispatcher<{
    send: { question: string; mode: ChatMode; thinkingMode: ThinkingMode; attachedDocIds?: string[]; attachedDocs?: AttachedKbDoc[]; webAccessMode?: "off" | "smart" | "required" };
    stop: void;
    modeChange: ChatMode;
    input: string;
    modelChange: ChatModelSelection;
    refreshModels: void;
    thinkingModeChange: ThinkingMode;
    attachedDocsChange: { docIds: string[] };
    compressionRequest: void;
    compressionClear: void;
    webAccessModeChange: "off" | "smart" | "required";
  }>();

  function toggleThinkingMode() {
    if (asking) return;
    const next: ThinkingMode = thinkingMode === "off" ? "on" : "off";
    thinkingMode = next;
    dispatch("thinkingModeChange", next);
  }

  function handleSend() {
    const trimmed = inputValue.trim();
    if (trimmed && !disabled && !asking && hasValidSelectedModel) {
      const docIds = attachedDocs.map((d) => d.docId);
      const docsPayload = attachedDocs.length > 0 ? attachedDocs : undefined;
      pushAgentDebugEvent("MANUAL_DOC_SEND_PAYLOAD_SAFE", {
        attachedDocCount: attachedDocs.length,
        originalMode: selectedMode,
        hasAttachedDocs: attachedDocs.length > 0,
      }, "info");
      pushAgentDebugEvent("INPUT_SCOPE_LOCK_SAFE", {
        attachedDocCount: attachedDocs.length,
        selectedMode,
        effectiveScopeMode: attachedDocs.length > 0 ? "custom_docs" : selectedMode,
        modeSelectorLocked,
      }, "info");
      dispatch("send", { question: trimmed, mode: selectedMode, thinkingMode, attachedDocIds: docIds.length > 0 ? docIds : undefined, attachedDocs: docsPayload, webAccessMode });
      inputValue = "";
      value = "";
      attachedDocs = [];
      showDocSearch = false;
      docSearchResults = [];
      docSearchQuery = "";
    }
  }

  function handleStop() {
    dispatch("stop");
  }

  function closeMobileActions() {
    showMobileActions = false;
  }

  function toggleMobileActions() {
    if (asking) return;
    showMobileActions = !showMobileActions;
    if (showMobileActions) {
      showModeMenu = false;
      showModelMenu = false;
      showWebAccessMenu = false;
      showDocSearch = false;
      closeContextPopover();
      closeQuickPrompts();
      dispatch("refreshModels");
      if (quickPromptsEnabled && quickPromptsDocId) {
        void loadQuickPrompts();
      }
    }
  }

  function handleMobileModeSelect(mode: ChatMode) {
    if (modeSelectorLocked) return;
    selectMode(mode);
    closeMobileActions();
  }

  function handleMobileModelSelect(option: ChatModelOption) {
    selectModel(option);
    closeMobileActions();
  }

  function handleMobileWebAccessSelect(mode: "off" | "smart" | "required") {
    selectWebAccessMode(mode);
    closeMobileActions();
  }

  function handleMobileDocSearch() {
    closeMobileActions();
    toggleDocSearch();
  }

  function handleMobileThinkingToggle() {
    toggleThinkingMode();
    closeMobileActions();
  }

  function handleMobileCompressAction() {
    handleCompressAction();
    closeMobileActions();
  }

  function handleMobileClearCompressionAction() {
    handleClearCompressionAction();
    closeMobileActions();
  }

  function handleMobileQuickPromptClick(item: QuickPromptItem) {
    handleQuickPromptClick(item);
    closeMobileActions();
  }

  export function focusTextarea() {
    textareaElement?.focus();
  }

  export function setAttachedDocs(docs: AttachedKbDoc[]) {
    const seen = new Set<string>();
    attachedDocs = docs.filter((doc) => {
      if (!doc.docId || seen.has(doc.docId)) return false;
      seen.add(doc.docId);
      return true;
    });
    showDocSearch = false;
    docSearchResults = [];
    docSearchQuery = "";
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (showDocSearch) {
        showDocSearch = false;
        docSearchResults = [];
        docSearchQuery = "";
        event.preventDefault();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    dispatch("input", inputValue);
  }

  function addDocFromSearch(result: ChatDocSearchResult) {
    if (attachedDocs.some((d) => d.docId === result.docId)) return;
    attachedDocs = [...attachedDocs, {
      docId: result.docId,
      title: result.title,
      box: result.box,
      path: result.path,
      source: "manual_search",
      createdAt: Date.now(),
    }];
    pushAgentDebugEvent("MANUAL_DOC_SELECTED_SAFE", {
      selectedDocCount: attachedDocs.length,
      alreadySelectedGuard: true,
    }, "info");
  }

  async function addCurrentDoc() {
    const docId = getCurrentDocumentId();
    if (!docId) {
      pushAgentDebugEvent("CURRENT_DOC_ATTACHED_SAFE", {
        hasCurrentDoc: false,
        selectedDocCount: attachedDocs.length,
      }, "info");
      return;
    }
    if (attachedDocs.some((d) => d.docId === docId)) return;

    const meta = await resolveDocMetaForAttachment(docId);
    attachedDocs = [...attachedDocs, {
      docId: meta.docId,
      title: meta.title,
      box: meta.box,
      path: meta.path,
      source: "current_doc",
      createdAt: Date.now(),
    }];

    pushAgentDebugEvent("CURRENT_DOC_ATTACHED_SAFE", {
      hasCurrentDoc: true,
      selectedDocCount: attachedDocs.length,
    }, "info");
    pushAgentDebugEvent("CURRENT_DOC_META_RESOLVED_SAFE", {
      hasDocId: !!meta.docId,
      hasTitle: meta.title !== "未命名文档",
      hasBox: !!meta.box,
      hasPath: !!meta.path,
      source: "current_doc",
    }, "info");
  }

  function removeDoc(docId: string) {
    attachedDocs = attachedDocs.filter((d) => d.docId !== docId);
  }

  async function handleInputChipClick(doc: AttachedKbDoc, event: MouseEvent) {
    event.stopPropagation();
    if (!doc.docId) return;
    const success = await navigateToDocId(doc.docId, doc.title);
    pushAgentDebugEvent("INPUT_ATTACHED_DOC_NAVIGATE_SAFE", {
      hasDocId: true,
      success,
      source: doc.source,
    }, "info");
  }

  function toggleDocSearch() {
    if (asking) return;
    showDocSearch = !showDocSearch;
    if (showDocSearch) {
      docSearchQuery = "";
      docSearchResults = [];
      showWebAccessMenu = false;
    }
  }

  async function handleDocSearchInput() {
    if (docSearchDebounceId) clearTimeout(docSearchDebounceId);
    const queryChars = docSearchQuery.trim().length;
    pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_START_SAFE", {
      queryChars,
      source: "handleDocSearchInput",
    }, "debug");
    docSearchDebounceId = setTimeout(async () => {
      docSearchLoading = true;
      try {
        docSearchResults = await searchDocsForChatAttachment(docSearchQuery);
        pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_DONE_SAFE", {
          queryChars,
          resultCount: docSearchResults.length,
        }, "debug");
        if (docSearchResults.length > 0 && !showDocSearch) {
          pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_RENDER_MISMATCH_SAFE", {
            resultCount: docSearchResults.length,
            showDocSearch,
            docSearchQueryChars: queryChars,
          }, "warn");
        }
      } catch (e) {
        docSearchResults = [];
        pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_ERROR_SAFE", {
          queryChars,
          errorCode: "input_search_failed",
        }, "warn");
      }
      docSearchLoading = false;
    }, 300);
  }

  function selectMode(mode: ChatMode) {
    if (asking) return;
    if (!visibleChatModes.some((item) => item.id === mode)) return;
    if (isChatModeAvailable(mode)) {
      selectedMode = mode;
      dispatch("modeChange", mode);
    } else {
      showMessage(`「${CHAT_MODES.find(m => m.id === mode)?.label}」功能暂未开放`);
    }
    showModeMenu = false;
    showModelMenu = false;
  }

  function toggleModeMenu() {
    if (asking || modeSelectorLocked) return;
    showModeMenu = !showModeMenu;
    if (showModeMenu) {
      showModelMenu = false;
      showWebAccessMenu = false;
    }
  }

  function toggleModelMenu() {
    if (asking) return;
    showModelMenu = !showModelMenu;
    if (showModelMenu) {
      showModeMenu = false;
      showWebAccessMenu = false;
      dispatch("refreshModels");
    }
  }

  function selectModel(option: ChatModelOption) {
    if (asking) return;
    selectedModelKey = option.key;
    dispatch("modelChange", {
      providerId: option.providerId,
      modelId: option.modelId,
    });
    showModelMenu = false;
    showModeMenu = false;
  }

  function toggleQuickPrompts() {
    if (asking) return;
    if (showQuickPrompts) {
      closeQuickPrompts();
      return;
    }
    showQuickPrompts = true;
    showModeMenu = false;
    showModelMenu = false;
    showDocSearch = false;
    showWebAccessMenu = false;
    closeContextPopover();
    void loadQuickPrompts();
  }

  async function loadQuickPrompts() {
    if (!quickPromptsDocId) return;
    quickPromptsLoading = true;
    try {
      quickPromptItems = await listQuickPromptItems(quickPromptsDocId);
    } catch {
      quickPromptItems = [];
    }
    quickPromptsLoading = false;
  }

  function handleQuickPromptClick(item: QuickPromptItem) {
    const current = inputValue.trim();
    if (current) {
      inputValue = current + "\n\n" + item.text;
    } else {
      inputValue = item.text;
    }
    dispatch("input", inputValue);
    closeQuickPrompts();
    setTimeout(() => {
      textareaElement?.focus();
    }, 0);
  }

  function closeQuickPrompts() {
    showQuickPrompts = false;
    quickPromptManageMode = false;
    editingQuickPromptId = null;
    editingQuickPromptText = "";
    newQuickPromptText = "";
    quickPromptError = "";
  }

  function toggleQuickPromptManageMode() {
    quickPromptManageMode = !quickPromptManageMode;
    if (!quickPromptManageMode) {
      editingQuickPromptId = null;
      editingQuickPromptText = "";
      newQuickPromptText = "";
      quickPromptError = "";
    }
  }

  function startEditQuickPrompt(item: QuickPromptItem) {
    editingQuickPromptId = item.id;
    editingQuickPromptText = item.text;
    quickPromptError = "";
  }

  function cancelEditQuickPrompt() {
    editingQuickPromptId = null;
    editingQuickPromptText = "";
    quickPromptError = "";
  }

  async function saveEditQuickPrompt(item: QuickPromptItem) {
    if (!quickPromptsDocId || !editingQuickPromptText.trim()) return;
    quickPromptSaving = true;
    quickPromptError = "";
    try {
      const ok = await updateQuickPromptItemInDoc(quickPromptsDocId, item.id, editingQuickPromptText);
      if (ok) {
        editingQuickPromptId = null;
        editingQuickPromptText = "";
        await loadQuickPrompts();
      } else {
        quickPromptError = "保存失败";
      }
    } catch {
      quickPromptError = "保存失败";
    }
    quickPromptSaving = false;
  }

  async function handleDeleteQuickPrompt(item: QuickPromptItem) {
    if (!quickPromptsDocId) return;
    const confirmed = await confirmDialogBoolean({
      title: "删除提示语",
      content: "确定删除这条提示语？",
    });
    if (!confirmed) return;
    quickPromptSaving = true;
    quickPromptError = "";
    try {
      const ok = await deleteQuickPromptItemInDoc(quickPromptsDocId, item.id);
      if (ok) {
        await loadQuickPrompts();
      } else {
        quickPromptError = "删除失败";
      }
    } catch {
      quickPromptError = "删除失败";
    }
    quickPromptSaving = false;
  }

  async function handleAddQuickPromptFromInput() {
    if (!quickPromptsDocId) return;
    const text = inputValue.trim();
    if (!text) return;
    quickPromptSaving = true;
    quickPromptError = "";
    try {
      const newId = await createQuickPromptItem(quickPromptsDocId, text);
      if (newId) {
        await loadQuickPrompts();
      } else {
        quickPromptError = "新增失败";
      }
    } catch {
      quickPromptError = "新增失败";
    }
    quickPromptSaving = false;
  }

  async function handleAddNewQuickPrompt() {
    if (!quickPromptsDocId || !newQuickPromptText.trim()) return;
    quickPromptSaving = true;
    quickPromptError = "";
    try {
      const newId = await createQuickPromptItem(quickPromptsDocId, newQuickPromptText);
      if (newId) {
        newQuickPromptText = "";
        await loadQuickPrompts();
      } else {
        quickPromptError = "新增失败";
      }
    } catch {
      quickPromptError = "新增失败";
    }
    quickPromptSaving = false;
  }

  function eventPathContains(event: MouseEvent, selector: string): boolean {
    const path = event.composedPath();
    if (path.length > 0) {
      return path.some((el) => (el as HTMLElement).matches?.(selector));
    }
    return (event.target as HTMLElement).closest(selector) !== null;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".mode-selector")) {
      showModeMenu = false;
    }
    if (!target.closest(".model-selector")) {
      showModelMenu = false;
    }
    // 使用 composedPath 判断，防止点击搜索结果后 DOM 被移除导致 closest 失效
    if (!eventPathContains(event, ".doc-search-container") && !eventPathContains(event, ".doc-search-trigger")) {
      showDocSearch = false;
      docSearchResults = [];
      docSearchQuery = "";
    }
    if (!target.closest(".web-search-toggle")) {
      showWebAccessMenu = false;
    }
    if (!target.closest(".context-usage-ring") && !target.closest(".context-usage-popover")) {
      closeContextPopover();
    }
    if (!target.closest(".quick-prompts-toggle") && !target.closest(".quick-prompts-menu")) {
      closeQuickPrompts();
    }
    if (!target.closest(".mobile-actions-trigger") && !target.closest(".mobile-actions-menu")) {
      closeMobileActions();
    }
  }



  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleContextPopoverKeydown);
    document.addEventListener("keydown", handleWebAccessKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleContextPopoverKeydown);
    document.removeEventListener("keydown", handleWebAccessKeydown);
    if (contextPopoverCloseTimer) {
      clearTimeout(contextPopoverCloseTimer);
      contextPopoverCloseTimer = null;
    }
  });

  function handleWebAccessKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showWebAccessMenu) {
      showWebAccessMenu = false;
    }
  }
</script>

<div class="chat-input-wrapper" class:mobile={mobile}>
  <div class="chat-input-box">
    <!-- Top tools row -->
    <div class="input-tools-row {mobile ? 'mobile-hidden' : ''}">
      <div class="mode-selector">
        <button
          type="button"
          class="mode-button"
          on:click={toggleModeMenu}
          disabled={asking || modeSelectorLocked}
          title={modeSelectorLocked ? "已选择特定文档，本轮将基于这些文档回答；清除文档后可切换检索范围" : "选择资料引用范围"}
        >
          <span class="mode-icon"><SiyuanIcon name="iconLink" size={14} /></span>
          <span class="mode-label">{currentModeLabel}</span>
          {#if !modeSelectorLocked}
            <span class="mode-arrow"><SiyuanIcon name="iconDown" size={10} /></span>
          {/if}
        </button>

        {#if showModeMenu}
          <div class="mode-menu">
            {#each visibleChatModes as mode}
              <button
                type="button"
                class="mode-option"
                class:selected={selectedMode === mode.id}
                class:disabled={!mode.available}
                on:click={() => selectMode(mode.id)}
              >
                <span class="option-label">{mode.label}</span>
                {#if !mode.available}
                  <span class="option-badge">未开放</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if webSearchEnabled}
        <!-- Web search mode toggle -->
        <div class="web-search-toggle">
          <button
            type="button"
            class="web-search-btn"
            class:web-smart={webAccessMode === "smart"}
            class:web-required={webAccessMode === "required"}
            on:click={toggleWebAccessMode}
            disabled={asking}
            title={webAccessMode === "off" ? "联网搜索：关闭搜索" : webAccessMode === "smart" ? "联网搜索：智能搜索" : "联网搜索：必须联网"}
            aria-label={webAccessMode === "off" ? "联网搜索：关闭搜索" : webAccessMode === "smart" ? "联网搜索：智能搜索" : "联网搜索：必须联网"}
          >
            <SiyuanIcon name="iconLanguage" size={14} />
          </button>
          {#if showWebAccessMenu}
            <div class="mode-menu web-access-menu">
              <button type="button" class="mode-option web-access-option" class:selected={webAccessMode === "off"} on:click={() => selectWebAccessMode("off")}>
                <span class="option-label">关闭搜索</span>
              </button>
              <button type="button" class="mode-option web-access-option" class:selected={webAccessMode === "smart"} on:click={() => selectWebAccessMode("smart")}>
                <span class="option-label">智能搜索</span>
              </button>
              <button type="button" class="mode-option web-access-option" class:selected={webAccessMode === "required"} on:click={() => selectWebAccessMode("required")}>
                <span class="option-label">必须联网</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <div class="doc-search-trigger" role="presentation" on:click|stopPropagation>
        <button
          type="button"
          class="thinking-toggle"
          class:active={attachedDocs.length > 0}
          on:click={toggleDocSearch}
          disabled={asking}
          title="搜索添加文档进行问答"
        >
          <SiyuanIcon name="iconFile" size={14} />
          {#if attachedDocs.length > 0}
            <span class="doc-badge">{attachedDocs.length}</span>
          {/if}
        </button>
      </div>

      {#if quickPromptsEnabled && quickPromptsDocId}
        <div class="quick-prompts-toggle">
          <button
            type="button"
            class="thinking-toggle"
            class:active={showQuickPrompts}
            on:click={toggleQuickPrompts}
            disabled={asking}
            title="快捷提示语"
          >
            <SiyuanIcon name="iconQuote" size={14} />
          </button>
          {#if showQuickPrompts}
            <div class="quick-prompts-menu">
              <div class="quick-prompts-header">
                <span class="quick-prompts-title">快捷提示语</span>
                <button
                  type="button"
                  class="quick-prompts-manage-btn"
                  on:click={toggleQuickPromptManageMode}
                  disabled={quickPromptSaving}
                >
                  {quickPromptManageMode ? "完成" : "管理"}
                </button>
              </div>

              {#if quickPromptError}
                <div class="quick-prompts-error">{quickPromptError}</div>
              {/if}

              {#if quickPromptsLoading}
                <div class="quick-prompts-hint">加载中…</div>
              {:else if quickPromptItems.length === 0 && !quickPromptManageMode}
                <div class="quick-prompts-hint">暂无提示语</div>
              {:else}
                <div class="quick-prompts-list">
                  {#each quickPromptItems as item}
                    {#if quickPromptManageMode && editingQuickPromptId === item.id}
                      <div class="quick-prompts-edit-row">
                        <textarea
                          class="quick-prompts-edit-input"
                          rows="2"
                          bind:value={editingQuickPromptText}
                          disabled={quickPromptSaving}
                        ></textarea>
                        <div class="quick-prompts-edit-actions">
                          <button
                            type="button"
                            class="quick-prompts-edit-save"
                            on:click={() => saveEditQuickPrompt(item)}
                            disabled={quickPromptSaving || !editingQuickPromptText.trim()}
                          >保存</button>
                          <button
                            type="button"
                            class="quick-prompts-edit-cancel"
                            on:click={cancelEditQuickPrompt}
                            disabled={quickPromptSaving}
                          >取消</button>
                        </div>
                      </div>
                    {:else}
                      <div class="quick-prompts-item-row">
                        <button
                          type="button"
                          class="quick-prompts-item"
                          on:click={() => quickPromptManageMode ? startEditQuickPrompt(item) : handleQuickPromptClick(item)}
                          title={item.text}
                        >
                          <span class="quick-prompts-text">{item.text}</span>
                        </button>
                        {#if quickPromptManageMode}
                          <div class="quick-prompts-item-actions">
                            <button
                              type="button"
                              class="quick-prompts-action-btn"
                              on:click|stopPropagation={() => startEditQuickPrompt(item)}
                              disabled={quickPromptSaving}
                              title="编辑"
                            >✎</button>
                            <button
                              type="button"
                              class="quick-prompts-action-btn quick-prompts-action-delete"
                              on:click|stopPropagation={() => handleDeleteQuickPrompt(item)}
                              disabled={quickPromptSaving}
                              title="删除"
                            >×</button>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if quickPromptManageMode}
                <div class="quick-prompts-footer">
                  <button
                    type="button"
                    class="quick-prompts-add-input-btn"
                    on:click={handleAddQuickPromptFromInput}
                    disabled={quickPromptSaving || !inputValue.trim()}
                    title="把当前输入框内容保存为提示语"
                  >
                    添加当前输入为提示语
                  </button>
                  <div class="quick-prompts-new-row">
                    <input
                      type="text"
                      class="quick-prompts-new-input"
                      placeholder="输入新提示语…"
                      bind:value={newQuickPromptText}
                      disabled={quickPromptSaving}
                      on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNewQuickPrompt(); } }}
                    />
                    <button
                      type="button"
                      class="quick-prompts-new-add-btn"
                      on:click={handleAddNewQuickPrompt}
                      disabled={quickPromptSaving || !newQuickPromptText.trim()}
                    >添加</button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Attached docs chips row -->
    {#if attachedDocs.length > 0}
      <div class="attached-docs-bar">
        {#each attachedDocs as doc}
          <span class="doc-chip" title={doc.path || doc.title}>
            <button
              type="button"
              class="doc-chip-title"
              on:click={(e) => handleInputChipClick(doc, e)}
              disabled={asking}
            >{doc.title || doc.docId}</button>
            <button type="button" class="doc-chip-remove" on:click|stopPropagation={() => removeDoc(doc.docId)} disabled={asking}>×</button>
          </span>
        {/each}
      </div>
    {/if}

    <!-- Textarea row -->
    <textarea
      bind:this={textareaElement}
      bind:value={inputValue}
      {placeholder}
      disabled={disabled || asking}
      class="chat-textarea"
      rows="1"
      on:keydown={handleKeyDown}
      on:input={handleInput}
    ></textarea>

    <!-- Bottom action row -->
    <div class="input-actions-row">
      {#if mobile}
        <div class="mobile-actions-trigger" role="presentation" on:click|stopPropagation>
          <button
            type="button"
            class="mobile-plus-btn"
            class:active={showMobileActions}
            on:click={toggleMobileActions}
            disabled={asking}
            aria-label="打开提问选项"
          >
            <SiyuanIcon name="iconAdd" size={18} />
          </button>

          {#if showMobileActions}
            <div class="mobile-actions-menu" role="dialog" aria-label="提问选项" tabindex="-1">
              <div class="mobile-actions-header">
                <span class="mobile-actions-title">提问选项</span>
                <button type="button" class="mobile-actions-close" on:click={closeMobileActions} aria-label="关闭">
                  <SiyuanIcon name="iconClose" size={14} />
                </button>
              </div>

              <section class="mobile-action-section">
                <div class="mobile-section-title">提问范围</div>
                <div class="mobile-choice-grid">
                  {#if modeSelectorLocked}
                    <button type="button" class="mobile-choice active" disabled>特定文档上下文</button>
                  {:else}
                    {#each visibleChatModes as mode}
                      <button
                        type="button"
                        class="mobile-choice"
                        class:active={selectedMode === mode.id}
                        disabled={!mode.available}
                        on:click={() => handleMobileModeSelect(mode.id)}
                      >
                        {mode.label}
                      </button>
                    {/each}
                  {/if}
                </div>
              </section>

              <section class="mobile-action-section">
                <div class="mobile-section-title">模型</div>
                <div class="mobile-model-list">
                  {#if modelOptions.length === 0}
                    <div class="mobile-empty">暂无可用模型，请先在设置中添加并启用模型</div>
                  {:else}
                    {#each modelOptions as option (option.key)}
                      <button
                        type="button"
                        class="mobile-model-option"
                        class:active={selectedModelKey === option.key}
                        on:click={() => handleMobileModelSelect(option)}
                      >
                        <span>{option.label}</span>
                        {#if option.description}
                          <small>{option.description}</small>
                        {/if}
                      </button>
                    {/each}
                  {/if}
                </div>
              </section>

              <section class="mobile-action-section compact">
                <button type="button" class="mobile-action-row" on:click={handleMobileDocSearch}>
                  <SiyuanIcon name="iconFile" size={16} />
                  <span>添加文档</span>
                  {#if attachedDocs.length > 0}
                    <b>{attachedDocs.length}</b>
                  {/if}
                </button>
                <button type="button" class="mobile-action-row" class:active={thinkingMode === "on"} on:click={handleMobileThinkingToggle}>
                  <SiyuanIcon name="iconSparkles" size={16} />
                  <span>深度思考</span>
                  <em>{thinkingMode === "on" ? "已开启" : "已关闭"}</em>
                </button>
                {#if webSearchEnabled}
                  <div class="mobile-web-group">
                    <div class="mobile-section-title">联网搜索：{mobileWebAccessLabel}</div>
                    <div class="mobile-choice-grid">
                      <button type="button" class="mobile-choice" class:active={webAccessMode === "off"} on:click={() => handleMobileWebAccessSelect("off")}>关闭</button>
                      <button type="button" class="mobile-choice" class:active={webAccessMode === "smart"} on:click={() => handleMobileWebAccessSelect("smart")}>智能</button>
                      <button type="button" class="mobile-choice" class:active={webAccessMode === "required"} on:click={() => handleMobileWebAccessSelect("required")}>必须联网</button>
                    </div>
                  </div>
                {/if}
                {#if canCompress}
                  <button type="button" class="mobile-action-row" on:click={handleMobileCompressAction}>
                    <SiyuanIcon name="iconRefresh" size={16} />
                    <span>{compressionState?.enabled ? "更新上下文压缩" : "压缩上下文"}</span>
                  </button>
                {/if}
                {#if compressionState?.enabled}
                  <button type="button" class="mobile-action-row" on:click={handleMobileClearCompressionAction}>
                    <SiyuanIcon name="iconTrashcan" size={16} />
                    <span>清除上下文压缩</span>
                  </button>
                {/if}
              </section>

              {#if quickPromptsEnabled && quickPromptsDocId}
                <section class="mobile-action-section">
                  <div class="mobile-section-title">快捷提示</div>
                  {#if quickPromptsLoading}
                    <div class="mobile-empty">加载中...</div>
                  {:else if quickPromptItems.length === 0}
                    <div class="mobile-empty">暂无提示语</div>
                  {:else}
                    <div class="mobile-quick-list">
                      {#each quickPromptItems as item}
                        <button type="button" class="mobile-quick-item" on:click={() => handleMobileQuickPromptClick(item)}>
                          {item.text}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </section>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div class="desktop-bottom-actions {mobile ? 'mobile-hidden' : ''}">
      <button
        type="button"
        class="thinking-toggle"
        class:active={thinkingMode === "on"}
        on:click={toggleThinkingMode}
        disabled={asking}
        title="开启模型深度思考。"
      >
        <SiyuanIcon name="iconSparkles" size={14} />
      </button>

      <div class="model-selector">
        <button type="button" class="model-button" on:click={toggleModelMenu} disabled={asking} title={modelButtonTitle}>
          <span class="model-label">{currentModelLabel}</span>
          <span class="model-arrow"><SiyuanIcon name="iconDown" size={10} /></span>
        </button>

        {#if showModelMenu}
          <div class="model-menu">
            {#if modelOptions.length === 0}
              <div class="model-empty">暂无可用模型，请先在设置中添加并启用模型</div>
            {:else}
              {#each modelOptions as option (option.key)}
                <button
                  type="button"
                  class="model-option"
                  class:selected={selectedModelKey === option.key}
                  on:click={() => selectModel(option)}
                >
                  <span class="option-label">{option.label}</span>
                  <span class="option-desc">{option.description}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      {#key contextUsage}
        {@const hasUsage = !!contextUsage}
        {@const pct = hasUsage ? Math.round(contextUsage.usageRatio * 100) : 0}
        {@const radius = 7}
        {@const circumference = 2 * Math.PI * radius}
        {@const drawRatio = hasUsage ? contextUsage.usageRatio : 0}
        {@const offset = circumference * (1 - drawRatio)}
        {@const usageLevel = hasUsage ? contextUsage.level : "normal"}
        {@const windowTokens = hasUsage ? contextUsage.maxContextTokens : 128000}
        {@const estTokens = hasUsage ? contextUsage.estimatedTokens : 0}
        {@const windowSourceLabel = hasUsage && contextUsage.maxContextSource === "model_config" ? "模型配置" : "默认估算窗口"}
        {@const displayPct = pct > 100 ? "100+" : String(pct)}
        {@const ariaLabel = `上下文使用约 ${pct}%，状态 ${usageLevel}`}
        <div
          role="button"
          tabindex="0"
          class="context-usage-ring"
          class:warn={usageLevel === "warn"}
          class:critical={usageLevel === "critical"}
          class:dim={!hasUsage}
          class:popover-open={showContextPopover}
          aria-label={ariaLabel}
          bind:this={contextRingEl}
          on:mouseenter={onRingMouseEnter}
          on:mouseleave={onRingMouseLeave}
          on:focus={onRingFocus}
          on:blur={onRingBlur}
          on:click|stopPropagation={toggleContextPopoverByClick}
          on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleContextPopoverByClick(); } }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r={radius} fill="none" stroke="var(--b3-border-color)" stroke-width="2" />
            <circle
              cx="9" cy="9" r={radius}
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-dasharray={circumference}
              stroke-dashoffset={offset}
              transform="rotate(-90 9 9)"
            />
          </svg>
        </div>

        {#if showContextPopover}
          <span
            class="context-usage-popover"
            bind:this={contextPopoverEl}
            use:floatingPopoverAction={{ referenceEl: contextRingEl, placement: "top-end", offset: 8, shiftPadding: 8, open: showContextPopover, onPositionUpdate: (info) => { pushAgentDebugEvent("CONTEXT_FLOATING_POPOVER_POSITION_SAFE", info, "debug"); } }}
            on:mouseenter={onPopoverMouseEnter}
            on:mouseleave={onPopoverMouseLeave}
            on:click|stopPropagation
            on:keydown
            role="dialog"
            aria-label="上下文管理"
            tabindex="-1"
          >
            <span class="popover-header">
              <span class="popover-title">上下文管理</span>
              <span class="popover-badge" class:warn={usageLevel === "warn"} class:critical={usageLevel === "critical"}>{usageLevel}</span>
            </span>
            <span class="popover-grid">
              <span class="popover-grid-label">上下文使用</span>
              <span class="popover-grid-value">{displayPct}%</span>
              <span class="popover-grid-label">估算 token</span>
              <span class="popover-grid-value">{estTokens.toLocaleString()} / {windowTokens.toLocaleString()}</span>
              <span class="popover-grid-label">状态</span>
              <span class="popover-grid-value">{windowSourceLabel}</span>
              {#if compressionState?.enabled && compressedContextSummary}
                <span class="popover-grid-label">压缩状态</span>
                <span class="popover-grid-value">已压缩 {compressionState.compressedMessageCount ?? 0} 条</span>
              {/if}
            </span>
            <span class="popover-divider"></span>
            {#if compressionState?.enabled && compressedContextSummary}
              <span class="popover-compression-detail">
                历史摘要 {compressionState.summaryTokenEstimate ?? 0} token，已压缩到第 {compressionState.latestCompressedTurnIndex ?? 0} 轮
              </span>
              <div class="popover-actions">
                <button type="button" class="popover-btn primary" class:highlight={usageLevel === "warn" || usageLevel === "critical"} on:click|stopPropagation={handleCompressAction} disabled={!canCompress}>
                  {canCompress ? "更新压缩" : "压缩已是最新"}
                </button>
                <button type="button" class="popover-btn secondary" on:click|stopPropagation={handleClearCompressionAction} disabled={asking}>清除压缩</button>
              </div>
            {:else}
              <span class="popover-info">仅压缩已形成历史摘要的较早对话，最近对话会保留原文。</span>
              {#if compressDisabledReason}
                <span class="popover-warning">{compressDisabledReason}</span>
              {/if}
              <div class="popover-actions">
                <button type="button" class="popover-btn primary" class:highlight={usageLevel === "warn" || usageLevel === "critical"} on:click|stopPropagation={handleCompressAction} disabled={!canCompress}>
                  {canCompress ? "压缩上下文" : "暂无可压缩上下文"}
                </button>
              </div>
            {/if}
          </span>
        {/if}
      {/key}
      </div>

      {#if asking}
        <Button
          label="停止"
          disabled={false}
          on:click={handleStop}
        />
      {:else}
        <Button
          label="发送"
          disabled={disabled || !inputValue.trim() || !hasValidSelectedModel}
          on:click={handleSend}
        />
      {/if}
    </div>

    <!-- Doc search popover (upward) -->
    {#if showDocSearch}
      <div class="doc-search-container" role="presentation" on:click|stopPropagation>
        <div class="doc-search-popover">
          <div class="doc-quick-add">
            <button
              type="button"
              class="doc-quick-add-btn"
              on:click={addCurrentDoc}
              disabled={asking || currentDocAlreadyAttached}
              title={currentDocAlreadyAttached ? "当前文档已添加" : "将当前打开的文档添加到附件"}
            >
              <SiyuanIcon name="iconFile" size={12} />
              <span>{currentDocAlreadyAttached ? "当前文档已添加" : "添加当前文档"}</span>
            </button>
          </div>
          <input
            type="text"
            class="doc-search-input"
            placeholder="搜索文档标题或路径..."
            bind:value={docSearchQuery}
            on:input={handleDocSearchInput}
          />
          {#if docSearchLoading}
            <div class="doc-search-hint">搜索中...</div>
          {:else if visibleDocSearchResults.length > 0}
            <div class="doc-search-results">
              {#each visibleDocSearchResults as result (result.docId)}
                <button
                  type="button"
                  class="doc-search-item"
                  on:click={() => addDocFromSearch(result)}
                >
                  <span class="doc-item-title">{result.title || "无标题"}</span>
                  <span class="doc-item-path">{result.path} <span class="doc-item-source">{result.matchSource === "siyuan_kernel_search" ? "全文搜索" : result.matchSource === "title_catalog_search" ? "标题匹配" : "混合检索"}</span></span>
                </button>
              {/each}
            </div>
          {:else if docSearchQuery.trim() && docSearchResults.length > 0}
            <div class="doc-search-hint">匹配文档已全部添加</div>
          {:else if docSearchQuery.trim()}
            <div class="doc-search-hint">未找到匹配文档</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use '../panels/_kb-tokens' as *;
  .chat-input-wrapper {
    width: 100%;
    min-width: 0;
    padding: 12px;
    border-top: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    box-sizing: border-box;
  }

  .chat-input-box {
    position: relative;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--b3-border-color);
    border-radius: 12px;
    background: var(--b3-theme-background);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 6px;
  }

  .chat-input-wrapper.mobile {
    padding: 8px 10px max(8px, env(safe-area-inset-bottom));

    .chat-input-box {
      border-radius: 22px;
      padding: 8px 10px;
      gap: 6px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.10);
    }

    .mobile-hidden {
      display: none;
    }

    .chat-textarea {
      min-height: 40px;
      max-height: 132px;
      padding: 6px 2px;
      font-size: 15px;
    }

    .input-actions-row {
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 8px;

      > :last-child {
        margin-left: auto;
      }
    }

    :global(.b3-button) {
      min-height: 38px;
      border-radius: 999px;
      padding: 0 16px;
    }

    .doc-search-container {
      left: 0;
      right: 0;
      width: auto;
      bottom: calc(100% + 8px);
    }

    .doc-search-popover,
    .quick-prompts-menu {
      width: min(100%, 360px);
      max-height: 55dvh;
      border-radius: 16px;
    }
  }

  // Top tools row
  .input-tools-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-height: 0;
  }

  // Attached docs chips row
  .attached-docs-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 0;
  }

  .doc-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--b3-theme-primary-light);
    border: 1px solid var(--b3-theme-primary);
    border-radius: 12px;
    font-size: 12px;
    color: var(--b3-theme-primary);
    max-width: 200px;
  }

  .doc-chip-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--b3-theme-primary);
    text-align: left;

    &:hover:not(:disabled) {
      text-decoration: underline;
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  .doc-chip-remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--b3-theme-primary);
    padding: 0 2px;
    line-height: 1;

    &:hover:not(:disabled) {
      color: var(--b3-theme-error);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  // Textarea row
  .chat-textarea {
    width: 100%;
    min-height: 44px;
    max-height: 160px;
    padding: 6px 4px;
    border: none;
    background: transparent;
    font-size: 14px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
    resize: none;
    outline: none;
    overflow-y: auto;
    box-sizing: border-box;
    font-family: inherit;
    field-sizing: content;
    scrollbar-gutter: stable;

    &::placeholder {
      color: var(--b3-theme-on-surface-light);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  // Bottom action row
  .input-actions-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
    overflow: visible;
    position: relative;

    > :last-child {
      margin-left: auto;
    }
  }

  .desktop-bottom-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mobile-actions-trigger {
    position: relative;
    flex-shrink: 0;
  }

  .mobile-plus-btn {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--b3-border-color);
    border-radius: 50%;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    cursor: pointer;

    &.active {
      background: var(--b3-theme-primary);
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .mobile-actions-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 10px);
    width: min(88vw, 360px);
    max-height: min(68dvh, 560px);
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 18px;
    background: var(--b3-theme-background);
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
    z-index: 120;
    box-sizing: border-box;
  }

  .mobile-actions-header,
  .mobile-action-row {
    display: flex;
    align-items: center;
  }

  .mobile-actions-header {
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .mobile-actions-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--b3-theme-on-surface);
  }

  .mobile-actions-close {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface-light);
  }

  .mobile-action-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 65%, transparent);

    &:first-of-type {
      border-top: none;
      padding-top: 0;
    }

    &.compact {
      gap: 6px;
    }
  }

  .mobile-section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface-light);
  }

  .mobile-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .mobile-choice,
  .mobile-model-option,
  .mobile-action-row,
  .mobile-quick-item {
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    box-sizing: border-box;
  }

  .mobile-choice {
    min-height: 36px;
    border-radius: 12px;
    padding: 7px 10px;
    font-size: 13px;
    text-align: center;

    &.active {
      background: var(--b3-theme-primary);
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-on-primary);
      font-weight: 600;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .mobile-model-list,
  .mobile-quick-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 180px;
    overflow: auto;
  }

  .mobile-model-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    border-radius: 12px;
    padding: 9px 10px;
    text-align: left;

    &.active {
      border-color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-background));
    }

    span {
      font-size: 13px;
      font-weight: 600;
    }

    small {
      font-size: 11px;
      color: var(--b3-theme-on-surface-light);
      line-height: 1.35;
    }
  }

  .mobile-action-row {
    gap: 10px;
    width: 100%;
    min-height: 40px;
    border-radius: 12px;
    padding: 8px 10px;
    font-size: 13px;
    text-align: left;

    span {
      flex: 1;
      min-width: 0;
    }

    b,
    em {
      font-style: normal;
      font-size: 11px;
      color: var(--b3-theme-primary);
    }

    &.active {
      border-color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-background));
    }
  }

  .mobile-web-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
  }

  .mobile-quick-item {
    width: 100%;
    border-radius: 12px;
    padding: 9px 10px;
    font-size: 13px;
    text-align: left;
    line-height: 1.45;
  }

  .mobile-empty {
    padding: 10px;
    border-radius: 12px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.45;
  }

  .context-usage-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--b3-theme-primary);
    opacity: 0.7;
    cursor: pointer;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    line-height: 1;
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--b3-theme-primary);
      outline-offset: 2px;
      border-radius: 50%;
    }

    &.warn {
      color: var(--b3-card-warning-color, #e6a817);
      opacity: 0.85;
    }

    &.critical {
      color: var(--b3-theme-error, #d94141);
      opacity: 1;
    }

    &.dim {
      opacity: 0.3;
    }

    &:hover,
    &.popover-open {
      background: var(--b3-theme-surface-light, rgba(0, 0, 0, 0.04));
      border-radius: 50%;
    }
  }

  .context-usage-popover {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 12px;
    background: var(--b3-theme-surface, #fff);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
    z-index: 110;
    box-sizing: border-box;
    width: 280px;
    pointer-events: auto;

    .popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .popover-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--b3-theme-on-surface);
    }

    .popover-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--b3-theme-primary-light);
      color: var(--b3-theme-primary);
      text-transform: capitalize;

      &.warn {
        background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 12%, transparent);
        color: var(--b3-card-warning-color, #e6a817);
      }

      &.critical {
        background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
        color: var(--b3-theme-error, #d94141);
      }
    }

    .popover-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 8px;
      font-size: 12px;
      line-height: 1.5;
    }

    .popover-grid-label {
      color: var(--b3-theme-on-surface-light, #666);
      white-space: nowrap;
    }

    .popover-grid-value {
      color: var(--b3-theme-on-surface);
      text-align: right;
      word-break: break-all;
    }

    .popover-divider {
      height: 1px;
      background: var(--b3-border-color);
      margin: 8px 0;
    }

    .popover-info {
      font-size: 11px;
      color: var(--b3-theme-on-surface-light, #666);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .popover-warning {
      font-size: 11px;
      color: var(--b3-card-warning-color, #d48806);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .popover-compression-detail {
      font-size: 11px;
      color: var(--b3-theme-on-surface-light, #666);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .popover-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .popover-btn {
      background: none;
      border: 1px solid var(--b3-border-color);
      border-radius: $kb-radius-md;
      padding: 5px 10px;
      font-size: $kb-fs-sm;
      color: var(--b3-theme-on-surface);
      cursor: pointer;
      line-height: 1.4;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
      transition:
        background $kb-dur-fast $kb-ease-out,
        box-shadow $kb-dur-fast $kb-ease-out;
      box-shadow: $kb-shadow-none;

      &:hover:not(:disabled) {
        background: var(--b3-theme-surface-light);
        box-shadow: $kb-shadow-card;
      }

      &.primary {
        font-weight: 500;
      }

      &.primary.highlight {
        color: var(--b3-card-warning-color, #e6a817);
        border-color: var(--b3-card-warning-color, #e6a817);
      }

      &.secondary {
        color: var(--b3-theme-on-surface-light, #666);
        border-color: var(--b3-border-color);
        font-size: 11px;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  // Mode selector
  .mode-selector {
    position: relative;
  }

  .mode-button {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    padding: 5px 10px;
    background: var(--b3-theme-surface-light);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
      box-shadow: $kb-shadow-card;
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .mode-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .thinking-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 5px 10px;
    background: var(--b3-theme-surface-light);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface-light);
    white-space: nowrap;
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.active {
      background: var(--b3-theme-primary-light);
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);
      box-shadow: $kb-shadow-card;
    }
  }

  .mode-label {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
  }

  .mode-arrow {
    font-size: 10px;
    margin-left: 2px;
    color: var(--b3-theme-on-surface-light);
  }

  .mode-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
    min-width: 220px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    box-shadow: $kb-shadow-raised;
    z-index: 100;
    padding: 4px;
  }

  .mode-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;

    &:hover:not(.disabled) {
      background: var(--b3-theme-background-light);
    }

    &.selected {
      background: var(--b3-theme-primary-light);
    }

    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .option-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
  }

  .option-badge {
    font-size: 11px;
    padding: 1px 6px;
    background: var(--b3-theme-surface-light);
    border-radius: 4px;
    color: var(--b3-theme-on-surface-light);
  }

  .option-desc {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
  }

  // Model selector
  .model-selector {
    position: relative;
  }

  .model-button {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    padding: 5px 10px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-border-color));
      box-shadow: $kb-shadow-card;
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .model-label {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .model-arrow {
    font-size: 10px;
    margin-left: 2px;
    color: var(--b3-theme-on-surface-light);
  }

  .model-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 4px;
    min-width: 220px;
    max-width: 320px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    box-shadow: $kb-shadow-raised;
    z-index: 20;
    padding: 4px;
  }

  .model-empty {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .model-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;

    &:hover {
      background: var(--b3-theme-background-light);
    }

    &.selected {
      background: var(--b3-theme-primary-light);
    }
  }

  .model-option .option-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
  }

  .model-option .option-desc {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
  }

  // Doc search container (upward popover)
  .doc-search-container {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 50;
    width: min(420px, calc(100vw - 32px));
  }

  .doc-search-popover {
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    box-shadow: $kb-shadow-raised;
    padding: $kb-space-sm;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .doc-quick-add {
    display: flex;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .doc-quick-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface-light);
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .doc-search-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    font-size: 13px;
    background: var(--b3-theme-surface-light);
    color: var(--b3-theme-on-surface);
    outline: none;
    box-sizing: border-box;

    &:focus {
      border-color: var(--b3-theme-primary);
    }

    &::placeholder {
      color: var(--b3-theme-on-surface-light);
    }
  }

  .doc-search-results {
    overflow-y: auto;
    max-height: 260px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .doc-search-hint {
    padding: 12px 8px;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .doc-search-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;

    &:hover {
      background: var(--b3-theme-background-light);
    }
  }

  .doc-item-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-item-path {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-item-source {
    font-size: 10px;
    color: var(--b3-theme-primary);
    opacity: 0.8;
    margin-left: 4px;
  }

  .doc-search-trigger {
    position: relative;
  }

  // Web search toggle
  .web-search-toggle {
    position: relative;
  }

  .web-search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: $kb-radius-md;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-surface);
    cursor: pointer;
    color: var(--b3-theme-on-surface);
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover {
      background: var(--b3-list-hover);
      box-shadow: $kb-shadow-card;
    }

    &:active {
      transform: scale(0.95);
    }

    &.web-smart {
      background: var(--b3-theme-primary-light, rgba(64, 144, 255, 0.15));
      border-color: var(--b3-theme-primary, #4090ff);
      color: var(--b3-theme-primary, #4090ff);

      &:hover {
        background: var(--b3-theme-primary-light, rgba(64, 144, 255, 0.25));
      }
    }

    &.web-required {
      background: rgba(230, 168, 23, 0.16);
      border-color: var(--b3-card-warning-color, #d48806);
      color: var(--b3-card-warning-color, #d48806);

      &:hover {
        background: rgba(230, 168, 23, 0.26);
      }
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  // Web access menu — stronger selected state
  .web-access-option.selected {
    background: var(--b3-theme-primary-light, rgba(64, 144, 255, 0.12));
    font-weight: 600;
  }

  // Quick prompts
  .quick-prompts-toggle {
    position: relative;
  }

  .quick-prompts-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 50;
    width: min(360px, calc(100vw - 32px));
    max-height: 280px;
    overflow-y: auto;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-lg;
    box-shadow: $kb-shadow-raised;
    padding: $kb-space-xs;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .quick-prompts-hint {
    padding: 12px 8px;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .quick-prompts-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .quick-prompts-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;

    &:hover {
      background: var(--b3-theme-background-light);
    }
  }

  .quick-prompts-text {
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quick-prompts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 6px;
    border-bottom: 1px solid var(--b3-border-color);
    margin-bottom: 4px;
  }

  .quick-prompts-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .quick-prompts-manage-btn {
    font-size: 12px;
    color: var(--b3-theme-primary);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;

    &:hover {
      background: var(--b3-theme-background-light);
    }
  }

  .quick-prompts-error {
    padding: 4px 8px;
    font-size: 12px;
    color: var(--b3-theme-error);
    text-align: center;
  }

  .quick-prompts-item-row {
    display: flex;
    align-items: center;
    gap: 4px;

    .quick-prompts-item {
      flex: 1;
      min-width: 0;
    }
  }

  .quick-prompts-item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .quick-prompts-action-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--b3-theme-on-surface-light);
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-on-surface);
    }
  }

  .quick-prompts-action-delete:hover {
    color: var(--b3-theme-error);
  }

  .quick-prompts-edit-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
  }

  .quick-prompts-edit-input {
    width: 100%;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    resize: vertical;
    font-family: inherit;
  }

  .quick-prompts-edit-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .quick-prompts-edit-save,
  .quick-prompts-edit-cancel {
    font-size: 12px;
    padding: 3px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .quick-prompts-edit-save {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);

    &:hover {
      opacity: 0.85;
    }
  }

  .quick-prompts-edit-cancel {
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);

    &:hover {
      background: var(--b3-theme-background);
    }
  }

  .quick-prompts-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 0 2px;
    border-top: 1px solid var(--b3-border-color);
    margin-top: 4px;
  }

  .quick-prompts-add-input-btn {
    font-size: 12px;
    color: var(--b3-theme-primary);
    background: transparent;
    border: 1px dashed var(--b3-border-color);
    border-radius: 4px;
    padding: 5px 8px;
    cursor: pointer;
    text-align: center;

    &:hover {
      background: var(--b3-theme-background-light);
    }
  }

  .quick-prompts-new-row {
    display: flex;
    gap: 4px;
  }

  .quick-prompts-new-input {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    padding: 5px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    font-family: inherit;
  }

  .quick-prompts-new-add-btn {
    font-size: 12px;
    padding: 5px 10px;
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      opacity: 0.85;
    }
  }
</style>
