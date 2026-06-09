<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import Sortable from "sortablejs";
  import type { KbSettings } from "../../../types/settings";
  import { getKbPlugin } from "../../../services/settings/kb-settings-service";
  import { pushErrMsg } from "@/api";
  import { openTab, openMobileFileById } from "siyuan";
  import {
    validateGlobalMemoryDocId,
    listGlobalMemoryItems,
    createGlobalMemoryItem,
    updateGlobalMemoryItem,
    deleteGlobalMemoryItem,
    moveGlobalMemoryItem,
  } from "../../../services/agent-workbench/memory/global-memory-doc";
  import type { GlobalMemoryItem } from "../../../services/agent-workbench/memory/global-memory-types";

  export let settings: KbSettings;

  $: gm = settings?.globalMemory ?? { docId: "", enabled: false, maxChars: 8000, allowAiUpdate: false };

  let localDocId = settings?.globalMemory?.docId ?? "";
  let docIdValid: boolean | undefined = undefined;
  let validating = false;

  // 段落记忆列表
  let items: GlobalMemoryItem[] = [];
  let loadingItems = false;
  let newText = "";
  let editingId: string | null = null;
  let editingText = "";

  // sortable
  let listEl: HTMLUListElement | null = null;
  let memorySortable: Sortable | null = null;

  onMount(async () => {
    if (gm.docId) {
      await runValidate(gm.docId);
    } else {
      docIdValid = false;
      if (gm.enabled) {
        updateGm({ enabled: false });
      }
    }
  });

  onDestroy(() => {
    destroyMemorySortable();
  });

  function updateGm(partial: Partial<typeof gm>) {
    settings = {
      ...settings,
      globalMemory: { ...gm, ...partial },
    };
  }

  async function runValidate(docId: string) {
    validating = true;
    try {
      const result = await validateGlobalMemoryDocId(docId);
      docIdValid = result.valid;
      if (!result.valid && gm.enabled) {
        updateGm({ enabled: false });
      }
      if (result.valid) {
        await loadItems(docId);
      }
    } finally {
      validating = false;
    }
  }

  function handleDocIdInput(value: string) {
    localDocId = value;
  }

  async function handleDocIdBlur() {
    const trimmed = localDocId.trim();
    if (trimmed !== gm.docId) {
      updateGm({ docId: trimmed });
    }
    items = [];
    await runValidate(trimmed);
  }

  function handleOpenDoc() {
    const docId = gm.docId;
    if (!docId) return;
    const plugin = getKbPlugin();
    if (!plugin) {
      pushErrMsg("插件实例未初始化", 3000);
      return;
    }
    if (plugin.isMobile) {
      openMobileFileById(plugin.app, docId);
    } else {
      openTab({ app: plugin.app, doc: { id: docId } });
    }
  }

  // ===== 段落记忆 CRUD =====
  async function loadItems(docId: string) {
    loadingItems = true;
    destroyMemorySortable();
    try {
      items = await listGlobalMemoryItems(docId);
    } finally {
      loadingItems = false;
    }
    await tick();
    await initMemorySortable();
  }

  async function handleAdd() {
    const text = newText.trim();
    if (!text || !gm.docId || !docIdValid) return;
    const id = await createGlobalMemoryItem(gm.docId, text);
    if (id) {
      newText = "";
      await loadItems(gm.docId);
    } else {
      pushErrMsg("添加失败", 3000);
    }
  }

  function startEdit(item: GlobalMemoryItem) {
    editingId = item.id;
    editingText = item.text;
  }

  function cancelEdit() {
    editingId = null;
    editingText = "";
  }

  async function saveEdit() {
    const text = editingText.trim();
    if (!text || !editingId) return;
    const ok = await updateGlobalMemoryItem(editingId, text);
    if (ok) {
      editingId = null;
      editingText = "";
      if (gm.docId) await loadItems(gm.docId);
    } else {
      pushErrMsg("保存失败", 3000);
    }
  }

  async function handleDelete(itemId: string) {
    if (!confirm("确定删除这条记忆？")) return;
    const ok = await deleteGlobalMemoryItem(itemId);
    if (ok) {
      if (gm.docId) await loadItems(gm.docId);
    } else {
      pushErrMsg("删除失败", 3000);
    }
  }

  async function handleRefresh() {
    if (gm.docId && docIdValid) {
      await loadItems(gm.docId);
    }
  }

  // ===== sortable 排序 =====
  function destroyMemorySortable() {
    if (memorySortable) {
      memorySortable.destroy();
      memorySortable = null;
    }
  }

  async function initMemorySortable() {
    await tick();
    destroyMemorySortable();
    if (!listEl || docIdValid !== true || items.length < 2) return;

    memorySortable = new Sortable(listEl, {
      animation: 150,
      ghostClass: "memory-sortable-ghost",
      chosenClass: "memory-sortable-chosen",
      dragClass: "memory-sortable-drag",
      handle: ".memory-drag-handle",
      dataIdAttr: "data-memory-id",
      onEnd: handleSortableEnd,
    });
  }

  async function handleSortableEnd(evt: Sortable.SortableEvent) {
    const oldIndex = evt.oldIndex;
    const newIndex = evt.newIndex;
    if (typeof oldIndex !== "number" || typeof newIndex !== "number" || oldIndex === newIndex) return;

    const before = [...items];
    const moving = before[oldIndex];
    if (!moving) return;

    const without = before.filter((_, i) => i !== oldIndex);
    const next = [...without];
    next.splice(newIndex, 0, moving);

    if (next.every((it, idx) => it.id === before[idx]?.id)) return;

    items = next;

    let position: "top" | "bottom" | "before";
    let targetId: string | undefined;

    if (newIndex <= 0) {
      position = "top";
    } else if (newIndex >= without.length) {
      position = "bottom";
    } else {
      position = "before";
      targetId = without[newIndex].id;
    }

    const ok = await moveGlobalMemoryItem(gm.docId, moving.id, position, targetId);
    if (ok) {
      await loadItems(gm.docId);
    } else {
      pushErrMsg("排序失败", 3000);
      items = before;
      await tick();
      if (memorySortable) {
        memorySortable.sort(before.map((i) => i.id));
      }
      await loadItems(gm.docId);
    }
  }
</script>

<div class="memory-settings-tab">
  <section class="settings-group">
    <h3 class="group-title">全局记忆</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">记忆文档 ID</div>
        <div class="setting-desc">
          思源笔记文档 ID。AI 将读取该文档内容作为全局记忆。
        </div>
      </div>
      <div class="setting-control">
        <input
          type="text"
          class="b3-text-field fn__block"
          placeholder="请输入文档 ID"
          value={localDocId}
          on:input={(e) => handleDocIdInput(e.currentTarget.value)}
          on:blur={handleDocIdBlur}
        />
        {#if validating}
          <span class="hint">验证中…</span>
        {:else if docIdValid === false}
          <span class="hint hint--error">请填写有效的文档 ID</span>
        {/if}
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">开启全局记忆</div>
        <div class="setting-desc">启用后，AI 每轮对话都会读取指定思源文档中的长期偏好与约束。</div>
      </div>
      <div class="setting-control setting-control--switch">
        <input
          type="checkbox"
          class="b3-switch fn__flex-center"
          checked={gm.enabled}
          disabled={!docIdValid}
          on:change={(e) => updateGm({ enabled: e.currentTarget.checked })}
        />
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">操作</div>
      </div>
      <div class="setting-control">
        <button
          type="button"
          class="b3-button b3-button--outline"
          disabled={!gm.docId || docIdValid !== true}
          on:click={handleOpenDoc}
        >
          打开记忆文档
        </button>
      </div>
    </div>
  </section>

  {#if docIdValid === true}
    <section class="settings-group">
      <div class="items-header">
        <h3 class="group-title">记忆内容</h3>
        <button type="button" class="b3-button b3-button--text" on:click={handleRefresh}>刷新</button>
      </div>

      <div class="add-row">
        <textarea
          class="b3-text-field"
          rows="2"
          placeholder="输入新记忆…"
          bind:value={newText}
        ></textarea>
        <button type="button" class="b3-button" disabled={!newText.trim()} on:click={handleAdd}>添加</button>
      </div>

      {#if loadingItems}
        <div class="hint">加载中…</div>
      {:else if items.length === 0}
        <div class="hint">暂无记忆，上方输入后添加</div>
      {:else}
        <ul class="items-list" bind:this={listEl}>
          {#each items as item (item.id)}
            <li class="item-row" data-memory-id={item.id}>
              <span class="memory-drag-handle" title="拖动排序">⋮⋮</span>
              {#if editingId === item.id}
                <div class="item-edit">
                  <textarea class="b3-text-field" rows="2" bind:value={editingText}></textarea>
                  <div class="item-actions">
                    <button type="button" class="b3-button b3-button--text" on:click={saveEdit}>保存</button>
                    <button type="button" class="b3-button b3-button--text" on:click={cancelEdit}>取消</button>
                  </div>
                </div>
              {:else}
                <span class="item-text">{item.text}</span>
                <div class="item-actions">
                  <button type="button" class="b3-button b3-button--text" on:click={() => startEdit(item)}>编辑</button>
                  <button type="button" class="b3-button b3-button--text" on:click={() => handleDelete(item.id)}>删除</button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if docIdValid === false}
    <div class="hint hint--error hint--center">填写有效文档 ID 后显示记忆内容</div>
  {/if}
</div>

<style lang="scss">
  .memory-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-title {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
  }

  .setting-copy {
    min-width: 0;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    line-height: 1.5;
  }

  .setting-desc {
    margin-top: 4px;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

  .setting-control {
    flex-shrink: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .setting-control--switch {
    flex-direction: row;
    align-items: center;
  }

  .hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .hint--error {
    color: var(--b3-theme-error);
    opacity: 1;
  }

  .hint--center {
    text-align: center;
    padding: 16px 0;
  }

  .b3-button {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .b3-button--text {
    border: none;
    background: transparent;
    padding: 4px 8px;
    font-size: 12px;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }
  }

  .b3-text-field {
    width: 240px;
  }

  // 记忆内容区域
  .items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .group-title {
      margin: 0;
      border: none;
      padding: 0;
    }
  }

  .add-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;

    textarea {
      flex: 1;
      min-width: 0;
      resize: vertical;
    }
  }

  .items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    transition: background 0.12s ease, opacity 0.12s ease;

    &:hover {
      background: var(--b3-theme-background-light);
    }
  }

  .memory-drag-handle {
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--b3-theme-on-surface);
    opacity: 0.55;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 1;

    &:hover {
      opacity: 0.9;
    }
  }

  :global(.memory-sortable-ghost) {
    opacity: 0.35;
    background: var(--b3-theme-primary-light, rgba(66, 133, 244, 0.08));
  }

  :global(.memory-sortable-chosen .memory-drag-handle) {
    cursor: grabbing;
  }

  .item-text {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }

  .item-edit {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    textarea {
      width: 100%;
      resize: vertical;
    }
  }

  .item-actions {
    flex-shrink: 0;
    display: flex;
    gap: 4px;
  }
</style>
