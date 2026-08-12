<script lang="ts">
  import { onMount } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
  import {
    GLOBAL_MEMORY_TYPES,
    deleteGlobalMemory,
    getGlobalMemoryProfile,
    listGlobalMemories,
    updateGlobalMemory,
    updateGlobalMemoryProfile,
    type GlobalMemoryIndexEntry,
    type GlobalMemoryProfile,
    type GlobalMemoryType,
  } from "@/features/kb/services/agent-workbench/memory/global-memory-store";

  const TYPE_LABELS: Record<GlobalMemoryType, string> = {
    identity: "身份", preference: "偏好", goal: "目标", constraint: "约束",
    project: "项目", relationship: "关系", decision: "决定", experience: "经历",
  };

  let profile = $state<GlobalMemoryProfile>({ schemaVersion: 1, enabled: true, autoLearn: true, updatedAt: 0 });
  let items = $state<GlobalMemoryIndexEntry[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let query = $state("");
  let type = $state<GlobalMemoryType | "all">("all");
  let editingId = $state("");
  let editingContent = $state("");

  const visibleItems = $derived(items.filter((item) =>
    (type === "all" || item.type === type)
    && (!query.trim() || item.content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
  ));
  const pinnedCount = $derived(items.filter((item) => item.pinned).length);

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp);
  }

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    try {
      [profile, items] = await Promise.all([getGlobalMemoryProfile(), listGlobalMemories()]);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function changeProfile(patch: Partial<Pick<GlobalMemoryProfile, "enabled" | "autoLearn">>): Promise<void> {
    saving = true;
    error = "";
    try {
      profile = await updateGlobalMemoryProfile(patch);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving = false;
    }
  }

  async function togglePin(item: GlobalMemoryIndexEntry): Promise<void> {
    try {
      await updateGlobalMemory(item.id, { pinned: !item.pinned });
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function saveEdit(item: GlobalMemoryIndexEntry): Promise<void> {
    const content = editingContent.trim();
    if (!content) return;
    try {
      await updateGlobalMemory(item.id, { content });
      editingId = "";
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function remove(item: GlobalMemoryIndexEntry): Promise<void> {
    const confirmed = await confirmDialogBoolean({
      title: "删除全局记忆",
      content: safeConfirmContent(`确定永久删除这条记忆？\n\n${item.content}`),
    });
    if (!confirmed) return;
    try {
      await deleteGlobalMemory(item.id);
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  onMount(() => void refresh());
</script>

<section class="memory-center" aria-labelledby="memory-center-heading">
  <header class="manager-header">
    <div>
      <h3 id="memory-center-heading">记忆中枢</h3>
      <p>跨 Agent 入口共享长期记忆。AI 会从明确、稳定且长期有用的用户事实中形成、强化和修正记忆。</p>
    </div>
    <div class="manager-summary"><strong>{items.length}</strong><span>条记忆</span><strong>{pinnedCount}</strong><span>条置顶</span></div>
  </header>

  <div class="settings-card">
    <label><span><strong>使用记忆中枢</strong><small>关闭后，所有 Agent 入口都不再读取或写入长期记忆。</small></span><input type="checkbox" checked={profile.enabled} disabled={saving} onchange={(event) => void changeProfile({ enabled: event.currentTarget.checked })} /></label>
    <label class:disabled={!profile.enabled}><span><strong>允许 AI 自动学习</strong><small>AI 仅主动记录明确、稳定且今后有用的事实；关闭后，用户明确要求“记住”的内容仍可保存。</small></span><input type="checkbox" checked={profile.autoLearn} disabled={saving || !profile.enabled} onchange={(event) => void changeProfile({ autoLearn: event.currentTarget.checked })} /></label>
  </div>

  <div class="toolbar">
    <div class="search"><SiyuanIcon name="iconSearch" size={14} /><input aria-label="搜索记忆" placeholder="搜索记忆内容" bind:value={query} /></div>
    <select aria-label="按记忆类型筛选" bind:value={type}>
      <option value="all">全部类型</option>
      {#each GLOBAL_MEMORY_TYPES as itemType}<option value={itemType}>{TYPE_LABELS[itemType]}</option>{/each}
    </select>
    <button type="button" class="icon-action" title="刷新列表" aria-label="刷新记忆列表" disabled={loading} onclick={() => void refresh()}><SiyuanIcon name="iconRefresh" size={14} /></button>
  </div>

  {#if error}
    <div class="state error" role="alert">{error}</div>
  {:else if loading}
    <div class="state">正在读取记忆中枢…</div>
  {:else if items.length === 0}
    <div class="empty"><SiyuanIcon name="iconHistory" size={24} /><strong>还没有形成长期记忆</strong><span>继续使用 Agent，稳定而重要的用户事实会逐渐沉淀在这里。</span></div>
  {:else if visibleItems.length === 0}
    <div class="state">没有符合筛选条件的记忆。</div>
  {:else}
    <div class="memory-list">
      {#each visibleItems as item (item.id)}
        <article class="memory-row" class:pinned={item.pinned}>
          <div class="memory-main">
            <div class="memory-meta"><span class="type">{TYPE_LABELS[item.type]}</span><span>重要度 {item.importance}</span><span>可信度 {Math.round(item.confidence * 100)}%</span>{#if item.reinforcementCount > 1}<span>已强化 {item.reinforcementCount} 次</span>{/if}<span>{formatDate(item.updatedAt)}</span></div>
            {#if editingId === item.id}
              <textarea bind:value={editingContent} maxlength="1000" rows="3" aria-label="编辑记忆内容"></textarea>
              <div class="edit-actions"><button type="button" class="b3-button b3-button--small" onclick={() => void saveEdit(item)}>保存</button><button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => editingId = ""}>取消</button></div>
            {:else}<p>{item.content}</p>{/if}
          </div>
          {#if editingId !== item.id}<div class="actions"><button type="button" class="icon-action" class:active={item.pinned} title={item.pinned ? "取消置顶" : "置顶记忆"} aria-label={item.pinned ? "取消置顶记忆" : "置顶记忆"} onclick={() => void togglePin(item)}><SiyuanIcon name="iconPin" size={14} /></button><button type="button" class="icon-action" title="编辑记忆" aria-label="编辑记忆" onclick={() => { editingId = item.id; editingContent = item.content; }}><SiyuanIcon name="iconEdit" size={14} /></button><button type="button" class="icon-action danger" title="删除记忆" aria-label="删除记忆" onclick={() => void remove(item)}><SiyuanIcon name="iconTrashcan" size={14} /></button></div>{/if}
        </article>
      {/each}
    </div>
  {/if}

  <p class="storage-note">记忆以结构化 JSON 分文件保存在插件本地数据目录中。旧版记忆文档不会读取、迁移或删除。</p>
</section>

<style>
  .memory-center { display: grid; gap: 14px; }
  .manager-header { display: flex; justify-content: space-between; gap: 16px; padding: 16px; border: 1px solid var(--b3-border-color); border-radius: 10px; background: color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-surface)); }
  h3 { margin: 0 0 5px; font-size: 15px; } .manager-header p, .storage-note { margin: 0; color: var(--b3-theme-on-surface-light); font-size: 12px; line-height: 1.55; }
  .manager-summary { display: grid; grid-template-columns: auto auto; align-content: start; gap: 2px 8px; font-size: 11px; color: var(--b3-theme-on-surface-light); } .manager-summary strong { color: var(--b3-theme-on-surface); text-align: right; }
  .settings-card { border: 1px solid var(--b3-border-color); border-radius: 10px; overflow: hidden; background: var(--b3-theme-surface); } .settings-card label { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 15px; } .settings-card label + label { border-top: 1px solid var(--b3-border-color); } .settings-card label.disabled { opacity: .55; } .settings-card span { display: grid; gap: 3px; } .settings-card strong { font-size: 13px; } .settings-card small { color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .toolbar { display: flex; gap: 8px; } .search { flex: 1; display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 1px solid var(--b3-border-color); border-radius: 7px; background: var(--b3-theme-surface); } .search input { width: 100%; border: 0; outline: 0; background: transparent; color: inherit; } select, textarea { border: 1px solid var(--b3-border-color); border-radius: 7px; background: var(--b3-theme-surface); color: inherit; } select { padding: 0 9px; } textarea { width: 100%; box-sizing: border-box; padding: 8px; resize: vertical; }
  .memory-list { display: grid; gap: 8px; } .memory-row { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 9px; background: var(--b3-theme-surface); } .memory-row.pinned { border-color: color-mix(in srgb, var(--b3-theme-primary) 38%, var(--b3-border-color)); } .memory-main { flex: 1; min-width: 0; } .memory-meta { display: flex; flex-wrap: wrap; gap: 5px 10px; color: var(--b3-theme-on-surface-light); font-size: 10px; } .memory-meta .type { padding: 1px 6px; border-radius: 999px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent); } .memory-main p { margin: 8px 0 0; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
  .actions, .edit-actions { display: flex; gap: 5px; } .actions { align-items: flex-start; } .edit-actions { margin-top: 6px; justify-content: flex-end; } .icon-action { display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--b3-border-color); border-radius: 7px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface-light); cursor: pointer; } .icon-action:hover, .icon-action.active { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 9%, var(--b3-theme-surface)); } .icon-action.danger:hover { color: var(--b3-theme-error); }
  .state, .empty { padding: 24px; border: 1px dashed var(--b3-border-color); border-radius: 10px; text-align: center; color: var(--b3-theme-on-surface-light); } .state.error { color: var(--b3-theme-error); } .empty { display: grid; justify-items: center; gap: 6px; } .empty strong { color: var(--b3-theme-on-surface); } .storage-note { padding: 0 2px; }
  @media (max-width: 720px) { .manager-header { display: grid; } .toolbar { flex-wrap: wrap; } .search { flex-basis: 100%; height: 34px; } .memory-row { align-items: flex-start; } }
</style>
