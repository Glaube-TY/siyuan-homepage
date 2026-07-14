<script lang="ts">
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import { buildWorkspaceTaskCalendarEvents } from "../enhancedDiaryWorkspaceTaskTimeline";
    import {
        addDays, addLocalMonths, endOfLocalMonth, endOfLocalWeek, enumerateLocalDates,
        formatLocalDate, parseLocalDate, startOfLocalMonth, startOfLocalWeek,
    } from "../enhancedDiaryWorkspaceDate";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    interface Props { models: WorkspaceTaskViewModel[]; today: string; weekStartDay?: 0 | 1; onSelect: (model: WorkspaceTaskViewModel) => void; onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>; onPreview: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave: (model: WorkspaceTaskViewModel) => void; }
    let { models, today, weekStartDay = 1, onSelect, onToggle, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    let mode = $state<"month" | "week">("month");
    let cursor = $state(new Date());
    let initialized = $state(false);
    let unscheduledExpanded = $state(false);
    let invalidExpanded = $state(false);
    let selectedDate = $state("");
    $effect(() => { if (!initialized && today) { cursor = parseLocalDate(today); initialized = true; } });

    const visibleStartDate = $derived(mode === "month" ? startOfLocalWeek(startOfLocalMonth(cursor), weekStartDay) : startOfLocalWeek(cursor, weekStartDay));
    const visibleEndDate = $derived(mode === "month" ? endOfLocalWeek(endOfLocalMonth(cursor), weekStartDay) : endOfLocalWeek(cursor, weekStartDay));
    const visibleStart = $derived(formatLocalDate(visibleStartDate));
    const visibleEnd = $derived(formatLocalDate(visibleEndDate));
    const dates = $derived(enumerateLocalDates(visibleStartDate, visibleEndDate));
    const events = $derived(buildWorkspaceTaskCalendarEvents(models, visibleStart, visibleEnd));
    const unscheduled = $derived(models.filter((model) => model.isUnscheduled));
    const invalid = $derived(models.filter((model) => model.hasInvalidStartDate || model.hasInvalidDeadline || model.hasInvalidRange));
    const selectedDayModels = $derived.by(() => {
        const seen = new Set<string>();
        return dayEvents(selectedDate).map((event) => event.model).filter((model) => {
            if (seen.has(model.task.blockId)) return false;
            seen.add(model.task.blockId);
            return true;
        });
    });
    const weekdays = $derived(weekStartDay === 1 ? ["一", "二", "三", "四", "五", "六", "日"] : ["日", "一", "二", "三", "四", "五", "六"]);

    function move(amount: number): void { cursor = mode === "month" ? addLocalMonths(cursor, amount) : addDays(cursor, amount * 7); }
    function dayEvents(date: string) { return events.filter((event) => event.startDate <= date && date <= event.endDate); }
    function eventLabel(kind: string): string { return kind === "start" ? "开始" : kind === "deadline" ? "截止" : ""; }
    function handlePreviewFocusOut(event: FocusEvent, model: WorkspaceTaskViewModel): void {
        if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
        onPreviewFocusLeave(model);
    }
</script>

<section class="task-calendar">
    <header><div><button type="button" onclick={() => move(-1)}>上一{mode === "month" ? "月" : "周"}</button><button type="button" onclick={() => (cursor = parseLocalDate(today))}>今天</button><button type="button" onclick={() => move(1)}>下一{mode === "month" ? "月" : "周"}</button></div><strong>{cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月</strong><div class="mode"><button type="button" class:active={mode === "month"} onclick={() => (mode = "month")}>月</button><button type="button" class:active={mode === "week"} onclick={() => (mode = "week")}>周</button></div></header>
    <div class="weekdays">{#each weekdays as day}<span>周{day}</span>{/each}</div>
    <div class="calendar-grid" class:week={mode === "week"}>{#each dates as date}
        {@const items = dayEvents(date)}
        <article class:outside={mode === "month" && parseLocalDate(date).getMonth() !== cursor.getMonth()} class:today={date === today} class:selected={date === selectedDate}>
            <div class="day-number"><button type="button" aria-label={`查看 ${date} 的任务`} onclick={() => (selectedDate = selectedDate === date ? "" : date)}>{Number(date.slice(-2))}</button>{#if date === today}<span>今天</span>{/if}</div>
            <div class="day-events">{#each items.slice(0, mode === "month" ? 3 : 8) as event (event.id)}
                <div class={`event ${event.kind}`} class:danger={event.model.isOverdue} class:completed={event.model.task.completed} class:range-start={date === event.startDate} class:range-end={date === event.endDate}>
                    <input type="checkbox" checked={event.model.task.completed} aria-label="切换完成" onchange={() => onToggle(event.model)} />
                    <button type="button" class="task-preview-trigger" onmouseenter={(mouseEvent) => onPreview(event.model, mouseEvent.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(event.model)} onfocus={(focusEvent) => onPreview(event.model, focusEvent.currentTarget, "focus")} onfocusout={(focusEvent) => handlePreviewFocusOut(focusEvent, event.model)} onclick={(clickEvent) => { selectedDate = date; onSelect(event.model); onPreview(event.model, clickEvent.currentTarget, "click"); }}><span>{eventLabel(event.kind)}</span>{event.model.task.taskname}</button>
                </div>
            {/each}{#if items.length > (mode === "month" ? 3 : 8)}<span class="more">+{items.length - (mode === "month" ? 3 : 8)} 项</span>{/if}</div>
        </article>
    {/each}</div>
    {#if selectedDate}
        <section class="selected-day" aria-label={`${selectedDate} 的任务`}>
            <header><strong>{selectedDate}</strong><span>{selectedDayModels.length} 项任务</span><button type="button" onclick={() => (selectedDate = "")}>关闭</button></header>
            {#if selectedDayModels.length}
                <div>{#each selectedDayModels as model}<button type="button" class="task-preview-trigger" class:completed={model.task.completed} onmouseenter={(event) => onPreview(model, event.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(model)} onfocus={(event) => onPreview(model, event.currentTarget, "focus")} onfocusout={(event) => handlePreviewFocusOut(event, model)} onclick={(event) => { onSelect(model); onPreview(model, event.currentTarget, "click"); }}>{model.task.taskname}</button>{/each}</div>
            {:else}<p>当天没有已排期任务。</p>{/if}
        </section>
    {/if}
    <div class="unscheduled"><button type="button" onclick={() => (unscheduledExpanded = !unscheduledExpanded)}><WorkspaceTaskIcon name="unscheduled" />未排期任务 {unscheduled.length} · {unscheduledExpanded ? "收起" : "展开"}</button>{#if unscheduledExpanded}<div>{#each unscheduled as model}<button type="button" class="task-preview-trigger" onmouseenter={(event) => onPreview(model, event.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(model)} onfocus={(event) => onPreview(model, event.currentTarget, "focus")} onfocusout={(event) => handlePreviewFocusOut(event, model)} onclick={(event) => { onSelect(model); onPreview(model, event.currentTarget, "click"); }}>{model.task.taskname}</button>{/each}</div>{/if}</div>
    {#if invalid.length}<div class="unscheduled invalid"><button type="button" onclick={() => (invalidExpanded = !invalidExpanded)}><WorkspaceTaskIcon name="overdue" />日期异常任务 {invalid.length} · {invalidExpanded ? "收起" : "展开"}</button>{#if invalidExpanded}<div>{#each invalid as model}<button type="button" class="task-preview-trigger" onmouseenter={(event) => onPreview(model, event.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(model)} onfocus={(event) => onPreview(model, event.currentTarget, "focus")} onfocusout={(event) => handlePreviewFocusOut(event, model)} onclick={(event) => { onSelect(model); onPreview(model, event.currentTarget, "click"); }}>{model.task.taskname}</button>{/each}</div>{/if}</div>{/if}
</section>

<style>
    .task-calendar { display: grid; gap: 8px; min-width: 0; }
    header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; } header > div { display: flex; gap: 5px; } header .mode { justify-content: flex-end; } header button, .unscheduled > button { min-height: 31px; padding: 4px 8px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; } header button.active { color: var(--wk-primary); border-color: var(--wk-primary); }
    .weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; } .weekdays span { padding: 5px; color: var(--wk-ink-faint); text-align: center; font-size: var(--wk-text-xs); }
    .calendar-grid { border-top: 1px solid var(--wk-border); border-left: 1px solid var(--wk-border); } article { min-width: 0; min-height: 118px; padding: 5px; border-right: 1px solid var(--wk-border); border-bottom: 1px solid var(--wk-border); background: var(--wk-surface); box-sizing: border-box; } .calendar-grid.week article { min-height: 260px; } article.outside { background: var(--wk-background); opacity: .68; } article.today { box-shadow: inset 0 0 0 1px var(--wk-primary); }
    article.selected { box-shadow: inset 0 0 0 2px var(--wk-primary); }
    .day-number { display: flex; align-items: center; justify-content: space-between; color: var(--wk-ink-muted); } .day-number button { width: 25px; height: 25px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; font-weight: 650; cursor: pointer; } .day-number button:hover { background: color-mix(in srgb, var(--wk-primary) 10%, transparent); color: var(--wk-primary); } .day-number span { color: var(--wk-primary); font-size: var(--wk-text-xs); }
    .day-events { display: grid; gap: 3px; margin-top: 5px; } .event { display: grid; grid-template-columns: 14px minmax(0, 1fr); align-items: center; gap: 3px; min-width: 0; padding: 2px 4px; border-radius: 3px; background: color-mix(in srgb, var(--wk-primary) 9%, var(--wk-surface)); color: var(--wk-ink-secondary); } .event.range:not(.range-start) { border-top-left-radius: 0; border-bottom-left-radius: 0; } .event.range:not(.range-end) { border-top-right-radius: 0; border-bottom-right-radius: 0; } .event.deadline, .event.danger { color: var(--wk-error); background: var(--wk-error-bg); } .event.completed { opacity: .58; }
    .event input { width: 12px; height: 12px; margin: 0; accent-color: var(--wk-primary); } .event button { min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font-size: var(--wk-text-xs); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; } .event button span { margin-right: 3px; font-weight: 600; } .more { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); }
    .unscheduled { display: grid; gap: 6px; } .unscheduled > button { display: inline-flex; align-items: center; gap: 5px; justify-self: start; } .unscheduled > div { display: flex; flex-wrap: wrap; gap: 5px; } .unscheduled > div button { padding: 4px 7px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; }
    .unscheduled.invalid > button { color: var(--wk-error); border-color: var(--wk-error-border); }
    .selected-day { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-background); } .selected-day header { display: flex; align-items: center; gap: 8px; } .selected-day header span { color: var(--wk-ink-muted); font-size: var(--wk-text-sm); } .selected-day header button { margin-left: auto; } .selected-day > div { display: flex; flex-wrap: wrap; gap: 6px; } .selected-day > div button { padding: 5px 8px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); cursor: pointer; } .selected-day > div button.completed { opacity: .58; text-decoration: line-through; } .selected-day p { margin: 0; color: var(--wk-ink-faint); }
    @container (max-width: 620px) { header { grid-template-columns: 1fr; } header .mode { justify-content: flex-start; } article { min-height: 92px; padding: 3px; } .event { grid-template-columns: 1fr; } .event input { display: none; } }
</style>
