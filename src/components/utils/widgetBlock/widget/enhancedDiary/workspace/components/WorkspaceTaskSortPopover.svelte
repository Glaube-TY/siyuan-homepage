<script lang="ts">
    import type { WorkspaceTaskSortKey } from "../enhancedDiaryWorkspaceNavigation";
    import WorkspaceTaskIcon from "./WorkspaceTaskIcon.svelte";

    interface Props { value: WorkspaceTaskSortKey; onChange: (value: WorkspaceTaskSortKey) => void; }
    let { value, onChange }: Props = $props();
    const options: Array<{ value: WorkspaceTaskSortKey; label: string; shortLabel: string }> = [
        { value: "smart", label: "智能排序", shortLabel: "智能" },
        { value: "deadline", label: "截止日期最近", shortLabel: "截止" },
        { value: "start", label: "开始日期最近", shortLabel: "开始" },
        { value: "priority", label: "优先级最高", shortLabel: "优先级" },
        { value: "risk", label: "风险最高", shortLabel: "风险" },
        { value: "source", label: "来源日期最新", shortLabel: "来源" },
        { value: "name", label: "名称 A-Z", shortLabel: "名称" },
    ];
    const currentLabel = $derived(options.find((option) => option.value === value)?.label || "任务排序");
</script>

<label class="task-sort-control" title={currentLabel}>
    <WorkspaceTaskIcon name="sort" />
    <select class="sort-full" aria-label={`任务排序：${currentLabel}`} value={value} onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value as WorkspaceTaskSortKey)}>
        {#each options as option}<option value={option.value}>{option.label}</option>{/each}
    </select>
    <select class="sort-short" aria-label={`任务排序：${currentLabel}`} value={value} onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value as WorkspaceTaskSortKey)}>
        {#each options as option}<option value={option.value}>{option.shortLabel}</option>{/each}
    </select>
</label>

<style>
    .task-sort-control { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 9px; border: 1px solid var(--wk-border); border-radius: 8px; color: var(--wk-ink-secondary); background: var(--wk-surface); }
    select { max-width: 150px; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    .sort-short { display: none; }
    @container (max-width: 1120px) { .sort-full { display: none; } .sort-short { display: inline-block; max-width: 86px; } }
</style>
