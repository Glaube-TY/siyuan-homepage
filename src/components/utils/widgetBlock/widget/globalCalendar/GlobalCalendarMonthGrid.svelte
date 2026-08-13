<script lang="ts">
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { getCalendarDateMetadata } from "@/utils/calendar-metadata";
  import {
    buildCalendarRangeSegments,
    calendarEventColor,
    eventOccursOn,
    isCalendarDateMarker,
    isCalendarRangeEvent,
  } from "@/features/global-calendar/global-calendar-layout";
  import {
    formatCalendarDate,
    type GlobalCalendarEvent,
    type GlobalCalendarTaskColorMode,
  } from "@/features/global-calendar/global-calendar-types";

  interface Props {
    year: number;
    month: number;
    events?: GlobalCalendarEvent[];
    selectedDate?: string;
    weekStartsOn?: 0 | 1;
    showAdjacentDays?: boolean;
    taskColorMode?: GlobalCalendarTaskColorMode;
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
    taskColorMode = "gradient",
    onSelectDate,
    onOpenEvent,
  }: Props = $props();

  const weekdays = $derived(weekStartsOn === 1
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]);
  const today = formatCalendarDate(new Date());
  const weeks = $derived.by(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(year, month, 1 - offset);
    return Array.from({ length: 6 }, (_, weekIndex) => {
      const cells = Array.from({ length: 7 }, (_, dayIndex) => {
        const date = new Date(start);
        date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
        const key = formatCalendarDate(date);
        const metadata = getCalendarDateMetadata(date);
        const markers = events.filter((event) => event.date === key && isCalendarDateMarker(event));
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
          eventCount: events.filter((event) => eventOccursOn(event, key)).length,
          anniversary: markers.find((event) => event.source === "countdown"),
          diary: markers.find((event) => event.source === "diary"),
        };
      });
      return {
        cells,
        segments: buildCalendarRangeSegments(events.filter(isCalendarRangeEvent), cells.map((cell) => cell.key)),
      };
    });
  });

  function selectCell(event: KeyboardEvent | MouseEvent, date: string): void {
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    onSelectDate?.(date);
  }

  function segmentStyle(segment: ReturnType<typeof buildCalendarRangeSegments>[number]): string {
    const color = calendarEventColor(segment.event, taskColorMode);
    return `grid-column:${segment.startColumn}/span ${segment.span};grid-row:${segment.lane + 1};--event-color:${color}`;
  }
</script>

<div class="month-grid" role="grid" aria-label={`${year} 年 ${month + 1} 月日历`}>
  <div class="weekday-row" role="row">
    {#each weekdays as weekday}<div class="weekday" role="columnheader">{weekday}</div>{/each}
  </div>
  {#each weeks as week, weekIndex}
    <div class="week-row" role="row">
      {#each week.cells as cell, column (cell.key)}
        <div
          class="day-cell"
          class:outside={!cell.current}
          class:weekend={cell.weekend}
          class:today={cell.key === today}
          class:selected={cell.key === selectedDate}
          class:anniversary={Boolean(cell.anniversary)}
          class:last={column === 6}
          role="gridcell"
          tabindex={cell.current || showAdjacentDays ? 0 : -1}
          aria-label={`${cell.key}，${cell.eventCount} 项`}
          onclick={(event) => selectCell(event, cell.key)}
          onkeydown={(event) => selectCell(event, cell.key)}
        >
          {#if cell.current || showAdjacentDays}
            <div class="date-line">
              <span class="day-number" class:anniversary-date={Boolean(cell.anniversary)}>{#if cell.anniversary}<SiyuanIcon name="iconHeart" size={30} />{/if}<span>{cell.day}</span></span>
              <span class="date-meta">{#if cell.metaLabel}<span class:special={Boolean(cell.metadata.solarFestivalName || cell.metadata.lunarFestivalName || cell.metadata.solarTermName)}>{cell.metaLabel}</span>{/if}</span>
            </div>
            {#if cell.anniversary}<button type="button" class="anniversary-marker" title={cell.anniversary.title} onclick={(event) => { event.stopPropagation(); onOpenEvent?.(cell.anniversary!); }}><SiyuanIcon name="iconHeart" size={11} /><span>{cell.anniversary.title}</span></button>{/if}
            {#if cell.diary}<button type="button" class="diary-marker" title={`打开 ${cell.diary.title}`} aria-label={`打开 ${cell.diary.title}`} onclick={(event) => { event.stopPropagation(); onOpenEvent?.(cell.diary!); }}><SiyuanIcon name="iconFile" size={12} /></button>{/if}
          {/if}
        </div>
      {/each}
      <div class="range-layer" aria-label={`第 ${weekIndex + 1} 周事项`}>
        {#each week.segments.filter((segment) => segment.lane < 4) as segment (`${segment.event.id}:${segment.startColumn}`)}
          <button
            type="button"
            class="range-event source-{segment.event.source}"
            class:continues-before={segment.continuesBefore}
            class:continues-after={segment.continuesAfter}
            style={segmentStyle(segment)}
            title={segment.event.subtitle ? `${segment.event.title} · ${segment.event.subtitle}` : segment.event.title}
            onclick={(event) => { event.stopPropagation(); onOpenEvent?.(segment.event); }}
          >
            <span>{segment.event.title}</span>
            {#if segment.span > 1 && segment.event.subtitle}<small>{segment.event.subtitle}</small>{/if}
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .month-grid { display: grid; grid-template-rows: 34px repeat(6, minmax(94px, 1fr)); width: 100%; height: 100%; min-width: 0; min-height: 630px; border: 1px solid var(--b3-border-color); border-radius: 16px; background: var(--b3-theme-surface); box-shadow: 0 10px 28px color-mix(in srgb, var(--b3-theme-on-background) 6%, transparent); overflow: hidden; }
  .weekday-row, .week-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; }
  .weekday { display: flex; align-items: center; justify-content: center; color: var(--b3-theme-on-surface-light); background: color-mix(in srgb, var(--b3-theme-surface) 88%, var(--b3-theme-background)); border-bottom: 1px solid var(--b3-border-color); font-size: 12px; font-weight: 600; }
  .week-row { position: relative; min-height: 0; }
  .day-cell { position: relative; min-width: 0; min-height: 0; padding: 7px 8px; border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-surface); cursor: pointer; outline: none; overflow: hidden; transition: background-color 160ms ease, box-shadow 160ms ease; }
  .day-cell.last { border-right: 0; }
  .day-cell:hover { background: color-mix(in srgb, var(--b3-theme-primary) 4%, var(--b3-theme-surface)); }
  .day-cell:focus-visible { position: relative; z-index: 3; box-shadow: inset 0 0 0 2px var(--b3-theme-primary); }
  .day-cell.selected { background: color-mix(in srgb, var(--b3-theme-primary) 5%, var(--b3-theme-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 46%, transparent); }
  .day-cell.anniversary { background-color: var(--b3-theme-surface); background-image: repeating-linear-gradient(135deg, transparent 0 11px, color-mix(in srgb, var(--b3-theme-warning, #c98518) 13%, transparent) 11px 12px); }
  .day-cell.anniversary .day-number { color: color-mix(in srgb, var(--b3-theme-warning, #c98518) 82%, var(--b3-theme-on-background)); }
  .day-cell.outside { background: color-mix(in srgb, var(--b3-theme-background) 68%, var(--b3-theme-surface)); }
  .day-cell.outside .date-line { opacity: .48; }
  .date-line { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 5px; }
  .date-meta { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; overflow: hidden; color: var(--b3-theme-on-surface-light); font-size: 10px; white-space: nowrap; }
  .date-meta > span { overflow: hidden; text-overflow: ellipsis; }
  .date-meta > span.special { color: var(--b3-theme-primary); font-weight: 600; }
  .day-number { position: relative; display: inline-grid; width: 25px; height: 25px; flex: 0 0 25px; place-items: center; border-radius: 999px; font-size: 13px; font-weight: 650; }
  .day-number > span { position: relative; z-index: 1; }
  .anniversary-date :global(svg) { position: absolute; color: color-mix(in srgb, var(--b3-theme-warning, #c98518) 44%, transparent); }
  .weekend .day-number { color: var(--b3-theme-primary); }
  .today .day-number { color: var(--b3-theme-on-primary); background: var(--b3-theme-primary); }
  .anniversary-marker { position: absolute; z-index: 3; bottom: 6px; left: 7px; width: max-content; max-width: calc(100% - 42px); display: flex; min-width: 0; align-items: center; gap: 4px; padding: 2px 4px; border: 0; border-radius: 999px; color: color-mix(in srgb, var(--b3-theme-warning, #c98518) 92%, var(--b3-theme-on-background)); background: transparent; font: inherit; font-size: 9px; font-weight: 650; text-align: left; cursor: pointer; }
  .anniversary-marker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diary-marker { position: absolute; z-index: 4; right: 7px; bottom: 6px; display: inline-grid; width: 22px; height: 22px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: color-mix(in srgb, var(--b3-theme-success, #2e9d62) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--b3-theme-success, #2e9d62) 16%, var(--b3-theme-surface)); box-shadow: 0 2px 7px color-mix(in srgb, var(--b3-theme-success, #2e9d62) 14%, transparent); cursor: pointer; }
  .range-layer { position: absolute; z-index: 2; top: 38px; right: 0; left: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: 21px; gap: 3px 0; pointer-events: none; }
  .range-event { position: relative; min-width: 0; height: 21px; margin-inline: 3px; padding: 2px 7px; border: 0; border-radius: 6px; color: color-mix(in srgb, var(--event-color) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--event-color) 18%, var(--b3-theme-surface)); box-shadow: 0 1px 2px color-mix(in srgb, var(--event-color) 18%, transparent); font: inherit; font-size: 10px; text-align: left; cursor: pointer; pointer-events: auto; overflow: hidden; transition: filter 160ms ease, box-shadow 160ms ease; }
  .range-event:hover { filter: saturate(1.15); box-shadow: 0 3px 8px color-mix(in srgb, var(--event-color) 24%, transparent); }
  .range-event.continues-before { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .range-event.continues-after { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .range-event span { display: block; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .range-event small { position: absolute; right: 7px; color: inherit; opacity: .72; font-size: 9px; }
  @media (max-width: 880px) {
    .month-grid { grid-template-rows: 30px repeat(6, minmax(82px, 1fr)); min-height: 550px; }
    .day-cell { padding: 5px; }
    .date-meta > span { display: none; }
    .range-layer { top: 33px; grid-auto-rows: 20px; }
    .range-event { height: 20px; padding-inline: 5px; }
    .range-event small { display: none; }
  }
  @media (max-width: 560px) {
    .month-grid { grid-template-rows: 28px repeat(6, minmax(72px, 1fr)); min-height: 490px; }
    .weekday { font-size: 10px; }
    .day-number { width: 22px; height: 22px; flex-basis: 22px; font-size: 12px; }
    .range-layer { top: 30px; }
    .range-event { font-size: 9px; }
    .anniversary-marker { right: 29px; bottom: 4px; left: 4px; }
    .diary-marker { right: 4px; bottom: 4px; }
  }
</style>
