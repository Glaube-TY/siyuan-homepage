<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./mobileHomepage_layout";
    import { addCustomBlock } from "./block-creator";
    import "./mobileHomepage.scss";

    export const app = undefined;
    interface Props {
        plugin: any;
        close: () => void;
    }

    let { plugin, close }: Props = $props();

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let advanced: boolean = $state(false);
    let sortable: Sortable | null = null;
    let mobileHomepageInitialized = false;

    let mobileHomepageWidgetContainer: HTMLElement | null = $state(null);

    async function initMobileHomepageLayout(): Promise<void> {
        await tick();

        const container = mobileHomepageWidgetContainer;
        if (!container) {
            console.warn("mobileHomepageWidgetContainer not available");
            return;
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
            ghostClass: "sortable-ghost",
            handle: ".drag-handle",
            onEnd: () => {
                saveLayout(plugin, mobileHomepageWidgetContainer);
            },
        });

        await restoreLayout(plugin, { value: container }, mobileHomepageWidgetContainer);
    }

    function cleanupSortableState() {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
        mobileHomepageInitialized = false;
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
            initMobileHomepageLayout();
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
</script>

<div class="mobile-homepage">
    {#if advanced}
        <div class="mobile-homepage-widget" bind:this={mobileHomepageWidgetContainer}></div>
        <div class="mobile-homepage-setting">
            <button
                class="mobile-homepage-add-widget-btn"
                onclick={() =>
                    addCustomBlock(plugin, currentBlockForSettingsRef, mobileHomepageWidgetContainer)}
                >➕添加组件</button
            >
            <button class="mobile-homepage-close-btn" onclick={() => close()}
                >返回</button
            >
        </div>
        <div class="mobile-homepage-fit"></div>
    {:else}
        <div class="mobile-homepage-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在"主页设置"→"会员服务"中开通高级会员后使用</h3>
        </div>
    {/if}
</div>
