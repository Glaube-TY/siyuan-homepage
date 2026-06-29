<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { MusicPlayerVmStore, MusicPlayerActions } from "./musicPlayerTypes";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";

    interface Props {
        vmStore: MusicPlayerVmStore;
        actions: MusicPlayerActions;
    }

    let { vmStore, actions }: Props = $props();

    const vm = $derived($vmStore);
    const currentTrack = $derived(vm.musicFiles[vm.currentTrackIndex]);
    const progressPercent = $derived(clampProgressPercent(vm.currentTime, vm.duration));
    const trackSubtitle = $derived(buildTrackSubtitle(currentTrack));
    const isHeartFilled = $derived(!!currentTrack && vm.favoriteTrackKeys.includes(getTrackKey(currentTrack)));

    function clampProgressPercent(currentTime: number, duration: number): number {
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0;
        return Math.max(0, Math.min(100, (currentTime / duration) * 100));
    }

    function buildTrackSubtitle(track: typeof currentTrack): string {
        if (!track) return "";
        const artist = track.artist?.trim();
        const album = track.album?.trim();
        if (artist && album) return `${artist} · ${album}`;
        if (artist) return artist;
        if (album) return album;
        return track.fileName || "";
    }

    const STORAGE_KEY = "siyuan-homepage-floating-mini-pos";
    const DRAG_THRESHOLD = 5;

    let rootEl: HTMLElement | null = $state(null);
    let handleEl: HTMLElement | null = $state(null);
    let posX = $state(0);
    let posY = $state(0);
    let dragging = $state(false);
    let dragPointerId: number | null = $state(null);
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPosX = 0;
    let dragStartPosY = 0;
    let hasMoved = false;
    let initialized = $state(false);
    let rafId: number | null = null;
    let pendingX: number | null = null;
    let pendingY: number | null = null;

    function clampToViewport(x: number, y: number): { x: number; y: number } {
        const width = rootEl?.getBoundingClientRect().width ?? 272;
        const height = rootEl?.getBoundingClientRect().height ?? 100;
        return {
            x: Math.max(0, Math.min(x, window.innerWidth - width)),
            y: Math.max(0, Math.min(y, window.innerHeight - height)),
        };
    }

    function savePosition(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: posX, y: posY }));
        } catch {
            /* ignore */
        }
    }

    function isFiniteNumber(value: unknown): value is number {
        return typeof value === "number" && Number.isFinite(value);
    }

    function restorePosition(): void {
        let hasSavedPosition = false;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const p = JSON.parse(saved);
                if (isFiniteNumber(p.x) && isFiniteNumber(p.y)) {
                    posX = p.x;
                    posY = p.y;
                    hasSavedPosition = true;
                }
            }
        } catch {
            /* ignore */
        }
        if (!hasSavedPosition) {
            const width = rootEl?.getBoundingClientRect().width ?? 360;
            const height = rootEl?.getBoundingClientRect().height ?? 100;
            posX = window.innerWidth - width - 16;
            posY = window.innerHeight - height - 16;
        }
        const clamped = clampToViewport(posX, posY);
        posX = clamped.x;
        posY = clamped.y;
        initialized = true;
    }

    function applyPendingPositionNow(): void {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (pendingX === null || pendingY === null) return;
        const clamped = clampToViewport(pendingX, pendingY);
        posX = clamped.x;
        posY = clamped.y;
        pendingX = null;
        pendingY = null;
    }

    function endDrag(): void {
        if (!dragging) return;
        dragging = false;
        dragPointerId = null;
        hasMoved = false;
        applyPendingPositionNow();
        savePosition();
    }

    function onDragStart(e: PointerEvent): void {
        if (!handleEl) return;
        const target = e.target as HTMLElement;
        if (target.closest("button,a,input,select,textarea,[data-no-drag]")) return;
        if (e.button !== 0) return;

        e.preventDefault();
        dragging = true;
        dragPointerId = e.pointerId;
        hasMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartPosX = posX;
        dragStartPosY = posY;

        handleEl.setPointerCapture(e.pointerId);
    }

    function onDragMove(e: PointerEvent): void {
        if (!dragging || dragPointerId === null || e.pointerId !== dragPointerId || !handleEl) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (!hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        hasMoved = true;

        const rawX = dragStartPosX + dx;
        const rawY = dragStartPosY + dy;

        pendingX = rawX;
        pendingY = rawY;
        if (rafId === null) {
            rafId = requestAnimationFrame(applyPendingPosition);
        }
    }

    function applyPendingPosition(): void {
        rafId = null;
        if (pendingX === null || pendingY === null) return;
        const clamped = clampToViewport(pendingX, pendingY);
        posX = clamped.x;
        posY = clamped.y;
        pendingX = null;
        pendingY = null;
    }

    function onDragEnd(e: PointerEvent): void {
        if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
        if (handleEl && dragPointerId !== null && handleEl.hasPointerCapture(dragPointerId)) {
            handleEl.releasePointerCapture(dragPointerId);
        }
        endDrag();
    }

    function onLostPointerCapture(e: PointerEvent): void {
        if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
        endDrag();
    }

    function handleSeek(e: MouseEvent) {
        const target = e.currentTarget as HTMLElement;
        if (!vm.duration) return;
        const rect = target.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        actions.seekTo(ratio * vm.duration);
    }

    function handleSeekKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") actions.seekTo(vm.currentTime - 5);
        else if (e.key === "ArrowRight") actions.seekTo(vm.currentTime + 5);
    }

    function onWindowBlur(): void {
        if (dragging) {
            if (handleEl && dragPointerId !== null && handleEl.hasPointerCapture(dragPointerId)) {
                handleEl.releasePointerCapture(dragPointerId);
            }
            endDrag();
        }
    }

    function onVisibilityChange(): void {
        if (document.hidden && dragging) {
            if (handleEl && dragPointerId !== null && handleEl.hasPointerCapture(dragPointerId)) {
                handleEl.releasePointerCapture(dragPointerId);
            }
            endDrag();
        }
    }

    function onWindowResize(): void {
        const clamped = clampToViewport(posX, posY);
        posX = clamped.x;
        posY = clamped.y;
        if (!dragging) savePosition();
    }

    $effect(() => {
        if (vm.detailDialogOpen && dragging) {
            if (handleEl && dragPointerId !== null && handleEl.hasPointerCapture(dragPointerId)) {
                handleEl.releasePointerCapture(dragPointerId);
            }
            endDrag();
        }
    });

    onMount(() => {
        restorePosition();
        window.addEventListener("blur", onWindowBlur);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("resize", onWindowResize);
    });

    onDestroy(() => {
        window.removeEventListener("blur", onWindowBlur);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("resize", onWindowResize);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (handleEl && dragPointerId !== null && handleEl.hasPointerCapture(dragPointerId)) {
            handleEl.releasePointerCapture(dragPointerId);
        }
        endDrag();
    });
</script>

{#if !vm.detailDialogOpen}
<div class="music-floating-bar" class:dragging bind:this={rootEl} style="left:{posX}px;top:{posY}px;{initialized?'':'visibility:hidden'}">
    {#if currentTrack?.coverObjectUrl}<div class="bar-bg-cover" style="background-image:url({currentTrack.coverObjectUrl})"></div>{/if}
    <div class="bar-row bar-info">
        <div class="bar-drag-handle" role="region" aria-label="拖动移动浮窗" bind:this={handleEl} onpointerdown={onDragStart} onpointermove={onDragMove} onpointerup={onDragEnd} onpointercancel={onDragEnd} onlostpointercapture={onLostPointerCapture}>
            <span class="bar-cover">
                {#if currentTrack?.coverObjectUrl}<img src={currentTrack.coverObjectUrl} alt="" draggable="false" />{:else}<span class="bar-cover-fallback"><MusicPlayerIcon name="musicNote" size={18} /></span>{/if}
            </span>
            <span class="bar-meta">
                <span class="bar-title">{currentTrack?.title || currentTrack?.fileName || "无音乐"}</span>
                <span class="bar-subtitle">{trackSubtitle}</span>
            </span>
        </div>
        <button class="bar-favorite" class:is-favorite={isHeartFilled} onclick={actions.toggleFavorite} title={isHeartFilled?"取消收藏":"收藏"} data-no-drag><MusicPlayerIcon name={isHeartFilled?"heartFilled":"heart"} size={15} /></button>
    </div>
    <div class="bar-row bar-progress" onclick={handleSeek} onkeydown={handleSeekKeydown} role="slider" aria-valuenow={vm.currentTime} aria-valuemin={0} aria-valuemax={vm.duration} tabindex="0"><div class="bar-progress-fill" style="width:{progressPercent}%"></div></div>
    <div class="bar-row bar-controls">
        <button onclick={actions.prevTrack} title="上一曲" disabled={vm.musicFiles.length===0} data-no-drag><MusicPlayerIcon name="previous" size={16} /></button>
        <button class="bar-play-btn" onclick={actions.togglePlay} title={vm.isPlaying?"暂停":"播放"} disabled={vm.musicFiles.length===0} data-no-drag><MusicPlayerIcon name={vm.isPlaying?"pause":"play"} size={18} /></button>
        <button onclick={actions.nextTrack} title="下一曲" disabled={vm.musicFiles.length===0} data-no-drag><MusicPlayerIcon name="next" size={16} /></button>
        <button onclick={actions.openActiveQueueDialog} title="播放列表" disabled={vm.musicFiles.length===0} data-no-drag><MusicPlayerIcon name="queue" size={16} /></button>
        <button onclick={actions.openDetailDialog} title="详情" disabled={vm.musicFiles.length===0} data-no-drag><MusicPlayerIcon name="detail" size={16} /></button>
        <button onclick={actions.toggleMute} title={vm.isMuted?"取消静音":"静音"} data-no-drag><MusicPlayerIcon name={vm.isMuted?"volumeMuted":"volume"} size={16} /></button>
    </div>
</div>
{/if}

<style lang="scss">
    .music-floating-bar {
        position: fixed;
        width: min(24rem, calc(100vw - 16px));
        z-index: 400;
        padding: 0.6rem 0.85rem;
        border-radius: 14px;
        background: color-mix(in srgb, var(--b3-theme-surface) 92%, transparent);
        backdrop-filter: blur(18px) saturate(1.3);
        box-shadow: 0 4px 32px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.06);
        color: var(--b3-theme-on-surface);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        user-select: none;
        transition: box-shadow 0.15s ease;
        overflow: hidden;
        @media(max-width: 640px) { display: none }
        &.dragging { box-shadow: 0 8px 40px rgba(0,0,0,0.16), inset 0 1px 1px rgba(255,255,255,0.08) }
        .bar-bg-cover {
            position: absolute;
            inset: 0;
            z-index: -1;
            background-size: cover;
            background-position: center;
            opacity: 0.12;
            filter: blur(24px) brightness(0.85);
            transform: scale(1.2);
            pointer-events: none;
        }
        .bar-row { display: flex; align-items: center; position: relative; z-index: 1 }
        .bar-info { gap: 0.55rem }
        .bar-drag-handle {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 0.55rem;
            cursor: grab;
            border-radius: 8px;
            &:active { cursor: grabbing }
        }
        .bar-cover {
            width: 46px;
            height: 46px;
            border-radius: 9px;
            overflow: hidden;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--b3-theme-primary-light), var(--b3-theme-surface-light));
            img { width: 100%; height: 100%; object-fit: cover }
            .bar-cover-fallback { color: var(--b3-theme-on-surface-light); opacity: 0.5 }
        }
        .bar-meta {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 0.15rem;
        }
        .bar-title {
            font-size: 0.82rem;
            font-weight: 600;
            line-height: 1.25;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .bar-subtitle {
            font-size: 0.7rem;
            font-weight: 400;
            line-height: 1.25;
            color: var(--b3-theme-on-surface-light);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .bar-favorite {
            width: 1.75rem;
            height: 1.75rem;
            flex-shrink: 0;
            background: transparent;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--b3-theme-on-surface-light);
            padding: 0;
            opacity: 0;
            transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
            &:hover { background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent) }
            &.is-favorite { opacity: 1; color: #e94e5a }
        }
        .bar-info:hover .bar-favorite:not(.is-favorite) { opacity: 1 }
        .bar-progress {
            width: 100%;
            height: 3px;
            background: var(--b3-border-color);
            border-radius: 2px;
            cursor: pointer;
            flex-shrink: 0;
            .bar-progress-fill { height: 100%; background: var(--b3-theme-primary); border-radius: 2px; transition: width 0.3s linear }
        }
        .bar-controls {
            gap: 0.25rem;
            justify-content: center;
            button {
                width: 1.9rem;
                height: 1.9rem;
                background: transparent;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: inherit;
                padding: 0;
                flex-shrink: 0;
                &:hover:not(:disabled) { background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent) }
                &:disabled { opacity: 0.35; cursor: not-allowed }
            }
            .bar-play-btn { width: 2.2rem; height: 2.2rem }
        }
    }
</style>
