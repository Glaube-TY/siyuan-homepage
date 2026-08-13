<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./card.scss";
    import "./widgets/index.scss";

    let { identity, banner, status, actions, sections, regions, topLayout }: HomepageThemeProps = $props();
</script>

<div class="hp-theme hp-theme--card">
    <div class="hp-card-shell" class:hp-card-shell--without-banner={!banner.enabled}>
        <header class="hp-top-layout hp-card-header" data-content-layout={topLayout.contentLayout} data-banner-position={topLayout.bannerPosition} data-primary-position={topLayout.primaryPosition} data-banner-content={topLayout.bannerContent} data-align={topLayout.align} data-hp-context-region="title">
            <div class="hp-top-primary hp-card-intro">
                <div class="hp-card-identity-panel">
                    <HomepageIdentity {identity} />
                </div>
                <div class="hp-card-status-panel">
                    <HomepageStatus {status} />
                </div>
            </div>
            <div class="hp-top-actions hp-card-actions-panel">
                <HomepageActions {actions} />
            </div>
            {#if banner.enabled}
            <div class="hp-top-banner hp-card-banner-panel" data-hp-context-region="banner">
                <HomepageBanner
                    {banner}
                    class="hp-card-banner"
                    imageClass="hp-card-banner__image"
                    resetClass="hp-card-banner__reset"
                    style={`--hp-card-banner-height: ${banner.height}px;`}
                />
            </div>
            {/if}
        </header>

        <div class="hp-card-sections-panel">
            <HomepageSections {sections} />
        </div>

        <main class="hp-card-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-card-workspace" />
        </main>

        <HomepageThemeRegion name="footer" {regions} class="hp-card-footer" contextRegion="footer" />
    </div>
</div>
