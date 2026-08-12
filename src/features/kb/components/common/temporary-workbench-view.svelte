<script lang="ts">
  import type { AgentTemporaryWorkbench } from "../../services/agent-workbench/tools/homepage/homepage-workbench.tool";
  import { navigateToReference, navigateToDocId } from "../../services/siyuan/reference-navigation";

  export let workbench: AgentTemporaryWorkbench;

  function handleClick(event: MouseEvent) {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-siyuan-doc-id], [data-siyuan-block-id]")
      : null;
    if (!target) return;
    const title = target.title || "工作台内容";
    if (target.dataset.siyuanDocId) {
      void navigateToDocId(target.dataset.siyuanDocId, title);
    } else if (target.dataset.siyuanBlockId) {
      void navigateToReference({
        index: 0,
        docTitle: title,
        headingPathText: "",
        sourceBlockIds: [target.dataset.siyuanBlockId],
        sourceType: "siyuan_doc",
      });
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="temporary-workbench-html" on:click={handleClick}>
  {@html workbench.html}
</div>

<style>
  .temporary-workbench-html { box-sizing: border-box; height: 100%; padding: 16px; overflow: auto; line-height: 1.5; }
  .temporary-workbench-html :global(.wb-grid),
  .temporary-workbench-html :global(.wb-grid-2),
  .temporary-workbench-html :global(.wb-grid-3) { display: grid; gap: 10px; }
  .temporary-workbench-html :global(.wb-grid) { grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); }
  .temporary-workbench-html :global(.wb-grid-2) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .temporary-workbench-html :global(.wb-grid-3) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .temporary-workbench-html :global(.wb-card),
  .temporary-workbench-html :global(.wb-stat) {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-surface);
  }
  .temporary-workbench-html :global(.wb-stat),
  .temporary-workbench-html :global(.wb-list) { display: grid; gap: 5px; }
  .temporary-workbench-html :global(.wb-list) { margin: 0; padding: 0; list-style: none; }
  .temporary-workbench-html :global(.wb-item) { padding: 7px 0; border-bottom: 1px solid var(--b3-border-color); }
  .temporary-workbench-html :global(.wb-item:last-child) { border-bottom: 0; }
  .temporary-workbench-html :global(.wb-value) { color: var(--b3-theme-on-surface); font-size: 20px; font-weight: 700; line-height: 1.2; }
  .temporary-workbench-html :global(.wb-label),
  .temporary-workbench-html :global(.wb-muted) { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .temporary-workbench-html :global(.wb-badge) {
    display: inline-flex;
    width: fit-content;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--b3-theme-background-light);
    font-size: 11px;
  }
  .temporary-workbench-html :global(.wb-accent) { color: var(--b3-theme-primary); }
  .temporary-workbench-html :global(.wb-warning) { color: var(--b3-card-warning-color, #a66b00); }
  .temporary-workbench-html :global(.wb-success) { color: var(--b3-card-success-color, #2f7d4f); }
  .temporary-workbench-html :global(.wb-danger) { color: var(--b3-theme-error); }
  .temporary-workbench-html :global(.wb-button) {
    min-height: 44px;
    padding: 7px 10px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
    border-radius: 8px;
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    color: var(--b3-theme-primary);
    font: inherit;
    cursor: pointer;
  }
  .temporary-workbench-html :global(.wb-button:hover),
  .temporary-workbench-html :global(.wb-button:focus-visible) {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 14%, var(--b3-theme-surface));
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 35%, transparent);
    outline-offset: 2px;
  }
  .temporary-workbench-html :global(.wb-compact) { padding: 6px; }
  @media (max-width: 620px) {
    .temporary-workbench-html :global(.wb-grid-2),
    .temporary-workbench-html :global(.wb-grid-3) { grid-template-columns: 1fr; }
  }
</style>
