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
    {@render children?.()}
    <button
        class={`hp-banner__reset ${resetClass}`.trim()}
        type="button"
        title="恢复默认位置"
        aria-label="恢复横幅默认位置"
        onclick={() => void banner.resetPosition()}
    >↺</button>
</section>
