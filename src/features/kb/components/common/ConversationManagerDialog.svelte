<script lang="ts">
  import { kbSessionStore } from "../../stores/kb-session-store";
  import ConversationSidebar from "./conversation-sidebar.svelte";
  import type { ExtendedKbSessionState } from "../../types/session";
  import { shouldCloseManagerAfterAction } from "./conversation-manager";

  export let onRequestClose: () => void = () => {};

  // 直接订阅全局 kbSessionStore，保持实时数据：
  // 重命名/删除/新建/其他面板变更都能立即反映，回答生成中 asking 实时驱动禁用状态。
  $: conversations = ($kbSessionStore as ExtendedKbSessionState).conversations ?? [];
  $: activeConversationId = ($kbSessionStore as ExtendedKbSessionState).activeConversationId ?? "";
  $: asking = $kbSessionStore.asking;

  // 新建成功后关闭弹窗，返回 Dock 主聊天区域立即开始新对话。
  function handleCreate() {
    kbSessionStore.createConversation();
    if (shouldCloseManagerAfterAction("create")) {
      onRequestClose();
    }
  }

  // 切换会话后关闭弹窗；点击当前 active 会话只需关闭弹窗返回聊天。
  function handleSwitch(e: CustomEvent<string>) {
    const id = e.detail;
    if (id === activeConversationId) {
      onRequestClose();
      return;
    }
    kbSessionStore.switchConversation(id);
    if (shouldCloseManagerAfterAction("switch")) {
      onRequestClose();
    }
  }

  // 重命名/删除后保持弹窗打开，列表实时更新。
  function handleRename(e: CustomEvent<{ id: string; title: string }>) {
    const { id, title } = e.detail;
    kbSessionStore.renameConversation(id, title);
  }

  function handleDelete(e: CustomEvent<string>) {
    void kbSessionStore.deleteConversation(e.detail);
  }
</script>

<ConversationSidebar
  {conversations}
  {activeConversationId}
  open={true}
  disabled={asking}
  presentation="dialog"
  on:create={handleCreate}
  on:switch={handleSwitch}
  on:rename={handleRename}
  on:delete={handleDelete}
/>

<style lang="scss">
  // 只做弹窗宿主必要的样式适配，不覆盖思源 Dialog 全局样式。
  :global(.kb-conversation-manager-dialog-host .dialog-content) {
    padding: 0;
    overflow: hidden;
  }

  :global(.kb-conversation-manager-dialog-host .b3-dialog__container) {
    overflow: hidden;
  }
</style>
