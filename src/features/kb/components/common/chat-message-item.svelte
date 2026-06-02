<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ChatMessage, ReferenceItem } from "../../types/chat";
  import type { KbAssistantActionAlignment } from "../../types/settings";
  import { navigateToReference, navigateToDocId } from "../../services/siyuan/reference-navigation";
  import { mdToHtml } from "../../utils/md-to-html";
  import { pushAgentDebugEvent } from "../../services/agentic-rag/debug/agentic-rag-debug";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  // Props - 由父组件 ChatMessageList 传入
  export let message: ChatMessage;
  export let isLastAssistant: boolean = false;
  export let isLastError: boolean = false;
  export let canRegenerate: boolean = false;
  export let canContinueSearch: boolean = false;
  export let canRetry: boolean = false;
  // asking 状态，用于控制按钮显示
  export let asking: boolean = false;
  export let assistantActionAlignment: KbAssistantActionAlignment = "left";

  const dispatch = createEventDispatcher<{
    regenerate: void;
    retry: void;
    continueSearch: { assistantMessageId: string };
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
    return ref.displayTitle || ref.docTitle || "参考文档";
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

  // 判断 assistant 是否显示运行态状态（content 为空且 agentStatus 非空，且 reasoning 非 streaming）
  $: isAssistantPending =
    message.role === "assistant" &&
    !message.content.trim() &&
    message.agentStatus &&
    message.reasoning?.status !== "streaming";

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
</script>

<div class="chat-message-item {message.role}">
  <div class="avatar">
    {#if message.role === "user"}
      <SiyuanIcon name="iconAccount" size={16} />
    {:else if message.role === "assistant"}
      <SiyuanIcon name="iconSparkles" size={16} />
    {:else if message.role === "error"}
      <SiyuanIcon name="iconInfo" size={16} />
    {:else}
      <SiyuanIcon name="iconClock" size={16} />
    {/if}
  </div>
  <div class="content">
    {#if message.role === "assistant"}
      <!-- AI 回答消息 - 渲染 Markdown -->
      <div class="bubble markdown-content assistant-bubble">
        {#if hasReasoning}
          <div class="reasoning-section">
            <button
              type="button"
              class="reasoning-toggle"
              on:click={() => (reasoningCollapsed = !reasoningCollapsed)}
            >
              <span
                class="reasoning-toggle-icon"
                class:collapsed={reasoningCollapsed}>▶</span
              >
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
                title={`打开引用文档：${label}`}
                on:click={() => handleReferenceClick(ref)}
              >
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
            <!-- 继续查找 -->
            {#if canContinueSearch}
              <button
                class="action-btn"
                on:click={() => dispatch("continueSearch", { assistantMessageId: message.id })}
                title="继续查找相关资料"
              >
                <span class="action-icon"
                  ><SiyuanIcon name="iconSearch" size={14} /></span
                >
              </button>
            {/if}
            {#if isLastAssistant}
              <div class="action-divider"></div>
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
      <div class="bubble">
        {#if message.role === "loading"}
          <span class="loading-dots">思考中</span>
        {:else}
          {message.content}
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

    &.user .user-doc-chip-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &.assistant .bubble {
      background: var(--b3-theme-surface);
      position: relative;

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

        // 按钮分隔线
        .action-divider {
          width: 1px;
          height: 14px;
          background: var(--b3-border-color);
          margin: 0 2px;
        }
      }
    }

    &.error .bubble {
      background: var(--b3-theme-error-light);
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

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    color: var(--b3-theme-on-surface-light);
    opacity: 0.7;
    transition: all 0.15s ease;

    &:hover {
      opacity: 1;
      background: var(--b3-theme-background-light);
      color: var(--b3-theme-on-surface);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
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

  // 已停止的半截回答提示
  .stopped-partial-hint {
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--b3-theme-warning-light, rgba(255, 193, 7, 0.1));
    color: var(--b3-theme-warning, #856404);
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

    &:hover,
    &:focus,
    &:focus-visible {
      border-color: var(--b3-theme-primary);
      background: var(--b3-theme-primary-lightest);
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
    min-width: 4.8em;
  }

  .citation-static-text {
    display: inline-block;
    white-space: nowrap;
    transition: opacity 0.15s ease;
  }

  .citation-scroll-viewport {
    position: absolute;
    left: 6px;
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
    padding: 4px 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.4;
    text-align: left;

    &:hover {
      color: var(--b3-theme-on-surface);
    }
  }

  .reasoning-toggle-icon {
    font-size: 10px;
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
