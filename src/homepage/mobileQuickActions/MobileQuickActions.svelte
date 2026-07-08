<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
    import AccountingIcon from "@/components/utils/widgetBlock/widget/accounting/AccountingIcon.svelte";
    import {
        DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP,
        DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        DEFAULT_MOBILE_QUICK_ACTION_TOP_GAP,
        normalizeMobileQuickActionButtonSize,
        normalizeMobileQuickActionsPosition,
        type MobileQuickActionsPosition,
    } from "./mobileQuickActionsConfig";

    export interface MobileQuickAction {
        id: string;
        label: string;
        description?: string;
        icon?: string;
        run: () => void | Promise<void>;
        disabled?: boolean;
    }

    interface Props {
        actions: MobileQuickAction[];
        buttonSize: number;
        mainIcon?: string;
        position?: MobileQuickActionsPosition;
        onPositionChange?: (position: MobileQuickActionsPosition, options?: { immediate?: boolean }) => void | Promise<void>;
    }

    let {
        actions,
        buttonSize = DEFAULT_MOBILE_QUICK_ACTION_BUTTON_SIZE,
        mainIcon = "iconhomepage",
        position,
        onPositionChange,
    }: Props = $props();

    let expanded = $state(false);
    let busyActionId = $state<string | null>(null);
    let rootEl: HTMLDivElement | null = null;
    let currentPosition = $state<MobileQuickActionsPosition>({ side: "right", y: 0 });
    let dragging = $state(false);
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetY = 0;
    let dragActivated = false;
    let longPressTimer: number | null = null;
    const normalizedButtonSize = $derived(normalizeMobileQuickActionButtonSize(buttonSize));
    const mainIconSize = $derived(Math.round(normalizedButtonSize * 0.42));
    const opensDownward = $derived(currentPosition.y < Math.max(0, window.innerHeight / 2));
    const positionStyle = $derived(
        `--shp-mobile-quick-action-size: ${normalizedButtonSize}px; --shp-mobile-quick-action-y: ${currentPosition.y}px;`
    );

    function closeActions(): void {
        expanded = false;
    }

    function toggleActions(): void {
        if (dragging) return;
        expanded = !expanded;
    }

    function readViewportHeight(): number {
        return Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
    }

    function normalizePositionForViewport(value: unknown): MobileQuickActionsPosition {
        return normalizeMobileQuickActionsPosition(value, {
            viewportHeight: readViewportHeight(),
            buttonSize: normalizedButtonSize,
            topGap: DEFAULT_MOBILE_QUICK_ACTION_TOP_GAP,
            bottomGap: DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP,
        });
    }

    function syncPositionFromProps(): void {
        currentPosition = normalizePositionForViewport(position);
    }

    function clearLongPressTimer(): void {
        if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function emitPositionChange(nextPosition: MobileQuickActionsPosition, immediate = false): void {
        void onPositionChange?.(nextPosition, { immediate });
    }

    function updateDragPosition(clientX: number, clientY: number, immediate = false): void {
        const viewportHeight = readViewportHeight();
        const side = clientX < window.innerWidth / 2 ? "left" : "right";
        const nextPosition = normalizeMobileQuickActionsPosition(
            {
                side,
                y: clientY - dragOffsetY,
            },
            {
                viewportHeight,
                buttonSize: normalizedButtonSize,
                topGap: DEFAULT_MOBILE_QUICK_ACTION_TOP_GAP,
                bottomGap: DEFAULT_MOBILE_QUICK_ACTION_BOTTOM_GAP,
            },
        );
        currentPosition = nextPosition;
        emitPositionChange(nextPosition, immediate);
    }

    function startDragging(event: PointerEvent): void {
        dragActivated = true;
        dragging = true;
        closeActions();
        dragOffsetY = Math.min(
            normalizedButtonSize,
            Math.max(0, event.clientY - currentPosition.y),
        );
        updateDragPosition(event.clientX, event.clientY);
    }

    function handleMainPointerDown(event: PointerEvent): void {
        if (event.button !== 0) return;
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragOffsetY = Math.min(
            normalizedButtonSize,
            Math.max(0, event.clientY - currentPosition.y),
        );
        dragActivated = false;
        clearLongPressTimer();
        longPressTimer = window.setTimeout(() => {
            startDragging(event);
        }, 360);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function handleMainPointerMove(event: PointerEvent): void {
        if (dragPointerId !== event.pointerId) return;
        const moved = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
        if (!dragActivated && moved > 10) {
            clearLongPressTimer();
        }
        if (!dragActivated) return;
        event.preventDefault();
        updateDragPosition(event.clientX, event.clientY);
    }

    function handleMainPointerUp(event: PointerEvent): void {
        if (dragPointerId !== event.pointerId) return;
        clearLongPressTimer();
        if (dragActivated) {
            updateDragPosition(event.clientX, event.clientY, true);
        } else {
            toggleActions();
        }
        dragging = false;
        dragActivated = false;
        dragPointerId = null;
        try {
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
        } catch {
            // ignore pointer capture release errors
        }
    }

    function handleMainPointerCancel(event: PointerEvent): void {
        if (dragPointerId !== event.pointerId) return;
        clearLongPressTimer();
        if (dragActivated) {
            emitPositionChange(currentPosition, true);
        }
        dragging = false;
        dragActivated = false;
        dragPointerId = null;
    }

    function handleMainKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleActions();
    }

    function handleDocumentPointerDown(event: PointerEvent): void {
        if (!expanded || !rootEl || dragging) return;
        const target = event.target;
        if (target instanceof Node && !rootEl.contains(target)) {
            closeActions();
        }
    }

    function handleDocumentKeydown(event: KeyboardEvent): void {
        if (expanded && event.key === "Escape") {
            closeActions();
        }
    }

    async function handleActionClick(action: MobileQuickAction): Promise<void> {
        if (action.disabled || busyActionId) return;
        closeActions();
        busyActionId = action.id;
        try {
            await action.run();
        } catch {
            // Keep the floating control resilient; individual actions own user-facing errors.
        } finally {
            busyActionId = null;
        }
    }

    onMount(() => {
        syncPositionFromProps();
        document.addEventListener("pointerdown", handleDocumentPointerDown);
        document.addEventListener("keydown", handleDocumentKeydown);
    });

    onDestroy(() => {
        clearLongPressTimer();
        document.removeEventListener("pointerdown", handleDocumentPointerDown);
        document.removeEventListener("keydown", handleDocumentKeydown);
    });

    $effect(() => {
        position;
        normalizedButtonSize;
        syncPositionFromProps();
    });
</script>

<div
    bind:this={rootEl}
    class="siyuan-homepage-mobile-quick-actions"
    class:is-expanded={expanded}
    class:is-dragging={dragging}
    class:side-left={currentPosition.side === "left"}
    class:side-right={currentPosition.side === "right"}
    class:opens-downward={opensDownward}
    style={positionStyle}
>
    {#if expanded}
        <div class="siyuan-homepage-mobile-quick-actions__list" role="menu" aria-label="移动端快捷操作">
            {#each actions as action (action.id)}
                <button
                    type="button"
                    class="siyuan-homepage-mobile-quick-actions__item"
                    role="menuitem"
                    title={action.description || action.label}
                    disabled={action.disabled || busyActionId !== null}
                    onclick={() => void handleActionClick(action)}
                >
                    <span class="siyuan-homepage-mobile-quick-actions__item-icon">
                        {#if action.icon === "wallet"}
                            <AccountingIcon name="wallet" size={18} />
                        {:else}
                            <SiyuanIcon name={action.icon || "open"} size={18} />
                        {/if}
                    </span>
                    <span class="siyuan-homepage-mobile-quick-actions__item-text">
                        <span class="siyuan-homepage-mobile-quick-actions__item-label">{action.label}</span>
                        {#if action.description}
                            <span class="siyuan-homepage-mobile-quick-actions__item-description">{action.description}</span>
                        {/if}
                    </span>
                </button>
            {/each}
        </div>
    {/if}

    <button
        type="button"
        class="siyuan-homepage-mobile-quick-actions__main"
        aria-label={expanded ? "收起移动端快捷操作" : "展开移动端快捷操作"}
        aria-expanded={expanded}
        title={expanded ? "收起快捷操作" : "展开快捷操作"}
        onpointerdown={handleMainPointerDown}
        onpointermove={handleMainPointerMove}
        onpointerup={handleMainPointerUp}
        onpointercancel={handleMainPointerCancel}
        onkeydown={handleMainKeydown}
    >
        <span class="siyuan-homepage-mobile-quick-actions__main-icon">
            <SiyuanIcon name={mainIcon || "iconhomepage"} size={mainIconSize} />
        </span>
    </button>
</div>

<style lang="scss">
    .siyuan-homepage-mobile-quick-actions {
        position: fixed;
        top: var(--shp-mobile-quick-action-y);
        z-index: 80;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: var(--shp-mobile-quick-action-size);
        height: var(--shp-mobile-quick-action-size);
        pointer-events: none;
        transition: left 0.18s ease, right 0.18s ease, top 0.12s ease;
        touch-action: none;
    }

    .siyuan-homepage-mobile-quick-actions.side-right {
        right: max(14px, env(safe-area-inset-right));
        left: auto;
    }

    .siyuan-homepage-mobile-quick-actions.side-left {
        left: max(14px, env(safe-area-inset-left));
        right: auto;
    }

    .siyuan-homepage-mobile-quick-actions.is-dragging {
        transition: none;
    }

    .siyuan-homepage-mobile-quick-actions__main,
    .siyuan-homepage-mobile-quick-actions__item {
        pointer-events: auto;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-border-color));
        color: var(--b3-theme-on-background);
        background: color-mix(in srgb, var(--b3-theme-background) 92%, var(--b3-theme-primary) 8%);
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
        font: inherit;
        -webkit-tap-highlight-color: transparent;
    }

    .siyuan-homepage-mobile-quick-actions__main {
        width: var(--shp-mobile-quick-action-size);
        height: var(--shp-mobile-quick-action-size);
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--b3-theme-primary);
        touch-action: none;
        user-select: none;
    }

    .siyuan-homepage-mobile-quick-actions.is-expanded .siyuan-homepage-mobile-quick-actions__main {
        color: var(--b3-theme-on-primary);
        background: var(--b3-theme-primary);
    }

    .siyuan-homepage-mobile-quick-actions__main-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.18s ease;
    }

    .siyuan-homepage-mobile-quick-actions.is-expanded .siyuan-homepage-mobile-quick-actions__main-icon {
        transform: rotate(-8deg) scale(1.04);
    }

    .siyuan-homepage-mobile-quick-actions__list {
        position: absolute;
        bottom: calc(var(--shp-mobile-quick-action-size) + 10px);
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        pointer-events: none;
    }

    .siyuan-homepage-mobile-quick-actions.opens-downward .siyuan-homepage-mobile-quick-actions__list {
        top: calc(var(--shp-mobile-quick-action-size) + 10px);
        bottom: auto;
    }

    .siyuan-homepage-mobile-quick-actions.side-right .siyuan-homepage-mobile-quick-actions__list {
        right: 0;
    }

    .siyuan-homepage-mobile-quick-actions.side-left .siyuan-homepage-mobile-quick-actions__list {
        left: 0;
    }

    .siyuan-homepage-mobile-quick-actions__item {
        min-width: 172px;
        max-width: min(78vw, 260px);
        min-height: 46px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 11px;
        text-align: left;
    }

    .siyuan-homepage-mobile-quick-actions__item:disabled {
        cursor: default;
        opacity: 0.62;
    }

    .siyuan-homepage-mobile-quick-actions__item-icon {
        width: 30px;
        height: 30px;
        border-radius: 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    }

    .siyuan-homepage-mobile-quick-actions__item-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .siyuan-homepage-mobile-quick-actions__item-label {
        overflow: hidden;
        color: var(--b3-theme-on-background);
        font-size: 14px;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .siyuan-homepage-mobile-quick-actions__item-description {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .siyuan-homepage-mobile-quick-actions__main:active,
    .siyuan-homepage-mobile-quick-actions__item:active {
        transform: translateY(1px);
    }
</style>
