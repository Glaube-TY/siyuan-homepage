<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    getDocContentEditConfirmation,
    removeDocContentEditConfirmation,
  } from "../../services/doc-content-edit/doc-content-edit-confirmation-store";
  import type { DocContentEditConfirmation, DocContentEditDisplayItem } from "../../services/doc-content-edit/doc-content-edit-types";
  import { formatSiyuanTimestamp } from "../../services/doc-content-edit/doc-content-edit-display";
  import EditDiffViewer from "./edit-diff-viewer.svelte";

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

  $: deleteAction = confirmation?.action === "delete_doc" || confirmation?.action === "delete_blocks";
  $: createAction = confirmation?.action === "create_doc" || confirmation?.action === "insert_block";
  $: resolvedDialogTitle = confirmation?.presentation?.heading
    || (confirmation?.visualCompare?.type === "block_diff" ? confirmation.visualCompare.diff.title : "")
    || (deleteAction ? "确认删除" : createAction ? "确认添加" : "确认内容变更");
  $: resolvedConfirmLabel = confirming
    ? "确认中..."
    : deleteAction
      ? "确认删除"
      : createAction
        ? "确认添加"
        : "确认执行";
  $: createDestinationLabel = confirmation?.presentation?.destination?.label
    ?? confirmation?.target.title
    ?? "目标位置";

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
    if (confirmation && confirmation.action !== "update_block" && confirmation.action !== "insert_block" && confirmation.action !== "delete_blocks" && confirmation.action !== "move_block" && confirmation.action !== "create_doc" && confirmation.action !== "rename_doc" && confirmation.action !== "delete_doc" && confirmation.action !== "replace_doc_content") {
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

  function isDeleteAction(): boolean {
    return deleteAction;
  }

  function isCreateAction(): boolean {
    return createAction;
  }

  function hasContentDiff(): boolean {
    if (confirmation?.visualCompare?.type !== "block_diff") return false;
    return confirmation.action === "update_block"
      || confirmation.action === "insert_block"
      || confirmation.action === "delete_blocks"
      || confirmation.action === "replace_doc_content";
  }

  function displayItems(): DocContentEditDisplayItem[] {
    if (confirmation?.presentation?.items?.length) return confirmation.presentation.items;
    if (!confirmation || !isDeleteAction()) return [];
    return [{
      kind: confirmation.action === "delete_doc" ? "文档" : "内容块",
      title: confirmation.target.title || "未命名内容",
      notebookName: confirmation.target.notebookName,
      path: confirmation.target.displayPath,
      createdAt: formatSiyuanTimestamp(confirmation.target.createdAt),
      updatedAt: formatSiyuanTimestamp(confirmation.target.updatedAt),
    }];
  }

  function pathSegments(notebookName?: string, path?: string): string[] {
    const segments = (path ?? "")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const notebook = notebookName?.trim();
    if (notebook && segments[0] !== notebook) segments.unshift(notebook);
    return segments;
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
        <h2>{resolvedDialogTitle}</h2>
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

          {#if hasContentDiff() && confirmation.visualCompare?.type === "block_diff"}
            {#if confirmation.target.notebookName || confirmation.target.displayPath || confirmation.target.createdAt || confirmation.target.updatedAt}
              {@const targetSegments = pathSegments(confirmation.target.notebookName, confirmation.target.displayPath)}
              <div class="change-target-meta">
                {#if confirmation.target.title}<strong>{confirmation.target.title}</strong>{/if}
                {#if targetSegments.length > 0}
                  <div class="path-breadcrumb" title={targetSegments.join(" / ")}>
                    {#each targetSegments as segment, index}
                      {#if index > 0}<span class="path-separator" aria-hidden="true">›</span>{/if}
                      <span>{segment}</span>
                    {/each}
                  </div>
                {/if}
                <div>
                  {#if formatSiyuanTimestamp(confirmation.target.createdAt)}<small>创建于 {formatSiyuanTimestamp(confirmation.target.createdAt)}</small>{/if}
                  {#if formatSiyuanTimestamp(confirmation.target.updatedAt)}<small>更新于 {formatSiyuanTimestamp(confirmation.target.updatedAt)}</small>{/if}
                </div>
              </div>
            {/if}
            <div class="block-diff-container">
              <EditDiffViewer editDiffPreview={confirmation.visualCompare.diff} />
            </div>
          {:else if isDeleteAction()}
            <section class="operation-panel operation-panel-delete">
              <div class="operation-heading">
                <span class="operation-marker operation-marker-delete" aria-hidden="true">!</span>
                <div>
                  <strong>即将删除</strong>
                  <p>{confirmation.presentation?.description ?? "请确认以下内容是否为你要删除的目标。"}</p>
                </div>
              </div>
              <div class="section-caption">删除对象</div>
              <div class="operation-items">
                {#each displayItems() as item}
                  {@const segments = pathSegments(item.notebookName, item.path)}
                  <article class="operation-item">
                    <span class="item-kind">{item.kind}</span>
                    <div class="item-main">
                      <div class="item-title">{item.title}</div>
                      {#if segments.length > 0}
                        <div class="path-breadcrumb" title={segments.join(" / ")}>
                          {#each segments as segment, index}
                            {#if index > 0}<span class="path-separator" aria-hidden="true">›</span>{/if}
                            <span>{segment}</span>
                          {/each}
                        </div>
                      {/if}
                      {#if item.excerpt && item.excerpt !== item.title}
                        <div class="item-excerpt">{item.excerpt}</div>
                      {/if}
                      {#if item.createdAt || item.updatedAt}
                        <div class="item-time">
                          {#if item.createdAt}<span>创建于 {item.createdAt}</span>{/if}
                          {#if item.updatedAt}<span>更新于 {item.updatedAt}</span>{/if}
                        </div>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
              <div class="delete-note">删除后请通过思源的历史或快照机制恢复，请再次核对路径和内容。</div>
            </section>
          {:else if isCreateAction()}
            <section class="operation-panel operation-panel-create">
              <div class="operation-heading">
                <span class="operation-marker operation-marker-create" aria-hidden="true">+</span>
                <div>
                  <strong>即将添加</strong>
                  <p>{confirmation.presentation?.description ?? "请确认添加位置与内容。"}</p>
                </div>
              </div>
              <dl class="create-details">
                <div class="create-detail-row">
                  <dt>添加到</dt>
                  <dd>
                    <strong>{createDestinationLabel}</strong>
                    {#if pathSegments(confirmation.target.notebookName ?? createDestinationLabel, confirmation.presentation?.destination?.path).length > 0}
                      <div class="path-breadcrumb" title={pathSegments(confirmation.target.notebookName ?? createDestinationLabel, confirmation.presentation?.destination?.path).join(" / ")}>
                        {#each pathSegments(confirmation.target.notebookName ?? createDestinationLabel, confirmation.presentation?.destination?.path) as segment, index}
                          {#if index > 0}<span class="path-separator" aria-hidden="true">›</span>{/if}
                          <span>{segment}</span>
                        {/each}
                      </div>
                    {/if}
                  {#if confirmation.presentation?.destination?.detail}
                    <small>{confirmation.presentation.destination.detail}</small>
                  {/if}
                  </dd>
                </div>
                <div class="create-detail-row">
                  <dt>添加方式</dt>
                  <dd><strong>{confirmation.presentation?.method ?? "写入新内容"}</strong></dd>
                </div>
              </dl>
              {#if confirmation.presentation?.addedContent}
                <div class="added-content">
                  <div class="added-content-title">写入内容</div>
                  <pre>{confirmation.presentation.addedContent}</pre>
                </div>
              {/if}
            </section>
          {:else if confirmation.visualCompare}
            {#if confirmation.target.notebookName || confirmation.target.displayPath || confirmation.target.createdAt || confirmation.target.updatedAt}
              {@const targetSegments = pathSegments(confirmation.target.notebookName, confirmation.target.displayPath)}
              <div class="change-target-meta">
                {#if confirmation.target.title}<strong>{confirmation.target.title}</strong>{/if}
                {#if targetSegments.length > 0}
                  <div class="path-breadcrumb" title={targetSegments.join(" / ")}>
                    {#each targetSegments as segment, index}
                      {#if index > 0}<span class="path-separator" aria-hidden="true">›</span>{/if}
                      <span>{segment}</span>
                    {/each}
                  </div>
                {/if}
                <div>
                  {#if formatSiyuanTimestamp(confirmation.target.createdAt)}<small>创建于 {formatSiyuanTimestamp(confirmation.target.createdAt)}</small>{/if}
                  {#if formatSiyuanTimestamp(confirmation.target.updatedAt)}<small>更新于 {formatSiyuanTimestamp(confirmation.target.updatedAt)}</small>{/if}
                </div>
              </div>
            {/if}
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
            {:else if confirmation.visualCompare.type === "block_diff"}
              <div class="block-diff-container">
                <EditDiffViewer editDiffPreview={confirmation.visualCompare.diff} />
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
            class:confirm-btn-danger={isDeleteAction()}
            on:click={handleConfirm}
            disabled={confirming}
          >
            {resolvedConfirmLabel}
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
  @use '../panels/_kb-tokens' as *;

  .confirm-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    background: var(--b3-mask-background);
  }

  .confirm-dialog {
    background: var(--b3-theme-surface);
    border-radius: var(--b3-border-radius-b);
    box-shadow: var(--b3-dialog-shadow);
    animation: dialog-enter $kb-dur-normal $kb-ease-out;
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
    background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
    border-radius: 6px;
  }

  .operation-panel {
    color: var(--b3-theme-on-surface);
  }

  .operation-heading {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 2px 0 14px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .operation-heading strong {
    color: var(--b3-theme-on-background);
    font-size: 14px;
  }

  .operation-heading p {
    margin: 2px 0 0;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .operation-marker {
    flex: 0 0 16px;
    width: 16px;
    margin-top: 1px;
    text-align: center;
    font-weight: 700;
  }

  .operation-marker-delete,
  .operation-panel-delete .item-kind,
  .delete-note {
    color: var(--b3-theme-error);
  }

  .operation-marker-create {
    color: var(--b3-theme-primary);
  }

  .section-caption {
    padding: 12px 0 6px;
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
    font-weight: 600;
  }

  .operation-items {
    max-height: 44vh;
    overflow: auto;
    border-top: 1px solid var(--b3-border-color);
  }

  .operation-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 2px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .item-kind {
    flex: 0 0 auto;
    width: 48px;
    padding-top: 1px;
    font-size: 11px;
    font-weight: 600;
  }

  .item-main {
    min-width: 0;
    flex: 1;
  }

  .item-title {
    color: var(--b3-theme-on-surface);
    font-weight: 600;
    word-break: break-word;
  }

  .path-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 5px;
    margin-top: 3px;
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .path-separator {
    opacity: 0.55;
  }

  .item-excerpt {
    margin-top: 8px;
    padding-left: 10px;
    border-left: 2px solid color-mix(in srgb, var(--b3-theme-error) 45%, var(--b3-border-color));
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .item-time {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
  }

  .delete-note {
    padding-top: 10px;
    font-size: 12px;
  }

  .create-details {
    margin: 0;
  }

  .create-detail-row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 12px;
    padding: 11px 2px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .create-detail-row dt,
  .create-detail-row dd {
    margin: 0;
  }

  .create-detail-row dt,
  .added-content-title {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
  }

  .create-detail-row strong {
    display: block;
    color: var(--b3-theme-on-surface);
    font-size: 13px;
    word-break: break-word;
  }

  .create-detail-row small {
    display: block;
    margin-top: 3px;
    color: var(--b3-theme-on-surface-light);
  }

  .added-content {
    margin-top: 14px;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
  }

  .added-content-title {
    padding: 7px 10px;
    border-bottom: 1px solid var(--b3-border-color);
    font-weight: 600;
  }

  .added-content pre {
    max-height: 32vh;
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    color: var(--b3-theme-on-surface);
    font-family: var(--b3-font-family-code), monospace;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .block-diff-container {
    border: 1px solid var(--b3-border-color);
    overflow: hidden;
  }

  .change-target-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3px 12px;
    margin-bottom: 0;
    padding: 0 2px 10px;
  }

  .change-target-meta strong {
    color: var(--b3-theme-on-surface);
  }

  .change-target-meta small {
    color: var(--b3-theme-on-surface-light);
  }

  .change-target-meta > div {
    display: flex;
    gap: 10px;
    margin-left: auto;
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
    background: color-mix(in srgb, var(--b3-theme-success) 12%, transparent);
    color: var(--b3-theme-success);
  }

  .kind-removed {
    background: color-mix(in srgb, var(--b3-theme-error) 12%, transparent);
    color: var(--b3-theme-error);
  }

  .kind-modified {
    background: color-mix(in srgb, var(--b3-card-warning-color, #e6a817) 12%, transparent);
    color: var(--b3-card-warning-color, #e6a817);
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
    font-size: $kb-fs-md;
    cursor: pointer;
    border: 1px solid transparent;
    transition:
      background $kb-dur-fast $kb-ease-out,
      opacity $kb-dur-fast $kb-ease-out,
      transform $kb-dur-fast $kb-ease-out;

    &:active {
      transform: scale(0.97);
    }
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

  .confirm-btn-danger {
    background: var(--b3-theme-error);
    color: var(--b3-theme-on-error, #fff);
  }

  @media (max-width: 640px) {
    .create-detail-row {
      grid-template-columns: 72px minmax(0, 1fr);
    }

    .confirmation-modal {
      width: 95vw;
    }
  }
</style>
