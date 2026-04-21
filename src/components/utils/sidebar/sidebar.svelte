<script lang="ts">
    import { onMount } from "svelte";
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
    let layoutObserver: MutationObserver | null = null;

    // 本地容器引用：避免全局 selector 在实例重叠时命中错容器
    let sidebarWidgetContainer: HTMLElement | null = null;

    function setupSortableObserver() {
        // 先销毁旧的 sortable 实例，避免重复初始化
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }

        if (layoutObserver) {
            layoutObserver.disconnect();
            layoutObserver = null;
        }

        layoutObserver = new MutationObserver(async () => {
            const container = document.querySelector(
                ".sidebar-widget",
            ) as HTMLElement;
            if (container) {
                layoutObserver?.disconnect();
                sidebarWidgetContainer = container;

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
        });

        layoutObserver.observe(document.body, { childList: true, subtree: true });
    }

    function cleanupSortableState() {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        if (layoutObserver) {
            layoutObserver.disconnect();
            layoutObserver = null;
        }
    }

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = () => {
            advanced = true;
            setupSortableObserver();
        };

        const handleAdvancedUnavailable = () => {
            advanced = false;
            cleanupSortableState();
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        if (advanced) {
            setupSortableObserver();
        }

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            cleanupSortableState();

            // 显式销毁所有 widget 实例，触发各自的 onDestroy
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
        <div class="sidebar-widget"></div>
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
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>
