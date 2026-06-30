<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { saveLayout, type HomepageLayoutRuntimeOptions } from "./utils/layout-handler";
    import {
        updateElementBackground,
        updateElementBorder,
        loadElementStyles,
        loadWidgetSize,
        saveWidgetSize
    } from "./styleUtils";
    import { loadWidgetLayoutSettings, moveWidgetToComponentSectionForCurrentDevice } from "./utils/layout-shared";
    import { normalizeComponentSections, type ComponentSection } from "@/homepage/homepageSetting/config";
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
        layoutRuntimeOptions?: HomepageLayoutRuntimeOptions;
    }

    let {
        plugin,
        onClose,
        onHideForCurrentDevice,
        onDeleteGlobally,
        onSetSize,
        currentBlockId = "",
        layoutRuntimeOptions = {},
    }: Props = $props();

    let backgroundColor: string = $state("#ffffff");
    let backgroundOpacity: number = $state(0.5);
    let borderColor: string = $state("#000000");
    let borderWidth: number = $state(1);
    let widgetLayoutNumber = $state(4);
    let rowSize = $state(1);
    let colSize = $state(1);
    let componentSectionsEnabled = $state(false);
    let componentSections = $state<ComponentSection[]>([]);
    let targetSectionId = $state("");

    let sizeOptions = $derived(Array.from({ length: widgetLayoutNumber }, (_, i) => i + 1));
    let availableTargetSections = $derived(
        componentSections.filter((section) => section.id !== layoutRuntimeOptions.sectionId)
    );
    let canMigrateToSection = $derived(
        Boolean(plugin?.ADVANCED) &&
        layoutRuntimeOptions.sectionsEnabled === true &&
        componentSectionsEnabled &&
        availableTargetSections.length > 0
    );

    function getCurrentContainer(): HTMLElement | null {
        return document.getElementById(currentBlockId)?.parentElement || null;
    }

    function handleStyleChange() {
        updateElementBackground(currentBlockId, backgroundColor, backgroundOpacity);
        updateElementBorder(currentBlockId, borderColor, borderWidth);
        saveLayout(plugin, getCurrentContainer(), layoutRuntimeOptions);
    }

    async function handleApplySize() {
        onSetSize(parseInt(`${rowSize}${colSize}`));
        await saveWidgetSize(plugin, currentBlockId, rowSize, colSize);
        saveLayout(plugin, getCurrentContainer(), layoutRuntimeOptions);
    }

    async function handleMoveToSection() {
        if (!canMigrateToSection || !targetSectionId) {
            showMessage("组件分区导航开启且会员有效后可迁移", 3000);
            return;
        }
        const blockElement = document.getElementById(currentBlockId) as HTMLElement | null;
        const currentContainer = getCurrentContainer();
        const success = await moveWidgetToComponentSectionForCurrentDevice(plugin, currentBlockId, {
            fromSectionId: layoutRuntimeOptions.sectionId,
            toSectionId: targetSectionId,
            style: blockElement?.getAttribute("style") || null,
            currentContainerEl: currentContainer,
        });
        if (!success) {
            showMessage("迁移失败，请确认组件分区导航已开启", 3000);
            return;
        }

        if (blockElement) {
            const instance = (blockElement as any).__widgetBlockInstance;
            if (instance && typeof instance.destroy === "function") {
                try {
                    instance.destroy();
                } catch {
                    // 忽略旧实例销毁失败，后续强制恢复会重新挂载
                }
            }
            blockElement.remove();
        }

        const sectionIds = [layoutRuntimeOptions.sectionId, targetSectionId]
            .filter((sectionId): sectionId is string => Boolean(sectionId));
        window.dispatchEvent(new CustomEvent("homepage-component-section-layout-invalidated", {
            detail: {
                sectionIds,
                forceCurrent: true,
            },
        }));

        showMessage("组件已迁移，切换到目标分区后可查看");
        onClose();
    }

    onMount(async () => {
        const settings = await loadWidgetLayoutSettings(plugin, layoutRuntimeOptions);
        widgetLayoutNumber = settings.widgetLayoutNumber;

        const config = await plugin.loadData("homepageSettingConfig.json");
        componentSectionsEnabled = config?.componentSectionsEnabled === true;
        const normalizedSections = normalizeComponentSections(config?.componentSections);
        componentSections = normalizedSections;
        targetSectionId = normalizedSections.find((section) => section.id !== layoutRuntimeOptions.sectionId)?.id || "";

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

    <SettingSection title="分区迁移">
        <SettingRow
            title="迁移到"
            description={canMigrateToSection
                ? "将当前组件移动到目标分区末尾，保留样式和内容。"
                : "会员有效且组件分区导航开启后可用。"}
        >
            <div class="section-move-control">
                <select
                    class="control-md"
                    bind:value={targetSectionId}
                    disabled={!canMigrateToSection}
                >
                    {#each availableTargetSections as section (section.id)}
                        <option value={section.id}>{section.name}</option>
                    {/each}
                </select>
                <button
                    type="button"
                    class="move-section-button"
                    disabled={!canMigrateToSection || !targetSectionId}
                    onclick={handleMoveToSection}
                >
                    迁移
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
        color: var(--b3-theme-on-surface, #1f2329);
    }

    .size-separator {
        font-size: 14px;
        color: var(--b3-theme-on-surface-light, #6b7280);
    }

    .section-move-control {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 0.5rem;
        width: 100%;
    }

    .move-section-button {
        background: var(--b3-theme-primary, #3575f0);
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: opacity 0.2s ease;

        &:hover:not(:disabled) {
            opacity: 0.9;
        }

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
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
            accent-color: var(--b3-theme-primary, #3575f0);
            height: 4px;
        }
    }

    .range-value {
        min-width: 40px;
        background: var(--b3-theme-background, #fff);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface, #1f2329);
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
        background: var(--b3-theme-primary, #3575f0);
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
