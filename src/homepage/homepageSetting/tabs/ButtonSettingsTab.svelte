<script lang="ts">
    import type { ButtonItem, ButtonSettingsActions } from '../types';
    import { displayShortcut, eventToShortcutString } from '../../header/quick-button';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        buttonsList: ButtonItem[];
        selectedButton: ButtonItem | null;
        selectedButtonIndex: number;
        actions: ButtonSettingsActions;
    }

    let {
        buttonsList,
        selectedButton,
        selectedButtonIndex,
        actions
    }: Props = $props();

    let currentLabel = $derived(selectedButton?.label ?? "");
    let isCapturingShortcut = $state(false);
    let shortcutInputEl: HTMLInputElement | null = $state(null);

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

    function isCoreButton(label: string): boolean {
        return label === "➕ 添加组件" || label === "⚙ 主页设置";
    }
</script>

<!-- 上层：说明区域 -->
<SettingSection>
    <div class="button-settings-intro">
        <p class="intro-text">请选择左侧按钮以查看或编辑详情，勾选表示该按钮启用，核心按钮不可删除</p>
    </div>
</SettingSection>

<!-- 下层：按钮管理器 -->
<SettingSection title="快捷按钮管理">
    <div class="buttons-editor">
        <!-- 左栏：按钮列表 -->
        <div class="buttons-list-panel">
            <div class="buttons-list">
                {#each buttonsList as item (item.id)}
                    <button
                        type="button"
                        class="button-list-item"
                        class:active={selectedButton?.id === item.id}
                        onclick={() => actions.onSelectButton(item)}
                        onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                actions.onSelectButton(item);
                                e.preventDefault();
                            }
                        }}
                        aria-label={`选择按钮 ${item.label}`}
                    >
                        <span class="button-name">{item.label}</span>
                        <input
                            type="checkbox"
                            class="b3-switch fn__flex-center"
                            checked={item.checked}
                            onclick={(e) => e.stopPropagation()}
                            onchange={(e) => actions.onToggleButtonChecked(item.id, (e.currentTarget as HTMLInputElement).checked)}
                        />
                    </button>
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

                {#if isCoreButton(selectedButton.label)}
                    <div class="core-button-notice">
                        <p>插件核心按钮不支持自定义</p>
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
                            class="action-btn move-up"
                            onclick={actions.onMoveUpButton}
                            disabled={selectedButtonIndex <= 0}
                            title="上移"
                        >
                            <span>↑</span>
                            <span>上移</span>
                        </button>

                        <button
                            class="action-btn move-down"
                            onclick={actions.onMoveDownButton}
                            disabled={selectedButtonIndex >= buttonsList.length - 1 || selectedButtonIndex === -1}
                            title="下移"
                        >
                            <span>↓</span>
                            <span>下移</span>
                        </button>

                        <button
                            class="action-btn delete"
                            onclick={actions.onDeleteCustomButton}
                        >
                            <span>🗑</span>
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
