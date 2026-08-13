<script lang="ts">
  import { onMount, untrack } from "svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { openDocs } from "@/components/tools/openDocs";
  import { openCountdownCenterDialog } from "@/features/countdown-center";
  import { getCalendarDateMetadata } from "@/utils/calendar-metadata";
  import { loadGlobalCalendarEvents } from "@/features/global-calendar/global-calendar-events";
  import {
    GLOBAL_CALENDAR_SOURCES,
    formatCalendarDate,
    getCalendarMonthRange,
    type GlobalCalendarConfig,
    type GlobalCalendarEvent,
    type GlobalCalendarSource,
  } from "@/features/global-calendar/global-calendar-types";
  import GlobalCalendarMonthGrid from "./GlobalCalendarMonthGrid.svelte";

  interface Props {
    plugin: any;
    config: GlobalCalendarConfig;
    initialDate?: string;
    onClose: () => void;
  }

  let { plugin, config, initialDate = formatCalendarDate(new Date()), onClose }: Props = $props();
  const initial = new Date(`${untrack(() => initialDate)}T00:00:00`);
  let year = $state(Number.isNaN(initial.getTime()) ? new Date().getFullYear() : initial.getFullYear());
  let month = $state(Number.isNaN(initial.getTime()) ? new Date().getMonth() : initial.getMonth());
  let selectedDate = $state(untrack(() => initialDate));
  let dayPanelOpen = $state(false);
  let view = $state(untrack(() => config.defaultDetailView));
  let enabledSources = $state(untrack(() => ({ ...config.sources })));
  let events = $state<GlobalCalendarEvent[]>([]);
  let failedSources = $state<GlobalCalendarSource[]>([]);
  let loading = $state(true);
  let loadToken = 0;

  const sourceMeta: Record<string, { label: string }> = {
    tasks: { label: "任务" },
    diary: { label: "日记" },
    countdown: { label: "纪念日" },
  };
  const monthLabel = $derived(`${year} 年 ${month + 1} 月`);
  const selectedEvents = $derived(events.filter((event) => event.date === selectedDate));
  const selectedMetadata = $derived.by(() => {
    const date = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : getCalendarDateMetadata(date);
  });
  const agendaGroups = $derived.by(() => {
    const groups = new Map<string, GlobalCalendarEvent[]>();
    for (const event of events) groups.set(event.date, [...(groups.get(event.date) || []), event]);
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  });

  $effect(() => {
    year;
    month;
    enabledSources;
    void reload();
  });

  async function reload(): Promise<void> {
    const token = ++loadToken;
    loading = true;
    const range = getCalendarMonthRange(year, month);
    const result = await loadGlobalCalendarEvents(plugin, range.start, range.end, enabledSources);
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
    dayPanelOpen = false;
  }

  function goToday(): void {
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth();
    selectedDate = formatCalendarDate(today);
    dayPanelOpen = true;
  }

  function selectDate(date: string): void {
    selectedDate = date;
    dayPanelOpen = true;
  }

  function toggleSource(source: GlobalCalendarSource): void {
    enabledSources = { ...enabledSources, [source]: !enabledSources[source] };
  }

  function sourceLabel(source: GlobalCalendarSource): string {
    return sourceMeta[source]?.label || source;
  }

  function openEvent(event: GlobalCalendarEvent): void {
    if (event.target?.kind === "block") {
      openDocs(plugin, event.target.id, 0);
      onClose();
    } else if (event.target?.kind === "countdown") {
      void openCountdownCenterDialog(plugin, { initialTab: "events", eventId: event.target.eventId });
    }
  }

  onMount(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) selectedDate = formatCalendarDate(new Date());
  });
</script>

<div class="calendar-detail">
  <header class="detail-header">
    <div class="title-block">
      <span class="eyebrow">全局日历</span>
      <h2>{monthLabel}</h2>
    </div>
    <div class="primary-controls">
      <div class="month-nav" aria-label="月份导航">
        <button type="button" class="icon-button" title="上个月" aria-label="上个月" onclick={() => changeMonth(-1)}><SiyuanIcon name="previous" size={16} /></button>
        <button type="button" class="today-button" onclick={goToday}>今天</button>
        <button type="button" class="icon-button" title="下个月" aria-label="下个月" onclick={() => changeMonth(1)}><SiyuanIcon name="next" size={16} /></button>
      </div>
      <div class="view-switch" aria-label="日历视图">
        <button type="button" class:active={view === "month"} onclick={() => (view = "month")}>月历</button>
        <button type="button" class:active={view === "agenda"} onclick={() => (view = "agenda")}>日程</button>
      </div>
      <button type="button" class="icon-button close-button" title="关闭" aria-label="关闭" onclick={onClose}>
        <SiyuanIcon name="close" size={18} />
      </button>
    </div>
  </header>

  <div class="filter-bar">
    <span class="filter-label">显示</span>
    <div class="source-filters" aria-label="数据来源">
      {#each GLOBAL_CALENDAR_SOURCES as source}
        <button
          type="button"
          class="source-filter source-{source}"
          class:active={enabledSources[source as GlobalCalendarSource]}
          aria-pressed={enabledSources[source as GlobalCalendarSource]}
          onclick={() => toggleSource(source as GlobalCalendarSource)}
        >
          <span class="source-dot"></span>{sourceLabel(source)}
        </button>
      {/each}
    </div>
    {#if loading}<span class="loading-label">正在更新…</span>{/if}
  </div>

  {#if failedSources.length}
    <button type="button" class="source-warning" onclick={reload}>{failedSources.map(sourceLabel).join("、")}读取失败，点击重试</button>
  {/if}

  <main class:agenda-view={view === "agenda"}>
    {#if view === "month"}
      <section class="calendar-panel" aria-busy={loading}>
        <GlobalCalendarMonthGrid
          {year}
          {month}
          {events}
          {selectedDate}
          weekStartsOn={config.weekStartsOn}
          showAdjacentDays={config.showAdjacentDays}
          onSelectDate={selectDate}
          onOpenEvent={openEvent}
        />
      </section>
      {#if dayPanelOpen}
        <button class="panel-backdrop" type="button" aria-label="关闭当天详情" onclick={() => (dayPanelOpen = false)}></button>
        <aside class="day-panel" aria-label={`${selectedDate} 的事项`}>
          <div class="day-panel-header">
            <div>
              <strong>{selectedDate}</strong>
              {#if selectedMetadata}<span>{selectedMetadata.solarFestivalName || selectedMetadata.lunarFestivalName || selectedMetadata.solarTermName || selectedMetadata.lunarDayName}</span>{/if}
            </div>
            <button type="button" class="icon-button" title="关闭当天详情" aria-label="关闭当天详情" onclick={() => (dayPanelOpen = false)}><SiyuanIcon name="close" size={15} /></button>
          </div>
          <div class="event-list">
            {#each selectedEvents as event (event.id)}
              <button type="button" class="event-card source-{event.source}" onclick={() => openEvent(event)}>
                <span class="source-dot"></span>
                <span class="event-copy"><strong>{event.title}</strong>{#if event.subtitle}<small>{event.subtitle}</small>{/if}</span>
                {#if event.target}<SiyuanIcon name="open" size={14} />{/if}
              </button>
            {:else}
              <div class="empty-state"><SiyuanIcon name="calendar" size={28} /><span>当天暂无事项</span></div>
            {/each}
          </div>
        </aside>
      {/if}
    {:else}
      <section class="agenda-panel">
        {#each agendaGroups as [date, group]}
          <article class="agenda-day">
            <div class="agenda-date"><strong>{Number(date.slice(-2))}</strong><span>{date.slice(0, 7)}</span></div>
            <div class="agenda-events">
              {#each group as event (event.id)}
                <button type="button" class="event-card source-{event.source}" onclick={() => openEvent(event)}>
                  <span class="source-dot"></span>
                  <span class="event-copy"><strong>{event.title}</strong>{#if event.subtitle}<small>{event.subtitle}</small>{/if}</span>
                  <span class="source-name">{sourceLabel(event.source)}</span>
                  {#if event.target}<SiyuanIcon name="open" size={14} />{/if}
                </button>
              {/each}
            </div>
          </article>
        {:else}
          <div class="empty-state large"><SiyuanIcon name="calendar" size={34} /><span>本月暂无日历事项</span></div>
        {/each}
      </section>
    {/if}
  </main>
</div>

<style>
  .calendar-detail { position: relative; width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column; color: var(--b3-theme-on-background); background: var(--b3-theme-background); overflow: hidden; }
  .detail-header { display: flex; min-width: 0; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 18px 12px; border-bottom: 1px solid var(--b3-border-color); }
  .title-block { min-width: 150px; }
  .title-block h2 { margin: 2px 0 0; font-size: clamp(18px, 2vw, 24px); line-height: 1.2; }
  .eyebrow { color: var(--b3-theme-on-surface-light); font-size: 11px; letter-spacing: .08em; }
  .primary-controls, .month-nav, .view-switch, .source-filters { display: flex; min-width: 0; align-items: center; gap: 6px; }
  .primary-controls { justify-content: flex-end; flex-wrap: wrap; }
  button { color: inherit; font: inherit; }
  .icon-button, .today-button, .view-switch button, .source-filter { min-height: 36px; border: 1px solid var(--b3-border-color); border-radius: 9px; background: var(--b3-theme-surface); cursor: pointer; }
  .icon-button { width: 36px; flex: 0 0 36px; display: inline-grid; place-items: center; }
  .today-button, .view-switch button, .source-filter { padding: 6px 12px; white-space: nowrap; }
  .icon-button:hover, .today-button:hover, .view-switch button:hover, .source-filter:hover { border-color: color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface)); }
  .view-switch { padding: 3px; border-radius: 11px; background: color-mix(in srgb, var(--b3-theme-on-background) 5%, transparent); }
  .view-switch button { min-height: 32px; border: 0; background: transparent; }
  .view-switch button.active, .source-filter.active { color: var(--b3-theme-primary); border-color: color-mix(in srgb, var(--b3-theme-primary) 44%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface)); }
  .filter-bar { display: flex; min-width: 0; flex: 0 0 auto; align-items: center; gap: 10px; padding: 8px 18px; border-bottom: 1px solid var(--b3-border-color); background: color-mix(in srgb, var(--b3-theme-surface) 78%, var(--b3-theme-background)); }
  .filter-label, .loading-label { color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .source-filters { overflow-x: auto; scrollbar-width: none; }
  .source-filter { display: inline-flex; min-height: 30px; align-items: center; gap: 6px; padding: 4px 10px; }
  .source-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 999px; background: var(--source-color, var(--b3-theme-primary)); }
  .source-tasks { --source-color: var(--b3-theme-primary); }
  .source-diary { --source-color: var(--b3-theme-success, #2e9d62); }
  .source-countdown { --source-color: var(--b3-theme-warning, #c98518); }
  .loading-label { margin-left: auto; white-space: nowrap; }
  .source-warning { flex: 0 0 auto; margin: 8px 18px 0; padding: 7px 10px; border: 0; border-radius: 7px; color: var(--b3-theme-error); background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent); text-align: left; cursor: pointer; }
  main { flex: 1; min-height: 0; padding: 12px 18px 18px; overflow: auto; }
  main.agenda-view { padding-top: 14px; }
  .calendar-panel { width: 100%; height: 100%; min-width: 0; min-height: 600px; }
  .panel-backdrop { position: absolute; z-index: 10; inset: 0; border: 0; background: color-mix(in srgb, var(--b3-theme-on-background) 16%, transparent); cursor: default; }
  .day-panel { position: absolute; z-index: 11; top: 86px; right: 18px; bottom: 18px; width: min(360px, calc(100% - 36px)); display: flex; flex-direction: column; border: 1px solid var(--b3-border-color); border-radius: 14px; background: var(--b3-theme-surface); box-shadow: 0 18px 48px color-mix(in srgb, var(--b3-theme-on-background) 18%, transparent); overflow: hidden; }
  .day-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-bottom: 1px solid var(--b3-border-color); }
  .day-panel-header > div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .day-panel-header span { overflow: hidden; color: var(--b3-theme-on-surface-light); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .event-list, .agenda-events { display: flex; min-height: 0; flex-direction: column; gap: 8px; padding: 12px; overflow: auto; }
  .event-card { width: 100%; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 11px; border: 1px solid var(--b3-border-color); border-left: 4px solid var(--source-color); border-radius: 9px; background: var(--b3-theme-background); text-align: left; cursor: pointer; }
  .event-card:hover { background: color-mix(in srgb, var(--source-color) 6%, var(--b3-theme-background)); }
  .event-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .event-copy strong, .event-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .event-copy small, .source-name { color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .empty-state { flex: 1; min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--b3-theme-on-surface-light); }
  .empty-state.large { min-height: 360px; }
  .agenda-panel { min-height: 100%; border: 1px solid var(--b3-border-color); border-radius: 14px; background: var(--b3-theme-surface); overflow: hidden; }
  .agenda-day { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 14px; padding: 13px 16px; }
  .agenda-day + .agenda-day { border-top: 1px solid var(--b3-border-color); }
  .agenda-date { display: flex; flex-direction: column; align-items: center; padding-top: 5px; }
  .agenda-date strong { font-size: 24px; }
  .agenda-date span { color: var(--b3-theme-on-surface-light); font-size: 11px; }
  .agenda-events { padding: 0; overflow: visible; }
  @media (max-width: 700px) {
    .detail-header { align-items: flex-start; flex-direction: column; gap: 10px; padding: 12px 14px; }
    .title-block { width: 100%; }
    .primary-controls { width: 100%; justify-content: flex-start; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
    .close-button { margin-left: auto; }
    .filter-bar { padding-inline: 14px; }
    main { padding: 10px 10px 14px; }
    .calendar-panel { min-height: 500px; }
    .day-panel { top: auto; right: 8px; bottom: 8px; left: 8px; width: auto; max-height: min(68vh, 520px); }
    .agenda-day { grid-template-columns: 58px minmax(0, 1fr); padding-inline: 10px; }
    .source-name { display: none; }
  }
</style>
