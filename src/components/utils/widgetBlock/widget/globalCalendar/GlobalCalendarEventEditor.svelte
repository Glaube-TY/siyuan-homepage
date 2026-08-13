<script lang="ts">
  import { untrack } from "svelte";
  import { GLOBAL_CALENDAR_COLORS } from "@/features/global-calendar/global-calendar-schedule-store";
  import type { GlobalCalendarSchedule } from "@/features/global-calendar/global-calendar-types";

  interface Props {
    initialDate: string;
    initialTime?: string;
    initialEndTime?: string;
    schedule?: GlobalCalendarSchedule | null;
    onSave: (value: Partial<GlobalCalendarSchedule> & Pick<GlobalCalendarSchedule, "title" | "date">) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
    onClose: () => void;
  }
  let { initialDate, initialTime = "09:00", initialEndTime, schedule = null, onSave, onDelete, onClose }: Props = $props();
  const initial = untrack(() => ({ schedule, initialDate, initialTime, initialEndTime }));
  const initialRecurrence = initial.schedule?.recurrence || { kind: "none" as const };
  let title = $state(initial.schedule?.title || "");
  let kind = $state<"schedule" | "course">(initial.schedule?.kind || "schedule");
  let date = $state(initial.schedule?.date || initial.initialDate);
  let endDate = $state(initial.schedule?.endDate || "");
  let startTime = $state(initial.schedule?.startTime || initial.initialTime);
  let endTime = $state(initial.schedule?.endTime || initial.initialEndTime || addHour(initial.initialTime));
  let allDay = $state(initial.schedule?.allDay || false);
  let location = $state(initial.schedule?.location || "");
  let note = $state(initial.schedule?.note || "");
  let projectTitle = $state(initial.schedule?.projectTitle || "");
  let color = $state(initial.schedule?.color || GLOBAL_CALENDAR_COLORS[0]);
  let recurrenceKind = $state(initialRecurrence.kind);
  let until = $state(initialRecurrence.kind !== "none" ? initialRecurrence.until || "" : "");
  let weekdays = $state<number[]>(initialRecurrence.kind === "weekly" ? [...initialRecurrence.weekdays] : [new Date(`${initial.schedule?.date || initial.initialDate}T00:00:00`).getDay()]);
  let saving = $state(false);

  function addHour(value: string): string {
    const [hour, minute] = value.split(":").map(Number);
    return `${String(Math.min(23, (hour || 0) + 1)).padStart(2, "0")}:${String(minute || 0).padStart(2, "0")}`;
  }
  function toggleWeekday(day: number): void {
    weekdays = weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day].sort();
  }
  function changeKind(value: "schedule" | "course"): void {
    kind = value;
    if (value === "course" && recurrenceKind === "none") recurrenceKind = "weekly";
  }
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim() || !date || (!allDay && startTime >= endTime)) return;
    saving = true;
    try {
      await onSave({
        ...schedule,
        title: title.trim(), kind, date, endDate: endDate || undefined,
        startTime: allDay ? undefined : startTime, endTime: allDay ? undefined : endTime,
        allDay, location: location.trim() || undefined, note: note.trim() || undefined,
        projectTitle: projectTitle.trim() || undefined, color,
        recurrence: recurrenceKind === "daily"
          ? { kind: "daily", until: until || undefined }
          : recurrenceKind === "weekly"
            ? { kind: "weekly", weekdays: weekdays.length ? weekdays : [new Date(`${date}T00:00:00`).getDay()], until: until || undefined }
            : { kind: "none" },
      });
    } finally { saving = false; }
  }
</script>

<div class="editor-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && onClose()}>
  <form class="event-editor" onsubmit={submit}>
    <header><div><small>{schedule ? "编辑" : "新建"}</small><h3>{kind === "course" ? "课程" : "日程"}</h3></div><button type="button" class="close" aria-label="关闭" onclick={onClose}>×</button></header>
    <div class="form-grid">
      <label class="wide">标题<input required maxlength="120" bind:value={title} /></label>
      <label>类型<select value={kind} onchange={(event) => changeKind((event.currentTarget as HTMLSelectElement).value as "schedule" | "course")}><option value="schedule">日程</option><option value="course">课程</option></select></label>
      <label>颜色<span class="colors">{#each GLOBAL_CALENDAR_COLORS as item}<button type="button" class:selected={color === item} style={`--color:${item}`} aria-label={`选择颜色 ${item}`} onclick={() => (color = item)}></button>{/each}</span></label>
      <label>开始日期<input required type="date" bind:value={date} /></label>
      <label>结束日期<input type="date" min={date} bind:value={endDate} /></label>
      <label class="check"><input type="checkbox" bind:checked={allDay} />全天</label>
      {#if !allDay}<label>开始时间<input type="time" step="900" bind:value={startTime} /></label><label>结束时间<input type="time" step="900" bind:value={endTime} /></label>{/if}
      <label>重复<select bind:value={recurrenceKind}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>
      {#if recurrenceKind !== "none"}<label>重复至<input type="date" min={date} bind:value={until} /></label>{/if}
      {#if recurrenceKind === "weekly"}<fieldset class="wide"><legend>星期</legend><div class="weekday-options">{#each [1,2,3,4,5,6,0] as day}<button type="button" class:active={weekdays.includes(day)} onclick={() => toggleWeekday(day)}>{["日","一","二","三","四","五","六"][day]}</button>{/each}</div></fieldset>{/if}
      <label>地点<input maxlength="120" bind:value={location} /></label>
      <label>项目<input maxlength="120" placeholder="可选，用于日历归类" bind:value={projectTitle} /></label>
      <label class="wide">备注<textarea rows="3" maxlength="500" bind:value={note}></textarea></label>
    </div>
    <footer>{#if schedule && onDelete}<button type="button" class="danger" onclick={onDelete}>删除</button>{/if}<span></span><button type="button" onclick={onClose}>取消</button><button type="submit" class="primary" disabled={saving || !title.trim()}>{saving ? "保存中…" : "保存"}</button></footer>
  </form>
</div>

<style>
  .editor-backdrop { position: absolute; z-index: 40; inset: 0; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--b3-theme-on-background) 22%, transparent); }
  .event-editor { width: min(680px, 100%); max-height: 100%; display: flex; flex-direction: column; border: 1px solid var(--b3-border-color); border-radius: 16px; background: var(--b3-theme-background); box-shadow: 0 24px 64px color-mix(in srgb, var(--b3-theme-on-background) 22%, transparent); overflow: hidden; }
  header, footer { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--b3-border-color); }
  header > div { flex: 1; } header small { color: var(--b3-theme-on-surface-light); } h3 { margin: 2px 0 0; font-size: 20px; }
  button, input, select, textarea { color: inherit; font: inherit; } button { cursor: pointer; }
  .close { width: 34px; height: 34px; border: 0; border-radius: 9px; background: transparent; font-size: 24px; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; padding: 18px; overflow: auto; }
  label, fieldset { min-width: 0; display: flex; flex-direction: column; gap: 6px; color: var(--b3-theme-on-surface-light); font-size: 12px; }
  input, select, textarea { min-width: 0; padding: 8px 10px; border: 1px solid var(--b3-border-color); border-radius: 8px; color: var(--b3-theme-on-background); background: var(--b3-theme-surface); }
  textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .check { flex-direction: row; align-items: center; align-self: end; padding-bottom: 8px; }
  fieldset { margin: 0; padding: 9px 10px; border: 1px solid var(--b3-border-color); border-radius: 9px; } legend { padding-inline: 5px; }
  .colors, .weekday-options { display: flex; align-items: center; gap: 7px; min-height: 34px; }
  .colors button { width: 24px; height: 24px; border: 3px solid transparent; border-radius: 999px; background: var(--color); } .colors button.selected { border-color: var(--b3-theme-background); box-shadow: 0 0 0 2px var(--color); }
  .weekday-options button { width: 34px; height: 30px; border: 1px solid var(--b3-border-color); border-radius: 7px; background: var(--b3-theme-surface); } .weekday-options button.active { color: var(--b3-theme-primary); border-color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 9%, var(--b3-theme-surface)); }
  footer { justify-content: flex-end; border-top: 1px solid var(--b3-border-color); border-bottom: 0; } footer span { flex: 1; } footer button { min-height: 34px; padding: 6px 13px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-surface); }
  footer .primary { color: var(--b3-theme-on-primary); border-color: var(--b3-theme-primary); background: var(--b3-theme-primary); } footer .danger { color: var(--b3-theme-error); }
  @media (max-width: 600px) { .editor-backdrop { padding: 8px; } .form-grid { grid-template-columns: 1fr; padding: 14px; } .wide { grid-column: auto; } }
</style>
