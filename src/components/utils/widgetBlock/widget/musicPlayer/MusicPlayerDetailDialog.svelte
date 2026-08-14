<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import type { MusicPlayerActions, MusicPlayerVmStore, MusicTrack, MusicPlayerSortMode, MusicPlayerSortDirection, MusicPlayerViewMode, MusicPlaylist } from "./musicPlayerTypes";
    import { formatPlaybackTime } from "./musicPlayerUtils";
    import MusicPlayerIcon from "./MusicPlayerIcon.svelte";
    import MusicPlayerLyricsPanel from "./MusicPlayerLyricsPanel.svelte";
    import MusicPlayerLibraryPanel from "./MusicPlayerLibraryPanel.svelte";
    import MusicCloudLibraryPanel from "./MusicCloudLibraryPanel.svelte";
    import type { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
    import type { SubsonicEndpointState } from "./subsonic/subsonicEndpointManager";
    import MusicPlayerVolumeSlider from "./MusicPlayerVolumeSlider.svelte";
    import { getTrackKey } from "./musicPlaybackStatsStore";
    import type { PlaybackStatsTrackEntry } from "./musicPlaybackStatsStore";
    import Laptop from "@lucide/svelte/icons/laptop";
    import Globe2 from "@lucide/svelte/icons/globe-2";
    import Server from "@lucide/svelte/icons/server";

    interface Props {
        vmStore: MusicPlayerVmStore;
        actions: MusicPlayerActions;
        onClose: () => void;
        onRequestLightMetadata?: (indices: number[]) => void;
        getTrackStats?: (trackKey: string) => PlaybackStatsTrackEntry | undefined;
        musicFolderPath?: string;
        onQueueChange?: (indices: number[]) => void;
        onReplaceActiveQueue?: () => void;
        onAppendActiveQueue?: () => void;
        onAppendTrackToActiveQueue?: (originalIndex: number) => void;
        onOpenQueueDialog?: () => void;
        cloudProvider?: SubsonicMusicProvider | null;
        onRegisterCloudTracks?: (tracks: MusicTrack[]) => void;
        onPlayCloudTrack?: (track: MusicTrack) => void;
        onReplaceCloudQueue?: (tracks: MusicTrack[]) => void;
        onAppendCloudQueue?: (tracks: MusicTrack[]) => void;
    }

    let { vmStore, actions, onClose, onRequestLightMetadata, getTrackStats, musicFolderPath = "", onQueueChange, onReplaceActiveQueue, onAppendActiveQueue, onAppendTrackToActiveQueue, onOpenQueueDialog, cloudProvider = null, onRegisterCloudTracks, onPlayCloudTrack, onReplaceCloudQueue, onAppendCloudQueue }: Props = $props();

    let addMenuOpen = $state(false);
    let libraryReady = $state(false);
    let mobileSection = $state<"now" | "library">("now");
    let libraryReadyFrame1: number | null = null;
    let libraryReadyFrame2: number | null = null;
    let cloudEndpointState = $state<SubsonicEndpointState | null>(null);
    let unsubscribeCloudEndpoint: (() => void) | null = null;
    const activeCloudHealth = $derived(cloudEndpointState?.activeKind ? cloudEndpointState[cloudEndpointState.activeKind] : null);

    onMount(() => {
        if (cloudProvider) {
            unsubscribeCloudEndpoint = cloudProvider.endpointManager.subscribe((state) => {
                cloudEndpointState = state;
            });
        }
        libraryReadyFrame1 = requestAnimationFrame(() => {
            libraryReadyFrame1 = null;
            libraryReadyFrame2 = requestAnimationFrame(() => {
                libraryReady = true;
                libraryReadyFrame2 = null;
            });
        });
    });

    onDestroy(() => {
        unsubscribeCloudEndpoint?.();
        unsubscribeCloudEndpoint = null;
        if (libraryReadyFrame1 !== null) {
            cancelAnimationFrame(libraryReadyFrame1);
            libraryReadyFrame1 = null;
        }
        if (libraryReadyFrame2 !== null) {
            cancelAnimationFrame(libraryReadyFrame2);
            libraryReadyFrame2 = null;
        }
    });

    function isCurrentFavorite(): boolean {
        if (!currentTrack) return false;
        const key = getTrackKey(currentTrack);
        return vm.favoriteTrackKeys.includes(key);
    }

    const vm = $derived($vmStore);
    const currentTrack = $derived(vm.musicFiles[vm.currentTrackIndex]);
    const progressPercent = $derived(clampProgressPercent(vm.currentTime, vm.duration));

    interface LibraryVmSnapshot {
        musicFiles: MusicTrack[];
        currentTrackIndex: number;
        sortMode: MusicPlayerSortMode;
        sortDirection: MusicPlayerSortDirection;
        viewMode: MusicPlayerViewMode;
        selectedPlaylistId: string | null;
        favoriteTrackKeys: string[];
        playlists: MusicPlaylist[];
        statsVersion: number;
        activeQueueTrackKeys: string[];
        currentTrack: MusicTrack | undefined;
    }

    let libraryVmSnapshot = $state<LibraryVmSnapshot>({
        musicFiles: [],
        currentTrackIndex: 0,
        sortMode: "default",
        sortDirection: "asc",
        viewMode: "all",
        selectedPlaylistId: null,
        favoriteTrackKeys: [],
        playlists: [],
        statsVersion: 0,
        activeQueueTrackKeys: [],
        currentTrack: undefined,
    });

    $effect(() => {
        const vm = $vmStore;
        const prev = untrack(() => libraryVmSnapshot);
        if (
            prev.musicFiles !== vm.musicFiles ||
            prev.currentTrackIndex !== vm.currentTrackIndex ||
            prev.sortMode !== vm.sortMode ||
            prev.sortDirection !== vm.sortDirection ||
            prev.viewMode !== vm.viewMode ||
            prev.selectedPlaylistId !== vm.selectedPlaylistId ||
            prev.favoriteTrackKeys !== vm.favoriteTrackKeys ||
            prev.playlists !== vm.playlists ||
            prev.statsVersion !== vm.statsVersion ||
            prev.activeQueueTrackKeys !== vm.activeQueueTrackKeys ||
            prev.currentTrack !== currentTrack
        ) {
            libraryVmSnapshot = {
                musicFiles: vm.musicFiles,
                currentTrackIndex: vm.currentTrackIndex,
                sortMode: vm.sortMode,
                sortDirection: vm.sortDirection,
                viewMode: vm.viewMode,
                selectedPlaylistId: vm.selectedPlaylistId,
                favoriteTrackKeys: vm.favoriteTrackKeys,
                playlists: vm.playlists,
                statsVersion: vm.statsVersion,
                activeQueueTrackKeys: vm.activeQueueTrackKeys,
                currentTrack,
            };
        }
    });

    function clampProgressPercent(currentTime: number, duration: number): number {
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0;
        return Math.max(0, Math.min(100, (currentTime / duration) * 100));
    }
    const audioFormatInfo = $derived((() => {
        if (!currentTrack) return "";
        const parts: string[] = [];
        if (currentTrack.ext) parts.push(currentTrack.ext.slice(1).toUpperCase());
        if (currentTrack.sampleRate) {
            parts.push(`${(currentTrack.sampleRate / 1000).toFixed(1)}kHz`);
        } else if (currentTrack.metadataStatus === "loading") {
            parts.push("解析中");
        }
        if (currentTrack.bitrate) {
            parts.push(`${Math.round(currentTrack.bitrate / 1000)}kbps`);
        }
        return parts.join(" · ");
    })());

    function getPlayModeAlt(): string {
        switch (vm.playMode) {
            case "repeat":
                return "单曲循环";
            case "shuffle":
                return "随机播放";
            default:
                return "顺序播放";
        }
    }

    function formatServerName(serverType: string): string {
        const name = serverType.trim();
        return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : "Subsonic";
    }
</script>

 <div
    class="detail-dialog"
    class:has-cover={vm.showCover && !!currentTrack?.coverObjectUrl}
    style={vm.showCover && currentTrack?.coverObjectUrl ? `--cover-url: url(${currentTrack.coverObjectUrl})` : ""}
>
    <div class="detail-backdrop"></div>

    <div class="detail-header">
        <div class="detail-title-group">
            <h2 class="detail-title">{currentTrack?.title || "无音乐"}</h2>
            <span class="detail-format">{audioFormatInfo}</span>
        </div>
        {#if cloudProvider && cloudEndpointState}
            <div class="detail-connection-status" aria-label="音乐服务器连接状态" aria-live="polite">
                {#if cloudEndpointState.activeKind === "local"}
                    <span class="connection-badge active local" title="当前通过本地地址连接">
                        <Laptop size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>本地</span>
                    </span>
                {:else if cloudEndpointState.activeKind === "remote"}
                    <span class="connection-badge active remote" title="当前通过远程地址连接">
                        <Globe2 size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>远程</span>
                    </span>
                {:else}
                    <span class="connection-badge offline" title="音乐服务器当前未连接">未连接</span>
                {/if}
                {#if activeCloudHealth?.serverType}
                    <span class="connection-badge server" title="音乐服务器">
                        <Server size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>{formatServerName(activeCloudHealth.serverType)}</span>
                    </span>
                {/if}
                <span class="connection-badge latency" title={cloudEndpointState.local.safeError || "本地地址延迟"}>
                    <Laptop size={13} strokeWidth={2.2} aria-hidden="true" />
                    <span>{cloudEndpointState.local.status === "online" ? `${cloudEndpointState.local.latencyMs ?? "—"} ms` : "离线"}</span>
                </span>
                {#if cloudEndpointState.remote.configured}
                    <span class="connection-badge latency" title={cloudEndpointState.remote.safeError || "远程地址延迟"}>
                        <Globe2 size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>{cloudEndpointState.remote.status === "online" ? `${cloudEndpointState.remote.latencyMs ?? "—"} ms` : "离线"}</span>
                    </span>
                {/if}
            </div>
        {/if}
        <button class="detail-close" onclick={onClose} title="关闭" aria-label="关闭音乐播放器"><MusicPlayerIcon name="close" size={18} /></button>
    </div>

    <div class="detail-mobile-tabs" aria-label="详细播放器页面">
        <button class:active={mobileSection === "now"} onclick={() => mobileSection = "now"}>正在播放</button>
        <button class:active={mobileSection === "library"} onclick={() => mobileSection = "library"}>音乐库</button>
    </div>

    <div class="detail-body">
        <div class="detail-left" class:mobile-hidden={mobileSection !== "now"}>
            {#if vm.showCover}
                <div class="detail-cover">
                    {#if currentTrack?.coverObjectUrl}
                        <img src={currentTrack.coverObjectUrl} alt="封面" />
                    {:else}
                        <div class="cover-fallback"><MusicPlayerIcon name="musicNote" size={80} /></div>
                    {/if}
                </div>
            {/if}

            <div class="detail-meta">
                <h3 class="meta-title">{currentTrack?.title || "无音乐"}</h3>
                <p class="meta-line">{currentTrack?.artist || "未知艺术家"}</p>
                <p class="meta-line">{currentTrack?.album || "未知专辑"}</p>
            </div>

            {#if vm.showLyrics}
                <div class="detail-lyrics">
                    <MusicPlayerLyricsPanel
                        lyrics={currentTrack?.lyrics || []}
                        unsyncedLyricsText={currentTrack?.unsyncedLyricsText}
                        currentTime={vm.currentTime}
                        lyricsStatus={currentTrack?.lyricsStatus || "none"}
                    />
                </div>
            {/if}
        </div>

        <div class="detail-right" class:mobile-hidden={mobileSection !== "library"}>
            {#if libraryReady}
                {#if cloudProvider && onRegisterCloudTracks && onPlayCloudTrack && onReplaceCloudQueue && onAppendCloudQueue}
                <MusicCloudLibraryPanel
                    provider={cloudProvider}
                    currentTrack={libraryVmSnapshot.currentTrack}
                    onRegisterTracks={onRegisterCloudTracks}
                    onPlayTrack={onPlayCloudTrack}
                    onReplaceQueue={onReplaceCloudQueue}
                    onAppendQueue={onAppendCloudQueue}
                />
                {:else}
                <MusicPlayerLibraryPanel
                    musicFiles={libraryVmSnapshot.musicFiles}
                    currentTrackIndex={libraryVmSnapshot.currentTrackIndex}
                    playTrack={actions.playTrack}
                    onRequestLightMetadata={onRequestLightMetadata}
                    sortMode={libraryVmSnapshot.sortMode}
                    sortDirection={libraryVmSnapshot.sortDirection}
                    setSortMode={actions.setSortMode}
                    setSortDirection={actions.setSortDirection}
                    {getTrackStats}
                    viewMode={libraryVmSnapshot.viewMode}
                    selectedPlaylistId={libraryVmSnapshot.selectedPlaylistId}
                    favoriteTrackKeys={libraryVmSnapshot.favoriteTrackKeys}
                    playlists={libraryVmSnapshot.playlists}
                    toggleFavoriteTrack={actions.toggleFavoriteTrack}
                    setViewMode={actions.setViewMode}
                    selectPlaylist={actions.selectPlaylist}
                    createPlaylist={actions.createPlaylist}
                    renamePlaylist={actions.renamePlaylist}
                    deletePlaylist={actions.deletePlaylist}
                    addCurrentTrackToPlaylist={actions.addCurrentTrackToPlaylist}
                    addTrackToPlaylist={actions.addTrackToPlaylist}
                    removeTrackFromPlaylist={actions.removeTrackFromPlaylist}
                    exportPlaylistM3U8={actions.exportPlaylistM3U8}
                    importM3U8={actions.importM3U8}
                    exportLibraryJSON={actions.exportLibraryJSON}
                    importLibraryJSON={actions.importLibraryJSON}
                    syncLibraryState={actions.syncLibraryState}
                    {musicFolderPath}
                    currentTrack={libraryVmSnapshot.currentTrack}
                    statsVersion={libraryVmSnapshot.statsVersion}
                    onVisibleQueueChange={onQueueChange}
                    activeQueueTrackKeys={libraryVmSnapshot.activeQueueTrackKeys}
                    onReplaceActiveQueue={onReplaceActiveQueue}
                    onAppendActiveQueue={onAppendActiveQueue}
                    onAppendTrackToActiveQueue={onAppendTrackToActiveQueue}
                    onOpenQueueDialog={onOpenQueueDialog}
                />
                {/if}
            {:else}
                <div class="detail-library-placeholder"><MusicPlayerIcon name="musicNote" size={32} /><span>正在加载歌曲列表…</span></div>
            {/if}
        </div>
    </div>

    <div class="detail-footer">
        <button class="footer-mode" onclick={actions.togglePlayMode} title={getPlayModeAlt()}>
            <MusicPlayerIcon name={vm.playMode === "repeat" ? "repeatOne" : vm.playMode === "shuffle" ? "shuffle" : "listMusic"} size={16} />
        </button>

        <button class="footer-control" onclick={actions.prevTrack} title="上一曲" disabled={vm.musicFiles.length === 0}>
            <MusicPlayerIcon name="previous" size={18} />
        </button>

        <button class="footer-control play" onclick={actions.togglePlay} title={vm.isPlaying ? "暂停" : "播放"} disabled={vm.musicFiles.length === 0}>
            <MusicPlayerIcon name={vm.isPlaying ? "pause" : "play"} size={20} />
        </button>

        <button class="footer-control" onclick={actions.nextTrack} title="下一曲" disabled={vm.musicFiles.length === 0}>
            <MusicPlayerIcon name="next" size={18} />
        </button>

        <div
            class="footer-progress"
            onclick={actions.seekByMouse}
            role="slider"
            aria-valuenow={vm.currentTime}
            aria-valuemin={0}
            aria-valuemax={vm.duration}
            tabindex="0"
            onkeydown={actions.seekByKeyboard}
        >
            <div class="footer-progress-bar" style="width: {progressPercent}%"></div>
        </div>

        <span class="footer-time">{formatPlaybackTime(vm.currentTime, true)} / {formatPlaybackTime(vm.duration)}</span>

        <button class="footer-queue" onclick={onOpenQueueDialog} title="播放列表" disabled={vm.musicFiles.length === 0}>
            <MusicPlayerIcon name="queue" size={16} />
            {#if vm.activeQueueCount > 0}<span class="footer-queue-badge">{vm.activeQueueCount}</span>{/if}
        </button>

        <button class="footer-mute" onclick={actions.toggleMute} title={vm.isMuted ? "取消静音" : "静音"}>
            <MusicPlayerIcon name={vm.isMuted ? "volumeMuted" : "volume"} size={16} />
        </button>

        <div class="footer-volume-track">
            <MusicPlayerVolumeSlider
                volume={vm.volume}
                isMuted={vm.isMuted}
                oninput={actions.setVolume}
                onchange={actions.setVolumeChange}
            />
        </div>

        <button
            class="footer-favorite"
            class:is-favorite={isCurrentFavorite()}
            onclick={actions.toggleFavorite}
            title={isCurrentFavorite() ? "取消收藏" : "收藏"}
            disabled={!currentTrack}
        >
            <MusicPlayerIcon name={isCurrentFavorite() ? "heartFilled" : "heart"} size={16} />
        </button>

        <div class="footer-add-wrap">
            <button
                class="footer-add"
                onclick={() => (addMenuOpen = !addMenuOpen)}
                title="加入歌单"
                disabled={!currentTrack}
            >
                <MusicPlayerIcon name="queueAdd" size={16} />
            </button>
            {#if addMenuOpen}
                <div class="footer-add-menu" role="menu" tabindex="-1">
                    {#each vm.playlists as playlist (playlist.id)}
                        <button
                            class="footer-add-menu-item"
                            onclick={() => {
                                actions.addCurrentTrackToPlaylist(playlist.id);
                                addMenuOpen = false;
                            }}
                        >
                            {playlist.name}
                        </button>
                    {:else}
                        <span class="footer-add-menu-empty">暂无歌单</span>
                    {/each}
                </div>
            {/if}
        </div>

        <button class="footer-toggle" onclick={actions.toggleShowLyrics} title={vm.showLyrics ? "隐藏歌词" : "显示歌词"}>
            词
        </button>
        <button class="footer-toggle" onclick={actions.toggleShowCover} title={vm.showCover ? "隐藏封面" : "显示封面"}>
            封
        </button>
    </div>
</div>

<style lang="scss">
    .detail-dialog {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 24px;

        // 无封面：回退思源主题，不强行暗色
        --mp-detail-text: var(--b3-theme-on-surface);
        --mp-detail-muted: var(--b3-theme-on-surface-light);
        --mp-panel-bg: color-mix(in srgb, var(--b3-theme-surface) 38%, transparent);
        --mp-panel-bg-strong: color-mix(in srgb, var(--b3-theme-surface) 54%, transparent);
        --mp-panel-border: color-mix(in srgb, var(--b3-border-color) 50%, transparent);
        --mp-panel-highlight: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        --mp-current-accent: var(--b3-theme-primary);
        --mp-button-bg: color-mix(in srgb, var(--b3-theme-surface-light) 52%, transparent);
        --mp-button-border: color-mix(in srgb, var(--b3-border-color) 40%, transparent);
        --mp-button-hover-bg: var(--b3-theme-primary);
        --mp-button-hover-border: var(--b3-theme-primary);
        --mp-button-hover-text: var(--b3-theme-on-primary);
        --mp-active-bg: var(--b3-theme-primary);
        --mp-active-text: var(--b3-theme-on-primary);
        --mp-error-text: var(--b3-card-error-color, #dc2626);
        --mp-slider-track: var(--b3-border-color);
        --mp-slider-filled: var(--b3-theme-primary);
        --mp-slider-thumb: var(--b3-theme-primary);
        --mp-slider-thumb-border: var(--b3-theme-surface);

        color: var(--mp-detail-text);

        // 有封面：轻玻璃 + 高对比白字，保留模糊氛围
        &.has-cover {
            --mp-detail-text: rgba(255, 255, 255, 0.95);
            --mp-detail-muted: rgba(255, 255, 255, 0.78);
            --mp-panel-bg: rgba(8, 10, 14, 0.42);
            --mp-panel-bg-strong: rgba(8, 10, 14, 0.58);
            --mp-panel-border: rgba(255, 255, 255, 0.18);
            --mp-panel-highlight: rgba(255, 255, 255, 0.16);
            --mp-current-accent: rgba(255, 255, 255, 0.72);
            --mp-button-bg: rgba(8, 10, 14, 0.48);
            --mp-button-border: rgba(255, 255, 255, 0.24);
            --mp-button-hover-bg: rgba(255, 255, 255, 0.92);
            --mp-button-hover-border: rgba(255, 255, 255, 0.92);
            --mp-button-hover-text: #111827;
            --mp-active-bg: rgba(255, 255, 255, 0.92);
            --mp-active-text: #111827;
            --mp-error-text: #fecaca;
            --mp-slider-track: rgba(255, 255, 255, 0.30);
            --mp-slider-thumb: #fff;
            --mp-slider-thumb-border: rgba(0, 0, 0, 0.25);
        }

        // 第一层：封面放大模糊背景
        .detail-backdrop {
            position: absolute;
            inset: 0;
            background:
                var(--cover-url, none),
                var(--b3-theme-surface);
            background-size: cover;
            background-position: center;
            filter: blur(38px) brightness(0.56) saturate(1.2);
            transform: scale(1.12);
            z-index: 0;
        }

        // 第二层：暗角/渐变遮罩，保留封面色彩扩散
        &::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
                radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.06) 0%, transparent 42%),
                radial-gradient(circle at 15% 20%, rgba(0, 0, 0, 0.28) 0%, transparent 38%),
                radial-gradient(circle at 85% 15%, rgba(0, 0, 0, 0.32) 0%, transparent 40%),
                radial-gradient(ellipse at 50% 120%, rgba(0, 0, 0, 0.72) 0%, transparent 58%),
                linear-gradient(180deg, rgba(0, 0, 0, 0.40) 0%, rgba(0, 0, 0, 0.24) 45%, rgba(0, 0, 0, 0.52) 100%);
            z-index: 0;
        }

        .detail-header,
        .detail-mobile-tabs,
        .detail-body,
        .detail-footer {
            position: relative;
            z-index: 1;
        }

        // 顶部：透明渐变区域，不是硬分割栏
        .detail-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 1.25rem 1.5rem 0.75rem;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.08) 65%, transparent 100%);

            .detail-title-group {
                min-width: 0;

                .detail-title {
                    margin: 0;
                    font-size: 1.3rem;
                    font-weight: 700;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: var(--mp-detail-text);
                    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
                }

                .detail-format {
                    display: inline-block;
                    margin-top: 0.3rem;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: var(--mp-detail-muted);
                    background: var(--mp-panel-bg-strong);
                    padding: 0.2rem 0.55rem;
                    border-radius: 999px;
                    backdrop-filter: blur(8px);
                }
            }

            .detail-connection-status {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 0.3rem;
                min-width: max-content;
                padding-top: 0.05rem;
                white-space: nowrap;
            }

            .connection-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                min-height: 1.55rem;
                padding: 0.18rem 0.45rem;
                border: 1px solid var(--mp-panel-border);
                border-radius: 999px;
                background: var(--mp-button-bg);
                color: var(--mp-detail-text);
                font-size: 0.7rem;
                font-weight: 600;
                line-height: 1;
                box-sizing: border-box;
            }

            .connection-badge.active.local {
                border-color: rgba(74, 222, 128, 0.72);
                background: rgba(21, 128, 61, 0.72);
                color: #f0fdf4;
            }

            .connection-badge.active.remote {
                border-color: rgba(96, 165, 250, 0.78);
                background: rgba(29, 78, 216, 0.72);
                color: #eff6ff;
            }

            .connection-badge.offline {
                border-color: rgba(248, 113, 113, 0.72);
                background: rgba(153, 27, 27, 0.68);
                color: #fef2f2;
            }

            .detail-close {
                min-width: 44px;
                min-height: 44px;
                background: var(--mp-button-bg);
                border: 1px solid var(--mp-button-border);
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--mp-detail-text);
                cursor: pointer;
                padding: 0.35rem 0.7rem;
                border-radius: 10px;
                line-height: 1;
                backdrop-filter: blur(10px);
                transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;

                &:hover {
                    background: var(--mp-button-hover-bg);
                    border-color: var(--mp-button-hover-border);
                    color: var(--mp-button-hover-text);
                    transform: scale(1.05);
                }
            }

        }

        .detail-mobile-tabs {
            display: none;
        }

        .detail-body {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.25rem;
            padding: 0.75rem 1.5rem 1.25rem;
            overflow: hidden;
            background:
                radial-gradient(ellipse at 25% 50%, rgba(255, 255, 255, 0.07) 0%, transparent 48%),
                radial-gradient(ellipse at 75% 50%, rgba(0, 0, 0, 0.12) 0%, transparent 52%);

            @media (max-width: 720px) {
                grid-template-columns: 1fr;
                grid-template-rows: minmax(0, 1fr);
                padding: 0.5rem 0.75rem 0.75rem;
                overflow: hidden;

                .detail-left.mobile-hidden,
                .detail-right.mobile-hidden {
                    display: none;
                }
            }

            // 左右区域：轻玻璃表面，不靠硬边框分区
            .detail-left,
            .detail-right {
                border-radius: 20px;
                background: var(--mp-panel-bg);
                backdrop-filter: blur(22px) saturate(1.25);
                box-shadow:
                    inset 0 1px 1px rgba(255, 255, 255, 0.08),
                    0 12px 40px rgba(0, 0, 0, 0.16),
                    0 4px 12px rgba(0, 0, 0, 0.08);
                overflow: hidden;
            }

            .detail-left {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.85rem;
                padding: 1.25rem;

                .detail-cover {
                    width: 200px;
                    height: 200px;
                    border-radius: 16px;
                    overflow: hidden;
                    flex-shrink: 0;
                    background: linear-gradient(135deg, var(--b3-theme-primary-light), var(--b3-theme-surface-light));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);

                    img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }

                    .cover-fallback {
                        font-size: 5rem;
                        opacity: 0.75;
                        color: var(--mp-detail-text);
                    }
                }

                .detail-meta {
                    text-align: center;
                    width: 100%;

                    .meta-title {
                        margin: 0;
                        font-size: 1.15rem;
                        font-weight: 700;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        color: var(--mp-detail-text);
                    }

                    .meta-line {
                        margin: 0.25rem 0 0;
                        font-size: 0.875rem;
                        color: var(--mp-detail-muted);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;

                        &:first-of-type {
                            color: var(--mp-detail-text);
                            opacity: 0.88;
                            font-weight: 500;
                        }
                    }
                }

                .detail-lyrics {
                    flex: 1;
                    width: 100%;
                    min-height: 0;
                    background: var(--mp-panel-bg-strong);
                    border-radius: 16px;
                    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08);
                    overflow: hidden;
                }
            }

            .detail-right {
                min-width: 0;
                padding: 1rem;

                .detail-library-placeholder {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                    color: var(--mp-detail-muted);
                    font-size: 0.85rem;
                    user-select: none;
                }
            }
        }

        // 底部：悬浮柔和半透明底栏
        .detail-footer {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            margin: 0 1.5rem 1.25rem;
            padding: 0.6rem 1rem;
            border-radius: 18px;
            background: var(--mp-panel-bg-strong);
            backdrop-filter: blur(22px) saturate(1.25);
            box-shadow:
                inset 0 1px 1px rgba(255, 255, 255, 0.08),
                0 8px 24px rgba(0, 0, 0, 0.16);

            button {
                flex-shrink: 0;
                background: var(--mp-button-bg);
                border: 1px solid var(--mp-button-border);
                padding: 0.45rem;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--mp-detail-text);
                backdrop-filter: blur(8px);
                transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;

                &:hover:not(:disabled) {
                    background: var(--mp-button-hover-bg);
                    border-color: var(--mp-button-hover-border);
                    color: var(--mp-button-hover-text);
                    transform: scale(1.08);
                }

                &:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                &.footer-toggle {
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    min-width: 1.7rem;
                    min-height: 1.7rem;
                }
            }

            .footer-progress {
                flex: 1;
                min-width: 0;
                height: 5px;
                background: var(--mp-slider-track);
                border-radius: 3px;
                cursor: pointer;

                .footer-progress-bar {
                    height: 100%;
                    background: var(--mp-slider-filled);
                    border-radius: 3px;
                }
            }

            .footer-time {
                flex-shrink: 0;
                font-size: 0.75rem;
                font-weight: 500;
                color: var(--mp-detail-text);
                white-space: nowrap;
            }

            .footer-volume-track {
                flex-shrink: 0;
                width: 90px;
                display: flex;
                align-items: center;
            }

            .footer-favorite,
            .footer-add,
            .footer-queue {
                font-size: 1rem;
                min-width: 1.9rem;
                min-height: 1.9rem;
            }

            .footer-queue {
                position: relative;
            }

            .footer-queue-badge {
                position: absolute;
                top: -2px;
                right: -2px;
                font-size: 0.55rem;
                font-weight: 700;
                background: var(--mp-active-bg);
                color: var(--mp-active-text);
                border-radius: 999px;
                min-width: 1em;
                padding: 1px 3px;
                text-align: center;
                line-height: 1.2;
            }

            .footer-favorite.is-favorite {
                color: #e94e5a;
            }

            .footer-add-wrap {
                position: relative;
                flex-shrink: 0;
            }

            .footer-add-menu {
                position: absolute;
                bottom: calc(100% + 0.4rem);
                right: 0;
                min-width: 10rem;
                max-height: 12rem;
                overflow-y: auto;
                padding: 0.35rem;
                border: 1px solid var(--mp-panel-border, var(--b3-border-color));
                border-radius: 12px;
                background: var(--mp-panel-bg-strong, color-mix(in srgb, var(--b3-theme-surface-light) 85%, transparent));
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
                z-index: 10;
            }

            .footer-add-menu-item {
                width: 100%;
                padding: 0.55rem 0.7rem;
                border: none;
                border-radius: 8px;
                background: transparent;
                color: var(--mp-detail-text, var(--b3-theme-on-surface));
                font-size: 0.8rem;
                text-align: left;
                cursor: pointer;
                transition: background 0.15s ease;

                &:hover {
                    background: var(--mp-panel-bg, color-mix(in srgb, var(--b3-theme-surface) 55%, transparent));
                }
            }

            .footer-add-menu-empty {
                display: block;
                padding: 0.55rem 0.7rem;
                font-size: 0.8rem;
                color: var(--mp-detail-muted, var(--b3-theme-on-surface-light));
            }
        }

        @media (max-width: 720px) {
            .detail-header {
                gap: 0.4rem;
                padding: 0.8rem 0.9rem 0.45rem;

                .detail-connection-status {
                    gap: 0.18rem;
                }

                .connection-badge {
                    gap: 0.18rem;
                    min-height: 1.4rem;
                    padding: 0.14rem 0.32rem;
                    font-size: 0.64rem;
                }
            }

            .detail-mobile-tabs {
                display: flex;
                justify-content: center;
                gap: 0.4rem;
                padding: 0 0.75rem 0.35rem;

                button {
                    border: 0;
                    border-radius: 999px;
                    padding: 0.38rem 0.8rem;
                    background: var(--mp-button-bg);
                    color: var(--mp-detail-text);
                }

                button.active {
                    background: var(--mp-active-bg);
                    color: var(--mp-active-text);
                }
            }

            .detail-body .detail-left {
                height: 100%;
                overflow-y: auto;
                padding: 0.8rem;

                .detail-cover {
                    width: min(144px, 42vw);
                    height: min(144px, 42vw);
                }

                .detail-lyrics {
                    min-height: 9rem;
                }
            }

            .detail-body .detail-right {
                height: 100%;
                min-height: 0;
                padding: 0.65rem;
            }

            .detail-footer {
                flex-wrap: wrap;
                gap: 0.4rem;
                margin: 0 0.75rem 0.75rem;
                padding: 0.5rem 0.65rem;

                .footer-progress {
                    order: 2;
                    flex-basis: calc(100% - 7rem);
                }

                .footer-time {
                    order: 2;
                }

                .footer-volume-track {
                    display: none;
                }
            }
        }

        @media (max-width: 480px) {
            .detail-header {
                .connection-badge.active :global(svg),
                .connection-badge.server :global(svg) {
                    display: none;
                }
            }
        }

        }

    :global(.music-player-detail-dialog-host .b3-dialog__container) {
        overflow: hidden;
        padding: 0;
        background: transparent;
    }

    :global(.music-player-detail-dialog-host .b3-dialog__header:empty) {
        display: none;
    }

    :global(.music-player-detail-dialog-host .b3-dialog__content),
    :global(.music-player-detail-dialog-host .dialog-content) {
        min-width: 0;
        min-height: 0;
        padding: 0;
        overflow: hidden;
        scrollbar-gutter: auto;
    }
</style>
