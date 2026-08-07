<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { showMessage } from "siyuan";
  import type { KbConversationSession } from "../../types/chat";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { inputDialogSync, confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
  import {
    searchConversations,
    splitHighlightSegments,
    type ConversationSearchResult,
  } from "./conversation-search";

  // Props
  export let conversations: KbConversationSession[] = [];
  export let activeConversationId: string = "";
  export let open: boolean = true;
  // 禁用状态（回答生成中）
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    create: void;
    switch: string;
    rename: { id: string; title: string };
    delete: string;
    close: void;
  }>();

  // 搜索状态（纯内存、只读，不持久化）
  let searchQuery = "";

  /** 列表项统一结构：非搜索时直接展示全部会话，搜索时展示结果 */
  type SidebarListItem = {
    conversation: KbConversationSession;
    matchSource: ConversationSearchResult["matchSource"];
    matchSnippet?: string;
    matchedUserMessageId?: string;
  };

  $: isSearching = searchQuery.trim().length > 0;
  // 只在 conversations 或 searchQuery 变化时重新计算结果
  $: searchResults = searchConversations(conversations, searchQuery);
  $: displayItems = buildDisplayItems(isSearching, searchResults, conversations);

  /** 列表项统一结构：非搜索时直接展示全部会话，搜索时展示结果 */
  function buildDisplayItems(
    searching: boolean,
    results: ConversationSearchResult[],
    all: KbConversationSession[],
  ): SidebarListItem[] {
    return searching
      ? results
      : all.map((conversation) => ({ conversation, matchSource: "title" as const }));
  }

  // 处理搜索框键盘事件（Escape 清空）
  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      searchQuery = "";
    }
  }

  // 清除搜索
  function clearSearch() {
    searchQuery = "";
  }

  // 格式化时间显示
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "昨天";
    }

    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  }

  // 处理新建会话
  function handleCreate() {
    if (disabled) return;
    dispatch("create");
  }

  // 处理切换会话
  function handleSwitch(id: string) {
    if (disabled) return;
    if (id !== activeConversationId) {
      dispatch("switch", id);
    }
  }

  // 处理重命名
  async function handleRename(id: string, currentTitle: string): Promise<void> {
    if (disabled) return;

    const newTitle = await inputDialogSync({
      title: "重命名会话",
      placeholder: "请输入新的会话名称",
      defaultText: currentTitle,
      width: "420px",
      height: "220px",
    });

    const nextTitle = newTitle?.trim();
    if (!nextTitle || nextTitle === currentTitle) return;

    dispatch("rename", { id, title: nextTitle });
  }

  // 处理删除
  async function handleDelete(id: string, title: string): Promise<void> {
    if (disabled) return;
    // 至少保留一个会话，由 store 保证，这里只做确认
    if (conversations.length <= 1) {
      showMessage("至少保留一个会话", 3000);
      return;
    }

    const confirmed = await confirmDialogBoolean({
      title: "删除会话",
      content: safeConfirmContent("确定要删除会话「", title, "」吗？"),
      width: "420px",
    });

    if (confirmed) {
      dispatch("delete", id);
    }
  }

  // 处理关闭侧边栏
  function handleClose() {
    dispatch("close");
  }
</script>

{#if open}
  <aside class="conversation-sidebar" class:disabled>
    <!-- 头部 -->
    <div class="sidebar-header">
      <h3 class="sidebar-title">会话历史</h3>
      <button type="button" class="close-btn" on:click={handleClose} title="关闭">
        <span class="close-icon"><SiyuanIcon name="iconClose" size={14} /></span>
      </button>
    </div>

    <!-- 新建会话按钮 + 搜索 -->
    <div class="sidebar-actions">
      <button
        type="button"
        class="new-conversation-btn"
        on:click={handleCreate}
        disabled={disabled}
        title={disabled ? "回答生成中，请稍后切换会话" : "新建会话"}
      >
        <span class="btn-icon"><SiyuanIcon name="iconAdd" size={14} /></span>
        <span>新建会话</span>
      </button>

      <!-- 历史会话搜索框（回答生成中也可操作，只读搜索） -->
      <div class="search-box">
        <span class="search-icon"><SiyuanIcon name="iconSearch" size={14} /></span>
        <input
          type="text"
          class="search-input"
          placeholder="搜索会话"
          bind:value={searchQuery}
          on:keydown={handleSearchKeydown}
        />
        {#if isSearching}
          <button
            type="button"
            class="search-clear-btn"
            on:click={clearSearch}
            title="清除搜索"
            aria-label="清除搜索"
          >
            <SiyuanIcon name="iconClose" size={12} />
          </button>
        {/if}
      </div>
      {#if isSearching}
        <div class="search-result-count">{searchResults.length} 个结果</div>
      {/if}
    </div>

    <!-- 会话列表 -->
    <div class="conversation-list">
      {#if conversations.length === 0}
        <div class="empty-state">暂无会话</div>
      {:else if isSearching && searchResults.length === 0}
        <div class="empty-state">未找到相关会话</div>
        <div class="empty-hint">请尝试其他关键词</div>
      {:else}
        {#each displayItems.slice().reverse() as item (item.conversation.id)}
          <div
            class="conversation-item"
            class:active={item.conversation.id === activeConversationId}
            class:disabled
            on:click={() => handleSwitch(item.conversation.id)}
            role="button"
            tabindex={disabled ? -1 : 0}
            aria-disabled={disabled}
            title={disabled ? "回答生成中，请稍后切换会话" : item.conversation.title}
            on:keydown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSwitch(item.conversation.id);
              }
            }}
          >
            <div class="conversation-info">
              <div class="conversation-title">
                {#if isSearching}
                  {#each splitHighlightSegments(item.conversation.title, searchQuery) as seg}
                    {#if seg.highlighted}
                      <mark class="search-highlight">{seg.text}</mark>
                    {:else}
                      {seg.text}
                    {/if}
                  {/each}
                {:else}
                  {item.conversation.title}
                {/if}
              </div>
              {#if isSearching && item.matchSource === "user_message" && item.matchSnippet}
                <div class="conversation-snippet">
                  {#each splitHighlightSegments(item.matchSnippet, searchQuery) as seg}
                    {#if seg.highlighted}
                      <mark class="search-highlight">{seg.text}</mark>
                    {:else}
                      {seg.text}
                    {/if}
                  {/each}
                </div>
              {/if}
              <div class="conversation-meta">
                <span class="message-count">{item.conversation.messages.length} 条消息</span>
                <span class="update-time">{formatTime(item.conversation.updatedAt)}</span>
              </div>
            </div>
            <div class="conversation-actions">
              <button
                type="button"
                class="action-btn rename-btn"
                on:click|stopPropagation={() => handleRename(item.conversation.id, item.conversation.title)}
                title={disabled ? "回答生成中，请稍后切换会话" : "重命名"}
                disabled={disabled}
              >
                <SiyuanIcon name="iconEdit" size={12} />
              </button>
              <button
                type="button"
                class="action-btn delete-btn"
                on:click|stopPropagation={() => handleDelete(item.conversation.id, item.conversation.title)}
                title={disabled ? "回答生成中，请稍后切换会话" : "删除"}
                disabled={disabled || conversations.length <= 1}
              >
                <SiyuanIcon name="iconTrashcan" size={12} />
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </aside>
{/if}

<style lang="scss">
  @use '../panels/_kb-tokens' as *;

  .conversation-sidebar {
    width: 260px;
    min-width: 260px;
    height: 100%;
    background: var(--b3-theme-background);
    border-right: 1px solid var(--b3-theme-surface-lighter);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .conversation-sidebar.disabled {
    opacity: 0.8;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $kb-space-md $kb-space-lg;
    border-bottom: 1px solid var(--b3-theme-surface-lighter);
  }

  .sidebar-title {
    margin: 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-background);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    border-radius: $kb-radius-md;
    transition:
      background $kb-dur-normal $kb-ease-out,
      color $kb-dur-fast $kb-ease-out;

    &:hover {
      background: var(--b3-theme-surface-lighter);
      color: var(--b3-theme-on-surface);
    }
  }

  .close-icon {
    font-size: $kb-fs-lg;
  }

  .sidebar-actions {
    padding: $kb-space-md $kb-space-lg;
    border-bottom: 1px solid var(--b3-theme-surface-lighter);
  }

  .new-conversation-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $kb-space-xs;
    width: 100%;
    padding: $kb-space-sm $kb-space-md;
    border: 1px solid var(--b3-theme-primary);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-primary);
    color: white;
    font-size: $kb-fs-md;
    cursor: pointer;
    transition:
      opacity $kb-dur-normal $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover:not(:disabled) {
      opacity: 0.9;
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

  .btn-icon {
    font-size: $kb-fs-lg;
    font-weight: 300;
  }

  // ---- 历史会话搜索 ----

  .search-box {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    margin-top: $kb-space-md;
    padding: 0 $kb-space-sm;
    height: 32px;
    background: var(--b3-theme-surface);
    border: 1px solid var(--b3-theme-surface-lighter);
    border-radius: $kb-radius-md;
    transition:
      border-color $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;

    &:focus-within {
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 15%, transparent);
    }
  }

  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--b3-theme-on-surface-light);
    font-size: $kb-fs-lg;
  }

  .search-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    font-size: $kb-fs-md;
    color: var(--b3-theme-on-background);

    &::placeholder {
      color: var(--b3-theme-on-surface-light);
    }
  }

  .search-clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--b3-theme-on-surface-light);
    cursor: pointer;
    border-radius: $kb-radius-sm;
    transition:
      background $kb-dur-fast $kb-ease-out,
      color $kb-dur-fast $kb-ease-out;

    &:hover {
      background: var(--b3-theme-surface-lighter);
      color: var(--b3-theme-on-surface);
    }
  }

  .search-result-count {
    margin-top: $kb-space-xs;
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface-light);
  }

  .search-highlight {
    background: color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
    color: var(--b3-theme-primary);
    border-radius: 2px;
    padding: 0 1px;
  }

  .conversation-snippet {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: $kb-space-xs;
    font-size: $kb-fs-xs;
    line-height: 1.5;
    color: var(--b3-theme-on-surface-light);
    word-break: break-all;
  }

  .empty-hint {
    padding: 0 $kb-space-lg $kb-space-lg;
    text-align: center;
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface-light);
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
    padding: $kb-space-sm;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--b3-theme-on-surface) 15%, transparent);
      border-radius: 2px;
      &:hover {
        background: color-mix(in srgb, var(--b3-theme-on-surface) 25%, transparent);
      }
    }
  }

  .empty-state {
    padding: $kb-space-3xl $kb-space-lg;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
    font-size: $kb-fs-md;
  }

  .conversation-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px $kb-space-md;
    margin-bottom: $kb-space-xs;
    border-radius: $kb-radius-md;
    cursor: pointer;
    transition:
      background $kb-dur-normal $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out;
    outline: none;
    box-shadow: $kb-shadow-none;

    &:hover {
      background: var(--b3-theme-surface);
    }

    &.active {
      background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
      border-left: 3px solid var(--b3-theme-primary);
      box-shadow: $kb-shadow-card;
    }

    &:focus-visible {
      box-shadow: 0 0 0 2px var(--b3-theme-primary-light, rgba(66, 133, 244, 0.3));
    }

    &.disabled {
      cursor: not-allowed;
      opacity: 0.6;
      &:hover {
        background: transparent;
      }
    }
  }

  .conversation-info {
    flex: 1;
    min-width: 0;
    margin-right: $kb-space-sm;
  }

  .conversation-title {
    font-size: $kb-fs-md;
    font-weight: 500;
    color: var(--b3-theme-on-background);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-item.active .conversation-title {
    color: var(--b3-theme-primary);
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    gap: $kb-space-sm;
    margin-top: $kb-space-xs;
    font-size: $kb-fs-xs;
    color: var(--b3-theme-on-surface-light);
  }

  .conversation-actions {
    display: flex;
    align-items: center;
    gap: $kb-space-xs;
    opacity: 0;
    transition: opacity $kb-dur-normal $kb-ease-out;
  }

  .conversation-item:hover .conversation-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    border-radius: $kb-radius-md;
    font-size: $kb-fs-sm;
    transition:
      background $kb-dur-normal $kb-ease-out,
      color $kb-dur-fast $kb-ease-out;

    &:hover {
      background: var(--b3-theme-surface-lighter);
    }

    &:active {
      transform: scale(0.92);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }

  .delete-btn:hover {
    color: #d32f2f;
  }
</style>
