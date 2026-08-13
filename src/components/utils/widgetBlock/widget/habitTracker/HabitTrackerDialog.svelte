<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import { subscribeSharedWidgetDataUpdated } from "@/components/utils/widgetBlock/widget/sharedLocalStorage/sharedWidgetDataEvents";
  import {
    HABIT_COLORS,
    createHabitId,
    currentHabitStreak,
    deleteHabitDefinition,
    formatHabitDate,
    getHabitValue,
    habitGoalLabel,
    habitProgress,
    isHabitDue,
    loadHabitTracker,
    saveHabitDefinition,
    setHabitValue,
    type HabitDefinition,
    type HabitGoalType,
    type HabitLog,
    type HabitSchedule,
  } from "@/features/habit-tracker/habit-tracker-store";
  import { deleteHabitReminder, syncHabitReminder } from "@/features/habit-tracker/habit-reminder";

  interface Props { onClose: () => void }
  let { onClose }: Props = $props();
  type Tab = "today" | "manage" | "history";
  let tab = $state<Tab>("today");
  let habits = $state<HabitDefinition[]>([]);
  let logs = $state<HabitLog[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let editingId = $state("");
  let showEditor = $state(false);
  let name = $state("");
  let goalType = $state<HabitGoalType>("check");
  let target = $state(1);
  let step = $state(1);
  let unit = $state("次");
  let scheduleKind = $state<HabitSchedule["kind"]>("daily");
  let weekdays = $state<number[]>([1, 2, 3, 4, 5]);
  let targetDays = $state(5);
  let reminderEnabled = $state(false);
  let reminderTime = $state("20:00");
  let color = $state("blue");

  const today = formatHabitDate();
  const todayDate = new Date(`${today}T00:00:00`);
  const dueHabits = $derived(habits.filter((habit) => isHabitDue(habit, todayDate)));
  const completedToday = $derived(dueHabits.filter((habit) => habitProgress(habit, getHabitValue(logs, habit.id, today)) >= 1).length);
  const completion = $derived(dueHabits.length ? completedToday / dueHabits.length : 0);
  const historyDates = $derived(Array.from({ length: 35 }, (_, index) => {
    const date = new Date(todayDate);
    date.setDate(date.getDate() - (34 - index));
    return formatHabitDate(date);
  }));

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

  function resetEditor(): void {
    editingId = ""; name = ""; goalType = "check"; target = 1; step = 1; unit = "次";
    scheduleKind = "daily"; weekdays = [1, 2, 3, 4, 5]; targetDays = 5;
    reminderEnabled = false; reminderTime = "20:00"; color = "blue";
  }

  function startCreate(): void { resetEditor(); showEditor = true; tab = "manage"; }
  function startEdit(habit: HabitDefinition): void {
    editingId = habit.id; name = habit.name; goalType = habit.goalType; target = habit.target; step = habit.step; unit = habit.unit;
    scheduleKind = habit.schedule.kind;
    weekdays = habit.schedule.kind === "weekdays" ? [...habit.schedule.weekdays] : [1, 2, 3, 4, 5];
    targetDays = habit.schedule.kind === "weekly" ? habit.schedule.targetDays : 5;
    reminderEnabled = habit.reminder.enabled; reminderTime = habit.reminder.time; color = habit.color;
    showEditor = true; tab = "manage";
  }

  function schedule(): HabitSchedule {
    if (scheduleKind === "weekdays") return { kind: "weekdays", weekdays };
    if (scheduleKind === "weekly") return { kind: "weekly", targetDays };
    return { kind: "daily" };
  }

  async function save(): Promise<void> {
    if (!name.trim() || saving) return;
    saving = true;
    try {
      const old = habits.find((habit) => habit.id === editingId);
      const habit = await saveHabitDefinition({
        id: editingId || createHabitId(), name: name.trim(), goalType,
        target: goalType === "check" ? 1 : target, step: goalType === "check" ? 1 : step,
        unit: goalType === "duration" ? "分钟" : unit, schedule: schedule(),
        reminder: { enabled: reminderEnabled, time: reminderTime }, color, archived: false,
        createdAt: old?.createdAt,
      });
      try {
        await syncHabitReminder(habit);
      } catch (error) {
        await saveHabitDefinition({ ...habit, reminder: { ...habit.reminder, enabled: false } });
        reminderEnabled = false;
        await deleteHabitReminder(habit.id).catch(() => undefined);
        throw error;
      }
      showEditor = false;
      await reload();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "习惯保存失败", 5000, "error");
    } finally { saving = false; }
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

  function toggleWeekday(day: number): void {
    weekdays = weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day].sort();
  }

  onMount(() => {
    void reload();
    return subscribeSharedWidgetDataUpdated("habit-tracker", () => void reload());
  });
</script>

<div class="habit-center">
  <header>
    <div><span class="eyebrow">习惯中心</span><h2>让重复变成节奏</h2></div>
    <div class="header-actions"><button class="primary" type="button" onclick={startCreate}>+ 新建习惯</button><button class="icon" type="button" aria-label="关闭" onclick={onClose}><SiyuanIcon name="close" size={18} /></button></div>
  </header>

  <nav aria-label="习惯中心视图">
    <button class:active={tab === "today"} onclick={() => tab = "today"}>今日</button>
    <button class:active={tab === "manage"} onclick={() => tab = "manage"}>管理</button>
    <button class:active={tab === "history"} onclick={() => tab = "history"}>趋势</button>
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
    <section class="manage-layout" class:editing={showEditor}>
      <div class="manage-list">
        {#each habits as habit (habit.id)}
          <article data-color={habit.color}><span class="color-dot"></span><div><strong>{habit.name}</strong><span>{habitGoalLabel(habit)} · {habit.schedule.kind === "daily" ? "每天" : habit.schedule.kind === "weekdays" ? "指定星期" : `每周 ${habit.schedule.targetDays} 天`}{habit.reminder.enabled ? ` · ${habit.reminder.time} 提醒` : ""}</span></div><button onclick={() => startEdit(habit)}>编辑</button><button class="danger" onclick={() => remove(habit)}>删除</button></article>
        {:else}<div class="empty">还没有习惯，先创建第一个吧</div>{/each}
      </div>
      {#if showEditor}
        <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
          <div class="form-title"><strong>{editingId ? "编辑习惯" : "新建习惯"}</strong><button type="button" onclick={() => showEditor = false}>取消</button></div>
          <label>名称<input required maxlength="60" bind:value={name} placeholder="例如：阅读" /></label>
          <div class="two"><label>目标类型<select bind:value={goalType}><option value="check">完成一次</option><option value="count">累计次数</option><option value="amount">累计数值</option><option value="duration">持续时长</option></select></label><label>强调色<select bind:value={color}>{#each HABIT_COLORS as value}<option value={value}>{value}</option>{/each}</select></label></div>
          {#if goalType !== "check"}<div class="three"><label>目标<input type="number" min="0.01" step="0.01" bind:value={target} /></label><label>单次增加<input type="number" min="0.01" step="0.01" bind:value={step} /></label>{#if goalType !== "duration"}<label>单位<input maxlength="12" bind:value={unit} /></label>{/if}</div>{/if}
          <label>周期<select bind:value={scheduleKind}><option value="daily">每天</option><option value="weekdays">指定星期</option><option value="weekly">每周达标天数</option></select></label>
          {#if scheduleKind === "weekdays"}<div class="weekday-row">{#each [1,2,3,4,5,6,0] as day}<button type="button" class:active={weekdays.includes(day)} onclick={() => toggleWeekday(day)}>{["日","一","二","三","四","五","六"][day]}</button>{/each}</div>{:else if scheduleKind === "weekly"}<label>每周目标天数<input type="number" min="1" max="7" bind:value={targetDays} /></label>{/if}
          <div class="reminder"><label class="switch"><input type="checkbox" bind:checked={reminderEnabled} />通知提醒</label>{#if reminderEnabled}<input type="time" bind:value={reminderTime} />{/if}<span>使用通知中心渠道</span></div>
          <button class="primary save" type="submit" disabled={saving || !name.trim()}>{saving ? "保存中…" : "保存习惯"}</button>
        </form>
      {/if}
    </section>
  {:else}
    <section class="history-layout">
      <div class="history-head"><div><span>近 35 天</span><strong>{habits.length} 个习惯</strong></div><span>颜色越深，完成度越高</span></div>
      {#each habits as habit (habit.id)}
        <div class="history-row"><div><strong>{habit.name}</strong><span>连续 {currentHabitStreak(habit, logs)} 天</span></div><div class="heatmap" data-color={habit.color}>{#each historyDates as date}<i title={`${date} · ${getHabitValue(logs, habit.id, date)} ${habit.unit}`} style:opacity={0.12 + habitProgress(habit, getHabitValue(logs, habit.id, date)) * 0.88}></i>{/each}</div></div>
      {:else}<div class="empty">有打卡记录后，这里会显示节奏趋势</div>{/each}
    </section>
  {/if}
</div>

<style>
  .habit-center{height:100%;display:flex;flex-direction:column;color:var(--b3-theme-on-background);background:var(--b3-theme-background);overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;padding:22px 26px 16px;border-bottom:1px solid var(--b3-border-color)}h2{margin:3px 0 0;font-size:24px;letter-spacing:-.03em}.eyebrow{font-size:12px;color:var(--b3-theme-on-surface)}.header-actions{display:flex;gap:8px}.primary{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);border:0;border-radius:9px;padding:9px 15px}.icon{width:38px;border-radius:9px}button{font:inherit;cursor:pointer;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:inherit}.icon,.manage-list button,.form-title button,.stepper button{padding:7px 10px}nav{display:flex;gap:4px;padding:10px 26px 0}nav button{border:0;background:transparent;padding:8px 14px;border-radius:8px;color:var(--b3-theme-on-surface)}nav button.active{background:var(--b3-list-hover);color:var(--b3-theme-on-background);font-weight:600}.today-layout,.manage-layout,.history-layout{overflow:auto;padding:18px 26px 28px}.today-layout{display:grid;grid-template-columns:minmax(180px,240px) minmax(0,1fr);gap:22px}.summary{align-self:start;padding:22px;border-radius:18px;background:color-mix(in srgb,var(--b3-theme-primary) 10%,var(--b3-theme-surface));display:flex;flex-direction:column;gap:4px}.summary strong{font-size:40px}.summary small{font-size:18px;color:var(--b3-theme-on-surface)}.summary-track,.progress{height:5px;background:color-mix(in srgb,var(--b3-theme-on-surface) 12%,transparent);border-radius:10px;overflow:hidden}.summary-track{margin-top:18px}.summary-track i,.progress i{display:block;height:100%;background:var(--b3-theme-primary);border-radius:inherit}.habit-list,.manage-list{display:flex;flex-direction:column;gap:8px}.habit-list article,.manage-list article{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:var(--b3-theme-surface)}.habit-list article.done{opacity:.68}.check{flex:0 0 28px;width:28px;height:28px;border-radius:50%;padding:0;border-color:color-mix(in srgb,var(--habit-color,var(--b3-theme-primary)) 55%,var(--b3-border-color))}.done .check{background:var(--habit-color,var(--b3-theme-primary));color:white}.habit-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}.habit-copy strong,.manage-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.habit-copy span,.manage-list span,.history-head span,.history-row span,.reminder span{font-size:12px;color:var(--b3-theme-on-surface)}.stepper{display:flex}.stepper button:first-child{border-radius:8px 0 0 8px}.stepper button:last-child{border-radius:0 8px 8px 0}.manage-layout{display:grid;grid-template-columns:1fr;gap:18px}.manage-layout.editing{grid-template-columns:minmax(0,1fr) minmax(280px,380px)}.manage-list article>div{min-width:0;flex:1;display:flex;flex-direction:column}.color-dot{width:10px;height:10px;border-radius:50%;background:var(--habit-color)}.danger{color:var(--b3-theme-error)}form{padding:18px;border-radius:16px;background:var(--b3-theme-surface);display:flex;flex-direction:column;gap:13px}.form-title{display:flex;justify-content:space-between;align-items:center}.form-title button{border:0;background:transparent}label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--b3-theme-on-surface)}input,select{box-sizing:border-box;width:100%;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background);color:var(--b3-theme-on-background);padding:8px}.two,.three{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.three{grid-template-columns:repeat(3,1fr)}.weekday-row{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.weekday-row button{padding:7px 0;border-radius:7px}.weekday-row button.active{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary)}.reminder{display:grid;grid-template-columns:1fr 120px;align-items:center;gap:8px}.reminder .switch{flex-direction:row;align-items:center;color:inherit}.reminder .switch input{width:auto}.reminder span{grid-column:1/-1}.save{align-self:flex-end}.history-layout{display:flex;flex-direction:column;gap:10px}.history-head,.history-row{display:flex;justify-content:space-between;gap:16px;align-items:center}.history-head>div,.history-row>div:first-child{display:flex;flex-direction:column}.history-row{padding:12px 14px;border-radius:12px;background:var(--b3-theme-surface)}.history-row>div:first-child{width:160px;min-width:0}.heatmap{display:grid;grid-template-columns:repeat(35,10px);gap:3px}.heatmap i{width:10px;height:10px;border-radius:3px;background:var(--habit-color)}.empty{padding:50px 20px;text-align:center;color:var(--b3-theme-on-surface)}[data-color="blue"]{--habit-color:#4f86e8}[data-color="green"]{--habit-color:#34a66f}[data-color="amber"]{--habit-color:#d69a31}[data-color="violet"]{--habit-color:#8b6de0}[data-color="rose"]{--habit-color:#d9667d}[data-color="cyan"]{--habit-color:#2ba3ad}@media(max-width:760px){header{padding:16px}.today-layout,.manage-layout,.manage-layout.editing{grid-template-columns:1fr;padding:14px 16px}.history-layout{padding:14px 16px}.history-row{align-items:flex-start;flex-direction:column}.heatmap{grid-template-columns:repeat(18,10px)}.header-actions .primary{font-size:0}.header-actions .primary::after{content:"+";font-size:18px}}
</style>
