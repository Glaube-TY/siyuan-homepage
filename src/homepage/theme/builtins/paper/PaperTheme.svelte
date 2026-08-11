<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./paper.scss";
    import "./widgets/index.scss";

    let { identity, banner, status, actions, sections, regions }: HomepageThemeProps = $props();
</script>

<div class="hp-theme hp-theme--paper">
    <div class="hp-paper-sheet" class:hp-paper-sheet--without-banner={!banner.enabled}>
        <header class="hp-paper-header" data-hp-context-region="title">
            <div class="hp-paper-heading">
                <HomepageIdentity {identity} />
                <HomepageStatus {status} />
            </div>
            <HomepageActions {actions} />
        </header>

        {#if banner.enabled}
            <div class="hp-paper-banner-stage" data-hp-context-region="banner">
                <span class="hp-paper-banner-clip hp-paper-banner-clip--back" aria-hidden="true">
                    <svg viewBox="0 0 44 84" focusable="false">
                        <path class="hp-paper-banner-clip__inner" d="M15.2 20C16.7 14.7 22.3 11.6 27.6 13.1C32.9 14.7 36 20.2 34.5 25.5L24.7 59.4C23.9 62.3 20.8 64 17.9 63.2C15 62.3 13.3 59.3 14.2 56.3L23.2 25" />
                    </svg>
                </span>
                <div class="hp-paper-banner-frame">
                    <HomepageBanner
                        {banner}
                        class="hp-paper-banner"
                        imageClass="hp-paper-banner__image"
                        resetClass="hp-paper-banner__reset"
                        style={`--hp-paper-banner-height: ${banner.height}px;`}
                    />
                </div>
                <span class="hp-paper-banner-clip hp-paper-banner-clip--front" aria-hidden="true">
                    <svg viewBox="0 0 44 84" focusable="false">
                        <path class="hp-paper-banner-clip__outer" d="M29.4 7.2C37.3 9.4 41.8 17.6 39.5 25.5L28.6 63.3C26.7 69.9 19.8 73.7 13.2 71.8C6.6 69.9 2.8 63 4.7 56.4L15.2 20" />
                    </svg>
                </span>
            </div>
        {/if}

        <HomepageSections {sections} />

        <main class="hp-paper-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-paper-workspace" />
        </main>

        <HomepageThemeRegion name="footer" {regions} class="hp-paper-footer" contextRegion="footer" />
    </div>
</div>
