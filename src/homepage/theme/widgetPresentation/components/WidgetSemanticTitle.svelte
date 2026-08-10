<script lang="ts">
    import { onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import { subscribeWidgetPresentation } from "../runtime";
    import { classifyWidgetTitle } from "../titleCompatibility";

    interface Props {
        widgetType: string;
        configuredTitle: string;
        semanticLabel: string;
        fallbackIcon: string;
    }

    let { widgetType, configuredTitle, semanticLabel, fallbackIcon }: Props = $props();
    let element: HTMLElement;
    let resolvedIcon = $state("");
    const iconName = $derived(resolvedIcon || fallbackIcon);
    const titleSource = $derived(classifyWidgetTitle(widgetType, configuredTitle));

    onMount(() => subscribeWidgetPresentation(element, (context) => {
        resolvedIcon = context.resolvedIcon || "";
    }));
</script>

<h3
    bind:this={element}
    class="widget-title hp-widget-title"
    data-widget-part="header"
    data-widget-title-source={titleSource}
    title={configuredTitle}
>
    <span class="hp-widget-title__icon" data-widget-part="icon" aria-hidden="true">
        <SiyuanIcon name={iconName} size={16} />
    </span>
    <span class="hp-widget-title__legacy" data-widget-part="title">{configuredTitle}</span>
    <span class="hp-widget-title__semantic" data-widget-part="title">{semanticLabel}</span>
</h3>

<style>
    .hp-widget-title__icon,
    .hp-widget-title__semantic {
        display: none;
    }

    .hp-widget-title__legacy {
        display: inline;
    }
</style>
