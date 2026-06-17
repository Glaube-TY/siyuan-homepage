<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import Sortable from "sortablejs";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { getKbSettings, KB_SETTINGS_CHANGED_EVENT } from "@/features/kb/services/settings/kb-settings-service";
    import { buildChatModelOptions } from "@/features/kb/services/settings/chat-model-options";
    import { buildChatModelKey, type ChatModelOption } from "@/features/kb/types/chat-model-selection";
    import {
        normalizeSelectionAiToolbarSettings,
    } from "@/features/kb/services/selection-ai/selection-ai-defaults";
    import type {
        SelectionAiSkill,
        SelectionAiToolbarSettings,
    } from "@/features/kb/services/selection-ai/selection-ai-types";
    import SelectionAiSkillEditorDialog from "./SelectionAiSkillEditorDialog.svelte";
    import { confirmDialogBoolean } from "@/libs/dialog";

    interface Props {
        aiKbDockEnabled: boolean;
        aiKbTabEnabled: boolean;
        advancedEnabled?: boolean;
        statusAiProviderId: string;
        statusAiModelId: string;
        statusAiThinkingEnabled: boolean;
        selectionAiToolbar: SelectionAiToolbarSettings;
        onAiKbDockEnabledChange: (value: boolean) => void;
        onAiKbTabEnabledChange: (value: boolean) => void;
        onStatusAiModelChange: (value: { providerId: string; modelId: string }) => void;
        onStatusAiThinkingEnabledChange: (value: boolean) => void;
        onSelectionAiToolbarChange: (value: SelectionAiToolbarSettings) => void;
    }

    let {
        aiKbDockEnabled,
        aiKbTabEnabled,
        advancedEnabled = false,
        statusAiProviderId,
        statusAiModelId,
        statusAiThinkingEnabled,
        selectionAiToolbar,
        onAiKbDockEnabledChange,
        onAiKbTabEnabledChange,
        onStatusAiModelChange,
        onStatusAiThinkingEnabledChange,
        onSelectionAiToolbarChange,
    }: Props = $props();

    let modelOptions: ChatModelOption[] = $state([]);
    let selectedStatusAiModelKey = $state("");
    let statusAiModelInvalid = $state(false);
    let modelOptionsLoading = $state(false);
    const statusAiVipFeatures = [
        "可使用已配置的大模型生成主页状态语",
        "可单独选择状态语使用的模型",
        "可开启或关闭状态语思考模式",
        "可自定义生成风格和返回长度",
    ];

    function syncSelectedModelState(options: ChatModelOption[] = modelOptions): void {
        if (!advancedEnabled) {
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
        } else {
            const currentKey = buildChatModelKey(statusAiProviderId, statusAiModelId);
            const hasCurrentSelection = Boolean(statusAiProviderId.trim() && statusAiModelId.trim());
            const currentOption = hasCurrentSelection
                ? options.find((option) => option.key === currentKey)
                : undefined;

            if (currentOption) {
                selectedStatusAiModelKey = currentOption.key;
                statusAiModelInvalid = false;
            } else if (hasCurrentSelection) {
                selectedStatusAiModelKey = "";
                statusAiModelInvalid = options.length > 0;
            } else {
                selectedStatusAiModelKey = "";
                statusAiModelInvalid = false;
            }
        }
    }

    async function refreshStatusAiModels(): Promise<void> {
        modelOptionsLoading = true;
        try {
            const settings = await getKbSettings();
            const options = buildChatModelOptions(settings);
            modelOptions = options;
            syncSelectedModelState(options);
        } catch {
            modelOptions = [];
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
        } finally {
            modelOptionsLoading = false;
        }
    }

    function handleStatusAiModelSelect(event: Event): void {
        const key = (event.currentTarget as HTMLSelectElement).value;
        if (!key) {
            // 选择"使用 AI 知识库默认模型"
            selectedStatusAiModelKey = "";
            statusAiModelInvalid = false;
            onStatusAiModelChange({
                providerId: "",
                modelId: "",
            });
            return;
        }

        const option = modelOptions.find((item) => item.key === key);
        if (!option) {
            selectedStatusAiModelKey = "";
            return;
        }

        selectedStatusAiModelKey = option.key;
        statusAiModelInvalid = false;
        onStatusAiModelChange({
            providerId: option.providerId,
            modelId: option.modelId,
        });
    }

    function canUseSelectionAiToolbarSettings(): boolean {
        return advancedEnabled === true;
    }

    function updateSelectionAiToolbar(patch: Partial<SelectionAiToolbarSettings>): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        onSelectionAiToolbarChange(normalizeSelectionAiToolbarSettings({
            ...selectionAiToolbar,
            ...patch,
        }));
    }

    function handleSelectionAiSkillEnabledChange(skillId: string, checked: boolean): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        updateSelectionAiToolbar({
            skills: selectionAiToolbar.skills.map((skill) =>
                skill.id === skillId ? { ...skill, enabled: checked } : skill
            ),
        });
    }

    // 技能管理
    let editingSkill = $state<SelectionAiSkill | null>(null);
    let editorOpen = $state(false);
    let isNewSkill = $state(false);

    function openAddSkill(): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        isNewSkill = true;
        editingSkill = null;
        editorOpen = true;
    }

    function openEditSkill(skill: SelectionAiSkill): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        isNewSkill = false;
        editingSkill = skill;
        editorOpen = true;
    }

    function handleSkillSave(skill: SelectionAiSkill): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        const existing = selectionAiToolbar.skills;
        let nextSkills: SelectionAiSkill[];
        if (isNewSkill) {
            nextSkills = [...existing, { ...skill, order: existing.length }];
        } else {
            nextSkills = existing.map((s) => s.id === skill.id ? skill : s);
        }
        updateSelectionAiToolbar({ skills: nextSkills });
        editorOpen = false;
        editingSkill = null;
    }

    async function handleSkillDelete(skillId: string): Promise<void> {
        if (!canUseSelectionAiToolbarSettings()) return;
        const skill = selectionAiToolbar.skills.find((s) => s.id === skillId);
        if (skill?.builtin) return;
        const confirmed = await confirmDialogBoolean({
            title: "删除自定义技能",
            content: "确定删除该自定义技能？",
        });
        if (!confirmed) return;
        updateSelectionAiToolbar({
            skills: selectionAiToolbar.skills.filter((s) => s.id !== skillId),
        });
    }

    // Sortable 拖拽排序
    let toolbarSkillListEl: HTMLDivElement | null = $state(null);
    let menuSkillListEl: HTMLDivElement | null = $state(null);
    let disabledSkillListEl: HTMLDivElement | null = $state(null);

    let toolbarSkillSortable: Sortable | null = null;
    let menuSkillSortable: Sortable | null = null;
    let disabledSkillSortable: Sortable | null = null;

    function destroySkillSortables(): void {
        toolbarSkillSortable?.destroy();
        menuSkillSortable?.destroy();
        disabledSkillSortable?.destroy();
        toolbarSkillSortable = null;
        menuSkillSortable = null;
        disabledSkillSortable = null;
    }

    async function initSkillSortables(): Promise<void> {
        if (!canUseSelectionAiToolbarSettings()) {
            destroySkillSortables();
            return;
        }
        await tick();
        destroySkillSortables();

        toolbarSkillSortable = createSkillSortable(toolbarSkillListEl);
        menuSkillSortable = createSkillSortable(menuSkillListEl);
        disabledSkillSortable = createSkillSortable(disabledSkillListEl);
    }

    function createSkillSortable(el: HTMLDivElement | null): Sortable | null {
        if (!el || el.children.length < 2) return null;
        return new Sortable(el, {
            animation: 150,
            handle: ".shp-skill-drag-handle",
            ghostClass: "shp-skill-sortable-ghost",
            chosenClass: "shp-skill-sortable-chosen",
            dragClass: "shp-skill-sortable-drag",
            dataIdAttr: "data-skill-id",
            onEnd: handleSkillSortableEnd,
        });
    }

    function readSkillIds(el: HTMLDivElement | null): string[] {
        if (!el) return [];
        return Array.from(el.querySelectorAll<HTMLElement>("[data-skill-id]"))
            .map((node) => node.dataset.skillId)
            .filter((id): id is string => Boolean(id));
    }

    function handleSkillSortableEnd(): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        const toolbarIds = readSkillIds(toolbarSkillListEl);
        const menuIds = readSkillIds(menuSkillListEl);
        const disabledIds = readSkillIds(disabledSkillListEl);
        const orderedIds = [...toolbarIds, ...menuIds, ...disabledIds];

        if (orderedIds.length === 0) return;

        const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

        const nextSkills = selectionAiToolbar.skills
            .map((skill) => ({
                ...skill,
                order: orderMap.get(skill.id) ?? skill.order,
            }))
            .sort((a, b) => a.order - b.order)
            .map((skill, index) => ({ ...skill, order: index }));

        updateSelectionAiToolbar({ skills: nextSkills });
    }

    $effect(() => {
        selectionAiToolbar.skills;
        void initSkillSortables();
    });

    onDestroy(() => destroySkillSortables());

    function toggleSkillPlacement(skillId: string): void {
        if (!canUseSelectionAiToolbarSettings()) return;
        const nextSkills = selectionAiToolbar.skills.map((s) =>
            s.id === skillId ? { ...s, placement: s.placement === "toolbar" ? "menu" as const : "toolbar" as const } : s
        );
        updateSelectionAiToolbar({ skills: nextSkills });
    }

    function handleKbSettingsChanged(): void {
        void refreshStatusAiModels();
    }

    $effect(() => {
        advancedEnabled;
        statusAiProviderId;
        statusAiModelId;
        selectionAiToolbar;
        modelOptions;
        syncSelectedModelState();
    });

    $effect(() => {
        advancedEnabled;
        void refreshStatusAiModels();
    });

    $effect(() => {
        if (!advancedEnabled) {
            editorOpen = false;
            editingSkill = null;
            isNewSkill = false;
            destroySkillSortables();
        }
    });

    onMount(() => {
        window.addEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });

    onDestroy(() => {
        window.removeEventListener(KB_SETTINGS_CHANGED_EVENT, handleKbSettingsChanged);
    });
</script>

<a
    class="tutorial-link-card"
    href="https://blog.glaube-ty.top/archives/019ebc77-d03e-73df-b6ec-10b18545d4a7"
    target="_blank"
    rel="noopener noreferrer"
>
    <svg class="tutorial-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm.75 3.5h-1.5v1.5h1.5V4.5zm0 3h-1.5v5h1.5v-5z" fill="currentColor"/>
    </svg>
    <span class="tutorial-text">查看 AI 知识库使用教程</span>
    <svg class="tutorial-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M4 1h9v9M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
</a>

<SettingSection title="AI 知识库">
    <SettingRow
        title="开启侧边栏对话"
        description="在右侧侧边栏启用 AI 知识库对话入口"
    >
        <div class="switch-with-vip">
            <SiyuanIcon name="vip" size={14} />
            <input
                class="b3-switch"
                type="checkbox"
                checked={aiKbDockEnabled}
                onchange={(e) => onAiKbDockEnabledChange(e.currentTarget.checked)}
            />
        </div>
    </SettingRow>
    <SettingRow
        title="开启标签页对话"
        description="在左上角显示 AI 知识库标签页入口"
    >
        <div class="switch-with-vip">
            <SiyuanIcon name="vip" size={14} />
            <input
                class="b3-switch"
                type="checkbox"
                checked={aiKbTabEnabled}
                onchange={(e) => onAiKbTabEnabledChange(e.currentTarget.checked)}
            />
        </div>
    </SettingRow>
</SettingSection>

<SettingSection title="状态语 AI 生成">
    {#if !advancedEnabled}
        <div class="status-ai-vip-card">
            <div class="status-ai-vip-title">
                <SiyuanIcon name="vip" size={16} />
                <span>AI 状态语是会员专属功能</span>
            </div>
            <p class="status-ai-vip-desc">
                开通会员后，主页可以根据你的真实统计数据自动生成状态语，例如记录天数、笔记数量、文档数量和任务情况，让每次打开主页都有不同的鼓励与提醒。
            </p>
            <ul class="status-ai-vip-list">
                {#each statusAiVipFeatures as feature}
                    <li>
                        <SiyuanIcon name="confirm" size={13} />
                        <span>{feature}</span>
                    </li>
                {/each}
            </ul>
            <div class="status-ai-vip-cta">请前往「会员服务」开通后使用</div>
        </div>
    {:else}
        <SettingRow title="状态语 AI 模型" description="独立选择主页状态语使用的大模型，不影响聊天问答当前模型">
            {#if modelOptionsLoading}
                <span class="model-loading">正在加载模型...</span>
            {:else if modelOptions.length === 0}
                <span class="model-empty">尚未配置可用大模型</span>
            {:else}
                <select
                    class="control-lg"
                    value={selectedStatusAiModelKey}
                    onchange={handleStatusAiModelSelect}
                >
                    <option value="">使用 AI 知识库默认模型</option>
                    {#each modelOptions as option (option.key)}
                        <option value={option.key}>{option.label}</option>
                    {/each}
                </select>
            {/if}
        </SettingRow>

        {#if modelOptions.length === 0 && !modelOptionsLoading}
            <div class="status-ai-panel warning">
                <SiyuanIcon name="warning" size={14} />
                <span>尚未配置可用大模型，请先打开「AI 知识库设置 → 大模型配置」添加提供商和模型。</span>
            </div>
        {:else if statusAiModelInvalid}
            <div class="status-ai-panel warning">
                <SiyuanIcon name="warning" size={14} />
                <span>当前选择不可用，请重新选择。</span>
            </div>
        {/if}

        <SettingRow title="状态语思考模式" description="开启后生成状态语时允许模型使用思考模式，只影响状态语生成">
            <input
                class="b3-switch"
                type="checkbox"
                checked={statusAiThinkingEnabled}
                onchange={(e) => onStatusAiThinkingEnabledChange(e.currentTarget.checked)}
            />
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="编辑器选区 AI 工具栏">
    {#if !advancedEnabled}
        <div class="status-ai-vip-card">
            <div class="status-ai-vip-title">
                <SiyuanIcon name="vip" size={16} />
                <span>编辑器工具栏 AI 是会员专属功能</span>
            </div>
            <p class="status-ai-vip-desc">
                开通会员后，可在思源编辑器中选中文字后直接使用 AI 问答、翻译、解释、润色和自定义技能。
            </p>
            <ul class="status-ai-vip-list">
                {#each ["选中文字后一键 AI 问答", "翻译、解释、润色等内置技能", "支持自定义 AI 技能", "可配置每技能独立模型和参数"] as feature}
                    <li>
                        <SiyuanIcon name="confirm" size={13} />
                        <span>{feature}</span>
                    </li>
                {/each}
            </ul>
            <div class="status-ai-vip-cta">请前往「会员服务」开通后使用</div>
        </div>
    {:else}
    <SettingRow
        title="启用选区 AI 工具栏"
        description="在编辑器正文中划选文字后，在思源原生选区工具栏中显示 AI 操作入口。"
    >
        <input
            class="b3-switch"
            type="checkbox"
            checked={selectionAiToolbar.enabled}
            onchange={(e) => updateSelectionAiToolbar({ enabled: e.currentTarget.checked })}
        />
    </SettingRow>

    <div class="shp-skill-manager">
        <div class="shp-skill-manager-header">
            <span class="shp-skill-manager-title">技能管理</span>
            <button
                type="button"
                class="b3-button b3-button--small b3-button--outline shp-skill-manager-add-btn"
                disabled={!selectionAiToolbar.enabled}
                onclick={openAddSkill}
            >+ 添加技能</button>
        </div>
        <p class="shp-skill-manager-desc">AI 问答会打开侧边栏；其他技能在选区附近弹窗中一次性生成。</p>

        {#if true}
            {@const sortedSkills = [...selectionAiToolbar.skills].sort((a, b) => a.order - b.order)}
            {@const toolbarSkills = sortedSkills.filter((s) => s.enabled && s.placement === "toolbar")}
            {@const menuSkills = sortedSkills.filter((s) => s.enabled && s.placement === "menu")}
            {@const disabledSkills = sortedSkills.filter((s) => !s.enabled)}

            {#if toolbarSkills.length > 0}
            <div class="shp-skill-group">
                <span class="shp-skill-group-label">直接显示在 AI 菜单中</span>
                <div class="shp-skill-list" bind:this={toolbarSkillListEl}>
                {#each toolbarSkills as skill (skill.id)}
                    <div class="shp-skill-card" data-skill-id={skill.id}>
                        <span class="shp-skill-drag-handle" title="拖动排序">⋮⋮</span>
                        <span class="shp-skill-card-icon" title={skill.builtin ? "内置技能" : "自定义技能"}>
                            {skill.builtin ? "⚡" : "✦"}
                        </span>
                        <span class="shp-skill-card-name">{skill.name}</span>
                        {#if skill.builtin}
                            <span class="shp-skill-card-badge">内置</span>
                        {/if}
                        <div class="shp-skill-card-actions">
                            <button
                                type="button"
                                class="shp-skill-card-btn"
                                title="移到折叠组"
                                disabled={!selectionAiToolbar.enabled}
                                onclick={() => toggleSkillPlacement(skill.id)}
                            >⊻</button>
                            <button
                                type="button"
                                class="shp-skill-card-btn"
                                title="编辑"
                                disabled={!selectionAiToolbar.enabled}
                                onclick={() => openEditSkill(skill)}
                            >✎</button>
                            {#if !skill.builtin}
                                <button
                                    type="button"
                                    class="shp-skill-card-btn shp-skill-card-btn--danger"
                                    title="删除"
                                    disabled={!selectionAiToolbar.enabled}
                                    onclick={() => handleSkillDelete(skill.id)}
                                >✕</button>
                            {/if}
                            <input
                                class="b3-switch"
                                type="checkbox"
                                checked={true}
                                disabled={!selectionAiToolbar.enabled}
                                onchange={() => handleSelectionAiSkillEnabledChange(skill.id, false)}
                                title="停用"
                            />
                        </div>
                    </div>
                {/each}
                </div>
            </div>
        {/if}

        {#if menuSkills.length > 0}
            <div class="shp-skill-group">
                <span class="shp-skill-group-label">折叠在更多技能中</span>
                <div class="shp-skill-list" bind:this={menuSkillListEl}>
                {#each menuSkills as skill (skill.id)}
                    <div class="shp-skill-card" data-skill-id={skill.id}>
                        <span class="shp-skill-drag-handle" title="拖动排序">⋮⋮</span>
                        <span class="shp-skill-card-icon" title={skill.builtin ? "内置技能" : "自定义技能"}>
                            {skill.builtin ? "⚡" : "✦"}
                        </span>
                        <span class="shp-skill-card-name">{skill.name}</span>
                        {#if skill.builtin}
                            <span class="shp-skill-card-badge">内置</span>
                        {/if}
                        <div class="shp-skill-card-actions">
                            <button
                                type="button"
                                class="shp-skill-card-btn"
                                title="移到直接显示"
                                disabled={!selectionAiToolbar.enabled}
                                onclick={() => toggleSkillPlacement(skill.id)}
                            >⊻</button>
                            <button
                                type="button"
                                class="shp-skill-card-btn"
                                title="编辑"
                                disabled={!selectionAiToolbar.enabled}
                                onclick={() => openEditSkill(skill)}
                            >✎</button>
                            {#if !skill.builtin}
                                <button
                                    type="button"
                                    class="shp-skill-card-btn shp-skill-card-btn--danger"
                                    title="删除"
                                    disabled={!selectionAiToolbar.enabled}
                                    onclick={() => handleSkillDelete(skill.id)}
                                >✕</button>
                            {/if}
                            <input
                                class="b3-switch"
                                type="checkbox"
                                checked={true}
                                disabled={!selectionAiToolbar.enabled}
                                onchange={() => handleSelectionAiSkillEnabledChange(skill.id, false)}
                                title="停用"
                            />
                        </div>
                    </div>
                {/each}
                </div>
            </div>
        {/if}

        {#if disabledSkills.length > 0}
            <div class="shp-skill-group">
                <span class="shp-skill-group-label shp-skill-group-label--dim">已停用</span>
                <div class="shp-skill-list" bind:this={disabledSkillListEl}>
                {#each disabledSkills as skill (skill.id)}
                    <div class="shp-skill-card shp-skill-card--disabled" data-skill-id={skill.id}>
                        <span class="shp-skill-drag-handle" title="拖动排序">⋮⋮</span>
                        <span class="shp-skill-card-icon" title={skill.builtin ? "内置技能" : "自定义技能"}>
                            {skill.builtin ? "⚡" : "✦"}
                        </span>
                        <span class="shp-skill-card-name">{skill.name}</span>
                        {#if skill.builtin}
                            <span class="shp-skill-card-badge">内置</span>
                        {/if}
                        <div class="shp-skill-card-actions">
                            <button
                                type="button"
                                class="shp-skill-card-btn"
                                title="编辑"
                                disabled={!selectionAiToolbar.enabled}
                                onclick={() => openEditSkill(skill)}
                            >✎</button>
                            {#if !skill.builtin}
                                <button
                                    type="button"
                                    class="shp-skill-card-btn shp-skill-card-btn--danger"
                                    title="删除"
                                    disabled={!selectionAiToolbar.enabled}
                                    onclick={() => handleSkillDelete(skill.id)}
                                >✕</button>
                            {/if}
                            <input
                                class="b3-switch"
                                type="checkbox"
                                checked={false}
                                disabled={!selectionAiToolbar.enabled}
                                onchange={() => handleSelectionAiSkillEnabledChange(skill.id, true)}
                                title="启用"
                            />
                        </div>
                    </div>
                {/each}
                </div>
            </div>
        {/if}

        {#if sortedSkills.length === 0}
            <div class="shp-skill-empty">暂无技能，点击上方「+ 添加技能」创建。</div>
        {/if}
        {/if}
    </div>
    {/if}
</SettingSection>

{#if editorOpen}
    <SelectionAiSkillEditorDialog
        skill={editingSkill}
        onSave={handleSkillSave}
        onClose={() => { editorOpen = false; editingSkill = null; }}
    />
{/if}

<style>
    .tutorial-link-card {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, var(--b3-border-color));
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface));
        font-size: 13px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }

    .tutorial-link-card:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
        border-color: color-mix(in srgb, var(--b3-theme-primary) 50%, var(--b3-border-color));
    }

    .tutorial-icon {
        flex-shrink: 0;
    }

    .tutorial-text {
        flex: 1;
        line-height: 1.4;
    }

    .tutorial-arrow {
        flex-shrink: 0;
        opacity: 0.6;
    }

    .tutorial-link-card:hover .tutorial-arrow {
        opacity: 1;
    }

    .switch-with-vip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--b3-theme-primary);
    }

    .model-loading,
    .model-empty {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .status-ai-panel {
        display: flex;
        align-items: flex-start;
        gap: 0.45rem;
        margin: 0.25rem 0 0.75rem;
        padding: 0.55rem 0.65rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }

    .status-ai-panel :global(svg) {
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }

    .status-ai-panel.warning {
        border-color: color-mix(in srgb, var(--b3-theme-error) 35%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-error) 8%, var(--b3-theme-surface));
    }

    .status-ai-panel.warning :global(svg) {
        color: var(--b3-theme-error);
    }

    .status-ai-vip-card {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.85rem 0.95rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
        color: var(--b3-theme-on-surface);
    }

    .status-ai-vip-title {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-weight: 600;
        color: var(--b3-theme-primary);
    }

    .status-ai-vip-desc {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--b3-theme-on-surface);
    }

    .status-ai-vip-list {
        display: grid;
        gap: 0.35rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 12px;
        line-height: 1.5;
    }

    .status-ai-vip-list li {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
    }

    .status-ai-vip-list :global(svg) {
        margin-top: 2px;
        color: var(--b3-theme-primary);
    }

    .status-ai-vip-cta {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-primary);
    }

    /* 技能管理面板 */
    .shp-skill-manager {
        margin: 0.5rem 0 1rem;
    }

    .shp-skill-manager-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.35rem;
    }

    .shp-skill-manager-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .shp-skill-manager-add-btn {
        font-size: 12px;
        padding: 0.2rem 0.6rem;
    }

    .shp-skill-manager-desc {
        margin: 0 0 0.75rem;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
    }

    .shp-skill-group {
        margin-bottom: 0.65rem;
    }

    .shp-skill-group-label {
        display: block;
        margin-bottom: 0.35rem;
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .shp-skill-group-label--dim {
        color: var(--b3-theme-on-surface-light);
    }

    .shp-skill-card {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.55rem;
        margin-bottom: 0.25rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        transition: background 0.1s;
    }

    .shp-skill-card:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 4%, var(--b3-theme-surface));
    }

    .shp-skill-card--disabled {
        opacity: 0.65;
    }

    .shp-skill-card-icon {
        flex-shrink: 0;
        font-size: 14px;
        width: 22px;
        text-align: center;
    }

    .shp-skill-card-name {
        flex: 1;
        min-width: 0;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shp-skill-card-badge {
        flex-shrink: 0;
        padding: 0.1rem 0.35rem;
        font-size: 10px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
        font-weight: 500;
    }

    .shp-skill-card-actions {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        flex-shrink: 0;
    }

    .shp-skill-card-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: none;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        border-radius: 4px;
        font-size: 12px;
    }

    .shp-skill-card-btn:hover {
        background: var(--b3-theme-surface-light);
        color: var(--b3-theme-on-surface);
    }

    .shp-skill-card-btn--danger:hover {
        color: var(--b3-theme-error);
    }

    .shp-skill-card-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .shp-skill-card-actions .b3-switch {
        margin: 0;
    }

    .shp-skill-empty {
        padding: 1rem;
        text-align: center;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .shp-skill-list {
        display: flex;
        flex-direction: column;
    }

    .shp-skill-drag-handle {
        flex-shrink: 0;
        width: 16px;
        text-align: center;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        cursor: grab;
        user-select: none;
        letter-spacing: -1px;
    }

    .shp-skill-drag-handle:hover {
        color: var(--b3-theme-on-surface);
    }

    .shp-skill-manager :global(.shp-skill-sortable-ghost) {
        opacity: 0.4;
        border: 1px dashed var(--b3-theme-primary) !important;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface)) !important;
    }

    .shp-skill-manager :global(.shp-skill-sortable-chosen .shp-skill-drag-handle) {
        color: var(--b3-theme-primary);
        cursor: grabbing;
    }
</style>
