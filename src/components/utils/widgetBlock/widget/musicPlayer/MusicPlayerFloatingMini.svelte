<script lang="ts">
    import { onMount } from "svelte";
    import type { MusicPlayerVmStore, MusicPlayerActions } from "./musicPlayerTypes";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";

    interface Props {
        vmStore: MusicPlayerVmStore;
        actions: MusicPlayerActions;
    }

    let { vmStore, actions }: Props = $props();

    const vm = $derived($vmStore);
    const currentTrack = $derived(vm.musicFiles[vm.currentTrackIndex]);
    const progressPercent = $derived(vm.duration > 0 && Number.isFinite(vm.currentTime) ? (vm.currentTime / vm.duration) * 100 : 0);
    const isHeartFilled = $derived(!!currentTrack && vm.favoriteTrackKeys.includes(trackKey(currentTrack)));

    function trackKey(t: NonNullable<typeof currentTrack>): string {
        const path = t.filePath || "";
        return `${t.size || 0}:${t.mtimeMs || 0}:${path}`;
    }

    let rootEl: HTMLElement | null = $state(null);
    let posX = $state(0);
    let posY = $state(0);
    let dragging = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPosX = 0;
    let dragStartPosY = 0;
    let initialized = $state(false);

    onMount(() => {
        try {
            const saved = localStorage.getItem("siyuan-homepage-floating-mini-pos");
            if (saved) { const p = JSON.parse(saved); if (typeof p.x === "number") { posX = p.x; posY = p.y; } }
        } catch { /* ignore */ }
        if (!posX && !posY) { posX = window.innerWidth - 436; posY = window.innerHeight - 110; }
        posX = Math.max(0, Math.min(posX, window.innerWidth - 436));
        posY = Math.max(0, Math.min(posY, window.innerHeight - 100));
        initialized = true;
    });

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

    function onDragStart(e: PointerEvent) {
        if (!rootEl) return;
        dragging = true; dragStartX = e.clientX; dragStartY = e.clientY;
        dragStartPosX = posX; dragStartPosY = posY;
        rootEl.setPointerCapture(e.pointerId);
    }

    function onDragMove(e: PointerEvent) {
        if (!dragging) return;
        posX = Math.max(0, Math.min(dragStartPosX + e.clientX - dragStartX, window.innerWidth - 436));
        posY = Math.max(0, Math.min(dragStartPosY + e.clientY - dragStartY, window.innerHeight - 100));
    }

    function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        try { localStorage.setItem("siyuan-homepage-floating-mini-pos", JSON.stringify({ x: posX, y: posY })); } catch { /* ignore */ }
    }
</script>

<div class="music-floating-bar" class:dragging bind:this={rootEl} style="left:{posX}px;top:{posY}px;{initialized?'':'visibility:hidden'}">
    <div class="bar-row bar-info" role="region" aria-label="拖动移动浮窗" onpointerdown={onDragStart} onpointermove={onDragMove} onpointerup={onDragEnd} onpointercancel={onDragEnd}>
        <button class="bar-cover" style="cursor:grab">
            {#if currentTrack?.coverObjectUrl}<img src={currentTrack.coverObjectUrl} alt="" />{:else}<span class="bar-cover-fallback"><MusicPlayerIcon name="musicNote" size={18} /></span>{/if}
        </button>
        <span class="bar-title">{currentTrack?.title || "无音乐"}</span>
        <button class="bar-favorite" class:is-favorite={isHeartFilled} onclick={actions.toggleFavorite} title={isHeartFilled?"取消收藏":"收藏"}><MusicPlayerIcon name={isHeartFilled?"heartFilled":"heart"} size={15} /></button>
    </div>
    <div class="bar-row bar-progress" onclick={handleSeek} onkeydown={handleSeekKeydown} role="slider" aria-valuenow={vm.currentTime} aria-valuemin={0} aria-valuemax={vm.duration} tabindex="0"><div class="bar-progress-fill" style="width:{progressPercent}%"></div></div>
    <div class="bar-row bar-controls">
        <button onclick={actions.prevTrack} title="上一曲" disabled={vm.musicFiles.length===0}><MusicPlayerIcon name="previous" size={16} /></button>
        <button class="bar-play-btn" onclick={actions.togglePlay} title={vm.isPlaying?"暂停":"播放"} disabled={vm.musicFiles.length===0}><MusicPlayerIcon name={vm.isPlaying?"pause":"play"} size={18} /></button>
        <button onclick={actions.nextTrack} title="下一曲" disabled={vm.musicFiles.length===0}><MusicPlayerIcon name="next" size={16} /></button>
        <button onclick={actions.openActiveQueueDialog} title="播放列表" disabled={vm.musicFiles.length===0}><MusicPlayerIcon name="queue" size={16} /></button>
        <button onclick={actions.toggleMute} title={vm.isMuted?"取消静音":"静音"}><MusicPlayerIcon name={vm.isMuted?"volumeMuted":"volume"} size={16} /></button>
    </div>
</div>

<style lang="scss">
    .music-floating-bar {
        position:fixed;width:420px;max-width:calc(100vw - 16px);z-index:400;padding:0.6rem 0.85rem;border-radius:14px;
        background:color-mix(in srgb, var(--b3-theme-surface) 90%, transparent);
        backdrop-filter:blur(18px) saturate(1.3);
        box-shadow:0 4px 32px rgba(0,0,0,0.10),inset 0 1px 1px rgba(255,255,255,0.06);
        color:var(--b3-theme-on-surface);display:flex;flex-direction:column;gap:0.4rem;user-select:none;
        transition:box-shadow 0.15s ease;
        @media(max-width:640px){display:none}
        &.dragging{box-shadow:0 8px 40px rgba(0,0,0,0.16),inset 0 1px 1px rgba(255,255,255,0.08)}
        .bar-row{display:flex;align-items:center}
        .bar-info{gap:0.5rem;cursor:default}
        .bar-cover{width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;border:none;padding:0;background:linear-gradient(135deg,var(--b3-theme-primary-light),var(--b3-theme-surface-light));display:flex;align-items:center;justify-content:center;cursor:grab;img{width:100%;height:100%;object-fit:cover}.bar-cover-fallback{color:var(--b3-theme-on-surface-light);opacity:0.5}}
        .bar-title{flex:1;min-width:0;font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bar-favorite{width:1.5rem;height:1.5rem;flex-shrink:0;background:transparent;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--b3-theme-on-surface-light);padding:0;opacity:0;transition:opacity 0.15s ease,background 0.15s ease,color 0.15s ease;&:hover{background:color-mix(in srgb,var(--b3-theme-primary)12%,transparent)}&.is-favorite{opacity:1;color:#e94e5a}}
        .bar-info:hover .bar-favorite:not(.is-favorite){opacity:1}
        .bar-progress{width:100%;height:3px;background:var(--b3-border-color);border-radius:2px;cursor:pointer;flex-shrink:0;.bar-progress-fill{height:100%;background:var(--b3-theme-primary);border-radius:2px;transition:width 0.3s linear}}
        .bar-controls{gap:0.25rem;justify-content:center;button{width:1.9rem;height:1.9rem;background:transparent;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:inherit;padding:0;flex-shrink:0;&:hover:not(:disabled){background:color-mix(in srgb,var(--b3-theme-primary)12%,transparent)}&:disabled{opacity:0.35;cursor:not-allowed}}.bar-play-btn{width:2.2rem;height:2.2rem}}
    }
</style>
