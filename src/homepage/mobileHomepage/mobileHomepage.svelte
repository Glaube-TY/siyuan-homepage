<script lang="ts">
    import { onMount, tick } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./mobileHomepage_layout";
    import { addCustomBlock } from "./block-creator";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AdvancedFeatureLock from "../../components/utils/widgetBlock/widget/common/AdvancedFeatureLock.svelte";
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
                >
                    <SiyuanIcon name="create" size={14} />
                    <span>添加组件</span>
                </button
            >
            <button class="mobile-homepage-close-btn" onclick={() => close()}
                ><SiyuanIcon name="previous" size={14} /><span>返回</span></button
            >
        </div>
        <div class="mobile-homepage-fit"></div>
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
