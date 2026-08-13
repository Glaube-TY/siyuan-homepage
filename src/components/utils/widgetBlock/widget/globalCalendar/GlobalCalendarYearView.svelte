<script lang="ts">
  import { formatCalendarDate, type GlobalCalendarEvent } from "@/features/global-calendar/global-calendar-types";
  interface Props { year: number; events: GlobalCalendarEvent[]; weekStartsOn?: 0 | 1; onSelectMonth: (month: number) => void }
  let { year, events, weekStartsOn = 1, onSelectMonth }: Props = $props();
  const weekdays = $derived(weekStartsOn ? ["一","二","三","四","五","六","日"] : ["日","一","二","三","四","五","六"]);
  const months = $derived.by(() => Array.from({ length: 12 }, (_, month) => {
    const first = new Date(year, month, 1); const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(year, month, 1 - offset);
    const cells = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); const key = formatCalendarDate(date); return { key, day: date.getDate(), current: date.getMonth() === month, count: events.filter((item) => item.date === key).length }; });
    return { month, cells, count: events.filter((item) => item.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length };
  }));
</script>
<div class="year-grid">
  {#each months as item}
    <button type="button" class="month-card" onclick={() => onSelectMonth(item.month)}>
      <header><strong>{item.month + 1} 月</strong>{#if item.count}<span>{item.count} 项</span>{/if}</header>
      <div class="mini-grid">{#each weekdays as day}<b>{day}</b>{/each}{#each item.cells as cell}<i class:outside={!cell.current} class:busy={cell.count > 0}>{cell.current ? cell.day : ""}{#if cell.count}<em>{Math.min(cell.count, 9)}</em>{/if}</i>{/each}</div>
    </button>
  {/each}
</div>
<style>
  .year-grid { display: grid; grid-template-columns: repeat(4, minmax(210px, 1fr)); gap: 12px; }
  .month-card { min-width: 0; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 13px; color: inherit; background: var(--b3-theme-surface); text-align: left; cursor: pointer; transition: transform 150ms ease, border-color 150ms ease; }
  .month-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color)); }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; } header strong { font-size: 15px; } header span { color: var(--b3-theme-primary); font-size: 10px; }
  .mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; } b, i { display: grid; height: 23px; place-items: center; font-size: 10px; font-style: normal; } b { height: 18px; color: var(--b3-theme-on-surface-light); font-weight: 500; }
  i { position: relative; border-radius: 6px; } i.busy { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent); font-weight: 700; } i.outside { opacity: 0; } em { position: absolute; top: -2px; right: -1px; font-size: 7px; font-style: normal; }
  @media (max-width: 1000px) { .year-grid { grid-template-columns: repeat(3, minmax(190px, 1fr)); } } @media (max-width: 720px) { .year-grid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } } @media (max-width: 440px) { .year-grid { grid-template-columns: 1fr; } }
</style>
