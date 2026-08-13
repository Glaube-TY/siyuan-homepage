<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as echarts from "@/utils/charts/echarts";
  import type { GlobalCalendarEvent } from "@/features/global-calendar/global-calendar-types";

  interface Props {
    year: number;
    month: number;
    events?: GlobalCalendarEvent[];
    selectedDate?: string;
    weekStartsOn?: 0 | 1;
    showAdjacentDays?: boolean;
    showEventCount?: boolean;
    compact?: boolean;
    onSelectDate?: (date: string) => void;
  }

  let {
    year,
    month,
    events = [],
    selectedDate = "",
    weekStartsOn = 1,
    showAdjacentDays = true,
    showEventCount = true,
    compact = false,
    onSelectDate,
  }: Props = $props();

  let container: HTMLDivElement;
  let chart: echarts.ECharts | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;
  let drawFrame: number | null = null;

  $effect(() => {
    year;
    month;
    events;
    selectedDate;
    weekStartsOn;
    showAdjacentDays;
    showEventCount;
    compact;
    scheduleDraw();
  });

  function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function monthGrid(): Array<{ date: string; current: boolean }> {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(year, month, 1 - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date: formatDate(date), current: date.getMonth() === month };
    });
  }

  function themeColors() {
    const style = getComputedStyle(container || document.documentElement);
    const root = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim()
      || root.getPropertyValue(name).trim()
      || fallback;
    return {
      text: read("--b3-theme-on-background", "#202124"),
      muted: read("--b3-theme-on-surface-light", "#6b7280"),
      surface: read("--b3-theme-surface", "#ffffff"),
      primary: read("--b3-theme-primary", "#4f6bed"),
      border: read("--b3-border-color", "#d9d9d9"),
    };
  }

  function scheduleDraw(): void {
    if (!chart) return;
    if (drawFrame != null) cancelAnimationFrame(drawFrame);
    drawFrame = requestAnimationFrame(draw);
  }

  function draw(): void {
    drawFrame = null;
    if (!chart || !container) return;
    const colors = themeColors();
    const days = monthGrid();
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.date, (counts.get(event.date) || 0) + 1);
    const width = Math.max(container.clientWidth, 240);
    const height = Math.max(container.clientHeight, 170);
    const left = compact ? 4 : 12;
    const top = compact ? 20 : 28;
    const cellWidth = (width - left * 2) / 7;
    const cellHeight = (height - top - 4) / 6;
    const labels = weekStartsOn === 1
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];
    const today = formatDate(new Date());

    chart.resize();
    chart.setOption({
      animation: false,
      tooltip: {
        trigger: "item",
        confine: true,
        renderMode: "richText",
        borderColor: colors.border,
        backgroundColor: colors.surface,
        textStyle: { color: colors.text, fontSize: 12 },
        formatter: (params: any) => {
          const date = String(params.value?.[2] || "");
          const dayEvents = events.filter((event) => event.date === date);
          if (!dayEvents.length) return date;
          return `${date}\n${dayEvents.slice(0, 6).map((event) => event.title).join("\n")}`;
        },
      },
      graphic: labels.map((label, index) => ({
        type: "text",
        left: left + cellWidth * (index + 0.5),
        top: 2,
        style: {
          text: label,
          fill: colors.muted,
          font: `${compact ? 10 : 11}px sans-serif`,
          textAlign: "center",
        },
      })),
      series: [{
        type: "custom",
        coordinateSystem: "none",
        data: days.map((day, index) => [index, counts.get(day.date) || 0, day.date, day.current ? 1 : 0]),
        renderItem: (_params: any, api: any) => {
          const index = Number(api.value(0));
          const count = Number(api.value(1));
          const date = String(api.value(2));
          const current = Number(api.value(3)) === 1;
          const x = left + (index % 7) * cellWidth;
          const y = top + Math.floor(index / 7) * cellHeight;
          const selected = date === selectedDate;
          const isToday = date === today;
          const visible = current || showAdjacentDays;
          const dayNumber = String(Number(date.slice(-2)));
          const dotSize = Math.max(3, Math.min(6, cellWidth / 10));
          const children: any[] = [{
            type: "rect",
            shape: { x: x + 2, y: y + 2, width: Math.max(1, cellWidth - 4), height: Math.max(1, cellHeight - 4), r: compact ? 6 : 9 },
            style: {
              fill: selected ? echarts.color.modifyAlpha(colors.primary, 0.14) : "transparent",
              stroke: selected ? colors.primary : "transparent",
              lineWidth: selected ? 1.5 : 0,
            },
          }, {
            type: "text",
            style: {
              x: x + cellWidth / 2,
              y: y + (compact ? 8 : 10),
              text: visible ? dayNumber : "",
              fill: !current ? colors.muted : isToday ? colors.primary : colors.text,
              font: `${isToday ? "600 " : ""}${compact ? 11 : 13}px sans-serif`,
              textAlign: "center",
              textVerticalAlign: "top",
              opacity: current ? 1 : 0.5,
            },
          }];
          if (visible && count > 0) {
            children.push({
              type: "circle",
              shape: { cx: x + cellWidth / 2, cy: y + cellHeight - (compact ? 8 : 10), r: dotSize / 2 },
              style: { fill: colors.primary },
            });
            if (showEventCount && !compact) children.push({
              type: "text",
              style: {
                x: x + cellWidth / 2 + dotSize,
                y: y + cellHeight - 10,
                text: String(count),
                fill: colors.muted,
                font: "10px sans-serif",
                textVerticalAlign: "middle",
              },
            });
          }
          return { type: "group", children };
        },
        encode: { tooltip: 2 },
      }],
    }, true);
  }

  function handleClick(params: any): void {
    const date = String(params.value?.[2] || "");
    const current = Number(params.value?.[3]) === 1;
    if (date && (current || showAdjacentDays)) onSelectDate?.(date);
  }

  onMount(() => {
    chart = echarts.init(container);
    chart.on("click", handleClick);
    resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(container);
    themeObserver = new MutationObserver(scheduleDraw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    scheduleDraw();
  });

  onDestroy(() => {
    if (drawFrame != null) cancelAnimationFrame(drawFrame);
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    chart?.off("click", handleClick);
    chart?.dispose();
    chart = null;
  });
</script>

<div class="calendar-chart" bind:this={container} aria-label={`${year} 年 ${month + 1} 月日历`}></div>

<style>
  .calendar-chart { width: 100%; height: 100%; min-height: 170px; }
</style>
