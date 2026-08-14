<script lang="ts">
  import { mount, onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { svelteDialog } from "@/libs/dialog";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import HabitTrackerAnalytics from "./HabitTrackerAnalytics.svelte";
  import HabitTrackerEditorDialog from "./HabitTrackerEditorDialog.svelte";
  import { subscribeSharedWidgetDataUpdated } from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetDataEvents";
  import {
    currentHabitStreak,
    deleteHabitDefinition,
    formatHabitDate,
    getHabitValue,
    habitGoalLabel,
    habitProgress,
    isHabitDue,
    loadHabitTracker,
    setHabitValue,
    type HabitDefinition,
    type HabitLog,
  } from "@/features/habit-tracker/habit-tracker-store";
  import { deleteHabitReminder } from "@/features/habit-tracker/habit-reminder";

  interface Props { onClose: () => void }
  let { onClose }: Props = $props();
  type Tab = "today" | "manage" | "analytics";
  let tab = $state<Tab>("today");
  let habits = $state<HabitDefinition[]>([]);
  let logs = $state<HabitLog[]>([]);
  let loading = $state(true);

  const today = formatHabitDate();
  const todayDate = new Date(`${today}T00:00:00`);
  const dueHabits = $derived(habits.filter((habit) => isHabitDue(habit, todayDate)));
  const completedToday = $derived(dueHabits.filter((habit) => habitProgress(habit, getHabitValue(logs, habit.id, today)) >= 1).length);
  const completion = $derived(dueHabits.length ? completedToday / dueHabits.length : 0);

  async function reload(): Promise<void> {
    loading = true;
    try {
      const data = await loadHabitTracker();
      habits = data.habits.filter((habit) => !habit.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      logs = data.logs;
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "习惯数据读取失败", 4000, "error");
    } finally { loading = false; }
  }

  function openEditor(habit: HabitDefinition | null = null): void {
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({
      title: habit ? "编辑习惯" : "新建习惯",
      width: "560px",
      height: "min(720px, calc(100vh - 56px))",
      constructor: (container) => mount(HabitTrackerEditorDialog, {
        target: container,
        props: { habit, onSaved: reload, onClose: () => ref.close() },
      }),
    });
    ref.dialog.element.classList.add("habit-tracker-editor-dialog-host");
  }

  async function remove(habit: HabitDefinition): Promise<void> {
    try {
      await deleteHabitReminder(habit.id);
      await deleteHabitDefinition(habit.id);
      await reload();
    } catch (error) { showMessage(error instanceof Error ? error.message : "删除失败", 4000, "error"); }
  }

  async function changeValue(habit: HabitDefinition, delta: number): Promise<void> {
    const current = getHabitValue(logs, habit.id, today);
    const next = habit.goalType === "check" ? (current >= 1 ? 0 : 1) : Math.max(0, current + delta);
    await setHabitValue(habit.id, today, next);
    await reload();
  }

  onMount(() => {
    void reload();
    return subscribeSharedWidgetDataUpdated("habit-tracker", () => void reload());
  });
</script>

<div class="habit-center">
  <header>
    <div><span class="eyebrow">习惯中心</span><h2>让重复变成节奏</h2></div>
    <div class="header-actions"><button class="primary" type="button" onclick={() => openEditor()}>+ 新建习惯</button><button class="icon" type="button" aria-label="关闭习惯中心" onclick={onClose}><SiyuanIcon name="close" size={18} /></button></div>
  </header>

  <nav aria-label="习惯中心视图">
    <button class:active={tab === "today"} onclick={() => tab = "today"}>今日</button>
    <button class:active={tab === "manage"} onclick={() => tab = "manage"}>管理</button>
    <button class:active={tab === "analytics"} onclick={() => tab = "analytics"}>数据</button>
  </nav>

  {#if loading}
    <div class="empty">正在读取习惯…</div>
  {:else if tab === "today"}
    <section class="today-layout">
      <div class="summary"><strong>{completedToday}<small> / {dueHabits.length}</small></strong><span>今日完成</span><div class="summary-track"><i style:width={`${completion * 100}%`}></i></div></div>
      <div class="habit-list">
        {#each dueHabits as habit (habit.id)}
          {@const value = getHabitValue(logs, habit.id, today)}
          {@const done = habitProgress(habit, value) >= 1}
          <article class:done data-color={habit.color}>
            <button class="check" type="button" aria-label={done ? "取消完成" : "完成"} onclick={() => changeValue(habit, habit.step)}>{done ? "✓" : ""}</button>
            <div class="habit-copy"><strong>{habit.name}</strong><span>{value} / {habitGoalLabel(habit)} · 连续 {currentHabitStreak(habit, logs)} 天</span><div class="progress"><i style:width={`${habitProgress(habit, value) * 100}%`}></i></div></div>
            {#if habit.goalType !== "check"}<div class="stepper"><button onclick={() => changeValue(habit, -habit.step)}>−</button><button onclick={() => changeValue(habit, habit.step)}>+</button></div>{/if}
          </article>
        {:else}<div class="empty">今天没有待完成的习惯</div>{/each}
      </div>
    </section>
  {:else if tab === "manage"}
    <section class="manage-layout">
      <div class="manage-list">
        {#each habits as habit (habit.id)}
          {@const habitLogs = logs.filter((log) => log.habitId === habit.id)}
          <article data-color={habit.color}>
            <span class="color-dot"></span>
            <div class="manage-copy"><strong>{habit.name}</strong><span>{habitGoalLabel(habit)} · {habit.schedule.kind === "daily" ? "每天" : habit.schedule.kind === "weekdays" ? "指定星期" : `每周 ${habit.schedule.targetDays} 天`}{habit.reminder.enabled ? ` · ${habit.reminder.time} 提醒` : ""}</span></div>
            <div class="manage-stat"><strong>{currentHabitStreak(habit, logs)}</strong><span>连续天数</span></div>
            <div class="manage-stat"><strong>{habitLogs.length}</strong><span>记录次数</span></div>
            <button onclick={() => openEditor(habit)}>编辑</button><button class="danger" onclick={() => remove(habit)}>删除</button>
          </article>
        {:else}<div class="empty">还没有习惯，先创建第一个吧</div>{/each}
      </div>
    </section>
  {:else}
    <HabitTrackerAnalytics {habits} {logs} />
  {/if}
</div>

<style>
  .habit-center{width:100%;height:100%;min-width:0;min-height:0;flex:1 1 auto;box-sizing:border-box;display:flex;flex-direction:column;color:var(--b3-theme-on-background);background:var(--b3-theme-background);overflow:hidden}.habit-center>header{display:flex;justify-content:space-between;align-items:center;padding:22px 26px 16px;border-bottom:1px solid var(--b3-border-color)}h2{margin:3px 0 0;font-size:24px;letter-spacing:-.03em}.eyebrow{font-size:12px;color:var(--b3-theme-on-surface)}.header-actions{display:flex;gap:8px}.primary{padding:9px 15px;border:0;border-radius:9px;color:var(--b3-theme-on-primary);background:var(--b3-theme-primary)}.icon{width:38px;border-radius:9px}button{font:inherit;cursor:pointer;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:inherit}.icon,.manage-list button,.stepper button{padding:7px 10px}nav{display:flex;gap:4px;padding:10px 26px 0}nav button{border:0;background:transparent;padding:8px 14px;border-radius:8px;color:var(--b3-theme-on-surface)}nav button.active{background:var(--b3-list-hover);color:var(--b3-theme-on-background);font-weight:600}.today-layout,.manage-layout{overflow:auto;padding:18px 26px 28px}.today-layout{display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr);gap:22px}.summary{align-self:start;padding:22px;border-radius:18px;background:color-mix(in srgb,var(--b3-theme-primary) 10%,var(--b3-theme-surface));display:flex;flex-direction:column;gap:4px}.summary strong{font-size:40px}.summary small{font-size:18px;color:var(--b3-theme-on-surface)}.summary-track,.progress{height:5px;background:color-mix(in srgb,var(--b3-theme-on-surface) 12%,transparent);border-radius:10px;overflow:hidden}.summary-track{margin-top:18px}.summary-track i,.progress i{display:block;height:100%;background:var(--b3-theme-primary);border-radius:inherit}.habit-list,.manage-list{display:flex;flex-direction:column;gap:8px}.habit-list article,.manage-list article{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--b3-border-color) 70%,transparent);border-radius:12px;background:var(--b3-theme-surface)}.habit-list article.done{opacity:.68}.check{flex:0 0 28px;width:28px;height:28px;border-radius:50%;padding:0;border-color:color-mix(in srgb,var(--habit-color,var(--b3-theme-primary)) 55%,var(--b3-border-color))}.done .check{background:var(--habit-color,var(--b3-theme-primary));color:white}.habit-copy,.manage-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}.habit-copy strong,.manage-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.habit-copy span,.manage-list span{font-size:12px;color:var(--b3-theme-on-surface)}.stepper{display:flex}.stepper button:first-child{border-radius:8px 0 0 8px}.stepper button:last-child{border-radius:0 8px 8px 0}.manage-layout{display:block}.color-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;background:var(--habit-color)}.manage-stat{flex:0 0 auto!important;align-items:flex-end}.manage-stat strong{font-size:18px}.manage-stat span{font-size:10px}.danger{color:var(--b3-theme-error)}.empty{padding:50px 20px;text-align:center;color:var(--b3-theme-on-surface)}[data-color="blue"]{--habit-color:#4f86e8}[data-color="green"]{--habit-color:#34a66f}[data-color="amber"]{--habit-color:#d69a31}[data-color="violet"]{--habit-color:#8b6de0}[data-color="rose"]{--habit-color:#d9667d}[data-color="cyan"]{--habit-color:#2ba3ad}@media(max-width:760px){.habit-center>header{padding:16px}.today-layout,.manage-layout{grid-template-columns:1fr;padding:14px 16px}.manage-stat{display:none!important}.header-actions .primary{font-size:0}.header-actions .primary::after{content:"+";font-size:18px}}
  @media(max-width:760px){.header-actions .icon{width:44px;height:44px}}
</style>
