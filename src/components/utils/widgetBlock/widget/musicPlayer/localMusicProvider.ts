import { canUseElectronLocalFileSystem } from "@/components/tools/runtimeEnv";
import { loadExternalCoverForTrack } from "./musicMetadataService";
import { loadLyricsForTrack } from "./musicLyricsService";
import { getAudioFilesFromDirectory } from "./musicPlayerUtils";
import type { MusicTrack } from "./musicPlayerTypes";
import { resolveLocalPlaybackSource } from "./musicSourceTypes";
import type { MusicSourceInitResult, MusicSourceProvider, ResolvedPlaybackSource } from "./musicSourceTypes";

export class LocalMusicProvider implements MusicSourceProvider {
    readonly kind = "local" as const;
    constructor(private readonly folderPath: string, private readonly scanSubfolders: boolean) {}

    async initialize(): Promise<MusicSourceInitResult> {
        if (!canUseElectronLocalFileSystem()) throw new Error("当前设备无法读取本地音乐。" );
        const result = await this.scan();
        return {
            capabilities: {
                localFileSystem: true, serverFavorites: false, serverPlaylists: false, serverPlayQueue: false,
                structuredLyrics: false, transcoding: false, scrobble: false, search: false, artists: false, albums: false,
            },
            tracks: result.tracks,
        };
    }
    async scan() { return getAudioFilesFromDirectory(this.folderPath, this.scanSubfolders); }
    destroy(): void {}
    async resolvePlaybackSource(track: MusicTrack): Promise<ResolvedPlaybackSource> {
        return resolveLocalPlaybackSource(track);
    }
    async loadLyrics(track: MusicTrack) { await loadLyricsForTrack(track); return { lines: track.lyrics, unsyncedText: track.unsyncedLyricsText }; }
    async loadCover(track: MusicTrack) { await loadExternalCoverForTrack(track); return track.coverObjectUrl; }
    isFavorite(): boolean { return false; }
    async toggleFavorite(): Promise<boolean> { return false; }
}
