<script lang="ts">
    import { onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import MobileWidgetContentForm from "./MobileWidgetContentForm.svelte";
    import {
        MOBILE_WIDGET_CATALOG,
        getMobileWidgetCategory,
        getMobileWidgetLabel,
        type MobileAddCategoryId,
    } from "./mobile-widget-categories";

    interface Props {
        plugin: any;
        currentBlockId: string;
        initialContentType?: string;
        onClose: () => void;
        onConfirm: (contentTypeJson: string) => void | Promise<void>;
    }

    let {
        plugin,
        currentBlockId,
        initialContentType = "",
        onClose,
        onConfirm,
    }: Props = $props();

    type SheetView = "categories" | "widgets" | "settings";

    const contentCategories: { id: MobileAddCategoryId; label: string; description: string }[] = [
        { id: "common", label: "常用", description: "最适合手机主页的组件" },
        { id: "docs", label: "文档", description: "最近、收藏、条件文档" },
        { id: "task", label: "任务", description: "任务、快速笔记、倒数日" },
        { id: "data", label: "数据", description: "统计、图表、SQL" },
        { id: "tools", label: "工具", description: "时间、语录、天气等" },
        { id: "custom", label: "自定义", description: "文字、网页、文档块入口" },
    ];

    let view = $state<SheetView>("categories");
    let selectedCategory = $state<MobileAddCategoryId>("common");
    let selectedContentType = $state("");
    const title = $derived(selectedContentType ? getMobileWidgetLabel(selectedContentType) : "选择组件");
    const widgetsInCategory = $derived(
        MOBILE_WIDGET_CATALOG.filter((item) => {
            if (selectedCategory === "common") return item.common;
            if (selectedCategory === "all") return true;
            if (selectedCategory === "custom") return item.activeTab === "custom";
            return item.category === selectedCategory;
        }),
    );

    function getContentCategory(widgetType: string): MobileAddCategoryId {
        const catalogItem = MOBILE_WIDGET_CATALOG.find((item) => item.type === widgetType);
        if (catalogItem?.activeTab === "custom") return "custom";
        return getMobileWidgetCategory(widgetType);
    }

    function openCategory(category: MobileAddCategoryId): void {
        selectedCategory = category;
        view = "widgets";
    }

    function openWidget(widgetType: string): void {
        selectedContentType = widgetType;
        view = "settings";
    }

    function goBack(): void {
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
        if (!initialContentType) return;
        selectedContentType = initialContentType;
        selectedCategory = getContentCategory(initialContentType);
        view = "settings";
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
                <MobileWidgetContentForm
                    {plugin}
                    {currentBlockId}
                    widgetType={selectedContentType}
                    onClose={onClose}
                    onConfirm={onConfirm}
                />
            {/key}
        {/if}
    </div>
</div>
