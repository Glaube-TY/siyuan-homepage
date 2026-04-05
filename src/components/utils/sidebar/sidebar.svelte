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

    onMount(() => {
        advanced = !!plugin.ADVANCED;

        const handleAdvancedReady = () => {
            advanced = true;
        };

        const handleAdvancedUnavailable = () => {
            advanced = false;
        };

        window.addEventListener("homepage-advanced-ready", handleAdvancedReady);
        window.addEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);

        // 组件拖拽
        layoutObserver = new MutationObserver(async () => {
            const container = document.querySelector(
                ".sidebar-widget",
            ) as HTMLElement;
            if (container) {
                layoutObserver?.disconnect();

                sortable = new Sortable(container, {
                    animation: 150,
                    ghostClass: "sortable-ghost",
                    handle: ".drag-handle",
                    onEnd: () => {
                        saveLayout(plugin);
                    },
                });

                await restoreLayout(plugin, { value: container });
            }
        });

        layoutObserver.observe(document.body, { childList: true, subtree: true });

        return () => {
            window.removeEventListener("homepage-advanced-ready", handleAdvancedReady);
            window.removeEventListener("homepage-advanced-unavailable", handleAdvancedUnavailable);
            if (sortable) {
                sortable.destroy();
                sortable = null;
            }
            if (layoutObserver) {
                layoutObserver.disconnect();
                layoutObserver = null;
            }
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
                    addCustomBlock(plugin, currentBlockForSettingsRef)}
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
