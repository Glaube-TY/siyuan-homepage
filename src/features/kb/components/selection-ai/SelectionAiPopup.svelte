<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { runSelectionAiAction } from "../../services/selection-ai/selection-ai-runner";
  import {
    SELECTION_AI_ACTION_LABELS,
    SELECTION_AI_ACTION_TOOLTIPS,
  } from "../../services/selection-ai/selection-ai-defaults";
  import { mdToHtml } from "../../utils/md-to-html";
  import type {
    SelectionAiRect,
    SelectionAiRequest,
    SelectionAiToolbarSettings,
  } from "../../services/selection-ai/selection-ai-types";

  export let request: SelectionAiRequest;
  export let settings: SelectionAiToolbarSettings;
  export let anchorRect: SelectionAiRect | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  let loading = false;
  let resultText = "";
  let errorMessage = "";
  let outputTruncated = false;
  let abortController: AbortController | null = null;
  let popupEl: HTMLElement;
  let manualPosition: { left: number; top: number } | null = null;
  let dragging = false;
  let activePointerId: number | null = null;
  let dragOffset = { x: 0, y: 0 };

  $: currentSkill = (() => {
    if (request.skillId) {
      const byId = settings.skills.find((s) => s.id === request.skillId);
      if (byId) return byId;
    }
    return settings.skills.find((s) => s.builtInAction === request.action) ?? null;
  })();
  $: actionLabel = currentSkill?.name ?? SELECTION_AI_ACTION_LABELS[request.action];
  $: actionTip =
    currentSkill?.builtin && currentSkill.builtInAction
      ? SELECTION_AI_ACTION_TOOLTIPS[currentSkill.builtInAction] ?? ""
      : "";
  $: popupStyle = buildPopupStyle(anchorRect, manualPosition);
  $: resultHtml = mdToHtml(resultText || "");

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function buildPopupStyle(rect?: SelectionAiRect, position?: { left: number; top: number } | null): string {
    const width = Math.min(520, Math.max(320, window.innerWidth - 24));
    let left = position?.left ?? 12;
    let top = position?.top ?? 12;

    if (!position && rect) {
      left = rect.left;
      top = rect.bottom + 8;
      if (top > window.innerHeight * 0.72) {
        top = Math.max(12, rect.top - 360);
      }
    }

    left = clamp(left, 12, Math.max(12, window.innerWidth - width - 12));
    top = clamp(top, 12, Math.max(12, window.innerHeight - 96));
    return `left: ${left}px; top: ${top}px; width: ${width}px;`;
  }

  async function generate(): Promise<void> {
    abortController?.abort();
    abortController = new AbortController();
    loading = true;
    errorMessage = "";
    resultText = "";
    outputTruncated = false;

    const result = await runSelectionAiAction(request, settings, {
      signal: abortController.signal,
      onToken: (_token, fullText) => {
        resultText = fullText;
      },
    });

    if (result.stopped) {
      loading = false;
      return;
    }

    loading = false;
    if (result.error) {
      errorMessage = result.error;
      return;
    }
    resultText = result.text;
    outputTruncated = !!result.truncatedOutput;
  }

  async function copyResult(): Promise<void> {
    const text = resultText.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      showMessage("已复制", 2000);
    } catch {
      showMessage("复制失败", 3000);
    }
  }

  function closePopup(): void {
    abortController?.abort();
    onClose?.();
  }

  function safeSetPointerCapture(pointerId: number): void {
    try {
      popupEl?.setPointerCapture?.(pointerId);
    } catch {
      // 静默处理
    }
  }

  function safeReleasePointerCapture(pointerId: number): void {
    try {
      if (popupEl?.hasPointerCapture?.(pointerId)) {
        popupEl.releasePointerCapture?.(pointerId);
      }
    } catch {
      // 静默处理
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.isPrimary === false) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) return;
    if (!popupEl) return;

    event.preventDefault();
    const rect = popupEl.getBoundingClientRect();
    dragging = true;
    activePointerId = event.pointerId;
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    safeSetPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragging || activePointerId !== event.pointerId) return;
    const width = popupEl?.getBoundingClientRect().width ?? 520;
    manualPosition = {
      left: clamp(event.clientX - dragOffset.x, 12, Math.max(12, window.innerWidth - width - 12)),
      top: clamp(event.clientY - dragOffset.y, 12, Math.max(12, window.innerHeight - 96)),
    };
  }

  function stopDragging(pointerId?: number): void {
    if (!dragging && activePointerId === null) return;
    const id = pointerId ?? activePointerId;
    dragging = false;
    activePointerId = null;
    if (id !== null) {
      safeReleasePointerCapture(id);
    }
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (loading) return;
    const target = event.target as Node | null;
    if (target && popupEl?.contains(target)) return;
    closePopup();
  }

  onMount(() => {
    void generate();
    setTimeout(() => {
      document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    }, 0);
  });

  onDestroy(() => {
    abortController?.abort();
    stopDragging();
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  });
</script>

<div
  class="shp-selection-ai-popup"
  bind:this={popupEl}
  style={popupStyle}
  role="dialog"
  tabindex="-1"
  aria-label={`AI ${actionLabel}`}
  on:pointermove={handlePointerMove}
  on:pointerup={(e) => stopDragging(e.pointerId)}
  on:pointercancel={(e) => stopDragging(e.pointerId)}
  on:lostpointercapture={() => stopDragging()}
>
  <div
    class="popup-header"
    role="presentation"
    on:pointerdown={handlePointerDown}
  >
    <div class="popup-title">
      <span class="sparkle">AI</span>
      <span>{actionLabel}</span>
    </div>
    <button type="button" class="icon-btn" title="关闭" on:click={closePopup}>×</button>
  </div>

  {#if actionTip || request.context.truncated}
    <div class="popup-meta">
      {#if actionTip}
        <span>{actionTip}</span>
      {/if}
      {#if request.context.truncated}
        <span class="warning">选中文字较长，已截断后发送</span>
      {/if}
    </div>
  {/if}

  <div class="popup-body">
    {#if loading && !resultText}
      <div class="loading">生成中...</div>
    {:else if errorMessage}
      <div class="error">
        <div>生成失败：{errorMessage}</div>
      </div>
    {:else}
      <div class="shp-selection-ai-markdown-content">{@html resultHtml}</div>
      {#if outputTruncated}
        <div class="warning inline">结果较长，已按设置截断显示。</div>
      {/if}
    {/if}
  </div>

  <div class="popup-actions">
    <button type="button" class="action-btn" disabled={!resultText.trim()} on:click={copyResult}>复制</button>
    <button type="button" class="action-btn" disabled={loading} on:click={generate}>重新生成</button>
    <button type="button" class="action-btn muted" on:click={closePopup}>关闭</button>
  </div>
</div>

<style>
  .shp-selection-ai-popup {
    position: fixed;
    z-index: 9999;
    max-width: calc(100vw - 24px);
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-background, #1f2329);
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.22);
    font-family: var(--b3-font-family, system-ui, sans-serif);
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    background: var(--b3-theme-surface, #f8f8f8);
    cursor: move;
    user-select: none;
    touch-action: none;
  }

  .popup-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .sparkle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    min-width: 28px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--b3-theme-primary-light, rgba(64, 144, 255, 0.14));
    color: var(--b3-theme-primary, #3578e5);
    font-size: 11px;
    font-weight: 700;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--b3-theme-on-surface-light, #666);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }

  .icon-btn:hover {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.06));
    color: var(--b3-theme-on-surface, #222);
  }

  .popup-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    color: var(--b3-theme-on-surface-light, #666);
    font-size: 12px;
    line-height: 1.5;
  }

  .warning {
    color: var(--b3-card-warning-color, #b7791f);
  }

  .warning.inline {
    margin-top: 8px;
    font-size: 12px;
  }

  .popup-body {
    min-height: 120px;
    max-height: calc(60vh - 116px);
    overflow: auto;
    padding: 12px;
    font-size: 13px;
    line-height: 1.65;
  }

  .shp-selection-ai-markdown-content {
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .shp-selection-ai-markdown-content :global(:first-child) {
    margin-top: 0;
  }

  .shp-selection-ai-markdown-content :global(:last-child) {
    margin-bottom: 0;
  }

  .shp-selection-ai-markdown-content :global(h1),
  .shp-selection-ai-markdown-content :global(h2),
  .shp-selection-ai-markdown-content :global(h3),
  .shp-selection-ai-markdown-content :global(h4),
  .shp-selection-ai-markdown-content :global(h5),
  .shp-selection-ai-markdown-content :global(h6) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .shp-selection-ai-markdown-content :global(h1) { font-size: 1.4em; }
  .shp-selection-ai-markdown-content :global(h2) { font-size: 1.25em; }
  .shp-selection-ai-markdown-content :global(h3) { font-size: 1.12em; }

  .shp-selection-ai-markdown-content :global(p) {
    margin: 0.5em 0;
  }

  .shp-selection-ai-markdown-content :global(ul),
  .shp-selection-ai-markdown-content :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .shp-selection-ai-markdown-content :global(li) {
    margin: 0.25em 0;
  }

  .shp-selection-ai-markdown-content :global(strong) {
    font-weight: 600;
  }

  .shp-selection-ai-markdown-content :global(em) {
    font-style: italic;
  }

  .shp-selection-ai-markdown-content :global(code) {
    padding: 0.15em 0.35em;
    border-radius: 3px;
    background: var(--b3-theme-surface, #f5f5f5);
    font-family: var(--b3-font-family-code, monospace);
    font-size: 0.92em;
  }

  .shp-selection-ai-markdown-content :global(pre) {
    margin: 0.75em 0;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--b3-theme-surface, #f5f5f5);
    overflow-x: auto;
    max-width: 100%;
  }

  .shp-selection-ai-markdown-content :global(pre code) {
    padding: 0;
    background: transparent;
    font-size: 0.88em;
  }

  .shp-selection-ai-markdown-content :global(blockquote) {
    margin: 0.75em 0;
    padding: 4px 12px;
    border-left: 3px solid var(--b3-theme-primary, #4285f4);
    color: var(--b3-theme-on-surface-light, #666);
  }

  .shp-selection-ai-markdown-content :global(table) {
    margin: 0.75em 0;
    border-collapse: collapse;
    width: 100%;
    max-width: 100%;
    font-size: 0.92em;
  }

  .shp-selection-ai-markdown-content :global(th),
  .shp-selection-ai-markdown-content :global(td) {
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    text-align: left;
  }

  .shp-selection-ai-markdown-content :global(th) {
    background: var(--b3-theme-surface, #f8f8f8);
    font-weight: 600;
  }

  .shp-selection-ai-markdown-content :global(a) {
    color: var(--b3-theme-primary, #4285f4);
    text-decoration: none;
  }

  .shp-selection-ai-markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .shp-selection-ai-markdown-content :global(hr) {
    margin: 1em 0;
    border: none;
    border-top: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
  }

  .loading,
  .error {
    color: var(--b3-theme-on-surface-light, #666);
  }

  .error {
    color: var(--b3-theme-error, #d94141);
  }

  .popup-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    background: var(--b3-theme-surface, #f8f8f8);
  }

  .action-btn {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--b3-border-color, rgba(0, 0, 0, 0.12));
    border-radius: 4px;
    background: var(--b3-theme-background, #fff);
    color: var(--b3-theme-on-surface, #222);
    cursor: pointer;
    font-size: 12px;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--b3-list-hover, rgba(0, 0, 0, 0.06));
  }

  .action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .action-btn.muted {
    color: var(--b3-theme-on-surface-light, #666);
  }
</style>
