<script lang="ts">
    import { onMount, type Component } from "svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import type { WidgetFrameRegistration } from "@/homepage/theme/widgetPresentation/types";
    import WidgetFrame from "./WidgetFrame.svelte";
    import WidgetPremiumRuntimeGate from "./WidgetPremiumRuntimeGate.svelte";

    interface Props {
        component: Component<any>;
        componentProps: Record<string, any>;
        frame: Readonly<WidgetFrameRegistration>;
        premiumRequired: boolean;
        premiumTitle: string;
    }

    let {
        component: SelectedComponent,
        componentProps,
        frame,
        premiumRequired,
        premiumTitle,
    }: Props = $props();
    let advanced = $state(getHomepageEntitlementSnapshot().advanced);

    onMount(() => subscribeHomepageEntitlement((snapshot) => {
        advanced = snapshot.advanced;
    }));
</script>

{#if premiumRequired && !advanced}
    <WidgetPremiumRuntimeGate {premiumTitle} />
{:else}
    <WidgetFrame component={SelectedComponent} {componentProps} {frame} />
{/if}
