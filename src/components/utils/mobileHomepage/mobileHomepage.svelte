<script lang="ts">
    import { onMount } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./mobileHomepage_layout";
    import { addCustomBlock } from "./block-creator";

    import "./mobileHomepage.scss";

    export let plugin: any;
    export let close: () => void;

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

    let advanced: boolean;

    onMount(() => {
        // 组件拖拽
        const observer = new MutationObserver(async () => {
            const container = document.querySelector(
                ".mobile-homepage-widget",
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
        }, 100);
    });
</script>

<div class="mobile-homepage">
    {#if advanced}
        <div class="mobile-homepage-widget"></div>
        <div class="mobile-homepage-setting">
            <button
                class="mobile-homepage-add-widget-btn"
                on:click={() =>
                    addCustomBlock(plugin, currentBlockForSettingsRef)}
                >➕添加组件</button
            >
            <button class="mobile-homepage-close-btn" on:click={() => close()}
                >返回</button
            >
        </div>
        <div class="mobile-homepage-fit"></div>
    {:else}
        <div class="mobile-homepage-not-advanced">
            <h2>👑高级会员专属功能👑</h2>
            <h3>请在“主页设置”→“会员服务”中开通高级会员后使用</h3>
        </div>
    {/if}
</div>