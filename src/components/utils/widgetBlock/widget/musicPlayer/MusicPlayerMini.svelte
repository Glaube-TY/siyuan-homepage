<script lang="ts">
    import { onMount } from "svelte";
    import type { MusicPlayerViewModel, MusicPlayerActions } from "./musicPlayerTypes";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import { getCurrentLyricLine } from "./musicLyricsService";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";
    import MusicPlayerVolumeSlider from "./MusicPlayerVolumeSlider.svelte";
    import { getTrackKey } from "./musicPlaybackStatsStore";

    interface Props {
        vm: MusicPlayerViewModel;
        actions: MusicPlayerActions;
        onOpenDetail: () => void;
    }

    let { vm, actions, onOpenDetail }: Props = $props();

    let rootEl: HTMLElement | null = $state(null);
    let containerWidth = $state(0);
    let containerHeight = $state(0);

    const layoutMode = $derived(computeLayoutMode(containerWidth, containerHeight));

    const currentTrack = $derived(vm.musicFiles[vm.currentTrackIndex]);
    const isCurrentFavorite = $derived(!!currentTrack && vm.favoriteTrackKeys.includes(getTrackKey(currentTrack)));
    const showCover = $derived(vm.showCover);
    const progressPercent = $derived(vm.duration > 0 && Number.isFinite(vm.currentTime) ? (vm.currentTime / vm.duration) * 100 : 0);
    const currentLyric = $derived(currentTrack ? getCurrentLyricLine(currentTrack.lyrics, vm.currentTime)?.primary || currentTrack.unsyncedLyricsText?.split("\n").find((l) => l.trim()) || "" : "");

    function computeLayoutMode(width: number, height: number): "full" | "compact" | "micro" {
        if (width < 300 || height < 230) return "micro";
        if (width < 380 || height < 320) return "compact";
        return "full";
    }

    onMount(() => {
        if (!rootEl) return;
        let rafId: number | null = null;
        let resizeObserver: ResizeObserver | null = null;
        const updateSize = (width: number, height: number) => { containerWidth = width; containerHeight = height; };
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0]; if (!entry) return;
                if (rafId !== null) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => { const rect = entry.contentRect; updateSize(rect.width, rect.height); });
            });
            resizeObserver.observe(rootEl);
        } else {
            const rect = rootEl.getBoundingClientRect();
            updateSize(rect.width, rect.height);
        }
        return () => { if (rafId !== null) cancelAnimationFrame(rafId); if (resizeObserver && rootEl) resizeObserver.unobserve(rootEl); };
    });

    function playModeAlt(): string {
        switch (vm.playMode) { case "repeat": return "单曲循环"; case "shuffle": return "随机播放"; default: return "顺序播放"; }
    }
</script>

<div class="music-player-mini mode-{layoutMode}" bind:this={rootEl}>
    <div class="mini-card">
        <button class="mini-cover" onclick={onOpenDetail} title="展开详细播放器" aria-label="展开详细播放器">
            {#if showCover && currentTrack?.coverObjectUrl}
                <img src={currentTrack.coverObjectUrl} alt="封面" />
            {:else}
                <span class="cover-icon"><MusicPlayerIcon name="musicNote" size={32} /></span>
            {/if}
        </button>

        <div class="mini-info">
            <div class="mini-title-row">
                <span class="mini-title" title={currentTrack?.title || "无音乐"}>{currentTrack?.title || "无音乐"}</span>
                <button class="mini-favorite" class:is-favorite={isCurrentFavorite} onclick={actions.toggleFavorite} title={isCurrentFavorite ? "取消收藏" : "收藏"} disabled={!currentTrack}>
                    <MusicPlayerIcon name={isCurrentFavorite ? "heartFilled" : "heart"} size={15} />
                </button>
            </div>
            {#if currentTrack?.artist}<span class="mini-artist" title={currentTrack.artist}>{currentTrack.artist}</span>{/if}
            {#if currentTrack?.album}<span class="mini-album" title={currentTrack.album}>{currentTrack.album}</span>{/if}
            {#if currentLyric}<span class="mini-lyric" title={currentLyric}>{currentLyric}</span>{/if}
        </div>

        <div class="mini-progress-area">
            <div class="mini-progress" onclick={actions.seekByMouse} role="slider" aria-valuenow={vm.currentTime} aria-valuemin={0} aria-valuemax={vm.duration} tabindex="0" onkeydown={actions.seekByKeyboard}>
                <div class="mini-progress-bar" style="width: {progressPercent}%"></div>
            </div>
            <div class="mini-time">{formatPlaybackTime(vm.currentTime, true)} / {formatPlaybackTime(vm.duration)}</div>
        </div>

        <div class="mini-primary-controls">
            <button onclick={actions.prevTrack} title="上一曲" aria-label="上一曲" disabled={vm.musicFiles.length === 0}><MusicPlayerIcon name="previous" size={18} /></button>
            <button class="mini-play-button" onclick={actions.togglePlay} title={vm.isPlaying ? "暂停" : "播放"} aria-label={vm.isPlaying ? "暂停" : "播放"} disabled={vm.musicFiles.length === 0}><MusicPlayerIcon name={vm.isPlaying ? "pause" : "play"} size={22} /></button>
            <button onclick={actions.nextTrack} title="下一曲" aria-label="下一曲" disabled={vm.musicFiles.length === 0}><MusicPlayerIcon name="next" size={18} /></button>
        </div>

        <div class="mini-secondary-controls">
            <button onclick={onOpenDetail} title="展开详细播放器" aria-label="展开详细播放器" disabled={vm.musicFiles.length === 0}><MusicPlayerIcon name="detail" size={18} /></button>
            <button class="mini-queue-btn" onclick={actions.openActiveQueueDialog} title="播放列表" aria-label="播放列表" disabled={vm.musicFiles.length === 0}><MusicPlayerIcon name="queue" size={18} /></button>
        </div>

        <div class="mini-volume-area">
            <button class="mini-volume-mute" onclick={actions.toggleMute} title={vm.isMuted ? "取消静音" : "静音"} aria-label={vm.isMuted ? "取消静音" : "静音"}><MusicPlayerIcon name={vm.isMuted ? "volumeMuted" : "volume"} size={16} /></button>
            <div class="mini-volume-track"><MusicPlayerVolumeSlider volume={vm.volume} isMuted={vm.isMuted} oninput={actions.setVolume} onchange={actions.setVolumeChange} /></div>
            <button class="mini-play-mode" onclick={actions.togglePlayMode} title={playModeAlt()} aria-label={playModeAlt()}><MusicPlayerIcon name={vm.playMode === "repeat" ? "repeatOne" : vm.playMode === "shuffle" ? "shuffle" : "listMusic"} size={16} /></button>
        </div>
    </div>
</div>

<style lang="scss">
    .music-player-mini {
        width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; padding: 0.75rem; box-sizing: border-box;
        .mini-card { width: min(100%, 370px); height: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1.25rem; border-radius: 12px; background: var(--b3-theme-surface); box-shadow: 0 2px 6px rgba(0,0,0,0.05); overflow: hidden; box-sizing: border-box; }
        .mini-cover { width: 6rem; height: 6rem; border-radius: 8px; overflow: hidden; flex-shrink: 0; border: none; background: linear-gradient(135deg, var(--b3-theme-primary-light), var(--b3-theme-surface-light)); display: flex; align-items: center; justify-content: center; cursor: pointer; img { width: 100%; height: 100%; object-fit: cover; } .cover-icon { font-size: 2rem; opacity: 0.7; } }
        .mini-info { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 0.25rem; min-width: 0; }
        .mini-title-row { display: flex; align-items: center; justify-content: center; gap: 0.4rem; max-width: 100%; min-width: 0; }
        .mini-title { font-size: 1.1rem; font-weight: 600; color: var(--b3-theme-on-surface); line-height: 1.3; max-width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-favorite { flex-shrink: 0; width: 1.6rem; height: 1.6rem; display: flex; align-items: center; justify-content: center; border: none; border-radius: 50%; background: transparent; color: var(--b3-theme-on-surface-light); font-size: 0.95rem; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; &:hover:not(:disabled) { background: var(--b3-theme-primary-light); } &.is-favorite { color: #e94e5a; } &:disabled { opacity: 0.4; cursor: not-allowed; } }
        .mini-artist { font-size: 0.85rem; color: var(--b3-theme-on-surface-light); max-width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-album { font-size: 0.75rem; color: var(--b3-theme-on-surface-light); opacity: 0.85; max-width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-lyric { font-size: 0.75rem; color: var(--b3-theme-primary); max-width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.2em; }
        .mini-progress-area { width: 100%; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; min-width: 0; .mini-progress { width: 100%; height: 5px; background: var(--b3-border-color); border-radius: 3px; cursor: pointer; .mini-progress-bar { height: 100%; background: var(--b3-theme-primary); border-radius: 3px; } } .mini-time { font-size: 0.75rem; color: var(--b3-theme-on-surface-light); white-space: nowrap; } }

        .mini-primary-controls {
            display: flex; align-items: center; justify-content: center; gap: 0.75rem; flex-shrink: 0; min-width: 0;
            button { width: 2.25rem; height: 2.25rem; background: transparent; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; &:hover:not(:disabled) { background: var(--b3-theme-primary-light); } &:disabled { opacity: 0.5; cursor: not-allowed; } }
            .mini-play-button { width: 2.75rem; height: 2.75rem; }
        }

        .mini-secondary-controls {
            display: flex; align-items: center; justify-content: center; gap: 0.75rem; flex-shrink: 0; min-width: 0;
            button { width: 2.25rem; height: 2.25rem; background: transparent; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; &:hover:not(:disabled) { background: var(--b3-theme-primary-light); } &:disabled { opacity: 0.5; cursor: not-allowed; } }
            .mini-queue-btn { font-size: 0.85rem; font-weight: 600; }
        }

        .mini-volume-area { width: 100%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem; min-width: 0; .mini-volume-mute, .mini-play-mode { width: 1.75rem; height: 1.75rem; background: transparent; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; &:hover { background: var(--b3-theme-primary-light); } } .mini-volume-track { flex: 1; min-width: 0; max-width: 160px; display: flex; align-items: center; } }

        &.mode-compact {
            .mini-card { gap: 0.5rem; padding: 0.75rem; }
            .mini-cover { width: 4.5rem; height: 4.5rem; .cover-icon { font-size: 1.5rem; } }
            .mini-info { gap: 0.2rem; .mini-title { font-size: 1rem; } .mini-artist { font-size: 0.8rem; } .mini-album, .mini-lyric { display: none; } }
            .mini-volume-area { .mini-volume-track { display: none; } .mini-volume-mute, .mini-play-mode { width: 1.6rem; height: 1.6rem; } }
            .mini-primary-controls { gap: 0.6rem; button { width: 2rem; height: 2rem; } .mini-play-button { width: 2.5rem; height: 2.5rem; } }
            .mini-secondary-controls { gap: 0.6rem; button { width: 2rem; height: 2rem; } }
        }

        &.mode-micro {
            padding: 0.35rem;
            .mini-card { width: 100%; gap: 0.4rem; padding: 0.5rem; justify-content: center; }
            .mini-cover, .mini-album, .mini-lyric, .mini-volume-area, .mini-time { display: none; }
            .mini-info { flex: 0 0 auto; justify-content: center; gap: 0.15rem; .mini-title-row { max-width: 100%; } .mini-title { font-size: 0.95rem; } .mini-artist { font-size: 0.7rem; } .mini-favorite { width: 1.4rem; height: 1.4rem; font-size: 0.85rem; } }
            .mini-progress-area { margin-top: 0.1rem; .mini-progress { height: 2px; border-radius: 1px; } }
            .mini-primary-controls { gap: 0.5rem; margin-top: 0.2rem; button { width: 1.9rem; height: 1.9rem; } .mini-play-button { width: 2.4rem; height: 2.4rem; } }
            .mini-secondary-controls { gap: 0.5rem; button { width: 1.9rem; height: 1.9rem; } }
        }
    }
</style>
