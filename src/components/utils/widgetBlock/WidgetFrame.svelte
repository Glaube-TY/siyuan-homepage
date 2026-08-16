<script lang="ts">
    import type { Component } from "svelte";
    import type { WidgetFrameRegistration } from "@/homepage/theme/widgetPresentation/types";

    interface Props {
        component: Component<any>;
        componentProps: Record<string, any>;
        frame: Readonly<WidgetFrameRegistration>;
    }

    let { component: SelectedComponent, componentProps, frame }: Props = $props();
</script>

<div
    class="hp-widget-frame"
    data-widget-frame="true"
    data-widget-frame-title={frame.title}
    data-widget-frame-content={frame.content}
>
    <div
        class="hp-widget-frame__content"
        data-widget-frame-part="content"
        data-widget-part={frame.title === "none" ? "body" : undefined}
    >
        <SelectedComponent {...componentProps} />
    </div>
</div>

<style>
    .hp-widget-frame,
    .hp-widget-frame__content {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        overflow: hidden;
    }

    .hp-widget-frame__content {
        display: flex;
        flex-direction: column;
    }

    .hp-widget-frame__content > :global(*) {
        min-width: 0;
        min-height: 0;
        max-width: 100%;
        max-height: 100%;
    }

    .hp-widget-frame[data-widget-frame-title="optional"]
        .hp-widget-frame__content > :global([data-widget-part="root"]) {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .hp-widget-frame :global([data-widget-part="header"]) {
        flex: 0 0 auto;
        min-width: 0;
    }

    .hp-widget-frame[data-widget-frame-content="scrollable"]
        :global([data-widget-part="body"]) {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
    }

    .hp-widget-frame[data-widget-frame-title="none"][data-widget-frame-content="scrollable"]
        .hp-widget-frame__content {
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
    }
</style>
