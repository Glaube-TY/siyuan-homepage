<script lang="ts">
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { buildCalendarRangeSegments, calendarEventColor, isCalendarDateMarker, isCalendarRangeEvent } from "@/features/global-calendar/global-calendar-layout";
  import { addCalendarDays, formatCalendarDate, type GlobalCalendarEvent, type GlobalCalendarTaskColorMode } from "@/features/global-calendar/global-calendar-types";
  interface Props {
    mode: "day" | "week"; anchorDate: string; events: GlobalCalendarEvent[]; workdayStart?: number; workdayEnd?: number;
    onOpenEvent: (event: GlobalCalendarEvent) => void; onCreate: (date: string, time: string) => void;
    onCreateRange: (date: string, startTime: string, endTime: string) => void;
    onMove: (event: GlobalCalendarEvent, date: string, time: string) => void | Promise<void>;
    onResize: (event: GlobalCalendarEvent, endTime: string) => void | Promise<void>;
    taskColorMode?: GlobalCalendarTaskColorMode;
  }
  let { mode, anchorDate, events, workdayStart = 7, workdayEnd = 22, onOpenEvent, onCreate, onCreateRange, onMove, onResize, taskColorMode = "gradient" }: Props = $props();
  const SLOT = 30;
  const rowHeight = 28;
  const dates = $derived.by(() => {
    if (mode === "day") return [anchorDate];
    const base = new Date(`${anchorDate}T00:00:00`); const offset = (base.getDay() + 6) % 7; const monday = formatCalendarDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset));
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index));
  });
  const slots = $derived(Array.from({ length: Math.max(1, (workdayEnd - workdayStart) * 2) }, (_, index) => { const minutes = workdayStart * 60 + index * SLOT; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }));
  const allDay = $derived(events.filter((event) => event.allDay !== false || !event.startAt));
  const allDaySegments = $derived(buildCalendarRangeSegments(allDay.filter(isCalendarRangeEvent), dates));
  const dateMarkers = $derived(allDay.filter(isCalendarDateMarker));
  const timed = $derived(events.filter((event) => event.startAt && event.allDay === false));
  let selection = $state<{ date: string; anchor: number; start: number; end: number; pointerId: number } | null>(null);

  function eventStyle(event: GlobalCalendarEvent): string {
    const start = new Date(event.startAt!); const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 60 * 60000);
    const top = Math.max(0, ((start.getHours() * 60 + start.getMinutes()) - workdayStart * 60) / SLOT * rowHeight);
    const height = Math.max(rowHeight, (end.getTime() - start.getTime()) / 60000 / SLOT * rowHeight);
    return `top:${top}px;height:${height}px;--event-color:${calendarEventColor(event, taskColorMode)}`;
  }
  function allDayStyle(segment: ReturnType<typeof buildCalendarRangeSegments>[number]): string {
    const color = calendarEventColor(segment.event, taskColorMode);
    return `grid-column:${segment.startColumn}/span ${segment.span};grid-row:${segment.lane + 1};--event-color:${color}`;
  }
  function startDrag(dom: DragEvent, event: GlobalCalendarEvent): void { dom.dataTransfer?.setData("text/calendar-event", event.id); if (dom.dataTransfer) dom.dataTransfer.effectAllowed = "move"; }
  function drop(dom: DragEvent, date: string, time: string): void { dom.preventDefault(); const id = dom.dataTransfer?.getData("text/calendar-event"); const event = events.find((item) => item.id === id); if (event) void onMove(event, date, time); }
  function boundaryIndex(dom: PointerEvent): number { const rect = (dom.currentTarget as HTMLElement).getBoundingClientRect(); return Math.max(0, Math.min(slots.length, Math.round((dom.clientY - rect.top) / rowHeight))); }
  function boundaryTime(index: number): string { const minutes = workdayStart * 60 + index * SLOT; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
  function beginSelection(dom: PointerEvent, date: string): void {
    if (dom.button !== 0 || (dom.target as Element).closest(".timed-event")) return;
    const anchor = Math.min(slots.length - 1, boundaryIndex(dom));
    selection = { date, anchor, start: anchor, end: anchor + 1, pointerId: dom.pointerId };
    (dom.currentTarget as HTMLElement).setPointerCapture(dom.pointerId);
    dom.preventDefault();
  }
  function updateSelection(dom: PointerEvent): void {
    if (!selection || selection.pointerId !== dom.pointerId) return;
    const boundary = boundaryIndex(dom);
    const start = Math.min(selection.anchor, boundary);
    const end = Math.max(selection.anchor, boundary);
    selection = { ...selection, start, end: end === start ? Math.min(slots.length, start + 1) : end };
  }
  function finishSelection(dom: PointerEvent): void {
    if (!selection || selection.pointerId !== dom.pointerId) return;
    const current = selection;
    selection = null;
    onCreateRange(current.date, boundaryTime(current.start), boundaryTime(current.end));
  }
  function resizeStart(dom: PointerEvent, event: GlobalCalendarEvent): void {
    if (!event.editable || !event.endAt) return; dom.preventDefault(); dom.stopPropagation();
    const startY = dom.clientY; const original = new Date(event.endAt); let nextTime = event.endAt.slice(11, 16);
    const move = (pointer: PointerEvent) => { const steps = Math.round((pointer.clientY - startY) / rowHeight); const end = new Date(original.getTime() + steps * SLOT * 60000); const start = new Date(event.startAt!); if (end > start) nextTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`; };
    const up = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointermove", move); void onResize(event, nextTime); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  }
</script>

<div class="time-grid" style={`--columns:${dates.length};--row-height:${rowHeight}px`}>
  <div class="corner">GMT+8</div>{#each dates as date}<div class="day-head" class:anniversary={dateMarkers.some((event) => event.date === date && event.source === "countdown")}><strong>{Number(date.slice(-2))}</strong><span>{["周日","周一","周二","周三","周四","周五","周六"][new Date(`${date}T00:00:00`).getDay()]}</span><div class="day-markers">{#each dateMarkers.filter((event) => event.date === date && event.source === "countdown").slice(0, 1) as event (event.id)}<button type="button" class="anniversary-marker" title={event.title} onclick={() => onOpenEvent(event)}><SiyuanIcon name="iconHeart" size={10} /><span>{event.title}</span></button>{/each}{#each dateMarkers.filter((event) => event.date === date && event.source === "diary").slice(0, 1) as event (event.id)}<button type="button" class="diary-marker" title={`打开 ${event.title}`} aria-label={`打开 ${event.title}`} onclick={() => onOpenEvent(event)}><SiyuanIcon name="iconFile" size={11} /></button>{/each}</div></div>{/each}
  <div class="all-day-label">全天</div><div class="all-day-track">{#each allDaySegments as segment (`${segment.event.id}:${segment.startColumn}`)}<button type="button" draggable={segment.event.source === "tasks" || segment.event.editable} class:continues-before={segment.continuesBefore} class:continues-after={segment.continuesAfter} style={allDayStyle(segment)} ondragstart={(dom) => startDrag(dom, segment.event)} onclick={() => onOpenEvent(segment.event)}>{segment.event.title}</button>{/each}</div>
  <div class="times">{#each slots as time}<span>{time.endsWith(":00") ? time : ""}</span>{/each}</div>
  {#each dates as date}
    <div class="day-column" role="group" aria-label={`${date} 时间安排`} onpointerdown={(event) => beginSelection(event, date)} onpointermove={updateSelection} onpointerup={finishSelection} onpointercancel={() => (selection = null)}>
      {#each slots as time}<button type="button" class="slot" aria-label={`${date} ${time} 新建日程`} ondragover={(event) => event.preventDefault()} ondrop={(event) => drop(event, date, time)} onclick={(event) => event.detail === 0 && onCreate(date, time)}></button>{/each}
      {#if selection?.date === date}<div class="time-selection" style={`top:${selection.start * rowHeight}px;height:${(selection.end - selection.start) * rowHeight}px`}><span>{boundaryTime(selection.start)}–{boundaryTime(selection.end)}</span></div>{/if}
      {#each timed.filter((event) => event.date === date) as event (event.id)}
        <button type="button" class="timed-event" draggable={event.editable} style={eventStyle(event)} ondragstart={(dom) => startDrag(dom, event)} onclick={(dom) => { dom.stopPropagation(); onOpenEvent(event); }}>
          <strong>{event.title}</strong><small>{event.startAt?.slice(11,16)}–{event.endAt?.slice(11,16)}</small>
          {#if event.editable}<span class="resize-handle" role="separator" aria-orientation="horizontal" title="拖动调整时长" onpointerdown={(dom) => resizeStart(dom, event)}></span>{/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .time-grid { display: grid; grid-template-columns: 58px repeat(var(--columns), minmax(120px, 1fr)); min-width: calc(58px + var(--columns) * 120px); border: 1px solid var(--b3-border-color); border-radius: 13px; background: var(--b3-theme-surface); overflow: hidden; }
  .corner, .day-head, .all-day-label { min-height: 44px; display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .corner, .all-day-label { color: var(--b3-theme-on-surface-light); font-size: 10px; } .day-head { position: relative; gap: 5px; padding-bottom: 13px; } .day-head strong { font-size: 17px; } .day-head > span { color: var(--b3-theme-on-surface-light); font-size: 10px; }
  .day-head.anniversary { background-color: var(--b3-theme-surface); background-image: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--b3-theme-warning, #c98518) 9%, transparent) 5px 6px, transparent 6px 10px); background-position: top right; background-repeat: no-repeat; background-size: 36px 36px; }
  .day-markers { position: absolute; right: 4px; bottom: 3px; left: 4px; display: flex; justify-content: center; gap: 3px; overflow: hidden; }
  .day-markers button { min-width: 0; border: 0; cursor: pointer; }
  .anniversary-marker { display: flex; flex: 1; align-items: center; justify-content: center; gap: 3px; padding: 1px 4px; border-radius: 4px; color: color-mix(in srgb, var(--b3-theme-warning, #c98518) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--b3-theme-warning, #c98518) 15%, var(--b3-theme-surface)); font: inherit; font-size: 8px; font-weight: 650; }
  .anniversary-marker span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diary-marker { display: inline-grid; width: 18px; height: 18px; flex: 0 0 18px; padding: 0; place-items: center; border-radius: 5px; color: color-mix(in srgb, var(--b3-theme-success, #2e9d62) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--b3-theme-success, #2e9d62) 16%, var(--b3-theme-surface)); }
  .all-day-track { grid-column: 2 / -1; min-width: 0; min-height: 44px; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); grid-auto-rows: 22px; gap: 3px 0; padding: 4px 0; border-bottom: 1px solid var(--b3-border-color); box-sizing: border-box; }
  .all-day-track button { min-width: 0; height: 22px; margin-inline: 3px; padding: 3px 7px; border: 0; border-radius: 6px; color: color-mix(in srgb, var(--event-color) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--event-color) 18%, var(--b3-theme-surface)); box-shadow: 0 1px 2px color-mix(in srgb, var(--event-color) 18%, transparent); overflow: hidden; font: inherit; font-size: 10px; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .all-day-track button[draggable="true"] { cursor: grab; }
  .all-day-track button[draggable="true"]:active { cursor: grabbing; }
  .all-day-track button.continues-before { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .all-day-track button.continues-after { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .times { grid-column: 1; display: flex; flex-direction: column; } .times span { height: var(--row-height); flex: 0 0 var(--row-height); padding-right: 7px; color: var(--b3-theme-on-surface-light); border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 55%, transparent); font-size: 9px; line-height: 10px; text-align: right; }
  .day-column { position: relative; display: flex; flex-direction: column; border-right: 1px solid var(--b3-border-color); }
  .slot { height: var(--row-height); flex: 0 0 var(--row-height); padding: 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 55%, transparent); background: transparent; cursor: crosshair; } .slot:nth-child(2n) { border-bottom-color: var(--b3-border-color); } .slot:hover { background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent); }
  .time-selection { position: absolute; z-index: 3; right: 4px; left: 4px; display: grid; min-height: var(--row-height); place-items: start; padding: 5px 7px; border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 46%, var(--b3-border-color)); border-radius: 7px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 15%, var(--b3-theme-surface)); box-sizing: border-box; pointer-events: none; }
  .time-selection span { font-size: 10px; font-weight: 650; }
  .timed-event { position: absolute; z-index: 2; right: 4px; left: 4px; min-height: 24px; padding: 5px 7px; border: 1px solid color-mix(in srgb, var(--event-color) 34%, var(--b3-border-color)); border-radius: 7px; color: color-mix(in srgb, var(--event-color) 88%, var(--b3-theme-on-background)); background: color-mix(in srgb, var(--event-color) 17%, var(--b3-theme-surface)); box-shadow: 0 3px 9px color-mix(in srgb, var(--event-color) 16%, transparent); font: inherit; text-align: left; cursor: pointer; overflow: hidden; }
  .timed-event strong, .timed-event small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .timed-event strong { font-size: 11px; } .timed-event small { color: var(--b3-theme-on-surface-light); font-size: 9px; }
  .resize-handle { position: absolute; right: 4px; bottom: 1px; left: 4px; height: 5px; border-bottom: 2px solid color-mix(in srgb, var(--event-color) 65%, transparent); cursor: ns-resize; }
</style>
