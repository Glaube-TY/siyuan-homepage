<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import { resolveClassicPresentationSettings } from "./presentationSettings";
    import "./classic.scss";
    import "./widgets/index.scss";

    let { identity, banner, status, actions, sections, regions, appearance, topLayout }: HomepageThemeProps = $props();
    let classic = $derived(resolveClassicPresentationSettings(appearance.settings));

</script>

<div
    class="hp-theme hp-theme--classic"
    class:hp-classic--banner-integrated={banner.enabled && banner.integrated}
    class:hp-classic--align-left={classic.titleAlign === "left"}
    class:hp-classic--align-center={classic.titleAlign === "center"}
    class:hp-classic--align-right={classic.titleAlign === "right"}
    class:hp-classic--buttons-flat={classic.quickButtonStyle === "flat"}
    class:hp-classic--buttons-glass={classic.quickButtonStyle === "glass"}
    class:hp-classic--banner-glass={banner.enabled && banner.integrated && classic.bannerGlassEnabled}
    class:hp-classic--banner-glass-custom={classic.bannerGlassColorMode === "custom"}
    style={`--homepage-banner-title-color: ${classic.bannerTitleColor}; --homepage-banner-status-color: ${classic.bannerStatusColor}; --homepage-banner-button-color: ${classic.bannerButtonColor}; --homepage-banner-glass-color: ${classic.bannerGlassColor}; --homepage-banner-glass-opacity: ${classic.bannerGlassOpacity}%; --homepage-banner-glass-blur: ${classic.bannerGlassBlur}px;`}
>
    <header class="hp-top-layout hp-classic-header" data-content-layout={topLayout.contentLayout} data-banner-position={topLayout.bannerPosition} data-primary-position={topLayout.primaryPosition} data-banner-content={topLayout.bannerContent} data-align={topLayout.align} data-hp-context-region="title">
        <div class="hp-top-primary">
            <HomepageIdentity {identity} />
            <HomepageStatus {status} />
        </div>
        <div class="hp-top-actions">
            <HomepageActions {actions} />
        </div>
        {#if banner.enabled}
            <HomepageBanner {banner} class={`hp-top-banner hp-classic-banner${banner.integrated ? " hp-classic-banner--integrated" : ""}`} imageClass="hp-classic-banner__image" resetClass="hp-classic-banner__reset" style={`--hp-classic-banner-height: ${banner.height}px;`}>
                <div class="hp-classic-banner__overlay" aria-hidden="true"></div>
                {#if banner.integrated && classic.bannerGlassEnabled}<div class="hp-classic-banner__glass" aria-hidden="true"></div>{/if}
            </HomepageBanner>
        {/if}
    </header>

    <HomepageSections {sections} />
    <HomepageThemeRegion name="workspace" {regions} class="hp-classic-workspace" />
    <HomepageThemeRegion name="footer" {regions} class="hp-classic-footer" contextRegion="footer" />
</div>
