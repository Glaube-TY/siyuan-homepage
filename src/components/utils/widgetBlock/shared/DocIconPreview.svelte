<script lang="ts">
    import { resolveConfiguredDocIcon } from "@/components/tools/docIcon";

    interface Props {
        value?: string;
        fallback?: string;
    }

    let { value, fallback = "📄" }: Props = $props();

    const icon = $derived(resolveConfiguredDocIcon(value, fallback));
</script>

<span class="doc-icon-preview">
    {#if icon.type === "image"}
        <img class="doc-icon-preview__image" src={icon.value} alt="" />
    {:else}
        <span class="doc-icon-preview__text">{icon.value}</span>
    {/if}
</span>

<style>
    .doc-icon-preview {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
    }

    .doc-icon-preview__image {
        width: 1.2em;
        height: 1.2em;
        object-fit: contain;
        vertical-align: middle;
    }

    .doc-icon-preview__text {
        vertical-align: middle;
    }
</style>
