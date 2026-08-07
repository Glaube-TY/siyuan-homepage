import { mapSubsonicApiError, SubsonicError } from "./subsonicErrors";
import type {
    SubsonicAlbum, SubsonicArtist, SubsonicEnvelope, SubsonicExtension,
    SubsonicPlayQueue, SubsonicPlaylist, SubsonicSearchResult, SubsonicServerInfo, SubsonicSong,
} from "./subsonicTypes";

export function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function optionalString(value: unknown): string | undefined {
    return value == null || value === "" ? undefined : String(value);
}

function optionalNumber(value: unknown): number | undefined {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredId(value: unknown, entity: string): string {
    const id = value == null ? "" : String(value);
    if (!id) throw new SubsonicError("server_response_invalid", `NAS 音乐服务器返回的${entity}缺少 ID。` );
    return id;
}

function parseTimestamp(value: unknown): number | undefined {
    const text = optionalString(value);
    if (!text) return undefined;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseSubsonicEnvelope(body: string | unknown): SubsonicEnvelope {
    let parsed: unknown = body;
    if (typeof body === "string") {
        try { parsed = JSON.parse(body); } catch {
            throw new SubsonicError("server_response_invalid", "NAS 音乐服务器返回了无法解析的响应。" );
        }
    }
    const envelope = asRecord(asRecord(parsed)["subsonic-response"]);
    if (!envelope.status) throw new SubsonicError("server_response_invalid", "NAS 音乐服务器响应缺少 Subsonic 状态。" );
    if (envelope.status !== "ok") {
        const error = asRecord(envelope.error);
        throw mapSubsonicApiError(optionalNumber(error.code), optionalString(error.message));
    }
    return envelope as SubsonicEnvelope;
}

export function normalizeServerInfo(envelope: SubsonicEnvelope): SubsonicServerInfo {
    return {
        apiVersion: optionalString(envelope.version) || "",
        type: optionalString(envelope.type),
        serverVersion: optionalString(envelope.serverVersion),
        openSubsonic: envelope.openSubsonic === true,
    };
}

export function normalizeMusicFolderSignature(envelope: SubsonicEnvelope): string {
    return asArray(asRecord(envelope.musicFolders).musicFolder)
        .map((raw) => {
            const folder = asRecord(raw);
            return `${String(folder.id ?? "")}:${String(folder.name ?? "")}`;
        })
        .sort()
        .join("|");
}

export function areLikelySameSubsonicServer(
    local: SubsonicServerInfo,
    remote: SubsonicServerInfo,
    localFolders = "",
    remoteFolders = "",
): boolean {
    if (local.type && remote.type && local.type !== remote.type) return false;
    if (local.serverVersion && remote.serverVersion && local.serverVersion !== remote.serverVersion) return false;
    if (localFolders && remoteFolders && localFolders !== remoteFolders) return false;
    return true;
}

export function normalizeExtensions(envelope: SubsonicEnvelope): SubsonicExtension[] {
    const rawExtensions = Array.isArray(envelope.openSubsonicExtensions)
        ? envelope.openSubsonicExtensions
        : asRecord(envelope.openSubsonicExtensions).openSubsonicExtension;
    return asArray(rawExtensions).map((raw) => {
        const item = asRecord(raw);
        return { name: String(item.name || ""), versions: asArray(item.versions).map(Number).filter(Number.isFinite) };
    }).filter((item) => item.name);
}

export function normalizeSong(raw: unknown): SubsonicSong {
    const item = asRecord(raw);
    return {
        id: requiredId(item.id, "歌曲"),
        title: String(item.title || item.name || "未知歌曲"),
        artist: optionalString(item.artist), artistId: optionalString(item.artistId),
        album: optionalString(item.album), albumId: optionalString(item.albumId),
        duration: optionalNumber(item.duration), bitRate: optionalNumber(item.bitRate),
        samplingRate: optionalNumber(item.samplingRate), suffix: optionalString(item.suffix),
        contentType: optionalString(item.contentType), size: optionalNumber(item.size),
        path: optionalString(item.path), coverArt: optionalString(item.coverArt),
        playCount: optionalNumber(item.playCount), played: optionalString(item.played),
        starred: optionalString(item.starred), isDir: item.isDir === true,
    };
}

export function normalizeAlbum(raw: unknown): SubsonicAlbum {
    const item = asRecord(raw);
    return {
        id: requiredId(item.id, "专辑"), name: String(item.name || item.album || "未知专辑"),
        artist: optionalString(item.artist), artistId: optionalString(item.artistId), coverArt: optionalString(item.coverArt),
        songCount: optionalNumber(item.songCount), duration: optionalNumber(item.duration),
        song: asArray(item.song).map(normalizeSong),
    };
}

export function normalizeArtist(raw: unknown): SubsonicArtist {
    const item = asRecord(raw);
    return {
        id: requiredId(item.id, "艺术家"), name: String(item.name || "未知艺术家"),
        coverArt: optionalString(item.coverArt), albumCount: optionalNumber(item.albumCount),
        album: asArray(item.album).map(normalizeAlbum),
    };
}

export function normalizeSearchResult(envelope: SubsonicEnvelope): SubsonicSearchResult {
    const result = asRecord(envelope.searchResult3);
    return {
        artists: asArray(result.artist).map(normalizeArtist),
        albums: asArray(result.album).map(normalizeAlbum),
        songs: asArray(result.song).map(normalizeSong),
    };
}

export function normalizePlaylist(raw: unknown): SubsonicPlaylist {
    const item = asRecord(raw);
    return {
        id: requiredId(item.id, "播放列表"), name: String(item.name || "未命名播放列表"),
        comment: optionalString(item.comment), owner: optionalString(item.owner), public: item.public === true,
        songCount: optionalNumber(item.songCount), duration: optionalNumber(item.duration), changed: optionalString(item.changed),
        entry: asArray(item.entry).map(normalizeSong),
    };
}

export function normalizePlayQueue(envelope: SubsonicEnvelope): SubsonicPlayQueue {
    const item = asRecord(envelope.playQueue);
    return {
        current: optionalString(item.current), position: optionalNumber(item.position),
        changed: optionalString(item.changed), username: optionalString(item.username),
        entry: asArray(item.entry).map(normalizeSong),
    };
}

export function normalizePlayQueueByIndex(envelope: SubsonicEnvelope): SubsonicPlayQueue {
    const item = asRecord(envelope.playQueueByIndex);
    const entry = asArray(item.entry).map(normalizeSong);
    const currentIndex = optionalNumber(item.currentIndex);
    return {
        current: currentIndex !== undefined ? entry[currentIndex]?.id : undefined,
        position: optionalNumber(item.position), changed: optionalString(item.changed), username: optionalString(item.username), entry,
    };
}

export function normalizeStarredSongs(envelope: SubsonicEnvelope): SubsonicSong[] {
    return asArray(asRecord(envelope.starred2).song).map(normalizeSong);
}

export function normalizeArtists(envelope: SubsonicEnvelope): SubsonicArtist[] {
    const indexes = asArray(asRecord(envelope.artists).index);
    return indexes.flatMap((index) => asArray(asRecord(index).artist).map(normalizeArtist));
}

export function normalizedPlayedAt(song: SubsonicSong): number | undefined { return parseTimestamp(song.played); }
export function normalizedStarredAt(song: SubsonicSong): number | undefined { return parseTimestamp(song.starred); }
