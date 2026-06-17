<script lang="ts">
  import { onMount } from "svelte";
  import type { KbSettings } from "../../../types/settings";
  import { getKbPlugin } from "../../../services/settings/kb-settings-service";
  import { pushErrMsg } from "@/api";
  import { openTab, openMobileFileById } from "siyuan";
  import {
    validateGlobalMemoryDocId,
    listGlobalMemoryItems,
    readGlobalMemory,
    createGlobalMemoryItem,
    updateGlobalMemoryItem,
    deleteGlobalMemoryItem,
    moveGlobalMemoryItem,
  } from "../../../services/agent-workbench/memory/global-memory-doc";
  import type { GlobalMemoryItem } from "../../../services/agent-workbench/memory/global-memory-types";
  import DocBlockListEditor from "../../common/doc-block-list-editor.svelte";
  import { confirmDialogBoolean } from "@/libs/dialog";

  export let settings: KbSettings;

  $: gm = settings?.globalMemory ?? { docId: "", enabled: false, maxChars: 8000, allowAiUpdate: false };

  let localDocId = settings?.globalMemory?.docId ?? "";
  let docIdValid: boolean | undefined = undefined;
  let validating = false;

  let items: GlobalMemoryItem[] = [];
  let loadingItems = false;

  let fullMemoryText = "";
  let memoryReadFailed = false;
  $: currentChars = fullMemoryText.length;
  $: isOverLimit = !memoryReadFailed && currentChars > gm.maxChars;

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

  async function loadItems(docId: string) {
    loadingItems = true;
    try {
      items = await listGlobalMemoryItems(docId);
      const memory = await readGlobalMemory(docId, 999999);
      if (memory.readOk) {
        fullMemoryText = memory.content;
        memoryReadFailed = false;
      } else {
        fullMemoryText = "";
        memoryReadFailed = true;
      }
    } finally {
      loadingItems = false;
    }
  }

  async function handleAdd(text: string) {
    if (!gm.docId || !docIdValid) return;
    const id = await createGlobalMemoryItem(gm.docId, text);
    if (id) {
      await loadItems(gm.docId);
    } else {
      pushErrMsg("添加失败", 3000);
    }
  }

  async function handleUpdate(itemId: string, text: string) {
    const ok = await updateGlobalMemoryItem(itemId, text);
    if (ok) {
      if (gm.docId) await loadItems(gm.docId);
    } else {
      pushErrMsg("保存失败", 3000);
    }
  }

  async function handleDelete(itemId: string) {
    const confirmed = await confirmDialogBoolean({
      title: "删除记忆",
      content: "确定删除这条记忆？",
    });
    if (!confirmed) return;
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

    const ok = await moveGlobalMemoryItem(gm.docId, moving.id, position, targetId);
    if (ok) {
      await loadItems(gm.docId);
    } else {
      pushErrMsg("排序失败", 3000);
      items = before;
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

    <div class="setting-row">
      <div class="setting-copy">
        <div class="setting-title">全局记忆最大字符数</div>
        <div class="setting-desc">
          AI 每轮最多读取的全局记忆字符数，也是 AI 编辑全局记忆时允许写入的最大字符数。值越大，占用上下文越高。
        </div>
      </div>
      <div class="setting-control">
        <input
          type="number"
          class="b3-text-field fn__block"
          min="500"
          max="30000"
          step="500"
          value={gm.maxChars}
          on:input={(e) => {
            const v = parseInt(e.currentTarget.value, 10);
            if (Number.isFinite(v)) {
              updateGm({ maxChars: Math.max(500, Math.min(30000, v)) });
            }
          }}
        />
        {#if memoryReadFailed}
          <span class="hint hint--error" style="white-space:normal; text-align:right; max-width:240px;">
            读取全局记忆失败，请检查文档 ID 或稍后重试。
          </span>
        {:else if isOverLimit}
          <span class="hint hint--warning" style="white-space:normal; text-align:right; max-width:240px;">
            当前全局记忆 {currentChars} 字符，超过上限 {gm.maxChars}。AI 只能读取截断内容，编辑全局记忆工具将拒绝全量替换。请手动整理记忆或调大上限。
          </span>
        {:else if docIdValid === true}
          <span class="hint">当前记忆 {currentChars} 字符</span>
        {/if}
      </div>
    </div>
  </section>

  {#if docIdValid === true}
    <section class="settings-group">
      <DocBlockListEditor
        {items}
        loading={loadingItems}
        title="记忆内容"
        placeholder="输入新记忆…"
        emptyHint="暂无记忆，上方输入后添加"
        dragHandleClass="memory-drag-handle"
        sortableGhostClass="memory-sortable-ghost"
        sortableChosenClass="memory-sortable-chosen"
        sortableDragClass="memory-sortable-drag"
        dataIdAttr="data-memory-id"
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onMove={handleMove}
        onRefresh={handleRefresh}
      />
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

  .hint--warning {
    color: var(--b3-card-warning-color, #c76c2a);
    opacity: 1;
    font-size: 12px;
    line-height: 1.4;
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

  :global(.memory-sortable-ghost) {
    opacity: 0.35;
    background: var(--b3-theme-primary-light, rgba(66, 133, 244, 0.08));
  }

  :global(.memory-sortable-chosen .memory-drag-handle) {
    cursor: grabbing;
  }
</style>
