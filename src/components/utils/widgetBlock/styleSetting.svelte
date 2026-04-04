<script lang="ts">
    import { onMount } from "svelte";
    import { saveLayout } from "./utils/layout-handler";
    import { saveLayout as saveSidebarLayout } from "@/components/utils/sidebar/widget_layout";
    import { saveLayout as saveMobileLayout } from "@/components/utils/mobileHomepage/mobileHomepage_layout";
    import {
        updateElementBackground,
        updateElementBorder,
        loadElementStyles,
        loadWidgetSize,
        saveWidgetSize
    } from "./styleUtils";

    export let plugin: any;
    export let onClose: () => void;
    export let onDelete: () => void;
    export let onSetSize: (size: number) => void;
    export let currentBlockId: string = "";

    let backgroundColor: string = "#ffffff";
    let backgroundOpacity: number = 0.5;
    let borderColor: string = "#000000";
    let borderWidth: number = 1;
    let widgetLayoutNumber = 4;
    let rowSize = 1;
    let colSize = 1;

    $: sizeOptions = Array.from({ length: widgetLayoutNumber }, (_, i) => i + 1);

    function handleStyleChange() {
        updateElementBackground(currentBlockId, backgroundColor, backgroundOpacity);
        updateElementBorder(currentBlockId, borderColor, borderWidth);
        saveLayout(plugin);
        saveSidebarLayout(plugin);
        saveMobileLayout(plugin);
    }

    async function handleApplySize() {
        onSetSize(parseInt(`${rowSize}${colSize}`));
        await saveWidgetSize(plugin, currentBlockId, rowSize, colSize);
        saveLayout(plugin);
        saveSidebarLayout(plugin);
        saveMobileLayout(plugin);
    }

    onMount(async () => {
        const config = await plugin.loadData("homepageSettingConfig.json");
        widgetLayoutNumber = config.widgetLayoutNumber || 4;

        const styles = loadElementStyles(currentBlockId);
        if (styles) {
            backgroundColor = styles.backgroundColor;
            backgroundOpacity = styles.backgroundOpacity;
            borderColor = styles.borderColor;
            borderWidth = styles.borderWidth;
        }

        const size = await loadWidgetSize(plugin, currentBlockId);
        rowSize = size.rowSize;
        colSize = size.colSize;

        handleStyleChange();
    });
</script>

<div class="settings-group">
    <div class="setting-item">
        <div class="size-options-row">
            <div class="size-option-group">
                <label for="rowSize">行尺寸：</label>
                <select id="rowSize" bind:value={rowSize}>
                    {#each sizeOptions as size}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <label for="colSize">列尺寸：</label>
                <select id="colSize" bind:value={colSize}>
                    {#each sizeOptions as size}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
            </div>

            <button
                type="button"
                class="apply-size-button"
                on:click={handleApplySize}
            >
                应用尺寸
            </button>
        </div>
    </div>

    <div class="setting-item">
        <div class="style-controls-row">

            <!-- 第一行：背景颜色 + 背景透明度 -->
            <div class="style-subgroup" style="margin-bottom: 0.5rem; ">
                <!-- 颜色选择器 -->
                <div class="color-picker-group">
                    <label for="bg-color">背景颜色:</label>
                    <input
                        id="bg-color"
                        type="color"
                        bind:value={backgroundColor}
                        on:change={handleStyleChange}
                    />
                </div>

                <!-- 透明度滑块 -->
                <div class="opacity-slider-group">
                    <label for="bg-opacity">背景透明度:</label>
                    <input
                        id="bg-opacity"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        bind:value={backgroundOpacity}
                        on:input={handleStyleChange}
                    />
                    <span>{Math.round(backgroundOpacity * 100)}%</span>
                </div>
            </div>

            <!-- 第二行：边框颜色 + 边框粗细 -->
            <div class="style-subgroup">
                <!-- 边框颜色选择器 -->
                <div class="border-color-picker-group">
                    <label for="border-color">边框颜色:</label>
                    <input
                        id="border-color"
                        type="color"
                        bind:value={borderColor}
                        on:change={handleStyleChange}
                    />
                </div>

                <!-- 边框粗细滑块 -->
                <div class="border-width-slider-group">
                    <label for="border-width">边框粗细:</label>
                    <input
                        id="border-width"
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        bind:value={borderWidth}
                        on:input={handleStyleChange}
                    />
                    <span>{borderWidth}px</span>
                </div>
            </div>
        </div>
    </div>

    <!-- 操作按钮：删除和取消在一行 -->
    <div class="action-buttons-row">
        <button class="delete-button" on:click={onDelete}>🗑 删除组件</button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>

<style lang="scss">
    .settings-group {
        display: inline-flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .style-controls-row,
    .size-options-row {
        display: flex;
        gap: 0.5rem;
        flex-direction: column;
        align-items: center;
    }

    .color-picker-group label,
    .opacity-slider-group label,
    .border-color-picker-group label,
    .border-width-slider-group label {
        font-size: 13px;
        margin-bottom: 4px;
        font-weight: 500;
    }

    input[type="color"] {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        padding: 3px;
        border: 2px solid var(--b3-border-color);
    }

    input[type="range"] {
        accent-color: var(--b3-theme-primary);
        height: 4px;
    }

    .opacity-slider-group span,
    .border-width-slider-group span {
        min-width: 40px;
        background: var(--b3-theme-background);
        padding: 2px 8px;
        border-radius: 4px;
        margin-left: 12px;
    }

    .action-buttons-row {
        display: flex;
        justify-content: space-between;
        margin-top: 1rem;
    }

    .delete-button {
        background: linear-gradient(45deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }

    .cancel-button {
        background: linear-gradient(45deg, #f1f5f9 0%, #e2e8f0 100%);
        color: #475569;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }

    .style-controls-row > .style-subgroup {
        display: flex;
        gap: 1rem;
        border: #000000 1px dashed;
        width: 100%;
        box-sizing: border-box;
        padding-left: 1rem;
        align-items: center;
    }

    select {
        width: max-content;
        padding: 0.5rem 2.5rem 0.5rem 1rem;
        font-size: 14px;
        border: 1px solid var(--b3-theme-primary-lighter);
        border-radius: 8px;
        background-color: var(--b3-theme-surface);
        appearance: none;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2390a3bf' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        background-size: 16px;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        color: var(--b3-theme-text);

        &:hover {
            border-color: var(--b3-theme-primary);
            box-shadow: 0 1px 3px rgba(59, 130, 246, 0.1);
        }

        &:focus {
            outline: none;
            border-color: var(--b3-theme-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        &:disabled {
            background-color: var(--b3-theme-surface);
            cursor: not-allowed;
        }

        option {
            padding: 0.5rem;
            background: var(--b3-theme-surface);

            &:checked {
                background: var(--b3-theme-primary-light);
                color: white;
            }

            &:hover {
                background: var(--b3-theme-primary-light);
            }
        }
    }

    .apply-size-button {
        background-color: var(--b3-theme-primary);
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;

        &:hover {
            transform: translateY(-1px);
        }
    }
</style>
