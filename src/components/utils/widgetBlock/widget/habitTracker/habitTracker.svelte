<script lang="ts">
  import { mount, onMount } from "svelte";
  import { getFrontend } from "siyuan";
  import { svelteDialog } from "@/libs/dialog";
  import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
  import WidgetSemanticTitle from "@/homepage/theme/widgetPresentation/components/WidgetSemanticTitle.svelte";
  import { subscribeSharedWidgetDataUpdated } from "../sharedLocalStorage/sharedWidgetDataEvents";
  import {
    formatHabitDate, getHabitValue, habitProgress, isHabitDue, loadHabitTracker, setHabitValue,
    type HabitDefinition, type HabitLog,
  } from "@/features/habit-tracker/habit-tracker-store";
  import HabitTrackerDialog from "./HabitTrackerDialog.svelte";

  interface Props { plugin: any; contentTypeJson?: string; placement?: string }
  let { plugin, contentTypeJson = "{}", placement = "homepage" }: Props = $props();
  const config = $derived((() => { try { const value = JSON.parse(contentTypeJson)?.data || {}; return { title: String(value.title || "习惯打卡"), maxVisible: Math.max(2, Math.min(10, Number(value.maxVisible) || 5)) }; } catch { return { title: "习惯打卡", maxVisible: 5 }; } })());
  let habits = $state<HabitDefinition[]>([]);
  let logs = $state<HabitLog[]>([]);
  let loading = $state(true);
  let advancedEnabled = $state(false);
  const today = formatHabitDate();
  const due = $derived(habits.filter((habit) => isHabitDue(habit, new Date(`${today}T00:00:00`))).slice(0, config.maxVisible));
  const completed = $derived(due.filter((habit) => habitProgress(habit, getHabitValue(logs, habit.id, today)) >= 1).length);

  async function reload(): Promise<void> {
    if (!advancedEnabled) { loading = false; return; }
    loading = true;
    try { const data = await loadHabitTracker(); habits = data.habits.filter((habit) => !habit.archived); logs = data.logs; }
    catch (error) { console.warn("[habit-tracker] load failed", error); }
    finally { loading = false; }
  }
  async function toggle(habit: HabitDefinition): Promise<void> {
    const current = getHabitValue(logs, habit.id, today);
    await setHabitValue(habit.id, today, habit.goalType === "check" ? (current >= 1 ? 0 : 1) : Math.min(habit.target, current + habit.step));
    await reload();
  }
  function openDetail(): void {
    if (!advancedEnabled) return;
    const mobile = getFrontend().includes("mobile");
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({ title: "", width: mobile ? "100vw" : "calc(100vw - 32px)", height: mobile ? "100dvh" : "calc(100vh - 48px)", constructor: (container) => mount(HabitTrackerDialog, { target: container, props: { onClose: () => ref.close() } }) });
    ref.dialog.element.classList.add("habit-tracker-dialog-host");
  }
  onMount(() => {
    const enabled = () => { advancedEnabled = true; void reload(); };
    const disabled = () => { advancedEnabled = false; habits = []; logs = []; };
    window.addEventListener("homepage-advanced-ready", enabled);
    window.addEventListener("homepage-advanced-unavailable", disabled);
    const unsubscribe = subscribeSharedWidgetDataUpdated("habit-tracker", () => void reload());
    advancedEnabled = Boolean(plugin?.ADVANCED);
    void reload();
    return () => { window.removeEventListener("homepage-advanced-ready", enabled); window.removeEventListener("homepage-advanced-unavailable", disabled); unsubscribe(); };
  });
</script>

<div class="habit-widget" data-widget-part="root">
  {#if !advancedEnabled}
    <AdvancedFeatureLock compact title="习惯打卡" subtitle="高级会员专属" icon="check" />
  {:else}
    <header data-widget-part="header"><WidgetSemanticTitle widgetType="habitTracker" configuredTitle={config.title} semanticLabel="习惯打卡" fallbackIcon="confirm" /><button type="button" onclick={openDetail}>管理</button></header>
    <div class="status"><span>今日</span><strong>{completed}<small> / {due.length}</small></strong></div>
    <div class="list">
      {#each due as habit (habit.id)}
        {@const value = getHabitValue(logs, habit.id, today)}
        {@const done = habitProgress(habit, value) >= 1}
        <button class:done data-color={habit.color} type="button" onclick={() => toggle(habit)}><i>{done ? "✓" : ""}</i><span><strong>{habit.name}</strong><em>{habit.goalType === "check" ? (done ? "已完成" : "待完成") : `${value} / ${habit.target} ${habit.unit}`}</em></span><b style:width={`${habitProgress(habit, value) * 100}%`}></b></button>
      {:else}
        {#if !loading}<button class="empty" type="button" onclick={openDetail}>创建第一个习惯</button>{/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .habit-widget{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px;box-sizing:border-box;color:var(--b3-theme-on-background)}header{display:flex;align-items:center;justify-content:space-between}header button{border:0;background:transparent;color:var(--b3-theme-primary);cursor:pointer}.status{display:flex;align-items:baseline;justify-content:space-between;color:var(--b3-theme-on-surface);font-size:12px}.status strong{font-size:22px;color:var(--b3-theme-on-background)}.status small{font-size:12px;color:var(--b3-theme-on-surface)}.list{display:flex;min-height:0;overflow:auto;flex-direction:column;gap:6px}.list>button{position:relative;overflow:hidden;flex:0 0 auto;display:flex;align-items:center;gap:9px;text-align:left;border:0;border-radius:10px;padding:9px 10px;background:var(--b3-theme-surface);color:inherit;cursor:pointer}.list i{z-index:1;display:grid;place-items:center;width:23px;height:23px;border-radius:50%;border:1px solid color-mix(in srgb,var(--habit-color) 65%,var(--b3-border-color));font-style:normal}.list .done i{background:var(--habit-color);color:white}.list span{z-index:1;min-width:0;display:flex;flex:1;justify-content:space-between;gap:8px}.list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.list em{font-size:11px;color:var(--b3-theme-on-surface);font-style:normal;white-space:nowrap}.list b{position:absolute;inset:auto auto 0 0;height:2px;background:var(--habit-color)}.empty{width:100%;justify-content:center;padding:22px;text-align:center;color:var(--b3-theme-on-surface);cursor:pointer}[data-color="blue"]{--habit-color:#4f86e8}[data-color="green"]{--habit-color:#34a66f}[data-color="amber"]{--habit-color:#d69a31}[data-color="violet"]{--habit-color:#8b6de0}[data-color="rose"]{--habit-color:#d9667d}[data-color="cyan"]{--habit-color:#2ba3ad}
</style>
