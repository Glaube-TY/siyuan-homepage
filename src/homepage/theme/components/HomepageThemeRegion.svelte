<script lang="ts">
    import type {
        HomepagePersistentRegionName,
        HomepageThemeRegionFacade,
    } from "../api/types";

    interface Props {
        name: HomepagePersistentRegionName;
        regions: HomepageThemeRegionFacade;
        class?: string;
    }

    let { name, regions, class: className = "" }: Props = $props();

    function regionAnchor(node: HTMLElement, regionName: HomepagePersistentRegionName) {
        regions.attach(regionName, node);
        return {
            update(nextName: HomepagePersistentRegionName) {
                if (nextName === regionName) return;
                regions.detach(regionName, node);
                regionName = nextName;
                regions.attach(regionName, node);
            },
            destroy() {
                regions.detach(regionName, node);
            },
        };
    }
</script>

<div class={`hp-theme-region hp-theme-region--${name} ${className}`.trim()} use:regionAnchor={name}></div>
