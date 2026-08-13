<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./simple-test.scss";
    import "./widgets/index.scss";

    let { identity, status, actions, sections, regions, topLayout }: HomepageThemeProps = $props();

</script>

<div class="hp-theme hp-theme--simple-test">
    <div class="hp-simple-shell">
        <header class="hp-top-layout hp-simple-header" data-content-layout={topLayout.contentLayout} data-banner-position={topLayout.bannerPosition} data-primary-position={topLayout.primaryPosition} data-banner-content="none" data-align={topLayout.align} data-hp-context-region="title">
            <div class="hp-top-primary hp-simple-heading">
                <div class="hp-simple-brand">
                    <HomepageIdentity {identity} />
                </div>
                <HomepageStatus {status} />
            </div>
            <div class="hp-top-actions"><HomepageActions {actions} /></div>
        </header>

        <HomepageSections {sections} />

        <main class="hp-simple-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-simple-workspace" />
        </main>
        <HomepageThemeRegion name="footer" {regions} class="hp-simple-footer" contextRegion="footer" />
    </div>
</div>
