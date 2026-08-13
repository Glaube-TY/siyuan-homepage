<script lang="ts">
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
    <img
        use:bannerImageNode
        src={banner.imageSrc}
        crossorigin="anonymous"
        alt=""
        class={`hp-banner__image ${imageClass}`.trim()}
        aria-hidden="true"
    />
    {#if banner.integrated && banner.glassEnabled}
        <div
            class="hp-banner__glass"
            class:hp-banner__glass--custom={banner.glassColorMode === "custom"}
            style={`--homepage-banner-glass-color: ${banner.glassColor}; --homepage-banner-glass-opacity: ${banner.glassOpacity}%; --homepage-banner-glass-blur: ${banner.glassBlur}px;`}
            aria-hidden="true"
        ></div>
    {/if}
    {@render children?.()}
    <button
        class={`hp-banner__reset ${resetClass}`.trim()}
        type="button"
        title="恢复默认位置"
        aria-label="恢复横幅默认位置"
        onclick={() => void banner.resetPosition()}
    >↺</button>
</section>

<style>
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
