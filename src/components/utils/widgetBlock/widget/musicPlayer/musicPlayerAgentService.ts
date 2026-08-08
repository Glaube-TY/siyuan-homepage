import type { Plugin } from "siyuan";
import { MusicCloudSettingsStore } from "./musicCloudSettingsStore";
import { getActiveMusicPlayerPlaybackController, getMusicPlayerPlaybackRuntimeStatus } from "./musicPlayerPlaybackController";
import { SubsonicMusicProvider } from "./subsonic/subsonicProvider";
import type { SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong } from "./subsonic/subsonicTypes";

export class MusicPlayerRuntimeUnavailableError extends Error {
    constructor() {
        super("音乐播放器运行时未挂载。");
        this.name = "MusicPlayerRuntimeUnavailableError";
    }
}

function safeSong(song: SubsonicSong) {
    return { trackId: song.id, title: song.title, artist: song.artist ?? "", album: song.album ?? "", duration: song.duration ?? 0, starred: Boolean(song.starred) };
}
function safeArtist(artist: SubsonicArtist) { return { artistId: artist.id, name: artist.name, albumCount: artist.albumCount ?? artist.album.length }; }
function safeAlbum(album: SubsonicAlbum) { return { albumId: album.id, name: album.name, artist: album.artist ?? "", songCount: album.songCount ?? album.song.length, duration: album.duration ?? 0 }; }
function safePlaylist(playlist: SubsonicPlaylist) { return { playlistId: playlist.id, name: playlist.name, comment: playlist.comment ?? "", songCount: playlist.songCount ?? playlist.entry.length, duration: playlist.duration ?? 0, changed: playlist.changed ?? "", tracks: playlist.entry.slice(0, 200).map(safeSong) }; }

async function withCloudProvider<T>(plugin: Plugin, operation: (provider: SubsonicMusicProvider) => Promise<T>): Promise<T> {
    const settings = new MusicCloudSettingsStore(plugin);
    const data = await settings.load();
    if (!data.profile) throw new Error("尚未配置 Subsonic / Navidrome 音乐服务。");
    const password = await settings.getPassword();
    if (!password) throw new Error("NAS 音乐密码未配置。");
    const provider = new SubsonicMusicProvider(data.profile, password, "original");
    try {
        await provider.initialize();
        return await operation(provider);
    } finally {
        provider.destroy();
    }
}

export async function getHomepageMusicStatus(plugin: Plugin) {
    const settings = new MusicCloudSettingsStore(plugin);
    const data = await settings.load();
    const runtime = getMusicPlayerPlaybackRuntimeStatus();
    return {
        sourceMode: runtime?.sourceMode ?? (data.profile ? "subsonic" : "local"),
        sourceModeInferred: !runtime,
        playerRuntimeAvailable: Boolean(runtime),
        isPlaying: runtime?.isPlaying ?? false,
        currentTrack: runtime?.currentTrack ?? null,
        cloudConfigured: Boolean(data.profile),
        endpointStatus: runtime?.endpointStatus ?? "unavailable",
        queueCount: runtime?.queueCount ?? 0,
        currentTime: runtime?.currentTime ?? 0,
        duration: runtime?.duration ?? 0,
        volume: runtime?.volume ?? 0,
    };
}

export function searchHomepageCloudMusic(plugin: Plugin, query: string, type: "song" | "artist" | "album", limit: number) {
    return withCloudProvider(plugin, async (provider) => {
        const result = await provider.library.search(query, 0, limit);
        return type === "song" ? { type, results: result.songs.slice(0, limit).map(safeSong) }
            : type === "artist" ? { type, results: result.artists.slice(0, limit).map(safeArtist) }
                : { type, results: result.albums.slice(0, limit).map(safeAlbum) };
    });
}

export function listHomepageCloudPlaylists(plugin: Plugin) {
    return withCloudProvider(plugin, async (provider) => ({ playlists: (await provider.library.getPlaylists()).map((playlist) => ({ ...safePlaylist(playlist), tracks: undefined })) }));
}

export function createHomepageCloudPlaylist(plugin: Plugin, name: string, trackIds: string[]) {
    return withCloudProvider(plugin, async (provider) => {
        const created = await provider.library.createPlaylist(name, trackIds);
        const verified = await provider.library.getPlaylist(created.id);
        if (verified.name !== name || trackIds.some((id) => !verified.entry.some((song) => song.id === id))) throw new Error("云端歌单写后验证失败。");
        return safePlaylist(verified);
    });
}

export function renameHomepageCloudPlaylist(plugin: Plugin, playlistId: string, name: string) {
    return withCloudProvider(plugin, async (provider) => {
        await provider.library.getPlaylist(playlistId);
        await provider.library.updatePlaylist(playlistId, { name });
        const verified = await provider.library.getPlaylist(playlistId);
        if (verified.name !== name) throw new Error("云端歌单重命名后验证失败。");
        return safePlaylist(verified);
    });
}

export function deleteHomepageCloudPlaylist(plugin: Plugin, playlistId: string) {
    return withCloudProvider(plugin, async (provider) => {
        const current = await provider.library.getPlaylist(playlistId);
        await provider.library.deletePlaylist(playlistId);
        if ((await provider.library.getPlaylists()).some((playlist) => playlist.id === playlistId)) throw new Error("云端歌单删除后验证失败。");
        return { playlistId, name: current.name, deleted: true };
    });
}

export function addTrackToHomepageCloudPlaylist(plugin: Plugin, playlistId: string, trackId: string) {
    return withCloudProvider(plugin, async (provider) => {
        const current = await provider.library.getPlaylist(playlistId);
        if (!current.entry.some((song) => song.id === trackId)) await provider.library.updatePlaylist(playlistId, { songIdsToAdd: [trackId] });
        const verified = await provider.library.getPlaylist(playlistId);
        if (!verified.entry.some((song) => song.id === trackId)) throw new Error("歌曲加入歌单后验证失败。");
        return safePlaylist(verified);
    });
}

export function removeTrackFromHomepageCloudPlaylist(plugin: Plugin, playlistId: string, trackId: string) {
    return withCloudProvider(plugin, async (provider) => {
        const current = await provider.library.getPlaylist(playlistId);
        const indexes = current.entry.map((song, index) => song.id === trackId ? index : -1).filter((index) => index >= 0);
        if (!indexes.length) throw new Error("歌单中不存在该歌曲。");
        await provider.library.updatePlaylist(playlistId, { songIndexesToRemove: indexes });
        const verified = await provider.library.getPlaylist(playlistId);
        if (verified.entry.some((song) => song.id === trackId)) throw new Error("歌曲移出歌单后验证失败。");
        return safePlaylist(verified);
    });
}

export function setHomepageCloudFavorite(plugin: Plugin, trackId: string, favorite: boolean) {
    return withCloudProvider(plugin, async (provider) => {
        const track = await provider.library.getSong(trackId);
        await provider.setFavorite(track, favorite);
        const starred = await provider.library.getStarredSongs();
        if (starred.some((item) => item.sourceTrackId === trackId) !== favorite) throw new Error("云端收藏写后验证失败。");
        return { trackId, title: track.title, artist: track.artist, album: track.album, favorite };
    });
}

function runtimeController() {
    const controller = getActiveMusicPlayerPlaybackController();
    if (!controller) throw new MusicPlayerRuntimeUnavailableError();
    return controller;
}

export async function controlHomepageMusicPlayback(action: "play" | "pause" | "resume" | "next" | "previous" | "seek" | "set_volume", value?: string | number) {
    const controller = runtimeController();
    if (action === "play") await controller.playTrack(String(value ?? ""));
    else if (action === "pause") controller.pause();
    else if (action === "resume") controller.resume();
    else if (action === "next") controller.next();
    else if (action === "previous") controller.previous();
    else if (action === "seek") controller.seekTo(Number(value));
    else controller.setVolume(Number(value));
    return controller.getStatus();
}
