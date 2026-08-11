<script lang="ts">
    import { floatingPopoverAction } from "@/components/utils/shared/floating-popover-action";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import type { HomepageActionsModel } from "../../api/types";
    interface Props {
        actions: HomepageActionsModel;
        compact?: boolean;
        exclude?: readonly string[];
    }
    let { actions, compact = false, exclude = [] }: Props = $props();
    let overflowOpen = $state(false);
    let overflowButton: HTMLButtonElement | undefined = $state();
    let overflowMenu: HTMLDivElement | undefined = $state();
    let excluded = $derived(new Set(exclude));
    let visibleItems = $derived(actions.items.filter((item) => !excluded.has(item.id) && !excluded.has(item.action)));
    let primary = $derived(visibleItems.filter((item) => item.placement === "primary"));
    let overflow = $derived(visibleItems.filter((item) => item.placement === "overflow"));

    function closeOverflow(focusTrigger = false): void {
        overflowOpen = false;
        if (focusTrigger) overflowButton?.focus();
    }

    function handleWindowPointerDown(event: PointerEvent): void {
        if (!overflowOpen || !(event.target instanceof Node)) return;
        if (overflowButton?.contains(event.target) || overflowMenu?.contains(event.target)) return;
        closeOverflow();
    }

    function handleWindowKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape" && overflowOpen) closeOverflow(true);
    }

    async function invokeOverflowAction(id: string): Promise<void> {
        try {
            await actions.invoke(id);
        } finally {
            closeOverflow();
        }
    }

    $effect(() => {
        if (overflow.length === 0) overflowOpen = false;
    });
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeydown} />

<div class="hp-actions" data-hp-context-region="actions" class:hp-actions--compact={compact} role="navigation" aria-label="主页功能">
    <div class="hp-actions__primary">
        {#each primary as item (item.id)}
            <button class="hp-action" type="button" data-hp-action={item.action} title={item.shortcut ? `${item.label} · ${item.shortcut}` : item.label} onclick={() => void actions.invoke(item.id)}>
                {#if item.iconName}<span class="hp-action__icon" aria-hidden="true"><SiyuanIcon name={item.iconName} size={14} /></span>{/if}
                {#if !compact}<span class="hp-action__label">{item.label}</span>{/if}
            </button>
        {/each}
    </div>
    {#if overflow.length > 0}
        <div class="hp-actions__overflow">
            <button class="hp-action hp-action--more" type="button" bind:this={overflowButton} aria-haspopup="menu" aria-expanded={overflowOpen} onclick={() => (overflowOpen = !overflowOpen)}>
                <span class="hp-action__icon" aria-hidden="true"><SiyuanIcon name="more" size={14} /></span>
                {#if !compact}<span class="hp-action__label">更多</span>{/if}
            </button>
            {#if overflowOpen}
                <div
                    class="hp-actions__menu"
                    bind:this={overflowMenu}
                    role="menu"
                    use:floatingPopoverAction={{ referenceEl: overflowButton, placement: "bottom-start", offset: 8, shiftPadding: 8, open: overflowOpen }}
                >
                    {#each overflow as item (item.id)}
                        <button class="hp-actions__menu-item" type="button" role="menuitem" data-hp-action={item.action} onclick={() => void invokeOverflowAction(item.id)}>
                            {#if item.iconName}<span class="hp-action__icon" aria-hidden="true"><SiyuanIcon name={item.iconName} size={14} /></span>{/if}
                            <span class="hp-action__label">{item.label}</span>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
