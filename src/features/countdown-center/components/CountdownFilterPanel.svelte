<script lang="ts">
  import {
    COUNTDOWN_EVENT_KINDS,
    COUNTDOWN_KIND_LABELS,
    COUNTDOWN_PRIORITY_LABELS,
    type CountdownCategoryRecord,
    type CountdownEventKind,
    type CountdownPriority,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    categories: CountdownCategoryRecord[];
    selectedKinds: CountdownEventKind[];
    selectedPriorities: CountdownPriority[];
    selectedCategories: string[];
    availableTags: string[];
    selectedTags: string[];
    calendars: Array<"solar" | "lunar">;
    recurrences: Array<"none" | "yearly">;
    statuses: Array<"today" | "next7" | "next30" | "expired">;
    linkedOnly: boolean;
    customOnly: boolean;
    onKinds: (value: CountdownEventKind[]) => void;
    onPriorities: (value: CountdownPriority[]) => void;
    onCategories: (value: string[]) => void;
    onTags: (value: string[]) => void;
    onCalendars: (value: Array<"solar" | "lunar">) => void;
    onRecurrences: (value: Array<"none" | "yearly">) => void;
    onStatuses: (
      value: Array<"today" | "next7" | "next30" | "expired">,
    ) => void;
    onLinkedOnly: (value: boolean) => void;
    onCustomOnly: (value: boolean) => void;
    onClose: () => void;
  }
  let {
    categories,
    selectedKinds,
    selectedPriorities,
    selectedCategories,
    availableTags,
    selectedTags,
    calendars,
    recurrences,
    statuses,
    linkedOnly,
    customOnly,
    onKinds,
    onPriorities,
    onCategories,
    onTags,
    onCalendars,
    onRecurrences,
    onStatuses,
    onLinkedOnly,
    onCustomOnly,
    onClose,
  }: Props = $props();
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
</script>

<aside class="shp-countdown-filter">
  <header>
    <strong>筛选</strong><CountdownIconButton
      name="close"
      label="关闭筛选"
      onclick={onClose}
    />
  </header>
  <section>
    <h4>类型</h4>
    <div>
      {#each COUNTDOWN_EVENT_KINDS as kind}<button
          type="button"
          aria-pressed={selectedKinds.includes(kind)}
          class:active={selectedKinds.includes(kind)}
          onclick={() => onKinds(toggle(selectedKinds, kind))}
          >{COUNTDOWN_KIND_LABELS[kind]}</button
        >{/each}
    </div>
  </section>
  {#if availableTags.length}<section>
      <h4>标签</h4>
      <div>
        {#each availableTags as tag}<button
            type="button"
            class:active={selectedTags.includes(tag)}
            aria-pressed={selectedTags.includes(tag)}
            onclick={() => onTags(toggle(selectedTags, tag))}>#{tag}</button
          >{/each}
      </div>
    </section>{/if}
  <section>
    <h4>日期属性</h4>
    <div>
      {#each [["solar", "公历"], ["lunar", "农历"]] as item}<button
          type="button"
          class:active={calendars.includes(item[0] as "solar" | "lunar")}
          aria-pressed={calendars.includes(item[0] as "solar" | "lunar")}
          onclick={() =>
            onCalendars(toggle(calendars, item[0] as "solar" | "lunar"))}
          >{item[1]}</button
        >{/each}{#each [["none", "一次性"], ["yearly", "每年重复"]] as item}<button
          type="button"
          class:active={recurrences.includes(item[0] as "none" | "yearly")}
          aria-pressed={recurrences.includes(item[0] as "none" | "yearly")}
          onclick={() =>
            onRecurrences(toggle(recurrences, item[0] as "none" | "yearly"))}
          >{item[1]}</button
        >{/each}
    </div>
  </section>
  <section>
    <h4>相对日期</h4>
    <div>
      {#each [["today", "今天"], ["next7", "未来 7 天"], ["next30", "未来 30 天"], ["expired", "已过期"]] as item}<button
          type="button"
          class:active={statuses.includes(item[0] as (typeof statuses)[number])}
          aria-pressed={statuses.includes(item[0] as (typeof statuses)[number])}
          onclick={() =>
            onStatuses(toggle(statuses, item[0] as (typeof statuses)[number]))}
          >{item[1]}</button
        >{/each}<button
        type="button"
        class:active={linkedOnly}
        aria-pressed={linkedOnly}
        onclick={() => onLinkedOnly(!linkedOnly)}>有关联笔记</button
      ><button
        type="button"
        class:active={customOnly}
        aria-pressed={customOnly}
        onclick={() => onCustomOnly(!customOnly)}>自定义提醒</button
      >
    </div>
  </section>
  <section>
    <h4>优先级</h4>
    <div>
      {#each ["high", "normal", "low"] as priority}<button
          type="button"
          aria-pressed={selectedPriorities.includes(
            priority as CountdownPriority,
          )}
          class:active={selectedPriorities.includes(
            priority as CountdownPriority,
          )}
          onclick={() =>
            onPriorities(
              toggle(selectedPriorities, priority as CountdownPriority),
            )}
          >{COUNTDOWN_PRIORITY_LABELS[priority as CountdownPriority]}</button
        >{/each}
    </div>
  </section>
  <section>
    <h4>分类</h4>
    <div>
      {#each categories as category}<button
          type="button"
          aria-pressed={selectedCategories.includes(category.id)}
          class:active={selectedCategories.includes(category.id)}
          onclick={() => onCategories(toggle(selectedCategories, category.id))}
          >{category.name}</button
        >{/each}
    </div>
  </section>
  <footer>
    <button
      type="button"
      class="b3-button b3-button--cancel"
      onclick={() => {
        onKinds([]);
        onPriorities([]);
        onCategories([]);
        onTags([]);
        onCalendars([]);
        onRecurrences([]);
        onStatuses([]);
        onLinkedOnly(false);
        onCustomOnly(false);
      }}>清空</button
    ><button type="button" class="b3-button b3-button--text" onclick={onClose}
      >完成</button
    >
  </footer>
</aside>

<style>
  .shp-countdown-filter {
    padding: 14px;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    display: grid;
    gap: 12px;
  }
  .shp-countdown-filter header,
  .shp-countdown-filter footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .shp-countdown-filter h4 {
    margin: 0 0 7px;
  }
  .shp-countdown-filter section > div {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  .shp-countdown-filter section button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--b3-border-color);
    border-radius: 18px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .shp-countdown-filter section button.active {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
  }
  .shp-countdown-filter footer {
    justify-content: flex-end;
    gap: 8px;
  }
</style>
