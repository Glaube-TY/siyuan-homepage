<script lang="ts">
    import { onMount } from "svelte";
    import { WidgetBlock } from "@/components/utils/widgetBlock/WidgetBlock";
    import Sortable from "sortablejs";
    import { saveLayout, restoreLayout } from "./widget_layout";

    export let plugin: any;
    export let app: any;

    let currentBlockForSettingsRef = { value: null };

    function addCustomBlock() {
        const container = document.querySelector(".sidebar-widget");
        const widget = new WidgetBlock(plugin, currentBlockForSettingsRef);
        widget.appendTo(container);
        saveLayout(plugin);
    }

    onMount(() => {
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
        <button class="add-widget-btn" on:click={() => addCustomBlock()}
            >➕添加组件</button
        >
    </div>
</div>

<style lang="scss">
    .sidebar-display {
        padding: 10px;
        display: flex;
        flex-direction: column;

        .sidebar-widget {
            display: grid;
            grid-template-columns: repeat(1, 1fr);
            gap: 10px;
        }

        .sidebar-setting {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 10px;
            gap: 10px;
            opacity: 0;
            transition: all 0.3s;

            &:hover {
                opacity: 1;
            }

            button {
                padding: 10px;
                background-color: transparent;
                border: 1px solid var(--b3-border-color);
                border-radius: 5px;

                &:hover {
                    background-color: var(--b3-theme-primary);
                    color: white;
                }
            }
        }
    }
</style>
