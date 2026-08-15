<script lang="ts">
    import { onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import MobileWidgetContentForm from "./MobileWidgetContentForm.svelte";
    import MusicCloudConnectionDialog from "@/components/utils/widgetBlock/widget/musicPlayer/MusicCloudConnectionDialog.svelte";
    import FavoritesManagerDialog from "@/features/favorites-manager/components/FavoritesManagerDialog.svelte";
    import CountdownCenterDialog from "@/features/countdown-center/components/CountdownCenterDialog.svelte";
    import ReviewNotifySettingsDialog from "@/features/review-notify/components/ReviewNotifySettingsDialog.svelte";
    import FocusNotifySettingsDialog from "@/features/focus-notify/components/FocusNotifySettingsDialog.svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import {
        MOBILE_WIDGET_CATEGORIES,
        MOBILE_WIDGET_CATALOG,
        getMobileWidgetCategory,
        getMobileWidgetLabel,
        type MobileWidgetCategoryId,
    } from "./mobile-widget-categories";
    import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

    interface Props {
        plugin: any;
        currentBlockId: string;
        initialContentType?: string;
        onClose: () => void;
        onConfirm: (contentTypeJson: string) => void | Promise<void>;
        deviceViewContext: DeviceViewContext;
    }

    let {
        plugin,
        currentBlockId,
        initialContentType = "",
        onClose,
        onConfirm,
        deviceViewContext,
    }: Props = $props();

    type MobileWidgetContentSubpage =
        | "music-cloud"
        | "favorites-manager"
        | "countdown-center"
        | "review-notify"
        | "focus-notify";
    type SheetView = "categories" | "widgets" | "settings" | MobileWidgetContentSubpage;

    const contentCategories: { id: MobileWidgetCategoryId; label: string; description: string }[] = [
        ...MOBILE_WIDGET_CATEGORIES.map((category) => ({
            ...category,
            description: ({
                all: "查看全部可添加组件",
                note: "文档、任务与笔记数据",
                visualization: "统计、日历与图表",
                tool: "时间、天气与效率工具",
                info: "热搜、新闻与每日信息",
                custom: "文字、网页与文档块入口",
            } as const)[category.id],
        })),
    ];

    let view = $state<SheetView>("categories");
    let subpageRevision = $state(0);
    let advancedEnabled = $state(getHomepageEntitlementSnapshot().advanced);
    let selectedCategory = $state<MobileWidgetCategoryId>("all");
    let selectedContentType = $state("");
    const title = $derived(({
        "music-cloud": "NAS 音乐服务",
        "favorites-manager": "收藏文档管理",
        "countdown-center": "纪念日中心",
        "review-notify": "复习通知",
        "focus-notify": "番茄钟通知",
    } as Partial<Record<SheetView, string>>)[view]
        || (selectedContentType ? getMobileWidgetLabel(selectedContentType) : "选择组件"));
    const widgetsInCategory = $derived(
        MOBILE_WIDGET_CATALOG.filter((item) => {
            if (selectedCategory === "all") return true;
            return item.activeTab === selectedCategory;
        }),
    );

    function getContentCategory(widgetType: string): MobileWidgetCategoryId {
        return getMobileWidgetCategory(widgetType);
    }

    function openCategory(category: MobileWidgetCategoryId): void {
        selectedCategory = category;
        view = "widgets";
    }

    function openWidget(widgetType: string): void {
        selectedContentType = widgetType;
        view = "settings";
    }

    function goBack(): void {
        if (["music-cloud", "favorites-manager", "countdown-center", "review-notify", "focus-notify"].includes(view)) {
            subpageRevision += 1;
            view = "settings";
            return;
        }
        if (view === "settings") {
            view = "widgets";
            return;
        }
        if (view === "widgets") {
            view = "categories";
            return;
        }
        onClose();
    }

    onMount(() => {
        if (initialContentType) {
            selectedContentType = initialContentType;
            selectedCategory = getContentCategory(initialContentType);
            view = "settings";
        }
        return subscribeHomepageEntitlement((snapshot) => {
            advancedEnabled = snapshot.advanced;
        });
    });
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭内容设置" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-widget-content-sheet" role="dialog" aria-modal="true" aria-label="组件内容设置">
    <header class="mobile-widget-sheet-header">
        {#if view !== "categories"}
            <button class="mobile-widget-sheet-back" type="button" aria-label="返回上一级" onclick={goBack}>
                <SiyuanIcon name="previous" size={16} />
            </button>
        {/if}
        <div>
            <div class="mobile-widget-sheet-eyebrow">内容设置</div>
            <h3>{title}</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-widget-sheet-body">
        {#if view === "categories"}
            <div class="mobile-content-menu">
                {#each contentCategories as category}
                    <button type="button" class="mobile-content-menu-card" onclick={() => openCategory(category.id)}>
                        <strong>{category.label}</strong>
                        <span>{category.description}</span>
                    </button>
                {/each}
            </div>
        {:else if view === "widgets"}
            <div class="mobile-content-menu">
                {#each widgetsInCategory as item}
                    <button type="button" class="mobile-content-menu-card" onclick={() => openWidget(item.type)}>
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                    </button>
                {/each}
            </div>
        {:else if selectedContentType}
            {#key selectedContentType}
                <div class="mobile-widget-content-panel" hidden={view !== "settings"}>
                    <MobileWidgetContentForm
                        {plugin}
                        {currentBlockId}
                        widgetType={selectedContentType}
                        onClose={onClose}
                        onConfirm={onConfirm}
                        onOpenSubpage={(subpage) => (view = subpage)}
                        {subpageRevision}
                        {deviceViewContext}
                    />
                </div>
                {#if view === "music-cloud"}
                    <div class="mobile-widget-content-panel mobile-widget-content-subpage">
                        <MusicCloudConnectionDialog {plugin} onClose={goBack} />
                    </div>
                {:else if view === "favorites-manager"}
                    <div class="mobile-widget-content-panel mobile-widget-content-subpage">
                        <FavoritesManagerDialog {plugin} mobile={true} onClose={goBack} />
                    </div>
                {:else if view === "countdown-center"}
                    <div class="mobile-widget-content-panel mobile-widget-content-subpage">
                        <CountdownCenterDialog {plugin} mobile={true} initialTab="overview" onClose={goBack} />
                    </div>
                {:else if view === "review-notify"}
                    <div class="mobile-widget-content-panel mobile-widget-content-subpage">
                        <ReviewNotifySettingsDialog {advancedEnabled} onClose={goBack} />
                    </div>
                {:else if view === "focus-notify"}
                    <div class="mobile-widget-content-panel mobile-widget-content-subpage">
                        <FocusNotifySettingsDialog {advancedEnabled} onClose={goBack} />
                    </div>
                {/if}
            {/key}
        {/if}
    </div>
</div>
