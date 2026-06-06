<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { Button } from "siyuan-kit-svelte";
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

  let inputValue = value;
  let textareaElement: HTMLTextAreaElement;
  let showModeMenu = false;
  let showModelMenu = false;
  let showContextPopover = false;
  let contextRingEl: HTMLDivElement | undefined;
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
  let mentionActive = false;
  let mentionQuery = "";
  let mentionStartPos = 0;

  $: inputValue = value;
  $: visibleChatModes = availableModes?.length
    ? CHAT_MODES.filter((mode) => availableModes.includes(mode.id))
    : CHAT_MODES;
  $: modeSelectorLocked = attachedDocs.length > 0;

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
  $: if (asking) {
    showModeMenu = false;
    showModelMenu = false;
  }

  const dispatch = createEventDispatcher<{
    send: { question: string; mode: ChatMode; thinkingMode: ThinkingMode; attachedDocIds?: string[]; attachedDocs?: AttachedKbDoc[] };
    stop: void;
    modeChange: ChatMode;
    input: string;
    modelChange: ChatModelSelection;
    refreshModels: void;
    thinkingModeChange: ThinkingMode;
    attachedDocsChange: { docIds: string[] };
    compressionRequest: void;
    compressionClear: void;
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
      dispatch("send", { question: trimmed, mode: selectedMode, thinkingMode, attachedDocIds: docIds.length > 0 ? docIds : undefined, attachedDocs: docsPayload });
      inputValue = "";
      value = "";
      attachedDocs = [];
      showDocSearch = false;
      mentionActive = false;
      docSearchResults = [];
      docSearchQuery = "";
      if (textareaElement) {
        textareaElement.style.height = "auto";
      }
    }
  }

  function handleStop() {
    dispatch("stop");
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (mentionActive) {
        mentionActive = false;
        mentionQuery = "";
        docSearchResults = [];
        event.preventDefault();
        return;
      }
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
    if (textareaElement) {
      textareaElement.style.height = "auto";
      textareaElement.style.height = Math.min(textareaElement.scrollHeight, 200) + "px";
    }
    dispatch("input", inputValue);
    detectMentionTrigger();
  }

  function detectMentionTrigger() {
    if (!textareaElement) return;
    const cursorPos = textareaElement.selectionStart;
    const textBefore = inputValue.substring(0, cursorPos);
    const mentionMatch = textBefore.match(/[#@]([^\s#@]{0,30})$/);
    if (mentionMatch) {
      mentionActive = true;
      mentionQuery = mentionMatch[1];
      mentionStartPos = cursorPos - mentionMatch[0].length;
      debouncedDocSearch(mentionQuery);
    } else {
      mentionActive = false;
      mentionQuery = "";
    }
  }

  function debouncedDocSearch(query: string) {
    if (docSearchDebounceId) clearTimeout(docSearchDebounceId);
    if (!query.trim()) {
      docSearchResults = [];
      return;
    }
    const queryChars = query.trim().length;
    pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_START_SAFE", {
      queryChars,
      source: "debouncedDocSearch",
    }, "debug");
    docSearchDebounceId = setTimeout(async () => {
      docSearchLoading = true;
      try {
        docSearchResults = await searchDocsForChatAttachment(query);
        pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_DONE_SAFE", {
          queryChars,
          resultCount: docSearchResults.length,
        }, "debug");
        if (docSearchResults.length > 0 && !showDocSearch && !mentionActive) {
          pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_RENDER_MISMATCH_SAFE", {
            resultCount: docSearchResults.length,
            showDocSearch,
            mentionActive,
            docSearchQueryChars: queryChars,
          }, "warn");
        }
      } catch (e) {
        docSearchResults = [];
        pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_ERROR_SAFE", {
          queryChars,
          errorCode: "debounced_search_failed",
        }, "warn");
      }
      docSearchLoading = false;
    }, 300);
  }

  function addDocFromSearch(result: ChatDocSearchResult) {
    if (attachedDocs.some((d) => d.docId === result.docId)) return;
    attachedDocs = [...attachedDocs, {
      docId: result.docId,
      title: result.title,
      box: result.box,
      path: result.path,
      source: mentionActive ? "mention" : "manual_search",
      createdAt: Date.now(),
    }];
    pushAgentDebugEvent("MANUAL_DOC_SELECTED_SAFE", {
      selectedDocCount: attachedDocs.length,
      alreadySelectedGuard: true,
    }, "info");
    if (mentionActive && textareaElement) {
      const before = inputValue.substring(0, mentionStartPos);
      const after = inputValue.substring(textareaElement.selectionStart);
      inputValue = before + "@" + result.title + " " + after;
      mentionActive = false;
      mentionQuery = "";
    }
    showDocSearch = false;
    docSearchResults = [];
    docSearchQuery = "";
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

    showDocSearch = false;
    docSearchResults = [];
    docSearchQuery = "";
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
        if (docSearchResults.length > 0 && !showDocSearch && !mentionActive) {
          pushAgentDebugEvent("MANUAL_DOC_SEARCH_UI_RENDER_MISMATCH_SAFE", {
            resultCount: docSearchResults.length,
            showDocSearch,
            mentionActive,
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
      alert(`「${CHAT_MODES.find(m => m.id === mode)?.label}」功能暂未开放`);
    }
    showModeMenu = false;
    showModelMenu = false;
  }

  function toggleModeMenu() {
    if (asking || modeSelectorLocked) return;
    showModeMenu = !showModeMenu;
    if (showModeMenu) {
      showModelMenu = false;
    }
  }

  function toggleModelMenu() {
    if (asking) return;
    showModelMenu = !showModelMenu;
    if (showModelMenu) {
      showModeMenu = false;
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

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".mode-selector")) {
      showModeMenu = false;
    }
    if (!target.closest(".model-selector")) {
      showModelMenu = false;
    }
    if (!target.closest(".doc-search-container") && !target.closest(".doc-search-trigger")) {
      showDocSearch = false;
      docSearchResults = [];
      docSearchQuery = "";
    }
    if (!target.closest(".mention-popup") && !mentionActive) {
      docSearchResults = [];
    }
    if (!target.closest(".context-usage-ring") && !target.closest(".context-usage-popover")) {
      closeContextPopover();
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleContextPopoverKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleContextPopoverKeydown);
    if (contextPopoverCloseTimer) {
      clearTimeout(contextPopoverCloseTimer);
      contextPopoverCloseTimer = null;
    }
  });
</script>

<div class="chat-input-wrapper">
  <div class="chat-input-box">
    <!-- Top tools row -->
    <div class="input-tools-row">
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

      <div class="doc-search-trigger">
        <button
          type="button"
          class="thinking-toggle"
          class:active={attachedDocs.length > 0}
          on:click={toggleDocSearch}
          disabled={asking}
          title="搜索添加文档进行问答"
        >
          <span>文档{attachedDocs.length > 0 ? `(${attachedDocs.length})` : ""}</span>
        </button>
      </div>
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

      <button
        type="button"
        class="thinking-toggle"
        class:active={thinkingMode === "on"}
        on:click={toggleThinkingMode}
        disabled={asking}
        title="开启模型深度思考。"
      >
        <span>💡</span>
      </button>

      {#if asking}
        <Button
          label="停止"
          disabled={disabled}
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
      <div class="doc-search-container">
        <div class="doc-search-popover">
          <div class="doc-quick-add">
            <button
              type="button"
              class="doc-quick-add-btn"
              on:click={addCurrentDoc}
              disabled={asking}
              title="将当前打开的文档添加到附件"
            >
              <SiyuanIcon name="iconFile" size={12} />
              <span>添加当前文档</span>
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
          {:else if docSearchResults.length > 0}
            <div class="doc-search-results">
              {#each docSearchResults as result}
                <button
                  type="button"
                  class="doc-search-item"
                  class:selected={attachedDocs.some((d) => d.docId === result.docId)}
                  on:click={() => addDocFromSearch(result)}
                >
                  <span class="doc-item-title">{result.title || "无标题"}</span>
                  <span class="doc-item-path">{result.path} <span class="doc-item-source">{result.matchSource === "siyuan_kernel_search" ? "全文搜索" : result.matchSource === "title_catalog_search" ? "标题匹配" : "混合检索"}</span></span>
                </button>
              {/each}
            </div>
          {:else if docSearchQuery.trim()}
            <div class="doc-search-hint">未找到匹配文档</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Mention popup -->
    {#if mentionActive && docSearchResults.length > 0}
      <div class="mention-popup">
        {#each docSearchResults as result}
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
    {/if}
  </div>
</div>

<style lang="scss">
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
    min-height: 36px;
    max-height: 200px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    font-size: 14px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface);
    resize: none;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;

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
      color: var(--b3-theme-warning, #e6a817);
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
        background: var(--b3-theme-warning-light, rgba(230, 168, 23, 0.12));
        color: var(--b3-theme-warning, #e6a817);
      }

      &.critical {
        background: var(--b3-theme-error-light, rgba(217, 65, 65, 0.12));
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
      color: var(--b3-theme-on-surface-light-3, #666);
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
      color: var(--b3-theme-on-surface-light-3, #666);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .popover-warning {
      font-size: 11px;
      color: var(--b3-theme-warning, #d48806);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .popover-compression-detail {
      font-size: 11px;
      color: var(--b3-theme-on-surface-light-3, #666);
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
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 12px;
      color: var(--b3-theme-on-surface);
      cursor: pointer;
      line-height: 1.4;
      text-align: center;
      width: 100%;
      box-sizing: border-box;

      &:hover:not(:disabled) {
        background: var(--b3-theme-surface-light, rgba(0, 0, 0, 0.06));
      }

      &.primary {
        font-weight: 500;
      }

      &.primary.highlight {
        color: var(--b3-theme-warning, #e6a817);
        border-color: var(--b3-theme-warning, #e6a817);
      }

      &.secondary {
        color: var(--b3-theme-on-surface-light-3, #666);
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
    gap: 4px;
    padding: 5px 10px;
    background: var(--b3-theme-surface-light);
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:disabled {
      opacity: 0.6;
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
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--b3-theme-on-surface-light);
    white-space: nowrap;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.active {
      background: var(--b3-theme-primary-light);
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);
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
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
    gap: 4px;
    padding: 5px 10px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:disabled {
      opacity: 0.6;
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
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    padding: 8px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
      background: var(--b3-theme-primary-lightest);
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

    &.selected {
      background: var(--b3-theme-primary-light);
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

  // Mention popup (upward)
  .mention-popup {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 8px;
    z-index: 50;
    width: min(420px, calc(100vw - 32px));
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    padding: 6px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .doc-search-trigger {
    position: relative;
  }
</style>
