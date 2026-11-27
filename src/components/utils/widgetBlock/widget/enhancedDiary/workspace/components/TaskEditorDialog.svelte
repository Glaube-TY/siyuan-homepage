<script lang="ts">
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { getTaskIndexResult } from "@/components/tools/siyuanComponentDataApi";
    import { parseTaskLine, type GenerateTasksPlusTaskInput } from "@/features/task-data/task-parser";
    import { isEnhancedDiarySystemTaskMarkdown } from "../../enhancedDiaryUtils";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import { loadCommonTaskNames, updateCommonTaskName } from "../enhancedDiaryCommonTasks";
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
        onSubmit: (input: GenerateTasksPlusTaskInput) => boolean | void | Promise<boolean | void>;
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
    let showAttributes = $state(false);
    let showMore = $state(false);
    let projectAssociationEnabled = $state(false);
    let projectTargetId = $state("");
    let projectIndex = $state<EnhancedDiaryProjectIndexPayload | null>(null);
    let projectLoading = $state(false);
    let submitting = $state(false);
    let submitted = $state(false);
    let commonTaskNames = $state<string[] | null>(null);
    let commonTasksLoadFailed = $state(false);
    let savingCommonTask = $state(false);
    let indexedTaskNames = $state.raw<Map<string, string> | null>(null);
    let taskNamesRequested = false;
    let nameSuggestionsOpen = $state(false);
    let activeNameSuggestion = $state(-1);
    const nameSuggestionsId = $props.id();
    let taskNameInput: HTMLInputElement;
    let alive = true;
    onDestroy(() => { alive = false; });

    const priorityOptions = [
        { value: "", label: "无" },
        { value: "❗", label: "低" },
        { value: "❗❗", label: "中" },
        { value: "❗❗❗", label: "高" },
        { value: "❗❗❗❗", label: "紧急" },
    ];

    const attributeCount = $derived([
        projectTargetId, startDate || deadline, priority, tagsText.trim(), recurrence.trim(), reminder.trim(), location.trim(),
    ].filter(Boolean).length);
    const hasExtended = $derived(recurrence !== "" || reminder !== "" || location !== "");
    const dateRangeInvalid = $derived(!!startDate && !!deadline && startDate > deadline);
    const currentTaskName = $derived(taskname.trim());
    const isCommonTask = $derived(commonTaskNames?.includes(currentTaskName) ?? false);
    const commonTaskBusy = $derived(savingCommonTask || submitting || submitted);
    const nameSuggestions = $derived.by(() => {
        if (!nameSuggestionsOpen || !indexedTaskNames) return [];
        const query = currentTaskName.toLowerCase();
        const limit = 6;
        const exact = indexedTaskNames.get(query);
        const bestMatches = exact ? [exact] : [];
        const partialMatches: string[] = [];
        for (const [key, name] of indexedTaskNames) {
            if (key === query) continue;
            if (key.startsWith(query)) {
                bestMatches.push(name);
                if (bestMatches.length === limit) break;
            } else if (partialMatches.length < limit && key.includes(query)) {
                partialMatches.push(name);
            }
        }
        return [...bestMatches, ...partialMatches].slice(0, limit);
    });
    const availableTagSuggestions = $derived(tagSuggestions.filter((tag) =>
        !parseTags(tagsText).some((selected) => selected.toLocaleLowerCase() === tag.toLocaleLowerCase())
    ));

    function parseTags(value: string): string[] {
        return value
            .split(/[，,\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    async function submit(): Promise<void> {
        if (submitting || submitted || !alive) return;
        if (!currentTaskName) {
            showMessage("任务名称不能为空", 3000);
            taskNameInput?.focus();
            return;
        }
        submitting = true;
        try {
            const result = await onSubmit({
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
            if (alive && result !== false) submitted = true;
        } catch (err) {
            if (alive) showMessage(err instanceof Error ? err.message : "任务提交失败，请重试", 4000);
        } finally {
            if (alive) submitting = false;
        }
    }

    async function refreshCommonTasks(): Promise<void> {
        commonTaskNames = null;
        commonTasksLoadFailed = false;
        try {
            const names = await loadCommonTaskNames();
            if (alive) commonTaskNames = names;
        } catch {
            if (alive) commonTasksLoadFailed = true;
        }
    }

    async function changeCommonTask(name: string, operation: "save" | "remove"): Promise<void> {
        if (!alive || commonTaskBusy || commonTaskNames === null) return;
        savingCommonTask = true;
        try {
            const names = await updateCommonTaskName(name, operation);
            if (alive) {
                commonTaskNames = names;
                if (operation === "remove") taskNameInput?.focus();
            }
        } catch (error) {
            if (alive) {
                showMessage(error instanceof Error ? error.message : "常用任务保存失败", 4000, "error");
                await refreshCommonTasks();
            }
        } finally {
            if (alive) savingCommonTask = false;
        }
    }

    async function handleTaskNameInput(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
        if (mode !== "create" || (event as InputEvent).isComposing) return;
        activeNameSuggestion = -1;
        nameSuggestionsOpen = [...event.currentTarget.value.trim()].length >= 2;
        if (!nameSuggestionsOpen || taskNamesRequested) return;
        taskNamesRequested = true;
        try {
            const { items } = await getTaskIndexResult();
            if (!alive) return;
            const names = new Map<string, string>();
            for (const item of items) {
                const { taskname: name, markdown } = parseTaskLine(item.markdown || item.content || "");
                const key = name.toLowerCase();
                if (key && !names.has(key) && !isEnhancedDiarySystemTaskMarkdown(markdown)) names.set(key, name);
            }
            indexedTaskNames = names;
        } catch {
            if (alive) showMessage("任务联想加载失败，请检查任务索引", 4000, "error");
        }
    }

    function fillTaskName(name: string): void {
        taskname = name;
        nameSuggestionsOpen = false;
    }

    function handleTaskNameKeydown(event: KeyboardEvent): void {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            const suggestion = nameSuggestions[activeNameSuggestion];
            if (suggestion) fillTaskName(suggestion);
            else void submit();
            return;
        }

        if (!nameSuggestions.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const lastIndex = nameSuggestions.length - 1;
            if (event.key === "ArrowDown") activeNameSuggestion = Math.min(activeNameSuggestion + 1, lastIndex);
            else activeNameSuggestion = activeNameSuggestion < 0 ? lastIndex : Math.max(0, activeNameSuggestion - 1);
            taskNameInput.ownerDocument.getElementById(`${nameSuggestionsId}-${activeNameSuggestion}`)
                ?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            nameSuggestionsOpen = false;
        }
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
        showAttributes = mode === "edit" || attributeCount > 0;
        if (mode === "create") {
            taskNameInput.focus({ preventScroll: true });
            void refreshCommonTasks();
        }
        if (isEnhancedDiaryProjectStorageReady(projectStorage)) {
            projectLoading = true;
            loadEnhancedDiaryProjectIndexForWorkspace(projectStorage!)
                .then((value) => {
                    if (!alive) return;
                    projectIndex = value;
                    if (mode === "create" && projectTargetId &&
                        !isEnhancedDiaryProjectEffectivelyActive(value, projectTargetId)) {
                        projectTargetId = "";
                        projectAssociationEnabled = false;
                    }
                })
                .catch(() => { if (alive) showMessage("项目树加载失败，请重新打开弹窗重试", 4000); })
                .finally(() => { if (alive) projectLoading = false; });
        }
    });
</script>

<div class="task-editor-panel">
    <div class="panel-section panel-name">
        <div class="task-name-header">
            <label class="task-name-label" for="workspace-task-name">
                <span>任务名称</span>
            </label>
            {#if mode === "create"}
                <button type="button" class="wk-btn wk-btn-ghost"
                    disabled={!currentTaskName || commonTaskNames === null || isCommonTask || commonTaskBusy}
                    onclick={() => changeCommonTask(currentTaskName, "save")}>
                    {isCommonTask ? "已存为常用" : "存为常用"}
                </button>
            {/if}
        </div>
        <div class="task-name-field">
            <input
                id="workspace-task-name"
                type="text"
                aria-required="true"
                class="b3-text-field task-name-input"
                bind:this={taskNameInput}
                bind:value={taskname}
                placeholder="输入任务名称"
                autocomplete={mode === "create" ? "off" : undefined}
                role={mode === "create" ? "combobox" : undefined}
                aria-autocomplete={mode === "create" ? "list" : undefined}
                aria-expanded={mode === "create" ? nameSuggestions.length > 0 : undefined}
                aria-controls={nameSuggestions.length ? nameSuggestionsId : undefined}
                aria-activedescendant={nameSuggestions[activeNameSuggestion] ? `${nameSuggestionsId}-${activeNameSuggestion}` : undefined}
                oninput={handleTaskNameInput}
                oncompositionstart={() => (nameSuggestionsOpen = false)}
                oncompositionend={handleTaskNameInput}
                onblur={() => (nameSuggestionsOpen = false)}
                onkeydown={handleTaskNameKeydown}
            />
            {#if nameSuggestions.length}
                <div id={nameSuggestionsId} class="task-name-suggestions" role="listbox" aria-label="任务名称联想">
                    {#each nameSuggestions as name, index (name)}
                        <button type="button" role="option" tabindex="-1" id={`${nameSuggestionsId}-${index}`}
                            aria-selected={index === activeNameSuggestion} title={name}
                            onmousedown={(event) => event.preventDefault()} onclick={() => fillTaskName(name)}>
                            {name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        {#if commonTaskNames?.length}
            <div class="common-task-list" role="group" aria-label="常用任务">
                <span aria-hidden="true">常用任务</span>
                {#each commonTaskNames as name (name)}
                    <div class="common-task-item">
                        <button type="button" class="wk-btn wk-btn-ghost common-task-name" title={name}
                            disabled={commonTaskBusy} onclick={() => fillTaskName(name)}>
                            <span>{name}</span>
                        </button>
                        <button type="button" class="wk-btn common-task-remove"
                            title="移除常用任务" aria-label={`移除常用任务 ${name}`}
                            disabled={commonTaskBusy} onclick={() => changeCommonTask(name, "remove")}>
                            <WorkspaceIcon name="close" size={12} />
                        </button>
                    </div>
                {/each}
            </div>
        {:else if commonTasksLoadFailed}
            <div class="common-task-list">
                <span role="status">常用任务读取失败</span>
                <button type="button" class="wk-btn wk-btn-ghost" onclick={refreshCommonTasks}>重试</button>
            </div>
        {/if}
    </div>

    <button type="button" class="attributes-toggle" aria-expanded={showAttributes}
        aria-controls={`${nameSuggestionsId}-attributes`} onclick={() => (showAttributes = !showAttributes)}>
        <span>任务属性</span>
        <span class="attributes-disclosure">
            {#if !showAttributes && attributeCount}
                <span class="attributes-summary">已填写 {attributeCount} 项</span>
            {/if}
            <ChevronRight size={15} aria-hidden="true" />
        </span>
    </button>
    <div class="task-attributes" id={`${nameSuggestionsId}-attributes`} hidden={!showAttributes}>
        <div class="panel-section project-association-section">
            <label class="project-association-toggle">
                <input type="checkbox" checked={projectAssociationEnabled} onchange={handleProjectAssociationChange} />
                <span>关联项目</span>
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
            <div class="field-group">
                <div class="field-col">
                    <span class="field-label-text">优先级</span>
                    <div class="wk-chip-group">
                        {#each priorityOptions as opt}
                            <button
                                type="button"
                                class="wk-chip"
                                class:selected={priority === opt.value}
                                aria-pressed={priority === opt.value}
                                onclick={() => (priority = opt.value)}
                            >
                                {opt.label}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="field-col">
                    <label class="field-label-text" for={`${nameSuggestionsId}-tags`}>标签</label>
                    <input
                        id={`${nameSuggestionsId}-tags`}
                        type="text"
                        class="field-input"
                        bind:value={tagsText}
                        placeholder="空格或逗号分隔"
                    />
                    {#if availableTagSuggestions.length}<div class="tag-suggestions">{#each availableTagSuggestions.slice(0, 12) as tag}<button type="button" onclick={() => addSuggestedTag(tag)}>#{tag}#</button>{/each}</div>{/if}
                </div>
            </div>
        </div>

        <button type="button" class="more-toggle" aria-expanded={showMore} onclick={() => (showMore = !showMore)}>
            <WorkspaceIcon name="settings" size={13} />
            {showMore ? "收起更多选项" : "更多选项"}
            {#if hasExtended && !showMore}
                <span class="attributes-summary">已填写</span>
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
    </div>

    <div class="panel-footer">
        <button type="button" class="wk-btn wk-btn-ghost" onclick={onClose} disabled={submitting}>取消</button>
        <button type="button" class="wk-btn wk-btn-primary" onclick={submit} disabled={submitting || submitted} aria-busy={submitting}>
            {submitting ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建任务" : "保存更改"}
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

    .task-name-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 7px;
    }

    .task-name-label {
        display: flex;
        align-items: baseline;
        gap: 6px;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        font-weight: 600;
    }

    .common-task-list {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
    }

    .task-name-header .wk-btn,
    .common-task-list .wk-btn {
        min-height: 26px;
        padding: 3px 7px;
        font-size: var(--wk-text-sm);
    }

    .common-task-item {
        display: inline-flex;
        max-width: 100%;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface-3);
    }
    .common-task-name { min-width: 0; }
    .common-task-name span { overflow: hidden; text-overflow: ellipsis; }
    .common-task-remove { flex: none; }
    .common-task-remove:hover:not(:disabled) { color: var(--wk-primary); }

    .task-name-header button:focus-visible,
    .common-task-list button:focus-visible {
        outline: 2px solid var(--wk-primary);
        outline-offset: -2px;
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

    .task-name-field { position: relative; }

    .task-name-suggestions {
        position: absolute;
        z-index: 3;
        inset: calc(100% + 4px) 0 auto;
        box-sizing: border-box;
        max-height: min(224px, 40dvh);
        overflow: auto;
        overscroll-behavior: contain;
        padding: 4px;
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-md);
        background: var(--wk-surface);
        box-shadow: var(--wk-shadow-popover);
    }

    .task-name-suggestions button {
        display: block;
        width: 100%;
        min-height: 34px;
        padding: 6px 9px;
        border: 0;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-ink);
        font: inherit;
        font-size: var(--wk-text-base);
        text-align: start;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
    }

    .task-name-suggestions button:hover,
    .task-name-suggestions button[aria-selected="true"] {
        background: var(--wk-primary-subtle);
    }

    .attributes-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 38px;
        margin: 0 20px;
        padding: 6px 0;
        border: 0;
        border-top: 1px solid var(--wk-border-light);
        background: transparent;
        color: var(--wk-ink);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
    .attributes-toggle:hover { background: var(--wk-surface-3); color: var(--wk-primary); }
    .attributes-toggle:focus-visible { outline: 2px solid var(--wk-primary); outline-offset: -2px; }
    .attributes-disclosure { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-ink-secondary); }
    .attributes-disclosure :global(svg) { fill: none; }
    .attributes-toggle[aria-expanded="true"] .attributes-disclosure :global(svg) { transform: rotate(90deg); }
    .attributes-summary { color: var(--wk-ink-secondary); font-size: var(--wk-text-xs); font-weight: 400; }
    .task-attributes {
        margin: 0 20px 10px;
        padding: 3px 0 0;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-surface-3);
    }
    .task-attributes .panel-section { padding-inline: 14px; }
    .project-association-section { display: grid; }
    .project-association-toggle { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; color: var(--wk-ink-secondary); cursor: pointer; }
    .project-association-toggle input { margin: 2px 0 0; accent-color: var(--wk-primary); }
    .project-association-toggle span { display: grid; gap: 2px; font-size: var(--wk-text-sm); font-weight: 600; }
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
