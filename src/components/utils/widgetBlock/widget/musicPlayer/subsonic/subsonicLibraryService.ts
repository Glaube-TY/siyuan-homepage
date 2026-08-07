import type { MusicTrack } from "../musicPlayerTypes";
import type { SubsonicEndpointManager } from "./subsonicEndpointManager";
import type { SubsonicClient } from "./subsonicClient";
import {
    asArray, normalizeAlbum, normalizeArtist, normalizeArtists, normalizePlayQueue, normalizePlayQueueByIndex,
    normalizePlaylist, normalizeSearchResult, normalizeSong, normalizeStarredSongs,
} from "./subsonicResponse";
import { mapSubsonicSongToTrack } from "./subsonicTrack";
import type { SubsonicAlbum, SubsonicArtist, SubsonicPlayQueue, SubsonicPlaylist, SubsonicSearchResult } from "./subsonicTypes";

export class SubsonicLibraryService {
    private searchEpoch = 0;
    private indexBasedQueue = false;
    constructor(private readonly profileId: string, private readonly endpoints: SubsonicEndpointManager, private readonly client: SubsonicClient) {}

    setIndexBasedQueueEnabled(enabled: boolean): void { this.indexBasedQueue = enabled; }

    async search(query: string, songOffset = 0, songCount = 50): Promise<SubsonicSearchResult> {
        const epoch = ++this.searchEpoch;
        const result = await this.read("search3", { query, artistCount: 20, albumCount: 20, songCount, songOffset }, normalizeSearchResult);
        if (epoch !== this.searchEpoch) return { artists: [], albums: [], songs: [] };
        return result;
    }

    async getAllSongsPage(offset = 0, count = 50): Promise<MusicTrack[]> {
        const result = await this.read("search3", { query: "", artistCount: 0, albumCount: 0, songCount: count, songOffset: offset }, normalizeSearchResult);
        return result.songs.map((song) => mapSubsonicSongToTrack(song, this.profileId));
    }

    async getArtists(): Promise<SubsonicArtist[]> { return this.read("getArtists", {}, normalizeArtists); }
    async getArtist(id: string): Promise<SubsonicArtist> { return this.read("getArtist", { id }, (e) => normalizeArtist(e.artist)); }
    async getAlbum(id: string): Promise<SubsonicAlbum> { return this.read("getAlbum", { id }, (e) => normalizeAlbum(e.album)); }
    async getAlbumList(type = "alphabeticalByName", offset = 0, size = 50): Promise<SubsonicAlbum[]> {
        return this.read("getAlbumList2", { type, offset, size }, (e) => asArray((e.albumList2 as any)?.album).map(normalizeAlbum));
    }
    async getSong(id: string): Promise<MusicTrack> { return this.read("getSong", { id }, (e) => mapSubsonicSongToTrack(normalizeSong(e.song), this.profileId)); }
    async getStarredSongs(): Promise<MusicTrack[]> { return this.read("getStarred2", {}, (e) => normalizeStarredSongs(e).map((s) => mapSubsonicSongToTrack(s, this.profileId))); }
    async getPlaylists(): Promise<SubsonicPlaylist[]> { return this.read("getPlaylists", {}, (e) => asArray((e.playlists as any)?.playlist).map(normalizePlaylist)); }
    async getPlaylist(id: string): Promise<SubsonicPlaylist> { return this.read("getPlaylist", { id }, (e) => normalizePlaylist(e.playlist)); }

    async createPlaylist(name: string, songIds: string[] = []): Promise<SubsonicPlaylist> {
        return this.endpoints.executeNonIdempotentWrite(async (ctx) => {
            const envelope = await this.client.request(ctx.baseUrl, ctx.kind, "createPlaylist", { name, songId: songIds }, { signal: ctx.signal });
            return normalizePlaylist(envelope.playlist);
        });
    }
    async updatePlaylist(id: string, options: { name?: string; comment?: string; public?: boolean; songIdsToAdd?: string[]; songIndexesToRemove?: number[] }): Promise<SubsonicPlaylist> {
        await this.endpoints.executeNonIdempotentWrite((ctx) => this.client.request(ctx.baseUrl, ctx.kind, "updatePlaylist", {
            playlistId: id, name: options.name, comment: options.comment, public: options.public,
            songIdToAdd: options.songIdsToAdd, songIndexToRemove: options.songIndexesToRemove,
        }, { signal: ctx.signal }));
        return this.getPlaylist(id);
    }
    async deletePlaylist(id: string): Promise<void> { await this.endpoints.executeNonIdempotentWrite((ctx) => this.client.request(ctx.baseUrl, ctx.kind, "deletePlaylist", { id }, { signal: ctx.signal })); }
    async getPlayQueue(): Promise<SubsonicPlayQueue> {
        return this.indexBasedQueue
            ? this.read("getPlayQueueByIndex", {}, normalizePlayQueueByIndex)
            : this.read("getPlayQueue", {}, normalizePlayQueue);
    }
    async savePlayQueue(songIds: string[], current?: string, positionMs?: number): Promise<void> {
        if (this.indexBasedQueue) {
            const currentIndex = current ? songIds.indexOf(current) : -1;
            await this.endpoints.executeIdempotentWrite((ctx) => this.client.request(ctx.baseUrl, ctx.kind, "savePlayQueueByIndex", {
                id: songIds, currentIndex: songIds.length ? Math.max(0, currentIndex) : undefined, position: positionMs,
            }, { signal: ctx.signal }));
            return;
        }
        await this.endpoints.executeIdempotentWrite((ctx) => this.client.request(ctx.baseUrl, ctx.kind, "savePlayQueue", { id: songIds, current: songIds.length ? current : undefined, position: positionMs }, { signal: ctx.signal }));
    }

    private async read<T>(endpoint: Parameters<SubsonicClient["request"]>[2], params: Record<string, any>, normalize: (envelope: any) => T): Promise<T> {
        return this.endpoints.executeRead(async (ctx) => normalize(await this.client.request(ctx.baseUrl, ctx.kind, endpoint, params, { signal: ctx.signal })));
    }
}
