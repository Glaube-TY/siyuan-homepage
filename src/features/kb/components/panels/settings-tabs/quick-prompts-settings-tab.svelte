<script lang="ts">
  import { onMount } from "svelte";
  import type { KbSettings } from "../../../types/settings";
  import { getKbPlugin } from "../../../services/settings/kb-settings-service";
  import { pushErrMsg } from "@/api";
  import { openTab, openMobileFileById } from "siyuan";
  import {
    validateQuickPromptsDocId,
    listQuickPromptItems,
    createQuickPromptItem,
    updateQuickPromptItem,
    deleteQuickPromptItem,
    moveQuickPromptItem,
  } from "../../../services/quick-prompts/quick-prompts-doc";
  import type { QuickPromptItem } from "../../../services/quick-prompts/quick-prompts-doc";
  import DocBlockListEditor from "../../common/doc-block-list-editor.svelte";
  import { confirmDialogBoolean } from "@/libs/dialog";

  export let settings: KbSettings;

  $: qp = settings?.quickPrompts ?? { docId: "", enabled: false };

  let localDocId = settings?.quickPrompts?.docId ?? "";
  let docIdValid: boolean | undefined = undefined;
  let validating = false;

  let items: QuickPromptItem[] = [];
  let loadingItems = false;

  onMount(async () => {
    if (qp.docId) {
      await runValidate(qp.docId);
    } else {
      docIdValid = false;
      if (qp.enabled) {
        updateQp({ enabled: false });
      }
    }
  });

  function updateQp(partial: Partial<typeof qp>) {
    settings = {
      ...settings,
      quickPrompts: { ...qp, ...partial },
    };
  }

  async function runValidate(docId: string) {
    validating = true;
    try {
      const result = await validateQuickPromptsDocId(docId);
      docIdValid = result.valid;
      if (!result.valid && qp.enabled) {
        updateQp({ enabled: false });
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
    if (trimmed !== qp.docId) {
      updateQp({ docId: trimmed });
    }
    items = [];
    await runValidate(trimmed);
  }

  function handleOpenDoc() {
    const docId = qp.docId;
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

  async function loadItems(docId: string) {
    loadingItems = true;
    try {
      items = await listQuickPromptItems(docId);
    } finally {
      loadingItems = false;
    }
  }

  async function handleAdd(text: string) {
    if (!qp.docId || !docIdValid) return;
    const id = await createQuickPromptItem(qp.docId, text);
    if (id) {
      await loadItems(qp.docId);
    } else {
      pushErrMsg("添加失败", 3000);
    }
  }

  async function handleUpdate(itemId: string, text: string) {
    const ok = await updateQuickPromptItem(itemId, text);
    if (ok) {
      if (qp.docId) await loadItems(qp.docId);
    } else {
      pushErrMsg("保存失败", 3000);
    }
  }

  async function handleDelete(itemId: string) {
    const confirmed = await confirmDialogBoolean({
      title: "删除提示语",
      content: "确定删除这条提示语？",
    });
    if (!confirmed) return;
    const ok = await deleteQuickPromptItem(itemId);
    if (ok) {
      if (qp.docId) await loadItems(qp.docId);
    } else {
      pushErrMsg("删除失败", 3000);
    }
  }

  async function handleRefresh() {
    if (qp.docId && docIdValid) {
      await loadItems(qp.docId);
    }
  }

  async function handleMove(oldIndex: number, newIndex: number) {
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

    const ok = await moveQuickPromptItem(qp.docId, moving.id, position, targetId);
    if (ok) {
      await loadItems(qp.docId);
    } else {
      pushErrMsg("排序失败", 3000);
      items = before;
      await loadItems(qp.docId);
    }
  }
</script>

<div class="quick-prompts-settings-tab">
  <section class="settings-group">
    <h3 class="group-title">快捷提示语</h3>

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">提示语文档 ID</div>
        <div class="setting-desc">
          思源笔记文档 ID。该文档下每个顶层段落块就是一条快捷提示语。
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
        <div class="setting-title">开启快捷提示语</div>
        <div class="setting-desc">启用后，输入框会显示提示语按钮，可快速插入常用提示。</div>
      </div>
      <div class="setting-control setting-control--switch">
        <input
          type="checkbox"
          class="b3-switch fn__flex-center"
          checked={qp.enabled}
          disabled={!docIdValid}
          on:change={(e) => updateQp({ enabled: e.currentTarget.checked })}
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
          disabled={!qp.docId || docIdValid !== true}
          on:click={handleOpenDoc}
        >
          打开提示语文档
        </button>
      </div>
    </div>
  </section>

  {#if docIdValid === true}
    <section class="settings-group">
      <DocBlockListEditor
        {items}
        loading={loadingItems}
        title="提示语内容"
        placeholder="输入新提示语…"
        emptyHint="暂无提示语，上方输入后添加"
        dragHandleClass="prompt-drag-handle"
        sortableGhostClass="prompt-sortable-ghost"
        sortableChosenClass="prompt-sortable-chosen"
        sortableDragClass="prompt-sortable-drag"
        dataIdAttr="data-prompt-id"
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onMove={handleMove}
        onRefresh={handleRefresh}
      />
    </section>
  {:else if docIdValid === false}
    <div class="hint hint--error hint--center">填写有效文档 ID 后显示提示语内容</div>
  {/if}
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .quick-prompts-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: $kb-space-md;
  }

  .group-title {
    margin: 0 0 $kb-space-sm 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: $kb-space-sm;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $kb-space-lg;
    padding: $kb-space-md 0;
  }

  .setting-copy {
    min-width: 0;
  }

  .setting-title {
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-primary);
    line-height: 1.5;
  }

  .setting-desc {
    margin-top: $kb-space-xs;
    font-size: $kb-fs-md;
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

  .b3-text-field {
    width: 240px;
  }

  :global(.prompt-sortable-ghost) {
    opacity: 0.35;
    background: var(--b3-theme-primary-light, rgba(66, 133, 244, 0.08));
  }

  :global(.prompt-sortable-chosen .prompt-drag-handle) {
    cursor: grabbing;
  }
</style>
