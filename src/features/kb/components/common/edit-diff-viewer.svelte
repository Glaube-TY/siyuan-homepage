<script lang="ts">
  import { escapeHtml } from "@/components/tools/mdToHtml";
  import type { EditDiffPreview, EditBlockDiffEntry, InlineDiffPart } from "../../services/doc-content-edit/doc-content-edit-types";

  export let editDiffPreview: EditDiffPreview | null = null;

  function isCollapsedPlaceholder(entry: EditBlockDiffEntry): boolean {
    return entry.status === "unchanged" && entry.oldBlock?.id === "__collapsed__";
  }

  function hasChanges(): boolean {
    if (!editDiffPreview) return false;
    if (editDiffPreview.noChanges) return false;
    const s = editDiffPreview.stats;
    return s.modifiedBlocks > 0 || s.addedBlocks > 0 || s.removedBlocks > 0;
  }

  function buildStatsText(): string {
    if (!editDiffPreview) return "";
    const s = editDiffPreview.stats;
    const parts: string[] = [];
    if (s.modifiedBlocks > 0) parts.push(`修改 ${s.modifiedBlocks} 块`);
    if (s.addedBlocks > 0) parts.push(`新增 ${s.addedBlocks} 块`);
    if (s.removedBlocks > 0) parts.push(`删除 ${s.removedBlocks} 块`);
    if (s.addedLines > 0) parts.push(`+${s.addedLines} 行`);
    if (s.removedLines > 0) parts.push(`−${s.removedLines} 行`);
    return parts.join("，");
  }

  function splitLines(text: string): string[] {
    return text.split("\n");
  }

  function renderInlineParts(
    parts: InlineDiffPart[] | undefined,
    lineText: string,
    lineIndex: number,
  ): string {
    if (!parts || parts.length === 0) return escapeHtml(lineText);
    let currentLine = 0;
    let result = "";
    for (const p of parts) {
      const subLines = p.text.split("\n");
      for (let li = 0; li < subLines.length; li++) {
        if (currentLine === lineIndex) {
          if (p.kind === "same") {
            result += escapeHtml(subLines[li]);
          } else {
            result += `<span class="inline-diff-${p.kind}">${escapeHtml(subLines[li])}</span>`;
          }
        }
        if (li < subLines.length - 1) currentLine++;
      }
    }
    return result || escapeHtml(lineText);
  }

</script>

{#if editDiffPreview}
  <div class="diff-viewer">
    <!-- Fixed header: summary + stats only -->
    <div class="diff-header">
      <div class="diff-header-summary">{editDiffPreview.summary}</div>
      <div class="diff-header-meta">
        {#if hasChanges()}
          <span class="stat stat-changes">{buildStatsText()}</span>
        {:else}
          <span class="stat stat-unchanged">未检测到内容变化</span>
        {/if}
        {#if editDiffPreview.truncated}
          <span class="stat stat-truncated">内容已截断</span>
        {/if}
      </div>
    </div>

    <!-- Scrollable body -->
    <div class="diff-body">
      {#if !hasChanges()}
        <div class="no-changes-hint">
          未检测到内容变化，当前内容与拟写入内容相同。
        </div>
      {:else}
        <div class="unified-diff">
          {#each editDiffPreview.entries as entry}
            {#if isCollapsedPlaceholder(entry)}
              <div class="diff-collapsed">
                <span>{entry.oldBlock?.text ?? ""}</span>
              </div>
            {:else if entry.status === "modified"}
              <div class="diff-block-sep"></div>
              {#each splitLines(entry.oldBlock?.text ?? "") as line, i}
                <div class="diff-line line-removed">
                  <span class="line-prefix">−</span>
                  <span class="line-content">{@html renderInlineParts(entry.oldParts, line, i)}</span>
                </div>
              {/each}
              {#each splitLines(entry.newBlock?.text ?? "") as line, i}
                <div class="diff-line line-added">
                  <span class="line-prefix">+</span>
                  <span class="line-content">{@html renderInlineParts(entry.newParts, line, i)}</span>
                </div>
              {/each}
            {:else if entry.status === "added"}
              <div class="diff-block-sep"></div>
              {#each splitLines(entry.newBlock?.text ?? "") as line, i}
                <div class="diff-line line-added">
                  <span class="line-prefix">+</span>
                  <span class="line-content">{@html renderInlineParts(entry.newParts, line, i)}</span>
                </div>
              {/each}
            {:else if entry.status === "removed"}
              <div class="diff-block-sep"></div>
              {#each splitLines(entry.oldBlock?.text ?? "") as line, i}
                <div class="diff-line line-removed">
                  <span class="line-prefix">−</span>
                  <span class="line-content">{@html renderInlineParts(entry.oldParts, line, i)}</span>
                </div>
              {/each}
            {:else}
              {#each splitLines(entry.oldBlock?.text ?? entry.newBlock?.text ?? "") as line}
                <div class="diff-line line-unchanged">
                  <span class="line-prefix">&nbsp;</span>
                  <span class="line-content">{line}</span>
                </div>
              {/each}
            {/if}
          {/each}
          {#if editDiffPreview.truncated}
            <div class="truncated-hint">内容已截断</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .diff-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .diff-header {
    padding: 8px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
  }

  .diff-header-summary {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-bottom: 4px;
  }

  .diff-header-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .stat {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .stat-changes {
    color: var(--b3-theme-on-surface);
    font-weight: 600;
  }

  .stat-unchanged {
    color: var(--b3-theme-on-surface-light);
  }

  .stat-truncated {
    background: rgba(248, 81, 73, 0.10);
    color: #c62828;
    font-weight: 600;
  }

  .diff-body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .no-changes-hint {
    text-align: center;
    padding: 40px 16px;
    color: var(--b3-theme-on-surface-light);
    font-size: 13px;
  }

  .unified-diff {
    font-family: var(--b3-font-family-code), monospace;
    font-size: 12px;
    line-height: 1.6;
  }

  .diff-collapsed {
    text-align: center;
    padding: 5px 12px;
    color: var(--b3-theme-on-surface-light);
    font-size: 11px;
    font-style: italic;
    background: var(--b3-theme-surface);
    border-top: 1px dashed var(--b3-border-color);
    border-bottom: 1px dashed var(--b3-border-color);
  }

  .diff-block-sep {
    height: 4px;
    background: var(--b3-theme-surface);
    border-top: 1px solid var(--b3-border-color);
    border-bottom: 1px solid var(--b3-border-color);
  }

  .diff-line {
    display: flex;
    padding: 1px 10px;
    min-height: 21px;
  }

  .line-prefix {
    flex-shrink: 0;
    width: 20px;
    text-align: center;
    font-weight: 700;
    user-select: none;
    color: var(--b3-theme-on-surface-light);
    opacity: 0.45;
  }

  .line-content {
    flex: 1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .line-removed {
    background: rgba(248, 81, 73, 0.06);
  }

  .line-added {
    background: rgba(46, 160, 67, 0.06);
  }

  .line-unchanged {
    background: transparent;
  }

  :global(.inline-diff-removed) {
    background: rgba(248, 81, 73, 0.25);
    border-radius: 3px;
    padding: 0 2px;
  }

  :global(.inline-diff-added) {
    background: rgba(46, 160, 67, 0.25);
    border-radius: 3px;
    padding: 0 2px;
  }

  .truncated-hint {
    padding: 6px 8px;
    font-size: 11px;
    color: #c62828;
    text-align: center;
    border-top: 1px dashed var(--b3-border-color);
  }
</style>
