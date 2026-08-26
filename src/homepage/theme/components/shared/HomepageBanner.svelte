<script lang="ts">
    import PremiumMark from "@/components/utils/shared/PremiumMark.svelte";
    import type { HomepageBannerModel } from "../../api/types";

    interface Props {
        banner: HomepageBannerModel;
        class?: string;
        imageClass?: string;
        resetClass?: string;
        style?: string;
        ariaLabel?: string;
        children?: import("svelte").Snippet;
    }

    let {
        banner,
        class: className = "",
        imageClass = "",
        resetClass = "",
        style = "",
        ariaLabel = "主页横幅",
        children,
    }: Props = $props();

    function bannerImageNode(node: HTMLImageElement) {
        banner.setImageElement(node);
        return { destroy: () => banner.setImageElement(undefined) };
    }
</script>

<section class={`hp-banner ${className}`.trim()} data-hp-context-region="banner" {style} aria-label={ariaLabel}>
    {#if banner.fallbackReason === "premium_required"}
        <div class="hp-banner__premium-fallback" role="status">
            <PremiumMark size={14} />
            <span>每日一图暂不可用</span>
        </div>
    {:else if banner.imageSrc}
        <img
            use:bannerImageNode
            src={banner.imageSrc}
            crossorigin="anonymous"
            alt=""
            class={`hp-banner__image ${imageClass}`.trim()}
            aria-hidden="true"
        />
    {/if}
    {#if banner.integrated && banner.glassEnabled && !banner.fallbackReason}
        <div
            class="hp-banner__glass"
            class:hp-banner__glass--custom={banner.glassColorMode === "custom"}
            style={`--homepage-banner-glass-color: ${banner.glassColor}; --homepage-banner-glass-opacity: ${banner.glassOpacity}%; --homepage-banner-glass-blur: ${banner.glassBlur}px;`}
            aria-hidden="true"
        ></div>
    {/if}
    {#if banner.imageSrc && !banner.fallbackReason}
        {@render children?.()}
    {/if}
    {#if banner.imageSrc && !banner.fallbackReason}
        <button
            class={`hp-banner__reset ${resetClass}`.trim()}
            type="button"
            title="恢复默认位置"
            aria-label="恢复横幅默认位置"
            onclick={() => void banner.resetPosition()}
        >↺</button>
    {/if}
</section>

<style>
    .hp-banner__premium-fallback {
        position: relative;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        height: 100%;
        min-height: 100%;
        box-sizing: border-box;
        background: color-mix(
            in srgb,
            var(--b3-theme-primary, #3578e5) 5%,
            var(--hp-surface, var(--b3-theme-background, #fff))
        );
        color: color-mix(
            in srgb,
            var(--b3-theme-on-surface, #6b7280) 72%,
            transparent
        );
        font-size: 13px;
        line-height: 1.4;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
    }

    .hp-banner.hp-banner--dragging .hp-banner__image {
        transition: none !important;
        cursor: grabbing !important;
    }

    .hp-banner__glass {
        position: absolute;
        inset: 0;
        z-index: 1;
        background: color-mix(
            in srgb,
            var(--hp-surface, var(--b3-theme-background, #fff))
                var(--homepage-banner-glass-opacity, 18%),
            transparent
        );
        backdrop-filter: blur(var(--homepage-banner-glass-blur, 12px)) saturate(135%);
        pointer-events: none;
    }

    .hp-banner__glass--custom {
        background: color-mix(
            in srgb,
            var(--homepage-banner-glass-color, #fff)
                var(--homepage-banner-glass-opacity, 18%),
            transparent
        );
    }
</style>
