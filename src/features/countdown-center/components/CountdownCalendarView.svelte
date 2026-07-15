<script lang="ts">
  import { SolarDay } from "tyme4ts";
  import {
    getCountdownOccurrencesInRange,
    formatCountdownSolarDate,
    formatLocalDate,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
  import type {
    CountdownDisplayPreferences,
    CountdownEventRecord,
  } from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
  import CountdownEmptyState from "./CountdownEmptyState.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    events: CountdownEventRecord[];
    displayPreferences: CountdownDisplayPreferences;
    showLunar: boolean;
    mobile: boolean;
    onEdit: (event: CountdownEventRecord) => void;
  }
  let {
    events,
    displayPreferences,
    showLunar,
    mobile,
    onEdit,
  }: Props = $props();
  let cursor = $state(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  let selected = $state(formatLocalDate(new Date()));
  const cells = $derived.by(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(
      first.getFullYear(),
      first.getMonth(),
      1 - first.getDay(),
    );
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 41,
    );
    const occurrences = new Map<string, CountdownEventRecord[]>();
    for (const event of events.filter((item) => !item.archived))
      for (const occurrence of getCountdownOccurrencesInRange(
        event,
        start,
        end,
      )) {
        const list = occurrences.get(occurrence.localDate) ?? [];
        list.push(event);
        occurrences.set(occurrence.localDate, list);
      }
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + index,
      );
      let lunar = "";
      if (showLunar)
        try {
          lunar = SolarDay.fromYmd(
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
          )
            .getLunarDay()
            .getName();
        } catch {}
      return {
        date,
        key: formatLocalDate(date),
        current: date.getMonth() === cursor.getMonth(),
        today: formatLocalDate(date) === formatLocalDate(new Date()),
        lunar,
        events: occurrences.get(formatLocalDate(date)) ?? [],
      };
    });
  });
  const selectedEvents = $derived(
    cells.find((cell) => cell.key === selected)?.events ?? [],
  );
  const selectedLabel = $derived(
    formatCountdownSolarDate(selected, displayPreferences, false),
  );
  function move(offset: number): void {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
  }
  function today(): void {
    const now = new Date();
    cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    selected = formatLocalDate(now);
  }
</script>

<div class="shp-countdown-calendar" class:mobile>
  <section>
    <header>
      <CountdownIconButton
        name="chevron-left"
        label="上个月"
        onclick={() => move(-1)}
      /><strong>{cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月</strong
      ><button type="button" class="today" onclick={today}>今天</button><CountdownIconButton
        name="chevron-right"
        label="下个月"
        onclick={() => move(1)}
      />
    </header>
    <div class="shp-countdown-calendar-week">
      {#each ["日", "一", "二", "三", "四", "五", "六"] as day}<span>{day}</span
        >{/each}
    </div>
    <div class="shp-countdown-calendar-grid">
      {#each cells as cell}<button
          type="button"
          class:muted={!cell.current}
          class:today={cell.today}
          class:selected={cell.key === selected}
          onclick={() => (selected = cell.key)}
          ><span>{cell.date.getDate()}</span>{#if showLunar}<small
              >{cell.lunar}</small
            >{/if}{#if cell.events.length}<em
              >{cell.events.length > 3 ? cell.events.length : "•"}</em
            >{/if}</button
        >{/each}
    </div>
  </section>
  <aside>
    <h3>{selectedLabel} 的事件</h3>
    {#if selectedEvents.length === 0}<CountdownEmptyState
        title="当天没有事件"
        description="选择有标记的日期，或新增一个重要日期。"
      />{:else}<div>
        {#each selectedEvents as event (event.id)}<button
            type="button"
            onclick={() => onEdit(event)}
            ><span
              style={`background:${event.color || "var(--b3-theme-primary)"}`}
            ></span><strong>{event.name}</strong><small
              >{event.calendar === "lunar" ? "农历" : "公历"}</small
            ></button
          >{/each}
      </div>{/if}
  </aside>
</div>

<style>
  .shp-countdown-calendar {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.7fr);
    gap: 14px;
    padding: 14px;
  }
  .shp-countdown-calendar > section,
  .shp-countdown-calendar > aside {
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-background);
    overflow: hidden;
  }
  .shp-countdown-calendar > section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px;
  }
  .shp-countdown-calendar header button {
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: 22px;
  }
  .shp-countdown-calendar header .today {
    width: auto;
    font-size: 13px;
    margin-left: auto;
  }
  .shp-countdown-calendar-week,
  .shp-countdown-calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .shp-countdown-calendar-week span {
    text-align: center;
    padding: 7px;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }
  .shp-countdown-calendar-grid button {
    position: relative;
    min-height: 70px;
    border: 0;
    border-top: 1px solid var(--b3-border-color);
    border-right: 1px solid var(--b3-border-color);
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    flex-direction: column;
    padding: 7px;
    gap: 3px;
  }
  .shp-countdown-calendar-grid button:nth-child(7n) {
    border-right: 0;
  }
  .shp-countdown-calendar-grid button.muted {
    opacity: 0.42;
  }
  .shp-countdown-calendar-grid button.today span {
    color: var(--b3-theme-primary);
    font-weight: 700;
  }
  .shp-countdown-calendar-grid button.selected {
    background: color-mix(in srgb, var(--b3-theme-primary) 9%, transparent);
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: -2px;
  }
  .shp-countdown-calendar-grid small {
    font-size: 10px;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-calendar-grid em {
    font-style: normal;
    color: var(--b3-theme-primary);
    font-size: 12px;
  }
  .shp-countdown-calendar > aside h3 {
    margin: 0;
    padding: 12px;
    border-bottom: 1px solid var(--b3-border-color);
  }
  .shp-countdown-calendar > aside > div > button {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    border: 0;
    border-bottom: 1px solid var(--b3-border-color);
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 8px 12px;
  }
  .shp-countdown-calendar > aside button span {
    width: 8px;
    height: 26px;
    border-radius: 4px;
  }
  .shp-countdown-calendar > aside small {
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-calendar.mobile {
    grid-template-columns: 1fr;
  }
  .shp-countdown-calendar.mobile .shp-countdown-calendar-grid button {
    min-height: 54px;
  }
  @media (max-width: 700px) {
    .shp-countdown-calendar {
      grid-template-columns: 1fr;
      padding: 10px;
    }
    .shp-countdown-calendar-grid button {
      min-height: 54px;
    }
  }
</style>
