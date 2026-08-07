import type { MusicCloudStreamQuality, MusicTrack } from "../musicPlayerTypes";
import type { MusicSourceCapabilities, MusicSourceInitResult, MusicSourceProvider, ResolvedPlaybackSource } from "../musicSourceTypes";
import type { MusicCloudProfile } from "../musicCloudSettingsStore";
import { SubsonicClient, type SubsonicProxy } from "./subsonicClient";
import { SubsonicCoverService } from "./subsonicCoverService";
import { SubsonicEndpointManager, type EndpointRequestContext } from "./subsonicEndpointManager";
import { SubsonicLibraryService } from "./subsonicLibraryService";
import { SubsonicLyricsService } from "./subsonicLyricsService";
import { normalizeExtensions } from "./subsonicResponse";
import { mapSubsonicSongToTrack } from "./subsonicTrack";
import { resolveSubsonicPlaybackSource } from "./subsonicPlayback";

export class SubsonicMusicProvider implements MusicSourceProvider {
    readonly kind = "subsonic" as const;
    readonly client: SubsonicClient;
    readonly endpointManager: SubsonicEndpointManager;
    readonly library: SubsonicLibraryService;
    private coverService: SubsonicCoverService;
    private lyricsService: SubsonicLyricsService | null = null;
    private extensions = new Set<string>();
    private favoriteIds = new Set<string>();

    constructor(
        readonly profile: MusicCloudProfile,
        password: string,
        private readonly quality: MusicCloudStreamQuality,
        proxy?: SubsonicProxy,
    ) {
        this.client = new SubsonicClient({ username: profile.username, password }, proxy);
        this.endpointManager = new SubsonicEndpointManager(profile, this.client);
        this.library = new SubsonicLibraryService(profile.id, this.endpointManager, this.client);
        this.coverService = new SubsonicCoverService(this.endpointManager, this.client, 100, proxy);
    }

    async initialize(): Promise<MusicSourceInitResult> {
        await this.endpointManager.initialize();
        try {
            const discovered = await this.endpointManager.executeRead(async (ctx) => normalizeExtensions(
                await this.client.request(ctx.baseUrl, ctx.kind, "getOpenSubsonicExtensions", {}, { signal: ctx.signal }),
            ));
            this.extensions = new Set(discovered.map((item) => item.name));
        } catch { this.extensions = new Set(); }
        this.library.setIndexBasedQueueEnabled(this.extensions.has("indexBasedQueue"));
        this.lyricsService = new SubsonicLyricsService(this.endpointManager, this.client, this.extensions);

        let restoredQueue: MusicSourceInitResult["restoredQueue"];
        try {
            const queue = await this.library.getPlayQueue();
            const tracks = queue.entry.map((song) => mapSubsonicSongToTrack(song, this.profile.id));
            restoredQueue = {
                tracks,
                currentTrackKey: queue.current ? `subsonic:${this.profile.id}:${String(queue.current)}` : undefined,
                positionMs: queue.position,
            };
        } catch { /* queue is optional at runtime */ }
        return { capabilities: this.capabilities(), restoredQueue };
    }

    destroy(): void { this.endpointManager.destroy(); this.coverService.destroy(); }
    async refreshConnection(): Promise<void> { await this.endpointManager.refreshConnection(); }

    async resolvePlaybackSource(track: MusicTrack): Promise<ResolvedPlaybackSource> {
        if (!track.sourceTrackId) throw new Error("云端歌曲缺少 song id。" );
        return this.endpointManager.executeRead(async (ctx) => resolveSubsonicPlaybackSource(
            (params) => this.client.buildUrl(ctx.baseUrl, "stream", params), ctx, track, this.quality,
        ));
    }

    loadLyrics(track: MusicTrack) { return this.lyricsService?.load(track) || Promise.resolve({ lines: [] }); }
    loadCover(track: MusicTrack, size: number) { return this.coverService.load(track.coverArtId || "", size); }
    isFavorite(track: MusicTrack): boolean { return !!track.serverStarredAt || this.favoriteIds.has(String(track.sourceTrackId)); }
    async toggleFavorite(track: MusicTrack): Promise<boolean> {
        const id = String(track.sourceTrackId || "");
        if (!id) return false;
        const next = !this.isFavorite(track);
        await this.endpointManager.executeIdempotentWrite((ctx) => this.client.request(ctx.baseUrl, ctx.kind, next ? "star" : "unstar", { id }, { signal: ctx.signal }));
        if (next) { this.favoriteIds.add(id); track.serverStarredAt = Date.now(); }
        else { this.favoriteIds.delete(id); track.serverStarredAt = undefined; }
        return next;
    }
    async scrobbleNowPlaying(track: MusicTrack): Promise<void> { await this.scrobble(track, false); }
    async scrobbleCompleted(track: MusicTrack): Promise<void> { await this.scrobble(track, true); }

    private async scrobble(track: MusicTrack, submission: boolean): Promise<void> {
        if (!track.sourceTrackId) return;
        const operation = (ctx: EndpointRequestContext) =>
            this.client.request(ctx.baseUrl, ctx.kind, "scrobble", { id: track.sourceTrackId, submission }, { signal: ctx.signal });
        if (submission) {
            await this.endpointManager.executeNonIdempotentWrite(operation);
        } else {
            await this.endpointManager.executeIdempotentWrite(operation);
        }
    }

    private capabilities(): MusicSourceCapabilities {
        return {
            localFileSystem: false, serverFavorites: true, serverPlaylists: true, serverPlayQueue: true,
            structuredLyrics: this.extensions.has("songLyrics"), transcoding: true, scrobble: true,
            search: true, artists: true, albums: true,
        };
    }
}
