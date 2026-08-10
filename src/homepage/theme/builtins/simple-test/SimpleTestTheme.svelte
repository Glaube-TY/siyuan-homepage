<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageBanner from "../../components/shared/HomepageBanner.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./simple-test.scss";

    let { identity, banner, status, actions, sections, regions }: HomepageThemeProps = $props();

</script>

<div class="hp-theme hp-theme--simple-test">
    <div class="hp-simple-shell">
        <header class="hp-simple-header">
            <div class="hp-simple-heading">
                <div class="hp-simple-brand">
                    <HomepageIdentity {identity} />
                </div>
                <HomepageStatus {status} />
            </div>
            <HomepageActions {actions} />
        </header>

        {#if banner.enabled}
            <HomepageBanner
                {banner}
                class="hp-simple-banner"
                imageClass="hp-simple-banner__image"
                resetClass="hp-simple-banner__reset"
                style={`--hp-simple-banner-height: ${banner.height}px;`}
            />
        {/if}

        <HomepageSections {sections} />

        <main class="hp-simple-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-simple-workspace" />
        </main>
        <HomepageThemeRegion name="footer" {regions} class="hp-simple-footer" />
    </div>
</div>
