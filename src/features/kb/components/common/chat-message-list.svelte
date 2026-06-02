<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import ChatMessageItem from "./chat-message-item.svelte";
  import { kbSessionStore } from "../../stores/kb-session-store";
  import type { ChatMessage } from "../../types/chat";
  import { isTextChatMessage } from "../../types/chat";
  import type { KbAssistantActionAlignment } from "../../types/settings";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { pushAgentDebugEvent } from "../../services/agentic-rag/debug/agentic-rag-debug";

  export let messages: ChatMessage[] = [];
  export let assistantActionAlignment: KbAssistantActionAlignment = "left";

  export let emptyTitle: string = "开始对话";
  export let emptyDescription: string = "读取当前文档后，即可开始提问";

  // 快捷建议问题
  export let suggestedQuestions: string[] = [];

  // 从 store 订阅 asking 状态
  $: asking = $kbSessionStore.asking;

  // 最后一条消息
  $: lastMessage = messages[messages.length - 1] ?? null;

  // 内部推导：最后一条消息是否为 assistant
  $: lastAssistantMessageId = lastMessage?.role === "assistant" ? lastMessage.id : null;

  // 内部推导：最后一条消息是否为 error
  $: lastErrorMessageId = lastMessage?.role === "error" ? lastMessage.id : null;

  // 内部推导：是否可以重新生成
  // 需要存在至少一条 user 消息，且最后一条消息是 assistant，且当前不是 asking 状态
  $: hasUserMessage = messages.some((m) => m.role === "user");
  $: canRegenerate = !asking && lastMessage?.role === "assistant" && hasUserMessage;

  // 内部推导：是否可以重试（最后一条消息是 error）
  $: canRetry = !asking && lastMessage?.role === "error" && hasUserMessage;

  // 内部推导：是否有已压缩的消息
  $: hasCompactedMessages = messages.some((m) => (m as { compacted?: boolean }).compacted);
  $: firstNonCompactedIndex = messages.findIndex((m) => !(m as { compacted?: boolean }).compacted);

  /**
   * 判断消息是否有可继续扩展的证据
   * fixed scope (custom_docs) 下隐藏"继续查找"：固定文档问答没有"继续检索范围"的语义
   */
  function hasEvidenceForContinuation(message: ChatMessage): boolean {
    if (message.role !== "assistant") return false;

    const precedingUser = findPrecedingUserMessage(message.id);
    const effectiveScopeMode = precedingUser?.requestContext?.effectiveScopeMode;
    if (effectiveScopeMode === "custom_docs") {
      return false;
    }

    const hasEvidence = (message.agentMemory?.evidenceDocIds?.length > 0) || (message.citedReferences?.length > 0);
    if (!hasEvidence) {
      return false;
    }
    return true;
  }

  let lastContinueSearchTraceMessageId: string | null = null;
  $: {
    const effectiveLastAssistant = lastMessage?.role === "assistant" ? lastMessage : null;
    if (effectiveLastAssistant && effectiveLastAssistant.id !== lastContinueSearchTraceMessageId) {
      const precedingUser = findPrecedingUserMessage(effectiveLastAssistant.id);
      const effectiveScopeMode = precedingUser?.requestContext?.effectiveScopeMode;
      const canContinue = hasEvidenceForContinuation(effectiveLastAssistant);
      if (effectiveScopeMode === "custom_docs" || !canContinue) {
        lastContinueSearchTraceMessageId = effectiveLastAssistant.id;
        pushAgentDebugEvent("CONTINUE_SEARCH_VISIBILITY_SAFE", {
          hasRequestContext: !!precedingUser?.requestContext,
          effectiveScopeMode: effectiveScopeMode ?? "unknown",
          canContinueSearch: canContinue,
          reasonCode: effectiveScopeMode === "custom_docs" ? "fixed_scope" : "no_evidence",
        }, "info");
      }
    }
  }

  function findPrecedingUserMessage(assistantMessageId: string): import("../../types/chat").UserChatMessage | null {
    const idx = messages.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i] as import("../../types/chat").UserChatMessage;
    }
    return null;
  }

  const dispatch = createEventDispatcher<{
    regenerate: void;
    retry: void;
    sendSuggestedQuestion: string;
    continueSearch: { assistantMessageId: string };
  }>();

  /**
   * 处理快捷建议问题点击
   */
  function handleSuggestedQuestion(question: string) {
    dispatch('sendSuggestedQuestion', question);
  }

  let scrollContainer: HTMLElement;
  
  // 记录最后一条消息的 id，用于判断是否是新增消息
  let lastMessageId: string | null = null;
  
  // 底部阈值：距离底部多少像素内视为"在底部附近"
  const BOTTOM_THRESHOLD = 80;

  /**
   * 检查当前是否在底部附近
   */
  function isNearBottom(): boolean {
    if (!scrollContainer) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    return distanceToBottom <= BOTTOM_THRESHOLD;
  }

  /**
   * 滚动到底部
   */
  function scrollToBottom() {
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  /**
   * 处理滚动事件
   * 用于追踪用户滚动位置（预留，当前主要依赖 isNearBottom 判断）
   */
  function handleScroll() {
    // 滚动时不需要特殊处理，自动滚动前会检查 isNearBottom
  }

  // 最后一条消息的内容（用于检测流式更新）
  let lastMessageContent: string = "";
  
  // 获取消息内容的辅助函数
  function getMessageContent(message: ChatMessage): string {
    return isTextChatMessage(message) ? message.content : "";
  }
  
  // 消息变化时：只在新增消息且用户在底部附近时才自动滚动
  $: if (messages.length > 0 && scrollContainer) {
    const currentLastMessage = messages[messages.length - 1];
    const isNewMessage = currentLastMessage.id !== lastMessageId;
    const currentContent = getMessageContent(currentLastMessage);
    const isContentUpdated = currentContent !== lastMessageContent;
    
    if (isNewMessage) {
      lastMessageId = currentLastMessage.id;
      lastMessageContent = currentContent;
      // 只有用户在底部附近时才自动滚动
      if (isNearBottom()) {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }
    } else if (isContentUpdated && currentLastMessage.role === "assistant") {
      // 流式输出：assistant 消息内容更新且在底部附近时跟随滚动
      lastMessageContent = currentContent;
      if (isNearBottom()) {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }
    }
  }
</script>

<div class="chat-message-list" bind:this={scrollContainer} on:scroll={handleScroll}>
  {#if messages.length === 0}
    <div class="empty-state">
      <div class="empty-icon"><SiyuanIcon name="iconFeedback" size={48} /></div>
      <div class="empty-title">{emptyTitle}</div>
      <div class="empty-desc">{emptyDescription}</div>
      <!-- 快捷建议问题 -->
      {#if suggestedQuestions.length > 0}
        <div class="suggested-questions">
          {#each suggestedQuestions as question}
            <button
              type="button"
              class="suggested-question-btn"
              on:click={() => handleSuggestedQuestion(question)}
              disabled={asking}
            >
              {question}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="messages">
      {#each messages as message, msgIdx (message.id)}
        {#if hasCompactedMessages && msgIdx === firstNonCompactedIndex && firstNonCompactedIndex > 0}
          <div class="compression-separator">
            <span class="compression-separator-text">较早上下文已压缩为摘要</span>
          </div>
        {/if}
        <!-- 消息项：传入消息数据和状态标识 -->
        <svelte:component
          this={ChatMessageItem}
          {message}
          isLastAssistant={message.id === lastAssistantMessageId}
          isLastError={message.id === lastErrorMessageId}
          {canRegenerate}
          {canRetry}
          {asking}
          {assistantActionAlignment}
          canContinueSearch={message.id === lastAssistantMessageId && !asking && hasEvidenceForContinuation(message)}
          on:regenerate={() => dispatch('regenerate')}
          on:retry={() => dispatch('retry')}
          on:continueSearch={(e) => dispatch('continueSearch', e.detail)}
        />
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .chat-message-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .empty-desc {
    font-size: 13px;
    opacity: 0.8;
  }

  /* 快捷建议问题样式 */
  .suggested-questions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
    max-width: 400px;
  }

  .suggested-question-btn {
    padding: 8px 16px;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-theme-surface-lighter);
    border-radius: 16px;
    cursor: pointer;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: var(--b3-theme-primary);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0;
  }

  .compression-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;

    &::before,
    &::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--b3-border-color);
    }
  }

  .compression-separator-text {
    font-size: 11px;
    color: var(--b3-theme-on-surface-light-3, #999);
    white-space: nowrap;
  }
</style>
