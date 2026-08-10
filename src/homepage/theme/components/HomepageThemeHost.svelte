<script lang="ts">
    import type { HomepageThemeDefinition, HomepageThemeProps } from "../api/types";

    interface Props {
        definition: HomepageThemeDefinition;
        themeProps: HomepageThemeProps;
        onRendererError: (error: unknown) => void;
    }

    let { definition, themeProps, onRendererError }: Props = $props();
</script>

{#key definition.id}
    {@const Renderer = definition.renderer}
    <svelte:boundary onerror={onRendererError}>
        <Renderer {...themeProps} />
    </svelte:boundary>
{/key}
