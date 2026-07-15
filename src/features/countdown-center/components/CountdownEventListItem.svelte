<script lang="ts">
  import { formatCountdownDisplayDate } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
  import type {
    CountdownDisplayPreferences,
    CountdownEventViewModel,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    model: CountdownEventViewModel;
    displayPreferences: CountdownDisplayPreferences;
    selecting?: boolean;
    manual?: boolean;
    selected?: boolean;
    archived?: boolean;
    onSelect?: () => void;
    onEdit: () => void;
    onCopy: () => void;
    onOpenLinked?: () => void;
    onArchive: () => void;
    onDelete: () => void;
  }
  let {
    model,
    displayPreferences,
    selecting = false,
    manual = false,
    selected = false,
    archived = false,
    onSelect,
    onEdit,
    onCopy,
    onOpenLinked,
    onArchive,
    onDelete,
  }: Props = $props();
</script>

<article
  class="shp-countdown-event-item"
  data-event-id={model.event.id}
  style={`--shp-event-color:${model.color || "var(--b3-theme-primary)"}`}
>
  {#if selecting}<button
      type="button"
      class="shp-countdown-event-select"
      class:selected
      title="选择"
      aria-label="选择事件"
      aria-pressed={selected}
      onclick={onSelect}>{#if selected}<CountdownIcon
          name="check"
          size={16}
        />{/if}</button
    >{/if}
  {#if manual}<button
      type="button"
      class="shp-countdown-event-drag"
      title="拖拽排序"
      aria-label="拖拽排序"><CountdownIcon name="drag" /></button
    >{/if}
  <button type="button" class="shp-countdown-event-main" onclick={onEdit}>
    <span class="shp-countdown-event-symbol"
      ><CountdownIcon name={model.icon} /></span
    >
    <span class="shp-countdown-event-copy"
      ><strong>{model.displayName}</strong><small
        >{model.categoryLabel || "未分类"}{model.event.tags.length
          ? ` · ${model.event.tags.join("、")}`
          : ""}</small
      ><small
        >{formatCountdownDisplayDate(
          model.event,
          model.occurrence,
          displayPreferences,
        )}{model.countLabel ? ` · ${model.countLabel}` : ""}</small
      ></span
    >
    <span
      class="shp-countdown-event-relative"
      class:today={model.occurrence.status === "today"}
      class:expired={model.occurrence.status === "expired"}
      >{model.relativeLabel}<small
        >{model.event.priority === "high"
          ? "高优先级"
          : model.event.priority === "low"
            ? "低优先级"
            : ""}</small
      ></span
    >
  </button>
  <div class="shp-countdown-event-actions">
    <CountdownIconButton name="edit" label="编辑事件" onclick={onEdit} />
    {#if model.event.linkedBlockId && onOpenLinked}<CountdownIconButton
        name="external-link"
        label="打开关联笔记"
        onclick={onOpenLinked}
      />{/if}<CountdownIconButton
      name="copy"
      label="复制事件"
      onclick={onCopy}
    /><CountdownIconButton
      name={archived ? "archive-restore" : "archive"}
      label={archived ? "恢复事件" : "归档事件"}
      onclick={onArchive}
    /><CountdownIconButton
      name="delete"
      label="永久删除事件"
      danger
      onclick={onDelete}
    />
  </div>
</article>

<style>
  .shp-countdown-event-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--b3-border-color);
    border-left: 3px solid var(--shp-event-color);
    border-radius: 9px;
    background: var(--b3-theme-background);
    min-width: 0;
  }
  .shp-countdown-event-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .shp-countdown-event-symbol {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: color-mix(in srgb, var(--shp-event-color) 12%, transparent);
    color: var(--shp-event-color);
  }
  .shp-countdown-event-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .shp-countdown-event-copy strong,
  .shp-countdown-event-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .shp-countdown-event-copy small {
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }
  .shp-countdown-event-relative {
    display: grid;
    justify-items: end;
    gap: 2px;
    font-weight: 600;
    color: var(--b3-theme-primary);
    white-space: nowrap;
  }
  .shp-countdown-event-relative small {
    font-size: 10px;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-event-relative.today {
    color: var(--b3-theme-success);
  }
  .shp-countdown-event-relative.expired {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-event-actions {
    display: flex;
  }
  .shp-countdown-event-select,
  .shp-countdown-event-drag {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }
  .shp-countdown-event-select {
    border: 1px solid var(--b3-border-color);
    border-radius: 50%;
    width: 30px;
    height: 30px;
  }
  .shp-countdown-event-select.selected {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
  }
  .shp-countdown-event-drag {
    cursor: grab;
  }
  @media (max-width: 640px) {
    .shp-countdown-event-item {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .shp-countdown-event-main {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .shp-countdown-event-relative {
      grid-column: 2;
      justify-items: start;
    }
    .shp-countdown-event-actions {
      width: 100%;
      justify-content: flex-end;
      flex-direction: row;
      padding-top: 6px;
      border-top: 1px solid var(--b3-border-color);
    }
    .shp-countdown-event-actions :global(.shp-countdown-icon-button) {
      width: 36px;
      height: 36px;
    }
  }
</style>
