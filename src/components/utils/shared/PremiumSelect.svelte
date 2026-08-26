<script lang="ts">
    import { onMount } from "svelte";
    import PremiumMark from "./PremiumMark.svelte";
    import SiyuanIcon from "./SiyuanIcon.svelte";

    export interface PremiumSelectOption {
        value: string;
        label: string;
        requiresAdvanced?: boolean;
        disabled?: boolean;
    }

    interface Props {
        value?: string;
        options: readonly PremiumSelectOption[];
        disabled?: boolean;
        ariaLabel: string;
        placeholder?: string;
        id?: string;
        className?: string;
        size?: "sm" | "md" | "lg";
        onValueChange?: (value: string) => void;
    }

    let {
        value = $bindable(""),
        options,
        disabled = false,
        ariaLabel,
        placeholder = "请选择",
        id,
        className = "",
        size = "md",
        onValueChange,
    }: Props = $props();

    const triggerId = $derived(id || `premium-select-${Math.random().toString(36).slice(2)}`);
    const listboxId = $derived(`${triggerId}-listbox`);
    let rootElement: HTMLDivElement | null = $state(null);
    let triggerElement: HTMLButtonElement | null = $state(null);
    let open = $state(false);
    let activeIndex = $state(-1);
    let selectedOption = $derived(options.find((option) => option.value === value));

    function firstEnabledIndex(): number {
        return options.findIndex((option) => !option.disabled);
    }

    function selectedIndex(): number {
        return options.findIndex((option) => option.value === value);
    }

    function openList(): void {
        if (disabled) return;
        open = true;
        activeIndex = selectedIndex();
        if (activeIndex < 0) activeIndex = firstEnabledIndex();
    }

    function closeList(focusTrigger = false): void {
        open = false;
        if (focusTrigger) triggerElement?.focus();
    }

    function moveActive(delta: number): void {
        if (options.length === 0) return;
        let index = activeIndex;
        for (let count = 0; count < options.length; count += 1) {
            index = (index + delta + options.length) % options.length;
            if (!options[index]?.disabled) {
                activeIndex = index;
                return;
            }
        }
    }

    function selectActive(): void {
        const option = options[activeIndex];
        if (!option || option.disabled) return;
        value = option.value;
        onValueChange?.(option.value);
        closeList(true);
    }

    function handleTriggerKeydown(event: KeyboardEvent): void {
        if (disabled) return;
        if (!open && (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openList();
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActive(1);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(-1);
            return;
        }
        if (event.key === "Home") {
            event.preventDefault();
            activeIndex = firstEnabledIndex();
            return;
        }
        if (event.key === "End") {
            event.preventDefault();
            for (let index = options.length - 1; index >= 0; index -= 1) {
                if (!options[index]?.disabled) {
                    activeIndex = index;
                    break;
                }
            }
            return;
        }
        if (event.key === "Enter" || (event.key === " " && open)) {
            event.preventDefault();
            if (open) selectActive();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeList(true);
            return;
        }
        if (event.key === "Tab") closeList();
    }

    function handleOptionClick(option: PremiumSelectOption): void {
        if (option.disabled) return;
        value = option.value;
        onValueChange?.(option.value);
        closeList(true);
    }

    onMount(() => {
        const handleDocumentPointerDown = (event: PointerEvent): void => {
            if (rootElement && event.target instanceof Node && !rootElement.contains(event.target)) {
                closeList();
            }
        };
        document.addEventListener("pointerdown", handleDocumentPointerDown);
        return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
    });
</script>

<div
    class={`premium-select premium-select--${size} ${className}`.trim()}
    bind:this={rootElement}
>
    <button
        id={triggerId}
        class="premium-select__trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        bind:this={triggerElement}
        onclick={() => open ? closeList() : openList()}
        onkeydown={handleTriggerKeydown}
    >
        <span class="premium-select__value">
            <span class:placeholder={!selectedOption}>{selectedOption?.label ?? placeholder}</span>
            {#if selectedOption?.requiresAdvanced}<PremiumMark />{/if}
        </span>
        <SiyuanIcon name="iconDown" size={12} />
    </button>

    {#if open}
        <div
            id={listboxId}
            class="premium-select__menu"
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={triggerId}
        >
            {#each options as option, index (option.value)}
                <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    class="premium-select__option"
                    class:active={activeIndex === index}
                    class:selected={value === option.value}
                    aria-selected={value === option.value}
                    aria-disabled={option.disabled === true}
                    disabled={option.disabled === true}
                    tabindex="-1"
                    onclick={() => handleOptionClick(option)}
                    onmouseenter={() => activeIndex = index}
                >
                    <span>{option.label}</span>
                    {#if option.requiresAdvanced}<PremiumMark />{/if}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .premium-select {
        position: relative;
        display: inline-block;
        min-width: 150px;
        color: var(--b3-theme-on-surface);
    }

    .premium-select--sm {
        min-width: 100px;
    }

    .premium-select--lg {
        min-width: 220px;
    }

    .premium-select__trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        width: 100%;
        min-height: 32px;
        padding: 0.35rem 0.65rem;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        color: inherit;
        background: var(--b3-theme-surface);
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .premium-select__trigger:hover,
    .premium-select__trigger:focus-visible {
        border-color: var(--b3-theme-primary);
        outline: none;
    }

    .premium-select__trigger:focus-visible {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
    }

    .premium-select__trigger:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .premium-select__value {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        gap: 0.35rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .premium-select__value .placeholder {
        color: var(--b3-theme-on-surface-light);
    }

    .premium-select__menu {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        width: 100%;
        max-height: min(320px, 50vh);
        overflow: auto;
        padding: 4px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        box-shadow: 0 8px 24px color-mix(in srgb, var(--b3-theme-on-surface) 16%, transparent);
    }

    .premium-select__option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        min-height: 30px;
        padding: 0.3rem 0.5rem;
        border: 0;
        border-radius: 4px;
        color: var(--b3-theme-on-surface);
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .premium-select__option.active,
    .premium-select__option:hover {
        background: var(--b3-list-hover);
    }

    .premium-select__option.selected {
        color: var(--b3-theme-primary);
    }

    .premium-select__option:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .premium-select__option:disabled:hover {
        background: transparent;
    }
</style>
