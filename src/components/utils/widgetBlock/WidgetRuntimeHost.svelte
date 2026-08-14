<script lang="ts">
    import { onMount, type Component } from "svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";

    interface Props {
        component: Component<any>;
        componentProps: Record<string, any>;
    }

    let { component: SelectedComponent, componentProps }: Props = $props();
    let advanced = $state(getHomepageEntitlementSnapshot().advanced);

    onMount(() => subscribeHomepageEntitlement((snapshot) => {
        advanced = snapshot.advanced;
    }));
</script>

{#key advanced}
    <SelectedComponent {...componentProps} />
{/key}
