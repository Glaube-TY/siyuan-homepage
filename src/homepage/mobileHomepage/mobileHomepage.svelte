<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { showMessage } from "siyuan";
    import { saveLayout, restoreLayout } from "./mobileHomepage_layout";
    import { createMobileWidgetBlock } from "./block-creator";
    import MobileWidgetActionSheet from "./MobileWidgetActionSheet.svelte";
    import MobileWidgetContentSheet from "./MobileWidgetContentSheet.svelte";
    import MobileWidgetStyleSheet from "./MobileWidgetStyleSheet.svelte";
    import MobileAddWidgetSheet from "./MobileAddWidgetSheet.svelte";
    import MobileWidgetDeleteSheet from "./MobileWidgetDeleteSheet.svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AdvancedFeatureLock from "../../components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte";
    import {
        MOBILE_WIDGET_CATEGORIES,
        getMobileWidgetActiveTab,
        getMobileWidgetLabel,
        matchesMobileCategory,
        type MobileWidgetCategoryId,
    } from "./mobile-widget-categories";
    import {
        getWidgetTypeFromBlock,
        removeWidgetConfigIfUnreferenced,
    } from "./mobile-widget-utils";
    import "./mobileHomepage.scss";

    export const app = undefined;

    interface Props {
        plugin: any;
        close: () => void;
        previewMode?: boolean;
    }

    type ContentSheetState = {
        blockId: string;
        initialContentType?: string;
        isNew: boolean;
    };

    let { plugin, close, previewMode = false }: Props = $props();

    const currentBlockForSettingsRef: { value: HTMLElement | null } = { value: null };

    let advanced: boolean = $state(false);
    let sortable: Sortable | null = null;
    let mobileHomepageInitialized = false;
    let widgetEventsBound = false;

    let mobileHomepageWidgetContainer: HTMLElement | null = $state(null);
    let editMode = $state(false);
    let activeCategory = $state<MobileWidgetCategoryId>("all");
    let selectedBlock: HTMLElement | null = $state(null);
    let selectedWidgetType = $state("");
    let actionSheetOpen = $state(false);
    let addSheetOpen = $state(false);
    let contentSheet: ContentSheetState | null = $state(null);
    let styleSheetBlock: HTMLElement | null = $state(null);
    let deleteSheetBlock: HTMLElement | null = $state(null);
    let totalWidgetCount = $state(0);
    let visibleWidgetCount = $state(0);

    function getWidgetBlocks(): HTMLElement[] {
        const container = mobileHomepageWidgetContainer;
        if (!container) return [];
        return Array.from(container.querySelectorAll(".widget-block"))
            .filter((block): block is HTMLElement => block instanceof HTMLElement);
    }

    function setSelectedBlock(block: HTMLElement | null): void {
        if (selectedBlock && selectedBlock !== block) {
            selectedBlock.classList.remove("mobile-widget-selected");
        }
        selectedBlock = block;
        currentBlockForSettingsRef.value = block;
        if (block) {
            block.classList.add("mobile-widget-selected");
            selectedWidgetType = block.dataset.widgetType || "";
        } else {
            selectedWidgetType = "";
        }
    }

    function syncWidgetCount(): void {
        const blocks = getWidgetBlocks();
        totalWidgetCount = blocks.length;
        visibleWidgetCount = blocks.filter((block) => {
            return !block.classList.contains("mobile-widget-hidden-by-category");
        }).length;
    }

    async function refreshSelectedWidgetType(block: HTMLElement | null = selectedBlock): Promise<void> {
        if (!block) {
            selectedWidgetType = "";
            return;
        }
        selectedWidgetType = (await getWidgetTypeFromBlock(plugin, block)) || "";
    }

    function updateSortableState(): void {
        if (!sortable) return;
        sortable.option("disabled", !(editMode && activeCategory === "all"));
    }

    async function applyCategoryFilter(): Promise<void> {
        const blocks = getWidgetBlocks();
        await Promise.all(blocks.map(async (block) => {
            const widgetType = await getWidgetTypeFromBlock(plugin, block);
            const visible = matchesMobileCategory(widgetType, activeCategory);
            block.classList.toggle("mobile-widget-hidden-by-category", !visible);
        }));
        syncWidgetCount();
    }

    async function initMobileHomepageLayout(): Promise<void> {
        await tick();

        const container = mobileHomepageWidgetContainer;
        if (!container) {
            console.warn("mobileHomepageWidgetContainer not available");
            return;
        }

        if (!widgetEventsBound) {
            container.addEventListener("mobile-widget-action", handleWidgetAction as EventListener);
            container.addEventListener("mobile-widget-longpress", handleWidgetLongPress as EventListener);
            container.addEventListener("mobile-widget-refreshed", handleWidgetRefreshed as EventListener);
            widgetEventsBound = true;
        }

        if (mobileHomepageInitialized) {
            return;
        }

        mobileHomepageInitialized = true;

        if (sortable) {
            sortable.destroy();
            sortable = null;
        }

        sortable = new Sortable(container, {
            animation: 150,
            ghostClass: "mobile-sortable-ghost",
            chosenClass: "mobile-sortable-chosen",
            dragClass: "mobile-sortable-drag",
            handle: ".mobile-widget-drag-handle",
            delay: 180,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            filter: "button,input,textarea,select,a,[role='button']",
            preventOnFilter: false,
            disabled: true,
            onEnd: async () => {
                if (editMode && activeCategory === "all") {
                    await saveLayout(plugin, mobileHomepageWidgetContainer);
                    await applyCategoryFilter();
                }
            },
        });

        await restoreLayout(plugin, currentBlockForSettingsRef, mobileHomepageWidgetContainer, {
            previewMode,
        });
        await applyCategoryFilter();
        syncWidgetCount();
        updateSortableState();
    }

    function cleanupSortableState(): void {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        const container = mobileHomepageWidgetContainer;
        if (container && widgetEventsBound) {
            container.removeEventListener("mobile-widget-action", handleWidgetAction as EventListener);
            container.removeEventListener("mobile-widget-longpress", handleWidgetLongPress as EventListener);
            container.removeEventListener("mobile-widget-refreshed", handleWidgetRefreshed as EventListener);
        }
        widgetEventsBound = false;
        mobileHomepageInitialized = false;
    }

    function handleWidgetAction(event: CustomEvent): void {
        const block = event.detail?.element as HTMLElement | undefined;
        if (!block) return;
        editMode = true;
        setSelectedBlock(block);
        void refreshSelectedWidgetType(block);
        actionSheetOpen = true;
        updateSortableState();
    }

    function handleWidgetLongPress(event: CustomEvent): void {
        const block = event.detail?.element as HTMLElement | undefined;
        if (!block) return;
        editMode = true;
        setSelectedBlock(block);
        void refreshSelectedWidgetType(block);
        actionSheetOpen = true;
        updateSortableState();
    }

    function handleWidgetRefreshed(): void {
        void applyCategoryFilter();
        void refreshSelectedWidgetType();
    }

    async function toggleEditMode(): Promise<void> {
        if (editMode) {
            await saveLayout(plugin, mobileHomepageWidgetContainer);
            actionSheetOpen = false;
            styleSheetBlock = null;
            contentSheet = null;
            deleteSheetBlock = null;
            setSelectedBlock(null);
            editMode = false;
            showMessage("移动端主页布局已保存");
        } else {
            editMode = true;
        }
        updateSortableState();
    }

    function openSelectedContentSheet(): void {
        if (!selectedBlock) return;
        contentSheet = {
            blockId: selectedBlock.id,
            isNew: false,
        };
        actionSheetOpen = false;
    }

    function openSelectedStyleSheet(): void {
        if (!selectedBlock) return;
        styleSheetBlock = selectedBlock;
        actionSheetOpen = false;
    }

    async function refreshBlock(block: HTMLElement | null = selectedBlock): Promise<void> {
        const instance = (block as any)?.__widgetBlockInstance;
        if (instance && typeof instance.refreshContent === "function") {
            await instance.refreshContent();
            await applyCategoryFilter();
        }
    }

    async function refreshAllWidgets(): Promise<void> {
        const blocks = getWidgetBlocks();
        for (const block of blocks) {
            await refreshBlock(block);
        }
        showMessage("移动端组件已刷新");
    }

    function openAddSheet(): void {
        editMode = true;
        addSheetOpen = true;
        updateSortableState();
    }

    function openNewWidgetContentSheet(widgetType: string): void {
        addSheetOpen = false;
        contentSheet = {
            blockId: `block-${Date.now()}`,
            initialContentType: widgetType,
            isNew: true,
        };
    }

    async function handleContentConfirm(contentTypeJson: string): Promise<void> {
        if (!contentSheet) return;

        let block = document.getElementById(contentSheet.blockId) as HTMLElement | null;
        if (contentSheet.isNew) {
            const created = createMobileWidgetBlock(
                plugin,
                currentBlockForSettingsRef,
                mobileHomepageWidgetContainer,
                contentSheet.blockId,
                { previewMode },
            );
            block = created?.element || null;
        }

        if (!block) {
            contentSheet = null;
            return;
        }

        const instance = (block as any).__widgetBlockInstance;
        if (instance && typeof instance.updateContent === "function") {
            instance.updateContent(contentTypeJson);
        }

        await plugin.saveData(`widget-${contentSheet.blockId}.json`, JSON.parse(contentTypeJson));
        await saveLayout(plugin, mobileHomepageWidgetContainer);
        setSelectedBlock(block);
        await refreshSelectedWidgetType(block);
        await applyCategoryFilter();
        contentSheet = null;
        syncWidgetCount();
    }

    function requestDeleteSelectedWidget(): void {
        const block = selectedBlock || styleSheetBlock;
        if (!block) return;
        deleteSheetBlock = block;
        actionSheetOpen = false;
        styleSheetBlock = null;
    }

    async function confirmDeleteWidget(): Promise<void> {
        const block = deleteSheetBlock;
        if (!block) return;

        const widgetId = block.id;
        const instance = (block as any).__widgetBlockInstance;
        if (instance && typeof instance.destroy === "function") {
            instance.destroy();
        }
        block.remove();

        await saveLayout(plugin, mobileHomepageWidgetContainer);
        const result = await removeWidgetConfigIfUnreferenced(plugin, widgetId);

        actionSheetOpen = false;
        styleSheetBlock = null;
        deleteSheetBlock = null;
        setSelectedBlock(null);
        await applyCategoryFilter();
        syncWidgetCount();

        if (result.removedConfig) {
            showMessage("已删除移动端组件");
        } else {
            showMessage("已删除移动端组件");
        }
    }

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = async () => {
            advanced = true;
            mobileHomepageInitialized = false;
            await tick();
            await initMobileHomepageLayout();
        };

        const handleAdvancedUnavailable = () => {
            advanced = false;
            cleanupSortableState();
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        if (advanced) {
            void initMobileHomepageLayout();
        }

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            cleanupSortableState();

            const container = mobileHomepageWidgetContainer || document.querySelector(".mobile-homepage-widget");
            if (container) {
                const widgetBlocks = container.querySelectorAll(".widget-block");
                widgetBlocks.forEach((block) => {
                    const instance = (block as any).__widgetBlockInstance;
                    if (instance && typeof instance.destroy === "function") {
                        try {
                            instance.destroy();
                        } catch {
                            // 忽略销毁错误
                        }
                    }
                });
            }
            mobileHomepageWidgetContainer = null;
        };
    });

    $effect(() => {
        activeCategory;
        void applyCategoryFilter();
        updateSortableState();
    });

    $effect(() => {
        editMode;
        updateSortableState();
    });
</script>

<div
    class="mobile-homepage"
    class:mobile-homepage--editing={editMode}
    class:mobile-homepage--preview={previewMode}
>
    {#if advanced}
        <header class="mobile-homepage-topbar">
            <div class="mobile-homepage-title">
                <strong>移动主页</strong>
            </div>
            <div class="mobile-homepage-top-actions">
                <button type="button" class="mobile-homepage-text-button" onclick={() => void toggleEditMode()}>
                    {editMode ? "完成" : "编辑"}
                </button>
                <button type="button" class="mobile-homepage-icon-button" aria-label="关闭" onclick={close}>
                    <SiyuanIcon name="cancel" size={16} />
                </button>
            </div>
        </header>

        <nav class="mobile-homepage-nav" aria-label="移动主页分类">
            {#each MOBILE_WIDGET_CATEGORIES as category}
                <button
                    type="button"
                    class:active={activeCategory === category.id}
                    onclick={() => (activeCategory = category.id)}
                >
                    {category.label}
                </button>
            {/each}
        </nav>

        <main class="mobile-homepage-scroll">
            <div class="mobile-homepage-widget" bind:this={mobileHomepageWidgetContainer}></div>
            {#if totalWidgetCount === 0}
                <div class="mobile-homepage-empty">
                    <strong>还没有移动端组件</strong>
                    <span>点击底部“添加组件”开始配置。</span>
                </div>
            {:else if visibleWidgetCount === 0}
                <div class="mobile-homepage-empty">
                    <strong>当前分类暂无组件</strong>
                    <span>切换到“全部”查看已添加组件。</span>
                </div>
            {/if}
        </main>

        <footer class="mobile-homepage-bottom-bar">
            <button type="button" onclick={openAddSheet}>
                <SiyuanIcon name="create" size={16} />
                <span>添加组件</span>
            </button>
            <button type="button" onclick={() => void refreshAllWidgets()}>
                <SiyuanIcon name="refresh" size={16} />
                <span>刷新</span>
            </button>
            <button type="button" onclick={close}>
                <SiyuanIcon name="previous" size={16} />
                <span>返回</span>
            </button>
        </footer>

        {#if actionSheetOpen && selectedBlock}
            <MobileWidgetActionSheet
                title={getMobileWidgetLabel(selectedWidgetType)}
                canDrag={activeCategory === "all"}
                onEditContent={openSelectedContentSheet}
                onEditStyle={openSelectedStyleSheet}
                onRefresh={() => refreshBlock(selectedBlock)}
                onDelete={requestDeleteSelectedWidget}
                onClose={() => (actionSheetOpen = false)}
            />
        {/if}

        {#if contentSheet}
            <MobileWidgetContentSheet
                {plugin}
                currentBlockId={contentSheet.blockId}
                initialContentType={contentSheet.initialContentType || selectedWidgetType}
                onClose={() => (contentSheet = null)}
                onConfirm={handleContentConfirm}
            />
        {/if}

        {#if styleSheetBlock}
            <MobileWidgetStyleSheet
                blockElement={styleSheetBlock}
                widgetType={styleSheetBlock.dataset.widgetType || selectedWidgetType}
                onClose={() => (styleSheetBlock = null)}
                onDelete={requestDeleteSelectedWidget}
                onStyleChanged={() => saveLayout(plugin, mobileHomepageWidgetContainer)}
            />
        {/if}

        {#if deleteSheetBlock}
            <MobileWidgetDeleteSheet
                title={getMobileWidgetLabel(deleteSheetBlock.dataset.widgetType)}
                onConfirm={confirmDeleteWidget}
                onClose={() => (deleteSheetBlock = null)}
            />
        {/if}

        {#if addSheetOpen}
            <MobileAddWidgetSheet
                {activeCategory}
                onSelect={openNewWidgetContentSheet}
                onClose={() => (addSheetOpen = false)}
            />
        {/if}
    {:else}
        <div class="mobile-homepage-not-advanced">
            <AdvancedFeatureLock
                title="移动端主页"
                subtitle="移动端自定义主页布局，拖拽排序和组件管理。"
                icon="mobile"
                features={[
                    "移动端自定义主页布局",
                    "拖拽排序和组件管理",
                    "适合移动端个性化展示"
                ]}
                highlights={["移动端", "拖拽布局", "组件管理"]}
                compact
            />
        </div>
    {/if}
</div>
