<script lang="ts">
  import { addCalendarDays, formatCalendarDate, type GlobalCalendarEvent } from "@/features/global-calendar/global-calendar-types";
  interface Props {
    mode: "day" | "week"; anchorDate: string; events: GlobalCalendarEvent[]; workdayStart?: number; workdayEnd?: number;
    onOpenEvent: (event: GlobalCalendarEvent) => void; onCreate: (date: string, time: string) => void;
    onMove: (event: GlobalCalendarEvent, date: string, time: string) => void | Promise<void>;
    onResize: (event: GlobalCalendarEvent, endTime: string) => void | Promise<void>;
  }
  let { mode, anchorDate, events, workdayStart = 7, workdayEnd = 22, onOpenEvent, onCreate, onMove, onResize }: Props = $props();
  const SLOT = 30;
  const rowHeight = 28;
  const dates = $derived.by(() => {
    if (mode === "day") return [anchorDate];
    const base = new Date(`${anchorDate}T00:00:00`); const offset = (base.getDay() + 6) % 7; const monday = formatCalendarDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset));
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index));
  });
  const slots = $derived(Array.from({ length: Math.max(1, (workdayEnd - workdayStart) * 2) }, (_, index) => { const minutes = workdayStart * 60 + index * SLOT; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }));
  const allDay = $derived(events.filter((event) => event.allDay !== false || !event.startAt));
  const timed = $derived(events.filter((event) => event.startAt && event.allDay === false));

  function eventStyle(event: GlobalCalendarEvent): string {
    const start = new Date(event.startAt!); const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 60 * 60000);
    const top = Math.max(0, ((start.getHours() * 60 + start.getMinutes()) - workdayStart * 60) / SLOT * rowHeight);
    const height = Math.max(rowHeight, (end.getTime() - start.getTime()) / 60000 / SLOT * rowHeight);
    return `top:${top}px;height:${height}px;--event-color:${event.color || "var(--b3-theme-primary)"}`;
  }
  function startDrag(dom: DragEvent, event: GlobalCalendarEvent): void { dom.dataTransfer?.setData("text/calendar-event", event.id); if (dom.dataTransfer) dom.dataTransfer.effectAllowed = "move"; }
  function drop(dom: DragEvent, date: string, time: string): void { dom.preventDefault(); const id = dom.dataTransfer?.getData("text/calendar-event"); const event = timed.find((item) => item.id === id); if (event?.editable) void onMove(event, date, time); }
  function resizeStart(dom: PointerEvent, event: GlobalCalendarEvent): void {
    if (!event.editable || !event.endAt) return; dom.preventDefault(); dom.stopPropagation();
    const startY = dom.clientY; const original = new Date(event.endAt); let nextTime = event.endAt.slice(11, 16);
    const move = (pointer: PointerEvent) => { const steps = Math.round((pointer.clientY - startY) / rowHeight); const end = new Date(original.getTime() + steps * SLOT * 60000); const start = new Date(event.startAt!); if (end > start) nextTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`; };
    const up = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointermove", move); void onResize(event, nextTime); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  }
</script>

<div class="time-grid" style={`--columns:${dates.length};--row-height:${rowHeight}px`}>
  <div class="corner">GMT+8</div>{#each dates as date}<div class="day-head"><strong>{Number(date.slice(-2))}</strong><span>{["周日","周一","周二","周三","周四","周五","周六"][new Date(`${date}T00:00:00`).getDay()]}</span></div>{/each}
  <div class="all-day-label">全天</div>{#each dates as date}<div class="all-day-cell">{#each allDay.filter((event) => event.date === date).slice(0, 3) as event}<button type="button" style={`--event-color:${event.color || "var(--b3-theme-primary)"}`} onclick={() => onOpenEvent(event)}>{event.title}</button>{/each}</div>{/each}
  <div class="times">{#each slots as time}<span>{time.endsWith(":00") ? time : ""}</span>{/each}</div>
  {#each dates as date}
    <div class="day-column">
      {#each slots as time}<button type="button" class="slot" aria-label={`${date} ${time} 新建日程`} ondragover={(event) => event.preventDefault()} ondrop={(event) => drop(event, date, time)} onclick={() => onCreate(date, time)}></button>{/each}
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
  .corner, .day-head, .all-day-label, .all-day-cell { min-height: 44px; display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .corner, .all-day-label { color: var(--b3-theme-on-surface-light); font-size: 10px; } .day-head { gap: 5px; } .day-head strong { font-size: 17px; } .day-head span { color: var(--b3-theme-on-surface-light); font-size: 10px; }
  .all-day-cell { min-width: 0; align-items: stretch; flex-direction: column; gap: 2px; padding: 4px; } .all-day-cell button { min-width: 0; padding: 3px 5px; border: 0; border-left: 3px solid var(--event-color); border-radius: 4px; color: inherit; background: color-mix(in srgb, var(--event-color) 12%, var(--b3-theme-background)); overflow: hidden; font: inherit; font-size: 10px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .times { grid-column: 1; display: flex; flex-direction: column; } .times span { height: var(--row-height); flex: 0 0 var(--row-height); padding-right: 7px; color: var(--b3-theme-on-surface-light); border-right: 1px solid var(--b3-border-color); border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 55%, transparent); font-size: 9px; line-height: 10px; text-align: right; }
  .day-column { position: relative; display: flex; flex-direction: column; border-right: 1px solid var(--b3-border-color); }
  .slot { height: var(--row-height); flex: 0 0 var(--row-height); padding: 0; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--b3-border-color) 55%, transparent); background: transparent; cursor: crosshair; } .slot:nth-child(2n) { border-bottom-color: var(--b3-border-color); } .slot:hover { background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent); }
  .timed-event { position: absolute; z-index: 2; right: 3px; left: 3px; min-height: 24px; padding: 4px 6px; border: 1px solid color-mix(in srgb, var(--event-color) 58%, var(--b3-border-color)); border-left: 4px solid var(--event-color); border-radius: 6px; color: inherit; background: color-mix(in srgb, var(--event-color) 16%, var(--b3-theme-background)); box-shadow: 0 2px 6px color-mix(in srgb, var(--b3-theme-on-background) 8%, transparent); font: inherit; text-align: left; cursor: pointer; overflow: hidden; }
  .timed-event strong, .timed-event small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .timed-event strong { font-size: 11px; } .timed-event small { color: var(--b3-theme-on-surface-light); font-size: 9px; }
  .resize-handle { position: absolute; right: 4px; bottom: 1px; left: 4px; height: 5px; border-bottom: 2px solid color-mix(in srgb, var(--event-color) 65%, transparent); cursor: ns-resize; }
</style>
