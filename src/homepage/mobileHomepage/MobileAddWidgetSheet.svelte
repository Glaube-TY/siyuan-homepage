<script lang="ts">
    import { onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import {
        MOBILE_WIDGET_CATALOG,
        type MobileAddCategoryId,
        type MobileWidgetCategoryId,
    } from "./mobile-widget-categories";

    interface Props {
        activeCategory: MobileWidgetCategoryId;
        onSelect: (widgetType: string) => void;
        onClose: () => void;
    }

    let { activeCategory, onSelect, onClose }: Props = $props();

    const addCategories: { id: MobileAddCategoryId; label: string }[] = [
        { id: "common", label: "常用" },
        { id: "docs", label: "文档" },
        { id: "task", label: "任务" },
        { id: "data", label: "数据" },
        { id: "tools", label: "工具" },
        { id: "custom", label: "自定义" },
        { id: "all", label: "全部" },
    ];

    let selectedCategory = $state<MobileAddCategoryId>("common");
    let searchText = $state("");

    const filteredWidgets = $derived(
        MOBILE_WIDGET_CATALOG.filter((item) => {
            const matchesCategory =
                selectedCategory === "all" ||
                (selectedCategory === "common"
                    ? item.common
                    : selectedCategory === "custom"
                      ? item.activeTab === "custom"
                      : item.category === selectedCategory);
            const keyword = searchText.trim().toLowerCase();
            const matchesSearch =
                !keyword ||
                item.label.toLowerCase().includes(keyword) ||
                item.type.toLowerCase().includes(keyword) ||
                item.description.toLowerCase().includes(keyword);
            return matchesCategory && matchesSearch;
        }),
    );

    onMount(() => {
        selectedCategory = activeCategory === "all" ? "common" : activeCategory;
    });
</script>

<button class="mobile-widget-sheet-backdrop" type="button" aria-label="关闭添加组件" onclick={onClose}></button>
<div class="mobile-widget-sheet mobile-add-widget-sheet" role="dialog" aria-modal="true" aria-label="添加组件">
    <header class="mobile-widget-sheet-header">
        <div>
            <div class="mobile-widget-sheet-eyebrow">添加组件</div>
            <h3>选择要添加到移动主页的组件</h3>
        </div>
        <button class="mobile-widget-sheet-close" type="button" aria-label="关闭" onclick={onClose}>
            <SiyuanIcon name="cancel" size={16} />
        </button>
    </header>

    <div class="mobile-add-search">
        <SiyuanIcon name="search" size={16} />
        <input bind:value={searchText} type="search" placeholder="搜索组件" />
    </div>

    <div class="mobile-add-category-tabs" role="tablist" aria-label="组件分类">
        {#each addCategories as category}
            <button
                type="button"
                class:active={selectedCategory === category.id}
                onclick={() => (selectedCategory = category.id)}
            >
                {category.label}
            </button>
        {/each}
    </div>

    <div class="mobile-widget-sheet-body">
        <div class="mobile-add-widget-grid">
            {#each filteredWidgets as item}
                <button type="button" class="mobile-add-widget-card" onclick={() => onSelect(item.type)}>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                    <small>{item.type}</small>
                </button>
            {:else}
                <div class="mobile-add-empty">没有匹配的组件</div>
            {/each}
        </div>
    </div>
</div>
