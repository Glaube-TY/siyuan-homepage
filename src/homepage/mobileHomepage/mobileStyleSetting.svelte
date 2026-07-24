<script lang="ts">
    import MobileWidgetStyleSheet from "./MobileWidgetStyleSheet.svelte";
    import { saveLayout } from "./mobileHomepage_layout";

    interface Props {
        plugin: any;
        onClose: () => void;
        onDelete: () => void;
        blockElement: HTMLElement | null;
    }

    let {
        plugin,
        onClose,
        onDelete,
        blockElement,
    }: Props = $props();
</script>

{#if blockElement}
    <MobileWidgetStyleSheet
        {blockElement}
        widgetType={blockElement.dataset.widgetType || ""}
        {onClose}
        {onDelete}
        onStyleChanged={() => {
            const container = blockElement.closest(".mobile-homepage-widget") as HTMLElement | null;
            saveLayout(plugin, container);
        }}
    />
{:else}
    <div class="mobile-widget-style-missing">
        <p>未找到当前组件。</p>
        <button type="button" onclick={onClose}>关闭</button>
    </div>
{/if}
