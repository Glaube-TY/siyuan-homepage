import type { MusicLyricLine, MusicSourceKind, MusicTrack } from "./musicPlayerTypes";

export function resolveMusicSourceKindForRuntime(
    configuredSource: MusicSourceKind,
    mobileRuntime: boolean,
): MusicSourceKind {
    return mobileRuntime ? "subsonic" : configuredSource;
}

export interface MusicSourceRuntimePolicy {
    canInitialize: boolean;
    useElectronLocalFileSystem: boolean;
}

export function getMusicSourceRuntimePolicy(
    sourceKind: MusicSourceKind,
    electronLocalFileSystemAvailable: boolean,
): MusicSourceRuntimePolicy {
    const useElectronLocalFileSystem = sourceKind === "local" && electronLocalFileSystemAvailable;
    return {
        canInitialize: sourceKind === "subsonic" || useElectronLocalFileSystem,
        useElectronLocalFileSystem,
    };
}

export function isAudioUnlockRequired(error: unknown): boolean {
    return /gesture|interact|notallowed|user didn't interact|play\(\)/i.test(String(error || ""));
}

export function resolveReliablePlaybackDuration(
    mediaDuration: unknown,
    metadataDuration: unknown,
): number {
    const mediaValue = Number(mediaDuration);
    if (Number.isFinite(mediaValue) && mediaValue > 0) return mediaValue;
    const metadataValue = Number(metadataDuration);
    return Number.isFinite(metadataValue) && metadataValue > 0 ? metadataValue : 0;
}

export function resolveLocalPlaybackSource(track: MusicTrack): ResolvedPlaybackSource {
    if (!track.fileUrl) throw new Error("本地音乐文件地址无效。" );
    return { url: track.fileUrl, html5: false };
}

export interface MusicSourceCapabilities {
    localFileSystem: boolean;
    serverFavorites: boolean;
    serverPlaylists: boolean;
    serverPlayQueue: boolean;
    structuredLyrics: boolean;
    transcoding: boolean;
    scrobble: boolean;
    search: boolean;
    artists: boolean;
    albums: boolean;
}

export interface ResolvedPlaybackSource {
    url: string;
    format?: string;
    html5: boolean;
    endpointKind?: "local" | "remote";
    endpointGeneration?: number;
    dispose?: () => void;
}

export interface MusicSourceInitResult {
    capabilities: MusicSourceCapabilities;
    tracks?: MusicTrack[];
    restoredQueue?: {
        tracks: MusicTrack[];
        currentTrackKey?: string;
        positionMs?: number;
    };
}

export interface MusicSourceProvider {
    readonly kind: MusicSourceKind;
    initialize(): Promise<MusicSourceInitResult>;
    destroy(): void;
    refreshConnection?(): Promise<void>;
    resolvePlaybackSource(track: MusicTrack): Promise<ResolvedPlaybackSource>;
    loadLyrics(track: MusicTrack): Promise<{ lines: MusicLyricLine[]; unsyncedText?: string }>;
    loadCover(track: MusicTrack, size: number): Promise<string | undefined>;
    isFavorite(track: MusicTrack): boolean | Promise<boolean>;
    toggleFavorite(track: MusicTrack): Promise<boolean>;
    scrobbleNowPlaying?(track: MusicTrack): Promise<void>;
    scrobbleCompleted?(track: MusicTrack): Promise<void>;
}
