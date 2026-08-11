<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./hand-drawn.scss";
    import "./widgets/index.scss";

    let { identity, banner, status, actions, sections, regions }: HomepageThemeProps = $props();
</script>

<div class="hp-theme hp-theme--hand-drawn">
    <div class="hp-sketch-shell" class:hp-sketch-shell--without-banner={!banner.enabled}>
        <header class="hp-sketch-header" data-hp-context-region="title">
            <div class="hp-sketch-heading">
                <HomepageIdentity {identity} />
                <HomepageStatus {status} />
            </div>
            <HomepageActions {actions} />
        </header>

        {#if banner.enabled}
            <div class="hp-sketch-banner-stage" data-hp-context-region="banner">
                <HomepageBanner
                    {banner}
                    class="hp-sketch-banner"
                    imageClass="hp-sketch-banner__image"
                    resetClass="hp-sketch-banner__reset"
                    style={`--hp-sketch-banner-height: ${banner.height}px;`}
                />
                <span class="hp-sketch-banner-mark" aria-hidden="true">
                    <svg viewBox="0 0 90 54" focusable="false">
                        <path d="M7 38C17 22 32 14 51 14M43 7l10 7-7 11M15 44c12 3 25 2 37-2" />
                    </svg>
                </span>
            </div>
        {/if}

        <HomepageSections {sections} />

        <main class="hp-sketch-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-sketch-workspace" />
        </main>

        <HomepageThemeRegion name="footer" {regions} class="hp-sketch-footer" contextRegion="footer" />
    </div>
</div>
