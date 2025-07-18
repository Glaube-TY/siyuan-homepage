<script lang="ts">
    import { onMount } from "svelte";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./widget_layout";
    import { addCustomBlock } from "./block-creator";
    
    import "./siderBar.scss"

    export let plugin: any;
    export let app: any;

    let currentBlockForSettings: HTMLElement | null = null;
    const currentBlockForSettingsRef = { value: currentBlockForSettings };

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
    });
</script>

<div class="sidebar-display">
    <div class="sidebar-widget"></div>
    <div class="sidebar-setting">
        <button
            class="add-widget-btn"
            on:click={() => addCustomBlock(plugin, currentBlockForSettingsRef)}
            >➕添加组件</button
        >
    </div>
</div>
