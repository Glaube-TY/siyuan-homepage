<script lang="ts">
  import { addCalendarDays, formatCalendarDate, parseCalendarDate, type GlobalCalendarEvent } from "@/features/global-calendar/global-calendar-types";
  interface Props { startDate: string; days?: number; events: GlobalCalendarEvent[]; onOpenEvent: (event: GlobalCalendarEvent) => void }
  let { startDate, days = 31, events, onOpenEvent }: Props = $props();
  const dates = $derived(Array.from({ length: days }, (_, index) => addCalendarDays(startDate, index)));
  const ranged = $derived.by(() => {
    const seen = new Set<string>(); return events.filter((event) => { const key = event.entityId || event.id; if (!event.startAt || !event.endAt || seen.has(key)) return false; seen.add(key); return true; });
  });
  function diff(left: string, right: string): number { const a = parseCalendarDate(left); const b = parseCalendarDate(right); return a && b ? Math.round((b.getTime() - a.getTime()) / 86400000) : 0; }
  function barStyle(event: GlobalCalendarEvent): string { const start = event.startAt!.slice(0,10); const end = event.endAt!.slice(0,10); const offset = Math.max(0, diff(startDate, start)); const span = Math.max(1, diff(start < startDate ? startDate : start, end) + 1); return `left:${offset / days * 100}%;width:${Math.min(days - offset, span) / days * 100}%;--event-color:${event.color || "var(--b3-theme-primary)"}`; }
</script>
<div class="gantt" style={`--days:${days}`}>
  <div class="gantt-head"><strong>项目 / 任务</strong><div class="date-head">{#each dates as date}<span class:weekend={[0,6].includes(new Date(`${date}T00:00:00`).getDay())}>{Number(date.slice(-2))}</span>{/each}</div></div>
  {#each ranged as event (event.entityId || event.id)}
    <div class="gantt-row"><button type="button" class="row-title" onclick={() => onOpenEvent(event)}><small>{event.projectTitle || "未分组"}</small><strong>{event.title}</strong></button><div class="timeline">{#each dates as date}<i class:weekend={[0,6].includes(new Date(`${date}T00:00:00`).getDay())}></i>{/each}<button type="button" class="bar" style={barStyle(event)} onclick={() => onOpenEvent(event)}>{event.title}</button></div></div>
  {:else}<div class="empty">本月暂无带起止日期的任务或日程</div>{/each}
</div>
<style>
  .gantt { min-width: 880px; border: 1px solid var(--b3-border-color); border-radius: 13px; background: var(--b3-theme-surface); overflow: hidden; }
  .gantt-head, .gantt-row { display: grid; grid-template-columns: 220px minmax(660px, 1fr); } .gantt-head { min-height: 42px; align-items: stretch; border-bottom: 1px solid var(--b3-border-color); } .gantt-head > strong { display: flex; align-items: center; padding: 0 12px; font-size: 12px; }
  .date-head, .timeline { position: relative; display: grid; grid-template-columns: repeat(var(--days), minmax(20px, 1fr)); } .date-head span { display: grid; place-items: center; border-left: 1px solid var(--b3-border-color); color: var(--b3-theme-on-surface-light); font-size: 9px; } .weekend { background: color-mix(in srgb, var(--b3-theme-primary) 4%, transparent); }
  .gantt-row { min-height: 52px; border-bottom: 1px solid var(--b3-border-color); } .row-title { min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 7px 12px; border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; } .row-title small, .row-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .row-title small { color: var(--b3-theme-on-surface-light); font-size: 9px; } .row-title strong { font-size: 11px; }
  .timeline i { border-left: 1px solid color-mix(in srgb, var(--b3-border-color) 70%, transparent); } .bar { position: absolute; top: 12px; height: 28px; min-width: 12px; padding: 0 8px; border: 0; border-radius: 6px; color: white; background: var(--event-color); box-shadow: 0 2px 6px color-mix(in srgb, var(--event-color) 30%, transparent); overflow: hidden; font: inherit; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .empty { min-height: 300px; display: grid; place-items: center; color: var(--b3-theme-on-surface-light); }
</style>
