<script lang="ts">
  import { onMount } from "svelte";
  import * as echarts from "@/utils/charts/echarts";
  import { HABIT_COLOR_OPTIONS, type HabitDefinition, type HabitLog } from "@/features/habit-tracker/habit-tracker-store";
  import { buildHabitAnalytics } from "@/features/habit-tracker/habit-tracker-math";

  interface Props { habits: HabitDefinition[]; logs: HabitLog[] }
  let { habits, logs }: Props = $props();
  let selectedId = $state("");
  let lineElement: HTMLDivElement;
  let barElement: HTMLDivElement;
  let pieElement: HTMLDivElement;
  let lineChart: echarts.ECharts | null = null;
  let barChart: echarts.ECharts | null = null;
  let pieChart: echarts.ECharts | null = null;
  const selectedHabits = $derived(selectedId ? habits.filter((habit) => habit.id === selectedId) : habits);
  const analytics = $derived(buildHabitAnalytics(selectedHabits, logs));
  const allAnalytics = $derived(buildHabitAnalytics(habits, logs));
  const colorMap = Object.fromEntries(HABIT_COLOR_OPTIONS.map((item) => [item.value, item.hex]));
  function renderCharts(): void {
    if (!lineChart || !barChart || !pieChart) return;
    const styles = getComputedStyle(lineElement);
    const axisColor = styles.getPropertyValue("--b3-theme-on-surface").trim() || "#6b7280";
    const gridColor = styles.getPropertyValue("--b3-border-color").trim() || "#d7dce3";
    lineChart.setOption({
      animationDuration: 280,
      tooltip: { trigger: "axis", valueFormatter: (value: unknown) => `${value}%` },
      grid: { left: 40, right: 18, top: 18, bottom: 28 },
      xAxis: { type: "category", boundaryGap: false, data: analytics.dates.map((date) => date.slice(5)), axisLabel: { color: axisColor, interval: 4 }, axisLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: axisColor, formatter: "{value}%" }, splitLine: { lineStyle: { color: gridColor, opacity: .55 } } },
      series: [{ type: "line", smooth: .3, symbol: "none", data: analytics.dailyRates, lineStyle: { width: 3, color: "#4f86e8" }, areaStyle: { color: "rgba(79,134,232,.12)" } }],
    }, true);
    barChart.setOption({
      animationDuration: 280,
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value: unknown) => `${value}%` },
      grid: { left: 16, right: 18, top: 14, bottom: 42, containLabel: true },
      xAxis: { type: "category", data: allAnalytics.habits.map((item) => item.name), axisLabel: { color: axisColor, interval: 0, overflow: "truncate", width: 70 }, axisLine: { lineStyle: { color: gridColor } } },
      yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: axisColor, formatter: "{value}%" }, splitLine: { lineStyle: { color: gridColor, opacity: .55 } } },
      series: [{ type: "bar", barMaxWidth: 28, data: allAnalytics.habits.map((item) => ({ value: item.rate, itemStyle: { color: colorMap[item.color] || "#4f86e8", borderRadius: [6, 6, 2, 2] } })) }],
    }, true);
    pieChart.setOption({
      animationDuration: 280,
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: axisColor } },
      series: [{ type: "pie", radius: ["56%", "76%"], center: ["50%", "44%"], label: { show: false }, data: [{ name: "已达标", value: analytics.completed, itemStyle: { color: "#34a66f" } }, { name: "待完成", value: Math.max(0, analytics.due - analytics.completed), itemStyle: { color: "#d9dee7" } }] }],
    }, true);
  }

  $effect(() => {
    analytics;
    allAnalytics;
    queueMicrotask(renderCharts);
  });

  onMount(() => {
    lineChart = echarts.init(lineElement);
    barChart = echarts.init(barElement);
    pieChart = echarts.init(pieElement);
    const observer = new ResizeObserver(() => { lineChart?.resize(); barChart?.resize(); pieChart?.resize(); });
    observer.observe(lineElement.parentElement!);
    renderCharts();
    return () => { observer.disconnect(); lineChart?.dispose(); barChart?.dispose(); pieChart?.dispose(); };
  });
</script>

<section class="analytics">
  <div class="analytics-toolbar"><div><small>最近 30 天</small><strong>坚持不靠感觉，要看得到趋势</strong></div><select bind:value={selectedId} aria-label="筛选习惯"><option value="">全部习惯</option>{#each habits as habit}<option value={habit.id}>{habit.name}</option>{/each}</select></div>
  <div class="metrics">
    <article><span>综合完成率</span><strong>{analytics.rate}<small>%</small></strong></article>
    <article><span>达标次数</span><strong>{analytics.completed}<small> / {analytics.due}</small></strong></article>
    <article><span>最长连续</span><strong>{analytics.longestStreak}<small> 天</small></strong></article>
    <article><span>累计记录</span><strong>{analytics.totalValue.toLocaleString("zh-CN")}</strong></article>
  </div>
  <div class="charts">
    <article class="line-card"><header><strong>完成趋势</strong><span>每日目标完成率</span></header><div class="chart" bind:this={lineElement}></div></article>
    <article><header><strong>习惯表现</strong><span>各习惯完成率</span></header><div class="chart" bind:this={barElement}></div></article>
    <article><header><strong>目标构成</strong><span>已达标与待完成</span></header><div class="chart" bind:this={pieElement}></div></article>
  </div>
  <div class="habit-performance">
    <header><strong>习惯明细</strong><span>频率、完成率与当前连续天数</span></header>
    <div class="performance-list">
      {#each allAnalytics.habits as item}
        <button type="button" class:selected={selectedId === item.id} onclick={() => selectedId = selectedId === item.id ? "" : item.id}>
          <i style={`--color:${colorMap[item.color] || "#4f86e8"}`}></i><strong>{item.name}</strong><span>{item.completed} / {item.due} 次</span><em>{item.streak} 天连续</em><b>{item.rate}%</b>
        </button>
      {:else}<div class="empty">创建习惯后，这里会开始积累趋势。</div>{/each}
    </div>
  </div>
</section>

<style>
  .analytics{display:flex;flex-direction:column;gap:14px;padding:18px 26px 30px;overflow:auto}.analytics-toolbar{display:flex;align-items:end;justify-content:space-between;gap:14px}.analytics-toolbar>div{display:flex;flex-direction:column;gap:3px}.analytics-toolbar small,.charts header span,.habit-performance header span{color:var(--b3-theme-on-surface);font-size:12px}.analytics-toolbar strong{font-size:17px}.analytics-toolbar select{min-width:160px;padding:8px 10px;border:1px solid var(--b3-border-color);border-radius:9px;color:inherit;background:var(--b3-theme-surface)}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.metrics article,.charts article,.habit-performance{border:1px solid color-mix(in srgb,var(--b3-border-color) 72%,transparent);border-radius:15px;background:var(--b3-theme-surface);box-shadow:0 5px 18px color-mix(in srgb,var(--b3-theme-on-background) 5%,transparent)}.metrics article{display:flex;flex-direction:column;gap:7px;padding:15px 17px}.metrics span{color:var(--b3-theme-on-surface);font-size:12px}.metrics strong{font-size:26px;letter-spacing:-.04em}.metrics small{font-size:13px;color:var(--b3-theme-on-surface)}.charts{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}.charts article{min-width:0;padding:14px}.charts header,.habit-performance>header{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.chart{width:100%;height:220px}.habit-performance{padding:15px}.performance-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:12px}.performance-list button{display:grid;grid-template-columns:10px minmax(0,1fr) auto auto auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid transparent;border-radius:10px;color:inherit;background:var(--b3-theme-background);font:inherit;text-align:left;cursor:pointer}.performance-list button:hover,.performance-list button.selected{border-color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 7%,var(--b3-theme-background))}.performance-list i{width:9px;height:9px;border-radius:50%;background:var(--color)}.performance-list strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.performance-list span,.performance-list em{color:var(--b3-theme-on-surface);font-size:12px;font-style:normal}.performance-list b{font-size:13px}.empty{grid-column:1/-1;padding:32px;text-align:center;color:var(--b3-theme-on-surface)}@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.charts{grid-template-columns:1fr}.line-card{grid-column:auto}.performance-list{grid-template-columns:1fr}}@media(max-width:560px){.analytics{padding:14px 16px}.analytics-toolbar{align-items:stretch;flex-direction:column}.analytics-toolbar select{width:100%}.performance-list button{grid-template-columns:10px minmax(0,1fr) auto}.performance-list span,.performance-list em{display:none}}
</style>
