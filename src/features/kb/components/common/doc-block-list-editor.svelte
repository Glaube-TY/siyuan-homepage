<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import Sortable from "sortablejs";

  export let items: { id: string; text: string }[];
  export let loading: boolean;
  export let title: string;
  export let placeholder: string;
  export let emptyHint: string;
  export let dragHandleClass: string;
  export let sortableGhostClass: string;
  export let sortableChosenClass: string;
  export let sortableDragClass: string;
  export let dataIdAttr: string;

  export let onAdd: (text: string) => void | Promise<void>;
  export let onUpdate: (id: string, text: string) => void | Promise<void>;
  export let onDelete: (id: string) => void | Promise<void>;
  export let onMove: (oldIndex: number, newIndex: number) => void | Promise<void>;
  export let onRefresh: () => void | Promise<void>;

  let newText = "";
  let editingId: string | null = null;
  let editingText = "";
  let listEl: HTMLUListElement | null = null;
  let sortable: Sortable | null = null;

  onDestroy(() => destroySortable());

  function destroySortable() {
    if (sortable) {
      sortable.destroy();
      sortable = null;
    }
  }

  async function initSortable() {
    await tick();
    destroySortable();
    if (!listEl || items.length < 2) return;
    sortable = new Sortable(listEl, {
      animation: 150,
      ghostClass: sortableGhostClass,
      chosenClass: sortableChosenClass,
      dragClass: sortableDragClass,
      handle: `.${dragHandleClass}`,
      dataIdAttr,
      onEnd: handleSortableEnd,
    });
  }

  $: if (items) {
    initSortable();
  }

  async function handleSortableEnd(evt: Sortable.SortableEvent) {
    const oldIndex = evt.oldIndex;
    const newIndex = evt.newIndex;
    if (typeof oldIndex !== "number" || typeof newIndex !== "number" || oldIndex === newIndex) return;
    await onMove(oldIndex, newIndex);
  }

  function startEdit(item: { id: string; text: string }) {
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
    await onUpdate(editingId, text);
    editingId = null;
    editingText = "";
  }

  async function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    await onAdd(text);
    newText = "";
  }

  async function handleDelete(itemId: string) {
    await onDelete(itemId);
  }
</script>

<div class="doc-block-list-editor">
  <div class="items-header">
    <h3 class="group-title">{title}</h3>
    <button type="button" class="b3-button b3-button--text" on:click={onRefresh}>刷新</button>
  </div>

  <div class="add-row">
    <textarea
      class="b3-text-field"
      rows="2"
      {placeholder}
      bind:value={newText}
    ></textarea>
    <button type="button" class="b3-button" disabled={!newText.trim()} on:click={handleAdd}>添加</button>
  </div>

  {#if loading}
    <div class="hint">加载中…</div>
  {:else if items.length === 0}
    <div class="hint">{emptyHint}</div>
  {:else}
    <ul class="items-list" bind:this={listEl}>
      {#each items as item (item.id)}
        <li class="item-row" data-id={item.id}>
          <span class="drag-handle {dragHandleClass}" title="拖动排序">⋮⋮</span>
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
</div>

<style lang="scss">
  .doc-block-list-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

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

  .drag-handle {
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

  .hint {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    opacity: 0.7;
  }

  .doc-block-list-editor :global(.b3-button) {
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

  .doc-block-list-editor :global(.b3-button--text) {
    border: none;
    background: transparent;
    padding: 4px 8px;
    font-size: 12px;

    &:hover:not(:disabled) {
      background: var(--b3-theme-background-light);
    }
  }

  .doc-block-list-editor :global(.b3-text-field) {
    width: 240px;
  }
</style>
