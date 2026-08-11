<script lang="ts">
    import type { HomepageThemeProps } from "../../api/types";
    import HomepageThemeRegion from "../../components/HomepageThemeRegion.svelte";
    import HomepageActions from "../../components/shared/HomepageActions.svelte";
    import HomepageIdentity from "../../components/shared/HomepageIdentity.svelte";
    import HomepageSections from "../../components/shared/HomepageSections.svelte";
    import HomepageStatus from "../../components/shared/HomepageStatus.svelte";
    import "./simple-test.scss";
    import "./widgets/index.scss";

    let { identity, status, actions, sections, regions }: HomepageThemeProps = $props();

</script>

<div class="hp-theme hp-theme--simple-test">
    <div class="hp-simple-shell">
        <header class="hp-simple-header" data-hp-context-region="title">
            <div class="hp-simple-heading">
                <div class="hp-simple-brand">
                    <HomepageIdentity {identity} />
                </div>
                <HomepageStatus {status} />
            </div>
            <HomepageActions {actions} />
        </header>

        <HomepageSections {sections} />

        <main class="hp-simple-content">
            <HomepageThemeRegion name="workspace" {regions} class="hp-simple-workspace" />
        </main>
        <HomepageThemeRegion name="footer" {regions} class="hp-simple-footer" contextRegion="footer" />
    </div>
</div>
