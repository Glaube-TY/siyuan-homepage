<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import type { ChatMessage, ReferenceItem } from "../../types/chat";
  import type { AgentWorkbenchEvent } from "../../services/agent-workbench";
  import type { KbAssistantActionAlignment, KbChatAppearanceStyle, KbChatAvatarSettings } from "../../types/settings";
  import { navigateToReference, navigateToDocId } from "../../services/siyuan/reference-navigation";
  import { mdToHtml } from "@/components/tools/mdToHtml";
  import { pushAgentDebugEvent } from "../../services/agent-workbench/debug/workbench-debug";
  import { mapAgentErrorToUserFacing } from "../../services/agent-workbench/runtime/user-facing-agent-error";
  import ChatAvatar from "./chat-avatar.svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  // Props - 由父组件 ChatMessageList 传入
  export let message: ChatMessage;
  export let isLastAssistant: boolean = false;
  export let isLastError: boolean = false;
  export let canRegenerate: boolean = false;
  export let canRetry: boolean = false;
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
  }>();

  // 复制状态管理
  let copiedMessageId: string | null = null;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleReferenceClick(item: ReferenceItem) {
    await navigateToReference(item);
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
      await navigator.clipboard.writeText(content);
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
    message.role === "assistant" ? mdToHtml(message.content) : "";
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
    if (ref.sourceType === "web_page") {
      return ref.displayTitle || ref.docTitle || ref.sourceName || ref.url || "参考网页";
    }
    return ref.displayTitle || ref.docTitle || "参考文档";
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

  // 判断 assistant 是否正在生成中（运行态：asking 为 true 且未完成）
  $: isAssistantGenerating =
    message.role === "assistant" &&
    isLastAssistant &&
    asking &&
    message.isComplete === false;

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

  // 判断是否为已停止的半截回答
  $: isStoppedPartialAnswer =
    message.role === "assistant" &&
    message.content.trim() &&
    message.isComplete === false &&
    !asking;

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

  $: workbenchEvents =
    message.role === "assistant" ? message.workbenchEvents ?? [] : [];
  const VISIBLE_WORKBENCH_EVENT_TYPES = new Set<AgentWorkbenchEvent["type"]>([
    "tool_call_delta",
    "permission_required",
    "permission_resolved",
    "tool_start",
    "tool_result",
    "error",
  ]);
  $: visibleWorkbenchEvents = workbenchEvents.filter((event) =>
    VISIBLE_WORKBENCH_EVENT_TYPES.has(event.type)
  );

  // 判断 assistant 是否显示运行态状态（content 为空且 agentStatus 非空）
  $: isAssistantPending =
    message.role === "assistant" &&
    !message.content.trim() &&
    !!message.agentStatus;

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

  const TOOL_DISPLAY_NAME: Record<string, string> = {
    list_knowledge_map: "查看知识库结构",
    search_scope: "搜索知识库",
    read_docs: "读取文档正文",
    read_doc_blocks: "读取文档块",
    web_search: "联网搜索",
    web_read_page: "读取网页",
    edit_global_memory: "编辑全局记忆",
    create_doc: "创建文档",
    rename_doc: "重命名文档",
    delete_doc: "删除文档",
    replace_doc_content: "替换文档正文",
    update_block: "更新内容块",
    insert_block: "插入内容块",
    move_block: "移动内容块",
  };

  const ARG_LABELS: Record<string, string> = {
    query: "关键词",
    limit: "数量",
    docIds: "文档",
    blockIds: "块",
    maxChars: "最大字数",
    view: "视图",
    maxDepth: "层级",
    rootDocId: "根文档",
    centerDocId: "中心文档",
    notebookId: "笔记本",
    docId: "文档 ID",
    path: "路径",
    markdown: "正文",
    summary: "摘要",
    title: "标题",
    blockId: "内容块 ID",
    includeTags: "标签",
    includeLinkedDocs: "关联文档",
    url: "网址",
    chunkIndex: "块序号",
    operation: "操作",
    item_id: "记忆条目",
    target_id: "目标条目",
    position: "位置",
    text: "内容",
    chunkChars: "块大小",
    chunkCount: "总块数",
  };

  const VIEW_LABELS: Record<string, string> = {
    notebooks: "笔记本",
    notebook_roots: "笔记本根文档",
    children: "子文档",
    subtree: "子树",
    neighborhood: "邻域",
    list: "列表",
  };

  function toggleWorkbenchEvents(): void {
    toggleWorkbench();
  }

  function formatToolDisplayName(toolName: string | undefined): string {
    if (!toolName) return "执行工具";
    return TOOL_DISPLAY_NAME[toolName] ?? "执行工具";
  }

  function formatArgValue(key: string, value: unknown): string | undefined {
    if (value == null) return undefined;
    if (key === "query" && typeof value === "string") return `“${value}”`;
    if (key === "docIds" && Array.isArray(value)) return `${value.length} 个文档`;
    if (key === "blockIds" && Array.isArray(value)) return `${value.length} 个块`;
    if (key === "cursor" && typeof value === "string") return "继续读取位置";
    if (key === "view" && typeof value === "string") return VIEW_LABELS[value] ?? value;
    if (key === "maxDepth" && typeof value === "number") return `${value} 层`;
    if (key === "limit" && typeof value === "number") return `${value}`;
    if (key === "maxChars" && typeof value === "number") return `${value}`;
    if (key === "rootDocId" || key === "centerDocId" || key === "notebookId") return "已指定";
    if (key === "includeTags" || key === "includeLinkedDocs") return value ? "是" : "否";
    if (key === "url" && typeof value === "string") return value.length > 40 ? `${value.slice(0, 37)}...` : value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}...` : value;
    return undefined;
  }

  function formatArgsPreview(argsPreview: Record<string, unknown> | undefined): string {
    const entries = Object.entries(argsPreview ?? {});
    if (entries.length === 0) return "无参数。";
    const parts = entries
      .map(([key, value]) => {
        const label = ARG_LABELS[key];
        const formatted = label ? formatArgValue(key, value) : undefined;
        return label && formatted ? `${label}：${formatted}` : "";
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("；") : "参数已省略。";
  }

  function formatResultSummary(toolName: string | undefined, outputSummary: string | undefined): string {
    const fallback = `${formatToolDisplayName(toolName)}已完成。`;
    if (!outputSummary) return fallback;
    if (toolName && outputSummary === `工具 ${toolName} 执行成功。`) return fallback;
    return outputSummary;
  }

  interface WorkbenchDisplayStep {
    key: string;
    toolName?: string;
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

  function buildDisplaySteps(events: AgentWorkbenchEvent[]): WorkbenchDisplayStep[] {
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
        if (existing) {
          existing.title = "等待确认";
          existing.summary = `确认执行 ${formatToolDisplayName(event.preview?.toolName ?? "")}`;
          existing.running = true;
        } else {
          const step: WorkbenchDisplayStep = {
            key: permKey,
            title: "等待确认",
            summary: `确认执行 ${formatToolDisplayName(event.preview?.toolName ?? "")}`,
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
          existing.title = event.approved ? "已确认" : "已取消";
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
        const step: WorkbenchDisplayStep = existing ?? {
          key,
          toolName: event.toolName,
          title: `正在${formatToolDisplayName(event.toolName)}`,
          summary: formatArgsPreview(event.argsPreview),
          running: true,
        };
        step.toolName = event.toolName;
        step.title = `正在${formatToolDisplayName(event.toolName)}`;
        step.summary = formatArgsPreview(event.argsPreview);
        step.running = true;
        if (!existing) {
          byKey.set(key, step);
          steps.push(step);
        }
        continue;
      }

      const step: WorkbenchDisplayStep = existing ?? {
        key,
        toolName: event.toolName,
        title: formatToolDisplayName(event.toolName),
        summary: "",
      };
      step.toolName = event.toolName;
      step.ok = event.result.ok;
      step.running = false;
      step.durationMs = event.durationMs;
      if (event.result.ok) {
        step.title = formatToolDisplayName(event.toolName);
        step.summary = formatResultSummary(event.toolName, event.result.summary);
      } else {
        step.title = `${formatToolDisplayName(event.toolName)}失败`;
        step.summary = event.result.summary || `失败：${event.result.errorCode || event.result.code || "未知错误"}`;
      }
      if (!existing) {
        byKey.set(key, step);
        steps.push(step);
      }
    }

    return steps;
  }

  function countDisplaySteps(toolName: string): number {
    return workbenchDisplaySteps.filter((step) => step.toolName === toolName).length;
  }

  function readDocsDisplayCount(): number {
    let total = 0;
    for (const step of workbenchDisplaySteps) {
      if (step.toolName !== "read_docs" || step.ok === false) continue;
      const match = step.summary.match(/已读取\s+(\d+)/);
      total += match ? Number(match[1]) || 0 : 0;
    }
    return total;
  }

  function buildWorkbenchProcessSummary(): string {
    const failed = [...workbenchDisplaySteps].reverse().find((step) => step.ok === false);
    if (failed) return `${formatToolDisplayName(failed.toolName)}失败`;

    const running = [...workbenchDisplaySteps].reverse().find((step) => step.running);
    if (running) return `正在${formatToolDisplayName(running.toolName)}`;

    const parts: string[] = [];
    const structureCount = countDisplaySteps("list_knowledge_map");
    const searchCount = countDisplaySteps("search_scope");
    const readStepCount = countDisplaySteps("read_docs");
    const readCount = readDocsDisplayCount();
    const webSearchCount = countDisplaySteps("web_search");
    const webReadCount = countDisplaySteps("web_read_page");
    if (structureCount > 0) parts.push(`查看结构 ${structureCount} 次`);
    if (searchCount > 0) parts.push(`搜索知识库 ${searchCount} 次`);
    if (readCount > 0) {
      parts.push(`读取文档 ${readCount} 篇`);
    } else if (readStepCount > 0) {
      parts.push(`读取文档 ${readStepCount} 次`);
    }
    if (webSearchCount > 0) parts.push(`联网搜索 ${webSearchCount} 次`);
    if (webReadCount > 0) parts.push(`读取网页 ${webReadCount} 次`);

    const summary = parts.join("，");
    const assistantMessage = message.role === "assistant" ? message : undefined;
    const isRunningAssistant =
      assistantMessage &&
      assistantMessage.isComplete === false &&
      !!assistantMessage.agentStatus;
    if (isRunningAssistant) {
      return summary ? `${summary} · ${assistantMessage.agentStatus}` : assistantMessage.agentStatus;
    }
    return summary;
  }

  $: workbenchDisplaySteps = buildDisplaySteps(visibleWorkbenchEvents);
  $: workbenchProcessSummary = buildWorkbenchProcessSummary();

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
      await navigator.clipboard.writeText(text);
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
      >
        {#if workbenchDisplaySteps.length}
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
            <span class="status-text">{message.agentStatus}</span>
            <span class="loading-dots"></span>
          </div>
        {:else}
          <!-- 统一渲染 Markdown，不再在正文插入引用标签 -->
          {@html assistantHtml}
        {/if}

        <!-- 引用 footer，显示在回答底部 -->
        {#if message.citedReferences?.length}
          <div class="inline-reference-footer">
            <span class="inline-reference-label">参考：</span>
            {#each message.citedReferences as ref (ref.index)}
              {@const label = getReferenceLabel(ref)}
              {@const truncated = isCitationLabelTruncated(label)}
              <button
                type="button"
                class="citation-marker"
                class:is-truncated={truncated}
                title={ref.sourceType === "web_page" ? `打开网页：${label}` : `打开引用文档：${label}`}
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

        <!-- 已停止的半截回答提示 -->
        {#if isStoppedPartialAnswer}
          <div class="stopped-partial-hint">已停止生成，内容可能不完整。</div>
        {/if}

        <!-- 操作按钮区 -->
        {#if shouldShowAssistantActions}
          <div class={`assistant-actions align-${assistantActionAlignment}`}>
            {#if isLastAssistant}
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
            <button
              class="action-btn delete-btn"
              on:click={() => dispatch("deleteTurn", { assistantMessageId: message.id })}
              disabled={asking}
              title="删除本轮对话"
            >
              <span class="action-icon">
                <SiyuanIcon name="iconTrashcan" size={14} />
              </span>
            </button>
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
              <button
                type="button"
                class="action-btn user-action-btn"
                on:click={handleEditUserMessage}
                title="编辑问题"
              >
                <span class="action-icon">
                  <SiyuanIcon name="iconEdit" size={14} />
                </span>
              </button>
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
