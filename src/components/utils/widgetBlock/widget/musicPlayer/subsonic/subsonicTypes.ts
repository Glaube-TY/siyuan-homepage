export type SubsonicEndpointKind = "local" | "remote";

export type SubsonicEndpointName =
    | "ping" | "getOpenSubsonicExtensions" | "getMusicFolders"
    | "getArtists" | "getArtist" | "getAlbum" | "getAlbumList2" | "getSong"
    | "search3" | "getStarred2"
    | "getPlaylists" | "getPlaylist" | "createPlaylist" | "updatePlaylist" | "deletePlaylist"
    | "star" | "unstar" | "stream" | "getCoverArt"
    | "getLyrics" | "getLyricsBySongId" | "scrobble"
    | "getPlayQueue" | "savePlayQueue" | "getPlayQueueByIndex" | "savePlayQueueByIndex";

export interface SubsonicServerInfo {
    apiVersion: string;
    type?: string;
    serverVersion?: string;
    openSubsonic: boolean;
}

export interface SubsonicExtension {
    name: string;
    versions: number[];
}

export interface SubsonicSong {
    id: string;
    title: string;
    artist?: string;
    artistId?: string;
    album?: string;
    albumId?: string;
    duration?: number;
    bitRate?: number;
    samplingRate?: number;
    suffix?: string;
    contentType?: string;
    size?: number;
    path?: string;
    coverArt?: string;
    playCount?: number;
    played?: string;
    starred?: string;
    isDir?: boolean;
}

export interface SubsonicAlbum {
    id: string;
    name: string;
    artist?: string;
    artistId?: string;
    coverArt?: string;
    songCount?: number;
    duration?: number;
    song: SubsonicSong[];
}

export interface SubsonicArtist {
    id: string;
    name: string;
    coverArt?: string;
    albumCount?: number;
    album: SubsonicAlbum[];
}

export interface SubsonicPlaylist {
    id: string;
    name: string;
    comment?: string;
    owner?: string;
    public?: boolean;
    songCount?: number;
    duration?: number;
    changed?: string;
    entry: SubsonicSong[];
}

export interface SubsonicPlayQueue {
    current?: string;
    position?: number;
    changed?: string;
    username?: string;
    entry: SubsonicSong[];
}

export interface SubsonicSearchResult {
    artists: SubsonicArtist[];
    albums: SubsonicAlbum[];
    songs: SubsonicSong[];
}

export interface SubsonicErrorShape {
    code?: number;
    message?: string;
}

export interface SubsonicEnvelope {
    status: "ok" | "failed";
    version?: string;
    type?: string;
    serverVersion?: string;
    openSubsonic?: boolean;
    error?: SubsonicErrorShape;
    [key: string]: unknown;
}

export interface SubsonicRequestOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
