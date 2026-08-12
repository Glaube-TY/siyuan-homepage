<script lang="ts">
  import { onMount } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
  import { openTemporaryWorkbenchDialog } from "@/features/kb/components/common/open-temporary-workbench-dialog";
  import {
    deleteTemporaryWorkbench,
    listTemporaryWorkbenches,
    type TemporaryWorkbenchIndexEntry,
  } from "@/features/kb/services/agent-workbench/tools/homepage/temporary-workbench-store";

  let items = $state<TemporaryWorkbenchIndexEntry[]>([]);
  let loading = $state(true);
  let error = $state("");

  const totalBytes = $derived(items.reduce((sum, item) => sum + item.bytes, 0));

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(timestamp);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  }

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    try {
      items = await listTemporaryWorkbenches();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function remove(item: TemporaryWorkbenchIndexEntry): Promise<void> {
    const usageText = item.usages.length > 0
      ? `当前仍有 ${item.usages.length} 个位置引用它。删除后这些入口将显示为不可用。`
      : "当前没有位置引用它。";
    const confirmed = await confirmDialogBoolean({
      title: "删除临时工作台",
      content: safeConfirmContent(`确定删除“${item.title}”？${usageText}`),
    });
    if (!confirmed) return;
    try {
      await deleteTemporaryWorkbench(item.id);
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  onMount(() => void refresh());
</script>

<section class="workbench-manager" aria-labelledby="temporary-workbench-heading">
  <header class="manager-header">
    <div>
      <h3 id="temporary-workbench-heading">临时工作台</h3>
      <p>统一管理所有 Agent 入口生成的工作台。聊天和主页只保存引用，完整内容由这里维护。</p>
    </div>
    <div class="manager-tools">
      <div class="manager-summary" aria-label="存储概览">
        <strong>{items.length}</strong><span>个工作台</span>
        <strong>{formatBytes(totalBytes)}</strong><span>占用空间</span>
      </div>
      <button type="button" class="icon-action" title="刷新列表" aria-label="刷新临时工作台列表" disabled={loading} onclick={() => void refresh()}>
        <SiyuanIcon name="iconRefresh" size={14} />
      </button>
    </div>
  </header>

  {#if error}
    <div class="manager-state error" role="alert">{error}</div>
  {:else if loading}
    <div class="manager-state">正在读取临时工作台…</div>
  {:else if items.length === 0}
    <div class="manager-empty">
      <SiyuanIcon name="iconNotebrain" size={24} />
      <strong>还没有临时工作台</strong>
      <span>让 Agent 生成工作台后，会自动出现在这里。</span>
    </div>
  {:else}
    <div class="workbench-list">
      {#each items as item (item.id)}
        <article class="workbench-row">
          <div class="workbench-icon"><SiyuanIcon name="iconNotebrain" size={17} /></div>
          <div class="workbench-main">
            <strong>{item.title}</strong>
            <div class="workbench-meta">
              <span>{formatDate(item.createdAt)}</span>
              <span>来源：{item.source.label}</span>
              <span>{formatBytes(item.bytes)}</span>
            </div>
            <div class="workbench-usage">
              {#if item.usages.length > 0}
                正被 {item.usages.length} 个位置使用
                {#each item.usages.slice(0, 2) as usage}
                  <span class="usage-chip">{usage.label}</span>
                {/each}
              {:else}
                <span class="unused">当前未被引用，可安全清理</span>
              {/if}
            </div>
          </div>
          <div class="workbench-actions">
            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => void openTemporaryWorkbenchDialog(item.id)}>打开</button>
            <button type="button" class="icon-action danger" title="删除工作台" aria-label={`删除工作台：${item.title}`} onclick={() => void remove(item)}>
              <SiyuanIcon name="iconTrashcan" size={14} />
            </button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .workbench-manager { display: grid; gap: 14px; }
  .manager-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 16px; border: 1px solid var(--b3-border-color); border-radius: 10px;
    background: color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-surface));
  }
  .manager-header h3 { margin: 0 0 5px; font-size: 15px; color: var(--b3-theme-on-surface); }
  .manager-header p { max-width: 560px; margin: 0; color: var(--b3-theme-on-surface-light); font-size: 12px; line-height: 1.55; }
  .manager-summary { display: grid; grid-template-columns: auto auto; flex: 0 0 auto; gap: 2px 8px; font-size: 11px; color: var(--b3-theme-on-surface-light); }
  .manager-tools { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; }
  .manager-summary strong { color: var(--b3-theme-on-surface); text-align: right; }
  .manager-state, .manager-empty { padding: 24px; border: 1px dashed var(--b3-border-color); border-radius: 10px; text-align: center; color: var(--b3-theme-on-surface-light); }
  .manager-state.error { color: var(--b3-theme-error); }
  .manager-empty { display: grid; justify-items: center; gap: 6px; }
  .manager-empty strong { color: var(--b3-theme-on-surface); }
  .workbench-list { display: grid; gap: 8px; }
  .workbench-row { display: flex; align-items: center; gap: 11px; padding: 11px; border: 1px solid var(--b3-border-color); border-radius: 9px; background: var(--b3-theme-surface); }
  .workbench-icon { display: grid; flex: 0 0 34px; width: 34px; height: 34px; place-items: center; border-radius: 8px; background: var(--b3-theme-background-light); color: var(--b3-theme-primary); }
  .workbench-main { display: grid; flex: 1; min-width: 0; gap: 4px; }
  .workbench-main > strong { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .workbench-meta, .workbench-usage { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .usage-chip { padding: 1px 6px; border-radius: 999px; background: var(--b3-theme-background-light); color: var(--b3-theme-on-surface); }
  .unused { color: var(--b3-card-success-color, #2f7d4f); }
  .workbench-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
  .icon-action { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid var(--b3-border-color); border-radius: 7px; background: transparent; color: var(--b3-theme-on-surface-light); cursor: pointer; }
  .icon-action.danger:hover, .icon-action.danger:focus-visible { border-color: var(--b3-theme-error); color: var(--b3-theme-error); outline: none; }
  @media (max-width: 620px) {
    .manager-header { display: grid; }
    .manager-tools, .manager-summary { width: fit-content; }
    .workbench-row { align-items: flex-start; }
    .workbench-icon { display: none; }
    .workbench-actions { flex-direction: column; }
  }
</style>
