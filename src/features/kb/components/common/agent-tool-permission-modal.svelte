<script lang="ts">
  import type { DocContentEditArrowFlow } from "../../services/doc-content-edit/doc-content-edit-types";

  export let open = false;
  export let toolName = "";
  export let title = "";
  export let risk: "low" | "medium" | "high" = "medium";
  export let summary = "";
  export let operationLabel = "";
  export let targetSummary = "";
  export let impactSummary = "";
  export let riskReason = "";
  export let warnings: string[] = [];
  export let missingPreviewReason = "";
  export let argsPreview: Record<string, unknown> = {};
  /** Structured sections for detailed preview (e.g. URL, Headers, Body). */
  export let sections: Array<{ label: string; value: string }> = [];
  export let arrowFlow: DocContentEditArrowFlow | undefined = undefined;

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
    if (e.key === "Enter" && (e.target as HTMLElement).dataset.confirmButton === "true") handleConfirm();
  }

  $: riskLabel = { low: "低风险", medium: "中风险", high: "高风险" }[risk] ?? "未知";
  $: riskClass = { low: "risk-low", medium: "risk-medium", high: "risk-high" }[risk] ?? "risk-medium";
  $: argsStr = JSON.stringify(argsPreview, null, 2);
  $: firstSummaryLine = summary.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  $: displayOperation = operationLabel || firstSummaryLine;
  $: shouldShowArgs = Object.keys(argsPreview).length > 0 && sections.length === 0;
  $: confirmLabel = risk === "high" ? "确认执行高风险操作" : "确认执行";
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
        {#if displayOperation}
          <div class="info-row">
            <span class="label">操作：</span>
            <span class="value">{displayOperation}</span>
          </div>
        {/if}
        {#if targetSummary}
          <div class="info-row">
            <span class="label">目标：</span>
            <span class="value">{targetSummary}</span>
          </div>
        {/if}
        {#if impactSummary}
          <div class="info-row">
            <span class="label">影响：</span>
            <span class="value">{impactSummary}</span>
          </div>
        {/if}
        {#if riskReason}
          <div class="info-row risk-reason-row">
            <span class="label">风险：</span>
            <span class="value">{riskReason}</span>
          </div>
        {/if}
        {#if risk === "high"}
          <div class="risk-callout">高风险操作执行后请以工具结果和当前思源内容为准，系统不会自动回滚。</div>
        {/if}
        {#if arrowFlow}
          <div class="arrow-flow" aria-label="变更流向">
            <div class="arrow-node">
              <div class="arrow-node-label">{arrowFlow.fromLabel}</div>
              {#if arrowFlow.fromDescription}
                <div class="arrow-node-desc">{arrowFlow.fromDescription}</div>
              {/if}
            </div>
            <div class="arrow-icon" aria-hidden="true">→</div>
            <div class="arrow-node">
              <div class="arrow-node-label">{arrowFlow.toLabel}</div>
              {#if arrowFlow.toDescription}
                <div class="arrow-node-desc">{arrowFlow.toDescription}</div>
              {/if}
            </div>
          </div>
        {/if}
        {#if warnings.length > 0}
          <div class="warning-block">
            {#each warnings as warning}
              <div class="warning-item">{warning}</div>
            {/each}
          </div>
        {/if}
        {#if missingPreviewReason}
          <div class="missing-preview">{missingPreviewReason}</div>
        {/if}
        {#if sections.length > 0}
          <div class="sections-block">
            {#each sections as section}
              <div class="section-row">
                <span class="label">{section.label}：</span>
                <pre class="section-value">{section.value}</pre>
              </div>
            {/each}
          </div>
        {/if}
        {#if shouldShowArgs}
          <div class="args-section">
            <span class="label">参数摘要：</span>
            <pre class="args-preview">{argsStr}</pre>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" on:click={handleCancel}>取消</button>
        <button class="btn btn-confirm" data-confirm-button="true" on:click={handleConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../panels/_kb-tokens' as *;

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--b3-mask-background);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--b3-theme-background);
    border-radius: $kb-radius-lg;
    width: 90%;
    max-width: 560px;
    max-height: min(86vh, 720px);
    box-shadow: $kb-shadow-modal;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $kb-space-lg $kb-space-xl;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .modal-header h3 {
    margin: 0;
    font-size: $kb-fs-xxl;
    font-weight: 600;
  }

  .risk-badge {
    font-size: $kb-fs-sm;
    padding: 2px $kb-space-sm;
    border-radius: $kb-radius-md;
    font-weight: 500;
  }

  .risk-low { background: color-mix(in srgb, var(--b3-theme-success) 15%, transparent); color: var(--b3-theme-success, #2e7d32); }
  .risk-medium { background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 15%, transparent); color: var(--b3-card-warning-color, #e65100); }
  .risk-high { background: color-mix(in srgb, var(--b3-theme-error) 15%, transparent); color: var(--b3-theme-error, #c62828); }

  .modal-body {
    padding: $kb-space-lg $kb-space-xl;
    overflow: auto;
  }

  .info-row {
    display: flex;
    gap: $kb-space-sm;
    margin-bottom: $kb-space-sm;
    font-size: $kb-fs-lg;
    line-height: 1.5;
  }

  .label {
    color: var(--b3-theme-on-surface-light);
    flex-shrink: 0;
  }

  .value {
    color: var(--b3-theme-on-surface);
    word-break: break-all;
    white-space: pre-wrap;
  }

  .risk-reason-row .value {
    color: var(--b3-theme-error, #c62828);
  }

  .risk-callout,
  .missing-preview,
  .warning-block {
    margin: $kb-space-sm 0;
    padding: $kb-space-sm $kb-space-md;
    border-radius: $kb-radius-md;
    line-height: 1.45;
    font-size: $kb-fs-md;
  }

  .risk-callout {
    border: 1px solid color-mix(in srgb, var(--b3-theme-error, #c62828) 45%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-error, #c62828) 10%, transparent);
    color: var(--b3-theme-error, #c62828);
  }

  .missing-preview {
    border: 1px solid color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 45%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 12%, transparent);
    color: var(--b3-theme-on-surface);
  }

  .warning-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 45%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 8%, transparent);
  }

  .warning-item {
    color: var(--b3-theme-on-surface);
    word-break: break-word;
  }

  .arrow-flow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
    gap: $kb-space-sm;
    margin: $kb-space-md 0;
  }

  .arrow-node {
    min-width: 0;
    padding: $kb-space-sm $kb-space-md;
    border: 1px solid var(--b3-border-color);
    border-radius: $kb-radius-md;
    background: var(--b3-theme-surface);
  }

  .arrow-node-label {
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .arrow-node-desc {
    margin-top: 4px;
    font-size: $kb-fs-sm;
    color: var(--b3-theme-on-surface-light);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .arrow-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    color: var(--b3-theme-primary);
    font-size: 22px;
    font-weight: 600;
  }

  .args-section {
    margin-top: $kb-space-sm;
  }

  .sections-block {
    margin-top: $kb-space-sm;
    display: flex;
    flex-direction: column;
    gap: $kb-space-xs;
  }

  .section-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: $kb-fs-md;
  }

  .section-value {
    margin: 0;
    padding: $kb-space-xs $kb-space-sm;
    background: var(--b3-theme-surface);
    border-radius: $kb-radius-md;
    font-size: $kb-fs-sm;
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.4;
    border: 1px solid var(--b3-border-color);
  }

  .args-preview {
    margin: $kb-space-xs 0 0 0;
    padding: $kb-space-sm $kb-space-md;
    background: var(--b3-theme-surface);
    border-radius: $kb-radius-md;
    font-size: $kb-fs-sm;
    max-height: 200px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid var(--b3-border-color);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: $kb-space-sm;
    padding: $kb-space-md $kb-space-xl;
    border-top: 1px solid var(--b3-border-color);
  }

  .btn {
    padding: 6px $kb-space-lg;
    border-radius: $kb-radius-md;
    font-size: $kb-fs-lg;
    cursor: pointer;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-surface);
    transition:
      background $kb-dur-fast $kb-ease-out,
      box-shadow $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;
    box-shadow: $kb-shadow-none;

    &:hover {
      background: var(--b3-theme-surface);
      box-shadow: $kb-shadow-card;
    }

    &:active {
      transform: scale(0.97);
    }
  }

  .btn-confirm {
    background: var(--b3-theme-primary);
    color: #fff;
    border-color: var(--b3-theme-primary);

    &:hover {
      opacity: 0.9;
      box-shadow: $kb-shadow-raised;
    }
  }

  @media (max-width: 520px) {
    .modal-content {
      width: calc(100% - 24px);
      max-height: 90vh;
    }

    .modal-header,
    .modal-body,
    .modal-footer {
      padding-left: $kb-space-md;
      padding-right: $kb-space-md;
    }

    .info-row {
      flex-direction: column;
      gap: 2px;
    }

    .arrow-flow {
      grid-template-columns: 1fr;
    }

    .arrow-icon {
      transform: rotate(90deg);
      min-height: 24px;
    }
  }
</style>
