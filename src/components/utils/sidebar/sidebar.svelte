<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./widget_layout";
    import { addCustomBlock } from "./block-creator";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AdvancedFeatureLock from "../widgetBlock/widget/common/AdvancedFeatureLock.svelte";
    import "./siderBar.scss";

    interface Props {
        plugin: any;
    }

    let { plugin }: Props = $props();

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let advanced: boolean = $state(false);
    let sortable: Sortable | null = null;
    let sidebarInitialized = false;

    let sidebarWidgetContainer: HTMLElement | null = $state(null);

    async function initSidebarLayout(): Promise<void> {
        await tick();

        const container = sidebarWidgetContainer;
        if (!container) {
            console.warn("sidebarWidgetContainer not available");
            return;
        }

        if (sidebarInitialized) {
            return;
        }

        sidebarInitialized = true;

        if (sortable) {
            sortable.destroy();
            sortable = null;
        }

        sortable = new Sortable(container, {
            animation: 150,
            ghostClass: "sortable-ghost",
            handle: ".drag-handle",
            onEnd: () => {
                saveLayout(plugin, sidebarWidgetContainer);
            },
        });

        await restoreLayout(plugin, { value: container }, sidebarWidgetContainer);
    }

    function cleanupSortableState() {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        sidebarInitialized = false;
    }

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = async () => {
            advanced = true;
            sidebarInitialized = false;
            await tick();
            await initSidebarLayout();
        };

        const handleAdvancedUnavailable = () => {
            advanced = false;
            cleanupSortableState();
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        if (advanced) {
            initSidebarLayout();
        }

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            cleanupSortableState();

            const container = sidebarWidgetContainer || document.querySelector(".sidebar-widget");
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
            sidebarWidgetContainer = null;
        };
    });
</script>

<div class="sidebar-display">
    {#if advanced}
        <div class="sidebar-widget" bind:this={sidebarWidgetContainer}></div>
        <div class="sidebar-setting">
            <button
                class="add-widget-btn"
                onclick={() =>
                    addCustomBlock(plugin, currentBlockForSettingsRef, sidebarWidgetContainer)}
                >
                    <SiyuanIcon name="create" size={14} />
                    <span>添加组件</span>
                </button
            >
        </div>
    {:else}
        <div class="sidebar-not-advanced">
            <AdvancedFeatureLock
                title="侧边栏组件库"
                subtitle="自定义侧边栏布局，自由拖拽排序和添加组件。"
                icon="layout"
                features={[
                    "自定义侧边栏布局",
                    "自由拖拽排序",
                    "灵活添加各类组件"
                ]}
                highlights={["拖拽布局", "组件库", "自定义排序"]}
                compact
            />
        </div>
    {/if}
</div>
