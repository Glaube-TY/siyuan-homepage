<script lang="ts">
  import { openDocs } from "@/components/tools/openDocs";
  import { showMessage } from "siyuan";
  import Sortable from "sortablejs";
  import {
    queryCountdownWidgetEvents,
    searchCountdownEvents,
    collectCountdownTags,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownQuery";
  import {
    DEFAULT_COUNTDOWN_WIDGET_VIEW,
    type CountdownCategoryRecord,
    type CountdownDisplayPreferences,
    type CountdownEventKind,
    type CountdownEventRecord,
    type CountdownPriority,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownEmptyState from "./CountdownEmptyState.svelte";
  import CountdownEventListItem from "./CountdownEventListItem.svelte";
  import CountdownFilterPanel from "./CountdownFilterPanel.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    plugin: any;
    events: CountdownEventRecord[];
    categories: CountdownCategoryRecord[];
    displayPreferences: CountdownDisplayPreferences;
    archived: boolean;
    customNotifyEventIds?: string[];
    onArchived: (value: boolean) => void;
    onAdd: () => void;
    onEdit: (event: CountdownEventRecord) => void;
    onCopy: (event: CountdownEventRecord) => void;
    onArchive: (event: CountdownEventRecord) => void;
    onDelete: (event: CountdownEventRecord) => void;
    onReorder: (eventIds: string[]) => Promise<void>;
    onBulk: (
      ids: string[],
      patch: {
        categoryId?: string | null;
        priority?: CountdownPriority;
        addTags?: string[];
        archived?: boolean;
      },
    ) => void;
  }
  let {
    plugin,
    events,
    categories,
    displayPreferences,
    archived,
    customNotifyEventIds = [],
    onArchived,
    onAdd,
    onEdit,
    onCopy,
    onArchive,
    onDelete,
    onReorder,
    onBulk,
  }: Props = $props();
  let search = $state("");
  let showFilter = $state(false);
  let kinds = $state<CountdownEventKind[]>([]);
  let priorities = $state<CountdownPriority[]>([]);
  let categoryIds = $state<string[]>([]);
  let tags = $state<string[]>([]);
  let calendars = $state<Array<"solar" | "lunar">>([]);
  let recurrences = $state<Array<"none" | "yearly">>([]);
  let statuses = $state<Array<"today" | "next7" | "next30" | "expired">>([]);
  let linkedOnly = $state(false);
  let customOnly = $state(false);
  let sortBy = $state<"nearest" | "priority" | "manual" | "name">("nearest");
  let selecting = $state(false);
  let selectedIds = $state<string[]>([]);
  let page = $state(1);
  let bulkCategory = $state("");
  let bulkPriority = $state<CountdownPriority>("normal");
  let bulkTags = $state("");
  let sorting = $state(false);
  const availableTags = $derived(collectCountdownTags(events));
  const models = $derived.by(() => {
    const originals = events.filter(
      (event) => Boolean(event.archived) === archived,
    );
    let source = archived
      ? originals.map((event) => ({ ...event, archived: false }))
      : originals;
    source = source.filter(
      (event) =>
        (!calendars.length || calendars.includes(event.calendar)) &&
        (!recurrences.length || recurrences.includes(event.recurrence)) &&
        (!linkedOnly || Boolean(event.linkedBlockId)) &&
        (!customOnly || customNotifyEventIds.includes(event.id)),
    );
    const originalById = new Map(originals.map((event) => [event.id, event]));
    return queryCountdownWidgetEvents(
      searchCountdownEvents(source, categories, search),
      categories,
      {
        ...DEFAULT_COUNTDOWN_WIDGET_VIEW,
        scopeMode: "filter",
        kinds,
        priorities,
        categoryIds,
        tags,
        sortBy,
        includePast: true,
        pastDays: 100000,
        maxItems: 1000,
      },
      new Date(),
      displayPreferences,
    )
      .filter(
        (model) =>
          !statuses.length ||
          statuses.some((status) =>
            status === "today"
              ? model.occurrence.daysDelta === 0
              : status === "next7"
                ? model.occurrence.daysDelta >= 0 &&
                  model.occurrence.daysDelta <= 7
                : status === "next30"
                  ? model.occurrence.daysDelta >= 0 &&
                    model.occurrence.daysDelta <= 30
                  : model.occurrence.status === "expired",
          ),
      )
      .map((model) => ({
        ...model,
        event: originalById.get(model.event.id) || model.event,
      }));
  });
  const pageCount = $derived(Math.max(1, Math.ceil(models.length / 100)));
  const shown = $derived(
    models.slice(
      (Math.min(page, pageCount) - 1) * 100,
      Math.min(page, pageCount) * 100,
    ),
  );
  function toggle(id: string): void {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
  }
  function apply(patch: Parameters<Props["onBulk"]>[1]): void {
    if (!selectedIds.length) return;
    onBulk(selectedIds, patch);
    selectedIds = [];
    selecting = false;
  }
  $effect(() => {
    const enabled = sortBy === "manual" && !archived && shown.length > 1;
    shown.map((item) => item.event.id).join("|");
    let sortable: Sortable | null = null;
    const timer = setTimeout(() => {
      const element = document.querySelector(
        ".countdown-center-dialog-host .shp-countdown-manager-list",
      ) as HTMLElement | null;
      if (!enabled || !element) return;
      sortable = Sortable.create(element, {
        animation: 140,
        handle: ".shp-countdown-event-drag",
        chosenClass: "shp-countdown-event-item--dragging",
        delay: 120,
        delayOnTouchOnly: true,
        onEnd: async () => {
          if (sorting) return;
          const ids = Array.from(
            element.querySelectorAll<HTMLElement>("[data-event-id]"),
            (item) => item.dataset.eventId || "",
          ).filter(Boolean);
          sorting = true;
          sortable?.option("disabled", true);
          try {
            await onReorder(ids);
          } catch (error) {
            showMessage(
              error instanceof Error ? error.message : "事件排序保存失败",
              5000,
              "error",
            );
          } finally {
            sorting = false;
            try {
              sortable?.option("disabled", false);
            } catch {
              // 数据重载可能已销毁旧 Sortable；新实例会按真实顺序创建。
            }
          }
        },
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      sortable?.destroy();
    };
  });
</script>

<div class="shp-countdown-manager">
  <div class="shp-countdown-manager-toolbar">
    <input
      class="b3-text-field"
      type="search"
      placeholder="搜索名称、备注、标签或分类"
      bind:value={search}
    /><CountdownIconButton
      name="filter"
      label="筛选纪念日"
      active={showFilter}
      onclick={() => (showFilter = !showFilter)}
    /><select class="b3-text-field" bind:value={sortBy} title="排序"
      ><option value="nearest">最近优先</option><option value="priority"
        >优先级</option
      ><option value="manual">手动顺序</option><option value="name">名称</option
      ></select
    >
    <div class="shp-countdown-manager-segment">
      <button
        type="button"
        class:active={!archived}
        onclick={() => onArchived(false)}>活动</button
      ><button
        type="button"
        class:active={archived}
        onclick={() => onArchived(true)}>归档</button
      >
    </div>
    <CountdownIconButton
      name="select"
      label="批量选择纪念日"
      active={selecting}
      onclick={() => {
        selecting = !selecting;
        selectedIds = [];
      }}
    /><CountdownIconButton name="add" label="新增纪念日" onclick={onAdd} />
  </div>
  {#if showFilter}<CountdownFilterPanel
      {categories}
      selectedKinds={kinds}
      selectedPriorities={priorities}
      selectedCategories={categoryIds}
      {availableTags}
      selectedTags={tags}
      {calendars}
      {recurrences}
      {statuses}
      {linkedOnly}
      {customOnly}
      onKinds={(value) => (kinds = value)}
      onPriorities={(value) => (priorities = value)}
      onCategories={(value) => (categoryIds = value)}
      onTags={(value) => (tags = value)}
      onCalendars={(value) => (calendars = value)}
      onRecurrences={(value) => (recurrences = value)}
      onStatuses={(value) => (statuses = value)}
      onLinkedOnly={(value) => (linkedOnly = value)}
      onCustomOnly={(value) => (customOnly = value)}
      onClose={() => (showFilter = false)}
    />{/if}
  {#if selecting}<div class="shp-countdown-manager-bulk">
      <strong>已选择 {selectedIds.length} 项</strong><select
        class="b3-text-field"
        bind:value={bulkCategory}
        ><option value="">移到未分类</option
        >{#each categories as category}<option value={category.id}
            >{category.name}</option
          >{/each}</select
      ><button
        type="button"
        onclick={() => apply({ categoryId: bulkCategory || null })}
        >应用分类</button
      ><select class="b3-text-field" bind:value={bulkPriority}
        ><option value="high">高优先级</option><option value="normal"
          >普通</option
        ><option value="low">低优先级</option></select
      ><button type="button" onclick={() => apply({ priority: bulkPriority })}
        >应用优先级</button
      ><input
        class="b3-text-field"
        placeholder="添加标签，逗号分隔"
        bind:value={bulkTags}
      /><button
        type="button"
        onclick={() =>
          apply({
            addTags: bulkTags
              .split(/[,，]/)
              .map((v) => v.trim())
              .filter(Boolean),
          })}>添加标签</button
      ><button type="button" onclick={() => apply({ archived: !archived })}
        >{archived ? "批量恢复" : "批量归档"}</button
      >
    </div>{/if}
  {#if models.length === 0}<CountdownEmptyState
      title={search || kinds.length || priorities.length || categoryIds.length
        ? "没有符合条件的事件"
        : archived
          ? "归档为空"
          : "还没有纪念日"}
      description={archived
        ? "归档的事件可在这里恢复或永久删除。"
        : "调整筛选条件，或添加一个新的重要日期。"}
      actionLabel={archived ? undefined : "新增纪念日"}
      onAction={archived ? undefined : onAdd}
    />{:else}<div class="shp-countdown-manager-list">
      {#each shown as model (model.event.id)}<CountdownEventListItem
          {model}
          {displayPreferences}
          {selecting}
          manual={sortBy === "manual"}
          selected={selectedIds.includes(model.event.id)}
          {archived}
          onSelect={() => toggle(model.event.id)}
          onEdit={() => onEdit(model.event)}
          onCopy={() => onCopy(model.event)}
          onOpenLinked={model.event.linkedBlockId
            ? () => openDocs(plugin, model.event.linkedBlockId!, 0)
            : undefined}
          onArchive={() => onArchive(model.event)}
          onDelete={() => onDelete(model.event)}
        />{/each}
    </div>
    {#if pageCount > 1}<nav class="shp-countdown-manager-pages">
        <CountdownIconButton
          name="chevron-left"
          label="上一页"
          disabled={page <= 1}
          onclick={() => (page -= 1)}
        /><span>{page} / {pageCount}</span><CountdownIconButton
          name="chevron-right"
          label="下一页"
          disabled={page >= pageCount}
          onclick={() => (page += 1)}
        />
      </nav>{/if}{/if}
</div>

<style>
  .shp-countdown-manager {
    display: grid;
    gap: 12px;
    padding: 14px;
  }
  .shp-countdown-manager-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .shp-countdown-manager-toolbar > input {
    flex: 1;
    min-width: 220px;
  }
  .shp-countdown-manager-segment {
    display: flex;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    overflow: hidden;
  }
  .shp-countdown-manager-segment button {
    height: 40px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    color: inherit;
  }
  .shp-countdown-manager-segment button.active {
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }
  .shp-countdown-manager-list {
    display: grid;
    gap: 8px;
  }
  .shp-countdown-manager-bulk {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    padding: 10px;
    border-radius: 8px;
    background: var(--b3-theme-surface);
  }
  .shp-countdown-manager-bulk button {
    min-height: 36px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    color: inherit;
  }
  .shp-countdown-manager-pages {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
  }
  @media (max-width: 700px) {
    .shp-countdown-manager {
      padding: 10px;
    }
    .shp-countdown-manager-toolbar > input {
      flex-basis: 100%;
    }
    .shp-countdown-manager-toolbar select {
      max-width: 120px;
    }
    .shp-countdown-manager-bulk {
      align-items: stretch;
    }
    .shp-countdown-manager-bulk > * {
      min-width: calc(50% - 7px);
      flex: 1;
    }
  }
</style>
