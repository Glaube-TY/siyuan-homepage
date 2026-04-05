<script lang="ts">
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();
</script>

<div class="item__readme b3-typography">
    {@render children?.()}
</div>