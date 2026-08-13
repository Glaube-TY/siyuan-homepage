<script lang="ts">
  import { untrack } from "svelte";
  import { showMessage } from "siyuan";
  import {
    HABIT_COLOR_OPTIONS,
    createHabitId,
    saveHabitDefinition,
    type HabitDefinition,
    type HabitGoalType,
    type HabitSchedule,
  } from "@/features/habit-tracker/habit-tracker-store";
  import { deleteHabitReminder, syncHabitReminder } from "@/features/habit-tracker/habit-reminder";

  interface Props {
    habit?: HabitDefinition | null;
    onSaved: () => void | Promise<void>;
    onClose: () => void;
  }
  let { habit = null, onSaved, onClose }: Props = $props();
  const initial = untrack(() => habit);
  let name = $state(initial?.name || "");
  let goalType = $state<HabitGoalType>(initial?.goalType || "check");
  let target = $state(initial?.target || 1);
  let step = $state(initial?.step || 1);
  let unit = $state(initial?.unit || "次");
  let scheduleKind = $state<HabitSchedule["kind"]>(initial?.schedule.kind || "daily");
  let weekdays = $state(initial?.schedule.kind === "weekdays" ? [...initial.schedule.weekdays] : [1, 2, 3, 4, 5]);
  let targetDays = $state(initial?.schedule.kind === "weekly" ? initial.schedule.targetDays : 5);
  let reminderEnabled = $state(initial?.reminder.enabled || false);
  let reminderTime = $state(initial?.reminder.time || "20:00");
  let color = $state(initial?.color || "blue");
  let saving = $state(false);

  function schedule(): HabitSchedule {
    if (scheduleKind === "weekdays") return { kind: "weekdays", weekdays };
    if (scheduleKind === "weekly") return { kind: "weekly", targetDays };
    return { kind: "daily" };
  }
  function toggleWeekday(day: number): void {
    weekdays = weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day].sort();
  }
  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!name.trim() || saving) return;
    saving = true;
    try {
      const saved = await saveHabitDefinition({
        id: initial?.id || createHabitId(),
        name: name.trim(),
        goalType,
        target: goalType === "check" ? 1 : target,
        step: goalType === "check" ? 1 : step,
        unit: goalType === "duration" ? "分钟" : unit,
        schedule: schedule(),
        reminder: { enabled: reminderEnabled, time: reminderTime },
        color,
        archived: false,
        createdAt: initial?.createdAt,
      });
      try {
        await syncHabitReminder(saved);
      } catch (error) {
        await saveHabitDefinition({ ...saved, reminder: { ...saved.reminder, enabled: false } });
        await deleteHabitReminder(saved.id).catch(() => undefined);
        throw error;
      }
      await onSaved();
      onClose();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "习惯保存失败", 5000, "error");
    } finally {
      saving = false;
    }
  }
</script>

<form class="habit-editor" onsubmit={save}>
  <div class="form-grid">
    <label class="wide">名称<input required maxlength="60" bind:value={name} placeholder="例如：阅读 30 分钟" /></label>
    <label>目标类型<select bind:value={goalType}><option value="check">完成一次</option><option value="count">累计次数</option><option value="amount">累计数值</option><option value="duration">持续时长</option></select></label>
    <label>周期<select bind:value={scheduleKind}><option value="daily">每天</option><option value="weekdays">指定星期</option><option value="weekly">每周达标天数</option></select></label>
    {#if goalType !== "check"}
      <label>目标<input type="number" min="0.01" step="0.01" bind:value={target} /></label>
      <label>单次增加<input type="number" min="0.01" step="0.01" bind:value={step} /></label>
      {#if goalType !== "duration"}<label>单位<input maxlength="12" bind:value={unit} /></label>{/if}
    {/if}
    {#if scheduleKind === "weekdays"}
      <fieldset class="wide"><legend>执行日</legend><div class="weekday-row">{#each [1,2,3,4,5,6,0] as day}<button type="button" class:active={weekdays.includes(day)} onclick={() => toggleWeekday(day)}>周{["日","一","二","三","四","五","六"][day]}</button>{/each}</div></fieldset>
    {:else if scheduleKind === "weekly"}
      <label>每周目标天数<input type="number" min="1" max="7" bind:value={targetDays} /></label>
    {/if}
    <fieldset class="wide"><legend>强调色</legend><div class="colors">{#each HABIT_COLOR_OPTIONS as option}<button type="button" class:selected={color === option.value} style={`--color:${option.hex}`} aria-label={`选择${option.label}`} title={option.label} onclick={() => color = option.value}><span>{option.label}</span></button>{/each}</div></fieldset>
    <label class="reminder-toggle"><input type="checkbox" bind:checked={reminderEnabled} />通知提醒</label>
    {#if reminderEnabled}<label>提醒时间<input type="time" bind:value={reminderTime} /></label>{/if}
  </div>
  <footer><button type="button" onclick={onClose}>取消</button><button class="primary" type="submit" disabled={saving || !name.trim()}>{saving ? "保存中…" : "保存习惯"}</button></footer>
</form>

<style>
  .habit-editor{width:100%;height:100%;min-width:0;display:flex;flex-direction:column;color:var(--b3-theme-on-background);background:var(--b3-theme-background);overflow:hidden}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:22px;overflow:auto}.wide{grid-column:1/-1}label,fieldset{min-width:0;display:flex;flex-direction:column;gap:7px;margin:0;color:var(--b3-theme-on-surface);font-size:12px}fieldset{padding:12px;border:1px solid var(--b3-border-color);border-radius:12px}legend{padding:0 5px}input,select{box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid var(--b3-border-color);border-radius:9px;color:var(--b3-theme-on-background);background:var(--b3-theme-surface);font:inherit}.weekday-row,.colors{display:flex;flex-wrap:wrap;gap:8px}.weekday-row button{min-width:50px;padding:7px 10px;border:1px solid var(--b3-border-color);border-radius:8px;color:inherit;background:var(--b3-theme-surface)}.weekday-row button.active{color:var(--b3-theme-primary);border-color:var(--b3-theme-primary);background:color-mix(in srgb,var(--b3-theme-primary) 9%,var(--b3-theme-surface))}.colors button{position:relative;width:30px;height:30px;padding:0;border:3px solid transparent;border-radius:50%;background:var(--color);cursor:pointer}.colors button.selected{border-color:var(--b3-theme-background);box-shadow:0 0 0 2px var(--color)}.colors span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.reminder-toggle{align-self:end;flex-direction:row;align-items:center;padding-bottom:10px}.reminder-toggle input{width:auto}footer{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;border-top:1px solid var(--b3-border-color)}footer button{min-height:36px;padding:7px 15px;border:1px solid var(--b3-border-color);border-radius:9px;color:inherit;background:var(--b3-theme-surface);font:inherit;cursor:pointer}.primary{color:var(--b3-theme-on-primary);border-color:var(--b3-theme-primary);background:var(--b3-theme-primary)}@media(max-width:600px){.form-grid{grid-template-columns:1fr;padding:16px}.wide{grid-column:auto}}
</style>
