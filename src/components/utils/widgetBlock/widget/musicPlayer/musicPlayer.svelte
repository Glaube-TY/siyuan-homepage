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
    } from "./musicMetadataService";
    import { loadLyricsForTrack } from "./musicLyricsService";
    import { writable } from "svelte/store";
    import type { MusicTrack, MusicPlayerViewModel, MusicPlayerActions, MusicPlayerVmStore, MusicMetadataLoadMode, MusicPlayerSortMode, MusicPlayerSortDirection, MusicPlayerViewMode, MusicPlaylist } from "./musicPlayerTypes";
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

    interface MetadataQueueItem {
        index: number;
        mode: MusicMetadataLoadMode;
        reason: string;
    }

    let metadataQueue: MetadataQueueItem[] = [];
    let metadataQueueRunning = false;

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
    let statsVersion = $state(0);
    let viewMode = $state<MusicPlayerViewMode>("all");
    let selectedPlaylistId = $state<string | null>(null);
    let currentQueueIndices = $state<number[]>([]);
    let favoriteTrackKeys = $state<string[]>([]);
    let playlists = $state<MusicPlaylist[]>([]);
    let activeQueueTrackKeys = $state<string[]>([]);
    let activeQueueCount = $state(0);

    let musicFiles = $state<MusicTrack[]>([]);
    let currentTrackIndex = $state(
        Number.isFinite(initialConfig.currentTrackIndex) ? initialConfig.currentTrackIndex : 0,
    );

    let sound: Howl | null = null;
    let isPlaying = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let progressInterval: ReturnType<typeof setInterval> | null = null;

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
        if (activeQueueTrackKeys.length > 0) {
            const indices = activeQueueTrackKeys
                .map((k) => trackKeyToIndex.get(k))
                .filter((i): i is number => i !== undefined);
            if (indices.length > 0) return indices;
        }
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
    });
    $effect(() => {
        vmStore.set(vm);
    });

    const actions: MusicPlayerActions = {
        play: () => {
            if (!sound || sound.state() !== "loaded") {
                cleanup();
                ensureTrackLoaded(currentTrackIndex, true);
            } else {
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
                    ensureTrackLoaded(currentTrackIndex, true);
                } else {
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
            submitStatsSession(false);
            const safeIndex = normalizeTrackIndex(index, musicFiles.length);
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
            showLyrics = !showLyrics;
            saveConfig();
        },
        toggleShowCover: () => {
            showCover = !showCover;
            saveConfig();
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
            const keys = indices
                .filter((i) => i >= 0 && i < musicFiles.length)
                .map((i) => getTrackKey(musicFiles[i]));
            libraryStore.replaceActiveQueue(keys);
            syncLibraryState();
            // 如果当前歌曲在新队列中，继续播放；否则播放第一首
            const currentKey = currentTrack ? getTrackKey(currentTrack) : null;
            const newTrackKeys = libraryStore.getActiveQueueTrackKeys();
            if (currentKey && newTrackKeys.includes(currentKey)) {
                // 当前歌曲在队列中，继续
            } else if (newTrackKeys.length > 0) {
                const firstIdx = musicFiles.findIndex((t) => getTrackKey(t) === newTrackKeys[0]);
                if (firstIdx >= 0) {
                    submitStatsSession(false);
                    ensureTrackLoaded(firstIdx, true);
                }
            }
        },
        appendActiveQueueFromIndices: (indices: number[]) => {
            if (!libraryStore) return;
            const keys = indices
                .filter((i) => i >= 0 && i < musicFiles.length)
                .map((i) => getTrackKey(musicFiles[i]));
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
            syncLibraryState();
        },
        clearActiveQueue: () => {
            if (!libraryStore) return;
            libraryStore.clearActiveQueue();
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
                syncLibraryState();
            }

            await loadMusicFiles();
            currentTrackIndex = normalizeTrackIndex(currentTrackIndex, musicFiles.length);

            if (currentTrack) {
                enqueueMetadataForTrack(currentTrackIndex, "full", "current");
            }
            preloadAdjacentTracks(currentTrackIndex);

            if (hasMusicFiles && autoPlay) {
                ensureTrackLoaded(currentTrackIndex, true);
            }

            // TODO: 悬浮播放器开发中，暂不启用
            // if (showFloatingMini && hasMusicFiles) {
            //     registerFloatingMiniHost({ hostId: blockId, vmStore, actions });
            // }
        }
    });

    onDestroy(() => {
        destroyed = true;
        loadToken++;
        metadataQueue = [];
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

    function enqueueMetadataForTrack(index: number, mode: MusicMetadataLoadMode, reason: string) {
        if (index < 0 || index >= musicFiles.length) return;
        const track = musicFiles[index];
        if (!track) return;

        const level = track.metadataLoadLevel || "none";
        if (mode === "light" && (level === "light" || level === "full")) return;
        if (mode === "full" && level === "full") return;

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
            if (item.mode === "full" && level === "full") continue;

            await loadMetadataForTrack(track, parseMetadata, item.mode);

            if (token !== loadToken || destroyed) {
                metadataQueue = [];
                return;
            }

            // full 模式解析后尝试歌词和外部封面：即使解析失败也尝试外部文件兜底
            if (item.mode === "full") {
                if (track.lyricsStatus === "pending") {
                    await loadLyricsForTrack(track);
                }
                if (!track.coverObjectUrl) {
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
            const queue = getQueueIndices();
            const pool = queue.length > 0 ? queue : musicFiles.map((_, i) => i);
            const randomIndex = pool[Math.floor(Math.random() * pool.length)] ?? 0;
            ensureTrackLoaded(randomIndex, true, skipSubmitStats);
        } else {
            const queue = getQueueIndices();
            const pos = queue.indexOf(currentTrackIndex);
            let nextIndex: number;
            if (queue.length > 0 && pos >= 0) {
                nextIndex = queue[(pos + 1) % queue.length];
            } else {
                nextIndex = (currentTrackIndex + 1) % musicFiles.length;
            }
            ensureTrackLoaded(nextIndex, true, skipSubmitStats);
        }
    }

    function advanceToPrevTrack(skipSubmitStats: boolean = false) {
        if (!hasMusicFiles) return;
        if (playMode === "shuffle") {
            const queue = getQueueIndices();
            const pool = queue.length > 0 ? queue : musicFiles.map((_, i) => i);
            const randomIndex = pool[Math.floor(Math.random() * pool.length)] ?? 0;
            ensureTrackLoaded(randomIndex, true, skipSubmitStats);
        } else {
            const queue = getQueueIndices();
            const pos = queue.indexOf(currentTrackIndex);
            let prevIndex: number;
            if (queue.length > 0 && pos >= 0) {
                prevIndex = queue[(pos - 1 + queue.length) % queue.length];
            } else {
                prevIndex = (currentTrackIndex - 1 + musicFiles.length) % musicFiles.length;
            }
            ensureTrackLoaded(prevIndex, true, skipSubmitStats);
        }
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
        const localSessionId = playSessionId;
        currentTrackIndex = index;
        currentTime = 0;
        errorMessage = "";

        const newTrack = musicFiles[index];
        duration = newTrack.duration || 0;
        if (!skipMetadata) {
            enqueueMetadataForTrack(index, "full", "play");
            preloadAdjacentTracks(index);
        }

        const createdSound = new Howl({
            src: [newTrack.fileUrl],
            volume: volume,
            mute: isMuted,
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
                duration = createdSound.duration() || 0;
                clearProgressInterval();
                progressInterval = setInterval(() => {
                    if (sound === createdSound && localSessionId === playSessionId && isPlaying && !destroyed) {
                        const pos = createdSound.seek() as number;
                        currentTime = pos;
                        statsStore?.tick(pos);
                    }
                }, 1000);
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
        const dialog = svelteDialog({
            width: "min(960px, calc(100vw - 32px))",
            height: "min(680px, calc(100vh - 64px))",
            title: "",
            constructor: (containerEl: HTMLElement) => {
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
            },
            callback: () => {
                detailDialogRef = null;
                currentQueueIndices = [];
            },
        });
        detailDialogRef = dialog;
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
