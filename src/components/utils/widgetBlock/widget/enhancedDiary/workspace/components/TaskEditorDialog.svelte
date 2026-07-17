<script lang="ts">
    import { onMount } from "svelte";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { GenerateTasksPlusTaskInput } from "../../../tasksPlus/tasksPlusParser";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";
    import WorkspaceProjectPicker from "./WorkspaceProjectPicker.svelte";
    import { loadEnhancedDiaryProjectIndexForWorkspace } from "../enhancedDiaryWorkspaceProjectService";
    import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryProjectStorageConfig } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import { isEnhancedDiaryProjectEffectivelyActive, resolveEnhancedDiaryProjectTarget } from "../../enhancedDiaryProjectIndex";

    interface Props {
        task?: EnhancedDiaryWorkspaceTask | null;
        initialInput?: Partial<GenerateTasksPlusTaskInput>;
        mode: "create" | "edit";
        onSubmit: (input: GenerateTasksPlusTaskInput) => void | Promise<void>;
        onClose: () => void;
        projectStorage?: EnhancedDiaryProjectStorageConfig;
        tagSuggestions?: string[];
    }

    let { task = null, initialInput = {}, mode, onSubmit, onClose, projectStorage, tagSuggestions = [] }: Props = $props();

    let taskname = $state("");
    let priority = $state("");
    let startDate = $state("");
    let deadline = $state("");
    let recurrence = $state("");
    let reminder = $state("");
    let location = $state("");
    let tagsText = $state("");
    let showMore = $state(false);
    let projectAssociationEnabled = $state(false);
    let projectTargetId = $state("");
    let projectIndex = $state<EnhancedDiaryProjectIndexPayload | null>(null);
    let projectLoading = $state(false);

    const priorityOptions = [
        { value: "", label: "无" },
        { value: "❗", label: "低" },
        { value: "❗❗", label: "中" },
        { value: "❗❗❗", label: "高" },
        { value: "❗❗❗❗", label: "紧急" },
    ];

    const hasExtended = $derived(recurrence !== "" || reminder !== "" || location !== "");
    const dateRangeInvalid = $derived(!!startDate && !!deadline && startDate > deadline);
    const availableTagSuggestions = $derived(tagSuggestions.filter((tag) =>
        !parseTags(tagsText).some((selected) => selected.toLocaleLowerCase() === tag.toLocaleLowerCase())
    ));

    function parseTags(value: string): string[] {
        return value
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    function submit(): void {
        onSubmit({
            taskname,
            completed: task?.completed || false,
            priority,
            startDate,
            deadline,
            recurrence,
            reminder,
            location,
            tags: parseTags(tagsText),
            projectTargetId,
            projectTitle: projectTargetId && projectIndex
                ? resolveEnhancedDiaryProjectTarget(projectIndex, projectTargetId)?.title
                : undefined,
        });
    }

    function addSuggestedTag(tag: string): void {
        tagsText = [...parseTags(tagsText), tag].join(" ");
    }

    function handleProjectAssociationChange(event: Event): void {
        projectAssociationEnabled = (event.currentTarget as HTMLInputElement).checked;
        if (!projectAssociationEnabled) projectTargetId = "";
    }

    onMount(() => {
        taskname = task?.taskname || initialInput.taskname || "";
        priority = task?.priority || initialInput.priority || "";
        startDate = task?.startDate || initialInput.startDate || "";
        deadline = task?.deadline || initialInput.deadline || "";
        recurrence = task?.recurrence || initialInput.recurrence || "";
        reminder = task?.reminder || initialInput.reminder || "";
        location = task?.location || initialInput.location || "";
        tagsText = (task?.tags || initialInput.tags || []).join(" ");
        projectTargetId = task?.projectTargetId || initialInput.projectTargetId || "";
        projectAssociationEnabled = !!projectTargetId;
        showMore = !!(recurrence || reminder || location);
        if (isEnhancedDiaryProjectStorageReady(projectStorage)) {
            projectLoading = true;
            loadEnhancedDiaryProjectIndexForWorkspace(projectStorage!)
                .then((value) => {
                    projectIndex = value;
                    if (mode === "create" && projectTargetId &&
                        !isEnhancedDiaryProjectEffectivelyActive(value, projectTargetId)) {
                        projectTargetId = "";
                        projectAssociationEnabled = false;
                    }
                })
                .finally(() => (projectLoading = false));
        }
    });
</script>

<div class="task-editor-panel">
    <div class="panel-section panel-name">
        <label class="task-name-label" for="workspace-task-name">
            <span>任务名称</span>
            <small>必填</small>
        </label>
        <input
            id="workspace-task-name"
            type="text"
            class="b3-text-field task-name-input"
            bind:value={taskname}
            placeholder="输入任务名称"
        />
    </div>

    <div class="panel-section project-association-section">
        <label class="project-association-toggle">
            <input type="checkbox" checked={projectAssociationEnabled} onchange={handleProjectAssociationChange} />
            <span>关联项目<small>勾选后选择具体项目</small></span>
        </label>
        {#if projectAssociationEnabled}
            <div class="project-picker-slot">
                {#if projectLoading}<p class="project-state">正在加载项目树…</p>
                {:else if projectIndex}<WorkspaceProjectPicker index={projectIndex} value={projectTargetId} allowClear={false} preserveSelected={mode === "edit"} onChange={(id) => (projectTargetId = id)} />
                {:else}<p class="project-state">请先在强化日记设置中配置项目位置。</p>{/if}
            </div>
        {/if}
    </div>

    <div class="panel-section">
        <div class="section-label">日期</div>
        <div class="date-row">
            <label class="field-label">
                开始
                <input type="date" class="field-input" bind:value={startDate} />
            </label>
            <label class="field-label">
                截止
                <input type="date" class="field-input" bind:value={deadline} />
            </label>
        </div>
        {#if dateRangeInvalid}<p class="date-warning">开始日期晚于截止日期，请确认日期顺序；保存时不会自动交换。</p>{/if}
    </div>

    <div class="panel-section">
        <div class="section-label">属性</div>
        <div class="field-group">
            <div class="field-col">
                <span class="field-label-text">优先级</span>
                <div class="wk-chip-group">
                    {#each priorityOptions as opt}
                        <button
                            type="button"
                            class="wk-chip"
                            class:selected={priority === opt.value}
                            onclick={() => (priority = opt.value)}
                        >
                            {opt.label}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="field-col">
                <span class="field-label-text">标签</span>
                <input
                    type="text"
                    class="field-input"
                    bind:value={tagsText}
                    placeholder="空格或逗号分隔"
                />
                {#if availableTagSuggestions.length}<div class="tag-suggestions">{#each availableTagSuggestions.slice(0, 12) as tag}<button type="button" onclick={() => addSuggestedTag(tag)}>#{tag}#</button>{/each}</div>{/if}
            </div>
        </div>
    </div>

    <button type="button" class="more-toggle" onclick={() => (showMore = !showMore)}>
        <WorkspaceIcon name="settings" size={13} />
        {showMore ? "收起更多选项" : "更多选项"}
        {#if hasExtended && !showMore}
            <span class="more-has-value">•</span>
        {/if}
    </button>

    {#if showMore}
        <div class="panel-section panel-extended">
            <div class="extended-grid">
                <label class="field-label">
                    重复规则
                    <input type="text" class="field-input" bind:value={recurrence} placeholder="每天 / 每周" />
                </label>
                <label class="field-label">
                    提醒时间
                    <input type="text" class="field-input" bind:value={reminder} placeholder="HH:mm 或 YYYY-MM-DD HH:mm" />
                </label>
                <label class="field-label full-width">
                    地点
                    <input type="text" class="field-input" bind:value={location} placeholder="可选地点" />
                </label>
            </div>
        </div>
    {/if}

    <div class="panel-footer">
        <button type="button" class="wk-btn wk-btn-ghost" onclick={onClose}>取消</button>
        <button type="button" class="wk-btn wk-btn-primary" onclick={submit}>
            {mode === "create" ? "创建任务" : "保存更改"}
        </button>
    </div>
</div>

<style>
    .task-editor-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: 100%;
        width: 100%;
        box-sizing: border-box;
    }

    .panel-section {
        padding: 14px 20px;
    }

    .panel-section + .panel-section {
        padding-top: 0;
    }

    .panel-name {
        padding-bottom: 10px;
    }

    .task-name-label {
        display: flex;
        align-items: baseline;
        gap: 6px;
        margin-bottom: 7px;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        font-weight: 600;
    }

    .task-name-label small {
        color: var(--wk-ink-faint);
        font-size: var(--wk-text-xs);
        font-weight: 400;
    }

    .task-name-input {
        width: 100%;
        border-radius: var(--wk-radius-md);
        color: var(--wk-ink);
        font-size: var(--wk-text-lg);
        font-weight: 600;
        padding: 10px 13px;
        box-sizing: border-box;
        transition: border-color var(--wk-transition-fast), box-shadow var(--wk-transition-fast);
        font-family: inherit;
    }

    .task-name-input:focus {
        outline: none;
        border-color: var(--wk-primary);
        box-shadow: 0 0 0 3px var(--wk-primary-subtle);
    }

    .task-name-input::placeholder {
        color: var(--wk-ink-faint);
        font-weight: 400;
    }

    .project-association-section { display: grid; }
    .project-association-toggle { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; color: var(--wk-ink-secondary); cursor: pointer; }
    .project-association-toggle input { margin: 2px 0 0; accent-color: var(--wk-primary); }
    .project-association-toggle span { display: grid; gap: 2px; font-size: var(--wk-text-sm); font-weight: 600; }
    .project-association-toggle small { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); font-weight: 400; }
    .project-picker-slot { margin-top: 10px; }

    .section-label {
        font-size: var(--wk-text-xs);
        font-weight: 600;
        color: var(--wk-ink-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
    }

    .date-warning { margin: 8px 0 0; color: var(--wk-error); font-size: var(--wk-text-sm); }
    .tag-suggestions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
    .tag-suggestions button { padding: 2px 7px; border: 1px solid var(--wk-border); border-radius: 999px; background: transparent; color: var(--wk-primary); cursor: pointer; }

    .date-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .field-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .field-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .field-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--wk-text-sm);
        font-weight: 500;
        color: var(--wk-ink-muted);
    }

    .field-label-text {
        font-size: var(--wk-text-sm);
        font-weight: 500;
        color: var(--wk-ink-muted);
    }

    .field-input {
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-bg-card);
        color: var(--wk-ink-secondary);
        padding: 7px 10px;
        font-size: var(--wk-text-base);
        width: 100%;
        box-sizing: border-box;
        transition: border-color var(--wk-transition-fast);
    }

    .field-input:focus {
        outline: none;
        border-color: var(--wk-primary);
    }
    .project-state { margin: 0; color: var(--wk-ink-muted); font-size: var(--wk-text-sm); }

    .more-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 20px;
        padding: 6px 0;
        border: none;
        background: transparent;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        width: fit-content;
        transition: color var(--wk-transition-fast);
    }

    .more-toggle:hover {
        color: var(--wk-primary);
    }

    .more-has-value {
        color: var(--wk-primary);
        font-size: 12px;
    }

    .panel-extended {
        padding-top: 10px;
    }

    .extended-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .full-width {
        grid-column: 1 / -1;
    }

    .panel-footer {
        position: sticky;
        z-index: 2;
        bottom: 0;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--wk-border-light);
        background: var(--wk-surface, var(--b3-theme-surface));
    }

    @container (max-width: 500px) {
        .date-row,
        .extended-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
