<script lang="ts">
  import { mount, onMount } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { svelteDialog } from "@/libs/dialog";
  import WidgetSemanticTitle from "@/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte";
  import { loadGlobalCalendarEvents } from "@/features/global-calendar/global-calendar-events";
  import {
    formatCalendarDate,
    getCalendarMonthRange,
    normalizeGlobalCalendarConfig,
    type GlobalCalendarEvent,
    type GlobalCalendarSource,
  } from "@/features/global-calendar/global-calendar-types";
  import GlobalCalendarChart from "./GlobalCalendarChart.svelte";
  import GlobalCalendarDetailDialog from "./GlobalCalendarDetailDialog.svelte";
  import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";

  interface Props {
    plugin: any;
    contentTypeJson?: string;
    placement?: string;
  }

  let { plugin, contentTypeJson = "{}", placement = "homepage" }: Props = $props();
  const parsed = $derived((() => {
    try { return JSON.parse(contentTypeJson); } catch { return {}; }
  })());
  const config = $derived(normalizeGlobalCalendarConfig(parsed.data));
  let year = $state(new Date().getFullYear());
  let month = $state(new Date().getMonth());
  let selectedDate = $state(formatCalendarDate(new Date()));
  let events = $state<GlobalCalendarEvent[]>([]);
  let failedSources = $state<GlobalCalendarSource[]>([]);
  let loading = $state(true);
  let loadToken = 0;
  let root: HTMLDivElement;
  let width = $state(360);
  let height = $state(320);
  let advancedEnabled = $state(false);

  const monthLabel = $derived(`${year} 年 ${month + 1} 月`);
  const compact = $derived(width < 330 || height < 285 || placement === "mobile");

  $effect(() => {
    year;
    month;
    config.sources;
    void reload();
  });

  async function reload(): Promise<void> {
    if (!advancedEnabled) { loading = false; return; }
    const token = ++loadToken;
    loading = true;
    const range = getCalendarMonthRange(year, month);
    const result = await loadGlobalCalendarEvents(plugin, range.start, range.end, config.sources);
    if (token !== loadToken) return;
    events = result.events;
    failedSources = result.failedSources;
    loading = false;
  }

  function changeMonth(delta: number): void {
    const next = new Date(year, month + delta, 1);
    year = next.getFullYear();
    month = next.getMonth();
    selectedDate = formatCalendarDate(next);
  }

  function openDetail(): void {
    if (!advancedEnabled) return;
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({
      title: "",
      mobileCloseControl: "content",
      width: "calc(100vw - 32px)",
      height: "calc(100vh - 40px)",
      constructor: (container) => mount(GlobalCalendarDetailDialog, {
        target: container,
        props: { plugin, config, initialDate: selectedDate, onClose: () => ref.close() },
      }),
    });
    ref.dialog.element.classList.add("global-calendar-dialog-host");
    if (ref.mobile) ref.dialog.element.classList.add("global-calendar-dialog-host--mobile");
  }

  function selectDate(date: string): void {
    selectedDate = date;
    openDetail();
  }

  onMount(() => {
    const enabled = () => { advancedEnabled = true; void reload(); };
    const disabled = () => { advancedEnabled = false; events = []; };
    window.addEventListener("homepage-advanced-ready", enabled);
    window.addEventListener("homepage-advanced-unavailable", disabled);
    advancedEnabled = Boolean(plugin?.ADVANCED);
    void reload();
    const observer = new ResizeObserver(([entry]) => {
      width = Math.round(entry.contentRect.width);
      height = Math.round(entry.contentRect.height);
    });
    observer.observe(root);
    return () => { observer.disconnect(); window.removeEventListener("homepage-advanced-ready", enabled); window.removeEventListener("homepage-advanced-unavailable", disabled); };
  });
</script>

<div class="global-calendar-widget" bind:this={root} data-widget-part="root" class:compact>
  {#if !advancedEnabled}
    <AdvancedFeatureLock compact title="全局日历" subtitle="汇总任务、日记和重要日期" icon="calendar" />
  {:else}
  <header class="widget-header" data-widget-part="header">
    <WidgetSemanticTitle
      widgetType="globalCalendar"
      configuredTitle={config.title}
      semanticLabel="全局日历"
      fallbackIcon="calendar"
    />
    <div class="widget-actions" data-widget-part="actions">
      <button type="button" title="上个月" aria-label="上个月" onclick={() => changeMonth(-1)}><SiyuanIcon name="previous" size={14} /></button>
      <button type="button" class="month-button" title="打开详细日历" onclick={openDetail}>{monthLabel}</button>
      <button type="button" title="下个月" aria-label="下个月" onclick={() => changeMonth(1)}><SiyuanIcon name="next" size={14} /></button>
    </div>
  </header>

  <div class="calendar-body" data-widget-part="body" aria-busy={loading}>
    <GlobalCalendarChart
      {year}
      {month}
      {events}
      {selectedDate}
      weekStartsOn={config.weekStartsOn}
      showAdjacentDays={config.showAdjacentDays}
      showEventCount={config.showEventCount}
      {compact}
      onSelectDate={selectDate}
    />
  </div>

  {#if failedSources.length}
    <button type="button" class="source-warning" title="部分数据来源读取失败，点击重试" onclick={reload}>
      <SiyuanIcon name="warning" size={13} />部分来源未载入
    </button>
  {/if}
  {/if}
</div>

<style>
  .global-calendar-widget { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 190px; display: flex; flex-direction: column; container-type: size; color: var(--b3-theme-on-background); overflow: hidden; }
  .widget-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 42px 4px 10px; }
  .widget-header :global(.widget-title) { margin: 0; min-width: 0; font-size: 14px; }
  .widget-actions { display: flex; align-items: center; gap: 3px; }
  .widget-actions button, .source-warning { border: 0; color: inherit; font: inherit; cursor: pointer; }
  .widget-actions button { min-width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 7px; background: transparent; }
  .widget-actions button:hover { background: color-mix(in srgb, var(--b3-theme-primary) 9%, transparent); color: var(--b3-theme-primary); }
  .widget-actions .month-button { display: block; padding: 0 6px; white-space: nowrap; font-weight: 600; }
  .calendar-body { flex: 1 1 190px; min-height: 170px; padding: 0 6px; }
  .source-warning { position: absolute; right: 8px; bottom: 7px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px; border-radius: 6px; color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 8%, var(--b3-theme-surface)); font-size: 10px; }
  .global-calendar-widget.compact .widget-header { padding-bottom: 0; }
  .global-calendar-widget.compact .widget-header :global(.widget-title) { display: none; }
  @container (max-height: 300px) { .calendar-body { min-height: 150px; } }
  @container (max-width: 300px) { .widget-header { padding-right: 38px; } .widget-actions .month-button { font-size: 11px; } }
</style>
