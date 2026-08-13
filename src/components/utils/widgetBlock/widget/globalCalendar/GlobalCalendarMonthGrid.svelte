<script lang="ts">
  import { getCalendarDateMetadata } from "@/utils/calendar-metadata";
  import { formatCalendarDate, type GlobalCalendarEvent } from "@/features/global-calendar/global-calendar-types";

  interface Props {
    year: number;
    month: number;
    events?: GlobalCalendarEvent[];
    selectedDate?: string;
    weekStartsOn?: 0 | 1;
    showAdjacentDays?: boolean;
    onSelectDate?: (date: string) => void;
    onOpenEvent?: (event: GlobalCalendarEvent) => void;
  }

  let {
    year,
    month,
    events = [],
    selectedDate = "",
    weekStartsOn = 1,
    showAdjacentDays = true,
    onSelectDate,
    onOpenEvent,
  }: Props = $props();

  const weekdays = $derived(weekStartsOn === 1
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]);
  const today = formatCalendarDate(new Date());
  const cells = $derived.by(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(year, month, 1 - offset);
    const eventMap = new Map<string, GlobalCalendarEvent[]>();
    for (const event of events) eventMap.set(event.date, [...(eventMap.get(event.date) || []), event]);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = formatCalendarDate(date);
      const metadata = getCalendarDateMetadata(date);
      return {
        key,
        day: date.getDate(),
        current: date.getMonth() === month,
        weekend: date.getDay() === 0 || date.getDay() === 6,
        metadata,
        metaLabel: metadata.solarFestivalName
          || metadata.lunarFestivalName
          || metadata.solarTermName
          || metadata.lunarDayName,
        events: eventMap.get(key) || [],
      };
    });
  });

  function selectCell(event: KeyboardEvent | MouseEvent, date: string): void {
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    onSelectDate?.(date);
  }

  function openEvent(domEvent: MouseEvent, item: GlobalCalendarEvent): void {
    domEvent.stopPropagation();
    onOpenEvent?.(item);
  }
</script>

<div class="month-grid" role="grid" aria-label={`${year} 年 ${month + 1} 月日历`}>
  {#each weekdays as weekday}
    <div class="weekday" role="columnheader">{weekday}</div>
  {/each}
  {#each cells as cell (cell.key)}
    <div
      class="day-cell"
      class:outside={!cell.current}
      class:weekend={cell.weekend}
      class:today={cell.key === today}
      class:selected={cell.key === selectedDate}
      role="gridcell"
      tabindex={cell.current || showAdjacentDays ? 0 : -1}
      aria-label={`${cell.key}，${cell.events.length} 项`}
      onclick={(event) => selectCell(event, cell.key)}
      onkeydown={(event) => selectCell(event, cell.key)}
    >
      {#if cell.current || showAdjacentDays}
        <div class="date-line">
          <span class="day-number">{cell.day}</span>
          {#if cell.metaLabel}<span class:special={Boolean(cell.metadata.solarFestivalName || cell.metadata.lunarFestivalName || cell.metadata.solarTermName)}>{cell.metaLabel}</span>{/if}
        </div>
        <div class="cell-events">
          {#each cell.events.slice(0, 3) as item (item.id)}
            <button
              type="button"
              class="event-chip source-{item.source}"
              style={item.color ? `--source-color:${item.color}` : undefined}
              title={item.subtitle ? `${item.title} · ${item.subtitle}` : item.title}
              onclick={(event) => openEvent(event, item)}
            >
              <span>{item.title}</span>{#if item.subtitle}<small>{item.subtitle}</small>{/if}
            </button>
          {/each}
          {#if cell.events.length > 3}
            <button type="button" class="more-button" onclick={(event) => selectCell(event, cell.key)}>还有 {cell.events.length - 3} 项</button>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: 34px repeat(6, minmax(88px, 1fr)); width: 100%; height: 100%; min-width: 0; min-height: 600px; border: 1px solid var(--b3-border-color); border-radius: 14px; background: var(--b3-theme-surface); overflow: hidden; }
  .weekday { display: flex; align-items: center; justify-content: center; color: var(--b3-theme-on-surface-light); background: color-mix(in srgb, var(--b3-theme-surface) 88%, var(--b3-theme-background)); border-bottom: 1px solid var(--b3-border-color); font-size: 12px; font-weight: 600; }
  .day-cell { min-width: 0; min-height: 0; padding: 7px; border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-surface); cursor: pointer; outline: none; overflow: hidden; transition: background-color 160ms ease, box-shadow 160ms ease; }
  .day-cell:nth-child(7n) { border-right: 0; }
  .day-cell:hover { background: color-mix(in srgb, var(--b3-theme-primary) 4%, var(--b3-theme-surface)); }
  .day-cell:focus-visible { position: relative; z-index: 2; box-shadow: inset 0 0 0 2px var(--b3-theme-primary); }
  .day-cell.selected { background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 52%, transparent); }
  .day-cell.outside { background: color-mix(in srgb, var(--b3-theme-background) 64%, var(--b3-theme-surface)); }
  .day-cell.outside .date-line, .day-cell.outside .cell-events { opacity: .48; }
  .date-line { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 5px; margin-bottom: 6px; }
  .date-line > span:last-child { min-width: 0; overflow: hidden; color: var(--b3-theme-on-surface-light); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .date-line > span.special { color: var(--b3-theme-primary); font-weight: 600; }
  .day-number { display: inline-grid; width: 25px; height: 25px; flex: 0 0 25px; place-items: center; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .weekend .day-number { color: var(--b3-theme-primary); }
  .today .day-number { color: var(--b3-theme-on-primary); background: var(--b3-theme-primary); }
  .cell-events { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
  .event-chip, .more-button { width: 100%; min-width: 0; border: 0; border-radius: 5px; font: inherit; text-align: left; cursor: pointer; }
  .event-chip { display: flex; align-items: center; gap: 5px; padding: 3px 6px; color: color-mix(in srgb, var(--source-color) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--source-color) 14%, var(--b3-theme-background)); border-left: 3px solid var(--source-color); font-size: 11px; }
  .event-chip:hover { background: color-mix(in srgb, var(--source-color) 22%, var(--b3-theme-background)); }
  .event-chip span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .event-chip small { flex: 0 0 auto; color: var(--b3-theme-on-surface-light); font-size: 9px; }
  .source-tasks { --source-color: var(--b3-theme-primary); }
  .source-diary { --source-color: var(--b3-theme-success, #2e9d62); }
  .source-countdown { --source-color: var(--b3-theme-warning, #c98518); }
  .source-schedule { --source-color: #9b6be3; }
  .more-button { padding: 2px 6px; color: var(--b3-theme-primary); background: transparent; font-size: 10px; font-weight: 600; }
  .more-button:hover { text-decoration: underline; }
  @media (max-width: 880px) {
    .month-grid { grid-template-rows: 30px repeat(6, minmax(76px, 1fr)); min-height: 520px; }
    .day-cell { padding: 5px; }
    .date-line { align-items: flex-start; flex-direction: column; gap: 0; margin-bottom: 3px; }
    .date-line > span:last-child { width: 100%; }
    .event-chip { padding-inline: 4px; }
    .event-chip small { display: none; }
    .cell-events .event-chip:nth-child(n + 3) { display: none; }
  }
  @media (max-width: 560px) {
    .month-grid { grid-template-rows: 28px repeat(6, minmax(68px, 1fr)); min-height: 460px; }
    .weekday { font-size: 10px; }
    .day-number { width: 22px; height: 22px; flex-basis: 22px; font-size: 12px; }
    .date-line > span:last-child { font-size: 9px; }
    .event-chip { font-size: 9px; }
    .cell-events .event-chip:nth-child(n + 2) { display: none; }
  }
</style>
