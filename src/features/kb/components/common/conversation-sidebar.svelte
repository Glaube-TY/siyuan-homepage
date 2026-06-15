<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { KbConversationSession } from "../../types/chat";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

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
  function handleRename(id: string, currentTitle: string) {
    if (disabled) return;
    const newTitle = window.prompt("重命名会话", currentTitle);
    if (newTitle !== null && newTitle.trim() !== currentTitle) {
      dispatch("rename", { id, title: newTitle.trim() });
    }
  }

  // 处理删除
  function handleDelete(id: string, title: string) {
    if (disabled) return;
    // 至少保留一个会话，由 store 保证，这里只做确认
    if (conversations.length <= 1) {
      window.alert("至少保留一个会话");
      return;
    }

    const confirmed = window.confirm(`确定要删除会话"${title}"吗？`);
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

    <!-- 新建会话按钮 -->
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
    </div>

    <!-- 会话列表 -->
    <div class="conversation-list">
      {#if conversations.length === 0}
        <div class="empty-state">暂无会话</div>
      {:else}
        {#each conversations.slice().reverse() as conv (conv.id)}
          <div
            class="conversation-item"
            class:active={conv.id === activeConversationId}
            class:disabled
            on:click={() => handleSwitch(conv.id)}
            role="button"
            tabindex={disabled ? -1 : 0}
            aria-disabled={disabled}
            title={disabled ? "回答生成中，请稍后切换会话" : conv.title}
            on:keydown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSwitch(conv.id);
              }
            }}
          >
            <div class="conversation-info">
              <div class="conversation-title">{conv.title}</div>
              <div class="conversation-meta">
                <span class="message-count">{conv.messages.length} 条消息</span>
                <span class="update-time">{formatTime(conv.updatedAt)}</span>
              </div>
            </div>
            <div class="conversation-actions">
              <button
                type="button"
                class="action-btn rename-btn"
                on:click|stopPropagation={() => handleRename(conv.id, conv.title)}
                title={disabled ? "回答生成中，请稍后切换会话" : "重命名"}
                disabled={disabled}
              >
                <SiyuanIcon name="iconEdit" size={12} />
              </button>
              <button
                type="button"
                class="action-btn delete-btn"
                on:click|stopPropagation={() => handleDelete(conv.id, conv.title)}
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

<style>
  .conversation-sidebar {
    width: 260px;
    min-width: 260px;
    height: 100%;
    background: var(--b3-theme-background, #fff);
    border-right: 1px solid var(--b3-theme-surface-lighter, #e0e0e0);
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
    padding: 12px 16px;
    border-bottom: 1px solid var(--b3-theme-surface-lighter, #e0e0e0);
  }

  .sidebar-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-background, #333);
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
    color: var(--b3-theme-on-surface, #666);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: var(--b3-theme-surface-lighter, #e0e0e0);
  }

  .close-icon {
    font-size: 14px;
  }

  .sidebar-actions {
    padding: 12px 16px;
    border-bottom: 1px solid var(--b3-theme-surface-lighter, #e0e0e0);
  }

  .new-conversation-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--b3-theme-primary, #4285f4);
    border-radius: 6px;
    background: var(--b3-theme-primary, #4285f4);
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .new-conversation-btn:hover {
    opacity: 0.9;
  }

  .new-conversation-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    font-size: 16px;
    font-weight: 300;
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .empty-state {
    padding: 32px 16px;
    text-align: center;
    color: var(--b3-theme-on-surface-light, #999);
    font-size: 13px;
  }

  .conversation-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    margin-bottom: 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
    outline: none;
  }

  .conversation-item:hover {
    background: var(--b3-theme-surface, #f5f5f5);
  }

  .conversation-item.active {
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    border-left: 3px solid var(--b3-theme-primary, #4285f4);
  }

  .conversation-item:focus-visible {
    box-shadow: 0 0 0 2px var(--b3-theme-primary-light, rgba(66, 133, 244, 0.3));
  }

  .conversation-item.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .conversation-item.disabled:hover {
    background: transparent;
  }

  .conversation-info {
    flex: 1;
    min-width: 0;
    margin-right: 8px;
  }

  .conversation-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-background, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-item.active .conversation-title {
    color: var(--b3-theme-primary, #4285f4);
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--b3-theme-on-surface-light, #999);
  }

  .conversation-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
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
    color: var(--b3-theme-on-surface, #666);
    cursor: pointer;
    border-radius: 4px;
    font-size: 12px;
    transition: background 0.2s;
  }

  .action-btn:hover {
    background: var(--b3-theme-surface-lighter, #e0e0e0);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .delete-btn:hover {
    color: #d32f2f;
  }
</style>
