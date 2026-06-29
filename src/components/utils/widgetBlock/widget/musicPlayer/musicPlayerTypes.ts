import type { Writable } from "svelte/store";

export type MusicPlayMode = "order" | "repeat" | "shuffle";

export type MusicPlayerSortMode = "default" | "title" | "artist" | "album" | "duration" | "recent" | "plays";

export type MusicPlayerSortDirection = "asc" | "desc";

export type MusicPlayerViewMode = "all" | "favorites" | "playlists";

export interface MusicPlaylist {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    trackKeys: string[];
}

export interface ActiveQueue {
    trackKeys: string[];
    updatedAt: number;
}

export interface MusicPlayerSettings {
    musicFolderPath: string;
    currentTrackIndex: number;
    playMode: MusicPlayMode;
    isMuted: boolean;
    volume: number;
    autoPlay: boolean;
    showLyrics: boolean;
    showCover: boolean;
    scanSubfolders: boolean;
    parseMetadata: boolean;
    sortMode: MusicPlayerSortMode;
    sortDirection: MusicPlayerSortDirection;
    showFloatingMini: boolean;
}

export type MusicMetadataStatus = "pending" | "loading" | "loaded" | "failed";

export type MusicMetadataLoadMode = "full" | "light";

export type MusicMetadataLoadLevel = "none" | "light" | "full";

export interface MusicLyricLine {
    time: number;
    primary: string;
    translation?: string;
}

export interface MusicTrack {
    filePath: string;
    fileUrl: string;
    fileName: string;
    baseName: string;
    ext: string;
    size: number;
    mtimeMs: number;
    title: string;
    artist: string;
    album: string;
    duration: number;
    bitrate?: number;
    sampleRate?: number;
    coverObjectUrl?: string;
    lyricPath?: string;
    lyrics: MusicLyricLine[];
    unsyncedLyricsText?: string;
    lyricsStatus: "pending" | "loading" | "loaded" | "failed" | "none";
    metadataStatus: MusicMetadataStatus;
    metadataLoadLevel?: MusicMetadataLoadLevel;
    metadataError?: string;
}

export interface MetadataCacheEntry {
    filePath: string;
    size: number;
    mtimeMs: number;
    title: string;
    artist: string;
    album: string;
    duration: number;
    bitrate?: number;
    sampleRate?: number;
    unsyncedLyricsText?: string;
    lyrics?: MusicLyricLine[];
    metadataLoadLevel?: MusicMetadataLoadLevel;
}

export const DEFAULT_MUSIC_PLAYER_SETTINGS: MusicPlayerSettings = {
    musicFolderPath: "",
    currentTrackIndex: 0,
    playMode: "order",
    isMuted: false,
    volume: 0.5,
    autoPlay: false,
    showLyrics: true,
    showCover: true,
    scanSubfolders: false,
    parseMetadata: true,
    sortMode: "default",
    sortDirection: "asc",
    showFloatingMini: false,
};

export interface MusicMetadataIndexProgress {
    running: boolean;
    total: number;
    queued: number;
    processed: number;
    indexed: number;
    basic: number;
    noTag: number;
    failed: number;
    skipped: number;
    fresh: number;
    startedAt?: number;
    updatedAt?: number;
    completedAt?: number;
    lastMessage?: string;
}

export const DEFAULT_MUSIC_METADATA_INDEX_PROGRESS: MusicMetadataIndexProgress = {
    running: false,
    total: 0,
    queued: 0,
    processed: 0,
    indexed: 0,
    basic: 0,
    noTag: 0,
    failed: 0,
    skipped: 0,
    fresh: 0,
};

export interface MusicPlayerViewModel {
    musicFiles: MusicTrack[];
    currentTrackIndex: number;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    playMode: MusicPlayMode;
    showLyrics: boolean;
    showCover: boolean;
    errorMessage: string;
    scanTruncated: boolean;
    sortMode: MusicPlayerSortMode;
    sortDirection: MusicPlayerSortDirection;
    viewMode: MusicPlayerViewMode;
    selectedPlaylistId: string | null;
    favoriteTrackKeys: string[];
    playlists: MusicPlaylist[];
    statsVersion: number;
    activeQueueTrackKeys: string[];
    activeQueueCount: number;
    detailDialogOpen: boolean;
    metadataIndexProgress: MusicMetadataIndexProgress;
}

export interface MusicPlayerActions {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    playTrack: (index: number) => void;
    seekByMouse: (e: MouseEvent) => void;
    seekByKeyboard: (e: KeyboardEvent) => void;
    setVolume: (e: Event) => void;
    setVolumeChange: (e: Event) => void;
    toggleMute: () => void;
    togglePlayMode: () => void;
    toggleShowLyrics: () => void;
    toggleShowCover: () => void;
    setSortMode: (mode: MusicPlayerSortMode) => void;
    setSortDirection: (direction: MusicPlayerSortDirection) => void;
    toggleFavorite: () => void;
    toggleFavoriteTrack: (trackKey: string) => void;
    setViewMode: (mode: MusicPlayerViewMode) => void;
    selectPlaylist: (id: string | null) => void;
    createPlaylist: (name: string) => string | null;
    renamePlaylist: (id: string, name: string) => boolean;
    deletePlaylist: (id: string) => boolean;
    addCurrentTrackToPlaylist: (playlistId: string) => boolean;
    addTrackToPlaylist: (playlistId: string, trackKey: string) => boolean;
    removeTrackFromPlaylist: (playlistId: string, trackKey: string) => boolean;
    exportPlaylistM3U8: (playlistId: string, pathMode: "absolute" | "relative") => { content: string; missingCount: number } | null;
    importM3U8: (text: string) => { name: string; trackKeys: string[]; missingCount: number } | null;
    exportLibraryJSON: () => string;
    importLibraryJSON: (text: string) => { favoritesCount: number; playlistsCount: number } | null;
    syncLibraryState: () => void;
    replaceActiveQueueFromIndices: (indices: number[]) => void;
    appendActiveQueueFromIndices: (indices: number[]) => void;
    appendTrackToActiveQueue: (index: number) => void;
    removeTrackFromActiveQueue: (trackKey: string) => void;
    clearActiveQueue: () => void;
    openActiveQueueDialog: () => void;
    openDetailDialog: () => void;
    seekTo: (time: number) => void;
}

export type MusicPlayerVmStore = Writable<MusicPlayerViewModel>;
