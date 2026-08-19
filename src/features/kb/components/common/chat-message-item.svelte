<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import type { ChatMessage, CitationSegment, ReferenceItem } from "../../types/chat";
  import type { AgentWorkbenchEvent } from "../../services/agent-workbench";
  import type { KbAssistantActionAlignment, KbChatAppearanceStyle, KbChatAvatarSettings } from "../../types/settings";
  import { navigateToReference, navigateToDocId } from "../../services/siyuan/reference-navigation";
  import { escapeHtml, mdToHtml } from "@/components/tools/mdToHtml";
  import { pushAgentDebugEvent } from "../../services/agent-workbench/debug/workbench-debug";
  import { mapAgentErrorToUserFacing } from "../../services/agent-workbench/runtime/user-facing-agent-error";
  import {
    getAgentRecoveryPresentation,
    getWorkbenchRunPresentation,
    hasSettledWorkbenchTerminal,
    isProviderOutputTruncatedWorkbench,
  } from "../../services/agent-workbench/runtime/workbench-terminal-state";
  import {
    formatToolArgsPreview,
    formatToolDisplayName,
    formatToolFailureSummary,
    formatToolResultSummary,
    formatWorkbenchProcessStats,
    resolveWorkbenchFinalStatus,
  } from "../../services/agent-workbench/presentation/tool-step-presentation";
  import ChatAvatar from "./chat-avatar.svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { renderSiyuanIcon } from "@/components/tools/siyuanIcon";
  import { writeTextToClipboard } from "@/libs/clipboard";
  import { openTemporaryWorkbenchDialog } from "./open-temporary-workbench-dialog";

  // Props - 由父组件 ChatMessageList 传入
  export let message: ChatMessage;
  export let isLastAssistant: boolean = false;
  export let isLastError: boolean = false;
  export let canRegenerate: boolean = false;
  export let canRetry: boolean = false;
  export let readOnly: boolean = false;
  // asking 状态，用于控制按钮显示
  export let asking: boolean = false;
  export let assistantActionAlignment: KbAssistantActionAlignment = "left";
  export let workbenchDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";
  export let reasoningDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";
  export let chatAppearanceStyle: KbChatAppearanceStyle = "default";
  export let userAvatar: KbChatAvatarSettings = { kind: "default" };
  export let assistantAvatar: KbChatAvatarSettings = { kind: "default" };

  $: currentAvatar =
    message.role === "user"
      ? userAvatar
      : message.role === "assistant"
        ? assistantAvatar
        : { kind: "default" as const };

  const dispatch = createEventDispatcher<{
    regenerate: void;
    retry: void;
    quoteSelection: { text: string };
    editUserMessage: { text: string };
    deleteTurn: { assistantMessageId: string };
    resumeAgent: { assistantMessageId: string };
  }>();

  // 复制状态管理
  let copiedMessageId: string | null = null;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleReferenceClick(item: ReferenceItem) {
    await navigateToReference(item);
  }

  function citationPlaceholder(index: number): string {
    return `\uE000KB_INLINE_CITATION_${index}\uE001`;
  }

  function renderInlineCitationButton(ref: ReferenceItem): string {
    const label = getReferenceLabel(ref);
    const shortLabel = truncateCitationLabel(label, 8);
    const typeLabel = getReferenceTypeLabel(ref);
    const icon = renderSiyuanIcon(getReferenceIconName(ref), 11, "inline-citation-source-icon");
    return [
      `<button type="button" class="inline-citation-marker" data-kb-citation-index="${ref.index}"`,
      ` title="${escapeHtml(`打开${typeLabel}来源：${label}`)}" aria-label="${escapeHtml(`打开${typeLabel}来源：${label}`)}">`,
      `<span class="inline-citation-icon" aria-hidden="true">${icon}</span>`,
      `<span class="inline-citation-label">${escapeHtml(shortLabel)}</span>`,
      "</button>",
    ].join("");
  }

  function renderAssistantMarkdown(
    content: string,
    segments: CitationSegment[] | undefined,
    references: ReferenceItem[] | undefined,
  ): string {
    if (!segments?.length || !references?.length) return mdToHtml(content);
    const markdownWithPlaceholders = segments
      .map((segment) => `${segment.text}${segment.citationIds.map(citationPlaceholder).join("")}`)
      .join("");
    let html = mdToHtml(markdownWithPlaceholders);
    for (const ref of references) {
      html = html.split(citationPlaceholder(ref.index)).join(renderInlineCitationButton(ref));
    }
    return html;
  }

  function handleAssistantBubbleClick(event: MouseEvent) {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-kb-citation-index]")
      : null;
    if (!target) return;
    const index = Number(target.dataset.kbCitationIndex);
    if (!Number.isInteger(index)) return;
    const ref = message.role === "assistant"
      ? message.citedReferences?.find((item) => item.index === index)
      : undefined;
    if (ref) void handleReferenceClick(ref);
  }

  function citationNavigation(node: HTMLElement) {
    const onClick = (event: MouseEvent) => handleAssistantBubbleClick(event);
    node.addEventListener("click", onClick);
    return {
      destroy() {
        node.removeEventListener("click", onClick);
      },
    };
  }

  async function handleAttachedDocClick(doc: { docId?: string; title?: string; source?: string }) {
    if (!doc.docId) {
      pushAgentDebugEvent("USER_ATTACHED_DOC_NAVIGATE_SAFE", {
        hasDocId: false,
        success: false,
        source: doc.source ?? "unknown",
      }, "warn");
      return;
    }
    const success = await navigateToDocId(doc.docId, doc.title);
    pushAgentDebugEvent("USER_ATTACHED_DOC_NAVIGATE_SAFE", {
      hasDocId: true,
      success,
      source: doc.source ?? "unknown",
    }, "info");
  }

  async function handleCopy(content: string, messageId: string) {
    try {
      await writeTextToClipboard(content);
      // 设置当前消息为已复制状态
      copiedMessageId = messageId;
      // 清除之前的定时器
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }
      // 2秒后恢复按钮状态
      copyTimeout = setTimeout(() => {
        copiedMessageId = null;
      }, 2000);
    } catch (err) {
      console.error("[ChatMessageItem] Copy failed:", err);
    }
  }

  // assistant 消息转换为 HTML
  $: assistantHtml =
    message.role === "assistant"
      ? renderAssistantMarkdown(message.content, message.citationSegments, message.citedReferences)
      : "";
  $: hasInlineCitations = message.role === "assistant"
    && !!message.citationSegments?.some((segment) => segment.citationIds.length > 0);
  $: isCopied = copiedMessageId === message.id;

  // 截断引用标签（最多5个字符，超过显示省略号）
  function truncateCitationLabel(label: string, maxLength = 5): string {
    const chars = Array.from(label || "");
    if (chars.length <= maxLength) return label || "引用";
    return `${chars.slice(0, maxLength).join("")}…`;
  }

  // 判断引用标签是否需要截断
  function isCitationLabelTruncated(label: string, maxLength = 5): boolean {
    return Array.from(label || "").length > maxLength;
  }

  // 获取引用项显示标签
  function getReferenceLabel(ref: ReferenceItem): string {
    const explicitLabel = ref.displayTitle || ref.docTitle || ref.sourceName;
    if (explicitLabel) return explicitLabel;
    switch (ref.sourceType) {
      case "web_page":
        return ref.url || "参考网页";
      case "mcp_resource":
        return "MCP 资源";
      case "api_result":
        return "API 数据";
      case "file":
        return "参考文件";
      case "siyuan_doc":
      default:
        return "参考文档";
    }
  }

  function getReferenceTypeLabel(ref: ReferenceItem): string {
    switch (ref.sourceType) {
      case "web_page":
        return "网页";
      case "mcp_resource":
        return "MCP 资源";
      case "api_result":
        return "API 数据";
      case "file":
        return "文件";
      case "siyuan_doc":
      default:
        return "思源文档";
    }
  }

  // 获取引用项类型图标（纯 UI helper，不改动 reference 生成逻辑）
  function getReferenceIconName(ref: ReferenceItem): string {
    switch (ref.sourceType) {
      case "web_page":
        return "iconLanguage";
      case "mcp_resource":
        return "iconPlugin";
      case "api_result":
        return "iconDatabase";
      case "siyuan_doc":
      case "file":
      default:
        return "iconFile";
    }
  }

  $: workbenchEvents =
    message.role === "assistant" ? message.workbenchEvents ?? [] : [];
  $: temporaryWorkbenches =
    message.role === "assistant" ? message.temporaryWorkbenches ?? [] : [];
  $: workbenchRun = getWorkbenchRunPresentation(workbenchEvents);

  // 标准运行事件是主状态源；asking 只覆盖首个 run_started 到达前的短暂准备期。
  $: isAssistantGenerating =
    message.role === "assistant" &&
    isLastAssistant &&
    (workbenchRun.active || (asking && workbenchEvents.length === 0));

  // 判断 assistant 是否有有效内容
  $: hasAssistantContent =
    message.role === "assistant" && message.content.trim().length > 0;

  let attachedDocsTraceEmitted = false;
  $: if (!attachedDocsTraceEmitted && message.role === "user" && message.attachedDocs?.length) {
    attachedDocsTraceEmitted = true;
    pushAgentDebugEvent("USER_MESSAGE_ATTACHED_DOCS_RENDER_SAFE", {
      attachedDocCount: message.attachedDocs.length,
      messageRole: "user",
    }, "info");
  }

  $: providerOutputTruncated =
    message.role === "assistant" &&
    isProviderOutputTruncatedWorkbench(message.workbenchEvents);

  // 判断是否为已停止的半截回答；已有明确终态时不再因旧 isComplete 竞态误报。
  $: isStoppedPartialAnswer =
    message.role === "assistant" &&
    message.content.trim() &&
    message.isComplete === false &&
    !asking &&
    !hasSettledWorkbenchTerminal(message.workbenchEvents);

  $: partialAnswerHint = providerOutputTruncated
    ? "回答达到模型的单次输出上限，正文可能未结束；已完成的工具操作不受影响。"
    : isStoppedPartialAnswer
      ? "已停止生成，内容可能不完整。"
      : "";

  // 是否应该显示 assistant 操作按钮
  $: shouldShowAssistantActions =
    message.role === "assistant" &&
    hasAssistantContent &&
    !isAssistantGenerating;

  // reasoning 折叠状态
  let reasoningCollapsed = true;
  $: hasReasoning =
    message.role === "assistant" &&
    !!message.reasoning &&
    (message.reasoning.content.length > 0 ||
      message.reasoning.status === "streaming");
  $: reasoningHtml =
    message.role === "assistant" && message.reasoning?.content
      ? mdToHtml(message.reasoning.content)
      : "";

  const VISIBLE_WORKBENCH_EVENT_TYPES = new Set<AgentWorkbenchEvent["type"]>([
    "tool_call_delta",
    "permission_required",
    "permission_resolved",
    "tool_start",
    "tool_result",
    "notice",
    "error",
  ]);
  $: visibleWorkbenchEvents = workbenchEvents.filter((event) =>
    VISIBLE_WORKBENCH_EVENT_TYPES.has(event.type)
  );

  // 判断 assistant 是否显示运行态状态（content 为空且 agentStatus 非空）
  $: isAssistantPending =
    message.role === "assistant" &&
    !message.content.trim() &&
    (workbenchRun.active || !!message.agentStatus);

  $: recoveryPresentation = message.role === "assistant" && message.agentRecovery
    ? getAgentRecoveryPresentation(message.agentRecovery.checkpoint, workbenchEvents)
    : undefined;

  function computeWorkbenchExpanded(): boolean {
    if (workbenchDisplayMode === "expanded") return true;
    if (workbenchDisplayMode === "auto") {
      if (isAssistantGenerating) return true;
      if (workbenchDisplaySteps.some((step) => step.running)) return true;
      if ('agentStatus' in message && !!message.agentStatus) return true;
      return false;
    }
    return false;
  }
  let workbenchEventsExpanded = false;
  let workbenchEventsMessageId = "";
  let userToggledWorkbench = false;

  type ReasoningDetail = { content: string; status: "streaming" | "done"; partCount: number; chars: number };
  function computeReasoningCollapsed(detail: ReasoningDetail | undefined): boolean {
    if (reasoningDisplayMode === "expanded") return false;
    if (reasoningDisplayMode === "auto") return detail?.status !== "streaming";
    return true;
  }
  function getReasoning(msg: ChatMessage): ReasoningDetail | undefined {
    return 'reasoning' in msg ? msg.reasoning : undefined;
  }
  let userToggledReasoning = false;

  // Reset on new message, then reactively update in auto mode
  $: if (message.id !== workbenchEventsMessageId) {
    workbenchEventsMessageId = message.id;
    userToggledWorkbench = false;
    userToggledReasoning = false;
    workbenchEventsExpanded = computeWorkbenchExpanded();
    reasoningCollapsed = computeReasoningCollapsed(getReasoning(message));
  }
  // Auto-mode: react to status changes during the same message
  $: if (!userToggledWorkbench && message.id === workbenchEventsMessageId) {
    workbenchEventsExpanded = computeWorkbenchExpanded();
  }
  $: if (!userToggledReasoning && message.id === workbenchEventsMessageId) {
    reasoningCollapsed = computeReasoningCollapsed(getReasoning(message));
  }

  function toggleWorkbench() {
    workbenchEventsExpanded = !workbenchEventsExpanded;
    userToggledWorkbench = true;
  }

  function toggleReasoning() {
    reasoningCollapsed = !reasoningCollapsed;
    userToggledReasoning = true;
  }

  function toggleWorkbenchEvents(): void {
    toggleWorkbench();
  }

  interface WorkbenchDisplayStep {
    key: string;
    toolName?: string;
    displayName?: string;
    isToolExecution?: boolean;
    title: string;
    summary: string;
    durationMs?: number;
    ok?: boolean;
    running?: boolean;
  }

  let workbenchDisplaySteps: WorkbenchDisplayStep[] = [];
  let workbenchProcessSummary = "";

  function getStepKey(event: AgentWorkbenchEvent, index: number): string {
    if ("toolCallId" in event && event.toolCallId) return event.toolCallId;
    if ("toolName" in event) return `${event.stepIndex ?? index}-${event.toolName}`;
    return `event-${event.stepIndex ?? index}-${event.at}`;
  }

  function buildDisplaySteps(events: AgentWorkbenchEvent[], isTurnActive: boolean): WorkbenchDisplayStep[] {
    const steps: WorkbenchDisplayStep[] = [];
    const byKey = new Map<string, WorkbenchDisplayStep>();

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.type === "error") {
        // 使用用户可读错误映射，不直接展示内部 message
        const userFacing = mapAgentErrorToUserFacing({
          agentErrorCode: event.code,
          message: event.message,
        });
        steps.push({
          key: `failed-${event.stepIndex ?? index}-${event.at}`,
          title: userFacing.title,
          summary: userFacing.suggestion
            ? `${userFacing.title}：${userFacing.message} ${userFacing.suggestion}`
            : `${userFacing.title}：${userFacing.message}`,
          ok: false,
        });
        continue;
      }

      if (event.type === "notice") {
        steps.push({
          key: event.eventId,
          title: /重试|retry/i.test(event.message) ? "自动重试" : "运行提示",
          summary: event.message,
          running: isTurnActive,
        });
        continue;
      }

      if (event.type === "tool_call_delta") {
        const tcKey = event.call?.id || `tc-${event.call?.index ?? index}`;
        const existing = byKey.get(tcKey);
        if (!existing) {
          const step: WorkbenchDisplayStep = {
            key: tcKey,
            title: "正在准备工具调用…",
            summary: event.call?.name ? `调用 ${formatToolDisplayName(event.call.name)}` : "正在分析工具参数…",
            running: true,
          };
          byKey.set(tcKey, step);
          steps.push(step);
        } else if (existing.running && event.call?.name) {
          existing.summary = `调用 ${formatToolDisplayName(event.call.name)}`;
        }
        continue;
      }

      if (event.type === "permission_required") {
        const permKey = event.toolCallId || `perm-${event.stepIndex ?? index}`;
        const existing = byKey.get(permKey);
        const displayName = existing?.displayName
          ?? formatToolDisplayName(event.preview?.toolName ?? "");
        if (existing) {
          existing.displayName = displayName;
          existing.title = `等待确认：${displayName}`;
          existing.summary = "确认后将执行此操作。";
          existing.running = true;
        } else {
          const step: WorkbenchDisplayStep = {
            key: permKey,
            displayName,
            title: `等待确认：${displayName}`,
            summary: "确认后将执行此操作。",
            running: true,
          };
          byKey.set(permKey, step);
          steps.push(step);
        }
        continue;
      }

      if (event.type === "permission_resolved") {
        const permKey = event.toolCallId || `perm-${event.stepIndex ?? index}`;
        const existing = byKey.get(permKey);
        if (existing) {
          const displayName = existing.displayName ?? "此操作";
          existing.title = event.approved ? `已确认：${displayName}` : `已取消：${displayName}`;
          existing.summary = event.approved ? "" : (event.reason ?? "用户取消了操作");
          existing.running = false;
          existing.ok = event.approved ? undefined : false;
        } else {
          steps.push({
            key: permKey,
            title: event.approved ? "已确认" : "已取消",
            summary: event.approved ? "" : (event.reason ?? "用户取消了操作"),
            ok: event.approved ? undefined : false,
          });
        }
        continue;
      }

      if (event.type !== "tool_start" && event.type !== "tool_result") continue;

      const key = getStepKey(event, index);
      const existing = byKey.get(key);

      if (event.type === "tool_start") {
        const displayName = formatToolDisplayName(event.toolName, event.argsPreview);
        const step: WorkbenchDisplayStep = existing ?? {
          key,
          toolName: event.toolName,
          displayName,
          isToolExecution: true,
          title: `正在${displayName}`,
          summary: formatToolArgsPreview(event.argsPreview),
          running: true,
        };
        step.toolName = event.toolName;
        step.displayName = displayName;
        step.isToolExecution = true;
        step.title = `正在${displayName}`;
        step.summary = formatToolArgsPreview(event.argsPreview);
        step.running = true;
        if (!existing) {
          byKey.set(key, step);
          steps.push(step);
        }
        continue;
      }

      const displayName = existing?.displayName
        ?? formatToolDisplayName(event.toolName, event.argsPreview);
      const step: WorkbenchDisplayStep = existing ?? {
        key,
        toolName: event.toolName,
        displayName,
        isToolExecution: true,
        title: displayName,
        summary: "",
      };
      step.toolName = event.toolName;
      step.displayName = displayName;
      step.isToolExecution = true;
      step.ok = event.result.ok;
      step.running = false;
      step.durationMs = event.durationMs;
      if (event.result.ok) {
        step.title = displayName;
        step.summary = formatToolResultSummary(displayName, event.result.summary, event.toolName);
      } else {
        step.title = `${displayName}失败`;
        const failureSummary = formatToolFailureSummary(
          displayName,
          event.result.summary,
          event.toolName,
          event.result.errorCode ?? event.result.code,
        );
        if (!existing && event.argsPreview) {
          const preview = formatToolArgsPreview(event.argsPreview);
          step.summary = preview === "已准备必要信息。"
            ? failureSummary
            : `${failureSummary}；${preview}`;
        } else {
          step.summary = failureSummary;
        }
      }
      if (!existing) {
        byKey.set(key, step);
        steps.push(step);
      }
    }

    if (!isTurnActive) {
      for (const step of steps) {
        if (!step.running) continue;
        step.running = false;
        if (step.isToolExecution) {
          step.ok = false;
          step.title = `${step.displayName ?? "工具调用"}未完成`;
          step.summary = "本轮已经结束，但没有收到工具结果。";
        }
      }
    }

    return steps;
  }

  $: workbenchDisplaySteps = buildDisplaySteps(visibleWorkbenchEvents, isAssistantGenerating);
  $: workbenchProcessSummary = recoveryPresentation
    ? "执行已中断"
    : workbenchRun.active
      ? workbenchRun.label
      : formatWorkbenchProcessStats(workbenchDisplaySteps, {
        isGenerating: false,
        isComplete: message.role !== "assistant" || message.isComplete !== false,
        doneStatus: resolveWorkbenchFinalStatus(workbenchEvents),
        });

  // 选中文本追问
  let selectedText = "";
  let selectedTextCopied = false;
  let selectedCopyTimeout: ReturnType<typeof setTimeout> | null = null;
  let showQuotePopover = false;
  let quotePopoverPos = { x: 0, y: 0 };
  let assistantContentEl: HTMLDivElement;
  let quotePopoverEl: HTMLDivElement;

  function handleMouseUpInAssistant(e: MouseEvent) {
    if (quotePopoverEl?.contains(e.target as Node)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showQuotePopover = false;
      return;
    }
    const text = selection.toString().trim();
    if (!text || !assistantContentEl) {
      showQuotePopover = false;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!assistantContentEl.contains(range.commonAncestorContainer)) {
      showQuotePopover = false;
      return;
    }
    selectedText = text;
    selectedTextCopied = false;
    const rect = range.getBoundingClientRect();
    quotePopoverPos = {
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    };
    showQuotePopover = true;
  }

  function handleQuoteClick() {
    const text = selectedText;
    if (!text) return;
    dispatch("quoteSelection", { text });
    showQuotePopover = false;
    window.getSelection()?.removeAllRanges();
  }

  async function handleSelectedTextCopy() {
    const text = selectedText;
    if (!text) return;
    try {
      await writeTextToClipboard(text);
      selectedTextCopied = true;
      if (selectedCopyTimeout) {
        clearTimeout(selectedCopyTimeout);
      }
      selectedCopyTimeout = setTimeout(() => {
        selectedTextCopied = false;
        showQuotePopover = false;
        window.getSelection()?.removeAllRanges();
      }, 900);
    } catch (err) {
      console.error("[ChatMessageItem] Copy selected text failed:", err);
    }
  }

  function hideQuotePopover(e: MouseEvent) {
    if (quotePopoverEl?.contains(e.target as Node)) return;
    showQuotePopover = false;
  }

  // 用户消息 hover 操作
  function handleEditUserMessage() {
    dispatch("editUserMessage", { text: message.content });
  }

  onDestroy(() => {
    if (copyTimeout) {
      clearTimeout(copyTimeout);
    }
    if (selectedCopyTimeout) {
      clearTimeout(selectedCopyTimeout);
    }
  });
</script>

<svelte:window on:mousedown={hideQuotePopover} on:mouseup={handleMouseUpInAssistant} />

<div class={`chat-message-item ${message.role} style-${chatAppearanceStyle}`}>
  <div class="avatar">
    <ChatAvatar role={message.role} avatar={currentAvatar} />
  </div>
  <div class="content">
    {#if message.role === "assistant"}
      <!-- AI 回答消息 - 渲染 Markdown -->
      <div
        class="bubble markdown-content assistant-bubble"
        bind:this={assistantContentEl}
        use:citationNavigation
      >
        {#if workbenchEvents.length}
          <div class="workbench-events">
            <button
              type="button"
              class="workbench-events-toggle"
              on:click={toggleWorkbenchEvents}
              aria-expanded={workbenchEventsExpanded}
            >
              <span
                class="workbench-events-toggle-icon"
                class:expanded={workbenchEventsExpanded}
              >
                <SiyuanIcon name="next" size={12} />
              </span>
              <span class="workbench-events-title">处理过程</span>
              <span class="workbench-events-summary">{workbenchProcessSummary}</span>
            </button>

            {#if workbenchEventsExpanded}
              <div class="workbench-event-list">
                {#each workbenchDisplaySteps as step (step.key)}
                  <div
                    class="workbench-event"
                    class:is-error={step.ok === false}
                    class:is-running={step.running}
                  >
                    <div class="workbench-event-header">
                      <span class="workbench-event-type">{step.title}</span>
                      {#if step.durationMs !== undefined}
                        <span class="workbench-event-duration">{step.durationMs}ms</span>
                      {/if}
                    </div>
                    {#if step.summary}
                      <div class="workbench-event-summary">{step.summary}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if hasReasoning}
          <div class="reasoning-section">
            <button
              type="button"
              class="reasoning-toggle"
              on:click={toggleReasoning}
            >
              <span
                class="reasoning-toggle-icon"
                class:collapsed={reasoningCollapsed}
              >
                <SiyuanIcon name="next" size={12} />
              </span>
              <span class="reasoning-toggle-label">
                {#if message.reasoning?.status === "streaming"}
                  正在思考...
                {:else}
                  思考过程
                {/if}
              </span>
              {#if message.reasoning?.status === "done" && message.reasoning?.chars > 0}
                <span class="reasoning-toggle-meta"
                  >{message.reasoning.chars} 字</span
                >
              {/if}
            </button>
            {#if !reasoningCollapsed}
              <div class="reasoning-content markdown-content">
                {#if message.reasoning?.status === "streaming" && !message.reasoning?.content}
                  <span class="reasoning-placeholder">正在思考...</span>
                {:else}
                  {@html reasoningHtml}
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if isAssistantPending}
          <!-- 运行态状态：content 为空且 agentStatus 非空时显示 -->
          <div class="agent-status-line">
            <span class="status-text">{workbenchRun.active ? workbenchRun.label : message.agentStatus}</span>
            <span class="loading-dots"></span>
          </div>
        {:else}
          <!-- 统一渲染 Markdown；结构化引用在对应语句后插入可点击来源 -->
          {@html assistantHtml}
        {/if}

        {#if temporaryWorkbenches.length}
          <div class="temporary-workbenches">
            {#each temporaryWorkbenches as workbench (workbench.id)}
              <button
                type="button"
                class="temporary-workbench-link"
                title={`打开临时工作台：${workbench.title}`}
                on:click={() => void openTemporaryWorkbenchDialog(workbench.id)}
              >
                <span class="temporary-workbench-link-icon"><SiyuanIcon name="iconNotebrain" size={15} /></span>
                <span class="temporary-workbench-link-copy">
                  <strong>{workbench.title}</strong>
                  <small>在弹窗中打开临时工作台</small>
                </span>
                <SiyuanIcon name="iconRight" size={13} />
              </button>
            {/each}
          </div>
        {/if}

        <!-- 旧会话没有 citationSegments 时保留 footer 兼容展示 -->
        {#if message.citedReferences?.length && !hasInlineCitations}
          <div class="inline-reference-footer">
            <span class="inline-reference-label">参考：</span>
            {#each message.citedReferences as ref (ref.index)}
              {@const label = getReferenceLabel(ref)}
              {@const truncated = isCitationLabelTruncated(label)}
              <button
                type="button"
                class="citation-marker"
                class:is-truncated={truncated}
                title={`打开${getReferenceTypeLabel(ref)}：${label}`}
                on:click={() => handleReferenceClick(ref)}
              >
                <span class="citation-type-icon" aria-hidden="true">
                  <SiyuanIcon name={getReferenceIconName(ref)} size={11} />
                </span>
                <span class="citation-static-text">
                  {truncateCitationLabel(label)}
                </span>
                {#if truncated}
                  <span class="citation-scroll-viewport" aria-hidden="true">
                    <span class="citation-scroll-text">{label}</span>
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        {#if recoveryPresentation && message.role === "assistant"}
          <div class="agent-recovery" class:is-blocked={!recoveryPresentation.resumable}>
            <div class="agent-recovery-title">{recoveryPresentation.title}</div>
            <div class="agent-recovery-summary">{recoveryPresentation.summary}</div>
            {#if recoveryPresentation.resumable && !readOnly}
              <button
                type="button"
                class="agent-recovery-button"
                disabled={asking || !isLastAssistant}
                on:click={() => dispatch("resumeAgent", { assistantMessageId: message.id })}
              >
                从检查点继续
              </button>
            {/if}
          </div>
        {/if}

        <!-- 已停止的半截回答提示 -->
        {#if partialAnswerHint}
          <div class="stopped-partial-hint">{partialAnswerHint}</div>
        {/if}

        <!-- 操作按钮区 -->
        {#if shouldShowAssistantActions}
          <div class={`assistant-actions align-${assistantActionAlignment}`}>
            {#if isLastAssistant && !readOnly}
              <button
                class="action-btn regenerate-btn"
                on:click={() => dispatch("regenerate")}
                disabled={!canRegenerate}
                title={canRegenerate ? "重新生成" : "正在生成中"}
              >
                <span class="action-icon"
                  ><SiyuanIcon name="iconRefresh" size={14} /></span
                >
              </button>
            {/if}
            <button
              class="action-btn copy-btn"
              on:click={() => handleCopy(message.content, message.id)}
              title={isCopied ? "已复制" : "复制回答"}
            >
              <span class="action-icon">
                <SiyuanIcon
                  name={isCopied ? "iconCheck" : "iconCopy"}
                  size={14}
                />
              </span>
            </button>
            {#if !readOnly}<button
              class="action-btn delete-btn"
              on:click={() => dispatch("deleteTurn", { assistantMessageId: message.id })}
              disabled={asking || readOnly}
              title="删除本轮对话"
            >
              <span class="action-icon">
                <SiyuanIcon name="iconTrashcan" size={14} />
              </span>
            </button>{/if}
          </div>
        {/if}

        <!-- 追问浮层 -->
        {#if showQuotePopover}
          <div
            class="quote-popover"
            role="dialog"
            tabindex="-1"
            style="left: {quotePopoverPos.x}px; top: {quotePopoverPos.y}px;"
            bind:this={quotePopoverEl}
            on:mousedown|stopPropagation
          >
            <button
              type="button"
              class="quote-popover-btn"
              on:mousedown|stopPropagation|preventDefault
              on:click|stopPropagation={handleQuoteClick}
            >
              <SiyuanIcon name="iconQuote" size={13} />
              <span>追问</span>
            </button>
            <button
              type="button"
              class="quote-popover-btn"
              on:mousedown|stopPropagation|preventDefault
              on:click|stopPropagation={handleSelectedTextCopy}
            >
              <SiyuanIcon name={selectedTextCopied ? "iconCheck" : "iconCopy"} size={13} />
              <span>{selectedTextCopied ? "已复制" : "复制"}</span>
            </button>
          </div>
        {/if}
      </div>
    {:else if message.role === "error"}
      <!-- Error 消息 - 显示内容和重试按钮 -->
      <div class="bubble error-bubble">
        <div class="error-content">{message.content}</div>
        {#if isLastError}
          <div class={`error-actions align-${assistantActionAlignment}`}>
            <button
              class="action-btn retry-btn"
              on:click={() => dispatch("retry")}
              disabled={!canRetry}
              title={canRetry ? "重新尝试上一条问题" : "正在生成中"}
            >
              <span class="action-icon"
                ><SiyuanIcon name="iconRefresh" size={14} /></span
              >
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <!-- 普通消息 (user/loading) -->
      <div class="bubble user-bubble">
        {#if message.role === "loading"}
          <span class="loading-dots">思考中</span>
        {:else}
          <div class="message-text">{message.content}</div>
          {#if message.role === "user" && message.content}
            <div class="user-actions">
              <button
                type="button"
                class="action-btn user-action-btn"
                on:click={() => handleCopy(message.content, message.id)}
                title="复制问题"
              >
                <span class="action-icon">
                  <SiyuanIcon name={isCopied ? "iconCheck" : "iconCopy"} size={14} />
                </span>
              </button>
              {#if !readOnly}<button
              <button
                type="button"
                class="action-btn user-action-btn"
                on:click={handleEditUserMessage}
                title="编辑问题"
              >
                <span class="action-icon">
                  <SiyuanIcon name="iconEdit" size={14} />
                </span>
              </button>{/if}
            </div>
          {/if}
        {/if}
        {#if message.role === "user" && message.attachedDocs?.length}
          <div class="user-attached-docs">
            {#each message.attachedDocs as doc}
              <button
                type="button"
                class="user-doc-chip"
                title={doc.title || doc.docId}
                on:click={() => handleAttachedDocClick(doc)}
              >
                <span class="user-doc-chip-icon"><SiyuanIcon name="iconFile" size={11} /></span>
                <span class="user-doc-chip-title">{doc.title || doc.docId}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use '../panels/_kb-tokens' as *;

  .chat-message-item {
    display: flex;
    gap: 12px;
    padding: 4px 12px;

    &.user {
      flex-direction: row-reverse;

      .bubble {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
      }
    }

    &.user .user-attached-docs {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }

    &.user .user-doc-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      font-size: 11px;
      color: var(--b3-theme-on-primary);
      max-width: 160px;
      cursor: pointer;
      font-family: inherit;
      line-height: 1.4;
      transition: background 0.15s;
      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    &.user .user-doc-chip-icon {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      opacity: 0.9;
    }

    &.user .user-doc-chip-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &.assistant .bubble {
      background: var(--b3-theme-surface);
      position: relative;
      user-select: text;
      -webkit-user-select: text;

      &.markdown-content {
        // Markdown 内容基础样式
        :global(p) {
          margin: 0.5em 0;
          &:first-child {
            margin-top: 0;
          }
          &:last-child {
            margin-bottom: 0;
          }
        }

        :global(ul),
        :global(ol) {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }

        :global(li) {
          margin: 0.25em 0;
        }

        :global(h1),
        :global(h2),
        :global(h3),
        :global(h4),
        :global(h5),
        :global(h6) {
          margin: 0.75em 0 0.5em;
          font-weight: 600;
          &:first-child {
            margin-top: 0;
          }
        }

        :global(h1) {
          font-size: 1.3em;
        }
        :global(h2) {
          font-size: 1.2em;
        }
        :global(h3) {
          font-size: 1.1em;
        }
        :global(h4),
        :global(h5),
        :global(h6) {
          font-size: 1em;
        }

        :global(strong) {
          font-weight: 600;
        }
        :global(em) {
          font-style: italic;
        }

        :global(code) {
          background: var(--b3-theme-background-light);
          padding: 0.15em 0.4em;
          border-radius: 4px;
          font-family: var(--b3-font-family-code);
          font-size: 0.9em;
        }

        :global(pre) {
          background: var(--b3-theme-background-light);
          padding: 0.75em 1em;
          border-radius: 6px;
          overflow-x: auto;
          margin: 0.5em 0;
        }

        :global(pre code) {
          background: none;
          padding: 0;
        }

        :global(blockquote) {
          border-left: 3px solid var(--b3-theme-primary-light);
          padding-left: 0.75em;
          margin: 0.5em 0;
          color: var(--b3-theme-on-surface-light);
        }

        :global(a) {
          color: var(--b3-theme-primary);
          text-decoration: none;
          &:hover {
            text-decoration: underline;
          }
        }

        :global(hr) {
          border: none;
          border-top: 1px solid var(--b3-border-color);
          margin: 0.75em 0;
        }

        :global(table) {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }

        :global(th),
        :global(td) {
          border: 1px solid var(--b3-border-color);
          padding: 0.4em 0.6em;
          text-align: left;
        }

        :global(th) {
          background: var(--b3-theme-background-light);
          font-weight: 600;
        }
      }

      // 操作按钮区
      .assistant-actions {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--b3-border-color);

        &.align-center {
          justify-content: center;
        }

        &.align-right {
          justify-content: flex-end;
        }

      }
    }

    &.error .bubble {
      background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
      color: var(--b3-theme-error);

      &.error-bubble {
        .error-actions {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--b3-border-color);

          &.align-center {
            justify-content: center;
          }

          &.align-right {
            justify-content: flex-end;
          }
        }
      }
    }

    &.loading .bubble {
      background: var(--b3-theme-surface-light);
    }
  }

  .avatar {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .content {
    max-width: 85%;
  }

  .bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
  }

  .chat-message-item.style-minimal {
    padding: 6px 0;
    gap: 0;

    .avatar {
      display: none;
    }

    .content {
      width: 100%;
      max-width: 100%;
    }

    &.assistant .bubble {
      background: transparent;
      border: none;
      padding: 4px 0;
      color: var(--b3-theme-on-surface, #1f2329);
    }

    &.user {
      .content {
        display: flex;
        justify-content: flex-end;
      }

      .bubble {
        max-width: min(76%, 620px);
        background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
        color: var(--b3-theme-on-surface, #1f2329);
        border-radius: 18px;
      }
    }

    .assistant-actions {
      border-top-color: transparent;
      margin-top: 8px;
      padding-top: 6px;
    }

    .action-btn {
      border-color: transparent;
      background: transparent;
      opacity: 0.55;

      &:hover {
        opacity: 0.9;
        background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
      }
    }

    .user-attached-docs {
      border-top-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 10%, transparent);
    }

    .user-doc-chip {
      background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 6%, transparent);
      border-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
      color: var(--b3-theme-on-surface, #1f2329);
    }
  }

  .chat-message-item.style-prose {
    padding: 8px 0;
    gap: 0;

    .avatar {
      display: none;
    }

    &.assistant .bubble {
      background: transparent;
      padding: 7px 0;
      color: var(--b3-theme-on-surface, #1f2329);
      font-size: 15px;
      line-height: 1.65;
    }

    &.user {
      .content {
        display: flex;
        justify-content: flex-end;
      }

      .bubble {
        max-width: min(78%, 640px);
        background: color-mix(in srgb, var(--b3-theme-primary, #3577f0) 7%, var(--b3-theme-background, #fff));
        color: var(--b3-theme-on-surface, #1f2329);
        border-radius: 18px;
      }
    }

    .content {
      max-width: min(88%, 760px);
    }

    .workbench-events-toggle,
    .workbench-event {
      background: color-mix(in srgb, var(--b3-theme-background, #fff) 70%, transparent);
      border-color: color-mix(in srgb, var(--b3-border-color, rgba(0, 0, 0, 0.12)) 70%, transparent);
    }

    .reasoning-toggle,
    .reasoning-content {
      background: color-mix(in srgb, var(--b3-theme-background, #fff) 70%, transparent);
      border-color: color-mix(in srgb, var(--b3-border-color, rgba(0, 0, 0, 0.12)) 70%, transparent);
    }

    .assistant-actions {
      border-top-color: transparent;
    }

    .action-btn {
      border-color: transparent;
      background: transparent;
      opacity: 0.55;

      &:hover {
        opacity: 0.9;
        background: var(--b3-theme-background-light, rgba(0, 0, 0, 0.04));
      }
    }

    .user-attached-docs {
      border-top-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 10%, transparent);
    }

    .user-doc-chip {
      background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 6%, transparent);
      border-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
      color: var(--b3-theme-on-surface, #1f2329);
    }
  }

  .chat-message-item.style-card {
    padding: 8px 0;

    .avatar {
      opacity: 0.7;
    }

    &.assistant .bubble {
      background: var(--b3-theme-background, #fff);
      border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 16%, var(--b3-border-color, rgba(0, 0, 0, 0.12)));
      box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12), 0 4px 10px rgba(15, 23, 42, 0.06);
      border-radius: 16px;
    }

    &.user {
      .content {
        display: flex;
        justify-content: flex-end;
      }

      .bubble {
        max-width: min(78%, 640px);
        background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 5%, var(--b3-theme-background, #fff));
        color: var(--b3-theme-on-surface, #1f2329);
        border: 1px solid color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
        border-radius: 18px;
      }
    }

    .content {
      max-width: min(88%, 760px);
    }

    .assistant-actions {
      border-top-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
    }

    .action-btn {
      border-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 18%, var(--b3-border-color, rgba(0, 0, 0, 0.12)));
      background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 5%, var(--b3-theme-background, #fff));
      opacity: 0.75;

      &:hover {
        opacity: 1;
        border-color: var(--b3-theme-on-surface, #1f2329);
      }
    }

    .user-attached-docs {
      border-top-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
    }

    .user-doc-chip {
      background: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 6%, transparent);
      border-color: color-mix(in srgb, var(--b3-theme-on-surface, #1f2329) 12%, transparent);
      color: var(--b3-theme-on-surface, #1f2329);
    }
  }

  .message-text {
    user-select: text;
    -webkit-user-select: text;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .user-bubble {
    position: relative;
  }

  .user-actions {
    position: absolute;
    top: 100%;
    right: 8px;
    padding-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(2px);
    transition: opacity 0.15s ease, transform 0.15s ease;

    /* 透明桥接区：鼠标从气泡移到按钮时不经过空白断层 */
    &::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 6px;
    }

    .user-bubble:hover &,
    .user-bubble:focus-within &,
    &:hover,
    &:focus-within {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
  }

  .user-action-btn {
    &:hover,
    &:focus-visible {
      border-color: var(--b3-theme-primary-light);
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-primary);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }
  }

  .quote-popover {
    position: fixed;
    z-index: 100;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .quote-popover-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition: all 0.15s ease;

    &:hover {
      background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
      color: var(--b3-theme-primary);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    cursor: pointer;
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface-light);
    opacity: 0.7;
    transition:
      opacity $kb-dur-fast $kb-ease-out,
      background $kb-dur-fast $kb-ease-out,
      color $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;
    user-select: none;
    -webkit-user-select: none;

    &:hover {
      opacity: 1;
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-on-surface);
      box-shadow: $kb-shadow-card;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0) scale(0.95);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .delete-btn:hover:not(:disabled) {
    border-color: var(--b3-theme-error);
    color: var(--b3-theme-error);
  }

  .action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loading-dots::after {
    content: "...";
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0%,
    20% {
      content: "";
    }
    40% {
      content: ".";
    }
    60% {
      content: "..";
    }
    80%,
    100% {
      content: "...";
    }
  }

  // Agent 运行态状态行
  .agent-status-line {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
  }

  .agent-status-line .status-text {
    flex: 1;
  }

  .agent-status-line .loading-dots {
    flex-shrink: 0;
  }

  .agent-status-line .loading-dots::after {
    content: "...";
    animation: dots 1.5s steps(4, end) infinite;
  }

  .workbench-events {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
  }

  .workbench-events-toggle {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 9px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;

    &:hover {
      border-color: var(--b3-theme-primary-light);
      background: var(--b3-theme-surface-light);
    }
  }

  .workbench-events-toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--b3-theme-on-surface-light);
    transition: transform 0.15s ease;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .workbench-events-title {
    font-weight: 600;
    white-space: nowrap;
  }

  .workbench-events-summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--b3-theme-on-surface-light);
  }

  .workbench-event-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
    max-height: 200px;
    overflow-x: hidden;
    overflow-y: auto;
    padding-right: 2px;
  }

  .workbench-event {
    padding: 7px 9px;
    border: 1px solid var(--b3-border-color);
    border-left: 3px solid var(--b3-theme-primary);
    border-radius: 6px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    overflow-wrap: anywhere;
  }

  .workbench-event.is-error {
    border-left-color: var(--b3-theme-error);
    background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
  }

  .workbench-event.is-running {
    border-left-color: var(--b3-theme-primary-light);
  }

  .workbench-event-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    line-height: 1.4;
  }

  .workbench-event-type {
    font-weight: 600;
    color: var(--b3-theme-primary);
  }

  .workbench-event.is-error .workbench-event-type {
    color: var(--b3-theme-error);
  }

  .workbench-event-duration {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
  }

  .workbench-event-summary {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--b3-theme-on-surface-light);
  }

  .agent-recovery {
    display: grid;
    gap: 5px;
    margin-top: 10px;
    padding: 9px 10px;
    border-left: 3px solid var(--b3-theme-primary);
    border-radius: 6px;
    background: var(--b3-theme-background-light);

    &.is-blocked {
      border-left-color: var(--b3-card-warning-color, #e6a817);
    }
  }

  .agent-recovery-title {
    font-size: 12px;
    font-weight: 600;
  }

  .agent-recovery-summary {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.45;
  }

  .agent-recovery-button {
    justify-self: start;
    padding: 4px 9px;
    border: 1px solid var(--b3-theme-primary);
    border-radius: 6px;
    background: transparent;
    color: var(--b3-theme-primary);
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  // 已停止的半截回答提示
  .stopped-partial-hint {
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 10%, transparent);
    color: var(--b3-card-warning-color, #856404);
    font-size: 12px;
    line-height: 1.4;
  }

  .citation-text-block {
    display: inline;

    // 内部 Markdown 元素样式
    :global(p) {
      display: inline;
      margin: 0;
    }

    :global(ul),
    :global(ol) {
      display: block;
      margin: 0.5em 0;
      padding-left: 1.5em;
    }

    :global(li) {
      display: list-item;
      margin: 0.25em 0;
    }

    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6) {
      display: block;
      margin: 0.75em 0 0.5em;
      font-weight: 600;
    }

    :global(pre) {
      display: block;
      margin: 0.5em 0;
    }

    :global(blockquote) {
      display: block;
      margin: 0.5em 0;
    }
  }

  .assistant-bubble :global(.inline-citation-marker) {
    display: inline-flex;
    align-items: center;
    max-width: 10em;
    margin: 0 2px;
    padding: 1px 6px 1px 4px;
    vertical-align: 0.08em;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-border-color));
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-background));
    color: var(--b3-theme-primary);
    font: inherit;
    font-size: 11px;
    line-height: 1.45;
    cursor: pointer;
    appearance: none;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .temporary-workbenches {
    display: grid;
    gap: 6px;
    margin-top: 12px;
  }

  .temporary-workbench-link {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 48px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 18%, var(--b3-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-surface));
    color: var(--b3-theme-on-surface);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .temporary-workbench-link:hover,
  .temporary-workbench-link:focus-visible {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
    outline-offset: 2px;
  }
  .temporary-workbench-link-icon { display: grid; place-items: center; color: var(--b3-theme-primary); }
  .temporary-workbench-link-copy { display: grid; flex: 1; min-width: 0; gap: 1px; }
  .temporary-workbench-link-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .temporary-workbench-link-copy small { color: var(--b3-theme-on-surface-light); font-size: 11px; }

  .assistant-bubble :global(.inline-citation-marker:hover),
  .assistant-bubble :global(.inline-citation-marker:focus-visible) {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-background));
    outline: none;
  }

  .assistant-bubble :global(.inline-citation-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    margin-right: 3px;
    flex: 0 0 auto;
    opacity: 0.86;
  }

  .assistant-bubble :global(.inline-citation-source-icon) {
    display: block;
    width: 11px;
    height: 11px;
    fill: currentColor;
    color: currentColor;
  }

  .assistant-bubble :global(.inline-citation-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 引用 footer 样式
  .inline-reference-footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }

  .inline-reference-label {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-right: 2px;
  }

  .citation-marker {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    width: auto;
    max-width: 7.5em;
    padding: 1px 6px;
    margin: 0 2px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-primary);
    font-size: 11px;
    line-height: 1.4;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    overflow: hidden;
    appearance: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.15s ease;
    user-select: none;
    -webkit-user-select: none;

    &:hover,
    &:focus,
    &:focus-visible {
      border-color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
      color: var(--b3-theme-primary);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      text-decoration: none;
      outline: none;
    }

    &:active {
      transform: translateY(1px);
      box-shadow: none;
    }
  }

  .citation-marker.is-truncated {
    width: auto;
    min-width: 5.6em;
  }

  .citation-type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-right: 3px;
    color: currentColor;
    opacity: 0.85;
  }

  .citation-static-text {
    display: inline-block;
    white-space: nowrap;
    transition: opacity 0.15s ease;
  }

  .citation-scroll-viewport {
    position: absolute;
    left: 21px;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    overflow: hidden;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .citation-scroll-text {
    display: inline-block;
    white-space: nowrap;
    transform: translateX(0);
  }

  // hover/focus 时切换显示
  .citation-marker.is-truncated:hover .citation-static-text,
  .citation-marker.is-truncated:focus .citation-static-text,
  .citation-marker.is-truncated:focus-visible .citation-static-text {
    opacity: 0;
  }

  .citation-marker.is-truncated:hover .citation-scroll-viewport,
  .citation-marker.is-truncated:focus .citation-scroll-viewport,
  .citation-marker.is-truncated:focus-visible .citation-scroll-viewport {
    opacity: 1;
  }

  .citation-marker.is-truncated:hover .citation-scroll-text,
  .citation-marker.is-truncated:focus .citation-scroll-text,
  .citation-marker.is-truncated:focus-visible .citation-scroll-text {
    animation: citation-marquee 3s linear infinite alternate;
  }

  @keyframes citation-marquee {
    0%,
    15% {
      transform: translateX(0);
    }
    85%,
    100% {
      transform: translateX(calc(-100% + 6em));
    }
  }

  // Reasoning 折叠区样式
  .reasoning-section {
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    padding-bottom: 8px;
  }

  .reasoning-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background-light);
    color: var(--b3-theme-on-surface);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;

    &:hover {
      color: var(--b3-theme-on-surface);
    }
  }

  .reasoning-toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--b3-theme-on-surface-light);
    transition: transform 0.15s ease;
    flex-shrink: 0;

    &.collapsed {
      transform: rotate(0deg);
    }
    &:not(.collapsed) {
      transform: rotate(90deg);
    }
  }

  .reasoning-toggle-label {
    font-weight: 500;
  }

  .reasoning-toggle-meta {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.7;
  }

  .reasoning-content {
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--b3-theme-background-light);
    font-size: 13px;
    line-height: 1.5;
    color: var(--b3-theme-on-surface-light);
    max-height: 300px;
    overflow-y: auto;

    :global(p) {
      margin: 0.3em 0;
      &:first-child {
        margin-top: 0;
      }
      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  .reasoning-placeholder {
    color: var(--b3-theme-on-surface-light);
    font-style: italic;
    font-size: 12px;
  }
</style>
