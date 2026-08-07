import { createSubsonicAuthParams } from "./subsonicAuth";
import type { SubsonicEndpointName } from "./subsonicTypes";

const ENDPOINTS = new Set<SubsonicEndpointName>([
    "ping", "getOpenSubsonicExtensions", "getMusicFolders", "getArtists", "getArtist", "getAlbum",
    "getAlbumList2", "getSong", "search3", "getStarred2", "getPlaylists", "getPlaylist",
    "createPlaylist", "updatePlaylist", "deletePlaylist", "star", "unstar", "stream", "getCoverArt",
    "getLyrics", "getLyricsBySongId", "scrobble", "getPlayQueue", "savePlayQueue",
    "getPlayQueueByIndex", "savePlayQueueByIndex",
]);

export const SUBSONIC_API_VERSION = "1.16.1";
export const SUBSONIC_CLIENT_ID = "siyuan-homepage";

export function buildSubsonicUrl(
    baseUrl: string,
    endpoint: SubsonicEndpointName,
    params: Record<string, string | number | boolean | undefined | Array<string | number>>,
    credentials: { username: string; password: string },
): string {
    if (!ENDPOINTS.has(endpoint)) throw new Error("不允许的 Subsonic API endpoint。" );
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    const url = new URL(`${normalizedBase}/rest/${endpoint}.view`);
    url.searchParams.set("v", SUBSONIC_API_VERSION);
    url.searchParams.set("c", SUBSONIC_CLIENT_ID);
    url.searchParams.set("f", "json");
    const auth = createSubsonicAuthParams(credentials.username, credentials.password);
    Object.entries(auth).forEach(([key, value]) => url.searchParams.set(key, value));
    for (const [key, rawValue] of Object.entries(params)) {
        if (rawValue === undefined) continue;
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const value of values) url.searchParams.append(key, String(value));
    }
    return url.toString();
}

export function redactSubsonicUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        for (const key of ["u", "t", "s", "p", "apiKey"]) url.searchParams.delete(key);
        return url.toString();
    } catch {
        return "[invalid-subsonic-url]";
    }
}
