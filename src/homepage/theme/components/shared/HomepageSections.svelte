<script lang="ts">
    import type { HomepageSectionsModel } from "../../api/types";
    interface Props { sections: HomepageSectionsModel; vertical?: boolean; }
    let { sections, vertical = false }: Props = $props();
    let navigationElement = $state<HTMLDivElement | undefined>(undefined);
    const sectionButtons = new Map<string, HTMLButtonElement>();

    function registerSectionButton(node: HTMLButtonElement, sectionId: string) {
        sectionButtons.set(sectionId, node);
        return {
            destroy() {
                if (sectionButtons.get(sectionId) === node) sectionButtons.delete(sectionId);
            },
        };
    }

    $effect(() => {
        const activeSectionId = sections.items.find((section) => section.active)?.id;
        if (!activeSectionId || !navigationElement) return;
        const frameId = requestAnimationFrame(() => {
            const button = sectionButtons.get(activeSectionId);
            if (!button || !navigationElement) return;
            const navigationRect = navigationElement.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            let nextScrollLeft = navigationElement.scrollLeft;
            if (buttonRect.left < navigationRect.left) {
                nextScrollLeft -= navigationRect.left - buttonRect.left;
            } else if (buttonRect.right > navigationRect.right) {
                nextScrollLeft += buttonRect.right - navigationRect.right;
            } else {
                return;
            }
            navigationElement.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: "auto" });
        });
        return () => cancelAnimationFrame(frameId);
    });
</script>

{#if sections.enabled && sections.items.length > 0}
    <div bind:this={navigationElement} class="hp-sections" class:hp-sections--vertical={vertical} class:hp-sections--align-center={!vertical && sections.navAlign === "center"} class:hp-sections--align-right={!vertical && sections.navAlign === "right"} role="tablist" aria-label="组件分区导航" aria-orientation={vertical ? "vertical" : "horizontal"}>
        {#each sections.items as section (section.id)}
            <button use:registerSectionButton={section.id} type="button" class="hp-section" class:hp-section--active={section.active} role="tab" aria-selected={section.active} onclick={() => void sections.select(section.id)}>{section.name}</button>
        {/each}
    </div>
{/if}
