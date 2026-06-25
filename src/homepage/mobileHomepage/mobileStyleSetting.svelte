<script lang="ts">
    import MobileWidgetStyleSheet from "./MobileWidgetStyleSheet.svelte";
    import { saveLayout } from "./mobileHomepage_layout";

    interface Props {
        plugin: any;
        onClose: () => void;
        onDelete: () => void;
        currentBlockId?: string;
    }

    let {
        plugin,
        onClose,
        onDelete,
        currentBlockId = "",
    }: Props = $props();

    const blockElement = $derived(document.getElementById(currentBlockId) as HTMLElement | null);
</script>

{#if blockElement}
    <MobileWidgetStyleSheet
        {blockElement}
        widgetType={blockElement.dataset.widgetType || ""}
        {onClose}
        {onDelete}
        onStyleChanged={() => saveLayout(plugin)}
    />
{:else}
    <div class="mobile-widget-style-missing">
        <p>未找到当前组件。</p>
        <button type="button" onclick={onClose}>关闭</button>
    </div>
{/if}
