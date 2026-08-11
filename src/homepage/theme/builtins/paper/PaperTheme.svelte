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
        <header class="hp-paper-header">
            <div class="hp-paper-heading">
                <HomepageIdentity {identity} />
                <HomepageStatus {status} />
            </div>
            <HomepageActions {actions} />
        </header>

        {#if banner.enabled}
            <div class="hp-paper-banner-frame">
                <HomepageBanner
                    {banner}
                    class="hp-paper-banner"
                    imageClass="hp-paper-banner__image"
                    resetClass="hp-paper-banner__reset"
                    style={`--hp-paper-banner-height: ${banner.height}px;`}
                />
            </div>
        {/if}

        <HomepageSections {sections} />

        <main class="hp-paper-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-paper-workspace" />
        </main>

        <HomepageThemeRegion name="footer" {regions} class="hp-paper-footer" />
    </div>
</div>
