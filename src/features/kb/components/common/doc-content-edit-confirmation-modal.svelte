<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    getDocContentEditConfirmation,
    removeDocContentEditConfirmation,
  } from "../../services/doc-content-edit/doc-content-edit-confirmation-store";
  import type { DocContentEditConfirmation } from "../../services/doc-content-edit/doc-content-edit-types";

  export let confirmationId: string | null = null;
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
    cancel: { status: "rejected"; message: string };
    confirmed: { status: "success"; message: string };
  }>();

  let confirmation: DocContentEditConfirmation | null = null;
  let loading = false;
  let error: string | null = null;
  let confirming = false;
  let leftScrollEl: HTMLDivElement;
  let rightScrollEl: HTMLDivElement;

  $: if (open && confirmationId) {
    loadConfirmation();
  } else if (!open) {
    confirmation = null;
    error = null;
    confirming = false;
  }

  async function loadConfirmation() {
    if (!confirmationId) return;
    loading = true;
    error = null;
    try {
      const result = await getDocContentEditConfirmation(confirmationId);
      if (result) {
        confirmation = result;
      } else {
        error = "确认信息不存在或已过期。";
      }
    } catch (e) {
      error = "读取确认信息失败。";
    } finally {
      loading = false;
    }
  }

  async function handleConfirm() {
    if (!confirmationId) return;
    if (confirmation && confirmation.action !== "update_block" && confirmation.action !== "insert_block" && confirmation.action !== "delete_block" && confirmation.action !== "move_block" && confirmation.action !== "create_doc" && confirmation.action !== "rename_doc" && confirmation.action !== "delete_doc" && confirmation.action !== "replace_doc_content") {
      error = "该操作暂未接入执行。";
      return;
    }
    confirming = true;
    dispatch("confirmed", { status: "success", message: "用户已确认操作。" });
    dispatch("close");
  }

  async function handleCancel() {
    if (!confirmationId) return;
    await removeDocContentEditConfirmation(confirmationId);
    dispatch("cancel", { status: "rejected", message: "用户已拒绝操作。" });
    dispatch("close");
  }

  function handleClose() {
    dispatch("close");
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function syncScroll(source: "left" | "right") {
    if (!leftScrollEl || !rightScrollEl) return;
    if (source === "left") {
      rightScrollEl.scrollTop = leftScrollEl.scrollTop;
    } else {
      leftScrollEl.scrollTop = rightScrollEl.scrollTop;
    }
  }

  function getKindClass(kind: string): string {
    switch (kind) {
      case "added":
        return "kind-added";
      case "removed":
        return "kind-removed";
      case "modified":
        return "kind-modified";
      default:
        return "kind-unchanged";
    }
  }
</script>

{#if open}
  <div
    class="confirm-overlay"
    on:click={handleOverlayClick}
    on:keydown={(e) => { if (e.key === "Escape") handleClose(); }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="confirm-dialog confirmation-modal">
      <div class="confirm-header">
        <h2>文档内容编辑确认</h2>
      </div>

      <div class="confirm-body">
        {#if loading}
          <div class="loading-text">加载中...</div>
        {:else if error}
          <div class="error-text">{error}</div>
        {:else if confirmation}
          {#if confirmation.warnings && confirmation.warnings.length > 0}
            <div class="confirm-warnings">
              {#each confirmation.warnings as warning}
                <p class="warning-item">⚠ {warning}</p>
              {/each}
            </div>
          {/if}

          {#if confirmation.visualCompare}
            {#if confirmation.visualCompare.type === "rendered_side_by_side"}
              {@const compare = confirmation.visualCompare.sideBySide}
              <div class="side-by-side-container">
                <div class="side-by-side-panel">
                  <div class="side-by-side-title">修改前</div>
                  <div
                    class="side-by-side-content"
                    bind:this={leftScrollEl}
                    on:scroll={() => syncScroll("left")}
                  >
                    {#each compare.beforeLines as line}
                      <div class="diff-line {getKindClass(line.kind)}">
                        <span class="diff-line-no">{line.lineNo ?? ""}</span>
                        <span class="diff-line-text">{line.text}</span>
                      </div>
                    {/each}
                    {#if compare.truncated}
                      <div class="truncated-hint">内容已截断</div>
                    {/if}
                  </div>
                </div>
                <div class="side-by-side-panel">
                  <div class="side-by-side-title">修改后</div>
                  <div
                    class="side-by-side-content"
                    bind:this={rightScrollEl}
                    on:scroll={() => syncScroll("right")}
                  >
                    {#each compare.afterLines as line}
                      <div class="diff-line {getKindClass(line.kind)}">
                        <span class="diff-line-no">{line.lineNo ?? ""}</span>
                        <span class="diff-line-text">{line.text}</span>
                      </div>
                    {/each}
                    {#if compare.truncated}
                      <div class="truncated-hint">内容已截断</div>
                    {/if}
                  </div>
                </div>
              </div>
            {:else if confirmation.visualCompare.type === "arrow_flow"}
              {@const arrow = confirmation.visualCompare.arrow}
              <div class="arrow-flow">
                <div class="arrow-flow-from">
                  <div class="arrow-flow-label">{arrow.fromLabel}</div>
                  {#if arrow.fromDescription}
                    <div class="arrow-flow-desc">{arrow.fromDescription}</div>
                  {/if}
                </div>
                <div class="arrow-flow-arrow">→</div>
                <div class="arrow-flow-to">
                  <div class="arrow-flow-label">{arrow.toLabel}</div>
                  {#if arrow.toDescription}
                    <div class="arrow-flow-desc">{arrow.toDescription}</div>
                  {/if}
                </div>
              </div>
            {/if}
          {:else}
            <div class="no-compare-hint">无对比数据</div>
          {/if}
        {/if}
      </div>

      <div class="confirm-footer">
        {#if confirmation}
          <button
            type="button"
            class="confirm-btn confirm-btn-secondary"
            on:click={handleCancel}
            disabled={confirming}
          >
            取消本次确认
          </button>
          <button
            type="button"
            class="confirm-btn confirm-btn-primary"
            on:click={handleConfirm}
            disabled={confirming}
          >
            {confirming ? "确认中..." : "确认执行"}
          </button>
        {:else}
          <button
            type="button"
            class="confirm-btn confirm-btn-secondary"
            on:click={handleClose}
          >
            关闭
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .confirm-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    background: var(--b3-theme-scrim);
  }

  .confirm-dialog {
    background: var(--b3-theme-surface);
    border-radius: var(--b3-border-radius-dialog);
    box-shadow: var(--b3-dialog-shadow);
    animation: dialog-enter 0.2s ease;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .confirmation-modal {
    width: 800px;
    max-width: 95vw;
  }

  @keyframes dialog-enter {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .confirm-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--b3-border-color);
    flex-shrink: 0;
  }

  .confirm-header h2 {
    font-size: 1em;
    margin: 0;
    color: var(--b3-theme-on-surface);
  }

  .confirm-body {
    padding: 16px;
    font-size: 14px;
    line-height: 1.6;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }

  .loading-text,
  .error-text,
  .no-compare-hint {
    text-align: center;
    padding: 24px 0;
    color: var(--b3-theme-on-surface-light);
  }

  .error-text {
    color: var(--b3-theme-error);
  }

  .confirm-warnings {
    margin-bottom: 12px;
    padding: 8px 12px;
    background: rgba(var(--b3-theme-error-rgb), 0.08);
    border-radius: 6px;
  }

  .warning-item {
    margin: 4px 0;
    color: var(--b3-theme-error);
    font-size: 13px;
  }

  .side-by-side-container {
    display: flex;
    gap: 12px;
    height: 100%;
    min-height: 200px;
  }

  .side-by-side-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    overflow: hidden;
  }

  .side-by-side-title {
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    background: var(--b3-theme-background);
    border-bottom: 1px solid var(--b3-border-color);
    flex-shrink: 0;
  }

  .side-by-side-content {
    flex: 1;
    overflow: auto;
    padding: 8px 0;
    font-family: var(--b3-font-family-code), monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  .diff-line {
    display: flex;
    gap: 8px;
    padding: 2px 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .diff-line-no {
    flex-shrink: 0;
    width: 32px;
    text-align: right;
    color: var(--b3-theme-on-surface-light);
    opacity: 0.6;
    user-select: none;
  }

  .diff-line-text {
    flex: 1;
  }

  .kind-unchanged {
    color: var(--b3-theme-on-surface);
  }

  .kind-added {
    background: rgba(var(--b3-theme-success-rgb), 0.12);
    color: var(--b3-theme-success);
  }

  .kind-removed {
    background: rgba(var(--b3-theme-error-rgb), 0.12);
    color: var(--b3-theme-error);
  }

  .kind-modified {
    background: rgba(var(--b3-theme-warning-rgb), 0.12);
    color: var(--b3-theme-warning);
  }

  .truncated-hint {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
    border-top: 1px dashed var(--b3-border-color);
    margin-top: 4px;
  }

  .arrow-flow {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 32px 16px;
  }

  .arrow-flow-from,
  .arrow-flow-to {
    text-align: center;
    flex: 1;
  }

  .arrow-flow-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    word-break: break-word;
  }

  .arrow-flow-desc {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-top: 4px;
  }

  .arrow-flow-arrow {
    font-size: 24px;
    color: var(--b3-theme-primary);
    flex-shrink: 0;
  }

  .confirm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--b3-border-color);
    flex-shrink: 0;
  }

  .confirm-btn {
    padding: 6px 14px;
    border-radius: var(--b3-border-radius);
    font-size: 13px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s, opacity 0.15s;
  }

  .confirm-btn-secondary {
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
    border-color: var(--b3-border-color);
  }

  .confirm-btn-secondary:hover {
    background: var(--b3-theme-surface);
  }

  .confirm-btn-primary {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
  }

  .confirm-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
