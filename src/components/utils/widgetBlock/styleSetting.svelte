<script lang="ts">
    import { onMount } from "svelte";
    import { saveLayout } from "./utils/layout-handler";
    import {
        updateElementBackground,
        updateElementBorder,
        loadElementStyles,
        loadWidgetSize,
        saveWidgetSize
    } from "./styleUtils";
    import { loadWidgetLayoutSettings } from "./utils/layout-shared";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        plugin: any;
        onClose: () => void;
        onHideForCurrentDevice: () => void;
        onDeleteGlobally: () => void;
        onSetSize: (size: number) => void;
        currentBlockId?: string;
    }

    let {
        plugin,
        onClose,
        onHideForCurrentDevice,
        onDeleteGlobally,
        onSetSize,
        currentBlockId = ""
    }: Props = $props();

    let backgroundColor: string = $state("#ffffff");
    let backgroundOpacity: number = $state(0.5);
    let borderColor: string = $state("#000000");
    let borderWidth: number = $state(1);
    let widgetLayoutNumber = $state(4);
    let rowSize = $state(1);
    let colSize = $state(1);

    let sizeOptions = $derived(Array.from({ length: widgetLayoutNumber }, (_, i) => i + 1));

    function handleStyleChange() {
        updateElementBackground(currentBlockId, backgroundColor, backgroundOpacity);
        updateElementBorder(currentBlockId, borderColor, borderWidth);
        saveLayout(plugin);
    }

    async function handleApplySize() {
        onSetSize(parseInt(`${rowSize}${colSize}`));
        await saveWidgetSize(plugin, currentBlockId, rowSize, colSize);
        saveLayout(plugin);
    }

    onMount(async () => {
        const settings = await loadWidgetLayoutSettings(plugin);
        widgetLayoutNumber = settings.widgetLayoutNumber;

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
    <SettingSection title="尺寸设置">
        <SettingRow title="组件尺寸" description="设置组件在主页网格中占用的行数和列数">
            <div class="size-control-group">
                <select class="control-sm" bind:value={rowSize}>
                    {#each sizeOptions as size}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span class="size-label">行</span>
                <span class="size-separator">×</span>
                <select class="control-sm" bind:value={colSize}>
                    {#each sizeOptions as size}
                        <option value={size}>{size}</option>
                    {/each}
                </select>
                <span class="size-label">列</span>
                <button type="button" class="apply-size-button" onclick={handleApplySize}>
                    应用尺寸
                </button>
            </div>
        </SettingRow>
    </SettingSection>

    <SettingSection title="外观设置">
        <SettingRow title="背景颜色">
            <input type="color" bind:value={backgroundColor} oninput={handleStyleChange} />
        </SettingRow>
        <SettingRow title="背景透明度">
            <div class="range-control">
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    bind:value={backgroundOpacity}
                    oninput={handleStyleChange}
                />
                <span class="range-value">{Math.round(backgroundOpacity * 100)}%</span>
            </div>
        </SettingRow>
        <SettingRow title="边框颜色">
            <input type="color" bind:value={borderColor} oninput={handleStyleChange} />
        </SettingRow>
        <SettingRow title="边框粗细">
            <div class="range-control">
                <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    bind:value={borderWidth}
                    oninput={handleStyleChange}
                />
                <span class="range-value">{borderWidth}px</span>
            </div>
        </SettingRow>
    </SettingSection>

    <div class="danger-actions">
        <button class="hide-button" onclick={onHideForCurrentDevice}>
            <SiyuanIcon name="hide" size={14} />
            <span>当前设备隐藏</span>
        </button>
        <button class="delete-button" onclick={onDeleteGlobally}>
            <SiyuanIcon name="delete" size={14} />
            <span>全局删除</span>
        </button>
        <button class="cancel-button" onclick={onClose}>
            <SiyuanIcon name="cancel" size={14} />
            <span>取消</span>
        </button>
    </div>
</div>

<style lang="scss">
    .settings-group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        min-width: 0;
        box-sizing: border-box;
    }

    .size-control-group {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .size-label {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .size-separator {
        font-size: 14px;
        color: var(--b3-theme-on-surface-light);
    }

    .range-control {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        max-width: 260px;

        input[type="range"] {
            flex: 1;
            min-width: 120px;
            accent-color: var(--b3-theme-primary);
            height: 4px;
        }
    }

    .range-value {
        min-width: 40px;
        background: var(--b3-theme-background);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .danger-actions {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding-top: 0.5rem;
    }

    .hide-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #f59e0b;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s ease;

        &:hover {
            background: #d97706;
        }
    }

    .delete-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #ef4444;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s ease;

        &:hover {
            background: #dc2626;
        }
    }

    .cancel-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #f1f5f9;
        color: #475569;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s ease;

        &:hover {
            background: #e2e8f0;
        }
    }

    .apply-size-button {
        background: var(--b3-theme-primary);
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s ease;

        &:hover {
            opacity: 0.9;
        }
    }
</style>
