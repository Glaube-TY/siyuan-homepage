<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./widget_layout";
    import { addCustomBlock } from "./block-creator";
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
                >➕添加组件</button
            >
        </div>
    {:else}
        <div class="sidebar-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
        </div>
    {/if}
</div>
