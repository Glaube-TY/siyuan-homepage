<script lang="ts">
    import { onMount, onDestroy, mount, untrack } from "svelte";
    import { Howl } from "howler";
    import { svelteDialog } from "@/libs/dialog";
    import { canUseElectronLocalFileSystem } from "@/components/tools/runtimeEnv";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import MusicPlayerMini from "./MusicPlayerMini.svelte";
    import MusicPlayerDetailDialog from "./MusicPlayerDetailDialog.svelte";
    import MusicPlayerQueueDialog from "./MusicPlayerQueueDialog.svelte";
    import {
        safeParseMusicPlayerConfig,
        normalizeTrackIndex,
        getAudioFilesFromDirectory,
    } from "./musicPlayerUtils";
    import {
        loadMetadataForTrack,
        revokeTrackCoverObjectUrls,
        loadExternalCoverForTrack,
        loadLightMetadataForIndex,
    } from "./musicMetadataService";
    import { MusicMetadataIndexStore } from "./musicMetadataIndexStore";
    import type { MusicMetadataIndexEntry } from "./musicMetadataIndexStore";
    import {
        registerMusicPlayerIndexController,
        unregisterMusicPlayerIndexController,
    } from "./musicPlayerIndexController";
    import type { MusicPlayerIndexActionResult } from "./musicPlayerIndexController";
    import { loadLyricsForTrack } from "./musicLyricsService";
    import { writable } from "svelte/store";
    import type { MusicTrack, MusicPlayerViewModel, MusicPlayerActions, MusicPlayerVmStore, MusicMetadataLoadMode, MusicPlayerSortMode, MusicPlayerSortDirection, MusicPlayerViewMode, MusicPlaylist, MusicMetadataIndexProgress } from "./musicPlayerTypes";
    import { DEFAULT_MUSIC_METADATA_INDEX_PROGRESS } from "./musicPlayerTypes";
    import { MusicPlaybackStatsStore, getTrackKey } from "./musicPlaybackStatsStore";
    import { MusicLibraryStore } from "./musicLibraryStore";
    import { registerFloatingMiniHost, unregisterFloatingMiniHost } from "./musicFloatingMiniManager";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const initialConfig = untrack(() => safeParseMusicPlayerConfig(contentTypeJson));
    const initialParsed = untrack(() => {
        try {
            return JSON.parse(contentTypeJson || "{}") as Record<string, unknown>;
        } catch {
            return {} as Record<string, unknown>;
        }
    });
    const musicFolderPath = initialConfig.musicFolderPath;
    const blockId = typeof initialParsed.blockId === "string" ? initialParsed.blockId : "";

    let destroyed = false;
    let loadToken = 0;
    let playSessionId = 0;
    let countedPlaySessionId = -1;
    let detailDialogRef: { close: () => void } | null = null;
    let queueDialogRef: { close: () => void } | null = null;
    let detailDialogOpen = $state(false);

    interface MetadataQueueItem {
        index: number;
        mode: MusicMetadataLoadMode;
        reason: string;
    }

    let metadataQueue: MetadataQueueItem[] = [];
    let metadataQueueRunning = false;

    let lightIndexQueue: number[] = [];
    let lightIndexQueueRunning = false;

    let playMode = $state(initialConfig.playMode);
    let isMuted = $state(initialConfig.isMuted);
    let volume = $state(initialConfig.volume);
    let autoPlay = $state(initialConfig.autoPlay);
    let showLyrics = $state(initialConfig.showLyrics);
    let showCover = $state(initialConfig.showCover);
    let scanSubfolders = $state(initialConfig.scanSubfolders);
    let parseMetadata = $state(initialConfig.parseMetadata);
    let sortMode = $state(initialConfig.sortMode);
    let sortDirection = $state(initialConfig.sortDirection);
    let showFloatingMini = $state(initialConfig.showFloatingMini);

    let statsStore: MusicPlaybackStatsStore | null = null;
    let libraryStore: MusicLibraryStore | null = null;
    let metadataIndexStore: MusicMetadataIndexStore | null = null;
    let statsVersion = $state(0);
    let viewMode = $state<MusicPlayerViewMode>("all");
    let selectedPlaylistId = $state<string | null>(null);
    let currentQueueIndices = $state<number[]>([]);
    let favoriteTrackKeys = $state<string[]>([]);
    let playlists = $state<MusicPlaylist[]>([]);
    let activeQueueTrackKeys = $state<string[]>([]);
    let activeQueueCount = $state(0);
    let metadataIndexProgress = $state<MusicMetadataIndexProgress>(DEFAULT_MUSIC_METADATA_INDEX_PROGRESS);

    let musicFiles = $state<MusicTrack[]>([]);
    let currentTrackIndex = $state(
        Number.isFinite(initialConfig.currentTrackIndex) ? initialConfig.currentTrackIndex : 0,
    );

    let sound: Howl | null = null;
    let isPlaying = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let displayMetadataTimer: ReturnType<typeof setTimeout> | null = null;

    let advancedEnabled = $state(false);
    let runtimeUnsupported = $state(false);
    let unavailableTitle = $state("仅桌面端支持");
    let runtimeMessage = $state("");
    let errorMessage = $state("");
    let scanTruncated = $state(false);

    const hasMusicFiles = $derived(musicFiles.length > 0);
    const currentTrack = $derived(musicFiles[currentTrackIndex]);
    const trackKeyToIndex = $derived(new Map(musicFiles.map((t, i) => [getTrackKey(t), i])));

    $effect(() => {
        // 当视图上下文变化时清空显示队列，避免关闭弹窗后仍使用旧的搜索/排序队列
        void viewMode;
        void selectedPlaylistId;
        currentQueueIndices = [];
    });

    function getQueueIndices(): number[] {
        // 优先使用 activeQueue
        const activeIndices = getActiveQueueIndices();
        if (activeIndices.length > 0) return activeIndices;
        // 回退到当前显示队列
        if (currentQueueIndices.length > 0) {
            return currentQueueIndices;
        }
        if (viewMode === "favorites") {
            return favoriteTrackKeys
                .map((k) => trackKeyToIndex.get(k))
                .filter((i): i is number => i !== undefined);
        }
        if (viewMode === "playlists") {
            const playlist = playlists.find((p) => p.id === selectedPlaylistId);
            if (!playlist) return [];
            return playlist.trackKeys
                .map((k) => trackKeyToIndex.get(k))
                .filter((i): i is number => i !== undefined);
        }
        return musicFiles.map((_, i) => i);
    }

    function getActiveQueueIndices(): number[] {
        if (activeQueueTrackKeys.length === 0) return [];
        return activeQueueTrackKeys
            .map((k) => trackKeyToIndex.get(k))
            .filter((i): i is number => i !== undefined);
    }

    function ensureTrackInActiveQueue(index: number): void {
        if (!libraryStore) return;
        if (index < 0 || index >= musicFiles.length) return;
        const trackKey = getTrackKey(musicFiles[index]);
        if (activeQueueTrackKeys.includes(trackKey)) return;
        libraryStore.appendToActiveQueue([trackKey]);
        syncLibraryState();
    }

    const vm: MusicPlayerViewModel = $derived({
        musicFiles,
        currentTrackIndex,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        playMode,
        showLyrics,
        showCover,
        errorMessage,
        scanTruncated,
        sortMode,
        sortDirection,
        viewMode,
        selectedPlaylistId,
        favoriteTrackKeys,
        playlists,
        statsVersion,
        activeQueueTrackKeys,
        activeQueueCount,
        detailDialogOpen,
        metadataIndexProgress,
    });

    function submitStatsSession(completed: boolean): void {
        if (statsStore && sound) {
            try {
                const pos = sound.seek() as number;
                if (Number.isFinite(pos)) statsStore.tick(pos);
            } catch {
                // 忽略 seek 失败
            }
        }
        const wrote = statsStore?.endSession(completed) ?? false;
        if (wrote) statsVersion += 1;
    }

    const vmStore: MusicPlayerVmStore = writable<MusicPlayerViewModel>({
        musicFiles: [],
        currentTrackIndex: 0,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 0.5,
        isMuted: false,
        playMode: "order",
        showLyrics: true,
        showCover: true,
        errorMessage: "",
        scanTruncated: false,
        sortMode: "default",
        sortDirection: "asc",
        viewMode: "all",
        selectedPlaylistId: null,
        favoriteTrackKeys: [],
        playlists: [],
        statsVersion: 0,
        activeQueueTrackKeys: [],
        activeQueueCount: 0,
        detailDialogOpen: false,
        metadataIndexProgress: DEFAULT_MUSIC_METADATA_INDEX_PROGRESS,
    });
    $effect(() => {
        vmStore.set(vm);
    });

    const actions: MusicPlayerActions = {
        play: () => {
            if (!sound || sound.state() !== "loaded") {
                cleanup();
                ensureTrackInActiveQueue(currentTrackIndex);
                submitStatsSession(false);
                ensureTrackLoaded(currentTrackIndex, true, true);
            } else {
                ensureTrackInActiveQueue(currentTrackIndex);
                safePlay(sound, playSessionId);
            }
        },
        pause: () => sound?.pause(),
        togglePlay: () => {
            if (isPlaying) {
                sound?.pause();
            } else {
                if (!sound || sound.state() !== "loaded") {
                    cleanup();
                    ensureTrackInActiveQueue(currentTrackIndex);
                    submitStatsSession(false);
                    ensureTrackLoaded(currentTrackIndex, true, true);
                } else {
                    ensureTrackInActiveQueue(currentTrackIndex);
                    safePlay(sound, playSessionId);
                }
            }
        },
        nextTrack: () => {
            if (!hasMusicFiles) return;
            submitStatsSession(false);
            advanceToNextTrack(true);
            saveConfig();
        },
        prevTrack: () => {
            if (!hasMusicFiles) return;
            submitStatsSession(false);
            advanceToPrevTrack(true);
            saveConfig();
        },
        playTrack: (index: number) => {
            if (!hasMusicFiles) return;
            const safeIndex = normalizeTrackIndex(index, musicFiles.length);
            ensureTrackInActiveQueue(safeIndex);
            submitStatsSession(false);
            ensureTrackLoaded(safeIndex, true, true);
            saveConfig();
        },
        seekByMouse: (e: MouseEvent) => {
            if (!sound || !duration) return;
            const target = e.currentTarget as HTMLElement;
            const progress = e.offsetX / target.offsetWidth;
            const seekTime = progress * duration;
            sound.seek(seekTime);
            currentTime = seekTime;
        },
        seekByKeyboard: (e: KeyboardEvent) => {
            if (!sound || !duration) return;
            let delta = 0;
            if (e.key === "ArrowLeft") delta = -5;
            else if (e.key === "ArrowRight") delta = 5;
            else return;
            e.preventDefault();
            const newTime = Math.max(0, Math.min(duration, (sound.seek() as number) + delta));
            sound.seek(newTime);
            currentTime = newTime;
        },
        setVolume: (e: Event) => {
            const vol = parseFloat((e.target as HTMLInputElement).value);
            if (!Number.isFinite(vol)) return;
            volume = vol;
            if (sound) sound.volume(volume);
            // 静音时拖动音量且音量大于 0，自动取消静音
            if (vol > 0 && isMuted) {
                isMuted = false;
                if (sound) sound.mute(false);
            }
        },
        setVolumeChange: () => {
            saveConfig();
        },
        toggleMute: () => {
            isMuted = !isMuted;
            if (sound) sound.mute(isMuted);
            saveConfig();
        },
        togglePlayMode: () => {
            if (playMode === "order") {
                playMode = "repeat";
            } else if (playMode === "repeat") {
                playMode = "shuffle";
            } else {
                playMode = "order";
            }
            saveConfig();
        },
        toggleShowLyrics: () => {
            const next = !showLyrics;
            showLyrics = next;
            saveConfig();
            if (next) {
                enqueueCurrentDisplayMetadata("toggle-lyrics");
            }
        },
        toggleShowCover: () => {
            const next = !showCover;
            showCover = next;
            saveConfig();
            if (next) {
                enqueueCurrentDisplayMetadata("toggle-cover");
            }
        },
        setSortMode: (mode: MusicPlayerSortMode) => {
            sortMode = mode;
            saveConfig();
        },
        setSortDirection: (direction: MusicPlayerSortDirection) => {
            sortDirection = direction;
            saveConfig();
        },
        toggleFavorite: () => {
            if (!currentTrack || !libraryStore) return;
            const trackKey = getTrackKey(currentTrack);
            libraryStore.toggleFavorite(trackKey);
            syncLibraryState();
        },
        toggleFavoriteTrack: (trackKey: string) => {
            if (!libraryStore) return;
            libraryStore.toggleFavorite(trackKey);
            syncLibraryState();
        },
        setViewMode: (mode: MusicPlayerViewMode) => {
            viewMode = mode;
        },
        selectPlaylist: (id: string | null) => {
            selectedPlaylistId = id;
            viewMode = "playlists";
        },
        createPlaylist: (name: string) => {
            const playlist = libraryStore?.createPlaylist(name);
            if (!playlist) return null;
            syncLibraryState();
            return playlist.id;
        },
        renamePlaylist: (id: string, name: string) => {
            const ok = libraryStore?.renamePlaylist(id, name) ?? false;
            if (ok) syncLibraryState();
            return ok;
        },
        deletePlaylist: (id: string) => {
            const ok = libraryStore?.deletePlaylist(id) ?? false;
            if (ok) {
                if (selectedPlaylistId === id) selectedPlaylistId = null;
                syncLibraryState();
            }
            return ok;
        },
        addCurrentTrackToPlaylist: (playlistId: string) => {
            if (!currentTrack) return false;
            const trackKey = getTrackKey(currentTrack);
            const ok = libraryStore?.addTrackToPlaylist(playlistId, trackKey) ?? false;
            if (ok) syncLibraryState();
            return ok;
        },
        addTrackToPlaylist: (playlistId: string, trackKey: string) => {
            const ok = libraryStore?.addTrackToPlaylist(playlistId, trackKey) ?? false;
            if (ok) syncLibraryState();
            return ok;
        },
        removeTrackFromPlaylist: (playlistId: string, trackKey: string) => {
            const ok = libraryStore?.removeTrackFromPlaylist(playlistId, trackKey) ?? false;
            if (ok) syncLibraryState();
            return ok;
        },
        exportPlaylistM3U8: (playlistId: string, pathMode: "absolute" | "relative") => {
            return libraryStore?.exportPlaylistToM3U8(playlistId, musicFiles, initialConfig.musicFolderPath, pathMode) ?? null;
        },
        importM3U8: (text: string) => {
            return libraryStore?.importM3U8(text, musicFiles, initialConfig.musicFolderPath) ?? null;
        },
        exportLibraryJSON: () => {
            return libraryStore?.exportLibraryToJSON() ?? "{}";
        },
        importLibraryJSON: (text: string) => {
            const result = libraryStore?.importLibraryJSON(text) ?? null;
            if (result) syncLibraryState();
            return result;
        },
        syncLibraryState,
        replaceActiveQueueFromIndices: (indices: number[]) => {
            if (!libraryStore) return;
            const seen = new Set<string>();
            const validIndices: number[] = [];
            for (const i of indices) {
                if (i < 0 || i >= musicFiles.length) continue;
                const key = getTrackKey(musicFiles[i]);
                if (seen.has(key)) continue;
                seen.add(key);
                validIndices.push(i);
            }
            if (validIndices.length === 0) return;
            const keys = validIndices.map((i) => getTrackKey(musicFiles[i]));
            libraryStore.replaceActiveQueue(keys);
            syncLibraryState();
            // 播放当前列表第一首
            const firstIdx = validIndices[0];
            submitStatsSession(false);
            ensureTrackLoaded(firstIdx, true, true);
            saveConfig();
        },
        appendActiveQueueFromIndices: (indices: number[]) => {
            if (!libraryStore) return;
            const seen = new Set<string>();
            const keys: string[] = [];
            for (const i of indices) {
                if (i < 0 || i >= musicFiles.length) continue;
                const key = getTrackKey(musicFiles[i]);
                if (seen.has(key)) continue;
                seen.add(key);
                keys.push(key);
            }
            if (keys.length === 0) return;
            libraryStore.appendToActiveQueue(keys);
            syncLibraryState();
        },
        appendTrackToActiveQueue: (index: number) => {
            if (!libraryStore) return;
            if (index < 0 || index >= musicFiles.length) return;
            libraryStore.appendToActiveQueue([getTrackKey(musicFiles[index])]);
            syncLibraryState();
        },
        removeTrackFromActiveQueue: (trackKey: string) => {
            if (!libraryStore) return;
            libraryStore.removeFromActiveQueue(trackKey);
            const keepCurrent = (isPlaying || (sound && sound.state() === "loaded")) && currentTrack;
            if (keepCurrent && libraryStore.getActiveQueueTrackKeys().length === 0) {
                libraryStore.appendToActiveQueue([getTrackKey(currentTrack)]);
            }
            syncLibraryState();
        },
        clearActiveQueue: () => {
            if (!libraryStore) return;
            libraryStore.clearActiveQueue();
            const keepCurrent = (isPlaying || (sound && sound.state() === "loaded")) && currentTrack;
            if (keepCurrent) {
                libraryStore.appendToActiveQueue([getTrackKey(currentTrack)]);
            }
            syncLibraryState();
        },
        openActiveQueueDialog: () => {
            openActiveQueueDialog();
        },
        openDetailDialog: () => {
            openDetailDialog();
        },
        seekTo: (time: number) => {
            if (!sound || !duration || !Number.isFinite(time)) return;
            const clamped = Math.max(0, Math.min(time, duration));
            sound.seek(clamped);
            currentTime = clamped;
        },
    };

    function syncLibraryState() {
        if (!libraryStore) return;
        favoriteTrackKeys = libraryStore.getFavorites();
        playlists = libraryStore.getPlaylists();
        activeQueueTrackKeys = libraryStore.getActiveQueueTrackKeys();
        activeQueueCount = libraryStore.getActiveQueueCount();
    }

    function clearProgressInterval() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }

    function startProgressTimerForSound(targetSound: Howl, targetSessionId: number) {
        clearProgressInterval();
        progressInterval = setInterval(() => {
            if (sound !== targetSound || playSessionId !== targetSessionId || !isPlaying || destroyed) {
                return;
            }
            const pos = targetSound.seek() as number;
            if (Number.isFinite(pos)) {
                currentTime = pos;
                statsStore?.tick(pos);
            }
        }, 1000);
    }

    function cancelScheduledDisplayMetadata() {
        if (displayMetadataTimer) {
            clearTimeout(displayMetadataTimer);
            displayMetadataTimer = null;
        }
    }

    function scheduleCurrentDisplayMetadata(reason: string) {
        if (!parseMetadata || !currentTrack) return;
        if (!showCover && !showLyrics) return;
        if (!needsFullMetadataForCurrentOptions(currentTrack)) return;
        cancelScheduledDisplayMetadata();
        displayMetadataTimer = setTimeout(() => {
            displayMetadataTimer = null;
            enqueueMetadataForTrack(currentTrackIndex, "full", reason);
        }, 500);
    }

    onMount(async () => {
        advancedEnabled = plugin.ADVANCED;

        if (advancedEnabled) {
            if (!canUseElectronLocalFileSystem()) {
                runtimeUnsupported = true;
                unavailableTitle = "仅桌面端支持";
                runtimeMessage = "音乐播放器需要访问本地音乐文件夹，该功能仅支持思源桌面端使用。网页端、Docker 和移动端无法直接读取本地文件夹。";
                return;
            }

            if (blockId) {
                statsStore = new MusicPlaybackStatsStore(plugin, blockId);
                await statsStore.load();
                libraryStore = new MusicLibraryStore(plugin, blockId);
                await libraryStore.load();
                metadataIndexStore = new MusicMetadataIndexStore(plugin);
                await metadataIndexStore.load();
                syncLibraryState();
            }

            await loadMusicFiles();
            if (parseMetadata && metadataIndexStore) {
                metadataIndexStore.removeMissingTracks(musicFolderPath, scanSubfolders, musicFiles);
                const summary = metadataIndexStore.getLibrarySummary(musicFolderPath, scanSubfolders, musicFiles);
                const enqueued = enqueueLightIndexBuildForMissingTracks(false);
                if (enqueued === 0) {
                    if (summary) {
                        metadataIndexProgress = {
                            ...summary,
                            lastMessage: "当前音乐索引已是最新",
                        };
                    }
                } else {
                    startIndexProgress({
                        total: summary?.total ?? musicFiles.length,
                        queued: enqueued,
                        processed: summary?.fresh ?? 0,
                        skipped: summary?.fresh ?? 0,
                        fresh: summary?.fresh ?? 0,
                        freshIndexed: summary?.indexed ?? 0,
                        freshBasic: summary?.basic ?? 0,
                        freshNoTag: summary?.noTag ?? 0,
                    });
                    ensureLightIndexQueueRunning();
                }
            }
            currentTrackIndex = normalizeTrackIndex(currentTrackIndex, musicFiles.length);

            registerMusicPlayerIndexController(blockId, {
                buildIndex: buildLightIndex,
                rebuildIndex: rebuildLightIndex,
                getProgress: () => metadataIndexProgress,
            });

            preloadAdjacentTracks(currentTrackIndex);
            scheduleCurrentDisplayMetadata("initial-current-display");

            if (hasMusicFiles && autoPlay) {
                ensureTrackLoaded(currentTrackIndex, true);
            }

            if (showFloatingMini && hasMusicFiles) {
                registerFloatingMiniHost({ hostId: blockId, vmStore, actions });
            }
        }
    });

    onDestroy(() => {
        destroyed = true;
        loadToken++;
        metadataQueue = [];
        lightIndexQueue = [];
        cancelScheduledDisplayMetadata();
        void metadataIndexStore?.flush();
        unregisterMusicPlayerIndexController(blockId);
        submitStatsSession(false);
        cleanup();
        revokeTrackCoverObjectUrls(musicFiles);
        detailDialogRef?.close();
        detailDialogRef = null;
        queueDialogRef?.close();
        queueDialogRef = null;
        unregisterFloatingMiniHost(blockId);
    });

    async function saveConfig() {
        try {
            const currentParsed = JSON.parse(contentTypeJson);
            await plugin.saveData(`widget-${currentParsed.blockId}.json`, {
                ...currentParsed,
                data: {
                    ...currentParsed.data,
                    playMode,
                    isMuted,
                    volume,
                    currentTrackIndex,
                    autoPlay,
                    showLyrics,
                    showCover,
                    scanSubfolders,
                    parseMetadata,
                    sortMode,
                    sortDirection,
                    showFloatingMini,
                },
            });
        } catch {
            // 保存失败时静默处理，避免阻塞播放
        }
    }

    function cleanup() {
        clearProgressInterval();
        playSessionId++;
        if (sound) {
            sound.stop();
            sound.unload();
            sound = null;
        }
    }

    function safePlay(targetSound: Howl, targetSessionId: number) {
        if (!targetSound || sound !== targetSound || targetSessionId !== playSessionId || destroyed) {
            return;
        }
        try {
            targetSound.play();
        } catch {
            errorMessage = "播放启动失败，请重新播放";
            isPlaying = false;
        }
    }

    function isRealTrackEnd(): boolean {
        if (!sound) return false;
        const trackDuration = duration || sound.duration() || 0;
        if (!(trackDuration > 0)) return false;

        const seekTime = sound.seek() as number;
        const position = Number.isFinite(seekTime) && seekTime > 0 ? seekTime : currentTime;
        const nearEnd = position >= trackDuration - 2;

        const playedSeconds = statsStore?.getCurrentSessionAccumulatedSeconds() ?? 0;
        const substantialPlayed = playedSeconds >= Math.min(15, trackDuration * 0.2);

        // 正常播放结束：要么已经播到末尾附近，要么 session 累计时长已超过阈值
        return nearEnd || substantialPlayed;
    }

    function preloadAdjacentTracks(centerIndex: number) {
        if (!hasMusicFiles) return;
        const prev = (centerIndex - 1 + musicFiles.length) % musicFiles.length;
        const next = (centerIndex + 1) % musicFiles.length;
        if (prev !== centerIndex) {
            enqueueMetadataForTrack(prev, "light", "preload-prev");
        }
        if (next !== centerIndex && next !== prev) {
            enqueueMetadataForTrack(next, "light", "preload-next");
        }
    }

    function needsFullMetadataForCurrentOptions(track: MusicTrack): boolean {
        if (!track) return false;
        if (showCover && !track.coverObjectUrl) return true;
        if (
            showLyrics &&
            track.lyricsStatus === "pending" &&
            track.lyrics.length === 0 &&
            !track.unsyncedLyricsText
        ) {
            return true;
        }
        return false;
    }

    function enqueueCurrentDisplayMetadata(reason: string): void {
        if (!parseMetadata || !currentTrack) return;
        if (!showCover && !showLyrics) return;
        if (!needsFullMetadataForCurrentOptions(currentTrack)) return;
        enqueueMetadataForTrack(currentTrackIndex, "full", reason);
    }

    function enqueueMetadataForTrack(index: number, mode: MusicMetadataLoadMode, reason: string) {
        if (index < 0 || index >= musicFiles.length) return;
        const track = musicFiles[index];
        if (!track) return;

        const level = track.metadataLoadLevel || "none";
        if (mode === "light" && (level === "light" || level === "full")) return;
        if (mode === "full" && level === "full" && !needsFullMetadataForCurrentOptions(track)) return;

        const existing = metadataQueue.find((item) => item.index === index);
        if (existing) {
            if (mode === "full") existing.mode = "full";
            return;
        }
        metadataQueue.push({ index, mode, reason });
        ensureMetadataQueueRunning();
    }

    function enqueueLightMetadataForIndices(indices: number[], reason: string) {
        let enqueued = 0;
        for (const index of indices) {
            if (index < 0 || index >= musicFiles.length) continue;
            const track = musicFiles[index];
            if (!track) continue;
            const level = track.metadataLoadLevel || "none";
            if (level === "light" || level === "full") continue;
            const existing = metadataQueue.find((item) => item.index === index);
            if (existing) continue;
            metadataQueue.push({ index, mode: "light", reason });
            enqueued++;
        }
        if (enqueued > 0) {
            ensureMetadataQueueRunning();
        }
    }

    function ensureMetadataQueueRunning() {
        if (metadataQueueRunning) return;
        metadataQueueRunning = true;
        const token = loadToken;
        runMetadataQueue(token).finally(() => {
            metadataQueueRunning = false;
        });
    }

    interface IndexProgressInit {
        total: number;
        queued: number;
        processed?: number;
        skipped?: number;
        fresh?: number;
        freshIndexed?: number;
        freshBasic?: number;
        freshNoTag?: number;
    }

    function startIndexProgress(init: IndexProgressInit): void {
        metadataIndexProgress = {
            running: true,
            total: init.total,
            queued: init.queued,
            processed: init.processed ?? 0,
            indexed: init.freshIndexed ?? 0,
            basic: init.freshBasic ?? 0,
            noTag: init.freshNoTag ?? 0,
            failed: 0,
            skipped: init.skipped ?? 0,
            fresh: init.fresh ?? 0,
            startedAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    function finishIndexProgress(progress: MusicMetadataIndexProgress, interrupted = false): void {
        const now = Date.now();
        progress.running = false;
        progress.completedAt = now;
        progress.updatedAt = now;
        if (interrupted) {
            progress.lastMessage = `音乐索引已中断：已处理 ${progress.processed} 首`;
        } else {
            progress.lastMessage = `音乐索引完成：已处理 ${progress.processed} 首，读取到标签 ${progress.indexed} 首，已读取基础信息 ${progress.basic} 首，基础信息不足 ${progress.noTag} 首，失败 ${progress.failed} 首`;
        }
        metadataIndexProgress = { ...progress };
        void metadataIndexStore?.flush();
    }

    interface MusicIndexFlags {
        hasTextMetadata?: boolean;
        hasDuration?: boolean;
        indexStatus?: MusicMetadataIndexEntry["indexStatus"];
    }

    function getTrackIndexFlags(track: MusicTrack): MusicIndexFlags {
        return {
            hasTextMetadata:
                !!track.artist ||
                !!track.album ||
                Boolean(track.title && track.title !== track.baseName),
            hasDuration: track.duration > 0,
        };
    }

    function classifyIndexOutcome(
        flags: MusicIndexFlags,
        parseFailed: boolean,
    ): "indexed" | "basic" | "noTag" | "failed" {
        const status = flags.indexStatus;
        if (status) {
            if (status === "text") return "indexed";
            if (status === "basic") return "basic";
            if (status === "failed") return "failed";
            return "noTag";
        }
        if (parseFailed) return "failed";
        if (flags.hasTextMetadata) return "indexed";
        if (flags.hasDuration) return "basic";
        return "noTag";
    }

    function enqueueLightIndexBuildForMissingTracks(autoStart = true): number {
        if (!parseMetadata || !metadataIndexStore) return 0;
        let enqueued = 0;
        for (let i = 0; i < musicFiles.length; i++) {
            const track = musicFiles[i];
            if (!track) continue;
            const level = track.metadataLoadLevel || "none";
            const hasFresh = metadataIndexStore.hasUsableFreshEntry(musicFolderPath, scanSubfolders, track);
            if ((level === "light" || level === "full") && hasFresh) continue;
            if (lightIndexQueue.includes(i)) continue;
            lightIndexQueue.push(i);
            enqueued++;
        }
        if (autoStart && enqueued > 0) {
            ensureLightIndexQueueRunning();
        }
        return enqueued;
    }

    function ensureLightIndexQueueRunning() {
        if (lightIndexQueueRunning) return;
        lightIndexQueueRunning = true;
        const token = loadToken;
        runLightIndexQueue(token).finally(() => {
            lightIndexQueueRunning = false;
        });
    }

    async function runLightIndexQueue(token: number) {
        let updatedCount = 0;
        let progress: MusicMetadataIndexProgress;
        if (!metadataIndexProgress.running) {
            progress = {
                ...DEFAULT_MUSIC_METADATA_INDEX_PROGRESS,
                running: true,
                total: lightIndexQueue.length,
                queued: lightIndexQueue.length,
                startedAt: Date.now(),
                updatedAt: Date.now(),
            };
            metadataIndexProgress = { ...progress };
        } else {
            progress = { ...metadataIndexProgress };
        }

        let flushCounter = 0;
        while (lightIndexQueue.length > 0) {
            if (token !== loadToken || destroyed) {
                lightIndexQueue = [];
                finishIndexProgress(progress, true);
                return;
            }
            const index = lightIndexQueue.shift();
            if (index === undefined) continue;

            const track = musicFiles[index];
            if (!track) continue;

            progress.processed++;
            progress.queued = Math.max(0, progress.queued - 1);
            progress.updatedAt = Date.now();

            const level = track.metadataLoadLevel || "none";
            if (level === "light" || level === "full") {
                if (metadataIndexStore && !metadataIndexStore.hasUsableFreshEntry(musicFolderPath, scanSubfolders, track)) {
                    metadataIndexStore.upsertTrack(musicFolderPath, scanSubfolders, track);
                    updatedCount++;
                    const flags = getTrackIndexFlags(track);
                    const outcome = classifyIndexOutcome(flags, false);
                    if (outcome === "indexed") progress.indexed++;
                    else if (outcome === "basic") progress.basic++;
                    else if (outcome === "noTag") progress.noTag++;
                    else progress.failed++;
                } else {
                    progress.skipped++;
                }
            } else {
                const entry = await loadLightMetadataForIndex(track);
                if (entry && metadataIndexStore) {
                    metadataIndexStore.upsertEntry(musicFolderPath, scanSubfolders, entry);
                    updatedCount++;
                    const parseFailed = track.metadataError === "metadata_parse_failed_light";
                    const outcome = classifyIndexOutcome(entry, parseFailed);
                    if (outcome === "indexed") progress.indexed++;
                    else if (outcome === "basic") progress.basic++;
                    else if (outcome === "noTag") progress.noTag++;
                    else progress.failed++;
                } else {
                    progress.failed++;
                }
            }

            flushCounter++;
            if (flushCounter >= 5) {
                metadataIndexProgress = { ...progress };
                flushCounter = 0;
            }

            if (token !== loadToken || destroyed) {
                lightIndexQueue = [];
                finishIndexProgress(progress, true);
                return;
            }

            if (updatedCount >= 10) {
                updatedCount = 0;
                musicFiles = musicFiles;
            }

            if (lightIndexQueue.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }
        if (updatedCount > 0) {
            musicFiles = musicFiles;
        }
        finishIndexProgress(progress, false);
    }

    async function buildLightIndex(): Promise<MusicPlayerIndexActionResult> {
        if (!parseMetadata) return { ok: false, reason: "metadata_disabled" };
        if (!metadataIndexStore) return { ok: false, reason: "no_store" };
        if (musicFiles.length === 0) return { ok: false, reason: "no_music" };
        if (lightIndexQueueRunning) return { ok: true, status: "running" };
        const summary = metadataIndexStore.getLibrarySummary(musicFolderPath, scanSubfolders, musicFiles);
        const enqueued = enqueueLightIndexBuildForMissingTracks(false);
        if (enqueued === 0) {
            metadataIndexProgress = {
                ...DEFAULT_MUSIC_METADATA_INDEX_PROGRESS,
                total: summary?.total ?? musicFiles.length,
                processed: summary?.total ?? musicFiles.length,
                indexed: summary?.indexed ?? 0,
                basic: summary?.basic ?? 0,
                noTag: summary?.noTag ?? 0,
                failed: summary?.failed ?? 0,
                fresh: summary?.fresh ?? 0,
                updatedAt: summary?.updatedAt ?? Date.now(),
                completedAt: summary?.completedAt ?? Date.now(),
                lastMessage: "当前音乐索引已是最新",
            };
            return { ok: true, status: "up_to_date" };
        }
        startIndexProgress({
            total: summary?.total ?? musicFiles.length,
            queued: enqueued,
            processed: summary?.fresh ?? 0,
            skipped: summary?.fresh ?? 0,
            fresh: summary?.fresh ?? 0,
            freshIndexed: summary?.indexed ?? 0,
            freshBasic: summary?.basic ?? 0,
            freshNoTag: summary?.noTag ?? 0,
        });
        ensureLightIndexQueueRunning();
        return { ok: true, status: "started" };
    }

    async function rebuildLightIndex(): Promise<MusicPlayerIndexActionResult> {
        if (!parseMetadata) return { ok: false, reason: "metadata_disabled" };
        if (!metadataIndexStore) return { ok: false, reason: "no_store" };
        if (musicFiles.length === 0) return { ok: false, reason: "no_music" };
        if (lightIndexQueueRunning) return { ok: true, status: "running" };
        metadataIndexStore.clearLibrary(musicFolderPath, scanSubfolders);
        let fullCount = 0;
        let fullIndexed = 0;
        let fullBasic = 0;
        let fullNoTag = 0;
        for (const track of musicFiles) {
            if (track.metadataLoadLevel === "full") {
                metadataIndexStore.upsertTrack(musicFolderPath, scanSubfolders, track);
                fullCount++;
                const outcome = classifyIndexOutcome(getTrackIndexFlags(track), false);
                if (outcome === "indexed") fullIndexed++;
                else if (outcome === "basic") fullBasic++;
                else fullNoTag++;
                continue;
            }
            track.title = track.baseName;
            track.artist = "";
            track.album = "";
            track.duration = 0;
            track.bitrate = undefined;
            track.sampleRate = undefined;
            track.metadataStatus = "pending";
            track.metadataLoadLevel = undefined;
            track.metadataError = undefined;
        }
        musicFiles = musicFiles;
        const enqueued = enqueueLightIndexBuildForMissingTracks(false);
        if (enqueued === 0 && fullCount === 0) {
            return { ok: true, status: "up_to_date" };
        }
        startIndexProgress({
            total: musicFiles.length,
            queued: enqueued,
            processed: fullCount,
            skipped: 0,
            fresh: 0,
            freshIndexed: fullIndexed,
            freshBasic: fullBasic,
            freshNoTag: fullNoTag,
        });
        ensureLightIndexQueueRunning();
        return { ok: true, status: "started" };
    }

    function shouldUpsertTrackToIndexAfterMetadata(track: MusicTrack): boolean {
        if (!parseMetadata || !metadataIndexStore) return false;
        if (track.metadataStatus !== "loaded") return false;
        const level = track.metadataLoadLevel;
        if (level !== "light" && level !== "full") return false;
        const hasText =
            !!track.artist ||
            !!track.album ||
            Boolean(track.title && track.title !== track.baseName);
        return hasText || track.duration > 0;
    }

    async function runMetadataQueue(token: number) {
        while (metadataQueue.length > 0) {
            if (token !== loadToken || destroyed) {
                metadataQueue = [];
                return;
            }
            const item = metadataQueue.shift();
            if (!item) continue;

            const track = musicFiles[item.index];
            if (!track) continue;

            const level = track.metadataLoadLevel || "none";
            if (item.mode === "light" && (level === "light" || level === "full")) continue;
            if (item.mode === "full" && level === "full" && !needsFullMetadataForCurrentOptions(track)) continue;

            await loadMetadataForTrack(track, parseMetadata, item.mode, {
                includeCover: showCover,
                includeLyrics: showLyrics,
            });

            if (shouldUpsertTrackToIndexAfterMetadata(track)) {
                metadataIndexStore?.upsertTrack(musicFolderPath, scanSubfolders, track);
                if (item.mode === "full") {
                    void metadataIndexStore?.flush();
                }
            }

            if (token !== loadToken || destroyed) {
                metadataQueue = [];
                return;
            }

            // full 模式解析后按需尝试歌词和外部封面
            if (item.mode === "full") {
                if (showLyrics && track.lyricsStatus === "pending") {
                    await loadLyricsForTrack(track);
                }
                if (showCover && !track.coverObjectUrl) {
                    await loadExternalCoverForTrack(track);
                }
            }

            if (token !== loadToken || destroyed) {
                metadataQueue = [];
                return;
            }

            if (metadataQueue.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }

    function advanceToNextTrack(skipSubmitStats: boolean = false) {
        if (!hasMusicFiles) return;
        if (playMode === "shuffle") {
            const nextIndex = pickShuffleIndex();
            ensureTrackLoaded(nextIndex, true, skipSubmitStats);
        } else {
            const activeQueue = getActiveQueueIndices();
            let nextIndex: number;
            if (activeQueue.length > 0) {
                const pos = activeQueue.indexOf(currentTrackIndex);
                if (pos >= 0) {
                    nextIndex = activeQueue[(pos + 1) % activeQueue.length];
                } else {
                    nextIndex = activeQueue[0];
                }
            } else {
                const queue = getQueueIndices();
                const pos = queue.indexOf(currentTrackIndex);
                if (queue.length > 0 && pos >= 0) {
                    nextIndex = queue[(pos + 1) % queue.length];
                } else {
                    nextIndex = (currentTrackIndex + 1) % musicFiles.length;
                }
            }
            ensureTrackLoaded(nextIndex, true, skipSubmitStats);
        }
    }

    function advanceToPrevTrack(skipSubmitStats: boolean = false) {
        if (!hasMusicFiles) return;
        if (playMode === "shuffle") {
            const prevIndex = pickShuffleIndex();
            ensureTrackLoaded(prevIndex, true, skipSubmitStats);
        } else {
            const activeQueue = getActiveQueueIndices();
            let prevIndex: number;
            if (activeQueue.length > 0) {
                const pos = activeQueue.indexOf(currentTrackIndex);
                if (pos >= 0) {
                    prevIndex = activeQueue[(pos - 1 + activeQueue.length) % activeQueue.length];
                } else {
                    prevIndex = activeQueue[activeQueue.length - 1];
                }
            } else {
                const queue = getQueueIndices();
                const pos = queue.indexOf(currentTrackIndex);
                if (queue.length > 0 && pos >= 0) {
                    prevIndex = queue[(pos - 1 + queue.length) % queue.length];
                } else {
                    prevIndex = (currentTrackIndex - 1 + musicFiles.length) % musicFiles.length;
                }
            }
            ensureTrackLoaded(prevIndex, true, skipSubmitStats);
        }
    }

    function pickShuffleIndex(): number {
        const activeQueue = getActiveQueueIndices();
        if (activeQueue.length > 0) {
            const pool = activeQueue.length > 1
                ? activeQueue.filter((i) => i !== currentTrackIndex)
                : activeQueue;
            return pool[Math.floor(Math.random() * pool.length)] ?? activeQueue[0] ?? 0;
        }
        const queue = getQueueIndices();
        const pool = queue.length > 0 ? queue : musicFiles.map((_, i) => i);
        const filtered = pool.length > 1 ? pool.filter((i) => i !== currentTrackIndex) : pool;
        return filtered[Math.floor(Math.random() * filtered.length)] ?? pool[0] ?? 0;
    }

    function ensureTrackLoaded(
        index: number,
        shouldAutoplay: boolean = false,
        skipSubmitStats: boolean = false,
        skipMetadata: boolean = false,
    ) {
        if (!hasMusicFiles || !musicFiles[index]) return;

        if (!skipSubmitStats) {
            submitStatsSession(false);
        }

        if (currentTrackIndex === index && sound && sound.state() === "loaded") {
            if (shouldAutoplay && !isPlaying) {
                safePlay(sound, playSessionId);
            }
            return;
        }

        cleanup();
        cancelScheduledDisplayMetadata();
        const localSessionId = playSessionId;
        currentTrackIndex = index;
        currentTime = 0;
        errorMessage = "";

        const newTrack = musicFiles[index];
        duration = newTrack.duration || 0;

        const createdSound = new Howl({
            src: [newTrack.fileUrl],
            volume: volume,
            mute: isMuted,
            preload: false,
            onplay() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                isPlaying = true;
                errorMessage = "";
                if (currentTrack) {
                    statsStore?.startSession(currentTrack, (createdSound.seek() as number) || 0);
                }
                if (countedPlaySessionId !== playSessionId && currentTrack) {
                    countedPlaySessionId = playSessionId;
                    const counted = statsStore?.recordPlaybackStart(currentTrack) ?? false;
                    if (counted) statsVersion += 1;
                }
                const loadedDuration = createdSound.duration() || 0;
                if (loadedDuration > 0) {
                    duration = loadedDuration;
                    if (currentTrack && currentTrack.duration <= 0) {
                        musicFiles[currentTrackIndex].duration = loadedDuration;
                        if (parseMetadata && metadataIndexStore) {
                            metadataIndexStore.upsertTrack(musicFolderPath, scanSubfolders, musicFiles[currentTrackIndex]);
                            void metadataIndexStore.flush();
                        }
                        musicFiles = musicFiles;
                    }
                }
                startProgressTimerForSound(createdSound, localSessionId);
                ensureTrackInActiveQueue(currentTrackIndex);
            },
            onpause() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                isPlaying = false;
                submitStatsSession(false);
            },
            onend() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                if (!isRealTrackEnd()) {
                    errorMessage = "播放被异常中断，请重新播放或检查音频文件";
                    isPlaying = false;
                    return;
                }
                submitStatsSession(true);
                if (playMode === "repeat") {
                    // 单曲循环：直接回到开头重播，避免 ensureTrackLoaded 同曲早退
                    isPlaying = false;
                    currentTime = 0;
                    sound.seek(0);
                    countedPlaySessionId = -1;
                    safePlay(sound, playSessionId);
                } else {
                    advanceToNextTrack(true);
                }
            },
            onload() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                const loadedDuration = createdSound.duration() || 0;
                duration = loadedDuration;
                if (currentTrack && currentTrack.duration <= 0 && loadedDuration > 0) {
                    musicFiles[currentTrackIndex].duration = loadedDuration;
                    if (parseMetadata && metadataIndexStore) {
                        metadataIndexStore.upsertTrack(musicFolderPath, scanSubfolders, musicFiles[currentTrackIndex]);
                        void metadataIndexStore.flush();
                    }
                    musicFiles = musicFiles;
                }
                startProgressTimerForSound(createdSound, localSessionId);
                if (shouldAutoplay) {
                    safePlay(createdSound, localSessionId);
                }
            },
            onloaderror() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                errorMessage = "当前音频加载失败，请检查文件路径或格式";
                isPlaying = false;
            },
            onplayerror() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                errorMessage = "当前音频播放失败，请检查文件路径或格式";
                isPlaying = false;
            },
        });

        sound = createdSound;
        createdSound.load();

        if (!skipMetadata) {
            if (showCover || showLyrics) {
                enqueueMetadataForTrack(index, "full", "play");
            }
            preloadAdjacentTracks(index);
        }
    }

    async function loadMusicFiles(): Promise<void> {
        if (destroyed) return;
        loadToken++;
        metadataQueue = [];

        if (!canUseElectronLocalFileSystem()) {
            runtimeUnsupported = true;
            unavailableTitle = "仅桌面端支持";
            runtimeMessage = "音乐播放器需要访问本地音乐文件夹，该功能仅支持思源桌面端使用。网页端、Docker 和移动端无法直接读取本地文件夹。";
            return;
        }

        if (!musicFolderPath) {
            runtimeUnsupported = true;
            unavailableTitle = "未配置音乐文件夹";
            runtimeMessage = "请先在组件设置中选择音乐文件夹。";
            return;
        }

        try {
            revokeTrackCoverObjectUrls(musicFiles);
            const result = getAudioFilesFromDirectory(musicFolderPath, scanSubfolders);
            musicFiles = result.tracks;
            if (parseMetadata && metadataIndexStore) {
                metadataIndexStore.applyIndexToTracks(musicFolderPath, scanSubfolders, musicFiles);
            }
            scanTruncated = result.truncated;
            if (!hasMusicFiles) {
                runtimeUnsupported = true;
                unavailableTitle = "未找到音乐文件";
                runtimeMessage = "所选文件夹中没有支持的音频文件（MP3/WAV/OGG/FLAC/AAC/M4A）。";
            }
        } catch {
            runtimeUnsupported = true;
            unavailableTitle = "读取音乐文件夹失败";
            runtimeMessage = "无法读取所选文件夹，请检查路径是否正确。";
        }
    }

    function openDetailDialog() {
        if (!hasMusicFiles || detailDialogRef) return;
        detailDialogOpen = true;
        scheduleCurrentDisplayMetadata("detail-open");
        try {
            const dialog = svelteDialog({
                width: "min(960px, calc(100vw - 32px))",
                height: "min(680px, calc(100vh - 64px))",
                title: "",
                constructor: (containerEl: HTMLElement) => {
                    try {
                        return mount(MusicPlayerDetailDialog, {
                            target: containerEl,
                            props: {
                                vmStore,
                                actions,
                                onClose: () => dialog.close(),
                                onRequestLightMetadata: (indices: number[]) => {
                                    enqueueLightMetadataForIndices(indices, "playlist-visible");
                                },
                                getTrackStats: (trackKey: string) => statsStore?.getStatsForTrack(trackKey),
                                musicFolderPath: initialConfig.musicFolderPath,
                                onQueueChange: (indices: number[]) => {
                                    currentQueueIndices = indices;
                                },
                                onReplaceActiveQueue: () => {
                                    actions.replaceActiveQueueFromIndices(
                                        currentQueueIndices.length > 0 ? currentQueueIndices : musicFiles.map((_, i) => i),
                                    );
                                },
                                onAppendActiveQueue: () => {
                                    actions.appendActiveQueueFromIndices(
                                        currentQueueIndices.length > 0 ? currentQueueIndices : musicFiles.map((_, i) => i),
                                    );
                                },
                                onAppendTrackToActiveQueue: (originalIndex: number) => {
                                    actions.appendTrackToActiveQueue(originalIndex);
                                },
                                onOpenQueueDialog: () => {
                                    openActiveQueueDialog();
                                },
                            },
                        });
                    } catch (e) {
                        detailDialogOpen = false;
                        throw e;
                    }
                },
                callback: () => {
                    detailDialogOpen = false;
                    detailDialogRef = null;
                    currentQueueIndices = [];
                },
            });
            detailDialogRef = dialog;
        } catch {
            detailDialogOpen = false;
            detailDialogRef = null;
            currentQueueIndices = [];
        }
    }

    function openActiveQueueDialog() {
        if (queueDialogRef) return;
        const dialog = svelteDialog({
            width: "min(480px, calc(100vw - 32px))",
            height: "min(540px, calc(100vh - 64px))",
            title: "当前播放列表",
            constructor: (containerEl: HTMLElement) => {
                return mount(MusicPlayerQueueDialog, {
                    target: containerEl,
                    props: {
                        vmStore,
                        actions,
                        onClose: () => dialog.close(),
                    },
                });
            },
            callback: () => {
                queueDialogRef = null;
            },
        });
        queueDialogRef = dialog;
    }
</script>

<div class="content-display">
    {#if advancedEnabled}
        {#if runtimeUnsupported}
            <div class="runtime-unsupported">
                <h2>{unavailableTitle}</h2>
                <h3>{runtimeMessage}</h3>
                {#if scanTruncated}
                    <p class="truncated-hint">文件夹内音乐文件过多，仅加载前 1000 首。</p>
                {/if}
            </div>
        {:else}
            <MusicPlayerMini {vm} {actions} onOpenDetail={openDetailDialog} />
        {/if}
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="音乐播放器"
                subtitle="本地音乐播放，支持多种音频格式和播放模式。"
                icon="music"
                features={[
                    "本地音乐文件夹读取",
                    "支持 MP3/WAV/FLAC 等格式",
                    "顺序/循环/随机播放模式"
                ]}
                highlights={["本地音乐", "多种格式", "播放模式"]}
                compact
            />
        </div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }

    .content-not-advanced {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
    }

    .runtime-unsupported {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        color: var(--b3-theme-on-surface-light);

        .truncated-hint {
            font-size: 0.8rem;
            opacity: 0.8;
        }
    }
</style>
