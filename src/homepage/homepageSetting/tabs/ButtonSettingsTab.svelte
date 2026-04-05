<script lang="ts">
    import type { ButtonItem, ButtonSettingsActions } from '../types';

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
</script>

<div class="section-setting buttons-setting">
    <div class="buttons-setting-container">
        <div class="buttons-list">
            {#each buttonsList as item (item.id)}
                <button
                    type="button"
                    class="button-item"
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
                    <input
                        type="checkbox"
                        checked={item.checked}
                        onclick={(e) => e.stopPropagation()}
                        onchange={(e) => actions.onToggleButtonChecked(item.id, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span>{item.label}</span>
                </button>
            {/each}
            <button
                class="add-button"
                onclick={actions.onAddNewButton}>➕ 添加按钮</button
            >
        </div>

        <div class="button-details">
            {#if selectedButton}
                <h4>编辑按钮：{selectedButton.label}</h4>
                {#if selectedButton.label === "➕ 添加组件"}
                    <p>插件核心按钮不支持自定义</p>
                {:else if selectedButton.label === "⚙ 主页设置"}
                    <p>插件核心按钮不支持自定义</p>
                {:else}
                    <!-- 自定义按钮设置项 -->
                    <div class="form-group">
                        <label for="custom-button-label"
                            >按钮标签：</label
                        >
                        <input
                            id="custom-button-label"
                            type="text"
                            value={currentLabel}
                            oninput={(e) => {
                                currentLabel = (e.currentTarget as HTMLInputElement).value;
                                actions.onUpdateButtonLabel(currentLabel);
                            }}
                            placeholder="例如：我的快捷方式"
                        />
                    </div>
                    <!-- 快捷键输入框 -->
                    <div class="form-group">
                        <label for="button-shortcut"
                            >快捷键：</label
                        >
                        <input
                            id="button-shortcut"
                            type="text"
                            placeholder="例如：Ctrl+C"
                            value={selectedButton.shortcut ?? ""}
                            oninput={(e) => actions.onUpdateButtonShortcut((e.currentTarget as HTMLInputElement).value)}
                        />
                    </div>
                    <div class="button-actions">
                        <button
                            class="btn move-up"
                            onclick={actions.onMoveUpButton}
                            disabled={selectedButtonIndex <= 0}
                            title="上移">🔼</button
                        >

                        <button
                            class="btn move-down"
                            onclick={actions.onMoveDownButton}
                            disabled={selectedButtonIndex >= buttonsList.length - 1 || selectedButtonIndex === -1}
                            title="下移">🔽</button
                        >

                        <button
                            class="btn danger"
                            onclick={actions.onDeleteCustomButton}
                            >❌ 删除此按钮</button
                        >
                    </div>
                {/if}
            {:else}
                <p>请选择左侧按钮以查看或编辑其详情</p>
            {/if}
        </div>
    </div>
</div>