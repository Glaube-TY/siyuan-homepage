<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { MusicTrack, MusicPlayerSortMode, MusicPlayerSortDirection, MusicPlayerViewMode } from "./musicPlayerTypes";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import type { PlaybackStatsTrackEntry } from "./musicPlaybackStatsStore";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";

    interface Props {
        musicFiles: MusicTrack[];
        displayFiles?: MusicTrack[];
        currentTrackIndex: number;
        playTrack: (index: number) => void;
        onRequestLightMetadata?: (indices: number[]) => void;
        sortMode?: MusicPlayerSortMode;
        sortDirection?: MusicPlayerSortDirection;
        setSortMode?: (mode: MusicPlayerSortMode) => void;
        setSortDirection?: (direction: MusicPlayerSortDirection) => void;
        getTrackStats?: (trackKey: string) => PlaybackStatsTrackEntry | undefined;
        favoriteTrackKeys?: string[];
        onToggleFavorite?: (trackKey: string) => void;
        viewMode?: MusicPlayerViewMode;
        selectedPlaylistId?: string | null;
        onRemoveFromPlaylist?: (playlistId: string, trackKey: string) => void;
        statsVersion?: number;
        onVisibleQueueChange?: (indices: number[]) => void;
        activeQueueTrackKeys?: string[];
        onReplaceActiveQueue?: () => void;
        onAppendActiveQueue?: () => void;
        onAppendTrackToActiveQueue?: (originalIndex: number) => void;
    }

    let {
        musicFiles, displayFiles, currentTrackIndex, playTrack, onRequestLightMetadata,
        sortMode = "default", sortDirection = "asc", setSortMode, setSortDirection,
        getTrackStats, favoriteTrackKeys = [], onToggleFavorite, viewMode = "all",
        selectedPlaylistId = null, onRemoveFromPlaylist, statsVersion = 0,
        onVisibleQueueChange, activeQueueTrackKeys = [],
        onReplaceActiveQueue, onAppendActiveQueue, onAppendTrackToActiveQueue,
    }: Props = $props();

    let searchQuery = $state("");
    let listScrollContainer: HTMLUListElement | null = $state(null);
    let pulseIndex = $state(-1);
    let scrollTop = $state(0);
    let viewportHeight = $state(0);
    let lastScrollResetKey = "";
    let lastVisibleQueueKey = "";

    const VIRTUAL_ROW_HEIGHT = 56;
    const VIRTUAL_OVERSCAN = 8;

    const SORT_LABELS: Record<MusicPlayerSortMode, string> = {
        default: "默认", title: "标题", artist: "艺术家", album: "专辑",
        duration: "时长", recent: "最近播放", plays: "播放次数",
    };

    const sourceFiles = $derived(displayFiles ?? musicFiles);
    const sourceOrderMap = $derived(new Map(sourceFiles.map((t, i) => [t, i])));
    const trackIndexMap = $derived(new Map(musicFiles.map((track, index) => [track, index])));

    function getOriginalIndex(track: MusicTrack): number {
        return trackIndexMap.get(track) ?? -1;
    }

    const filteredFiles = $derived(
        searchQuery.trim()
            ? sourceFiles.filter((track) => {
                  const q = searchQuery.toLowerCase();
                  return track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q) ||
                      track.album.toLowerCase().includes(q) || track.fileName.toLowerCase().includes(q);
              })
            : sourceFiles,
    );

    function getSourceOrder(track: MusicTrack): number {
        return sourceOrderMap.get(track) ?? -1;
    }

    function compareForMode(a: MusicTrack, b: MusicTrack, mode: MusicPlayerSortMode): number {
        const aSrc = getSourceOrder(a);
        const bSrc = getSourceOrder(b);
        switch (mode) {
            case "title": {
                const c = (a.title || a.baseName || a.fileName).localeCompare(b.title || b.baseName || b.fileName, undefined, { numeric: true, sensitivity: "base" });
                return c || aSrc - bSrc;
            }
            case "artist": {
                const c = (a.artist || "").localeCompare(b.artist || "", undefined, { numeric: true, sensitivity: "base" });
                return c || aSrc - bSrc;
            }
            case "album": {
                const c = (a.album || "").localeCompare(b.album || "", undefined, { numeric: true, sensitivity: "base" });
                return c || aSrc - bSrc;
            }
            case "duration": {
                const c = (a.duration || 0) - (b.duration || 0);
                return c || aSrc - bSrc;
            }
            case "recent": {
                const ar = getTrackStats?.(getTrackKey(a))?.lastPlayedAt || 0;
                const br = getTrackStats?.(getTrackKey(b))?.lastPlayedAt || 0;
                if (ar > 0 && br === 0) return -1;
                if (ar === 0 && br > 0) return 1;
                if (ar === 0 && br === 0) return aSrc - bSrc;
                return br - ar || aSrc - bSrc;
            }
            case "plays": {
                const ap = getTrackStats?.(getTrackKey(a))?.playCount || 0;
                const bp = getTrackStats?.(getTrackKey(b))?.playCount || 0;
                if (ap > 0 && bp === 0) return -1;
                if (ap === 0 && bp > 0) return 1;
                if (ap === 0 && bp === 0) return aSrc - bSrc;
                return bp - ap || aSrc - bSrc;
            }
            default: return aSrc - bSrc;
        }
    }

    const sortedFilteredFiles = $derived(
        (() => {
            void statsVersion;
            const sorted = [...filteredFiles].sort((a, b) => {
                const cmp = compareForMode(a, b, sortMode);
                if (sortMode === "recent" || sortMode === "plays") return cmp;
                return sortDirection === "desc" ? -cmp : cmp;
            });
            return sorted;
        })(),
    );

    const currentTrackVisibleInList = $derived(
        currentTrackIndex >= 0 && currentTrackIndex < musicFiles.length &&
        sortedFilteredFiles.some((t) => getOriginalIndex(t) === currentTrackIndex),
    );

    const visibleQueueIndices = $derived(sortedFilteredFiles.map((t) => getOriginalIndex(t)).filter((i) => i >= 0));

    const totalListHeight = $derived(sortedFilteredFiles.length * VIRTUAL_ROW_HEIGHT);
    const virtualStartIndex = $derived(clampStartIndex(Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN, sortedFilteredFiles.length));
    const virtualEndIndex = $derived(clampEndIndex(Math.ceil((scrollTop + viewportHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN, sortedFilteredFiles.length, virtualStartIndex));

    const LIGHT_METADATA_PRELOAD_COUNT = 20;
    const LIGHT_METADATA_OVERSCAN_BEFORE = 10;
    const LIGHT_METADATA_OVERSCAN_AFTER = 20;
    const metadataStartIndex = $derived(viewportHeight > 0 ? Math.max(0, virtualStartIndex - LIGHT_METADATA_OVERSCAN_BEFORE) : 0);
    const metadataEndIndex = $derived(viewportHeight > 0 ? Math.min(sortedFilteredFiles.length, virtualEndIndex + LIGHT_METADATA_OVERSCAN_AFTER) : Math.min(sortedFilteredFiles.length, LIGHT_METADATA_PRELOAD_COUNT));
    const visibleTrackIndices = $derived(sortedFilteredFiles.slice(metadataStartIndex, metadataEndIndex).map((t) => getOriginalIndex(t)).filter((i) => i >= 0));
    const virtualFiles = $derived(sortedFilteredFiles.slice(virtualStartIndex, virtualEndIndex));
    const virtualTopPadding = $derived(virtualStartIndex * VIRTUAL_ROW_HEIGHT);
    const virtualBottomPadding = $derived(Math.max(0, totalListHeight - virtualTopPadding - virtualFiles.length * VIRTUAL_ROW_HEIGHT));

    function clampStartIndex(value: number, max: number): number {
        return Math.max(0, Math.min(value, max));
    }

    function clampEndIndex(value: number, max: number, startIndex: number): number {
        return Math.max(startIndex, Math.min(value, max));
    }

    $effect(() => {
        const key = visibleQueueIndices.join(",");
        if (key !== lastVisibleQueueKey) {
            lastVisibleQueueKey = key;
            onVisibleQueueChange?.(visibleQueueIndices);
        }
    });

    const LIGHT_REQUEST_DEBOUNCE_MS = 300;
    let lastRequestedIndicesKey = "";
    let lightRequestDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    function buildIndicesKey(indices: number[]): string { return indices.join(","); }

    $effect(() => {
        if (!onRequestLightMetadata) return;
        const indices = visibleTrackIndices;
        const key = buildIndicesKey(indices);
        if (indices.length === 0 || key === lastRequestedIndicesKey) return;
        if (lightRequestDebounceTimer) clearTimeout(lightRequestDebounceTimer);
        lightRequestDebounceTimer = setTimeout(() => { lightRequestDebounceTimer = null; lastRequestedIndicesKey = key; onRequestLightMetadata?.(indices); }, LIGHT_REQUEST_DEBOUNCE_MS);
    });

    function updateViewportHeight() {
        viewportHeight = listScrollContainer?.clientHeight ?? 0;
    }

    onMount(() => {
        updateViewportHeight();
        window.addEventListener("resize", updateViewportHeight);
        return () => window.removeEventListener("resize", updateViewportHeight);
    });

    onDestroy(() => { if (lightRequestDebounceTimer) { clearTimeout(lightRequestDebounceTimer); lightRequestDebounceTimer = null; } });

    const scrollResetKey = $derived([
        searchQuery.trim(),
        sortMode,
        sortDirection,
        viewMode,
        selectedPlaylistId ?? "",
    ].join("|"));

    $effect(() => {
        const key = scrollResetKey;
        if (key === lastScrollResetKey) return;
        if (lastScrollResetKey === "") {
            lastScrollResetKey = key;
            return;
        }
        lastScrollResetKey = key;
        scrollTop = 0;
        if (listScrollContainer) listScrollContainer.scrollTop = 0;
    });

    function handleSortModeChange(e: Event) {
        const value = (e.currentTarget as HTMLSelectElement).value as MusicPlayerSortMode;
        setSortMode?.(value);
        if (value === "recent" || value === "plays") setSortDirection?.("desc");
    }

    function toggleSortDirection() { setSortDirection?.(sortDirection === "asc" ? "desc" : "asc"); }
    function handleKeydown(e: KeyboardEvent, index: number) { if (e.key === "Enter" || e.key === " ") playTrack(index); }
    function trackDisplayTitle(track: MusicTrack): string { return track.title || track.baseName || track.fileName; }
    function trackDisplaySubtitle(track: MusicTrack): string {
        const artist = track.artist?.trim() || "未知艺术家";
        const album = track.album?.trim();
        return album ? `${artist} · ${album}` : artist;
    }
    function isFavorite(track: MusicTrack): boolean { return favoriteTrackKeys.includes(getTrackKey(track)); }
    function trackPlayCount(track: MusicTrack): number { return getTrackStats?.(getTrackKey(track))?.playCount ?? 0; }

    function formatRecentTime(track: MusicTrack): string {
        const lastPlayed = getTrackStats?.(getTrackKey(track))?.lastPlayedAt || 0;
        if (!lastPlayed) return "未播放";
        const diff = Date.now() - lastPlayed;
        if (diff < 60000) return "刚刚";
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        const d = new Date(lastPlayed);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        if (d.toDateString() === today.toDateString()) return `今天 ${hm}`;
        if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
        return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
    }

    function handleToggleFavorite(e: Event, track: MusicTrack) { e.stopPropagation(); onToggleFavorite?.(getTrackKey(track)); }
    function handleRemoveFromPlaylist(e: Event, track: MusicTrack) { e.stopPropagation(); if (!selectedPlaylistId) return; onRemoveFromPlaylist?.(selectedPlaylistId, getTrackKey(track)); }

    function locateCurrentTrack() {
        if (!listScrollContainer || currentTrackIndex < 0 || !currentTrackVisibleInList) return;
        const displayIndex = sortedFilteredFiles.findIndex((t) => getOriginalIndex(t) === currentTrackIndex);
        if (displayIndex < 0) return;
        const target = displayIndex * VIRTUAL_ROW_HEIGHT - listScrollContainer.clientHeight / 2 + VIRTUAL_ROW_HEIGHT / 2;
        const maxScroll = Math.max(0, totalListHeight - listScrollContainer.clientHeight);
        listScrollContainer.scrollTo({ top: Math.max(0, Math.min(target, maxScroll)), behavior: "smooth" });
        pulseIndex = currentTrackIndex;
        const ti = currentTrackIndex;
        setTimeout(() => { if (pulseIndex === ti) pulseIndex = -1; }, 1200);
    }

    function isInActiveQueue(track: MusicTrack): boolean { return activeQueueTrackKeys.includes(getTrackKey(track)); }
    function handleAppendTrackToActiveQueue(e: Event, originalIndex: number) { e.stopPropagation(); onAppendTrackToActiveQueue?.(originalIndex); }
    const displayListEmpty = $derived(sortedFilteredFiles.length === 0);
</script>

<div class="playlist-panel">
    <div class="playlist-toolbar">
        <input type="text" class="playlist-search" placeholder="搜索歌曲、艺术家、专辑..." bind:value={searchQuery} />
        <button class="playlist-locate-btn" onclick={locateCurrentTrack} disabled={!currentTrackVisibleInList} title="定位当前播放" aria-label="定位当前播放"><MusicPlayerIcon name="locate" size={16} /></button>
        {#if onReplaceActiveQueue}
            <button class="playlist-queue-btn" onclick={onReplaceActiveQueue} disabled={displayListEmpty} title="播放当前列表" aria-label="播放当前列表"><MusicPlayerIcon name="play" size={16} /></button>
        {/if}
        {#if onAppendActiveQueue}
            <button class="playlist-queue-btn" onclick={onAppendActiveQueue} disabled={displayListEmpty} title="插入播放列表" aria-label="插入播放列表"><MusicPlayerIcon name="queueAdd" size={16} /></button>
        {/if}
        <div class="playlist-sort">
            <select class="playlist-sort-select" value={sortMode} onchange={handleSortModeChange}>
                {#each Object.entries(SORT_LABELS) as [mode, label]}<option value={mode}>{label}</option>{/each}
            </select>
            <button class="playlist-sort-direction" onclick={toggleSortDirection} title={sortDirection === "asc" ? "升序" : "降序"}><MusicPlayerIcon name={sortDirection === "asc" ? "sortAsc" : "sortDesc"} size={14} /></button>
        </div>
    </div>

    <ul class="playlist-list" bind:this={listScrollContainer} onscroll={(e) => { scrollTop = (e.currentTarget as HTMLUListElement).scrollTop; }}>
        {#if virtualTopPadding > 0}<li class="playlist-virtual-spacer" style="height:{virtualTopPadding}px" aria-hidden="true"></li>{/if}
        {#each virtualFiles as track, localIndex (track.filePath)}
            {@const displayIndex = virtualStartIndex + localIndex}
            {@const originalIndex = getOriginalIndex(track)}
            <li class="playlist-item" class:is-current={originalIndex === currentTrackIndex} class:pulse={pulseIndex === originalIndex} data-track-index={originalIndex}>
                <button class="playlist-track-button" onclick={() => { if (originalIndex >= 0) playTrack(originalIndex); }} onkeydown={(e) => { if (originalIndex >= 0) handleKeydown(e, originalIndex); }} disabled={originalIndex < 0}>
                    <span class="track-number">{displayIndex + 1}</span>
                    <span class="track-info"><span class="track-title">{trackDisplayTitle(track)}</span><span class="track-subtitle">{trackDisplaySubtitle(track)}</span></span>
                    <span class="track-meta-right">
                        <span class="track-duration">{track.metadataStatus === "loading" ? "解析中" : formatPlaybackTime(track.duration)}</span>
                        {#if sortMode === "recent"}<span class="track-recent-time">{formatRecentTime(track)}</span>{/if}
                        {#if sortMode === "plays"}<span class="track-play-count">{trackPlayCount(track)} 次</span>{/if}
                    </span>
                </button>
                <span class="track-actions" role="group" aria-label="歌曲操作">
                    {#if onToggleFavorite}
                        <span class="track-favorite" class:is-favorite={isFavorite(track)} onclick={(e) => handleToggleFavorite(e, track)} title={isFavorite(track) ? "取消收藏" : "收藏"} aria-label={isFavorite(track) ? "取消收藏" : "收藏"} role="button" tabindex="0" onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggleFavorite(e, track); } }}><MusicPlayerIcon name={isFavorite(track) ? "heartFilled" : "heart"} size={15} /></span>
                    {/if}
                    {#if viewMode === "playlists" && selectedPlaylistId && onRemoveFromPlaylist}
                        <span class="track-remove" onclick={(e) => handleRemoveFromPlaylist(e, track)} title="从歌单移除" aria-label="从歌单移除" role="button" tabindex="0" onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRemoveFromPlaylist(e, track); } }}><MusicPlayerIcon name="remove" size={15} /></span>
                    {/if}
                    {#if onAppendTrackToActiveQueue && originalIndex >= 0}
                        <span class="track-add-queue" class:in-queue={isInActiveQueue(track)} onclick={(e) => handleAppendTrackToActiveQueue(e, originalIndex)} title={isInActiveQueue(track) ? "已在播放列表" : "加入播放列表"} aria-label={isInActiveQueue(track) ? "已在播放列表" : "加入播放列表"} role="button" tabindex="0" onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleAppendTrackToActiveQueue(e, originalIndex); } }}><MusicPlayerIcon name={isInActiveQueue(track) ? "check" : "queueAdd"} size={15} /></span>
                    {/if}
                </span>
            </li>
        {/each}
        {#if virtualBottomPadding > 0}<li class="playlist-virtual-spacer" style="height:{virtualBottomPadding}px" aria-hidden="true"></li>{/if}
    </ul>

    {#if sortedFilteredFiles.length === 0}<div class="playlist-empty">未找到匹配的歌曲</div>{/if}
</div>

<style lang="scss">
    .playlist-panel {
        *, *::before, *::after { box-sizing: border-box; }
        width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;
        .playlist-toolbar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
        .playlist-search {
            flex: 1; min-width: 0; padding: 0.6rem 0.9rem; border: 1px solid transparent; border-radius: 12px;
            background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
            color: var(--mp-detail-text, var(--b3-theme-on-surface)); font-size: 0.85rem; box-sizing: border-box; transition: background 0.15s ease, border-color 0.15s ease;
            &::placeholder { color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
            &:focus { outline: none; background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent)); border-color: var(--mp-panel-border, var(--b3-border-color)); }
        }
        .playlist-locate-btn, .playlist-queue-btn {
            flex-shrink: 0; width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
            border: 1px solid transparent; border-radius: 10px;
            background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
            color: var(--mp-detail-text, var(--b3-theme-on-surface)); cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
            &:hover:not(:disabled) { background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent)); border-color: var(--mp-panel-border, var(--b3-border-color)); }
            &:disabled { opacity: 0.35; cursor: not-allowed; }
        }
        .playlist-locate-btn { font-size: 0.9rem; }
        .playlist-queue-btn { font-size: 0.85rem; }
        .playlist-sort {
            flex-shrink: 0; display: flex; align-items: center; gap: 0.35rem;
            .playlist-sort-select { padding: 0.55rem 0.6rem; border: 1px solid transparent; border-radius: 10px; background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent)); color: var(--mp-detail-text, var(--b3-theme-on-surface)); font-size: 0.8rem; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; &:focus { outline: none; background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent)); border-color: var(--mp-panel-border, var(--b3-border-color)); } }
            .playlist-sort-direction { width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 10px; background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent)); color: var(--mp-detail-text, var(--b3-theme-on-surface)); font-size: 0.85rem; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; &:hover { background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent)); } }
        }
        .playlist-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; overflow-anchor: none; flex: 1; }
        .playlist-virtual-spacer {
            list-style: none; flex-shrink: 0; pointer-events: none; border: none; background: transparent;
        }
        .playlist-item {
            position: relative;
            height: 56px; box-sizing: border-box; border-radius: 10px; overflow: hidden; margin-bottom: 0; transition: background 0.15s ease;
            &.is-current { background: linear-gradient(90deg, var(--mp-panel-highlight, color-mix(in srgb, var(--b3-theme-primary) 16%, transparent)) 0%, transparent 85%); .playlist-track-button { color: var(--mp-detail-text, var(--b3-theme-on-surface)); font-weight: 600; } .track-number { color: var(--mp-current-accent, var(--b3-theme-primary)); font-weight: 700; } .track-subtitle { color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); opacity: 1; } .track-duration { color: var(--mp-current-accent, var(--b3-theme-primary)); font-weight: 600; } }
        }
        .playlist-track-button {
            width: 100%; height: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.65rem; background: transparent; border: none; color: var(--mp-detail-text, var(--b3-theme-on-surface)); text-align: left; cursor: pointer; border-radius: 10px; transition: background 0.15s ease;
            &:hover { background: var(--mp-panel-highlight, color-mix(in srgb, var(--b3-theme-primary) 10%, transparent)); }
            &:disabled { opacity: 0.4; cursor: not-allowed; }
            .track-number { width: 1.5rem; flex-shrink: 0; font-size: 0.75rem; text-align: center; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
            .track-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
            .track-title { font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .track-subtitle { font-size: 0.75rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .track-meta-right { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; transition: transform 0.16s ease; }
            .track-duration { flex-shrink: 0; font-size: 0.75rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
            .track-recent-time { flex-shrink: 0; font-size: 0.7rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); min-width: 4.5rem; text-align: right; white-space: nowrap; }
            .track-play-count { flex-shrink: 0; min-width: 2.5rem; text-align: right; font-size: 0.75rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); }
        }
        .track-actions {
            position: absolute;
            right: 0.65rem;
            top: 50%;
            transform: translateY(-50%) translateX(8px);
            display: flex;
            align-items: center;
            gap: 0.2rem;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
            z-index: 2;
            .track-favorite, .track-remove, .track-add-queue { flex-shrink: 0; width: 1.6rem; height: 1.6rem; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 0.9rem; color: var(--mp-detail-muted, var(--b3-theme-on-surface-light)); cursor: pointer; transition: background 0.15s ease, color 0.15s ease; &:hover { background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 70%, transparent)); color: var(--mp-detail-text, var(--b3-theme-on-surface)); } }
            .track-favorite.is-favorite { color: #e94e5a; }
            .track-add-queue.in-queue { color: var(--mp-current-accent, var(--b3-theme-primary)); }
        }
        .playlist-item:hover .track-meta-right,
        .playlist-item:focus-within .track-meta-right { transform: translateX(-5.25rem); }
        .playlist-item:hover .track-actions,
        .playlist-item:focus-within .track-actions { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(-50%) translateX(0); }
        .playlist-empty { padding: 1.25rem 1rem; text-align: center; font-size: 0.9rem; font-weight: 500; color: var(--mp-detail-text, var(--b3-theme-on-surface)); background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 70%, transparent)); border-radius: 12px; }
        @keyframes playlist-pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
        .playlist-item.pulse { animation: playlist-pulse 0.6s ease-in-out 2; }
        @media (prefers-reduced-motion: reduce) {
            .track-actions, .track-meta-right { transition: none; }
        }
    }
</style>
