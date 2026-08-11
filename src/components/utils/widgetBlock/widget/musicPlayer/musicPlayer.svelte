<script lang="ts">
    import { saveWidgetContentPreservingSize } from "../../styleUtils";
    import { onMount, onDestroy, mount, untrack } from "svelte";
    import { Howl } from "howler";
    import { getFrontend } from "siyuan";
    import { svelteDialog } from "@/libs/dialog";
    import { canUseElectronLocalFileSystem, isMobileRuntime } from "@/components/tools/runtimeEnv";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import MusicPlayerMini from "./MusicPlayerMini.svelte";
    import MusicPlayerDetailDialog from "./MusicPlayerDetailDialog.svelte";
    import MusicPlayerMobilePage from "./MusicPlayerMobilePage.svelte";
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
    import {
        registerMusicPlayerPlaybackController,
        unregisterMusicPlayerPlaybackController,
    } from "./musicPlayerPlaybackController";
    import { loadLyricsForTrack } from "./musicLyricsService";
    import { writable } from "svelte/store";
    import type { MusicTrack, MusicPlayerViewModel, MusicPlayerActions, MusicPlayerVmStore, MusicMetadataLoadMode, MusicPlayerSortMode, MusicPlayerSortDirection, MusicPlayerViewMode, MusicPlaylist, MusicMetadataIndexProgress } from "./musicPlayerTypes";
    import { DEFAULT_MUSIC_METADATA_INDEX_PROGRESS } from "./musicPlayerTypes";
    import { MusicPlaybackStatsStore, getTrackKey } from "./musicPlaybackStatsStore";
    import { MusicLibraryStore } from "./musicLibraryStore";
    import { registerFloatingMiniHost, unregisterFloatingMiniHost } from "./musicFloatingMiniManager";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";
    import { MusicCloudSettingsStore } from "./musicCloudSettingsStore";
    import { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
    import type { SubsonicEndpointState } from "./subsonic/subsonicEndpointManager";
    import { getMusicSourceRuntimePolicy, isAudioUnlockRequired, resolveMusicSourceKindForRuntime, resolveReliablePlaybackDuration } from "./musicSourceTypes";
    import type { MusicSourceProvider, ResolvedPlaybackSource } from "./musicSourceTypes";
    import { LocalMusicProvider } from "./localMusicProvider";
    import { MusicTrackRegistry } from "./musicTrackRegistry";
    import { MusicRemoteScrobbleTracker } from "./musicRemoteScrobbleTracker";
    import { publishMusicCloudEndpointState } from "./musicCloudConnectionStatus";
    import { MusicStreamFailoverGuard } from "./musicStreamFailoverGuard";
    import { MusicCloudQueueSaveScheduler } from "./musicCloudQueueSaveScheduler";
    import { DesktopMusicStreamRelay } from "./musicStreamRelay";
    import { clearMusicPlaybackPresence, publishMusicPlaybackPresence } from "./musicPlaybackPresence";
    import {
        normalizeCloudQueueAfterMutation,
        resolveCloudQueueSaveCursor,
        resolveInitialCloudPlaybackState,
    } from "./subsonic/subsonicQueueState";
    import {
        OPEN_MOBILE_MUSIC_PLAYER_EVENT,
        registerPersistentMobileMusicPlayer,
        requestOpenMobileMusicPlayer,
        type OpenMobileMusicPlayerRequest,
    } from "./musicMobilePlayerBridge";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    const initialConfig = untrack(() => safeParseMusicPlayerConfig(contentTypeJson));
    const initialParsed = untrack(() => {
        try {
            return JSON.parse(contentTypeJson || "{}") as Record<string, unknown>;
        } catch {
            return {} as Record<string, unknown>;
        }
    });
    const musicFolderPath = initialConfig.musicFolderPath;
    const frontend = getFrontend();
    const mobileSurface = untrack(() => runtimeContext.placement === "mobile"
        || runtimeContext.deviceViewContext?.surface === "mobile-homepage");
    const persistentMobileRuntime = untrack(() => runtimeContext.persistentMusicRuntime === true);
    const physicalMobileRuntime = isMobileRuntime()
        || frontend === "mobile"
        || frontend === "browser-mobile"
        || frontend.includes("mobile");
    const mobileRuntime = mobileSurface || physicalMobileRuntime;
    const delegatedMobileSurface = mobileSurface && physicalMobileRuntime && !persistentMobileRuntime;
    const sourceMode = resolveMusicSourceKindForRuntime(initialConfig.sourceMode, mobileRuntime);
    const blockId = typeof initialParsed.instanceId === "string"
        ? String(initialParsed.instanceId)
        : "";

    let destroyed = false;
    let loadToken = 0;
    let playSessionId = 0;
    let playRequestSessionId = -1;
    let loadAutoplaySessionId = -1;
    let countedPlaySessionId = -1;
    const streamFailoverGuard = new MusicStreamFailoverGuard();
    const desktopStreamRelay = new DesktopMusicStreamRelay();
    let disposePlaybackSource: (() => void) | null = null;
    const remoteScrobbleTracker = new MusicRemoteScrobbleTracker();
    let detailDialogRef: { close: () => void } | null = null;
    let queueDialogRef: { close: () => void } | null = null;
    let unsubscribeCloudEndpointStatus: (() => void) | null = null;
    let unregisterPersistentMobilePlayer: (() => void) | null = null;
    let cloudEndpointState = $state<SubsonicEndpointState | null>(null);
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
    let cloudStreamQuality = $state(initialConfig.cloudStreamQuality);

    let statsStore: MusicPlaybackStatsStore | null = null;
    let libraryStore: MusicLibraryStore | null = null;
    let metadataIndexStore: MusicMetadataIndexStore | null = null;
    let sourceProvider: MusicSourceProvider | null = null;
    let cloudProvider: SubsonicMusicProvider | null = null;
    const cloudQueueSaveScheduler = new MusicCloudQueueSaveScheduler();
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
    const trackRegistry = new MusicTrackRegistry(5000);
    let currentTrackIndex = $state(
        Number.isFinite(initialConfig.currentTrackIndex) ? initialConfig.currentTrackIndex : 0,
    );

    let sound: Howl | null = null;
    let isPlaying = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let displayMetadataTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingInitialSeek = 0;
    let lastCloudQueuePositionBucket = -1;

    let advancedEnabled = $state(false);
    let runtimeUnsupported = $state(false);
    let unavailableTitle = $state("仅桌面端支持");
    let runtimeMessage = $state("");
    let errorMessage = $state("");
    let scanTruncated = $state(false);
    let cloudRetrying = $state(false);
    let cloudConnected = $state(false);

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
        if (index < 0 || index >= musicFiles.length) return;
        const trackKey = getTrackKey(musicFiles[index]);
        if (activeQueueTrackKeys.includes(trackKey)) return;
        if (sourceMode === "subsonic") {
            activeQueueTrackKeys = [...activeQueueTrackKeys, trackKey];
            activeQueueCount = activeQueueTrackKeys.length;
            scheduleCloudQueueSave();
            return;
        }
        if (!libraryStore) return;
        libraryStore.appendToActiveQueue([trackKey]);
        syncLibraryState();
    }

    function ensureTrackKeysInCatalog(trackKeys: string[]): string[] {
        const uniqueKeys = [...new Set(trackKeys.filter(Boolean))];
        if (sourceMode === "subsonic") {
            const missingTracks = uniqueKeys
                .filter((key) => !musicFiles.some((track) => getTrackKey(track) === key))
                .map((key) => trackRegistry.resolve(key))
                .filter((track): track is MusicTrack => !!track);
            if (missingTracks.length) registerCloudTracks(missingTracks);
        }
        const availableKeys = new Set(musicFiles.map(getTrackKey));
        return uniqueKeys.filter((key) => availableKeys.has(key));
    }

    function playTrackByKey(trackKey: string): void {
        const [availableKey] = ensureTrackKeysInCatalog([trackKey]);
        if (!availableKey) return;
        const index = musicFiles.findIndex((track) => getTrackKey(track) === availableKey);
        if (index < 0) return;
        ensureTrackInActiveQueue(index);
        submitStatsSession(false);
        void ensureTrackLoaded(index, true, true);
        saveConfig();
    }

    function replaceQueueWithTrackKeys(trackKeys: string[]): void {
        const keys = ensureTrackKeysInCatalog(trackKeys);
        if (!keys.length) return;
        if (sourceMode === "subsonic") {
            activeQueueTrackKeys = keys;
            activeQueueCount = keys.length;
            scheduleCloudQueueSave();
        } else {
            if (!libraryStore) return;
            libraryStore.replaceActiveQueue(keys);
            syncLibraryState();
        }
        playTrackByKey(keys[0]);
    }

    function appendTrackKeysToQueue(trackKeys: string[]): void {
        const keys = ensureTrackKeysInCatalog(trackKeys);
        if (!keys.length) return;
        if (sourceMode === "subsonic") {
            activeQueueTrackKeys = [...new Set([...activeQueueTrackKeys, ...keys])];
            activeQueueCount = activeQueueTrackKeys.length;
            trackRegistry.setProtectedKeys([...(activeQueueTrackKeys || []), ...(currentTrack ? [getTrackKey(currentTrack)] : [])]);
            scheduleCloudQueueSave();
            return;
        }
        if (!libraryStore) return;
        libraryStore.appendToActiveQueue(keys);
        syncLibraryState();
    }

    function appendTrackKeyToQueue(trackKey: string): void {
        appendTrackKeysToQueue([trackKey]);
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
        play: requestCurrentPlayback,
        pause: pauseCurrentPlayback,
        togglePlay: () => {
            if (isPlaying) {
                pauseCurrentPlayback();
            } else {
                requestCurrentPlayback();
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
            playTrackByKey(getTrackKey(musicFiles[safeIndex]));
        },
        playTrackByKey,
        seekByMouse: (e: MouseEvent) => {
            if (!sound || !duration) return;
            const target = e.currentTarget as HTMLElement;
            const progress = e.offsetX / target.offsetWidth;
            const seekTime = progress * duration;
            sound.seek(seekTime);
            currentTime = seekTime;
            scheduleCloudQueueSave();
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
            scheduleCloudQueueSave();
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
            if (!currentTrack) return;
            if (sourceMode === "subsonic" && sourceProvider) {
                void sourceProvider.toggleFavorite(currentTrack).then(() => {
                    favoriteTrackKeys = musicFiles.filter((track) => !!track.serverStarredAt).map(getTrackKey);
                    musicFiles = musicFiles;
                }).catch(() => { errorMessage = "收藏操作失败，请稍后重试"; });
                return;
            }
            if (!libraryStore) return;
            const trackKey = getTrackKey(currentTrack);
            libraryStore.toggleFavorite(trackKey);
            syncLibraryState();
        },
        toggleFavoriteTrack: (trackKey: string) => {
            if (sourceMode === "subsonic" && sourceProvider) {
                const track = musicFiles.find((item) => getTrackKey(item) === trackKey);
                if (track) void sourceProvider.toggleFavorite(track).then(() => {
                    favoriteTrackKeys = musicFiles.filter((item) => !!item.serverStarredAt).map(getTrackKey);
                    musicFiles = musicFiles;
                }).catch(() => { errorMessage = "收藏操作失败，请稍后重试"; });
                return;
            }
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
            replaceQueueWithTrackKeys(indices.filter((i) => i >= 0 && i < musicFiles.length).map((i) => getTrackKey(musicFiles[i])));
        },
        appendActiveQueueFromIndices: (indices: number[]) => {
            appendTrackKeysToQueue(indices.filter((i) => i >= 0 && i < musicFiles.length).map((i) => getTrackKey(musicFiles[i])));
        },
        appendTrackToActiveQueue: (index: number) => {
            if (index < 0 || index >= musicFiles.length) return;
            appendTrackKeyToQueue(getTrackKey(musicFiles[index]));
        },
        replaceQueueWithTrackKeys,
        appendTrackKeyToQueue,
        removeTrackFromActiveQueue: (trackKey: string) => {
            if (sourceMode === "subsonic") {
                const currentKey = currentTrack ? getTrackKey(currentTrack) : undefined;
                const preserveCurrentPlayback = !!currentTrack && !!(isPlaying || (sound && sound.state() === "loaded"));
                activeQueueTrackKeys = normalizeCloudQueueAfterMutation(
                    activeQueueTrackKeys.filter((key) => key !== trackKey),
                    currentKey,
                    preserveCurrentPlayback,
                );
                activeQueueCount = activeQueueTrackKeys.length;
                scheduleCloudQueueSave();
                return;
            }
            if (!libraryStore) return;
            libraryStore.removeFromActiveQueue(trackKey);
            const keepCurrent = (isPlaying || (sound && sound.state() === "loaded")) && currentTrack;
            if (keepCurrent && libraryStore.getActiveQueueTrackKeys().length === 0) {
                libraryStore.appendToActiveQueue([getTrackKey(currentTrack)]);
            }
            syncLibraryState();
        },
        clearActiveQueue: () => {
            if (sourceMode === "subsonic") {
                const currentKey = currentTrack ? getTrackKey(currentTrack) : undefined;
                const preserveCurrentPlayback = !!currentTrack && !!(isPlaying || (sound && sound.state() === "loaded"));
                activeQueueTrackKeys = normalizeCloudQueueAfterMutation([], currentKey, preserveCurrentPlayback);
                activeQueueCount = activeQueueTrackKeys.length;
                scheduleCloudQueueSave();
                return;
            }
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
            scheduleCloudQueueSave();
        },
    };

    $effect(() => {
        if (!persistentMobileRuntime) return;
        publishMusicPlaybackPresence({
            isPlaying: !!currentTrack && isPlaying,
        });
    });

    function syncLibraryState() {
        if (!libraryStore) return;
        favoriteTrackKeys = libraryStore.getFavorites();
        playlists = libraryStore.getPlaylists();
        activeQueueTrackKeys = libraryStore.getActiveQueueTrackKeys();
        activeQueueCount = libraryStore.getActiveQueueCount();
    }

    function scheduleCloudQueueSave(): void {
        if (sourceMode !== "subsonic" || !cloudProvider) return;
        const provider = cloudProvider;
        cloudQueueSaveScheduler.schedule(async () => {
            const songIds = activeQueueTrackKeys
                .map((key) => trackRegistry.resolve(key)?.sourceTrackId)
                .filter((id): id is string => !!id);
            const cursor = resolveCloudQueueSaveCursor(
                activeQueueTrackKeys,
                currentTrack ? getTrackKey(currentTrack) : undefined,
                currentTrack?.sourceTrackId,
                currentTime,
            );
            await provider.library.savePlayQueue(songIds, cursor.currentId, cursor.positionMs);
        }, () => { if (!destroyed) errorMessage = "NAS 播放队列暂时无法同步"; });
    }

    function formatCloudEndpointHealth(kind: "local" | "remote"): string {
        const health = cloudEndpointState?.[kind];
        if (!health?.configured) return "未配置";
        if (health.status === "online") return `在线 · ${health.latencyMs ?? "—"} ms`;
        if (health.status === "testing") return "正在连接";
        if (health.status === "auth_error") return health.safeError || "认证失败";
        if (health.status === "server_error") return health.safeError || "服务器异常";
        if (health.status === "offline") return health.safeError || "离线";
        return "尚未测试";
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
                if (sourceMode === "subsonic") {
                    if (currentTrack) remoteScrobbleTracker.tick(getTrackKey(currentTrack), pos);
                    maybeSubmitRemoteScrobble(false);
                    const positionBucket = Math.floor(pos / 15);
                    if (positionBucket > 0 && positionBucket !== lastCloudQueuePositionBucket) {
                        lastCloudQueuePositionBucket = positionBucket;
                        scheduleCloudQueueSave();
                    }
                }
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
        if ((sourceMode === "local" && !parseMetadata) || !currentTrack) return;
        if (!showCover && !showLyrics) return;
        if (!needsFullMetadataForCurrentOptions(currentTrack)) return;
        cancelScheduledDisplayMetadata();
        displayMetadataTimer = setTimeout(() => {
            displayMetadataTimer = null;
            enqueueMetadataForTrack(currentTrackIndex, "full", reason);
        }, 500);
    }

    function handleOpenMobileMusicPlayerRequest(request: OpenMobileMusicPlayerRequest): void {
        if (!mobileRuntime) return;
        if (!request || request.handled) return;
        if (!advancedEnabled || (!cloudConnected && !runtimeUnsupported)) return;
        request.handled = true;
        if (!cloudProvider || !cloudConnected) {
            request.unavailableReason = unavailableTitle === "未配置 NAS 音乐服务"
                ? "手机端只支持 NAS 音乐，请先在音乐播放器设置中配置 NAS 服务。"
                : runtimeMessage || "NAS 音乐服务暂不可用，请检查配置后重试。";
            return;
        }
        openDetailDialog(true);
    }

    function handleOpenMobileMusicPlayer(event: Event): void {
        handleOpenMobileMusicPlayerRequest((event as CustomEvent<OpenMobileMusicPlayerRequest>).detail);
    }

    onMount(async () => {
        if (persistentMobileRuntime) {
            unregisterPersistentMobilePlayer = registerPersistentMobileMusicPlayer(handleOpenMobileMusicPlayerRequest);
        } else if (mobileRuntime) {
            window.addEventListener(OPEN_MOBILE_MUSIC_PLAYER_EVENT, handleOpenMobileMusicPlayer);
        }
        advancedEnabled = plugin.ADVANCED;

        if (advancedEnabled) {
            if (delegatedMobileSurface) return;
            const runtimePolicy = getMusicSourceRuntimePolicy(sourceMode, canUseElectronLocalFileSystem());
            if (!runtimePolicy.canInitialize) {
                runtimeUnsupported = true;
                unavailableTitle = "当前设备无法读取本地音乐";
                runtimeMessage = "移动端请将音乐来源切换为 NAS 音乐。";
                return;
            }

            if (blockId) {
                statsStore = new MusicPlaybackStatsStore(plugin, blockId);
                await statsStore.load();
                if (sourceMode === "local") {
                    libraryStore = new MusicLibraryStore(plugin, blockId);
                    await libraryStore.load();
                    metadataIndexStore = new MusicMetadataIndexStore(plugin);
                    await metadataIndexStore.load();
                    syncLibraryState();
                }
            }

            if (sourceMode === "subsonic") await loadCloudMusic();
            else {
                sourceProvider = new LocalMusicProvider(musicFolderPath, scanSubfolders);
                await loadMusicFiles();
            }
            if (sourceMode === "local" && parseMetadata && metadataIndexStore) {
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

            registerMusicPlayerPlaybackController(blockId, {
                getStatus: () => ({
                    sourceMode,
                    isPlaying: !!currentTrack && isPlaying,
                    currentTrack: currentTrack ? {
                        trackId: currentTrack.sourceTrackId || `local:${currentTrackIndex}`,
                        title: currentTrack.title || currentTrack.baseName || currentTrack.fileName,
                        artist: currentTrack.artist || "",
                        album: currentTrack.album || "",
                        duration: currentTrack.duration || duration || 0,
                    } : null,
                    currentTime,
                    duration,
                    volume,
                    queueCount: activeQueueCount || musicFiles.length,
                    endpointStatus: cloudEndpointState?.activeKind || "unavailable",
                }),
                playTrack: async (trackId: string) => {
                    let index = musicFiles.findIndex((track, itemIndex) =>
                        track.sourceTrackId === trackId || `local:${itemIndex}` === trackId,
                    );
                    if (index < 0 && sourceMode === "subsonic" && cloudProvider) {
                        const track = await cloudProvider.library.getSong(trackId);
                        trackRegistry.register(track);
                        musicFiles = [...musicFiles, track];
                        index = musicFiles.length - 1;
                    }
                    if (index < 0) throw new Error("当前播放器中找不到该歌曲。");
                    ensureTrackInActiveQueue(index);
                    await ensureTrackLoaded(index, true);
                },
                pause: pauseCurrentPlayback,
                resume: requestCurrentPlayback,
                next: actions.nextTrack,
                previous: actions.prevTrack,
                seekTo: actions.seekTo,
                setVolume: (nextVolume: number) => {
                    volume = Math.max(0, Math.min(1, nextVolume));
                    isMuted = false;
                    sound?.volume(volume);
                    saveConfig();
                },
            });

            if (sourceMode === "local") {
                registerMusicPlayerIndexController(blockId, {
                    buildIndex: buildLightIndex,
                    rebuildIndex: rebuildLightIndex,
                    getProgress: () => metadataIndexProgress,
                }, runtimeContext.deviceViewContext!);
            }

            preloadAdjacentTracks(currentTrackIndex);
            scheduleCurrentDisplayMetadata("initial-current-display");

            if (hasMusicFiles && autoPlay && !(sourceMode === "subsonic" && activeQueueTrackKeys.length > 0)) {
                ensureTrackLoaded(currentTrackIndex, true);
            }

            if (showFloatingMini && hasMusicFiles && canUseElectronLocalFileSystem()) {
                registerFloatingMiniHost({ hostId: blockId, vmStore, actions });
            }
        }
    });

    onDestroy(() => {
        destroyed = true;
        unregisterPersistentMobilePlayer?.();
        unregisterPersistentMobilePlayer = null;
        window.removeEventListener(OPEN_MOBILE_MUSIC_PLAYER_EVENT, handleOpenMobileMusicPlayer);
        loadToken++;
        metadataQueue = [];
        lightIndexQueue = [];
        cancelScheduledDisplayMetadata();
        void metadataIndexStore?.flush();
        unregisterMusicPlayerIndexController(blockId);
        unregisterMusicPlayerPlaybackController(blockId);
        cloudQueueSaveScheduler.cancel();
        sourceProvider?.destroy();
        sourceProvider = null;
        cloudProvider = null;
        unsubscribeCloudEndpointStatus?.();
        unsubscribeCloudEndpointStatus = null;
        trackRegistry.clear();
        submitStatsSession(false);
        cleanup();
        desktopStreamRelay.destroy();
        if (persistentMobileRuntime) clearMusicPlaybackPresence();
        if (sourceMode === "local") revokeTrackCoverObjectUrls(musicFiles);
        detailDialogRef?.close();
        detailDialogRef = null;
        queueDialogRef?.close();
        queueDialogRef = null;
        unregisterFloatingMiniHost(blockId);
    });

    async function saveConfig() {
        if (persistentMobileRuntime) return;
        try {
            const currentParsed = JSON.parse(contentTypeJson);
            await saveWidgetContentPreservingSize(plugin, currentParsed.instanceId, {
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
                    sourceMode,
                    currentTrackKey: currentTrack ? getTrackKey(currentTrack) : undefined,
                    cloudStreamQuality,
                    cloudTranscodeFormat: cloudStreamQuality === "original" ? "auto" : "mp3",
                },
            }, runtimeContext.deviceViewContext!);
        } catch {
            // 保存失败时静默处理，避免阻塞播放
        }
    }

    function cleanup() {
        clearProgressInterval();
        playRequestSessionId = -1;
        loadAutoplaySessionId = -1;
        playSessionId++;
        if (sound) {
            sound.stop();
            sound.unload();
            sound = null;
        }
        disposePlaybackSource?.();
        disposePlaybackSource = null;
    }

    function safePlay(targetSound: Howl, targetSessionId: number) {
        if (!targetSound || sound !== targetSound || targetSessionId !== playSessionId || destroyed) {
            return;
        }
        if (playRequestSessionId === targetSessionId || targetSound.playing()) {
            return;
        }
        try {
            playRequestSessionId = targetSessionId;
            targetSound.play();
        } catch {
            playRequestSessionId = -1;
            errorMessage = "播放启动失败，请重新播放";
            isPlaying = false;
        }
    }

    function requestCurrentPlayback(): void {
        ensureTrackInActiveQueue(currentTrackIndex);
        if (sound?.state() === "loading") {
            loadAutoplaySessionId = playSessionId;
            return;
        }
        if (!sound || sound.state() !== "loaded") {
            cleanup();
            ensureTrackInActiveQueue(currentTrackIndex);
            submitStatsSession(false);
            void ensureTrackLoaded(currentTrackIndex, true, true);
            return;
        }
        safePlay(sound, playSessionId);
    }

    function pauseCurrentPlayback(): void {
        loadAutoplaySessionId = -1;
        playRequestSessionId = -1;
        sound?.pause();
        isPlaying = false;
    }

    function isRealTrackEnd(): boolean {
        if (!sound) return false;
        const trackDuration = resolveReliablePlaybackDuration(sound.duration(), duration);
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
        if ((sourceMode === "local" && !parseMetadata) || !currentTrack) return;
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

            if (track.sourceKind === "subsonic" && sourceProvider) {
                if (item.mode === "full") {
                    if (showLyrics && track.lyricsStatus === "pending") {
                        track.lyricsStatus = "loading";
                        const lyrics = await sourceProvider.loadLyrics(track);
                        track.lyrics = lyrics.lines;
                        track.unsyncedLyricsText = lyrics.unsyncedText;
                        track.lyricsStatus = lyrics.lines.length || lyrics.unsyncedText ? "loaded" : "none";
                    }
                    if (showCover && !track.coverObjectUrl) {
                        track.coverObjectUrl = await sourceProvider.loadCover(track, item.index === currentTrackIndex ? 512 : 256);
                    }
                }
                track.metadataLoadLevel = item.mode === "full" ? "full" : "light";
                track.metadataStatus = "loaded";
            } else {
                await loadMetadataForTrack(track, parseMetadata, item.mode, {
                    includeCover: showCover,
                    includeLyrics: showLyrics,
                });
            }

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
            if (item.mode === "full" && track.sourceKind === "local") {
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

    async function ensureTrackLoaded(
        index: number,
        shouldAutoplay: boolean = false,
        skipSubmitStats: boolean = false,
        skipMetadata: boolean = false,
        resumeSeek: number = 0,
        suppressNewSession: boolean = false,
    ): Promise<void> {
        if (!hasMusicFiles || !musicFiles[index]) return;

        if (!skipSubmitStats) {
            submitStatsSession(false);
        }

        if (!suppressNewSession && currentTrackIndex === index && sound) {
            if (shouldAutoplay) loadAutoplaySessionId = playSessionId;
            if (sound.state() === "loading") return;
            if (sound.state() === "loaded") {
                if (shouldAutoplay && !isPlaying) safePlay(sound, playSessionId);
                return;
            }
        }

        cleanup();
        cancelScheduledDisplayMetadata();
        const localSessionId = playSessionId;
        currentTrackIndex = index;
        scheduleCloudQueueSave();
        currentTime = 0;
        errorMessage = "";

        const newTrack = musicFiles[index];
        duration = resolveReliablePlaybackDuration(undefined, newTrack.duration);
        if (!suppressNewSession) {
            streamFailoverGuard.reset();
            remoteScrobbleTracker.begin(getTrackKey(newTrack), resumeSeek || pendingInitialSeek || 0);
            lastCloudQueuePositionBucket = Math.floor((resumeSeek || pendingInitialSeek || 0) / 15);
        }

        let playbackSource: ResolvedPlaybackSource;
        try {
            playbackSource = sourceProvider
                ? await sourceProvider.resolvePlaybackSource(newTrack)
                : { url: newTrack.fileUrl || "", html5: false };
            if (sourceMode === "subsonic") {
                playbackSource = await desktopStreamRelay.wrap(playbackSource, canUseElectronLocalFileSystem());
            }
        } catch (error) {
            if (localSessionId !== playSessionId || destroyed) return;
            errorMessage = error instanceof Error ? error.message : "无法解析当前歌曲播放地址";
            return;
        }
        if (localSessionId !== playSessionId || destroyed || !playbackSource.url) {
            playbackSource.dispose?.();
            return;
        }
        disposePlaybackSource = playbackSource.dispose || null;

        const targetSeek = resumeSeek || pendingInitialSeek;
        pendingInitialSeek = 0;

        let hasPlayedOnce = false;
        let targetSeekApplied = targetSeek <= 0;
        const createdSound = new Howl({
            src: [playbackSource.url],
            html5: playbackSource.html5,
            format: playbackSource.format ? [playbackSource.format] : undefined,
            volume: volume,
            mute: isMuted,
            preload: playbackSource.html5,
            onplay() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                if (!targetSeekApplied) {
                    try {
                        const loadedDuration = resolveReliablePlaybackDuration(createdSound.duration(), newTrack.duration);
                        const seekTarget = Math.min(targetSeek, loadedDuration || targetSeek);
                        createdSound.seek(seekTarget);
                        currentTime = seekTarget;
                        targetSeekApplied = true;
                    } catch { /* HTML5 流可能需要下一次用户播放后才能 seek */ }
                }
                const preserveExistingSession = suppressNewSession && !hasPlayedOnce;
                hasPlayedOnce = true;
                isPlaying = true;
                errorMessage = "";
                if (currentTrack && !preserveExistingSession) {
                    statsStore?.startSession(currentTrack, (createdSound.seek() as number) || 0);
                }
                if (preserveExistingSession) countedPlaySessionId = playSessionId;
                if (!preserveExistingSession && countedPlaySessionId !== playSessionId && currentTrack) {
                    countedPlaySessionId = playSessionId;
                    const counted = statsStore?.recordPlaybackStart(currentTrack) ?? false;
                    if (counted) statsVersion += 1;
                }
                if (sourceMode === "subsonic" && currentTrack) {
                    const key = getTrackKey(currentTrack);
                    if (remoteScrobbleTracker.markNowPlaying(key)) {
                        void sourceProvider?.scrobbleNowPlaying?.(currentTrack).catch(() => {});
                    }
                }
                const loadedDuration = resolveReliablePlaybackDuration(createdSound.duration(), newTrack.duration);
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
                playRequestSessionId = -1;
                isPlaying = false;
                if (sourceMode === "subsonic") {
                    const pausedAt = createdSound.seek() as number;
                    if (Number.isFinite(pausedAt)) currentTime = pausedAt;
                    scheduleCloudQueueSave();
                }
                submitStatsSession(false);
            },
            onend() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                playRequestSessionId = -1;
                if (!isRealTrackEnd()) {
                    errorMessage = "播放被异常中断，请重新播放或检查音频文件";
                    isPlaying = false;
                    return;
                }
                submitStatsSession(true);
                maybeSubmitRemoteScrobble(true);
                if (playMode === "repeat") {
                    // 单曲循环：直接回到开头重播，避免 ensureTrackLoaded 同曲早退
                    isPlaying = false;
                    currentTime = 0;
                    sound.seek(0);
                    countedPlaySessionId = -1;
                    if (sourceMode === "subsonic" && currentTrack) {
                        remoteScrobbleTracker.begin(getTrackKey(currentTrack), 0);
                        streamFailoverGuard.reset();
                    }
                    safePlay(sound, playSessionId);
                } else {
                    advanceToNextTrack(true);
                }
            },
            onload() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                const loadedDuration = resolveReliablePlaybackDuration(createdSound.duration(), newTrack.duration);
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
                if (targetSeek > 0) {
                    try {
                        const seekTarget = Math.min(targetSeek, loadedDuration || targetSeek);
                        createdSound.seek(seekTarget);
                        currentTime = seekTarget;
                        targetSeekApplied = true;
                    }
                    catch { /* 某些流需播放后才能 seek */ }
                }
                if (shouldAutoplay || loadAutoplaySessionId === localSessionId) {
                    safePlay(createdSound, localSessionId);
                }
            },
            onloaderror() {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                const retryPlayback = shouldAutoplay || loadAutoplaySessionId === localSessionId || playRequestSessionId === localSessionId || isPlaying;
                playRequestSessionId = -1;
                loadAutoplaySessionId = -1;
                if (sourceMode === "subsonic") void handleCloudStreamFailure(createdSound, index, retryPlayback, playbackSource.endpointKind);
                else { errorMessage = "当前音频加载失败，请检查文件路径或格式"; isPlaying = false; }
            },
            onplayerror(_soundId, playError) {
                if (sound !== createdSound || localSessionId !== playSessionId || destroyed) return;
                const retryPlayback = shouldAutoplay || loadAutoplaySessionId === localSessionId || playRequestSessionId === localSessionId || isPlaying;
                playRequestSessionId = -1;
                loadAutoplaySessionId = -1;
                const unlockRequired = isAudioUnlockRequired(playError);
                if (sourceMode === "subsonic" && unlockRequired) {
                    errorMessage = "点击播放以启用音频";
                    isPlaying = false;
                } else if (sourceMode === "subsonic") void handleCloudStreamFailure(createdSound, index, retryPlayback, playbackSource.endpointKind);
                else { errorMessage = "当前音频播放失败，请检查文件路径或格式"; isPlaying = false; }
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

    function maybeSubmitRemoteScrobble(force: boolean): void {
        if (sourceMode !== "subsonic" || !currentTrack || !sourceProvider?.scrobbleCompleted) return;
        const key = getTrackKey(currentTrack);
        if (!remoteScrobbleTracker.shouldSubmit(key, duration, force)) return;
        void sourceProvider.scrobbleCompleted(currentTrack).catch(() => { /* 完成提交不自动重试，避免重复计数 */ });
    }

    async function handleCloudStreamFailure(
        failedSound: Howl,
        index: number,
        shouldContinue: boolean,
        failedEndpointKind?: "local" | "remote",
    ): Promise<void> {
        const track = musicFiles[index];
        if (!track || !cloudProvider || sound !== failedSound) return;
        const key = getTrackKey(track);
        let failedSeek: unknown = Number.NaN;
        try { failedSeek = failedSound.seek(); } catch { /* 使用已记录的播放位置 */ }
        const attempt = streamFailoverGuard.begin(key, failedSeek, currentTime);
        if (!attempt.allowed) {
            errorMessage = "当前网络无法继续播放此歌曲";
            isPlaying = false;
            return;
        }
        try {
            await cloudProvider.endpointManager.forceAlternate(failedEndpointKind);
            const [availableKey] = ensureTrackKeysInCatalog([key]);
            const nextIndex = availableKey ? musicFiles.findIndex((item) => getTrackKey(item) === availableKey) : -1;
            if (nextIndex < 0) throw new Error("云端歌曲已不在播放目录中。" );
            await ensureTrackLoaded(nextIndex, shouldContinue, true, true, attempt.resumeAt, true);
        } catch {
            errorMessage = "当前网络无法继续播放此歌曲";
            isPlaying = false;
        }
    }

    async function loadCloudMusic(): Promise<void> {
        if (destroyed) return;
        const token = ++loadToken;
        try {
            const settingsStore = new MusicCloudSettingsStore(plugin);
            const profile = (await settingsStore.load()).profile;
            if (!profile) {
                runtimeUnsupported = true;
                unavailableTitle = "未配置 NAS 音乐服务";
                runtimeMessage = "请在组件设置中配置 NAS 音乐（Subsonic / OpenSubsonic）。";
                return;
            }
            const password = await settingsStore.getPassword();
            const provider = new SubsonicMusicProvider(profile, password, cloudStreamQuality);
            cloudProvider = provider;
            sourceProvider = provider;
            unsubscribeCloudEndpointStatus?.();
            unsubscribeCloudEndpointStatus = provider.endpointManager.subscribe((state) => {
                cloudEndpointState = state;
                publishMusicCloudEndpointState(state);
            });
            const initialized = await provider.initialize();
            if (destroyed || token !== loadToken) { provider.destroy(); return; }
            cloudConnected = true;
            const restored = initialized.restoredQueue;
            let initialPage: MusicTrack[] = [];
            let initialPageError = "";
            try { initialPage = await provider.library.getAllSongsPage(0, 50); }
            catch (error) { initialPageError = error instanceof Error ? error.message : "服务器不支持全库歌曲分页。"; }
            if (destroyed || token !== loadToken) { provider.destroy(); return; }
            activeQueueTrackKeys = normalizeCloudQueueAfterMutation(
                (restored?.tracks || []).map(getTrackKey),
                undefined,
                false,
            );
            activeQueueCount = activeQueueTrackKeys.length;
            trackRegistry.setProtectedKeys(activeQueueTrackKeys);
            const byKey = new Map<string, MusicTrack>();
            for (const track of [...(restored?.tracks || []), ...initialPage]) byKey.set(getTrackKey(track), track);
            musicFiles = [...byKey.values()];
            trackRegistry.registerMany(musicFiles);
            favoriteTrackKeys = musicFiles.filter((track) => !!track.serverStarredAt).map(getTrackKey);
            const restoreState = resolveInitialCloudPlaybackState(restored, initialConfig.currentTrackKey);
            const restoreKey = restoreState.currentTrackKey;
            if (restoreKey) {
                let restoredIndex = musicFiles.findIndex((track) => getTrackKey(track) === restoreKey);
                if (restoredIndex < 0 && restoreKey.startsWith(`subsonic:${profile.id}:`)) {
                    const songId = restoreKey.slice(`subsonic:${profile.id}:`.length);
                    const restoredTrack = await provider.library.getSong(songId).catch(() => null);
                    if (destroyed || token !== loadToken) { provider.destroy(); return; }
                    if (restoredTrack) {
                        musicFiles = [...musicFiles, restoredTrack];
                        trackRegistry.register(restoredTrack);
                        restoredIndex = musicFiles.length - 1;
                    }
                }
                if (restoredIndex >= 0) currentTrackIndex = restoredIndex;
            }
            pendingInitialSeek = restoreState.positionSeconds;
            if (!musicFiles.length) {
                runtimeUnsupported = true;
                unavailableTitle = "NAS 音乐库暂无可播放歌曲";
                runtimeMessage = initialPageError
                    ? `${initialPageError} 可打开音乐库并按专辑或艺术家继续浏览。`
                    : "服务器已连接，但没有返回歌曲。可在音乐库中按专辑或艺术家浏览。";
            }
        } catch (error) {
            if (destroyed || token !== loadToken) return;
            cloudConnected = false;
            runtimeUnsupported = true;
            unavailableTitle = "NAS 音乐服务不可用";
            runtimeMessage = error instanceof Error ? error.message : "本地地址与远程地址均连接失败。";
        }
    }

    async function retryCloudConnection(): Promise<void> {
        if (cloudRetrying || sourceMode !== "subsonic") return;
        cloudRetrying = true;
        cloudQueueSaveScheduler.cancel();
        sourceProvider?.destroy();
        sourceProvider = null;
        cloudProvider = null;
        cloudConnected = false;
        unsubscribeCloudEndpointStatus?.();
        unsubscribeCloudEndpointStatus = null;
        cloudEndpointState = null;
        musicFiles = [];
        activeQueueTrackKeys = [];
        activeQueueCount = 0;
        trackRegistry.clear();
        try {
            await loadCloudMusic();
            if (musicFiles.length > 0) {
                runtimeUnsupported = false;
                currentTrackIndex = normalizeTrackIndex(currentTrackIndex, musicFiles.length);
                preloadAdjacentTracks(currentTrackIndex);
                scheduleCurrentDisplayMetadata("cloud-reconnect");
            }
        } finally { cloudRetrying = false; }
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
            const result = sourceProvider instanceof LocalMusicProvider
                ? await sourceProvider.scan()
                : getAudioFilesFromDirectory(musicFolderPath, scanSubfolders);
            musicFiles = result.tracks;
            trackRegistry.registerMany(musicFiles);
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

    function registerCloudTracks(tracks: MusicTrack[]): number[] {
        const maxCloudCatalogEntries = 5000;
        const currentKey = currentTrack ? getTrackKey(currentTrack) : undefined;
        trackRegistry.setProtectedKeys([...(activeQueueTrackKeys || []), ...(currentKey ? [currentKey] : [])]);
        const next = [...musicFiles];
        const keyToIndex = new Map(next.map((track, index) => [getTrackKey(track), index]));
        const registeredKeys: string[] = [];
        for (const track of tracks) {
            const key = getTrackKey(track);
            trackRegistry.register(track);
            let index = keyToIndex.get(key);
            if (index === undefined) {
                index = next.length;
                next.push(track);
                keyToIndex.set(key, index);
            } else {
                next[index] = { ...next[index], ...track, coverObjectUrl: next[index].coverObjectUrl, lyrics: next[index].lyrics };
            }
            registeredKeys.push(key);
        }
        if (next.length > maxCloudCatalogEntries) {
            const protectedKeys = new Set([...activeQueueTrackKeys, ...registeredKeys, ...(currentKey ? [currentKey] : [])]);
            const keepKeys = new Set(protectedKeys);
            for (let index = next.length - 1; index >= 0 && keepKeys.size < maxCloudCatalogEntries; index--) {
                keepKeys.add(getTrackKey(next[index]));
            }
            const compacted = next.filter((track) => keepKeys.has(getTrackKey(track)));
            next.length = 0;
            next.push(...compacted);
        }
        musicFiles = next;
        if (currentKey) {
            const nextCurrentIndex = musicFiles.findIndex((track) => getTrackKey(track) === currentKey);
            if (nextCurrentIndex >= 0) currentTrackIndex = nextCurrentIndex;
        }
        trackRegistry.setProtectedKeys([...(activeQueueTrackKeys || []), ...(currentKey ? [currentKey] : [])]);
        const compactedIndex = new Map(musicFiles.map((track, index) => [getTrackKey(track), index]));
        return registeredKeys.map((key) => compactedIndex.get(key)).filter((index): index is number => index !== undefined);
    }

    function playCloudTrack(track: MusicTrack): void {
        const [index] = registerCloudTracks([track]);
        if (index === undefined) return;
        ensureTrackInActiveQueue(index);
        submitStatsSession(false);
        void ensureTrackLoaded(index, true, true);
        saveConfig();
    }

    function replaceCloudQueue(tracks: MusicTrack[]): void {
        const indices = registerCloudTracks(tracks);
        actions.replaceActiveQueueFromIndices(indices);
    }

    function appendCloudQueue(tracks: MusicTrack[]): void {
        const indices = registerCloudTracks(tracks);
        actions.appendActiveQueueFromIndices(indices);
    }

    async function openPersistentMobileDetail(): Promise<void> {
        for (let attempt = 0; attempt < 48; attempt++) {
            const request = requestOpenMobileMusicPlayer();
            if (request.handled) {
                if (request.unavailableReason) errorMessage = request.unavailableReason;
                return;
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
        }
        errorMessage = "NAS 音乐播放器仍在初始化，请稍后重试。";
    }

    function openDetailDialog(forceOwnRuntime = false) {
        if (delegatedMobileSurface && !forceOwnRuntime) {
            void openPersistentMobileDetail();
            return;
        }
        if ((!hasMusicFiles && !cloudConnected) || detailDialogRef) return;
        if (mobileRuntime && !cloudProvider) return;
        detailDialogOpen = true;
        scheduleCurrentDisplayMetadata("detail-open");
        try {
            const dialog = svelteDialog({
                width: mobileRuntime ? "100vw" : "min(960px, calc(100vw - 32px))",
                height: mobileRuntime ? "100dvh" : "min(680px, calc(100vh - 64px))",
                title: "",
                constructor: (containerEl: HTMLElement) => {
                    try {
                        if (mobileRuntime && cloudProvider) {
                            return mount(MusicPlayerMobilePage, {
                                target: containerEl,
                                props: {
                                    vmStore,
                                    actions,
                                    provider: cloudProvider,
                                    onClose: () => dialog.close(),
                                    onRegisterTracks: registerCloudTracks,
                                    onPlayCloudTrack: playCloudTrack,
                                    onReplaceCloudQueue: replaceCloudQueue,
                                    onAppendCloudQueue: appendCloudQueue,
                                },
                            });
                        }
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
                                cloudProvider,
                                onRegisterCloudTracks: registerCloudTracks,
                                onPlayCloudTrack: playCloudTrack,
                                onReplaceCloudQueue: replaceCloudQueue,
                                onAppendCloudQueue: appendCloudQueue,
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
            dialog.dialog.element.classList.add(mobileRuntime ? "music-player-mobile-detail-host" : "music-player-detail-dialog-host");
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
    {#if delegatedMobileSurface && advancedEnabled}
        <button type="button" class="mobile-runtime-launcher" onclick={() => void openPersistentMobileDetail()}>
            <span class="mobile-runtime-launcher__icon"><MusicPlayerIcon name="headphones" size={34} /></span>
            <span class="mobile-runtime-launcher__copy">
                <strong>打开 NAS 音乐播放器</strong>
                <small>由常驻播放器运行，关闭主页后仍可继续播放</small>
            </span>
        </button>
        {#if errorMessage}<p class="mobile-runtime-launcher__error">{errorMessage}</p>{/if}
    {:else if advancedEnabled}
        {#if runtimeUnsupported}
            <div class="runtime-unsupported">
                <h2>{unavailableTitle}</h2>
                <h3>{runtimeMessage}</h3>
                {#if scanTruncated}
                    <p class="truncated-hint">文件夹内音乐文件过多，仅加载前 1000 首。</p>
                {/if}
                {#if sourceMode === "subsonic" && cloudEndpointState}
                    <div class="endpoint-failures" aria-live="polite">
                        <p>本地地址：{formatCloudEndpointHealth("local")}</p>
                        <p>远程地址：{formatCloudEndpointHealth("remote")}</p>
                    </div>
                {/if}
                {#if sourceMode === "subsonic" && unavailableTitle !== "未配置 NAS 音乐服务"}
                    {#if cloudConnected}<button class="b3-button" onclick={openDetailDialog}>打开音乐库</button>{/if}
                    <button class="b3-button" disabled={cloudRetrying} onclick={retryCloudConnection}>{cloudRetrying ? "正在重新连接…" : "重新连接"}</button>
                {/if}
            </div>
        {:else}
            <MusicPlayerMini {vm} {actions} onOpenDetail={openDetailDialog} />
        {/if}
    {:else}
        <div class="content-not-advanced">
            <AdvancedFeatureLock
                title="音乐播放器"
                subtitle="播放本地音乐或 NAS 音乐，桌面端与移动端均可使用。"
                icon="music"
                features={[
                    "桌面本地音乐文件夹读取",
                    "NAS 音乐双地址自动切换",
                    "封面、歌词、歌单与播放队列"
                ]}
                highlights={["本地音乐", "NAS 音乐", "跨设备队列"]}
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

    .mobile-runtime-launcher {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        width: min(100%, 24rem);
        min-height: 5rem;
        padding: 0.8rem 1rem;
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 35%, var(--b3-border-color));
        border-radius: 1rem;
        background: color-mix(in srgb, var(--b3-theme-background) 88%, var(--b3-theme-primary) 12%);
        color: var(--b3-theme-on-background);
        text-align: left;
    }

    .mobile-runtime-launcher__icon {
        display: grid;
        place-items: center;
        width: 3.25rem;
        height: 3.25rem;
        flex: none;
        border-radius: 50%;
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .mobile-runtime-launcher__copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;

        strong {
            font-size: 1rem;
        }

        small {
            color: var(--b3-theme-on-surface-light);
            line-height: 1.4;
        }
    }

    .mobile-runtime-launcher__error {
        margin: 0.7rem 0 0;
        color: var(--b3-card-error-color, #dc2626);
        text-align: center;
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

        .endpoint-failures {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            max-width: min(34rem, calc(100% - 2rem));
            padding: 0.65rem 0.8rem;
            border-radius: 8px;
            background: color-mix(in srgb, var(--b3-theme-on-surface) 7%, transparent);

            p {
                margin: 0;
                overflow-wrap: anywhere;
                font-size: 0.8rem;
            }
        }
    }
</style>
