<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import ChatMessageItem from "./chat-message-item.svelte";
  import { kbSessionStore } from "../../stores/kb-session-store";
  import type { ChatMessage } from "../../types/chat";
  import { isTextChatMessage } from "../../types/chat";
  import type { KbAssistantActionAlignment } from "../../types/settings";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

  export let messages: ChatMessage[] = [];
  export let assistantActionAlignment: KbAssistantActionAlignment = "left";
  export let workbenchDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";
  export let reasoningDisplayMode: "collapsed" | "expanded" | "auto" = "collapsed";

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

  // 找到 compacted → 非 compacted 的边界：最后一个 compacted 消息之后的第一个非 compacted 消息索引
  // 分隔线应该显示在这个位置之前
  $: compressionBoundaryIndex = (() => {
    let lastCompactedIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if ((messages[i] as { compacted?: boolean }).compacted) {
        lastCompactedIdx = i;
        break;
      }
    }
    if (lastCompactedIdx < 0) return -1;
    // 找到 lastCompactedIdx 之后第一个非 compacted 消息
    for (let i = lastCompactedIdx + 1; i < messages.length; i++) {
      if (!(messages[i] as { compacted?: boolean }).compacted) {
        return i;
      }
    }
    // 所有 compacted 消息之后没有非 compacted 消息，不显示分隔线
    return -1;
  })();

  const dispatch = createEventDispatcher<{
    regenerate: void;
    retry: void;
    quoteSelection: { text: string };
    editUserMessage: { text: string };
    deleteTurn: { assistantMessageId: string };
    sendSuggestedQuestion: string;
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
    if (scrollNavRaf) cancelAnimationFrame(scrollNavRaf);
    scrollNavRaf = requestAnimationFrame(() => {
      updateActiveTurnFromScroll();
      scrollNavRaf = undefined;
    });
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

  // ===== 问答导航 =====
  interface TurnNavItem {
    messageId: string;
    index: number;
    preview: string;
  }

  // 基于 messages 派生问答导航项（只取 user 消息，不写入 store）
  $: turnNavItems = ((): TurnNavItem[] => {
    let idx = 0;
    return messages
      .filter((m) => m.role === "user" && m.content?.trim())
      .map((m) => {
        idx += 1;
        const raw = m.content.trim().replace(/\s+/g, " ");
        const preview = raw.length > 50 ? raw.slice(0, 50) + "…" : raw;
        return { messageId: m.id, index: idx, preview };
      });
  })();

  const MAX_NAV_ITEMS = 10;

  // 消息变化后：若 active 不在当前列表中，默认设为最后一轮
  $: if (turnNavItems.length > 0) {
    const exists = turnNavItems.some((t) => t.messageId === activeTurnMessageId);
    if (!exists) {
      activeTurnMessageId = turnNavItems[turnNavItems.length - 1]?.messageId;
    }
  }

  // 当前视口正在查看的用户问题轮次
  let activeTurnMessageId: string | undefined;
  let scrollNavRaf: number | undefined;

  // 根据 activeTurnMessageId 截取附近最多 10 个导航项
  $: visibleTurnNavItems = ((): TurnNavItem[] => {
    if (turnNavItems.length <= MAX_NAV_ITEMS) return turnNavItems;
    const activeIndex = turnNavItems.findIndex(
      (t) => t.messageId === activeTurnMessageId
    );
    const center = activeIndex >= 0 ? activeIndex : turnNavItems.length - 1;
    const half = Math.floor(MAX_NAV_ITEMS / 2);
    let start = center - half;
    if (start < 0) start = 0;
    if (start > turnNavItems.length - MAX_NAV_ITEMS) {
      start = turnNavItems.length - MAX_NAV_ITEMS;
    }
    return turnNavItems.slice(start, start + MAX_NAV_ITEMS);
  })();

  // 当前高亮的消息 id（点击跳转后的短暂高亮）
  let highlightedUserMessageId: string | null = null;
  let highlightedAssistantMessageId: string | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 根据当前滚动位置计算正在查看的用户问题轮次
   */
  function updateActiveTurnFromScroll() {
    if (!scrollContainer || turnNavItems.length === 0) return;
    const viewportCenter =
      scrollContainer.scrollTop + scrollContainer.clientHeight / 2;

    let bestId: string | undefined = turnNavItems[0]?.messageId;
    for (const item of turnNavItems) {
      const anchor = scrollContainer.querySelector(
        `.message-anchor[data-message-id="${item.messageId}"]`
      ) as HTMLElement | null;
      if (!anchor) continue;
      if (anchor.offsetTop <= viewportCenter) {
        bestId = item.messageId;
      } else {
        break;
      }
    }
    activeTurnMessageId = bestId;
  }

  /**
   * 滚动到指定消息并短暂高亮该轮问答
   */
  function scrollToMessage(messageId: string) {
    activeTurnMessageId = messageId;
    const target = scrollContainer?.querySelector(
      `.message-anchor[data-message-id="${messageId}"]`
    ) as HTMLElement | null;
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    // 高亮 user 消息
    highlightedUserMessageId = messageId;

    // 找到该 user 消息后面的第一条 assistant 消息，一并高亮
    const userIndex = messages.findIndex((m) => m.id === messageId);
    if (userIndex >= 0) {
      for (let i = userIndex + 1; i < messages.length; i++) {
        if (messages[i].role === "assistant") {
          highlightedAssistantMessageId = messages[i].id;
          break;
        }
      }
    }

    // 约 1600ms 后清除高亮
    if (highlightTimer) {
      clearTimeout(highlightTimer);
    }
    highlightTimer = setTimeout(() => {
      highlightedUserMessageId = null;
      highlightedAssistantMessageId = null;
    }, 1600);
  }

  onDestroy(() => {
    if (highlightTimer) {
      clearTimeout(highlightTimer);
    }
    if (scrollNavRaf) {
      cancelAnimationFrame(scrollNavRaf);
    }
  });
</script>

<div class="chat-message-list">
  <div class="chat-scroll-viewport" bind:this={scrollContainer} on:scroll={handleScroll}>
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
          {#if compressionBoundaryIndex >= 0 && msgIdx === compressionBoundaryIndex}
            <div class="compression-separator">
              <span class="compression-separator-text">以上对话已压缩，仅保留阶段摘要用于上下文</span>
            </div>
          {/if}
          <!-- 消息项：传入消息数据和状态标识 -->
          <div
            class="message-anchor"
            data-message-id={message.id}
            class:is-highlighted={message.id === highlightedUserMessageId || message.id === highlightedAssistantMessageId}
          >
            <svelte:component
              this={ChatMessageItem}
              {message}
              isLastAssistant={message.id === lastAssistantMessageId}
              isLastError={message.id === lastErrorMessageId}
              {canRegenerate}
              {canRetry}
              {asking}
              {assistantActionAlignment}
              {workbenchDisplayMode}
              {reasoningDisplayMode}
              on:regenerate={() => dispatch('regenerate')}
              on:retry={() => dispatch('retry')}
              on:quoteSelection={(e) => dispatch('quoteSelection', e.detail)}
              on:editUserMessage={(e) => dispatch('editUserMessage', e.detail)}
              on:deleteTurn={(e) => dispatch('deleteTurn', e.detail)}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if messages.length > 0 && visibleTurnNavItems.length >= 2}
    <div class="conversation-jump-rail">
      {#each visibleTurnNavItems as item (item.messageId)}
        <button
          type="button"
          class="jump-item"
          class:active={item.messageId === activeTurnMessageId || item.messageId === highlightedUserMessageId}
          title={`第 ${item.index} 轮：${item.preview}`}
          on:click={() => scrollToMessage(item.messageId)}
        >
          <span class="jump-dot"></span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  @use '../panels/_kb-tokens' as *;

  .chat-message-list {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    padding: 0;
  }

  .chat-scroll-viewport {
    height: 100%;
    overflow-y: auto;
    padding: $kb-space-md;
    box-sizing: border-box;

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
    margin-bottom: $kb-space-lg;
    opacity: 0.6;
  }

  .empty-title {
    font-size: $kb-fs-xxl;
    font-weight: 500;
    margin-bottom: $kb-space-sm;
  }

  .empty-desc {
    font-size: $kb-fs-md;
    opacity: 0.8;
  }

  .suggested-questions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: $kb-space-sm;
    margin-top: $kb-space-2xl;
    max-width: 400px;
  }

  .suggested-question-btn {
    padding: $kb-space-sm $kb-space-lg;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-theme-surface-lighter);
    border-radius: $kb-radius-xl;
    cursor: pointer;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-surface);
    transition:
      background $kb-dur-fast $kb-ease-out,
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
      border-color: var(--b3-theme-primary);
      box-shadow: $kb-shadow-card;
      transform: translateY(-1px);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.97);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: $kb-space-lg;
    padding: $kb-space-sm 10px $kb-space-sm 0;
    position: relative;
  }

  .compression-separator {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    padding: $kb-space-xs 0;

    &::before,
    &::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--b3-border-color);
    }
  }

  .compression-separator-text {
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface-light);
    white-space: nowrap;
  }

  .message-anchor {
    transition: box-shadow $kb-dur-normal $kb-ease-out;
    border-radius: $kb-radius-lg;

    &.is-highlighted {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent), 0 0 12px color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }
  }

  .conversation-jump-rail {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    z-index: 5;
    width: 20px;
  }

  .jump-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    transition: all $kb-dur-normal $kb-ease-out;

    &:hover {
      width: 22px;
      height: 22px;
      margin: 4px 0;
    }

    &.active .jump-dot {
      background: var(--b3-theme-primary);
    }
  }

  .jump-dot {
    display: block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--b3-theme-on-surface-light);
    transition: all $kb-dur-normal $kb-ease-out;
    box-shadow: $kb-shadow-card;

    .jump-item:hover & {
      width: 10px;
      height: 10px;
      background: var(--b3-theme-primary);
    }
  }

  @media (max-width: 480px) {
    .conversation-jump-rail {
      display: none;
    }
  }
</style>
