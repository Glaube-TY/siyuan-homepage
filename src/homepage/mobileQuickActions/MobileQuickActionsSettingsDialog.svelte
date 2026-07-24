<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import Sortable from "sortablejs";
    import { showMessage } from "siyuan";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AccountingIcon from "@/components/utils/widgetBlock/widget/accounting/AccountingIcon.svelte";
    import MobileNotificationQuickSettingsPage from "@/features/notification-center/components/MobileNotificationQuickSettingsPage.svelte";
    import {
        loadHomepageSettingConfig,
        saveHomepageSettingConfig,
        type HomepageSettingConfig,
    } from "../homepageSetting/config";
    import {
        MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        MOBILE_QUICK_ACTION_DEFINITIONS,
        isMobileQuickActionId,
        normalizeMobileQuickActionButtonSize,
        normalizeMobileQuickActionItems,
        type MobileQuickActionId,
        type MobileQuickActionSetting,
    } from "./mobileQuickActionsConfig";

    interface Props {
        plugin: any;
        close: () => void;
    }

    type MobileSettingsPage = "main" | "homepage" | "quickActions" | "actionList" | "notifications";

    let { plugin, close }: Props = $props();

    let page = $state<MobileSettingsPage>("main");
    let isLoading = $state(true);
    let isSaving = $state(false);
    let autoOpenMobileHomepage = $state(false);
    let mobileQuickActionsEnabled = $state(true);
    let mobileQuickActionsButtonSize = $state(52);
    let mobileQuickActionItems = $state<MobileQuickActionSetting[]>(normalizeMobileQuickActionItems(undefined));
    let actionListEl: HTMLDivElement | null = $state(null);
    let actionSortable: Sortable | null = null;

    const sortedActionItems = $derived(normalizeMobileQuickActionItems(mobileQuickActionItems));
    const enabledActionCount = $derived(sortedActionItems.filter((item) => item.enabled).length);
    const normalizedButtonSize = $derived(normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize));
    const pageTitle = $derived(
        page === "homepage"
            ? "移动端主页"
            : page === "quickActions"
                ? "悬浮快捷按钮"
                : page === "notifications"
                    ? "通知设置"
                : page === "actionList"
                    ? "快捷按钮管理"
                    : "移动端设置",
    );

    function getActionDefinition(id: MobileQuickActionId) {
        return MOBILE_QUICK_ACTION_DEFINITIONS.find((item) => item.id === id);
    }

    function goBack(): void {
        if (page === "actionList") {
            destroyActionSortable();
            page = "quickActions";
            return;
        }
        if (page !== "main") {
            page = "main";
        }
    }

    async function loadConfig(): Promise<void> {
        isLoading = true;
        try {
            const config = await loadHomepageSettingConfig(plugin, "mobile-homepage");
            autoOpenMobileHomepage = config?.autoOpenMobileHomepage ?? false;
            mobileQuickActionsEnabled = config?.mobileQuickActionsEnabled ?? true;
            mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(config?.mobileQuickActionsButtonSize);
            mobileQuickActionItems = normalizeMobileQuickActionItems(config?.mobileQuickActionItems);
        } catch {
            autoOpenMobileHomepage = false;
            mobileQuickActionsEnabled = true;
            mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(undefined);
            mobileQuickActionItems = normalizeMobileQuickActionItems(undefined);
            showMessage("读取移动端设置失败", 3000, "error");
        } finally {
            isLoading = false;
        }
    }

    async function saveMobileSettings(): Promise<void> {
        isSaving = true;
        try {
            const existingConfig = (await loadHomepageSettingConfig(plugin, "mobile-homepage")) || {} as HomepageSettingConfig;
            await saveHomepageSettingConfig(plugin, {
                ...existingConfig,
                autoOpenMobileHomepage,
                mobileQuickActionsEnabled,
                mobileQuickActionsButtonSize: normalizeMobileQuickActionButtonSize(mobileQuickActionsButtonSize),
                mobileQuickActionItems: normalizeMobileQuickActionItems(mobileQuickActionItems),
            } as HomepageSettingConfig);
            window.dispatchEvent(new CustomEvent("homepage-settings-saved"));
        } catch {
            showMessage("保存移动端设置失败", 3000, "error");
        } finally {
            isSaving = false;
        }
    }

    function setAutoOpenMobileHomepage(value: boolean): void {
        autoOpenMobileHomepage = value;
        void saveMobileSettings();
    }

    function setMobileQuickActionsEnabled(value: boolean): void {
        mobileQuickActionsEnabled = value;
        void saveMobileSettings();
    }

    function updateButtonSize(value: unknown, persist = false): void {
        mobileQuickActionsButtonSize = normalizeMobileQuickActionButtonSize(value);
        if (persist) {
            void saveMobileSettings();
        }
    }

    function updateActionItems(items: MobileQuickActionSetting[]): void {
        mobileQuickActionItems = normalizeMobileQuickActionItems(items);
        void saveMobileSettings();
    }

    function setActionEnabled(actionId: MobileQuickActionId, enabled: boolean): void {
        updateActionItems(sortedActionItems.map((item) =>
            item.id === actionId ? { ...item, enabled } : item
        ));
    }

    function destroyActionSortable(): void {
        actionSortable?.destroy();
        actionSortable = null;
    }

    async function initActionSortable(): Promise<void> {
        if (page !== "actionList" || isSaving) {
            destroyActionSortable();
            return;
        }
        await tick();
        if (page !== "actionList" || isSaving) {
            destroyActionSortable();
            return;
        }
        destroyActionSortable();
        if (!actionListEl || actionListEl.children.length < 2) return;

        actionSortable = new Sortable(actionListEl, {
            animation: 150,
            handle: ".shp-mobile-quick-settings__action-drag-handle",
            ghostClass: "shp-mobile-quick-settings__sortable-ghost",
            chosenClass: "shp-mobile-quick-settings__sortable-chosen",
            dragClass: "shp-mobile-quick-settings__sortable-drag",
            dataIdAttr: "data-action-id",
            onEnd: handleActionSortableEnd,
            }, "mobile-homepage");
    }

    function readActionIds(): MobileQuickActionId[] {
        if (!actionListEl) return [];
        return Array.from(actionListEl.querySelectorAll<HTMLElement>("[data-action-id]"))
            .map((node) => node.dataset.actionId)
            .filter(isMobileQuickActionId);
    }

    function handleActionSortableEnd(): void {
        if (isSaving) return;
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

        updateActionItems(nextItems);
    }

    $effect(() => {
        page;
        isSaving;
        sortedActionItems;
        void initActionSortable();
    });

    onMount(() => {
        void loadConfig();
    });

    onDestroy(() => destroyActionSortable());
</script>

<div class="shp-mobile-quick-settings">
    <header class="shp-mobile-quick-settings__header">
        {#if page === "main"}
            <button type="button" class="shp-mobile-quick-settings__icon-button" aria-label="关闭" onclick={close}>
                <SiyuanIcon name="close" size={18} />
            </button>
        {:else}
            <button type="button" class="shp-mobile-quick-settings__icon-button" aria-label="返回" onclick={goBack}>
                <SiyuanIcon name="previous" size={18} />
            </button>
        {/if}
        <strong>{pageTitle}</strong>
        <span class="shp-mobile-quick-settings__status">{isSaving ? "保存中" : ""}</span>
    </header>

    {#if isLoading}
        <div class="shp-mobile-quick-settings__state">加载中...</div>
    {:else if page === "main"}
        <main class="shp-mobile-quick-settings__body">
            <button type="button" class="shp-mobile-quick-settings__nav-card" onclick={() => (page = "homepage")}>
                <span class="shp-mobile-quick-settings__nav-icon">
                    <SiyuanIcon name="iconhomepage" size={20} />
                </span>
                <span class="shp-mobile-quick-settings__nav-text">
                    <strong>移动端主页</strong>
                    <small>{autoOpenMobileHomepage ? "启动后自动打开" : "启动后不自动打开"}</small>
                </span>
                <SiyuanIcon name="next" size={16} />
            </button>
            <button type="button" class="shp-mobile-quick-settings__nav-card" onclick={() => (page = "quickActions")}>
                <span class="shp-mobile-quick-settings__nav-icon">
                    <SiyuanIcon name="settings" size={20} />
                </span>
                <span class="shp-mobile-quick-settings__nav-text">
                    <strong>悬浮快捷按钮</strong>
                    <small>{mobileQuickActionsEnabled ? `${enabledActionCount} 个入口已显示` : "已关闭"}</small>
                </span>
                <SiyuanIcon name="next" size={16} />
            </button>
            <button type="button" class="shp-mobile-quick-settings__nav-card" onclick={() => (page = "notifications")}>
                <span class="shp-mobile-quick-settings__nav-icon">
                    <SiyuanIcon name="notifications" size={20} />
                </span>
                <span class="shp-mobile-quick-settings__nav-text">
                    <strong>通知设置</strong>
                    <small>管理当前手机的系统通知和通知计划</small>
                </span>
                <SiyuanIcon name="next" size={16} />
            </button>
        </main>
    {:else if page === "homepage"}
        <main class="shp-mobile-quick-settings__body">
            <section class="shp-mobile-quick-settings__panel">
                <label class="shp-mobile-quick-settings__switch-row">
                    <span>
                        <strong>自动打开移动端主页</strong>
                        <small>移动端启动后自动进入主页</small>
                    </span>
                    <input
                        type="checkbox"
                        class="b3-switch fn__flex-center"
                        checked={autoOpenMobileHomepage}
                        disabled={isSaving}
                        onchange={(e) => setAutoOpenMobileHomepage((e.currentTarget as HTMLInputElement).checked)}
                    />
                </label>
            </section>
        </main>
    {:else if page === "quickActions"}
        <main class="shp-mobile-quick-settings__body">
            <section class="shp-mobile-quick-settings__panel">
                <label class="shp-mobile-quick-settings__switch-row">
                    <span>
                        <strong>开启悬浮快捷按钮</strong>
                        <small>在手机右下角显示可展开的快捷入口</small>
                    </span>
                    <input
                        type="checkbox"
                        class="b3-switch fn__flex-center"
                        checked={mobileQuickActionsEnabled}
                        disabled={isSaving}
                        onchange={(e) => setMobileQuickActionsEnabled((e.currentTarget as HTMLInputElement).checked)}
                    />
                </label>
            </section>

            <section class="shp-mobile-quick-settings__panel">
                <div class="shp-mobile-quick-settings__field-title">
                    <strong>主按钮大小</strong>
                    <span>{normalizedButtonSize}px</span>
                </div>
                <input
                    type="range"
                    min={MIN_MOBILE_QUICK_ACTION_BUTTON_SIZE}
                    max={MAX_MOBILE_QUICK_ACTION_BUTTON_SIZE}
                    step="1"
                    value={normalizedButtonSize}
                    disabled={!mobileQuickActionsEnabled || isSaving}
                    oninput={(e) => updateButtonSize((e.currentTarget as HTMLInputElement).value)}
                    onchange={(e) => updateButtonSize((e.currentTarget as HTMLInputElement).value, true)}
                />
            </section>

            <button type="button" class="shp-mobile-quick-settings__nav-card" onclick={() => (page = "actionList")}>
                <span class="shp-mobile-quick-settings__nav-icon">
                    <SiyuanIcon name="drag" size={20} />
                </span>
                <span class="shp-mobile-quick-settings__nav-text">
                    <strong>快捷按钮管理</strong>
                    <small>显示开关与顺序</small>
                </span>
                <SiyuanIcon name="next" size={16} />
            </button>
        </main>
    {:else if page === "notifications"}
        <main class="shp-mobile-quick-settings__notification-body">
            <MobileNotificationQuickSettingsPage />
        </main>
    {:else}
        <main class="shp-mobile-quick-settings__body">
            <div class="shp-mobile-quick-settings__action-list" bind:this={actionListEl}>
                {#each sortedActionItems as item (item.id)}
                    {@const definition = getActionDefinition(item.id)}
                    <section class="shp-mobile-quick-settings__action-card" data-action-id={item.id}>
                        <span class="shp-mobile-quick-settings__action-drag-handle" aria-label="拖拽排序" title="拖拽排序">⋮⋮</span>
                        <span class="shp-mobile-quick-settings__action-icon">
                            {#if definition?.icon === "wallet"}
                                <AccountingIcon name="wallet" size={18} />
                            {:else}
                                <SiyuanIcon name={definition?.icon || "open"} size={18} />
                            {/if}
                        </span>
                        <span class="shp-mobile-quick-settings__action-text">
                            <strong>{definition?.label || item.id}</strong>
                            <small>{definition?.description || ""}</small>
                        </span>
                        <div class="shp-mobile-quick-settings__action-controls">
                            <input
                                type="checkbox"
                                class="b3-switch fn__flex-center"
                                checked={item.enabled}
                                disabled={isSaving}
                                onchange={(e) => setActionEnabled(item.id, (e.currentTarget as HTMLInputElement).checked)}
                            />
                        </div>
                    </section>
                {/each}
            </div>
        </main>
    {/if}
</div>

<style lang="scss">
    .shp-mobile-quick-settings {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        color: var(--b3-theme-on-background);
        background: var(--b3-theme-background);
    }

    .shp-mobile-quick-settings__header {
        height: 52px;
        padding: 0 max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left));
        border-bottom: 1px solid var(--b3-border-color);
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) 56px;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
    }

    .shp-mobile-quick-settings__header strong {
        min-width: 0;
        overflow: hidden;
        font-size: 17px;
        line-height: 1.3;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shp-mobile-quick-settings__icon-button {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface);
        background: var(--b3-theme-surface);
    }

    .shp-mobile-quick-settings__icon-button {
        width: 36px;
        height: 36px;
    }

    .shp-mobile-quick-settings__status {
        min-width: 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        text-align: right;
    }

    .shp-mobile-quick-settings__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px max(14px, env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
    }

    .shp-mobile-quick-settings__notification-body {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow: auto;
    }

    .shp-mobile-quick-settings__state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    .shp-mobile-quick-settings__panel,
    .shp-mobile-quick-settings__nav-card,
    .shp-mobile-quick-settings__action-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .shp-mobile-quick-settings__nav-card {
        width: 100%;
        min-height: 64px;
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) 22px;
        align-items: center;
        gap: 10px;
        padding: 10px;
        color: inherit;
        font: inherit;
        text-align: left;
    }

    .shp-mobile-quick-settings__nav-icon,
    .shp-mobile-quick-settings__action-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .shp-mobile-quick-settings__nav-text,
    .shp-mobile-quick-settings__action-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .shp-mobile-quick-settings__nav-text strong,
    .shp-mobile-quick-settings__action-text strong {
        overflow: hidden;
        color: var(--b3-theme-on-surface);
        font-size: 15px;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shp-mobile-quick-settings__nav-text small,
    .shp-mobile-quick-settings__action-text small {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shp-mobile-quick-settings__panel {
        padding: 12px;
    }

    .shp-mobile-quick-settings__switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .shp-mobile-quick-settings__switch-row span,
    .shp-mobile-quick-settings__field-title {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .shp-mobile-quick-settings__switch-row strong,
    .shp-mobile-quick-settings__field-title strong {
        color: var(--b3-theme-on-surface);
        font-size: 15px;
        line-height: 1.3;
    }

    .shp-mobile-quick-settings__switch-row small {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.25;
    }

    .shp-mobile-quick-settings__field-title {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
    }

    .shp-mobile-quick-settings__field-title span {
        color: var(--b3-theme-primary);
        font-size: 13px;
    }

    .shp-mobile-quick-settings__panel input[type="range"] {
        width: 100%;
        accent-color: var(--b3-theme-primary);
    }

    .shp-mobile-quick-settings__action-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .shp-mobile-quick-settings__action-card {
        min-height: 66px;
        display: grid;
        grid-template-columns: 18px 40px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 10px;
    }

    .shp-mobile-quick-settings__action-drag-handle {
        width: 18px;
        color: var(--b3-theme-on-surface-light);
        cursor: grab;
        font-size: 12px;
        letter-spacing: -1px;
        line-height: 1;
        text-align: center;
        user-select: none;
    }

    .shp-mobile-quick-settings__action-drag-handle:hover {
        color: var(--b3-theme-primary);
    }

    .shp-mobile-quick-settings__action-controls {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
    }

    .shp-mobile-quick-settings__icon-button:disabled {
        opacity: 0.42;
    }

    .shp-mobile-quick-settings__action-list :global(.shp-mobile-quick-settings__sortable-ghost) {
        opacity: 0.45;
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    }

    .shp-mobile-quick-settings__action-list :global(.shp-mobile-quick-settings__sortable-chosen .shp-mobile-quick-settings__action-drag-handle) {
        color: var(--b3-theme-primary);
        cursor: grabbing;
    }
</style>
