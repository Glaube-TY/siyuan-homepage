<script lang="ts">
    import { onMount } from "svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";
    import WorkspaceProjectPicker from "./WorkspaceProjectPicker.svelte";
    import { loadEnhancedDiaryProjectIndexForWorkspace } from "../enhancedDiaryWorkspaceProjectService";
    import { isEnhancedDiaryProjectEffectivelyActive, resolveEnhancedDiaryProjectTarget } from "../../enhancedDiaryProjectIndex";
    import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryProjectStorageConfig } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryProjectIndexPayload } from "../../enhancedDiaryProjectTypes";
    import type { QuickRecordDialogSubmitInput } from "../enhancedDiaryWorkspaceRecordService";

    interface Props {
        mode?: "create" | "edit";
        initialCategoryTitle?: string;
        initialContent?: string;
        suggestedCategories?: string[];
        onSubmit: (input: QuickRecordDialogSubmitInput) => void | Promise<void>;
        onClose: () => void;
        initialTags?: string[];
        initialProjectTargetId?: string;
        initialIsKeyRecord?: boolean;
        projectStorage?: EnhancedDiaryProjectStorageConfig;
    }

    let {
        mode = "create",
        initialCategoryTitle = "",
        initialContent = "",
        suggestedCategories = ["未分类", "想法", "问题", "决策", "日志"],
        onSubmit,
        onClose,
        initialTags = [], initialProjectTargetId = "", initialIsKeyRecord = false, projectStorage,
    }: Props = $props();

    let categoryTitle = $state("");
    let content = $state("");
    let customCategory = $state("");
    let tagsText = $state("");
    let projectAssociationEnabled = $state(false);
    let projectTargetId = $state("");
    let isKeyRecord = $state(false);
    let projectIndex = $state<EnhancedDiaryProjectIndexPayload | null>(null);

    const showCustomInput = $derived(!suggestedCategories.includes(categoryTitle) && categoryTitle !== "");

    function selectCategory(cat: string): void {
        if (categoryTitle === cat) {
            categoryTitle = "";
        } else {
            categoryTitle = cat;
            customCategory = "";
        }
    }

    function handleProjectAssociationChange(event: Event): void {
        projectAssociationEnabled = (event.currentTarget as HTMLInputElement).checked;
        if (!projectAssociationEnabled) {
            projectTargetId = "";
            isKeyRecord = false;
        }
    }

    function submit(): void {
        const title = showCustomInput ? (customCategory.trim() || categoryTitle.trim() || "未分类") : (categoryTitle.trim() || "未分类");
        const target = projectTargetId && projectIndex ? resolveEnhancedDiaryProjectTarget(projectIndex, projectTargetId) : null;
        onSubmit({
            categoryTitle: title, content,
            tags: tagsText.split(/[，,\s]+/).map((tag) => tag.replace(/^#+|#+$/g, "").trim()).filter(Boolean),
            projectTargetId: projectTargetId || undefined,
            projectTitle: target?.title,
            rootProjectId: target?.rootProjectId,
            projectPath: target?.pathTitles,
            projectAncestorTargetIds: target?.ancestorTargetIds,
            isKeyRecord: !!projectTargetId && isKeyRecord,
        });
    }

    onMount(() => {
        if (mode === "edit") {
            categoryTitle = initialCategoryTitle || "未分类";
        } else {
            categoryTitle = initialCategoryTitle || "";
        }
        content = initialContent;
        tagsText = initialTags.join(" ");
        projectTargetId = initialProjectTargetId;
        projectAssociationEnabled = !!projectTargetId;
        isKeyRecord = !!initialProjectTargetId && initialIsKeyRecord;
        if (isEnhancedDiaryProjectStorageReady(projectStorage)) {
            loadEnhancedDiaryProjectIndexForWorkspace(projectStorage!).then((value) => {
                projectIndex = value;
                if (mode === "create" && projectTargetId &&
                    !isEnhancedDiaryProjectEffectivelyActive(value, projectTargetId)) {
                    projectTargetId = "";
                    projectAssociationEnabled = false;
                }
            });
        }
    });

    $effect(() => { if (!projectTargetId) isKeyRecord = false; });
</script>

<div class="quick-record-panel">
    <div class="panel-section panel-content">
        <div class="section-label">内容</div>
        <textarea bind:value={content} placeholder="写下这条记录..." class="record-textarea"></textarea>
    </div>
    <div class="panel-section">
        <div class="section-label">分类</div>
        <div class="wk-chip-group">
            {#each suggestedCategories as cat}
                <button
                    type="button"
                    class="wk-chip"
                    class:selected={categoryTitle === cat}
                    onclick={() => selectCategory(cat)}
                >
                    {cat}
                </button>
            {/each}
        </div>
        {#if showCustomInput}
            <input
                type="text"
                class="custom-category-input"
                bind:value={customCategory}
                placeholder="自定义分类名称"
                maxlength="30"
            />
        {/if}
    </div>

    <div class="panel-section metadata-section">
        <label><span class="section-label">标签</span><input class="custom-category-input no-margin" bind:value={tagsText} placeholder="空格或逗号分隔" /></label>
        <div class="project-association-block">
            <label class="project-association-toggle">
                <input type="checkbox" checked={projectAssociationEnabled} onchange={handleProjectAssociationChange} />
                <span>关联项目<small>勾选后选择具体项目</small></span>
            </label>
            {#if projectAssociationEnabled}
                <div class="project-picker-slot">
                    {#if projectIndex}<WorkspaceProjectPicker index={projectIndex} value={projectTargetId} allowClear={false} preserveSelected={mode === "edit"} onChange={(id) => (projectTargetId = id)} />
                    {:else}<small>请先配置项目位置，或稍候项目树加载。</small>{/if}
                </div>
                <label class="key-record-row" class:disabled={!projectTargetId}>
                    <input type="checkbox" bind:checked={isKeyRecord} disabled={!projectTargetId} />
                    <span>设为关键记录<small>{projectTargetId ? "会在项目工作台重点展示" : "选择具体项目后，可以将记录设为关键记录"}</small></span>
                </label>
            {/if}
        </div>
    </div>

    <div class="panel-footer">
        <button type="button" class="wk-btn wk-btn-ghost" onclick={onClose}>取消</button>
        <button type="button" class="wk-btn wk-btn-primary" onclick={submit}>
            {mode === "edit" ? "保存更改" : "添加记录"}
        </button>
    </div>
</div>

<style>
    .quick-record-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: 100%;
        width: 100%;
        box-sizing: border-box;
    }

    .panel-section {
        padding: 16px 20px;
    }

    .panel-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-top: 0;
    }

    .section-label {
        font-size: var(--wk-text-xs);
        font-weight: 600;
        color: var(--wk-ink-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 10px;
    }

    .custom-category-input {
        margin-top: 8px;
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
    .no-margin { margin-top: 0; }
    .metadata-section { display: grid; gap: 14px; padding-top: 0; }
    .metadata-section label { display: grid; gap: 6px; }
    .metadata-section .section-label { margin-bottom: 0; }
    .metadata-section small { color: var(--wk-ink-muted); }
    .project-association-block { display: grid; gap: 10px; }
    .project-association-toggle { grid-template-columns: auto minmax(0, 1fr); align-items: start; color: var(--wk-ink-secondary); cursor: pointer; }
    .project-association-toggle input { margin: 2px 0 0; accent-color: var(--wk-primary); }
    .project-association-toggle span { display: grid; gap: 2px; font-size: var(--wk-text-sm); font-weight: 600; }
    .project-association-toggle small { color: var(--wk-ink-faint); font-size: var(--wk-text-xs); font-weight: 400; }
    .project-picker-slot { display: grid; gap: 8px; }
    .key-record-row { grid-template-columns: auto 1fr !important; align-items: start; }
    .key-record-row span { display: grid; gap: 2px; }
    .key-record-row.disabled { opacity: .6; }

    .custom-category-input:focus {
        outline: none;
        border-color: var(--wk-primary);
    }

    .record-textarea {
        flex: 1;
        min-height: 140px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-bg-card);
        color: var(--wk-ink-secondary);
        padding: 14px;
        font-size: var(--wk-text-md);
        line-height: 1.7;
        resize: vertical;
        width: 100%;
        box-sizing: border-box;
        transition: border-color var(--wk-transition-fast);
        font-family: inherit;
    }

    .record-textarea:focus {
        outline: none;
        border-color: var(--wk-primary);
    }

    .record-textarea::placeholder {
        color: var(--wk-ink-faint);
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
</style>
