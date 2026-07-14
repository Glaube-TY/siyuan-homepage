<script lang="ts">
    import { onDestroy } from "svelte";
    import X from "@lucide/svelte/icons/x";
    import {
        autoUpdate,
        computePosition,
        flip,
        offset,
        shift,
        type VirtualElement,
    } from "@floating-ui/dom";
    import type { WorkspaceTaskViewModel } from "../enhancedDiaryWorkspaceTaskModel";
    import WorkspaceTaskDetail from "./WorkspaceTaskDetail.svelte";

    type TaskAnchor = HTMLElement | VirtualElement;
    type WorkspaceTaskPreviewSource = "pointer" | "focus" | "click" | "keyboard";
    interface Props {
        onActiveChange: (taskId: string) => void;
        onEdit: (model: WorkspaceTaskViewModel) => void;
        onToggle: (model: WorkspaceTaskViewModel) => void | Promise<void>;
        onDelete: (model: WorkspaceTaskViewModel) => void;
        onMigrate: (model: WorkspaceTaskViewModel) => void;
        onPostpone: (model: WorkspaceTaskViewModel, target: "tomorrow" | "nextWeek") => void | Promise<void>;
        onOpenBlock: (model: WorkspaceTaskViewModel) => void;
        onOpenDoc: (model: WorkspaceTaskViewModel) => void;
        onOpenProject?: (targetId: string) => void;
        onTagClick?: (tag: string) => void;
    }

    let {
        onActiveChange, onEdit, onToggle, onDelete, onMigrate, onPostpone,
        onOpenBlock, onOpenDoc, onOpenProject, onTagClick,
    }: Props = $props();
    let model = $state<WorkspaceTaskViewModel | null>(null);
    let anchor = $state<TaskAnchor | null>(null);
    let floatingElement = $state<HTMLElement | null>(null);
    let showTimer: number | null = null;
    let hideTimer: number | null = null;
    let cleanupAutoUpdate: (() => void) | null = null;
    let pointerOnTrigger = false;
    let focusOnTrigger = false;
    let pointerInFloating = false;
    let focusInFloating = false;
    let pendingTaskId = "";
    let requestVersion = 0;

    function clearShowTimer(): void {
        if (showTimer !== null) window.clearTimeout(showTimer);
        showTimer = null;
    }
    function clearHideTimer(): void {
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        hideTimer = null;
    }
    function stopAutoUpdate(): void {
        cleanupAutoUpdate?.();
        cleanupAutoUpdate = null;
    }
    function clearCurrent(): void {
        stopAutoUpdate();
        model = null;
        anchor = null;
        pendingTaskId = "";
        onActiveChange("");
    }
    function resetPresence(): void {
        pointerOnTrigger = false;
        focusOnTrigger = false;
        pointerInFloating = false;
        focusInFloating = false;
    }
    function canAutoClose(): boolean {
        return !pointerOnTrigger && !focusOnTrigger && !pointerInFloating && !focusInFloating;
    }
    function positionFloating(): void {
        if (!anchor || !floatingElement) return;
        const positionVersion = requestVersion;
        const positionAnchor = anchor;
        if (window.matchMedia("(max-width: 640px)").matches) {
            Object.assign(floatingElement.style, { left: "12px", right: "12px", top: "auto", bottom: "12px" });
            return;
        }
        floatingElement.style.right = "auto";
        floatingElement.style.bottom = "auto";
        void computePosition(positionAnchor, floatingElement, {
            strategy: "fixed",
            placement: "right-start",
            middleware: [offset(10), flip(), shift({ padding: 12 })],
        }).then(({ x, y }) => {
            if (!floatingElement || !model || positionVersion !== requestVersion || anchor !== positionAnchor) return;
            Object.assign(floatingElement.style, { left: `${x}px`, top: `${y}px` });
        });
    }
    function startAutoUpdate(): void {
        stopAutoUpdate();
        if (!anchor || !floatingElement || !model) return;
        cleanupAutoUpdate = autoUpdate(anchor, floatingElement, positionFloating);
    }
    function reveal(nextModel: WorkspaceTaskViewModel, nextAnchor: TaskAnchor, version: number): void {
        if (version !== requestVersion) return;
        showTimer = null;
        model = nextModel;
        anchor = nextAnchor;
        pendingTaskId = "";
        onActiveChange(nextModel.task.blockId);
        queueMicrotask(startAutoUpdate);
    }
    function scheduleClose(delay: number): void {
        clearHideTimer();
        const version = requestVersion;
        hideTimer = window.setTimeout(() => {
            hideTimer = null;
            if (version === requestVersion && canAutoClose()) close();
        }, delay);
    }

    export function show(nextModel: WorkspaceTaskViewModel, nextAnchor: TaskAnchor, source: WorkspaceTaskPreviewSource): void {
        const nextTaskId = nextModel.task.blockId;
        const changingTask = (model && model.task.blockId !== nextTaskId) || (pendingTaskId && pendingTaskId !== nextTaskId);
        requestVersion += 1;
        const version = requestVersion;
        clearShowTimer();
        clearHideTimer();
        if (changingTask) {
            clearCurrent();
            resetPresence();
        }
        if (source === "pointer") pointerOnTrigger = true;
        if (source === "focus" || source === "keyboard") focusOnTrigger = true;
        pendingTaskId = nextTaskId;
        anchor = nextAnchor;
        if (source === "pointer") showTimer = window.setTimeout(() => reveal(nextModel, nextAnchor, version), 110);
        else reveal(nextModel, nextAnchor, version);
    }
    export function leavePointerTrigger(taskId: string): void {
        if (pendingTaskId !== taskId && model?.task.blockId !== taskId) return;
        pointerOnTrigger = false;
        clearShowTimer();
        pendingTaskId = "";
        if (model) scheduleClose(260);
    }
    export function leaveFocusTrigger(taskId: string): void {
        if (pendingTaskId !== taskId && model?.task.blockId !== taskId) return;
        focusOnTrigger = false;
        clearShowTimer();
        pendingTaskId = "";
        if (model) scheduleClose(200);
    }
    export function close(): void {
        requestVersion += 1;
        clearShowTimer();
        clearHideTimer();
        resetPresence();
        clearCurrent();
    }
    function handleFloatingPointerEnter(): void {
        pointerInFloating = true;
        clearHideTimer();
    }
    function handleFloatingPointerLeave(): void {
        pointerInFloating = false;
        scheduleClose(200);
    }
    function handleFloatingFocusIn(): void {
        focusInFloating = true;
        clearHideTimer();
    }
    function handleFloatingFocusOut(event: FocusEvent): void {
        if (event.relatedTarget instanceof Node && floatingElement?.contains(event.relatedTarget)) return;
        focusInFloating = false;
        scheduleClose(200);
    }
    function runAndClose(action: (activeModel: WorkspaceTaskViewModel) => void | Promise<void>): void {
        if (!model) return;
        const activeModel = model;
        close();
        void action(activeModel);
    }
    function handleWindowKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape" && model) close();
    }

    onDestroy(() => {
        requestVersion += 1;
        clearShowTimer();
        clearHideTimer();
        stopAutoUpdate();
    });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if model}
    <div
        class="task-floating-detail"
        bind:this={floatingElement}
        role="dialog"
        aria-label="任务详情"
        tabindex="-1"
        onmouseenter={handleFloatingPointerEnter}
        onmouseleave={handleFloatingPointerLeave}
        onfocusin={handleFloatingFocusIn}
        onfocusout={handleFloatingFocusOut}
    >
        <button type="button" class="floating-close" title="关闭任务详情" aria-label="关闭任务详情" onclick={close}><X size={17} strokeWidth={2} /></button>
        <div class="floating-content">
            <WorkspaceTaskDetail
                {model}
                variant="floating"
                onEdit={() => runAndClose(onEdit)}
                onToggle={() => runAndClose(onToggle)}
                onDelete={() => runAndClose(onDelete)}
                onMigrate={() => runAndClose(onMigrate)}
                onPostpone={(target) => runAndClose((activeModel) => onPostpone(activeModel, target))}
                onOpenBlock={() => runAndClose(onOpenBlock)}
                onOpenDoc={() => runAndClose(onOpenDoc)}
                onOpenProject={(targetId) => runAndClose(() => onOpenProject?.(targetId))}
                onTagClick={(tag) => runAndClose(() => onTagClick?.(tag))}
            />
        </div>
    </div>
{/if}

<style>
    .task-floating-detail { position: fixed; z-index: 1200; width: 460px; max-width: calc(100vw - 24px); max-height: min(78vh, 720px); border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); box-shadow: var(--wk-shadow-popover); color: var(--wk-ink); overflow: hidden; box-sizing: border-box; }
    .floating-content { max-height: min(78vh, 720px); overflow: auto; overscroll-behavior: contain; }
    .floating-close { position: absolute; z-index: 1; top: 8px; right: 8px; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-ink-muted); cursor: pointer; }
    @media (max-width: 640px) {
        .task-floating-detail { width: auto; max-width: none; max-height: calc(100vh - 24px); }
        .floating-content { max-height: calc(100vh - 24px); }
    }
    @media (prefers-reduced-motion: reduce) { .task-floating-detail { scroll-behavior: auto; } }
</style>
