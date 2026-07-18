<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte';
    import Sortable from 'sortablejs';
    import type { ButtonItem, ButtonSettingsActions } from '../types';
    import { displayShortcut, eventToShortcutString } from '../../header/quick-button';
    import { isCoreButton, getButtonActionMeta } from '../buttonSettings';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';
    import SiyuanIcon from '@/components/utils/shared/SiyuanIcon.svelte';

    interface Props {
        buttonsList: ButtonItem[];
        selectedButton: ButtonItem | null;
        actions: ButtonSettingsActions;
    }

    let {
        buttonsList,
        selectedButton,
        actions
    }: Props = $props();

    let currentLabel = $derived(selectedButton?.label ?? "");
    let isCapturingShortcut = $state(false);
    let shortcutInputEl: HTMLInputElement | null = $state(null);
    let buttonsListEl: HTMLDivElement | null = $state(null);
    let sortable: Sortable | null = null;

    let selectedButtonMeta = $derived(selectedButton ? getButtonActionMeta(selectedButton) : null);
    let selectedIsCore = $derived(selectedButton ? isCoreButton(selectedButton) : false);

    onMount(() => {
        void initSortable();
    });

    onDestroy(() => {
        sortable?.destroy();
        sortable = null;
    });

    async function initSortable() {
        await tick();
        if (!buttonsListEl || sortable) return;

        sortable = new Sortable(buttonsListEl, {
            animation: 150,
            handle: '.button-drag-handle',
            draggable: '.button-list-item',
            ghostClass: 'button-sortable-ghost',
            chosenClass: 'button-sortable-chosen',
            dragClass: 'button-sortable-drag',
            onEnd: (event) => {
                const { oldIndex, newIndex } = event;
                if (typeof oldIndex !== 'number' || typeof newIndex !== 'number' || oldIndex === newIndex) return;
                actions.onReorderButtons(oldIndex, newIndex);
            },
        });
    }

    function handleShortcutKeydown(e: KeyboardEvent) {
        if (!isCapturingShortcut) return;

        e.preventDefault();
        e.stopPropagation();

        const result = eventToShortcutString(e);

        // Escape 取消捕获
        if (e.key === "Escape") {
            isCapturingShortcut = false;
            return;
        }

        // Backspace/Delete 清空
        if (result === "__CLEAR__") {
            actions.onUpdateButtonShortcut("");
            isCapturingShortcut = false;
            return;
        }

        // 有效快捷键
        if (result) {
            actions.onUpdateButtonShortcut(result);
            isCapturingShortcut = false;
        }
    }

    function startCapturing() {
        isCapturingShortcut = true;
        shortcutInputEl?.focus();
    }

    function stopCapturing() {
        isCapturingShortcut = false;
    }
</script>

<!-- 上层：说明区域 -->
<SettingSection>
    <div class="button-settings-intro">
        <p class="intro-text">拖动左侧按钮可调整所有快捷按钮的顺序；开关控制是否显示。内置按钮只提供功能说明，不能修改功能或删除。</p>
    </div>
</SettingSection>

<style>
    .builtin-info-card {
        padding: 1rem;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        margin-top: 0.5rem;
    }

    .builtin-info-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .builtin-info-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .builtin-info-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        background: var(--b3-theme-primary-light);
        color: var(--b3-theme-primary);
        font-weight: 500;
    }

    .builtin-lock-tip {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        margin: 0 0 0.75rem;
        padding: 0.5rem 0.75rem;
        background: var(--b3-theme-surface);
        border-left: 3px solid var(--b3-theme-primary);
        border-radius: 0 4px 4px 0;
    }

    .builtin-info-desc {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        line-height: 1.6;
        margin: 0 0 0.75rem;
    }

    .builtin-info-section {
        margin-top: 0.75rem;
    }

    .builtin-info-section-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin: 0 0 0.5rem;
    }

    .builtin-info-list {
        list-style: disc;
        padding-left: 1.25rem;
        margin: 0;
    }

    .builtin-info-list li {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.6;
        margin-bottom: 0.25rem;
    }

    .builtin-info-source {
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.6;
        margin: 0;
        padding: 0.5rem 0.75rem;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        border: 1px dashed var(--b3-border-color);
    }

    .builtin-info-source a {
        color: var(--b3-theme-primary);
        text-decoration: none;
    }

    .builtin-info-source a:hover {
        text-decoration: underline;
    }
</style>

<!-- 下层：按钮管理器 -->
<SettingSection title="快捷按钮管理">
    <div class="buttons-editor">
        <!-- 左栏：按钮列表 -->
        <div class="buttons-list-panel">
            <div class="buttons-list" bind:this={buttonsListEl}>
                {#each buttonsList as item (item.id)}
                    <div
                        class="button-list-item"
                        class:active={selectedButton?.id === item.id}
                        data-button-id={item.id}
                    >
                        <button
                            type="button"
                            class="button-drag-handle"
                            title="拖动排序"
                            aria-label={`拖动 ${item.label} 调整顺序`}
                        >
                            <SiyuanIcon name="drag" size={14} />
                        </button>
                        <button
                            type="button"
                            class="button-select"
                            onclick={() => actions.onSelectButton(item)}
                            aria-label={`选择按钮 ${item.label}`}
                        >
                            {#if getButtonActionMeta(item)?.icon}
                                <SiyuanIcon name={getButtonActionMeta(item)!.icon} size={15} />
                            {/if}
                            <span class="button-name">{item.label}</span>
                        </button>
                        <input
                            type="checkbox"
                            class="b3-switch fn__flex-center"
                            checked={item.checked}
                            onchange={(e) => actions.onToggleButtonChecked(item.id, (e.currentTarget as HTMLInputElement).checked)}
                            aria-label={`${item.checked ? '隐藏' : '显示'} ${item.label}`}
                        />
                    </div>
                {/each}
            </div>
            <button
                class="add-button"
                onclick={actions.onAddNewButton}
            >
                <span class="add-icon">+</span>
                <span>添加按钮</span>
            </button>
        </div>

        <!-- 右栏：按钮详情 -->
        <div class="button-detail-panel">
            {#if selectedButton}
                <div class="detail-header">
                    <h4 class="detail-title">正在编辑：{selectedButton.label}</h4>
                </div>

                {#if selectedIsCore}
                    <div class="builtin-info-card">
                        <div class="builtin-info-header">
                            {#if selectedButtonMeta?.icon}
                                <SiyuanIcon name={selectedButtonMeta.icon} size={18} />
                            {/if}
                            <span class="builtin-info-title">{selectedButtonMeta?.title ?? selectedButton.label}</span>
                            <span class="builtin-info-badge">{selectedButtonMeta?.badge ?? "内置功能"}</span>
                        </div>
                        <p class="builtin-lock-tip">该按钮可以拖动排序，也可以控制是否在主页显示，但不支持修改标签、功能、快捷键或删除。</p>
                        <p class="builtin-info-desc">{selectedButtonMeta?.description ?? "这是插件内置功能按钮，可控制是否在主页显示，但不支持自定义。"}</p>
                        {#if selectedButtonMeta?.sourceText}
                            <div class="builtin-info-section">
                                <p class="builtin-info-source">
                                    {selectedButtonMeta.sourceText}
                                    {#if selectedButtonMeta.sourceName && selectedButtonMeta.sourceUrl}
                                        <a href={selectedButtonMeta.sourceUrl} target="_blank" rel="noopener noreferrer">{selectedButtonMeta.sourceName}</a>
                                    {/if}
                                </p>
                            </div>
                        {/if}
                        {#if selectedButtonMeta?.usage}
                            <div class="builtin-info-section">
                                <h5 class="builtin-info-section-title">使用说明</h5>
                                <ul class="builtin-info-list">
                                    {#each selectedButtonMeta.usage as item}
                                        <li>{item}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        {#if selectedButtonMeta?.safety}
                            <div class="builtin-info-section">
                                <h5 class="builtin-info-section-title">安全策略</h5>
                                <ul class="builtin-info-list">
                                    {#each selectedButtonMeta.safety as item}
                                        <li>{item}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                {:else}
                    <!-- 自定义按钮设置项 -->
                    <div class="detail-content">
                        <SettingRow
                            title="按钮标签"
                            description="显示在顶栏的按钮文字"
                        >
                            <input
                                type="text"
                                class="control-full"
                                value={currentLabel}
                                oninput={(e) => {
                                    currentLabel = (e.currentTarget as HTMLInputElement).value;
                                    actions.onUpdateButtonLabel(currentLabel);
                                }}
                                placeholder="例如：我的快捷方式"
                            />
                        </SettingRow>

                        <SettingRow
                            title="快捷键"
                            description="点击输入框后按下组合键设置"
                        >
                            <input
                                type="text"
                                class="control-full shortcut-input"
                                class:capturing={isCapturingShortcut}
                                readonly
                                placeholder={isCapturingShortcut ? "请按下快捷键..." : "点击后按下组合键"}
                                value={isCapturingShortcut ? "" : (selectedButton.shortcut ? displayShortcut(selectedButton.shortcut) : "")}
                                onclick={startCapturing}
                                onblur={stopCapturing}
                                onkeydown={handleShortcutKeydown}
                                bind:this={shortcutInputEl}
                            />
                        </SettingRow>
                    </div>

                    <!-- 底部操作区 -->
                    <div class="detail-actions">
                        <button
                            class="action-btn delete"
                            onclick={actions.onDeleteCustomButton}
                        >
                            <SiyuanIcon name="delete" size={14} />
                            <span>删除此按钮</span>
                        </button>
                    </div>
                {/if}
            {:else}
                <div class="empty-state">
                    <p>请选择左侧按钮以查看或编辑其详情</p>
                </div>
            {/if}
        </div>
    </div>
</SettingSection>
