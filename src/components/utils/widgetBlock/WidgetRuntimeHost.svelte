<script lang="ts">
    import { onMount, type Component } from "svelte";
    import {
        getHomepageEntitlementSnapshot,
        subscribeHomepageEntitlement,
    } from "@/features/entitlement/homepage-entitlement";
    import type { WidgetFrameRegistration } from "@/homepage/theme/widgetPresentation/types";
    import WidgetFrame from "./WidgetFrame.svelte";

    interface Props {
        component: Component<any>;
        componentProps: Record<string, any>;
        frame: Readonly<WidgetFrameRegistration>;
    }

    let { component: SelectedComponent, componentProps, frame }: Props = $props();
    let advanced = $state(getHomepageEntitlementSnapshot().advanced);

    onMount(() => subscribeHomepageEntitlement((snapshot) => {
        advanced = snapshot.advanced;
    }));
</script>

{#key advanced}
    <WidgetFrame component={SelectedComponent} {componentProps} {frame} />
{/key}
