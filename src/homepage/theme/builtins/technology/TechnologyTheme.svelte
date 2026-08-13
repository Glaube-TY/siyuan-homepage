<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./technology.scss";
    import "./widgets/index.scss";

    let { identity, banner, status, actions, sections, regions, topLayout }: HomepageThemeProps = $props();
</script>

<div class="hp-theme hp-theme--technology">
    <div class="hp-tech-shell">
        <header class="hp-top-layout hp-tech-header" data-content-layout={topLayout.contentLayout} data-banner-position={topLayout.bannerPosition} data-primary-position={topLayout.primaryPosition} data-banner-content={topLayout.bannerContent} data-align={topLayout.align} data-hp-context-region="title">
            <div class="hp-top-primary"><div class="hp-tech-identity"><HomepageIdentity {identity} /></div><div class="hp-tech-status"><HomepageStatus {status} /></div></div>
            <div class="hp-top-actions hp-tech-actions"><HomepageActions {actions} /></div>
            {#if banner.enabled}
            <div class="hp-top-banner hp-tech-banner-panel" data-hp-context-region="banner">
                <HomepageBanner
                    {banner}
                    class="hp-tech-banner"
                    imageClass="hp-tech-banner__image"
                    resetClass="hp-tech-banner__reset"
                    style={`--hp-tech-banner-height: ${banner.height}px;`}
                />
            </div>
            {/if}
        </header>

        <div class="hp-tech-sections"><HomepageSections {sections} /></div>
        <main class="hp-tech-content"><HomepageThemeRegion name="workspace" {regions} class="hp-tech-workspace" /></main>
        <HomepageThemeRegion name="footer" {regions} class="hp-tech-footer" contextRegion="footer" />
    </div>
</div>
