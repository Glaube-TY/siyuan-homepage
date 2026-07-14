<script lang="ts">
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import { buildWorkspaceTaskTimelineEvents, type WorkspaceTaskTimelineEvent } from "../enhancedDiaryWorkspaceTaskTimeline";
    import WorkspaceTaskIcon, { type WorkspaceTaskIconName } from "./WorkspaceTaskIcon.svelte";
    interface Props { models: WorkspaceTaskViewModel[]; today: string; onSelect: (model: WorkspaceTaskViewModel) => void; onPreview: (model: WorkspaceTaskViewModel, anchor: HTMLElement, source: "pointer" | "focus" | "click" | "keyboard") => void; onPreviewPointerLeave: (model: WorkspaceTaskViewModel) => void; onPreviewFocusLeave: (model: WorkspaceTaskViewModel) => void; }
    let { models, today, onSelect, onPreview, onPreviewPointerLeave, onPreviewFocusLeave }: Props = $props();
    let range = $state<"30" | "90" | "365" | "all">("90");
    const events = $derived(buildWorkspaceTaskTimelineEvents(models, range, today));
    const groups = $derived.by(() => {
        const map = new Map<string, WorkspaceTaskTimelineEvent[]>();
        events.forEach((event) => map.set(event.date, [...(map.get(event.date) || []), event]));
        return Array.from(map, ([date, items]) => ({ date, items }));
    });
    function icon(kind: WorkspaceTaskTimelineEvent["kind"]): WorkspaceTaskIconName { return kind === "start" ? "start" : kind === "deadline" ? "deadline" : "timeline"; }
    function handlePreviewFocusOut(event: FocusEvent, model: WorkspaceTaskViewModel): void {
        if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
        onPreviewFocusLeave(model);
    }
</script>

<section class="task-timeline">
    <header><div><strong>真实任务时间线</strong><span>仅展示来源、开始和截止节点，不生成完成时间。</span></div><select bind:value={range} aria-label="时间线范围"><option value="30">30 天</option><option value="90">90 天</option><option value="365">1 年</option><option value="all">全部</option></select></header>
    {#if groups.length}<div class="timeline">{#each groups as group}<section class:today={group.date === today}><time>{group.date}</time><div class="events">{#each group.items as event (event.id)}<button type="button" class="task-preview-trigger" onmouseenter={(mouseEvent) => onPreview(event.model, mouseEvent.currentTarget, "pointer")} onmouseleave={() => onPreviewPointerLeave(event.model)} onfocus={(focusEvent) => onPreview(event.model, focusEvent.currentTarget, "focus")} onfocusout={(focusEvent) => handlePreviewFocusOut(focusEvent, event.model)} onclick={(clickEvent) => { onSelect(event.model); onPreview(event.model, clickEvent.currentTarget, "click"); }}><span class={`node ${event.kind}`}><WorkspaceTaskIcon name={icon(event.kind)} /></span><span class="event-content"><span><strong>{event.label}</strong>{event.model.task.completed ? " · 已完成" : ""}</span><b>{event.model.task.taskname}</b><small>{event.model.projectPathLabel}</small></span></button>{/each}</div></section>{/each}</div>{:else}<p class="empty">当前范围内没有真实任务时间节点。</p>{/if}
</section>

<style>
    .task-timeline { display: grid; gap: 14px; min-width: 0; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; } header div { display: grid; gap: 3px; } header strong { color: var(--wk-ink); } header span { color: var(--wk-ink-faint); font-size: var(--wk-text-sm); } select { min-height: 34px; padding: 5px 8px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-secondary); }
    .timeline { display: grid; gap: 0; min-width: 0; } .timeline > section { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; min-width: 0; } time { padding-top: 12px; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); text-align: right; } .timeline > section.today time { color: var(--wk-primary); font-weight: 600; }
    .events { display: grid; gap: 7px; padding: 8px 0 14px 18px; border-left: 2px solid var(--wk-border); } .events button { position: relative; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; width: 100%; padding: 9px; border: 1px solid var(--wk-border); border-radius: 9px; background: var(--wk-surface); color: var(--wk-ink-secondary); text-align: left; cursor: pointer; }
    .node { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: var(--wk-primary); background: color-mix(in srgb, var(--wk-primary) 10%, var(--wk-surface)); } .node.deadline { color: var(--wk-error); background: var(--wk-error-bg); }
    .event-content { display: grid; gap: 2px; min-width: 0; } .event-content > span, small { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); } .event-content b { color: var(--wk-ink); overflow-wrap: anywhere; } small { overflow-wrap: anywhere; }
    .empty { padding: 22px; border: 1px dashed var(--wk-border); border-radius: 10px; color: var(--wk-ink-faint); text-align: center; }
    @container (max-width: 560px) { .timeline > section { grid-template-columns: 1fr; gap: 3px; } time { text-align: left; } .events { margin-left: 7px; } }
</style>
