<script lang="ts">
    import { onMount } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./widget_layout";
    import { addCustomBlock } from "./block-creator";

    import "./siderBar.scss";

    export let plugin: any;
    export let app: any;

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let advanced: boolean;

    onMount(() => {
        // 组件拖拽
        const observer = new MutationObserver(async () => {
            const container = document.querySelector(
                ".sidebar-widget",
            ) as HTMLElement;
            if (container) {
                observer.disconnect();

                new Sortable(container, {
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

        observer.observe(document.body, { childList: true, subtree: true });

        setInterval(() => {
            advanced = plugin.ADVANCED;
        }, 1000);
    });
</script>

<div class="sidebar-display">
    {#if advanced}
        <div class="sidebar-widget"></div>
        <div class="sidebar-setting">
            <button
                class="add-widget-btn"
                on:click={() =>
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
