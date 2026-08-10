<script lang="ts">
    import type { HomepageSectionsModel } from "../../api/types";
    interface Props { sections: HomepageSectionsModel; vertical?: boolean; }
    let { sections, vertical = false }: Props = $props();
</script>

{#if sections.enabled && sections.items.length > 0}
    <div class="hp-sections" class:hp-sections--vertical={vertical} class:hp-sections--align-center={!vertical && sections.navAlign === "center"} class:hp-sections--align-right={!vertical && sections.navAlign === "right"} role="tablist" aria-label="组件分区导航" aria-orientation={vertical ? "vertical" : "horizontal"}>
        {#each sections.items as section (section.id)}
            <button type="button" class="hp-section" class:hp-section--active={section.active} role="tab" aria-selected={section.active} onclick={() => void sections.select(section.id)}>{section.name}</button>
        {/each}
    </div>
{/if}
