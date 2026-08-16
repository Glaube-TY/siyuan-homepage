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
    data-widget-scroll-owner={frame.content === "scrollable" ? "body" : "none"}
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
        overflow-y: auto !important;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
    }

    .hp-widget-frame[data-widget-frame-title="none"][data-widget-frame-content="scrollable"]
        .hp-widget-frame__content {
        overflow-x: hidden;
        overflow-y: auto !important;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
    }

    /* The body is the only vertical scroll owner. Legacy lists must grow with
       their content instead of creating a second Windows scrollbar. */
    .hp-widget-frame[data-widget-frame-content="scrollable"]
        :global([data-widget-part="body"] [data-widget-part="list"]) {
        height: auto !important;
        max-height: none !important;
        overflow-y: visible !important;
    }

    .hp-widget-frame[data-widget-frame-content="scrollable"]
        :global([data-widget-part="body"] > [data-widget-part="list"]) {
        flex: 0 0 auto !important;
    }

    /* Firefox uses the standardized compact scrollbar. Chromium/Electron is
       intentionally excluded because any scrollbar-width declaration makes
       it fall back to the Windows scrollbar with arrow buttons. */
    @supports not selector(::-webkit-scrollbar) {
        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]) {
            scrollbar-width: thin;
        }
    }

    @supports selector(::-webkit-scrollbar) {
        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar) {
            width: 3px;
            height: 3px;
            background: transparent;
        }

        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar-button) {
            display: none;
            width: 0;
            height: 0;
            -webkit-appearance: none;
        }

        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar-track),
        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar-corner) {
            background: transparent;
        }

        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar-thumb) {
            border-radius: 999px;
            background: color-mix(in srgb, var(--b3-theme-on-surface) 12%, transparent);
        }

        .hp-widget-frame[data-widget-frame-content="scrollable"]
            :global([data-widget-part="body"]::-webkit-scrollbar-thumb:hover) {
            background: color-mix(in srgb, var(--b3-theme-on-surface) 32%, transparent);
        }
    }
</style>
