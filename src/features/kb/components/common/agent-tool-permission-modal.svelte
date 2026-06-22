<script lang="ts">
  export let open = false;
  export let toolName = "";
  export let title = "";
  export let risk: "low" | "medium" | "high" = "medium";
  export let summary = "";
  export let argsPreview: Record<string, unknown> = {};

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch("confirmed");
  }

  function handleCancel() {
    dispatch("cancel");
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
      handleCancel();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter") handleConfirm();
  }

  $: riskLabel = { low: "低风险", medium: "中风险", high: "高风险" }[risk] ?? "未知";
  $: riskClass = { low: "risk-low", medium: "risk-medium", high: "risk-high" }[risk] ?? "risk-medium";
  $: argsStr = JSON.stringify(argsPreview, null, 2);
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown}>
    <div class="modal-content" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>确认执行操作</h3>
        <span class="risk-badge {riskClass}">{riskLabel}</span>
      </div>

      <div class="modal-body">
        <div class="info-row">
          <span class="label">工具：</span>
          <span class="value">{title || toolName}</span>
        </div>
        {#if summary}
          <div class="info-row">
            <span class="label">操作：</span>
            <span class="value">{summary}</span>
          </div>
        {/if}
        {#if Object.keys(argsPreview).length > 0}
          <div class="args-section">
            <span class="label">参数：</span>
            <pre class="args-preview">{argsStr}</pre>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" on:click={handleCancel}>取消</button>
        <button class="btn btn-confirm" on:click={handleConfirm}>确认执行</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--b3-theme-background, #fff);
    border-radius: 8px;
    width: 90%;
    max-width: 480px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--b3-border-color, #e0e0e0);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .risk-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .risk-low { background: #e8f5e9; color: #2e7d32; }
  .risk-medium { background: #fff3e0; color: #e65100; }
  .risk-high { background: #ffebee; color: #c62828; }

  .modal-body {
    padding: 16px 20px;
  }

  .info-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
    line-height: 1.5;
  }

  .label {
    color: var(--b3-theme-on-surface-light, #888);
    flex-shrink: 0;
  }

  .value {
    color: var(--b3-theme-on-surface, #333);
    word-break: break-all;
    white-space: pre-wrap;
  }

  .args-section {
    margin-top: 8px;
  }

  .args-preview {
    margin: 4px 0 0 0;
    padding: 8px 12px;
    background: var(--b3-theme-surface, #f5f5f5);
    border-radius: 4px;
    font-size: 12px;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--b3-border-color, #e0e0e0);
  }

  .btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid var(--b3-border-color, #ccc);
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-surface, #333);
    transition: all 0.15s;
  }

  .btn:hover {
    background: var(--b3-theme-surface, #f0f0f0);
  }

  .btn-confirm {
    background: var(--b3-theme-primary, #1a73e8);
    color: #fff;
    border-color: var(--b3-theme-primary, #1a73e8);
  }

  .btn-confirm:hover {
    opacity: 0.9;
  }
</style>
