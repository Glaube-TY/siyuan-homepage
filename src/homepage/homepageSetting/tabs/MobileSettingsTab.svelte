<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import Sortable from "sortablejs";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AccountingIcon from "@/components/utils/widgetBlock/widget/accounting/AccountingIcon.svelte";
    import {
        MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        MOBILE_QUICK_ACTION_DEFINITIONS,
        normalizeMobileQuickActionButtonSize,
        normalizeMobileQuickActionItems,
        isMobileQuickActionId,
        type MobileQuickActionSetting,
    } from "../../mobileQuickActions/mobileQuickActionsConfig";

    interface Props {
        advancedEnabled?: boolean;
        autoOpenMobileHomepage: boolean;
        mobileQuickActionsEnabled: boolean;
        mobileQuickActionsButtonSize: number;
        mobileQuickActionItems: MobileQuickActionSetting[];
        showMobilePreview?: boolean;
        onAutoOpenMobileHomepageChange: (value: boolean) => void;
        onMobileQuickActionsEnabledChange: (value: boolean) => void;
        onMobileQuickActionsButtonSizeChange: (value: number) => void;
        onMobileQuickActionItemsChange: (value: MobileQuickActionSetting[]) => void;
        onOpenMobileHomepagePreview?: () => void;
    }

    let {
        advancedEnabled = false,
        autoOpenMobileHomepage,
        mobileQuickActionsEnabled,
        mobileQuickActionsButtonSize,
        mobileQuickActionItems,
        showMobilePreview = false,
        onAutoOpenMobileHomepageChange,
        onMobileQuickActionsEnabledChange,
        onMobileQuickActionsButtonSizeChange,
        onMobileQuickActionItemsChange,
        onOpenMobileHomepagePreview,
    }: Props = $props();

    let actionListEl: HTMLDivElement | null = $state(null);
    let actionSortable: Sortable | null = null;

    const mobileSettingsEditable = $derived(advancedEnabled === true);
    const normalizedButtonSize = $derived(normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize));
    const sortedActionItems = $derived(normalizeMobileQuickActionItems(mobileQuickActionItems));

    function getActionDefinition(id: MobileQuickActionSetting["id"]) {
        return MOBILE_QUICK_ACTION_DEFINITIONS.find((item) => item.id === id);
    }

    function emitActionItems(nextItems: MobileQuickActionSetting[]): void {
        onMobileQuickActionItemsChange(normalizeMobileQuickActionItems(nextItems));
    }

    function handleButtonSizeInput(event: Event): void {
        if (!mobileSettingsEditable) return;
        onMobileQuickActionsButtonSizeChange(
            normalizeMobileQuickActionButtonSize((event.currentTarget as HTMLInputElement).value),
        );
    }

    function handleActionEnabledChange(actionId: MobileQuickActionSetting["id"], enabled: boolean): void {
        if (!mobileSettingsEditable) return;
        emitActionItems(sortedActionItems.map((item) =>
            item.id === actionId ? { ...item, enabled } : item
        ));
    }

    function destroyActionSortable(): void {
        actionSortable?.destroy();
        actionSortable = null;
    }

    async function initActionSortable(): Promise<void> {
        if (!mobileSettingsEditable) {
            destroyActionSortable();
            return;
        }
        await tick();
        destroyActionSortable();
        if (!actionListEl || actionListEl.children.length < 2) return;

        actionSortable = new Sortable(actionListEl, {
            animation: 150,
            handle: ".shp-mobile-action-drag-handle",
            ghostClass: "shp-mobile-settings-sortable-ghost",
            chosenClass: "shp-mobile-settings-sortable-chosen",
            dragClass: "shp-mobile-settings-sortable-drag",
            dataIdAttr: "data-action-id",
            onEnd: handleActionSortableEnd,
        });
    }

    function readActionIds(): MobileQuickActionSetting["id"][] {
        if (!actionListEl) return [];
        return Array.from(actionListEl.querySelectorAll<HTMLElement>("[data-action-id]"))
            .map((node) => node.dataset.actionId)
            .filter(isMobileQuickActionId);
    }

    function handleActionSortableEnd(): void {
        if (!mobileSettingsEditable) return;
        const actionIds = readActionIds();
        if (actionIds.length === 0) return;

        const orderMap = new Map(actionIds.map((id, index) => [id, index]));
        const nextItems = sortedActionItems
            .map((item) => ({
                ...item,
                order: orderMap.get(item.id) ?? item.order,
            }))
            .sort((a, b) => a.order - b.order)
            .map((item, index) => ({ ...item, order: index }));

        emitActionItems(nextItems);
    }

    $effect(() => {
        mobileSettingsEditable;
        sortedActionItems;
        void initActionSortable();
    });

    onDestroy(() => destroyActionSortable());
</script>

<SettingSection title="移动端主页">
    {#if !mobileSettingsEditable}
        <div class="shp-mobile-settings-lock-tip">移动端主页为会员专属功能，开通后可配置和使用。</div>
    {/if}

    <SettingRow
        title="自动打开移动端主页👑"
        description={mobileSettingsEditable ? "移动端启动后自动进入主页" : "会员专属，当前不会自动打开"}
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={autoOpenMobileHomepage}
            disabled={!mobileSettingsEditable}
            onchange={(e) => onAutoOpenMobileHomepageChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if showMobilePreview}
        <SettingRow
            title="打开手机端主页"
            description="在电脑上以手机尺寸编辑移动端主页"
        >
            <button
                type="button"
                class="b3-button b3-button--text"
                disabled={!mobileSettingsEditable}
                onclick={() => onOpenMobileHomepagePreview?.()}
            >
                打开
            </button>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="悬浮快捷按钮">
    <SettingRow
        title="开启悬浮快捷按钮"
        description={mobileSettingsEditable ? "在手机端右下角显示可展开的主页快捷入口" : "会员专属，当前不会显示"}
    >
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={mobileQuickActionsEnabled}
            disabled={!mobileSettingsEditable}
            onchange={(e) => onMobileQuickActionsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    <SettingRow
        title="主按钮大小"
        description={`范围 ${MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE}-${MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE}px`}
    >
        <div class="shp-mobile-settings-size-control control-full">
            <input
                type="range"
                min={MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE}
                max={MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE}
                step="1"
                value={normalizedButtonSize}
                disabled={!mobileSettingsEditable || !mobileQuickActionsEnabled}
                oninput={handleButtonSizeInput}
            />
            <span class="shp-mobile-settings-size-value">{normalizedButtonSize}px</span>
        </div>
    </SettingRow>

    <SettingRow
        title="快捷按钮管理"
        description="拖拽调整顺序，关闭后仅隐藏入口"
    >
        <div class="shp-mobile-settings-action-list control-full" bind:this={actionListEl}>
            {#each sortedActionItems as item (item.id)}
                {@const definition = getActionDefinition(item.id)}
                <div class="shp-mobile-settings-action-item" data-action-id={item.id}>
                    <span class="shp-mobile-action-drag-handle" aria-label="拖拽排序" title="拖拽排序">⋮⋮</span>
                    <span class="shp-mobile-settings-action-icon">
                        {#if definition?.icon === "wallet"}
                            <AccountingIcon name="wallet" size={17} />
                        {:else}
                            <SiyuanIcon name={definition?.icon || "open"} size={17} />
                        {/if}
                    </span>
                    <span class="shp-mobile-settings-action-text">
                        <span class="shp-mobile-settings-action-label">{definition?.label || item.id}</span>
                        <span class="shp-mobile-settings-action-description">{definition?.description || ""}</span>
                    </span>
                    <input
                        type="checkbox"
                        class="b3-switch fn__flex-center shp-mobile-settings-action-switch"
                        checked={item.enabled}
                        disabled={!mobileSettingsEditable}
                        onchange={(e) => handleActionEnabledChange(item.id, (e.currentTarget as HTMLInputElement).checked)}
                    />
                </div>
            {/each}
        </div>
    </SettingRow>
</SettingSection>

<style lang="scss">
    .shp-mobile-settings-lock-tip {
        margin: 0 0 8px;
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 22%, var(--b3-border-color));
        border-radius: 6px;
        color: var(--b3-theme-on-surface-light);
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface));
        font-size: 12px;
        line-height: 1.5;
    }

    .shp-mobile-settings-size-control {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .shp-mobile-settings-size-control input[type="range"] {
        flex: 1 1 auto;
        min-width: 120px;
        accent-color: var(--b3-theme-primary);
    }

    .shp-mobile-settings-size-value {
        min-width: 46px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        text-align: right;
    }

    .shp-mobile-settings-action-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .shp-mobile-settings-action-item {
        display: grid;
        grid-template-columns: 18px 32px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
    }

    .shp-mobile-action-drag-handle {
        width: 18px;
        color: var(--b3-theme-on-surface-light);
        cursor: grab;
        font-size: 12px;
        letter-spacing: -1px;
        line-height: 1;
        text-align: center;
        user-select: none;
    }

    .shp-mobile-action-drag-handle:hover {
        color: var(--b3-theme-primary);
    }

    .shp-mobile-settings-action-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .shp-mobile-settings-action-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .shp-mobile-settings-action-label,
    .shp-mobile-settings-action-description {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shp-mobile-settings-action-label {
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        line-height: 1.3;
    }

    .shp-mobile-settings-action-description {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.25;
    }

    .shp-mobile-settings-action-switch {
        justify-self: end;
    }

    .shp-mobile-settings-action-list :global(.shp-mobile-settings-sortable-ghost) {
        opacity: 0.45;
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    }

    .shp-mobile-settings-action-list :global(.shp-mobile-settings-sortable-chosen .shp-mobile-action-drag-handle) {
        color: var(--b3-theme-primary);
        cursor: grabbing;
    }

    @media (max-width: 520px) {
        .shp-mobile-settings-action-item {
            grid-template-columns: 18px 30px minmax(0, 1fr);
        }

        .shp-mobile-settings-action-switch {
            grid-column: 3;
            justify-self: start;
        }
    }
</style>
